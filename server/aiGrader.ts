import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, Type } from '@google/genai';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  CUModule,
  TugasanAnswerGrade,
  TugasanPaper,
  TugasanQuestion,
} from '../src/types.ts';

const GEMINI_MODEL = 'gemini-4-hydrogen';
const MAX_PDF_REF_CHARS = 18000;
const pdfTextCache = new Map<string, string>();

export async function extractPlainTextFromPdfBytes(
  pdfBytes: Uint8Array,
  maxChars = MAX_PDF_REF_CHARS
): Promise<string> {
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: pdfBytes,
      useSystemFonts: true,
      disableFontFace: true,
    });
    const pdf = await loadingTask.promise;
    const parts: string[] = [];
    let totalLen = 0;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (pageText) {
        parts.push(`[Muka ${pageNum}] ${pageText}`);
        totalLen += pageText.length;
        if (totalLen >= maxChars) break;
      }
    }
    return parts.join('\n').slice(0, maxChars);
  } catch {
    return '';
  }
}

export async function extractQuestionsFromPdfBuffer(params: {
  pdfBuffer: Buffer;
  fileName: string;
  cu: CUModule;
  levelLabel: string;
}): Promise<{
  title: string;
  paperCode: string;
  questions: TugasanQuestion[];
}> {
  const text = await extractPlainTextFromPdfBytes(new Uint8Array(params.pdfBuffer), 16000);
  const fallbackTitle = params.fileName.replace(/\.pdf$/i, '').toUpperCase();
  const fallbackPaper: TugasanQuestion[] = [
    {
      id: 'q1',
      numberLabel: '1.',
      prompt: `Sila jawab soalan-soalan dalam dokumen PDF asal (${params.fileName}) bagi ${params.cu.code} — ${params.cu.title}.`,
      maxMarks: 10,
      rubricHint: `Berdasarkan kandungan dokumen ${params.fileName} dan piawaian ${params.levelLabel}.`,
    },
  ];

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || !text || text.length < 40) {
    return {
      title: fallbackTitle,
      paperCode: params.cu.code.split(/\s+/)[0] || 'KT-DRIVE',
      questions: fallbackPaper,
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        `FAIL PDF: ${params.fileName}`,
        `TAHAP / CU: ${params.levelLabel} · ${params.cu.code} ${params.cu.title}`,
        '',
        'TEKS DOKUMEN PDF:',
        text,
      ].join('\n'),
      config: {
        systemInstruction: [
          'Ekstrak senarai SOALAN asal daripada teks Kertas Tugasan / Penilaian Teori JPK di atas supaya pelatih dapat menjawab dalam portal.',
          'JANGAN reka atau tulis jawapan contoh di dalam prompt.',
          'Pulangkan JSON berstruktur dengan paperCode, title, dan array questions (maksimum 20 soalan).',
          'Setiap soalan mesti ada numberLabel (contoh "1."), prompt (teks soalan jelas), maxMarks (nombor integer 1..20), dan rubricHint ringkas untuk penandaan AI.',
        ].join('\n'),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            paperCode: { type: Type.STRING },
            title: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  numberLabel: { type: Type.STRING },
                  prompt: { type: Type.STRING },
                  maxMarks: { type: Type.NUMBER },
                  rubricHint: { type: Type.STRING },
                },
                required: ['numberLabel', 'prompt', 'maxMarks'],
              },
            },
          },
          required: ['questions'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}') as {
      paperCode?: string;
      title?: string;
      questions?: Array<{
        numberLabel?: string;
        prompt?: string;
        maxMarks?: number;
        rubricHint?: string;
      }>;
    };

    const extracted = (parsed.questions || [])
      .filter((q) => typeof q.prompt === 'string' && q.prompt.trim().length > 2)
      .slice(0, 20)
      .map((q, idx) => ({
        id: `dq-${idx + 1}`,
        numberLabel: (q.numberLabel || `${idx + 1}.`).trim().slice(0, 16),
        prompt: (q.prompt || '').trim().slice(0, 700),
        maxMarks:
          typeof q.maxMarks === 'number' && Number.isFinite(q.maxMarks)
            ? Math.max(1, Math.min(30, Math.round(q.maxMarks)))
            : 4,
        rubricHint: (q.rubricHint || '').trim().slice(0, 600),
      }));

    return {
      title: (parsed.title || fallbackTitle).trim().slice(0, 160).toUpperCase(),
      paperCode: (parsed.paperCode || params.cu.code.split(/\s+/)[0] || 'KT-DRIVE')
        .trim()
        .slice(0, 80),
      questions: extracted.length > 0 ? extracted : fallbackPaper,
    };
  } catch {
    return {
      title: fallbackTitle,
      paperCode: params.cu.code.split(/\s+/)[0] || 'KT-DRIVE',
      questions: fallbackPaper,
    };
  }
}

function safeResolveUpload(uploadsDir: string, storedName: string): string | null {
  if (!/^[a-zA-Z0-9_-]+\.(pdf|doc|docx)$/.test(storedName)) {
    return null;
  }
  const resolved = path.resolve(uploadsDir, storedName);
  if (!resolved.startsWith(uploadsDir + path.sep)) {
    return null;
  }
  return resolved;
}

async function extractPdfReferenceText(
  uploadsDir: string,
  cu: CUModule | undefined,
  paper: TugasanPaper
): Promise<string> {
  if (!cu || !paper.sourceEbookId) return '';
  const mod = (cu.ebookModules || []).find((m) => m.id === paper.sourceEbookId);
  if (!mod || mod.file.extension !== '.pdf') return '';

  const cached = pdfTextCache.get(mod.file.storedName);
  if (cached !== undefined) return cached;

  const filePath = safeResolveUpload(uploadsDir, mod.file.storedName);
  if (!filePath || !fs.existsSync(filePath)) return '';

  try {
    const buffer = fs.readFileSync(filePath);
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
    });
    const pdf = await loadingTask.promise;
    const parts: string[] = [];
    let totalLen = 0;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (pageText) {
        parts.push(`[Muka ${pageNum}] ${pageText}`);
        totalLen += pageText.length;
        if (totalLen >= MAX_PDF_REF_CHARS) break;
      }
    }

    const joined = parts.join('\n').slice(0, MAX_PDF_REF_CHARS);
    pdfTextCache.set(mod.file.storedName, joined);
    return joined;
  } catch {
    return '';
  }
}

export interface GradeTugasanResult {
  grades: TugasanAnswerGrade[];
  totalScore: number;
  maxTotalScore: number;
  percentage: number;
  passed: boolean;
  overallFeedback: string;
  gradedByModel: string;
}

const SYMBOL_LABELS: Record<string, string> = {
  suis_tarik: 'Simbol Piawai Suis Tarik (Pull Switch)',
  suis_satu_hala: 'Simbol Piawai Suis Satu Hala (1-Way Switch)',
  lampu_pendarflour_dinding: 'Simbol Piawai Lampu Pendarflour Dinding (Wall Fluorescent)',
  alat_atur_kipas: 'Simbol Piawai Alat Atur Kipas (Fan Regulator)',
  lampu_pendarflour_bulat: 'Simbol Piawai Lampu Pendarflour Bulat (Round Fluorescent)',
  kipas_siling: 'Simbol Piawai Kipas Siling (Ceiling Fan)',
  soket_13a: 'Simbol Piawai Soket Alir Keluar 13A',
  lampu_glob: 'Simbol Piawai Lampu Glob (Globe Lamp)',
  wall_fan_a: 'Simbol A (Kipas dinding bilah terisi dengan pendakap dinding)',
  wall_fan_b: 'Simbol B (Kipas dinding piawai bergaris luar dengan pendakap dinding)',
  wall_fan_c: 'Simbol C (Kipas ekzos bilah terisi dengan anak panah)',
  wall_fan_d: 'Simbol D (Kipas ekzos bergaris luar dengan anak panah)',
};

function tryParseRecord(raw: string): Record<string, string> | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // Ignore parse failures and fall back to raw string
  }
  return null;
}

function buildQuestionPromptForAI(q: TugasanPaper['questions'][number]): string {
  const lines: string[] = [q.prompt];
  if (q.subPrompts && q.subPrompts.length > 0) {
    lines.push(...q.subPrompts);
  }
  if (q.mcqStatements && q.mcqStatements.length > 0) {
    lines.push(...q.mcqStatements);
  }
  if (q.mcqOptions && q.mcqOptions.length > 0) {
    lines.push(
      'Pilihan Jawapan:',
      ...q.mcqOptions.map((o) =>
        o.symbolId
          ? `${o.key}. ${SYMBOL_LABELS[o.symbolId] || o.label}`
          : `${o.key}. ${o.label}`
      )
    );
  }
  if (q.trueFalseItems && q.trueFalseItems.length > 0) {
    lines.push(
      'Senarai Kenyataan:',
      ...q.trueFalseItems.map((item) => `${item.key}. ${item.text}`)
    );
  }
  if (q.matchingRows && q.matchingRows.length > 0) {
    lines.push(
      `Senarai ${q.matchingLeftHeader || 'Item Kiri'}: ${q.matchingRows
        .map((r, i) => `(${i + 1}) ${r.leftText}`)
        .join('; ')}`
    );
    const hasRightText = q.matchingRows.some((r) => r.rightText);
    if (hasRightText) {
      lines.push(
        `Senarai ${q.matchingRightHeader || 'Kenyataan Kanan'}: ${q.matchingRows
          .map((r, i) => `[R${i + 1}] ${r.rightText || ''}`)
          .join(' | ')}`
      );
    } else {
      lines.push(
        'Gambar Rajah Kanan: Rajah 1 (Skematik 1 Fasa DB/MCB/PAB), Rajah 2 (Pelan Bangunan tanpa aksesori), Rajah 3 (Lukisan Pendawaian Suis & Lampu), Rajah 4 (Pelan Tapak/Lokasi & Jalan), Rajah 5 (Lukisan Susun Atur 1 Fasa dengan simbol elektrik).'
      );
    }
  }
  if (q.symbolRows && q.symbolRows.length > 0) {
    lines.push(
      'Butiran Simbol:',
      ...q.symbolRows.map((r) => `${r.bil} ${r.label}`)
    );
  }
  if (q.diagramCallouts && q.diagramCallouts.length > 0) {
    lines.push(
      `Label Rajah Diminta (${q.diagramCaption || 'Rajah'}): ${q.diagramCallouts
        .map((c) => `(${c.key})`)
        .join(', ')}`
    );
  }
  return lines.join('\n');
}

function formatTraineeAnswerForAI(
  q: TugasanPaper['questions'][number],
  rawAnswer: string
): string {
  const trimmed = (rawAnswer || '').trim();
  if (!trimmed) return '(Tiada jawapan diberikan)';

  if (q.questionType === 'mcq' && q.mcqOptions) {
    const picked = q.mcqOptions.find((o) => o.key.toUpperCase() === trimmed.toUpperCase());
    if (picked) {
      return picked.symbolId
        ? `${picked.key} — ${SYMBOL_LABELS[picked.symbolId] || picked.label}`
        : `${picked.key} — ${picked.label}`;
    }
    return trimmed;
  }

  const rec = tryParseRecord(trimmed);
  if (!rec) return trimmed;

  if (q.questionType === 'true_false' && q.trueFalseItems) {
    return (
      q.trueFalseItems
        .map((item) => {
          const val = (rec[item.key] || '').trim().toUpperCase();
          const markLabel =
            val === 'BENAR' || val === '√'
              ? '√ (BENAR)'
              : val === 'PALSU' || val === 'X'
              ? 'X (PALSU)'
              : '(Tiada jawapan)';
          return `${item.key}) ${markLabel} — "${item.text}"`;
        })
        .join('\n') || '(Tiada jawapan diberikan)'
    );
  }

  if (q.questionType === 'diagram_label' && q.diagramCallouts) {
    return (
      q.diagramCallouts
        .map((c) => `(${c.key}) ${rec[c.key]?.trim() || '(Kosong)'}`)
        .join('\n') || '(Tiada jawapan diberikan)'
    );
  }

  if (q.questionType === 'matching' && q.matchingRows) {
    return (
      q.matchingRows
        .map((row, idx) => {
          const chosenRightIdxRaw = rec[String(idx)];
          const rightIdx = chosenRightIdxRaw !== undefined ? Number(chosenRightIdxRaw) : NaN;
          if (Number.isInteger(rightIdx) && q.matchingRows && q.matchingRows[rightIdx]) {
            const target = q.matchingRows[rightIdx];
            const rightDesc = target.rightText
              ? target.rightText
              : `Gambar Rajah ${rightIdx + 1}`;
            return `${idx + 1}. ${row.leftText}  ==>  [Padanan #${rightIdx + 1}] ${rightDesc}`;
          }
          return `${idx + 1}. ${row.leftText}  ==>  (Tiada padanan)`;
        })
        .join('\n') || '(Tiada jawapan diberikan)'
    );
  }

  if (q.questionType === 'symbol_draw' && q.symbolRows) {
    return (
      q.symbolRows
        .map((row, idx) => {
          const symId = rec[String(idx + 1)] || rec[row.bil] || '';
          const symText = symId ? SYMBOL_LABELS[symId] || symId : '(Tiada simbol dipilih)';
          return `${row.bil} ${row.label}  ==>  ${symText}`;
        })
        .join('\n') || '(Tiada jawapan diberikan)'
    );
  }

  return trimmed;
}

export async function gradeTugasanWithAI(params: {
  paper: TugasanPaper;
  cu: CUModule | undefined;
  uploadsDir: string;
  answers: Record<string, string>;
}): Promise<GradeTugasanResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'Penandaan AI tidak dapat dijalankan kerana GEMINI_API_KEY belum dikonfigurasi pada pelayan.'
    );
  }

  const { paper, cu, uploadsDir, answers } = params;
  const referenceNotes = await extractPdfReferenceText(uploadsDir, cu, paper);

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const questionsPayload = paper.questions.map((q) => ({
    questionId: q.id,
    numberLabel: q.numberLabel,
    questionType: q.questionType || 'text',
    questionText: buildQuestionPromptForAI(q),
    maxMarks: q.maxMarks,
    rubricHint: q.rubricHint,
    traineeAnswer: formatTraineeAnswerForAI(q, answers[q.id] || ''),
  }));

  const systemPrompt = [
    'Anda ialah Pegawai Penilai (PP) bertauliah Jabatan Pembangunan Kemahiran (JPK) Malaysia bagi bidang Pemasangan & Penyelenggaraan Elektrik (NOSS F432-005).',
    'Tugas anda ialah menyemak jawapan Kertas Tugasan pelatih dan memulangkan MARKAH serta STATUS TANDA (betul / separa / salah) dan status setiap sub-item (itemStatuses) SAHAJA tanpa sebarang ulasan teks tambahan.',
    'Peraturan pemarkahan:',
    '1. Bandingkan jawapan pelatih dengan Nota Rujukan Rasmi Kertas Penerangan (jika disediakan), garis panduan MS IEC 60364, Akta Bekalan Elektrik 1990, Peraturan-Peraturan Elektrik 1994, dan Rubrik Skema Jawapan.',
    '2. Bagi soalan objektif (mcq, 1 markah): beri marksAwarded = 1 dan status = "betul" jika tepat mengikut skema, atau marksAwarded = 0 dan status = "salah" jika salah.',
    '3. Bagi soalan berbilang item (true_false, matching, diagram_label, symbol_draw — 5 item, 5 markah): pulangkan array itemStatuses dengan tepat mengikut bilangan item dalam urutan yang sama (contoh 5 elemen: ["betul","salah","betul","betul","salah"]). Beri 1 markah bagi setiap "betul" (jumlah marksAwarded = bilangan "betul"). Status soalan ialah "betul" jika semua betul, "separa" jika sebahagian betul, dan "salah" jika 0 markah.',
    '4. Bagi soalan struktur/esei (text): beri marksAwarded antara 0 hingga maxMarks berdasarkan ketepatan fakta.',
    '5. Jika jawapan kosong atau tidak relevan langsung, beri 0 markah dan status "salah".',
    '6. JANGAN tulis sebarang ulasan, penerangan atau skema teks. Pulangkan data berstruktur markah dan status sahaja.',
    '7. Pastikan setiap questionId daripada senarai soalan dipulangkan dalam array grades.',
  ].join('\n');

  const userPrompt = [
    `MAKLUMAT KERTAS TUGASAN:`,
    `- Program: ${paper.programCodeTitle}`,
    `- Tahap: ${paper.tahap}`,
    `- Unit Kompetensi: ${paper.cuCodeTitle}`,
    `- No. Kod: ${paper.paperCode}`,
    `- Tajuk: ${paper.title}`,
    `- Markah Lulus Minimum: ${paper.passingScore}%`,
    '',
    referenceNotes
      ? `PETIKAN NOTA RUJUKAN RASMI (KERTAS PENERANGAN):\n${referenceNotes}\n`
      : 'PETIKAN NOTA RUJUKAN RASMI: Gunakan piawaian NOSS JPK F432-005, MS IEC 60364 & Peraturan Elektrik 1994.\n',
    `SOALAN & JAWAPAN PELATIH:`,
    JSON.stringify(questionsPayload, null, 2),
  ].join('\n');

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          grades: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                questionId: { type: Type.STRING },
                marksAwarded: { type: Type.NUMBER },
                status: {
                  type: Type.STRING,
                  enum: ['betul', 'separa', 'salah'],
                },
                itemStatuses: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.STRING,
                    enum: ['betul', 'salah'],
                  },
                },
              },
              required: ['questionId', 'marksAwarded', 'status'],
            },
          },
        },
        required: ['grades'],
      },
    },
  });

  const rawText = response.text;
  if (!rawText) {
    throw new Error('Model AI tidak memulangkan keputusan penandaan. Sila cuba sebentar lagi.');
  }

  let parsed: {
    grades?: Array<{
      questionId?: string;
      marksAwarded?: number;
      status?: string;
      itemStatuses?: string[];
    }>;
  };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Format jawapan penandaan AI tidak sah. Sila hantar semula tugasan.');
  }

  const aiGradesMap = new Map(
    (parsed.grades || [])
      .filter((g) => typeof g.questionId === 'string')
      .map((g) => [g.questionId as string, g])
  );

  const normalizedGrades: TugasanAnswerGrade[] = paper.questions.map((q) => {
    const answerText = (answers[q.id] || '').trim();
    const parsedRec = tryParseRecord(answerText);
    const hasAnyValue = parsedRec
      ? Object.values(parsedRec).some((v) => typeof v === 'string' && v.trim().length > 0)
      : answerText.length > 0;
    const expectedItemCount =
      q.questionType === 'true_false'
        ? q.trueFalseItems?.length || 0
        : q.questionType === 'matching'
        ? q.matchingRows?.length || 0
        : q.questionType === 'diagram_label'
        ? q.diagramCallouts?.length || 0
        : q.questionType === 'symbol_draw'
        ? q.symbolRows?.length || 0
        : 0;

    const aiItem = aiGradesMap.get(q.id);
    if (!hasAnyValue) {
      return {
        questionId: q.id,
        answerText: '',
        marksAwarded: 0,
        maxMarks: q.maxMarks,
        status: 'salah',
        ...(expectedItemCount > 0
          ? { itemStatuses: Array<'salah'>(expectedItemCount).fill('salah') }
          : {}),
        aiFeedback: '',
        skemaJawapan: '',
      };
    }

    let normalizedItems: ('betul' | 'salah')[] | undefined;
    if (expectedItemCount > 0) {
      const rawArr = Array.isArray(aiItem?.itemStatuses) ? aiItem.itemStatuses : [];
      normalizedItems = Array.from({ length: expectedItemCount }, (_, i) =>
        rawArr[i] === 'betul' ? 'betul' : 'salah'
      );
    }

    const rawMark =
      typeof aiItem?.marksAwarded === 'number' && Number.isFinite(aiItem.marksAwarded)
        ? aiItem.marksAwarded
        : 0;
    let clamped = Math.max(0, Math.min(q.maxMarks, Math.round(rawMark * 2) / 2));

    if (normalizedItems && normalizedItems.length > 0 && q.maxMarks === expectedItemCount) {
      const itemBetulCount = normalizedItems.filter((s) => s === 'betul').length;
      if (Array.isArray(aiItem?.itemStatuses) && aiItem.itemStatuses.length > 0) {
        clamped = itemBetulCount;
      } else {
        // Derive deterministic itemStatuses matching clamped mark if AI omitted array
        const wholeBetul = Math.min(expectedItemCount, Math.round(clamped));
        normalizedItems = Array.from({ length: expectedItemCount }, (_, i) =>
          i < wholeBetul ? 'betul' : 'salah'
        );
      }
    }

    const derivedStatus: TugasanAnswerGrade['status'] =
      clamped >= q.maxMarks
        ? 'betul'
        : clamped > 0
        ? 'separa'
        : 'salah';
    const status: TugasanAnswerGrade['status'] =
      clamped === 0 ? 'salah' : clamped >= q.maxMarks ? 'betul' : 'separa';

    return {
      questionId: q.id,
      answerText,
      marksAwarded: clamped,
      maxMarks: q.maxMarks,
      status: status || derivedStatus,
      ...(normalizedItems ? { itemStatuses: normalizedItems } : {}),
      aiFeedback: '',
      skemaJawapan: '',
    };
  });

  const totalScore = Math.round(
    normalizedGrades.reduce((sum, g) => sum + g.marksAwarded, 0) * 10
  ) / 10;
  const maxTotalScore = paper.questions.reduce((sum, q) => sum + q.maxMarks, 0);
  const percentage = maxTotalScore > 0 ? Math.round((totalScore / maxTotalScore) * 100) : 0;
  const passed = percentage >= paper.passingScore;

  return {
    grades: normalizedGrades,
    totalScore,
    maxTotalScore,
    percentage,
    passed,
    overallFeedback: '',
    gradedByModel: GEMINI_MODEL,
  };
}

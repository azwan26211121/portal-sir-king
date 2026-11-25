import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, Type } from '@google/genai';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  CUModule,
  TugasanAnswerGrade,
  TugasanPaper,
} from '../src/types.ts';

const GEMINI_MODEL = 'gemini-4-hydrogen';
const MAX_PDF_REF_CHARS = 18000;
const pdfTextCache = new Map<string, string>();

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
    questionText: q.subPrompts && q.subPrompts.length > 0
      ? `${q.prompt}\n${q.subPrompts.join('\n')}`
      : q.prompt,
    maxMarks: q.maxMarks,
    rubricHint: q.rubricHint,
    traineeAnswer: (answers[q.id] || '').trim() || '(Tiada jawapan diberikan)',
  }));

  const systemPrompt = [
    'Anda ialah Pegawai Penilai (PP) bertauliah Jabatan Pembangunan Kemahiran (JPK) Malaysia bagi bidang Pemasangan & Penyelenggaraan Elektrik (NOSS F432-005).',
    'Tugas anda ialah menyemak dan menanda jawapan Kertas Tugasan pelatih secara adil, tepat dan membina dalam Bahasa Melayu.',
    'Peraturan pemarkahan:',
    '1. Bandingkan jawapan pelatih dengan Nota Rujukan Rasmi Kertas Penerangan (jika disediakan), garis panduan MS IEC 60364, Akta Bekalan Elektrik 1990, Peraturan-Peraturan Elektrik 1994, dan Rubrik Skema Jawapan.',
    '2. Jika jawapan kosong atau tidak relevan langsung, beri 0 markah dan status "salah".',
    '3. Jika jawapan tepat dan lengkap mengikut kehendak soalan (termasuk bilangan fakta yang diminta seperti "senaraikan tiga (3)..."), beri markah penuh dan status "betul".',
    '4. Jika jawapan betul sebahagian atau kurang bilangan fakta yang diminta, beri markah separa yang munasabah (boleh guna nombor bulat atau .5) dan status "separa".',
    '5. Pastikan marksAwarded sentiasa antara 0 hingga maxMarks untuk setiap soalan.',
    '6. Tulis aiFeedback secara ringkas, jelas dan membina (1-3 ayat) dalam Bahasa Melayu, serta sediakan skemaJawapan ringkas yang tepat sebagai rujukan ulang kaji pelatih.',
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
                aiFeedback: { type: Type.STRING },
                skemaJawapan: { type: Type.STRING },
              },
              required: ['questionId', 'marksAwarded', 'status', 'aiFeedback', 'skemaJawapan'],
            },
          },
          overallFeedback: { type: Type.STRING },
        },
        required: ['grades', 'overallFeedback'],
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
      aiFeedback?: string;
      skemaJawapan?: string;
    }>;
    overallFeedback?: string;
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
    const aiItem = aiGradesMap.get(q.id);
    if (!answerText) {
      return {
        questionId: q.id,
        answerText: '',
        marksAwarded: 0,
        maxMarks: q.maxMarks,
        status: 'salah',
        aiFeedback: 'Tiada jawapan diisi bagi soalan ini.',
        skemaJawapan: aiItem?.skemaJawapan?.trim() || q.rubricHint,
      };
    }

    const rawMark = typeof aiItem?.marksAwarded === 'number' && Number.isFinite(aiItem.marksAwarded)
      ? aiItem.marksAwarded
      : 0;
    const clamped = Math.max(0, Math.min(q.maxMarks, Math.round(rawMark * 2) / 2));
    const derivedStatus: TugasanAnswerGrade['status'] =
      clamped >= q.maxMarks * 0.85
        ? 'betul'
        : clamped > 0
        ? 'separa'
        : 'salah';
    const status: TugasanAnswerGrade['status'] =
      aiItem?.status === 'betul' || aiItem?.status === 'separa' || aiItem?.status === 'salah'
        ? (clamped === 0 ? 'salah' : clamped >= q.maxMarks ? 'betul' : aiItem.status)
        : derivedStatus;

    return {
      questionId: q.id,
      answerText,
      marksAwarded: clamped,
      maxMarks: q.maxMarks,
      status,
      aiFeedback:
        aiItem?.aiFeedback?.trim() ||
        (status === 'betul'
          ? 'Jawapan tepat dan menepati keperluan skema.'
          : status === 'separa'
          ? 'Jawapan betul sebahagian. Lengkapkan fakta penting mengikut nota rujukan.'
          : 'Jawapan belum tepat. Sila rujuk semula nota Kertas Penerangan.'),
      skemaJawapan: aiItem?.skemaJawapan?.trim() || q.rubricHint,
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
    overallFeedback:
      parsed.overallFeedback?.trim() ||
      (passed
        ? `Tahniah, anda lulus penilaian ini dengan markah ${percentage}%. Kertas tugasan kini layak untuk dicetak.`
        : `Markah anda ialah ${percentage}% dan belum mencapai tahap lulus minimum (${paper.passingScore}%). Sila semak ulasan setiap soalan dan jawab semula.`),
    gradedByModel: GEMINI_MODEL,
  };
}

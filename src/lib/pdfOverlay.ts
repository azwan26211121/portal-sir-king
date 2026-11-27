import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type {
  BrandingConfig,
  TugasanPaper,
  TugasanQuestion,
  TugasanSubmission,
} from '../types.ts';
import { getSymbolLabelById } from '../components/ElectricalSymbols.tsx';

export function sanitizeWinAnsi(raw: string): string {
  const normalized = (raw || '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, '*')
    .replace(/[\u221a\u2713\u2714]/g, '/')
    .replace(/[\u2717\u2718]/g, 'X')
    .replace(/\u00b2/g, '2')
    .replace(/\u00b3/g, '3')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=')
    .replace(/\u00a0/g, ' ');

  let out = '';
  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i);
    if (code === 10 || code === 13) {
      out += normalized[i];
    } else if (code >= 32 && code <= 255) {
      out += normalized[i];
    } else {
      out += ' ';
    }
  }
  return out;
}

function wrapTextToWidth(
  text: string,
  maxWidth: number,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  fontSize: number
): string[] {
  const clean = sanitizeWinAnsi(text);
  const paragraphs = clean.split(/\r?\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
          current = word;
        } else {
          let chunk = '';
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, fontSize) <= maxWidth) {
              chunk += ch;
            } else {
              if (chunk) lines.push(chunk);
              chunk = ch;
            }
          }
          current = chunk;
        }
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

function fitTextSingleLine(
  text: string,
  maxWidth: number,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  fontSize: number
): string {
  const clean = sanitizeWinAnsi(text).replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (font.widthOfTextAtSize(clean, fontSize) <= maxWidth) return clean;
  let cut = clean;
  while (cut.length > 3 && font.widthOfTextAtSize(`${cut}...`, fontSize) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}...`;
}

export function drawVectorTick(
  page: PDFPage,
  x: number,
  y: number,
  size = 10,
  color = rgb(220 / 255, 38 / 255, 38 / 255)
): void {
  const thickness = Math.max(1.4, size * 0.16);
  page.drawLine({
    start: { x: x - size * 0.35, y: y + size * 0.05 },
    end: { x: x - size * 0.05, y: y - size * 0.3 },
    thickness,
    color,
  });
  page.drawLine({
    start: { x: x - size * 0.05, y: y - size * 0.3 },
    end: { x: x + size * 0.55, y: y + size * 0.45 },
    thickness,
    color,
  });
}

export function drawVectorCross(
  page: PDFPage,
  x: number,
  y: number,
  size = 9,
  color = rgb(220 / 255, 38 / 255, 38 / 255)
): void {
  const thickness = Math.max(1.4, size * 0.16);
  const half = size * 0.36;
  page.drawLine({
    start: { x: x - half, y: y - half },
    end: { x: x + half, y: y + half },
    thickness,
    color,
  });
  page.drawLine({
    start: { x: x - half, y: y + half },
    end: { x: x + half, y: y - half },
    thickness,
    color,
  });
}

export function drawVectorElectricalSymbol(
  page: PDFPage,
  symbolId: string,
  cx: number,
  cy: number,
  boxW: number,
  boxH: number
): void {
  const col = rgb(0.04, 0.18, 0.55);
  const s = Math.min(boxW / 90, boxH / 60, 1.0);
  const px = (vx: number, viewW = 64) => cx + (vx - viewW / 2) * s;
  const py = (vy: number, viewH = 48) => cy + (viewH / 2 - vy) * s;
  const lw = Math.max(1.2, 2.0 * s);

  switch (symbolId) {
    case 'suis_tarik': {
      page.drawCircle({
        x: px(20),
        y: py(30),
        size: 6 * s,
        borderWidth: lw,
        borderColor: col,
      });
      page.drawLine({ start: { x: px(25), y: py(26) }, end: { x: px(43), y: py(11) }, thickness: lw, color: col });
      page.drawLine({ start: { x: px(38), y: py(9) }, end: { x: px(43), y: py(11) }, thickness: lw, color: col });
      page.drawLine({ start: { x: px(43), y: py(11) }, end: { x: px(42), y: py(16) }, thickness: lw, color: col });
      for (let dy = 17; dy < 36; dy += 5) {
        page.drawLine({ start: { x: px(36), y: py(dy) }, end: { x: px(36), y: py(dy + 2.5) }, thickness: lw * 0.85, color: col });
      }
      page.drawCircle({ x: px(36), y: py(40), size: 2.2 * s, color: col });
      break;
    }
    case 'suis_satu_hala': {
      page.drawCircle({ x: px(20), y: py(34), size: 6 * s, borderWidth: lw, borderColor: col });
      page.drawLine({ start: { x: px(24.5), y: py(29.5) }, end: { x: px(44), y: py(11) }, thickness: lw, color: col });
      page.drawLine({ start: { x: px(44), y: py(11) }, end: { x: px(49), y: py(15) }, thickness: lw, color: col });
      break;
    }
    case 'lampu_pendarflour_dinding': {
      page.drawLine({ start: { x: px(12, 80), y: py(8) }, end: { x: px(12, 80), y: py(40) }, thickness: lw * 1.3, color: col });
      page.drawLine({ start: { x: px(12, 80), y: py(24) }, end: { x: px(26, 80), y: py(24) }, thickness: lw, color: col });
      page.drawLine({ start: { x: px(26, 80), y: py(16) }, end: { x: px(26, 80), y: py(32) }, thickness: lw, color: col });
      page.drawLine({ start: { x: px(26, 80), y: py(24) }, end: { x: px(66, 80), y: py(24) }, thickness: lw, color: col });
      page.drawLine({ start: { x: px(66, 80), y: py(16) }, end: { x: px(66, 80), y: py(32) }, thickness: lw, color: col });
      break;
    }
    case 'alat_atur_kipas': {
      page.drawRectangle({
        x: px(16),
        y: py(40),
        width: 32 * s,
        height: 32 * s,
        borderWidth: lw,
        borderColor: col,
      });
      page.drawLine({ start: { x: px(16), y: py(40) }, end: { x: px(48), y: py(8) }, thickness: lw, color: col });
      page.drawLine({ start: { x: px(40), y: py(8) }, end: { x: px(48), y: py(8) }, thickness: lw, color: col });
      page.drawLine({ start: { x: px(48), y: py(8) }, end: { x: px(48), y: py(16) }, thickness: lw, color: col });
      page.drawCircle({
        x: px(32),
        y: py(24),
        size: 5 * s,
        color: rgb(1, 1, 1),
        borderWidth: lw,
        borderColor: col,
      });
      break;
    }
    case 'lampu_pendarflour_bulat': {
      page.drawCircle({ x: px(32), y: py(24), size: 16 * s, borderWidth: lw, borderColor: col });
      page.drawCircle({ x: px(32), y: py(24), size: 9 * s, borderWidth: lw, borderColor: col });
      page.drawLine({ start: { x: px(28), y: py(8) }, end: { x: px(28), y: py(15) }, thickness: lw, color: col });
      page.drawLine({ start: { x: px(36), y: py(8) }, end: { x: px(36), y: py(15) }, thickness: lw, color: col });
      break;
    }
    case 'kipas_siling': {
      page.drawCircle({ x: px(32), y: py(24), size: 4 * s, borderWidth: lw, borderColor: col });
      page.drawEllipse({
        x: px(20),
        y: py(24),
        xScale: 8 * s,
        yScale: 4.5 * s,
        borderWidth: lw,
        borderColor: col,
      });
      page.drawEllipse({
        x: px(44),
        y: py(24),
        xScale: 8 * s,
        yScale: 4.5 * s,
        borderWidth: lw,
        borderColor: col,
      });
      break;
    }
    case 'soket_13a': {
      page.drawLine({ start: { x: px(12), y: py(34) }, end: { x: px(52), y: py(34) }, thickness: lw, color: col });
      // Semicircle above base line approximated with smooth polyline
      const segs = 14;
      for (let i = 0; i < segs; i += 1) {
        const a1 = (Math.PI * i) / segs;
        const a2 = (Math.PI * (i + 1)) / segs;
        page.drawLine({
          start: { x: px(32 - 14 * Math.cos(a1)), y: py(34 - 14 * Math.sin(a1)) },
          end: { x: px(32 - 14 * Math.cos(a2)), y: py(34 - 14 * Math.sin(a2)) },
          thickness: lw,
          color: col,
        });
      }
      page.drawLine({ start: { x: px(32), y: py(10) }, end: { x: px(32), y: py(20) }, thickness: lw, color: col });
      break;
    }
    case 'lampu_glob':
    default: {
      page.drawCircle({ x: px(32), y: py(24), size: 14 * s, borderWidth: lw, borderColor: col });
      break;
    }
  }
}

async function loadLogoPngBytes(logoUrl: string): Promise<Uint8Array | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const imgUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Image load error'));
        el.src = imgUrl;
      });
      const canvas = document.createElement('canvas');
      const w = img.naturalWidth || 256;
      const h = img.naturalHeight || 256;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const pngBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );
      if (!pngBlob) return null;
      return new Uint8Array(await pngBlob.arrayBuffer());
    } finally {
      URL.revokeObjectURL(imgUrl);
    }
  } catch {
    return null;
  }
}

function parseJsonRecord(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // ignore
  }
  return {};
}

function formatPlainAnswerForAppendix(q: TugasanQuestion, raw: string): string {
  const qType = q.questionType || 'text';
  if (qType === 'true_false') {
    const rec = parseJsonRecord(raw);
    return (q.trueFalseItems || [])
      .map((it) => `${it.key}) ${rec[it.key] || '-'}`)
      .join('  |  ');
  }
  if (qType === 'matching') {
    const rec = parseJsonRecord(raw);
    return (q.matchingRows || [])
      .map((row, idx) => {
        const chosen = Number(rec[String(idx)]);
        const target =
          Number.isInteger(chosen) && q.matchingRows?.[chosen]
            ? `R${chosen + 1}`
            : '-';
        return `${idx + 1}. ${row.leftText} -> [${target}]`;
      })
      .join('\n');
  }
  if (qType === 'diagram_label') {
    const rec = parseJsonRecord(raw);
    return (q.diagramCallouts || [])
      .map((c) => `${c.key}) ${rec[c.key] || '-'}`)
      .join('\n');
  }
  if (qType === 'symbol_draw') {
    const rec = parseJsonRecord(raw);
    return (q.symbolRows || [])
      .map((row, idx) => {
        const symId = rec[String(idx + 1)] || rec[row.bil] || '';
        return `${row.bil} ${row.label}: ${symId ? getSymbolLabelById(symId) : '-'}`;
      })
      .join('\n');
  }
  return raw || '(Tiada jawapan diisi)';
}

export interface GenerateInjectedPdfParams {
  sourcePdfBytes?: Uint8Array | null;
  paper: TugasanPaper;
  submission?: TugasanSubmission | null;
  answers: Record<string, string>;
  traineeName: string;
  traineeIc: string;
  traineeCodeId: string;
  dateStr: string;
  branding: BrandingConfig;
}

export async function generateInjectedTugasanPdfBytes(
  params: GenerateInjectedPdfParams
): Promise<Uint8Array> {
  const {
    sourcePdfBytes,
    paper,
    submission,
    answers,
    traineeName,
    traineeIc,
    traineeCodeId,
    dateStr,
    branding,
  } = params;

  if (!sourcePdfBytes || sourcePdfBytes.byteLength === 0) {
    const collegeName = sanitizeWinAnsi(
      branding.collegeName?.trim() || 'JABATAN PEMBANGUNAN KEMAHIRAN (JPK)'
    ).toUpperCase();
    const collegeAddress = sanitizeWinAnsi(
      branding.collegeAddress?.trim() ||
        'TINGKAT 7-8, BLOK D4, KOMPLEKS D, 62530 PUTRAJAYA'
    ).toUpperCase();
    const logoBytes = branding.logoUrl ? await loadLogoPngBytes(branding.logoUrl) : null;
    return buildFallbackDirectPdfBytes({
      ...params,
      collegeName,
      collegeAddress,
      logoBytes,
    });
  }

  const pdfDoc = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  const inkBlue = rgb(0.05, 0.22, 0.62);
  const inkBlack = rgb(0.08, 0.08, 0.1);
  const aiRed = rgb(220 / 255, 38 / 255, 38 / 255);

  const meta = paper.pdfOverlayMeta;
  const appendixItems: Array<{
    numberLabel: string;
    prompt: string;
    answerText: string;
    marksText: string;
    passedItem?: boolean;
  }> = [];

  if (meta) {
    // Original PDF logo & address on Page 1 are preserved 100% untouched.

    // 1. Trainee Info on Page 1
    const p1 = pages[meta.namePos.page - 1];
    if (p1) {
      p1.drawText(fitTextSingleLine(traineeName.toUpperCase(), 158, fontBold, 8.5), {
        x: meta.namePos.x,
        y: meta.namePos.y,
        size: 8.5,
        font: fontBold,
        color: inkBlue,
      });
      p1.drawText(fitTextSingleLine(traineeIc || '-', 140, fontBold, 8.5), {
        x: meta.icPos.x,
        y: meta.icPos.y,
        size: 8.5,
        font: fontBold,
        color: inkBlue,
      });
      p1.drawText(fitTextSingleLine(dateStr, 100, fontBold, 8.5), {
        x: meta.datePos.x,
        y: meta.datePos.y,
        size: 8.5,
        font: fontBold,
        color: inkBlue,
      });
      if (meta.userIdPos && pages[meta.userIdPos.page - 1]) {
        pages[meta.userIdPos.page - 1].drawText(
          fitTextSingleLine(`ID: ${traineeCodeId}`, 110, fontRegular, 7.5),
          {
            x: meta.userIdPos.x,
            y: meta.userIdPos.y,
            size: 7.5,
            font: fontRegular,
            color: inkBlack,
          }
        );
      }
    }

    // 4. Total Mark inside upper-left diagonal triangle of MARKAH cell (no "% - LULUS" text)
    if (submission) {
      const scorePoint = meta.statusPos || meta.totalMarkPos;
      const markPage = pages[scorePoint.page - 1];
      if (markPage) {
        const scoreX = meta.statusPos ? meta.statusPos.x + 18 : meta.totalMarkPos.x;
        const scoreY = meta.statusPos ? meta.statusPos.y + 3 : meta.totalMarkPos.y;
        markPage.drawText(`${submission.totalScore}`, {
          x: scoreX,
          y: scoreY,
          size: 13,
          font: fontBold,
          color: aiRed,
        });
      }
    }

    // 5. Leave ULASAN PEGAWAI PENILAI & COP DAN TANDATANGAN blank for manual review/signature;
    //    print ONLY the overall percentage at the bottom of the right-hand box in RGB(220, 38, 38).
    const sBox = meta.stampBox;
    const sPage = pages[sBox.page - 1];
    if (sPage && submission) {
      const pctText = `${submission.percentage}%`;
      const pctSize = 12;
      const pctW = fontBold.widthOfTextAtSize(pctText, pctSize);
      sPage.drawText(pctText, {
        x: sBox.x + sBox.w - pctW - 10,
        y: sBox.y + 9,
        size: pctSize,
        font: fontBold,
        color: aiRed,
      });
    }

    // 6. Per-Question Overlays
    for (const q of paper.questions) {
      const ov = q.pdfOverlay;
      const grade = submission?.grades.find((g) => g.questionId === q.id);
      const rawAns = grade?.answerText ?? answers[q.id] ?? '';
      const qType = q.questionType || 'text';

      if (!ov) {
        appendixItems.push({
          numberLabel: q.numberLabel,
          prompt: q.prompt,
          answerText: formatPlainAnswerForAppendix(q, rawAns),
          marksText: grade ? `${grade.marksAwarded}/${grade.maxMarks}` : `-/${q.maxMarks}`,
          passedItem: grade ? grade.status === 'betul' : undefined,
        });
        continue;
      }

      // Draw Question Mark Badge at markPos (in RGB(220, 38, 38))
      if (grade && pages[ov.markPos.page - 1]) {
        const mPage = pages[ov.markPos.page - 1];
        mPage.drawText(`[${grade.marksAwarded}/${grade.maxMarks}]`, {
          x: ov.markPos.x + 62,
          y: ov.markPos.y,
          size: 9,
          font: fontBold,
          color: aiRed,
        });
        if (grade.status === 'betul') {
          drawVectorTick(mPage, ov.markPos.x + 98, ov.markPos.y + 3, 10, aiRed);
        } else if (grade.status === 'salah') {
          drawVectorCross(mPage, ov.markPos.x + 98, ov.markPos.y + 3, 9, aiRed);
        }
      }

      // MCQ
      if (qType === 'mcq' && ov.mcqChoices) {
        const chosen = rawAns.trim().toUpperCase();
        const pt = ov.mcqChoices[chosen];
        if (pt && pages[pt.page - 1]) {
          const cPage = pages[pt.page - 1];
          cPage.drawEllipse({
            x: pt.x + 4,
            y: pt.y + 3.5,
            xScale: 10.5,
            yScale: 8.5,
            borderWidth: 1.8,
            borderColor: inkBlue,
          });
          if (grade) {
            if (grade.status === 'betul') {
              drawVectorTick(cPage, pt.x + 20, pt.y + 3.5, 9.5, aiRed);
            } else {
              drawVectorCross(cPage, pt.x + 20, pt.y + 3.5, 8.5, aiRed);
            }
          }
        }
      }

      // True / False
      if (qType === 'true_false' && ov.trueFalseRows) {
        const rec = parseJsonRecord(rawAns);
        ov.trueFalseRows.forEach((row, idx) => {
          const tfPage = pages[row.page - 1];
          if (!tfPage) return;
          const val = (rec[row.key] || '').trim().toUpperCase();
          if (val === '√' || val === 'BENAR') {
            drawVectorTick(tfPage, row.boxX, row.boxY, 13, inkBlue);
          } else if (val === 'X' || val === 'PALSU') {
            drawVectorCross(tfPage, row.boxX, row.boxY, 11, inkBlue);
          }
          const st = grade?.itemStatuses?.[idx];
          if (st === 'betul') {
            drawVectorTick(tfPage, row.boxX + 18, row.boxY, 9.5, aiRed);
          } else if (st === 'salah') {
            drawVectorCross(tfPage, row.boxX + 18, row.boxY, 8.5, aiRed);
          }
        });
      }

      // Matching
      if (qType === 'matching' && ov.matchingLeftPoints && ov.matchingRightPoints) {
        const rec = parseJsonRecord(rawAns);
        ov.matchingLeftPoints.forEach((leftPt, rIdx) => {
          const mPage = pages[leftPt.page - 1];
          if (!mPage) return;
          const chosenRaw = rec[String(rIdx)];
          const chosenIdx =
            chosenRaw !== undefined && chosenRaw !== '' ? Number(chosenRaw) : NaN;
          const rightPt =
            Number.isInteger(chosenIdx) && ov.matchingRightPoints?.[chosenIdx]
              ? ov.matchingRightPoints[chosenIdx]
              : null;

          if (rightPt && rightPt.page === leftPt.page) {
            mPage.drawLine({
              start: { x: leftPt.x, y: leftPt.y },
              end: { x: rightPt.x, y: rightPt.y },
              thickness: 1.6,
              color: inkBlue,
            });
            mPage.drawCircle({ x: leftPt.x, y: leftPt.y, size: 2.8, color: inkBlue });
            mPage.drawCircle({ x: rightPt.x, y: rightPt.y, size: 2.8, color: inkBlue });
            mPage.drawText(`[R${chosenIdx + 1}]`, {
              x: leftPt.x + 2,
              y: leftPt.y + 4,
              size: 7.2,
              font: fontBold,
              color: inkBlue,
            });
          }

          const st = grade?.itemStatuses?.[rIdx];
          if (st === 'betul') {
            drawVectorTick(mPage, leftPt.x - 12, leftPt.y, 9, aiRed);
          } else if (st === 'salah') {
            drawVectorCross(mPage, leftPt.x - 12, leftPt.y, 8, aiRed);
          }
        });
      }

      // Diagram Label
      if (qType === 'diagram_label' && ov.answerSlots) {
        const rec = parseJsonRecord(rawAns);
        ov.answerSlots.forEach((slot, idx) => {
          const dPage = pages[slot.page - 1];
          if (!dPage) return;
          const ansText = (rec[slot.key] || '').trim();
          if (ansText) {
            dPage.drawText(fitTextSingleLine(ansText, slot.maxWidth, fontBold, 9), {
              x: slot.x,
              y: slot.y,
              size: 9,
              font: fontBold,
              color: inkBlue,
            });
          }
          const st = grade?.itemStatuses?.[idx];
          if (st === 'betul') {
            drawVectorTick(dPage, slot.x + slot.maxWidth + 8, slot.y + 2, 9.5, aiRed);
          } else if (st === 'salah') {
            drawVectorCross(dPage, slot.x + slot.maxWidth + 8, slot.y + 2, 8.5, aiRed);
          }
        });
      }

      // Symbol Draw (KT2 Q11)
      if (qType === 'symbol_draw' && ov.symbolCells) {
        const rec = parseJsonRecord(rawAns);
        ov.symbolCells.forEach((cell, idx) => {
          const sCellPage = pages[cell.page - 1];
          if (!sCellPage) return;
          const symId = rec[String(idx + 1)] || rec[`${idx + 1}.`] || '';
          if (symId) {
            drawVectorElectricalSymbol(
              sCellPage,
              symId,
              cell.x + cell.w / 2,
              cell.y + cell.h / 2 + 4,
              cell.w - 20,
              cell.h - 24
            );
            sCellPage.drawText(
              fitTextSingleLine(getSymbolLabelById(symId), cell.w - 14, fontRegular, 6.8),
              {
                x: cell.x + 7,
                y: cell.y + 6,
                size: 6.8,
                font: fontRegular,
                color: inkBlack,
              }
            );
          }
          const st = grade?.itemStatuses?.[idx];
          if (st === 'betul') {
            drawVectorTick(sCellPage, cell.x + cell.w - 14, cell.y + cell.h - 14, 10, aiRed);
          } else if (st === 'salah') {
            drawVectorCross(sCellPage, cell.x + cell.w - 14, cell.y + cell.h - 14, 9, aiRed);
          }
        });
      }

      // Open-ended text
      if (qType === 'text') {
        if (ov.textLines && ov.textLines.length > 0) {
          const firstLine = ov.textLines[0];
          const tPage = pages[firstLine.page - 1];
          if (tPage) {
            const wrapped = wrapTextToWidth(rawAns, firstLine.width, fontRegular, 8.5);
            ov.textLines.forEach((lineSpec, lIdx) => {
              const targetPage = pages[lineSpec.page - 1];
              if (targetPage && wrapped[lIdx]) {
                targetPage.drawText(wrapped[lIdx], {
                  x: lineSpec.x,
                  y: lineSpec.y,
                  size: 8.5,
                  font: fontRegular,
                  color: inkBlue,
                });
              }
            });
            if (wrapped.length > ov.textLines.length) {
              appendixItems.push({
                numberLabel: q.numberLabel,
                prompt: q.prompt,
                answerText: rawAns,
                marksText: grade ? `${grade.marksAwarded}/${grade.maxMarks}` : `-/${q.maxMarks}`,
                passedItem: grade ? grade.status === 'betul' : undefined,
              });
            }
          }
        } else {
          appendixItems.push({
            numberLabel: q.numberLabel,
            prompt: q.prompt,
            answerText: rawAns,
            marksText: grade ? `${grade.marksAwarded}/${grade.maxMarks}` : `-/${q.maxMarks}`,
            passedItem: grade ? grade.status === 'betul' : undefined,
          });
        }
      }
    }
  } else {
    // Custom PDF uploaded by Pengajar/Admin without coordinate map:
    // Stamp compact top-right verification badge on Page 1 & append answer/marks sheet
    const p1 = pages[0];
    if (p1) {
      const { width, height } = p1.getSize();
      const boxW = 240;
      const boxH = 56;
      const bx = width - boxW - 24;
      const by = height - boxH - 18;
      p1.drawRectangle({
        x: bx,
        y: by,
        width: boxW,
        height: boxH,
        color: rgb(1, 1, 1),
        borderWidth: 1,
        borderColor: inkBlack,
      });
      p1.drawText(fitTextSingleLine(`${traineeName.toUpperCase()} (${traineeCodeId})`, boxW - 12, fontBold, 7.5), {
        x: bx + 6,
        y: by + boxH - 13,
        size: 7.5,
        font: fontBold,
        color: inkBlack,
      });
      p1.drawText(fitTextSingleLine(`MyKad: ${traineeIc || '-'}  |  ${dateStr}`, boxW - 12, fontRegular, 7), {
        x: bx + 6,
        y: by + boxH - 25,
        size: 7,
        font: fontRegular,
        color: inkBlack,
      });
      if (submission) {
        p1.drawText(
          `MARKAH: ${submission.totalScore}/${submission.maxTotalScore} (${submission.percentage}%)`,
          {
            x: bx + 6,
            y: by + 10,
            size: 8,
            font: fontBold,
            color: aiRed,
          }
        );
      }
    }
    for (const q of paper.questions) {
      const grade = submission?.grades.find((g) => g.questionId === q.id);
      const rawAns = grade?.answerText ?? answers[q.id] ?? '';
      appendixItems.push({
        numberLabel: q.numberLabel,
        prompt: q.prompt,
        answerText: formatPlainAnswerForAppendix(q, rawAns),
        marksText: grade ? `${grade.marksAwarded}/${grade.maxMarks}` : `-/${q.maxMarks}`,
        passedItem: grade ? grade.status === 'betul' : undefined,
      });
    }
  }

  // Append clean "LAMPIRAN JAWAPAN & MARKAH PELATIH" ONLY if any item couldn't fit on original pages
  if (appendixItems.length > 0) {
    let appPage = pdfDoc.addPage([595.3, 841.9]);
    let y = 795;

    const drawAppHeader = () => {
      appPage.drawText('LAMPIRAN JAWAPAN & MARKAH PELATIH', {
        x: 45,
        y,
        size: 12,
        font: fontBold,
        color: inkBlack,
      });
      y -= 16;
      appPage.drawText(
        fitTextSingleLine(
          `${paper.paperCode}  |  ${traineeName.toUpperCase()} (${traineeIc || traineeCodeId})  |  ${
            submission
              ? `${submission.totalScore}/${submission.maxTotalScore} (${submission.percentage}%)`
              : dateStr
          }`,
          505,
          fontRegular,
          8.5
        ),
        { x: 45, y, size: 8.5, font: fontRegular, color: inkBlack }
      );
      y -= 10;
      appPage.drawLine({
        start: { x: 45, y },
        end: { x: 550, y },
        thickness: 1,
        color: inkBlack,
      });
      y -= 18;
    };

    drawAppHeader();

    for (const item of appendixItems) {
      const promptLines = wrapTextToWidth(`${item.numberLabel} ${item.prompt}`, 420, fontBold, 9);
      const ansLines = wrapTextToWidth(item.answerText || '(Tiada jawapan)', 490, fontRegular, 8.8);
      const blockH = promptLines.length * 12 + ansLines.length * 11.5 + 22;

      if (y - blockH < 50) {
        appPage = pdfDoc.addPage([595.3, 841.9]);
        y = 795;
        drawAppHeader();
      }

      for (const pl of promptLines) {
        appPage.drawText(pl, { x: 45, y, size: 9, font: fontBold, color: inkBlack });
        y -= 12;
      }
      appPage.drawText(`[${item.marksText}]`, {
        x: 495,
        y: y + promptLines.length * 12,
        size: 9,
        font: fontBold,
        color: item.passedItem !== undefined ? aiRed : inkBlack,
      });
      if (item.passedItem === true) {
        drawVectorTick(appPage, 540, y + promptLines.length * 12 + 3, 9, aiRed);
      } else if (item.passedItem === false) {
        drawVectorCross(appPage, 540, y + promptLines.length * 12 + 3, 8.5, aiRed);
      }

      for (const al of ansLines) {
        appPage.drawText(al, { x: 55, y, size: 8.8, font: fontRegular, color: inkBlue });
        y -= 11.5;
      }
      y -= 12;
    }
  }

  return pdfDoc.save();
}

async function buildFallbackDirectPdfBytes(
  params: GenerateInjectedPdfParams & {
    collegeName: string;
    collegeAddress: string;
    logoBytes: Uint8Array | null;
  }
): Promise<Uint8Array> {
  const {
    paper,
    submission,
    answers,
    traineeName,
    traineeIc,
    traineeCodeId,
    dateStr,
    collegeName,
    collegeAddress,
    logoBytes,
  } = params;

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const embeddedLogo = logoBytes ? await pdfDoc.embedPng(logoBytes).catch(() => null) : null;

  const inkBlack = rgb(0.08, 0.08, 0.1);
  const inkBlue = rgb(0.05, 0.22, 0.62);
  const aiRed = rgb(220 / 255, 38 / 255, 38 / 255);

  let page = pdfDoc.addPage([595.3, 841.9]);
  let y = 795;

  const ensureSpace = (needed: number) => {
    if (y - needed < 50) {
      page = pdfDoc.addPage([595.3, 841.9]);
      y = 795;
    }
  };

  // Header box
  page.drawRectangle({
    x: 42,
    y: y - 68,
    width: 511,
    height: 76,
    borderWidth: 1.5,
    borderColor: inkBlack,
  });
  if (embeddedLogo) {
    const dims = embeddedLogo.scaleToFit(56, 56);
    page.drawImage(embeddedLogo, {
      x: 52,
      y: y - 62 + (64 - dims.height) / 2,
      width: dims.width,
      height: dims.height,
    });
  }
  const cLines = wrapTextToWidth(collegeName, 420, fontBold, 11).slice(0, 2);
  let hy = y - 16;
  for (const cl of cLines) {
    page.drawText(cl, { x: 122, y: hy, size: 11, font: fontBold, color: inkBlack });
    hy -= 13;
  }
  const aLines = wrapTextToWidth(collegeAddress, 420, fontRegular, 8).slice(0, 2);
  for (const al of aLines) {
    page.drawText(al, { x: 122, y: hy, size: 8, font: fontRegular, color: inkBlack });
    hy -= 10;
  }
  page.drawText(fitTextSingleLine(`KERTAS TUGASAN (${paper.setCode}) - ${paper.paperCode}`, 420, fontBold, 9.5), {
    x: 122,
    y: y - 61,
    size: 9.5,
    font: fontBold,
    color: inkBlack,
  });

  y -= 86;

  // Trainee & Result Summary Box
  page.drawRectangle({
    x: 42,
    y: y - 54,
    width: 511,
    height: 54,
    borderWidth: 1,
    borderColor: inkBlack,
  });
  page.drawText(fitTextSingleLine(`NAMA PELATIH: ${traineeName.toUpperCase()}`, 260, fontBold, 8.5), {
    x: 50,
    y: y - 16,
    size: 8.5,
    font: fontBold,
    color: inkBlack,
  });
  page.drawText(fitTextSingleLine(`NO. MYKAD: ${traineeIc || '-'}`, 230, fontBold, 8.5), {
    x: 320,
    y: y - 16,
    size: 8.5,
    font: fontBold,
    color: inkBlack,
  });
  page.drawText(fitTextSingleLine(`ID PELATIH: ${traineeCodeId}   |   TARIKH: ${dateStr}`, 260, fontRegular, 8), {
    x: 50,
    y: y - 32,
    size: 8,
    font: fontRegular,
    color: inkBlack,
  });
  const totalMax = paper.questions.reduce((s, q) => s + q.maxMarks, 0);
  page.drawText(
    submission
      ? `MARKAH: ${submission.totalScore}/${submission.maxTotalScore} (${submission.percentage}%)`
      : `MARKAH PENUH: ${totalMax}`,
    {
      x: 320,
      y: y - 32,
      size: 8.8,
      font: fontBold,
      color: submission ? aiRed : inkBlack,
    }
  );
  page.drawText(fitTextSingleLine(`TAJUK: ${paper.title}`, 490, fontBold, 8.2), {
    x: 50,
    y: y - 47,
    size: 8.2,
    font: fontBold,
    color: inkBlack,
  });

  y -= 74;

  for (const q of paper.questions) {
    const grade = submission?.grades.find((g) => g.questionId === q.id);
    const rawAns = grade?.answerText ?? answers[q.id] ?? '';
    const ansFormatted = formatPlainAnswerForAppendix(q, rawAns);
    const pLines = wrapTextToWidth(`${q.numberLabel} ${q.prompt}`, 430, fontBold, 9);
    const aBodyLines = wrapTextToWidth(ansFormatted, 485, fontRegular, 8.5);
    const needed = pLines.length * 12 + aBodyLines.length * 11 + 20;
    ensureSpace(needed);

    const startY = y;
    for (const pl of pLines) {
      page.drawText(pl, { x: 42, y, size: 9, font: fontBold, color: inkBlack });
      y -= 12;
    }
    if (grade) {
      page.drawText(`[${grade.marksAwarded}/${grade.maxMarks}]`, {
        x: 492,
        y: startY,
        size: 9,
        font: fontBold,
        color: aiRed,
      });
      if (grade.status === 'betul') {
        drawVectorTick(page, 540, startY + 3, 9, aiRed);
      } else if (grade.status === 'salah') {
        drawVectorCross(page, 540, startY + 3, 8.5, aiRed);
      }
    } else {
      page.drawText(`[/${q.maxMarks}]`, { x: 498, y: startY, size: 8.5, font: fontRegular, color: inkBlack });
    }
    for (const al of aBodyLines) {
      page.drawText(al, { x: 56, y, size: 8.5, font: fontRegular, color: inkBlue });
      y -= 11;
    }
    y -= 10;
  }

  return pdfDoc.save();
}

export function downloadPdfBytes(bytes: Uint8Array, fileSlug: string): Blob {
  const safeName = fileSlug.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: 'application/pdf' });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `${safeName || 'Kertas-Tugasan'}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 8000);
  return blob;
}

export async function printPdfBytes(bytes: Uint8Array): Promise<boolean> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: 'application/pdf' });
  const blobUrl = URL.createObjectURL(blob);

  return new Promise<boolean>((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.src = blobUrl;

    let finished = false;
    const cleanup = (ok: boolean) => {
      if (finished) return;
      finished = true;
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        URL.revokeObjectURL(blobUrl);
      }, 60000);
      resolve(ok);
    };

    const timer = setTimeout(() => cleanup(false), 3500);

    iframe.onload = () => {
      clearTimeout(timer);
      try {
        const win = iframe.contentWindow;
        if (!win) {
          cleanup(false);
          return;
        }
        win.focus();
        win.print();
        cleanup(true);
      } catch {
        cleanup(false);
      }
    };

    iframe.onerror = () => {
      clearTimeout(timer);
      cleanup(false);
    };

    document.body.appendChild(iframe);
  });
}

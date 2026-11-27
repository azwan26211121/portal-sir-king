import type {
  PdfPaperOverlayMeta,
  PdfPoint,
  PdfQuestionOverlaySpec,
  TugasanPaper,
} from '../src/types.ts';

function mcqSpec(
  page: number,
  x: number,
  ys: [number, number, number, number],
  markX: number,
  markY: number
): PdfQuestionOverlaySpec {
  return {
    markPos: { page, x: markX, y: markY },
    mcqChoices: {
      A: { page, x, y: ys[0] },
      B: { page, x, y: ys[1] },
      C: { page, x, y: ys[2] },
      D: { page, x, y: ys[3] },
    },
  };
}

function diagramLinesSpec(
  page: number,
  x: number,
  ys: [number, number, number, number, number],
  markY: number
): PdfQuestionOverlaySpec {
  const keys = ['a', 'b', 'c', 'd', 'e'];
  return {
    markPos: { page, x: 442, y: markY },
    answerSlots: keys.map((key, idx) => ({
      key,
      page,
      x,
      y: ys[idx],
      maxWidth: 265,
    })),
  };
}

function trueFalseSpec(
  page: number,
  boxX: number,
  ys: [number, number, number, number, number],
  markY: number
): PdfQuestionOverlaySpec {
  const keys = ['a', 'b', 'c', 'd', 'e'];
  return {
    markPos: { page, x: 442, y: markY },
    trueFalseRows: keys.map((key, idx) => ({
      key,
      page,
      boxX,
      boxY: ys[idx],
    })),
  };
}

function matchingSpec(
  page: number,
  leftX: number,
  rightX: number,
  ys: [number, number, number, number, number],
  markY: number
): PdfQuestionOverlaySpec {
  return {
    markPos: { page, x: 442, y: markY },
    matchingLeftPoints: ys.map((y, rowIdx) => ({ rowIdx, page, x: leftX, y })),
    matchingRightPoints: ys.map((y, rowIdx) => ({ rowIdx, page, x: rightX, y })),
  };
}

export interface PaperPdfOverlayConfig {
  sourcePdfUrl: string;
  pdfOverlayMeta: PdfPaperOverlayMeta;
  questions: Record<string, PdfQuestionOverlaySpec>;
}

const STANDARD_STAMP_P8 = (y: number): PdfPaperOverlayMeta['stampBox'] => ({
  page: 8,
  x: 300,
  y,
  w: 227,
  h: 97,
});

const STANDARD_HEADER_LOGO: PdfPaperOverlayMeta['headerLogoBox'] = {
  page: 1,
  x: 54,
  y: 631,
  w: 162,
  h: 141,
};

const STANDARD_HEADER_ADDR: PdfPaperOverlayMeta['headerAddrBox'] = {
  page: 1,
  x: 222,
  y: 696,
  w: 320,
  h: 76,
};

export const PAPER_PDF_OVERLAY_CONFIGS: Record<string, PaperPdfOverlayConfig> = {
  'tug-c01-1': {
    sourcePdfUrl: '/assets/aistudio/10._KTC01_1-5__PINK__dae3de14.pdf',
    pdfOverlayMeta: {
      namePos: { page: 1, x: 58, y: 252 },
      icPos: { page: 1, x: 226, y: 252 },
      datePos: { page: 1, x: 428, y: 252 },
      userIdPos: { page: 1, x: 428, y: 239 },
      totalMarkPos: { page: 8, x: 468, y: 715 },
      statusPos: { page: 8, x: 312, y: 715 },
      stampBox: STANDARD_STAMP_P8(588),
      headerLogoBox: STANDARD_HEADER_LOGO,
      headerAddrBox: STANDARD_HEADER_ADDR,
    },
    questions: {
      'tug-c01-1-q1': mcqSpec(2, 93, [575, 554, 534, 513], 442, 492),
      'tug-c01-1-q2': mcqSpec(2, 93, [409, 389, 368, 327], 442, 285),
      'tug-c01-1-q3': mcqSpec(2, 93, [202, 182, 161, 140], 442, 120),
      'tug-c01-1-q4': mcqSpec(3, 93, [713, 692, 672, 651], 442, 630),
      'tug-c01-1-q5': mcqSpec(3, 93, [548, 506, 465, 423], 442, 382),
      'tug-c01-1-q6': mcqSpec(3, 93, [278, 258, 237, 216], 442, 175),
      'tug-c01-1-q7': mcqSpec(4, 93, [589, 568, 548, 527], 442, 506),
      'tug-c01-1-q8': mcqSpec(4, 93, [299, 278, 258, 237], 442, 216),
      'tug-c01-1-q9': mcqSpec(5, 93, [589, 568, 548, 527], 442, 506),
      'tug-c01-1-q10': mcqSpec(5, 93, [299, 278, 258, 237], 442, 216),
      'tug-c01-1-q11': diagramLinesSpec(6, 138, [237, 216, 196, 175, 154], 133),
      'tug-c01-1-q12': matchingSpec(7, 223, 281, [606, 507, 423, 330, 195], 69),
    },
  },

  'tug-c01-2': {
    sourcePdfUrl: '/assets/aistudio/13._KTC01_2-5__PINK__bab27e28.pdf',
    pdfOverlayMeta: {
      namePos: { page: 1, x: 74, y: 251 },
      icPos: { page: 1, x: 243, y: 251 },
      datePos: { page: 1, x: 444, y: 251 },
      userIdPos: { page: 1, x: 444, y: 238 },
      totalMarkPos: { page: 8, x: 465, y: 669 },
      statusPos: { page: 8, x: 310, y: 669 },
      stampBox: { page: 8, x: 299, y: 542, w: 222, h: 97 },
      headerLogoBox: { page: 1, x: 75, y: 620, w: 162, h: 135 },
      headerAddrBox: { page: 1, x: 244, y: 682, w: 292, h: 74 },
    },
    questions: {
      'tug-c01-2-q1': mcqSpec(2, 107, [577, 556, 535, 514], 442, 493),
      'tug-c01-2-q2': mcqSpec(2, 107, [410, 389, 368, 347], 442, 327),
      'tug-c01-2-q3': mcqSpec(2, 107, [222, 202, 181, 139], 442, 98),
      'tug-c01-2-q4': mcqSpec(3, 108, [465, 445, 424, 403], 442, 382),
      'tug-c01-2-q5': mcqSpec(3, 109, [322, 257, 195, 132], 442, 91),
      'tug-c01-2-q6': mcqSpec(4, 107, [716, 695, 674, 653], 442, 632),
      'tug-c01-2-q7': mcqSpec(4, 100, [424, 403, 382, 362], 442, 341),
      'tug-c01-2-q8': mcqSpec(5, 100, [757, 736, 716, 695], 442, 674),
      'tug-c01-2-q9': mcqSpec(5, 100, [507, 487, 466, 445], 442, 403),
      'tug-c01-2-q10': mcqSpec(5, 99, [320, 278, 237, 195], 442, 133),
      'tug-c01-2-q11': {
        markPos: { page: 6, x: 442, y: 172 },
        symbolCells: [
          { rowIdx: 0, page: 6, x: 331, y: 598, w: 181, h: 105 },
          { rowIdx: 1, page: 6, x: 331, y: 497, w: 181, h: 101 },
          { rowIdx: 2, page: 6, x: 331, y: 410, w: 181, h: 87 },
          { rowIdx: 3, page: 6, x: 331, y: 315, w: 181, h: 94 },
          { rowIdx: 4, page: 6, x: 331, y: 205, w: 181, h: 110 },
        ],
      },
      'tug-c01-2-q12': matchingSpec(7, 214, 268, [652, 522, 390, 252, 126], 57),
    },
  },

  'tug-c01-3': {
    sourcePdfUrl: '/assets/aistudio/16._KTC01_3-5__PINK__8676a9c4.pdf',
    pdfOverlayMeta: {
      namePos: { page: 1, x: 58, y: 272 },
      icPos: { page: 1, x: 226, y: 272 },
      datePos: { page: 1, x: 428, y: 272 },
      userIdPos: { page: 1, x: 428, y: 259 },
      totalMarkPos: { page: 7, x: 468, y: 177 },
      statusPos: { page: 7, x: 312, y: 177 },
      stampBox: STANDARD_STAMP_P8(666),
      headerLogoBox: STANDARD_HEADER_LOGO,
      headerAddrBox: STANDARD_HEADER_ADDR,
    },
    questions: {
      'tug-c01-3-q1': mcqSpec(2, 100, [554, 534, 513, 492], 442, 472),
      'tug-c01-3-q2': mcqSpec(2, 100, [368, 347, 327, 306], 442, 285),
      'tug-c01-3-q3': mcqSpec(2, 100, [202, 182, 161, 140], 442, 99),
      'tug-c01-3-q4': mcqSpec(3, 100, [672, 651, 630, 610], 442, 568),
      'tug-c01-3-q5': mcqSpec(3, 100, [485, 465, 444, 423], 442, 403),
      'tug-c01-3-q6': mcqSpec(3, 100, [320, 278, 237, 196], 442, 133),
      'tug-c01-3-q7': mcqSpec(4, 100, [506, 485, 465, 444], 442, 423),
      'tug-c01-3-q8': mcqSpec(4, 100, [237, 216, 196, 175], 442, 154),
      'tug-c01-3-q9': mcqSpec(5, 100, [527, 506, 485, 465], 442, 403),
      'tug-c01-3-q10': mcqSpec(5, 100, [196, 175, 154, 133], 442, 92),
      'tug-c01-3-q11': diagramLinesSpec(6, 138, [177, 156, 136, 115, 94], 74),
      'tug-c01-3-q12': trueFalseSpec(7, 528, [558, 487, 431, 374, 317], 237),
    },
  },

  'tug-c01-4': {
    sourcePdfUrl: '/assets/aistudio/27._KTC01_4-5__PINK__fdbec656.pdf',
    pdfOverlayMeta: {
      namePos: { page: 1, x: 58, y: 322 },
      icPos: { page: 1, x: 226, y: 322 },
      datePos: { page: 1, x: 428, y: 322 },
      userIdPos: { page: 1, x: 428, y: 309 },
      totalMarkPos: { page: 8, x: 468, y: 715 },
      statusPos: { page: 8, x: 312, y: 715 },
      stampBox: STANDARD_STAMP_P8(588),
      headerLogoBox: STANDARD_HEADER_LOGO,
      headerAddrBox: STANDARD_HEADER_ADDR,
    },
    questions: {
      'tug-c01-4-q1': mcqSpec(2, 100, [575, 534, 492, 451], 442, 409),
      'tug-c01-4-q2': mcqSpec(2, 100, [327, 285, 244, 202], 442, 140),
      'tug-c01-4-q3': mcqSpec(3, 100, [713, 651, 589, 527], 416, 465),
      'tug-c01-4-q4': mcqSpec(3, 100, [382, 361, 340, 320], 442, 299),
      'tug-c01-4-q5': mcqSpec(4, 100, [568, 548, 527, 506], 442, 485),
      'tug-c01-4-q6': mcqSpec(4, 100, [423, 403, 382, 361], 442, 320),
      'tug-c01-4-q7': mcqSpec(5, 100, [754, 734, 713, 692], 442, 672),
      'tug-c01-4-q8': mcqSpec(5, 100, [465, 444, 423, 403], 442, 382),
      'tug-c01-4-q9': mcqSpec(5, 100, [196, 175, 154, 133], 442, 92),
      'tug-c01-4-q10': mcqSpec(6, 100, [610, 589, 568, 548], 442, 506),
      'tug-c01-4-q11': trueFalseSpec(6, 528, [382, 309, 239, 183, 126], 66),
      'tug-c01-4-q12': matchingSpec(7, 224, 331, [653, 560, 476, 403, 310], 205),
    },
  },

  'tug-c01-5': {
    sourcePdfUrl: '/assets/aistudio/30._KTC01_5-5__PINK__8abd5aff.pdf',
    pdfOverlayMeta: {
      namePos: { page: 1, x: 58, y: 302 },
      icPos: { page: 1, x: 226, y: 302 },
      datePos: { page: 1, x: 428, y: 302 },
      userIdPos: { page: 1, x: 428, y: 289 },
      totalMarkPos: { page: 6, x: 468, y: 230 },
      statusPos: { page: 6, x: 312, y: 230 },
      stampBox: { page: 6, x: 300, y: 103, w: 227, h: 97 },
      headerLogoBox: STANDARD_HEADER_LOGO,
      headerAddrBox: STANDARD_HEADER_ADDR,
    },
    questions: {
      'tug-c01-5-q1': mcqSpec(2, 100, [575, 554, 534, 513], 442, 492),
      'tug-c01-5-q2': mcqSpec(2, 100, [410, 389, 368, 347], 442, 306),
      'tug-c01-5-q3': mcqSpec(2, 100, [223, 182, 140, 99], 442, 58),
      'tug-c01-5-q4': mcqSpec(3, 100, [713, 692, 672, 651], 442, 610),
      'tug-c01-5-q5': mcqSpec(3, 100, [444, 423, 403, 382], 442, 361),
      'tug-c01-5-q6': mcqSpec(3, 99, [299, 237, 175, 113], 442, 51),
      'tug-c01-5-q7': mcqSpec(4, 100, [610, 589, 568, 548], 442, 527),
      'tug-c01-5-q8': mcqSpec(4, 100, [465, 444, 403, 361], 442, 320),
      'tug-c01-5-q9': mcqSpec(4, 99, [154, 133, 113, 92], 442, 51),
      'tug-c01-5-q10': mcqSpec(5, 100, [692, 672, 651, 630], 442, 589),
      'tug-c01-5-q11': trueFalseSpec(5, 528, [464, 401, 338, 275, 211], 127),
      'tug-c01-5-q12': diagramLinesSpec(6, 138, [415, 394, 373, 352, 332], 311),
    },
  },
};

export function applyPdfOverlaySpecs(paper: TugasanPaper): TugasanPaper {
  const cfg = PAPER_PDF_OVERLAY_CONFIGS[paper.id];
  if (!cfg) return paper;
  return {
    ...paper,
    sourcePdfUrl: paper.sourcePdfUrl || cfg.sourcePdfUrl,
    pdfOverlayMeta: cfg.pdfOverlayMeta,
    questions: paper.questions.map((q) => ({
      ...q,
      pdfOverlay: cfg.questions[q.id] || q.pdfOverlay,
    })),
  };
}

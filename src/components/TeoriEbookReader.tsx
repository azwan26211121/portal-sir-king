import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Download,
  File as FileIcon,
  Loader2,
  Maximize2,
  Minimize2,
  Square,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import type { FileMetadata } from '../types.ts';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface TeoriEbookReaderProps {
  token: string;
  file: FileMetadata;
  bookTitle: string;
  folderLabel?: string;
  onClose: () => void;
  onDownload: () => void;
}

type InlineRun =
  | { type: 'text'; text: string; bold?: boolean; italic?: boolean; underline?: boolean }
  | { type: 'link'; text: string; href: string };

type EbookBlock =
  | { kind: 'heading'; level: number; runs: InlineRun[]; weight: number }
  | { kind: 'paragraph'; runs: InlineRun[]; weight: number }
  | { kind: 'quote'; runs: InlineRun[]; weight: number }
  | { kind: 'list'; ordered: boolean; items: InlineRun[][]; weight: number }
  | { kind: 'table'; rows: { isHeader: boolean; cells: InlineRun[][] }[]; weight: number };

function sanitizeLinkHref(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function collectInlineRuns(
  node: Node,
  style: { bold?: boolean; italic?: boolean; underline?: boolean } = {}
): InlineRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    if (!text) return [];
    return [{ type: 'text', text, ...style }];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') {
    return [{ type: 'text', text: '\n', ...style }];
  }
  if (tag === 'a') {
    const safeHref = sanitizeLinkHref(el.getAttribute('href'));
    const text = (el.textContent || '').trim();
    if (safeHref && text) {
      return [{ type: 'link', text, href: safeHref }];
    }
  }

  const nextStyle = {
    bold: style.bold || tag === 'strong' || tag === 'b',
    italic: style.italic || tag === 'em' || tag === 'i',
    underline: style.underline || tag === 'u',
  };

  const runs: InlineRun[] = [];
  el.childNodes.forEach((child) => {
    runs.push(...collectInlineRuns(child, nextStyle));
  });
  return runs;
}

function runsTextLength(runs: InlineRun[]): number {
  return runs.reduce((sum, r) => sum + r.text.length, 0);
}

function parseDocxHtmlToBlocks(html: string): EbookBlock[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks: EbookBlock[] = [];

  function walk(container: Element) {
    Array.from(container.children).forEach((el) => {
      const tag = el.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        const runs = collectInlineRuns(el);
        const len = runsTextLength(runs);
        if (len > 0) {
          blocks.push({
            kind: 'heading',
            level: Number(tag[1]),
            runs,
            weight: Math.max(90, len + 70),
          });
        }
        return;
      }

      if (tag === 'p') {
        const runs = collectInlineRuns(el);
        const len = runsTextLength(runs);
        if (len > 0) {
          blocks.push({
            kind: 'paragraph',
            runs,
            weight: Math.max(60, len + 45),
          });
        }
        return;
      }

      if (tag === 'blockquote') {
        const runs = collectInlineRuns(el);
        const len = runsTextLength(runs);
        if (len > 0) {
          blocks.push({
            kind: 'quote',
            runs,
            weight: Math.max(80, len + 60),
          });
        }
        return;
      }

      if (tag === 'ul' || tag === 'ol') {
        const items: InlineRun[][] = [];
        Array.from(el.children).forEach((li) => {
          if (li.tagName.toLowerCase() === 'li') {
            const runs = collectInlineRuns(li);
            if (runsTextLength(runs) > 0) {
              items.push(runs);
            }
          }
        });
        if (items.length > 0) {
          const totalLen = items.reduce((acc, item) => acc + runsTextLength(item) + 40, 0);
          blocks.push({
            kind: 'list',
            ordered: tag === 'ol',
            items,
            weight: Math.max(80, totalLen),
          });
        }
        return;
      }

      if (tag === 'table') {
        const rows: { isHeader: boolean; cells: InlineRun[][] }[] = [];
        el.querySelectorAll('tr').forEach((tr) => {
          const cellEls = Array.from(tr.children).filter((c) => {
            const ct = c.tagName.toLowerCase();
            return ct === 'th' || ct === 'td';
          });
          if (cellEls.length === 0) return;
          const isHeader = cellEls.every((c) => c.tagName.toLowerCase() === 'th');
          const cells = cellEls.map((c) => collectInlineRuns(c));
          rows.push({ isHeader, cells });
        });
        if (rows.length > 0) {
          const totalWeight = rows.reduce((sum, r) => {
            const rowChars = r.cells.reduce((cs, c) => cs + runsTextLength(c), 0);
            return sum + Math.max(95, rowChars + 55);
          }, 40);
          blocks.push({
            kind: 'table',
            rows,
            weight: totalWeight,
          });
        }
        return;
      }

      walk(el);
    });
  }

  walk(doc.body);
  return blocks;
}

function paginateBlocks(blocks: EbookBlock[], pageBudget = 1350): EbookBlock[][] {
  if (blocks.length === 0) return [[]];
  const pages: EbookBlock[][] = [];
  let current: EbookBlock[] = [];
  let weight = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const nextBlock = blocks[i + 1];

    // Keep heading glued to its following block if near end of page
    if (
      block.kind === 'heading' &&
      current.length > 0 &&
      nextBlock &&
      weight + block.weight + Math.min(nextBlock.weight, 280) > pageBudget
    ) {
      pages.push(current);
      current = [];
      weight = 0;
    } else if (current.length > 0 && weight + block.weight > pageBudget) {
      pages.push(current);
      current = [];
      weight = 0;
    }

    current.push(block);
    weight += block.weight;
  }

  if (current.length > 0) {
    pages.push(current);
  }
  return pages;
}

function renderInlineRuns(runs: InlineRun[], keyPrefix: string): React.ReactNode {
  return runs.map((run, idx) => {
    const k = `${keyPrefix}-${idx}`;
    if (run.type === 'link') {
      return (
        <a
          key={k}
          href={run.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-700 underline hover:text-blue-900"
        >
          {run.text}
        </a>
      );
    }
    let content: React.ReactNode = run.text;
    if (run.bold) content = <strong>{content}</strong>;
    if (run.italic) content = <em>{content}</em>;
    if (run.underline) content = <span className="underline">{content}</span>;
    return <React.Fragment key={k}>{content}</React.Fragment>;
  });
}

function PdfCanvasPage({
  pdfDoc,
  pageNumber,
  zoom,
}: {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    async function drawPage() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setRendering(true);
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = 560 * zoom;
        const scale = targetWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        renderTask = page.render({
          canvasContext: ctx,
          canvas,
          viewport,
        });
        await renderTask.promise;
      } catch (err) {
        if ((err as { name?: string })?.name !== 'RenderingCancelledException') {
          // ignore silent cancellations
        }
      } finally {
        if (!cancelled) {
          setRendering(false);
        }
      }
    }

    drawPage();
    return () => {
      cancelled = true;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, pageNumber, zoom]);

  return (
    <div className="relative bg-[#fdfbf6] rounded-md shadow-[0_14px_38px_rgba(0,0,0,0.55)] border border-[#d9cfb8] overflow-hidden flex flex-col items-center justify-between min-h-[420px]">
      {rendering && (
        <div className="absolute inset-0 bg-[#fdfbf6]/80 flex items-center justify-center z-10">
          <Loader2 className="w-6 h-6 animate-spin text-[#0b1733]" />
        </div>
      )}
      <div className="p-2 sm:p-3 flex items-center justify-center overflow-auto max-w-full">
        <canvas ref={canvasRef} className="block max-w-full h-auto" />
      </div>
      <div className="w-full py-2 px-4 border-t border-[#ebe3d0] bg-[#f7f2e6] text-center text-[11px] font-serif text-slate-600">
        — Muka {pageNumber} —
      </div>
    </div>
  );
}

function DocxBookPage({
  blocks,
  pageNumber,
  totalPages,
  zoom,
  bookTitle,
}: {
  blocks: EbookBlock[];
  pageNumber: number;
  totalPages: number;
  zoom: number;
  bookTitle: string;
}) {
  return (
    <article
      style={{ fontSize: `${Math.round(14 * zoom)}px` }}
      className="w-full max-w-[600px] min-h-[600px] bg-[#fdfbf6] text-slate-800 rounded-md shadow-[0_14px_38px_rgba(0,0,0,0.55)] border border-[#d9cfb8] flex flex-col justify-between overflow-hidden"
    >
      <div className="px-6 py-3 border-b border-[#ebe3d0] bg-[#f7f2e6] flex items-center justify-between gap-2 text-[11px] text-slate-600 font-serif">
        <span className="truncate font-semibold">{bookTitle}</span>
        <span className="shrink-0 font-mono">
          {pageNumber} / {totalPages}
        </span>
      </div>

      <div className="flex-1 px-7 sm:px-9 py-6 space-y-3.5 leading-relaxed font-serif">
        {blocks.length === 0 ? (
          <p className="text-sm text-slate-500 italic text-center py-12">
            Dokumen ini tidak mengandungi teks yang boleh dipaparkan.
          </p>
        ) : (
          blocks.map((block, idx) => {
            if (block.kind === 'heading') {
              const sizeClass =
                block.level === 1
                  ? 'text-xl font-bold text-[#0b1733] border-b border-[#e5d9be] pb-1.5 mt-1'
                  : block.level === 2
                  ? 'text-lg font-bold text-[#0b1733] mt-1'
                  : 'text-base font-semibold text-[#152d61]';
              return (
                <div key={idx} className={sizeClass}>
                  {renderInlineRuns(block.runs, `h-${idx}`)}
                </div>
              );
            }
            if (block.kind === 'quote') {
              return (
                <blockquote
                  key={idx}
                  className="border-l-4 border-[#c99b2e] pl-4 py-1 italic text-slate-700 bg-[#f6f0df]/70 rounded-r"
                >
                  {renderInlineRuns(block.runs, `q-${idx}`)}
                </blockquote>
              );
            }
            if (block.kind === 'list') {
              const ListTag = block.ordered ? 'ol' : 'ul';
              return (
                <ListTag
                  key={idx}
                  className={`pl-6 space-y-1.5 ${
                    block.ordered ? 'list-decimal' : 'list-disc'
                  }`}
                >
                  {block.items.map((itemRuns, iIdx) => (
                    <li key={iIdx}>{renderInlineRuns(itemRuns, `li-${idx}-${iIdx}`)}</li>
                  ))}
                </ListTag>
              );
            }
            if (block.kind === 'table') {
              return (
                <div key={idx} className="overflow-x-auto my-2">
                  <table className="w-full border-collapse border border-[#d6ccb4] text-xs">
                    <tbody>
                      {block.rows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className={row.isHeader ? 'bg-[#eee5cf] font-semibold' : 'bg-white/60'}
                        >
                          {row.cells.map((cellRuns, cIdx) => {
                            const CellTag = row.isHeader ? 'th' : 'td';
                            return (
                              <CellTag
                                key={cIdx}
                                className="border border-[#d6ccb4] px-2.5 py-1.5 text-left align-top"
                              >
                                {renderInlineRuns(cellRuns, `td-${idx}-${rIdx}-${cIdx}`)}
                              </CellTag>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }
            return (
              <p key={idx} className="text-slate-800 whitespace-pre-line">
                {renderInlineRuns(block.runs, `p-${idx}`)}
              </p>
            );
          })
        )}
      </div>

      <div className="px-6 py-2.5 border-t border-[#ebe3d0] bg-[#f7f2e6] text-center text-[11px] font-serif text-slate-600">
        — Muka {pageNumber} daripada {totalPages} —
      </div>
    </article>
  );
}

export function TeoriEbookReader({
  token,
  file,
  bookTitle,
  folderLabel,
  onClose,
  onDownload,
}: TeoriEbookReaderProps) {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [docxPages, setDocxPages] = useState<EbookBlock[][]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [zoom, setZoom] = useState(1);
  const [spreadMode, setSpreadMode] = useState<'single' | 'spread'>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 1100 ? 'spread' : 'single'
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isPdf = file.extension === '.pdf';
  const isDocx = file.extension === '.docx';
  const isLegacyDoc = file.extension === '.doc';

  useEffect(() => {
    let cancelled = false;
    let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;

    async function loadDocument() {
      setLoading(true);
      setErrorMsg(null);
      setPdfDoc(null);
      setDocxPages([]);
      setCurrentPage(1);
      setPageInput('1');

      if (isLegacyDoc) {
        setTotalPages(1);
        setLoading(false);
        return;
      }

      try {
        const blob = await api.fetchProtectedFileBlob(token, file.id);
        const arrayBuffer = await blob.arrayBuffer();
        if (cancelled) return;

        if (isPdf) {
          loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
          const doc = await loadingTask.promise;
          if (cancelled) {
            loadingTask.destroy().catch(() => {});
            return;
          }
          setPdfDoc(doc);
          setTotalPages(Math.max(1, doc.numPages));
        } else if (isDocx) {
          const result = await mammoth.convertToHtml({ arrayBuffer });
          if (cancelled) return;
          const blocks = parseDocxHtmlToBlocks(result.value || '');
          const paginated = paginateBlocks(blocks);
          setDocxPages(paginated);
          setTotalPages(Math.max(1, paginated.length));
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(
            err instanceof ApiError
              ? err.message
              : 'Gagal memuatkan dokumen untuk paparan E-Book.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDocument();
    return () => {
      cancelled = true;
      if (loadingTask) {
        loadingTask.destroy().catch(() => {});
      }
    };
  }, [token, file.id, isPdf, isDocx, isLegacyDoc]);

  const effectiveSpread = spreadMode === 'spread' && totalPages > 1;
  const pageStep = effectiveSpread ? 2 : 1;

  const visiblePages = useMemo(() => {
    if (!effectiveSpread) return [currentPage];
    const left = currentPage % 2 === 0 ? Math.max(1, currentPage - 1) : currentPage;
    const right = left + 1 <= totalPages ? left + 1 : null;
    return right ? [left, right] : [left];
  }, [currentPage, effectiveSpread, totalPages]);

  const goToPage = useCallback(
    (target: number) => {
      const clamped = Math.max(1, Math.min(totalPages, target));
      const aligned =
        effectiveSpread && clamped % 2 === 0 ? Math.max(1, clamped - 1) : clamped;
      setCurrentPage(aligned);
      setPageInput(String(aligned));
    },
    [effectiveSpread, totalPages]
  );

  const goPrev = useCallback(() => {
    const base = visiblePages[0] ?? currentPage;
    goToPage(base - pageStep);
  }, [visiblePages, currentPage, pageStep, goToPage]);

  const goNext = useCallback(() => {
    const base = visiblePages[0] ?? currentPage;
    if (base + pageStep <= totalPages) {
      goToPage(base + pageStep);
    } else if (visiblePages[visiblePages.length - 1] < totalPages) {
      goToPage(totalPages);
    }
  }, [visiblePages, currentPage, pageStep, totalPages, goToPage]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goPrev, goNext, isFullscreen]);

  const canGoPrev = (visiblePages[0] ?? 1) > 1;
  const canGoNext = (visiblePages[visiblePages.length - 1] ?? 1) < totalPages;
  const progressPercent = Math.round(
    (((visiblePages[visiblePages.length - 1] ?? 1) / Math.max(1, totalPages)) * 100)
  );

  function handlePageJumpSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number.parseInt(pageInput, 10);
    if (!Number.isNaN(parsed)) {
      goToPage(parsed);
    } else {
      setPageInput(String(visiblePages[0] ?? 1));
    }
  }

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-[#030a18]/95 backdrop-blur-md flex flex-col p-3 sm:p-5'
          : 'mt-5 rounded-xl border border-[#2b4a86] bg-[#061024] shadow-2xl overflow-hidden flex flex-col'
      }
    >
      {/* E-Book Top Reader Bar */}
      <div className="bg-[#0b1733] border-b border-[#1d3464] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-[#e5b94c]/15 border border-[#e5b94c]/40 text-[#f0cb63] shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wide text-[#f0cb63]">
                Mod E-Book ({file.extension.replace('.', '').toUpperCase()})
              </span>
              {folderLabel && (
                <span className="hidden md:inline text-[11px] font-mono text-slate-400 truncate max-w-[260px]">
                  · {folderLabel}
                </span>
              )}
            </div>
            <h4 className="text-sm font-semibold text-white truncate">
              {bookTitle || file.originalName}
            </h4>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {!isLegacyDoc && totalPages > 1 && (
            <button
              type="button"
              onClick={() => setSpreadMode(spreadMode === 'spread' ? 'single' : 'spread')}
              title={spreadMode === 'spread' ? 'Tukar ke 1 Halaman' : 'Tukar ke 2 Halaman Buku'}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] rounded-lg flex items-center gap-1.5"
            >
              {spreadMode === 'spread' ? (
                <>
                  <Square className="w-3.5 h-3.5 text-[#f0cb63]" />
                  <span className="hidden sm:inline">1 Muka</span>
                </>
              ) : (
                <>
                  <Columns2 className="w-3.5 h-3.5 text-[#f0cb63]" />
                  <span className="hidden sm:inline">2 Muka Buku</span>
                </>
              )}
            </button>
          )}

          {!isLegacyDoc && (
            <div className="flex items-center bg-[#102045] border border-[#263f73] rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.15).toFixed(2))))}
                aria-label="Kecilkan paparan"
                className="p-1.5 text-slate-200 hover:bg-[#172e61]"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-[11px] font-mono tabular-nums text-slate-200">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(1.65, Number((z + 0.15).toFixed(2))))}
                aria-label="Besarkan paparan"
                className="p-1.5 text-slate-200 hover:bg-[#172e61]"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onDownload}
            className="px-2.5 py-1.5 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Muat Turun</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen((f) => !f)}
            title={isFullscreen ? 'Keluar Skrin Penuh' : 'Skrin Penuh'}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] rounded-lg flex items-center gap-1.5"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 text-[#f0cb63]" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-[#f0cb63]" />
            )}
            <span className="hidden md:inline">
              {isFullscreen ? 'Kecilkan' : 'Skrin Penuh'}
            </span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#081228] border border-[#233d73] rounded-lg flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            <span>Tutup</span>
          </button>
        </div>
      </div>

      {/* E-Book Desk & Pages Stage */}
      <div
        className={`relative flex-1 overflow-auto bg-[radial-gradient(circle_at_top,#10234d_0%,#050d20_75%)] p-4 sm:p-6 ${
          isFullscreen ? 'min-h-0' : 'min-h-[540px] max-h-[780px]'
        }`}
      >
        {loading ? (
          <div className="h-[460px] flex flex-col items-center justify-center gap-3 text-slate-300">
            <Loader2 className="w-8 h-8 animate-spin text-[#f0cb63]" />
            <p className="text-sm font-medium">Menyediakan paparan E-Book...</p>
          </div>
        ) : errorMsg ? (
          <div className="h-[360px] flex flex-col items-center justify-center gap-3 text-center px-4">
            <p className="text-sm text-red-300">{errorMsg}</p>
            <button
              type="button"
              onClick={onDownload}
              className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Muat Turun Fail Asal</span>
            </button>
          </div>
        ) : isLegacyDoc ? (
          <div className="max-w-lg mx-auto my-8 bg-[#fdfbf6] text-slate-800 rounded-lg border border-[#d9cfb8] shadow-2xl p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#e5b94c]/20 text-[#8a6510] flex items-center justify-center mx-auto">
              <FileIcon className="w-6 h-6" />
            </div>
            <h5 className="text-base font-bold text-[#0b1733] font-serif">{file.originalName}</h5>
            <p className="text-xs text-slate-600 leading-relaxed">
              Fail format lama <span className="font-mono font-semibold">.DOC</span> tidak menyokong pemaparan halaman E-Book secara terus di pelayar. Sila muat turun dokumen ini atau muat naik versi{' '}
              <span className="font-mono font-semibold">.PDF</span> atau{' '}
              <span className="font-mono font-semibold">.DOCX</span> untuk bacaan E-Book interaktif.
            </p>
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg"
            >
              <Download className="w-4 h-4" />
              <span>Muat Turun Dokumen .DOC</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 sm:gap-4 min-h-full">
            <button
              type="button"
              onClick={goPrev}
              disabled={!canGoPrev}
              aria-label="Halaman sebelum"
              className="hidden sm:flex sticky top-1/2 -translate-y-1/2 items-center justify-center w-10 h-14 rounded-xl bg-[#0b1733]/90 border border-[#2a4a8a] text-[#f0cb63] hover:bg-[#17356e] disabled:opacity-25 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Open Book Spread Container */}
            <div
              className={`relative flex items-stretch justify-center ${
                effectiveSpread && visiblePages.length === 2
                  ? 'flex-col lg:flex-row gap-4 lg:gap-1 p-2 sm:p-3 rounded-xl bg-[#0e1b38]/80 border border-[#243d70] shadow-[0_24px_60px_rgba(0,0,0,0.65)]'
                  : 'p-1'
              }`}
            >
              {visiblePages.map((pgNum, idx) => (
                <React.Fragment key={pgNum}>
                  {idx === 1 && effectiveSpread && (
                    <div
                      aria-hidden="true"
                      className="hidden lg:block w-2 self-stretch bg-gradient-to-r from-black/35 via-[#b8aa8f]/40 to-black/35 rounded-sm shrink-0"
                    />
                  )}
                  {isPdf && pdfDoc ? (
                    <PdfCanvasPage pdfDoc={pdfDoc} pageNumber={pgNum} zoom={zoom} />
                  ) : (
                    <DocxBookPage
                      blocks={docxPages[pgNum - 1] || []}
                      pageNumber={pgNum}
                      totalPages={totalPages}
                      zoom={zoom}
                      bookTitle={bookTitle || file.originalName}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>

            <button
              type="button"
              onClick={goNext}
              disabled={!canGoNext}
              aria-label="Halaman seterusnya"
              className="hidden sm:flex sticky top-1/2 -translate-y-1/2 items-center justify-center w-10 h-14 rounded-xl bg-[#0b1733]/90 border border-[#2a4a8a] text-[#f0cb63] hover:bg-[#17356e] disabled:opacity-25 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Bottom Page Turn Bar */}
      {!loading && !errorMsg && !isLegacyDoc && (
        <div className="bg-[#0b1733] border-t border-[#1d3464] px-4 py-2.5 space-y-2">
          <div className="w-full h-1 bg-[#071024] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#e5b94c] transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={goPrev}
              disabled={!canGoPrev}
              className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] disabled:opacity-35 rounded-lg flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Sebelum</span>
            </button>

            <form onSubmit={handlePageJumpSubmit} className="flex items-center gap-2 text-xs text-slate-300">
              <span>Muka</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={handlePageJumpSubmit}
                aria-label="Nombor halaman"
                className="w-14 px-2 py-1 text-center font-mono text-xs bg-[#071024] border border-[#263f73] rounded text-white focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
              />
              <span className="font-mono text-slate-400">
                {visiblePages.length === 2 ? `(${visiblePages[0]}-${visiblePages[1]}) ` : ''}
                daripada {totalPages}
              </span>
            </form>

            <button
              type="button"
              onClick={goNext}
              disabled={!canGoNext}
              className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] disabled:opacity-35 rounded-lg flex items-center gap-1"
            >
              <span>Seterusnya</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

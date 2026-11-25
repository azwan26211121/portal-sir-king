import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Download, Eye, FileText, FolderOpen, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import type { FileMetadata, FileSlotType } from '../types.ts';
import { TeoriEbookReader } from './TeoriEbookReader.tsx';

interface DocumentSlotCardProps {
  token: string;
  cuId: string;
  slotType: FileSlotType;
  folderLabel: string;
  slotTitle: string;
  slotDescription: string;
  file: FileMetadata | null;
  canEdit: boolean;
  viewerMode?: 'standard' | 'ebook';
  onUpdated: () => Promise<void>;
  onAccessed?: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DocumentSlotCard({
  token,
  cuId,
  slotType,
  folderLabel,
  slotTitle,
  slotDescription,
  file,
  canEdit,
  viewerMode = 'standard',
  onUpdated,
  onAccessed,
}: DocumentSlotCardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ebookOpen, setEbookOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    // Reset preview / e-book when CU or file changes
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setEbookOpen(false);
    setConfirmDelete(false);
    setErrorMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuId, file?.id]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      await api.uploadSlotFile(token, cuId, slotType, selected);
      await onUpdated();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Muat naik gagal.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleDelete() {
    setErrorMsg(null);
    setBusy(true);
    try {
      await api.deleteSlotFile(token, cuId, slotType);
      setConfirmDelete(false);
      await onUpdated();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal memadam fail.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (!file) return;
    setErrorMsg(null);
    try {
      const blob = await api.fetchProtectedFileBlob(token, file.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.originalName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      onAccessed?.();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal memuat turun dokumen.');
    }
  }

  async function handleTogglePreview() {
    if (!file) return;
    if (viewerMode === 'ebook') {
      const next = !ebookOpen;
      setEbookOpen(next);
      if (next) {
        onAccessed?.();
      }
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    setErrorMsg(null);
    setLoadingPreview(true);
    try {
      const blob = await api.fetchProtectedFileBlob(token, file.id);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      onAccessed?.();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal membuka pratonton PDF.');
    } finally {
      setLoadingPreview(false);
    }
  }

  const showViewerToggle = Boolean(file) && (viewerMode === 'ebook' || file?.extension === '.pdf');

  return (
    <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5 text-[#f0cb63]" />
            <span>{folderLabel}</span>
          </p>
          <h3 className="mt-1.5 text-base font-semibold text-white">{slotTitle}</h3>
          <p className="mt-1 text-sm text-slate-300">{slotDescription}</p>
        </div>

        <div className="text-xs font-medium shrink-0">
          {file ? (
            <span className="text-emerald-400">
              {viewerMode === 'ebook'
                ? `E-Book Sedia (${file.extension.toUpperCase()})`
                : `Fail Tersedia (${file.extension.toUpperCase()})`}
            </span>
          ) : (
            <span className="text-slate-400">Slot Kosong (Lalai)</span>
          )}
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="mt-4 p-3 rounded-lg bg-red-950/60 border border-red-800/70 text-xs text-red-300">
          {errorMsg}
        </div>
      )}

      {file ? (
        <div className="mt-5 pt-5 border-t border-[#1a2f5c]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2.5 rounded-lg bg-[#102045] border border-[#233d73] text-[#f0cb63] shrink-0">
                {viewerMode === 'ebook' ? (
                  <BookOpen className="w-5 h-5" />
                ) : (
                  <FileText className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{file.originalName}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                  <span>{formatFileSize(file.sizeBytes)}</span>
                  <span aria-hidden="true">·</span>
                  <span>Dimuat naik oleh {file.uploadedByName}</span>
                  <span aria-hidden="true">·</span>
                  <span>{new Date(file.uploadedAt).toLocaleDateString('ms-MY')}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {showViewerToggle && (
                <button
                  type="button"
                  onClick={handleTogglePreview}
                  disabled={loadingPreview}
                  className={
                    viewerMode === 'ebook'
                      ? 'px-3.5 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap'
                      : 'px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] rounded-lg hover:bg-[#172e61] transition-colors flex items-center gap-1.5 whitespace-nowrap'
                  }
                >
                  {viewerMode === 'ebook' ? (
                    ebookOpen ? (
                      <>
                        <X className="w-3.5 h-3.5" />
                        <span>Tutup E-Book</span>
                      </>
                    ) : (
                      <>
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Baca E-Book</span>
                      </>
                    )
                  ) : (
                    <>
                      {previewUrl ? <X className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>
                        {loadingPreview
                          ? 'Membuka...'
                          : previewUrl
                          ? 'Tutup Pratonton'
                          : 'Pratonton PDF'}
                      </span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={handleDownload}
                className={
                  viewerMode === 'ebook'
                    ? 'px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap'
                    : 'px-3.5 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap'
                }
              >
                <Download className="w-3.5 h-3.5" />
                <span>Muat Turun</span>
              </button>

              {canEdit && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] rounded-lg hover:bg-[#172e61] transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{busy ? 'Memproses...' : 'Ganti Fail'}</span>
                  </button>

                  {!confirmDelete ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDelete(true)}
                      className="px-3 py-2 text-xs font-medium text-red-300 bg-red-950/50 border border-red-800/60 rounded-lg hover:bg-red-900/60 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Padam</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleDelete}
                        className="px-3 py-2 text-xs font-medium text-white bg-red-700 hover:bg-red-600 rounded-lg whitespace-nowrap"
                      >
                        Sahkan Padam
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="px-2.5 py-2 text-xs font-medium text-slate-300 hover:text-white whitespace-nowrap"
                      >
                        Batal
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {viewerMode === 'ebook' && ebookOpen && (
            <TeoriEbookReader
              token={token}
              file={file}
              bookTitle={file.originalName}
              folderLabel={folderLabel}
              onClose={() => setEbookOpen(false)}
              onDownload={handleDownload}
            />
          )}

          {viewerMode === 'standard' && previewUrl && file.extension === '.pdf' && (
            <div className="mt-5 border border-[#263f73] rounded-lg overflow-hidden bg-slate-900">
              <iframe
                src={previewUrl}
                title={`Pratonton ${file.originalName}`}
                className="w-full h-[540px]"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 pt-5 border-t border-[#1a2f5c] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-sm text-slate-400">
            Ruang dokumen ini dikosongkan secara lalai sehingga fail rasmi{' '}
            <span className="font-mono text-xs text-slate-200">.pdf</span>,{' '}
            <span className="font-mono text-xs text-slate-200">.doc</span>, atau{' '}
            <span className="font-mono text-xs text-slate-200">.docx</span> dimuat naik.
          </p>

          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{busy ? 'Memuat Naik...' : 'Muat Naik Word / PDF'}</span>
            </button>
          )}
        </div>
      )}

      {canEdit && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileSelect}
          className="hidden"
        />
      )}
    </div>
  );
}

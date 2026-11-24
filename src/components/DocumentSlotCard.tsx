import React, { useEffect, useRef, useState } from 'react';
import { Download, Eye, FileText, FolderOpen, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import type { FileMetadata, FileSlotType } from '../types.ts';

interface DocumentSlotCardProps {
  token: string;
  cuId: string;
  slotType: FileSlotType;
  folderLabel: string;
  slotTitle: string;
  slotDescription: string;
  file: FileMetadata | null;
  canEdit: boolean;
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
  onUpdated,
  onAccessed,
}: DocumentSlotCardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    // Reset preview when CU or file changes
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
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

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-slate-500 flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
            <span>{folderLabel}</span>
          </p>
          <h3 className="mt-1.5 text-base font-semibold text-slate-900">{slotTitle}</h3>
          <p className="mt-1 text-sm text-slate-600">{slotDescription}</p>
        </div>

        <div className="text-xs font-medium shrink-0">
          {file ? (
            <span className="text-emerald-700">Fail Tersedia ({file.extension.toUpperCase()})</span>
          ) : (
            <span className="text-slate-500">Slot Kosong (Lalai)</span>
          )}
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
          {errorMsg}
        </div>
      )}

      {file ? (
        <div className="mt-5 pt-5 border-t border-slate-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2.5 rounded-lg bg-slate-100 text-slate-700 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{file.originalName}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                  <span>{formatFileSize(file.sizeBytes)}</span>
                  <span aria-hidden="true">·</span>
                  <span>Dimuat naik oleh {file.uploadedByName}</span>
                  <span aria-hidden="true">·</span>
                  <span>{new Date(file.uploadedAt).toLocaleDateString('ms-MY')}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {file.extension === '.pdf' && (
                <button
                  type="button"
                  onClick={handleTogglePreview}
                  disabled={loadingPreview}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                >
                  {previewUrl ? <X className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>
                    {loadingPreview
                      ? 'Membuka...'
                      : previewUrl
                      ? 'Tutup Pratonton'
                      : 'Pratonton PDF'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDownload}
                className="px-3.5 py-2 text-xs font-medium text-white bg-[#0a2e6c] hover:bg-[#061b44] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
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
                    className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{busy ? 'Memproses...' : 'Ganti Fail'}</span>
                  </button>

                  {!confirmDelete ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDelete(true)}
                      className="px-3 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
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
                        className="px-3 py-2 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg whitespace-nowrap"
                      >
                        Sahkan Padam
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="px-2.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                      >
                        Batal
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {previewUrl && file.extension === '.pdf' && (
            <div className="mt-5 border border-slate-200 rounded-lg overflow-hidden bg-slate-100">
              <iframe
                src={previewUrl}
                title={`Pratonton ${file.originalName}`}
                className="w-full h-[540px]"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 pt-5 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            Ruang dokumen ini dikosongkan secara lalai sehingga fail rasmi{' '}
            <span className="font-mono text-xs text-slate-700">.pdf</span>,{' '}
            <span className="font-mono text-xs text-slate-700">.doc</span>, atau{' '}
            <span className="font-mono text-xs text-slate-700">.docx</span> dimuat naik.
          </p>

          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
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

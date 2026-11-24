import React, { useEffect, useRef, useState } from 'react';
import {
  Edit3,
  ExternalLink,
  Maximize2,
  MessageCircle,
  QrCode,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import type { BrandingConfig } from '../types.ts';

type QrKind = 'payment-qr' | 'whatsapp-qr';

interface PortalQrFooterProps {
  branding: BrandingConfig;
  canEdit?: boolean;
  token?: string | null;
  onBrandingUpdated?: (branding: BrandingConfig) => void;
}

export function PortalQrFooter({
  branding,
  canEdit = false,
  token = null,
  onBrandingUpdated,
}: PortalQrFooterProps) {
  const [zoomKind, setZoomKind] = useState<QrKind | null>(null);
  const [editKind, setEditKind] = useState<QrKind | null>(null);

  const [titleInput, setTitleInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [whatsappUrlInput, setWhatsappUrlInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editKind === 'payment-qr') {
      setTitleInput(branding.paymentQrTitle);
      setNoteInput(branding.paymentQrNote);
    } else if (editKind === 'whatsapp-qr') {
      setTitleInput(branding.whatsappQrTitle);
      setNoteInput(branding.whatsappQrNote);
      setWhatsappUrlInput(branding.whatsappUrl || '');
    }
  }, [
    editKind,
    branding.paymentQrTitle,
    branding.paymentQrNote,
    branding.whatsappQrTitle,
    branding.whatsappQrNote,
    branding.whatsappUrl,
  ]);

  function openEditor(kind: QrKind) {
    setStatusMsg(null);
    setEditKind(kind);
  }

  async function handleUploadQr(kind: QrKind, file: File) {
    if (!token || !onBrandingUpdated) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await api.uploadBrandingImage(token, kind, file);
      onBrandingUpdated(res.branding);
      setStatusMsg({
        type: 'ok',
        text:
          kind === 'payment-qr'
            ? 'Imej QR Pembayaran berjaya dimuat naik.'
            : 'Imej QR WhatsApp berjaya dimuat naik.',
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal memuat naik imej QR.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteQr(kind: QrKind) {
    if (!token || !onBrandingUpdated) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await api.resetBrandingImage(token, kind);
      onBrandingUpdated(res.branding);
      setStatusMsg({
        type: 'ok',
        text:
          kind === 'payment-qr'
            ? 'Imej QR Pembayaran telah dipadam.'
            : 'Imej QR WhatsApp telah dipadam.',
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal memadam imej QR.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !onBrandingUpdated || !editKind) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await api.updateBrandingText(
        token,
        editKind === 'payment-qr'
          ? {
              paymentQrTitle: titleInput,
              paymentQrNote: noteInput,
            }
          : {
              whatsappQrTitle: titleInput,
              whatsappQrNote: noteInput,
              whatsappUrl: whatsappUrlInput,
            }
      );
      onBrandingUpdated(res.branding);
      setStatusMsg({
        type: 'ok',
        text:
          editKind === 'payment-qr'
            ? 'Maklumat QR Pembayaran berjaya dikemas kini.'
            : 'Maklumat QR WhatsApp berjaya dikemas kini.',
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal menyimpan maklumat QR.',
      });
    } finally {
      setBusy(false);
    }
  }

  const zoomData =
    zoomKind === 'payment-qr'
      ? {
          url: branding.paymentQrUrl,
          title: branding.paymentQrTitle || 'QR Pembayaran',
          note: branding.paymentQrNote,
          linkUrl: '',
        }
      : zoomKind === 'whatsapp-qr'
      ? {
          url: branding.whatsappQrUrl,
          title: branding.whatsappQrTitle || 'QR WhatsApp',
          note: branding.whatsappQrNote,
          linkUrl: branding.whatsappUrl,
        }
      : null;

  const editImageUrl =
    editKind === 'payment-qr'
      ? branding.paymentQrUrl
      : editKind === 'whatsapp-qr'
      ? branding.whatsappQrUrl
      : null;

  return (
    <>
      {/* Persistent Bottom Website QR Footer on Every Page */}
      <footer className="bg-[#041029]/95 border-t border-[#1c366b] mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-200">{branding.portalName}</span>
            <span>{branding.footerCaption}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1: QR Pembayaran */}
            <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-4 flex items-center gap-4">
              {branding.paymentQrUrl ? (
                <button
                  type="button"
                  onClick={() => setZoomKind('payment-qr')}
                  className="w-20 h-20 sm:w-24 sm:h-24 bg-white p-1.5 rounded-lg border border-[#263f73] hover:ring-2 hover:ring-[#e5b94c] transition-all shrink-0 block"
                  title="Klik untuk besarkan QR Pembayaran"
                >
                  <img
                    src={branding.paymentQrUrl}
                    alt={branding.paymentQrTitle || 'QR Pembayaran'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </button>
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg border border-dashed border-[#263f73] bg-[#071024] flex flex-col items-center justify-center p-2 text-center shrink-0">
                  <QrCode className="w-6 h-6 text-slate-500 mb-1" />
                  <span className="text-[10px] text-slate-400 leading-tight">Belum dimuat naik</span>
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-[#f0cb63] shrink-0" />
                  <h3 className="text-sm font-bold text-[#f0cb63] truncate">
                    {branding.paymentQrTitle || 'QR Pembayaran'}
                  </h3>
                </div>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed line-clamp-2">
                  {branding.paymentQrNote || 'Imbas QR untuk bayaran rasmi portal.'}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {branding.paymentQrUrl && (
                    <button
                      type="button"
                      onClick={() => setZoomKind('payment-qr')}
                      className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#102045] hover:bg-[#172e61] border border-[#263f73] rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Besarkan</span>
                    </button>
                  )}

                  {canEdit && token && onBrandingUpdated && (
                    <button
                      type="button"
                      onClick={() => openEditor('payment-qr')}
                      className="px-3 py-1.5 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit QR</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Card 2: QR WhatsApp */}
            <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-4 flex items-center gap-4">
              {branding.whatsappQrUrl ? (
                <button
                  type="button"
                  onClick={() => setZoomKind('whatsapp-qr')}
                  className="w-20 h-20 sm:w-24 sm:h-24 bg-white p-1.5 rounded-lg border border-[#263f73] hover:ring-2 hover:ring-emerald-400 transition-all shrink-0 block"
                  title="Klik untuk besarkan QR WhatsApp"
                >
                  <img
                    src={branding.whatsappQrUrl}
                    alt={branding.whatsappQrTitle || 'QR WhatsApp'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </button>
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg border border-dashed border-[#263f73] bg-[#071024] flex flex-col items-center justify-center p-2 text-center shrink-0">
                  <MessageCircle className="w-6 h-6 text-emerald-500/60 mb-1" />
                  <span className="text-[10px] text-slate-400 leading-tight">Belum dimuat naik</span>
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <h3 className="text-sm font-bold text-emerald-300 truncate">
                    {branding.whatsappQrTitle || 'QR WhatsApp'}
                  </h3>
                </div>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed line-clamp-2">
                  {branding.whatsappQrNote || 'Imbas QR untuk hubungi kami di WhatsApp.'}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {branding.whatsappQrUrl && (
                    <button
                      type="button"
                      onClick={() => setZoomKind('whatsapp-qr')}
                      className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#102045] hover:bg-[#172e61] border border-[#263f73] rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Besarkan</span>
                    </button>
                  )}

                  {branding.whatsappUrl && (
                    <a
                      href={branding.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-700/60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Buka WhatsApp</span>
                    </a>
                  )}

                  {canEdit && token && onBrandingUpdated && (
                    <button
                      type="button"
                      onClick={() => openEditor('whatsapp-qr')}
                      className="px-3 py-1.5 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit QR</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Enlarge / Scan Modal */}
      {zoomKind && zoomData && zoomData.url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-zoom-title"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setZoomKind(null)}
        >
          <div
            className="w-full max-w-sm bg-[#0b1733] border border-[#e5b94c]/60 rounded-2xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="qr-zoom-title" className="text-base font-bold text-white">
                  {zoomData.title}
                </h3>
                {zoomData.note && (
                  <p className="mt-1 text-xs text-slate-300">{zoomData.note}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setZoomKind(null)}
                aria-label="Tutup paparan QR"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-white p-3 rounded-xl border border-[#263f73] flex items-center justify-center">
              <img
                src={zoomData.url}
                alt={zoomData.title}
                referrerPolicy="no-referrer"
                className="w-64 h-64 sm:w-72 sm:h-72 object-contain"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {zoomData.linkUrl && (
                <a
                  href={zoomData.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 text-xs font-medium text-emerald-300 bg-emerald-950/60 border border-emerald-700/60 hover:bg-emerald-900/60 rounded-lg inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka WhatsApp</span>
                </a>
              )}
              {canEdit && token && onBrandingUpdated && (
                <button
                  type="button"
                  onClick={() => {
                    const current = zoomKind;
                    setZoomKind(null);
                    openEditor(current);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg inline-flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit QR</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setZoomKind(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#102045] hover:bg-[#172e61] border border-[#263f73] rounded-lg"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Quick Edit QR Modal */}
      {editKind && canEdit && token && onBrandingUpdated && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-edit-title"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setEditKind(null)}
        >
          <div
            className="w-full max-w-md bg-[#0b1733] border border-[#1a2f5c] rounded-2xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#1a2f5c]">
              <div>
                <h3 id="qr-edit-title" className="text-base font-bold text-white flex items-center gap-2">
                  {editKind === 'payment-qr' ? (
                    <QrCode className="w-4 h-4 text-[#f0cb63]" />
                  ) : (
                    <MessageCircle className="w-4 h-4 text-emerald-400" />
                  )}
                  <span>
                    {editKind === 'payment-qr' ? 'Edit QR Pembayaran' : 'Edit QR WhatsApp'}
                  </span>
                </h3>
                <p className="mt-1 text-xs text-slate-300">
                  {editKind === 'payment-qr'
                    ? 'Muat naik gambar QR DuitNow / Bank dan kemas kini tajuk serta nota pembayaran.'
                    : 'Muat naik gambar QR WhatsApp serta kemas kini tajuk, nota dan pautan WhatsApp (pilihan).'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditKind(null)}
                aria-label="Tutup editor QR"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {statusMsg && (
              <div
                role="status"
                className={`p-3 rounded-lg text-xs border ${
                  statusMsg.type === 'ok'
                    ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                    : 'bg-red-950/60 border-red-800/70 text-red-300'
                }`}
              >
                {statusMsg.text}
              </div>
            )}

            <div className="p-4 rounded-xl bg-[#071024] border border-[#1a2f5c] flex items-center gap-4">
              {editImageUrl ? (
                <div className="w-24 h-24 rounded-lg bg-white p-1.5 border border-[#263f73] shrink-0">
                  <img
                    src={editImageUrl}
                    alt={editKind === 'payment-qr' ? 'Pratonton QR Pembayaran' : 'Pratonton QR WhatsApp'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-24 h-24 rounded-lg border border-dashed border-[#263f73] bg-[#0b1733] flex items-center justify-center shrink-0">
                  {editKind === 'payment-qr' ? (
                    <QrCode className="w-7 h-7 text-slate-500" />
                  ) : (
                    <MessageCircle className="w-7 h-7 text-slate-500" />
                  )}
                </div>
              )}

              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && editKind) {
                      handleUploadQr(editKind, file);
                    }
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{busy ? 'Memuat naik...' : editImageUrl ? 'Tukar Imej QR' : 'Muat Naik QR'}</span>
                </button>

                {editImageUrl && (
                  <div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDeleteQr(editKind)}
                      className="px-3 py-1.5 text-xs font-medium text-red-300 bg-red-950/50 border border-red-800/60 hover:bg-red-900/60 rounded-lg inline-flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Padam Imej QR</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={handleSaveMeta} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {editKind === 'payment-qr' ? 'Tajuk QR Pembayaran' : 'Tajuk QR WhatsApp'}
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder={editKind === 'payment-qr' ? 'QR Pembayaran' : 'QR WhatsApp'}
                  className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {editKind === 'payment-qr' ? 'Nota / Nama Penerima Pembayaran' : 'Nota / Keterangan WhatsApp'}
                </label>
                <input
                  type="text"
                  maxLength={160}
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder={
                    editKind === 'payment-qr'
                      ? 'Imbas QR untuk bayaran rasmi portal.'
                      : 'Imbas QR untuk hubungi kami di WhatsApp.'
                  }
                  className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                />
              </div>

              {editKind === 'whatsapp-qr' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Pautan WhatsApp Terus (Pilihan · HTTPS)
                  </label>
                  <input
                    type="url"
                    maxLength={240}
                    value={whatsappUrlInput}
                    onChange={(e) => setWhatsappUrlInput(e.target.value)}
                    placeholder="https://wa.me/60123456789"
                    className="w-full px-3 py-2 text-sm font-mono border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditKind(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{busy ? 'Menyimpan...' : 'Simpan Maklumat QR'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

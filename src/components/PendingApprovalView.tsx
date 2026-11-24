import React, { useState } from 'react';
import { Clock, LogOut, RefreshCw, XCircle } from 'lucide-react';
import type { BrandingConfig, PublicUser } from '../types.ts';
import { PortalQrFooter } from './PortalQrFooter.tsx';

interface PendingApprovalViewProps {
  branding: BrandingConfig;
  user: PublicUser;
  onRefresh: () => Promise<void>;
  onLogout: () => void;
}

export function PendingApprovalView({
  branding,
  user,
  onRefresh,
  onLogout,
}: PendingApprovalViewProps) {
  const [checking, setChecking] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  async function handleCheck() {
    setChecking(true);
    try {
      await onRefresh();
    } finally {
      setChecking(false);
    }
  }

  const isRejected = user.status === 'rejected';

  return (
    <div className="min-h-screen bg-[#060d1f] text-slate-100 flex flex-col">
      <header className="bg-[#041029]/95 border-b border-[#1c366b] px-6 py-3.5 flex items-center justify-between gap-8">
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          {!logoFailed ? (
            <img
              src={branding.logoUrl}
              alt={`Logo ${branding.portalName}`}
              referrerPolicy="no-referrer"
              onError={() => setLogoFailed(true)}
              className="w-9 h-9 rounded-full bg-white object-cover border border-[#e5b94c]"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-white text-[#061b44] font-bold text-xs flex items-center justify-center border border-[#e5b94c]">
              SK
            </div>
          )}
          <span className="text-lg font-bold tracking-tight text-white font-display">
            {branding.portalName}
          </span>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm text-slate-300">
          <span className="whitespace-nowrap shrink-0">Status Pendaftaran Pelatih</span>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Log Keluar</span>
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-xl bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-8">
          <div className="flex items-start gap-4">
            <div
              className={`p-3 rounded-lg shrink-0 ${
                isRejected
                  ? 'bg-red-950/60 border border-red-800/60 text-red-300'
                  : 'bg-amber-950/60 border border-amber-700/60 text-amber-300'
              }`}
            >
              {isRejected ? <XCircle className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">
                {isRejected
                  ? 'Permohonan Akses Pelatih Tidak Diluluskan'
                  : branding.pendingTitle}
              </h1>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                {isRejected
                  ? 'Permohonan pendaftaran anda ditandakan sebagai tidak diluluskan. Sila berhubung dengan pengajar penyelia atau admin website untuk semakan semula.'
                  : branding.pendingMessage}
              </p>
            </div>
          </div>

          <div className="mt-8 border-t border-[#1a2f5c] pt-6 grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-400">Nama Pelatih &amp; User ID</p>
              <p className="mt-1 font-medium text-white">{user.name}</p>
              <p className="mt-0.5 text-xs font-mono text-[#f0cb63]">User ID: {user.userId}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Nama Guru Penyelia</p>
              <p className="mt-1 font-medium text-white">
                {user.supervisorName || 'Pentadbir Utama'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Status Semasa</p>
              <p
                className={`mt-1 font-medium ${
                  isRejected ? 'text-red-400' : 'text-amber-400'
                }`}
              >
                {isRejected ? 'Ditolak' : 'Menunggu Kelulusan (Pending)'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Tarikh Daftar</p>
              <p className="mt-1 font-mono text-xs text-slate-300 tabular-nums">
                {new Date(user.createdAt).toLocaleString('ms-MY')}
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCheck}
              disabled={checking}
              className="px-4 py-2.5 bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 text-[#041434] text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              <span>{checking ? 'Menyemak...' : 'Semak Status Kelulusan'}</span>
            </button>
          </div>
        </div>
      </main>

      <PortalQrFooter branding={branding} />
    </div>
  );
}

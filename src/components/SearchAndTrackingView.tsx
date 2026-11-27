import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CloudUpload,
  ExternalLink,
  FileText,
  FolderOpen,
  RefreshCw,
  Search,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import {
  buildTraineeFolderName,
  buildTrainingSummaryReportBlob,
  type DriveFileResult,
  type HierarchicalDriveFolderResult,
  getGoogleDriveAccessToken,
  getGoogleWorkspaceUser,
  initGoogleWorkspaceAuth,
  listFilesInDriveFolder,
  resolveHierarchicalTraineeDriveFolder,
  signInWithGoogleDrive,
  signOutGoogleWorkspace,
  uploadFileToDriveFolder,
} from '../lib/googleDrive.ts';
import { GoogleSignInButton } from './GoogleSignInButton.tsx';
import type {
  AccessLogEntry,
  BrandingConfig,
  CUModule,
  LearningSection,
  PublicUser,
  SopCheckProgress,
  TopicLevel,
  TugasanPaper,
  TugasanSubmission,
} from '../types.ts';

interface SearchAndTrackingViewProps {
  token: string;
  user: PublicUser;
  branding: BrandingConfig;
  levels: TopicLevel[];
  cus: CUModule[];
  sopProgress?: SopCheckProgress[];
  accessLogs: AccessLogEntry[];
  tugasanPapers?: TugasanPaper[];
  tugasanSubmissions?: TugasanSubmission[];
  onNavigateToCu: (levelId: string, section: LearningSection, cuId: string) => void;
  onRefreshWorkspace?: () => Promise<void>;
}

const ACTION_LABELS: Record<AccessLogEntry['action'], string> = {
  view_nota: 'Buka Nota Pembelajaran (E-Book)',
  view_panduan: 'Buka Panduan Soalan (E-Book)',
  open_drive: 'Buka Folder Google Drive',
  open_form: 'Akses Latihan Google Form',
  view_sop: 'Semak SOP Bengkel',
  complete_sop: 'Lengkap Senarai Semak SOP',
  submit_tugasan: 'Hantar Kertas Tugasan (Penandaan AI)',
  print_tugasan: 'Cetak Kertas Tugasan (Lulus)',
  sync_drive: 'Simpan Rekod Latihan ke Google Drive',
};

export function SearchAndTrackingView({
  token,
  user,
  branding,
  levels,
  cus,
  sopProgress = [],
  accessLogs,
  tugasanPapers = [],
  tugasanSubmissions = [],
  onNavigateToCu,
  onRefreshWorkspace,
}: SearchAndTrackingViewProps) {
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'incomplete' | 'ready'>('all');

  const [driveConnected, setDriveConnected] = useState(() => Boolean(getGoogleDriveAccessToken()));
  const [googleEmail, setGoogleEmail] = useState<string | null>(
    () => getGoogleWorkspaceUser()?.email || null
  );
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveNotice, setDriveNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [traineeFolder, setTraineeFolder] = useState<HierarchicalDriveFolderResult | null>(null);
  const [folderFiles, setFolderFiles] = useState<DriveFileResult[]>([]);

  useEffect(() => {
    const unsub = initGoogleWorkspaceAuth(
      (gUser) => {
        setDriveConnected(true);
        setGoogleEmail(gUser.email || gUser.displayName || 'Akaun Google');
      },
      () => {
        setDriveConnected(Boolean(getGoogleDriveAccessToken()));
        if (!getGoogleDriveAccessToken()) setGoogleEmail(null);
      }
    );
    return unsub;
  }, []);

  const targetFolderLabel = buildTraineeFolderName(user.icNumber, user.userId);

  async function ensureConnectedToken(): Promise<string> {
    const existing = getGoogleDriveAccessToken();
    if (existing) return existing;
    const signed = await signInWithGoogleDrive();
    setDriveConnected(true);
    setGoogleEmail(signed.user.email || signed.user.displayName || 'Akaun Google');
    return signed.accessToken;
  }

  const supervisorLabel =
    user.supervisorName || (user.role === 'pengajar' ? user.name : 'PENTADBIR UTAMA');

  async function handleConnectAndLoadFolder() {
    setDriveBusy(true);
    setDriveNotice(null);
    try {
      const accessToken = await ensureConnectedToken();
      const folder = await resolveHierarchicalTraineeDriveFolder(
        accessToken,
        branding.driveRecordsFolderId,
        supervisorLabel,
        user.icNumber,
        user.userId,
        user.name
      );
      setTraineeFolder(folder);
      const files = await listFilesInDriveFolder(accessToken, folder.id);
      setFolderFiles(files);
      setDriveNotice({
        type: 'ok',
        text: folder.created
          ? `Folder baharu (${folder.pathLabel}) dicipta di Google Drive.`
          : `Folder sedia ada (${folder.pathLabel}) dipautkan (${files.length} fail ditemui).`,
      });
    } catch (err) {
      setDriveNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menyambung ke folder Google Drive.',
      });
    } finally {
      setDriveBusy(false);
    }
  }

  async function handleGenerateAndUploadSummary() {
    setDriveBusy(true);
    setDriveNotice(null);
    try {
      const accessToken = await ensureConnectedToken();
      const folder = await resolveHierarchicalTraineeDriveFolder(
        accessToken,
        branding.driveRecordsFolderId,
        supervisorLabel,
        user.icNumber,
        user.userId,
        user.name
      );
      setTraineeFolder(folder);

      const userSubs = tugasanSubmissions.filter((s) => s.userId === user.id);
      const userSop = sopProgress.filter((p) => p.userId === user.id);
      const userLogs = accessLogs.filter((l) => l.userId === user.id);

      const reportBlob = buildTrainingSummaryReportBlob({
        collegeName: branding.collegeName,
        collegeAddress: branding.collegeAddress,
        traineeName: user.name,
        traineeIc: user.icNumber || '-',
        traineeCodeId: user.userId,
        levels,
        cus,
        papers: tugasanPapers,
        submissions: userSubs,
        sopProgress: userSop,
        accessLogs: userLogs,
      });

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `Rekod-Latihan-${targetFolderLabel}-${stamp}.html`;
      const uploaded = await uploadFileToDriveFolder(
        accessToken,
        folder.id,
        fileName,
        'text/html',
        reportBlob
      );

      if (cus[0]) {
        await api.logAccess(token, cus[0].id, 'sync_drive').catch(() => {});
      }
      if (onRefreshWorkspace) {
        await onRefreshWorkspace();
      }
      const files = await listFilesInDriveFolder(accessToken, folder.id);
      setFolderFiles(files);
      setDriveNotice({
        type: 'ok',
        text: `Rekod Latihan Lengkap (${uploaded.name}) berjaya dijana dan disimpan dalam folder (${folder.pathLabel}).`,
      });
    } catch (err) {
      setDriveNotice({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Gagal menjana atau memuat naik rekod latihan ke Google Drive.',
      });
    } finally {
      setDriveBusy(false);
    }
  }

  async function handleDisconnectDrive() {
    await signOutGoogleWorkspace().catch(() => {});
    setDriveConnected(false);
    setGoogleEmail(null);
    setTraineeFolder(null);
    setFolderFiles([]);
  }

  const levelMap = useMemo(() => {
    const map = new Map<string, TopicLevel>();
    for (const l of levels) map.set(l.id, l);
    return map;
  }, [levels]);

  const filteredCUs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cus.filter((cu) => {
      const teoriReady =
        Boolean(cu.teoriSub1.notaSlot) &&
        Boolean(cu.teoriSub1.panduanSoalanSlot) &&
        Boolean(cu.teoriSub2.notaSlot) &&
        Boolean(cu.teoriSub2.panduanSoalanSlot);
      const formReady =
        Boolean(cu.teoriSub1.googleFormUrl) && Boolean(cu.teoriSub2.googleFormUrl);
      const amaliReady =
        (Boolean(cu.amaliSub1.sopDocSlot) || cu.amaliSub1.sopSteps.length > 0) &&
        (Boolean(cu.amaliSub2.sopDocSlot) || cu.amaliSub2.sopSteps.length > 0);
      const allReady = teoriReady && formReady && amaliReady;

      if (filterMode === 'ready' && !allReady) return false;
      if (filterMode === 'incomplete' && allReady) return false;

      if (!q) return true;
      const lvl = levelMap.get(cu.levelId);
      const haystack = [
        lvl?.code || '',
        lvl?.title || '',
        cu.code,
        cu.title,
        cu.description,
        cu.teoriSub1.notaSlot?.originalName || '',
        cu.teoriSub1.panduanSoalanSlot?.originalName || '',
        cu.teoriSub1.googleDriveTitle || '',
        cu.teoriSub1.googleFormTitle,
        cu.teoriSub2.notaSlot?.originalName || '',
        cu.teoriSub2.panduanSoalanSlot?.originalName || '',
        cu.teoriSub2.googleDriveTitle || '',
        cu.teoriSub2.googleFormTitle,
        cu.amaliSub1.sopDocSlot?.originalName || '',
        cu.amaliSub2.sopDocSlot?.originalName || '',
        ...(cu.ebookModules || []).map((m) => `${m.code} ${m.title} ${m.file.originalName}`),
        ...tugasanPapers
          .filter((p) => p.cuId === cu.id)
          .map((p) => `${p.setCode} ${p.paperCode} ${p.title}`),
        ...cu.amaliSub1.sopSteps.map((s) => `${s.category} ${s.title} ${s.instruction}`),
        ...cu.amaliSub2.sopSteps.map((s) => `${s.category} ${s.title} ${s.instruction}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [cus, query, filterMode, levelMap, tugasanPapers]);

  const recentLogs = useMemo(() => [...accessLogs].reverse().slice(0, 25), [accessLogs]);

  return (
    <div className="space-y-6">
      {/* Google Drive Arkib Rekod Latihan (Folder Mengikut No. KP) */}
      <section className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-[#f0cb63]" />
              <span>Arkib Rekod Latihan Google Drive (Mengikut No. Kad Pengenalan)</span>
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Setiap rekod latihan (Kertas Tugasan AI, SOP Amali &amp; Laporan Lengkap) disimpan secara automatik ke dalam hierarki{' '}
              <span className="font-mono font-semibold text-[#f0cb63]">
                ADMIN / {supervisorLabel} / {targetFolderLabel}
              </span>
              {!user.icNumber && ' (No. KP belum diisi — menggunakan ID pengguna sementara)'}.
            </p>
            <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
              <a
                href={branding.driveRecordsFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#f0cb63] hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Folder Induk Rekod Drive</span>
              </a>
              {traineeFolder && (
                <a
                  href={traineeFolder.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-400 hover:underline font-semibold"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Buka Folder {traineeFolder.pathLabel}</span>
                </a>
              )}
              {driveConnected && googleEmail && (
                <span className="text-slate-400">
                  Disambung: <span className="text-slate-200">{googleEmail}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!driveConnected ? (
              <GoogleSignInButton
                onClick={() => void handleConnectAndLoadFolder()}
                disabled={driveBusy}
              />
            ) : (
              <>
                <button
                  type="button"
                  disabled={driveBusy}
                  onClick={() => void handleGenerateAndUploadSummary()}
                  className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <CloudUpload className="w-3.5 h-3.5" />
                  <span>
                    {driveBusy ? 'Menjana & Menyimpan...' : 'Jana & Simpan Rekod Lengkap ke Drive'}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={driveBusy}
                  onClick={() => void handleConnectAndLoadFolder()}
                  className="px-3 py-2 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Semak Folder No. KP</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDisconnectDrive()}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-white underline"
                >
                  Putus Google
                </button>
              </>
            )}
          </div>
        </div>

        {driveNotice && (
          <div
            role="status"
            className={`p-3 rounded-lg text-xs border ${
              driveNotice.type === 'ok'
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                : 'bg-red-950/60 border-red-800/70 text-red-300'
            }`}
          >
            {driveNotice.text}
          </div>
        )}

        {folderFiles.length > 0 && (
          <div className="pt-3 border-t border-[#1a2f5c] space-y-2">
            <p className="text-xs font-semibold text-slate-200">
              Fail Rekod Tersimpan Dalam Folder {traineeFolder?.name || targetFolderLabel} (
              {folderFiles.length})
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {folderFiles.map((f) => (
                <a
                  key={f.id}
                  href={f.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 rounded-lg bg-[#071024] border border-[#1a2f5c] hover:border-[#e5b94c] flex items-center justify-between gap-2 text-xs transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-[#f0cb63] shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-white truncate">{f.name}</p>
                      {f.modifiedTime && (
                        <p className="text-[11px] font-mono text-slate-400">
                          {new Date(f.modifiedTime).toLocaleString('ms-MY')}
                        </p>
                      )}
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">
              Carian Pantas Bahan &amp; Penjejakan Akses
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Cari tajuk CU, dokumen Word/PDF, pautan Google Form, dan langkah SOP merentas Sub 1 &amp; Sub 2 bagi Teori dan Amali.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#071024] border border-[#1a2f5c] rounded-lg self-start">
            {(
              [
                { id: 'all', label: 'Semua CU' },
                { id: 'incomplete', label: 'Slot Kosong' },
                { id: 'ready', label: 'Lengkap' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterMode(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filterMode === tab.id
                    ? 'bg-[#17356e] text-[#f0cb63] shadow-sm font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari kod CU, tajuk modul, nama fail .pdf/.docx, Google Form, atau langkah LOTO/PCD/PPE..."
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#071024] text-slate-100 placeholder:text-slate-500 border border-[#263f73] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
          />
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1a2f5c] text-xs font-semibold text-slate-400">
                <th className="py-3 pr-4">Tahap &amp; CU</th>
                <th className="py-3 px-3">TEORI Sub 1</th>
                <th className="py-3 px-3">TEORI Sub 2</th>
                <th className="py-3 px-3">Google Form</th>
                <th className="py-3 px-3">Tugasan (AI)</th>
                <th className="py-3 px-3">AMALI (Sub 1 &amp; Sub 2)</th>
                <th className="py-3 pl-3 text-right">Akses</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a2f5c] text-sm">
              {filteredCUs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                    Tiada rekod CU sepadan dengan carian anda.
                  </td>
                </tr>
              ) : (
                filteredCUs.map((cu) => {
                  const lvl = levelMap.get(cu.levelId);
                  const ebookCount = cu.ebookModules?.length || 0;
                  const sub1Docs =
                    (cu.teoriSub1.notaSlot ? 1 : 0) + (cu.teoriSub1.panduanSoalanSlot ? 1 : 0);
                  const sub2Docs =
                    (cu.teoriSub2.notaSlot ? 1 : 0) + (cu.teoriSub2.panduanSoalanSlot ? 1 : 0);
                  const formsCount =
                    (cu.teoriSub1.googleFormUrl ? 1 : 0) + (cu.teoriSub2.googleFormUrl ? 1 : 0);
                  const amaliDocs =
                    (cu.amaliSub1.sopDocSlot ? 1 : 0) + (cu.amaliSub2.sopDocSlot ? 1 : 0);
                  const cuPapers = tugasanPapers.filter((p) => p.cuId === cu.id);
                  const cuPassedIds = new Set(
                    tugasanSubmissions
                      .filter((s) => s.cuId === cu.id && s.passed)
                      .map((s) => s.templateId)
                  );
                  return (
                    <tr key={cu.id} className="hover:bg-[#112247]/60">
                      <td className="py-3.5 pr-4">
                        <p className="text-xs font-mono text-slate-400">
                          {lvl?.code || '-'} · {cu.code}
                        </p>
                        <p className="font-medium text-white">{cu.title}</p>
                      </td>
                      <td className="py-3.5 px-3 text-xs font-mono tabular-nums">
                        <button
                          type="button"
                          onClick={() => onNavigateToCu(cu.levelId, 'teori', cu.id)}
                          className={
                            sub1Docs > 0 || ebookCount > 0
                              ? 'text-emerald-400 hover:underline font-medium'
                              : 'text-slate-400 hover:underline'
                          }
                        >
                          {sub1Docs}/2 Fail{ebookCount > 0 ? ` + ${ebookCount} E-Book` : ''}
                        </button>
                      </td>
                      <td className="py-3.5 px-3 text-xs font-mono tabular-nums">
                        <button
                          type="button"
                          onClick={() => onNavigateToCu(cu.levelId, 'teori', cu.id)}
                          className={
                            sub2Docs > 0
                              ? 'text-emerald-400 hover:underline font-medium'
                              : 'text-slate-400 hover:underline'
                          }
                        >
                          {sub2Docs}/2 Fail
                        </button>
                      </td>
                      <td className="py-3.5 px-3 text-xs font-mono tabular-nums">
                        <button
                          type="button"
                          onClick={() => onNavigateToCu(cu.levelId, 'latihan', cu.id)}
                          className={
                            formsCount > 0
                              ? 'text-[#f0cb63] hover:underline font-medium'
                              : 'text-slate-400 hover:underline'
                          }
                        >
                          {formsCount}/2 Borang
                        </button>
                      </td>
                      <td className="py-3.5 px-3 text-xs font-mono tabular-nums">
                        <button
                          type="button"
                          onClick={() => onNavigateToCu(cu.levelId, 'tugasan', cu.id)}
                          className={
                            cuPassedIds.size > 0
                              ? 'text-emerald-400 hover:underline font-medium'
                              : 'text-[#f0cb63] hover:underline'
                          }
                        >
                          {cuPapers.length} Set ({cuPassedIds.size} Lulus)
                        </button>
                      </td>
                      <td className="py-3.5 px-3 text-xs font-mono tabular-nums">
                        <button
                          type="button"
                          onClick={() => onNavigateToCu(cu.levelId, 'amali_sop', cu.id)}
                          className="text-slate-300 hover:text-[#f0cb63] hover:underline"
                        >
                          {amaliDocs}/2 Dok · {cu.amaliSub1.sopSteps.length}+{cu.amaliSub2.sopSteps.length} Langkah
                        </button>
                      </td>
                      <td className="py-3.5 pl-3 text-right">
                        <button
                          type="button"
                          onClick={() => onNavigateToCu(cu.levelId, 'teori', cu.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#f0cb63] hover:text-white whitespace-nowrap"
                        >
                          <span>Buka</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6">
        <h3 className="text-base font-bold text-white">Rekod Penjejakan Akses Terkini</h3>
        <p className="mt-1 text-xs text-slate-400">
          Memaparkan aktiviti semakan nota Word/PDF, akses Google Form, dan semakan SOP bengkel.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1a2f5c] text-xs font-semibold text-slate-400">
                <th className="py-2.5 pr-4">Masa</th>
                <th className="py-2.5 px-3">Pengguna</th>
                <th className="py-2.5 px-3">Unit Kompetensi</th>
                <th className="py-2.5 pl-3">Aktiviti</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a2f5c] text-xs">
              {recentLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    Belum ada aktiviti akses direkodkan lagi.
                  </td>
                </tr>
              ) : (
                recentLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#112247]/60">
                    <td className="py-2.5 pr-4 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('ms-MY')}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-white">
                      {log.userName} <span className="text-slate-400">({log.userRole})</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      <span className="font-mono text-[#f0cb63]">{log.cuCode}</span> · {log.cuTitle}
                      {log.subKey && (
                        <span className="ml-1.5 font-mono text-slate-400">
                          ({log.subKey === 'sub1' ? 'Sub 1' : 'Sub 2'})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pl-3 text-slate-300">{ACTION_LABELS[log.action]}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

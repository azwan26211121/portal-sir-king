import React, { useEffect, useMemo, useState } from 'react';
import { Check, CloudUpload, Edit3, ExternalLink, KeyRound, Save, X } from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import {
  applyDriveFolderAndFilePermissions,
  buildTraineeFolderName,
  computeAuthorizedEmailsForTrainee,
  type DriveRegistrySyncResult,
  getGoogleDriveAccessToken,
  initGoogleWorkspaceAuth,
  performTwoWayDriveSync,
  resolveHierarchicalTraineeDriveFolder,
  signInWithGoogleDrive,
  upsertDriveFileInFolder,
} from '../lib/googleDrive.ts';
import { GoogleSignInButton } from './GoogleSignInButton.tsx';
import type { ApprovalStatus, BrandingConfig, PublicUser, TopicLevel } from '../types.ts';

interface TraineeManagementViewProps {
  token: string;
  currentUser: PublicUser;
  branding?: BrandingConfig;
  levels: TopicLevel[];
  onUserUpdated: () => Promise<void>;
}

export function TraineeManagementView({
  token,
  currentUser,
  branding,
  levels,
  onUserUpdated,
}: TraineeManagementViewProps) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | ApprovalStatus>('all');
  const [selectedLevels, setSelectedLevels] = useState<Record<string, string>>({});
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editProfileDraft, setEditProfileDraft] = useState<{
    name: string;
    icNumber: string;
    email: string;
  }>({
    name: '',
    icNumber: '',
    email: '',
  });
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [driveConnected, setDriveConnected] = useState(() => Boolean(getGoogleDriveAccessToken()));
  const [syncingDrive, setSyncingDrive] = useState(false);
  const [lastRegistrySync, setLastRegistrySync] = useState<DriveRegistrySyncResult | null>(null);

  useEffect(() => {
    const unsub = initGoogleWorkspaceAuth(
      () => setDriveConnected(true),
      () => setDriveConnected(Boolean(getGoogleDriveAccessToken()))
    );
    return unsub;
  }, []);

  // PIN update form (for Pengajar / Pelatih)
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [pinFeedback, setPinFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await api.getUsers(token);
      const trainees = res.users.filter((u) => u.role === 'pelatih');
      setUsers(trainees);
      const defaults: Record<string, string> = {};
      for (const u of trainees) {
        defaults[u.id] = u.approvedLevelId || u.requestedLevelId || levels[0]?.id || '';
      }
      setSelectedLevels(defaults);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal memuatkan senarai pelatih.',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filteredUsers = useMemo(() => {
    if (statusFilter === 'all') return users;
    return users.filter((u) => u.status === statusFilter);
  }, [users, statusFilter]);

  async function syncRegistryToDrive(requirePrompt = false): Promise<{
    result: DriveRegistrySyncResult;
    users: Array<{ id: string; role: string; email?: string | null; supervisorId?: string | null }>;
  } | null> {
    const rootFolderId = branding?.driveRecordsFolderId || '168i3Rpp8PGlGGa-4yNPTtJVCBgiDUc36';
    let accessToken = getGoogleDriveAccessToken();
    if (!accessToken) {
      if (!requirePrompt) return null;
      const signed = await signInWithGoogleDrive();
      accessToken = signed.accessToken;
      setDriveConnected(true);
    }
    const twoWay = await performTwoWayDriveSync(accessToken, rootFolderId, {
      onReconcile: (remote) => api.reconcileDriveSystemRegistry(token, remote),
      onFetchLatest: () => api.getDriveSystemRegistry(token),
      syncPermissions: true,
    });
    setLastRegistrySync(twoWay.syncResult);
    if (twoWay.reconciledCount > 0) {
      await loadUsers();
      await onUserUpdated();
    }
    return { result: twoWay.syncResult, users: twoWay.latestPayload.users };
  }

  async function archiveApprovedTraineeRecordToDrive(
    trainee: PublicUser,
    levelLabel: string,
    registryUsers: Array<{ id: string; role: string; email?: string | null; supervisorId?: string | null }>
  ) {
    const accessToken = getGoogleDriveAccessToken();
    if (!accessToken) return;
    const rootFolderId = branding?.driveRecordsFolderId || '168i3Rpp8PGlGGa-4yNPTtJVCBgiDUc36';
    const folder = await resolveHierarchicalTraineeDriveFolder(
      accessToken,
      rootFolderId,
      trainee.supervisorName || currentUser.name || 'PENTADBIR UTAMA',
      trainee.icNumber,
      trainee.userId,
      trainee.name,
      { ensureApprovedSubfolder: true }
    );
    const targetFolderId = folder.approvedRecordsFolderId || folder.id;
    const folderSlug = buildTraineeFolderName(trainee.icNumber, trainee.userId);
    const nowStr = new Date().toLocaleString('ms-MY');
    const collegeName = branding?.collegeName || 'PORTAL PEMBELAJARAN SIRKING';
    const html = `<!DOCTYPE html>
<html lang="ms">
<head><meta charset="UTF-8" /><title>Rekod Kelulusan Pelatih - ${folderSlug}</title>
<style>body{font-family:Arial,sans-serif;margin:28px;color:#111;font-size:13px;}table{width:100%;border-collapse:collapse;margin-top:14px;}th,td{border:1px solid #111;padding:8px;text-align:left;}th{background:#f1f5f9;}</style>
</head>
<body>
  <h2>${collegeName}</h2>
  <p><strong>REKOD PENGESAHAN &amp; KELULUSAN AKSES PELATIH (REKOD_DILULUSKAN)</strong></p>
  <table>
    <tr><th>Nama Pelatih</th><td>${trainee.name}</td><th>No. Kad Pengenalan</th><td>${trainee.icNumber || '-'}</td></tr>
    <tr><th>User ID</th><td>${trainee.userId}</td><th>Emel Google</th><td>${trainee.email || '-'}</td></tr>
    <tr><th>Pengajar Penyelia</th><td>${trainee.supervisorName || currentUser.name}</td><th>Tahap Diluluskan</th><td>${levelLabel}</td></tr>
    <tr><th>Diluluskan Oleh</th><td>${currentUser.name} (${currentUser.role.toUpperCase()})</td><th>Tarikh Kelulusan</th><td>${nowStr}</td></tr>
  </table>
</body></html>`;
    const fileRes = await upsertDriveFileInFolder(
      accessToken,
      targetFolderId,
      `Rekod-Kelulusan-${folderSlug}.html`,
      'text/html',
      new Blob([html], { type: 'text/html;charset=utf-8' })
    );
    const authEmails = computeAuthorizedEmailsForTrainee(trainee, registryUsers);
    if (authEmails.allAuthorizedEmails.length > 0) {
      await applyDriveFolderAndFilePermissions(accessToken, targetFolderId, {
        writerEmails: authEmails.writerEmails,
        readerEmails: authEmails.readerEmails,
        pruneUnauthorized: true,
      });
      await applyDriveFolderAndFilePermissions(accessToken, fileRes.id, {
        writerEmails: authEmails.writerEmails,
        readerEmails: authEmails.readerEmails,
        pruneUnauthorized: true,
      });
    }
  }

  async function handleManualSyncDrive() {
    setSyncingDrive(true);
    setFeedback(null);
    try {
      const synced = await syncRegistryToDrive(true);
      if (synced) {
        const res = synced.result;
        setFeedback({
          type: 'ok',
          text: `Penyegerakan dua hala _SYSTEM_ACCESS_REGISTRY.json selesai (${res.totalUsers} pengguna · ${res.traineeFolderCount} folder pelatih · ${res.permissionsAppliedCount} kebenaran Drive dikemaskini).`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mengemaskini senarai akses ke Google Drive.',
      });
    } finally {
      setSyncingDrive(false);
    }
  }

  async function handleDecision(userId: string, status: ApprovalStatus) {
    setActionBusyId(userId);
    setFeedback(null);
    try {
      const res = await api.approveUser(token, userId, status, selectedLevels[userId]);
      await loadUsers();
      await onUserUpdated();
      const synced = await syncRegistryToDrive(false).catch(() => null);
      if (status === 'approved' && synced) {
        const lvl = levels.find((l) => l.id === (res.user.approvedLevelId || selectedLevels[userId]));
        const lvlLabel = lvl ? `${lvl.code} — ${lvl.title}` : res.user.approvedLevelId || '-';
        await archiveApprovedTraineeRecordToDrive(res.user, lvlLabel, synced.users).catch(
          () => {}
        );
      }
      setFeedback({
        type: 'ok',
        text:
          (status === 'approved'
            ? 'Pelatih berjaya diluluskan dan akses tahap telah diaktifkan.'
            : 'Status permohonan pelatih dikemas kini.') +
          (synced
            ? ' Rekod diluluskan, _SYSTEM_ACCESS_REGISTRY.json & kebenaran Google Drive telah dikemaskini.'
            : ''),
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal mengemas kini status pelatih.',
      });
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleSaveProfile(userId: string) {
    if (editProfileDraft.name.trim().length < 2) {
      setFeedback({ type: 'err', text: 'Nama pelatih mestilah sekurang-kurangnya 2 aksara.' });
      return;
    }
    const cleanEmail = editProfileDraft.email.trim().toLowerCase();
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFeedback({ type: 'err', text: 'Format emel Google tidak sah.' });
      return;
    }
    setActionBusyId(userId);
    setFeedback(null);
    try {
      await api.updateUserProfile(token, userId, {
        name: editProfileDraft.name.trim(),
        icNumber: editProfileDraft.icNumber.trim(),
        email: cleanEmail,
      });
      setEditingProfileId(null);
      await loadUsers();
      await onUserUpdated();
      const synced = await syncRegistryToDrive(false).catch(() => null);
      setFeedback({
        type: 'ok',
        text:
          'Profil pelatih (Nama, No. KP & Emel Google) berjaya dikemas kini.' +
          (synced ? ' Senarai akses, log perubahan & kebenaran Drive telah dikemaskini.' : ''),
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal mengemas kini profil pelatih.',
      });
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleUpdatePin(e: React.FormEvent) {
    e.preventDefault();
    setPinFeedback(null);
    if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin)) {
      setPinFeedback({ type: 'err', text: 'PIN semasa dan PIN baharu mestilah 6 digit nombor.' });
      return;
    }
    setPinBusy(true);
    try {
      await api.updateOwnPin(token, currentPin, newPin);
      setCurrentPin('');
      setNewPin('');
      setPinFeedback({ type: 'ok', text: 'PIN akses 6 digit berjaya dikemas kini.' });
    } catch (err) {
      setPinFeedback({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal mengemas kini PIN.',
      });
    } finally {
      setPinBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#1a2f5c]">
          <div>
            <h2 className="text-lg font-bold text-white">
              Pengurusan &amp; Kelulusan Permohonan Pelatih
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Luluskan (<span className="font-mono text-xs text-[#f0cb63]">approve</span>) permohonan pelatih di bawah penyeliaan anda dan tetapkan tahap pembelajaran mereka.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start">
            {driveConnected ? (
              <button
                type="button"
                disabled={syncingDrive}
                onClick={() => void handleManualSyncDrive()}
                className="px-3 py-1.5 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <CloudUpload className="w-3.5 h-3.5" />
                <span>{syncingDrive ? 'Mengemaskini Drive...' : 'Kemaskini Senarai Drive'}</span>
              </button>
            ) : (
              <GoogleSignInButton
                onClick={() => void handleManualSyncDrive()}
                disabled={syncingDrive}
              />
            )}

            <div className="flex items-center gap-1 p-1 bg-[#071024] border border-[#1a2f5c] rounded-lg">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'pending', label: 'Menunggu' },
                  { id: 'approved', label: 'Diluluskan' },
                  { id: 'rejected', label: 'Ditolak' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    statusFilter === tab.id
                      ? 'bg-[#17356e] text-[#f0cb63] shadow-sm font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {lastRegistrySync && (
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-300">
            {lastRegistrySync.systemRegistryUrl && (
              <a
                href={lastRegistrySync.systemRegistryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sky-300 hover:underline font-mono font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>_SYSTEM_ACCESS_REGISTRY.json</span>
              </a>
            )}
            <a
              href={lastRegistrySync.htmlFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-emerald-400 hover:underline font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Buka Senarai_Akses_Pengguna.html</span>
            </a>
            {lastRegistrySync.changeLogUrl && (
              <a
                href={lastRegistrySync.changeLogUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-amber-300 hover:underline font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Log Perubahan</span>
              </a>
            )}
            <a
              href={lastRegistrySync.adminFolderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#f0cb63] hover:underline font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Folder ADMIN</span>
            </a>
          </div>
        )}

        {feedback && (
          <div
            role="status"
            className={`mt-4 p-3 rounded-lg text-xs border ${
              feedback.type === 'ok'
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                : 'bg-red-950/60 border-red-800/70 text-red-300'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1a2f5c] text-xs font-semibold text-slate-400">
                <th className="py-3 pr-4">Nama Pelatih</th>
                <th className="py-3 px-3">Guru Penyelia</th>
                <th className="py-3 px-3">Tahap Akses</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 pl-3 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a2f5c] text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Memuatkan senarai pelatih...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Tiada permohonan pelatih dalam kategori ini.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((trainee) => {
                  const busy = actionBusyId === trainee.id;
                  const isEditingProfile = editingProfileId === trainee.id;
                  return (
                    <tr key={trainee.id} className="hover:bg-[#112247]/60">
                      <td className="py-3.5 pr-4">
                        {isEditingProfile ? (
                          <div className="space-y-1.5 max-w-xs">
                            <input
                              type="text"
                              value={editProfileDraft.name}
                              onChange={(e) =>
                                setEditProfileDraft({ ...editProfileDraft, name: e.target.value })
                              }
                              placeholder="Nama penuh pelatih"
                              className="w-full px-2.5 py-1.5 text-xs bg-[#071024] text-white border border-[#263f73] rounded"
                            />
                            <input
                              type="text"
                              value={editProfileDraft.icNumber}
                              onChange={(e) =>
                                setEditProfileDraft({
                                  ...editProfileDraft,
                                  icNumber: e.target.value.replace(/[^0-9-]/g, '').slice(0, 20),
                                })
                              }
                              placeholder="No. Kad Pengenalan (cth: 020514-10-1234)"
                              className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#071024] text-white border border-[#263f73] rounded"
                            />
                            <input
                              type="email"
                              value={editProfileDraft.email}
                              onChange={(e) =>
                                setEditProfileDraft({
                                  ...editProfileDraft,
                                  email: e.target.value,
                                })
                              }
                              placeholder="Emel Google (untuk kebenaran Drive)"
                              className="w-full px-2.5 py-1.5 text-xs bg-[#071024] text-white border border-[#263f73] rounded"
                            />
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleSaveProfile(trainee.id)}
                                className="px-2.5 py-1 text-[11px] font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded inline-flex items-center gap-1"
                              >
                                <Save className="w-3 h-3" />
                                <span>Simpan</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingProfileId(null)}
                                className="px-2 py-1 text-[11px] text-slate-300 hover:text-white"
                              >
                                Batal
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="font-medium text-white">{trainee.name}</p>
                            <p className="text-xs font-mono text-slate-400 tabular-nums">
                              ID: {trainee.userId} · MyKad: {trainee.icNumber || 'Belum diisi'}
                            </p>
                            <p className="text-[11px] font-mono text-sky-300/90">
                              Emel Google: {trainee.email || 'Belum ditetapkan'}
                            </p>
                          </>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-300">
                        {trainee.supervisorName || 'Pentadbir Utama'}
                      </td>
                      <td className="py-3.5 px-3">
                        <select
                          aria-label={`Pilih tahap untuk ${trainee.name}`}
                          value={selectedLevels[trainee.id] || ''}
                          onChange={(e) =>
                            setSelectedLevels({
                              ...selectedLevels,
                              [trainee.id]: e.target.value,
                            })
                          }
                          className="px-2.5 py-1.5 text-xs border border-[#263f73] rounded-lg bg-[#071024] text-slate-100"
                        >
                          {levels.map((lvl) => (
                            <option key={lvl.id} value={lvl.id}>
                              {lvl.code} — {lvl.title}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3.5 px-3 text-xs font-medium">
                        {trainee.status === 'approved' ? (
                          <span className="text-emerald-400">Diluluskan</span>
                        ) : trainee.status === 'rejected' ? (
                          <span className="text-red-400">Ditolak</span>
                        ) : (
                          <span className="text-amber-400">Menunggu (Pending)</span>
                        )}
                      </td>
                      <td className="py-3.5 pl-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditingProfileId(trainee.id);
                              setEditProfileDraft({
                                name: trainee.name,
                                icNumber: trainee.icNumber || '',
                                email: trainee.email || '',
                              });
                            }}
                            className="px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] disabled:opacity-60 rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit Profil</span>
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDecision(trainee.id, 'approved')}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Luluskan</span>
                          </button>
                          {trainee.status !== 'rejected' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDecision(trainee.id, 'rejected')}
                              className="px-3 py-1.5 text-xs font-medium text-red-300 bg-red-950/50 border border-red-800/60 hover:bg-red-900/60 disabled:opacity-60 rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Tolak</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {currentUser.role !== 'admin' && currentUser.role !== 'master_admin' && (
        <section className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 max-w-xl">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#f0cb63]" />
            <h3 className="text-base font-bold text-white">Kemaskini PIN Akses 6 Digit</h3>
          </div>
          <p className="mt-1 text-xs text-slate-300">
            Tukar PIN akses 6 digit akaun pengajar anda secara berkala untuk keselamatan.
          </p>

          {pinFeedback && (
            <div
              className={`mt-4 p-3 rounded-lg text-xs border ${
                pinFeedback.type === 'ok'
                  ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                  : 'bg-red-950/60 border-red-800/70 text-red-300'
              }`}
            >
              {pinFeedback.text}
            </div>
          )}

          <form onSubmit={handleUpdatePin} autoComplete="off" className="mt-4 grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-200 mb-1">PIN Semasa</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                autoComplete="off"
                data-lpignore="true"
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 digit"
                className="w-full px-3 py-2 text-sm font-mono tabular-nums tracking-[0.2em] bg-[#071024] text-slate-100 placeholder:text-slate-500 border border-[#263f73] rounded-lg pin-masked"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-200 mb-1">PIN Baharu</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                autoComplete="off"
                data-lpignore="true"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 digit baharu"
                className="w-full px-3 py-2 text-sm font-mono tabular-nums tracking-[0.2em] bg-[#071024] text-slate-100 placeholder:text-slate-500 border border-[#263f73] rounded-lg pin-masked"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={pinBusy}
                className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg"
              >
                {pinBusy ? 'Menyimpan...' : 'Kemas Kini PIN 6 Digit'}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

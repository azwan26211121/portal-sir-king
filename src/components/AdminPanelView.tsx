import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Edit3,
  Image as ImageIcon,
  KeyRound,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import type {
  ApprovalStatus,
  BrandingConfig,
  CUModule,
  LearningSection,
  PublicUser,
  TopicLevel,
  UserRole,
} from '../types.ts';

interface AdminPanelViewProps {
  token: string;
  currentUser: PublicUser;
  branding: BrandingConfig;
  levels: TopicLevel[];
  cus: CUModule[];
  onBrandingUpdated: (branding: BrandingConfig) => void;
  onRefreshWorkspace: () => Promise<void>;
  onJumpToCu: (levelId: string, section: LearningSection, cuId: string) => void;
}

export function AdminPanelView({
  token,
  currentUser,
  branding,
  levels,
  cus,
  onBrandingUpdated,
  onRefreshWorkspace,
  onJumpToCu,
}: AdminPanelViewProps) {
  const isMasterAdmin = currentUser.role === 'master_admin';
  const [activeTab, setActiveTab] = useState<'users' | 'curriculum' | 'slots' | 'branding'>('users');
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Branding state
  const [portalNameInput, setPortalNameInput] = useState(branding.portalName);
  const [portalTaglineInput, setPortalTaglineInput] = useState(branding.portalTagline);
  const [brandingBusy, setBrandingBusy] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPortalNameInput(branding.portalName);
    setPortalTaglineInput(branding.portalTagline);
  }, [branding.portalName, branding.portalTagline]);

  // Own password update (for Admin / Master Admin)
  const [ownCurrentPassword, setOwnCurrentPassword] = useState('');
  const [ownNewPassword, setOwnNewPassword] = useState('');
  const [ownPassBusy, setOwnPassBusy] = useState(false);

  // Create user state
  const [newUserId, setNewUserId] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'pelatih' | 'pengajar' | 'admin'>('pengajar');
  const [newPin, setNewPin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newStatus, setNewStatus] = useState<ApprovalStatus>('approved');
  const [newSupervisorId, setNewSupervisorId] = useState('');
  const [newLevelId, setNewLevelId] = useState(levels[0]?.id || '');

  // Edit user state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserDraft, setEditUserDraft] = useState<{
    userId: string;
    name: string;
    role: 'pelatih' | 'pengajar' | 'admin';
    status: ApprovalStatus;
    supervisorId: string;
    approvedLevelId: string;
    newPin: string;
    newPassword: string;
  } | null>(null);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);

  // Level CRUD state
  const [lvlCode, setLvlCode] = useState('');
  const [lvlTitle, setLvlTitle] = useState('');
  const [lvlDesc, setLvlDesc] = useState('');
  const [lvlTeori1, setLvlTeori1] = useState('Sub 1: Konsep Asas & Nota Teras');
  const [lvlTeori2, setLvlTeori2] = useState('Sub 2: Aplikasi Lanjutan & Panduan Soalan');
  const [lvlAmali1, setLvlAmali1] = useState('Sub 1: Persediaan & Keselamatan (LOTO · PPE)');
  const [lvlAmali2, setLvlAmali2] = useState('Sub 2: Pelaksanaan Kerja & Pengujian (PCD)');
  const [confirmDeleteLevelId, setConfirmDeleteLevelId] = useState<string | null>(null);

  // Level Sub-Title edit state
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null);
  const [editLevelDraft, setEditLevelDraft] = useState<{
    code: string;
    title: string;
    teoriSub1Title: string;
    teoriSub2Title: string;
    amaliSub1Title: string;
    amaliSub2Title: string;
  } | null>(null);

  // CU CRUD state
  const [cuLevelId, setCuLevelId] = useState(levels[0]?.id || '');
  const [cuCode, setCuCode] = useState('');
  const [cuTitle, setCuTitle] = useState('');
  const [cuDesc, setCuDesc] = useState('');
  const [confirmDeleteCuId, setConfirmDeleteCuId] = useState<string | null>(null);

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const res = await api.getUsers(token);
      setUsers(res.users);
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal memuatkan data pengguna.',
      });
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!newLevelId && levels[0]) setNewLevelId(levels[0].id);
    if (!cuLevelId && levels[0]) setCuLevelId(levels[0].id);
  }, [levels, newLevelId, cuLevelId]);

  const teachers = useMemo(
    () => users.filter((u) => u.role === 'pengajar' && u.status === 'approved'),
    [users]
  );

  const masterAdmins = useMemo(
    () => users.filter((u) => u.role === 'master_admin'),
    [users]
  );

  const admins = useMemo(
    () => users.filter((u) => u.role === 'admin'),
    [users]
  );

  async function handleUpdateOwnPassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (ownNewPassword.length < 8) {
      setMsg({ type: 'err', text: 'Kata laluan baharu mestilah sekurang-kurangnya 8 aksara.' });
      return;
    }
    setOwnPassBusy(true);
    try {
      await api.updateOwnPassword(token, ownCurrentPassword, ownNewPassword);
      setOwnCurrentPassword('');
      setOwnNewPassword('');
      setMsg({ type: 'ok', text: 'Kata laluan akaun anda berjaya dikemas kini.' });
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal mengemas kini kata laluan.',
      });
    } finally {
      setOwnPassBusy(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(newUserId.trim())) {
      setMsg({ type: 'err', text: 'User ID mestilah 3–32 aksara (huruf, nombor, ., _, -).' });
      return;
    }
    if (newRole === 'admin') {
      if (newPassword.length < 8) {
        setMsg({ type: 'err', text: 'Kata laluan Admin mestilah sekurang-kurangnya 8 aksara.' });
        return;
      }
    } else if (!/^\d{6}$/.test(newPin)) {
      setMsg({ type: 'err', text: 'PIN akses mestilah tepat 6 digit nombor.' });
      return;
    }
    try {
      await api.adminCreateUser(token, {
        userId: newUserId.trim(),
        name: newName,
        role: newRole,
        pin: newRole === 'admin' ? undefined : newPin,
        password: newRole === 'admin' ? newPassword : undefined,
        status: newRole === 'admin' ? 'approved' : newStatus,
        supervisorId: newRole === 'pelatih' ? newSupervisorId || undefined : undefined,
        approvedLevelId: newRole === 'pelatih' ? newLevelId || undefined : undefined,
      });
      setNewUserId('');
      setNewName('');
      setNewPin('');
      setNewPassword('');
      if (newRole === 'admin') setNewRole('pengajar');
      await loadUsers();
      await onRefreshWorkspace();
      setMsg({ type: 'ok', text: 'Pengguna baharu berjaya ditambah.' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof ApiError ? err.message : 'Gagal menambah pengguna.' });
    }
  }

  function startEditUser(u: PublicUser) {
    if (u.role === 'master_admin') return;
    if (u.role === 'admin' && !isMasterAdmin) return;
    setEditingUserId(u.id);
    setEditUserDraft({
      userId: u.userId,
      name: u.name,
      role: u.role as 'pelatih' | 'pengajar' | 'admin',
      status: u.status,
      supervisorId: u.supervisorId || '',
      approvedLevelId: u.approvedLevelId || u.requestedLevelId || levels[0]?.id || '',
      newPin: '',
      newPassword: '',
    });
  }

  async function handleSaveUserEdit(userId: string) {
    if (!editUserDraft) return;
    setMsg(null);
    if (editUserDraft.role === 'admin') {
      if (editUserDraft.newPassword && editUserDraft.newPassword.length < 8) {
        setMsg({ type: 'err', text: 'Kata laluan Admin baharu mestilah sekurang-kurangnya 8 aksara.' });
        return;
      }
    } else if (editUserDraft.newPin && !/^\d{6}$/.test(editUserDraft.newPin)) {
      setMsg({ type: 'err', text: 'PIN baharu mestilah 6 digit nombor atau biarkan kosong.' });
      return;
    }
    try {
      await api.adminUpdateUser(token, userId, {
        userId: editUserDraft.userId.trim(),
        name: editUserDraft.name,
        role: editUserDraft.role as UserRole,
        status: editUserDraft.role === 'admin' ? 'approved' : editUserDraft.status,
        supervisorId: editUserDraft.role === 'pelatih' ? editUserDraft.supervisorId || null : null,
        approvedLevelId:
          editUserDraft.role === 'pelatih' ? editUserDraft.approvedLevelId || null : null,
        newPin: editUserDraft.role === 'admin' ? undefined : editUserDraft.newPin || undefined,
        newPassword:
          editUserDraft.role === 'admin' ? editUserDraft.newPassword || undefined : undefined,
      });
      setEditingUserId(null);
      setEditUserDraft(null);
      await loadUsers();
      await onRefreshWorkspace();
      setMsg({ type: 'ok', text: 'Maklumat pengguna berjaya dikemas kini.' });
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal mengemas kini pengguna.',
      });
    }
  }

  async function handleDeleteUser(userId: string) {
    setMsg(null);
    try {
      await api.adminDeleteUser(token, userId);
      setConfirmDeleteUserId(null);
      await loadUsers();
      await onRefreshWorkspace();
      setMsg({ type: 'ok', text: 'Akaun pengguna berjaya dipadam.' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof ApiError ? err.message : 'Gagal memadam pengguna.' });
    }
  }

  async function handleCreateLevel(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api.createLevel(token, {
        code: lvlCode,
        title: lvlTitle,
        description: lvlDesc,
        teoriSub1Title: lvlTeori1,
        teoriSub2Title: lvlTeori2,
        amaliSub1Title: lvlAmali1,
        amaliSub2Title: lvlAmali2,
      });
      setLvlCode('');
      setLvlTitle('');
      setLvlDesc('');
      await onRefreshWorkspace();
      setMsg({ type: 'ok', text: 'Tahap / Topik baharu beserta 2 Sub Teori & 2 Sub Amali berjaya ditambah.' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof ApiError ? err.message : 'Gagal menambah tahap.' });
    }
  }

  async function handleSaveLevelEdit(levelId: string) {
    if (!editLevelDraft) return;
    setMsg(null);
    try {
      await api.updateLevel(token, levelId, editLevelDraft);
      setEditingLevelId(null);
      setEditLevelDraft(null);
      await onRefreshWorkspace();
      setMsg({ type: 'ok', text: 'Tetapan Sub Teori & Sub Amali berjaya dikemas kini.' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof ApiError ? err.message : 'Gagal mengemas kini tahap.' });
    }
  }

  async function handleDeleteLevel(id: string) {
    setMsg(null);
    try {
      await api.deleteLevel(token, id);
      setConfirmDeleteLevelId(null);
      await onRefreshWorkspace();
      setMsg({ type: 'ok', text: 'Tahap dan CU berkaitan telah dipadam.' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof ApiError ? err.message : 'Gagal memadam tahap.' });
    }
  }

  async function handleCreateCu(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api.createCU(token, {
        levelId: cuLevelId,
        code: cuCode,
        title: cuTitle,
        description: cuDesc,
      });
      setCuCode('');
      setCuTitle('');
      setCuDesc('');
      await onRefreshWorkspace();
      setMsg({ type: 'ok', text: 'Unit Kompetensi (CU) baharu berjaya ditambah.' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof ApiError ? err.message : 'Gagal menambah CU.' });
    }
  }

  async function handleDeleteCu(id: string) {
    setMsg(null);
    try {
      await api.deleteCU(token, id);
      setConfirmDeleteCuId(null);
      await onRefreshWorkspace();
      setMsg({ type: 'ok', text: 'CU berjaya dipadam.' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof ApiError ? err.message : 'Gagal memadam CU.' });
    }
  }

  async function handleSaveBrandingText(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBrandingBusy(true);
    try {
      const res = await api.updateBrandingText(token, portalNameInput, portalTaglineInput);
      onBrandingUpdated(res.branding);
      setMsg({ type: 'ok', text: 'Nama portal dan slogan berjaya dikemas kini.' });
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal menyimpan tetapan penjenamaan.',
      });
    } finally {
      setBrandingBusy(false);
    }
  }

  async function handleUploadBrandingImage(kind: 'logo' | 'banner', file: File) {
    setMsg(null);
    setBrandingBusy(true);
    try {
      const res = await api.uploadBrandingImage(token, kind, file);
      onBrandingUpdated(res.branding);
      setMsg({
        type: 'ok',
        text: kind === 'logo' ? 'Logo portal berjaya ditukar.' : 'Banner portal berjaya ditukar.',
      });
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal memuat naik imej penjenamaan.',
      });
    } finally {
      setBrandingBusy(false);
    }
  }

  async function handleResetBrandingImage(kind: 'logo' | 'banner') {
    setMsg(null);
    setBrandingBusy(true);
    try {
      const res = await api.resetBrandingImage(token, kind);
      onBrandingUpdated(res.branding);
      setMsg({
        type: 'ok',
        text:
          kind === 'logo'
            ? 'Logo portal ditetapkan semula kepada logo asal SIRKING.'
            : 'Banner portal ditetapkan semula kepada banner asal SIRKING.',
      });
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal menetapkan semula imej.',
      });
    } finally {
      setBrandingBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#061b44]">Panel Pengurusan Admin Website</h2>
            <p className="mt-1 text-sm text-slate-600">
              Urus pengguna, nama guru, penjenamaan logo &amp; banner, struktur Tahap (2 Sub Teori &amp; 2 Sub Amali), CU, dan semua slot bahan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#eef3fb] rounded-lg self-start">
            {(
              [
                { id: 'users', label: 'Pengguna & Nama Guru' },
                { id: 'curriculum', label: 'Topik Tahap & CU' },
                { id: 'slots', label: 'Audit Slot Bahan' },
                { id: 'branding', label: 'Logo & Banner' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setMsg(null);
                }}
                className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white text-[#0a2e6c] shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-[#061b44]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {msg && (
          <div
            role="status"
            className={`mt-4 p-3 rounded-lg text-xs border ${
              msg.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {msg.text}
          </div>
        )}
      </div>

      {/* TAB 1: USERS & ROLES */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Struktur Pentadbir: 1 Master Admin & 2 Admin */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#0a2e6c]" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Struktur Pentadbir (1 Master Admin &amp; {admins.length}/2 Admin)
                  </h3>
                  <p className="text-xs text-slate-600">
                    Master Admin mengurus kata laluan 2 akaun Admin. Kedua-dua Admin membantu mengurus pelatih, pengajar dan modul.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {masterAdmins.map((m) => (
                <div
                  key={m.id}
                  className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-1.5"
                >
                  <p className="text-xs font-semibold text-[#0a2e6c]">1 Master Admin</p>
                  <p className="text-sm font-bold text-slate-900">{m.name}</p>
                  <p className="text-xs font-mono text-slate-600">
                    ID: {m.userId} · {m.email}
                  </p>
                  <p className="text-xs text-emerald-700 font-medium pt-1">Akses Penuh Sistem</p>
                </div>
              ))}

              {admins.map((adm, idx) => (
                <div
                  key={adm.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500">Admin #{idx + 1} (Maks 2)</p>
                    <p className="text-sm font-bold text-slate-900">{adm.name}</p>
                    <p className="text-xs font-mono text-slate-600">User ID: {adm.userId}</p>
                    <p
                      className={`text-xs font-medium pt-1 ${
                        adm.passwordConfigured ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {adm.passwordConfigured
                        ? 'Kata Laluan Ditetapkan'
                        : 'Kata Laluan Belum Ditetapkan'}
                    </p>
                  </div>

                  {isMasterAdmin && (
                    <button
                      type="button"
                      onClick={() => startEditUser(adm)}
                      className="self-start px-3 py-1.5 text-xs font-medium text-[#0a2e6c] bg-white border border-blue-200 hover:bg-blue-50 rounded-lg inline-flex items-center gap-1.5"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>
                        {adm.passwordConfigured ? 'Tukar Kata Laluan / Sunting' : 'Tetapkan Kata Laluan'}
                      </span>
                    </button>
                  )}
                </div>
              ))}
            </div>

            {!isMasterAdmin && (
              <form
                onSubmit={handleUpdateOwnPassword}
                className="pt-4 border-t border-slate-200 grid sm:grid-cols-3 gap-3 items-end"
              >
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kata Laluan Semasa ({currentUser.userId})
                  </label>
                  <input
                    type="password"
                    required
                    value={ownCurrentPassword}
                    onChange={(e) => setOwnCurrentPassword(e.target.value)}
                    placeholder="Kata laluan semasa"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kata Laluan Baharu (Min 8 Aksara)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={ownNewPassword}
                    onChange={(e) => setOwnNewPassword(e.target.value)}
                    placeholder="Minimum 8 aksara"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <button
                    type="submit"
                    disabled={ownPassBusy}
                    className="px-4 py-2 text-xs font-medium text-white bg-[#0a2e6c] hover:bg-[#061b44] rounded-lg inline-flex items-center gap-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>{ownPassBusy ? 'Menyimpan...' : 'Tukar Kata Laluan Admin'}</span>
                  </button>
                </div>
              </form>
            )}
          </section>

          <form
            onSubmit={handleCreateUser}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#0a2e6c]" />
              <h3 className="text-base font-bold text-slate-900">
                Tambah Pengajar / Pelatih {isMasterAdmin && admins.length < 2 ? '/ Admin ' : ''}Baharu
              </h3>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Peranan</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'pelatih' | 'pengajar' | 'admin')}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="pengajar">Pengajar (Nama Guru)</option>
                  <option value="pelatih">Pelatih</option>
                  {isMasterAdmin && admins.length < 2 && (
                    <option value="admin">Admin ({admins.length}/2)</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">User ID</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={32}
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))}
                  placeholder={newRole === 'admin' ? 'Contoh: admin1' : 'Contoh: cikgu.azwan / pel001'}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Penuh</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nama penuh / Nama Guru"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              {newRole === 'admin' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kata Laluan Admin (Min 8 Aksara)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 aksara"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    PIN Akses 6 Digit
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6 digit nombor"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              {newRole === 'pelatih' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nama Guru Penyelia
                    </label>
                    <select
                      value={newSupervisorId}
                      onChange={(e) => setNewSupervisorId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Pentadbir Utama</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Tahap Diluluskan
                    </label>
                    <select
                      value={newLevelId}
                      onChange={(e) => setNewLevelId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {levels.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.code} — {l.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {newRole !== 'admin' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status Akaun</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as ApprovalStatus)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="approved">Diluluskan (Approved)</option>
                    <option value="pending">Menunggu (Pending)</option>
                    <option value="rejected">Ditolak (Rejected)</option>
                  </select>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-[#0a2e6c] hover:bg-[#061b44] rounded-lg inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Pengguna</span>
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-xl p-6 overflow-x-auto">
            <h3 className="text-base font-bold text-slate-900 mb-4">
              Senarai Semua Pengguna Berdaftar
            </h3>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-3 pr-4">Nama &amp; User ID</th>
                  <th className="py-3 px-3">Peranan</th>
                  <th className="py-3 px-3">Penyelia / Tahap</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 pl-3 text-right">Urus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {loadingUsers ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      Memuatkan pengguna...
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const isEditing = editingUserId === u.id && editUserDraft;
                    const lvl = levels.find((l) => l.id === u.approvedLevelId);
                    const canManageRow =
                      u.role !== 'master_admin' && (u.role !== 'admin' || isMasterAdmin);

                    if (isEditing && editUserDraft) {
                      return (
                        <tr key={u.id} className="bg-blue-50/40">
                          <td className="py-3 pr-4 space-y-1">
                            <input
                              type="text"
                              value={editUserDraft.userId}
                              onChange={(e) =>
                                setEditUserDraft({
                                  ...editUserDraft,
                                  userId: e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''),
                                })
                              }
                              placeholder="User ID"
                              className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded bg-white"
                            />
                            <input
                              type="text"
                              value={editUserDraft.name}
                              onChange={(e) =>
                                setEditUserDraft({ ...editUserDraft, name: e.target.value })
                              }
                              placeholder="Nama Penuh"
                              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                            />
                            {editUserDraft.role === 'admin' ? (
                              <input
                                type="password"
                                minLength={8}
                                value={editUserDraft.newPassword}
                                onChange={(e) =>
                                  setEditUserDraft({
                                    ...editUserDraft,
                                    newPassword: e.target.value,
                                  })
                                }
                                placeholder="Kata laluan Admin baharu (min 8 aksara)"
                                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                              />
                            ) : (
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                value={editUserDraft.newPin}
                                onChange={(e) =>
                                  setEditUserDraft({
                                    ...editUserDraft,
                                    newPin: e.target.value.replace(/\D/g, '').slice(0, 6),
                                  })
                                }
                                placeholder="PIN 6 digit baharu (kosong jika kekal)"
                                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded bg-white"
                              />
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <select
                              value={editUserDraft.role}
                              onChange={(e) =>
                                setEditUserDraft({
                                  ...editUserDraft,
                                  role: e.target.value as 'pelatih' | 'pengajar' | 'admin',
                                })
                              }
                              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                            >
                              <option value="pelatih">pelatih</option>
                              <option value="pengajar">pengajar</option>
                              {isMasterAdmin && (u.role === 'admin' || admins.length < 2) && (
                                <option value="admin">admin</option>
                              )}
                            </select>
                          </td>
                          <td className="py-3 px-3 space-y-1">
                            {editUserDraft.role === 'pelatih' ? (
                              <>
                                <select
                                  value={editUserDraft.supervisorId}
                                  onChange={(e) =>
                                    setEditUserDraft({
                                      ...editUserDraft,
                                      supervisorId: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                                >
                                  <option value="">Pentadbir Utama</option>
                                  {teachers.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={editUserDraft.approvedLevelId}
                                  onChange={(e) =>
                                    setEditUserDraft({
                                      ...editUserDraft,
                                      approvedLevelId: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                                >
                                  {levels.map((l) => (
                                    <option key={l.id} value={l.id}>
                                      {l.code}
                                    </option>
                                  ))}
                                </select>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400">Semua Tahap</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {editUserDraft.role === 'admin' ? (
                              <span className="text-xs text-emerald-700 font-medium">Diluluskan</span>
                            ) : (
                              <select
                                value={editUserDraft.status}
                                onChange={(e) =>
                                  setEditUserDraft({
                                    ...editUserDraft,
                                    status: e.target.value as ApprovalStatus,
                                  })
                                }
                                className="px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
                              >
                                <option value="approved">approved</option>
                                <option value="pending">pending</option>
                                <option value="rejected">rejected</option>
                              </select>
                            )}
                          </td>
                          <td className="py-3 pl-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSaveUserEdit(u.id)}
                                className="px-2.5 py-1.5 text-xs font-medium text-white bg-blue-700 rounded inline-flex items-center gap-1"
                              >
                                <Save className="w-3 h-3" />
                                <span>Simpan</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUserId(null);
                                  setEditUserDraft(null);
                                }}
                                className="p-1.5 text-slate-500 hover:text-slate-900"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={u.id} className="hover:bg-slate-50/60">
                        <td className="py-3.5 pr-4">
                          <p className="font-medium text-slate-900">{u.name}</p>
                          <p className="text-xs font-mono text-slate-500">
                            ID: {u.userId}
                            {u.email ? ` · ${u.email}` : ''}
                          </p>
                        </td>
                        <td className="py-3.5 px-3 text-xs font-mono text-slate-700">{u.role}</td>
                        <td className="py-3.5 px-3 text-xs text-slate-600">
                          {u.role === 'pelatih'
                            ? `${u.supervisorName || 'Admin'} · ${lvl?.code || 'Tiada Tahap'}`
                            : u.role === 'admin'
                            ? u.passwordConfigured
                              ? 'Akses Penuh · Kata Laluan Sedia'
                              : 'Akses Penuh · Kata Laluan Belum Ditetapkan'
                            : 'Akses Semua Tahap'}
                        </td>
                        <td className="py-3.5 px-3 text-xs font-medium">
                          {u.status === 'approved' ? (
                            <span className="text-emerald-700">Diluluskan</span>
                          ) : u.status === 'rejected' ? (
                            <span className="text-red-700">Ditolak</span>
                          ) : (
                            <span className="text-amber-700">Menunggu</span>
                          )}
                        </td>
                        <td className="py-3.5 pl-3 text-right">
                          {!canManageRow ? (
                            <span className="text-xs text-slate-400">
                              {u.role === 'master_admin' ? 'Master Admin' : 'Akaun Admin'}
                            </span>
                          ) : (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => startEditUser(u)}
                                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Edit</span>
                              </button>

                              {confirmDeleteUserId === u.id ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(u.id)}
                                    className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-700 rounded-lg"
                                  >
                                    Padam
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteUserId(null)}
                                    className="px-2 py-1.5 text-xs text-slate-600"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteUserId(u.id)}
                                  className="p-1.5 text-red-700 hover:bg-red-50 rounded-lg"
                                  aria-label={`Padam ${u.name}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: CURRICULUM LEVELS (2 SUB TEORI & 2 SUB AMALI) & CU */}
      {activeTab === 'curriculum' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <h3 className="text-base font-bold text-slate-900">Urus Topik / Tahap (2 Sub Teori &amp; 2 Sub Amali)</h3>
            <form onSubmit={handleCreateLevel} className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-semibold text-slate-800">Tambah Tahap Baharu</p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  value={lvlCode}
                  onChange={(e) => setLvlCode(e.target.value)}
                  placeholder="Kod (TAHAP 5)"
                  className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                />
                <input
                  type="text"
                  required
                  value={lvlTitle}
                  onChange={(e) => setLvlTitle(e.target.value)}
                  placeholder="Tajuk Tahap"
                  className="col-span-2 px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <input
                type="text"
                value={lvlDesc}
                onChange={(e) => setLvlDesc(e.target.value)}
                placeholder="Penerangan ringkas"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              />
              <div className="grid sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={lvlTeori1}
                  onChange={(e) => setLvlTeori1(e.target.value)}
                  placeholder="Nama Teori Sub 1"
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
                <input
                  type="text"
                  value={lvlTeori2}
                  onChange={(e) => setLvlTeori2(e.target.value)}
                  placeholder="Nama Teori Sub 2"
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
                <input
                  type="text"
                  value={lvlAmali1}
                  onChange={(e) => setLvlAmali1(e.target.value)}
                  placeholder="Nama Amali Sub 1"
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
                <input
                  type="text"
                  value={lvlAmali2}
                  onChange={(e) => setLvlAmali2(e.target.value)}
                  placeholder="Nama Amali Sub 2"
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <button
                type="submit"
                className="px-3.5 py-2 text-xs font-medium text-white bg-[#0a2e6c] hover:bg-[#061b44] rounded-lg inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Simpan Tahap</span>
              </button>
            </form>

            <div className="divide-y divide-slate-200">
              {levels.map((l) => {
                const isEditing = editingLevelId === l.id && editLevelDraft;
                if (isEditing && editLevelDraft) {
                  return (
                    <div key={l.id} className="py-4 space-y-2.5 bg-blue-50/40 px-3 rounded-lg">
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={editLevelDraft.code}
                          onChange={(e) =>
                            setEditLevelDraft({ ...editLevelDraft, code: e.target.value })
                          }
                          className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded bg-white"
                        />
                        <input
                          type="text"
                          value={editLevelDraft.title}
                          onChange={(e) =>
                            setEditLevelDraft({ ...editLevelDraft, title: e.target.value })
                          }
                          className="col-span-2 px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                        />
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={editLevelDraft.teoriSub1Title}
                          onChange={(e) =>
                            setEditLevelDraft({ ...editLevelDraft, teoriSub1Title: e.target.value })
                          }
                          placeholder="Teori Sub 1"
                          className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                        />
                        <input
                          type="text"
                          value={editLevelDraft.teoriSub2Title}
                          onChange={(e) =>
                            setEditLevelDraft({ ...editLevelDraft, teoriSub2Title: e.target.value })
                          }
                          placeholder="Teori Sub 2"
                          className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                        />
                        <input
                          type="text"
                          value={editLevelDraft.amaliSub1Title}
                          onChange={(e) =>
                            setEditLevelDraft({ ...editLevelDraft, amaliSub1Title: e.target.value })
                          }
                          placeholder="Amali Sub 1"
                          className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                        />
                        <input
                          type="text"
                          value={editLevelDraft.amaliSub2Title}
                          onChange={(e) =>
                            setEditLevelDraft({ ...editLevelDraft, amaliSub2Title: e.target.value })
                          }
                          placeholder="Amali Sub 2"
                          className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveLevelEdit(l.id)}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-700 rounded inline-flex items-center gap-1"
                        >
                          <Save className="w-3 h-3" />
                          <span>Simpan</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLevelId(null);
                            setEditLevelDraft(null);
                          }}
                          className="px-2.5 py-1.5 text-xs text-slate-600"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={l.id} className="py-3.5 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-mono font-semibold text-[#0a2e6c]">{l.code}</p>
                      <p className="text-sm font-medium text-slate-900">{l.title}</p>
                      <p className="text-xs text-slate-500">
                        Teori: {l.teoriSub1Title} · {l.teoriSub2Title}
                      </p>
                      <p className="text-xs text-slate-500">
                        Amali: {l.amaliSub1Title} · {l.amaliSub2Title}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLevelId(l.id);
                          setEditLevelDraft({
                            code: l.code,
                            title: l.title,
                            teoriSub1Title: l.teoriSub1Title,
                            teoriSub2Title: l.teoriSub2Title,
                            amaliSub1Title: l.amaliSub1Title,
                            amaliSub2Title: l.amaliSub2Title,
                          });
                        }}
                        className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-50 inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Sub</span>
                      </button>

                      {confirmDeleteLevelId === l.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteLevel(l.id)}
                            className="px-2.5 py-1 text-xs text-white bg-red-700 rounded"
                          >
                            Padam
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteLevelId(null)}
                            className="px-2 py-1 text-xs text-slate-600"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteLevelId(l.id)}
                          className="p-1.5 text-red-700 hover:bg-red-50 rounded"
                          aria-label={`Padam ${l.code}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <h3 className="text-base font-bold text-slate-900">Urus Unit Kompetensi (CU)</h3>
            <form onSubmit={handleCreateCu} className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-semibold text-slate-800">Tambah CU Baharu (Slot Kosong Lalai)</p>
              <select
                value={cuLevelId}
                onChange={(e) => setCuLevelId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} — {l.title}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  value={cuCode}
                  onChange={(e) => setCuCode(e.target.value)}
                  placeholder="Kod (CU-04)"
                  className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                />
                <input
                  type="text"
                  required
                  value={cuTitle}
                  onChange={(e) => setCuTitle(e.target.value)}
                  placeholder="Tajuk CU"
                  className="col-span-2 px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <input
                type="text"
                value={cuDesc}
                onChange={(e) => setCuDesc(e.target.value)}
                placeholder="Penerangan modul CU"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              />
              <button
                type="submit"
                className="px-3.5 py-2 text-xs font-medium text-white bg-[#0a2e6c] hover:bg-[#061b44] rounded-lg inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Simpan CU</span>
              </button>
            </form>

            <div className="divide-y divide-slate-200 max-h-[420px] overflow-y-auto">
              {cus.map((cu) => {
                const lvl = levels.find((l) => l.id === cu.levelId);
                return (
                  <div key={cu.id} className="py-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-mono text-slate-500">
                        {lvl?.code} · <span className="text-[#0a2e6c] font-semibold">{cu.code}</span>
                      </p>
                      <p className="text-sm font-medium text-slate-900">{cu.title}</p>
                    </div>
                    {confirmDeleteCuId === cu.id ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDeleteCu(cu.id)}
                          className="px-2.5 py-1 text-xs text-white bg-red-700 rounded"
                        >
                          Sahkan Padam
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteCuId(null)}
                          className="px-2 py-1 text-xs text-slate-600"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteCuId(cu.id)}
                        className="p-1.5 text-red-700 hover:bg-red-50 rounded"
                        aria-label={`Padam ${cu.code}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MATERIAL SLOTS AUDIT */}
      {activeTab === 'slots' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 overflow-x-auto">
          <h3 className="text-base font-bold text-slate-900 mb-4">
            Matriks Status Slot 2 Sub Teori &amp; 2 Sub Amali (Klik untuk Muat Naik / Sunting)
          </h3>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                <th className="py-3 pr-4">CU</th>
                <th className="py-3 px-3">TEORI Sub 1</th>
                <th className="py-3 px-3">TEORI Sub 2</th>
                <th className="py-3 px-3">Google Form</th>
                <th className="py-3 pl-3">AMALI Sub 1 &amp; Sub 2</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {cus.map((cu) => {
                const lvl = levels.find((l) => l.id === cu.levelId);
                const sub1Docs =
                  (cu.teoriSub1.notaSlot ? 1 : 0) + (cu.teoriSub1.panduanSoalanSlot ? 1 : 0);
                const sub2Docs =
                  (cu.teoriSub2.notaSlot ? 1 : 0) + (cu.teoriSub2.panduanSoalanSlot ? 1 : 0);
                const formsCount =
                  (cu.teoriSub1.googleFormUrl ? 1 : 0) + (cu.teoriSub2.googleFormUrl ? 1 : 0);
                const amaliDocs =
                  (cu.amaliSub1.sopDocSlot ? 1 : 0) + (cu.amaliSub2.sopDocSlot ? 1 : 0);
                return (
                  <tr key={cu.id} className="hover:bg-slate-50/60">
                    <td className="py-3 pr-4">
                      <span className="font-mono text-slate-500">{lvl?.code} · {cu.code}</span>
                      <p className="text-sm font-medium text-slate-900">{cu.title}</p>
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums">
                      <button
                        type="button"
                        onClick={() => onJumpToCu(cu.levelId, 'teori', cu.id)}
                        className={sub1Docs > 0 ? 'text-emerald-700 font-medium hover:underline' : 'text-[#0a2e6c] hover:underline'}
                      >
                        {sub1Docs}/2 Fail
                      </button>
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums">
                      <button
                        type="button"
                        onClick={() => onJumpToCu(cu.levelId, 'teori', cu.id)}
                        className={sub2Docs > 0 ? 'text-emerald-700 font-medium hover:underline' : 'text-[#0a2e6c] hover:underline'}
                      >
                        {sub2Docs}/2 Fail
                      </button>
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums">
                      <button
                        type="button"
                        onClick={() => onJumpToCu(cu.levelId, 'latihan', cu.id)}
                        className={formsCount > 0 ? 'text-emerald-700 font-medium hover:underline' : 'text-[#0a2e6c] hover:underline'}
                      >
                        {formsCount}/2 Borang
                      </button>
                    </td>
                    <td className="py-3 pl-3 font-mono tabular-nums">
                      <button
                        type="button"
                        onClick={() => onJumpToCu(cu.levelId, 'amali_sop', cu.id)}
                        className="text-[#0a2e6c] hover:underline"
                      >
                        {amaliDocs}/2 Dok · {cu.amaliSub1.sopSteps.length}+{cu.amaliSub2.sopSteps.length} Langkah
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: BRANDING (LOGO & BANNER) */}
      {activeTab === 'branding' && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Logo Card */}
            <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-[#061b44] flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-[#0a2e6c]" />
                    <span>Logo Portal</span>
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Dipaparkan pada bar atas portal dan skrin log masuk. Format PNG, JPG/JPEG atau WEBP (maks 8MB).
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                  {branding.hasCustomLogo ? 'Logo Tersuai' : 'Logo Asal'}
                </span>
              </div>

              <div className="p-6 rounded-xl bg-[#f4f7fb] border border-slate-200 flex items-center justify-center">
                <img
                  src={branding.logoUrl}
                  alt={`Pratonton Logo ${branding.portalName}`}
                  referrerPolicy="no-referrer"
                  className="w-36 h-36 rounded-full bg-white object-cover border-2 border-[#e5b94c] shadow-sm"
                />
              </div>

              <input
                ref={logoInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleUploadBrandingImage('logo', file);
                  }
                  if (logoInputRef.current) logoInputRef.current.value = '';
                }}
              />

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={brandingBusy}
                  onClick={() => logoInputRef.current?.click()}
                  className="px-4 py-2 text-xs font-medium text-white bg-[#0a2e6c] hover:bg-[#061b44] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{brandingBusy ? 'Memuat naik...' : 'Muat Naik Logo Baharu'}</span>
                </button>

                {branding.hasCustomLogo && (
                  <button
                    type="button"
                    disabled={brandingBusy}
                    onClick={() => handleResetBrandingImage('logo')}
                    className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Guna Logo Asal</span>
                  </button>
                )}
              </div>
            </section>

            {/* Banner Card */}
            <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-[#061b44] flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-[#0a2e6c]" />
                    <span>Banner Portal</span>
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Dipaparkan di bahagian utama ruang belajar dan halaman log masuk. Format PNG, JPG/JPEG atau WEBP (maks 8MB).
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                  {branding.hasCustomBanner ? 'Banner Tersuai' : 'Banner Asal'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#f4f7fb] border border-slate-200 flex items-center justify-center">
                <img
                  src={branding.bannerUrl}
                  alt={`Pratonton Banner ${branding.portalName}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-auto max-h-48 object-contain rounded-lg"
                />
              </div>

              <input
                ref={bannerInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleUploadBrandingImage('banner', file);
                  }
                  if (bannerInputRef.current) bannerInputRef.current.value = '';
                }}
              />

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={brandingBusy}
                  onClick={() => bannerInputRef.current?.click()}
                  className="px-4 py-2 text-xs font-medium text-white bg-[#0a2e6c] hover:bg-[#061b44] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{brandingBusy ? 'Memuat naik...' : 'Muat Naik Banner Baharu'}</span>
                </button>

                {branding.hasCustomBanner && (
                  <button
                    type="button"
                    disabled={brandingBusy}
                    onClick={() => handleResetBrandingImage('banner')}
                    className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Guna Banner Asal</span>
                  </button>
                )}
              </div>
            </section>
          </div>

          {/* Portal Name & Tagline Form */}
          <form
            onSubmit={handleSaveBrandingText}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div>
              <h3 className="text-base font-bold text-[#061b44]">Tajuk &amp; Slogan Portal</h3>
              <p className="mt-1 text-xs text-slate-600">
                Nama dan slogan ini dipaparkan pada bar navigasi atas dan halaman gerbang akses.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Portal
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={portalNameInput}
                  onChange={(e) => setPortalNameInput(e.target.value)}
                  placeholder="SIRKING Learning Portal"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Slogan / Tagline
                </label>
                <input
                  type="text"
                  required
                  maxLength={140}
                  value={portalTaglineInput}
                  onChange={(e) => setPortalTaglineInput(e.target.value)}
                  placeholder="Your Gateway to Knowledge & Success"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={brandingBusy}
              className="px-4 py-2 text-xs font-medium text-white bg-[#0a2e6c] hover:bg-[#061b44] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{brandingBusy ? 'Menyimpan...' : 'Simpan Tetapan Penjenamaan'}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

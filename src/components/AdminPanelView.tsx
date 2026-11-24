import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Edit3,
  Image as ImageIcon,
  KeyRound,
  MessageCircle,
  Plus,
  QrCode,
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

  // Branding, Portal Texts, Payment QR & WhatsApp QR state
  const [portalNameInput, setPortalNameInput] = useState(branding.portalName);
  const [portalTaglineInput, setPortalTaglineInput] = useState(branding.portalTagline);
  const [heroHeadlineInput, setHeroHeadlineInput] = useState(branding.heroHeadline);
  const [feature1TitleInput, setFeature1TitleInput] = useState(branding.feature1Title);
  const [feature1DescInput, setFeature1DescInput] = useState(branding.feature1Desc);
  const [feature2TitleInput, setFeature2TitleInput] = useState(branding.feature2Title);
  const [feature2DescInput, setFeature2DescInput] = useState(branding.feature2Desc);
  const [feature3TitleInput, setFeature3TitleInput] = useState(branding.feature3Title);
  const [feature3DescInput, setFeature3DescInput] = useState(branding.feature3Desc);
  const [authGateTitleInput, setAuthGateTitleInput] = useState(branding.authGateTitle);
  const [authGateSubtitleInput, setAuthGateSubtitleInput] = useState(branding.authGateSubtitle);
  const [welcomePrefixInput, setWelcomePrefixInput] = useState(branding.welcomePrefix);
  const [footerCaptionInput, setFooterCaptionInput] = useState(branding.footerCaption);
  const [pendingTitleInput, setPendingTitleInput] = useState(branding.pendingTitle);
  const [pendingMessageInput, setPendingMessageInput] = useState(branding.pendingMessage);
  const [paymentQrTitleInput, setPaymentQrTitleInput] = useState(branding.paymentQrTitle);
  const [paymentQrNoteInput, setPaymentQrNoteInput] = useState(branding.paymentQrNote);
  const [whatsappQrTitleInput, setWhatsappQrTitleInput] = useState(branding.whatsappQrTitle);
  const [whatsappQrNoteInput, setWhatsappQrNoteInput] = useState(branding.whatsappQrNote);
  const [whatsappUrlInput, setWhatsappUrlInput] = useState(branding.whatsappUrl);
  const [brandingBusy, setBrandingBusy] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const paymentQrInputRef = useRef<HTMLInputElement | null>(null);
  const whatsappQrInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPortalNameInput(branding.portalName);
    setPortalTaglineInput(branding.portalTagline);
    setHeroHeadlineInput(branding.heroHeadline);
    setFeature1TitleInput(branding.feature1Title);
    setFeature1DescInput(branding.feature1Desc);
    setFeature2TitleInput(branding.feature2Title);
    setFeature2DescInput(branding.feature2Desc);
    setFeature3TitleInput(branding.feature3Title);
    setFeature3DescInput(branding.feature3Desc);
    setAuthGateTitleInput(branding.authGateTitle);
    setAuthGateSubtitleInput(branding.authGateSubtitle);
    setWelcomePrefixInput(branding.welcomePrefix);
    setFooterCaptionInput(branding.footerCaption);
    setPendingTitleInput(branding.pendingTitle);
    setPendingMessageInput(branding.pendingMessage);
    setPaymentQrTitleInput(branding.paymentQrTitle);
    setPaymentQrNoteInput(branding.paymentQrNote);
    setWhatsappQrTitleInput(branding.whatsappQrTitle);
    setWhatsappQrNoteInput(branding.whatsappQrNote);
    setWhatsappUrlInput(branding.whatsappUrl);
  }, [
    branding.portalName,
    branding.portalTagline,
    branding.heroHeadline,
    branding.feature1Title,
    branding.feature1Desc,
    branding.feature2Title,
    branding.feature2Desc,
    branding.feature3Title,
    branding.feature3Desc,
    branding.authGateTitle,
    branding.authGateSubtitle,
    branding.welcomePrefix,
    branding.footerCaption,
    branding.pendingTitle,
    branding.pendingMessage,
    branding.paymentQrTitle,
    branding.paymentQrNote,
    branding.whatsappQrTitle,
    branding.whatsappQrNote,
    branding.whatsappUrl,
  ]);

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
      const res = await api.updateBrandingText(token, {
        portalName: portalNameInput,
        portalTagline: portalTaglineInput,
        heroHeadline: heroHeadlineInput,
        feature1Title: feature1TitleInput,
        feature1Desc: feature1DescInput,
        feature2Title: feature2TitleInput,
        feature2Desc: feature2DescInput,
        feature3Title: feature3TitleInput,
        feature3Desc: feature3DescInput,
        authGateTitle: authGateTitleInput,
        authGateSubtitle: authGateSubtitleInput,
        welcomePrefix: welcomePrefixInput,
        footerCaption: footerCaptionInput,
        pendingTitle: pendingTitleInput,
        pendingMessage: pendingMessageInput,
      });
      onBrandingUpdated(res.branding);
      setMsg({ type: 'ok', text: 'Semua tulisan dan tetapan portal berjaya dikemas kini.' });
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal menyimpan tetapan tulisan portal.',
      });
    } finally {
      setBrandingBusy(false);
    }
  }

  async function handleResetPortalTexts() {
    setMsg(null);
    setBrandingBusy(true);
    try {
      const res = await api.updateBrandingText(token, {
        portalName: '',
        portalTagline: '',
        heroHeadline: '',
        feature1Title: '',
        feature1Desc: '',
        feature2Title: '',
        feature2Desc: '',
        feature3Title: '',
        feature3Desc: '',
        authGateTitle: '',
        authGateSubtitle: '',
        welcomePrefix: '',
        footerCaption: '',
        pendingTitle: '',
        pendingMessage: '',
      });
      onBrandingUpdated(res.branding);
      setMsg({ type: 'ok', text: 'Semua tulisan portal ditetapkan semula kepada teks asal.' });
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal menetapkan semula tulisan portal.',
      });
    } finally {
      setBrandingBusy(false);
    }
  }

  async function handleSavePaymentQrText(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBrandingBusy(true);
    try {
      const res = await api.updateBrandingText(token, {
        paymentQrTitle: paymentQrTitleInput,
        paymentQrNote: paymentQrNoteInput,
      });
      onBrandingUpdated(res.branding);
      setMsg({ type: 'ok', text: 'Maklumat QR Pembayaran berjaya dikemas kini.' });
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal menyimpan maklumat QR Pembayaran.',
      });
    } finally {
      setBrandingBusy(false);
    }
  }

  async function handleSaveWhatsappQrText(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBrandingBusy(true);
    try {
      const res = await api.updateBrandingText(token, {
        whatsappQrTitle: whatsappQrTitleInput,
        whatsappQrNote: whatsappQrNoteInput,
        whatsappUrl: whatsappUrlInput,
      });
      onBrandingUpdated(res.branding);
      setMsg({ type: 'ok', text: 'Maklumat QR WhatsApp berjaya dikemas kini.' });
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal menyimpan maklumat QR WhatsApp.',
      });
    } finally {
      setBrandingBusy(false);
    }
  }

  async function handleUploadBrandingImage(
    kind: 'logo' | 'banner' | 'payment-qr' | 'whatsapp-qr',
    file: File
  ) {
    setMsg(null);
    setBrandingBusy(true);
    try {
      const res = await api.uploadBrandingImage(token, kind, file);
      onBrandingUpdated(res.branding);
      setMsg({
        type: 'ok',
        text:
          kind === 'logo'
            ? 'Logo portal berjaya ditukar.'
            : kind === 'banner'
            ? 'Banner portal berjaya ditukar.'
            : kind === 'payment-qr'
            ? 'Imej QR Pembayaran berjaya dimuat naik.'
            : 'Imej QR WhatsApp berjaya dimuat naik.',
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

  async function handleResetBrandingImage(kind: 'logo' | 'banner' | 'payment-qr' | 'whatsapp-qr') {
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
            : kind === 'banner'
            ? 'Banner portal ditetapkan semula kepada banner asal SIRKING.'
            : kind === 'payment-qr'
            ? 'Imej QR Pembayaran telah dipadam.'
            : 'Imej QR WhatsApp telah dipadam.',
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
      <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">Panel Pengurusan Admin Website</h2>
            <p className="mt-1 text-sm text-slate-300">
              Urus pengguna, nama guru, semua tulisan portal, penjenamaan logo, banner &amp; QR, struktur Tahap (2 Sub Teori &amp; 2 Sub Amali), CU, dan semua slot bahan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#071024] border border-[#1a2f5c] rounded-lg self-start">
            {(
              [
                { id: 'users', label: 'Pengguna & Nama Guru' },
                { id: 'curriculum', label: 'Topik Tahap & CU' },
                { id: 'slots', label: 'Audit Slot Bahan' },
                { id: 'branding', label: 'Logo, Banner, QR & Teks' },
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
                    ? 'bg-[#17356e] text-[#f0cb63] shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-slate-100'
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
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                : 'bg-red-950/60 border-red-800/70 text-red-300'
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
          <section className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#1a2f5c]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#f0cb63]" />
                <div>
                  <h3 className="text-base font-bold text-white">
                    Struktur Pentadbir (1 Master Admin &amp; {admins.length}/2 Admin)
                  </h3>
                  <p className="text-xs text-slate-300">
                    Master Admin mengurus kata laluan 2 akaun Admin. Kedua-dua Admin membantu mengurus pelatih, pengajar dan modul.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {masterAdmins.map((m) => (
                <div
                  key={m.id}
                  className="p-4 rounded-xl border border-[#e5b94c]/50 bg-[#10234d] space-y-1.5"
                >
                  <p className="text-xs font-semibold text-[#f0cb63]">1 Master Admin</p>
                  <p className="text-sm font-bold text-white">{m.name}</p>
                  <p className="text-xs font-mono text-slate-300">
                    ID: {m.userId}
                    {isMasterAdmin && m.email ? ` · ${m.email}` : ''}
                  </p>
                  <p className="text-xs text-emerald-400 font-medium pt-1">Akses Penuh Sistem</p>
                </div>
              ))}

              {admins.map((adm, idx) => (
                <div
                  key={adm.id}
                  className="p-4 rounded-xl border border-[#1a2f5c] bg-[#071024] flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-400">Admin #{idx + 1} (Maks 2)</p>
                    <p className="text-sm font-bold text-white">{adm.name}</p>
                    <p className="text-xs font-mono text-slate-300">User ID: {adm.userId}</p>
                    <p
                      className={`text-xs font-medium pt-1 ${
                        adm.passwordConfigured ? 'text-emerald-400' : 'text-amber-400'
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
                      className="self-start px-3 py-1.5 text-xs font-medium text-[#f0cb63] bg-[#102045] border border-[#263f73] hover:bg-[#172e61] rounded-lg inline-flex items-center gap-1.5"
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
                className="pt-4 border-t border-[#1a2f5c] grid sm:grid-cols-3 gap-3 items-end"
              >
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Kata Laluan Semasa ({currentUser.userId})
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    data-lpignore="true"
                    value={ownCurrentPassword}
                    onChange={(e) => setOwnCurrentPassword(e.target.value)}
                    placeholder="Kata laluan semasa"
                    className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 placeholder:text-slate-500 pin-masked focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Kata Laluan Baharu (Min 8 Aksara)
                  </label>
                  <input
                    type="text"
                    required
                    minLength={8}
                    autoComplete="off"
                    data-lpignore="true"
                    value={ownNewPassword}
                    onChange={(e) => setOwnNewPassword(e.target.value)}
                    placeholder="Minimum 8 aksara"
                    className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 placeholder:text-slate-500 pin-masked focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>
                <div>
                  <button
                    type="submit"
                    disabled={ownPassBusy}
                    className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg inline-flex items-center gap-1.5"
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
            className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#f0cb63]" />
              <h3 className="text-base font-bold text-white">
                Tambah Pengajar / Pelatih {isMasterAdmin && admins.length < 2 ? '/ Admin ' : ''}Baharu
              </h3>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Peranan</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'pelatih' | 'pengajar' | 'admin')}
                  className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                >
                  <option value="pengajar">Pengajar (Nama Guru)</option>
                  <option value="pelatih">Pelatih</option>
                  {isMasterAdmin && admins.length < 2 && (
                    <option value="admin">Admin ({admins.length}/2)</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">User ID</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={32}
                  autoComplete="off"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))}
                  placeholder={newRole === 'admin' ? 'Masukkan User ID Admin' : 'Masukkan User ID pengguna'}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nama Penuh</label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nama penuh / Nama Guru"
                  className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                />
              </div>

              {newRole === 'admin' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Kata Laluan Admin (Min 8 Aksara)
                  </label>
                  <input
                    type="text"
                    required
                    minLength={8}
                    autoComplete="off"
                    data-lpignore="true"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 aksara"
                    className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 placeholder:text-slate-500 pin-masked focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    PIN Akses 6 Digit
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    autoComplete="off"
                    data-lpignore="true"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6 digit nombor"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 placeholder:text-slate-500 pin-masked focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>
              )}

              {newRole === 'pelatih' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Nama Guru Penyelia
                    </label>
                    <select
                      value={newSupervisorId}
                      onChange={(e) => setNewSupervisorId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
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
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Tahap Diluluskan
                    </label>
                    <select
                      value={newLevelId}
                      onChange={(e) => setNewLevelId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
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
                  <label className="block text-xs font-medium text-slate-300 mb-1">Status Akaun</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as ApprovalStatus)}
                    className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
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
              className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Pengguna</span>
            </button>
          </form>

          <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 overflow-x-auto">
            <h3 className="text-base font-bold text-white mb-4">
              Senarai Semua Pengguna Berdaftar
            </h3>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1a2f5c] text-xs font-semibold text-slate-400">
                  <th className="py-3 pr-4">Nama &amp; User ID</th>
                  <th className="py-3 px-3">Peranan</th>
                  <th className="py-3 px-3">Penyelia / Tahap</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 pl-3 text-right">Urus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a2f5c] text-sm">
                {loadingUsers ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
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
                        <tr key={u.id} className="bg-[#10234d]/60">
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
                              className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#263f73] rounded bg-[#071024] text-slate-100 placeholder:text-slate-500"
                            />
                            <input
                              type="text"
                              value={editUserDraft.name}
                              onChange={(e) =>
                                setEditUserDraft({ ...editUserDraft, name: e.target.value })
                              }
                              placeholder="Nama Penuh"
                              className="w-full px-2.5 py-1.5 text-xs border border-[#263f73] rounded bg-[#071024] text-slate-100 placeholder:text-slate-500"
                            />
                            {editUserDraft.role === 'admin' ? (
                              <input
                                type="text"
                                minLength={8}
                                autoComplete="off"
                                data-lpignore="true"
                                value={editUserDraft.newPassword}
                                onChange={(e) =>
                                  setEditUserDraft({
                                    ...editUserDraft,
                                    newPassword: e.target.value,
                                  })
                                }
                                placeholder="Kata laluan Admin baharu (min 8 aksara)"
                                className="w-full px-2.5 py-1.5 text-xs border border-[#263f73] rounded bg-[#071024] text-slate-100 placeholder:text-slate-500 pin-masked"
                              />
                            ) : (
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                autoComplete="off"
                                data-lpignore="true"
                                value={editUserDraft.newPin}
                                onChange={(e) =>
                                  setEditUserDraft({
                                    ...editUserDraft,
                                    newPin: e.target.value.replace(/\D/g, '').slice(0, 6),
                                  })
                                }
                                placeholder="PIN 6 digit baharu (kosong jika kekal)"
                                className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#263f73] rounded bg-[#071024] text-slate-100 placeholder:text-slate-500 pin-masked"
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
                              className="px-2.5 py-1.5 text-xs border border-[#263f73] rounded bg-[#071024] text-slate-100"
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
                                  className="w-full px-2 py-1 text-xs border border-[#263f73] rounded bg-[#071024] text-slate-100"
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
                                  className="w-full px-2 py-1 text-xs border border-[#263f73] rounded bg-[#071024] text-slate-100"
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
                              <span className="text-xs text-emerald-400 font-medium">Diluluskan</span>
                            ) : (
                              <select
                                value={editUserDraft.status}
                                onChange={(e) =>
                                  setEditUserDraft({
                                    ...editUserDraft,
                                    status: e.target.value as ApprovalStatus,
                                  })
                                }
                                className="px-2 py-1.5 text-xs border border-[#263f73] rounded bg-[#071024] text-slate-100"
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
                                className="px-2.5 py-1.5 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded inline-flex items-center gap-1"
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
                                className="p-1.5 text-slate-400 hover:text-white"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={u.id} className="hover:bg-[#112247]/50">
                        <td className="py-3.5 pr-4">
                          <p className="font-medium text-white">{u.name}</p>
                          <p className="text-xs font-mono text-slate-400">
                            ID: {u.userId}
                            {u.email && (u.role !== 'master_admin' || isMasterAdmin) ? ` · ${u.email}` : ''}
                          </p>
                        </td>
                        <td className="py-3.5 px-3 text-xs font-mono text-slate-300">{u.role}</td>
                        <td className="py-3.5 px-3 text-xs text-slate-300">
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
                            <span className="text-emerald-400">Diluluskan</span>
                          ) : u.status === 'rejected' ? (
                            <span className="text-red-400">Ditolak</span>
                          ) : (
                            <span className="text-amber-400">Menunggu</span>
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
                                className="px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] rounded-lg hover:bg-[#172e61] inline-flex items-center gap-1"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Edit</span>
                              </button>

                              {confirmDeleteUserId === u.id ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(u.id)}
                                    className="px-2.5 py-1.5 text-xs font-medium text-white bg-red-700 hover:bg-red-600 rounded-lg"
                                  >
                                    Padam
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteUserId(null)}
                                    className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-100"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteUserId(u.id)}
                                  className="p-1.5 text-red-400 hover:bg-red-950/60 rounded-lg"
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
          <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-5">
            <h3 className="text-base font-bold text-white">Urus Topik / Tahap (2 Sub Teori &amp; 2 Sub Amali)</h3>
            <form onSubmit={handleCreateLevel} className="space-y-3 p-4 bg-[#071024] rounded-lg border border-[#1a2f5c]">
              <p className="text-xs font-semibold text-slate-200">Tambah Tahap Baharu</p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  value={lvlCode}
                  onChange={(e) => setLvlCode(e.target.value)}
                  placeholder="Kod (TAHAP 5)"
                  className="px-3 py-2 text-xs font-mono border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                />
                <input
                  type="text"
                  required
                  value={lvlTitle}
                  onChange={(e) => setLvlTitle(e.target.value)}
                  placeholder="Tajuk Tahap"
                  className="col-span-2 px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                />
              </div>
              <input
                type="text"
                value={lvlDesc}
                onChange={(e) => setLvlDesc(e.target.value)}
                placeholder="Penerangan ringkas"
                className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
              />
              <div className="grid sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={lvlTeori1}
                  onChange={(e) => setLvlTeori1(e.target.value)}
                  placeholder="Nama Teori Sub 1"
                  className="px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                />
                <input
                  type="text"
                  value={lvlTeori2}
                  onChange={(e) => setLvlTeori2(e.target.value)}
                  placeholder="Nama Teori Sub 2"
                  className="px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                />
                <input
                  type="text"
                  value={lvlAmali1}
                  onChange={(e) => setLvlAmali1(e.target.value)}
                  placeholder="Nama Amali Sub 1"
                  className="px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                />
                <input
                  type="text"
                  value={lvlAmali2}
                  onChange={(e) => setLvlAmali2(e.target.value)}
                  placeholder="Nama Amali Sub 2"
                  className="px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                />
              </div>
              <button
                type="submit"
                className="px-3.5 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Simpan Tahap</span>
              </button>
            </form>

            <div className="divide-y divide-[#1a2f5c]">
              {levels.map((l) => {
                const isEditing = editingLevelId === l.id && editLevelDraft;
                if (isEditing && editLevelDraft) {
                  return (
                    <div key={l.id} className="py-4 space-y-2.5 bg-[#10234d]/60 px-3 rounded-lg">
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={editLevelDraft.code}
                          onChange={(e) =>
                            setEditLevelDraft({ ...editLevelDraft, code: e.target.value })
                          }
                          className="px-2.5 py-1.5 text-xs font-mono border border-[#263f73] rounded bg-[#071024] text-slate-100"
                        />
                        <input
                          type="text"
                          value={editLevelDraft.title}
                          onChange={(e) =>
                            setEditLevelDraft({ ...editLevelDraft, title: e.target.value })
                          }
                          className="col-span-2 px-2.5 py-1.5 text-xs border border-[#263f73] rounded bg-[#071024] text-slate-100"
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
                          className="px-2.5 py-1.5 text-xs border border-[#263f73] rounded bg-[#071024] text-slate-100"
                        />
                        <input
                          type="text"
                          value={editLevelDraft.teoriSub2Title}
                          onChange={(e) =>
                            setEditLevelDraft({ ...editLevelDraft, teoriSub2Title: e.target.value })
                          }
                          placeholder="Teori Sub 2"
                          className="px-2.5 py-1.5 text-xs border border-[#263f73] rounded bg-[#071024] text-slate-100"
                        />
                        <input
                          type="text"
                          value={editLevelDraft.amaliSub1Title}
                          onChange={(e) =>
                            setEditLevelDraft({ ...editLevelDraft, amaliSub1Title: e.target.value })
                          }
                          placeholder="Amali Sub 1"
                          className="px-2.5 py-1.5 text-xs border border-[#263f73] rounded bg-[#071024] text-slate-100"
                        />
                        <input
                          type="text"
                          value={editLevelDraft.amaliSub2Title}
                          onChange={(e) =>
                            setEditLevelDraft({ ...editLevelDraft, amaliSub2Title: e.target.value })
                          }
                          placeholder="Amali Sub 2"
                          className="px-2.5 py-1.5 text-xs border border-[#263f73] rounded bg-[#071024] text-slate-100"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveLevelEdit(l.id)}
                          className="px-3 py-1.5 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded inline-flex items-center gap-1"
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
                          className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-100"
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
                      <p className="text-xs font-mono font-semibold text-[#f0cb63]">{l.code}</p>
                      <p className="text-sm font-medium text-white">{l.title}</p>
                      <p className="text-xs text-slate-400">
                        Teori: {l.teoriSub1Title} · {l.teoriSub2Title}
                      </p>
                      <p className="text-xs text-slate-400">
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
                        className="px-2.5 py-1 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] rounded hover:bg-[#172e61] inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Sub</span>
                      </button>

                      {confirmDeleteLevelId === l.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteLevel(l.id)}
                            className="px-2.5 py-1 text-xs text-white bg-red-700 hover:bg-red-600 rounded"
                          >
                            Padam
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteLevelId(null)}
                            className="px-2 py-1 text-xs text-slate-400 hover:text-slate-100"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteLevelId(l.id)}
                          className="p-1.5 text-red-400 hover:bg-red-950/60 rounded"
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

          <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-5">
            <h3 className="text-base font-bold text-white">Urus Unit Kompetensi (CU)</h3>
            <form onSubmit={handleCreateCu} className="space-y-3 p-4 bg-[#071024] rounded-lg border border-[#1a2f5c]">
              <p className="text-xs font-semibold text-slate-200">Tambah CU Baharu (Slot Kosong Lalai)</p>
              <select
                value={cuLevelId}
                onChange={(e) => setCuLevelId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
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
                  className="px-3 py-2 text-xs font-mono border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                />
                <input
                  type="text"
                  required
                  value={cuTitle}
                  onChange={(e) => setCuTitle(e.target.value)}
                  placeholder="Tajuk CU"
                  className="col-span-2 px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                />
              </div>
              <input
                type="text"
                value={cuDesc}
                onChange={(e) => setCuDesc(e.target.value)}
                placeholder="Penerangan modul CU"
                className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
              />
              <button
                type="submit"
                className="px-3.5 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Simpan CU</span>
              </button>
            </form>

            <div className="divide-y divide-[#1a2f5c] max-h-[420px] overflow-y-auto">
              {cus.map((cu) => {
                const lvl = levels.find((l) => l.id === cu.levelId);
                return (
                  <div key={cu.id} className="py-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-mono text-slate-400">
                        {lvl?.code} · <span className="text-[#f0cb63] font-semibold">{cu.code}</span>
                      </p>
                      <p className="text-sm font-medium text-white">{cu.title}</p>
                    </div>
                    {confirmDeleteCuId === cu.id ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDeleteCu(cu.id)}
                          className="px-2.5 py-1 text-xs text-white bg-red-700 hover:bg-red-600 rounded"
                        >
                          Sahkan Padam
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteCuId(null)}
                          className="px-2 py-1 text-xs text-slate-400 hover:text-slate-100"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteCuId(cu.id)}
                        className="p-1.5 text-red-400 hover:bg-red-950/60 rounded"
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
        <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 overflow-x-auto">
          <h3 className="text-base font-bold text-white mb-4">
            Matriks Status Slot 2 Sub Teori &amp; 2 Sub Amali (Klik untuk Muat Naik / Sunting)
          </h3>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1a2f5c] text-xs font-semibold text-slate-400">
                <th className="py-3 pr-4">CU</th>
                <th className="py-3 px-3">TEORI Sub 1</th>
                <th className="py-3 px-3">TEORI Sub 2</th>
                <th className="py-3 px-3">Google Form</th>
                <th className="py-3 pl-3">AMALI Sub 1 &amp; Sub 2</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a2f5c] text-xs">
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
                  <tr key={cu.id} className="hover:bg-[#112247]/50">
                    <td className="py-3 pr-4">
                      <span className="font-mono text-slate-400">{lvl?.code} · {cu.code}</span>
                      <p className="text-sm font-medium text-white">{cu.title}</p>
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums">
                      <button
                        type="button"
                        onClick={() => onJumpToCu(cu.levelId, 'teori', cu.id)}
                        className={sub1Docs > 0 ? 'text-emerald-400 font-medium hover:underline' : 'text-[#f0cb63] hover:underline'}
                      >
                        {sub1Docs}/2 Fail
                      </button>
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums">
                      <button
                        type="button"
                        onClick={() => onJumpToCu(cu.levelId, 'teori', cu.id)}
                        className={sub2Docs > 0 ? 'text-emerald-400 font-medium hover:underline' : 'text-[#f0cb63] hover:underline'}
                      >
                        {sub2Docs}/2 Fail
                      </button>
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums">
                      <button
                        type="button"
                        onClick={() => onJumpToCu(cu.levelId, 'latihan', cu.id)}
                        className={formsCount > 0 ? 'text-emerald-400 font-medium hover:underline' : 'text-[#f0cb63] hover:underline'}
                      >
                        {formsCount}/2 Borang
                      </button>
                    </td>
                    <td className="py-3 pl-3 font-mono tabular-nums">
                      <button
                        type="button"
                        onClick={() => onJumpToCu(cu.levelId, 'amali_sop', cu.id)}
                        className="text-sky-300 hover:underline"
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
            <section className="lg:col-span-5 bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-[#f0cb63]" />
                    <span>Logo Portal</span>
                  </h3>
                  <p className="mt-1 text-xs text-slate-300">
                    Dipaparkan pada bar atas portal dan skrin log masuk. Format PNG, JPG/JPEG atau WEBP (maks 8MB).
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-400 whitespace-nowrap">
                  {branding.hasCustomLogo ? 'Logo Tersuai' : 'Logo Asal'}
                </span>
              </div>

              <div className="p-6 rounded-xl bg-[#071024] border border-[#1a2f5c] flex items-center justify-center">
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
                  className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{brandingBusy ? 'Memuat naik...' : 'Muat Naik Logo Baharu'}</span>
                </button>

                {branding.hasCustomLogo && (
                  <button
                    type="button"
                    disabled={brandingBusy}
                    onClick={() => handleResetBrandingImage('logo')}
                    className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Guna Logo Asal</span>
                  </button>
                )}
              </div>
            </section>

            {/* Banner Card */}
            <section className="lg:col-span-7 bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-[#f0cb63]" />
                    <span>Banner Portal</span>
                  </h3>
                  <p className="mt-1 text-xs text-slate-300">
                    Dipaparkan di bahagian utama ruang belajar dan halaman log masuk. Format PNG, JPG/JPEG atau WEBP (maks 8MB).
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-400 whitespace-nowrap">
                  {branding.hasCustomBanner ? 'Banner Tersuai' : 'Banner Asal'}
                </span>
              </div>

              <div className="rounded-xl overflow-hidden bg-[#041029] border border-[#263f73]">
                <img
                  src={branding.bannerUrl}
                  alt={`Pratonton Banner ${branding.portalName}`}
                  referrerPolicy="no-referrer"
                  className="w-full aspect-[1408/388] object-cover object-center block"
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
                  className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{brandingBusy ? 'Memuat naik...' : 'Muat Naik Banner Baharu'}</span>
                </button>

                {branding.hasCustomBanner && (
                  <button
                    type="button"
                    disabled={brandingBusy}
                    onClick={() => handleResetBrandingImage('banner')}
                    className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Guna Banner Asal</span>
                  </button>
                )}
              </div>
            </section>
          </div>

          {/* QR Pembayaran & QR WhatsApp (Bawah Portal di Setiap Halaman) */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* QR Pembayaran */}
            <section className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-[#f0cb63]" />
                    <span>QR Pembayaran (Bawah Portal)</span>
                  </h3>
                  <p className="mt-1 text-xs text-slate-300">
                    Dipaparkan di bahagian bawah setiap halaman. Format PNG, JPG/JPEG atau WEBP (maks 8MB).
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-400 whitespace-nowrap">
                  {branding.hasPaymentQr ? 'Aktif' : 'Belum Ditetapkan'}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
                <div className="p-3 rounded-xl bg-[#071024] border border-[#1a2f5c] flex items-center justify-center shrink-0">
                  {branding.paymentQrUrl ? (
                    <div className="w-28 h-28 rounded-lg bg-white p-1.5 border border-[#263f73]">
                      <img
                        src={branding.paymentQrUrl}
                        alt={branding.paymentQrTitle || 'QR Pembayaran'}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-28 h-28 rounded-lg border border-dashed border-[#263f73] bg-[#0b1733] flex flex-col items-center justify-center p-2 text-center">
                      <QrCode className="w-6 h-6 text-slate-500 mb-1" />
                      <span className="text-[11px] text-slate-400">Tiada QR</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5 flex-1">
                  <input
                    ref={paymentQrInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleUploadBrandingImage('payment-qr', file);
                      }
                      if (paymentQrInputRef.current) paymentQrInputRef.current.value = '';
                    }}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={brandingBusy}
                      onClick={() => paymentQrInputRef.current?.click()}
                      className="px-3.5 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{branding.hasPaymentQr ? 'Tukar Imej QR' : 'Muat Naik QR'}</span>
                    </button>

                    {branding.hasPaymentQr && (
                      <button
                        type="button"
                        disabled={brandingBusy}
                        onClick={() => handleResetBrandingImage('payment-qr')}
                        className="px-3 py-2 text-xs font-medium text-red-300 bg-red-950/50 border border-red-800/60 hover:bg-red-900/60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Padam QR</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <form onSubmit={handleSavePaymentQrText} className="space-y-3 pt-2 border-t border-[#1a2f5c]">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Tajuk QR Pembayaran
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={paymentQrTitleInput}
                    onChange={(e) => setPaymentQrTitleInput(e.target.value)}
                    placeholder="QR Pembayaran"
                    className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nota / Nama Penerima Pembayaran
                  </label>
                  <input
                    type="text"
                    maxLength={160}
                    value={paymentQrNoteInput}
                    onChange={(e) => setPaymentQrNoteInput(e.target.value)}
                    placeholder="Imbas QR untuk bayaran rasmi portal."
                    className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={brandingBusy}
                  className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{brandingBusy ? 'Menyimpan...' : 'Simpan QR Pembayaran'}</span>
                </button>
              </form>
            </section>

            {/* QR WhatsApp */}
            <section className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-emerald-400" />
                    <span>QR WhatsApp (Bawah Portal)</span>
                  </h3>
                  <p className="mt-1 text-xs text-slate-300">
                    Dipaparkan di sebelah QR Pembayaran di bahagian bawah setiap halaman. Format PNG, JPG/JPEG atau WEBP (maks 8MB).
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-400 whitespace-nowrap">
                  {branding.hasWhatsappQr ? 'Aktif' : 'Belum Ditetapkan'}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
                <div className="p-3 rounded-xl bg-[#071024] border border-[#1a2f5c] flex items-center justify-center shrink-0">
                  {branding.whatsappQrUrl ? (
                    <div className="w-28 h-28 rounded-lg bg-white p-1.5 border border-[#263f73]">
                      <img
                        src={branding.whatsappQrUrl}
                        alt={branding.whatsappQrTitle || 'QR WhatsApp'}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-28 h-28 rounded-lg border border-dashed border-[#263f73] bg-[#0b1733] flex flex-col items-center justify-center p-2 text-center">
                      <MessageCircle className="w-6 h-6 text-emerald-500/60 mb-1" />
                      <span className="text-[11px] text-slate-400">Tiada QR</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5 flex-1">
                  <input
                    ref={whatsappQrInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleUploadBrandingImage('whatsapp-qr', file);
                      }
                      if (whatsappQrInputRef.current) whatsappQrInputRef.current.value = '';
                    }}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={brandingBusy}
                      onClick={() => whatsappQrInputRef.current?.click()}
                      className="px-3.5 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{branding.hasWhatsappQr ? 'Tukar Imej QR' : 'Muat Naik QR'}</span>
                    </button>

                    {branding.hasWhatsappQr && (
                      <button
                        type="button"
                        disabled={brandingBusy}
                        onClick={() => handleResetBrandingImage('whatsapp-qr')}
                        className="px-3 py-2 text-xs font-medium text-red-300 bg-red-950/50 border border-red-800/60 hover:bg-red-900/60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Padam QR</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <form onSubmit={handleSaveWhatsappQrText} className="space-y-3 pt-2 border-t border-[#1a2f5c]">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Tajuk QR WhatsApp
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={whatsappQrTitleInput}
                    onChange={(e) => setWhatsappQrTitleInput(e.target.value)}
                    placeholder="QR WhatsApp"
                    className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nota / Keterangan WhatsApp
                  </label>
                  <input
                    type="text"
                    maxLength={160}
                    value={whatsappQrNoteInput}
                    onChange={(e) => setWhatsappQrNoteInput(e.target.value)}
                    placeholder="Imbas QR untuk hubungi kami di WhatsApp."
                    className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>
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
                <button
                  type="submit"
                  disabled={brandingBusy}
                  className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{brandingBusy ? 'Menyimpan...' : 'Simpan QR WhatsApp'}</span>
                </button>
              </form>
            </section>
          </div>

          {/* Master Editor: Semua Tulisan Portal */}
          <form
            onSubmit={handleSaveBrandingText}
            className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1a2f5c]">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-[#f0cb63]" />
                  <span>Master Editor — Semua Tulisan Portal</span>
                </h3>
                <p className="mt-1 text-xs text-slate-300">
                  Sunting nama portal, slogan, tajuk utama, 3 kad pengenalan, gerbang log masuk, mesej alu-aluan, notis kelulusan, dan keterangan footer portal.
                </p>
              </div>
              <button
                type="button"
                disabled={brandingBusy}
                onClick={handleResetPortalTexts}
                className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 self-start whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Set Semula Teks Asal</span>
              </button>
            </div>

            {/* Group 1: Identiti & Tajuk Utama */}
            <div className="space-y-4">
              <p className="text-xs font-semibold text-[#f0cb63]">
                1. Nama Portal, Slogan &amp; Tajuk Utama Halaman Depan
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nama Portal
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={portalNameInput}
                    onChange={(e) => setPortalNameInput(e.target.value)}
                    placeholder="SIRKING Learning Portal"
                    className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Slogan / Tagline
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={140}
                    value={portalTaglineInput}
                    onChange={(e) => setPortalTaglineInput(e.target.value)}
                    placeholder="Your Gateway to Knowledge & Success"
                    className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Tajuk Utama Hero (Halaman Log Masuk)
                </label>
                <input
                  type="text"
                  required
                  maxLength={180}
                  value={heroHeadlineInput}
                  onChange={(e) => setHeroHeadlineInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                />
              </div>
            </div>

            {/* Group 2: 3 Kad Ciri Halaman Depan */}
            <div className="space-y-4 pt-4 border-t border-[#1a2f5c]">
              <p className="text-xs font-semibold text-[#f0cb63]">
                2. Tiga Blok Penerangan Halaman Utama
              </p>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-[#071024] border border-[#1a2f5c] space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Tajuk Blok 01
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={feature1TitleInput}
                      onChange={(e) => setFeature1TitleInput(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Huraian Blok 01
                    </label>
                    <textarea
                      rows={3}
                      required
                      maxLength={260}
                      value={feature1DescInput}
                      onChange={(e) => setFeature1DescInput(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#071024] border border-[#1a2f5c] space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Tajuk Blok 02
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={feature2TitleInput}
                      onChange={(e) => setFeature2TitleInput(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Huraian Blok 02
                    </label>
                    <textarea
                      rows={3}
                      required
                      maxLength={260}
                      value={feature2DescInput}
                      onChange={(e) => setFeature2DescInput(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#071024] border border-[#1a2f5c] space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Tajuk Blok 03
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={feature3TitleInput}
                      onChange={(e) => setFeature3TitleInput(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Huraian Blok 03
                    </label>
                    <textarea
                      rows={3}
                      required
                      maxLength={260}
                      value={feature3DescInput}
                      onChange={(e) => setFeature3DescInput(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Group 3: Gerbang Akses, Alu-aluan & Footer */}
            <div className="space-y-4 pt-4 border-t border-[#1a2f5c]">
              <p className="text-xs font-semibold text-[#f0cb63]">
                3. Gerbang Log Masuk, Alu-aluan Ruang Kerja, Kelulusan &amp; Footer
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Tajuk Gerbang Log Masuk
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={authGateTitleInput}
                    onChange={(e) => setAuthGateTitleInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Subtajuk Gerbang Log Masuk
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={220}
                    value={authGateSubtitleInput}
                    onChange={(e) => setAuthGateSubtitleInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Awalan Mesej Alu-aluan (cth: Selamat Datang)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={welcomePrefixInput}
                    onChange={(e) => setWelcomePrefixInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Keterangan Bar Bawah (Footer QR)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={160}
                    value={footerCaptionInput}
                    onChange={(e) => setFooterCaptionInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Tajuk Halaman Menunggu Kelulusan
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={pendingTitleInput}
                    onChange={(e) => setPendingTitleInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Mesej Halaman Menunggu Kelulusan
                  </label>
                  <textarea
                    rows={2}
                    required
                    maxLength={320}
                    value={pendingMessageInput}
                    onChange={(e) => setPendingMessageInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#263f73] rounded-lg bg-[#071024] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={brandingBusy}
              className="px-5 py-2.5 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{brandingBusy ? 'Menyimpan...' : 'Simpan Semua Tulisan Portal'}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

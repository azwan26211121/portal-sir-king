import React, { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import type {
  AuthStatusResponse,
  BrandingConfig,
  PublicUser,
  TeacherOption,
  TopicLevel,
} from '../types.ts';
import { PortalQrFooter } from './PortalQrFooter.tsx';

interface AuthGateProps {
  branding: BrandingConfig;
  onAuthenticated: (token: string, user: PublicUser) => void;
}

export function AuthGate({ branding, onAuthenticated }: AuthGateProps) {
  const [portalView, setPortalView] = useState<'user' | 'admin'>('user');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginRole, setLoginRole] = useState<'pelatih' | 'pengajar'>('pelatih');
  const [regRole, setRegRole] = useState<'pelatih' | 'pengajar'>('pelatih');
  const [claimMode, setClaimMode] = useState(false);

  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [levels, setLevels] = useState<TopicLevel[]>([]);
  const [bannerImgFailed, setBannerImgFailed] = useState(false);
  const [logoImgFailed, setLogoImgFailed] = useState(false);

  // User login fields (Pelatih / Pengajar)
  const [loginUserId, setLoginUserId] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [showRegPin, setShowRegPin] = useState(false);

  // Restricted Administrator fields (ID Pentadbir atau Emel)
  const [adminIdentifier, setAdminIdentifier] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');

  // Register fields
  const [regUserId, setRegUserId] = useState('');
  const [regName, setRegName] = useState('');
  const [regIcNumber, setRegIcNumber] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPin, setRegPin] = useState('');
  const [regSupervisorId, setRegSupervisorId] = useState('');
  const [regLevelId, setRegLevelId] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setBannerImgFailed(false);
    setLogoImgFailed(false);
  }, [branding.bannerUrl, branding.logoUrl]);

  useEffect(() => {
    let active = true;
    Promise.all([api.getAuthStatus(), api.getPublicInfo()])
      .then(([status, info]) => {
        if (!active) return;
        setAuthStatus(status);
        if (!status.adminConfigured) {
          setClaimMode(true);
        }
        setTeachers(info.teachers);
        setLevels(info.levels);
        if (info.levels.length > 0) {
          setRegLevelId(info.levels[0].id);
        }
        if (info.teachers.length > 0) {
          setRegSupervisorId(info.teachers[0].id);
        }
      })
      .catch(() => {
        if (!active) return;
        setErrorMsg('Gagal memuatkan maklumat portal. Sila muat semula halaman.');
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleUserLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!loginUserId.trim()) {
      setErrorMsg('Sila masukkan User ID anda.');
      return;
    }
    if (!/^\d{6}$/.test(loginPin)) {
      setErrorMsg('Sila masukkan PIN akses tepat 6 digit nombor.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.loginWithPin(loginRole, loginUserId.trim(), loginPin);
      onAuthenticated(res.token, res.user);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Log masuk gagal. Sila cuba lagi.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdminLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const identifier = adminIdentifier.trim();

    if (!identifier) {
      setErrorMsg('Sila masukkan ID pentadbir atau emel rasmi.');
      return;
    }
    if (!adminPassword) {
      setErrorMsg('Sila masukkan kata laluan pentadbir.');
      return;
    }

    setLoading(true);
    try {
      if (claimMode && authStatus && !authStatus.adminConfigured) {
        if (!identifier.includes('@')) {
          setErrorMsg('Sila masukkan alamat emel pentadbir utama yang berdaftar.');
          setLoading(false);
          return;
        }
        if (adminPassword.length < 8) {
          setErrorMsg('Kata laluan baharu mestilah sekurang-kurangnya 8 aksara.');
          setLoading(false);
          return;
        }
        if (adminPassword !== adminConfirmPassword) {
          setErrorMsg('Pengesahan kata laluan tidak sepadan.');
          setLoading(false);
          return;
        }
        const res = await api.claimAdminPassword(identifier, adminPassword);
        onAuthenticated(res.token, res.user);
        return;
      }

      if (identifier.includes('@')) {
        const res = await api.loginMasterAdmin(identifier, adminPassword);
        onAuthenticated(res.token, res.user);
      } else {
        const res = await api.loginAdmin(identifier, adminPassword);
        onAuthenticated(res.token, res.user);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Pengesahan pentadbir gagal. Sila semak maklumat anda.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(regUserId.trim())) {
      setErrorMsg('User ID mestilah 3–32 aksara (huruf, nombor, titik, garis bawah atau sengkang).');
      return;
    }
    if (!/^\d{6}$/.test(regPin)) {
      setErrorMsg('PIN akses mestilah tepat 6 digit nombor.');
      return;
    }
    const cleanEmail = regEmail.trim().toLowerCase();
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMsg('Format emel Google tidak sah. Contoh: nama@gmail.com');
      return;
    }
    setLoading(true);
    try {
      const res = await api.registerUser({
        role: regRole,
        userId: regUserId.trim(),
        name: regName,
        icNumber: regIcNumber.trim(),
        email: cleanEmail || undefined,
        pin: regPin,
        supervisorId: regRole === 'pelatih' ? regSupervisorId : undefined,
        requestedLevelId: regRole === 'pelatih' ? regLevelId : undefined,
      });
      onAuthenticated(res.token, res.user);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Pendaftaran gagal.');
    } finally {
      setLoading(false);
    }
  }

  function switchToAdminView() {
    setPortalView('admin');
    setErrorMsg(null);
    setAdminPassword('');
    setAdminConfirmPassword('');
    setShowSecret(false);
    setClaimMode(Boolean(authStatus && !authStatus.adminConfigured));
  }

  function switchToUserView() {
    setPortalView('user');
    setErrorMsg(null);
    setAdminPassword('');
    setAdminConfirmPassword('');
    setShowSecret(false);
    setClaimMode(false);
  }

  return (
    <div className="min-h-screen bg-[#060d1f] text-slate-100 flex flex-col">
      <div className="flex-1 grid lg:grid-cols-12 items-stretch">
        {/* Left Architectural Hero Column — SIRKING Royal Navy & Gold Banner Theme */}
        <div className="lg:col-span-7 relative bg-gradient-to-br from-[#040c21] via-[#071b45] to-[#0a2f6e] flex flex-col justify-between overflow-hidden min-h-[380px]">
        <div
          aria-hidden="true"
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#38bdf8]/12 blur-3xl pointer-events-none"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-[#c59b38]/12 blur-3xl pointer-events-none"
        />

        <div className="relative z-10 p-8 lg:p-12 space-y-6">
          <div className="flex items-center gap-5 sm:gap-6">
            {!logoImgFailed ? (
              <img
                src={branding.logoUrl}
                alt={`Logo ${branding.portalName}`}
                referrerPolicy="no-referrer"
                onError={() => setLogoImgFailed(true)}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white object-cover border-[3px] border-[#e5b94c] shadow-xl shrink-0"
              />
            ) : (
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white text-[#061b44] font-bold text-2xl flex items-center justify-center border-[3px] border-[#e5b94c] shrink-0">
                SK
              </div>
            )}
            <div className="min-w-0">
              <p className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#f0cb63] tracking-tight font-display leading-tight text-balance">
                {branding.portalName}
              </p>
              <p className="text-sm sm:text-base text-slate-200 mt-1.5 leading-snug">
                {branding.portalTagline}
              </p>
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight max-w-2xl text-balance leading-tight">
            {branding.heroHeadline}
          </h1>

          {/* Featured Portal Banner — Full-bleed edge-to-edge, zero white space */}
          <div className="w-full rounded-2xl overflow-hidden border border-[#2a4a8a] bg-[#041029] shadow-2xl">
            {!bannerImgFailed ? (
              <img
                src={branding.bannerUrl}
                alt={`Banner rasmi ${branding.portalName}`}
                referrerPolicy="no-referrer"
                onError={() => setBannerImgFailed(true)}
                className="w-full aspect-[1408/388] min-h-[160px] sm:min-h-[200px] object-cover object-center block"
              />
            ) : (
              <div className="h-44 bg-gradient-to-r from-[#041434] to-[#0b3d86] flex flex-col items-center justify-center px-6 text-center">
                <p className="text-xl font-bold text-white">{branding.portalName}</p>
                <p className="text-xs text-[#f0cb63] mt-1">{branding.portalTagline}</p>
              </div>
            )}
          </div>
        </div>

        <div className="relative z-10 p-8 lg:p-12 pt-4">
          <div className="grid sm:grid-cols-3 gap-6 border-t border-white/15 pt-6">
            <div>
              <p className="text-sm font-semibold text-[#f0cb63]">{branding.feature1Title}</p>
              <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">
                {branding.feature1Desc}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#f0cb63]">{branding.feature2Title}</p>
              <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">
                {branding.feature2Desc}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#f0cb63]">{branding.feature3Title}</p>
              <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">
                {branding.feature3Desc}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Authentication Form Column */}
      <div className="lg:col-span-5 flex flex-col justify-between px-6 py-10 sm:px-12 lg:px-14 bg-[#0b1733] border-l border-[#1a2f5c]">
        <div className="w-full max-w-md mx-auto my-auto">
          {portalView === 'user' ? (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  {branding.authGateTitle}
                </h2>
                <p className="mt-2 text-sm text-slate-300">
                  {branding.authGateSubtitle}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 bg-[#071024] border border-[#1a2f5c] rounded-lg mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg(null);
                  }}
                  className={`py-2 px-4 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                    mode === 'login'
                      ? 'bg-[#17356e] text-[#f0cb63] shadow-sm font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Log Masuk
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMsg(null);
                  }}
                  className={`py-2 px-4 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                    mode === 'register'
                      ? 'bg-[#17356e] text-[#f0cb63] shadow-sm font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Daftar Baru
                </button>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="mb-5 p-3.5 rounded-lg border border-red-800/70 bg-red-950/60 text-sm text-red-300"
                >
                  {errorMsg}
                </div>
              )}

              {mode === 'login' ? (
                <form onSubmit={handleUserLoginSubmit} autoComplete="off" className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">
                      Peranan Pengguna
                    </label>
                    <div className="grid grid-cols-2 gap-1 p-1 bg-[#071024] border border-[#1a2f5c] rounded-lg">
                      {(
                        [
                          { id: 'pelatih', label: 'Pelatih' },
                          { id: 'pengajar', label: 'Pengajar' },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setLoginRole(item.id);
                            setErrorMsg(null);
                          }}
                          className={`py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            loginRole === item.id
                              ? 'bg-[#17356e] text-[#f0cb63] shadow-sm font-semibold'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="login-userid" className="block text-sm font-medium text-slate-200 mb-1.5">
                      User ID ({loginRole === 'pengajar' ? 'Pengajar' : 'Pelatih'})
                    </label>
                    <input
                      id="login-userid"
                      name="portal_user_identifier"
                      type="text"
                      required
                      autoComplete="off"
                      spellCheck={false}
                      data-lpignore="true"
                      data-form-type="other"
                      value={loginUserId}
                      onChange={(e) => setLoginUserId(e.target.value)}
                      placeholder="Masukkan User ID anda"
                      className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#071024] text-slate-100 placeholder:text-slate-500 border border-[#263f73] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                    />
                  </div>

                  <div>
                    <label htmlFor="login-pin" className="block text-sm font-medium text-slate-200 mb-1.5">
                      PIN Akses 6 Digit
                    </label>
                    <div className="relative">
                      <input
                        id="login-pin"
                        name="portal_access_code"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        autoComplete="off"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-form-type="other"
                        value={loginPin}
                        onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Masukkan 6 digit PIN"
                        className={`w-full px-3.5 py-2.5 pr-10 text-sm font-mono tabular-nums tracking-[0.25em] bg-[#071024] text-slate-100 placeholder:text-slate-500 border border-[#263f73] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e5b94c] ${
                          showSecret ? '' : 'pin-masked'
                        }`}
                      />
                      <button
                        type="button"
                        aria-label="Tunjuk atau sembunyi PIN"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white"
                      >
                        {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 text-[#041434] text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>{loading ? 'Mengesahkan...' : 'Log Masuk ke Portal'}</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegisterSubmit} autoComplete="off" className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-2">
                      Daftar Sebagai
                    </label>
                    <div className="grid grid-cols-2 gap-1 p-1 bg-[#071024] border border-[#1a2f5c] rounded-lg">
                      <button
                        type="button"
                        onClick={() => setRegRole('pelatih')}
                        className={`py-2 px-3 text-xs font-medium rounded-md transition-colors ${
                          regRole === 'pelatih'
                            ? 'bg-[#17356e] text-[#f0cb63] shadow-sm font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Pelatih
                      </button>
                      <button
                        type="button"
                        onClick={() => setRegRole('pengajar')}
                        className={`py-2 px-3 text-xs font-medium rounded-md transition-colors ${
                          regRole === 'pengajar'
                            ? 'bg-[#17356e] text-[#f0cb63] shadow-sm font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Pengajar
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reg-userid" className="block text-sm font-medium text-slate-200 mb-1.5">
                      User ID (Untuk Log Masuk)
                    </label>
                    <input
                      id="reg-userid"
                      name="register_user_identifier"
                      type="text"
                      required
                      minLength={3}
                      maxLength={32}
                      autoComplete="off"
                      spellCheck={false}
                      data-lpignore="true"
                      value={regUserId}
                      onChange={(e) => setRegUserId(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))}
                      placeholder="3–32 aksara (huruf, nombor, titik atau sengkang)"
                      className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#071024] text-slate-100 placeholder:text-slate-500 border border-[#263f73] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-name" className="block text-sm font-medium text-slate-200 mb-1.5">
                      {regRole === 'pengajar' ? 'Nama Guru / Pengajar' : 'Nama Penuh Pelatih'}
                    </label>
                    <input
                      id="reg-name"
                      name="register_full_name"
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      autoComplete="off"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Masukkan nama penuh rasmi"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#071024] text-slate-100 placeholder:text-slate-500 border border-[#263f73] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-ic" className="block text-sm font-medium text-slate-200 mb-1.5">
                      No. Kad Pengenalan (MyKad)
                    </label>
                    <input
                      id="reg-ic"
                      name="register_ic_number"
                      type="text"
                      required={regRole === 'pelatih'}
                      maxLength={20}
                      autoComplete="off"
                      value={regIcNumber}
                      onChange={(e) => setRegIcNumber(e.target.value.replace(/[^0-9-]/g, '').slice(0, 20))}
                      placeholder="cth: 020514-10-1234"
                      className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-[#071024] text-slate-100 placeholder:text-slate-500 border border-[#263f73] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-email" className="block text-sm font-medium text-slate-200 mb-1.5">
                      Emel Google (Untuk Kebenaran Akses Rekod Drive)
                    </label>
                    <input
                      id="reg-email"
                      name="register_google_email"
                      type="email"
                      maxLength={120}
                      autoComplete="off"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="cth: nama@gmail.com (pilihan / disyorkan)"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#071024] text-slate-100 placeholder:text-slate-500 border border-[#263f73] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                    />
                  </div>

                  {regRole === 'pelatih' && (
                    <>
                      <div>
                        <label htmlFor="reg-supervisor" className="block text-sm font-medium text-slate-200 mb-1.5">
                          Pilih Nama Guru Penyelia
                        </label>
                        <select
                          id="reg-supervisor"
                          value={regSupervisorId}
                          onChange={(e) => setRegSupervisorId(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-sm bg-[#071024] text-slate-100 border border-[#263f73] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                        >
                          {teachers.length > 0 ? (
                            teachers.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))
                          ) : (
                            <option value="">Pentadbir Portal (Tiada pengajar berdaftar lagi)</option>
                          )}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="reg-level" className="block text-sm font-medium text-slate-200 mb-1.5">
                          Pilih Topik / Tahap Dipohon
                        </label>
                        <select
                          id="reg-level"
                          required
                          value={regLevelId}
                          onChange={(e) => setRegLevelId(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-sm bg-[#071024] text-slate-100 border border-[#263f73] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                        >
                          {levels.map((lvl) => (
                            <option key={lvl.id} value={lvl.id}>
                              {lvl.code} — {lvl.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  <div>
                    <label htmlFor="reg-pin" className="block text-sm font-medium text-slate-200 mb-1.5">
                      Tetapkan PIN Akses 6 Digit
                    </label>
                    <div className="relative">
                      <input
                        id="reg-pin"
                        name="register_pin_code"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        autoComplete="off"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-form-type="other"
                        value={regPin}
                        onChange={(e) => setRegPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Masukkan 6 digit PIN pilihan"
                        className={`w-full px-3.5 py-2.5 pr-10 text-sm font-mono tabular-nums tracking-[0.25em] bg-[#071024] text-slate-100 placeholder:text-slate-500 border border-[#263f73] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e5b94c] ${
                          showRegPin ? '' : 'pin-masked'
                        }`}
                      />
                      <button
                        type="button"
                        aria-label="Tunjuk atau sembunyi PIN"
                        onClick={() => setShowRegPin(!showRegPin)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white"
                      >
                        {showRegPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {regRole === 'pelatih' && (
                    <p className="text-xs text-slate-400 leading-relaxed flex items-start gap-2">
                      <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                      <span>
                        Permohonan pelatih akan berstatus menunggu kelulusan sehingga diluluskan oleh Nama Guru pilihan anda.
                      </span>
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 text-[#041434] text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>{loading ? 'Mendaftarkan...' : 'Hantar Pendaftaran'}</span>
                  </button>
                </form>
              )}
            </>
          ) : (
            /* Restricted Private Administrator Login View */
            <>
              <div className="mb-6">
                <button
                  type="button"
                  onClick={switchToUserView}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-[#f0cb63] mb-5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Kembali ke Log Masuk Pelatih &amp; Pengajar</span>
                </button>
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-[#122652] border border-[#264380] flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5 text-[#f0cb63]" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">
                      Akses Pentadbir Terhad
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Log masuk khusus untuk pentadbiran dan pengurusan portal.
                    </p>
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="mb-5 p-3.5 rounded-lg border border-red-800/70 bg-red-950/60 text-sm text-red-300"
                >
                  {errorMsg}
                </div>
              )}

              {claimMode && authStatus && !authStatus.adminConfigured && (
                <div className="mb-5 p-3.5 rounded-lg border border-[#264380] bg-[#081228] text-xs text-slate-300 leading-relaxed">
                  Masukkan emel pentadbir utama yang berdaftar serta tetapkan kata laluan baharu sekurang-kurangnya 8 aksara.
                </div>
              )}

              <form onSubmit={handleAdminLoginSubmit} autoComplete="off" className="space-y-4">
                <div>
                  <label htmlFor="admin-identifier" className="block text-sm font-medium text-slate-200 mb-1.5">
                    {claimMode ? 'Emel Pentadbir Utama' : 'ID Pentadbir atau Emel'}
                  </label>
                  <input
                    id="admin-identifier"
                    name="portal_staff_identifier"
                    type={claimMode ? 'email' : 'text'}
                    required
                    autoComplete="off"
                    spellCheck={false}
                    data-lpignore="true"
                    value={adminIdentifier}
                    onChange={(e) => setAdminIdentifier(e.target.value)}
                    placeholder={claimMode ? 'Masukkan emel berdaftar' : 'Masukkan ID atau emel pentadbir'}
                    className="w-full px-3.5 py-2.5 text-sm bg-[#071024] text-slate-100 placeholder:text-slate-500 border border-[#263f73] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                  />
                </div>

                <div>
                  <label htmlFor="admin-pass" className="block text-sm font-medium text-slate-200 mb-1.5">
                    {claimMode ? 'Kata Laluan Baharu (Min 8 Aksara)' : 'Kata Laluan'}
                  </label>
                  <div className="relative">
                    <input
                      id="admin-pass"
                      name="portal_staff_secret"
                      type={claimMode ? 'text' : showSecret ? 'text' : 'password'}
                      required
                      minLength={claimMode ? 8 : 1}
                      autoComplete={claimMode ? 'off' : 'current-password'}
                      data-lpignore={claimMode ? 'true' : undefined}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Masukkan kata laluan"
                      className={`w-full px-3.5 py-2.5 pr-10 text-sm bg-[#071024] text-slate-100 placeholder:text-slate-500 border border-[#263f73] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e5b94c] ${
                        claimMode && !showSecret ? 'pin-masked' : ''
                      }`}
                    />
                    <button
                      type="button"
                      aria-label="Tunjuk atau sembunyi kata laluan"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white"
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {claimMode && authStatus && !authStatus.adminConfigured && (
                  <div>
                    <label htmlFor="admin-pass-confirm" className="block text-sm font-medium text-slate-200 mb-1.5">
                      Sahkan Kata Laluan Baharu
                    </label>
                    <input
                      id="admin-pass-confirm"
                      name="portal_staff_secret_confirm"
                      type="text"
                      required
                      minLength={8}
                      autoComplete="off"
                      data-lpignore="true"
                      data-form-type="other"
                      value={adminConfirmPassword}
                      onChange={(e) => setAdminConfirmPassword(e.target.value)}
                      placeholder="Ulang kata laluan baharu"
                      className={`w-full px-3.5 py-2.5 text-sm bg-[#071024] text-slate-100 placeholder:text-slate-500 border border-[#263f73] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e5b94c] ${
                        showSecret ? '' : 'pin-masked'
                      }`}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 text-[#041434] text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {loading
                      ? 'Mengesahkan...'
                      : claimMode
                      ? 'Aktifkan & Masuk Portal'
                      : 'Log Masuk Pentadbir'}
                  </span>
                </button>

                {authStatus && !authStatus.adminConfigured && (
                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setClaimMode(!claimMode);
                        setErrorMsg(null);
                      }}
                      className="text-xs font-medium text-[#f0cb63] hover:underline"
                    >
                      {claimMode
                        ? 'Sudah mempunyai kata laluan? Log masuk terus'
                        : 'Pengaktifan pentadbir utama kali pertama'}
                    </button>
                  </div>
                )}
              </form>
            </>
          )}
        </div>

        {/* Discreet bottom footer bar */}
        <div className="w-full max-w-md mx-auto pt-6 mt-6 border-t border-[#1a2f5c] flex items-center justify-between text-xs text-slate-400">
          <span className="truncate">{branding.portalName}</span>
          {portalView === 'user' && (
            <button
              type="button"
              onClick={switchToAdminView}
              className="inline-flex items-center gap-1.5 font-medium text-slate-400 hover:text-[#f0cb63] transition-colors shrink-0"
            >
              <Lock className="w-3 h-3" />
              <span>Akses Pentadbir</span>
            </button>
          )}
        </div>
      </div>
      </div>

      <PortalQrFooter branding={branding} />
    </div>
  );
}

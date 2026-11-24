import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import type { AuthStatusResponse, BrandingConfig, PublicUser, TeacherOption, TopicLevel } from '../types.ts';

interface AuthGateProps {
  branding: BrandingConfig;
  onAuthenticated: (token: string, user: PublicUser) => void;
}

export function AuthGate({ branding, onAuthenticated }: AuthGateProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginRole, setLoginRole] = useState<'pelatih' | 'pengajar' | 'admin' | 'master_admin'>('pelatih');
  const [regRole, setRegRole] = useState<'pelatih' | 'pengajar'>('pelatih');

  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [levels, setLevels] = useState<TopicLevel[]>([]);
  const [bannerImgFailed, setBannerImgFailed] = useState(false);
  const [logoImgFailed, setLogoImgFailed] = useState(false);

  // Login fields
  const [loginUserId, setLoginUserId] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [adminEmail, setAdminEmail] = useState('azwan26211121@gmail.com');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  // Register fields
  const [regUserId, setRegUserId] = useState('');
  const [regName, setRegName] = useState('');
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
        setAdminEmail(status.adminEmail);
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

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      if (loginRole === 'master_admin') {
        if (authStatus && !authStatus.adminConfigured) {
          if (adminPassword.length < 8) {
            setErrorMsg('Kata laluan Master Admin mestilah sekurang-kurangnya 8 aksara.');
            setLoading(false);
            return;
          }
          if (adminPassword !== adminConfirmPassword) {
            setErrorMsg('Pengesahan kata laluan tidak sepadan.');
            setLoading(false);
            return;
          }
          const res = await api.claimAdminPassword(adminEmail, adminPassword);
          onAuthenticated(res.token, res.user);
          return;
        }
        const res = await api.loginMasterAdmin(adminEmail, adminPassword);
        onAuthenticated(res.token, res.user);
      } else if (loginRole === 'admin') {
        if (!loginUserId.trim()) {
          setErrorMsg('Sila masukkan User ID Admin (contoh: admin1 atau admin2).');
          setLoading(false);
          return;
        }
        if (!adminPassword) {
          setErrorMsg('Sila masukkan kata laluan Admin.');
          setLoading(false);
          return;
        }
        const res = await api.loginAdmin(loginUserId.trim(), adminPassword);
        onAuthenticated(res.token, res.user);
      } else {
        if (!loginUserId.trim()) {
          setErrorMsg('Sila masukkan User ID anda.');
          setLoading(false);
          return;
        }
        if (!/^\d{6}$/.test(loginPin)) {
          setErrorMsg('Sila masukkan PIN akses tepat 6 digit nombor.');
          setLoading(false);
          return;
        }
        const res = await api.loginWithPin(loginRole, loginUserId.trim(), loginPin);
        onAuthenticated(res.token, res.user);
      }
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Log masuk gagal. Sila cuba lagi.');
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
    setLoading(true);
    try {
      const res = await api.registerUser({
        role: regRole,
        userId: regUserId.trim(),
        name: regName,
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

  return (
    <div className="min-h-screen bg-[#f4f7fb] grid lg:grid-cols-12 items-stretch">
      {/* Left Architectural Hero Column — SIRKING Royal Navy & Gold Banner Theme */}
      <div className="lg:col-span-7 relative bg-gradient-to-br from-[#041434] via-[#072255] to-[#0b3d86] flex flex-col justify-between overflow-hidden min-h-[380px] lg:min-h-screen">
        {/* Subtle geometric azure glow matching banner */}
        <div
          aria-hidden="true"
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#38bdf8]/15 blur-3xl pointer-events-none"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-[#c59b38]/10 blur-3xl pointer-events-none"
        />

        <div className="relative z-10 p-8 lg:p-12 space-y-6">
          <div className="flex items-center gap-4">
            {!logoImgFailed ? (
              <img
                src={branding.logoUrl}
                alt={`Logo ${branding.portalName}`}
                referrerPolicy="no-referrer"
                onError={() => setLogoImgFailed(true)}
                className="w-16 h-16 rounded-full bg-white object-cover border-2 border-[#e5b94c] shadow-md shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-white text-[#061b44] font-bold text-lg flex items-center justify-center border-2 border-[#e5b94c] shrink-0">
                SK
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#f0cb63] tracking-wide truncate">
                {branding.portalName}
              </p>
              <p className="text-xs text-blue-100/85 mt-0.5 truncate">
                {branding.portalTagline}
              </p>
            </div>
          </div>

          <h1 className="text-3xl lg:text-4xl font-bold text-white tracking-tight max-w-2xl text-balance leading-tight">
            Platform Panduan Pembelajaran, Latihan Teori &amp; SOP Latihan
          </h1>

          {/* Featured Portal Banner */}
          <div className="bg-white/95 p-2 rounded-xl border border-white/25 shadow-xl max-w-2xl">
            {!bannerImgFailed ? (
              <img
                src={branding.bannerUrl}
                alt={`Banner rasmi ${branding.portalName}`}
                referrerPolicy="no-referrer"
                onError={() => setBannerImgFailed(true)}
                className="w-full h-auto max-h-56 object-contain rounded-lg mx-auto"
              />
            ) : (
              <div className="h-36 rounded-lg bg-gradient-to-r from-[#041434] to-[#0b3d86] flex flex-col items-center justify-center px-6 text-center">
                <p className="text-lg font-bold text-white">{branding.portalName}</p>
                <p className="text-xs text-blue-200 mt-1">{branding.portalTagline}</p>
              </div>
            )}
          </div>
        </div>

        <div className="relative z-10 p-8 lg:p-12 pt-4">
          <div className="grid sm:grid-cols-3 gap-6 border-t border-white/15 pt-6">
            <div>
              <p className="text-sm font-semibold text-[#f0cb63]">01. Folder Teori &amp; Nota</p>
              <p className="mt-1.5 text-sm text-blue-100/85 leading-relaxed">
                Setiap tahap dibahagikan kepada 2 Sub Teori dengan slot Word dan PDF mengikut CU.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#f0cb63]">02. Latihan Google Form</p>
              <p className="mt-1.5 text-sm text-blue-100/85 leading-relaxed">
                Akses borang latihan teori secara terus di dalam portal tanpa mencari pautan luaran.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#f0cb63]">03. SOP Bengkel Amali</p>
              <p className="mt-1.5 text-sm text-blue-100/85 leading-relaxed">
                2 Sub Amali dengan langkah kerja, peraturan LOTO, PCD, PPE dan senarai semak amali.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Authentication Form Column */}
      <div className="lg:col-span-5 flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-14 bg-white border-l border-slate-200">
        <div className="w-full max-w-md mx-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[#061b44] tracking-tight">
              Gerbang Akses Pengguna
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Pelatih dan Pengajar log masuk menggunakan User ID dan PIN akses 6 digit.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 bg-[#eef3fb] rounded-lg mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
              }}
              className={`py-2 px-4 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white text-[#061b44] shadow-sm'
                  : 'text-slate-600 hover:text-[#061b44]'
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
                  ? 'bg-white text-[#061b44] shadow-sm'
                  : 'text-slate-600 hover:text-[#061b44]'
              }`}
            >
              Daftar Baru
            </button>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800"
            >
              {errorMsg}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Peranan Akaun
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-[#eef3fb] rounded-lg">
                  {(
                    [
                      { id: 'pelatih', label: 'Pelatih' },
                      { id: 'pengajar', label: 'Pengajar' },
                      { id: 'admin', label: 'Admin' },
                      { id: 'master_admin', label: 'Master Admin' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setLoginRole(item.id);
                        setErrorMsg(null);
                      }}
                      className={`py-2 px-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        loginRole === item.id
                          ? 'bg-white text-[#0a2e6c] shadow-sm font-semibold'
                          : 'text-slate-600 hover:text-[#061b44]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {loginRole === 'master_admin' ? (
                <>
                  {authStatus && !authStatus.adminConfigured && (
                    <div className="p-3.5 rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-900">
                      <p className="font-semibold">Persediaan Master Admin Kali Pertama</p>
                      <p className="mt-1 text-xs text-blue-800">
                        Tiada kata laluan Master Admin ditetapkan lagi. Tetapkan kata laluan baharu untuk akaun{' '}
                        <span className="font-mono">{adminEmail}</span>.
                      </p>
                    </div>
                  )}

                  <div>
                    <label htmlFor="admin-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Emel Master Admin
                    </label>
                    <input
                      id="admin-email"
                      type="email"
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label htmlFor="admin-pass" className="block text-sm font-medium text-slate-700 mb-1.5">
                      {authStatus && !authStatus.adminConfigured ? 'Tetapkan Kata Laluan Master Admin' : 'Kata Laluan'}
                    </label>
                    <div className="relative">
                      <input
                        id="admin-pass"
                        type={showSecret ? 'text' : 'password'}
                        required
                        minLength={authStatus && !authStatus.adminConfigured ? 8 : 1}
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="Masukkan kata laluan Master Admin"
                        className="w-full px-3.5 py-2.5 pr-10 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                      />
                      <button
                        type="button"
                        aria-label="Tunjuk atau sembunyi kata laluan"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-800"
                      >
                        {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {authStatus && !authStatus.adminConfigured && (
                    <div>
                      <label htmlFor="admin-pass-confirm" className="block text-sm font-medium text-slate-700 mb-1.5">
                        Sahkan Kata Laluan Master Admin
                      </label>
                      <input
                        id="admin-pass-confirm"
                        type={showSecret ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={adminConfirmPassword}
                        onChange={(e) => setAdminConfirmPassword(e.target.value)}
                        placeholder="Ulang kata laluan (minimum 8 aksara)"
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                      />
                    </div>
                  )}
                </>
              ) : loginRole === 'admin' ? (
                <>
                  <div>
                    <label htmlFor="login-admin-userid" className="block text-sm font-medium text-slate-700 mb-1.5">
                      User ID Admin
                    </label>
                    <input
                      id="login-admin-userid"
                      type="text"
                      required
                      autoComplete="username"
                      value={loginUserId}
                      onChange={(e) => setLoginUserId(e.target.value)}
                      placeholder="Contoh: admin1 atau admin2"
                      className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label htmlFor="login-admin-pass" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Kata Laluan Admin
                    </label>
                    <div className="relative">
                      <input
                        id="login-admin-pass"
                        type={showSecret ? 'text' : 'password'}
                        required
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="Masukkan kata laluan Admin"
                        className="w-full px-3.5 py-2.5 pr-10 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <button
                        type="button"
                        aria-label="Tunjuk atau sembunyi kata laluan"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-800"
                      >
                        {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500">
                      Kata laluan untuk 2 akaun Admin ditetapkan oleh Master Admin di Panel Admin.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="login-userid" className="block text-sm font-medium text-slate-700 mb-1.5">
                      User ID ({loginRole === 'pengajar' ? 'Pengajar' : 'Pelatih'})
                    </label>
                    <input
                      id="login-userid"
                      type="text"
                      required
                      autoComplete="username"
                      value={loginUserId}
                      onChange={(e) => setLoginUserId(e.target.value)}
                      placeholder={
                        loginRole === 'pengajar'
                          ? 'Contoh: cikgu.azwan atau GURU01'
                          : 'Contoh: pel001 atau ahmad.syafiq'
                      }
                      className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label htmlFor="login-pin" className="block text-sm font-medium text-slate-700 mb-1.5">
                      PIN Akses 6 Digit
                    </label>
                    <div className="relative">
                      <input
                        id="login-pin"
                        type={showSecret ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        required
                        value={loginPin}
                        onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6 digit nombor"
                        className="w-full px-3.5 py-2.5 pr-10 text-sm font-mono tabular-nums tracking-[0.25em] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <button
                        type="button"
                        aria-label="Tunjuk atau sembunyi PIN"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-800"
                      >
                        {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#0a2e6c] hover:bg-[#061b44] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loginRole === 'admin' || loginRole === 'master_admin' ? (
                  <ShieldCheck className="w-4 h-4 text-[#f0cb63]" />
                ) : (
                  <KeyRound className="w-4 h-4 text-[#f0cb63]" />
                )}
                <span>
                  {loading
                    ? 'Mengesahkan...'
                    : loginRole === 'master_admin' && authStatus && !authStatus.adminConfigured
                    ? 'Simpan Kata Laluan & Masuk Master Admin'
                    : 'Log Masuk ke Portal'}
                </span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Daftar Sebagai
                </label>
                <div className="grid grid-cols-2 gap-1 p-1 bg-[#eef3fb] rounded-lg">
                  <button
                    type="button"
                    onClick={() => setRegRole('pelatih')}
                    className={`py-2 px-3 text-xs font-medium rounded-md transition-colors ${
                      regRole === 'pelatih'
                        ? 'bg-white text-[#0a2e6c] shadow-sm font-semibold'
                        : 'text-slate-600 hover:text-[#061b44]'
                    }`}
                  >
                    Pelatih
                  </button>
                  <button
                    type="button"
                    onClick={() => setRegRole('pengajar')}
                    className={`py-2 px-3 text-xs font-medium rounded-md transition-colors ${
                      regRole === 'pengajar'
                        ? 'bg-white text-[#0a2e6c] shadow-sm font-semibold'
                        : 'text-slate-600 hover:text-[#061b44]'
                    }`}
                  >
                    Pengajar
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="reg-userid" className="block text-sm font-medium text-slate-700 mb-1.5">
                  User ID (Untuk Log Masuk)
                </label>
                <input
                  id="reg-userid"
                  type="text"
                  required
                  minLength={3}
                  maxLength={32}
                  value={regUserId}
                  onChange={(e) => setRegUserId(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))}
                  placeholder={regRole === 'pengajar' ? 'Contoh: cikgu.azwan' : 'Contoh: pel001'}
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label htmlFor="reg-name" className="block text-sm font-medium text-slate-700 mb-1.5">
                  {regRole === 'pengajar' ? 'Nama Guru / Pengajar' : 'Nama Penuh Pelatih'}
                </label>
                <input
                  id="reg-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder={regRole === 'pengajar' ? 'Contoh: Cikgu Azwan' : 'Contoh: Nurul Aina'}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {regRole === 'pelatih' && (
                <>
                  <div>
                    <label htmlFor="reg-supervisor" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Pilih Nama Guru Penyelia
                    </label>
                    <select
                      id="reg-supervisor"
                      value={regSupervisorId}
                      onChange={(e) => setRegSupervisorId(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      {teachers.length > 0 ? (
                        teachers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))
                      ) : (
                        <option value="">Pentadbir Utama (Tiada pengajar berdaftar lagi)</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="reg-level" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Pilih Topik / Tahap Dipohon
                    </label>
                    <select
                      id="reg-level"
                      required
                      value={regLevelId}
                      onChange={(e) => setRegLevelId(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                <label htmlFor="reg-pin" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Tetapkan PIN Akses 6 Digit
                </label>
                <input
                  id="reg-pin"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={regPin}
                  onChange={(e) => setRegPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6 digit nombor (cth: 123456)"
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums tracking-[0.25em] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {regRole === 'pelatih' && (
                <p className="text-xs text-slate-500 leading-relaxed flex items-start gap-2">
                  <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                  <span>
                    Permohonan pelatih akan berstatus menunggu kelulusan sehingga diluluskan oleh Nama Guru pilihan anda.
                  </span>
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#0a2e6c] hover:bg-[#061b44] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <UserCheck className="w-4 h-4 text-[#f0cb63]" />
                <span>{loading ? 'Mendaftarkan...' : 'Hantar Pendaftaran'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

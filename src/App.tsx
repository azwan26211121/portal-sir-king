import React, { useCallback, useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { AdminPanelView } from './components/AdminPanelView.tsx';
import { AuthGate } from './components/AuthGate.tsx';
import { LearningWorkspace } from './components/LearningWorkspace.tsx';
import { PendingApprovalView } from './components/PendingApprovalView.tsx';
import { SearchAndTrackingView } from './components/SearchAndTrackingView.tsx';
import { TraineeManagementView } from './components/TraineeManagementView.tsx';
import { api, ApiError } from './lib/api.ts';
import type {
  AccessLogEntry,
  BrandingConfig,
  CUModule,
  LearningSection,
  PublicUser,
  SopCheckProgress,
  TopicLevel,
} from './types.ts';

type AppNavTab = 'workspace' | 'search' | 'trainees' | 'admin';

const ROLE_LABELS: Record<PublicUser['role'], string> = {
  pelatih: 'Pelatih',
  pengajar: 'Pengajar',
  admin: 'Admin',
  master_admin: 'Master Admin',
};

const DEFAULT_BRANDING: BrandingConfig = {
  portalName: 'SIRKING Learning Portal',
  portalTagline: 'Your Gateway to Knowledge & Success',
  logoUrl: '/assets/aistudio/logo_sir_king_portal_93f80572.jpeg',
  bannerUrl: '/assets/aistudio/banner_sir_king_portal_d2267840.jpeg',
  hasCustomLogo: false,
  hasCustomBanner: false,
  updatedAt: '',
};

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING);
  const [logoFailed, setLogoFailed] = useState(false);
  const [bannerFailed, setBannerFailed] = useState(false);

  const [navTab, setNavTab] = useState<AppNavTab>('workspace');
  const [levels, setLevels] = useState<TopicLevel[]>([]);
  const [cus, setCus] = useState<CUModule[]>([]);
  const [sopProgress, setSopProgress] = useState<SopCheckProgress[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLogEntry[]>([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  // 3-Stage Learning Workspace Selection State
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<LearningSection>('teori');
  const [selectedCuId, setSelectedCuId] = useState<string | null>(null);

  useEffect(() => {
    api
      .getBranding()
      .then((res) => {
        setBranding(res.branding);
      })
      .catch(() => {
        // Fallback to default SIRKING branding
      });
  }, []);

  useEffect(() => {
    setLogoFailed(false);
  }, [branding.logoUrl]);

  useEffect(() => {
    setBannerFailed(false);
  }, [branding.bannerUrl]);

  const fetchWorkspace = useCallback(
    async (activeToken: string) => {
      setLoadingWorkspace(true);
      setWorkspaceError(null);
      try {
        const data = await api.getWorkspace(activeToken);
        setLevels(data.levels);
        setCus(data.cus);
        setSopProgress(data.sopProgress);
        setAccessLogs(data.accessLogs);
        setSelectedLevelId((prev) => {
          if (prev && data.levels.some((l) => l.id === prev)) return prev;
          return data.levels[0]?.id || null;
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setToken(null);
          setUser(null);
          return;
        }
        setWorkspaceError(
          err instanceof ApiError ? err.message : 'Gagal memuatkan data ruang kerja.'
        );
      } finally {
        setLoadingWorkspace(false);
      }
    },
    []
  );

  useEffect(() => {
    if (token && user && user.status === 'approved') {
      fetchWorkspace(token);
    }
  }, [token, user, fetchWorkspace]);

  function handleAuthenticated(newToken: string, newUser: PublicUser) {
    setToken(newToken);
    setUser(newUser);
    setNavTab('workspace');
    setSelectedLevelId(newUser.approvedLevelId || null);
    setSelectedCuId(null);
  }

  async function handleRefreshUser() {
    if (!token) return;
    try {
      const res = await api.getMe(token);
      setUser(res.user);
      if (res.user.status === 'approved') {
        await fetchWorkspace(token);
      }
    } catch {
      setToken(null);
      setUser(null);
    }
  }

  async function handleLogout() {
    if (token) {
      await api.logout(token).catch(() => {});
    }
    setToken(null);
    setUser(null);
    setLevels([]);
    setCus([]);
    setSelectedLevelId(null);
    setSelectedCuId(null);
  }

  function handleJumpToCu(levelId: string, section: LearningSection, cuId: string) {
    setSelectedLevelId(levelId);
    setSelectedSection(section);
    setSelectedCuId(cuId);
    setNavTab('workspace');
  }

  if (!token || !user) {
    return <AuthGate branding={branding} onAuthenticated={handleAuthenticated} />;
  }

  if (user.status !== 'approved') {
    return (
      <PendingApprovalView
        branding={branding}
        user={user}
        onRefresh={handleRefreshUser}
        onLogout={handleLogout}
      />
    );
  }

  const navLinks: { id: AppNavTab; label: string }[] = [
    { id: 'workspace', label: 'Ruang Belajar' },
    { id: 'search', label: 'Carian & Status' },
  ];
  if (user.role === 'pengajar' || user.role === 'admin' || user.role === 'master_admin') {
    navLinks.push({ id: 'trainees', label: 'Pengurusan Pelatih' });
  }
  if (user.role === 'admin' || user.role === 'master_admin') {
    navLinks.push({ id: 'admin', label: 'Panel Admin' });
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] flex flex-col">
      {/* Top Bar: 3-zone contract styled to match SIRKING Royal Navy & Gold Banner */}
      <header className="bg-[#061b44] border-b border-[#16428e]/50 px-6 py-3.5 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark + Crest Logo */}
          <button
            type="button"
            onClick={() => setNavTab('workspace')}
            className="flex items-center gap-3 text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 font-display"
          >
            {!logoFailed ? (
              <img
                src={branding.logoUrl}
                alt={`Logo ${branding.portalName}`}
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="w-9 h-9 rounded-full bg-white object-cover border border-[#e5b94c]"
              />
            ) : (
              <span className="w-9 h-9 rounded-full bg-white text-[#061b44] text-xs font-bold flex items-center justify-center border border-[#e5b94c]">
                SK
              </span>
            )}
            <span>{branding.portalName}</span>
          </button>

          {/* Zone 2: Clean Single-Line Nav Links */}
          <nav
            aria-label="Navigasi Utama"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {navLinks.map((link) => {
              const active = navTab === link.id;
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setNavTab(link.id)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                    active
                      ? 'text-white border-[#e5b94c]'
                      : 'text-blue-100/75 border-transparent hover:text-white'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleLogout}
              className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] rounded-lg hover:bg-[#d4af37] transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-2"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Keluar</span>
            </button>
          </div>
        </div>

        {/* Mobile Nav Row */}
        <nav
          aria-label="Navigasi Mudah Alih"
          className="md:hidden mt-3 pt-3 border-t border-white/10 flex items-center gap-4 overflow-x-auto text-xs font-medium"
        >
          {navLinks.map((link) => {
            const active = navTab === link.id;
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => setNavTab(link.id)}
                className={`py-1 whitespace-nowrap shrink-0 border-b-2 ${
                  active ? 'text-white border-[#e5b94c]' : 'text-blue-100/75 border-transparent'
                }`}
              >
                {link.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-6">
        {/* Portal Banner Showcase */}
        {navTab === 'workspace' && (
          <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-sm overflow-hidden">
            {!bannerFailed ? (
              <img
                src={branding.bannerUrl}
                alt={`Banner ${branding.portalName}`}
                referrerPolicy="no-referrer"
                onError={() => setBannerFailed(true)}
                className="w-full h-auto max-h-48 object-contain mx-auto rounded-lg"
              />
            ) : (
              <div className="h-32 rounded-lg bg-gradient-to-r from-[#041434] via-[#072255] to-[#0b3d86] flex flex-col items-center justify-center px-6 text-center">
                <p className="text-xl font-bold text-white tracking-tight">{branding.portalName}</p>
                <p className="text-xs text-[#f0cb63] mt-1">{branding.portalTagline}</p>
              </div>
            )}
          </div>
        )}

        {/* Contextual User Session Summary Bar (Clean unboxed metadata) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-xl font-bold text-[#061b44] tracking-tight">
              Selamat Datang, {user.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-[#0a2e6c]">{ROLE_LABELS[user.role]}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-700">ID: {user.userId}</span>
              <span aria-hidden="true">·</span>
              <span>Status: Diluluskan</span>
              {user.role === 'pelatih' && user.supervisorName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Penyelia: {user.supervisorName}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {workspaceError && (
          <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
            {workspaceError}
          </div>
        )}

        {loadingWorkspace && levels.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
            Memuatkan ruang kerja pembelajaran...
          </div>
        ) : (
          <>
            {navTab === 'workspace' && (
              <LearningWorkspace
                token={token}
                user={user}
                levels={levels}
                cus={cus}
                sopProgress={sopProgress}
                selectedLevelId={selectedLevelId}
                selectedSection={selectedSection}
                selectedCuId={selectedCuId}
                onSelectLevel={setSelectedLevelId}
                onSelectSection={setSelectedSection}
                onSelectCu={setSelectedCuId}
                onRefreshWorkspace={() => fetchWorkspace(token)}
              />
            )}

            {navTab === 'search' && (
              <SearchAndTrackingView
                levels={levels}
                cus={cus}
                accessLogs={accessLogs}
                onNavigateToCu={handleJumpToCu}
              />
            )}

            {navTab === 'trainees' &&
              (user.role === 'pengajar' || user.role === 'admin' || user.role === 'master_admin') && (
                <TraineeManagementView
                  token={token}
                  currentUser={user}
                  levels={levels}
                  onUserUpdated={handleRefreshUser}
                />
              )}

            {navTab === 'admin' && (user.role === 'admin' || user.role === 'master_admin') && (
              <AdminPanelView
                token={token}
                currentUser={user}
                branding={branding}
                levels={levels}
                cus={cus}
                onBrandingUpdated={setBranding}
                onRefreshWorkspace={() => fetchWorkspace(token)}
                onJumpToCu={handleJumpToCu}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

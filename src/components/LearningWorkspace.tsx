import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckSquare,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  Folder,
  Link2,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  Square,
  Trash2,
  Wrench,
} from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import type {
  CUModule,
  FileSlotType,
  LearningSection,
  PublicUser,
  SopCategory,
  SopCheckProgress,
  SopStep,
  SubKey,
  TopicLevel,
} from '../types.ts';
import { DocumentSlotCard } from './DocumentSlotCard.tsx';

interface LearningWorkspaceProps {
  token: string;
  user: PublicUser;
  levels: TopicLevel[];
  cus: CUModule[];
  sopProgress: SopCheckProgress[];
  selectedLevelId: string | null;
  selectedSection: LearningSection;
  selectedCuId: string | null;
  onSelectLevel: (levelId: string) => void;
  onSelectSection: (section: LearningSection) => void;
  onSelectCu: (cuId: string | null) => void;
  onRefreshWorkspace: () => Promise<void>;
}

function toEmbedGoogleFormUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname === 'docs.google.com' && parsed.pathname.includes('/forms/')) {
      parsed.searchParams.set('embedded', 'true');
      return parsed.toString();
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

export function LearningWorkspace({
  token,
  user,
  levels,
  cus,
  sopProgress,
  selectedLevelId,
  selectedSection,
  selectedCuId,
  onSelectLevel,
  onSelectSection,
  onSelectCu,
  onRefreshWorkspace,
}: LearningWorkspaceProps) {
  const canEdit =
    user.role === 'pengajar' || user.role === 'admin' || user.role === 'master_admin';
  const [selectedSub, setSelectedSub] = useState<SubKey>('sub1');

  const activeLevel = useMemo(
    () => levels.find((l) => l.id === selectedLevelId) || levels[0] || null,
    [levels, selectedLevelId]
  );

  const levelCUs = useMemo(
    () => cus.filter((c) => activeLevel && c.levelId === activeLevel.id),
    [cus, activeLevel]
  );

  const activeCU = useMemo(
    () => levelCUs.find((c) => c.id === selectedCuId) || null,
    [levelCUs, selectedCuId]
  );

  const activeTeoriSub = useMemo(() => {
    if (!activeCU) return null;
    return selectedSub === 'sub2' ? activeCU.teoriSub2 : activeCU.teoriSub1;
  }, [activeCU, selectedSub]);

  const activeAmaliSub = useMemo(() => {
    if (!activeCU) return null;
    return selectedSub === 'sub2' ? activeCU.amaliSub2 : activeCU.amaliSub1;
  }, [activeCU, selectedSub]);

  // Google Form Editor state
  const [formUrlInput, setFormUrlInput] = useState('');
  const [formTitleInput, setFormTitleInput] = useState('');
  const [savingForm, setSavingForm] = useState(false);
  const [formMsg, setFormMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // SOP Editor state
  const [editingSop, setEditingSop] = useState(false);
  const [draftSopSteps, setDraftSopSteps] = useState<SopStep[]>([]);
  const [savingSop, setSavingSop] = useState(false);
  const [sopMsg, setSopMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Quick Add CU state
  const [showAddCu, setShowAddCu] = useState(false);
  const [newCuCode, setNewCuCode] = useState('');
  const [newCuTitle, setNewCuTitle] = useState('');
  const [newCuDesc, setNewCuDesc] = useState('');
  const [addingCu, setAddingCu] = useState(false);

  useEffect(() => {
    if (activeTeoriSub) {
      setFormUrlInput(activeTeoriSub.googleFormUrl || '');
      setFormTitleInput(activeTeoriSub.googleFormTitle || '');
    }
    if (activeAmaliSub) {
      setDraftSopSteps(activeAmaliSub.sopSteps);
    }
    setEditingSop(false);
    setFormMsg(null);
    setSopMsg(null);
  }, [activeCU?.id, selectedSub, activeTeoriSub, activeAmaliSub]);

  const userSopChecked = useMemo(() => {
    if (!activeCU) return [];
    const found = sopProgress.find(
      (p) => p.userId === user.id && p.cuId === activeCU.id && p.subKey === selectedSub
    );
    return found ? found.checkedStepIds : [];
  }, [sopProgress, user.id, activeCU, selectedSub]);

  async function handleToggleSopStep(stepId: string) {
    if (!activeCU || !activeAmaliSub) return;
    const exists = userSopChecked.includes(stepId);
    const nextIds = exists
      ? userSopChecked.filter((id) => id !== stepId)
      : [...userSopChecked, stepId];
    try {
      await api.saveSopCheck(token, activeCU.id, selectedSub, nextIds);
      if (nextIds.length === activeAmaliSub.sopSteps.length && activeAmaliSub.sopSteps.length > 0) {
        await api.logAccess(token, activeCU.id, 'complete_sop', selectedSub);
      } else {
        await api.logAccess(token, activeCU.id, 'view_sop', selectedSub);
      }
      await onRefreshWorkspace();
    } catch (err) {
      setSopMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal menyimpan semakan SOP.',
      });
    }
  }

  async function handleResetSopChecks() {
    if (!activeCU) return;
    try {
      await api.saveSopCheck(token, activeCU.id, selectedSub, []);
      await onRefreshWorkspace();
    } catch {
      // ignore
    }
  }

  async function handleSaveGoogleForm(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCU) return;
    setSavingForm(true);
    setFormMsg(null);
    try {
      await api.updateGoogleForm(token, activeCU.id, selectedSub, formUrlInput, formTitleInput);
      await onRefreshWorkspace();
      setFormMsg({
        type: 'ok',
        text: `Pautan Google Form (${selectedSub === 'sub1' ? 'Sub 1' : 'Sub 2'}) berjaya dikemas kini.`,
      });
    } catch (err) {
      setFormMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal menyimpan pautan Google Form.',
      });
    } finally {
      setSavingForm(false);
    }
  }

  async function handleSaveSopSteps() {
    if (!activeCU) return;
    setSavingSop(true);
    setSopMsg(null);
    try {
      await api.updateSopSteps(token, activeCU.id, selectedSub, draftSopSteps);
      await onRefreshWorkspace();
      setEditingSop(false);
      setSopMsg({
        type: 'ok',
        text: `Langkah SOP (${selectedSub === 'sub1' ? 'Sub 1' : 'Sub 2'}) berjaya dikemas kini.`,
      });
    } catch (err) {
      setSopMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal menyimpan langkah SOP.',
      });
    } finally {
      setSavingSop(false);
    }
  }

  async function handleCreateCu(e: React.FormEvent) {
    e.preventDefault();
    if (!activeLevel) return;
    setAddingCu(true);
    try {
      const res = await api.createCU(token, {
        levelId: activeLevel.id,
        code: newCuCode,
        title: newCuTitle,
        description: newCuDesc,
      });
      setNewCuCode('');
      setNewCuTitle('');
      setNewCuDesc('');
      setShowAddCu(false);
      await onRefreshWorkspace();
      onSelectCu(res.cu.id);
    } finally {
      setAddingCu(false);
    }
  }

  if (!activeLevel) {
    return (
      <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-10 text-center">
        <p className="text-base font-semibold text-white">Tiada Tahap Pembelajaran Tersedia</p>
        <p className="mt-2 text-sm text-slate-300">
          Tahap pembelajaran anda belum ditetapkan atau masih kosong. Sila hubungi pengajar atau admin website.
        </p>
      </div>
    );
  }

  const sub1Label =
    selectedSection === 'amali_sop' ? activeLevel.amaliSub1Title : activeLevel.teoriSub1Title;
  const sub2Label =
    selectedSection === 'amali_sop' ? activeLevel.amaliSub2Title : activeLevel.teoriSub2Title;

  const notaSlotType: FileSlotType =
    selectedSub === 'sub2' ? 'teori_sub2_nota' : 'teori_sub1_nota';
  const panduanSlotType: FileSlotType =
    selectedSub === 'sub2' ? 'teori_sub2_panduan' : 'teori_sub1_panduan';
  const sopSlotType: FileSlotType =
    selectedSub === 'sub2' ? 'amali_sub2_sop' : 'amali_sub1_sop';
  const subFolderCode = selectedSub === 'sub2' ? 'Sub_2' : 'Sub_1';

  return (
    <div className="space-y-6">
      {/* Stage 1: Pilih Topik / Tahap */}
      <section aria-labelledby="stage-level-heading" className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-medium text-[#f0cb63]">Langkah 1 · Pilih Topik / Tahap</p>
            <h2 id="stage-level-heading" className="mt-1 text-lg font-bold text-white">
              {user.role === 'pelatih'
                ? 'Tahap Pembelajaran Diluluskan'
                : 'Semua Topik & Tahap Pembelajaran'}
            </h2>
          </div>
          <p className="text-xs text-slate-400 font-mono tabular-nums">
            {levels.length} Tahap · {cus.length} Unit Kompetensi (CU)
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {levels.map((lvl) => {
            const count = cus.filter((c) => c.levelId === lvl.id).length;
            const isSelected = activeLevel.id === lvl.id;
            return (
              <button
                key={lvl.id}
                type="button"
                onClick={() => {
                  onSelectLevel(lvl.id);
                  onSelectCu(null);
                }}
                className={`text-left p-4 rounded-xl border transition-colors ${
                  isSelected
                    ? 'border-[#e5b94c] bg-[#10234d]'
                    : 'border-[#1a2f5c] bg-[#081228] hover:border-[#2a4a8a] hover:bg-[#0e1d3d]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono font-semibold text-[#f0cb63]">{lvl.code}</span>
                  <span className="font-mono text-slate-400 tabular-nums">{count} CU</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-white line-clamp-2">{lvl.title}</p>
                <div className="mt-2.5 pt-2.5 border-t border-[#1a2f5c] space-y-1 text-xs text-slate-300">
                  <p className="truncate">
                    <span className="font-medium text-slate-100">Teori (2 Sub):</span>{' '}
                    {lvl.teoriSub1Title.replace(/^Sub 1:\s*/i, '')} /{' '}
                    {lvl.teoriSub2Title.replace(/^Sub 2:\s*/i, '')}
                  </p>
                  <p className="truncate">
                    <span className="font-medium text-slate-100">Amali (2 Sub):</span>{' '}
                    {lvl.amaliSub1Title.replace(/^Sub 1:\s*/i, '')} /{' '}
                    {lvl.amaliSub2Title.replace(/^Sub 2:\s*/i, '')}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Stage 2: Pilih Bahagian (Teori, Amali & SOP, Latihan) */}
      <section aria-labelledby="stage-section-heading" className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[#f0cb63]">
              Langkah 2 · Pilih Bahagian ({activeLevel.code})
            </p>
            <h2 id="stage-section-heading" className="mt-1 text-lg font-bold text-white">
              Fokus Pembelajaran Semasa
            </h2>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 bg-[#071024] border border-[#1a2f5c] rounded-lg">
            {(
              [
                { id: 'teori', label: 'Teori (2 Sub)', icon: BookOpen },
                { id: 'amali_sop', label: 'Amali & SOP (2 Sub)', icon: Wrench },
                { id: 'latihan', label: 'Latihan (2 Sub)', icon: ClipboardCheck },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = selectedSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectSection(tab.id)}
                  className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${
                    active
                      ? 'bg-[#17356e] text-[#f0cb63] shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Stage 3: Pilih CU / Tajuk Khusus & Kandungan Terperingkat */}
      <section aria-labelledby="stage-cu-heading" className="grid lg:grid-cols-12 gap-6 items-start">
        {/* CU Selector Rail */}
        <div className="lg:col-span-4 bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-5">
          <div className="flex items-center justify-between gap-2 pb-4 border-b border-[#1a2f5c]">
            <div>
              <p className="text-xs font-medium text-[#f0cb63]">Langkah 3 · Pilih CU</p>
              <h3 id="stage-cu-heading" className="mt-0.5 text-base font-bold text-white">
                Senarai Unit Kompetensi
              </h3>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowAddCu(!showAddCu)}
                className="px-2.5 py-1.5 text-xs font-medium text-[#f0cb63] bg-[#122652] hover:bg-[#1a356e] border border-[#264380] rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah CU</span>
              </button>
            )}
          </div>

          {showAddCu && canEdit && (
            <form onSubmit={handleCreateCu} className="mt-4 p-4 rounded-lg bg-[#071024] border border-[#1a2f5c] space-y-3">
              <p className="text-xs font-semibold text-white">CU Baharu ({activeLevel.code})</p>
              <input
                type="text"
                required
                value={newCuCode}
                onChange={(e) => setNewCuCode(e.target.value)}
                placeholder="Kod CU (cth: CU-03)"
                className="w-full px-3 py-2 text-xs font-mono border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
              />
              <input
                type="text"
                required
                value={newCuTitle}
                onChange={(e) => setNewCuTitle(e.target.value)}
                placeholder="Tajuk CU"
                className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
              />
              <textarea
                rows={2}
                value={newCuDesc}
                onChange={(e) => setNewCuDesc(e.target.value)}
                placeholder="Ringkasan topik (pilihan)"
                className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={addingCu}
                  className="px-3 py-1.5 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg"
                >
                  {addingCu ? 'Menyimpan...' : 'Simpan CU'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddCu(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-100"
                >
                  Batal
                </button>
              </div>
            </form>
          )}

          <div className="mt-4 divide-y divide-[#1a2f5c]">
            {levelCUs.length === 0 ? (
              <p className="py-6 text-sm text-slate-400 text-center">
                Belum ada CU didaftarkan untuk tahap ini.
              </p>
            ) : (
              levelCUs.map((cu) => {
                const isActive = activeCU?.id === cu.id;
                const teoriDocsCount =
                  (cu.teoriSub1.notaSlot ? 1 : 0) +
                  (cu.teoriSub1.panduanSoalanSlot ? 1 : 0) +
                  (cu.teoriSub2.notaSlot ? 1 : 0) +
                  (cu.teoriSub2.panduanSoalanSlot ? 1 : 0);
                const formCount =
                  (cu.teoriSub1.googleFormUrl ? 1 : 0) + (cu.teoriSub2.googleFormUrl ? 1 : 0);
                const sopStepsTotal =
                  cu.amaliSub1.sopSteps.length + cu.amaliSub2.sopSteps.length;
                return (
                  <button
                    key={cu.id}
                    type="button"
                    onClick={() => onSelectCu(cu.id)}
                    className={`w-full text-left py-3.5 px-3 -mx-1 rounded-lg transition-colors flex items-start justify-between gap-3 ${
                      isActive ? 'bg-[#10234d] ring-1 ring-[#e5b94c]/50' : 'hover:bg-[#112247]/60'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-[#f0cb63]">{cu.code}</span>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="text-slate-400 font-mono tabular-nums">
                          Teori {teoriDocsCount}/4
                        </span>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className={formCount > 0 ? 'text-emerald-400 font-mono tabular-nums' : 'text-slate-500 font-mono tabular-nums'}>
                          Borang {formCount}/2
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-white">{cu.title}</p>
                      <p className="mt-0.5 text-xs text-slate-400 font-mono tabular-nums">
                        Amali SOP: {sopStepsTotal} langkah (Sub 1 &amp; Sub 2)
                      </p>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 mt-1 shrink-0 ${
                        isActive ? 'text-[#f0cb63]' : 'text-slate-500'
                      }`}
                    />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Selected CU Content Pane */}
        <div className="lg:col-span-8">
          {!activeCU || !activeTeoriSub || !activeAmaliSub ? (
            <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-10 text-center">
              <Folder className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="mt-3 text-base font-semibold text-white">
                Pilih CU / Tajuk Khusus Terlebih Dahulu
              </h3>
              <p className="mt-1.5 text-sm text-slate-300 max-w-md mx-auto">
                Kandungan <span className="font-mono text-xs text-[#f0cb63]">TEORI/ (Sub 1 &amp; Sub 2)</span>, latihan Google Form,
                dan panduan <span className="font-mono text-xs text-[#f0cb63]">AMALI/ (Sub 1 &amp; Sub 2)</span> akan dibuka selepas anda
                memilih salah satu CU di sebelah kiri.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* CU Header + 2-Sub Switcher */}
              <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
                    <span>{activeLevel.code}</span>
                    <span aria-hidden="true">/</span>
                    <span>{activeCU.code}</span>
                    <span aria-hidden="true">/</span>
                    <span className="text-[#f0cb63] font-semibold">
                      {selectedSection === 'amali_sop'
                        ? `AMALI/${subFolderCode}/`
                        : selectedSection === 'latihan'
                        ? `TEORI/${subFolderCode}/Latihan_Google_Form`
                        : `TEORI/${subFolderCode}/`}
                    </span>
                  </div>
                  <h3 className="mt-2 text-xl font-bold text-white">{activeCU.title}</h3>
                  {activeCU.description && (
                    <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">{activeCU.description}</p>
                  )}
                </div>

                {/* 2-Sub Selector */}
                <div className="pt-4 border-t border-[#1a2f5c]">
                  <p className="text-xs font-medium text-slate-400 mb-2">
                    Pilih Sub Bahagian ({selectedSection === 'amali_sop' ? 'Amali & SOP' : selectedSection === 'latihan' ? 'Latihan Teori' : 'Teori'})
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2 p-1 bg-[#071024] border border-[#1a2f5c] rounded-lg">
                    <button
                      type="button"
                      onClick={() => setSelectedSub('sub1')}
                      className={`text-left px-3.5 py-2.5 rounded-md text-xs transition-colors ${
                        selectedSub === 'sub1'
                          ? 'bg-[#17356e] text-[#f0cb63] font-semibold shadow-sm'
                          : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      <span className="block truncate">{sub1Label}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSub('sub2')}
                      className={`text-left px-3.5 py-2.5 rounded-md text-xs transition-colors ${
                        selectedSub === 'sub2'
                          ? 'bg-[#17356e] text-[#f0cb63] font-semibold shadow-sm'
                          : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      <span className="block truncate">{sub2Label}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* SECTION: TEORI (Sub 1 / Sub 2) */}
              {selectedSection === 'teori' && (
                <div className="space-y-5">
                  <DocumentSlotCard
                    token={token}
                    cuId={activeCU.id}
                    slotType={notaSlotType}
                    folderLabel={`${activeLevel.code} / ${activeCU.code} / TEORI / ${subFolderCode} / Nota_Pembelajaran`}
                    slotTitle={`Nota Pembelajaran (${selectedSub === 'sub1' ? 'Sub 1' : 'Sub 2'})`}
                    slotDescription={`${selectedSub === 'sub1' ? sub1Label : sub2Label} — Dokumen nota rujukan teori rasmi (.doc, .docx, .pdf).`}
                    file={activeTeoriSub.notaSlot}
                    canEdit={canEdit}
                    onUpdated={onRefreshWorkspace}
                    onAccessed={() =>
                      api.logAccess(token, activeCU.id, 'view_nota', selectedSub).catch(() => {})
                    }
                  />

                  <DocumentSlotCard
                    token={token}
                    cuId={activeCU.id}
                    slotType={panduanSlotType}
                    folderLabel={`${activeLevel.code} / ${activeCU.code} / TEORI / ${subFolderCode} / Panduan_Soalan`}
                    slotTitle={`Panduan Soalan (${selectedSub === 'sub1' ? 'Sub 1' : 'Sub 2'})`}
                    slotDescription={`${selectedSub === 'sub1' ? sub1Label : sub2Label} — Panduan soalan teori atau skema latihan bertulis (.doc, .docx, .pdf).`}
                    file={activeTeoriSub.panduanSoalanSlot}
                    canEdit={canEdit}
                    onUpdated={onRefreshWorkspace}
                    onAccessed={() =>
                      api.logAccess(token, activeCU.id, 'view_panduan', selectedSub).catch(() => {})
                    }
                  />
                </div>
              )}

              {/* SECTION: LATIHAN GOOGLE FORM (Sub 1 / Sub 2) */}
              {selectedSection === 'latihan' && (
                <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-mono text-slate-400">
                        {activeLevel.code} / {activeCU.code} / TEORI / {subFolderCode} / Latihan_Google_Form
                      </p>
                      <h4 className="mt-1.5 text-base font-semibold text-white">
                        {activeTeoriSub.googleFormTitle ||
                          `Latihan Teori ${selectedSub === 'sub1' ? 'Sub 1' : 'Sub 2'} — ${activeCU.code}`}
                      </h4>
                      <p className="mt-1 text-sm text-slate-300">
                        {selectedSub === 'sub1' ? sub1Label : sub2Label} — Jawab latihan teori terus daripada paparan Google Form di dalam portal ini.
                      </p>
                    </div>

                    {activeTeoriSub.googleFormUrl && (
                      <a
                        href={activeTeoriSub.googleFormUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() =>
                          api.logAccess(token, activeCU.id, 'open_form', selectedSub).catch(() => {})
                        }
                        className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Buka Borang di Tab Baharu</span>
                      </a>
                    )}
                  </div>

                  {canEdit && (
                    <form
                      onSubmit={handleSaveGoogleForm}
                      className="p-4 rounded-lg bg-[#071024] border border-[#1a2f5c] space-y-3"
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-white">
                        <Link2 className="w-4 h-4 text-[#f0cb63]" />
                        <span>
                          Tetapan Pautan Google Form ({selectedSub === 'sub1' ? 'Sub 1' : 'Sub 2'})
                        </span>
                      </div>

                      {formMsg && (
                        <p
                          className={`text-xs ${
                            formMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {formMsg.text}
                        </p>
                      )}

                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-300 mb-1">Tajuk Latihan</label>
                          <input
                            type="text"
                            value={formTitleInput}
                            onChange={(e) => setFormTitleInput(e.target.value)}
                            placeholder="Tajuk latihan Google Form"
                            className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-300 mb-1">
                            Pautan Google Form (HTTPS)
                          </label>
                          <input
                            type="url"
                            value={formUrlInput}
                            onChange={(e) => setFormUrlInput(e.target.value)}
                            placeholder="https://docs.google.com/forms/d/e/.../viewform"
                            className="w-full px-3 py-2 text-xs font-mono border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-slate-400">
                          Gunakan pautan penuh <span className="font-mono text-slate-300">docs.google.com/forms/.../viewform</span>{' '}
                          untuk paparan terus di dalam halaman. Kosongkan untuk memadam pautan.
                        </p>
                        <button
                          type="submit"
                          disabled={savingForm}
                          className="px-3.5 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{savingForm ? 'Menyimpan...' : 'Simpan Pautan'}</span>
                        </button>
                      </div>
                    </form>
                  )}

                  {activeTeoriSub.googleFormUrl ? (
                    <div className="space-y-4">
                      <div className="border border-[#263f73] rounded-lg overflow-hidden bg-white">
                        <iframe
                          src={toEmbedGoogleFormUrl(activeTeoriSub.googleFormUrl)}
                          title={activeTeoriSub.googleFormTitle || activeCU.title}
                          className="w-full h-[640px]"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#1a2f5c]">
                        <p className="text-xs text-slate-400">
                          Jika paparan borang disekat oleh tetapan pelayar, gunakan butang &ldquo;Buka Borang di Tab Baharu&rdquo;.
                        </p>
                        <button
                          type="button"
                          onClick={async () => {
                            await api.logAccess(token, activeCU.id, 'open_form', selectedSub);
                            await onRefreshWorkspace();
                            setFormMsg({ type: 'ok', text: 'Akses latihan direkodkan.' });
                          }}
                          className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] rounded-lg whitespace-nowrap"
                        >
                          Sahkan &amp; Rekod Akses Latihan
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-10 text-center border-t border-[#1a2f5c]">
                      <ClipboardCheck className="w-7 h-7 text-slate-400 mx-auto" />
                      <p className="mt-2.5 text-sm font-medium text-white">
                        Belum Ada Latihan Google Form ({selectedSub === 'sub1' ? 'Sub 1' : 'Sub 2'})
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Pengajar atau Admin Website perlu memautkan borang Google Form untuk sub bahagian ini terlebih dahulu.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION: AMALI & SOP (Sub 1 / Sub 2) */}
              {selectedSection === 'amali_sop' && (
                <div className="space-y-6">
                  <DocumentSlotCard
                    token={token}
                    cuId={activeCU.id}
                    slotType={sopSlotType}
                    folderLabel={`${activeLevel.code} / ${activeCU.code} / AMALI / ${subFolderCode} / Panduan_SOP_Latihan`}
                    slotTitle={`Dokumen Panduan SOP Latihan (${selectedSub === 'sub1' ? 'Sub 1' : 'Sub 2'})`}
                    slotDescription={`${selectedSub === 'sub1' ? sub1Label : sub2Label} — Dokumen rasmi langkah kerja amali & prosedur operasi standard (.doc, .docx, .pdf).`}
                    file={activeAmaliSub.sopDocSlot}
                    canEdit={canEdit}
                    onUpdated={onRefreshWorkspace}
                    onAccessed={() =>
                      api.logAccess(token, activeCU.id, 'view_sop', selectedSub).catch(() => {})
                    }
                  />

                  <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#1a2f5c]">
                      <div>
                        <p className="text-xs font-mono text-slate-400">
                          {activeLevel.code} / {activeCU.code} / AMALI / {subFolderCode} / Senarai_Semak_Keselamatan_SOP
                        </p>
                        <h4 className="mt-1.5 text-base font-semibold text-white">
                          Senarai Semak SOP ({selectedSub === 'sub1' ? 'Sub 1' : 'Sub 2'}) · LOTO · PCD · PPE
                        </h4>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono tabular-nums text-slate-300">
                          {userSopChecked.length}/{activeAmaliSub.sopSteps.length} Disemak
                        </span>
                        {userSopChecked.length > 0 && !editingSop && (
                          <button
                            type="button"
                            onClick={handleResetSopChecks}
                            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#071024] border border-[#263f73] rounded-lg flex items-center gap-1"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Set Semula</span>
                          </button>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setDraftSopSteps(activeAmaliSub.sopSteps);
                              setEditingSop(!editingSop);
                            }}
                            className="px-3.5 py-1.5 text-xs font-medium text-[#f0cb63] bg-[#122652] hover:bg-[#1a356e] border border-[#264380] rounded-lg whitespace-nowrap"
                          >
                            {editingSop ? 'Batal Suntingan' : 'Urus Langkah SOP'}
                          </button>
                        )}
                      </div>
                    </div>

                    {sopMsg && (
                      <div
                        className={`mt-4 p-3 rounded-lg text-xs border ${
                          sopMsg.type === 'ok'
                            ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                            : 'bg-red-950/60 border-red-800/70 text-red-300'
                        }`}
                      >
                        {sopMsg.text}
                      </div>
                    )}

                    {editingSop && canEdit ? (
                      <div className="mt-5 space-y-4">
                        {draftSopSteps.map((step, index) => (
                          <div
                            key={step.id}
                            className="p-4 rounded-lg border border-[#1a2f5c] bg-[#071024] space-y-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-mono font-semibold text-slate-200">
                                Langkah #{index + 1}
                              </span>
                              <div className="flex items-center gap-3">
                                <label className="flex items-center gap-1.5 text-xs text-slate-300">
                                  <input
                                    type="checkbox"
                                    checked={step.critical}
                                    onChange={(e) => {
                                      const next = [...draftSopSteps];
                                      next[index] = { ...step, critical: e.target.checked };
                                      setDraftSopSteps(next);
                                    }}
                                  />
                                  <span>Kritikal Keselamatan</span>
                                </label>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraftSopSteps(draftSopSteps.filter((_, i) => i !== index))
                                  }
                                  className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Buang</span>
                                </button>
                              </div>
                            </div>

                            <div className="grid sm:grid-cols-3 gap-3">
                              <select
                                value={step.category}
                                onChange={(e) => {
                                  const next = [...draftSopSteps];
                                  next[index] = {
                                    ...step,
                                    category: e.target.value as SopCategory,
                                  };
                                  setDraftSopSteps(next);
                                }}
                                className="px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                              >
                                <option value="LOTO">LOTO</option>
                                <option value="PCD">PCD</option>
                                <option value="PPE">PPE</option>
                                <option value="Langkah Kerja">Langkah Kerja</option>
                              </select>
                              <input
                                type="text"
                                value={step.title}
                                onChange={(e) => {
                                  const next = [...draftSopSteps];
                                  next[index] = { ...step, title: e.target.value };
                                  setDraftSopSteps(next);
                                }}
                                placeholder="Tajuk langkah SOP"
                                className="sm:col-span-2 px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                              />
                            </div>

                            <textarea
                              rows={2}
                              value={step.instruction}
                              onChange={(e) => {
                                const next = [...draftSopSteps];
                                next[index] = { ...step, instruction: e.target.value };
                                setDraftSopSteps(next);
                              }}
                              placeholder="Arahan terperinci langkah kerja & keselamatan..."
                              className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                            />
                          </div>
                        ))}

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() =>
                              setDraftSopSteps([
                                ...draftSopSteps,
                                {
                                  id: `sop-${Date.now().toString(36)}`,
                                  category: 'LOTO',
                                  title: '',
                                  instruction: '',
                                  critical: true,
                                },
                              ])
                            }
                            className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] rounded-lg flex items-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Tambah Langkah SOP</span>
                          </button>

                          <button
                            type="button"
                            disabled={savingSop}
                            onClick={handleSaveSopSteps}
                            className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg flex items-center gap-1.5"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{savingSop ? 'Menyimpan...' : 'Simpan Senarai SOP'}</span>
                          </button>
                        </div>
                      </div>
                    ) : activeAmaliSub.sopSteps.length === 0 ? (
                      <div className="py-8 text-center">
                        <ShieldAlert className="w-7 h-7 text-slate-400 mx-auto" />
                        <p className="mt-2 text-sm text-slate-300">
                          Belum ada langkah senarai semak SOP ditambah untuk {selectedSub === 'sub1' ? 'Sub 1' : 'Sub 2'} ini.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-4 divide-y divide-[#1a2f5c]">
                        {activeAmaliSub.sopSteps.map((step, idx) => {
                          const checked = userSopChecked.includes(step.id);
                          return (
                            <button
                              key={step.id}
                              type="button"
                              onClick={() => handleToggleSopStep(step.id)}
                              className="w-full text-left py-4 flex items-start gap-3.5 hover:bg-[#112247]/60 px-2 -mx-2 rounded-lg transition-colors"
                            >
                              <div className="mt-0.5 shrink-0 text-[#f0cb63]">
                                {checked ? (
                                  <CheckSquare className="w-5 h-5" />
                                ) : (
                                  <Square className="w-5 h-5 text-slate-500" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="font-mono font-semibold text-slate-400 tabular-nums">
                                    0{idx + 1}.
                                  </span>
                                  <span className="font-mono font-semibold text-[#f0cb63]">
                                    {step.category}
                                  </span>
                                  {step.critical && (
                                    <>
                                      <span aria-hidden="true" className="text-slate-600">·</span>
                                      <span className="inline-flex items-center gap-1 font-semibold text-amber-400">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        <span>WAJIB KESELAMATAN</span>
                                      </span>
                                    </>
                                  )}
                                </div>
                                <p
                                  className={`mt-1 text-sm font-semibold ${
                                    checked ? 'line-through text-slate-500' : 'text-white'
                                  }`}
                                >
                                  {step.title}
                                </p>
                                <p className="mt-1 text-sm text-slate-300 leading-relaxed">
                                  {step.instruction}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

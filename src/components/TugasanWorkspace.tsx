import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardEdit,
  Eye,
  FileCheck2,
  Lock,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import type {
  CUModule,
  PublicUser,
  TopicLevel,
  TugasanPaper,
  TugasanQuestion,
  TugasanSubmission,
} from '../types.ts';

interface TugasanWorkspaceProps {
  token: string;
  user: PublicUser;
  level: TopicLevel;
  cu: CUModule;
  papers: TugasanPaper[];
  submissions: TugasanSubmission[];
  onRefreshWorkspace: () => Promise<void>;
}

const STATUS_META = {
  betul: {
    label: 'Betul',
    screenText: 'text-emerald-700',
    screenBg: 'bg-emerald-50 border-emerald-300',
  },
  separa: {
    label: 'Separa Betul',
    screenText: 'text-amber-800',
    screenBg: 'bg-amber-50 border-amber-300',
  },
  salah: {
    label: 'Belum Tepat',
    screenText: 'text-red-700',
    screenBg: 'bg-red-50 border-red-300',
  },
} as const;

export function TugasanWorkspace({
  token,
  user,
  level,
  cu,
  papers,
  submissions,
  onRefreshWorkspace,
}: TugasanWorkspaceProps) {
  const canEdit =
    user.role === 'pengajar' || user.role === 'admin' || user.role === 'master_admin';

  const cuPapers = useMemo(
    () => papers.filter((p) => p.cuId === cu.id),
    [papers, cu.id]
  );

  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(
    cuPapers[0]?.id || null
  );
  const [mode, setMode] = useState<'answer' | 'review' | 'edit'>('answer');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [inspectedSubmissionId, setInspectedSubmissionId] = useState<string | null>(null);

  // Create / Edit Paper State (Pengajar/Admin)
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [savingPaper, setSavingPaper] = useState(false);
  const [draftSetCode, setDraftSetCode] = useState('');
  const [draftPaperCode, setDraftPaperCode] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftPurpose, setDraftPurpose] = useState('');
  const [draftPassingScore, setDraftPassingScore] = useState(60);
  const [draftWorkActivitiesText, setDraftWorkActivitiesText] = useState('');
  const [draftReferencesText, setDraftReferencesText] = useState('');
  const [draftQuestions, setDraftQuestions] = useState<TugasanQuestion[]>([]);
  const [confirmDeletePaperId, setConfirmDeletePaperId] = useState<string | null>(null);

  useEffect(() => {
    if (!cuPapers.some((p) => p.id === selectedPaperId)) {
      setSelectedPaperId(cuPapers[0]?.id || null);
    }
    setShowCreateForm(false);
    setConfirmDeletePaperId(null);
    setErrorMsg(null);
    setInfoMsg(null);
  }, [cu.id, cuPapers, selectedPaperId]);

  const activePaper = useMemo(
    () => cuPapers.find((p) => p.id === selectedPaperId) || cuPapers[0] || null,
    [cuPapers, selectedPaperId]
  );

  // Submissions for the active paper
  const paperSubmissions = useMemo(() => {
    if (!activePaper) return [];
    return submissions
      .filter((s) => s.templateId === activePaper.id)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }, [submissions, activePaper]);

  const ownSubmissionsForPaper = useMemo(
    () => paperSubmissions.filter((s) => s.userId === user.id),
    [paperSubmissions, user.id]
  );

  const latestOwnSubmission = ownSubmissionsForPaper[0] || null;

  const activeReviewSubmission = useMemo(() => {
    if (inspectedSubmissionId) {
      const found = paperSubmissions.find((s) => s.id === inspectedSubmissionId);
      if (found) return found;
    }
    return latestOwnSubmission;
  }, [inspectedSubmissionId, paperSubmissions, latestOwnSubmission]);

  // Reset form/view mode when switching papers
  useEffect(() => {
    if (!activePaper) return;
    setInspectedSubmissionId(null);
    setErrorMsg(null);
    setInfoMsg(null);
    if (latestOwnSubmission) {
      setMode('review');
      setAnswers(latestOwnSubmission.answers || {});
    } else {
      setMode('answer');
      const blank: Record<string, string> = {};
      for (const q of activePaper.questions) blank[q.id] = '';
      setAnswers(blank);
    }
  }, [activePaper?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function getBestSubmissionForPaper(paperId: string): TugasanSubmission | null {
    const mine = submissions
      .filter((s) => s.templateId === paperId && s.userId === user.id)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    if (mine.length === 0) return null;
    const passedOne = mine.find((s) => s.passed);
    return passedOne || mine[0];
  }

  function startRetake() {
    if (!activePaper) return;
    const next: Record<string, string> = {};
    for (const q of activePaper.questions) {
      next[q.id] = activeReviewSubmission?.answers?.[q.id] || '';
    }
    setAnswers(next);
    setInspectedSubmissionId(null);
    setMode('answer');
    setErrorMsg(null);
    setInfoMsg(null);
  }

  async function handleSubmitForAiMarking(e: React.FormEvent) {
    e.preventDefault();
    if (!activePaper) return;
    setSubmitting(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const res = await api.submitTugasan(token, activePaper.id, answers);
      await onRefreshWorkspace();
      setInspectedSubmissionId(res.submission.id);
      setMode('review');
      setInfoMsg(
        res.submission.passed
          ? `Penandaan AI selesai: Markah anda ${res.submission.percentage}% (LULUS). Kertas tugasan kini dibuka untuk cetakan.`
          : `Penandaan AI selesai: Markah anda ${res.submission.percentage}% (BELUM LULUS). Minimum ${activePaper.passingScore}% diperlukan untuk mencetak.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : 'Gagal menjalankan penandaan AI. Sila pastikan sambungan dan cuba semula.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  const canPrintPaper = Boolean(
    activeReviewSubmission && activeReviewSubmission.passed
  );

  async function handlePrintPaper() {
    if (!activePaper || !activeReviewSubmission || !activeReviewSubmission.passed) {
      setErrorMsg(
        `Cetakan tidak dibenarkan. Markah mestilah sekurang-kurangnya ${activePaper?.passingScore || 60}% (LULUS) sebelum mencetak.`
      );
      return;
    }
    setPrinting(true);
    setErrorMsg(null);
    try {
      await api.authorizePrintTugasan(token, activePaper.id, activeReviewSubmission.id);
      window.print();
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError
          ? err.message
          : 'Cetakan tidak dapat disahkan pada masa ini.'
      );
    } finally {
      setPrinting(false);
    }
  }

  function openCreatePaperForm() {
    const nextNum = cuPapers.length + 1;
    const tahapNum = level.code.replace(/[^0-9]/g, '') || '2';
    setShowCreateForm(true);
    setDraftSetCode(`T(${nextNum})`);
    setDraftPaperCode(`F432-005-${tahapNum}:2019-${cu.code}/T(${nextNum})`);
    setDraftTitle(`PENILAIAN ${cu.title.toUpperCase()}`);
    setDraftPurpose(
      `Kertas Tugasan ini bertujuan menilai kefahaman dan pengetahuan pelatih tentang ${cu.title} mengikut piawaian MS IEC 60364.`
    );
    setDraftPassingScore(60);
    setDraftWorkActivitiesText(`1. ${cu.title.toUpperCase()}`);
    setDraftReferencesText(
      'Jabatan Pembangunan Kemahiran (JPK) — NOSS F432-005.\nMS IEC 60364 & Peraturan-Peraturan Elektrik 1994.'
    );
    setDraftQuestions([
      {
        id: `q-new-1`,
        numberLabel: '1.',
        prompt: `Terangkan prinsip asas dan kepentingan keselamatan dalam ${cu.title}.`,
        maxMarks: 4,
        rubricHint: 'Menjelaskan konsep teras serta langkah keselamatan PPE/LOTO.',
      },
      {
        id: `q-new-2`,
        numberLabel: '2.',
        prompt: `Senaraikan tiga (3) peralatan atau komponen utama yang digunakan bagi ${cu.code}: ${cu.title}.`,
        maxMarks: 3,
        rubricHint: 'Menyenaraikan tiga komponen atau alat yang tepat.',
      },
    ]);
  }

  function openEditPaperForm(paper: TugasanPaper) {
    setShowCreateForm(false);
    setDraftSetCode(paper.setCode);
    setDraftPaperCode(paper.paperCode);
    setDraftTitle(paper.title);
    setDraftPurpose(paper.purpose);
    setDraftPassingScore(paper.passingScore);
    setDraftWorkActivitiesText(paper.workActivities.join('\n'));
    setDraftReferencesText(paper.references.join('\n'));
    setDraftQuestions(paper.questions.map((q) => ({ ...q })));
    setMode('edit');
  }

  async function handleSaveNewPaper(e: React.FormEvent) {
    e.preventDefault();
    setSavingPaper(true);
    setErrorMsg(null);
    try {
      const workActivities = draftWorkActivitiesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const references = draftReferencesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await api.createTugasanPaper(token, cu.id, {
        setCode: draftSetCode,
        paperCode: draftPaperCode,
        title: draftTitle,
        purpose: draftPurpose,
        passingScore: draftPassingScore,
        workActivities,
        references,
        questions: draftQuestions,
      });
      await onRefreshWorkspace();
      setShowCreateForm(false);
      setSelectedPaperId(res.paper.id);
      setMode('answer');
      setInfoMsg('Kertas Tugasan baharu berjaya ditambah.');
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal mencipta kertas tugasan.');
    } finally {
      setSavingPaper(false);
    }
  }

  async function handleSaveEditedPaper(e: React.FormEvent) {
    e.preventDefault();
    if (!activePaper) return;
    setSavingPaper(true);
    setErrorMsg(null);
    try {
      const workActivities = draftWorkActivitiesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const references = draftReferencesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      await api.updateTugasanPaper(token, activePaper.id, {
        setCode: draftSetCode,
        paperCode: draftPaperCode,
        title: draftTitle,
        purpose: draftPurpose,
        passingScore: draftPassingScore,
        workActivities,
        references,
        questions: draftQuestions,
      });
      await onRefreshWorkspace();
      setMode(latestOwnSubmission ? 'review' : 'answer');
      setInfoMsg('Kertas Tugasan berjaya dikemas kini.');
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal menyimpan perubahan kertas.');
    } finally {
      setSavingPaper(false);
    }
  }

  async function handleDeletePaper(paperId: string) {
    try {
      await api.deleteTugasanPaper(token, paperId);
      setConfirmDeletePaperId(null);
      await onRefreshWorkspace();
      setInfoMsg('Kertas Tugasan berjaya dipadam.');
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal memadam kertas tugasan.');
    }
  }

  const totalMaxMarks = activePaper
    ? activePaper.questions.reduce((sum, q) => sum + q.maxMarks, 0)
    : 0;
  const answeredCount = activePaper
    ? activePaper.questions.filter((q) => (answers[q.id] || '').trim().length > 0).length
    : 0;

  return (
    <div className="space-y-6">
      {/* Top Paper Selector Shelf (Hidden on Print) */}
      <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-5 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
              <FileCheck2 className="w-3.5 h-3.5 text-[#f0cb63]" />
              <span>
                {level.code} / {cu.code} / KERTAS_TUGASAN_AI
              </span>
            </p>
            <h3 className="mt-1.5 text-base font-semibold text-white">
              Kertas Tugasan &amp; Penandaan Automatik AI ({cuPapers.length} Set)
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              Format rasmi Kertas Tugasan JPK. Jawab soalan di bawah untuk disemak terus oleh{' '}
              <span className="text-[#f0cb63] font-medium">Pegawai Penilai AI</span>. Markah mestilah{' '}
              <span className="text-emerald-400 font-medium">LULUS (&ge; 60%)</span> untuk mencetak kertas tugasan.
            </p>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={() => (showCreateForm ? setShowCreateForm(false) : openCreatePaperForm())}
              className="px-3.5 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showCreateForm ? 'Tutup Borang' : 'Tambah Kertas Tugasan'}</span>
            </button>
          )}
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="p-3.5 rounded-lg border border-red-800/70 bg-red-950/60 text-xs text-red-300 flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div
            role="status"
            className="p-3.5 rounded-lg border border-emerald-700/60 bg-emerald-950/60 text-xs text-emerald-300 flex items-start gap-2.5"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* Create New Paper Form (Pengajar/Admin) */}
        {showCreateForm && canEdit && (
          <form
            onSubmit={handleSaveNewPaper}
            className="p-5 rounded-xl bg-[#071024] border border-[#263f73] space-y-4"
          >
            <h4 className="text-sm font-bold text-[#f0cb63]">
              Tambah Set Kertas Tugasan Baharu ({cu.code})
            </h4>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Kod Set (cth: T(2/2))</label>
                <input
                  type="text"
                  required
                  value={draftSetCode}
                  onChange={(e) => setDraftSetCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">No. Kod Rasmi JPK</label>
                <input
                  type="text"
                  required
                  value={draftPaperCode}
                  onChange={(e) => setDraftPaperCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Markah Lulus Minimum (%)</label>
                <input
                  type="number"
                  min={40}
                  max={100}
                  value={draftPassingScore}
                  onChange={(e) => setDraftPassingScore(Number(e.target.value) || 60)}
                  className="w-full px-3 py-2 text-xs font-mono border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Tajuk Kertas Tugasan</label>
              <input
                type="text"
                required
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Tujuan</label>
              <textarea
                rows={2}
                value={draftPurpose}
                onChange={(e) => setDraftPurpose(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Senarai Soalan</span>
                <button
                  type="button"
                  onClick={() =>
                    setDraftQuestions([
                      ...draftQuestions,
                      {
                        id: `q-${Date.now().toString(36)}`,
                        numberLabel: `${draftQuestions.length + 1}.`,
                        prompt: '',
                        maxMarks: 4,
                        rubricHint: '',
                      },
                    ])
                  }
                  className="px-2.5 py-1 text-xs text-[#f0cb63] bg-[#122652] border border-[#264380] rounded-md"
                >
                  + Soalan
                </button>
              </div>
              {draftQuestions.map((q, idx) => (
                <div
                  key={q.id}
                  className="p-3 rounded-lg bg-[#0b1733] border border-[#1a2f5c] space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-[#f0cb63]">Soalan {idx + 1}</span>
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-slate-300 flex items-center gap-1">
                        Markah:
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={q.maxMarks}
                          onChange={(e) => {
                            const next = [...draftQuestions];
                            next[idx] = { ...q, maxMarks: Number(e.target.value) || 4 };
                            setDraftQuestions(next);
                          }}
                          className="w-14 px-2 py-1 text-xs font-mono border border-[#263f73] rounded bg-[#071024] text-white"
                        />
                      </label>
                      {draftQuestions.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraftQuestions(draftQuestions.filter((_, i) => i !== idx))
                          }
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Buang
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    type="text"
                    required
                    value={q.prompt}
                    onChange={(e) => {
                      const next = [...draftQuestions];
                      next[idx] = { ...q, prompt: e.target.value };
                      setDraftQuestions(next);
                    }}
                    placeholder="Teks soalan..."
                    className="w-full px-3 py-1.5 text-xs border border-[#263f73] rounded bg-[#071024] text-slate-100"
                  />
                  <input
                    type="text"
                    value={q.rubricHint}
                    onChange={(e) => {
                      const next = [...draftQuestions];
                      next[idx] = { ...q, rubricHint: e.target.value };
                      setDraftQuestions(next);
                    }}
                    placeholder="Panduan skema jawapan untuk AI (pilihan)..."
                    className="w-full px-3 py-1.5 text-xs border border-[#263f73] rounded bg-[#071024] text-slate-300"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-3 py-1.5 text-xs text-slate-300 hover:text-white"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingPaper}
                className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg"
              >
                {savingPaper ? 'Menyimpan...' : 'Simpan Kertas Tugasan'}
              </button>
            </div>
          </form>
        )}

        {/* List of Papers for Active CU */}
        {cuPapers.length === 0 ? (
          <p className="py-6 text-sm text-slate-400 text-center border-t border-[#1a2f5c]">
            Belum ada Kertas Tugasan didaftarkan untuk CU ini.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-[#1a2f5c]">
            {cuPapers.map((p) => {
              const selected = activePaper?.id === p.id;
              const best = getBestSubmissionForPaper(p.id);
              const qMarks = p.questions.reduce((s, q) => s + q.maxMarks, 0);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPaperId(p.id)}
                  className={`text-left p-3.5 rounded-lg border transition-colors ${
                    selected
                      ? 'bg-[#17356e]/75 border-[#e5b94c]'
                      : 'bg-[#071024] border-[#1a2f5c] hover:border-[#2a4a8a]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-mono">
                    <span className="font-bold text-[#f0cb63]">{p.setCode}</span>
                    {best ? (
                      <span
                        className={`inline-flex items-center gap-1 font-semibold tabular-nums ${
                          best.passed ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {best.passed ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {best.passed ? 'LULUS' : 'BELUM LULUS'} · {best.percentage}%
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400">Belum Dijawab</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs font-semibold text-white line-clamp-2">
                    {p.title}
                  </p>
                  <p className="mt-1 text-[11px] font-mono text-slate-400 tabular-nums">
                    {p.paperCode} · {p.questions.length} Soalan ({qMarks} Markah)
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Active Paper Controls + Official JPK Paper */}
      {activePaper && (
        <div className="space-y-4">
          {/* Action Toolbar (Hidden on Print) */}
          <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                <span className="text-[#f0cb63] font-semibold">{activePaper.paperCode}</span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="text-slate-300 tabular-nums">
                  Markah Lulus: &ge; {activePaper.passingScore}%
                </span>
              </div>
              {activeReviewSubmission ? (
                <div className="flex flex-wrap items-center gap-2.5 text-sm">
                  <span className="font-semibold text-white">
                    Keputusan Terakhir ({activeReviewSubmission.userName}):
                  </span>
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      activeReviewSubmission.passed ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {activeReviewSubmission.totalScore}/{activeReviewSubmission.maxTotalScore} (
                    {activeReviewSubmission.percentage}%) —{' '}
                    {activeReviewSubmission.passed ? 'LULUS' : 'BELUM LULUS'}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-slate-300">
                  Lengkapkan jawapan di bawah dan tekan{' '}
                  <span className="text-[#f0cb63] font-medium">Hantar &amp; Semak Dengan AI</span>{' '}
                  untuk mendapatkan markah serta ulasan serta-merta.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {activeReviewSubmission && mode !== 'review' && (
                <button
                  type="button"
                  onClick={() => setMode('review')}
                  className="px-3.5 py-2 text-xs font-medium text-slate-100 bg-[#102045] hover:bg-[#172e61] border border-[#263f73] rounded-lg inline-flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5 text-[#f0cb63]" />
                  <span>Semak Markah AI</span>
                </button>
              )}

              {mode === 'review' && (
                <button
                  type="button"
                  onClick={startRetake}
                  className="px-3.5 py-2 text-xs font-medium text-slate-100 bg-[#102045] hover:bg-[#172e61] border border-[#263f73] rounded-lg inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#f0cb63]" />
                  <span>Jawab Semula</span>
                </button>
              )}

              {/* Pass-Gated Print Button */}
              <button
                type="button"
                disabled={!canPrintPaper || printing}
                onClick={handlePrintPaper}
                title={
                  canPrintPaper
                    ? 'Cetak Kertas Tugasan Rasmi JPK'
                    : `Markah mestilah lulus (>= ${activePaper.passingScore}%) untuk mencetak`
                }
                className={`px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  canPrintPaper
                    ? 'text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63]'
                    : 'text-slate-400 bg-[#071024] border border-[#1a2f5c] cursor-not-allowed opacity-75'
                }`}
              >
                {canPrintPaper ? (
                  <Printer className="w-3.5 h-3.5" />
                ) : (
                  <Lock className="w-3.5 h-3.5" />
                )}
                <span>
                  {printing
                    ? 'Menyediakan Cetakan...'
                    : canPrintPaper
                    ? 'Cetak Kertas Tugasan (Lulus)'
                    : 'Cetak Dikunci (Perlu Lulus)'}
                </span>
              </button>

              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      mode === 'edit'
                        ? setMode(latestOwnSubmission ? 'review' : 'answer')
                        : openEditPaperForm(activePaper)
                    }
                    className="px-3 py-2 text-xs font-medium text-[#f0cb63] bg-[#122652] hover:bg-[#1a356e] border border-[#264380] rounded-lg inline-flex items-center gap-1.5"
                  >
                    <ClipboardEdit className="w-3.5 h-3.5" />
                    <span>{mode === 'edit' ? 'Batal Sunting' : 'Sunting'}</span>
                  </button>
                  {confirmDeletePaperId === activePaper.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDeletePaper(activePaper.id)}
                        className="px-2.5 py-2 text-xs font-medium text-white bg-red-700 hover:bg-red-600 rounded-lg"
                      >
                        Sahkan Padam
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeletePaperId(null)}
                        className="px-2 py-2 text-xs text-slate-300"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeletePaperId(activePaper.id)}
                      className="px-2.5 py-2 text-xs font-medium text-red-300 bg-red-950/50 border border-red-800/60 hover:bg-red-900/60 rounded-lg"
                      aria-label="Padam Kertas Tugasan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Lock Warning Banner When Trainee Has Not Passed Yet */}
          {!canPrintPaper && mode !== 'edit' && (
            <div className="bg-[#081228] border border-amber-600/50 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-200 print:hidden">
              <Lock className="w-4 h-4 text-[#f0cb63] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-[#f0cb63]">
                  Syarat Cetakan: Markah Mesti Lulus (&ge; {activePaper.passingScore}%)
                </p>
                <p className="text-slate-300 leading-relaxed">
                  {activeReviewSubmission
                    ? `Percubaan terkini memperoleh ${activeReviewSubmission.percentage}% (${activeReviewSubmission.totalScore}/${activeReviewSubmission.maxTotalScore} markah — BELUM LULUS). Sila semak ulasan Pegawai Penilai AI pada setiap soalan dan klik "Jawab Semula" sehingga mendapat sekurang-kurangnya ${activePaper.passingScore}% untuk mencetak kertas tugasan rasmi.`
                    : `Pelatih mesti menjawab soalan mengikut format kertas JPK di bawah dan disemak oleh AI dengan markah lulus sekurang-kurangnya ${activePaper.passingScore}% sebelum butang Cetak dibuka.`}
                </p>
              </div>
            </div>
          )}

          {/* Edit Mode Form for Pengajar / Admin */}
          {mode === 'edit' && canEdit && (
            <form
              onSubmit={handleSaveEditedPaper}
              className="bg-[#0b1733] border border-[#264380] rounded-xl p-6 space-y-4 print:hidden"
            >
              <h4 className="text-sm font-bold text-[#f0cb63]">
                Sunting Kertas Tugasan — {activePaper.paperCode}
              </h4>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Kod Set</label>
                  <input
                    type="text"
                    required
                    value={draftSetCode}
                    onChange={(e) => setDraftSetCode(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-[#263f73] rounded-lg bg-[#071024] text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">No. Kod</label>
                  <input
                    type="text"
                    required
                    value={draftPaperCode}
                    onChange={(e) => setDraftPaperCode(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-[#263f73] rounded-lg bg-[#071024] text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Markah Lulus (%)</label>
                  <input
                    type="number"
                    min={40}
                    max={100}
                    value={draftPassingScore}
                    onChange={(e) => setDraftPassingScore(Number(e.target.value) || 60)}
                    className="w-full px-3 py-2 text-xs font-mono border border-[#263f73] rounded-lg bg-[#071024] text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Tajuk</label>
                <input
                  type="text"
                  required
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#071024] text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Tujuan</label>
                <textarea
                  rows={2}
                  value={draftPurpose}
                  onChange={(e) => setDraftPurpose(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#071024] text-slate-100"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    No. &amp; Penyataan Aktiviti Kerja (satu baris satu item)
                  </label>
                  <textarea
                    rows={3}
                    value={draftWorkActivitiesText}
                    onChange={(e) => setDraftWorkActivitiesText(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-[#263f73] rounded-lg bg-[#071024] text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Senarai Rujukan (satu baris satu rujukan)
                  </label>
                  <textarea
                    rows={3}
                    value={draftReferencesText}
                    onChange={(e) => setDraftReferencesText(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#071024] text-slate-100"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Soalan &amp; Rubrik</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftQuestions([
                        ...draftQuestions,
                        {
                          id: `${activePaper.id}-q${draftQuestions.length + 1}-${Date.now().toString(36)}`,
                          numberLabel: `${draftQuestions.length + 1}.`,
                          prompt: '',
                          maxMarks: 4,
                          rubricHint: '',
                        },
                      ])
                    }
                    className="px-2.5 py-1 text-xs text-[#f0cb63] bg-[#122652] border border-[#264380] rounded-md"
                  >
                    + Tambah Soalan
                  </button>
                </div>
                {draftQuestions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="p-3 rounded-lg bg-[#071024] border border-[#1a2f5c] space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-[#f0cb63]">Soalan #{idx + 1}</span>
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-slate-300 flex items-center gap-1">
                          Markah:
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={q.maxMarks}
                            onChange={(e) => {
                              const next = [...draftQuestions];
                              next[idx] = { ...q, maxMarks: Number(e.target.value) || 4 };
                              setDraftQuestions(next);
                            }}
                            className="w-16 px-2 py-1 text-xs font-mono border border-[#263f73] rounded bg-[#0b1733] text-white"
                          />
                        </label>
                        {draftQuestions.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setDraftQuestions(draftQuestions.filter((_, i) => i !== idx))
                            }
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Buang
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      type="text"
                      required
                      value={q.prompt}
                      onChange={(e) => {
                        const next = [...draftQuestions];
                        next[idx] = { ...q, prompt: e.target.value };
                        setDraftQuestions(next);
                      }}
                      className="w-full px-3 py-1.5 text-xs border border-[#263f73] rounded bg-[#0b1733] text-slate-100"
                    />
                    <input
                      type="text"
                      value={q.rubricHint}
                      onChange={(e) => {
                        const next = [...draftQuestions];
                        next[idx] = { ...q, rubricHint: e.target.value };
                        setDraftQuestions(next);
                      }}
                      placeholder="Skema / kata kunci untuk rujukan penandaan AI..."
                      className="w-full px-3 py-1.5 text-xs border border-[#263f73] rounded bg-[#0b1733] text-slate-300"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMode(latestOwnSubmission ? 'review' : 'answer')}
                  className="px-3 py-2 text-xs text-slate-300 hover:text-white"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingPaper}
                  className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg inline-flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingPaper ? 'Menyimpan...' : 'Simpan Kertas'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Print Block Notice if someone hits browser Ctrl+P without passing */}
          {!canPrintPaper && (
            <div className="hidden print:block p-8 border-2 border-black bg-white text-black text-center space-y-3">
              <p className="text-lg font-bold uppercase">CETAKAN KERTAS TUGASAN DISEKAT</p>
              <p className="text-sm">
                Kertas Tugasan ({activePaper.paperCode}) tidak boleh dicetak selagi pelatih belum mencapai
                markah lulus minimum ({activePaper.passingScore}%) selepas penandaan AI.
              </p>
            </div>
          )}

          {/* AUTHENTIC JPK WHITE-PAPER KERTAS TUGASAN SHEET */}
          {mode !== 'edit' && (
            <form
              id="jpk-printable-paper"
              onSubmit={handleSubmitForAiMarking}
              className={`bg-white text-black rounded-xl shadow-2xl border border-slate-300 print:border-0 print:shadow-none print:rounded-none p-6 sm:p-10 print:p-0 space-y-5 ${
                !canPrintPaper ? 'print:hidden' : ''
              }`}
            >
              {/* Official JPK Header Boxed Table (Exact layout matching uploaded PDF Page 1) */}
              <table className="w-full border-collapse border-2 border-black text-xs sm:text-[13px] leading-snug">
                <tbody>
                  <tr>
                    <td className="border border-black p-3 w-28 sm:w-32 text-center align-middle">
                      <img
                        src="/assets/aistudio/logo_sir_king_portal_93f80572.jpeg"
                        alt="Jata / Logo Rasmi"
                        className="w-16 h-16 sm:w-20 sm:h-20 mx-auto object-contain"
                      />
                    </td>
                    <td className="border border-black p-3 text-center align-middle">
                      <p className="font-bold text-sm sm:text-base tracking-wide">
                        JABATAN PEMBANGUNAN KEMAHIRAN (JPK)
                      </p>
                      <p className="text-[11px] sm:text-xs font-semibold uppercase mt-0.5">
                        TINGKAT 7-8, BLOK D4, KOMPLEKS D,
                      </p>
                      <p className="text-[11px] sm:text-xs font-semibold uppercase">
                        PUSAT PENTADBIRAN KERAJAAN PERSEKUTUAN, 62530 PUTRAJAYA
                      </p>
                      <p className="mt-2 pt-2 border-t border-black font-bold text-sm sm:text-base tracking-wider uppercase">
                        KERTAS TUGASAN
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>

              <table className="w-full border-collapse border-2 border-black text-xs sm:text-[13px] -mt-5 print:-mt-5">
                <tbody>
                  <tr>
                    <th className="border border-black bg-slate-100 print:bg-slate-100 p-2 text-left font-bold w-[36%] uppercase align-top">
                      KOD DAN NAMA PROGRAM
                    </th>
                    <td className="border border-black p-2 font-semibold uppercase align-top">
                      {activePaper.programCodeTitle}
                    </td>
                  </tr>
                  <tr>
                    <th className="border border-black bg-slate-100 print:bg-slate-100 p-2 text-left font-bold uppercase align-top">
                      TAHAP
                    </th>
                    <td className="border border-black p-2 font-semibold align-top">
                      {activePaper.tahap}
                    </td>
                  </tr>
                  <tr>
                    <th className="border border-black bg-slate-100 print:bg-slate-100 p-2 text-left font-bold uppercase align-top">
                      KOD DAN TAJUK UNIT KOMPETENSI
                    </th>
                    <td className="border border-black p-2 font-semibold uppercase align-top">
                      {activePaper.cuCodeTitle}
                    </td>
                  </tr>
                  <tr>
                    <th className="border border-black bg-slate-100 print:bg-slate-100 p-2 text-left font-bold uppercase align-top">
                      NO. DAN PENYATAAN AKTIVITI KERJA
                    </th>
                    <td className="border border-black p-2 align-top">
                      <div className="space-y-0.5 font-medium uppercase">
                        {activePaper.workActivities.map((wa, i) => (
                          <p key={i}>{wa}</p>
                        ))}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th className="border border-black bg-slate-100 print:bg-slate-100 p-2 text-left font-bold uppercase align-middle">
                      NO. KOD
                    </th>
                    <td className="border border-black p-0 align-middle">
                      <div className="flex flex-wrap items-center justify-between">
                        <span className="p-2 font-mono font-bold">{activePaper.paperCode}</span>
                        <span className="p-2 border-l border-black font-semibold">
                          Muka Surat : 1 / 2
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* TAJUK, TUJUAN, ARAHAN */}
              <div className="border border-black p-3 sm:p-4 space-y-2.5 text-xs sm:text-[13px]">
                <div>
                  <span className="font-bold uppercase">TAJUK : </span>
                  <span className="font-bold uppercase">{activePaper.title}</span>
                </div>
                <div>
                  <p className="font-bold uppercase">TUJUAN :</p>
                  <p className="mt-0.5 text-justify leading-relaxed">{activePaper.purpose}</p>
                </div>
                <div>
                  <p className="font-bold uppercase">ARAHAN :</p>
                  <ol className="list-decimal list-inside mt-0.5 space-y-0.5 leading-relaxed">
                    {activePaper.instructions.map((ins, i) => (
                      <li key={i}>{ins}</li>
                    ))}
                  </ol>
                </div>
              </div>

              {/* Maklumat Pelatih & Keputusan Penilaian AI */}
              <table className="w-full border-collapse border border-black text-xs sm:text-[13px] jpk-print-avoid-break">
                <tbody>
                  <tr>
                    <th className="border border-black bg-slate-100 p-2 text-left w-1/4 uppercase">
                      NAMA PELATIH
                    </th>
                    <td className="border border-black p-2 font-semibold w-1/4 uppercase">
                      {mode === 'review' && activeReviewSubmission
                        ? activeReviewSubmission.userName
                        : user.name}
                    </td>
                    <th className="border border-black bg-slate-100 p-2 text-left w-1/5 uppercase">
                      NO. ID PELATIH
                    </th>
                    <td className="border border-black p-2 font-mono font-semibold">
                      {mode === 'review' && activeReviewSubmission
                        ? activeReviewSubmission.userCodeId
                        : user.userId}
                    </td>
                  </tr>
                  <tr>
                    <th className="border border-black bg-slate-100 p-2 text-left uppercase">
                      TARIKH PENILAIAN
                    </th>
                    <td className="border border-black p-2 font-mono tabular-nums">
                      {mode === 'review' && activeReviewSubmission
                        ? new Date(activeReviewSubmission.submittedAt).toLocaleDateString('ms-MY')
                        : new Date().toLocaleDateString('ms-MY')}
                    </td>
                    <th className="border border-black bg-slate-100 p-2 text-left uppercase">
                      MARKAH / KEPUTUSAN
                    </th>
                    <td className="border border-black p-2 font-mono font-bold tabular-nums">
                      {mode === 'review' && activeReviewSubmission ? (
                        <span
                          className={
                            activeReviewSubmission.passed ? 'text-emerald-800 print:text-black' : 'text-red-700'
                          }
                        >
                          {activeReviewSubmission.totalScore} / {activeReviewSubmission.maxTotalScore} (
                          {activeReviewSubmission.percentage}%) —{' '}
                          {activeReviewSubmission.passed ? 'LULUS' : 'BELUM LULUS'}
                        </span>
                      ) : (
                        <span>
                          ____ / {totalMaxMarks} (Minimum Lulus: {activePaper.passingScore}%)
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Overall AI Remarks Box in Review Mode */}
              {mode === 'review' && activeReviewSubmission && (
                <div
                  className={`border border-black p-3.5 text-xs sm:text-[13px] jpk-print-avoid-break ${
                    activeReviewSubmission.passed ? 'bg-emerald-50/70 print:bg-slate-50' : 'bg-red-50/70'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-black/30">
                    <span className="font-bold uppercase flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 print:hidden" />
                      <span>ULASAN KESELURUHAN PEGAWAI PENILAI (AI)</span>
                    </span>
                    <span className="font-mono text-[11px]">
                      Lulus Minimum: {activePaper.passingScore}%
                    </span>
                  </div>
                  <p className="leading-relaxed">{activeReviewSubmission.overallFeedback}</p>
                </div>
              )}

              {/* SOALAN Section */}
              <div className="space-y-5 pt-2">
                <div className="flex items-center justify-between border-b-2 border-black pb-1">
                  <h4 className="font-bold text-sm uppercase tracking-wide">SOALAN :</h4>
                  <span className="font-mono text-xs font-semibold tabular-nums">
                    Jumlah Markah Penuh: {totalMaxMarks} Markah
                  </span>
                </div>

                {activePaper.questions.map((q) => {
                  const grade =
                    mode === 'review' && activeReviewSubmission
                      ? activeReviewSubmission.grades.find((g) => g.questionId === q.id)
                      : undefined;
                  const meta = grade ? STATUS_META[grade.status] : null;
                  return (
                    <div
                      key={q.id}
                      className="space-y-2 pb-4 border-b border-slate-300 last:border-b-0 jpk-print-avoid-break"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="text-xs sm:text-[13px] font-semibold leading-relaxed">
                          <span>
                            {q.numberLabel} {q.prompt}
                          </span>
                          {q.subPrompts && q.subPrompts.length > 0 && (
                            <div className="mt-1 pl-5 space-y-0.5 font-normal">
                              {q.subPrompts.map((sp, sIdx) => (
                                <p key={sIdx}>{sp}</p>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="shrink-0 font-mono text-xs font-bold border border-black px-2 py-1 tabular-nums whitespace-nowrap bg-slate-50">
                          {grade ? `${grade.marksAwarded} / ${grade.maxMarks}` : `___ / ${q.maxMarks}`}
                        </div>
                      </div>

                      {mode === 'answer' ? (
                        <div className="pl-4">
                          <label htmlFor={`ans-${q.id}`} className="sr-only">
                            Jawapan Soalan {q.numberLabel}
                          </label>
                          <textarea
                            id={`ans-${q.id}`}
                            rows={q.subPrompts && q.subPrompts.length > 0 ? 4 : 3}
                            value={answers[q.id] || ''}
                            onChange={(e) =>
                              setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                            }
                            placeholder="Tulis jawapan anda dengan jelas mengikut Kertas Penerangan..."
                            className="w-full p-2.5 text-xs sm:text-[13px] bg-slate-50 text-black placeholder:text-slate-400 border border-slate-400 focus:border-black focus:bg-white focus:outline-none rounded"
                          />
                        </div>
                      ) : (
                        <div className="pl-4 space-y-2">
                          <div className="p-2.5 border border-black/60 bg-slate-50 print:bg-white text-xs sm:text-[13px] whitespace-pre-wrap leading-relaxed">
                            <span className="font-bold text-[11px] uppercase text-slate-600 block mb-0.5">
                              Jawapan Pelatih:
                            </span>
                            {grade?.answerText || '(Tiada jawapan diisi)'}
                          </div>

                          {grade && meta && (
                            <div
                              className={`p-2.5 border text-xs leading-relaxed ${meta.screenBg} print:bg-white print:border-black/40`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
                                <span className={`${meta.screenText} print:text-black`}>
                                  Semakan AI: {meta.label} ({grade.marksAwarded}/{grade.maxMarks} markah)
                                </span>
                              </div>
                              <p className="mt-1 text-slate-900">{grade.aiFeedback}</p>
                              <p className="mt-1.5 pt-1.5 border-t border-black/15 text-slate-800 print:hidden">
                                <span className="font-semibold">Skema Rujukan:</span>{' '}
                                {grade.skemaJawapan}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* RUJUKAN Section */}
              {activePaper.references.length > 0 && (
                <div className="pt-3 border-t-2 border-black text-[11px] sm:text-xs space-y-1 jpk-print-avoid-break">
                  <p className="font-bold uppercase">RUJUKAN :</p>
                  <ol className="list-decimal list-inside space-y-0.5 leading-snug">
                    {activePaper.references.map((ref, idx) => (
                      <li key={idx}>{ref}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Bottom JPK Paper Footer Code + Signature Line */}
              <div className="pt-4 border-t border-black flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono jpk-print-avoid-break">
                <span>NO. KOD: {activePaper.paperCode}</span>
                <span>
                  {mode === 'review' && activeReviewSubmission?.passed
                    ? `DISAHKAN LULUS OLEH AI (${activeReviewSubmission.percentage}%)`
                    : 'JABATAN PEMBANGUNAN KEMAHIRAN (JPK)'}
                </span>
              </div>

              {/* Submit Action Inside Form (Hidden on Print) */}
              {mode === 'answer' && (
                <div className="pt-4 border-t-2 border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
                  <span className="text-xs font-mono text-slate-600 tabular-nums">
                    Soalan Dijawab: {answeredCount} / {activePaper.questions.length}
                  </span>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 text-xs sm:text-sm font-bold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 rounded-lg border border-[#c59b38] inline-flex items-center justify-center gap-2 shadow"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {submitting
                        ? 'Pegawai Penilai AI Sedang Menyemak...'
                        : 'Hantar & Semak Dengan AI'}
                    </span>
                  </button>
                </div>
              )}
            </form>
          )}

          {/* Pengajar/Admin Trainee Submissions Inspector (Hidden on Print) */}
          {canEdit && paperSubmissions.length > 0 && (
            <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-4 print:hidden">
              <div>
                <h4 className="text-sm font-bold text-white">
                  Rekod Penilaian Pelatih — {activePaper.setCode}
                </h4>
                <p className="mt-0.5 text-xs text-slate-400">
                  Klik &ldquo;Lihat Semakan&rdquo; untuk menyemak jawapan pelatih dan ulasan AI.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#1a2f5c] text-slate-400">
                      <th className="py-2 pr-3">Tarikh &amp; Masa</th>
                      <th className="py-2 px-3">Pelatih</th>
                      <th className="py-2 px-3">Markah</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 pl-3 text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1a2f5c]">
                    {paperSubmissions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-[#112247]/60">
                        <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                          {new Date(sub.submittedAt).toLocaleString('ms-MY')}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-white">
                          {sub.userName}{' '}
                          <span className="font-mono text-slate-400">({sub.userCodeId})</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-slate-200">
                          {sub.totalScore}/{sub.maxTotalScore} ({sub.percentage}%)
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold">
                          <span className={sub.passed ? 'text-emerald-400' : 'text-red-400'}>
                            {sub.passed ? 'LULUS' : 'BELUM LULUS'}
                          </span>
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setInspectedSubmissionId(sub.id);
                              setMode('review');
                            }}
                            className="text-[#f0cb63] hover:underline font-medium"
                          >
                            Lihat Semakan
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

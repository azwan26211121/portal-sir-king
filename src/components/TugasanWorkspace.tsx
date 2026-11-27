import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ClipboardEdit,
  CloudUpload,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileUp,
  FolderOpen,
  Lock,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import {
  applyDriveFolderAndFilePermissions,
  buildTraineeFolderName,
  type CategorizedDriveFile,
  computeAuthorizedEmailsForTrainee,
  getGoogleDriveAccessToken,
  getGoogleWorkspaceUser,
  initGoogleWorkspaceAuth,
  resolveHierarchicalTraineeDriveFolder,
  signInWithGoogleDrive,
  signOutGoogleWorkspace,
  upsertDriveFileInFolder,
} from '../lib/googleDrive.ts';
import {
  downloadPdfBytes,
  generateInjectedTugasanPdfBytes,
  printPdfBytes,
} from '../lib/pdfOverlay.ts';
import { GoogleSignInButton } from './GoogleSignInButton.tsx';
import {
  ELECTRICAL_SYMBOL_OPTIONS,
  ElectricalSymbolSvg,
  getSymbolLabelById,
} from './ElectricalSymbols.tsx';
import type {
  BrandingConfig,
  CUModule,
  ExternalDrivePdfSession,
  PublicUser,
  TopicLevel,
  TugasanPaper,
  TugasanQuestion,
  TugasanSubmission,
} from '../types.ts';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface TugasanWorkspaceProps {
  token: string;
  user: PublicUser;
  branding: BrandingConfig;
  level: TopicLevel;
  cu: CUModule;
  papers: TugasanPaper[];
  submissions: TugasanSubmission[];
  onRefreshWorkspace: () => Promise<void>;
  externalDrivePdf?: ExternalDrivePdfSession | null;
  onClearExternalDrivePdf?: () => void;
  driveAssessmentFiles?: CategorizedDriveFile[];
  driveCuPathLabel?: string;
  openingDrivePdfId?: string | null;
  onOpenDrivePdf?: (file: CategorizedDriveFile) => Promise<void>;
}

interface RenderedPdfPageInfo {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  dataUrl: string;
}

function parseJsonRecord(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // Ignore parse error
  }
  return {};
}

function hasQuestionAnswer(q: TugasanQuestion, raw: string | undefined): boolean {
  if (!raw || !raw.trim()) return false;
  if (
    q.questionType === 'true_false' ||
    q.questionType === 'matching' ||
    q.questionType === 'diagram_label' ||
    q.questionType === 'symbol_draw'
  ) {
    const rec = parseJsonRecord(raw);
    return Object.values(rec).some((v) => typeof v === 'string' && v.trim().length > 0);
  }
  return raw.trim().length > 0;
}

export function TugasanWorkspace({
  token,
  user,
  branding,
  level,
  cu,
  papers,
  submissions,
  onRefreshWorkspace,
  externalDrivePdf,
  onClearExternalDrivePdf,
  driveAssessmentFiles = [],
  driveCuPathLabel,
  openingDrivePdfId = null,
  onOpenDrivePdf,
}: TugasanWorkspaceProps) {
  const canEdit =
    user.role === 'pengajar' || user.role === 'admin' || user.role === 'master_admin';

  const activeExternalForCu =
    externalDrivePdf && externalDrivePdf.cuId === cu.id ? externalDrivePdf : null;

  const cuPapers = useMemo(() => {
    const base = papers.filter((p) => p.cuId === cu.id);
    if (activeExternalForCu && !base.some((p) => p.id === activeExternalForCu.paper.id)) {
      return [activeExternalForCu.paper, ...base];
    }
    return base;
  }, [papers, cu.id, activeExternalForCu]);

  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(
    cuPapers[0]?.id || null
  );
  const [mode, setMode] = useState<'answer' | 'review' | 'edit'>('answer');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [inspectedSubmissionId, setInspectedSubmissionId] = useState<string | null>(null);

  // Original PDF state & rendered page canvases
  const [sourcePdfBytes, setSourcePdfBytes] = useState<Uint8Array | null>(null);
  const [renderedPages, setRenderedPages] = useState<RenderedPdfPageInfo[]>([]);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [activeSymbolPicker, setActiveSymbolPicker] = useState<{
    qId: string;
    rowKey: string;
  } | null>(null);

  // Custom PDF upload ref
  const sourcePdfFileRef = useRef<HTMLInputElement | null>(null);
  const [uploadingSourcePdf, setUploadingSourcePdf] = useState(false);

  // Google Drive Auth & Sync State
  const [driveConnected, setDriveConnected] = useState(() => Boolean(getGoogleDriveAccessToken()));
  const [googleEmail, setGoogleEmail] = useState<string | null>(
    () => getGoogleWorkspaceUser()?.email || null
  );
  const [driveBusy, setDriveBusy] = useState(false);

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
    if (activeExternalForCu) {
      setSelectedPaperId(activeExternalForCu.paper.id);
      setShowCreateForm(false);
    }
  }, [activeExternalForCu?.driveFileId, activeExternalForCu?.paper.id]);

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
    setActiveSymbolPicker(null);
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

  const isUsingExternalDrivePdf = Boolean(
    activeExternalForCu && activePaper?.id === activeExternalForCu.paper.id
  );

  // Load & render original PDF pages whenever activePaper changes
  const hasSourcePdf = Boolean(
    isUsingExternalDrivePdf || activePaper?.sourcePdfUrl || activePaper?.sourcePdfStoredName
  );

  const loadAndRenderSourcePdf = useCallback(async () => {
    if (!activePaper || !hasSourcePdf) {
      setSourcePdfBytes(null);
      setRenderedPages([]);
      setPdfLoadError(null);
      return;
    }

    let cancelled = false;
    setLoadingPdf(true);
    setPdfLoadError(null);

    try {
      const bytes =
        isUsingExternalDrivePdf && activeExternalForCu
          ? activeExternalForCu.pdfBytes
          : await api.fetchTugasanSourcePdf(token, activePaper.id);
      if (cancelled) return;
      setSourcePdfBytes(bytes);

      const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
      const pdfDoc = await loadingTask.promise;
      if (cancelled) {
        await loadingTask.destroy();
        return;
      }

      const pagesOut: RenderedPdfPageInfo[] = [];
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum += 1) {
        const page = await pdfDoc.getPage(pageNum);
        const baseViewport = page.getViewport({ scale: 1 });
        const renderViewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: renderViewport, canvas }).promise;
        }
        pagesOut.push({
          pageNumber: pageNum,
          widthPt: baseViewport.width,
          heightPt: baseViewport.height,
          dataUrl: canvas.toDataURL('image/png'),
        });
      }
      await loadingTask.destroy();
      if (!cancelled) {
        setRenderedPages(pagesOut);
      }
    } catch (err) {
      if (!cancelled) {
        setSourcePdfBytes(null);
        setRenderedPages([]);
        setPdfLoadError(
          err instanceof Error
            ? err.message
            : 'Gagal memaparkan fail PDF asal Kertas Tugasan.'
        );
      }
    } finally {
      if (!cancelled) setLoadingPdf(false);
    }

    return () => {
      cancelled = true;
    };
  }, [activePaper, hasSourcePdf, token, isUsingExternalDrivePdf, activeExternalForCu]);

  useEffect(() => {
    let cleanupFn: (() => void) | undefined;
    void loadAndRenderSourcePdf().then((fn) => {
      if (typeof fn === 'function') cleanupFn = fn;
    });
    return () => {
      if (cleanupFn) cleanupFn();
    };
  }, [loadAndRenderSourcePdf]);

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
    setActiveSymbolPicker(null);
    setMode('answer');
    setErrorMsg(null);
    setInfoMsg(null);
  }

  async function handleConnectGoogleDrive() {
    setErrorMsg(null);
    setDriveBusy(true);
    try {
      const { user: gUser } = await signInWithGoogleDrive();
      setDriveConnected(true);
      setGoogleEmail(gUser.email || gUser.displayName || 'Akaun Google');
      setInfoMsg(
        `Google Drive disambungkan (${gUser.email || 'Akaun Google'}). Rekod latihan akan disimpan ke folder ADMIN / Pengajar / No. KP.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyambung akaun Google Drive.');
    } finally {
      setDriveBusy(false);
    }
  }

  async function handleDisconnectGoogleDrive() {
    await signOutGoogleWorkspace().catch(() => {});
    setDriveConnected(false);
    setGoogleEmail(null);
  }

  async function resolveSupervisorNameForSubmission(
    submission: TugasanSubmission
  ): Promise<string> {
    if (submission.userId === user.id) {
      return user.supervisorName || (user.role === 'pengajar' ? user.name : 'PENTADBIR UTAMA');
    }
    if (canEdit) {
      try {
        const res = await api.getUsers(token);
        const found = res.users.find((u) => u.id === submission.userId);
        if (found?.supervisorName) return found.supervisorName;
      } catch {
        // Fallback below
      }
      if (user.role === 'pengajar') return user.name;
    }
    return 'PENTADBIR UTAMA';
  }

  async function buildCurrentPaperPdfBytes(
    submissionOverride?: TugasanSubmission | null
  ): Promise<Uint8Array> {
    if (!activePaper) {
      throw new Error('Kertas tugasan tidak ditemui.');
    }
    const targetSub =
      submissionOverride !== undefined ? submissionOverride : activeReviewSubmission;
    const traineeName = targetSub ? targetSub.userName : user.name;
    const traineeCodeId = targetSub ? targetSub.userCodeId : user.userId;
    const traineeIc = targetSub
      ? targetSub.userIcNumber || (targetSub.userId === user.id ? user.icNumber : '') || '-'
      : user.icNumber || '-';
    const dateStr = targetSub
      ? new Date(targetSub.submittedAt).toLocaleDateString('ms-MY')
      : new Date().toLocaleDateString('ms-MY');

    let pdfBytesToInject = sourcePdfBytes;
    if (!pdfBytesToInject && isUsingExternalDrivePdf && activeExternalForCu) {
      pdfBytesToInject = activeExternalForCu.pdfBytes;
    } else if (!pdfBytesToInject && hasSourcePdf) {
      pdfBytesToInject = await api.fetchTugasanSourcePdf(token, activePaper.id).catch(() => null);
    }

    return generateInjectedTugasanPdfBytes({
      sourcePdfBytes: pdfBytesToInject,
      paper: activePaper,
      submission: targetSub,
      answers: targetSub?.answers || answers,
      traineeName,
      traineeIc,
      traineeCodeId,
      dateStr,
      branding,
    });
  }

  async function syncSubmissionPdfToDrive(
    submission: TugasanSubmission,
    silentAuto = false
  ): Promise<void> {
    if (!activePaper) return;
    let accessToken = getGoogleDriveAccessToken();
    if (!accessToken) {
      const signed = await signInWithGoogleDrive();
      accessToken = signed.accessToken;
      setDriveConnected(true);
      setGoogleEmail(signed.user.email || signed.user.displayName || 'Akaun Google');
    }

    const targetIc =
      submission.userIcNumber ||
      (submission.userId === user.id ? user.icNumber : '') ||
      '';
    const supervisorName = await resolveSupervisorNameForSubmission(submission);

    const folder = await resolveHierarchicalTraineeDriveFolder(
      accessToken,
      branding.driveRecordsFolderId,
      supervisorName,
      targetIc,
      submission.userCodeId,
      submission.userName,
      { ensureApprovedSubfolder: true }
    );

    const targetFolderId =
      submission.passed && folder.approvedRecordsFolderId
        ? folder.approvedRecordsFolderId
        : folder.id;
    const targetFolderUrl =
      submission.passed && folder.approvedRecordsFolderUrl
        ? folder.approvedRecordsFolderUrl
        : folder.webViewLink;
    const targetFolderName =
      submission.passed && folder.approvedRecordsFolderId
        ? `${folder.name} / REKOD_DILULUSKAN`
        : folder.name;

    const pdfBytes = await buildCurrentPaperPdfBytes(submission);
    const copy = new Uint8Array(pdfBytes.byteLength);
    copy.set(pdfBytes);
    const pdfBlob = new Blob([copy.buffer], { type: 'application/pdf' });
    const cleanCode = activePaper.paperCode.replace(/[\\/:*?"<>|]/g, '-');
    const pdfFileName = `${cleanCode}-${submission.userCodeId}.pdf`;

    const uploaded = await upsertDriveFileInFolder(
      accessToken,
      targetFolderId,
      pdfFileName,
      'application/pdf',
      pdfBlob
    );

    if (submission.passed) {
      let authEmails: { writerEmails: string[]; readerEmails: string[]; allAuthorizedEmails: string[] } = {
        writerEmails: [],
        readerEmails: user.email ? [user.email] : [],
        allAuthorizedEmails: user.email ? [user.email] : [],
      };
      if (canEdit) {
        try {
          const sys = await api.getDriveSystemRegistry(token);
          const traineeRec = sys.registry.users.find((u) => u.id === submission.userId);
          if (traineeRec) {
            authEmails = computeAuthorizedEmailsForTrainee(traineeRec, sys.registry.users);
          }
        } catch {
          // Keep best-effort email list
        }
      }
      if (authEmails.allAuthorizedEmails.length > 0) {
        await applyDriveFolderAndFilePermissions(accessToken, targetFolderId, {
          writerEmails: authEmails.writerEmails,
          readerEmails: authEmails.readerEmails,
          pruneUnauthorized: canEdit,
        }).catch(() => {});
        await applyDriveFolderAndFilePermissions(accessToken, uploaded.id, {
          writerEmails: authEmails.writerEmails,
          readerEmails: authEmails.readerEmails,
          pruneUnauthorized: canEdit,
        }).catch(() => {});
      }
    }

    await api.markTugasanDriveSynced(token, submission.id, {
      driveFolderId: targetFolderId,
      driveFolderName: targetFolderName,
      driveFolderUrl: targetFolderUrl,
      driveFileId: uploaded.id,
      driveFileUrl: uploaded.webViewLink,
    });
    await onRefreshWorkspace();

    const folderActionText = folder.created
      ? `Folder baharu (${folder.pathLabel}${submission.passed ? ' / REKOD_DILULUSKAN' : ''}) dicipta`
      : `Folder (${folder.pathLabel}${submission.passed ? ' / REKOD_DILULUSKAN' : ''}) digunakan`;
    setInfoMsg(
      silentAuto
        ? `Penandaan AI selesai (${submission.percentage}% — ${
            submission.passed ? 'LULUS' : 'BELUM LULUS'
          }). Rekod PDF dijana & disimpan ke Google Drive (${folderActionText}).`
        : `Rekod PDF Kertas Tugasan berjaya disimpan ke Google Drive (${folderActionText} · Fail: ${uploaded.name}).`
    );
  }

  async function handleSaveActiveSubmissionToDrive() {
    if (!activeReviewSubmission) return;
    setErrorMsg(null);
    setDriveBusy(true);
    try {
      await syncSubmissionPdfToDrive(activeReviewSubmission, false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Gagal memuat naik rekod ke Google Drive.'
      );
    } finally {
      setDriveBusy(false);
    }
  }

  async function handleSubmitForAiMarking(e: React.FormEvent) {
    e.preventDefault();
    if (!activePaper) return;
    setSubmitting(true);
    setActiveSymbolPicker(null);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const isDynamicDrivePaper = Boolean(
        isUsingExternalDrivePdf &&
          activeExternalForCu &&
          !papers.some((p) => p.id === activePaper.id)
      );
      const res =
        isDynamicDrivePaper && activeExternalForCu
          ? await api.gradeDrivePdfPaper(token, {
              cuId: cu.id,
              driveFileId: activeExternalForCu.driveFileId,
              fileName: activeExternalForCu.fileName,
              paper: activePaper,
              answers,
            })
          : await api.submitTugasan(token, activePaper.id, answers);
      await onRefreshWorkspace();
      setInspectedSubmissionId(res.submission.id);
      setMode('review');
      setInfoMsg(
        res.submission.passed
          ? `Penandaan AI selesai: Markah anda ${res.submission.percentage}% (LULUS). Kertas tugasan kini dibuka untuk cetakan & muat turun PDF.`
          : `Penandaan AI selesai: Markah anda ${res.submission.percentage}% (BELUM LULUS). Minimum ${activePaper.passingScore}% diperlukan untuk mencetak.`
      );

      // Auto-sync generated PDF record to hierarchical Google Drive folder when connected
      if (getGoogleDriveAccessToken()) {
        setDriveBusy(true);
        setTimeout(() => {
          void syncSubmissionPdfToDrive(res.submission, true)
            .catch((driveErr) => {
              setErrorMsg(
                driveErr instanceof Error
                  ? `Penandaan AI berjaya, namun muat naik automatik Drive gagal: ${driveErr.message}`
                  : 'Penandaan AI berjaya, namun muat naik automatik Drive gagal.'
              );
            })
            .finally(() => setDriveBusy(false));
        }, 200);
      }
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

  async function handleDownloadPdf(triggeredByPrintFallback = false) {
    if (!activePaper || !activeReviewSubmission || !activeReviewSubmission.passed) {
      setErrorMsg(
        `Muat turun PDF tidak dibenarkan. Markah mestilah sekurang-kurangnya ${activePaper?.passingScore || 60}% (LULUS) sebelum mencetak.`
      );
      return;
    }
    setExportingPdf(true);
    setErrorMsg(null);
    try {
      void api
        .authorizePrintTugasan(token, activePaper.id, activeReviewSubmission.id)
        .catch(() => {});
      const pdfBytes = await buildCurrentPaperPdfBytes(activeReviewSubmission);
      const fileSlug = `${activePaper.paperCode}-${activeReviewSubmission.userCodeId}`;
      downloadPdfBytes(pdfBytes, fileSlug);
      setInfoMsg(
        triggeredByPrintFallback
          ? 'Dialog cetak terus disekat oleh bingkai pratonton — fail PDF rasmi telah dijana daripada kertas asal dan dimuat turun secara automatik.'
          : 'Fail PDF Kertas Tugasan rasmi (susun atur kertas asal) berjaya dimuat turun.'
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal menjana fail PDF daripada kertas asal.'
      );
    } finally {
      setExportingPdf(false);
    }
  }

  async function handlePrintPaper() {
    if (!activePaper || !activeReviewSubmission || !activeReviewSubmission.passed) {
      setErrorMsg(
        `Cetakan tidak dibenarkan. Markah mestilah sekurang-kurangnya ${activePaper?.passingScore || 60}% (LULUS) sebelum mencetak.`
      );
      return;
    }
    if (mode !== 'review') {
      setMode('review');
    }
    setPrinting(true);
    setErrorMsg(null);
    try {
      void api
        .authorizePrintTugasan(token, activePaper.id, activeReviewSubmission.id)
        .catch(() => {});
      const pdfBytes = await buildCurrentPaperPdfBytes(activeReviewSubmission);
      const ok = await printPdfBytes(pdfBytes);
      if (!ok) {
        const fileSlug = `${activePaper.paperCode}-${activeReviewSubmission.userCodeId}`;
        downloadPdfBytes(pdfBytes, fileSlug);
        setInfoMsg(
          'Dialog cetak disekat oleh bingkai pratonton — fail PDF rasmi telah dimuat turun secara automatik untuk cetakan.'
        );
      }
    } catch {
      await handleDownloadPdf(true);
    } finally {
      setPrinting(false);
    }
  }

  async function handleUploadSourcePdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activePaper) return;
    setUploadingSourcePdf(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      await api.uploadTugasanSourcePdf(token, activePaper.id, file);
      await onRefreshWorkspace();
      setInfoMsg(`Fail PDF asal "${file.name}" berjaya dipautkan pada ${activePaper.paperCode}.`);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Gagal memuat naik fail PDF asal.'
      );
    } finally {
      setUploadingSourcePdf(false);
    }
  }

  async function handleDeleteSourcePdf() {
    if (!activePaper) return;
    setUploadingSourcePdf(true);
    setErrorMsg(null);
    try {
      await api.deleteTugasanSourcePdf(token, activePaper.id);
      await onRefreshWorkspace();
      setInfoMsg('Fail PDF tersuai telah dipadam.');
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Gagal memadam fail PDF tersuai.'
      );
    } finally {
      setUploadingSourcePdf(false);
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

  function updateStructuredField(qId: string, fieldKey: string, fieldValue: string) {
    setAnswers((prev) => {
      const current = parseJsonRecord(prev[qId]);
      const next = { ...current, [fieldKey]: fieldValue };
      return { ...prev, [qId]: JSON.stringify(next) };
    });
  }

  const totalMaxMarks = activePaper
    ? activePaper.questions.reduce((sum, q) => sum + q.maxMarks, 0)
    : 0;
  const answeredCount = activePaper
    ? activePaper.questions.filter((q) => hasQuestionAnswer(q, answers[q.id])).length
    : 0;

  const isReview = mode === 'review' && Boolean(activeReviewSubmission);
  const displayTraineeName =
    isReview && activeReviewSubmission ? activeReviewSubmission.userName : user.name;
  const displayTraineeId =
    isReview && activeReviewSubmission ? activeReviewSubmission.userCodeId : user.userId;
  const displayTraineeIc =
    isReview && activeReviewSubmission
      ? activeReviewSubmission.userIcNumber ||
        (activeReviewSubmission.userId === user.id ? user.icNumber : '') ||
        '-'
      : user.icNumber || '-';
  const displayDate =
    isReview && activeReviewSubmission
      ? new Date(activeReviewSubmission.submittedAt).toLocaleDateString('ms-MY')
      : new Date().toLocaleDateString('ms-MY');
  const collegeNameDisplay =
    branding.collegeName?.trim() || 'JABATAN PEMBANGUNAN KEMAHIRAN (JPK)';
  const collegeAddressDisplay =
    branding.collegeAddress?.trim() ||
    'TINGKAT 7-8, BLOK D4, KOMPLEKS D,\nPUSAT PENTADBIRAN KERAJAAN PERSEKUTUAN, 62530 PUTRAJAYA';
  const collegeLogoDisplay =
    branding.logoUrl || '/assets/aistudio/logo_sir_king_portal_93f80572.jpeg';

  // Determine whether we are in Native Original PDF Overlay Mode or Unmapped/Fallback Mode
  const isMappedPdfMode = Boolean(
    hasSourcePdf && activePaper?.pdfOverlayMeta && renderedPages.length > 0
  );
  const isCustomUnmappedPdfMode = Boolean(
    hasSourcePdf && !activePaper?.pdfOverlayMeta && renderedPages.length > 0
  );

  // Any questions that don't have coordinates on the original PDF get shown in a compact interactive list
  const unmappedQuestions = useMemo(() => {
    if (!activePaper) return [];
    if (isCustomUnmappedPdfMode) return activePaper.questions;
    if (isMappedPdfMode) {
      return activePaper.questions.filter((q) => !q.pdfOverlay);
    }
    return [];
  }, [activePaper, isCustomUnmappedPdfMode, isMappedPdfMode]);

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
              Paparan terus daripada <span className="text-[#f0cb63] font-medium">fail PDF asal JPK</span>. Jawab terus pada ruangan soalan untuk ditanda oleh AI (markah &amp; tanda ✓ / ✗). Markah mestilah{' '}
              <span className="text-emerald-400 font-medium">LULUS (&ge; 60%)</span> untuk mencetak PDF rasmi.
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

        {driveAssessmentFiles.length > 0 && onOpenDrivePdf && (
          <div className="p-3.5 rounded-lg border border-[#263f73] bg-[#071024] space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold text-white">
                <FolderOpen className="w-4 h-4 text-[#f0cb63]" />
                <span>
                  Kertas Tugasan (KT) &amp; Penilaian Teori dari Google Drive
                  {driveCuPathLabel ? ` (${driveCuPathLabel})` : ''}
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-400">
                {driveAssessmentFiles.length} fail PDF sedia dibuka terus
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {driveAssessmentFiles.map((file) => {
                const isActive = activeExternalForCu?.driveFileId === file.id;
                const isOpening = openingDrivePdfId === file.id;
                const badge = file.category === 'kt' ? 'KT' : 'PENILAIAN TEORI';
                return (
                  <button
                    key={file.id}
                    type="button"
                    disabled={Boolean(openingDrivePdfId)}
                    onClick={() => void onOpenDrivePdf(file)}
                    className={`text-left p-2.5 rounded-lg border transition-colors flex items-center justify-between gap-2 ${
                      isActive
                        ? 'bg-[#17356e]/80 border-[#e5b94c] text-white'
                        : 'bg-[#0b1733] border-[#1a2f5c] hover:border-[#2a4a8a] text-slate-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-[#102045] border border-[#263f73] text-[#f0cb63] font-mono text-[10px] font-bold">
                          {badge}
                        </span>
                        <span className="truncate font-medium">{file.name}</span>
                      </div>
                      {file.subPath && (
                        <p className="mt-0.5 text-[10px] font-mono text-slate-400 truncate">
                          Subfolder: {file.subPath}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold text-[#f0cb63] shrink-0">
                      {isOpening ? 'Membuka...' : isActive ? 'Aktif' : 'Buka PDF →'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeExternalForCu && (
          <div className="p-3.5 rounded-lg border border-sky-500/50 bg-sky-950/50 text-xs text-sky-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-[#f0cb63] shrink-0" />
              <span>
                PDF Asal Google Drive Aktif:{' '}
                <strong className="text-white">
                  {activeExternalForCu.subfolderName} / {activeExternalForCu.fileName}
                </strong>
              </span>
            </div>
            {onClearExternalDrivePdf && (
              <button
                type="button"
                onClick={onClearExternalDrivePdf}
                className="px-2.5 py-1 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] rounded-md inline-flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Tutup PDF Drive</span>
              </button>
            )}
          </div>
        )}

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
                    placeholder="Skema jawapan rujukan AI (untuk pengiraan markah sahaja)..."
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

      {/* Active Paper Controls + Original PDF Viewer / Fallback Sheet */}
      {activePaper && (
        <div className="space-y-4">
          {/* Action Toolbar */}
          <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                <span className="text-[#f0cb63] font-semibold">{activePaper.paperCode}</span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="text-slate-300 tabular-nums">
                  Markah Lulus: &ge; {activePaper.passingScore}%
                </span>
                {hasSourcePdf && (
                  <>
                    <span className="text-slate-600" aria-hidden="true">·</span>
                    <span className="text-emerald-400 font-semibold">
                      PDF Asal ({renderedPages.length || '...'} Halaman)
                    </span>
                  </>
                )}
              </div>
              {activeReviewSubmission ? (
                <div className="flex flex-wrap items-center gap-2.5 text-sm">
                  <span className="font-semibold text-white">
                    Keputusan ({activeReviewSubmission.userName}):
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
                  Isi jawapan terus di atas kertas soalan dan klik{' '}
                  <span className="text-[#f0cb63] font-medium">Hantar &amp; Semak Dengan AI</span>{' '}
                  untuk mendapat markah serta tanda ✓ / ✗.
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
                  <span>Semak Markah</span>
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

              {/* Pass-Gated Print & PDF Buttons (Generated via pdf-lib from Original PDF) */}
              <button
                type="button"
                disabled={!canPrintPaper || printing || exportingPdf}
                onClick={() => void handlePrintPaper()}
                title={
                  canPrintPaper
                    ? 'Cetak Fail PDF Kertas Tugasan Rasmi'
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
                    ? 'Menjana Cetakan PDF...'
                    : canPrintPaper
                    ? 'Cetak Kertas Tugasan (Lulus)'
                    : 'Cetak Dikunci (Perlu Lulus)'}
                </span>
              </button>

              {canPrintPaper && (
                <button
                  type="button"
                  disabled={exportingPdf}
                  onClick={() => void handleDownloadPdf(false)}
                  title="Muat turun fail PDF rasmi yang disuntik jawapan, tanda ✓/✗ dan markah"
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{exportingPdf ? 'Menjana PDF...' : 'Muat Turun PDF'}</span>
                </button>
              )}

              {activeReviewSubmission &&
                (driveConnected ? (
                  <button
                    type="button"
                    disabled={driveBusy || exportingPdf}
                    onClick={() => void handleSaveActiveSubmissionToDrive()}
                    title={`Simpan PDF rekod ke Google Drive dalam folder ADMIN / Pengajar / ${buildTraineeFolderName(
                      activeReviewSubmission.userIcNumber ||
                        (activeReviewSubmission.userId === user.id ? user.icNumber : ''),
                      activeReviewSubmission.userCodeId
                    )}`}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-600 disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                  >
                    <CloudUpload className="w-3.5 h-3.5" />
                    <span>{driveBusy ? 'Menyimpan ke Drive...' : 'Simpan ke Drive'}</span>
                  </button>
                ) : (
                  <GoogleSignInButton
                    onClick={() => void handleConnectGoogleDrive()}
                    disabled={driveBusy}
                  />
                ))}

              {canEdit && (
                <>
                  <input
                    ref={sourcePdfFileRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handleUploadSourcePdf}
                    className="sr-only"
                  />
                  <button
                    type="button"
                    disabled={uploadingSourcePdf}
                    onClick={() => sourcePdfFileRef.current?.click()}
                    title="Muat naik atau gantikan fail PDF asal untuk kertas tugasan ini"
                    className="px-3 py-2 text-xs font-medium text-sky-200 bg-[#102045] hover:bg-[#172e61] border border-[#263f73] rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <FileUp className="w-3.5 h-3.5 text-sky-400" />
                    <span>
                      {uploadingSourcePdf
                        ? 'Memuat Naik...'
                        : activePaper.sourcePdfStoredName
                        ? 'Ganti PDF Asal'
                        : 'Muat Naik PDF Asal'}
                    </span>
                  </button>
                  {activePaper.sourcePdfStoredName && (
                    <button
                      type="button"
                      disabled={uploadingSourcePdf}
                      onClick={() => void handleDeleteSourcePdf()}
                      className="px-2.5 py-2 text-xs font-medium text-amber-300 bg-[#102045] hover:bg-[#172e61] border border-[#263f73] rounded-lg"
                      title="Buang fail PDF tersuai"
                    >
                      Buang PDF
                    </button>
                  )}

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

          {/* Google Drive Hierarchical Archive Status Bar */}
          {mode !== 'edit' && (
            <div className="bg-[#081228] border border-[#1c366b] rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs print:hidden">
              <div className="flex flex-wrap items-center gap-2 text-slate-300">
                <FolderOpen className="w-4 h-4 text-[#f0cb63] shrink-0" />
                <span>
                  Arkib Rekod Drive:{' '}
                  <span className="font-mono text-white">
                    ADMIN / {user.supervisorName || 'PENTADBIR UTAMA'} /{' '}
                    {buildTraineeFolderName(
                      activeReviewSubmission?.userIcNumber || user.icNumber,
                      activeReviewSubmission?.userCodeId || user.userId
                    )}
                  </span>
                </span>
                {driveConnected && googleEmail && (
                  <span className="text-emerald-400 font-medium">
                    · Disambung ({googleEmail})
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                {activeReviewSubmission?.driveFileUrl && (
                  <a
                    href={activeReviewSubmission.driveFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-400 hover:underline font-semibold"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Buka Rekod di Drive</span>
                  </a>
                )}
                {activeReviewSubmission?.driveFolderUrl && (
                  <a
                    href={activeReviewSubmission.driveFolderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#f0cb63] hover:underline font-medium"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Folder {activeReviewSubmission.driveFolderName}</span>
                  </a>
                )}
                {!driveConnected && !activeReviewSubmission && (
                  <GoogleSignInButton
                    onClick={() => void handleConnectGoogleDrive()}
                    disabled={driveBusy}
                  />
                )}
                {driveConnected && (
                  <button
                    type="button"
                    onClick={() => void handleDisconnectGoogleDrive()}
                    className="text-slate-400 hover:text-white underline"
                  >
                    Putus Google
                  </button>
                )}
              </div>
            </div>
          )}

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
                    ? `Percubaan terkini memperoleh ${activeReviewSubmission.percentage}% (${activeReviewSubmission.totalScore}/${activeReviewSubmission.maxTotalScore} markah — BELUM LULUS). Semak tanda ✓ / ✗ pada setiap soalan dan klik "Jawab Semula" sehingga mencapai sekurang-kurangnya ${activePaper.passingScore}% untuk mencetak fail PDF rasmi.`
                    : `Pelatih mesti menjawab soalan di atas kertas tugasan ini dan disemak oleh AI dengan markah lulus sekurang-kurangnya ${activePaper.passingScore}% sebelum butang Cetak & Muat Turun PDF dibuka.`}
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
                  <span className="text-xs font-semibold text-white">Soalan &amp; Skema Markah</span>
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
                      placeholder="Skema rujukan penandaan AI..."
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

          {/* MAIN WORKSPACE FORM: ORIGINAL PDF WITH COORDINATE OVERLAYS OR FALLBACK */}
          {mode !== 'edit' && (
            <form onSubmit={handleSubmitForAiMarking} className="space-y-5">
              {hasSourcePdf && loadingPdf && (
                <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-10 text-center text-xs text-slate-300">
                  Memuatkan halaman PDF asal Kertas Tugasan ({activePaper.paperCode})...
                </div>
              )}

              {hasSourcePdf && pdfLoadError && (
                <div className="bg-red-950/60 border border-red-800/70 rounded-xl p-4 text-xs text-red-300">
                  {pdfLoadError}
                </div>
              )}

              {/* STEP 1 & 2: ORIGINAL PDF PAGES WITH INTERACTIVE & AI MARKING OVERLAYS */}
              {(isMappedPdfMode || isCustomUnmappedPdfMode) && (
                <div className="space-y-6">
                  {renderedPages.map((pg) => {
                    const meta = activePaper.pdfOverlayMeta;
                    const pageW = pg.widthPt;
                    const pageH = pg.heightPt;
                    const xPct = (x: number) => `${(x / pageW) * 100}%`;
                    const yTopPct = (y: number) => `${((pageH - y) / pageH) * 100}%`;
                    const boxStyle = (box: { x: number; y: number; w: number; h: number }) => ({
                      left: `${(box.x / pageW) * 100}%`,
                      top: `${((pageH - (box.y + box.h)) / pageH) * 100}%`,
                      width: `${(box.w / pageW) * 100}%`,
                      height: `${(box.h / pageH) * 100}%`,
                    });

                    return (
                      <div
                        key={pg.pageNumber}
                        className="relative mx-auto max-w-[820px] bg-white shadow-2xl border border-slate-300 overflow-hidden select-none"
                        style={{ aspectRatio: `${pageW} / ${pageH}` }}
                      >
                        <img
                          src={pg.dataUrl}
                          alt={`${activePaper.paperCode} - Muka Surat ${pg.pageNumber}`}
                          className="w-full h-full block pointer-events-none"
                          draggable={false}
                        />

                        {/* Original PDF Logo & Address on Page 1 are preserved untouched */}

                        {/* Trainee Info Overlay (Page 1) */}
                        {meta && meta.namePos.page === pg.pageNumber && (
                          <>
                            <div
                              style={{ left: xPct(meta.namePos.x), top: yTopPct(meta.namePos.y + 8) }}
                              className="absolute max-w-[27%] font-bold text-blue-800 uppercase truncate pointer-events-none text-[clamp(7px,1.05vw,10.5px)]"
                            >
                              {displayTraineeName}
                            </div>
                            <div
                              style={{ left: xPct(meta.icPos.x), top: yTopPct(meta.icPos.y + 8) }}
                              className="absolute max-w-[24%] font-mono font-bold text-blue-800 truncate pointer-events-none text-[clamp(7px,1.05vw,10.5px)]"
                            >
                              {displayTraineeIc}
                            </div>
                            <div
                              style={{ left: xPct(meta.datePos.x), top: yTopPct(meta.datePos.y + 8) }}
                              className="absolute font-mono font-bold text-blue-800 pointer-events-none text-[clamp(7px,1.05vw,10.5px)]"
                            >
                              {displayDate}
                            </div>
                            {meta.userIdPos && meta.userIdPos.page === pg.pageNumber && (
                              <div
                                style={{
                                  left: xPct(meta.userIdPos.x),
                                  top: yTopPct(meta.userIdPos.y + 7),
                                }}
                                className="absolute font-mono text-slate-800 pointer-events-none text-[clamp(6px,0.85vw,8.5px)]"
                              >
                                ID: {displayTraineeId}
                              </div>
                            )}
                          </>
                        )}

                        {/* Total Mark inside MARKAH upper-left triangle + Overall % at bottom of right box */}
                        {meta && isReview && activeReviewSubmission && (
                          <>
                            {(meta.statusPos || meta.totalMarkPos).page === pg.pageNumber && (
                              <div
                                style={{
                                  left: xPct(
                                    meta.statusPos
                                      ? meta.statusPos.x + 18
                                      : meta.totalMarkPos.x
                                  ),
                                  top: yTopPct(
                                    (meta.statusPos
                                      ? meta.statusPos.y + 3
                                      : meta.totalMarkPos.y) + 13
                                  ),
                                }}
                                className="absolute font-mono font-bold pointer-events-none text-[#DC2626] leading-none text-[clamp(11px,1.55vw,16px)]"
                              >
                                {activeReviewSubmission.totalScore}
                              </div>
                            )}
                          </>
                        )}

                        {/* Right-hand box (COP DAN TANDATANGAN): keep ULASAN PEGAWAI PENILAI & signature area blank; render ONLY overall % at bottom in #DC2626 */}
                        {meta &&
                          isReview &&
                          activeReviewSubmission &&
                          meta.stampBox.page === pg.pageNumber && (
                            <div
                              style={{
                                left: `${((meta.stampBox.x + 2) / pageW) * 100}%`,
                                top: `${((pageH - (meta.stampBox.y + meta.stampBox.h - 2)) / pageH) * 100}%`,
                                width: `${((meta.stampBox.w - 4) / pageW) * 100}%`,
                                height: `${((meta.stampBox.h - 4) / pageH) * 100}%`,
                              }}
                              className="absolute flex items-end justify-end px-2.5 pb-1.5 pointer-events-none"
                            >
                              <span className="font-mono font-bold text-[#DC2626] leading-none text-[clamp(10px,1.4vw,14px)]">
                                {activeReviewSubmission.percentage}%
                              </span>
                            </div>
                          )}

                        {/* Custom Unmapped PDF Identity Badge on Page 1 */}
                        {isCustomUnmappedPdfMode && pg.pageNumber === 1 && (
                          <div className="absolute top-[2%] right-[3%] max-w-[44%] bg-white/95 border border-black px-2.5 py-1.5 text-black pointer-events-none shadow-sm">
                            <p className="font-bold uppercase truncate text-[clamp(7px,0.95vw,9.5px)]">
                              {displayTraineeName} ({displayTraineeId})
                            </p>
                            <p className="font-mono text-[clamp(6px,0.85vw,8.5px)]">
                              MyKad: {displayTraineeIc} · {displayDate}
                            </p>
                            {isReview && activeReviewSubmission && (
                              <p className="font-mono font-bold text-[#DC2626] text-[clamp(7px,0.95vw,9.5px)]">
                                MARKAH: {activeReviewSubmission.totalScore}/
                                {activeReviewSubmission.maxTotalScore} (
                                {activeReviewSubmission.percentage}%)
                              </p>
                            )}
                          </div>
                        )}

                        {/* Per-Question Overlays for Mapped PDFs */}
                        {meta &&
                          activePaper.questions.map((q) => {
                            const ov = q.pdfOverlay;
                            if (!ov) return null;
                            const grade =
                              isReview && activeReviewSubmission
                                ? activeReviewSubmission.grades.find((g) => g.questionId === q.id)
                                : undefined;
                            const currentAnswerRaw = isReview
                              ? grade?.answerText ?? answers[q.id] ?? ''
                              : answers[q.id] ?? '';
                            const qType = q.questionType || 'text';
                            const rec = parseJsonRecord(currentAnswerRaw);

                            return (
                              <React.Fragment key={q.id}>
                                {/* Question Mark + ✓/✗ Badge (all in #DC2626 red) */}
                                {isReview && grade && ov.markPos.page === pg.pageNumber && (
                                  <div
                                    style={{
                                      left: xPct(ov.markPos.x + 56),
                                      top: yTopPct(ov.markPos.y + 9),
                                    }}
                                    className="absolute inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#DC2626] bg-white/95 text-[#DC2626] font-mono font-bold pointer-events-none text-[clamp(7px,0.95vw,9.5px)]"
                                  >
                                    <span>
                                      [{grade.marksAwarded}/{grade.maxMarks}]
                                    </span>
                                    {grade.status === 'betul' && <Check className="w-3 h-3 text-[#DC2626]" />}
                                    {grade.status === 'salah' && <X className="w-3 h-3 text-[#DC2626]" />}
                                  </div>
                                )}

                                {/* 1. MCQ Interactive Hitboxes over A/B/C/D */}
                                {qType === 'mcq' &&
                                  ov.mcqChoices &&
                                  Object.entries(ov.mcqChoices).map(([choiceKey, pt]) => {
                                    if (pt.page !== pg.pageNumber) return null;
                                    const isSelected =
                                      currentAnswerRaw.trim().toUpperCase() === choiceKey;
                                    return (
                                      <button
                                        key={`${q.id}-${choiceKey}`}
                                        type="button"
                                        disabled={mode !== 'answer'}
                                        onClick={() =>
                                          mode === 'answer' &&
                                          setAnswers((prev) => ({ ...prev, [q.id]: choiceKey }))
                                        }
                                        title={`Soalan ${q.numberLabel} Pilihan ${choiceKey}`}
                                        style={{
                                          left: `${((pt.x - 9) / pageW) * 100}%`,
                                          top: `${((pageH - (pt.y + 13)) / pageH) * 100}%`,
                                          width: `${(26 / pageW) * 100}%`,
                                          height: `${(20 / pageH) * 100}%`,
                                        }}
                                        className={`absolute flex items-center justify-center rounded-full transition-all ${
                                          mode === 'answer'
                                            ? 'cursor-pointer hover:bg-blue-500/15 hover:ring-1 hover:ring-blue-600'
                                            : 'cursor-default'
                                        } ${
                                          isSelected
                                            ? 'ring-2 ring-blue-700 bg-blue-600/15'
                                            : ''
                                        }`}
                                      >
                                        {isSelected && isReview && grade && (
                                          <span className="absolute -right-3.5 top-0 w-3.5 h-3.5 rounded-full flex items-center justify-center bg-[#DC2626] text-white">
                                            {grade.status === 'betul' ? (
                                              <Check className="w-2.5 h-2.5" />
                                            ) : (
                                              <X className="w-2.5 h-2.5" />
                                            )}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}

                                {/* 2. True / False Inline √ / X Controls */}
                                {qType === 'true_false' &&
                                  ov.trueFalseRows &&
                                  ov.trueFalseRows.map((row, rIdx) => {
                                    if (row.page !== pg.pageNumber) return null;
                                    const rawVal = (rec[row.key] || '').trim().toUpperCase();
                                    const isTrue = rawVal === '√' || rawVal === 'BENAR';
                                    const isFalse = rawVal === 'X' || rawVal === 'PALSU';
                                    const itemStatus = grade?.itemStatuses?.[rIdx];
                                    return (
                                      <div
                                        key={`${q.id}-tf-${row.key}`}
                                        style={{
                                          left: `${((row.boxX - 24) / pageW) * 100}%`,
                                          top: `${((pageH - (row.boxY + 12)) / pageH) * 100}%`,
                                          width: `${(54 / pageW) * 100}%`,
                                          height: `${(24 / pageH) * 100}%`,
                                        }}
                                        className="absolute flex items-center justify-center gap-0.5"
                                      >
                                        {mode === 'answer' ? (
                                          <div className="inline-flex items-center gap-0.5 bg-white/95 border border-blue-400 rounded px-0.5 py-0.5 shadow-sm">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                updateStructuredField(q.id, row.key, '√')
                                              }
                                              className={`px-1 py-0.5 text-[clamp(8px,1vw,11px)] font-bold rounded leading-none ${
                                                isTrue
                                                  ? 'bg-blue-700 text-white'
                                                  : 'text-slate-700 hover:bg-blue-100'
                                              }`}
                                            >
                                              √
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                updateStructuredField(q.id, row.key, 'X')
                                              }
                                              className={`px-1 py-0.5 text-[clamp(8px,1vw,11px)] font-bold rounded leading-none ${
                                                isFalse
                                                  ? 'bg-blue-700 text-white'
                                                  : 'text-slate-700 hover:bg-blue-100'
                                              }`}
                                            >
                                              X
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="inline-flex items-center gap-1">
                                            <span className="font-bold text-blue-800 text-[clamp(11px,1.5vw,16px)]">
                                              {isTrue ? '√' : isFalse ? 'X' : '—'}
                                            </span>
                                            {itemStatus === 'betul' && (
                                              <Check className="w-3.5 h-3.5 text-[#DC2626] stroke-[3]" />
                                            )}
                                            {itemStatus === 'salah' && (
                                              <X className="w-3.5 h-3.5 text-[#DC2626] stroke-[3]" />
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}

                                {/* 3. Matching Connector SVG Lines + Inline Selectors */}
                                {qType === 'matching' &&
                                  ov.matchingLeftPoints &&
                                  ov.matchingRightPoints &&
                                  ov.matchingLeftPoints[0]?.page === pg.pageNumber && (
                                    <>
                                      <svg
                                        viewBox={`0 0 ${pageW} ${pageH}`}
                                        className="absolute inset-0 w-full h-full pointer-events-none"
                                      >
                                        {ov.matchingLeftPoints.map((lPt, rIdx) => {
                                          const chosenRaw = rec[String(rIdx)];
                                          const chosenIdx =
                                            chosenRaw !== undefined && chosenRaw !== ''
                                              ? Number(chosenRaw)
                                              : NaN;
                                          const rPt =
                                            Number.isInteger(chosenIdx) &&
                                            ov.matchingRightPoints?.[chosenIdx]
                                              ? ov.matchingRightPoints[chosenIdx]
                                              : null;
                                          if (!rPt) return null;
                                          return (
                                            <g key={`${q.id}-line-${rIdx}`}>
                                              <line
                                                x1={lPt.x}
                                                y1={pageH - lPt.y}
                                                x2={rPt.x}
                                                y2={pageH - rPt.y}
                                                stroke="#1d4ed8"
                                                strokeWidth="2"
                                              />
                                              <circle
                                                cx={lPt.x}
                                                cy={pageH - lPt.y}
                                                r="3.2"
                                                fill="#1d4ed8"
                                              />
                                              <circle
                                                cx={rPt.x}
                                                cy={pageH - rPt.y}
                                                r="3.2"
                                                fill="#1d4ed8"
                                              />
                                            </g>
                                          );
                                        })}
                                      </svg>

                                      {ov.matchingRightPoints.map((rPt, tIdx) => (
                                        <span
                                          key={`${q.id}-rtag-${tIdx}`}
                                          style={{
                                            left: xPct(rPt.x + 4),
                                            top: yTopPct(rPt.y + 8),
                                          }}
                                          className="absolute px-1 py-0.2 bg-amber-100/90 border border-amber-700 text-black font-mono font-bold rounded pointer-events-none text-[clamp(6px,0.85vw,8.5px)]"
                                        >
                                          R{tIdx + 1}
                                        </span>
                                      ))}

                                      {ov.matchingLeftPoints.map((lPt, rIdx) => {
                                        const chosenRaw = rec[String(rIdx)];
                                        const chosenIdx =
                                          chosenRaw !== undefined && chosenRaw !== ''
                                            ? Number(chosenRaw)
                                            : NaN;
                                        const hasVal =
                                          Number.isInteger(chosenIdx) &&
                                          chosenIdx >= 0 &&
                                          chosenIdx < (q.matchingRows?.length || 0);
                                        const itemStatus = grade?.itemStatuses?.[rIdx];

                                        return (
                                          <div
                                            key={`${q.id}-msel-${rIdx}`}
                                            style={{
                                              left: `${((lPt.x - 42) / pageW) * 100}%`,
                                              top: `${((pageH - (lPt.y + 11)) / pageH) * 100}%`,
                                            }}
                                            className="absolute flex items-center gap-1"
                                          >
                                            {mode === 'answer' ? (
                                              <select
                                                aria-label={`Padanan baris ${rIdx + 1}`}
                                                value={hasVal ? String(chosenIdx) : ''}
                                                onChange={(e) =>
                                                  updateStructuredField(
                                                    q.id,
                                                    String(rIdx),
                                                    e.target.value
                                                  )
                                                }
                                                className="px-1 py-0.5 bg-white/95 border border-blue-600 rounded font-mono font-bold text-blue-900 shadow-sm text-[clamp(7px,0.9vw,9.5px)]"
                                              >
                                                <option value="">--</option>
                                                {(q.matchingRows || []).map((_, tIdx) => (
                                                  <option key={tIdx} value={String(tIdx)}>
                                                    R{tIdx + 1}
                                                  </option>
                                                ))}
                                              </select>
                                            ) : (
                                              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-white/95 border border-blue-700 rounded font-mono font-bold text-blue-900 text-[clamp(7px,0.9vw,9.5px)]">
                                                <span>{hasVal ? `R${chosenIdx + 1}` : '-'}</span>
                                                {itemStatus === 'betul' && (
                                                  <Check className="w-3 h-3 text-[#DC2626] stroke-[3]" />
                                                )}
                                                {itemStatus === 'salah' && (
                                                  <X className="w-3 h-3 text-[#DC2626] stroke-[3]" />
                                                )}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </>
                                  )}

                                {/* 4. Diagram Label Inline Inputs on Lines a)..e) */}
                                {qType === 'diagram_label' &&
                                  ov.answerSlots &&
                                  ov.answerSlots.map((slot, sIdx) => {
                                    if (slot.page !== pg.pageNumber) return null;
                                    const val = rec[slot.key] || '';
                                    const itemStatus = grade?.itemStatuses?.[sIdx];
                                    return (
                                      <div
                                        key={`${q.id}-slot-${slot.key}`}
                                        style={{
                                          left: `${(slot.x / pageW) * 100}%`,
                                          top: `${((pageH - (slot.y + 11)) / pageH) * 100}%`,
                                          width: `${((slot.maxWidth + 24) / pageW) * 100}%`,
                                        }}
                                        className="absolute flex items-center gap-1"
                                      >
                                        {mode === 'answer' ? (
                                          <input
                                            type="text"
                                            value={val}
                                            onChange={(e) =>
                                              updateStructuredField(q.id, slot.key, e.target.value)
                                            }
                                            placeholder={`Jawapan (${slot.key})...`}
                                            className="w-full px-1.5 py-0.5 bg-blue-50/90 focus:bg-white border border-blue-500 rounded text-blue-950 font-semibold focus:outline-none text-[clamp(7px,0.95vw,10px)]"
                                          />
                                        ) : (
                                          <div className="flex items-center gap-1 w-full">
                                            <span className="font-bold text-blue-800 truncate text-[clamp(7px,0.95vw,10px)]">
                                              {val.trim() || '________'}
                                            </span>
                                            {itemStatus === 'betul' && (
                                              <Check className="w-3.5 h-3.5 text-[#DC2626] shrink-0 stroke-[3]" />
                                            )}
                                            {itemStatus === 'salah' && (
                                              <X className="w-3.5 h-3.5 text-[#DC2626] shrink-0 stroke-[3]" />
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}

                                {/* 5. Symbol Draw Cells (KT2 Q11) */}
                                {qType === 'symbol_draw' &&
                                  ov.symbolCells &&
                                  ov.symbolCells.map((cell, cIdx) => {
                                    if (cell.page !== pg.pageNumber) return null;
                                    const rowKey = String(cIdx + 1);
                                    const selectedSymId =
                                      rec[rowKey] || rec[`${cIdx + 1}.`] || '';
                                    const itemStatus = grade?.itemStatuses?.[cIdx];
                                    const isOpenPicker =
                                      activeSymbolPicker?.qId === q.id &&
                                      activeSymbolPicker?.rowKey === rowKey;

                                    return (
                                      <div
                                        key={`${q.id}-sym-${rowKey}`}
                                        style={boxStyle(cell)}
                                        className="absolute flex flex-col items-center justify-center p-1"
                                      >
                                        {mode === 'answer' ? (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setActiveSymbolPicker(
                                                isOpenPicker ? null : { qId: q.id, rowKey }
                                              )
                                            }
                                            className={`w-full h-full flex flex-col items-center justify-center rounded border transition-colors ${
                                              selectedSymId
                                                ? 'border-blue-600 bg-blue-50/80 hover:bg-blue-100/80'
                                                : 'border-dashed border-blue-500 bg-white/80 hover:bg-blue-50/90'
                                            }`}
                                          >
                                            {selectedSymId ? (
                                              <>
                                                <ElectricalSymbolSvg
                                                  symbolId={selectedSymId}
                                                  className="w-12 h-8 sm:w-14 sm:h-10 text-blue-900"
                                                />
                                                <span className="text-[clamp(6px,0.75vw,8px)] font-semibold text-blue-900 truncate max-w-full px-1">
                                                  {getSymbolLabelById(selectedSymId)}
                                                </span>
                                              </>
                                            ) : (
                                              <span className="text-[clamp(7px,0.9vw,9.5px)] font-semibold text-blue-700 px-1 text-center">
                                                Klik Pilih Simbol
                                              </span>
                                            )}
                                          </button>
                                        ) : (
                                          <div className="relative w-full h-full flex flex-col items-center justify-center">
                                            {selectedSymId ? (
                                              <>
                                                <ElectricalSymbolSvg
                                                  symbolId={selectedSymId}
                                                  className="w-12 h-8 sm:w-14 sm:h-10 text-blue-900"
                                                />
                                                <span className="text-[clamp(6px,0.75vw,8px)] text-slate-800 truncate max-w-full px-1">
                                                  {getSymbolLabelById(selectedSymId)}
                                                </span>
                                              </>
                                            ) : (
                                              <span className="text-[10px] text-slate-400">—</span>
                                            )}
                                            {itemStatus === 'betul' && (
                                              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#DC2626] text-white flex items-center justify-center">
                                                <Check className="w-2.5 h-2.5" />
                                              </span>
                                            )}
                                            {itemStatus === 'salah' && (
                                              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#DC2626] text-white flex items-center justify-center">
                                                <X className="w-2.5 h-2.5" />
                                              </span>
                                            )}
                                          </div>
                                        )}

                                        {isOpenPicker && mode === 'answer' && (
                                          <div className="absolute z-30 top-full right-0 mt-1 w-64 sm:w-72 p-2.5 bg-white border-2 border-blue-800 rounded-lg shadow-2xl space-y-1.5">
                                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-800">
                                              <span>Pilih Simbol Piawai (Bil {rowKey})</span>
                                              <button
                                                type="button"
                                                onClick={() => setActiveSymbolPicker(null)}
                                                className="text-slate-500 hover:text-black"
                                              >
                                                <X className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-1.5">
                                              {ELECTRICAL_SYMBOL_OPTIONS.map((sym) => {
                                                const active = selectedSymId === sym.id;
                                                return (
                                                  <button
                                                    key={sym.id}
                                                    type="button"
                                                    onClick={() => {
                                                      updateStructuredField(q.id, rowKey, sym.id);
                                                      setActiveSymbolPicker(null);
                                                    }}
                                                    className={`p-1.5 rounded border flex flex-col items-center gap-0.5 text-center ${
                                                      active
                                                        ? 'border-blue-700 bg-amber-50 font-bold'
                                                        : 'border-slate-300 hover:border-blue-600'
                                                    }`}
                                                  >
                                                    <ElectricalSymbolSvg
                                                      symbolId={sym.id}
                                                      className="w-10 h-6 text-black"
                                                    />
                                                    <span className="text-[9px] text-slate-800 leading-tight">
                                                      {sym.shortLabel}
                                                    </span>
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                              </React.Fragment>
                            );
                          })}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Supplemental Interactive Panel for Custom Unmapped PDFs or Text Questions */}
              {unmappedQuestions.length > 0 && (
                <div className="bg-white text-black rounded-xl border border-slate-300 p-5 sm:p-7 space-y-4">
                  <div className="border-b-2 border-black pb-2 flex items-center justify-between">
                    <h4 className="font-bold text-sm uppercase">
                      Ruangan Jawapan &amp; Markah ({activePaper.paperCode})
                    </h4>
                    <span className="font-mono text-xs font-bold">
                      {isReview && activeReviewSubmission
                        ? `${activeReviewSubmission.totalScore}/${activeReviewSubmission.maxTotalScore} (${activeReviewSubmission.percentage}%)`
                        : `Jumlah Markah: ${totalMaxMarks}`}
                    </span>
                  </div>

                  {unmappedQuestions.map((q) => {
                    const grade =
                      isReview && activeReviewSubmission
                        ? activeReviewSubmission.grades.find((g) => g.questionId === q.id)
                        : undefined;
                    return (
                      <div
                        key={q.id}
                        className="p-3.5 border border-slate-300 rounded-lg space-y-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-xs sm:text-sm font-semibold">
                            {q.numberLabel} {q.prompt}
                          </p>
                          <div
                            className={`shrink-0 inline-flex items-center gap-1.5 font-mono text-xs font-bold border px-2 py-0.5 bg-slate-50 ${
                              grade ? 'border-[#DC2626] text-[#DC2626]' : 'border-black text-black'
                            }`}
                          >
                            <span>
                              {grade
                                ? `[${grade.marksAwarded}/${grade.maxMarks}]`
                                : `___/${q.maxMarks}`}
                            </span>
                            {grade?.status === 'betul' && (
                              <Check className="w-3.5 h-3.5 text-[#DC2626]" />
                            )}
                            {grade?.status === 'salah' && (
                              <X className="w-3.5 h-3.5 text-[#DC2626]" />
                            )}
                          </div>
                        </div>
                        {mode === 'answer' ? (
                          <textarea
                            rows={3}
                            value={answers[q.id] || ''}
                            onChange={(e) =>
                              setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                            }
                            placeholder="Tulis jawapan anda di sini..."
                            className="w-full p-2 text-xs sm:text-sm border border-slate-400 rounded bg-slate-50 focus:bg-white focus:border-black"
                          />
                        ) : (
                          <div className="p-2 bg-slate-50 border border-slate-300 rounded text-xs sm:text-sm text-blue-900 whitespace-pre-wrap">
                            {grade?.answerText || '(Tiada jawapan diisi)'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* FALLBACK STRUCTURED JPK FORM WHEN PAPER HAS NO ATTACHED PDF */}
              {!hasSourcePdf && (
                <div className="bg-white text-black rounded-xl shadow-2xl border border-slate-300 p-6 sm:p-10 space-y-5">
                  <table className="w-full border-collapse border-2 border-black text-xs sm:text-[13px] leading-snug">
                    <tbody>
                      <tr>
                        <td className="border border-black p-3 w-28 sm:w-32 text-center align-middle bg-white">
                          <img
                            src={collegeLogoDisplay}
                            alt={collegeNameDisplay}
                            className="w-16 h-16 sm:w-20 sm:h-20 mx-auto object-contain"
                          />
                        </td>
                        <td className="border border-black p-3 text-center align-middle">
                          <p className="font-bold text-sm sm:text-base tracking-wide uppercase">
                            {collegeNameDisplay}
                          </p>
                          <p className="text-[11px] sm:text-xs font-semibold uppercase mt-0.5 whitespace-pre-line">
                            {collegeAddressDisplay}
                          </p>
                          <p className="mt-2 pt-2 border-t border-black font-bold text-sm sm:text-base tracking-wider uppercase">
                            KERTAS TUGASAN ({activePaper.setCode})
                          </p>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <table className="w-full border-collapse border-2 border-black text-xs sm:text-[13px]">
                    <tbody>
                      <tr>
                        <th className="border border-black bg-slate-100 p-2 text-left w-[22%] uppercase">
                          NAMA PELATIH
                        </th>
                        <td className="border border-black p-2 font-semibold w-[33%] uppercase">
                          {displayTraineeName}
                        </td>
                        <th className="border border-black bg-slate-100 p-2 text-left w-[20%] uppercase">
                          NO. MYKAD
                        </th>
                        <td className="border border-black p-2 font-mono font-semibold tabular-nums">
                          {displayTraineeIc}
                        </td>
                      </tr>
                      <tr>
                        <th className="border border-black bg-slate-100 p-2 text-left uppercase">
                          ID PELATIH
                        </th>
                        <td className="border border-black p-2 font-mono font-semibold">
                          {displayTraineeId}
                        </td>
                        <th className="border border-black bg-slate-100 p-2 text-left uppercase">
                          TARIKH / MARKAH
                        </th>
                        <td className="border border-black p-2 font-mono font-bold tabular-nums">
                          {displayDate} ·{' '}
                          {isReview && activeReviewSubmission
                            ? `${activeReviewSubmission.totalScore}/${activeReviewSubmission.maxTotalScore} (${activeReviewSubmission.percentage}%) — ${
                                activeReviewSubmission.passed ? 'LULUS' : 'BELUM LULUS'
                              }`
                            : `___ / ${totalMaxMarks}`}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="space-y-4">
                    {activePaper.questions.map((q) => {
                      const grade =
                        isReview && activeReviewSubmission
                          ? activeReviewSubmission.grades.find((g) => g.questionId === q.id)
                          : undefined;
                      return (
                        <div
                          key={q.id}
                          className="space-y-2 pb-4 border-b border-slate-300 last:border-b-0"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <p className="text-xs sm:text-[13px] font-semibold">
                              {q.numberLabel} {q.prompt}
                            </p>
                            <div
                              className={`shrink-0 inline-flex items-center gap-1.5 font-mono text-xs font-bold border px-2 py-0.5 bg-slate-50 ${
                                grade ? 'border-[#DC2626] text-[#DC2626]' : 'border-black text-black'
                              }`}
                            >
                              <span>
                                {grade
                                  ? `[${grade.marksAwarded}/${grade.maxMarks}]`
                                  : `___/${q.maxMarks}`}
                              </span>
                              {grade?.status === 'betul' && (
                                <Check className="w-3.5 h-3.5 text-[#DC2626]" />
                              )}
                              {grade?.status === 'salah' && (
                                <X className="w-3.5 h-3.5 text-[#DC2626]" />
                              )}
                            </div>
                          </div>

                          {mode === 'answer' ? (
                            <textarea
                              rows={3}
                              value={answers[q.id] || ''}
                              onChange={(e) =>
                                setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                              }
                              placeholder="Tulis jawapan anda di sini..."
                              className="w-full p-2.5 text-xs sm:text-[13px] bg-slate-50 border border-slate-400 focus:border-black focus:bg-white rounded"
                            />
                          ) : (
                            <div className="flex items-center justify-between gap-3 p-2.5 border border-slate-300 bg-slate-50 text-xs sm:text-[13px]">
                              <span className="whitespace-pre-wrap text-blue-900">
                                {grade?.answerText || '(Tiada jawapan diisi)'}
                              </span>
                              {grade && (
                                <span className="shrink-0 px-2 py-0.5 rounded border border-[#DC2626] bg-white font-mono text-[11px] font-bold text-[#DC2626]">
                                  [{grade.marksAwarded}/{grade.maxMarks}]
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Submit Button Bar */}
              {mode === 'answer' && (
                <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
                  <span className="text-xs font-mono text-slate-300 tabular-nums">
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
                        ? 'AI Sedang Menyemak & Menanda...'
                        : 'Hantar & Semak Dengan AI'}
                    </span>
                  </button>
                </div>
              )}
            </form>
          )}

          {/* Pengajar/Admin Trainee Submissions Inspector */}
          {canEdit && paperSubmissions.length > 0 && (
            <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-4 print:hidden">
              <div>
                <h4 className="text-sm font-bold text-white">
                  Rekod Penilaian Pelatih — {activePaper.setCode}
                </h4>
                <p className="mt-0.5 text-xs text-slate-400">
                  Klik &ldquo;Lihat Semakan&rdquo; untuk menyemak jawapan bertindih, markah dan tanda ✓ / ✗ pelatih.
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

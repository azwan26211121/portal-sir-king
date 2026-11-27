import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckSquare,
  ChevronRight,
  ClipboardCheck,
  CloudUpload,
  Download,
  ExternalLink,
  FileCheck2,
  Folder,
  FolderOpen,
  HardDrive,
  LayoutGrid,
  Link2,
  List,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  Square,
  Trash2,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import {
  buildDriveNossFolderName,
  buildSopCompletionReportBlob,
  buildTraineeFolderName,
  type CategorizedDriveFile,
  type CoCuDriveResolvedResult,
  downloadDriveFileBytes,
  type DriveFileResult,
  getGoogleDriveAccessToken,
  initGoogleWorkspaceAuth,
  JPK_DRIVE_CATEGORIES,
  resolveCoCuDriveContents,
  resolveHierarchicalTraineeDriveFolder,
  signInWithGoogleDrive,
  trashDriveFile,
  uploadFileToDriveFolder,
} from '../lib/googleDrive.ts';
import type {
  BrandingConfig,
  CUModule,
  EbookNoteModule,
  ExternalDrivePdfSession,
  FileSlotType,
  JpkDriveFileCategory,
  LearningSection,
  PublicUser,
  SopCategory,
  SopCheckProgress,
  SopStep,
  SubKey,
  TopicLevel,
  TugasanPaper,
  TugasanSubmission,
} from '../types.ts';
import { DocumentSlotCard } from './DocumentSlotCard.tsx';
import { GoogleSignInButton } from './GoogleSignInButton.tsx';
import { TeoriEbookReader } from './TeoriEbookReader.tsx';
import { TugasanWorkspace } from './TugasanWorkspace.tsx';

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

interface LearningWorkspaceProps {
  token: string;
  user: PublicUser;
  branding: BrandingConfig;
  levels: TopicLevel[];
  cus: CUModule[];
  sopProgress: SopCheckProgress[];
  tugasanPapers: TugasanPaper[];
  tugasanSubmissions: TugasanSubmission[];
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

function extractGoogleDriveFolderId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.toLowerCase() !== 'drive.google.com') return null;
    const folderMatch = parsed.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch && folderMatch[1]) return folderMatch[1];
    const idParam = parsed.searchParams.get('id');
    if (idParam && /^[a-zA-Z0-9_-]+$/.test(idParam)) return idParam;
    return null;
  } catch {
    return null;
  }
}

function toEmbedGoogleDriveFolderUrl(rawUrl: string, mode: 'list' | 'grid'): string | null {
  const folderId = extractGoogleDriveFolderId(rawUrl);
  if (!folderId) return null;
  return `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#${mode}`;
}

export function LearningWorkspace({
  token,
  user,
  branding,
  levels,
  cus,
  sopProgress,
  tugasanPapers,
  tugasanSubmissions,
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

  // Google Drive Folder Editor state
  const [driveUrlInput, setDriveUrlInput] = useState('');
  const [driveTitleInput, setDriveTitleInput] = useState('');
  const [savingDrive, setSavingDrive] = useState(false);
  const [driveMsg, setDriveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [driveViewMode, setDriveViewMode] = useState<'list' | 'grid'>('list');

  // SOP Editor & Google Drive Sync state
  const [editingSop, setEditingSop] = useState(false);
  const [draftSopSteps, setDraftSopSteps] = useState<SopStep[]>([]);
  const [savingSop, setSavingSop] = useState(false);
  const [sopMsg, setSopMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [driveConnected, setDriveConnected] = useState(() => Boolean(getGoogleDriveAccessToken()));
  const [syncingSopDrive, setSyncingSopDrive] = useState(false);
  const [sopDriveLink, setSopDriveLink] = useState<{
    fileUrl: string;
    folderUrl: string;
    folderName: string;
  } | null>(null);

  useEffect(() => {
    const unsub = initGoogleWorkspaceAuth(
      () => setDriveConnected(true),
      () => setDriveConnected(Boolean(getGoogleDriveAccessToken()))
    );
    return unsub;
  }, []);

  // Quick Add CU state
  const [showAddCu, setShowAddCu] = useState(false);
  const [newCuCode, setNewCuCode] = useState('');
  const [newCuTitle, setNewCuTitle] = useState('');
  const [newCuDesc, setNewCuDesc] = useState('');
  const [addingCu, setAddingCu] = useState(false);

  // Multi-module E-Book Kertas Penerangan shelf state
  const ebookFileRef = useRef<HTMLInputElement | null>(null);
  const [activeEbookId, setActiveEbookId] = useState<string | null>(null);
  const [showAddEbook, setShowAddEbook] = useState(false);
  const [ebookCodeInput, setEbookCodeInput] = useState('');
  const [ebookTitleInput, setEbookTitleInput] = useState('');
  const [ebookSelectedFile, setEbookSelectedFile] = useState<File | null>(null);
  const [uploadingEbook, setUploadingEbook] = useState(false);
  const [confirmDeleteEbookId, setConfirmDeleteEbookId] = useState<string | null>(null);
  const [ebookMsg, setEbookMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (activeTeoriSub) {
      setFormUrlInput(activeTeoriSub.googleFormUrl || '');
      setFormTitleInput(activeTeoriSub.googleFormTitle || '');
      setDriveUrlInput(activeTeoriSub.googleDriveUrl || '');
      setDriveTitleInput(activeTeoriSub.googleDriveTitle || '');
    }
    if (activeAmaliSub) {
      setDraftSopSteps(activeAmaliSub.sopSteps);
    }
    setEditingSop(false);
    setFormMsg(null);
    setDriveMsg(null);
    setSopMsg(null);
    setSopDriveLink(null);
  }, [activeCU?.id, selectedSub, activeTeoriSub, activeAmaliSub]);

  // CoCU Google Drive Repository State (KURSUS -> Kod NOSS -> Folder CU -> Pengkelasan Kod JPK)
  const driveSubfolderUploadRef = useRef<HTMLInputElement | null>(null);
  const [selectedDriveCategory, setSelectedDriveCategory] =
    useState<JpkDriveFileCategory>('kt');
  const [cocuDriveData, setCocuDriveData] = useState<CoCuDriveResolvedResult | null>(null);
  const [selectedCuFolderOverrideId, setSelectedCuFolderOverrideId] = useState<string | null>(
    null
  );
  const [cocuDrivePathLabel, setCocuDrivePathLabel] = useState<string>('');
  const [loadingCocuDrive, setLoadingCocuDrive] = useState(false);
  const [cocuDriveError, setCocuDriveError] = useState<string | null>(null);
  const [cocuDriveInfo, setCocuDriveInfo] = useState<string | null>(null);
  const [uploadingDriveSubfolderFile, setUploadingDriveSubfolderFile] = useState(false);
  const [openingDrivePdfId, setOpeningDrivePdfId] = useState<string | null>(null);
  const [confirmTrashDriveFileId, setConfirmTrashDriveFileId] = useState<string | null>(null);
  const [activeDrivePdfSession, setActiveDrivePdfSession] =
    useState<ExternalDrivePdfSession | null>(null);

  // Inline PDF preview for KP files from Google Drive
  const [previewDriveKpFile, setPreviewDriveKpFile] = useState<CategorizedDriveFile | null>(null);
  const [previewDriveKpBlobUrl, setPreviewDriveKpBlobUrl] = useState<string | null>(null);
  const [loadingDriveKpPreview, setLoadingDriveKpPreview] = useState(false);

  const visibleDriveCategories = useMemo(
    () => JPK_DRIVE_CATEGORIES.filter((cat) => canEdit || !cat.staffOnly),
    [canEdit]
  );

  useEffect(() => {
    if (!canEdit && selectedDriveCategory === 'pmt_pma') {
      setSelectedDriveCategory('kt');
    }
  }, [canEdit, selectedDriveCategory]);

  useEffect(() => {
    return () => {
      if (previewDriveKpBlobUrl) {
        URL.revokeObjectURL(previewDriveKpBlobUrl);
      }
    };
  }, [previewDriveKpBlobUrl]);

  useEffect(() => {
    setActiveEbookId(null);
    setConfirmDeleteEbookId(null);
    setEbookMsg(null);
    setShowAddEbook(false);
    setConfirmTrashDriveFileId(null);
    setSelectedCuFolderOverrideId(null);
    setCocuDriveError(null);
    setCocuDriveInfo(null);
    setPreviewDriveKpFile(null);
    setPreviewDriveKpBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setActiveDrivePdfSession((prev) => (prev && prev.cuId === activeCU?.id ? prev : null));
  }, [activeCU?.id]);

  async function loadCocuDriveSubfolders(options?: {
    createIfMissing?: boolean;
    promptSignIn?: boolean;
    cuFolderIdOverride?: string | null;
  }) {
    if (!activeLevel || !activeCU) return;
    setCocuDriveError(null);
    if (options?.createIfMissing) setCocuDriveInfo(null);
    setLoadingCocuDrive(true);
    try {
      let accessToken = getGoogleDriveAccessToken();
      if (!accessToken) {
        if (!options?.promptSignIn) {
          setCocuDriveData(null);
          return;
        }
        const signed = await signInWithGoogleDrive();
        accessToken = signed.accessToken;
        setDriveConnected(true);
      }

      const overrideId =
        options?.cuFolderIdOverride !== undefined
          ? options.cuFolderIdOverride
          : selectedCuFolderOverrideId;

      const resolved = await resolveCoCuDriveContents(
        accessToken,
        branding.driveRecordsFolderId,
        activeLevel,
        activeCU,
        {
          createIfMissing: Boolean(options?.createIfMissing),
          includeStaffOnly: canEdit,
          cuFolderIdOverride: overrideId || undefined,
        }
      );

      setCocuDrivePathLabel(resolved.pathLabel);
      setCocuDriveData(resolved);

      if (options?.createIfMissing && resolved.cuFolder) {
        setCocuDriveInfo(
          `Folder CU "${resolved.pathLabel}" disahkan di Google Drive (${resolved.allFiles.length} fail diimbas).`
        );
      }
    } catch (err) {
      setCocuDriveError(
        err instanceof Error
          ? err.message
          : 'Gagal memuatkan senarai fail daripada folder CU Google Drive.'
      );
    } finally {
      setLoadingCocuDrive(false);
    }
  }

  useEffect(() => {
    if (!activeLevel || !activeCU || !driveConnected) {
      setCocuDriveData(null);
      return;
    }
    void loadCocuDriveSubfolders({ createIfMissing: false, promptSignIn: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeLevel?.id,
    activeCU?.id,
    driveConnected,
    branding.driveRecordsFolderId,
    selectedCuFolderOverrideId,
    canEdit,
  ]);

  const driveAssessmentFiles = useMemo(() => {
    if (!cocuDriveData) return [];
    return [...cocuDriveData.byCategory.kt, ...cocuDriveData.byCategory.penilaian_teori].filter(
      (f) => f.mimeType === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
  }, [cocuDriveData]);

  async function handleUploadFileToCocuSubfolder(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeLevel || !activeCU) return;
    setUploadingDriveSubfolderFile(true);
    setCocuDriveError(null);
    setCocuDriveInfo(null);
    try {
      let accessToken = getGoogleDriveAccessToken();
      if (!accessToken) {
        const signed = await signInWithGoogleDrive();
        accessToken = signed.accessToken;
        setDriveConnected(true);
      }
      let targetFolderId = cocuDriveData?.cuFolder?.id || '';
      if (!targetFolderId) {
        const resolved = await resolveCoCuDriveContents(
          accessToken,
          branding.driveRecordsFolderId,
          activeLevel,
          activeCU,
          { createIfMissing: true, includeStaffOnly: canEdit }
        );
        targetFolderId = resolved.cuFolder?.id || '';
      }
      if (!targetFolderId) {
        throw new Error(
          `Folder CU "${activeCU.code}" gagal disediakan di bawah KURSUS / ${buildDriveNossFolderName(activeLevel)}.`
        );
      }
      const mimeType = file.type || 'application/pdf';
      const uploaded = await uploadFileToDriveFolder(
        accessToken,
        targetFolderId,
        file.name,
        mimeType,
        file
      );
      setCocuDriveInfo(
        `Fail "${uploaded.name}" berjaya dimuat naik terus ke folder CU (${cocuDrivePathLabel || activeCU.code}).`
      );
      await loadCocuDriveSubfolders({ createIfMissing: false, promptSignIn: false });
    } catch (err) {
      setCocuDriveError(
        err instanceof Error ? err.message : 'Gagal memuat naik fail ke folder CU Google Drive.'
      );
    } finally {
      setUploadingDriveSubfolderFile(false);
    }
  }

  async function handleDownloadCocuDriveFile(file: DriveFileResult) {
    setCocuDriveError(null);
    try {
      let accessToken = getGoogleDriveAccessToken();
      if (!accessToken) {
        const signed = await signInWithGoogleDrive();
        accessToken = signed.accessToken;
        setDriveConnected(true);
      }
      const bytes = await downloadDriveFileBytes(accessToken, file.id);
      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: file.mimeType || 'application/octet-stream',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      setCocuDriveError(
        err instanceof Error ? err.message : 'Gagal memuat turun fail dari Google Drive.'
      );
    }
  }

  async function handlePreviewDriveKpPdf(file: CategorizedDriveFile) {
    if (previewDriveKpFile?.id === file.id) {
      setPreviewDriveKpFile(null);
      setPreviewDriveKpBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    setCocuDriveError(null);
    setLoadingDriveKpPreview(true);
    try {
      let accessToken = getGoogleDriveAccessToken();
      if (!accessToken) {
        const signed = await signInWithGoogleDrive();
        accessToken = signed.accessToken;
        setDriveConnected(true);
      }
      const bytes = await downloadDriveFileBytes(accessToken, file.id);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      setPreviewDriveKpBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return blobUrl;
      });
      setPreviewDriveKpFile(file);
    } catch (err) {
      setCocuDriveError(
        err instanceof Error ? err.message : 'Gagal memaparkan fail PDF nota daripada Google Drive.'
      );
    } finally {
      setLoadingDriveKpPreview(false);
    }
  }

  async function handleTrashCocuDriveFile(fileId: string) {
    setCocuDriveError(null);
    try {
      const accessToken = getGoogleDriveAccessToken();
      if (!accessToken) return;
      await trashDriveFile(accessToken, fileId);
      setConfirmTrashDriveFileId(null);
      setCocuDriveInfo('Fail telah dialihkan ke Trash Google Drive.');
      await loadCocuDriveSubfolders({ createIfMissing: false, promptSignIn: false });
    } catch (err) {
      setCocuDriveError(
        err instanceof Error ? err.message : 'Gagal memadam fail daripada Google Drive.'
      );
    }
  }

  async function handleLaunchDrivePdfOverlay(
    file: CategorizedDriveFile,
    categoryLabelOverride?: string
  ) {
    if (!activeCU) return;
    setCocuDriveError(null);
    setOpeningDrivePdfId(file.id);
    try {
      let accessToken = getGoogleDriveAccessToken();
      if (!accessToken) {
        const signed = await signInWithGoogleDrive();
        accessToken = signed.accessToken;
        setDriveConnected(true);
      }
      const bytes = await downloadDriveFileBytes(accessToken, file.id);
      const pdfBase64 = uint8ArrayToBase64(bytes);
      const res = await api.parseDrivePdfPaper(token, {
        cuId: activeCU.id,
        driveFileId: file.id,
        fileName: file.name,
        pdfBase64,
      });
      const catMeta = JPK_DRIVE_CATEGORIES.find((c) => c.key === file.category);
      setActiveDrivePdfSession({
        driveFileId: file.id,
        fileName: file.name,
        subfolderName: categoryLabelOverride || catMeta?.label || 'Penilaian Teori',
        category: file.category,
        cuId: activeCU.id,
        paper: res.paper,
        pdfBytes: bytes,
      });
      onSelectSection('tugasan');
    } catch (err) {
      setCocuDriveError(
        err instanceof Error
          ? err.message
          : 'Gagal membuka fail PDF asal daripada Google Drive untuk penandaan AI.'
      );
    } finally {
      setOpeningDrivePdfId(null);
    }
  }

  const userSopChecked = useMemo(() => {
    if (!activeCU) return [];
    const found = sopProgress.find(
      (p) => p.userId === user.id && p.cuId === activeCU.id && p.subKey === selectedSub
    );
    return found ? found.checkedStepIds : [];
  }, [sopProgress, user.id, activeCU, selectedSub]);

  async function saveSopRecordToDrive(checkedIdsOverride?: string[]) {
    if (!activeLevel || !activeCU || !activeAmaliSub) return;
    setSyncingSopDrive(true);
    setSopMsg(null);
    try {
      let accessToken = getGoogleDriveAccessToken();
      if (!accessToken) {
        const signed = await signInWithGoogleDrive();
        accessToken = signed.accessToken;
        setDriveConnected(true);
      }

      const supervisorName =
        user.supervisorName || (user.role === 'pengajar' ? user.name : 'PENTADBIR UTAMA');
      const folder = await resolveHierarchicalTraineeDriveFolder(
        accessToken,
        branding.driveRecordsFolderId,
        supervisorName,
        user.icNumber,
        user.userId,
        user.name
      );
      const subTitleText =
        selectedSub === 'sub2' ? activeLevel.amaliSub2Title : activeLevel.amaliSub1Title;
      const blob = buildSopCompletionReportBlob({
        collegeName: branding.collegeName,
        collegeAddress: branding.collegeAddress,
        traineeName: user.name,
        traineeIc: user.icNumber || '-',
        traineeCodeId: user.userId,
        level: activeLevel,
        cu: activeCU,
        subTitle: subTitleText,
        steps: activeAmaliSub.sopSteps,
        checkedStepIds: checkedIdsOverride || userSopChecked,
      });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `SOP-${activeCU.code}-${selectedSub.toUpperCase()}-${buildTraineeFolderName(
        user.icNumber,
        user.userId
      )}-${stamp}.html`;
      const uploaded = await uploadFileToDriveFolder(
        accessToken,
        folder.id,
        fileName,
        'text/html',
        blob
      );
      await api.logAccess(token, activeCU.id, 'sync_drive', selectedSub).catch(() => {});
      await onRefreshWorkspace();
      setSopDriveLink({
        fileUrl: uploaded.webViewLink,
        folderUrl: folder.webViewLink,
        folderName: folder.pathLabel,
      });
      setSopMsg({
        type: 'ok',
        text: `Rekod SOP Amali berjaya disimpan ke Google Drive (${folder.pathLabel}).`,
      });
    } catch (err) {
      setSopMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menyimpan rekod SOP ke Google Drive.',
      });
    } finally {
      setSyncingSopDrive(false);
    }
  }

  async function handleToggleSopStep(stepId: string) {
    if (!activeCU || !activeAmaliSub) return;
    const exists = userSopChecked.includes(stepId);
    const nextIds = exists
      ? userSopChecked.filter((id) => id !== stepId)
      : [...userSopChecked, stepId];
    try {
      await api.saveSopCheck(token, activeCU.id, selectedSub, nextIds);
      const allCompleted =
        nextIds.length === activeAmaliSub.sopSteps.length && activeAmaliSub.sopSteps.length > 0;
      if (allCompleted) {
        await api.logAccess(token, activeCU.id, 'complete_sop', selectedSub);
        if (getGoogleDriveAccessToken()) {
          void saveSopRecordToDrive(nextIds);
        }
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

  async function handleSaveGoogleDrive(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCU) return;
    setSavingDrive(true);
    setDriveMsg(null);
    try {
      await api.updateGoogleDriveFolder(
        token,
        activeCU.id,
        selectedSub,
        driveUrlInput,
        driveTitleInput
      );
      await onRefreshWorkspace();
      setDriveMsg({
        type: 'ok',
        text: `Pautan Folder Google Drive (${selectedSub === 'sub1' ? 'Sub 1' : 'Sub 2'}) berjaya dikemas kini.`,
      });
    } catch (err) {
      setDriveMsg({
        type: 'err',
        text:
          err instanceof ApiError
            ? err.message
            : 'Gagal menyimpan pautan Folder Google Drive.',
      });
    } finally {
      setSavingDrive(false);
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

  async function handleUploadEbook(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCU || !ebookSelectedFile) {
      setEbookMsg({ type: 'err', text: 'Sila pilih fail PDF atau Word untuk dimuat naik.' });
      return;
    }
    setUploadingEbook(true);
    setEbookMsg(null);
    try {
      await api.uploadCuEbook(
        token,
        activeCU.id,
        ebookCodeInput.trim(),
        ebookTitleInput.trim(),
        ebookSelectedFile
      );
      setEbookCodeInput('');
      setEbookTitleInput('');
      setEbookSelectedFile(null);
      if (ebookFileRef.current) ebookFileRef.current.value = '';
      setShowAddEbook(false);
      await onRefreshWorkspace();
      setEbookMsg({ type: 'ok', text: 'Modul E-Book nota berjaya dimuat naik.' });
    } catch (err) {
      setEbookMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal memuat naik modul E-Book.',
      });
    } finally {
      setUploadingEbook(false);
    }
  }

  async function handleDeleteEbook(moduleId: string) {
    if (!activeCU) return;
    setEbookMsg(null);
    try {
      await api.deleteCuEbook(token, activeCU.id, moduleId);
      if (activeEbookId === moduleId) setActiveEbookId(null);
      setConfirmDeleteEbookId(null);
      await onRefreshWorkspace();
    } catch (err) {
      setEbookMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal memadam modul E-Book.',
      });
    }
  }

  async function handleDownloadEbook(mod: EbookNoteModule) {
    if (!activeCU) return;
    setEbookMsg(null);
    try {
      const blob = await api.fetchProtectedFileBlob(token, mod.file.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = mod.file.originalName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      api.logAccess(token, activeCU.id, 'view_nota', selectedSub).catch(() => {});
    } catch (err) {
      setEbookMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Gagal memuat turun fail E-Book.',
      });
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
      <section aria-labelledby="stage-level-heading" className="print:hidden bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6">
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

        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
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

        {activeLevel.id === 'lvl-2' && (
          <div className="mt-5 pt-5 border-t border-[#1a2f5c] space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
              <div>
                <p className="text-xs font-mono font-semibold text-[#f0cb63]">
                  NOSS F432-005-2:2019 · Struktur 800 Jam (720j Kompetensi + 80j Core Abilities)
                </p>
                <p className="mt-0.5 text-xs text-slate-300">
                  Peralihan daripada kurikulum terdahulu EE-320-2:2012 kepada pematuhan{' '}
                  <span className="text-slate-100 font-medium">MS IEC 60364</span> &amp;{' '}
                  <span className="text-slate-100 font-medium">Peraturan-Peraturan Elektrik 1994</span>.
                </p>
              </div>
              <span className="text-[11px] font-mono text-slate-400 shrink-0">
                Klik mana-mana CU di bawah untuk terus buka modul
              </span>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  cuId: 'cu-201',
                  code: 'C01',
                  weight: '15%',
                  name: 'Single Phase Drawing',
                  focus: 'Lukisan titik/susun atur, skematik & anggaran beban/bahan sebelum menarik kabel.',
                },
                {
                  cuId: 'cu-202',
                  code: 'C02',
                  weight: '55%',
                  name: 'Single Phase Wiring',
                  focus: 'Teras Tahap 2: containment/konduit/trunking, kabel, DB, MCB/RCCB/RCD & pembumian.',
                },
                {
                  cuId: 'cu-203',
                  code: 'C03',
                  weight: '15%',
                  name: 'Single Phase System Maintenance',
                  focus: 'Pemeriksaan visual, ujian mati/hidup, diagnostik kerosakan & pembaikan litar.',
                },
                {
                  cuId: 'cu-204',
                  code: 'C04',
                  weight: '15%',
                  name: 'Single Phase Motor & Control',
                  focus: 'Jenis/sambungan motor satu fasa, pemula DOL, litar perlindungan & semakan operasi.',
                },
              ].map((item) => {
                const exists = levelCUs.some((c) => c.id === item.cuId);
                const selected = activeCU?.id === item.cuId;
                return (
                  <button
                    key={item.code}
                    type="button"
                    disabled={!exists}
                    onClick={() => exists && onSelectCu(item.cuId)}
                    className={`text-left p-3.5 rounded-lg border transition-colors ${
                      selected
                        ? 'bg-[#17356e]/70 border-[#e5b94c]'
                        : 'bg-[#071024] border-[#1a2f5c] hover:border-[#2a4a8a]'
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-mono">
                      <span className="font-bold text-[#f0cb63]">{item.code}</span>
                      <span className="font-semibold text-emerald-400 tabular-nums">
                        {item.weight}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-white">{item.name}</p>
                    <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                      {item.focus}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="grid md:grid-cols-3 gap-3 text-xs text-slate-300 bg-[#071024] border border-[#1a2f5c] rounded-lg p-3.5">
              <div>
                <p className="font-semibold text-white">Turutan C01 + C02</p>
                <p className="mt-0.5 text-[11px] text-slate-400 leading-relaxed">
                  Kaitkan lukisan &amp; logik beban C01 terus ke bay amali C02 bagi mengelakkan ralat kadaran MCB/RCCB, label DB, dan pembumian MS IEC 60364.
                </p>
              </div>
              <div>
                <p className="font-semibold text-white">Pemberat 55% pada C02</p>
                <p className="mt-0.5 text-[11px] text-slate-400 leading-relaxed">
                  Kekemasan kerja, tork pengetatan terminal, integriti penebatan, pembumian tepat, dan pengasingan LOTO selamat menentukan kesediaan pelatih.
                </p>
              </div>
              <div>
                <p className="font-semibold text-white">Integrasi C03 &amp; C04</p>
                <p className="mt-0.5 text-[11px] text-slate-400 leading-relaxed">
                  Gabungkan rutin pengujian C03 bersama bay pendawaian C02 dan panel pemula motor C04 agar pengujian menjadi sebahagian daripada kerja sebenar.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeLevel.id === 'lvl-3' && (
          <div className="mt-5 pt-5 border-t border-[#1a2f5c] space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
              <div>
                <p className="text-xs font-mono font-semibold text-[#f0cb63]">
                  NOSS F432-005-3:2019 · 7 Unit Kompetensi Teras (Elektrik Tiga Fasa, BAS &amp; Penyeliaan)
                </p>
                <p className="mt-0.5 text-xs text-slate-300">
                  Peningkatan daripada sistem satu fasa ke pemasangan komersial/industri tiga fasa, pengujian &amp; pentauliahan rasmi (<span className="font-mono text-slate-100">Z<sub>s</sub></span>), automasi bangunan, serta penyeliaan tapak.
                </p>
              </div>
              <span className="text-[11px] font-mono text-slate-400 shrink-0">
                Klik mana-mana CU di bawah untuk terus buka modul
              </span>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  cuId: 'cu-301',
                  code: 'C01',
                  tag: 'Lukisan 3-Fasa',
                  name: 'Three Phase Drawing',
                  focus: 'Pelan susun atur 3-fasa, skematik three-line, pengimbangan fasa, MD & saiz kabel/perlindungan.',
                },
                {
                  cuId: 'cu-302',
                  code: 'C02',
                  tag: 'Pendawaian 3-Fasa',
                  name: 'Three Phase Wiring',
                  focus: 'Trunking/cable tray, DB 3-fasa, SSB, busbar, switchgear & pembumian MS IEC 60364.',
                },
                {
                  cuId: 'cu-303',
                  code: 'C03',
                  tag: 'Penyelenggaraan',
                  name: 'Three Phase System Maintenance',
                  focus: 'Rutin pencegahan & pembetulan, diagnostik kerosakan 3-fasa & pembaikan komponen.',
                },
                {
                  cuId: 'cu-304',
                  code: 'C04',
                  tag: 'Motor & Kawalan',
                  name: 'Three Phase Motor & Control',
                  focus: 'Penamatan Star/Delta, litar kawalan & pemula DOL, Star-Delta, Forward-Reverse + interlock.',
                },
                {
                  cuId: 'cu-305',
                  code: 'C05',
                  tag: 'Pentauliahan (T&C)',
                  name: '3-Phase Testing & Commissioning',
                  focus: 'Ujian kesinambungan, penebatan, kekutuban, elektrod bumi, galangan Zs & rekod ujian rasmi.',
                },
                {
                  cuId: 'cu-306',
                  code: 'C06',
                  tag: 'Automasi (BAS)',
                  name: 'Building Automation System',
                  focus: 'Pencahayaan pintar & kawalan bangunan: pendawaian bus, penderia, penggerak & pentauliahan.',
                },
                {
                  cuId: 'cu-307',
                  code: 'C07',
                  tag: 'Penyeliaan',
                  name: 'Installation & Maintenance Supervisory',
                  focus: 'Jadual kerja, anggaran bahan/BOQ, toolbox briefing, OSHA & memimpin juruteknik Tahap 2.',
                },
              ].map((item) => {
                const exists = levelCUs.some((c) => c.id === item.cuId);
                const selected = activeCU?.id === item.cuId;
                return (
                  <button
                    key={item.code}
                    type="button"
                    disabled={!exists}
                    onClick={() => exists && onSelectCu(item.cuId)}
                    className={`text-left p-3.5 rounded-lg border transition-colors ${
                      selected
                        ? 'bg-[#17356e]/70 border-[#e5b94c]'
                        : 'bg-[#071024] border-[#1a2f5c] hover:border-[#2a4a8a]'
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-mono">
                      <span className="font-bold text-[#f0cb63]">{item.code}</span>
                      <span className="text-[11px] font-medium text-emerald-400">
                        {item.tag}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-white">{item.name}</p>
                    <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                      {item.focus}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeLevel.id === 'lvl-4' && (
          <div className="mt-5 pt-5 border-t border-[#1a2f5c] space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
              <div>
                <p className="text-xs font-mono font-semibold text-[#f0cb63]">
                  NOSS F432-005-4:2019 (DKM Tahap 4 · JPK) · Pengagihan Voltan Rendah Industri (&ge;100A hingga 1kV)
                </p>
                <p className="mt-0.5 text-xs text-slate-300">
                  9 Unit Kompetensi Teras (C01–C09) + 1 Unit Elektif (boleh ditambah oleh Admin/Pengajar menerusi <span className="font-mono text-slate-100">Tambah CU</span>).
                </p>
              </div>
              <span className="text-[11px] font-mono text-slate-400 shrink-0">
                Klik mana-mana CU di bawah untuk terus buka modul
              </span>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                {
                  cuId: 'cu-401',
                  code: 'C01',
                  tag: 'MSB >100A–1kV',
                  name: 'LV Main Switch Board (MSB)',
                  focus: 'Pemasangan dan penyelenggaraan papan suis utama berkadaran >100A hingga <1kV.',
                },
                {
                  cuId: 'cu-402',
                  code: 'C02',
                  tag: 'Transformer',
                  name: 'Distribution Transformer Maintenance',
                  focus: 'Pemeriksaan dan senggaraan pencegahan pada transformer pengagihan.',
                },
                {
                  cuId: 'cu-403',
                  code: 'C03',
                  tag: 'Bawah Tanah',
                  name: 'LV Underground Cable System',
                  focus: 'Kerja merentang, jointing, penamatan dan pengujian kabel bawah tanah LV.',
                },
                {
                  cuId: 'cu-404',
                  code: 'C04',
                  tag: 'Talian Atas',
                  name: 'LV Overhead System',
                  focus: 'Pemasangan dan penyelenggaraan talian pengagihan atas voltan rendah.',
                },
                {
                  cuId: 'cu-405',
                  code: 'C05',
                  tag: 'ACMV',
                  name: 'ACMV System Troubleshoot',
                  focus: 'Diagnostik kerosakan elektrik pada sistem ACMV komersial & industri.',
                },
                {
                  cuId: 'cu-406',
                  code: 'C06',
                  tag: 'Soft Starter',
                  name: 'Soft Starter Installation & Maint.',
                  focus: 'Pemasangan, konfigurasi parameter dan penyelenggaraan pemula lembut motor.',
                },
                {
                  cuId: 'cu-407',
                  code: 'C07',
                  tag: 'Penyeliaan Projek',
                  name: 'Electrical Project Supervision',
                  focus: 'Pengurusan pelaksanaan tapak, pematuhan keselamatan dan pasukan teknikal.',
                },
                {
                  cuId: 'cu-408',
                  code: 'C08',
                  tag: 'PLC Industri',
                  name: 'PLC Installation',
                  focus: 'Pendawaian dan pemasangan sistem Programmable Logic Controller (PLC).',
                },
                {
                  cuId: 'cu-409',
                  code: 'C09',
                  tag: 'Pembumian & Kilat',
                  name: 'LV Earthing System & Testing',
                  focus: 'Rekabentuk, pemasangan dan ujian grid pembumian industri & perlindungan kilat.',
                },
              ].map((item) => {
                const exists = levelCUs.some((c) => c.id === item.cuId);
                const selected = activeCU?.id === item.cuId;
                return (
                  <button
                    key={item.code}
                    type="button"
                    disabled={!exists}
                    onClick={() => exists && onSelectCu(item.cuId)}
                    className={`text-left p-3.5 rounded-lg border transition-colors ${
                      selected
                        ? 'bg-[#17356e]/70 border-[#e5b94c]'
                        : 'bg-[#071024] border-[#1a2f5c] hover:border-[#2a4a8a]'
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-mono">
                      <span className="font-bold text-[#f0cb63]">{item.code}</span>
                      <span className="text-[11px] font-medium text-emerald-400">
                        {item.tag}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-white">{item.name}</p>
                    <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                      {item.focus}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeLevel.id === 'lvl-5' && (
          <div className="mt-5 pt-5 border-t border-[#1a2f5c] space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
              <div>
                <p className="text-xs font-mono font-semibold text-[#f0cb63]">
                  NOSS F432-005-5:2019 (DLKM Tahap 5 · JPK) · Pengagihan &amp; Penjanaan Kuasa Voltan Rendah
                </p>
                <p className="mt-0.5 text-xs text-slate-300">
                  Peringkat pensijilan tertinggi voltan rendah: 7 Unit Kompetensi Teras (C01–C07) + 1 Unit Elektif (boleh ditambah menerusi <span className="font-mono text-slate-100">Tambah CU</span>).
                </p>
              </div>
              <span className="text-[11px] font-mono text-slate-400 shrink-0">
                Klik mana-mana CU di bawah untuk terus buka modul
              </span>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  cuId: 'cu-501',
                  code: 'C01',
                  tag: 'Perlindungan LV',
                  name: 'LV Protection Devices',
                  focus: 'Pemasangan, pengujian dan senggaraan geganti perlindungan serta sistem perlindungan litar LV.',
                },
                {
                  cuId: 'cu-502',
                  code: 'C02',
                  tag: 'Penjana Diesel',
                  name: 'LV Diesel Generator O&M',
                  focus: 'Operasi dan penyelenggaraan set penjana diesel tunggu sedia (standby) & utama (prime).',
                },
                {
                  cuId: 'cu-503',
                  code: 'C03',
                  tag: 'Penyegerakan',
                  name: 'LV Generator Synchronising',
                  focus: 'Pengurusan penyegerakan selari penjana LV secara manual dan automatik.',
                },
                {
                  cuId: 'cu-504',
                  code: 'C04',
                  tag: 'Solar PV',
                  name: 'Photovoltaic Solar System O&M',
                  focus: 'Operasi dan penyelenggaraan sistem penjanaan Solar PV sambungan grid & standalone.',
                },
                {
                  cuId: 'cu-505',
                  code: 'C05',
                  tag: 'UPS & Bateri',
                  name: 'UPS & Battery Charger Maint.',
                  focus: 'Servis unit UPS industri, bank bateri dan sistem pengecas beban kritikal.',
                },
                {
                  cuId: 'cu-506',
                  code: 'C06',
                  tag: 'Pengurusan Operasi',
                  name: 'Electrical Operation Management',
                  focus: 'Mengurus operasi elektrik fasiliti, pematuhan, jadual senggaraan dan bajet.',
                },
                {
                  cuId: 'cu-507',
                  code: 'C07',
                  tag: 'Pengurusan Tenaga',
                  name: 'Energy Management Operation',
                  focus: 'Menjalankan audit tenaga, pemantauan kecekapan & pengurusan tenaga fasiliti.',
                },
              ].map((item) => {
                const exists = levelCUs.some((c) => c.id === item.cuId);
                const selected = activeCU?.id === item.cuId;
                return (
                  <button
                    key={item.code}
                    type="button"
                    disabled={!exists}
                    onClick={() => exists && onSelectCu(item.cuId)}
                    className={`text-left p-3.5 rounded-lg border transition-colors ${
                      selected
                        ? 'bg-[#17356e]/70 border-[#e5b94c]'
                        : 'bg-[#071024] border-[#1a2f5c] hover:border-[#2a4a8a]'
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-mono">
                      <span className="font-bold text-[#f0cb63]">{item.code}</span>
                      <span className="text-[11px] font-medium text-emerald-400">
                        {item.tag}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-white">{item.name}</p>
                    <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                      {item.focus}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Stage 2: Pilih Bahagian (Teori, Amali & SOP, Latihan, Tugasan AI) */}
      <section aria-labelledby="stage-section-heading" className="print:hidden bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[#f0cb63]">
              Langkah 2 · Pilih Bahagian ({activeLevel.code})
            </p>
            <h2 id="stage-section-heading" className="mt-1 text-lg font-bold text-white">
              Fokus Pembelajaran Semasa
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-[#071024] border border-[#1a2f5c] rounded-lg">
            {(
              [
                { id: 'teori', label: 'Teori (2 Sub)', icon: BookOpen },
                { id: 'amali_sop', label: 'Amali & SOP (2 Sub)', icon: Wrench },
                { id: 'latihan', label: 'Latihan (2 Sub)', icon: ClipboardCheck },
                { id: 'tugasan', label: 'Tugasan (AI)', icon: FileCheck2 },
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
      <section aria-labelledby="stage-cu-heading" className="grid lg:grid-cols-12 gap-6 items-start print:block">
        {/* CU Selector Rail */}
        <div className="lg:col-span-4 print:hidden bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-5">
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
                const ebookCount = cu.ebookModules?.length || 0;
                const teoriDocsCount =
                  (cu.teoriSub1.notaSlot ? 1 : 0) +
                  (cu.teoriSub1.panduanSoalanSlot ? 1 : 0) +
                  (cu.teoriSub2.notaSlot ? 1 : 0) +
                  (cu.teoriSub2.panduanSoalanSlot ? 1 : 0);
                const formCount =
                  (cu.teoriSub1.googleFormUrl ? 1 : 0) + (cu.teoriSub2.googleFormUrl ? 1 : 0);
                const sopStepsTotal =
                  cu.amaliSub1.sopSteps.length + cu.amaliSub2.sopSteps.length;
                const cuPapers = tugasanPapers.filter((p) => p.cuId === cu.id);
                const passedPaperIds = new Set(
                  tugasanSubmissions
                    .filter((s) => s.cuId === cu.id && s.userId === user.id && s.passed)
                    .map((s) => s.templateId)
                );
                const passedCount = cuPapers.filter((p) => passedPaperIds.has(p.id)).length;
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
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-[#f0cb63]">{cu.code}</span>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="text-slate-400 font-mono tabular-nums">
                          Teori {teoriDocsCount}/4{ebookCount > 0 ? ` · ${ebookCount} E-Book` : ''}
                        </span>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className={formCount > 0 ? 'text-emerald-400 font-mono tabular-nums' : 'text-slate-500 font-mono tabular-nums'}>
                          Borang {formCount}/2
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-white">{cu.title}</p>
                      <p className="mt-0.5 text-xs text-slate-400 font-mono tabular-nums">
                        Amali SOP: {sopStepsTotal} langkah · Tugasan: {passedCount}/{cuPapers.length} Lulus
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
        <div className="lg:col-span-8 print:col-span-12">
          {!activeCU || !activeTeoriSub || !activeAmaliSub ? (
            <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-10 text-center">
              <Folder className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="mt-3 text-base font-semibold text-white">
                Pilih CU / Tajuk Khusus Terlebih Dahulu
              </h3>
              <p className="mt-1.5 text-sm text-slate-300 max-w-md mx-auto">
                Kandungan <span className="font-mono text-xs text-[#f0cb63]">TEORI/ (Sub 1 &amp; Sub 2)</span>, latihan Google Form,
                panduan <span className="font-mono text-xs text-[#f0cb63]">AMALI/ (Sub 1 &amp; Sub 2)</span>, dan{' '}
                <span className="font-mono text-xs text-[#f0cb63]">KERTAS TUGASAN (AI)</span> akan dibuka selepas anda memilih salah satu CU di sebelah kiri.
              </p>
            </div>
          ) : (
            <div className="space-y-6 print:space-y-0">
              {/* CU Header + 2-Sub Switcher */}
              <div className="print:hidden bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-5">
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
                        : selectedSection === 'tugasan'
                        ? 'TUGASAN_AI/Kertas_Tugasan_JPK'
                        : `TEORI/${subFolderCode}/`}
                    </span>
                  </div>
                  <h3 className="mt-2 text-xl font-bold text-white">{activeCU.title}</h3>
                  {activeCU.description && (
                    <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">{activeCU.description}</p>
                  )}
                </div>

                {/* 2-Sub Selector */}
                {selectedSection !== 'tugasan' && (
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
                )}
              </div>

              {/* GOOGLE DRIVE KURIKULUM REPOSITORY (KURSUS -> Kod NOSS -> Folder CU) */}
              <div className="print:hidden bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-mono text-[#f0cb63] flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5" />
                      <span>
                        GOOGLE DRIVE KURIKULUM ·{' '}
                        {cocuDrivePathLabel ||
                          `KURSUS / ${buildDriveNossFolderName(activeLevel)} / ${activeCU.code}`}
                      </span>
                    </p>
                    <h4 className="mt-1 text-sm font-bold text-white">
                      Bahan Pembelajaran Folder CU (Pengkelasan Automatik Kod JPK)
                    </h4>
                    <p className="mt-0.5 text-xs text-slate-300">
                      Semua dokumen di dalam folder CU diimbas &amp; diasingkan mengikut kod{' '}
                      <span className="text-[#f0cb63]">KP</span>,{' '}
                      <span className="text-[#f0cb63]">KT</span>,{' '}
                      <span className="text-[#f0cb63]">KK</span> dan{' '}
                      <span className="text-[#f0cb63]">Penilaian Teori</span>
                      {canEdit ? (
                        <>
                          {' '}
                          serta <span className="text-[#f0cb63]">PMT / PMA</span> (Pengajar &amp; Admin sahaja)
                        </>
                      ) : null}
                      .
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {!driveConnected ? (
                      <GoogleSignInButton
                        onClick={() =>
                          void loadCocuDriveSubfolders({
                            createIfMissing: false,
                            promptSignIn: true,
                          })
                        }
                        disabled={loadingCocuDrive}
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={loadingCocuDrive}
                          onClick={() =>
                            void loadCocuDriveSubfolders({
                              createIfMissing: false,
                              promptSignIn: true,
                            })
                          }
                          className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] rounded-lg inline-flex items-center gap-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{loadingCocuDrive ? 'Memuatkan...' : 'Muat Semula Drive'}</span>
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            disabled={loadingCocuDrive}
                            onClick={() =>
                              void loadCocuDriveSubfolders({
                                createIfMissing: true,
                                promptSignIn: true,
                              })
                            }
                            className="px-3 py-1.5 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg inline-flex items-center gap-1.5"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                            <span>Sahkan Folder CU Drive</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {cocuDriveError && (
                  <p className="p-2.5 rounded-lg border border-red-800/70 bg-red-950/60 text-xs text-red-300">
                    {cocuDriveError}
                  </p>
                )}
                {cocuDriveInfo && (
                  <p className="p-2.5 rounded-lg border border-emerald-700/60 bg-emerald-950/60 text-xs text-emerald-300">
                    {cocuDriveInfo}
                  </p>
                )}

                {driveConnected && (
                  <>
                    {cocuDriveData && cocuDriveData.availableCuFolders.length > 1 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="text-slate-400 font-mono mr-1">
                          Folder CU dalam {cocuDriveData.nossFolder?.name}:
                        </span>
                        {cocuDriveData.availableCuFolders.map((cf) => {
                          const isCurrent = cocuDriveData.cuFolder?.id === cf.id;
                          return (
                            <button
                              key={cf.id}
                              type="button"
                              onClick={() => setSelectedCuFolderOverrideId(cf.id)}
                              className={`px-2 py-1 rounded border font-mono transition-colors ${
                                isCurrent
                                  ? 'bg-[#17356e] border-[#e5b94c] text-[#f0cb63] font-semibold'
                                  : 'bg-[#071024] border-[#1a2f5c] text-slate-300 hover:border-[#2a4a8a]'
                              }`}
                            >
                              {cf.name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div
                      className={`grid grid-cols-2 ${
                        visibleDriveCategories.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
                      } gap-1.5 p-1 bg-[#071024] border border-[#1a2f5c] rounded-lg`}
                    >
                      {visibleDriveCategories.map((cat) => {
                        const active = selectedDriveCategory === cat.key;
                        const count = cocuDriveData?.byCategory[cat.key]?.length ?? 0;
                        return (
                          <button
                            key={cat.key}
                            type="button"
                            onClick={() => {
                              setSelectedDriveCategory(cat.key);
                              setConfirmTrashDriveFileId(null);
                            }}
                            className={`px-2.5 py-2 rounded-md text-xs text-left transition-colors flex items-center justify-between gap-1.5 ${
                              active
                                ? 'bg-[#17356e] text-[#f0cb63] font-semibold'
                                : 'text-slate-300 hover:text-white'
                            }`}
                          >
                            <span className="truncate">{cat.label}</span>
                            <span className="font-mono text-[11px] opacity-80 shrink-0">
                              ({count})
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {loadingCocuDrive ? (
                      <p className="py-4 text-center text-xs text-slate-400">
                        Mengimbas semua dokumen di dalam folder CU Google Drive...
                      </p>
                    ) : !cocuDriveData?.cuFolder ? (
                      <div className="p-4 rounded-lg bg-[#071024] border border-[#1a2f5c] text-xs text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <span>
                          Folder{' '}
                          <span className="font-mono text-[#f0cb63]">
                            {cocuDrivePathLabel ||
                              `KURSUS / ${buildDriveNossFolderName(activeLevel)} / ${activeCU.code}`}
                          </span>{' '}
                          belum dijumpai di Google Drive induk.
                        </span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() =>
                              void loadCocuDriveSubfolders({
                                createIfMissing: true,
                                promptSignIn: true,
                              })
                            }
                            className="px-3 py-1.5 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg shrink-0"
                          >
                            Cipta Folder KURSUS / NOSS / CU Sekarang
                          </button>
                        )}
                      </div>
                    ) : (
                      (() => {
                        const activeMeta =
                          visibleDriveCategories.find((c) => c.key === selectedDriveCategory) ||
                          visibleDriveCategories[0];
                        const activeFiles = cocuDriveData.byCategory[activeMeta.key] || [];
                        return (
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div>
                                <span className="text-slate-400 font-mono">
                                  Kategori Aktif:{' '}
                                  <strong className="text-white">{activeMeta.label}</strong>
                                </span>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  {activeMeta.description}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {cocuDriveData.cuFolder.webViewLink && (
                                  <a
                                    href={cocuDriveData.cuFolder.webViewLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[#f0cb63] hover:underline"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>Buka Folder CU di Drive</span>
                                  </a>
                                )}
                                {canEdit && (
                                  <>
                                    <input
                                      ref={driveSubfolderUploadRef}
                                      type="file"
                                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                      onChange={handleUploadFileToCocuSubfolder}
                                      className="sr-only"
                                    />
                                    <button
                                      type="button"
                                      disabled={uploadingDriveSubfolderFile}
                                      onClick={() => driveSubfolderUploadRef.current?.click()}
                                      className="px-3 py-1.5 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5"
                                    >
                                      <Upload className="w-3.5 h-3.5" />
                                      <span>
                                        {uploadingDriveSubfolderFile
                                          ? 'Memuat Naik...'
                                          : `Muat Naik ke ${cocuDriveData.cuFolder.name}`}
                                      </span>
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {activeFiles.length === 0 ? (
                              <p className="py-4 text-center text-xs text-slate-400 bg-[#071024] border border-[#1a2f5c] rounded-lg">
                                Tiada fail bagi kategori {activeMeta.label} dijumpai di dalam folder{' '}
                                {cocuDriveData.cuFolder.name}.
                              </p>
                            ) : (
                              <div className="divide-y divide-[#1a2f5c] bg-[#071024] border border-[#1a2f5c] rounded-lg">
                                {activeFiles.map((file) => {
                                  const isPdf =
                                    file.mimeType === 'application/pdf' ||
                                    file.name.toLowerCase().endsWith('.pdf');
                                  const isAssessmentCategory =
                                    file.category === 'kt' || file.category === 'penilaian_teori';
                                  const isKpPdf = isPdf && file.category === 'kp';
                                  const isOpening = openingDrivePdfId === file.id;
                                  return (
                                    <div
                                      key={file.id}
                                      className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                                    >
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="px-1.5 py-0.5 rounded bg-[#102045] border border-[#263f73] text-[#f0cb63] font-mono text-[10px] font-bold shrink-0">
                                            {activeMeta.codeBadge}
                                          </span>
                                          <p className="font-medium text-white truncate">
                                            {file.name}
                                          </p>
                                        </div>
                                        <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                                          {isPdf ? 'PDF' : 'Dokumen'}
                                          {file.subPath ? ` · Subfolder: ${file.subPath}` : ''}
                                          {file.modifiedTime
                                            ? ` · Dikemaskini ${new Date(file.modifiedTime).toLocaleDateString('ms-MY')}`
                                            : ''}
                                        </p>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                                        {isPdf && isAssessmentCategory && (
                                          <button
                                            type="button"
                                            disabled={Boolean(openingDrivePdfId)}
                                            onClick={() =>
                                              void handleLaunchDrivePdfOverlay(
                                                file,
                                                activeMeta.label
                                              )
                                            }
                                            className="px-3 py-1.5 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5"
                                          >
                                            <FileCheck2 className="w-3.5 h-3.5" />
                                            <span>
                                              {isOpening
                                                ? 'Menyediakan PDF...'
                                                : 'Jawab & Semak AI (PDF Asal)'}
                                            </span>
                                          </button>
                                        )}
                                        {isKpPdf && (
                                          <button
                                            type="button"
                                            disabled={loadingDriveKpPreview}
                                            onClick={() => {
                                              onSelectSection('teori');
                                              void handlePreviewDriveKpPdf(file);
                                            }}
                                            className="px-3 py-1.5 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5"
                                          >
                                            <BookOpen className="w-3.5 h-3.5" />
                                            <span>
                                              {loadingDriveKpPreview &&
                                              previewDriveKpFile?.id === file.id
                                                ? 'Membuka...'
                                                : 'Baca Nota (Teori)'}
                                            </span>
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => void handleDownloadCocuDriveFile(file)}
                                          className="px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] rounded-lg inline-flex items-center gap-1"
                                        >
                                          <Download className="w-3.5 h-3.5" />
                                          <span>Muat Turun</span>
                                        </button>
                                        <a
                                          href={file.webViewLink}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="px-2.5 py-1.5 text-xs font-medium text-sky-300 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] rounded-lg inline-flex items-center gap-1"
                                        >
                                          <ExternalLink className="w-3.5 h-3.5" />
                                          <span>Lihat</span>
                                        </a>
                                        {canEdit &&
                                          (confirmTrashDriveFileId === file.id ? (
                                            <div className="inline-flex items-center gap-1">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  void handleTrashCocuDriveFile(file.id)
                                                }
                                                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-600 rounded-lg"
                                              >
                                                Sahkan Padam
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setConfirmTrashDriveFileId(null)}
                                                className="px-2 py-1 text-xs text-slate-400 hover:text-white"
                                              >
                                                Batal
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => setConfirmTrashDriveFileId(file.id)}
                                              className="p-1.5 text-red-400 hover:bg-red-950/60 rounded-lg"
                                              aria-label={`Padam ${file.name}`}
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </>
                )}
              </div>

              {/* SECTION: TEORI (Sub 1 / Sub 2) */}
              {selectedSection === 'teori' && (
                <div className="space-y-5">
                  {/* Nota / Kertas Penerangan (KP) langsung daripada Google Drive CU */}
                  {driveConnected && cocuDriveData && (
                    <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                            <HardDrive className="w-3.5 h-3.5 text-[#f0cb63]" />
                            <span>
                              {cocuDriveData.pathLabel} · Kertas Penerangan (KP)
                            </span>
                          </p>
                          <h3 className="mt-1 text-base font-semibold text-white">
                            Nota / Kertas Penerangan (KP) Google Drive ({cocuDriveData.byCategory.kp.length} Fail)
                          </h3>
                          <p className="mt-0.5 text-xs text-slate-300">
                            Fail berawalan kod <span className="font-mono text-[#f0cb63]">KP...</span> diimbas terus daripada folder CU untuk rujukan teori pelatih.
                          </p>
                        </div>
                      </div>

                      {cocuDriveData.byCategory.kp.length === 0 ? (
                        <p className="text-xs text-slate-400 bg-[#071024] border border-[#1a2f5c] rounded-lg p-3">
                          Tiada fail Kertas Penerangan (KP...) ditemui di dalam folder {cocuDriveData.cuFolder?.name || activeCU.code}.
                        </p>
                      ) : (
                        <div className="divide-y divide-[#1a2f5c] bg-[#071024] border border-[#1a2f5c] rounded-lg">
                          {cocuDriveData.byCategory.kp.map((kpFile) => {
                            const isPdf =
                              kpFile.mimeType === 'application/pdf' ||
                              kpFile.name.toLowerCase().endsWith('.pdf');
                            const isPreviewOpen = previewDriveKpFile?.id === kpFile.id;
                            return (
                              <div key={kpFile.id} className="p-3.5 space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                                  <div className="min-w-0 flex items-center gap-2.5">
                                    <span className="px-2 py-1 rounded bg-[#102045] border border-[#263f73] text-[#f0cb63] font-mono font-bold shrink-0">
                                      KP
                                    </span>
                                    <div className="min-w-0">
                                      <p className="font-semibold text-white truncate">
                                        {kpFile.name}
                                      </p>
                                      {kpFile.subPath && (
                                        <p className="text-[11px] font-mono text-slate-400">
                                          Subfolder: {kpFile.subPath}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    {isPdf && (
                                      <button
                                        type="button"
                                        disabled={loadingDriveKpPreview}
                                        onClick={() => void handlePreviewDriveKpPdf(kpFile)}
                                        className={
                                          isPreviewOpen
                                            ? 'px-3 py-1.5 text-xs font-semibold text-white bg-[#17356e] border border-[#e5b94c] rounded-lg inline-flex items-center gap-1.5'
                                            : 'px-3 py-1.5 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg inline-flex items-center gap-1.5'
                                        }
                                      >
                                        {isPreviewOpen ? (
                                          <>
                                            <X className="w-3.5 h-3.5" />
                                            <span>Tutup PDF</span>
                                          </>
                                        ) : (
                                          <>
                                            <BookOpen className="w-3.5 h-3.5" />
                                            <span>
                                              {loadingDriveKpPreview ? 'Memuatkan...' : 'Baca PDF'}
                                            </span>
                                          </>
                                        )}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => void handleDownloadCocuDriveFile(kpFile)}
                                      className="px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] rounded-lg inline-flex items-center gap-1"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      <span>Muat Turun</span>
                                    </button>
                                    <a
                                      href={kpFile.webViewLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2.5 py-1.5 text-xs font-medium text-sky-300 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] rounded-lg inline-flex items-center gap-1"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      <span>Lihat di Drive</span>
                                    </a>
                                  </div>
                                </div>

                                {isPreviewOpen && previewDriveKpBlobUrl && (
                                  <div className="pt-2 border-t border-[#1a2f5c]">
                                    <iframe
                                      title={`Paparan PDF ${kpFile.name}`}
                                      src={previewDriveKpBlobUrl}
                                      className="w-full h-[640px] rounded-lg border border-[#263f73] bg-white"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Koleksi E-Book Kertas Penerangan (Multi-Modul) */}
                  {((activeCU.ebookModules && activeCU.ebookModules.length > 0) || canEdit) && (
                    <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-5">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5 text-[#f0cb63]" />
                            <span>
                              {activeLevel.code} / {activeCU.code} / TEORI / Koleksi_Kertas_Penerangan_Ebook
                            </span>
                          </p>
                          <h3 className="mt-1.5 text-base font-semibold text-white">
                            Koleksi E-Book Kertas Penerangan ({activeCU.ebookModules?.length || 0} Modul)
                          </h3>
                          <p className="mt-1 text-sm text-slate-300">
                            Nota pembelajaran rasmi mengikut siri Kertas Penerangan (KP). Klik{' '}
                            <span className="text-[#f0cb63] font-medium">Baca E-Book</span> untuk paparan bacaan buku interaktif atau muat turun PDF.
                          </p>
                        </div>

                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setShowAddEbook(!showAddEbook)}
                            className="px-3.5 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{showAddEbook ? 'Tutup Borang' : 'Tambah Modul E-Book'}</span>
                          </button>
                        )}
                      </div>

                      {ebookMsg && (
                        <p
                          className={`text-xs p-3 rounded-lg border ${
                            ebookMsg.type === 'ok'
                              ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                              : 'bg-red-950/60 border-red-800/70 text-red-300'
                          }`}
                        >
                          {ebookMsg.text}
                        </p>
                      )}

                      {showAddEbook && canEdit && (
                        <form
                          onSubmit={handleUploadEbook}
                          className="p-4 rounded-lg bg-[#071024] border border-[#1a2f5c] space-y-3"
                        >
                          <div className="flex items-center gap-2 text-xs font-semibold text-white">
                            <Upload className="w-4 h-4 text-[#f0cb63]" />
                            <span>Muat Naik Nota E-Book Baharu ({activeCU.code})</span>
                          </div>
                          <div className="grid sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs text-slate-300 mb-1">
                                Kod Kertas (cth: KP(1/5))
                              </label>
                              <input
                                type="text"
                                value={ebookCodeInput}
                                onChange={(e) => setEbookCodeInput(e.target.value)}
                                placeholder="KP(1/5)"
                                className="w-full px-3 py-2 text-xs font-mono border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs text-slate-300 mb-1">
                                Tajuk Kertas Penerangan
                              </label>
                              <input
                                type="text"
                                required
                                value={ebookTitleInput}
                                onChange={(e) => setEbookTitleInput(e.target.value)}
                                placeholder="cth: Keperluan Lukisan Elektrik Satu Fasa"
                                className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                            <input
                              ref={ebookFileRef}
                              type="file"
                              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                              onChange={(e) => setEbookSelectedFile(e.target.files?.[0] || null)}
                              className="text-xs text-slate-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#17356e] file:text-[#f0cb63] hover:file:bg-[#1e438a]"
                            />
                            <button
                              type="submit"
                              disabled={uploadingEbook}
                              className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] disabled:opacity-60 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>{uploadingEbook ? 'Memuat Naik...' : 'Muat Naik E-Book'}</span>
                            </button>
                          </div>
                        </form>
                      )}

                      {activeCU.ebookModules && activeCU.ebookModules.length > 0 ? (
                        <div className="divide-y divide-[#1a2f5c] border-t border-[#1a2f5c]">
                          {activeCU.ebookModules.map((mod) => {
                            const isOpen = activeEbookId === mod.id;
                            const sizeMb = (mod.file.sizeBytes / (1024 * 1024)).toFixed(2);
                            return (
                              <div key={mod.id} className="py-4 first:pt-4 last:pb-0">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                  <div className="flex items-start gap-3 min-w-0">
                                    <div className="px-2.5 py-2 rounded-lg bg-[#102045] border border-[#233d73] text-[#f0cb63] font-mono text-xs font-bold shrink-0">
                                      {mod.code}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-white">
                                        {mod.title}
                                      </p>
                                      <p className="mt-0.5 text-xs text-slate-400 font-mono truncate">
                                        {mod.file.originalName} · {sizeMb} MB ·{' '}
                                        {mod.file.extension.toUpperCase()}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextId = isOpen ? null : mod.id;
                                        setActiveEbookId(nextId);
                                        if (nextId) {
                                          api
                                            .logAccess(token, activeCU.id, 'view_nota', selectedSub)
                                            .catch(() => {});
                                        }
                                      }}
                                      className={
                                        isOpen
                                          ? 'px-3.5 py-2 text-xs font-semibold text-white bg-[#17356e] border border-[#e5b94c] rounded-lg flex items-center gap-1.5 whitespace-nowrap'
                                          : 'px-3.5 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg flex items-center gap-1.5 whitespace-nowrap'
                                      }
                                    >
                                      {isOpen ? (
                                        <>
                                          <X className="w-3.5 h-3.5" />
                                          <span>Tutup E-Book</span>
                                        </>
                                      ) : (
                                        <>
                                          <BookOpen className="w-3.5 h-3.5" />
                                          <span>Baca E-Book</span>
                                        </>
                                      )}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleDownloadEbook(mod)}
                                      className="px-3 py-2 text-xs font-medium text-slate-200 bg-[#102045] border border-[#263f73] hover:bg-[#172e61] rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      <span>Muat Turun</span>
                                    </button>

                                    {canEdit &&
                                      (confirmDeleteEbookId === mod.id ? (
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteEbook(mod.id)}
                                            className="px-2.5 py-2 text-xs font-medium text-white bg-red-700 hover:bg-red-600 rounded-lg whitespace-nowrap"
                                          >
                                            Sahkan
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setConfirmDeleteEbookId(null)}
                                            className="px-2 py-2 text-xs text-slate-300 hover:text-white"
                                          >
                                            Batal
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteEbookId(mod.id)}
                                          className="px-2.5 py-2 text-xs font-medium text-red-300 bg-red-950/50 border border-red-800/60 hover:bg-red-900/60 rounded-lg flex items-center gap-1 whitespace-nowrap"
                                          aria-label={`Padam ${mod.code}`}
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      ))}
                                  </div>
                                </div>

                                {isOpen && (
                                  <TeoriEbookReader
                                    token={token}
                                    file={mod.file}
                                    bookTitle={`${mod.code} — ${mod.title}`}
                                    folderLabel={`${activeLevel.code} / ${activeCU.code} / TEORI / ${mod.code}`}
                                    onClose={() => setActiveEbookId(null)}
                                    onDownload={() => handleDownloadEbook(mod)}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="pt-4 border-t border-[#1a2f5c] text-xs text-slate-400">
                          Belum ada modul E-Book Kertas Penerangan dimuat naik untuk CU ini. Klik &ldquo;Tambah Modul E-Book&rdquo; di atas untuk memuat naik siri nota KP.
                        </p>
                      )}
                    </div>
                  )}

                  <DocumentSlotCard
                    token={token}
                    cuId={activeCU.id}
                    slotType={notaSlotType}
                    folderLabel={`${activeLevel.code} / ${activeCU.code} / TEORI / ${subFolderCode} / Nota_Pembelajaran`}
                    slotTitle={`Nota Pembelajaran — E-Book (${selectedSub === 'sub1' ? 'Sub 1' : 'Sub 2'})`}
                    slotDescription={`${selectedSub === 'sub1' ? sub1Label : sub2Label} — Dokumen nota rujukan teori rasmi (.pdf, .docx, .doc) dipapar dalam mod bacaan E-Book.`}
                    file={activeTeoriSub.notaSlot}
                    canEdit={canEdit}
                    viewerMode="ebook"
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
                    slotTitle={`Panduan Soalan — E-Book (${selectedSub === 'sub1' ? 'Sub 1' : 'Sub 2'})`}
                    slotDescription={`${selectedSub === 'sub1' ? sub1Label : sub2Label} — Panduan soalan teori atau skema latihan bertulis (.pdf, .docx, .doc) dipapar dalam mod bacaan E-Book.`}
                    file={activeTeoriSub.panduanSoalanSlot}
                    canEdit={canEdit}
                    viewerMode="ebook"
                    onUpdated={onRefreshWorkspace}
                    onAccessed={() =>
                      api.logAccess(token, activeCU.id, 'view_panduan', selectedSub).catch(() => {})
                    }
                  />

                  {/* Pautan Folder Nota Google Drive */}
                  <div className="bg-[#0b1733] border border-[#1a2f5c] rounded-xl p-6 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                          <HardDrive className="w-3.5 h-3.5 text-[#f0cb63]" />
                          <span>
                            {activeLevel.code} / {activeCU.code} / TEORI / {subFolderCode} / Google_Drive_Folder
                          </span>
                        </p>
                        <h3 className="mt-1.5 text-base font-semibold text-white">
                          {activeTeoriSub.googleDriveTitle ||
                            `Folder Nota Google Drive (${selectedSub === 'sub1' ? 'Sub 1' : 'Sub 2'})`}
                        </h3>
                        <p className="mt-1 text-sm text-slate-300">
                          Akses himpunan fail nota tambahan terus daripada folder Google Drive yang dipautkan untuk sub topik ini.
                        </p>
                      </div>

                      {activeTeoriSub.googleDriveUrl ? (
                        <a
                          href={activeTeoriSub.googleDriveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() =>
                            api.logAccess(token, activeCU.id, 'open_drive', selectedSub).catch(() => {})
                          }
                          className="px-4 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Buka Folder Google Drive</span>
                        </a>
                      ) : (
                        <span className="text-xs font-medium text-slate-400 shrink-0">
                          Belum Dipautkan
                        </span>
                      )}
                    </div>

                    {canEdit && (
                      <form
                        onSubmit={handleSaveGoogleDrive}
                        className="p-4 rounded-lg bg-[#071024] border border-[#1a2f5c] space-y-3"
                      >
                        <div className="flex items-center gap-2 text-xs font-semibold text-white">
                          <FolderOpen className="w-4 h-4 text-[#f0cb63]" />
                          <span>
                            Pautan Folder Nota Google Drive ({selectedSub === 'sub1' ? 'Sub 1' : 'Sub 2'})
                          </span>
                        </div>

                        {driveMsg && (
                          <p
                            className={`text-xs ${
                              driveMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {driveMsg.text}
                          </p>
                        )}

                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-slate-300 mb-1">
                              Tajuk Folder Nota
                            </label>
                            <input
                              type="text"
                              value={driveTitleInput}
                              onChange={(e) => setDriveTitleInput(e.target.value)}
                              placeholder="cth: Nota Tambahan Google Drive Sub 1"
                              className="w-full px-3 py-2 text-xs border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-300 mb-1">
                              Pautan Folder Google Drive (HTTPS)
                            </label>
                            <input
                              type="url"
                              value={driveUrlInput}
                              onChange={(e) => setDriveUrlInput(e.target.value)}
                              placeholder="https://drive.google.com/drive/folders/..."
                              className="w-full px-3 py-2 text-xs font-mono border border-[#263f73] rounded-lg bg-[#0b1733] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#e5b94c]"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-slate-400">
                            Pastikan tetapan kongsi folder Google Drive ditetapkan kepada{' '}
                            <span className="text-slate-200 font-medium">Anyone with the link</span>{' '}
                            supaya senarai nota dipaparkan terus di dalam portal. Kosongkan untuk memadam pautan.
                          </p>
                          <button
                            type="submit"
                            disabled={savingDrive}
                            className="px-3.5 py-2 text-xs font-semibold text-[#041434] bg-[#e5b94c] hover:bg-[#f0cb63] rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{savingDrive ? 'Menyimpan...' : 'Simpan Folder Drive'}</span>
                          </button>
                        </div>
                      </form>
                    )}

                    {activeTeoriSub.googleDriveUrl ? (
                      (() => {
                        const embedDriveUrl = toEmbedGoogleDriveFolderUrl(
                          activeTeoriSub.googleDriveUrl,
                          driveViewMode
                        );
                        if (!embedDriveUrl) {
                          return (
                            <div className="pt-3 border-t border-[#1a2f5c] flex flex-wrap items-center justify-between gap-3">
                              <p className="text-xs text-slate-300 font-mono truncate max-w-xl">
                                {activeTeoriSub.googleDriveUrl}
                              </p>
                              <a
                                href={activeTeoriSub.googleDriveUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() =>
                                  api.logAccess(token, activeCU.id, 'open_drive', selectedSub).catch(() => {})
                                }
                                className="text-xs font-semibold text-[#f0cb63] hover:underline flex items-center gap-1"
                              >
                                <span>Buka Pautan</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          );
                        }
                        return (
                          <div className="space-y-3 pt-2 border-t border-[#1a2f5c]">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-medium text-slate-300">
                                Senarai Kandungan Folder Google Drive
                              </p>
                              <div className="flex items-center gap-1 p-0.5 bg-[#071024] border border-[#1a2f5c] rounded-lg">
                                <button
                                  type="button"
                                  onClick={() => setDriveViewMode('list')}
                                  className={`px-2.5 py-1 text-xs rounded-md flex items-center gap-1 ${
                                    driveViewMode === 'list'
                                      ? 'bg-[#17356e] text-[#f0cb63] font-semibold'
                                      : 'text-slate-400 hover:text-white'
                                  }`}
                                >
                                  <List className="w-3.5 h-3.5" />
                                  <span>Senarai</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDriveViewMode('grid')}
                                  className={`px-2.5 py-1 text-xs rounded-md flex items-center gap-1 ${
                                    driveViewMode === 'grid'
                                      ? 'bg-[#17356e] text-[#f0cb63] font-semibold'
                                      : 'text-slate-400 hover:text-white'
                                  }`}
                                >
                                  <LayoutGrid className="w-3.5 h-3.5" />
                                  <span>Grid</span>
                                </button>
                              </div>
                            </div>

                            <div className="border border-[#263f73] rounded-lg overflow-hidden bg-white">
                              <iframe
                                src={embedDriveUrl}
                                title={activeTeoriSub.googleDriveTitle || 'Folder Nota Google Drive'}
                                className="w-full h-[380px]"
                                referrerPolicy="no-referrer"
                              />
                            </div>

                            <p className="text-xs text-slate-400">
                              Jika senarai fail tidak kelihatan kerana tetapan privasi pelayar atau akaun Google, klik{' '}
                              <span className="text-slate-200 font-medium">&ldquo;Buka Folder Google Drive&rdquo;</span> di atas.
                            </p>
                          </div>
                        );
                      })()
                    ) : (
                      !canEdit && (
                        <div className="pt-4 border-t border-[#1a2f5c] text-xs text-slate-400">
                          Pengajar atau Admin belum memautkan folder Google Drive untuk sub bahagian ini.
                        </div>
                      )
                    )}
                  </div>
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

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <span className="text-xs font-mono tabular-nums text-slate-300">
                          {userSopChecked.length}/{activeAmaliSub.sopSteps.length} Disemak
                        </span>
                        {!editingSop &&
                          activeAmaliSub.sopSteps.length > 0 &&
                          (driveConnected ? (
                            <button
                              type="button"
                              disabled={syncingSopDrive}
                              onClick={() => void saveSopRecordToDrive()}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-600 disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <CloudUpload className="w-3.5 h-3.5" />
                              <span>
                                {syncingSopDrive ? 'Menyimpan...' : 'Simpan Rekod SOP ke Drive'}
                              </span>
                            </button>
                          ) : (
                            <GoogleSignInButton
                              onClick={() => void saveSopRecordToDrive()}
                              disabled={syncingSopDrive}
                            />
                          ))}
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

                    {sopDriveLink && (
                      <div className="mt-4 p-3 rounded-lg bg-[#071024] border border-sky-800/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-slate-300">
                          Rekod SOP disimpan dalam folder Drive{' '}
                          <span className="font-mono text-white">{sopDriveLink.folderName}</span>
                        </span>
                        <div className="flex items-center gap-3">
                          <a
                            href={sopDriveLink.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:underline inline-flex items-center gap-1 font-semibold"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Buka Rekod SOP</span>
                          </a>
                          <a
                            href={sopDriveLink.folderUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#f0cb63] hover:underline inline-flex items-center gap-1"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                            <span>Folder No. KP</span>
                          </a>
                        </div>
                      </div>
                    )}

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
              {/* SECTION: TUGASAN JPK & PENANDAAN AI */}
              {selectedSection === 'tugasan' && (
                <TugasanWorkspace
                  token={token}
                  user={user}
                  branding={branding}
                  level={activeLevel}
                  cu={activeCU}
                  papers={tugasanPapers.filter((p) => p.cuId === activeCU.id)}
                  submissions={tugasanSubmissions.filter((s) => s.cuId === activeCU.id)}
                  onRefreshWorkspace={onRefreshWorkspace}
                  externalDrivePdf={activeDrivePdfSession}
                  onClearExternalDrivePdf={() => setActiveDrivePdfSession(null)}
                  driveAssessmentFiles={driveAssessmentFiles}
                  driveCuPathLabel={cocuDrivePathLabel}
                  openingDrivePdfId={openingDrivePdfId}
                  onOpenDrivePdf={(file) => handleLaunchDrivePdfOverlay(file)}
                />
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

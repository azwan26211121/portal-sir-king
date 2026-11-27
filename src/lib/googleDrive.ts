import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  AccessLogEntry,
  CUModule,
  DriveRegistryUserRecord,
  DriveSystemRegistryPayload,
  JpkDriveCategoryMeta,
  JpkDriveFileCategory,
  PublicUser,
  SopCheckProgress,
  TopicLevel,
  TugasanPaper,
  TugasanSubmission,
} from '../types.ts';

export const SCOPES = ['https://www.googleapis.com/auth/drive'];

export const KURSUS_ROOT_FOLDER_NAME = 'KURSUS';

export const JPK_DRIVE_CATEGORIES: readonly JpkDriveCategoryMeta[] = [
  {
    key: 'kp',
    codeBadge: 'KP',
    label: 'Nota / Kertas Penerangan (KP)',
    description: 'Fail KP... (cth: KPC01...) dipaparkan sebagai nota di Tab Teori.',
  },
  {
    key: 'kt',
    codeBadge: 'KT',
    label: 'Kertas Tugasan (KT)',
    description:
      'Fail KT... (cth: KTC01...) dibuka terus sebagai kertas soalan PDF asal & ditindih markah AI warna merah.',
  },
  {
    key: 'kk',
    codeBadge: 'KK',
    label: 'Kertas Kerja / Kerja Kursus (KK)',
    description: 'Fail KK... (cth: KKC01...) untuk Kertas Kerja dan Penilaian Kerja Kursus.',
  },
  {
    key: 'penilaian_teori',
    codeBadge: 'PT / LAIN',
    label: 'Penilaian Teori',
    description:
      'Sebarang fail penilaian teori lain di dalam folder CU untuk dibuka terus sebagai kertas PDF asal.',
  },
  {
    key: 'pmt_pma',
    codeBadge: 'PMT & PMA',
    label: 'Pelan Mengajar (PMT & PMA)',
    description:
      'Pelan Mengajar Teori (PMT...) & Pelan Mengajar Amali (PMA...) — khas untuk Pengajar & Admin sahaja.',
    staffOnly: true,
  },
];

export const SYSTEM_REGISTRY_FILENAME = '_SYSTEM_ACCESS_REGISTRY.json';
export const APPROVED_RECORDS_SUBFOLDER_NAME = 'REKOD_DILULUSKAN';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}

// In-memory access token cache ONLY (never persisted to localStorage/sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedGoogleUser: User | null = null;

export function initGoogleWorkspaceAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
): () => void {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      cachedGoogleUser = user;
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.();
      }
    } else {
      cachedGoogleUser = null;
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
}

export async function signInWithGoogleDrive(): Promise<{
  user: User;
  accessToken: string;
}> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'Gagal mendapatkan token akses Google Drive. Sila benarkan akses Google Drive pada tetingkap log masuk.'
      );
    }
    cachedAccessToken = credential.accessToken;
    cachedGoogleUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export function getGoogleDriveAccessToken(): string | null {
  return cachedAccessToken;
}

export function getGoogleWorkspaceUser(): User | null {
  return cachedGoogleUser;
}

export async function signOutGoogleWorkspace(): Promise<void> {
  await auth.signOut();
  cachedAccessToken = null;
  cachedGoogleUser = null;
}

export function extractDriveFolderId(urlOrId: string): string | null {
  const trimmed = (urlOrId || '').trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z0-9_-]{10,120}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname.toLowerCase().endsWith('google.com')) return null;
    const folderMatch = parsed.pathname.match(/\/folders\/([a-zA-Z0-9_-]{10,120})/);
    if (folderMatch?.[1]) return folderMatch[1];
    const idParam = parsed.searchParams.get('id');
    if (idParam && /^[a-zA-Z0-9_-]{10,120}$/.test(idParam)) return idParam;
    return null;
  } catch {
    return null;
  }
}

function escapeDriveQueryString(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function sanitizeFolderName(raw: string, fallback = 'FOLDER'): string {
  const clean = (raw || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return clean || fallback;
}

export function buildTraineeFolderName(
  icNumber: string | undefined,
  userCodeId: string
): string {
  const cleanIc = (icNumber || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .slice(0, 60);
  if (cleanIc) return cleanIc;
  const cleanId = (userCodeId || 'PELATIH')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .slice(0, 60);
  return cleanId || 'PELATIH';
}

export interface DriveFolderResult {
  id: string;
  name: string;
  webViewLink: string;
  created: boolean;
}

export interface HierarchicalDriveFolderResult extends DriveFolderResult {
  adminFolderId: string;
  supervisorFolderId: string;
  supervisorFolderName: string;
  approvedRecordsFolderId?: string;
  approvedRecordsFolderUrl?: string;
  pathLabel: string;
}

export interface DriveFileResult {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  modifiedTime?: string;
  size?: string;
  subPath?: string;
  parentFolderId?: string;
}

export interface CategorizedDriveFile extends DriveFileResult {
  category: JpkDriveFileCategory;
}

export interface CoCuDriveResolvedResult {
  kursusFolder: DriveFolderResult | null;
  nossFolder: DriveFolderResult | null;
  cuFolder: DriveFolderResult | null;
  availableCuFolders: DriveFolderResult[];
  allFiles: CategorizedDriveFile[];
  byCategory: Record<JpkDriveFileCategory, CategorizedDriveFile[]>;
  pathLabel: string;
}

export interface CurriculumTreeEnsureResult {
  kursusFolder: DriveFolderResult;
  nossCount: number;
  cusCount: number;
  cusCreated: number;
  cusExisting: number;
  filesScannedCount: number;
  nossFolders: Array<{
    levelId: string;
    code: string;
    name: string;
    folderId: string;
    webViewLink: string;
    cuCount: number;
    filesCount: number;
  }>;
}

export interface DrivePermissionsSyncResult {
  applied: string[];
  removed: number;
  warnings: string[];
}

async function driveJsonRequest<T>(
  accessToken: string,
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      cachedAccessToken = null;
      throw new Error(
        'Sesi akses Google Drive telah tamat. Sila klik "Sign in with Google" semula.'
      );
    }
    const errMsg =
      (data as { error?: { message?: string } })?.error?.message ||
      `Ralat Google Drive (${res.status}).`;
    throw new Error(errMsg);
  }
  return data as T;
}

export async function findOrCreateSubfolder(
  accessToken: string,
  parentFolderId: string,
  folderName: string,
  description?: string,
  options?: { preserveColon?: boolean }
): Promise<DriveFolderResult> {
  const safeParent = extractDriveFolderId(parentFolderId);
  if (!safeParent) {
    throw new Error('ID folder Google Drive induk tidak sah.');
  }
  const targetName = options?.preserveColon
    ? (folderName || '')
        .trim()
        .replace(/[\\/*?"<>|]/g, '-')
        .replace(/\s+/g, ' ')
        .slice(0, 80) || 'FOLDER'
    : sanitizeFolderName(folderName, 'FOLDER');
  const listQuery = `'${escapeDriveQueryString(
    safeParent
  )}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const listUrl =
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(listQuery)}` +
    `&fields=files(id,name,webViewLink)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  const listed = await driveJsonRequest<{
    files?: Array<{ id: string; name: string; webViewLink?: string }>;
  }>(accessToken, listUrl);

  const existing = (listed.files || []).find(
    (f) => f.name.trim().toLowerCase() === targetName.toLowerCase()
  );
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      webViewLink:
        existing.webViewLink || `https://drive.google.com/drive/folders/${existing.id}`,
      created: false,
    };
  }

  const created = await driveJsonRequest<{
    id: string;
    name: string;
    webViewLink?: string;
  }>(
    accessToken,
    'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: targetName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [safeParent],
        description: description || `Folder SIRKING (${targetName})`,
      }),
    }
  );

  return {
    id: created.id,
    name: created.name,
    webViewLink:
      created.webViewLink || `https://drive.google.com/drive/folders/${created.id}`,
    created: true,
  };
}

/**
 * Finds an existing subfolder matching the trainee's No. Kad Pengenalan inside parentFolderId,
 * or creates a new subfolder named with their No. KP if none exists yet.
 */
export async function findOrCreateTraineeIcFolder(
  accessToken: string,
  parentFolderId: string,
  icNumber: string | undefined,
  userCodeId: string,
  traineeName?: string
): Promise<DriveFolderResult> {
  const safeParent = extractDriveFolderId(parentFolderId);
  if (!safeParent) {
    throw new Error('ID folder Google Drive sasaran tidak sah.');
  }

  const targetName = buildTraineeFolderName(icNumber, userCodeId);
  const digitsOnlyIc = (icNumber || '').replace(/[^0-9]/g, '');

  const listQuery = `'${escapeDriveQueryString(
    safeParent
  )}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const listUrl =
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(listQuery)}` +
    `&fields=files(id,name,webViewLink)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  const listed = await driveJsonRequest<{
    files?: Array<{ id: string; name: string; webViewLink?: string }>;
  }>(accessToken, listUrl);

  const existing = (listed.files || []).find((f) => {
    const fName = f.name.trim();
    if (fName.toLowerCase() === targetName.toLowerCase()) return true;
    if (digitsOnlyIc && digitsOnlyIc.length >= 6) {
      const fDigits = fName.replace(/[^0-9]/g, '');
      if (fDigits === digitsOnlyIc) return true;
    }
    return false;
  });

  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      webViewLink:
        existing.webViewLink || `https://drive.google.com/drive/folders/${existing.id}`,
      created: false,
    };
  }

  const created = await driveJsonRequest<{
    id: string;
    name: string;
    webViewLink?: string;
  }>(
    accessToken,
    'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: targetName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [safeParent],
        description: `Folder Rekod Latihan Pelatih SIRKING (${
          traineeName ? `${traineeName} · ` : ''
        }No. KP: ${targetName})`,
      }),
    }
  );

  return {
    id: created.id,
    name: created.name,
    webViewLink:
      created.webViewLink || `https://drive.google.com/drive/folders/${created.id}`,
    created: true,
  };
}

/**
 * Resolves and ensures the hierarchical folder structure:
 * <RootFolder> / ADMIN / <Nama Pengajar> / <No. KP Pelatih> [/ REKOD_DILULUSKAN]
 */
export async function resolveHierarchicalTraineeDriveFolder(
  accessToken: string,
  rootFolderId: string,
  supervisorName: string | undefined,
  icNumber: string | undefined,
  userCodeId: string,
  traineeName?: string,
  options?: { ensureApprovedSubfolder?: boolean }
): Promise<HierarchicalDriveFolderResult> {
  const adminFolder = await findOrCreateSubfolder(
    accessToken,
    rootFolderId,
    'ADMIN',
    'Folder Pentadbiran Utama, Senarai Akses & Rekod Pengajar/Pelatih SIRKING'
  );
  const cleanSupName = sanitizeFolderName(
    supervisorName || 'PENTADBIR UTAMA',
    'PENTADBIR UTAMA'
  );
  const supervisorFolder = await findOrCreateSubfolder(
    accessToken,
    adminFolder.id,
    cleanSupName,
    `Folder Rekod Pelatih Di Bawah Penyeliaan: ${cleanSupName}`
  );
  const traineeFolder = await findOrCreateTraineeIcFolder(
    accessToken,
    supervisorFolder.id,
    icNumber,
    userCodeId,
    traineeName
  );
  let approvedRecordsFolder: DriveFolderResult | undefined;
  if (options?.ensureApprovedSubfolder) {
    approvedRecordsFolder = await findOrCreateSubfolder(
      accessToken,
      traineeFolder.id,
      APPROVED_RECORDS_SUBFOLDER_NAME,
      `Folder Rekod & Penilaian Diluluskan (${traineeName || userCodeId})`
    );
  }
  return {
    ...traineeFolder,
    adminFolderId: adminFolder.id,
    supervisorFolderId: supervisorFolder.id,
    supervisorFolderName: supervisorFolder.name,
    approvedRecordsFolderId: approvedRecordsFolder?.id,
    approvedRecordsFolderUrl: approvedRecordsFolder?.webViewLink,
    pathLabel: options?.ensureApprovedSubfolder
      ? `ADMIN / ${supervisorFolder.name} / ${traineeFolder.name} / ${APPROVED_RECORDS_SUBFOLDER_NAME}`
      : `ADMIN / ${supervisorFolder.name} / ${traineeFolder.name}`,
  };
}

export async function listFilesInDriveFolder(
  accessToken: string,
  folderId: string
): Promise<DriveFileResult[]> {
  const safeId = extractDriveFolderId(folderId);
  if (!safeId) return [];
  const q = `'${escapeDriveQueryString(safeId)}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
  const url =
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}` +
    `&orderBy=modifiedTime desc&pageSize=100&fields=files(id,name,mimeType,webViewLink,modifiedTime,size)` +
    `&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const data = await driveJsonRequest<{
    files?: Array<{
      id: string;
      name: string;
      mimeType: string;
      webViewLink?: string;
      modifiedTime?: string;
      size?: string;
    }>;
  }>(accessToken, url);

  return (data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    webViewLink:
      f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
    modifiedTime: f.modifiedTime,
    size: f.size,
  }));
}

export async function downloadDriveFileBytes(
  accessToken: string,
  fileId: string
): Promise<Uint8Array> {
  const safeId = extractDriveFolderId(fileId);
  if (!safeId) {
    throw new Error('ID fail Google Drive tidak sah.');
  }
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      safeId
    )}?alt=media&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    if (res.status === 401) {
      cachedAccessToken = null;
      throw new Error(
        'Sesi akses Google Drive telah tamat. Sila klik "Sign in with Google" semula.'
      );
    }
    throw new Error(`Gagal memuat turun fail daripada Google Drive (${res.status}).`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function trashDriveFile(
  accessToken: string,
  fileId: string
): Promise<void> {
  const safeId = extractDriveFolderId(fileId);
  if (!safeId) {
    throw new Error('ID fail Google Drive tidak sah.');
  }
  await driveJsonRequest(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(safeId)}?supportsAllDrives=true`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    }
  );
}

// =========================================================================
// Struktur Folder Kurikulum Google Drive Sebenar:
// Root -> KURSUS -> Kod NOSS (F432-005-2:2019, dsb.) -> Folder CU (C01, C02...)
// Semua fail di dalam folder CU diimbas & diasingkan mengikut kod JPK (KP/KT/KK/PMT/PMA/Penilaian Teori)
// =========================================================================

export function buildDriveNossFolderName(level: TopicLevel): string {
  const titleText = level.title || '';
  const codeMatch = titleText.match(/([A-Z0-9]+-\d+-\d+:\d{4})/i);
  if (codeMatch?.[1]) {
    return codeMatch[1].toUpperCase();
  }
  const fallback =
    (titleText.split('—')[0] || level.code || 'NOSS')
      .trim()
      .replace(/[\\/*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 80) || 'NOSS';
  return fallback;
}

export function buildDriveCoCuFolderName(cu: CUModule): string {
  const leading = (cu.code || 'C01').trim().split(/\s+/)[0] || 'C01';
  return sanitizeFolderName(leading.toUpperCase(), 'C01');
}

export function classifyJpkDriveFile(
  fileName: string,
  folderHint?: string
): JpkDriveFileCategory {
  const cleanName = (fileName || '').trim();
  const cleanHint = (folderHint || '').trim();

  // 1. PMT... / PMA... -> Pelan Mengajar Teori & Amali (Pengajar/Admin sahaja)
  if (
    /(?:^|[\s._\-\/()])(PMT|PMA)(?:C\d+|[0-9(\s._\-]|$)/i.test(cleanName) ||
    /pelan[\s._\-]*mengajar/i.test(cleanName)
  ) {
    return 'pmt_pma';
  }

  // 2. KP... -> Nota / Kertas Penerangan
  if (
    /(?:^|[\s._\-\/()])KP(?:C\d+|[0-9(\s._\-]|$)/i.test(cleanName) ||
    /kertas[\s._\-]*penerangan/i.test(cleanName)
  ) {
    return 'kp';
  }

  // 3. KT... -> Kertas Tugasan
  if (
    /(?:^|[\s._\-\/()])KT(?:C\d+|[0-9(\s._\-]|$)/i.test(cleanName) ||
    /kertas[\s._\-]*tugasan/i.test(cleanName)
  ) {
    return 'kt';
  }

  // 4. KK... -> Kertas Kerja / Penilaian Kerja Kursus
  if (
    /(?:^|[\s._\-\/()])KK(?:C\d+|[0-9(\s._\-]|$)/i.test(cleanName) ||
    /kertas[\s._\-]*kerja|kerja[\s._\-]*kursus/i.test(cleanName)
  ) {
    return 'kk';
  }

  // Fallback hints if placed inside legacy subfolder inside CU folder
  if (cleanHint) {
    if (/pmt|pma|pelan[\s._\-]*mengajar/i.test(cleanHint)) return 'pmt_pma';
    if (/kertas[\s._\-]*penerangan|\bnota\b/i.test(cleanHint)) return 'kp';
    if (/kertas[\s._\-]*tugasan/i.test(cleanHint)) return 'kt';
    if (/kertas[\s._\-]*kerja|kerja[\s._\-]*kursus/i.test(cleanHint)) return 'kk';
  }

  // 5. Sebarang fail penilaian teori / dokumen lain di dalam folder CU
  return 'penilaian_teori';
}

async function listChildFoldersInParent(
  accessToken: string,
  parentFolderId: string
): Promise<DriveFolderResult[]> {
  const safeParent = extractDriveFolderId(parentFolderId);
  if (!safeParent) return [];
  const listQuery = `'${escapeDriveQueryString(
    safeParent
  )}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const listUrl =
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(listQuery)}` +
    `&orderBy=name&fields=files(id,name,webViewLink)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const listed = await driveJsonRequest<{
    files?: Array<{ id: string; name: string; webViewLink?: string }>;
  }>(accessToken, listUrl);
  return (listed.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    webViewLink: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`,
    created: false,
  }));
}

async function findFolderByExactOrPrefix(
  accessToken: string,
  parentFolderId: string,
  targetName: string,
  createIfMissing: boolean,
  description?: string
): Promise<DriveFolderResult | null> {
  const children = await listChildFoldersInParent(accessToken, parentFolderId);
  const cleanTarget =
    targetName
      .trim()
      .replace(/[\\/*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 80) || 'FOLDER';
  const lower = cleanTarget.toLowerCase();
  const normalizedLower = lower.replace(/:/g, '-');
  const existing =
    children.find((c) => c.name.trim().toLowerCase() === lower) ||
    children.find((c) => c.name.trim().toLowerCase().replace(/:/g, '-') === normalizedLower) ||
    children.find((c) => {
      const n = c.name.trim().toLowerCase();
      return (
        n.startsWith(`${lower} `) ||
        n.startsWith(`${lower}-`) ||
        n.startsWith(`${lower}_`) ||
        n.startsWith(`${lower}(`) ||
        n.includes(lower) ||
        n.replace(/:/g, '-').includes(normalizedLower)
      );
    });
  if (existing) return existing;
  if (!createIfMissing) return null;
  return findOrCreateSubfolder(accessToken, parentFolderId, cleanTarget, description, {
    preserveColon: true,
  });
}

async function listFilesInFolderRecursive(
  accessToken: string,
  folderId: string,
  subPath = '',
  depth = 0,
  seenIds = new Set<string>()
): Promise<DriveFileResult[]> {
  const directFiles = await listFilesInDriveFolder(accessToken, folderId);
  const collected: DriveFileResult[] = [];
  for (const f of directFiles) {
    if (seenIds.has(f.id)) continue;
    if (f.name.startsWith('_SYSTEM_')) continue;
    seenIds.add(f.id);
    collected.push({
      ...f,
      subPath: subPath || undefined,
      parentFolderId: folderId,
    });
  }

  if (depth < 3) {
    const childFolders = await listChildFoldersInParent(accessToken, folderId);
    for (const child of childFolders) {
      const nextPath = subPath ? `${subPath} / ${child.name}` : child.name;
      const nested = await listFilesInFolderRecursive(
        accessToken,
        child.id,
        nextPath,
        depth + 1,
        seenIds
      );
      collected.push(...nested);
    }
  }

  return collected;
}

export async function resolveCoCuDriveContents(
  accessToken: string,
  rootFolderId: string,
  level: TopicLevel,
  cu: CUModule,
  options?: {
    createIfMissing?: boolean;
    includeStaffOnly?: boolean;
    cuFolderIdOverride?: string;
  }
): Promise<CoCuDriveResolvedResult> {
  const emptyCategories = (): Record<JpkDriveFileCategory, CategorizedDriveFile[]> => ({
    kp: [],
    kt: [],
    kk: [],
    penilaian_teori: [],
    pmt_pma: [],
  });

  const createIfMissing = Boolean(options?.createIfMissing);
  const includeStaffOnly = Boolean(options?.includeStaffOnly);
  const nossName = buildDriveNossFolderName(level);
  const cuName = buildDriveCoCuFolderName(cu);

  // 1. Cari / cipta folder KURSUS di dalam root folder Drive (tanpa lapisan TAHAP 2..5)
  const kursusFolder = await findFolderByExactOrPrefix(
    accessToken,
    rootFolderId,
    KURSUS_ROOT_FOLDER_NAME,
    createIfMissing,
    'Folder Induk Kurikulum & Bahan Pembelajaran JPK'
  );

  // 2. Cari / cipta folder Kod NOSS terus di dalam KURSUS (fallback baca terus dari root jika KURSUS belum wujud)
  const nossParentId = kursusFolder ? kursusFolder.id : !createIfMissing ? rootFolderId : '';
  const nossFolder = nossParentId
    ? await findFolderByExactOrPrefix(
        accessToken,
        nossParentId,
        nossName,
        createIfMissing,
        `Kod NOSS ${nossName}`
      )
    : null;

  if (!nossFolder) {
    return {
      kursusFolder,
      nossFolder: null,
      cuFolder: null,
      availableCuFolders: [],
      allFiles: [],
      byCategory: emptyCategories(),
      pathLabel: `${KURSUS_ROOT_FOLDER_NAME} / ${nossName} / ${cuName}`,
    };
  }

  // 3. Senaraikan semua folder CU di dalam folder Kod NOSS & pilih folder CU aktif
  const availableCuFolders = await listChildFoldersInParent(accessToken, nossFolder.id);
  let cuFolder: DriveFolderResult | null = null;

  if (options?.cuFolderIdOverride) {
    cuFolder =
      availableCuFolders.find((f) => f.id === options.cuFolderIdOverride) || null;
  }

  if (!cuFolder) {
    const lowerCu = cuName.toLowerCase();
    cuFolder =
      availableCuFolders.find((f) => f.name.trim().toLowerCase() === lowerCu) ||
      availableCuFolders.find((f) => {
        const n = f.name.trim().toLowerCase();
        return (
          n.startsWith(`${lowerCu} `) ||
          n.startsWith(`${lowerCu}-`) ||
          n.startsWith(`${lowerCu}_`) ||
          n.startsWith(`${lowerCu}(`)
        );
      }) ||
      null;
  }

  if (!cuFolder && createIfMissing) {
    cuFolder = await findOrCreateSubfolder(
      accessToken,
      nossFolder.id,
      cuName,
      `Unit Kompetensi ${cuName} — ${cu.title}`,
      { preserveColon: true }
    );
    availableCuFolders.push(cuFolder);
  }

  if (!cuFolder) {
    return {
      kursusFolder,
      nossFolder,
      cuFolder: null,
      availableCuFolders,
      allFiles: [],
      byCategory: emptyCategories(),
      pathLabel: `${kursusFolder ? kursusFolder.name : KURSUS_ROOT_FOLDER_NAME} / ${nossFolder.name} / ${cuName}`,
    };
  }

  // 4. Imbas semua fail di dalam folder CU (termasuk subfolder di dalamnya) & asingkan mengikut kod JPK
  const rawFiles = await listFilesInFolderRecursive(accessToken, cuFolder.id);
  const byCategory = emptyCategories();
  const allFiles: CategorizedDriveFile[] = [];

  for (const file of rawFiles) {
    const category = classifyJpkDriveFile(file.name, file.subPath);
    if (category === 'pmt_pma' && !includeStaffOnly) {
      continue;
    }
    const categorized: CategorizedDriveFile = {
      ...file,
      category,
    };
    allFiles.push(categorized);
    byCategory[category].push(categorized);
  }

  const sortByName = (a: CategorizedDriveFile, b: CategorizedDriveFile) =>
    a.name.localeCompare(b.name, 'ms', { numeric: true, sensitivity: 'base' });
  allFiles.sort(sortByName);
  for (const key of Object.keys(byCategory) as JpkDriveFileCategory[]) {
    byCategory[key].sort(sortByName);
  }

  return {
    kursusFolder,
    nossFolder,
    cuFolder,
    availableCuFolders,
    allFiles,
    byCategory,
    pathLabel: `${kursusFolder ? kursusFolder.name : KURSUS_ROOT_FOLDER_NAME} / ${nossFolder.name} / ${cuFolder.name}`,
  };
}

export async function ensureCurriculumFolderTreeInDrive(
  accessToken: string,
  rootFolderId: string,
  levels: TopicLevel[],
  cus: CUModule[]
): Promise<CurriculumTreeEnsureResult> {
  const kursusFolder = await findOrCreateSubfolder(
    accessToken,
    rootFolderId,
    KURSUS_ROOT_FOLDER_NAME,
    'Folder Induk Kurikulum & Bahan Pembelajaran JPK (KURSUS -> Kod NOSS -> CU)',
    { preserveColon: true }
  );

  const orderedLevels = [...levels].sort((a, b) => a.order - b.order);
  const nossFolders: CurriculumTreeEnsureResult['nossFolders'] = [];
  let cusCount = 0;
  let cusCreated = 0;
  let cusExisting = 0;
  let filesScannedCount = 0;

  for (const lvl of orderedLevels) {
    const nossName = buildDriveNossFolderName(lvl);
    const nossFolder = await findOrCreateSubfolder(
      accessToken,
      kursusFolder.id,
      nossName,
      `Kod NOSS ${nossName} (${lvl.code})`,
      { preserveColon: true }
    );

    const levelCus = cus
      .filter((c) => c.levelId === lvl.id)
      .sort((a, b) => a.order - b.order);
    const existingCuFolders = await listChildFoldersInParent(accessToken, nossFolder.id);
    const touchedCuIds = new Set<string>();
    let nossFilesCount = 0;

    for (const cu of levelCus) {
      cusCount += 1;
      const cuName = buildDriveCoCuFolderName(cu);
      const lowerCu = cuName.toLowerCase();
      let cuFolder =
        existingCuFolders.find((f) => f.name.trim().toLowerCase() === lowerCu) ||
        existingCuFolders.find((f) => {
          const n = f.name.trim().toLowerCase();
          return (
            n.startsWith(`${lowerCu} `) ||
            n.startsWith(`${lowerCu}-`) ||
            n.startsWith(`${lowerCu}_`) ||
            n.startsWith(`${lowerCu}(`)
          );
        }) ||
        null;

      if (cuFolder) {
        cusExisting += 1;
      } else {
        cuFolder = await findOrCreateSubfolder(
          accessToken,
          nossFolder.id,
          cuName,
          `Unit Kompetensi ${cuName} — ${cu.title}`,
          { preserveColon: true }
        );
        cusCreated += 1;
      }
      touchedCuIds.add(cuFolder.id);

      const cuFiles = await listFilesInFolderRecursive(accessToken, cuFolder.id);
      nossFilesCount += cuFiles.length;
      filesScannedCount += cuFiles.length;
    }

    // Kira juga fail dari sebarang folder CU tambahan yang sedia ada dalam Kod NOSS di Drive
    for (const extraCu of existingCuFolders) {
      if (touchedCuIds.has(extraCu.id)) continue;
      cusCount += 1;
      cusExisting += 1;
      const extraFiles = await listFilesInFolderRecursive(accessToken, extraCu.id);
      nossFilesCount += extraFiles.length;
      filesScannedCount += extraFiles.length;
    }

    nossFolders.push({
      levelId: lvl.id,
      code: lvl.code,
      name: nossFolder.name,
      folderId: nossFolder.id,
      webViewLink: nossFolder.webViewLink,
      cuCount: Math.max(levelCus.length, existingCuFolders.length),
      filesCount: nossFilesCount,
    });
  }

  return {
    kursusFolder,
    nossCount: orderedLevels.length,
    cusCount,
    cusCreated,
    cusExisting,
    filesScannedCount,
    nossFolders,
  };
}

// =========================================================================
// Kawalan Kebenaran Google Drive (Permissions API)
// =========================================================================

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function computeAuthorizedEmailsForTrainee(
  trainee: { email?: string | null; supervisorId?: string | null },
  users: Array<{ id: string; role: string; email?: string | null }>
): { writerEmails: string[]; readerEmails: string[]; allAuthorizedEmails: string[] } {
  const writerSet = new Set<string>();
  const readerSet = new Set<string>();

  for (const u of users) {
    const email = (u.email || '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) continue;
    if (u.role === 'master_admin' || u.role === 'admin') {
      writerSet.add(email);
    } else if (trainee.supervisorId && u.id === trainee.supervisorId) {
      writerSet.add(email);
    }
  }

  const traineeEmail = (trainee.email || '').trim().toLowerCase();
  if (EMAIL_PATTERN.test(traineeEmail) && !writerSet.has(traineeEmail)) {
    readerSet.add(traineeEmail);
  }

  return {
    writerEmails: Array.from(writerSet),
    readerEmails: Array.from(readerSet),
    allAuthorizedEmails: Array.from(new Set([...writerSet, ...readerSet])),
  };
}

export async function applyDriveFolderAndFilePermissions(
  accessToken: string,
  targetId: string,
  opts: {
    writerEmails: string[];
    readerEmails?: string[];
    pruneUnauthorized?: boolean;
  }
): Promise<DrivePermissionsSyncResult> {
  const safeId = extractDriveFolderId(targetId);
  if (!safeId) {
    return { applied: [], removed: 0, warnings: ['ID sasaran Google Drive tidak sah.'] };
  }

  const writerSet = new Set(
    (opts.writerEmails || [])
      .map((e) => e.trim().toLowerCase())
      .filter((e) => EMAIL_PATTERN.test(e))
  );
  const readerSet = new Set(
    (opts.readerEmails || [])
      .map((e) => e.trim().toLowerCase())
      .filter((e) => EMAIL_PATTERN.test(e) && !writerSet.has(e))
  );

  const listUrl =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(safeId)}/permissions` +
    `?fields=permissions(id,type,role,emailAddress)&supportsAllDrives=true`;
  const current = await driveJsonRequest<{
    permissions?: Array<{
      id: string;
      type: string;
      role: string;
      emailAddress?: string;
    }>;
  }>(accessToken, listUrl);

  const existingList = current.permissions || [];
  const applied: string[] = [];
  const warnings: string[] = [];
  let removed = 0;

  if (opts.pruneUnauthorized) {
    for (const perm of existingList) {
      if (perm.role === 'owner') continue;
      const em = (perm.emailAddress || '').trim().toLowerCase();
      const allowed =
        perm.type === 'user' && (writerSet.has(em) || readerSet.has(em));
      if (!allowed) {
        try {
          const delRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
              safeId
            )}/permissions/${encodeURIComponent(perm.id)}?supportsAllDrives=true`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );
          if (delRes.ok) removed += 1;
        } catch {
          // Inherited permissions on parent folders cannot always be deleted cleanly
        }
      }
    }
  }

  const existingByEmail = new Map(
    existingList
      .filter((p) => p.type === 'user' && p.emailAddress)
      .map((p) => [(p.emailAddress as string).trim().toLowerCase(), p])
  );

  const ensurePerm = async (email: string, desiredRole: 'writer' | 'reader') => {
    const existing = existingByEmail.get(email);
    if (existing?.role === 'owner' || existing?.role === desiredRole) {
      return;
    }
    try {
      await driveJsonRequest(
        accessToken,
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          safeId
        )}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'user',
            role: desiredRole,
            emailAddress: email,
          }),
        }
      );
      applied.push(`${email} (${desiredRole})`);
    } catch (err) {
      warnings.push(
        `${email}: ${err instanceof Error ? err.message : 'Gagal menetapkan kebenaran.'}`
      );
    }
  };

  for (const em of writerSet) {
    await ensurePerm(em, 'writer');
  }
  for (const em of readerSet) {
    await ensurePerm(em, 'reader');
  }

  return { applied, removed, warnings };
}

export async function upsertDriveFileInFolder(
  accessToken: string,
  folderId: string,
  exactFileName: string,
  mimeType: string,
  blob: Blob
): Promise<DriveFileResult> {
  const safeFolderId = extractDriveFolderId(folderId);
  if (!safeFolderId) {
    throw new Error('ID folder Google Drive destinasi tidak sah.');
  }
  const cleanFileName = exactFileName.replace(/[\\/:*?"<>|]/g, '-').slice(0, 150);
  const q = `'${escapeDriveQueryString(safeFolderId)}' in parents and name = '${escapeDriveQueryString(
    cleanFileName
  )}' and trashed = false`;
  const listUrl =
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}` +
    `&fields=files(id,name)&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const listed = await driveJsonRequest<{
    files?: Array<{ id: string; name: string }>;
  }>(accessToken, listUrl);
  const existingId = listed.files?.[0]?.id;

  if (!existingId) {
    return uploadFileToDriveFolder(accessToken, safeFolderId, cleanFileName, mimeType, blob);
  }

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify({ name: cleanFileName, mimeType })], {
      type: 'application/json',
    })
  );
  form.append('file', blob, cleanFileName);

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
      existingId
    )}?uploadType=multipart&fields=id,name,mimeType,webViewLink,modifiedTime&supportsAllDrives=true`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      cachedAccessToken = null;
      throw new Error(
        'Sesi akses Google Drive telah tamat. Sila klik "Sign in with Google" semula.'
      );
    }
    const errMsg =
      (data as { error?: { message?: string } })?.error?.message ||
      `Gagal mengemas kini fail di Google Drive (${res.status}).`;
    throw new Error(errMsg);
  }
  const updated = data as {
    id: string;
    name: string;
    mimeType?: string;
    webViewLink?: string;
    modifiedTime?: string;
  };
  return {
    id: updated.id,
    name: updated.name,
    mimeType: updated.mimeType || mimeType,
    webViewLink:
      updated.webViewLink || `https://drive.google.com/file/d/${updated.id}/view`,
    modifiedTime: updated.modifiedTime,
  };
}

export async function uploadFileToDriveFolder(
  accessToken: string,
  folderId: string,
  fileName: string,
  mimeType: string,
  blob: Blob
): Promise<DriveFileResult> {
  const safeFolderId = extractDriveFolderId(folderId);
  if (!safeFolderId) {
    throw new Error('ID folder Google Drive destinasi tidak sah.');
  }

  const cleanFileName = fileName.replace(/[\\/:*?"<>|]/g, '-').slice(0, 150);
  const metadata = {
    name: cleanFileName,
    parents: [safeFolderId],
    mimeType,
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', blob, cleanFileName);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,modifiedTime&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      cachedAccessToken = null;
      throw new Error(
        'Sesi akses Google Drive telah tamat. Sila klik "Sign in with Google" semula.'
      );
    }
    const errMsg =
      (data as { error?: { message?: string } })?.error?.message ||
      `Gagal memuat naik fail ke Google Drive (${res.status}).`;
    throw new Error(errMsg);
  }
  const uploaded = data as {
    id: string;
    name: string;
    mimeType?: string;
    webViewLink?: string;
    modifiedTime?: string;
  };
  return {
    id: uploaded.id,
    name: uploaded.name,
    mimeType: uploaded.mimeType || mimeType,
    webViewLink:
      uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
    modifiedTime: uploaded.modifiedTime,
  };
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildSopCompletionReportBlob(params: {
  collegeName: string;
  collegeAddress: string;
  traineeName: string;
  traineeIc: string;
  traineeCodeId: string;
  level: TopicLevel;
  cu: CUModule;
  subTitle: string;
  steps: { category: string; title: string; instruction: string; critical: boolean }[];
  checkedStepIds: string[];
}): Blob {
  const checkedSet = new Set(params.checkedStepIds);
  const nowStr = new Date().toLocaleString('ms-MY');
  const html = `<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8" />
  <title>Rekod Senarai Semak SOP Amali - ${escapeHtml(params.cu.code)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; margin: 28px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    th, td { border: 1px solid #111; padding: 7px 9px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    .header { border: 2px solid #111; padding: 14px; text-align: center; }
    .badge { font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <div style="font-size:16px;font-weight:bold;">${escapeHtml(params.collegeName)}</div>
    <div style="font-size:11px;white-space:pre-line;margin-top:4px;">${escapeHtml(params.collegeAddress)}</div>
    <div style="font-size:14px;font-weight:bold;margin-top:8px;border-top:1px solid #111;padding-top:8px;">
      REKOD SEMAKAN SOP BENGKEL AMALI
    </div>
  </div>
  <table>
    <tr><th>Nama Pelatih</th><td>${escapeHtml(params.traineeName)}</td><th>No. Kad Pengenalan</th><td>${escapeHtml(params.traineeIc || '-')}</td></tr>
    <tr><th>ID Pelatih</th><td>${escapeHtml(params.traineeCodeId)}</td><th>Tarikh Dijana</th><td>${escapeHtml(nowStr)}</td></tr>
    <tr><th>Tahap / CU</th><td>${escapeHtml(params.level.code)} · ${escapeHtml(params.cu.code)}</td><th>Sub Bahagian</th><td>${escapeHtml(params.subTitle)}</td></tr>
    <tr><th>Status Semakan</th><td colspan="3"><strong>${params.checkedStepIds.length} / ${params.steps.length} Langkah Disahkan</strong></td></tr>
  </table>
  <table>
    <thead>
      <tr><th style="width:40px;">Bil</th><th style="width:110px;">Kategori</th><th>Langkah &amp; Arahan Kerja</th><th style="width:90px;">Status</th></tr>
    </thead>
    <tbody>
      ${params.steps
        .map((s, idx) => {
          const done = checkedSet.has((s as { id?: string }).id || '');
          return `<tr>
            <td>${idx + 1}</td>
            <td><strong>${escapeHtml(s.category)}</strong>${s.critical ? ' (KRITIKAL)' : ''}</td>
            <td><strong>${escapeHtml(s.title)}</strong><br/>${escapeHtml(s.instruction)}</td>
            <td class="badge">${done ? '✓ SELESAI' : 'BELUM'}</td>
          </tr>`;
        })
        .join('')}
    </tbody>
  </table>
</body>
</html>`;
  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

export function buildTrainingSummaryReportBlob(params: {
  collegeName: string;
  collegeAddress: string;
  traineeName: string;
  traineeIc: string;
  traineeCodeId: string;
  levels: TopicLevel[];
  cus: CUModule[];
  papers: TugasanPaper[];
  submissions: TugasanSubmission[];
  sopProgress: SopCheckProgress[];
  accessLogs: AccessLogEntry[];
}): Blob {
  const nowStr = new Date().toLocaleString('ms-MY');
  const cuMap = new Map(params.cus.map((c) => [c.id, c]));
  const paperMap = new Map(params.papers.map((p) => [p.id, p]));
  const levelMap = new Map(params.levels.map((l) => [l.id, l]));

  const html = `<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8" />
  <title>Rekod Latihan Lengkap - ${escapeHtml(params.traineeIc || params.traineeCodeId)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; margin: 28px; font-size: 12px; }
    h2 { font-size: 14px; margin-top: 20px; border-bottom: 2px solid #111; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #111; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    .header { border: 2px solid #111; padding: 14px; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div style="font-size:16px;font-weight:bold;">${escapeHtml(params.collegeName)}</div>
    <div style="font-size:11px;white-space:pre-line;margin-top:4px;">${escapeHtml(params.collegeAddress)}</div>
    <div style="font-size:14px;font-weight:bold;margin-top:8px;border-top:1px solid #111;padding-top:8px;">
      REKOD LATIHAN, PENILAIAN TUGASAN AI &amp; KEMAJUAN AMALI PELATIH
    </div>
  </div>

  <table>
    <tr><th>Nama Pelatih</th><td>${escapeHtml(params.traineeName)}</td><th>No. Kad Pengenalan (MyKad)</th><td>${escapeHtml(params.traineeIc || '-')}</td></tr>
    <tr><th>ID Pelatih</th><td>${escapeHtml(params.traineeCodeId)}</td><th>Tarikh Rekod Dijana</th><td>${escapeHtml(nowStr)}</td></tr>
  </table>

  <h2>1. Rekod Penilaian Kertas Tugasan (Semakan AI)</h2>
  <table>
    <thead>
      <tr><th>Tarikh</th><th>CU / Kod Kertas</th><th>Tajuk Kertas</th><th>Markah</th><th>Status</th></tr>
    </thead>
    <tbody>
      ${
        params.submissions.length === 0
          ? '<tr><td colspan="5">Belum ada rekod penghantaran Kertas Tugasan.</td></tr>'
          : params.submissions
              .map((sub) => {
                const paper = paperMap.get(sub.templateId);
                const cu = cuMap.get(sub.cuId);
                return `<tr>
                  <td>${escapeHtml(new Date(sub.submittedAt).toLocaleString('ms-MY'))}</td>
                  <td>${escapeHtml(cu?.code || '-')} · ${escapeHtml(paper?.paperCode || sub.templateId)}</td>
                  <td>${escapeHtml(paper?.title || '-')}</td>
                  <td>${sub.totalScore}/${sub.maxTotalScore} (${sub.percentage}%)</td>
                  <td><strong>${sub.passed ? 'LULUS' : 'BELUM LULUS'}</strong></td>
                </tr>`;
              })
              .join('')
      }
    </tbody>
  </table>

  <h2>2. Rekod Kemajuan Senarai Semak SOP Amali</h2>
  <table>
    <thead>
      <tr><th>Tahap &amp; CU</th><th>Sub Bahagian</th><th>Bilangan Langkah Disahkan</th><th>Kemaskini Terakhir</th></tr>
    </thead>
    <tbody>
      ${
        params.sopProgress.length === 0
          ? '<tr><td colspan="4">Belum ada rekod semakan SOP Amali.</td></tr>'
          : params.sopProgress
              .map((prog) => {
                const cu = cuMap.get(prog.cuId);
                const lvl = cu ? levelMap.get(cu.levelId) : undefined;
                const totalSteps =
                  prog.subKey === 'sub1'
                    ? cu?.amaliSub1.sopSteps.length || 0
                    : cu?.amaliSub2.sopSteps.length || 0;
                return `<tr>
                  <td>${escapeHtml(lvl?.code || '-')} · ${escapeHtml(cu?.code || '-')} ${escapeHtml(cu?.title || '')}</td>
                  <td>${prog.subKey === 'sub1' ? 'Sub 1' : 'Sub 2'}</td>
                  <td>${prog.checkedStepIds.length} / ${totalSteps}</td>
                  <td>${escapeHtml(new Date(prog.updatedAt).toLocaleString('ms-MY'))}</td>
                </tr>`;
              })
              .join('')
      }
    </tbody>
  </table>

  <h2>3. Log Aktiviti Latihan Terkini</h2>
  <table>
    <thead>
      <tr><th>Masa</th><th>Unit Kompetensi</th><th>Aktiviti</th></tr>
    </thead>
    <tbody>
      ${
        params.accessLogs.length === 0
          ? '<tr><td colspan="3">Tiada log aktiviti direkodkan.</td></tr>'
          : params.accessLogs
              .slice(-40)
              .reverse()
              .map(
                (log) => `<tr>
                  <td>${escapeHtml(new Date(log.timestamp).toLocaleString('ms-MY'))}</td>
                  <td>${escapeHtml(log.cuCode)} · ${escapeHtml(log.cuTitle)}</td>
                  <td>${escapeHtml(log.action)}</td>
                </tr>`
              )
              .join('')
      }
    </tbody>
  </table>
</body>
</html>`;
  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

export interface DriveRegistrySyncResult {
  adminFolderId: string;
  adminFolderUrl: string;
  htmlFileUrl: string;
  jsonFileUrl: string;
  systemRegistryUrl?: string;
  changeLogUrl?: string;
  totalUsers: number;
  supervisorFolderCount: number;
  traineeFolderCount: number;
  permissionsAppliedCount: number;
}

export async function readSystemRegistryFromDrive(
  accessToken: string,
  rootFolderId: string
): Promise<{ fileId: string; payload: DriveSystemRegistryPayload } | null> {
  const safeRoot = extractDriveFolderId(rootFolderId);
  if (!safeRoot) return null;
  const q = `'${escapeDriveQueryString(safeRoot)}' in parents and name = '${escapeDriveQueryString(
    SYSTEM_REGISTRY_FILENAME
  )}' and trashed = false`;
  const listUrl =
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}` +
    `&fields=files(id,name,modifiedTime)&pageSize=3&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const listed = await driveJsonRequest<{
    files?: Array<{ id: string; name: string }>;
  }>(accessToken, listUrl);
  const hit = listed.files?.[0];
  if (!hit) return null;

  try {
    const bytes = await downloadDriveFileBytes(accessToken, hit.id);
    const text = new TextDecoder('utf-8').decode(bytes);
    const parsed = JSON.parse(text) as DriveSystemRegistryPayload;
    if (!parsed || !Array.isArray(parsed.users)) return null;
    return { fileId: hit.id, payload: parsed };
  } catch {
    return null;
  }
}

export async function syncSystemRegistryAndPermissionsToDrive(
  accessToken: string,
  rootFolderId: string,
  registryPayload: DriveSystemRegistryPayload,
  options?: { syncPermissions?: boolean }
): Promise<DriveRegistrySyncResult> {
  const adminFolder = await findOrCreateSubfolder(
    accessToken,
    rootFolderId,
    'ADMIN',
    'Folder Pentadbiran Utama, Senarai Akses Pengguna & Arkib Pengajar/Pelatih SIRKING'
  );

  const nowLocal = new Date().toLocaleString('ms-MY');
  const records: DriveRegistryUserRecord[] = registryPayload.users || [];
  const approvedCount = registryPayload.summary.approved;
  const pendingCount = registryPayload.summary.pending;
  const rejectedCount = registryPayload.summary.rejected;

  // 1. Centralized _SYSTEM_ACCESS_REGISTRY.json in Root Folder (Strict public fields ONLY)
  const systemRegistryFile = await upsertDriveFileInFolder(
    accessToken,
    rootFolderId,
    SYSTEM_REGISTRY_FILENAME,
    'application/json',
    new Blob([JSON.stringify(registryPayload, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
  );

  // 2. HTML + JSON Senarai Akses Pengguna inside ADMIN/
  const html = `<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8" />
  <title>Senarai Akses &amp; Pengguna Berdaftar - ${escapeHtml(registryPayload.collegeName)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; margin: 28px; font-size: 12px; }
    .header { border: 2px solid #111; padding: 14px; margin-bottom: 16px; }
    .stats { display: flex; flex-wrap: wrap; gap: 18px; margin-top: 8px; font-weight: bold; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #334155; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #e2e8f0; font-weight: bold; }
    .approved { color: #047857; font-weight: bold; }
    .pending { color: #b45309; font-weight: bold; }
    .rejected { color: #b91c1c; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <div style="font-size:16px;font-weight:bold;">${escapeHtml(registryPayload.collegeName)}</div>
    <div style="font-size:14px;font-weight:bold;margin-top:4px;">SENARAI AKSES 4 PERINGKAT &amp; PENGGUNA BERDAFTAR (PENYEGERAKAN DUA HALA)</div>
    <div style="font-size:11px;color:#475569;margin-top:4px;">Kemaskini Terakhir: ${escapeHtml(nowLocal)} · Peringkat: MASTER_ADMIN | ADMIN | PENGAJAR | PELATIH</div>
    <div class="stats">
      <span>Jumlah Pengguna: ${records.length}</span>
      <span class="approved">Diluluskan: ${approvedCount}</span>
      <span class="pending">Menunggu (Pending): ${pendingCount}</span>
      <span class="rejected">Ditolak: ${rejectedCount}</span>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Bil</th>
        <th>ID Pengguna</th>
        <th>Nama Penuh</th>
        <th>No. KP</th>
        <th>Emel Google</th>
        <th>Peringkat Akses</th>
        <th>Status Akses</th>
        <th>Pengajar Penyelia</th>
        <th>Tahap Diluluskan / Dipohon</th>
        <th>Kemaskini</th>
      </tr>
    </thead>
    <tbody>
      ${records
        .map(
          (u, idx) => `<tr>
            <td>${idx + 1}</td>
            <td><code>${escapeHtml(u.userId)}</code></td>
            <td><strong>${escapeHtml(u.name)}</strong></td>
            <td><code>${escapeHtml(u.icNumber)}</code></td>
            <td><code>${escapeHtml(u.email || '-')}</code></td>
            <td><strong>${escapeHtml(u.accessTier)}</strong></td>
            <td class="${escapeHtml(u.status)}">${escapeHtml(u.status.toUpperCase())}</td>
            <td>${escapeHtml(u.supervisorName)}</td>
            <td>${escapeHtml(u.approvedLevelLabel !== '-' ? u.approvedLevelLabel : u.requestedLevelLabel)}</td>
            <td>${escapeHtml(new Date(u.updatedAt).toLocaleString('ms-MY'))}</td>
          </tr>`
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>`;

  const htmlFile = await upsertDriveFileInFolder(
    accessToken,
    adminFolder.id,
    'Senarai_Akses_Pengguna.html',
    'text/html',
    new Blob([html], { type: 'text/html;charset=utf-8' })
  );
  const jsonFile = await upsertDriveFileInFolder(
    accessToken,
    adminFolder.id,
    'Senarai_Akses_Pengguna.json',
    'application/json',
    new Blob([JSON.stringify(registryPayload, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
  );

  // 3. Audit & Change Logs inside ADMIN/
  const logsHtml = `<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8" />
  <title>Log Perubahan &amp; Penambahbaikan Sistem - ${escapeHtml(registryPayload.collegeName)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; margin: 28px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #334155; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #e2e8f0; }
  </style>
</head>
<body>
  <h2>LOG PERUBAHAN &amp; PENAMBAHBAIKAN DATA PENGGUNA — ${escapeHtml(registryPayload.collegeName)}</h2>
  <div>Dijana: ${escapeHtml(nowLocal)}</div>
  <table>
    <thead>
      <tr><th>Masa</th><th>Pelaksana</th><th>Tindakan</th><th>Sasaran</th><th>Butiran</th></tr>
    </thead>
    <tbody>
      ${(registryPayload.changeLogs || [])
        .slice()
        .reverse()
        .map(
          (l) => `<tr>
            <td>${escapeHtml(new Date(l.timestamp).toLocaleString('ms-MY'))}</td>
            <td>${escapeHtml(l.actorName)} (${escapeHtml(l.actorRole.toUpperCase())})</td>
            <td><code>${escapeHtml(l.action)}</code></td>
            <td>${escapeHtml(l.targetName || l.targetUserId || '-')}</td>
            <td>${escapeHtml(l.details)}</td>
          </tr>`
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>`;

  await upsertDriveFileInFolder(
    accessToken,
    adminFolder.id,
    'LOG_PERUBAHAN_SISTEM.json',
    'application/json',
    new Blob(
      [
        JSON.stringify(
          { updatedAt: registryPayload.updatedAt, changeLogs: registryPayload.changeLogs || [] },
          null,
          2
        ),
      ],
      { type: 'application/json;charset=utf-8' }
    )
  );
  const changeLogHtmlFile = await upsertDriveFileInFolder(
    accessToken,
    adminFolder.id,
    'LOG_PERUBAHAN_SISTEM.html',
    'text/html',
    new Blob([logsHtml], { type: 'text/html;charset=utf-8' })
  );

  // 4. Maintain ADMIN / [Nama Pengajar] / [No. KP Pelatih] / REKOD_DILULUSKAN & Permissions API
  const supervisorCache = new Map<string, DriveFolderResult>();
  const ensureSupervisorFolder = async (supNameRaw: string): Promise<DriveFolderResult> => {
    const key = sanitizeFolderName(supNameRaw || 'PENTADBIR UTAMA', 'PENTADBIR UTAMA');
    const cached = supervisorCache.get(key.toLowerCase());
    if (cached) return cached;
    const created = await findOrCreateSubfolder(
      accessToken,
      adminFolder.id,
      key,
      `Folder Pengajar & Senarai Pelatih: ${key}`
    );
    supervisorCache.set(key.toLowerCase(), created);
    return created;
  };

  for (const pengajar of records.filter(
    (u) => u.role === 'pengajar' && (u.status === 'approved' || u.status === 'pending')
  )) {
    await ensureSupervisorFolder(pengajar.name);
  }

  let traineeFolderCount = 0;
  let permissionsAppliedCount = 0;
  const syncPerms = options?.syncPermissions !== false;

  for (const trainee of records.filter(
    (u) => u.role === 'pelatih' && (u.status === 'approved' || u.status === 'pending')
  )) {
    const supFolder = await ensureSupervisorFolder(trainee.supervisorName || 'PENTADBIR UTAMA');
    const traineeFolder = await findOrCreateTraineeIcFolder(
      accessToken,
      supFolder.id,
      trainee.icNumber === '-' ? '' : trainee.icNumber,
      trainee.userId,
      trainee.name
    );
    traineeFolderCount += 1;

    if (trainee.status === 'approved') {
      const approvedSub = await findOrCreateSubfolder(
        accessToken,
        traineeFolder.id,
        APPROVED_RECORDS_SUBFOLDER_NAME,
        `Rekod & Penilaian Diluluskan (${trainee.name})`
      );
      if (syncPerms) {
        const authEmails = computeAuthorizedEmailsForTrainee(trainee, records);
        if (authEmails.allAuthorizedEmails.length > 0) {
          const permRes = await applyDriveFolderAndFilePermissions(accessToken, approvedSub.id, {
            writerEmails: authEmails.writerEmails,
            readerEmails: authEmails.readerEmails,
            pruneUnauthorized: true,
          });
          permissionsAppliedCount += permRes.applied.length;
        }
      }
    }
  }

  return {
    adminFolderId: adminFolder.id,
    adminFolderUrl: adminFolder.webViewLink,
    htmlFileUrl: htmlFile.webViewLink,
    jsonFileUrl: jsonFile.webViewLink,
    systemRegistryUrl: systemRegistryFile.webViewLink,
    changeLogUrl: changeLogHtmlFile.webViewLink,
    totalUsers: records.length,
    supervisorFolderCount: supervisorCache.size,
    traineeFolderCount,
    permissionsAppliedCount,
  };
}

export async function syncFullUserRegistryToDrive(
  accessToken: string,
  rootFolderId: string,
  users: PublicUser[],
  levels: TopicLevel[],
  collegeName = 'PORTAL PEMBELAJARAN SIRKING'
): Promise<DriveRegistrySyncResult> {
  const levelMap = new Map(levels.map((l) => [l.id, `${l.code} (${l.title})`]));
  const records: DriveRegistryUserRecord[] = users.map((u) => ({
    id: u.id,
    userId: u.userId,
    name: u.name,
    icNumber: u.icNumber || '-',
    email: u.email || '',
    role: u.role,
    accessTier:
      u.role === 'master_admin'
        ? 'MASTER_ADMIN'
        : u.role === 'admin'
        ? 'ADMIN'
        : u.role === 'pengajar'
        ? 'PENGAJAR'
        : 'PELATIH',
    status: u.status,
    supervisorId: u.supervisorId,
    supervisorName: u.supervisorName || (u.role === 'pelatih' ? 'PENTADBIR UTAMA' : '-'),
    requestedLevelId: u.requestedLevelId,
    requestedLevelLabel: u.requestedLevelId ? levelMap.get(u.requestedLevelId) || u.requestedLevelId : '-',
    approvedLevelId: u.approvedLevelId,
    approvedLevelLabel: u.approvedLevelId ? levelMap.get(u.approvedLevelId) || u.approvedLevelId : '-',
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }));

  const payload: DriveSystemRegistryPayload = {
    version: 2,
    updatedAt: new Date().toISOString(),
    collegeName,
    driveRecordsFolderId: rootFolderId,
    roles: ['MASTER_ADMIN', 'ADMIN', 'PENGAJAR', 'PELATIH'],
    summary: {
      totalUsers: records.length,
      approved: records.filter((u) => u.status === 'approved').length,
      pending: records.filter((u) => u.status === 'pending').length,
      rejected: records.filter((u) => u.status === 'rejected').length,
    },
    users: records,
    changeLogs: [],
  };

  return syncSystemRegistryAndPermissionsToDrive(accessToken, rootFolderId, payload, {
    syncPermissions: true,
  });
}

export interface TwoWayDriveSyncResult {
  syncResult: DriveRegistrySyncResult;
  reconciledCount: number;
  latestPayload: DriveSystemRegistryPayload;
}

export async function performTwoWayDriveSync(
  accessToken: string,
  rootFolderId: string,
  handlers: {
    onReconcile: (remoteRegistry: DriveSystemRegistryPayload) => Promise<{
      updatedCount?: number;
      stats?: { updatedUsers?: number };
      registry: DriveSystemRegistryPayload;
    }>;
    onFetchLatest: () => Promise<
      DriveSystemRegistryPayload | { registry: DriveSystemRegistryPayload }
    >;
    syncPermissions?: boolean;
  }
): Promise<TwoWayDriveSyncResult> {
  const safeRoot = extractDriveFolderId(rootFolderId) || '168i3Rpp8PGlGGa-4yNPTtJVCBgiDUc36';
  let reconciledCount = 0;

  const remote = await readSystemRegistryFromDrive(accessToken, safeRoot).catch(() => null);
  if (remote?.payload) {
    try {
      const rec = await handlers.onReconcile(remote.payload);
      reconciledCount = rec.updatedCount ?? rec.stats?.updatedUsers ?? 0;
    } catch {
      // Non-fatal reconcile failure falls through to server source of truth
    }
  }

  const fetched = await handlers.onFetchLatest();
  const latestPayload =
    'registry' in fetched && fetched.registry ? fetched.registry : (fetched as DriveSystemRegistryPayload);
  const syncResult = await syncSystemRegistryAndPermissionsToDrive(
    accessToken,
    safeRoot,
    latestPayload,
    { syncPermissions: handlers.syncPermissions !== false }
  );

  return {
    syncResult,
    reconciledCount,
    latestPayload,
  };
}


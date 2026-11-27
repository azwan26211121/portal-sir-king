import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  ADMIN_EMAIL,
  DEFAULT_BRANDING_TEXTS,
  DEFAULT_COLLEGE_NAME,
  DEFAULT_DRIVE_RECORDS_FOLDER_ID,
  DEFAULT_DRIVE_RECORDS_FOLDER_URL,
  DEFAULT_PAYMENT_QR_TITLE,
  DEFAULT_PORTAL_NAME,
  DEFAULT_PORTAL_TAGLINE,
  DEFAULT_SUB_TITLES,
  DEFAULT_WHATSAPP_QR_TITLE,
  UPLOADS_DIR,
  buildDriveSystemRegistryPayload,
  hashSecret,
  hashToken,
  loadStore,
  reconcileDriveSystemRegistry,
  recordSystemChangeLog,
  saveStore,
  toPublicBranding,
  toPublicUser,
  verifyPlainEnvSecret,
  verifySecret,
} from './server/store.ts';
import type { StoredUser } from './server/store.ts';
import {
  extractQuestionsFromPdfBuffer,
  gradeTugasanWithAI,
} from './server/aiGrader.ts';
import { createDefaultTugasanForCustomCu } from './server/tugasanBank.ts';
import type {
  AccessLogEntry,
  ApprovalStatus,
  CUModule,
  EbookNoteModule,
  FileMetadata,
  FileSlotType,
  SopCategory,
  SopStep,
  SubKey,
  TugasanPaper,
  TugasanQuestion,
  TugasanSubmission,
  UserRole,
} from './src/types.ts';

dotenv.config();

const PORT = 3000;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

interface AuthenticatedRequest extends Request {
  authUser?: StoredUser;
  authTokenHash?: string;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

const VALID_SLOT_TYPES: FileSlotType[] = [
  'teori_sub1_nota',
  'teori_sub1_panduan',
  'teori_sub2_nota',
  'teori_sub2_panduan',
  'amali_sub1_sop',
  'amali_sub2_sop',
];

function isValidSlotType(value: string): value is FileSlotType {
  return VALID_SLOT_TYPES.includes(value as FileSlotType);
}

function getSlotFile(cu: CUModule, slotType: FileSlotType): FileMetadata | null {
  switch (slotType) {
    case 'teori_sub1_nota':
      return cu.teoriSub1.notaSlot;
    case 'teori_sub1_panduan':
      return cu.teoriSub1.panduanSoalanSlot;
    case 'teori_sub2_nota':
      return cu.teoriSub2.notaSlot;
    case 'teori_sub2_panduan':
      return cu.teoriSub2.panduanSoalanSlot;
    case 'amali_sub1_sop':
      return cu.amaliSub1.sopDocSlot;
    case 'amali_sub2_sop':
      return cu.amaliSub2.sopDocSlot;
  }
}

function setSlotFile(cu: CUModule, slotType: FileSlotType, meta: FileMetadata | null): void {
  switch (slotType) {
    case 'teori_sub1_nota':
      cu.teoriSub1.notaSlot = meta;
      break;
    case 'teori_sub1_panduan':
      cu.teoriSub1.panduanSoalanSlot = meta;
      break;
    case 'teori_sub2_nota':
      cu.teoriSub2.notaSlot = meta;
      break;
    case 'teori_sub2_panduan':
      cu.teoriSub2.panduanSoalanSlot = meta;
      break;
    case 'amali_sub1_sop':
      cu.amaliSub1.sopDocSlot = meta;
      break;
    case 'amali_sub2_sop':
      cu.amaliSub2.sopDocSlot = meta;
      break;
  }
}

function getAllCuFiles(cu: CUModule): (FileMetadata | null)[] {
  return [
    cu.teoriSub1.notaSlot,
    cu.teoriSub1.panduanSoalanSlot,
    cu.teoriSub2.notaSlot,
    cu.teoriSub2.panduanSoalanSlot,
    cu.amaliSub1.sopDocSlot,
    cu.amaliSub2.sopDocSlot,
    ...(cu.ebookModules || []).map((m) => m.file),
  ];
}

function isValidSixDigitPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{6}$/.test(pin);
}

function isValidUserId(val: unknown): val is string {
  return typeof val === 'string' && /^[a-zA-Z0-9._-]{3,32}$/.test(val.trim());
}

function isAdminEnvPasswordConfigured(): boolean {
  const envPass = process.env.ADMIN_PASSWORD;
  return typeof envPass === 'string' && envPass.trim().length > 0;
}

function validateSafeHttpsUrl(rawUrl: string): { ok: true; normalized: string } | { ok: false; error: string } {
  const trimmed = rawUrl.trim();
  if (trimmed === '') {
    return { ok: true, normalized: '' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'Pautan URL tidak sah.' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'Hanya pautan HTTPS yang disokong.' };
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '169.254.169.254' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return { ok: false, error: 'Alamat rangkaian dalaman tidak dibenarkan.' };
  }
  return { ok: true, normalized: parsed.toString() };
}

function validateOptionalEmail(
  raw: unknown
): { ok: true; email: string } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, email: '' };
  }
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Format emel tidak sah.' };
  }
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return { ok: true, email: '' };
  }
  if (trimmed.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: 'Sila masukkan alamat emel Google yang sah (contoh: nama@gmail.com).' };
  }
  return { ok: true, email: trimmed };
}

function detectAllowedDocType(
  originalName: string,
  buffer: Buffer
): { ok: true; extension: '.pdf' | '.doc' | '.docx'; mimeType: string } | { ok: false; error: string } {
  const ext = path.extname(originalName).toLowerCase();
  if (ext !== '.pdf' && ext !== '.doc' && ext !== '.docx') {
    return { ok: false, error: 'Hanya fail format PDF (.pdf) atau Word (.doc, .docx) dibenarkan.' };
  }
  if (buffer.length < 8) {
    return { ok: false, error: 'Fail kosong atau rosak.' };
  }
  if (ext === '.pdf') {
    const isPdf = buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    if (!isPdf) {
      return { ok: false, error: 'Kandungan fail tidak sepadan dengan format PDF yang sah.' };
    }
    return { ok: true, extension: '.pdf', mimeType: 'application/pdf' };
  }
  if (ext === '.docx') {
    const isZip =
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04;
    if (!isZip) {
      return { ok: false, error: 'Kandungan fail tidak sepadan dengan format DOCX yang sah.' };
    }
    return {
      ok: true,
      extension: '.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }
  const isOle2 =
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0;
  if (!isOle2) {
    return { ok: false, error: 'Kandungan fail tidak sepadan dengan format DOC yang sah.' };
  }
  return { ok: true, extension: '.doc', mimeType: 'application/msword' };
}

function safeResolveUploadPath(storedName: string): string | null {
  if (!/^[a-zA-Z0-9_-]+\.(pdf|doc|docx)$/.test(storedName)) {
    return null;
  }
  const resolved = path.resolve(UPLOADS_DIR, storedName);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) {
    return null;
  }
  return resolved;
}

function detectAllowedImageType(
  originalName: string,
  buffer: Buffer
): { ok: true; extension: '.png' | '.jpg' | '.jpeg' | '.webp'; mimeType: string } | { ok: false; error: string } {
  const ext = path.extname(originalName).toLowerCase();
  if (ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg' && ext !== '.webp') {
    return { ok: false, error: 'Hanya fail imej format PNG, JPG/JPEG atau WEBP dibenarkan.' };
  }
  if (buffer.length < 12) {
    return { ok: false, error: 'Fail imej kosong atau rosak.' };
  }
  if (ext === '.png') {
    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;
    if (!isPng) {
      return { ok: false, error: 'Kandungan fail tidak sepadan dengan format PNG yang sah.' };
    }
    return { ok: true, extension: '.png', mimeType: 'image/png' };
  }
  if (ext === '.webp') {
    const isWebp =
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!isWebp) {
      return { ok: false, error: 'Kandungan fail tidak sepadan dengan format WEBP yang sah.' };
    }
    return { ok: true, extension: '.webp', mimeType: 'image/webp' };
  }
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (!isJpeg) {
    return { ok: false, error: 'Kandungan fail tidak sepadan dengan format JPG/JPEG yang sah.' };
  }
  return { ok: true, extension: ext === '.jpeg' ? '.jpeg' : '.jpg', mimeType: 'image/jpeg' };
}

function safeResolveImagePath(storedName: string | null): string | null {
  if (!storedName || !/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(storedName)) {
    return null;
  }
  const resolved = path.resolve(UPLOADS_DIR, storedName);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) {
    return null;
  }
  return resolved;
}

function safeDeleteImage(storedName: string | null): void {
  const target = safeResolveImagePath(storedName);
  if (target && fs.existsSync(target)) {
    try {
      fs.unlinkSync(target);
    } catch {
      // Ignore cleanup errors
    }
  }
}

function safeDeleteUpload(meta: FileMetadata | null): void {
  if (!meta) return;
  const target = safeResolveUploadPath(meta.storedName);
  if (target && fs.existsSync(target)) {
    try {
      fs.unlinkSync(target);
    } catch {
      // Ignore cleanup errors
    }
  }
}

function createSessionToken(userId: string): string {
  const store = loadStore();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  store.sessions.push({
    tokenHash,
    userId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  if (store.sessions.length > 100) {
    store.sessions = store.sessions.slice(-100);
  }
  saveStore(store);
  return rawToken;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sesi log masuk diperlukan.' });
    return;
  }
  const rawToken = header.slice('Bearer '.length).trim();
  if (!rawToken) {
    res.status(401).json({ error: 'Token sesi tidak sah.' });
    return;
  }
  const tokenHash = hashToken(rawToken);
  const store = loadStore();
  const session = store.sessions.find((s) => s.tokenHash === tokenHash && s.expiresAt > Date.now());
  if (!session) {
    res.status(401).json({ error: 'Sesi telah tamat tempoh. Sila log masuk semula.' });
    return;
  }
  const user = store.users.find((u) => u.id === session.userId);
  if (!user) {
    res.status(401).json({ error: 'Akaun pengguna tidak dijumpai.' });
    return;
  }
  req.authUser = user;
  req.authTokenHash = tokenHash;
  next();
}

function requireApproved(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Pengesahan diperlukan.' });
    return;
  }
  if (req.authUser.status !== 'approved') {
    res.status(403).json({ error: 'Akaun anda masih menunggu kelulusan pengajar atau pentadbir.' });
    return;
  }
  next();
}

function requireRole(roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      res.status(403).json({ error: 'Anda tidak mempunyai kebenaran untuk tindakan ini.' });
      return;
    }
    next();
  };
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // --- Auth & Public Info Routes ---

  app.get('/api/auth/status', (_req: Request, res: Response) => {
    const store = loadStore();
    const adminConfigured = isAdminEnvPasswordConfigured() || Boolean(store.adminPasswordHash);
    res.json({
      adminConfigured,
    });
  });

  app.get('/api/auth/public-info', (_req: Request, res: Response) => {
    const store = loadStore();
    const teachers = store.users
      .filter((u) => u.role === 'pengajar' && u.status === 'approved')
      .map((u) => ({ id: u.id, name: u.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const levels = [...store.levels].sort((a, b) => a.order - b.order);
    res.json({ teachers, levels });
  });

  // --- Portal Branding (Logo, Banner, Portal Name & Tagline) ---

  app.get('/api/branding', (_req: Request, res: Response) => {
    const store = loadStore();
    res.json({ branding: toPublicBranding(store) });
  });

  app.get('/api/branding/:kind', (req: Request, res: Response) => {
    const { kind } = req.params;
    if (
      kind !== 'logo' &&
      kind !== 'banner' &&
      kind !== 'payment-qr' &&
      kind !== 'whatsapp-qr'
    ) {
      res.status(404).json({ error: 'Aset penjenamaan tidak dijumpai.' });
      return;
    }
    const store = loadStore();
    const storedName =
      kind === 'logo'
        ? store.branding.customLogoStoredName
        : kind === 'banner'
        ? store.branding.customBannerStoredName
        : kind === 'payment-qr'
        ? store.branding.paymentQrStoredName
        : store.branding.whatsappQrStoredName;
    const mimeType =
      kind === 'logo'
        ? store.branding.customLogoMimeType
        : kind === 'banner'
        ? store.branding.customBannerMimeType
        : kind === 'payment-qr'
        ? store.branding.paymentQrMimeType
        : store.branding.whatsappQrMimeType;
    const resolvedPath = safeResolveImagePath(storedName);
    if (!resolvedPath || !mimeType || !fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: 'Imej aset belum ditetapkan.' });
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=300');
    fs.createReadStream(resolvedPath).pipe(res);
  });

  app.patch(
    '/api/branding',
    requireAuth,
    requireApproved,
    requireRole(['admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const body = req.body as Record<string, unknown>;
      const store = loadStore();
      if (typeof body.whatsappUrl === 'string') {
        const checked = validateSafeHttpsUrl(body.whatsappUrl);
        if (!checked.ok) {
          res.status(400).json({ error: `Pautan WhatsApp: ${checked.error}` });
          return;
        }
        store.branding.whatsappUrl = checked.normalized;
      }
      if (typeof body.portalName === 'string') {
        store.branding.portalName = body.portalName.trim().slice(0, 80) || DEFAULT_PORTAL_NAME;
      }
      if (typeof body.portalTagline === 'string') {
        store.branding.portalTagline =
          body.portalTagline.trim().slice(0, 140) || DEFAULT_PORTAL_TAGLINE;
      }
      if (typeof body.heroHeadline === 'string') {
        store.branding.heroHeadline =
          body.heroHeadline.trim().slice(0, 180) || DEFAULT_BRANDING_TEXTS.heroHeadline;
      }
      if (typeof body.feature1Title === 'string') {
        store.branding.feature1Title =
          body.feature1Title.trim().slice(0, 80) || DEFAULT_BRANDING_TEXTS.feature1Title;
      }
      if (typeof body.feature1Desc === 'string') {
        store.branding.feature1Desc =
          body.feature1Desc.trim().slice(0, 260) || DEFAULT_BRANDING_TEXTS.feature1Desc;
      }
      if (typeof body.feature2Title === 'string') {
        store.branding.feature2Title =
          body.feature2Title.trim().slice(0, 80) || DEFAULT_BRANDING_TEXTS.feature2Title;
      }
      if (typeof body.feature2Desc === 'string') {
        store.branding.feature2Desc =
          body.feature2Desc.trim().slice(0, 260) || DEFAULT_BRANDING_TEXTS.feature2Desc;
      }
      if (typeof body.feature3Title === 'string') {
        store.branding.feature3Title =
          body.feature3Title.trim().slice(0, 80) || DEFAULT_BRANDING_TEXTS.feature3Title;
      }
      if (typeof body.feature3Desc === 'string') {
        store.branding.feature3Desc =
          body.feature3Desc.trim().slice(0, 260) || DEFAULT_BRANDING_TEXTS.feature3Desc;
      }
      if (typeof body.authGateTitle === 'string') {
        store.branding.authGateTitle =
          body.authGateTitle.trim().slice(0, 80) || DEFAULT_BRANDING_TEXTS.authGateTitle;
      }
      if (typeof body.authGateSubtitle === 'string') {
        store.branding.authGateSubtitle =
          body.authGateSubtitle.trim().slice(0, 220) || DEFAULT_BRANDING_TEXTS.authGateSubtitle;
      }
      if (typeof body.welcomePrefix === 'string') {
        store.branding.welcomePrefix =
          body.welcomePrefix.trim().slice(0, 60) || DEFAULT_BRANDING_TEXTS.welcomePrefix;
      }
      if (typeof body.footerCaption === 'string') {
        store.branding.footerCaption =
          body.footerCaption.trim().slice(0, 160) || DEFAULT_BRANDING_TEXTS.footerCaption;
      }
      if (typeof body.pendingTitle === 'string') {
        store.branding.pendingTitle =
          body.pendingTitle.trim().slice(0, 100) || DEFAULT_BRANDING_TEXTS.pendingTitle;
      }
      if (typeof body.pendingMessage === 'string') {
        store.branding.pendingMessage =
          body.pendingMessage.trim().slice(0, 320) || DEFAULT_BRANDING_TEXTS.pendingMessage;
      }
      if (typeof body.paymentQrTitle === 'string') {
        store.branding.paymentQrTitle =
          body.paymentQrTitle.trim().slice(0, 80) || DEFAULT_PAYMENT_QR_TITLE;
      }
      if (typeof body.paymentQrNote === 'string') {
        store.branding.paymentQrNote = body.paymentQrNote.trim().slice(0, 160);
      }
      if (typeof body.whatsappQrTitle === 'string') {
        store.branding.whatsappQrTitle =
          body.whatsappQrTitle.trim().slice(0, 80) || DEFAULT_WHATSAPP_QR_TITLE;
      }
      if (typeof body.whatsappQrNote === 'string') {
        store.branding.whatsappQrNote = body.whatsappQrNote.trim().slice(0, 160);
      }
      if (typeof body.collegeName === 'string') {
        store.branding.collegeName =
          body.collegeName.trim().slice(0, 120) || DEFAULT_COLLEGE_NAME;
      }
      if (typeof body.collegeAddress === 'string') {
        store.branding.collegeAddress = body.collegeAddress.trim().slice(0, 300);
      }
      if (typeof body.driveRecordsFolderUrl === 'string') {
        const rawDrive = body.driveRecordsFolderUrl.trim();
        if (!rawDrive) {
          store.branding.driveRecordsFolderId = DEFAULT_DRIVE_RECORDS_FOLDER_ID;
          store.branding.driveRecordsFolderUrl = DEFAULT_DRIVE_RECORDS_FOLDER_URL;
        } else {
          let extractedId: string | null = null;
          if (/^[a-zA-Z0-9_-]{10,120}$/.test(rawDrive)) {
            extractedId = rawDrive;
          } else {
            try {
              const parsed = new URL(rawDrive);
              if (parsed.hostname.toLowerCase().endsWith('google.com')) {
                const folderMatch = parsed.pathname.match(/\/folders\/([a-zA-Z0-9_-]{10,120})/);
                const idParam = parsed.searchParams.get('id');
                if (folderMatch?.[1]) {
                  extractedId = folderMatch[1];
                } else if (idParam && /^[a-zA-Z0-9_-]{10,120}$/.test(idParam)) {
                  extractedId = idParam;
                }
              }
            } catch {
              // Invalid URL handled below
            }
          }
          if (!extractedId) {
            res.status(400).json({
              error:
                'Pautan atau ID folder Google Drive tidak sah. Gunakan pautan folder Google Drive rasmi atau ID folder.',
            });
            return;
          }
          store.branding.driveRecordsFolderId = extractedId;
          store.branding.driveRecordsFolderUrl = `https://drive.google.com/drive/folders/${extractedId}`;
        }
      }
      store.branding.updatedAt = new Date().toISOString();
      saveStore(store);
      res.json({ branding: toPublicBranding(store) });
    }
  );

  app.post(
    '/api/branding/:kind',
    requireAuth,
    requireApproved,
    requireRole(['admin', 'master_admin']),
    upload.single('file'),
    (req: AuthenticatedRequest, res: Response) => {
      const { kind } = req.params;
      if (
        kind !== 'logo' &&
        kind !== 'banner' &&
        kind !== 'payment-qr' &&
        kind !== 'whatsapp-qr'
      ) {
        res
          .status(400)
          .json({ error: 'Jenis imej mestilah logo, banner, payment-qr atau whatsapp-qr.' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'Sila pilih fail imej (PNG, JPG atau WEBP).' });
        return;
      }
      if (req.file.size > 8 * 1024 * 1024) {
        res.status(400).json({ error: 'Saiz imej melebihi had maksimum 8MB.' });
        return;
      }
      const detected = detectAllowedImageType(req.file.originalname, req.file.buffer);
      if (!detected.ok) {
        res.status(400).json({ error: detected.error });
        return;
      }
      const storedName = `branding-${kind}-${crypto.randomUUID()}${detected.extension}`;
      const targetPath = safeResolveImagePath(storedName);
      if (!targetPath) {
        res.status(400).json({ error: 'Nama fail tidak sah.' });
        return;
      }
      fs.writeFileSync(targetPath, req.file.buffer);

      const store = loadStore();
      if (kind === 'logo') {
        safeDeleteImage(store.branding.customLogoStoredName);
        store.branding.customLogoStoredName = storedName;
        store.branding.customLogoMimeType = detected.mimeType;
      } else if (kind === 'banner') {
        safeDeleteImage(store.branding.customBannerStoredName);
        store.branding.customBannerStoredName = storedName;
        store.branding.customBannerMimeType = detected.mimeType;
      } else if (kind === 'payment-qr') {
        safeDeleteImage(store.branding.paymentQrStoredName);
        store.branding.paymentQrStoredName = storedName;
        store.branding.paymentQrMimeType = detected.mimeType;
      } else {
        safeDeleteImage(store.branding.whatsappQrStoredName);
        store.branding.whatsappQrStoredName = storedName;
        store.branding.whatsappQrMimeType = detected.mimeType;
      }
      store.branding.updatedAt = new Date().toISOString();
      saveStore(store);
      res.json({ branding: toPublicBranding(store) });
    }
  );

  app.delete(
    '/api/branding/:kind',
    requireAuth,
    requireApproved,
    requireRole(['admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const { kind } = req.params;
      if (
        kind !== 'logo' &&
        kind !== 'banner' &&
        kind !== 'payment-qr' &&
        kind !== 'whatsapp-qr'
      ) {
        res
          .status(400)
          .json({ error: 'Jenis imej mestilah logo, banner, payment-qr atau whatsapp-qr.' });
        return;
      }
      const store = loadStore();
      if (kind === 'logo') {
        safeDeleteImage(store.branding.customLogoStoredName);
        store.branding.customLogoStoredName = null;
        store.branding.customLogoMimeType = null;
      } else if (kind === 'banner') {
        safeDeleteImage(store.branding.customBannerStoredName);
        store.branding.customBannerStoredName = null;
        store.branding.customBannerMimeType = null;
      } else if (kind === 'payment-qr') {
        safeDeleteImage(store.branding.paymentQrStoredName);
        store.branding.paymentQrStoredName = null;
        store.branding.paymentQrMimeType = null;
      } else {
        safeDeleteImage(store.branding.whatsappQrStoredName);
        store.branding.whatsappQrStoredName = null;
        store.branding.whatsappQrMimeType = null;
      }
      store.branding.updatedAt = new Date().toISOString();
      saveStore(store);
      res.json({ branding: toPublicBranding(store) });
    }
  );

  app.post('/api/auth/admin-claim', (req: Request, res: Response) => {
    const store = loadStore();
    if (isAdminEnvPasswordConfigured() || store.adminPasswordHash) {
      res.status(409).json({ error: 'Kata laluan admin telah ditetapkan sebelum ini.' });
      return;
    }
    const { email, password } = req.body as { email?: unknown; password?: unknown };
    if (typeof email !== 'string' || email.trim().toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      res.status(403).json({ error: 'Emel pentadbir utama tidak sepadan dengan rekod berdaftar.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Kata laluan mestilah sekurang-kurangnya 8 aksara.' });
      return;
    }
    store.adminPasswordHash = hashSecret(password);
    const masterAdminUser = store.users.find((u) => u.role === 'master_admin');
    saveStore(store);
    if (!masterAdminUser) {
      res.status(500).json({ error: 'Rekod Master Admin tidak dijumpai.' });
      return;
    }
    const token = createSessionToken(masterAdminUser.id);
    const refreshed = loadStore();
    res.json({
      token,
      user: toPublicUser(masterAdminUser, refreshed.users),
    });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const store = loadStore();
    const { role, email, password, userId, pin } = req.body as {
      role?: unknown;
      email?: unknown;
      password?: unknown;
      userId?: unknown;
      pin?: unknown;
    };

    if (role === 'master_admin' || role === 'admin') {
      const rawIdentifier =
        typeof email === 'string' && email.trim()
          ? email.trim()
          : typeof userId === 'string'
          ? userId.trim()
          : '';
      if (!rawIdentifier || typeof password !== 'string' || !password) {
        res.status(400).json({ error: 'ID pentadbir atau emel serta kata laluan diperlukan.' });
        return;
      }
      const normalizedIdentifier = rawIdentifier.toLowerCase();
      const masterUser = store.users.find((u) => u.role === 'master_admin');
      const matchesMaster =
        normalizedIdentifier === ADMIN_EMAIL.toLowerCase() ||
        (masterUser && masterUser.userId.trim().toLowerCase() === normalizedIdentifier);

      if (matchesMaster) {
        const envPass = process.env.ADMIN_PASSWORD;
        let valid = false;
        if (store.adminPasswordHash) {
          valid = verifySecret(password, store.adminPasswordHash);
        } else if (typeof envPass === 'string' && envPass.trim().length > 0) {
          valid = verifyPlainEnvSecret(password, envPass);
        } else {
          res.status(400).json({
            error:
              'Kata laluan pentadbir utama belum diaktifkan. Sila lengkapkan pengaktifan kali pertama.',
          });
          return;
        }
        if (!valid) {
          res.status(401).json({ error: 'ID, emel atau kata laluan pentadbir tidak sah.' });
          return;
        }
        if (!masterUser) {
          res.status(500).json({ error: 'Akaun Pentadbir Utama tidak dijumpai.' });
          return;
        }
        const token = createSessionToken(masterUser.id);
        res.json({ token, user: toPublicUser(masterUser, store.users) });
        return;
      }

      if (role === 'master_admin') {
        res.status(401).json({ error: 'ID, emel atau kata laluan pentadbir tidak sah.' });
        return;
      }

      const adminUser = store.users.find(
        (u) => u.role === 'admin' && u.userId.trim().toLowerCase() === normalizedIdentifier
      );
      if (!adminUser) {
        res.status(401).json({ error: 'ID, emel atau kata laluan pentadbir tidak sah.' });
        return;
      }
      if (!adminUser.passwordHash) {
        res.status(400).json({
          error: 'Kata laluan akaun Admin ini belum ditetapkan oleh Master Admin.',
        });
        return;
      }
      if (!verifySecret(password, adminUser.passwordHash)) {
        res.status(401).json({ error: 'ID, emel atau kata laluan pentadbir tidak sah.' });
        return;
      }
      const token = createSessionToken(adminUser.id);
      res.json({ token, user: toPublicUser(adminUser, store.users) });
      return;
    }

    if (role === 'pengajar' || role === 'pelatih') {
      if (typeof userId !== 'string' || !userId.trim() || !isValidSixDigitPin(pin)) {
        res.status(400).json({ error: 'User ID dan PIN akses 6 digit diperlukan.' });
        return;
      }
      const normalizedUserId = userId.trim().toLowerCase();
      const user = store.users.find(
        (u) => u.role === role && u.userId.trim().toLowerCase() === normalizedUserId
      );
      if (!user || !user.pinHash || !verifySecret(pin, user.pinHash)) {
        res.status(401).json({
          error:
            'User ID atau PIN akses 6 digit tidak tepat. Jika belum mempunyai akaun, sila daftar di tab Daftar Baru.',
        });
        return;
      }
      const token = createSessionToken(user.id);
      res.json({ token, user: toPublicUser(user, store.users) });
      return;
    }

    res.status(400).json({ error: 'Peranan log masuk tidak sah.' });
  });

  app.post('/api/auth/register', (req: Request, res: Response) => {
    const store = loadStore();
    const { role, userId, name, icNumber, email, pin, supervisorId, requestedLevelId } = req.body as {
      role?: unknown;
      userId?: unknown;
      name?: unknown;
      icNumber?: unknown;
      email?: unknown;
      pin?: unknown;
      supervisorId?: unknown;
      requestedLevelId?: unknown;
    };

    if (role !== 'pelatih' && role !== 'pengajar') {
      res.status(400).json({ error: 'Pendaftaran hanya dibuka untuk Pelatih atau Pengajar.' });
      return;
    }
    if (!isValidUserId(userId)) {
      res.status(400).json({
        error: 'User ID mestilah 3 hingga 32 aksara (huruf, nombor, titik, garis bawah atau sengkang sahaja).',
      });
      return;
    }
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      res.status(400).json({ error: 'Nama penuh mestilah antara 2 hingga 80 aksara.' });
      return;
    }
    const emailCheck = validateOptionalEmail(email);
    if (!emailCheck.ok) {
      res.status(400).json({ error: emailCheck.error });
      return;
    }
    if (!isValidSixDigitPin(pin)) {
      res.status(400).json({ error: 'PIN akses mestilah tepat 6 digit nombor.' });
      return;
    }
    const cleanUserId = userId.trim();
    const cleanName = name.trim();
    const cleanIcNumber =
      typeof icNumber === 'string' ? icNumber.trim().slice(0, 20) : '';
    const duplicateUserId = store.users.find(
      (u) => u.userId.trim().toLowerCase() === cleanUserId.toLowerCase()
    );
    if (duplicateUserId) {
      res.status(409).json({
        error: `User ID "${cleanUserId}" telah digunakan. Sila pilih User ID lain atau log masuk.`,
      });
      return;
    }

    const now = new Date().toISOString();
    if (role === 'pengajar') {
      const newTeacher: StoredUser = {
        id: `usr-${crypto.randomUUID().slice(0, 8)}`,
        userId: cleanUserId,
        name: cleanName,
        icNumber: cleanIcNumber,
        email: emailCheck.email,
        role: 'pengajar',
        status: 'approved',
        pinHash: hashSecret(pin),
        supervisorId: null,
        requestedLevelId: null,
        approvedLevelId: null,
        createdAt: now,
        updatedAt: now,
      };
      store.users.push(newTeacher);
      recordSystemChangeLog(store, {
        actorId: newTeacher.id,
        actorName: newTeacher.name,
        actorRole: 'pengajar',
        action: 'register_pengajar',
        targetUserId: newTeacher.userId,
        targetName: newTeacher.name,
        details: `Pendaftaran Pengajar baharu (${newTeacher.userId}${newTeacher.email ? ` · ${newTeacher.email}` : ''}).`,
      });
      saveStore(store);
      const token = createSessionToken(newTeacher.id);
      res.status(201).json({ token, user: toPublicUser(newTeacher, store.users) });
      return;
    }

    if (typeof requestedLevelId !== 'string' || !store.levels.some((l) => l.id === requestedLevelId)) {
      res.status(400).json({ error: 'Sila pilih Tahap / Topik yang sah.' });
      return;
    }
    let resolvedSupervisorId: string | null = 'admin-root';
    if (typeof supervisorId === 'string' && supervisorId.trim() !== '') {
      const validSupervisor = store.users.find(
        (u) =>
          u.id === supervisorId &&
          u.status === 'approved' &&
          (u.role === 'pengajar' || u.role === 'admin' || u.role === 'master_admin')
      );
      if (!validSupervisor) {
        res.status(400).json({ error: 'Nama Guru penyelia yang dipilih tidak sah.' });
        return;
      }
      resolvedSupervisorId = validSupervisor.id;
    }

    const newTrainee: StoredUser = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      userId: cleanUserId,
      name: cleanName,
      icNumber: cleanIcNumber,
      email: emailCheck.email,
      role: 'pelatih',
      status: 'pending',
      pinHash: hashSecret(pin),
      supervisorId: resolvedSupervisorId,
      requestedLevelId,
      approvedLevelId: null,
      createdAt: now,
      updatedAt: now,
    };
    store.users.push(newTrainee);
    recordSystemChangeLog(store, {
      actorId: newTrainee.id,
      actorName: newTrainee.name,
      actorRole: 'pelatih',
      action: 'register_pelatih',
      targetUserId: newTrainee.userId,
      targetName: newTrainee.name,
      details: `Permohonan pendaftaran Pelatih baharu (${newTrainee.userId} · No. KP: ${cleanIcNumber || '-'}${newTrainee.email ? ` · ${newTrainee.email}` : ''}).`,
    });
    saveStore(store);
    const token = createSessionToken(newTrainee.id);
    res.status(201).json({ token, user: toPublicUser(newTrainee, store.users) });
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const store = loadStore();
    store.sessions = store.sessions.filter((s) => s.tokenHash !== req.authTokenHash);
    saveStore(store);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const store = loadStore();
    const user = req.authUser!;
    res.json({ user: toPublicUser(user, store.users) });
  });

  app.patch('/api/auth/pin', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    if (user.role === 'admin' || user.role === 'master_admin') {
      res.status(400).json({ error: 'Admin dan Master Admin menggunakan kata laluan pentadbir, bukan PIN 6 digit.' });
      return;
    }
    const { currentPin, newPin } = req.body as { currentPin?: unknown; newPin?: unknown };
    if (!isValidSixDigitPin(currentPin) || !isValidSixDigitPin(newPin)) {
      res.status(400).json({ error: 'PIN semasa dan PIN baharu mestilah 6 digit nombor.' });
      return;
    }
    const store = loadStore();
    const target = store.users.find((u) => u.id === user.id);
    if (!target || !target.pinHash || !verifySecret(currentPin, target.pinHash)) {
      res.status(401).json({ error: 'PIN semasa tidak tepat.' });
      return;
    }
    target.pinHash = hashSecret(newPin);
    target.updatedAt = new Date().toISOString();
    saveStore(store);
    res.json({ ok: true, user: toPublicUser(target, store.users) });
  });

  app.patch('/api/auth/password', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    if (user.role !== 'admin' && user.role !== 'master_admin') {
      res.status(400).json({ error: 'Hanya Admin atau Master Admin menggunakan kata laluan.' });
      return;
    }
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };
    if (typeof currentPassword !== 'string' || !currentPassword) {
      res.status(400).json({ error: 'Kata laluan semasa diperlukan.' });
      return;
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
      res.status(400).json({ error: 'Kata laluan baharu mestilah antara 8 hingga 128 aksara.' });
      return;
    }
    const store = loadStore();
    const target = store.users.find((u) => u.id === user.id);
    if (!target) {
      res.status(404).json({ error: 'Akaun pengguna tidak dijumpai.' });
      return;
    }
    if (user.role === 'master_admin') {
      const envPass = process.env.ADMIN_PASSWORD;
      const validCurrent = store.adminPasswordHash
        ? verifySecret(currentPassword, store.adminPasswordHash)
        : typeof envPass === 'string' && envPass.trim().length > 0
        ? verifyPlainEnvSecret(currentPassword, envPass)
        : false;
      if (!validCurrent) {
        res.status(401).json({ error: 'Kata laluan semasa tidak tepat.' });
        return;
      }
      store.adminPasswordHash = hashSecret(newPassword);
    } else {
      if (!target.passwordHash || !verifySecret(currentPassword, target.passwordHash)) {
        res.status(401).json({ error: 'Kata laluan semasa tidak tepat.' });
        return;
      }
      target.passwordHash = hashSecret(newPassword);
    }
    target.updatedAt = new Date().toISOString();
    saveStore(store);
    res.json({ ok: true, user: toPublicUser(target, store.users) });
  });

  // --- Workspace & Learning Content ---

  app.get('/api/workspace', requireAuth, requireApproved, (req: AuthenticatedRequest, res: Response) => {
    const store = loadStore();
    const user = req.authUser!;

    let levels = [...store.levels].sort((a, b) => a.order - b.order);
    let cus = [...store.cus].sort((a, b) => a.order - b.order);

    if (user.role === 'pelatih') {
      levels = levels.filter((l) => l.id === user.approvedLevelId);
      cus = cus.filter((c) => c.levelId === user.approvedLevelId);
    }

    const sopProgress =
      user.role === 'pelatih'
        ? store.sopProgress.filter((p) => p.userId === user.id)
        : store.sopProgress;

    const accessLogs =
      user.role === 'pelatih'
        ? store.accessLogs.filter((l) => l.userId === user.id).slice(-50)
        : store.accessLogs.slice(-200);

    const visibleCuIds = new Set(cus.map((c) => c.id));
    const tugasanPapers = (store.tugasanPapers || []).filter((p) => visibleCuIds.has(p.cuId));
    const tugasanSubmissions =
      user.role === 'pelatih'
        ? (store.tugasanSubmissions || []).filter((s) => s.userId === user.id)
        : (store.tugasanSubmissions || []).slice(-300);

    const teachers = store.users
      .filter((u) => u.role === 'pengajar' && u.status === 'approved')
      .map((u) => ({ id: u.id, name: u.name }));

    res.json({
      levels,
      cus,
      tugasanPapers,
      tugasanSubmissions,
      sopProgress,
      accessLogs,
      teachers,
    });
  });

  // --- Topic Levels CRUD (Admin) ---

  app.post(
    '/api/levels',
    requireAuth,
    requireApproved,
    requireRole(['admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const {
        code,
        title,
        description,
        teoriSub1Title,
        teoriSub2Title,
        amaliSub1Title,
        amaliSub2Title,
      } = req.body as Record<string, unknown>;
      if (typeof code !== 'string' || !code.trim() || typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ error: 'Kod Tahap dan Tajuk diperlukan.' });
        return;
      }
      const store = loadStore();
      const maxOrder = store.levels.reduce((max, l) => Math.max(max, l.order), 0);
      const newLevel = {
        id: `lvl-${crypto.randomUUID().slice(0, 6)}`,
        code: code.trim().slice(0, 24),
        title: title.trim().slice(0, 120),
        description: typeof description === 'string' ? description.trim().slice(0, 300) : '',
        order: maxOrder + 1,
        teoriSub1Title:
          typeof teoriSub1Title === 'string' && teoriSub1Title.trim()
            ? teoriSub1Title.trim().slice(0, 100)
            : DEFAULT_SUB_TITLES.teoriSub1Title,
        teoriSub2Title:
          typeof teoriSub2Title === 'string' && teoriSub2Title.trim()
            ? teoriSub2Title.trim().slice(0, 100)
            : DEFAULT_SUB_TITLES.teoriSub2Title,
        amaliSub1Title:
          typeof amaliSub1Title === 'string' && amaliSub1Title.trim()
            ? amaliSub1Title.trim().slice(0, 100)
            : DEFAULT_SUB_TITLES.amaliSub1Title,
        amaliSub2Title:
          typeof amaliSub2Title === 'string' && amaliSub2Title.trim()
            ? amaliSub2Title.trim().slice(0, 100)
            : DEFAULT_SUB_TITLES.amaliSub2Title,
      };
      store.levels.push(newLevel);
      saveStore(store);
      res.status(201).json({ level: newLevel });
    }
  );

  app.patch(
    '/api/levels/:id',
    requireAuth,
    requireApproved,
    requireRole(['admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const level = store.levels.find((l) => l.id === req.params.id);
      if (!level) {
        res.status(404).json({ error: 'Tahap tidak dijumpai.' });
        return;
      }
      const {
        code,
        title,
        description,
        teoriSub1Title,
        teoriSub2Title,
        amaliSub1Title,
        amaliSub2Title,
      } = req.body as Record<string, unknown>;
      if (typeof code === 'string' && code.trim()) level.code = code.trim().slice(0, 24);
      if (typeof title === 'string' && title.trim()) level.title = title.trim().slice(0, 120);
      if (typeof description === 'string') level.description = description.trim().slice(0, 300);
      if (typeof teoriSub1Title === 'string' && teoriSub1Title.trim()) {
        level.teoriSub1Title = teoriSub1Title.trim().slice(0, 100);
      }
      if (typeof teoriSub2Title === 'string' && teoriSub2Title.trim()) {
        level.teoriSub2Title = teoriSub2Title.trim().slice(0, 100);
      }
      if (typeof amaliSub1Title === 'string' && amaliSub1Title.trim()) {
        level.amaliSub1Title = amaliSub1Title.trim().slice(0, 100);
      }
      if (typeof amaliSub2Title === 'string' && amaliSub2Title.trim()) {
        level.amaliSub2Title = amaliSub2Title.trim().slice(0, 100);
      }
      saveStore(store);
      res.json({ level });
    }
  );

  app.delete(
    '/api/levels/:id',
    requireAuth,
    requireApproved,
    requireRole(['admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const idx = store.levels.findIndex((l) => l.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Tahap tidak dijumpai.' });
        return;
      }
      const removedCUs = store.cus.filter((c) => c.levelId === req.params.id);
      for (const cu of removedCUs) {
        for (const meta of getAllCuFiles(cu)) {
          safeDeleteUpload(meta);
        }
      }
      const removedCuIds = new Set(removedCUs.map((c) => c.id));
      store.cus = store.cus.filter((c) => c.levelId !== req.params.id);
      store.tugasanPapers = store.tugasanPapers.filter((p) => !removedCuIds.has(p.cuId));
      store.tugasanSubmissions = store.tugasanSubmissions.filter((s) => !removedCuIds.has(s.cuId));
      store.levels.splice(idx, 1);
      saveStore(store);
      res.json({ ok: true });
    }
  );

  // --- CU Modules CRUD (Pengajar & Admin) ---

  app.post(
    '/api/cus',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const { levelId, code, title, description } = req.body as {
        levelId?: unknown;
        code?: unknown;
        title?: unknown;
        description?: unknown;
      };
      const store = loadStore();
      if (typeof levelId !== 'string' || !store.levels.some((l) => l.id === levelId)) {
        res.status(400).json({ error: 'Tahap yang dipilih tidak sah.' });
        return;
      }
      if (typeof code !== 'string' || !code.trim() || typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ error: 'Kod CU dan Tajuk CU diperlukan.' });
        return;
      }
      const levelCUs = store.cus.filter((c) => c.levelId === levelId);
      const maxOrder = levelCUs.reduce((m, c) => Math.max(m, c.order), 0);
      const cleanCode = code.trim().slice(0, 24);
      const cleanTitle = title.trim().slice(0, 140);
      const newCU: CUModule = {
        id: `cu-${crypto.randomUUID().slice(0, 6)}`,
        levelId,
        code: cleanCode,
        title: cleanTitle,
        description: typeof description === 'string' ? description.trim().slice(0, 400) : '',
        order: maxOrder + 1,
        ebookModules: [],
        teoriSub1: {
          notaSlot: null,
          panduanSoalanSlot: null,
          googleDriveUrl: '',
          googleDriveTitle: `Folder Nota Google Drive Sub 1 — ${cleanCode}`.slice(0, 140),
          googleFormUrl: '',
          googleFormTitle: `Latihan Teori Sub 1 — ${cleanCode}: ${cleanTitle}`.slice(0, 140),
        },
        teoriSub2: {
          notaSlot: null,
          panduanSoalanSlot: null,
          googleDriveUrl: '',
          googleDriveTitle: `Folder Nota Google Drive Sub 2 — ${cleanCode}`.slice(0, 140),
          googleFormUrl: '',
          googleFormTitle: `Latihan Teori Sub 2 — ${cleanCode}: ${cleanTitle}`.slice(0, 140),
        },
        amaliSub1: {
          sopDocSlot: null,
          sopSteps: [],
        },
        amaliSub2: {
          sopDocSlot: null,
          sopSteps: [],
        },
      };
      store.cus.push(newCU);
      const targetLevel = store.levels.find((l) => l.id === levelId);
      if (targetLevel) {
        store.tugasanPapers.push(createDefaultTugasanForCustomCu(targetLevel, newCU));
      }
      saveStore(store);
      res.status(201).json({ cu: newCU });
    }
  );

  app.patch(
    '/api/cus/:id',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const cu = store.cus.find((c) => c.id === req.params.id);
      if (!cu) {
        res.status(404).json({ error: 'CU tidak dijumpai.' });
        return;
      }
      const { code, title, description, levelId } = req.body as {
        code?: unknown;
        title?: unknown;
        description?: unknown;
        levelId?: unknown;
      };
      if (typeof code === 'string' && code.trim()) cu.code = code.trim().slice(0, 24);
      if (typeof title === 'string' && title.trim()) cu.title = title.trim().slice(0, 140);
      if (typeof description === 'string') cu.description = description.trim().slice(0, 400);
      if (typeof levelId === 'string' && store.levels.some((l) => l.id === levelId)) {
        cu.levelId = levelId;
      }
      saveStore(store);
      res.json({ cu });
    }
  );

  app.delete(
    '/api/cus/:id',
    requireAuth,
    requireApproved,
    requireRole(['admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const idx = store.cus.findIndex((c) => c.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'CU tidak dijumpai.' });
        return;
      }
      const cu = store.cus[idx];
      for (const meta of getAllCuFiles(cu)) {
        safeDeleteUpload(meta);
      }
      store.cus.splice(idx, 1);
      store.tugasanPapers = store.tugasanPapers.filter((p) => p.cuId !== cu.id);
      store.tugasanSubmissions = store.tugasanSubmissions.filter((s) => s.cuId !== cu.id);
      saveStore(store);
      res.json({ ok: true });
    }
  );

  // --- Word (.doc/.docx) & PDF (.pdf) Slot Management (2 Sub Teori & 2 Sub Amali) ---

  app.post(
    '/api/cus/:cuId/slots/:slotType',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    upload.single('file'),
    (req: AuthenticatedRequest, res: Response) => {
      const { cuId, slotType } = req.params;
      if (!isValidSlotType(slotType)) {
        res.status(400).json({ error: 'Jenis slot dokumen tidak sah.' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'Sila pilih fail Word (.doc/.docx) atau PDF (.pdf) untuk dimuat naik.' });
        return;
      }
      const detected = detectAllowedDocType(req.file.originalname, req.file.buffer);
      if (!detected.ok) {
        res.status(400).json({ error: detected.error });
        return;
      }
      const store = loadStore();
      const cu = store.cus.find((c) => c.id === cuId);
      if (!cu) {
        res.status(404).json({ error: 'CU tidak dijumpai.' });
        return;
      }

      const fileId = crypto.randomUUID();
      const storedName = `${fileId}${detected.extension}`;
      const targetPath = safeResolveUploadPath(storedName);
      if (!targetPath) {
        res.status(400).json({ error: 'Nama fail tidak sah.' });
        return;
      }

      fs.writeFileSync(targetPath, req.file.buffer);

      const safeOriginal = path.basename(req.file.originalname).replace(/[^\w.\- ()]/g, '_').slice(0, 120);
      const newMeta: FileMetadata = {
        id: fileId,
        originalName: safeOriginal || `dokumen${detected.extension}`,
        storedName,
        mimeType: detected.mimeType,
        extension: detected.extension,
        sizeBytes: req.file.size,
        uploadedAt: new Date().toISOString(),
        uploadedById: req.authUser!.id,
        uploadedByName: req.authUser!.name,
      };

      safeDeleteUpload(getSlotFile(cu, slotType));
      setSlotFile(cu, slotType, newMeta);
      saveStore(store);
      res.json({ cu, file: newMeta });
    }
  );

  app.delete(
    '/api/cus/:cuId/slots/:slotType',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const { cuId, slotType } = req.params;
      if (!isValidSlotType(slotType)) {
        res.status(400).json({ error: 'Jenis slot dokumen tidak sah.' });
        return;
      }
      const store = loadStore();
      const cu = store.cus.find((c) => c.id === cuId);
      if (!cu) {
        res.status(404).json({ error: 'CU tidak dijumpai.' });
        return;
      }
      safeDeleteUpload(getSlotFile(cu, slotType));
      setSlotFile(cu, slotType, null);
      saveStore(store);
      res.json({ cu });
    }
  );

  // --- Multi-Part E-Book Kertas Penerangan Notes per CU ---

  app.post(
    '/api/cus/:cuId/ebooks',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    upload.single('file'),
    (req: AuthenticatedRequest, res: Response) => {
      const { cuId } = req.params;
      if (!req.file) {
        res.status(400).json({ error: 'Sila pilih fail PDF atau Word (.doc/.docx) untuk dimuat naik.' });
        return;
      }
      const detected = detectAllowedDocType(req.file.originalname, req.file.buffer);
      if (!detected.ok) {
        res.status(400).json({ error: detected.error });
        return;
      }
      const store = loadStore();
      const cu = store.cus.find((c) => c.id === cuId);
      if (!cu) {
        res.status(404).json({ error: 'CU tidak dijumpai.' });
        return;
      }

      const rawCode = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
      const rawTitle = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      const safeOriginal = path
        .basename(req.file.originalname)
        .replace(/[^\w.\- ()]/g, '_')
        .slice(0, 120);
      const fallbackTitle = safeOriginal.replace(/\.(pdf|doc|docx)$/i, '');

      const fileId = crypto.randomUUID();
      const storedName = `${fileId}${detected.extension}`;
      const targetPath = safeResolveUploadPath(storedName);
      if (!targetPath) {
        res.status(400).json({ error: 'Nama fail tidak sah.' });
        return;
      }

      fs.writeFileSync(targetPath, req.file.buffer);

      const newMeta: FileMetadata = {
        id: fileId,
        originalName: safeOriginal || `nota${detected.extension}`,
        storedName,
        mimeType: detected.mimeType,
        extension: detected.extension,
        sizeBytes: req.file.size,
        uploadedAt: new Date().toISOString(),
        uploadedById: req.authUser!.id,
        uploadedByName: req.authUser!.name,
      };

      const nextIndex = (cu.ebookModules?.length || 0) + 1;
      const newModule: EbookNoteModule = {
        id: `ebook-${crypto.randomUUID().slice(0, 8)}`,
        code: (rawCode || `KP(${nextIndex})`).slice(0, 24),
        title: (rawTitle || fallbackTitle || `Nota E-Book ${nextIndex}`).slice(0, 160),
        file: newMeta,
      };

      if (!Array.isArray(cu.ebookModules)) {
        cu.ebookModules = [];
      }
      cu.ebookModules.push(newModule);
      saveStore(store);
      res.status(201).json({ cu, module: newModule });
    }
  );

  app.delete(
    '/api/cus/:cuId/ebooks/:moduleId',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const { cuId, moduleId } = req.params;
      const store = loadStore();
      const cu = store.cus.find((c) => c.id === cuId);
      if (!cu) {
        res.status(404).json({ error: 'CU tidak dijumpai.' });
        return;
      }
      const list = cu.ebookModules || [];
      const idx = list.findIndex((m) => m.id === moduleId);
      if (idx === -1) {
        res.status(404).json({ error: 'Modul E-Book tidak dijumpai.' });
        return;
      }
      const [removed] = list.splice(idx, 1);
      cu.ebookModules = list;
      safeDeleteUpload(removed.file);
      saveStore(store);
      res.json({ cu });
    }
  );

  app.get('/api/files/:fileId', requireAuth, requireApproved, (req: AuthenticatedRequest, res: Response) => {
    const store = loadStore();
    const fileId = req.params.fileId;
    let foundMeta: FileMetadata | null = null;
    let parentCU: CUModule | null = null;

    for (const cu of store.cus) {
      for (const slot of getAllCuFiles(cu)) {
        if (slot && slot.id === fileId) {
          foundMeta = slot;
          parentCU = cu;
          break;
        }
      }
      if (foundMeta) break;
    }

    if (!foundMeta || !parentCU) {
      res.status(404).json({ error: 'Fail tidak dijumpai.' });
      return;
    }

    const user = req.authUser!;
    if (user.role === 'pelatih' && parentCU.levelId !== user.approvedLevelId) {
      res.status(403).json({ error: 'Anda tiada akses ke dokumen tahap ini.' });
      return;
    }

    const resolvedPath = safeResolveUploadPath(foundMeta.storedName);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: 'Fail fizikal tidak dijumpai pada pelayan.' });
      return;
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', foundMeta.mimeType);
    const disposition = foundMeta.extension === '.pdf' ? 'inline' : 'attachment';
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${foundMeta.originalName.replace(/"/g, '')}"`
    );
    fs.createReadStream(resolvedPath).pipe(res);
  });

  // --- Google Form Integration (Per Teori Sub 1 / Sub 2) ---

  app.put(
    '/api/cus/:cuId/google-form',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const cu = store.cus.find((c) => c.id === req.params.cuId);
      if (!cu) {
        res.status(404).json({ error: 'CU tidak dijumpai.' });
        return;
      }
      const { subKey, googleFormUrl, googleFormTitle } = req.body as {
        subKey?: unknown;
        googleFormUrl?: unknown;
        googleFormTitle?: unknown;
      };
      const resolvedSub: SubKey = subKey === 'sub2' ? 'sub2' : 'sub1';
      if (typeof googleFormUrl !== 'string') {
        res.status(400).json({ error: 'URL Google Form tidak sah.' });
        return;
      }
      const check = validateSafeHttpsUrl(googleFormUrl);
      if (!check.ok) {
        res.status(400).json({ error: check.error });
        return;
      }
      const targetSub = resolvedSub === 'sub2' ? cu.teoriSub2 : cu.teoriSub1;
      targetSub.googleFormUrl = check.normalized;
      if (typeof googleFormTitle === 'string') {
        targetSub.googleFormTitle = googleFormTitle.trim().slice(0, 140);
      }
      saveStore(store);
      res.json({ cu });
    }
  );

  app.put(
    '/api/cus/:cuId/google-drive',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const cu = store.cus.find((c) => c.id === req.params.cuId);
      if (!cu) {
        res.status(404).json({ error: 'CU tidak dijumpai.' });
        return;
      }
      const { subKey, googleDriveUrl, googleDriveTitle } = req.body as {
        subKey?: unknown;
        googleDriveUrl?: unknown;
        googleDriveTitle?: unknown;
      };
      const resolvedSub: SubKey = subKey === 'sub2' ? 'sub2' : 'sub1';
      if (typeof googleDriveUrl !== 'string') {
        res.status(400).json({ error: 'URL Folder Google Drive tidak sah.' });
        return;
      }
      const check = validateSafeHttpsUrl(googleDriveUrl);
      if (!check.ok) {
        res.status(400).json({ error: check.error });
        return;
      }
      if (check.normalized) {
        const parsedHost = new URL(check.normalized).hostname.toLowerCase();
        if (parsedHost !== 'drive.google.com' && parsedHost !== 'docs.google.com') {
          res.status(400).json({
            error: 'Sila masukkan pautan Google Drive yang sah (drive.google.com).',
          });
          return;
        }
      }
      const targetSub = resolvedSub === 'sub2' ? cu.teoriSub2 : cu.teoriSub1;
      targetSub.googleDriveUrl = check.normalized;
      if (typeof googleDriveTitle === 'string') {
        targetSub.googleDriveTitle = googleDriveTitle.trim().slice(0, 140);
      }
      saveStore(store);
      res.json({ cu });
    }
  );

  // --- SOP Steps & Trainee Checklists (Per Amali Sub 1 / Sub 2) ---

  app.put(
    '/api/cus/:cuId/sop-steps',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const cu = store.cus.find((c) => c.id === req.params.cuId);
      if (!cu) {
        res.status(404).json({ error: 'CU tidak dijumpai.' });
        return;
      }
      const { subKey, sopSteps } = req.body as { subKey?: unknown; sopSteps?: unknown };
      const resolvedSub: SubKey = subKey === 'sub2' ? 'sub2' : 'sub1';
      if (!Array.isArray(sopSteps) || sopSteps.length > 50) {
        res.status(400).json({ error: 'Senarai langkah SOP tidak sah.' });
        return;
      }
      const allowedCats: SopCategory[] = ['LOTO', 'PCD', 'PPE', 'Langkah Kerja'];
      const sanitized: SopStep[] = [];
      for (const item of sopSteps) {
        if (!item || typeof item !== 'object') continue;
        const record = item as Record<string, unknown>;
        const cat = allowedCats.includes(record.category as SopCategory)
          ? (record.category as SopCategory)
          : 'Langkah Kerja';
        const title = typeof record.title === 'string' ? record.title.trim().slice(0, 120) : '';
        const instruction =
          typeof record.instruction === 'string' ? record.instruction.trim().slice(0, 500) : '';
        if (!title || !instruction) continue;
        sanitized.push({
          id:
            typeof record.id === 'string' && /^[a-zA-Z0-9_-]{3,40}$/.test(record.id)
              ? record.id
              : `sop-${crypto.randomUUID().slice(0, 8)}`,
          category: cat,
          title,
          instruction,
          critical: Boolean(record.critical),
        });
      }
      if (resolvedSub === 'sub2') {
        cu.amaliSub2.sopSteps = sanitized;
      } else {
        cu.amaliSub1.sopSteps = sanitized;
      }
      saveStore(store);
      res.json({ cu });
    }
  );

  app.post('/api/cus/:cuId/sop-check', requireAuth, requireApproved, (req: AuthenticatedRequest, res: Response) => {
    const store = loadStore();
    const user = req.authUser!;
    const cu = store.cus.find((c) => c.id === req.params.cuId);
    if (!cu) {
      res.status(404).json({ error: 'CU tidak dijumpai.' });
      return;
    }
    if (user.role === 'pelatih' && cu.levelId !== user.approvedLevelId) {
      res.status(403).json({ error: 'Anda tiada akses ke tahap ini.' });
      return;
    }
    const { subKey, checkedStepIds } = req.body as {
      subKey?: unknown;
      checkedStepIds?: unknown;
    };
    const resolvedSub: SubKey = subKey === 'sub2' ? 'sub2' : 'sub1';
    if (!Array.isArray(checkedStepIds)) {
      res.status(400).json({ error: 'Data semakan tidak sah.' });
      return;
    }
    const stepsPool = resolvedSub === 'sub2' ? cu.amaliSub2.sopSteps : cu.amaliSub1.sopSteps;
    const validIds = new Set(stepsPool.map((s) => s.id));
    const filtered = checkedStepIds.filter((id): id is string => typeof id === 'string' && validIds.has(id));
    const now = new Date().toISOString();
    const existing = store.sopProgress.find(
      (p) => p.userId === user.id && p.cuId === cu.id && p.subKey === resolvedSub
    );
    if (existing) {
      existing.checkedStepIds = filtered;
      existing.updatedAt = now;
    } else {
      store.sopProgress.push({
        userId: user.id,
        cuId: cu.id,
        subKey: resolvedSub,
        checkedStepIds: filtered,
        updatedAt: now,
      });
    }
    saveStore(store);
    res.json({
      progress: {
        userId: user.id,
        cuId: cu.id,
        subKey: resolvedSub,
        checkedStepIds: filtered,
        updatedAt: now,
      },
    });
  });

  // --- Access Tracking ---

  app.post('/api/access-logs', requireAuth, requireApproved, (req: AuthenticatedRequest, res: Response) => {
    const store = loadStore();
    const user = req.authUser!;
    const { cuId, subKey, action } = req.body as {
      cuId?: unknown;
      subKey?: unknown;
      action?: unknown;
    };
    const allowedActions: AccessLogEntry['action'][] = [
      'view_nota',
      'view_panduan',
      'open_drive',
      'open_form',
      'view_sop',
      'complete_sop',
      'submit_tugasan',
      'print_tugasan',
      'sync_drive',
    ];
    if (typeof cuId !== 'string' || !allowedActions.includes(action as AccessLogEntry['action'])) {
      res.status(400).json({ error: 'Rekod akses tidak sah.' });
      return;
    }
    const cu = store.cus.find((c) => c.id === cuId);
    if (!cu) {
      res.status(404).json({ error: 'CU tidak dijumpai.' });
      return;
    }
    if (user.role === 'pelatih' && cu.levelId !== user.approvedLevelId) {
      res.status(403).json({ error: 'Anda tiada akses ke tahap ini.' });
      return;
    }
    const resolvedSub: SubKey | undefined =
      subKey === 'sub1' || subKey === 'sub2' ? subKey : undefined;
    const entry: AccessLogEntry = {
      id: `log-${crypto.randomUUID().slice(0, 8)}`,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      cuId: cu.id,
      cuCode: cu.code,
      cuTitle: cu.title,
      subKey: resolvedSub,
      action: action as AccessLogEntry['action'],
      timestamp: new Date().toISOString(),
    };
    store.accessLogs.push(entry);
    if (store.accessLogs.length > 500) {
      store.accessLogs = store.accessLogs.slice(-500);
    }
    saveStore(store);
    res.status(201).json({ entry });
  });

  // --- Kertas Tugasan & AI Auto-Marking ---

  app.post(
    '/api/tugasan/:paperId/submit',
    requireAuth,
    requireApproved,
    async (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const user = req.authUser!;
      const paper = store.tugasanPapers.find((p) => p.id === req.params.paperId);
      if (!paper) {
        res.status(404).json({ error: 'Kertas Tugasan tidak dijumpai.' });
        return;
      }
      const cu = store.cus.find((c) => c.id === paper.cuId);
      if (!cu) {
        res.status(404).json({ error: 'Unit Kompetensi bagi tugasan ini tidak dijumpai.' });
        return;
      }
      if (user.role === 'pelatih' && cu.levelId !== user.approvedLevelId) {
        res.status(403).json({ error: 'Anda tiada akses ke tahap pembelajaran ini.' });
        return;
      }

      const body = req.body as { answers?: unknown };
      if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) {
        res.status(400).json({ error: 'Format jawapan tugasan tidak sah.' });
        return;
      }

      const rawAnswers = body.answers as Record<string, unknown>;
      const sanitizedAnswers: Record<string, string> = {};
      let nonEmptyCount = 0;
      for (const q of paper.questions) {
        const rawVal = rawAnswers[q.id];
        const val = typeof rawVal === 'string' ? rawVal.trim().slice(0, 4000) : '';
        sanitizedAnswers[q.id] = val;
        if (val.length > 0) nonEmptyCount++;
      }

      if (nonEmptyCount === 0) {
        res.status(400).json({ error: 'Sila jawab sekurang-kurangnya satu soalan sebelum menghantar untuk penandaan AI.' });
        return;
      }

      try {
        const graded = await gradeTugasanWithAI({
          paper,
          cu,
          uploadsDir: UPLOADS_DIR,
          answers: sanitizedAnswers,
        });

        const submission: TugasanSubmission = {
          id: `sub-${crypto.randomUUID().slice(0, 10)}`,
          templateId: paper.id,
          cuId: cu.id,
          userId: user.id,
          userName: user.name,
          userCodeId: user.userId,
          userIcNumber: user.icNumber || '',
          submittedAt: new Date().toISOString(),
          answers: sanitizedAnswers,
          grades: graded.grades,
          totalScore: graded.totalScore,
          maxTotalScore: graded.maxTotalScore,
          percentage: graded.percentage,
          passed: graded.passed,
          overallFeedback: graded.overallFeedback,
          gradedByModel: graded.gradedByModel,
        };

        const latestStore = loadStore();
        latestStore.tugasanSubmissions.push(submission);
        if (latestStore.tugasanSubmissions.length > 1000) {
          latestStore.tugasanSubmissions = latestStore.tugasanSubmissions.slice(-1000);
        }
        latestStore.accessLogs.push({
          id: `log-${crypto.randomUUID().slice(0, 8)}`,
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          cuId: cu.id,
          cuCode: cu.code,
          cuTitle: `${cu.title} (${paper.setCode} · ${submission.percentage}%)`,
          action: 'submit_tugasan',
          timestamp: submission.submittedAt,
        });
        if (latestStore.accessLogs.length > 500) {
          latestStore.accessLogs = latestStore.accessLogs.slice(-500);
        }
        saveStore(latestStore);

        res.status(201).json({ submission });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Penandaan AI gagal diproses buat masa ini. Sila cuba sebentar lagi.';
        res.status(503).json({ error: message });
      }
    }
  );

  app.post(
    '/api/tugasan/drive-pdf/parse',
    express.json({ limit: '25mb' }),
    requireAuth,
    requireApproved,
    async (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const user = req.authUser!;
      const body = (req.body || {}) as {
        cuId?: unknown;
        driveFileId?: unknown;
        fileName?: unknown;
        pdfBase64?: unknown;
      };
      if (typeof body.cuId !== 'string' || typeof body.driveFileId !== 'string') {
        res.status(400).json({ error: 'Maklumat CU dan fail Google Drive tidak lengkap.' });
        return;
      }
      const cu = store.cus.find((c) => c.id === body.cuId);
      if (!cu) {
        res.status(404).json({ error: 'Unit Kompetensi tidak dijumpai.' });
        return;
      }
      if (user.role === 'pelatih' && cu.levelId !== user.approvedLevelId) {
        res.status(403).json({ error: 'Anda tiada akses ke tahap pembelajaran ini.' });
        return;
      }
      const fileName =
        typeof body.fileName === 'string' && body.fileName.trim()
          ? body.fileName.trim().slice(0, 180)
          : 'Kertas_Drive.pdf';
      if (typeof body.pdfBase64 !== 'string' || body.pdfBase64.length < 10) {
        res.status(400).json({ error: 'Data PDF daripada Google Drive tidak sah.' });
        return;
      }
      const pdfBuffer = Buffer.from(body.pdfBase64, 'base64');
      const isPdfMagic =
        pdfBuffer.length >= 5 && pdfBuffer.subarray(0, 5).toString('ascii') === '%PDF-';
      if (!isPdfMagic) {
        res.status(400).json({ error: 'Fail Google Drive yang dipilih bukan PDF yang sah.' });
        return;
      }

      // Match existing mapped CU TugasanPaper if filename matches paperCode/setCode/sourcePdfFileName
      const normalizedName = fileName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cuPapers = store.tugasanPapers.filter((p) => p.cuId === cu.id);
      const matchedSeeded = cuPapers.find((p) => {
        const candidates = [p.paperCode, p.setCode, p.sourcePdfFileName || '']
          .map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ''))
          .filter((s) => s.length >= 4);
        return candidates.some((c) => normalizedName.includes(c));
      });
      if (matchedSeeded) {
        res.json({
          paper: {
            ...matchedSeeded,
            sourceDriveFileId: body.driveFileId,
            sourceDriveFileName: fileName,
          },
          matchedPaperId: matchedSeeded.id,
        });
        return;
      }

      const level = store.levels.find((l) => l.id === cu.levelId);
      const levelLabel = level ? `${level.code} — ${level.title}` : 'NOSS JPK';
      const extracted = await extractQuestionsFromPdfBuffer({
        pdfBuffer,
        fileName,
        cu,
        levelLabel,
      });

      const dynamicPaper: TugasanPaper = {
        id: `drive-${body.driveFileId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60)}`,
        cuId: cu.id,
        setCode: 'DRIVE',
        programCodeTitle: levelLabel.toUpperCase(),
        tahap: level?.code.replace(/[^0-9]/g, '') || '2',
        cuCodeTitle: `${cu.code} ${cu.title}`.toUpperCase(),
        workActivities: [`1. ${cu.title.toUpperCase()}`],
        paperCode: extracted.paperCode,
        title: extracted.title,
        purpose: `Penilaian menggunakan fail PDF asal daripada Google Drive (${fileName}).`,
        instructions: [
          'Rujuk halaman kertas soalan PDF asal di sebelah kiri dan lengkapkan jawapan anda.',
          'Penandaan AI mengembalikan markah dan tanda (✓ / ✗) sahaja tanpa mengubah format PDF asal.',
        ],
        passingScore: 60,
        questions: extracted.questions,
        references: [`Dokumen Google Drive: ${fileName}`],
        sourceDriveFileId: body.driveFileId,
        sourceDriveFileName: fileName,
        updatedAt: new Date().toISOString(),
      };
      res.json({ paper: dynamicPaper });
    }
  );

  app.post(
    '/api/tugasan/drive-pdf/grade',
    requireAuth,
    requireApproved,
    async (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const user = req.authUser!;
      const body = (req.body || {}) as {
        cuId?: unknown;
        driveFileId?: unknown;
        fileName?: unknown;
        paper?: TugasanPaper;
        answers?: unknown;
      };
      if (
        typeof body.cuId !== 'string' ||
        typeof body.driveFileId !== 'string' ||
        !body.paper ||
        !Array.isArray(body.paper.questions) ||
        body.paper.questions.length === 0
      ) {
        res.status(400).json({ error: 'Data kertas penilaian Google Drive tidak lengkap.' });
        return;
      }
      const cu = store.cus.find((c) => c.id === body.cuId);
      if (!cu) {
        res.status(404).json({ error: 'Unit Kompetensi tidak dijumpai.' });
        return;
      }
      if (user.role === 'pelatih' && cu.levelId !== user.approvedLevelId) {
        res.status(403).json({ error: 'Anda tiada akses ke tahap pembelajaran ini.' });
        return;
      }
      if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) {
        res.status(400).json({ error: 'Format jawapan tugasan tidak sah.' });
        return;
      }
      const rawAnswers = body.answers as Record<string, unknown>;
      const sanitizedAnswers: Record<string, string> = {};
      let nonEmptyCount = 0;
      for (const q of body.paper.questions) {
        const rawVal = rawAnswers[q.id];
        const val = typeof rawVal === 'string' ? rawVal.trim().slice(0, 4000) : '';
        sanitizedAnswers[q.id] = val;
        if (val.length > 0) nonEmptyCount++;
      }
      if (nonEmptyCount === 0) {
        res.status(400).json({
          error: 'Sila jawab sekurang-kurangnya satu soalan sebelum menghantar untuk penandaan AI.',
        });
        return;
      }

      try {
        const graded = await gradeTugasanWithAI({
          paper: body.paper,
          cu,
          uploadsDir: UPLOADS_DIR,
          answers: sanitizedAnswers,
        });
        const fileName =
          typeof body.fileName === 'string' && body.fileName.trim()
            ? body.fileName.trim().slice(0, 180)
            : body.paper.sourceDriveFileName || 'Kertas_Drive.pdf';

        const submission: TugasanSubmission = {
          id: `sub-${crypto.randomUUID().slice(0, 10)}`,
          templateId: body.paper.id,
          cuId: cu.id,
          userId: user.id,
          userName: user.name,
          userCodeId: user.userId,
          userIcNumber: user.icNumber || '',
          submittedAt: new Date().toISOString(),
          answers: sanitizedAnswers,
          grades: graded.grades,
          totalScore: graded.totalScore,
          maxTotalScore: graded.maxTotalScore,
          percentage: graded.percentage,
          passed: graded.passed,
          overallFeedback: graded.overallFeedback,
          gradedByModel: graded.gradedByModel,
          sourceDriveFileId: body.driveFileId,
          sourceDriveFileName: fileName,
        };

        const latestStore = loadStore();
        latestStore.tugasanSubmissions.push(submission);
        if (latestStore.tugasanSubmissions.length > 1000) {
          latestStore.tugasanSubmissions = latestStore.tugasanSubmissions.slice(-1000);
        }
        latestStore.accessLogs.push({
          id: `log-${crypto.randomUUID().slice(0, 8)}`,
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          cuId: cu.id,
          cuCode: cu.code,
          cuTitle: `${cu.title} (Drive: ${fileName} · ${submission.percentage}%)`,
          action: 'submit_tugasan',
          timestamp: submission.submittedAt,
        });
        if (latestStore.accessLogs.length > 500) {
          latestStore.accessLogs = latestStore.accessLogs.slice(-500);
        }
        recordSystemChangeLog(latestStore, {
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          action: 'grade_drive_pdf',
          targetUserId: user.userId,
          targetName: user.name,
          details: `Penilaian PDF Drive "${fileName}" (${cu.code}): ${submission.totalScore}/${submission.maxTotalScore} (${submission.percentage}% · ${submission.passed ? 'LULUS' : 'BELUM LULUS'}).`,
        });
        saveStore(latestStore);
        res.status(201).json({ submission });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Penandaan AI gagal diproses buat masa ini. Sila cuba sebentar lagi.';
        res.status(503).json({ error: message });
      }
    }
  );

  app.post(
    '/api/tugasan/:paperId/print-authorize',
    requireAuth,
    requireApproved,
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const user = req.authUser!;
      const { submissionId } = (req.body || {}) as { submissionId?: unknown };
      const paper = store.tugasanPapers.find((p) => p.id === req.params.paperId);
      const isDynamicDrivePaper = !paper && req.params.paperId.startsWith('drive-');
      const submission =
        typeof submissionId === 'string'
          ? store.tugasanSubmissions.find(
              (s) =>
                s.id === submissionId &&
                s.templateId === req.params.paperId &&
                (user.role !== 'pelatih' || s.userId === user.id)
            )
          : undefined;

      if (!paper && !isDynamicDrivePaper) {
        res.status(404).json({ error: 'Kertas Tugasan tidak dijumpai.' });
        return;
      }

      const cuId = paper ? paper.cuId : submission?.cuId;
      const cu = cuId ? store.cus.find((c) => c.id === cuId) : undefined;
      if (!cu) {
        res.status(404).json({ error: 'CU tidak dijumpai.' });
        return;
      }
      if (user.role === 'pelatih' && cu.levelId !== user.approvedLevelId) {
        res.status(403).json({ error: 'Anda tiada akses ke tahap ini.' });
        return;
      }

      const passingScore = paper ? paper.passingScore : 60;
      if (user.role === 'pelatih') {
        if (!submission || !submission.passed) {
          res.status(403).json({
            error: `Cetakan disekat. Markah mestilah lulus (>= ${passingScore}%) sebelum kertas tugasan boleh dicetak.`,
          });
          return;
        }
      } else if (submission && !submission.passed) {
        res.status(403).json({
          error: `Rekod penilaian ini berstatus BELUM LULUS (< ${passingScore}%). Hanya kertas lulus layak dicetak.`,
        });
        return;
      }

      store.accessLogs.push({
        id: `log-${crypto.randomUUID().slice(0, 8)}`,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        cuId: cu.id,
        cuCode: cu.code,
        cuTitle: `${cu.title} (${paper ? paper.setCode : 'DRIVE PDF'})`,
        action: 'print_tugasan',
        timestamp: new Date().toISOString(),
      });
      if (store.accessLogs.length > 500) {
        store.accessLogs = store.accessLogs.slice(-500);
      }
      saveStore(store);

      res.json({ authorized: true });
    }
  );

  app.patch(
    '/api/tugasan/submissions/:submissionId/drive-sync',
    requireAuth,
    requireApproved,
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const user = req.authUser!;
      const submission = store.tugasanSubmissions.find(
        (s) => s.id === req.params.submissionId
      );
      if (!submission) {
        res.status(404).json({ error: 'Rekod penilaian tugasan tidak dijumpai.' });
        return;
      }
      if (user.role === 'pelatih' && submission.userId !== user.id) {
        res.status(403).json({ error: 'Anda tiada akses ke rekod ini.' });
        return;
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const safeGoogleUrl = (val: unknown): string | undefined => {
        if (typeof val !== 'string' || !val.trim()) return undefined;
        try {
          const parsed = new URL(val.trim());
          if (
            parsed.protocol === 'https:' &&
            (parsed.hostname === 'drive.google.com' || parsed.hostname === 'docs.google.com')
          ) {
            return parsed.toString();
          }
        } catch {
          return undefined;
        }
        return undefined;
      };

      if (typeof body.driveFolderId === 'string' && /^[a-zA-Z0-9_-]{5,120}$/.test(body.driveFolderId)) {
        submission.driveFolderId = body.driveFolderId;
      }
      if (typeof body.driveFolderName === 'string') {
        submission.driveFolderName = body.driveFolderName.trim().slice(0, 120);
      }
      const folderUrl = safeGoogleUrl(body.driveFolderUrl);
      if (folderUrl) submission.driveFolderUrl = folderUrl;
      if (typeof body.driveFileId === 'string' && /^[a-zA-Z0-9_-]{5,120}$/.test(body.driveFileId)) {
        submission.driveFileId = body.driveFileId;
      }
      const fileUrl = safeGoogleUrl(body.driveFileUrl);
      if (fileUrl) submission.driveFileUrl = fileUrl;
      submission.driveSyncedAt = new Date().toISOString();

      const cu = store.cus.find((c) => c.id === submission.cuId);
      if (cu) {
        store.accessLogs.push({
          id: `log-${crypto.randomUUID().slice(0, 8)}`,
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          cuId: cu.id,
          cuCode: cu.code,
          cuTitle: `${cu.title} (Drive: ${submission.driveFolderName || submission.userCodeId})`,
          action: 'sync_drive',
          timestamp: new Date().toISOString(),
        });
        if (store.accessLogs.length > 500) {
          store.accessLogs = store.accessLogs.slice(-500);
        }
      }

      saveStore(store);
      res.json({ submission });
    }
  );

  app.post(
    '/api/cus/:cuId/tugasan',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const cu = store.cus.find((c) => c.id === req.params.cuId);
      if (!cu) {
        res.status(404).json({ error: 'CU tidak dijumpai.' });
        return;
      }
      const level = store.levels.find((l) => l.id === cu.levelId);
      const body = req.body as Record<string, unknown>;
      const title = typeof body.title === 'string' ? body.title.trim().slice(0, 160) : '';
      const paperCode = typeof body.paperCode === 'string' ? body.paperCode.trim().slice(0, 80) : '';
      const setCode = typeof body.setCode === 'string' ? body.setCode.trim().slice(0, 24) : '';
      if (!title || !paperCode) {
        res.status(400).json({ error: 'Tajuk dan No. Kod Kertas Tugasan diperlukan.' });
        return;
      }

      const rawQuestions = Array.isArray(body.questions) ? body.questions : [];
      const paperId = `tug-${crypto.randomUUID().slice(0, 8)}`;
      const questions: TugasanQuestion[] = rawQuestions
        .filter((q): q is Record<string, unknown> => Boolean(q) && typeof q === 'object')
        .slice(0, 30)
        .map((q, idx) => ({
          id:
            typeof q.id === 'string' && q.id.trim()
              ? q.id.trim().slice(0, 48)
              : `${paperId}-q${idx + 1}`,
          numberLabel: `${idx + 1}.`,
          prompt: typeof q.prompt === 'string' ? q.prompt.trim().slice(0, 600) : '',
          subPrompts: Array.isArray(q.subPrompts)
            ? q.subPrompts
                .filter((sp): sp is string => typeof sp === 'string' && sp.trim().length > 0)
                .map((sp) => sp.trim().slice(0, 300))
            : undefined,
          maxMarks:
            typeof q.maxMarks === 'number' && Number.isFinite(q.maxMarks)
              ? Math.max(1, Math.min(50, Math.round(q.maxMarks)))
              : 4,
          rubricHint: typeof q.rubricHint === 'string' ? q.rubricHint.trim().slice(0, 800) : '',
        }))
        .filter((q) => q.prompt.length > 0);

      if (questions.length === 0) {
        res.status(400).json({ error: 'Sekurang-kurangnya satu soalan diperlukan.' });
        return;
      }

      const passingScore =
        typeof body.passingScore === 'number' && Number.isFinite(body.passingScore)
          ? Math.max(40, Math.min(100, Math.round(body.passingScore)))
          : 60;

      const paper: TugasanPaper = {
        id: paperId,
        cuId: cu.id,
        setCode: setCode || `T(${store.tugasanPapers.filter((p) => p.cuId === cu.id).length + 1})`,
        programCodeTitle:
          typeof body.programCodeTitle === 'string' && body.programCodeTitle.trim()
            ? body.programCodeTitle.trim().slice(0, 180)
            : `${level?.code || 'NOSS'} — ${level?.title || ''}`.toUpperCase(),
        tahap:
          typeof body.tahap === 'string' && body.tahap.trim()
            ? body.tahap.trim().slice(0, 20)
            : level?.code.replace(/[^0-9]/g, '') || '2',
        cuCodeTitle:
          typeof body.cuCodeTitle === 'string' && body.cuCodeTitle.trim()
            ? body.cuCodeTitle.trim().slice(0, 180)
            : `${cu.code} ${cu.title}`.toUpperCase(),
        workActivities: Array.isArray(body.workActivities)
          ? body.workActivities
              .filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
              .map((w) => w.trim().slice(0, 240))
          : [`1. ${cu.title.toUpperCase()}`],
        paperCode,
        title: title.toUpperCase(),
        purpose:
          typeof body.purpose === 'string' && body.purpose.trim()
            ? body.purpose.trim().slice(0, 600)
            : `Kertas Tugasan ini bertujuan menilai kefahaman pelatih tentang ${title}.`,
        instructions: [
          'Jawab semua soalan di bawah dengan jelas dan tepat mengikut piawaian MS IEC 60364.',
          'Jawapan akan disemak secara automatik oleh AI berpandukan nota rasmi.',
          `Markah lulus minimum ialah ${passingScore}%. Kertas hanya boleh dicetak selepas LULUS.`,
        ],
        passingScore,
        questions,
        references: Array.isArray(body.references)
          ? body.references
              .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
              .map((r) => r.trim().slice(0, 300))
          : ['Jabatan Pembangunan Kemahiran (JPK) — NOSS F432-005.'],
        sourceEbookId:
          typeof body.sourceEbookId === 'string' && body.sourceEbookId.trim()
            ? body.sourceEbookId.trim()
            : undefined,
        updatedAt: new Date().toISOString(),
      };

      store.tugasanPapers.push(paper);
      saveStore(store);
      res.status(201).json({ paper });
    }
  );

  app.put(
    '/api/tugasan/:paperId',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const paper = store.tugasanPapers.find((p) => p.id === req.params.paperId);
      if (!paper) {
        res.status(404).json({ error: 'Kertas Tugasan tidak dijumpai.' });
        return;
      }
      const body = req.body as Record<string, unknown>;
      if (typeof body.setCode === 'string' && body.setCode.trim()) {
        paper.setCode = body.setCode.trim().slice(0, 24);
      }
      if (typeof body.paperCode === 'string' && body.paperCode.trim()) {
        paper.paperCode = body.paperCode.trim().slice(0, 80);
      }
      if (typeof body.title === 'string' && body.title.trim()) {
        paper.title = body.title.trim().slice(0, 160).toUpperCase();
      }
      if (typeof body.purpose === 'string' && body.purpose.trim()) {
        paper.purpose = body.purpose.trim().slice(0, 600);
      }
      if (typeof body.passingScore === 'number' && Number.isFinite(body.passingScore)) {
        paper.passingScore = Math.max(40, Math.min(100, Math.round(body.passingScore)));
      }
      if (Array.isArray(body.workActivities)) {
        const cleaned = body.workActivities
          .filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
          .map((w) => w.trim().slice(0, 240));
        if (cleaned.length > 0) paper.workActivities = cleaned;
      }
      if (Array.isArray(body.references)) {
        paper.references = body.references
          .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
          .map((r) => r.trim().slice(0, 300));
      }
      if (Array.isArray(body.questions)) {
        const cleanedQs: TugasanQuestion[] = body.questions
          .filter((q): q is Record<string, unknown> => Boolean(q) && typeof q === 'object')
          .slice(0, 30)
          .map((q, idx) => ({
            id:
              typeof q.id === 'string' && q.id.trim()
                ? q.id.trim().slice(0, 48)
                : `${paper.id}-q${idx + 1}-${Date.now().toString(36)}`,
            numberLabel: `${idx + 1}.`,
            prompt: typeof q.prompt === 'string' ? q.prompt.trim().slice(0, 600) : '',
            subPrompts: Array.isArray(q.subPrompts)
              ? q.subPrompts
                  .filter((sp): sp is string => typeof sp === 'string' && sp.trim().length > 0)
                  .map((sp) => sp.trim().slice(0, 300))
              : undefined,
            maxMarks:
              typeof q.maxMarks === 'number' && Number.isFinite(q.maxMarks)
                ? Math.max(1, Math.min(50, Math.round(q.maxMarks)))
                : 4,
            rubricHint: typeof q.rubricHint === 'string' ? q.rubricHint.trim().slice(0, 800) : '',
          }))
          .filter((q) => q.prompt.length > 0);
        if (cleanedQs.length === 0) {
          res.status(400).json({ error: 'Sekurang-kurangnya satu soalan sah diperlukan.' });
          return;
        }
        paper.questions = cleanedQs;
      }
      paper.updatedAt = new Date().toISOString();
      saveStore(store);
      res.json({ paper });
    }
  );

  app.get(
    '/api/tugasan/:paperId/source-pdf',
    requireAuth,
    requireApproved,
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const user = req.authUser!;
      const paper = store.tugasanPapers.find((p) => p.id === req.params.paperId);
      if (!paper) {
        res.status(404).json({ error: 'Kertas Tugasan tidak dijumpai.' });
        return;
      }
      const cu = store.cus.find((c) => c.id === paper.cuId);
      if (!cu) {
        res.status(404).json({ error: 'Unit Kompetensi tidak dijumpai.' });
        return;
      }
      if (user.role === 'pelatih' && cu.levelId !== user.approvedLevelId) {
        res.status(403).json({ error: 'Anda tiada akses ke tahap pembelajaran ini.' });
        return;
      }

      if (paper.sourcePdfStoredName) {
        const uploadedPath = safeResolveUploadPath(paper.sourcePdfStoredName);
        if (uploadedPath && fs.existsSync(uploadedPath)) {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Cache-Control', 'no-store');
          res.sendFile(uploadedPath);
          return;
        }
      }

      if (paper.sourcePdfUrl && paper.sourcePdfUrl.startsWith('/assets/')) {
        const publicDir = path.resolve(process.cwd(), 'public');
        const rel = paper.sourcePdfUrl.replace(/^\/+/, '');
        const resolved = path.resolve(publicDir, rel);
        if (resolved.startsWith(publicDir + path.sep) && fs.existsSync(resolved)) {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Cache-Control', 'no-store');
          res.sendFile(resolved);
          return;
        }
      }

      res.status(404).json({ error: 'Fail PDF asal belum dilampirkan pada kertas tugasan ini.' });
    }
  );

  app.post(
    '/api/tugasan/:paperId/source-pdf',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    upload.single('file'),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const paper = store.tugasanPapers.find((p) => p.id === req.params.paperId);
      if (!paper) {
        res.status(404).json({ error: 'Kertas Tugasan tidak dijumpai.' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'Sila pilih fail PDF asal untuk dimuat naik.' });
        return;
      }
      const buf = req.file.buffer;
      const isPdfMagic = buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-';
      if (!isPdfMagic) {
        res.status(400).json({ error: 'Fail yang dimuat naik mestilah dokumen PDF yang sah (%PDF).' });
        return;
      }

      if (paper.sourcePdfStoredName) {
        const prevPath = safeResolveUploadPath(paper.sourcePdfStoredName);
        if (prevPath && fs.existsSync(prevPath)) {
          try {
            fs.unlinkSync(prevPath);
          } catch {
            // ignore
          }
        }
      }

      const storedName = `tug_src_${crypto.randomUUID().slice(0, 12)}.pdf`;
      const targetPath = safeResolveUploadPath(storedName);
      if (!targetPath) {
        res.status(500).json({ error: 'Gagal menyelesaikan laluan storan PDF.' });
        return;
      }
      fs.writeFileSync(targetPath, buf);

      paper.sourcePdfStoredName = storedName;
      paper.sourcePdfFileName = req.file.originalname.slice(0, 140);
      paper.updatedAt = new Date().toISOString();
      recordSystemChangeLog(store, {
        actorId: req.authUser!.id,
        actorName: req.authUser!.name,
        actorRole: req.authUser!.role,
        action: 'upload_tugasan_pdf',
        details: `Muat naik fail PDF asal "${paper.sourcePdfFileName}" untuk ${paper.paperCode}.`,
      });
      saveStore(store);
      res.json({ paper });
    }
  );

  app.delete(
    '/api/tugasan/:paperId/source-pdf',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const paper = store.tugasanPapers.find((p) => p.id === req.params.paperId);
      if (!paper) {
        res.status(404).json({ error: 'Kertas Tugasan tidak dijumpai.' });
        return;
      }
      if (paper.sourcePdfStoredName) {
        const prevPath = safeResolveUploadPath(paper.sourcePdfStoredName);
        if (prevPath && fs.existsSync(prevPath)) {
          try {
            fs.unlinkSync(prevPath);
          } catch {
            // ignore
          }
        }
      }
      delete paper.sourcePdfStoredName;
      delete paper.sourcePdfFileName;
      paper.updatedAt = new Date().toISOString();
      saveStore(store);
      res.json({ paper });
    }
  );

  app.delete(
    '/api/tugasan/:paperId',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const idx = store.tugasanPapers.findIndex((p) => p.id === req.params.paperId);
      if (idx === -1) {
        res.status(404).json({ error: 'Kertas Tugasan tidak dijumpai.' });
        return;
      }
      const [removed] = store.tugasanPapers.splice(idx, 1);
      if (removed.sourcePdfStoredName) {
        const prevPath = safeResolveUploadPath(removed.sourcePdfStoredName);
        if (prevPath && fs.existsSync(prevPath)) {
          try {
            fs.unlinkSync(prevPath);
          } catch {
            // ignore
          }
        }
      }
      store.tugasanSubmissions = store.tugasanSubmissions.filter(
        (s) => s.templateId !== removed.id
      );
      saveStore(store);
      res.json({ ok: true });
    }
  );

  // --- User & Approval Management (Pengajar & Admin) ---

  app.get(
    '/api/drive/access-registry',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    (_req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      res.json({
        users: store.users.map((u) => toPublicUser(u, store.users)),
        levels: store.levels,
      });
    }
  );

  app.get(
    '/api/drive/system-registry',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const actor = req.authUser!;
      const visibleUsers =
        actor.role === 'pengajar'
          ? store.users.filter(
              (u) =>
                u.role === 'master_admin' ||
                u.role === 'admin' ||
                u.id === actor.id ||
                (u.role === 'pelatih' &&
                  (u.supervisorId === actor.id ||
                    u.supervisorId === 'admin-root' ||
                    u.supervisorId === null))
            )
          : store.users;
      res.json({
        registry: buildDriveSystemRegistryPayload(store, { visibleUsers }),
        levels: store.levels,
        cus: store.cus,
      });
    }
  );

  app.post(
    '/api/drive/system-registry/reconcile',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const actor = req.authUser!;
      const stats = reconcileDriveSystemRegistry(store, actor, req.body);
      if (stats.updatedUsers > 0 || stats.addedLogs > 0) {
        recordSystemChangeLog(store, {
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          action: 'drive_two_way_sync',
          details: `Penyegerakan dua hala Drive selesai (${stats.updatedUsers} profil dikemaskini, ${stats.addedLogs} log ditambah).`,
        });
        saveStore(store);
      }
      const visibleUsers =
        actor.role === 'pengajar'
          ? store.users.filter(
              (u) =>
                u.role === 'master_admin' ||
                u.role === 'admin' ||
                u.id === actor.id ||
                (u.role === 'pelatih' &&
                  (u.supervisorId === actor.id ||
                    u.supervisorId === 'admin-root' ||
                    u.supervisorId === null))
            )
          : store.users;
      res.json({
        ok: true,
        stats,
        registry: buildDriveSystemRegistryPayload(store, { visibleUsers }),
      });
    }
  );

  app.get(
    '/api/users',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const user = req.authUser!;
      let list = store.users;
      if (user.role === 'pengajar') {
        list = store.users.filter(
          (u) =>
            u.role === 'pelatih' &&
            (u.supervisorId === user.id || u.supervisorId === 'admin-root' || u.supervisorId === null)
        );
      }
      res.json({
        users: list.map((u) => toPublicUser(u, store.users)),
      });
    }
  );

  app.patch(
    '/api/users/:userId/approve',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const actor = req.authUser!;
      const target = store.users.find((u) => u.id === req.params.userId);
      if (!target) {
        res.status(404).json({ error: 'Pengguna tidak dijumpai.' });
        return;
      }
      if (actor.role === 'pengajar') {
        if (
          target.role !== 'pelatih' ||
          (target.supervisorId !== actor.id && target.supervisorId !== 'admin-root' && target.supervisorId !== null)
        ) {
          res.status(403).json({ error: 'Anda hanya boleh mengurus pelatih di bawah penyeliaan anda.' });
          return;
        }
      }
      const { status, approvedLevelId } = req.body as {
        status?: unknown;
        approvedLevelId?: unknown;
      };
      if (status !== 'approved' && status !== 'pending' && status !== 'rejected') {
        res.status(400).json({ error: 'Status kelulusan tidak sah.' });
        return;
      }
      target.status = status as ApprovalStatus;
      if (status === 'approved') {
        const chosenLevel =
          typeof approvedLevelId === 'string' && store.levels.some((l) => l.id === approvedLevelId)
            ? approvedLevelId
            : target.requestedLevelId || store.levels[0]?.id || null;
        target.approvedLevelId = chosenLevel;
        if (actor.role === 'pengajar') {
          target.supervisorId = actor.id;
        }
      } else if (status === 'rejected') {
        target.approvedLevelId = null;
      }
      target.updatedAt = new Date().toISOString();
      recordSystemChangeLog(store, {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: status === 'approved' ? 'approve_user' : status === 'rejected' ? 'reject_user' : 'pending_user',
        targetUserId: target.userId,
        targetName: target.name,
        details: `Status akses ${target.name} (${target.userId}) ditukar kepada ${status.toUpperCase()}${target.approvedLevelId ? ` · Tahap: ${target.approvedLevelId}` : ''}.`,
      });
      saveStore(store);
      res.json({ user: toPublicUser(target, store.users) });
    }
  );

  app.patch(
    '/api/users/:userId/profile',
    requireAuth,
    requireApproved,
    requireRole(['pengajar', 'admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const actor = req.authUser!;
      const target = store.users.find((u) => u.id === req.params.userId);
      if (!target) {
        res.status(404).json({ error: 'Pengguna tidak dijumpai.' });
        return;
      }
      if (actor.role === 'pengajar') {
        if (
          target.role !== 'pelatih' ||
          (target.supervisorId !== actor.id && target.supervisorId !== 'admin-root' && target.supervisorId !== null)
        ) {
          res.status(403).json({ error: 'Anda hanya boleh mengemaskini maklumat pelatih di bawah penyeliaan anda.' });
          return;
        }
      }
      const { name, icNumber, email } = req.body as {
        name?: unknown;
        icNumber?: unknown;
        email?: unknown;
      };
      if (typeof name === 'string') {
        const cleanName = name.trim().slice(0, 80);
        if (cleanName.length < 2) {
          res.status(400).json({ error: 'Nama penuh mestilah sekurang-kurangnya 2 aksara.' });
          return;
        }
        target.name = cleanName;
      }
      if (typeof icNumber === 'string') {
        target.icNumber = icNumber.trim().slice(0, 20);
      }
      if (email !== undefined) {
        const emailCheck = validateOptionalEmail(email);
        if (!emailCheck.ok) {
          res.status(400).json({ error: emailCheck.error });
          return;
        }
        target.email = emailCheck.email;
      }
      target.updatedAt = new Date().toISOString();
      recordSystemChangeLog(store, {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'update_profile',
        targetUserId: target.userId,
        targetName: target.name,
        details: `Profil ${target.name} (${target.userId}) dikemaskini · No. KP: ${target.icNumber || '-'}${target.email ? ` · Emel: ${target.email}` : ''}.`,
      });
      saveStore(store);
      res.json({ user: toPublicUser(target, store.users) });
    }
  );

  // --- Full Admin & Master Admin User Management ---

  app.post(
    '/api/admin/users',
    requireAuth,
    requireApproved,
    requireRole(['admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const actor = req.authUser!;
      const { userId, name, icNumber, email, role, pin, password, status, supervisorId, approvedLevelId } = req.body as {
        userId?: unknown;
        name?: unknown;
        icNumber?: unknown;
        email?: unknown;
        role?: unknown;
        pin?: unknown;
        password?: unknown;
        status?: unknown;
        supervisorId?: unknown;
        approvedLevelId?: unknown;
      };
      if (role !== 'pelatih' && role !== 'pengajar' && role !== 'admin') {
        res.status(400).json({ error: 'Peranan mestilah pelatih, pengajar atau admin.' });
        return;
      }
      if (role === 'admin' && actor.role !== 'master_admin') {
        res.status(403).json({ error: 'Hanya Master Admin boleh menambah akaun Admin.' });
        return;
      }
      const emailCheck = validateOptionalEmail(email);
      if (!emailCheck.ok) {
        res.status(400).json({ error: emailCheck.error });
        return;
      }
      if (role === 'admin') {
        const currentAdminCount = store.users.filter((u) => u.role === 'admin').length;
        if (currentAdminCount >= 2) {
          res.status(400).json({ error: 'Had maksimum 2 akaun Admin telah dicapai.' });
          return;
        }
        if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
          res.status(400).json({ error: 'Kata laluan Admin mestilah antara 8 hingga 128 aksara.' });
          return;
        }
      } else {
        if (!isValidSixDigitPin(pin)) {
          res.status(400).json({ error: 'PIN akses mestilah 6 digit nombor.' });
          return;
        }
      }
      if (!isValidUserId(userId)) {
        res.status(400).json({
          error: 'User ID mestilah 3 hingga 32 aksara (huruf, nombor, titik, garis bawah atau sengkang).',
        });
        return;
      }
      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
        res.status(400).json({ error: 'Nama penuh tidak sah.' });
        return;
      }
      const cleanUserId = userId.trim();
      const cleanName = name.trim();
      const cleanIcNumber =
        typeof icNumber === 'string' ? icNumber.trim().slice(0, 20) : '';
      if (store.users.some((u) => u.userId.trim().toLowerCase() === cleanUserId.toLowerCase())) {
        res.status(409).json({ error: `User ID "${cleanUserId}" telah wujud.` });
        return;
      }
      const now = new Date().toISOString();
      const validStatus: ApprovalStatus =
        role === 'admin'
          ? 'approved'
          : status === 'pending' || status === 'rejected' || status === 'approved'
          ? status
          : 'approved';
      const validLevel =
        typeof approvedLevelId === 'string' && store.levels.some((l) => l.id === approvedLevelId)
          ? approvedLevelId
          : store.levels[0]?.id || null;

      const created: StoredUser = {
        id: role === 'admin' ? `admin-${crypto.randomUUID().slice(0, 6)}` : `usr-${crypto.randomUUID().slice(0, 8)}`,
        userId: cleanUserId,
        name: cleanName,
        icNumber: cleanIcNumber,
        email: emailCheck.email,
        role,
        status: validStatus,
        pinHash: role === 'admin' ? undefined : hashSecret(pin as string),
        passwordHash: role === 'admin' ? hashSecret(password as string) : undefined,
        supervisorId:
          role === 'pelatih' && typeof supervisorId === 'string' && supervisorId ? supervisorId : null,
        requestedLevelId: role === 'pelatih' ? validLevel : null,
        approvedLevelId: role === 'pelatih' && validStatus === 'approved' ? validLevel : null,
        createdAt: now,
        updatedAt: now,
      };
      store.users.push(created);
      recordSystemChangeLog(store, {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'admin_create_user',
        targetUserId: created.userId,
        targetName: created.name,
        details: `Akaun baharu ${created.role.toUpperCase()} dicipta (${created.userId}${created.email ? ` · ${created.email}` : ''}).`,
      });
      saveStore(store);
      res.status(201).json({ user: toPublicUser(created, store.users) });
    }
  );

  app.patch(
    '/api/admin/users/:userId',
    requireAuth,
    requireApproved,
    requireRole(['admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const actor = req.authUser!;
      const target = store.users.find((u) => u.id === req.params.userId);
      if (!target) {
        res.status(404).json({ error: 'Pengguna tidak dijumpai.' });
        return;
      }
      if (target.id === 'admin-root' || target.role === 'master_admin') {
        res.status(400).json({ error: 'Akaun Master Admin tidak boleh diubah atau ditukar peranannya di sini.' });
        return;
      }
      const { userId: nextUserId, name, icNumber, email, role, status, supervisorId, approvedLevelId, newPin, newPassword } =
        req.body as {
          userId?: unknown;
          name?: unknown;
          icNumber?: unknown;
          email?: unknown;
          role?: unknown;
          status?: unknown;
          supervisorId?: unknown;
          approvedLevelId?: unknown;
          newPin?: unknown;
          newPassword?: unknown;
        };

      if ((target.role === 'admin' || role === 'admin') && actor.role !== 'master_admin') {
        res.status(403).json({ error: 'Hanya Master Admin boleh mengurus akaun Admin.' });
        return;
      }
      if (role === 'admin' && target.role !== 'admin') {
        const currentAdminCount = store.users.filter((u) => u.role === 'admin').length;
        if (currentAdminCount >= 2) {
          res.status(400).json({ error: 'Had maksimum 2 akaun Admin telah dicapai.' });
          return;
        }
      }
      if (email !== undefined) {
        const emailCheck = validateOptionalEmail(email);
        if (!emailCheck.ok) {
          res.status(400).json({ error: emailCheck.error });
          return;
        }
        target.email = emailCheck.email;
      }

      if (typeof nextUserId === 'string' && nextUserId.trim() !== '') {
        if (!isValidUserId(nextUserId)) {
          res.status(400).json({
            error: 'User ID mestilah 3 hingga 32 aksara (huruf, nombor, titik, garis bawah atau sengkang).',
          });
          return;
        }
        const cleanNext = nextUserId.trim();
        const conflict = store.users.find(
          (u) => u.id !== target.id && u.userId.trim().toLowerCase() === cleanNext.toLowerCase()
        );
        if (conflict) {
          res.status(409).json({ error: `User ID "${cleanNext}" sudah digunakan.` });
          return;
        }
        target.userId = cleanNext;
      }
      if (typeof name === 'string' && name.trim().length >= 2) {
        target.name = name.trim().slice(0, 80);
      }
      if (typeof icNumber === 'string') {
        target.icNumber = icNumber.trim().slice(0, 20);
      }
      if (role === 'pelatih' || role === 'pengajar' || (role === 'admin' && actor.role === 'master_admin')) {
        target.role = role;
      }
      if (target.role === 'admin') {
        target.status = 'approved';
        target.supervisorId = null;
        target.requestedLevelId = null;
        target.approvedLevelId = null;
        if (typeof newPassword === 'string' && newPassword.trim() !== '') {
          if (newPassword.length < 8 || newPassword.length > 128) {
            res.status(400).json({ error: 'Kata laluan Admin baharu mestilah 8 hingga 128 aksara.' });
            return;
          }
          target.passwordHash = hashSecret(newPassword);
        } else if (!target.passwordHash) {
          res.status(400).json({ error: 'Sila tetapkan kata laluan (minimum 8 aksara) untuk akaun Admin ini.' });
          return;
        }
      } else {
        if (status === 'pending' || status === 'approved' || status === 'rejected') {
          target.status = status;
        }
        if (typeof supervisorId === 'string' || supervisorId === null) {
          target.supervisorId = supervisorId || null;
        }
        if (typeof approvedLevelId === 'string' || approvedLevelId === null) {
          target.approvedLevelId =
            approvedLevelId && store.levels.some((l) => l.id === approvedLevelId) ? approvedLevelId : null;
        }
        if (typeof newPin === 'string' && newPin.trim() !== '') {
          if (!isValidSixDigitPin(newPin)) {
            res.status(400).json({ error: 'PIN baharu mestilah 6 digit nombor.' });
            return;
          }
          target.pinHash = hashSecret(newPin);
        }
      }
      target.updatedAt = new Date().toISOString();
      recordSystemChangeLog(store, {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'admin_update_user',
        targetUserId: target.userId,
        targetName: target.name,
        details: `Maklumat ${target.name} (${target.userId}) dikemaskini · Peranan: ${target.role.toUpperCase()} · Status: ${target.status.toUpperCase()}${target.email ? ` · ${target.email}` : ''}.`,
      });
      saveStore(store);
      res.json({ user: toPublicUser(target, store.users) });
    }
  );

  app.delete(
    '/api/admin/users/:userId',
    requireAuth,
    requireApproved,
    requireRole(['admin', 'master_admin']),
    (req: AuthenticatedRequest, res: Response) => {
      const store = loadStore();
      const actor = req.authUser!;
      const idx = store.users.findIndex((u) => u.id === req.params.userId);
      if (idx === -1) {
        res.status(404).json({ error: 'Pengguna tidak dijumpai.' });
        return;
      }
      const target = store.users[idx];
      if (target.id === 'admin-root' || target.role === 'master_admin') {
        res.status(400).json({ error: 'Akaun Master Admin tidak boleh dipadam.' });
        return;
      }
      if (target.role === 'admin' && actor.role !== 'master_admin') {
        res.status(403).json({ error: 'Hanya Master Admin boleh memadam akaun Admin.' });
        return;
      }
      store.users.splice(idx, 1);
      store.sessions = store.sessions.filter((s) => s.userId !== req.params.userId);
      recordSystemChangeLog(store, {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action: 'admin_delete_user',
        targetUserId: target.userId,
        targetName: target.name,
        details: `Akaun ${target.name} (${target.userId} · ${target.role.toUpperCase()}) dipadam oleh pentadbir.`,
      });
      saveStore(store);
      res.json({ ok: true });
    }
  );

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'Saiz fail melebihi had maksimum 15MB.' });
        return;
      }
      res.status(400).json({ error: `Ralat muat naik fail: ${err.message}` });
      return;
    }
    next(err);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

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
  DEFAULT_PAYMENT_QR_TITLE,
  DEFAULT_PORTAL_NAME,
  DEFAULT_PORTAL_TAGLINE,
  DEFAULT_SUB_TITLES,
  DEFAULT_WHATSAPP_QR_TITLE,
  UPLOADS_DIR,
  hashSecret,
  hashToken,
  loadStore,
  saveStore,
  toPublicBranding,
  toPublicUser,
  verifyPlainEnvSecret,
  verifySecret,
} from './server/store.ts';
import type { StoredUser } from './server/store.ts';
import type {
  AccessLogEntry,
  ApprovalStatus,
  CUModule,
  FileMetadata,
  FileSlotType,
  SopCategory,
  SopStep,
  SubKey,
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
    const { role, userId, name, pin, supervisorId, requestedLevelId } = req.body as {
      role?: unknown;
      userId?: unknown;
      name?: unknown;
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
    if (!isValidSixDigitPin(pin)) {
      res.status(400).json({ error: 'PIN akses mestilah tepat 6 digit nombor.' });
      return;
    }
    const cleanUserId = userId.trim();
    const cleanName = name.trim();
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

    const teachers = store.users
      .filter((u) => u.role === 'pengajar' && u.status === 'approved')
      .map((u) => ({ id: u.id, name: u.name }));

    res.json({
      levels,
      cus,
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
      store.cus = store.cus.filter((c) => c.levelId !== req.params.id);
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
        teoriSub1: {
          notaSlot: null,
          panduanSoalanSlot: null,
          googleFormUrl: '',
          googleFormTitle: `Latihan Teori Sub 1 — ${cleanCode}: ${cleanTitle}`.slice(0, 140),
        },
        teoriSub2: {
          notaSlot: null,
          panduanSoalanSlot: null,
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
      'open_form',
      'view_sop',
      'complete_sop',
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

  // --- User & Approval Management (Pengajar & Admin) ---

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
      const { userId, name, role, pin, password, status, supervisorId, approvedLevelId } = req.body as {
        userId?: unknown;
        name?: unknown;
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
      const { userId: nextUserId, name, role, status, supervisorId, approvedLevelId, newPin, newPassword } =
        req.body as {
          userId?: unknown;
          name?: unknown;
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

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AccessLogEntry,
  ApprovalStatus,
  BrandingConfig,
  CUModule,
  FileMetadata,
  PublicUser,
  SopCheckProgress,
  SopStep,
  TopicLevel,
  UserRole,
} from '../src/types.ts';

export interface StoredUser {
  id: string;
  userId: string;
  name: string;
  email?: string;
  role: UserRole;
  status: ApprovalStatus;
  pinHash?: string;
  passwordHash?: string | null;
  supervisorId: string | null;
  requestedLevelId: string | null;
  approvedLevelId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  expiresAt: number;
}

export interface StoredBranding {
  portalName: string;
  portalTagline: string;
  heroHeadline: string;
  feature1Title: string;
  feature1Desc: string;
  feature2Title: string;
  feature2Desc: string;
  feature3Title: string;
  feature3Desc: string;
  authGateTitle: string;
  authGateSubtitle: string;
  welcomePrefix: string;
  footerCaption: string;
  pendingTitle: string;
  pendingMessage: string;
  customLogoStoredName: string | null;
  customLogoMimeType: string | null;
  customBannerStoredName: string | null;
  customBannerMimeType: string | null;
  paymentQrStoredName: string | null;
  paymentQrMimeType: string | null;
  paymentQrTitle: string;
  paymentQrNote: string;
  whatsappQrStoredName: string | null;
  whatsappQrMimeType: string | null;
  whatsappQrTitle: string;
  whatsappQrNote: string;
  whatsappUrl: string;
  updatedAt: string;
}

export interface AppStore {
  adminEmail: string;
  adminPasswordHash: string | null;
  branding: StoredBranding;
  users: StoredUser[];
  levels: TopicLevel[];
  cus: CUModule[];
  sopProgress: SopCheckProgress[];
  accessLogs: AccessLogEntry[];
  sessions: SessionRecord[];
}

export const ADMIN_EMAIL = 'azwan26211121@gmail.com';
export const DEFAULT_PORTAL_NAME = 'SIRKING Learning Portal';
export const DEFAULT_PORTAL_TAGLINE = 'Your Gateway to Knowledge & Success';
export const DEFAULT_BRANDING_TEXTS = {
  heroHeadline: 'Platform Panduan Pembelajaran, Latihan Teori & SOP Latihan',
  feature1Title: '01. Folder Teori & Nota',
  feature1Desc:
    'Setiap tahap dibahagikan kepada 2 Sub Teori dengan slot Word dan PDF mengikut CU.',
  feature2Title: '02. Latihan Google Form',
  feature2Desc:
    'Akses borang latihan teori secara terus di dalam portal tanpa mencari pautan luaran.',
  feature3Title: '03. SOP Bengkel Amali',
  feature3Desc:
    '2 Sub Amali dengan langkah kerja, peraturan LOTO, PCD, PPE dan senarai semak amali.',
  authGateTitle: 'Gerbang Akses Portal',
  authGateSubtitle:
    'Log masuk untuk Pelatih dan Pengajar menggunakan User ID serta PIN akses 6 digit.',
  welcomePrefix: 'Selamat Datang',
  footerCaption: 'Imbas QR Pembayaran atau QR WhatsApp rasmi di bawah portal',
  pendingTitle: 'Menunggu Kelulusan Pengajar',
  pendingMessage:
    'Pendaftaran akaun anda telah direkodkan. Kandungan nota, latihan Google Form, dan SOP bengkel akan dibuka sebaik sahaja pengajar penyelia meluluskan akaun anda.',
};
export const DEFAULT_LOGO_URL = '/assets/aistudio/logo_sir_king_portal_93f80572.jpeg';
export const DEFAULT_BANNER_URL = '/assets/sirking_banner_full.jpeg';
export const DEFAULT_PAYMENT_QR_TITLE = 'QR Pembayaran';
export const DEFAULT_PAYMENT_QR_NOTE = 'Imbas QR untuk bayaran rasmi portal.';
export const DEFAULT_WHATSAPP_QR_TITLE = 'QR WhatsApp';
export const DEFAULT_WHATSAPP_QR_NOTE = 'Imbas QR untuk hubungi kami di WhatsApp.';
export const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const STORE_PATH = path.resolve(DATA_DIR, 'store.json');

export const DEFAULT_SUB_TITLES = {
  teoriSub1Title: 'Sub 1: Konsep Asas & Nota Teras',
  teoriSub2Title: 'Sub 2: Aplikasi Lanjutan & Panduan Soalan',
  amaliSub1Title: 'Sub 1: Persediaan & Keselamatan (LOTO · PPE)',
  amaliSub2Title: 'Sub 2: Pelaksanaan Kerja & Pengujian (PCD)',
};

function ensureDirectories(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export function hashSecret(value: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(value, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(value: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(value, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function verifyPlainEnvSecret(input: string, envSecret: string): boolean {
  const hashA = crypto.createHash('sha256').update(input).digest();
  const hashB = crypto.createHash('sha256').update(envSecret).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createInitialData(): AppStore {
  const now = new Date().toISOString();

  const levels: TopicLevel[] = [
    {
      id: 'lvl-2',
      code: 'TAHAP 2',
      title: 'Asas Pemasangan & Penyelenggaraan Bengkel',
      description: 'Pengenalan komponen asas, lukisan skematik, keselamatan bengkel, dan amali pemasangan asas.',
      order: 1,
      teoriSub1Title: 'Sub 1: Asas Teori & Prinsip Komponen',
      teoriSub2Title: 'Sub 2: Bacaan Skematik & Penilaian Teori',
      amaliSub1Title: 'Sub 1: Persediaan Bengkel & Keselamatan (LOTO · PPE)',
      amaliSub2Title: 'Sub 2: Pemasangan Asas & Semakan PCD',
    },
    {
      id: 'lvl-3',
      code: 'TAHAP 3',
      title: 'Kawalan Industri & Penyeliaan Teknikal',
      description: 'Sistem kawalan motor, litar automasi PLC, pengujian litar berbeban, dan prosedur LOTO.',
      order: 2,
      teoriSub1Title: 'Sub 1: Prinsip Kawalan & Litar Kuasa',
      teoriSub2Title: 'Sub 2: Logik Automasi & Kajian Kes Teori',
      amaliSub1Title: 'Sub 1: Pengasingan LOTO & Persediaan Panel',
      amaliSub2Title: 'Sub 2: Pendawaian Kawalan & Ujian Beban (PCD)',
    },
    {
      id: 'lvl-4',
      code: 'TAHAP 4',
      title: 'Pengurusan Sistem & Diagnostik Lanjutan',
      description: 'Audit keselamatan menyeluruh, pengesanan kerosakan lanjutan, dan pengurusan SOP operasi.',
      order: 3,
      teoriSub1Title: 'Sub 1: Analisis Sistem & Piawaian Operasi',
      teoriSub2Title: 'Sub 2: Metodologi Diagnostik & Penilaian',
      amaliSub1Title: 'Sub 1: Permit Kerja, LOTO Berbilang & PPE Khusus',
      amaliSub2Title: 'Sub 2: Pengesanan Kerosakan & Audit SOP',
    },
  ];

  // All document slots (Nota, Panduan Soalan, Dokumen SOP) remain NULL by default
  const cus: CUModule[] = [
    {
      id: 'cu-201',
      levelId: 'lvl-2',
      code: 'CU-01',
      title: 'Keselamatan Bengkel & Peraturan PPE Asas',
      description: 'Memahami piawaian keselamatan bengkel, penggunaan PPE yang betul, dan tatacara pengasingan asas.',
      order: 1,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — CU-01: Piawaian PPE & Hazard',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — CU-01: Prosedur Kecemasan Bengkel',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-201-1a',
            category: 'PPE',
            title: 'Pemeriksaan PPE Lengkap',
            instruction: 'Pastikan kasut keselamatan bertutup, cermin mata pelindung, dan sarung tangan berpenebat dipakai sebelum memasuki zon kerja.',
            critical: true,
          },
          {
            id: 'sop-201-1b',
            category: 'LOTO',
            title: 'Pengesahan Suis Utama & Lock-Out',
            instruction: 'Matikan suis bekalan utama, pasang kunci LOTO peribadi, dan gantung tag amaran bertulis nama pelatih.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-201-2a',
            category: 'PCD',
            title: 'Semakan Peranti Perlindungan (PCD)',
            instruction: 'Uji butang tekan RCCB/ELCB dan pastikan peranti pemutus litar berfungsi sebelum menghidupkan beban.',
            critical: true,
          },
          {
            id: 'sop-201-2b',
            category: 'Langkah Kerja',
            title: 'Pengemasan Stesen Kerja Selepas Amali',
            instruction: 'Susun semula alatan tangan, matikan bekalan kuasa latihan, dan rekod status peralatan.',
            critical: false,
          },
        ],
      },
    },
    {
      id: 'cu-202',
      levelId: 'lvl-2',
      code: 'CU-02',
      title: 'Lukisan Skematik & Pengukuran Komponen',
      description: 'Membaca simbol piawai industri serta mengendalikan multimeter dan penguji penebatan dengan tepat.',
      order: 2,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — CU-02: Simbol & Lukisan Skematik',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — CU-02: Teknik Pengukuran & Ralat',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-202-1a',
            category: 'PCD',
            title: 'Kalibrasi & Julat Alat Ukur',
            instruction: 'Pastikan probe multimeter bebas kerosakan penebat dan tetapkan julat pengukuran yang betul sebelum menyentuh terminal.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-202-2a',
            category: 'Langkah Kerja',
            title: 'Ujian Kesinambungan Litar Mati',
            instruction: 'Sahkan ketiadaan voltan menggunakan penguji voltan sebelum menjalankan ujian rintangan dan kesinambungan.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-301',
      levelId: 'lvl-3',
      code: 'CU-01',
      title: 'Kawalan Motor Tiga Fasa & Pemula DOL',
      description: 'Pendawaian litar kuasa dan litar kawalan pemula terus pada talian (DOL) serta pengujian beban.',
      order: 1,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — CU-01: Litar Kuasa Tiga Fasa',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — CU-01: Litar Kawalan & Geganti DOL',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-301-1a',
            category: 'LOTO',
            title: 'Pengasingan Bekalan Tiga Fasa (LOTO)',
            instruction: 'Asingkan isolator 3-fasa, kunci pemutus litar utama, dan sahkan voltan sifar (L1-L2-L3-N-PE).',
            critical: true,
          },
          {
            id: 'sop-301-1b',
            category: 'PPE',
            title: 'Perlindungan Arka & Ruang Selamat',
            instruction: 'Pastikan PPE lengkap dan kawasan panel bebas halangan sebelum kerja pendawaian bermula.',
            critical: false,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-301-2a',
            category: 'PCD',
            title: 'Pelarasan Geganti Beban Lampau (TOR)',
            instruction: 'Tetapkan arus beban lampau mengikut plat nama motor sebelum ujian pengaktifan.',
            critical: true,
          },
          {
            id: 'sop-301-2b',
            category: 'Langkah Kerja',
            title: 'Ujian Arah Putaran & Arus Permulaan',
            instruction: 'Jalankan ujian tanpa beban dengan pengawasan pengajar dan catatkan bacaan arus setiap fasa.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-302',
      levelId: 'lvl-3',
      code: 'CU-02',
      title: 'Asas Pengaturcaraan PLC & Sensor Industri',
      description: 'Pembangunan gambar rajah tangga (Ladder Diagram), penyambungan I/O, dan simulasi jujukan automasi.',
      order: 2,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — CU-02: Senibina PLC & I/O',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — CU-02: Pengaturcaraan Ladder Diagram',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-302-1a',
            category: 'PCD',
            title: 'Perlindungan Bekalan Kuasa 24V DC',
            instruction: 'Semak kekutuban +24V/0V dan fius perlindungan modul input/output PLC sebelum memuat naik atur cara.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-302-2a',
            category: 'Langkah Kerja',
            title: 'Ujian Butang Henti Kecemasan (E-Stop)',
            instruction: 'Sahkan litar E-Stop berfungsi memutuskan kuasa aktuator secara fizikal dan logik.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-401',
      levelId: 'lvl-4',
      code: 'CU-01',
      title: 'Diagnostik Kerosakan & Audit Keselamatan SOP',
      description: 'Kaedah mencari punca kerosakan sistematik, analisis kegagalan sistem, dan penyediaan laporan audit.',
      order: 1,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — CU-01: Piawaian Audit Keselamatan',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — CU-01: Analisis Punca Kerosakan',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-401-1a',
            category: 'LOTO',
            title: 'Permit Kerja & Pengasingan Berbilang Punca',
            instruction: 'Lengkapkan borang permit kerja selamat dan kunci semua punca tenaga elektrik serta pneumatik.',
            critical: true,
          },
          {
            id: 'sop-401-1b',
            category: 'PPE',
            title: 'Peralatan Perlindungan Diagnostik Voltan',
            instruction: 'Gunakan sarung tangan berpenebat Kelas 0 dan pelindung muka semasa pengukuran litar hidup yang dibenarkan.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-401-2a',
            category: 'Langkah Kerja',
            title: 'Verifikasi Pemulihan & Laporan Audit',
            instruction: 'Uji kefungsian penuh sistem selepas pembaikan dan rekodkan bacaan akhir sebelum menanggalkan LOTO.',
            critical: true,
          },
        ],
      },
    },
  ];

  const users: StoredUser[] = [
    {
      id: 'admin-root',
      userId: 'Master_admin',
      name: 'Master Admin',
      email: ADMIN_EMAIL,
      role: 'master_admin',
      status: 'approved',
      supervisorId: null,
      requestedLevelId: null,
      approvedLevelId: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'admin-1',
      userId: 'admin1',
      name: 'Admin 1',
      role: 'admin',
      status: 'approved',
      passwordHash: null,
      supervisorId: null,
      requestedLevelId: null,
      approvedLevelId: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'admin-2',
      userId: 'admin2',
      name: 'Admin 2',
      role: 'admin',
      status: 'approved',
      passwordHash: null,
      supervisorId: null,
      requestedLevelId: null,
      approvedLevelId: null,
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    adminEmail: ADMIN_EMAIL,
    adminPasswordHash: null,
    branding: {
      portalName: DEFAULT_PORTAL_NAME,
      portalTagline: DEFAULT_PORTAL_TAGLINE,
      ...DEFAULT_BRANDING_TEXTS,
      customLogoStoredName: null,
      customLogoMimeType: null,
      customBannerStoredName: null,
      customBannerMimeType: null,
      paymentQrStoredName: null,
      paymentQrMimeType: null,
      paymentQrTitle: DEFAULT_PAYMENT_QR_TITLE,
      paymentQrNote: DEFAULT_PAYMENT_QR_NOTE,
      whatsappQrStoredName: null,
      whatsappQrMimeType: null,
      whatsappQrTitle: DEFAULT_WHATSAPP_QR_TITLE,
      whatsappQrNote: DEFAULT_WHATSAPP_QR_NOTE,
      whatsappUrl: '',
      updatedAt: now,
    },
    users,
    levels,
    cus,
    sopProgress: [],
    accessLogs: [],
    sessions: [],
  };
}

function normalizeStore(raw: Record<string, unknown>): { store: AppStore; migrated: boolean } {
  let migrated = false;
  const base = raw as unknown as AppStore;

  const levels = (base.levels || []).map((lvl) => {
    const record = lvl as TopicLevel & Partial<typeof DEFAULT_SUB_TITLES>;
    if (
      !record.teoriSub1Title ||
      !record.teoriSub2Title ||
      !record.amaliSub1Title ||
      !record.amaliSub2Title
    ) {
      migrated = true;
      return {
        ...record,
        teoriSub1Title: record.teoriSub1Title || DEFAULT_SUB_TITLES.teoriSub1Title,
        teoriSub2Title: record.teoriSub2Title || DEFAULT_SUB_TITLES.teoriSub2Title,
        amaliSub1Title: record.amaliSub1Title || DEFAULT_SUB_TITLES.amaliSub1Title,
        amaliSub2Title: record.amaliSub2Title || DEFAULT_SUB_TITLES.amaliSub2Title,
      };
    }
    return record;
  });

  const cus = (base.cus || []).map((item) => {
    const legacy = item as unknown as CUModule & {
      notaSlot?: FileMetadata | null;
      panduanSoalanSlot?: FileMetadata | null;
      googleFormUrl?: string;
      googleFormTitle?: string;
      sopDocSlot?: FileMetadata | null;
      sopSteps?: SopStep[];
    };
    if (!legacy.teoriSub1 || !legacy.teoriSub2 || !legacy.amaliSub1 || !legacy.amaliSub2) {
      migrated = true;
      return {
        id: legacy.id,
        levelId: legacy.levelId,
        code: legacy.code,
        title: legacy.title,
        description: legacy.description || '',
        order: legacy.order || 1,
        teoriSub1: legacy.teoriSub1 || {
          notaSlot: legacy.notaSlot ?? null,
          panduanSoalanSlot: legacy.panduanSoalanSlot ?? null,
          googleFormUrl: legacy.googleFormUrl ?? '',
          googleFormTitle: legacy.googleFormTitle || `Latihan Teori Sub 1 — ${legacy.code}`,
        },
        teoriSub2: legacy.teoriSub2 || {
          notaSlot: null,
          panduanSoalanSlot: null,
          googleFormUrl: '',
          googleFormTitle: `Latihan Teori Sub 2 — ${legacy.code}`,
        },
        amaliSub1: legacy.amaliSub1 || {
          sopDocSlot: legacy.sopDocSlot ?? null,
          sopSteps: Array.isArray(legacy.sopSteps) ? legacy.sopSteps : [],
        },
        amaliSub2: legacy.amaliSub2 || {
          sopDocSlot: null,
          sopSteps: [],
        },
      };
    }
    return legacy;
  });

  const sopProgress = (base.sopProgress || []).map((p) => {
    if (!p.subKey) {
      migrated = true;
      return { ...p, subKey: 'sub1' as const };
    }
    return p;
  });

  let users = (base.users || []).map((u) => {
    const record = u as StoredUser & { userId?: string };
    if (record.id === 'admin-root' && record.role !== 'master_admin') {
      migrated = true;
      return {
        ...record,
        role: 'master_admin' as const,
        userId: 'Master_admin',
        name: record.name === 'Admin Website' ? 'Master Admin' : record.name,
      };
    }
    if (!record.userId) {
      migrated = true;
      const fallback =
        record.role === 'master_admin'
          ? 'Master_admin'
          : record.name
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9._-]+/g, '.')
              .replace(/^\.+|\.+$/g, '') || record.id;
      return { ...record, userId: fallback };
    }
    return record;
  });

  // Ensure 1 master_admin and 2 admin accounts exist
  const nowIso = new Date().toISOString();
  if (!users.some((u) => u.role === 'master_admin')) {
    migrated = true;
    users.unshift({
      id: 'admin-root',
      userId: 'Master_admin',
      name: 'Master Admin',
      email: ADMIN_EMAIL,
      role: 'master_admin',
      status: 'approved',
      supervisorId: null,
      requestedLevelId: null,
      approvedLevelId: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }
  const existingAdmins = users.filter((u) => u.role === 'admin');
  if (existingAdmins.length < 2) {
    migrated = true;
    const needed = 2 - existingAdmins.length;
    for (let i = 1; i <= needed; i++) {
      const candidateNum = existingAdmins.length + i;
      const candidateId = `admin-${candidateNum}`;
      const candidateUserId = `admin${candidateNum}`;
      users.push({
        id: users.some((u) => u.id === candidateId) ? `admin-${crypto.randomUUID().slice(0, 6)}` : candidateId,
        userId: users.some((u) => u.userId.toLowerCase() === candidateUserId)
          ? `admin_${crypto.randomUUID().slice(0, 4)}`
          : candidateUserId,
        name: `Admin ${candidateNum}`,
        role: 'admin',
        status: 'approved',
        passwordHash: null,
        supervisorId: null,
        requestedLevelId: null,
        approvedLevelId: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
  }

  const now = Date.now();
  const sessions = (base.sessions || []).filter((s) => s.expiresAt > now);

  let branding: StoredBranding;
  if (!base.branding) {
    migrated = true;
    branding = {
      portalName: DEFAULT_PORTAL_NAME,
      portalTagline: DEFAULT_PORTAL_TAGLINE,
      ...DEFAULT_BRANDING_TEXTS,
      customLogoStoredName: null,
      customLogoMimeType: null,
      customBannerStoredName: null,
      customBannerMimeType: null,
      paymentQrStoredName: null,
      paymentQrMimeType: null,
      paymentQrTitle: DEFAULT_PAYMENT_QR_TITLE,
      paymentQrNote: DEFAULT_PAYMENT_QR_NOTE,
      whatsappQrStoredName: null,
      whatsappQrMimeType: null,
      whatsappQrTitle: DEFAULT_WHATSAPP_QR_TITLE,
      whatsappQrNote: DEFAULT_WHATSAPP_QR_NOTE,
      whatsappUrl: '',
      updatedAt: nowIso,
    };
  } else {
    if (
      base.branding.paymentQrStoredName === undefined ||
      base.branding.paymentQrTitle === undefined ||
      base.branding.paymentQrNote === undefined ||
      base.branding.whatsappQrStoredName === undefined ||
      base.branding.whatsappQrTitle === undefined ||
      base.branding.whatsappQrNote === undefined ||
      base.branding.whatsappUrl === undefined ||
      base.branding.heroHeadline === undefined ||
      base.branding.feature1Title === undefined ||
      base.branding.authGateTitle === undefined ||
      base.branding.welcomePrefix === undefined ||
      base.branding.footerCaption === undefined ||
      base.branding.pendingTitle === undefined
    ) {
      migrated = true;
    }
    branding = {
      portalName: base.branding.portalName || DEFAULT_PORTAL_NAME,
      portalTagline: base.branding.portalTagline || DEFAULT_PORTAL_TAGLINE,
      heroHeadline: base.branding.heroHeadline || DEFAULT_BRANDING_TEXTS.heroHeadline,
      feature1Title: base.branding.feature1Title || DEFAULT_BRANDING_TEXTS.feature1Title,
      feature1Desc: base.branding.feature1Desc || DEFAULT_BRANDING_TEXTS.feature1Desc,
      feature2Title: base.branding.feature2Title || DEFAULT_BRANDING_TEXTS.feature2Title,
      feature2Desc: base.branding.feature2Desc || DEFAULT_BRANDING_TEXTS.feature2Desc,
      feature3Title: base.branding.feature3Title || DEFAULT_BRANDING_TEXTS.feature3Title,
      feature3Desc: base.branding.feature3Desc || DEFAULT_BRANDING_TEXTS.feature3Desc,
      authGateTitle: base.branding.authGateTitle || DEFAULT_BRANDING_TEXTS.authGateTitle,
      authGateSubtitle: base.branding.authGateSubtitle || DEFAULT_BRANDING_TEXTS.authGateSubtitle,
      welcomePrefix: base.branding.welcomePrefix || DEFAULT_BRANDING_TEXTS.welcomePrefix,
      footerCaption: base.branding.footerCaption || DEFAULT_BRANDING_TEXTS.footerCaption,
      pendingTitle: base.branding.pendingTitle || DEFAULT_BRANDING_TEXTS.pendingTitle,
      pendingMessage: base.branding.pendingMessage || DEFAULT_BRANDING_TEXTS.pendingMessage,
      customLogoStoredName: base.branding.customLogoStoredName ?? null,
      customLogoMimeType: base.branding.customLogoMimeType ?? null,
      customBannerStoredName: base.branding.customBannerStoredName ?? null,
      customBannerMimeType: base.branding.customBannerMimeType ?? null,
      paymentQrStoredName: base.branding.paymentQrStoredName ?? null,
      paymentQrMimeType: base.branding.paymentQrMimeType ?? null,
      paymentQrTitle: base.branding.paymentQrTitle || DEFAULT_PAYMENT_QR_TITLE,
      paymentQrNote: base.branding.paymentQrNote ?? DEFAULT_PAYMENT_QR_NOTE,
      whatsappQrStoredName: base.branding.whatsappQrStoredName ?? null,
      whatsappQrMimeType: base.branding.whatsappQrMimeType ?? null,
      whatsappQrTitle: base.branding.whatsappQrTitle || DEFAULT_WHATSAPP_QR_TITLE,
      whatsappQrNote: base.branding.whatsappQrNote ?? DEFAULT_WHATSAPP_QR_NOTE,
      whatsappUrl: base.branding.whatsappUrl ?? '',
      updatedAt: base.branding.updatedAt || nowIso,
    };
  }

  return {
    store: {
      adminEmail: base.adminEmail || ADMIN_EMAIL,
      adminPasswordHash: base.adminPasswordHash ?? null,
      branding,
      users,
      levels,
      cus,
      sopProgress,
      accessLogs: base.accessLogs || [],
      sessions,
    },
    migrated,
  };
}

export function loadStore(): AppStore {
  ensureDirectories();
  if (!fs.existsSync(STORE_PATH)) {
    const initial = createInitialData();
    saveStore(initial);
    return initial;
  }
  try {
    const rawText = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const { store, migrated } = normalizeStore(parsed);
    if (migrated) {
      saveStore(store);
    }
    return store;
  } catch {
    const initial = createInitialData();
    saveStore(initial);
    return initial;
  }
}

export function saveStore(store: AppStore): void {
  ensureDirectories();
  const tempPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tempPath, STORE_PATH);
}

export function toPublicUser(user: StoredUser, allUsers: StoredUser[]): PublicUser {
  const supervisor = user.supervisorId
    ? allUsers.find((u) => u.id === user.supervisorId)
    : undefined;
  return {
    id: user.id,
    userId: user.userId,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    passwordConfigured: user.role === 'admin' ? Boolean(user.passwordHash) : undefined,
    supervisorId: user.supervisorId,
    supervisorName: supervisor ? supervisor.name : null,
    requestedLevelId: user.requestedLevelId,
    approvedLevelId: user.approvedLevelId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function toPublicBranding(store: AppStore): BrandingConfig {
  const ver = encodeURIComponent(store.branding.updatedAt);
  const hasCustomLogo = Boolean(store.branding.customLogoStoredName);
  const hasCustomBanner = Boolean(store.branding.customBannerStoredName);
  const hasPaymentQr = Boolean(store.branding.paymentQrStoredName);
  const hasWhatsappQr = Boolean(store.branding.whatsappQrStoredName);
  return {
    portalName: store.branding.portalName,
    portalTagline: store.branding.portalTagline,
    heroHeadline: store.branding.heroHeadline || DEFAULT_BRANDING_TEXTS.heroHeadline,
    feature1Title: store.branding.feature1Title || DEFAULT_BRANDING_TEXTS.feature1Title,
    feature1Desc: store.branding.feature1Desc || DEFAULT_BRANDING_TEXTS.feature1Desc,
    feature2Title: store.branding.feature2Title || DEFAULT_BRANDING_TEXTS.feature2Title,
    feature2Desc: store.branding.feature2Desc || DEFAULT_BRANDING_TEXTS.feature2Desc,
    feature3Title: store.branding.feature3Title || DEFAULT_BRANDING_TEXTS.feature3Title,
    feature3Desc: store.branding.feature3Desc || DEFAULT_BRANDING_TEXTS.feature3Desc,
    authGateTitle: store.branding.authGateTitle || DEFAULT_BRANDING_TEXTS.authGateTitle,
    authGateSubtitle: store.branding.authGateSubtitle || DEFAULT_BRANDING_TEXTS.authGateSubtitle,
    welcomePrefix: store.branding.welcomePrefix || DEFAULT_BRANDING_TEXTS.welcomePrefix,
    footerCaption: store.branding.footerCaption || DEFAULT_BRANDING_TEXTS.footerCaption,
    pendingTitle: store.branding.pendingTitle || DEFAULT_BRANDING_TEXTS.pendingTitle,
    pendingMessage: store.branding.pendingMessage || DEFAULT_BRANDING_TEXTS.pendingMessage,
    logoUrl: hasCustomLogo ? `/api/branding/logo?v=${ver}` : DEFAULT_LOGO_URL,
    bannerUrl: hasCustomBanner ? `/api/branding/banner?v=${ver}` : DEFAULT_BANNER_URL,
    hasCustomLogo,
    hasCustomBanner,
    paymentQrUrl: hasPaymentQr ? `/api/branding/payment-qr?v=${ver}` : null,
    hasPaymentQr,
    paymentQrTitle: store.branding.paymentQrTitle || DEFAULT_PAYMENT_QR_TITLE,
    paymentQrNote: store.branding.paymentQrNote ?? DEFAULT_PAYMENT_QR_NOTE,
    whatsappQrUrl: hasWhatsappQr ? `/api/branding/whatsapp-qr?v=${ver}` : null,
    hasWhatsappQr,
    whatsappQrTitle: store.branding.whatsappQrTitle || DEFAULT_WHATSAPP_QR_TITLE,
    whatsappQrNote: store.branding.whatsappQrNote ?? DEFAULT_WHATSAPP_QR_NOTE,
    whatsappUrl: store.branding.whatsappUrl ?? '',
    updatedAt: store.branding.updatedAt,
  };
}

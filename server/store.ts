import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AccessLogEntry,
  ApprovalStatus,
  BrandingConfig,
  CUModule,
  EbookNoteModule,
  FileMetadata,
  PublicUser,
  SopCheckProgress,
  SopStep,
  TopicLevel,
  TugasanPaper,
  TugasanSubmission,
  UserRole,
} from '../src/types.ts';
import {
  SEEDED_TUGASAN_PAPERS,
  createDefaultTugasanForCustomCu,
} from './tugasanBank.ts';

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
  tugasanPapers: TugasanPaper[];
  tugasanSubmissions: TugasanSubmission[];
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

interface SeededEbookAsset {
  id: string;
  fileId: string;
  code: string;
  title: string;
  sourceRelPath: string;
  storedName: string;
  originalName: string;
}

const KPC01_ASSETS: SeededEbookAsset[] = [
  {
    id: 'ebook-kpc01-1',
    fileId: 'file-kpc01-1',
    code: 'KP(1/5)',
    title: 'Keperluan Lukisan Elektrik Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KPC01_1-5__PUTIH__95fe2f57.pdf',
    storedName: 'kpc01_1_5.pdf',
    originalName: 'KPC01_1-5_Keperluan_Lukisan_Elektrik_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc01-2',
    fileId: 'file-kpc01-2',
    code: 'KP(2/5)',
    title: 'Lukisan Susun Atur Elektrik Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KPC01_2-5__PUTIH__0bbc4bee.pdf',
    storedName: 'kpc01_2_5.pdf',
    originalName: 'KPC01_2-5_Lukisan_Susun_Atur_Elektrik_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc01-3',
    fileId: 'file-kpc01-3',
    code: 'KP(3/5)',
    title: 'Lukisan Skematik Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KPC01_3-5__PUTIH__152c2865.pdf',
    storedName: 'kpc01_3_5.pdf',
    originalName: 'KPC01_3-5_Lukisan_Skematik_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc01-4',
    fileId: 'file-kpc01-4',
    code: 'KP(4/5)',
    title: 'Pengiraan Kos Bahan',
    sourceRelPath: 'public/assets/aistudio/KPC01_4-5__PUTIH__b427d634.pdf',
    storedName: 'kpc01_4_5.pdf',
    originalName: 'KPC01_4-5_Pengiraan_Kos_Bahan.pdf',
  },
  {
    id: 'ebook-kpc01-5',
    fileId: 'file-kpc01-5',
    code: 'KP(5/5)',
    title: 'Prosedur Kertas Kerja Lukisan Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KPC01_5-5__PUTIH__fd5abda8.pdf',
    storedName: 'kpc01_5_5.pdf',
    originalName: 'KPC01_5-5_Prosedur_Kertas_Kerja_Lukisan_Satu_Fasa.pdf',
  },
];

const KPC02_ASSETS: SeededEbookAsset[] = [
  {
    id: 'ebook-kpc02-1',
    fileId: 'file-kpc02-1',
    code: 'KP(1/19)',
    title: 'Keselamatan dan Kesihatan Pekerjaan',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_1-19__PUTIH__fb2284a6.pdf',
    storedName: 'kpc02_1_19.pdf',
    originalName: 'KPC02_1-19_Keselamatan_dan_Kesihatan_Pekerjaan.pdf',
  },
  {
    id: 'ebook-kpc02-2',
    fileId: 'file-kpc02-2',
    code: 'KP(2/19)',
    title: 'Akta dan Peraturan Pendawaian Elektrik Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_2-19__PUTIH__398f2f9f.pdf',
    storedName: 'kpc02_2_19.pdf',
    originalName: 'KPC02_2-19_Akta_dan_Peraturan_Pendawaian_Elektrik_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc02-3',
    fileId: 'file-kpc02-3',
    code: 'KP(3/19)',
    title: 'Keperluan Pendawaian Elektrik Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_3-19__PUTIH__1fd0d20c.pdf',
    storedName: 'kpc02_3_19.pdf',
    originalName: 'KPC02_3-19_Keperluan_Pendawaian_Elektrik_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc02-4',
    fileId: 'file-kpc02-4',
    code: 'KP(4/19)',
    title: 'Sambungan Kabel Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_4-19__PUTIH__cd47e1eb.pdf',
    storedName: 'kpc02_4_19.pdf',
    originalName: 'KPC02_4-19_Sambungan_Kabel_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc02-5',
    fileId: 'file-kpc02-5',
    code: 'KP(5/19)',
    title: 'Faktor Kepelbagaian Beban',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_5-19__PUTIH__4f194bec.pdf',
    storedName: 'kpc02_5_19.pdf',
    originalName: 'KPC02_5-19_Faktor_Kepelbagaian_Beban.pdf',
  },
  {
    id: 'ebook-kpc02-6',
    fileId: 'file-kpc02-6',
    code: 'KP(6/19)',
    title: 'Pendawaian Permukaan Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_6-19__PUTIH__f454e423.pdf',
    storedName: 'kpc02_6_19.pdf',
    originalName: 'KPC02_6-19_Pendawaian_Permukaan_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc02-7',
    fileId: 'file-kpc02-7',
    code: 'KP(7/19)',
    title: 'Pendawaian Tersembunyi Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_7-19__PUTIH__6e195224.pdf',
    storedName: 'kpc02_7_19.pdf',
    originalName: 'KPC02_7-19_Pendawaian_Tersembunyi_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc02-8',
    fileId: 'file-kpc02-8',
    code: 'KP(8/19)',
    title: 'Pendawaian Pembuluh Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_8-19__PUTIH__15a5fc20.pdf',
    storedName: 'kpc02_8_19.pdf',
    originalName: 'KPC02_8-19_Pendawaian_Pembuluh_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc02-9',
    fileId: 'file-kpc02-9',
    code: 'KP(9/19)',
    title: 'Pendawaian Salur Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_9-19__PUTIH__b8ce1ea9.pdf',
    storedName: 'kpc02_9_19.pdf',
    originalName: 'KPC02_9-19_Pendawaian_Salur_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc02-10',
    fileId: 'file-kpc02-10',
    code: 'KP(10/19)',
    title: 'Pendawaian Sesalur Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_10-19__PUTIH__d1fb0d81.pdf',
    storedName: 'kpc02_10_19.pdf',
    originalName: 'KPC02_10-19_Pendawaian_Sesalur_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc02-11',
    fileId: 'file-kpc02-11',
    code: 'KP(11/19)',
    title: 'Pendawaian Sesalur Kecil (Casing) Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_11-19__PUTIH__bf0c67a1.pdf',
    storedName: 'kpc02_11_19.pdf',
    originalName: 'KPC02_11-19_Pendawaian_Sesalur_Kecil_Casing_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc02-12',
    fileId: 'file-kpc02-12',
    code: 'KP(12/19)',
    title: 'Kemasan dan Tamatan Pendawaian Elektrik',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_12-19__PUTIH__0da64ed5.pdf',
    storedName: 'kpc02_12_19.pdf',
    originalName: 'KPC02_12-19_Kemasan_dan_Tamatan_Pendawaian_Elektrik.pdf',
  },
  {
    id: 'ebook-kpc02-13',
    fileId: 'file-kpc02-13',
    code: 'KP(13/19)',
    title: 'Pembumian Sistem Pengagihan Elektrik',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_13-19__PUTIH__0288e739.pdf',
    storedName: 'kpc02_13_19.pdf',
    originalName: 'KPC02_13-19_Pembumian_Sistem_Pengagihan_Elektrik.pdf',
  },
  {
    id: 'ebook-kpc02-14',
    fileId: 'file-kpc02-14',
    code: 'KP(14/19)',
    title: 'Pengalir Pelindung dan Prosedur Pembumian Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_14-19__PUTIH__a5fb643e.pdf',
    storedName: 'kpc02_14_19.pdf',
    originalName: 'KPC02_14-19_Pengalir_Pelindung_dan_Prosedur_Pembumian_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc02-15',
    fileId: 'file-kpc02-15',
    code: 'KP(15/19)',
    title: 'Ujian Rintangan Penebatan Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_15-19__PUTIH__466f888d.pdf',
    storedName: 'kpc02_15_19.pdf',
    originalName: 'KPC02_15-19_Ujian_Rintangan_Penebatan_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc02-16',
    fileId: 'file-kpc02-16',
    code: 'KP(16/19)',
    title: 'Ujian Kekutuban Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_16-19__PUTIH__50677320.pdf',
    storedName: 'kpc02_16_19.pdf',
    originalName: 'KPC02_16-19_Ujian_Kekutuban_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc02-17',
    fileId: 'file-kpc02-17',
    code: 'KP(17/19)',
    title: 'Ujian Keterusan Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_17-19__PUTIH__2e8c8992.pdf',
    storedName: 'kpc02_17_19.pdf',
    originalName: 'KPC02_17-19_Ujian_Keterusan_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc02-18',
    fileId: 'file-kpc02-18',
    code: 'KP(18/19)',
    title: 'Ujian Rintangan Elektrod Bumi Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_18-19__PUTIH__b187a88b.pdf',
    storedName: 'kpc02_18_19.pdf',
    originalName: 'KPC02_18-19_Ujian_Rintangan_Elektrod_Bumi_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc02-19',
    fileId: 'file-kpc02-19',
    code: 'KP(19/19)',
    title: 'Ujian Peranti Arus Baki (PAB) Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/KP_CU2_19-19__PUTIH__5cf7927a.pdf',
    storedName: 'kpc02_19_19.pdf',
    originalName: 'KPC02_19-19_Ujian_Peranti_Arus_Baki_PAB_Satu_Fasa.pdf',
  },
];

const KPC03_ASSETS: SeededEbookAsset[] = [
  {
    id: 'ebook-kpc03-1',
    fileId: 'file-kpc03-1',
    code: 'KP(1/5)',
    title: 'Penyelenggaraan Rutin Pendawaian Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/9._KP_CU3_1-5__PUTIH__da572851.pdf',
    storedName: 'kpc03_1_5.pdf',
    originalName: 'KPC03_1-5_Penyelenggaraan_Rutin_Pendawaian_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc03-2',
    fileId: 'file-kpc03-2',
    code: 'KP(2/5)',
    title: 'Kerosakan Pendawaian Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/12._KP_CU3_2-5__PUTIH__65169461.pdf',
    storedName: 'kpc03_2_5.pdf',
    originalName: 'KPC03_2-5_Kerosakan_Pendawaian_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc03-3',
    fileId: 'file-kpc03-3',
    code: 'KP(3/5)',
    title: 'Penyelenggaraan Pembetulan Pendawaian Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/15._KP_CU3_3-5__PUTIH__99d738c0.pdf',
    storedName: 'kpc03_3_5.pdf',
    originalName: 'KPC03_3-5_Penyelenggaraan_Pembetulan_Pendawaian_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc03-4',
    fileId: 'file-kpc03-4',
    code: 'KP(4/5)',
    title: 'Penyelenggaraan Pencegahan Pendawaian Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/24._KP_CU3_4-5__PUTIH__c2ea43c1.pdf',
    storedName: 'kpc03_4_5.pdf',
    originalName: 'KPC03_4-5_Penyelenggaraan_Pencegahan_Pendawaian_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc03-5',
    fileId: 'file-kpc03-5',
    code: 'KP(5/5)',
    title: 'Prosedur Penyelenggaraan Pencegahan Pendawaian Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/27._KP_CU3_5-5__PUTIH__0cb554ba.pdf',
    storedName: 'kpc03_5_5.pdf',
    originalName: 'KPC03_5-5_Prosedur_Penyelenggaraan_Pencegahan_Pendawaian_Satu_Fasa.pdf',
  },
];

const KPC04_ASSETS: SeededEbookAsset[] = [
  {
    id: 'ebook-kpc04-1',
    fileId: 'file-kpc04-1',
    code: 'KP(1/5)',
    title: 'Jenis-Jenis Motor dan Penghidup Motor Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/9._KP_CU4_1-5__PUTIH__6ecb9b9b.pdf',
    storedName: 'kpc04_1_5.pdf',
    originalName: 'KPC04_1-5_Jenis_Jenis_Motor_dan_Penghidup_Motor_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc04-2',
    fileId: 'file-kpc04-2',
    code: 'KP(2/5)',
    title: 'Keperluan Pemasangan Litar Kawalan Motor Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/12._KP_CU4_2-5__PUTIH__0d23cf18.pdf',
    storedName: 'kpc04_2_5.pdf',
    originalName: 'KPC04_2-5_Keperluan_Pemasangan_Litar_Kawalan_Motor_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc04-3',
    fileId: 'file-kpc04-3',
    code: 'KP(3/5)',
    title: 'Pemasangan Kawalan Motor Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/15._KP_CU4_3-5__PUTIH__496d2438.pdf',
    storedName: 'kpc04_3_5.pdf',
    originalName: 'KPC04_3-5_Pemasangan_Kawalan_Motor_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc04-4',
    fileId: 'file-kpc04-4',
    code: 'KP(4/5)',
    title: 'Jenis Tamatan Kabel dan Pengalir Pelindung Kawalan Motor Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/18._KP_CU4_4-5__PUTIH__c4517c8e.pdf',
    storedName: 'kpc04_4_5.pdf',
    originalName: 'KPC04_4-5_Jenis_Tamatan_Kabel_dan_Pengalir_Pelindung_Kawalan_Motor_Satu_Fasa.pdf',
  },
  {
    id: 'ebook-kpc04-5',
    fileId: 'file-kpc04-5',
    code: 'KP(5/5)',
    title: 'Pengujian dan Laporan Kawalan Motor Satu Fasa',
    sourceRelPath: 'public/assets/aistudio/21._KP_CU4_5-5__PUTIH__9b883a0f.pdf',
    storedName: 'kpc04_5_5.pdf',
    originalName: 'KPC04_5-5_Pengujian_dan_Laporan_Kawalan_Motor_Satu_Fasa.pdf',
  },
];

function ensureSeededEbookModules(assets: SeededEbookAsset[]): EbookNoteModule[] {
  ensureDirectories();
  const now = new Date().toISOString();
  const result: EbookNoteModule[] = [];
  for (const item of assets) {
    const srcPath = path.resolve(process.cwd(), item.sourceRelPath);
    const destPath = path.resolve(UPLOADS_DIR, item.storedName);
    if (!fs.existsSync(destPath) && fs.existsSync(srcPath)) {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch {
        // Ignore copy error if unreadable
      }
    }
    if (!fs.existsSync(destPath)) {
      continue;
    }
    const stats = fs.statSync(destPath);
    result.push({
      id: item.id,
      code: item.code,
      title: item.title,
      file: {
        id: item.fileId,
        originalName: item.originalName,
        storedName: item.storedName,
        mimeType: 'application/pdf',
        extension: '.pdf',
        sizeBytes: stats.size,
        uploadedAt: now,
        uploadedById: 'admin-root',
        uploadedByName: 'Master Admin (JPK NOSS)',
      },
    });
  }
  return result;
}

export function ensureKpc01EbookModules(): EbookNoteModule[] {
  return ensureSeededEbookModules(KPC01_ASSETS);
}

export function ensureKpc02EbookModules(): EbookNoteModule[] {
  return ensureSeededEbookModules(KPC02_ASSETS);
}

export function ensureKpc03EbookModules(): EbookNoteModule[] {
  return ensureSeededEbookModules(KPC03_ASSETS);
}

export function ensureKpc04EbookModules(): EbookNoteModule[] {
  return ensureSeededEbookModules(KPC04_ASSETS);
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
      title: 'F432-005-2:2019 — Pemasangan & Penyelenggaraan Elektrik Satu Fasa',
      description:
        'Kurikulum SKM Tahap 2 (800 Jam: 720 Jam Kompetensi + 80 Jam Core Abilities) berasaskan piawaian MS IEC 60364 dan Peraturan-Peraturan Elektrik 1994.',
      order: 1,
      teoriSub1Title: 'Sub 1: Piawaian MS IEC 60364, Peraturan 1994 & Teori Teras',
      teoriSub2Title: 'Sub 2: Aplikasi Litar, Pengiraan & Panduan Soalan',
      amaliSub1Title: 'Sub 1: Keselamatan LOTO, PPE & Persediaan Bay Amali',
      amaliSub2Title: 'Sub 2: Pemasangan, Pengujian PCD & Verifikasi Kerja',
    },
    {
      id: 'lvl-3',
      code: 'TAHAP 3',
      title: 'F432-005-3:2019 — Pemasangan & Penyelenggaraan Elektrik Tiga Fasa',
      description:
        'Kurikulum SKM Tahap 3 komersial & industri: sistem tiga fasa, pengujian & pentauliahan (T&C), automasi bangunan (BAS), dan penyeliaan tapak mengikut MS IEC 60364 & Peraturan Elektrik 1994.',
      order: 2,
      teoriSub1Title: 'Sub 1: Prinsip Tiga Fasa, Piawaian & Pengiraan Teknikal',
      teoriSub2Title: 'Sub 2: Skematik Kawalan, Pentauliahan & Panduan Soalan',
      amaliSub1Title: 'Sub 1: LOTO Tiga Fasa, PPE & Persediaan Panel',
      amaliSub2Title: 'Sub 2: Pendawaian, Pengujian PCD/Zs & Penyeliaan',
    },
    {
      id: 'lvl-4',
      code: 'TAHAP 4',
      title: 'F432-005-4:2019 — Pemasangan & Penyelenggaraan Elektrik Voltan Rendah (DKM)',
      description:
        'Diploma Kemahiran Malaysia (DKM Tahap 4 · JPK): pengagihan voltan rendah industri (100A ke atas hingga 1kV), transformer, kabel bawah tanah/atas talian, ACMV, Soft Starter, PLC, pembumian & penyeliaan projek.',
      order: 3,
      teoriSub1Title: 'Sub 1: Piawaian Voltan Rendah (>100A–1kV) & Konsep Kejuruteraan',
      teoriSub2Title: 'Sub 2: Diagnostik Industri, Pengurusan Projek & Panduan Soalan',
      amaliSub1Title: 'Sub 1: Permit Kerja (PTW), LOTO Berbilang & PPE Kelas 0',
      amaliSub2Title: 'Sub 2: Pelaksanaan, Pengujian Berbeban & Verifikasi Sistem',
    },
    {
      id: 'lvl-5',
      code: 'TAHAP 5',
      title: 'F432-005-5:2019 — Sistem Pengagihan & Penjanaan Tenaga Elektrik Voltan Rendah (DLKM)',
      description:
        'Diploma Lanjutan Kemahiran Malaysia (DLKM Tahap 5 · JPK): peranti perlindungan voltan rendah, operasi & penyegerakan penjana diesel, Solar PV, UPS & pengecas bateri, pengurusan operasi & pengurusan tenaga.',
      order: 4,
      teoriSub1Title: 'Sub 1: Kejuruteraan Penjanaan, Perlindungan & Sistem Tenaga DLKM',
      teoriSub2Title: 'Sub 2: Penyegerakan, Audit Tenaga & Panduan Soalan',
      amaliSub1Title: 'Sub 1: Permit Kerja (PTW), Pengasingan Penjana/PV/UPS (LOTO · PPE)',
      amaliSub2Title: 'Sub 2: Ujian Geganti, Penyegerakan Selari & Verifikasi Operasi',
    },
  ];

  // All document slots (Nota, Panduan Soalan, Dokumen SOP) remain NULL by default
  const cus: CUModule[] = [
    {
      id: 'cu-201',
      levelId: 'lvl-2',
      code: 'C01 (15%)',
      title: 'Single Phase Drawing (Lukisan Elektrik Satu Fasa)',
      description:
        'Mentafsir dan menyediakan lukisan titik/susun atur, gambar rajah skematik/litar, serta anggaran beban dan bahan asas sebelum kerja menarik kabel.',
      order: 1,
      ebookModules: ensureKpc01EbookModules(),
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl:
          'https://drive.google.com/drive/folders/1qPSlc3fVk5X_3I0VLgBlDoEFJ_yW25FG?usp=sharing',
        googleDriveTitle: 'Nota Pembelajaran C01 (Tahap 2) — Google Drive',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C01: Simbol, Susun Atur & Skematik Satu Fasa',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C01',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C01: Anggaran Beban & Bil Bahan (BOM)',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-201-1a',
            category: 'PPE',
            title: 'Semakan PPE & Meja Lukisan Teknikal',
            instruction:
              'Pastikan kawasan kerja selamat, kasut keselamatan dipakai, dan peralatan lukisan/skala disemak sebelum menandakan bay amali.',
            critical: true,
          },
          {
            id: 'sop-201-1b',
            category: 'Langkah Kerja',
            title: 'Tafsiran Lukisan Titik, Skematik & Laluan Konduit',
            instruction:
              'Sahkan kedudukan DB, suis, soket alir keluar (SSO), dan laluan kabel mengikut pelan susun atur serta piawaian MS IEC 60364.',
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
            title: 'Semakan Kadaran Peranti Perlindungan & Saiz Kabel',
            instruction:
              'Pastikan kadaran MCB, RCCB/RCD (30mA/100mA), dan saiz kabel sepadan dengan pengiraan arus beban sebelum diserahkan ke bay pendawaian C02.',
            critical: true,
          },
          {
            id: 'sop-201-2b',
            category: 'Langkah Kerja',
            title: 'Penandaan (Marking) Tapak Bay C02',
            instruction:
              'Pindahkan ukuran lukisan susun atur ke papan/bay latihan dengan tepat sebelum kerja pemasangan containment dimulakan.',
            critical: false,
          },
        ],
      },
    },
    {
      id: 'cu-202',
      levelId: 'lvl-2',
      code: 'C02 (55%)',
      title: 'Single Phase Wiring (Pendawaian Elektrik Satu Fasa)',
      description:
        'Teras utama Tahap 2 (55%): kerja containment/konduit/trunking, pemasangan kabel satu fasa, pemasangan DB, perlindungan MCB/RCCB/RCD, dan sistem pembumian mengikut MS IEC 60364 & Peraturan Elektrik 1994.',
      order: 2,
      ebookModules: ensureKpc02EbookModules(),
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl:
          'https://drive.google.com/drive/folders/1A8lD5Yh3s0-BjnE0Mtvqx_D2kj-Bney-?usp=sharing',
        googleDriveTitle: 'Nota Pembelajaran C02 (Tahap 2) — Google Drive',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C02: Sistem Pendawaian, Konduit & Trunking',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C02',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C02: Kotak Agihan (DB), MCB/RCCB & Pembumian',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-202-1a',
            category: 'PPE',
            title: 'Pemakaian PPE Lengkap Kerja Pendawaian',
            instruction:
              'Pakai kasut keselamatan bertutup, cermin mata pelindung, dan sarung tangan kerja semasa memotong konduit/trunking dan menarik kabel.',
            critical: true,
          },
          {
            id: 'sop-202-1b',
            category: 'LOTO',
            title: 'Pengasingan Bekalan & Lock-Out Bay Pendawaian',
            instruction:
              'Matikan suis utama bay pendawaian, pasang kunci LOTO peribadi serta tag amaran, dan sahkan voltan sifar sebelum kerja DB bermula.',
            critical: true,
          },
          {
            id: 'sop-202-1c',
            category: 'Langkah Kerja',
            title: 'Pemasangan Containment, Konduit & Trunking',
            instruction:
              'Pasang paip konduit PVC/GI dan trunking dengan kemas, lurus, dan jarak sokongan mengikut lukisan susun atur C01.',
            critical: false,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-202-2a',
            category: 'PCD',
            title: 'Pemasangan Kotak Agihan (DB), MCB, RCCB/RCD & Sistem Bumi',
            instruction:
              'Sambung terminal fasa, neutral, dan konduktor pelindung (CPC) dengan tork pengetatan yang betul, label setiap litar, dan sahkan pembumian mengikut Peraturan Elektrik 1994.',
            critical: true,
          },
          {
            id: 'sop-202-2b',
            category: 'Langkah Kerja',
            title: 'Pemeriksaan Kekemasan, Penebatan & Polariti Awal',
            instruction:
              'Sahkan tiada penebat kabel tercalar atau terdedah dan lakukan semakan kekutuban serta kesinambungan litar mati sebelum ujian C03.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-203',
      levelId: 'lvl-2',
      code: 'C03 (15%)',
      title: 'Single Phase System Maintenance (Penyelenggaraan Sistem Satu Fasa)',
      description:
        'Pemeriksaan visual, jujukan pengujian litar mati/hidup (dead/live testing), pengesanan kerosakan (fault diagnosis), serta penyelenggaraan pembetulan/pembaikan litar satu fasa.',
      order: 3,
      ebookModules: ensureKpc03EbookModules(),
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C03',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C03: Jujukan Pengujian Mati & Hidup (MS IEC 60364)',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C03',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C03: Diagnostik Kerosakan & Penyelenggaraan Pembetulan',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-203-1a',
            category: 'LOTO',
            title: 'Pengasingan LOTO Sebelum Ujian Mati & Pembaikan',
            instruction:
              'Matikan pemutus litar utama, pasang kunci & tag LOTO, dan buktikan litar mati sebelum menjalankan ujian penebatan atau menggantikan komponen rosak.',
            critical: true,
          },
          {
            id: 'sop-203-1b',
            category: 'PPE',
            title: 'PPE Penyelenggaraan & Semakan Alat Ukur',
            instruction:
              'Gunakan sarung tangan berpenebat, pastikan probe multimeter dan penguji penebatan bebas kerosakan, dan tetapkan julat ukuran yang betul.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-203-2a',
            category: 'PCD',
            title: 'Jujukan Ujian Litar Mati (Dead Testing)',
            instruction:
              'Jalankan ujian kesinambungan konduktor pelindung & litar gelang, ujian rintangan penebatan (>= 1 MΩ), dan ujian kekutuban sebelum menghidupkan bekalan.',
            critical: true,
          },
          {
            id: 'sop-203-2b',
            category: 'Langkah Kerja',
            title: 'Ujian Litar Hidup (Live Testing) & Pengesanan Kerosakan',
            instruction:
              'Uji fungsi butang & masa tripping RCCB/RCD, semak kekutuban soket, dan kesan punca litar terbuka, pintas atau bocor ke bumi secara sistematik.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-204',
      levelId: 'lvl-2',
      code: 'C04 (15%)',
      title: 'Single Phase Motor and Motor Control (Motor & Kawalan Motor Satu Fasa)',
      description:
        'Jenis dan sambungan motor satu fasa, pemasangan litar kawalan DOL serta litar perlindungan asas, dan pemeriksaan operasi motor.',
      order: 4,
      ebookModules: ensureKpc04EbookModules(),
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C04',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C04: Jenis Motor Satu Fasa & Sambungan Belitan',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C04',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C04: Litar Kawalan DOL & Perlindungan Motor',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-204-1a',
            category: 'LOTO',
            title: 'Pengasingan Panel Pemula Motor (LOTO)',
            instruction:
              'Asingkan bekalan utama panel kawalan motor satu fasa, pasang kunci LOTO, dan sahkan voltan sifar pada terminal contactor serta belitan motor.',
            critical: true,
          },
          {
            id: 'sop-204-1b',
            category: 'PPE',
            title: 'Keselamatan Bahagian Berputar & PPE Bengkel',
            instruction:
              'Pastikan pelindung aci motor dipasang, tiada pakaian longgar berhampiran rotor, dan pakai cermin mata serta kasut keselamatan.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-204-2a',
            category: 'PCD',
            title: 'Pelarasan Geganti Beban Lampau (TOR) & MCB Motor',
            instruction:
              'Tetapkan kadaran arus geganti beban lampau mengikut plat nama motor satu fasa serta sahkan fungsi butang Henti/Mula DOL.',
            critical: true,
          },
          {
            id: 'sop-204-2b',
            category: 'Langkah Kerja',
            title: 'Ujian Operasi, Arus Permulaan & Hala Pusingan',
            instruction:
              'Jalankan motor tanpa beban di bawah pengawasan pengajar, rekod arus larian, dan sahkan litar kawalan berhenti serta-merta apabila punat tekan henti ditekan.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-301',
      levelId: 'lvl-3',
      code: 'C01',
      title: 'Three Phase Drawing (Lukisan Elektrik Tiga Fasa)',
      description:
        'Pelan susun atur tiga fasa, gambar rajah skematik tiga talian (three-line), pengimbangan fasa, permintaan maksimum (MD), serta pengiraan saiz kabel dan peranti perlindungan.',
      order: 1,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C01 (Tahap 3)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C01: Pelan Susun Atur & Skematik Tiga Talian',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C01 (Tahap 3)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C01: Pengimbangan Fasa, MD & Saiz Kabel',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-301-1a',
            category: 'PPE',
            title: 'Semakan PPE & Stesen Lukisan Teknikal 3-Fasa',
            instruction:
              'Pastikan peralatan lukisan/skala, pelan lantai komersial, dan PPE bengkel disemak sebelum pemeriksaan tapak.',
            critical: true,
          },
          {
            id: 'sop-301-1b',
            category: 'Langkah Kerja',
            title: 'Penyediaan Skematik Three-Line & Jadual Agihan Fasa (RYB)',
            instruction:
              'Agihkan beban fasa Merah (R), Kuning (Y), dan Biru (B) secara seimbang berserta pengiraan Permintaan Maksimum (MD).',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-301-2a',
            category: 'PCD',
            title: 'Pengesahan Kadaran MCCB/MCB, RCCB & Saiz Kabel',
            instruction:
              'Sahkan kadaran pemutus litar tiga fasa, keupayaan bawaan arus kabel (Iz), dan susutan voltan mematuhi MS IEC 60364.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-302',
      levelId: 'lvl-3',
      code: 'C02',
      title: 'Three Phase Wiring (Pendawaian Elektrik Tiga Fasa)',
      description:
        'Kerja containment/trunking/cable tray tiga fasa, pemasangan DB 3-fasa, sub-switchboard (SSB), busbar, switchgear, serta sistem pembumian dan ikatan mengikut MS IEC 60364 & Peraturan Elektrik 1994.',
      order: 2,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C02 (Tahap 3)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C02: Trunking, Cable Tray & Kabel Tiga Fasa',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C02 (Tahap 3)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C02: Sub-Switchboard, Busbar & Pembumian',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-302-1a',
            category: 'LOTO',
            title: 'Pengasingan Bekalan Tiga Fasa (LOTO)',
            instruction:
              'Asingkan isolator 3-fasa, kunci pemutus litar utama, dan sahkan voltan sifar (L1-L2-L3-N-PE).',
            critical: true,
          },
          {
            id: 'sop-302-1b',
            category: 'PPE',
            title: 'PPE Kerja Containment & Cable Tray Industri',
            instruction:
              'Pakai sarung tangan kerja berat, cermin mata keselamatan, dan kasut keselamatan semasa memotong trunking dan cable tray.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-302-2a',
            category: 'PCD',
            title: 'Pemasangan DB 3-Fasa, SSB, Busbar & Ikatan Bumi',
            instruction:
              'Ketatkan sambungan busbar dan switchgear mengikut tork spesifikasi, label kod warna fasa (R/Y/B/N/E), dan sahkan ikatan penyamaan upaya (bonding).',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-303',
      levelId: 'lvl-3',
      code: 'C03',
      title: 'Three Phase System Maintenance (Penyelenggaraan Sistem Tiga Fasa)',
      description:
        'Rutin penyelenggaraan pencegahan dan pembetulan, pengesanan kerosakan tiga fasa secara sistematik, serta pembaikan/penggantian komponen.',
      order: 3,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C03 (Tahap 3)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C03: Penyelenggaraan Pencegahan & Pembetulan',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C03 (Tahap 3)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C03: Diagnostik Kerosakan Sistem Tiga Fasa',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-303-1a',
            category: 'LOTO',
            title: 'LOTO & Pengesahan Sifar Tenaga Sebelum Penyelenggaraan',
            instruction:
              'Kunci pemutus litar suapan sub-switchboard, pasang tag amaran penyelenggaraan, dan uji ketiadaan voltan antara semua fasa serta neutral/bumi.',
            critical: true,
          },
          {
            id: 'sop-303-1b',
            category: 'PPE',
            title: 'Perlindungan Arka & Pemeriksaan Alat Pengujian',
            instruction:
              'Gunakan sarung tangan berpenebat, pelindung muka jika perlu, dan pastikan probe penguji voltan/clamp meter mematuhi CAT III/CAT IV.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-303-2a',
            category: 'Langkah Kerja',
            title: 'Pengesanan Kerosakan Fasa, Ketidakseimbangan & Penggantian Komponen',
            instruction:
              'Kenal pasti punca kerosakan (hilang fasa, sambungan longgar/panas, kerosakan geganti atau RCCB) dan gantikan komponen rosak mengikut kadaran asal.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-304',
      levelId: 'lvl-3',
      code: 'C04',
      title: 'Three Phase Motor and Motor Control (Motor & Kawalan Motor Tiga Fasa)',
      description:
        'Penamatan motor aruhan tiga fasa (Star/Delta), pendawaian litar kawalan, serta pemula (DOL, Star-Delta, Forward-Reverse) dengan perlindungan beban lampau dan saling kunci (interlock).',
      order: 4,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C04 (Tahap 3)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C04: Sambungan Motor Star/Delta & Litar Kuasa',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C04 (Tahap 3)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C04: Pemula DOL, Star-Delta & Forward-Reverse',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-304-1a',
            category: 'LOTO',
            title: 'Pengasingan Panel Kawalan Motor 3-Fasa (LOTO)',
            instruction:
              'Matikan suis pengasing utama panel motor, pasang kunci LOTO, dan sahkan voltan sifar pada penyentuh (contactor) dan terminal motor U1-V1-W1 / U2-V2-W2.',
            critical: true,
          },
          {
            id: 'sop-304-1b',
            category: 'PPE',
            title: 'Keselamatan Bahagian Berputar & Ruang Panel',
            instruction:
              'Pastikan pengadang aci motor dipasang kemas dan kawasan ujian bebas halangan sebelum bekalan ujian dihidupkan.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-304-2a',
            category: 'PCD',
            title: 'Pelarasan Geganti Beban Lampau (TOR) & Interlock',
            instruction:
              'Tetapkan arus TOR mengikut plat nama motor dan uji saling kunci elektrik serta mekanikal pada pemula Star-Delta dan Forward-Reverse.',
            critical: true,
          },
          {
            id: 'sop-304-2b',
            category: 'Langkah Kerja',
            title: 'Ujian Jujukan Pemula, Arus Fasa & Hala Pusingan',
            instruction:
              'Sahkan masa peralihan pemasa Star ke Delta, bacaan arus seimbang setiap fasa (L1/L2/L3), serta arah pusingan rotor yang tepat.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-305',
      levelId: 'lvl-3',
      code: 'C05',
      title: 'Three Phase Wiring Testing and Commissioning (Pengujian & Pentauliahan)',
      description:
        'Verifikasi dan ujian penyerahan rasmi: kesinambungan konduktor pelindung, rintangan penebatan, kekutuban, rintangan elektrod bumi, dan galangan gelung kerosakan bumi (Zs) berserta dokumentasi ujian rasmi.',
      order: 5,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C05 (Tahap 3)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C05: Jujukan Ujian Mati & Rintangan Elektrod Bumi',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C05 (Tahap 3)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C05: Galangan Gelung (Zs) & Borang Pentauliahan',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-305-1a',
            category: 'LOTO',
            title: 'Pengasingan Lengkap Semasa Ujian Mati & Elektrod Bumi',
            instruction:
              'Asingkan sambungan bekalan dan elektronik sensitif sebelum menjalankan ujian rintangan penebatan 500V/1000V DC serta ujian rintangan elektrod bumi.',
            critical: true,
          },
          {
            id: 'sop-305-1b',
            category: 'PPE',
            title: 'Semakan Kalibrasi Alat Ukur Pentauliahan',
            instruction:
              'Sahkan penentukuran Multifunction Tester / Earth Tester dan pakai PPE lengkap sepanjang ujian litar mati dan hidup.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-305-2a',
            category: 'PCD',
            title: 'Ujian Galangan Gelung Bumi (Zs), Turutan Fasa & RCCB',
            instruction:
              'Rekod bacaan Zs, turutan fasa (R-Y-B), serta masa tindak balas RCCB dan pastikan nilai mematuhi had maksimum MS IEC 60364.',
            critical: true,
          },
          {
            id: 'sop-305-2b',
            category: 'Langkah Kerja',
            title: 'Penyediaan Dokumentasi & Sijil Ujian Pentauliahan',
            instruction:
              'Lengkapkan borang keputusan ujian rasmi (Borang G/H & rekod bacaan ujian) untuk pengesahan penyelia dan penyerahan.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-306',
      levelId: 'lvl-3',
      code: 'C06',
      title: 'Electrical Building Automation System Installation (Automasi Bangunan)',
      description:
        'Sistem pencahayaan pintar dan kawalan bangunan — meliputi pendawaian bus/kawalan, penderia (sensors), penggerak (actuators), pemasa/pengawal, dan pentauliahan fungsi.',
      order: 6,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C06 (Tahap 3)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C06: Senibina BAS, Bus Kawalan & Penderia',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C06 (Tahap 3)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C06: Penggerak, Pemasa & Pentauliahan Fungsi',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-306-1a',
            category: 'PCD',
            title: 'Pengasingan Kuasa & Perlindungan Bekalan Voltan Rendah (24V/Bus)',
            instruction:
              'Asingkan laluan kabel bus/isyarat daripada kabel kuasa 415V/240V dan sahkan fius/bekalan DC pengawal berfungsi dengan kekutuban betul.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-306-2a',
            category: 'Langkah Kerja',
            title: 'Pemasangan Penderia, Penggerak & Ujian Fungsi BAS',
            instruction:
              'Pasang dan alamatkan penderia kehadiran/lux, penggerak pencahayaan pintar serta pemasa, kemudian uji senario kawalan automatik & pintasan kecemasan.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-307',
      levelId: 'lvl-3',
      code: 'C07',
      title: 'Electrical Installation & Maintenance Supervisory (Penyeliaan Tapak)',
      description:
        'Pelaksanaan penyeliaan: penjadualan kerja, anggaran bahan/BOQ, taklimat keselamatan (toolbox briefing), penguatkuasaan OSHA/keselamatan elektrik, dan memimpin juruteknik Tahap 2.',
      order: 7,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C07 (Tahap 3)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C07: Penjadualan Kerja & Anggaran Bahan (BOQ)',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C07 (Tahap 3)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C07: OSHA, Permit Kerja & Kepimpinan Teknikal',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-307-1a',
            category: 'PPE',
            title: 'Taklimat Keselamatan (Toolbox Briefing) & Audit PPE Pasukan',
            instruction:
              'Kendalikan taklimat hazard harian, pastikan semua pelatih/juruteknik Tahap 2 memakai PPE yang sah, dan rekod kehadiran keselamatan tapak.',
            critical: true,
          },
          {
            id: 'sop-307-1b',
            category: 'LOTO',
            title: 'Semakan Permit Kerja Selamat (PTW) & Pematuhan LOTO',
            instruction:
              'Sahkan borang PTW dan daftar kunci LOTO kumpulan diselia sebelum membenarkan kerja pemasangan atau penyelenggaraan bermula.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-307-2a',
            category: 'Langkah Kerja',
            title: 'Pemantauan Jadual Kerja, Kualiti Pemasangan & BOQ',
            instruction:
              'Agihkan tugasan kepada pasukan Tahap 2, pantau penggunaan bahan mengikut BOQ, dan lakukan pemeriksaan kualiti kerja sebelum penyerahan.',
            critical: false,
          },
        ],
      },
    },
    {
      id: 'cu-401',
      levelId: 'lvl-4',
      code: 'C01',
      title: 'Low Voltage Main Switch Board (MSB) Installation and Maintenance',
      description:
        'Pemasangan dan penyelenggaraan papan suis utama (MSB) voltan rendah berkadaran melebihi 100A dan di bawah 1kV termasuk ACB/MCCB, busbar dan sistem perlindungan.',
      order: 1,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C01 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C01: Rekabentuk & Komponen MSB (>100A–1kV)',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C01 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C01: Senggaraan Pencegahan ACB & Busbar MSB',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-401-1a',
            category: 'LOTO',
            title: 'Permit Kerja (PTW) & Pengasingan MSB Berbilang Punca',
            instruction:
              'Lengkapkan PTW, rack-out ACB/MCCB utama, pasang kunci LOTO berbilang dan sahkan voltan sifar pada busbar MSB.',
            critical: true,
          },
          {
            id: 'sop-401-1b',
            category: 'PPE',
            title: 'PPE Arka Elektrik & Sarung Tangan Berpenebat Kelas 0',
            instruction:
              'Pakai sut pelindung arka, pelindung muka dan sarung tangan berpenebat sebelum membuka panel suis berkapasiti >100A.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-401-2a',
            category: 'PCD',
            title: 'Pemeriksaan Geganti Perlindungan (OCR/EF) & Tork Busbar',
            instruction:
              'Uji suntikan sekunder geganti arus lebih/kerosakan bumi, sahkan penebatan busbar dan tork penyambungan sebelum pentauliahan MSB.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-402',
      levelId: 'lvl-4',
      code: 'C02',
      title: 'Distribution Transformer Maintenance',
      description:
        'Pemeriksaan visual, ujian minyak/penebatan dan penyelenggaraan pencegahan pada transformer pengagihan voltan rendah.',
      order: 2,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C02 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C02: Prinsip Transformer Pengagihan & Penyejukan',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C02 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C02: Ujian Penebatan, BDV Minyak & Silica Gel',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-402-1a',
            category: 'LOTO',
            title: 'Pengasingan Sisi Primer & Sekunder + Pembumian Sementara',
            instruction:
              'Asingkan bekalan masuk dan keluar transformer, kunci LOTO serta pasang ikatan pembumian sementara sebelum kerja senggaraan bermula.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-402-2a',
            category: 'Langkah Kerja',
            title: 'Pemeriksaan Bushing, Paras Minyak, Silica Gel & Rintangan Belitan',
            instruction:
              'Periksa kebocoran minyak, tukar silica gel tepu, uji nisbah lilitan (TTR) serta penebatan belitan mengikut jadual senggaraan.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-403',
      levelId: 'lvl-4',
      code: 'C03',
      title: 'Low Voltage Underground Cable System Installation and Maintenance',
      description:
        'Kerja merentang (laying), penyambungan (jointing), penamatan (terminating), serta pengujian kabel bawah tanah voltan rendah.',
      order: 3,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C03 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C03: Spesifikasi Peparit & Kabel Bawah Tanah LV',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C03 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C03: Teknik Jointing, Terminating & Pengesanan Kerosakan',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-403-1a',
            category: 'PPE',
            title: 'Keselamatan Peparit (Trenching) & Pengesanan Utiliti Bawah Tanah',
            instruction:
              'Semak laluan utiliti sedia ada dengan pengesan kabel, pasang penghadang keselamatan peparit dan pakai PPE lengkap.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-403-2a',
            category: 'PCD',
            title: 'Ujian Rintangan Penebatan, Fasa & Kesinambungan Perisai Kabel',
            instruction:
              'Jalankan ujian penebatan 1000V DC dan semakan kesinambungan armour/konduktor selepas kerja jointing dan penamatan kabel.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-404',
      levelId: 'lvl-4',
      code: 'C04',
      title: 'Low Voltage Overhead System Installation and Maintenance',
      description:
        'Pemasangan dan penyelenggaraan talian pengagihan atas voltan rendah (LV aerial/overhead lines) termasuk tiang, penebat dan konduktor ABC.',
      order: 4,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C04 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C04: Struktur Talian Atas LV & Kabel ABC',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C04 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C04: Regangan Konduktor, Kelegaan & Senggaraan',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-404-1a',
            category: 'PPE',
            title: 'Pemeriksaan Abah-Abah Keselamatan (Full Body Harness) & Tangga Berpenebat',
            instruction:
              'Periksa tali pinggang keselamatan kerja di tempat tinggi, topi keselamatan bertali dagu dan zon larangan di bawah tiang.',
            critical: true,
          },
          {
            id: 'sop-404-1b',
            category: 'LOTO',
            title: 'Pengasingan Talian & Pembumian Tapak Kerja Atas',
            instruction:
              'Asingkan suapan talian atas, uji ketiadaan voltan dengan voltage detector rod dan pasang earthing lead sementara.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-404-2a',
            category: 'Langkah Kerja',
            title: 'Pemasangan IPC, Dead-End Clamp & Pemeriksaan Kelegaan Talian',
            instruction:
              'Pasang penyambung penebat (IPC) dengan bolt putus tork dan sahkan kelegaan selamat minimum dari jalan serta bangunan.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-405',
      levelId: 'lvl-4',
      code: 'C05',
      title: 'Air Conditioning and Mechanical Ventilation (ACMV) System Troubleshoot',
      description:
        'Diagnostik kerosakan elektrik pada sistem penyaman udara dan pengudaraan mekanikal (ACMV) komersial/industri termasuk AHU, Chiller dan panel kawalan.',
      order: 5,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C05 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C05: Litar Kuasa & Kawalan Sistem ACMV/AHU',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C05 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C05: Diagnostik Kerosakan Pemampat, Kipas & Termostat',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-405-1a',
            category: 'LOTO',
            title: 'Pengasingan Panel Kawalan AHU/ACMV & Kipas Mekanikal (LOTO)',
            instruction:
              'Kunci pengasing kuasa panel ACMV dan pastikan bilah kipas/blower berhenti berputar sepenuhnya sebelum pemeriksaan bermula.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-405-2a',
            category: 'Langkah Kerja',
            title: 'Ujian Litar Interlock Aliran Udara, Penderia Suhu & Arus Motor ACMV',
            instruction:
              'Kesan kerosakan pada geganti kawalan, suis tekanan, kapasitor atau belitan motor kipas dan sahkan operasi normal selepas pembaikan.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-406',
      levelId: 'lvl-4',
      code: 'C06',
      title: 'Soft Starter Installation and Maintenance',
      description:
        'Pemasangan, penalaan parameter (ramp-up/ramp-down, current limit), dan penyelenggaraan pemula lembut (Soft Starter) motor industri.',
      order: 6,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C06 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C06: Prinsip Thyristor/SCR & Pendawaian Soft Starter',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C06 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C06: Tetapan Parameter & Kod Kerosakan Soft Starter',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-406-1a',
            category: 'LOTO',
            title: 'Pengasingan Bekalan & Pelepasan Cas Kapasitor Panel',
            instruction:
              'Matikan isolator panel, kunci LOTO dan tunggu tempoh nyahcas selamat sebelum menyentuh terminal SCR dan bypass contactor.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-406-2a',
            category: 'PCD',
            title: 'Penetapan Parameter Ramp-Up/Down & Ujian Arus Permulaan',
            instruction:
              'Tetapkan voltan mula, masa pecutan/nyahpecutan dan had arus mengikut beban motor serta sahkan fungsi pintasan (bypass) dan henti kecemasan.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-407',
      levelId: 'lvl-4',
      code: 'C07',
      title: 'Electrical Project Implementation Supervision',
      description:
        'Pengurusan pelaksanaan projek elektrik di tapak, pematuhan keselamatan OSHA/JKKP, kawalan kualiti, jadual kerja serta penyeliaan pasukan teknikal.',
      order: 7,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C07 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C07: Perancangan Projek, Carta Gantt & Kawalan Kos',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C07 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C07: HIRARC, OSHA Tapak & Audit Penyerahan Projek',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-407-1a',
            category: 'PPE',
            title: 'Penilaian Risiko HIRARC & Taklimat Keselamatan Tapak Projek',
            instruction:
              'Sediakan borang HIRARC, pastikan kepatuhan PPE dan semak permit kerja semua sub-kontraktor serta juruteknik di tapak.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-407-2a',
            category: 'Langkah Kerja',
            title: 'Pemeriksaan Kemajuan, QA/QC & Laporan Penyerahan Teknikal',
            instruction:
              'Jalankan pemeriksaan QA/QC mengikut spesifikasi projek dan sediakan laporan kemajuan serta dokumentasi siap bina (As-Built).',
            critical: false,
          },
        ],
      },
    },
    {
      id: 'cu-408',
      levelId: 'lvl-4',
      code: 'C08',
      title: 'Programmable Logic Controller (PLC) Installation',
      description:
        'Pendawaian dan pemasangan sistem PLC bagi automasi industri termasuk modul I/O, bekalan kuasa 24V DC, penderia, penggerak dan ujian logik.',
      order: 8,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C08 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C08: Perkakasan PLC, Pendawaian Sink/Source & I/O',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C08 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C08: Pengaturcaraan Ladder & Diagnostik I/O Industri',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-408-1a',
            category: 'PCD',
            title: 'Perlindungan Bekalan 24V DC, Fius I/O & Pengasingan Isyarat',
            instruction:
              'Sahkan kekutuban +24V/0V, asingkan kabel isyarat PLC daripada kabel kuasa motor dan uji litar E-Stop perkakasan.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-408-2a',
            category: 'Langkah Kerja',
            title: 'Ujian Pemetaan I/O (Force/Monitor) & Jujukan Automasi',
            instruction:
              'Muat naik program, sahkan status LED setiap input/output penderia dan aktuator, dan uji tindak balas henti kecemasan.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-409',
      levelId: 'lvl-4',
      code: 'C09',
      title: 'Low Voltage Earthing System Installation and Testing',
      description:
        'Rekabentuk, pemasangan, dan pengujian sistem pembumian industri serta grid perlindungan kilat (lightning protection grid) mematuhi piawaian MS IEC.',
      order: 9,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C09 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C09: Rekabentuk Grid Pembumian & Perlindungan Kilat',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C09 (DKM Tahap 4)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C09: Kaedah Ujian Fall-of-Potential & Ketahanan Bumi',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-409-1a',
            category: 'PPE',
            title: 'Keselamatan Tapak Pembumian & Semakan Cuaca (Bebas Petir)',
            instruction:
              'Jangan jalankan pengujian elektrod bumi atau grid kilat semasa cuaca ribut petir; pastikan PPE dan alat ukur berkalibrasi digunakan.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-409-2a',
            category: 'PCD',
            title: 'Ujian Rintangan Elektrod Bumi (3-Pole/4-Pole) & Ikatan Equipotential',
            instruction:
              'Rekod bacaan rintangan elektrod bumi dan kesinambungan down-conductor perlindungan kilat mengikut had spesifikasi (< 1 Ω / piawaian projek).',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-501',
      levelId: 'lvl-5',
      code: 'C01',
      title: 'Low Voltage Protection Devices Installation and Maintenance',
      description:
        'Pemasangan, pengujian, dan penyelenggaraan geganti perlindungan voltan rendah (LV protective relays) serta sistem perlindungan litar industri.',
      order: 1,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C01 (DLKM Tahap 5)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C01: Geganti Perlindungan & Penyelarasan Litar',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C01 (DLKM Tahap 5)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C01: Ujian Suntikan Sekunder & Senggaraan Geganti',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-501-1a',
            category: 'LOTO',
            title: 'Pengasingan Suis & Litar Sekunder CT/VT (Shorting Link)',
            instruction:
              'Lengkapkan PTW, kunci pengasing utama dan pasang terminal pintas CT sebelum menanggalkan geganti perlindungan daripada panel.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-501-2a',
            category: 'PCD',
            title: 'Ujian Suntikan Sekunder & Verifikasi Lengkung Masa-Arus (IDMT)',
            instruction:
              'Uji masa tripping geganti OCR, Earth Fault dan Under/Over Voltage menggunakan Secondary Injection Test Set mengikut tetapan koordinasi.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-502',
      levelId: 'lvl-5',
      code: 'C02',
      title: 'Low Voltage Diesel Generator Operation and Maintenance',
      description:
        'Operasi dan penyelenggaraan set penjana diesel voltan rendah jenis tunggu sedia (standby) dan utama (prime) termasuk ATS serta sistem enjin.',
      order: 2,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C02 (DLKM Tahap 5)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C02: Operasi Genset Standby/Prime & Panel ATS',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C02 (DLKM Tahap 5)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C02: Jadual Senggaraan Berkala & Diagnostik Genset',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-502-1a',
            category: 'PPE',
            title: 'PPE Bilik Genset (Pelindung Pendengaran) & Semakan Pra-Hidup',
            instruction:
              'Pakai pelindung telinga, periksa paras minyak pelincir, penyejuk, bahan api serta voltan bateri pemula sebelum menghidupkan genset.',
            critical: true,
          },
          {
            id: 'sop-502-1b',
            category: 'LOTO',
            title: 'Pengasingan Auto-Start & Bateri Semasa Senggaraan Enjin',
            instruction:
              'Tukar mod pengawal kepada OFF/LOCKOUT dan cabut terminal negatif bateri pemula sebelum senggaraan mekanikal atau alternator dijalankan.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-502-2a',
            category: 'Langkah Kerja',
            title: 'Ujian Larian Tanpa Beban/Berbeban & Pensuisan ATS',
            instruction:
              'Pantau frekuensi (50Hz), voltan keluaran, suhu penyejuk serta tekanan minyak dan uji pemindahan beban automatik (ATS).',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-503',
      levelId: 'lvl-5',
      code: 'C03',
      title: 'Low Voltage Generator Synchronising',
      description:
        'Pengurusan penyegerakan selari (parallel synchronization) secara manual dan automatik bagi set penjana diesel voltan rendah.',
      order: 3,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C03 (DLKM Tahap 5)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C03: Syarat Penyegerakan (Voltan, Frekuensi, Fasa)',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C03 (DLKM Tahap 5)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C03: Perkongsian Beban (kW/kVAR) & Synchroscope',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-503-1a',
            category: 'PCD',
            title: 'Semakan Geganti Reverse Power, Synchrocheck & Turutan Fasa',
            instruction:
              'Sahkan turutan fasa (R-Y-B) sepadan pada busbar dan penjana serta uji fungsi geganti reverse power sebelum penyegerakan.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-503-2a',
            category: 'Langkah Kerja',
            title: 'Pelaksanaan Penyegerakan Manual & Automatik + Load Sharing',
            instruction:
              'Laraskan kelajuan/voltan sehingga penunjuk synchroscope di kedudukan jam 12, tutup pemutus selari dan imbang perkongsian beban aktif (kW) & reaktif (kVAR).',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-504',
      levelId: 'lvl-5',
      code: 'C04',
      title: 'Photovoltaic Solar System Operation and Maintenance',
      description:
        'Operasi dan penyelenggaraan sistem penjanaan tenaga Solar PV jenis sambungan grid (grid-connected) dan bersendirian (standalone).',
      order: 4,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C04 (DLKM Tahap 5)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C04: Tatasusunan PV, String Inverter & Perlindungan DC',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C04 (DLKM Tahap 5)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C04: Ujian I-V Curve, Anti-Islanding & Senggaraan PV',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-504-1a',
            category: 'LOTO',
            title: 'Pengasingan Dwi-Punca AC & DC (DC Isolator / String Fuse)',
            instruction:
              'Asingkan pemutus AC grid terlebih dahulu diikuti isolator DC tatasusunan PV; ambil kira panel PV sentiasa menjana voltan DC apabila terdedah cahaya.',
            critical: true,
          },
          {
            id: 'sop-504-1b',
            category: 'PPE',
            title: 'PPE Kerja Bumbung & Sarung Tangan Penebat DC 1000V',
            instruction:
              'Pakai abah-abah keselamatan kerja bumbung dan sarung tangan berpenebat semasa memeriksa penyambung MC4 dan kotak penggabung DC.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-504-2a',
            category: 'PCD',
            title: 'Ujian Voc, Isc, Penebatan String DC & Fungsi Anti-Islanding',
            instruction:
              'Rekod voltan litar terbuka (Voc), arus litar pintas (Isc), periksa SPD AC/DC dan sahkan inverter memutuskan suapan apabila grid dimatikan.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-505',
      levelId: 'lvl-5',
      code: 'C05',
      title: 'Uninterruptable Power System (UPS) and Battery Charger Maintenance',
      description:
        'Penyelenggaraan unit UPS industri, bank bateri (battery banks), dan sistem pengecas bateri bagi beban kritikal.',
      order: 5,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C05 (DLKM Tahap 5)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C05: Topologi UPS (Online/Offline), Rectifier & Inverter',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C05 (DLKM Tahap 5)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C05: Senggaraan Bank Bateri, Pengecas & Static Bypass',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-505-1a',
            category: 'LOTO',
            title: 'Pemindahan ke Maintenance Bypass & Pengasingan Bank Bateri DC',
            instruction:
              'Ikuti urutan pensuisan Maintenance Bypass rasmi tanpa memutus beban kritikal, kemudian asingkan pemutus DC bank bateri sebelum senggaraan.',
            critical: true,
          },
          {
            id: 'sop-505-1b',
            category: 'PPE',
            title: 'PPE Bank Bateri (Pelindung Mata, Apron & Alat Tangan Berpenebat)',
            instruction:
              'Gunakan spanar berpenebat penuh dan cermin mata keselamatan bagi mengelakkan arka litar pintas DC berarus tinggi pada terminal bateri.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-505-2a',
            category: 'Langkah Kerja',
            title: 'Ujian Voltan Apungan (Float), Rintangan Dalaman Sel & Discharge Test',
            instruction:
              'Ukur voltan setiap sel bateri, periksa tork terminal, sahkan pengudaraan bilik bateri dan rekod prestasi pengecas serta masa sandaran UPS.',
            critical: true,
          },
        ],
      },
    },
    {
      id: 'cu-506',
      levelId: 'lvl-5',
      code: 'C06',
      title: 'Electrical Operation Management',
      description:
        'Pengurusan operasi elektrik menyeluruh peringkat fasiliti meliputi pematuhan perundangan, jadual penyelenggaraan bersepadu dan pengurusan bajet.',
      order: 6,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C06 (DLKM Tahap 5)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C06: Tadbir Urus Operasi, Akta Bekalan Elektrik & ST',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C06 (DLKM Tahap 5)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C06: CMMS, Pelan Senggaraan & Pengurusan Bajet Fasiliti',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-506-1a',
            category: 'LOTO',
            title: 'Audit Sistem Permit Kerja (PTW) & Kepatuhan Orang Kompeten',
            instruction:
              'Semak kesahihan lesen/perakuan orang kompeten, rekod pemeriksaan berkala ST dan pengurusan risiko keselamatan fasiliti.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-506-2a',
            category: 'Langkah Kerja',
            title: 'Penyediaan Pelan Senggaraan Tahunan (PPM) & Laporan KPI Fasiliti',
            instruction:
              'Bina jadual PPM bersepadu untuk MSB, genset, UPS dan PV beserta anggaran bajet alat ganti dan laporan prestasi MTBF/MTTR.',
            critical: false,
          },
        ],
      },
    },
    {
      id: 'cu-507',
      levelId: 'lvl-5',
      code: 'C07',
      title: 'Energy Management Operation',
      description:
        'Pelaksanaan audit tenaga elektrik, pemantauan kecekapan tenaga (power quality & kWh), pembetulan faktor kuasa, dan operasi pengurusan tenaga fasiliti.',
      order: 7,
      teoriSub1: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 1 — C07 (DLKM Tahap 5)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 1 — C07: Metodologi Audit Tenaga & Analisis Profil Beban',
      },
      teoriSub2: {
        notaSlot: null,
        panduanSoalanSlot: null,
        googleDriveUrl: '',
        googleDriveTitle: 'Folder Nota Google Drive Sub 2 — C07 (DLKM Tahap 5)',
        googleFormUrl: '',
        googleFormTitle: 'Latihan Teori Sub 2 — C07: Kualiti Kuasa, Faktor Kuasa & Penjimatan Tenaga',
      },
      amaliSub1: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-507-1a',
            category: 'PPE',
            title: 'Pemasangan Power Quality / Energy Logger di Papan Suis dengan Selamat',
            instruction:
              'Pakai PPE arka elektrik dan sarung tangan berpenebat semasa memasang clamp CT serta probe voltan penganalisis kuasa pada litar hidup.',
            critical: true,
          },
        ],
      },
      amaliSub2: {
        sopDocSlot: null,
        sopSteps: [
          {
            id: 'sop-507-2a',
            category: 'Langkah Kerja',
            title: 'Analisis Data Audit Tenaga, Harmonik & Cadangan Langkah Penjimatan (ECM)',
            instruction:
              'Analisa graf kW, kVA, kVAR, THD serta faktor kuasa puncak dan sediakan cadangan langkah penjimatan tenaga (ECM) bersama anggaran ROI.',
            critical: false,
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
    tugasanPapers: SEEDED_TUGASAN_PAPERS.map((p) => ({
      ...p,
      questions: p.questions.map((q) => ({ ...q })),
    })),
    tugasanSubmissions: [],
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
        teoriSub1: legacy.teoriSub1
          ? {
              ...legacy.teoriSub1,
              googleDriveUrl: legacy.teoriSub1.googleDriveUrl ?? '',
              googleDriveTitle:
                legacy.teoriSub1.googleDriveTitle ?? `Folder Nota Google Drive Sub 1 — ${legacy.code}`,
            }
          : {
              notaSlot: legacy.notaSlot ?? null,
              panduanSoalanSlot: legacy.panduanSoalanSlot ?? null,
              googleDriveUrl: '',
              googleDriveTitle: `Folder Nota Google Drive Sub 1 — ${legacy.code}`,
              googleFormUrl: legacy.googleFormUrl ?? '',
              googleFormTitle: legacy.googleFormTitle || `Latihan Teori Sub 1 — ${legacy.code}`,
            },
        teoriSub2: legacy.teoriSub2
          ? {
              ...legacy.teoriSub2,
              googleDriveUrl: legacy.teoriSub2.googleDriveUrl ?? '',
              googleDriveTitle:
                legacy.teoriSub2.googleDriveTitle ?? `Folder Nota Google Drive Sub 2 — ${legacy.code}`,
            }
          : {
              notaSlot: null,
              panduanSoalanSlot: null,
              googleDriveUrl: '',
              googleDriveTitle: `Folder Nota Google Drive Sub 2 — ${legacy.code}`,
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
    if (
      legacy.teoriSub1.googleDriveUrl === undefined ||
      legacy.teoriSub1.googleDriveTitle === undefined ||
      legacy.teoriSub2.googleDriveUrl === undefined ||
      legacy.teoriSub2.googleDriveTitle === undefined
    ) {
      migrated = true;
      return {
        ...legacy,
        teoriSub1: {
          ...legacy.teoriSub1,
          googleDriveUrl: legacy.teoriSub1.googleDriveUrl ?? '',
          googleDriveTitle:
            legacy.teoriSub1.googleDriveTitle ?? `Folder Nota Google Drive Sub 1 — ${legacy.code}`,
        },
        teoriSub2: {
          ...legacy.teoriSub2,
          googleDriveUrl: legacy.teoriSub2.googleDriveUrl ?? '',
          googleDriveTitle:
            legacy.teoriSub2.googleDriveTitle ?? `Folder Nota Google Drive Sub 2 — ${legacy.code}`,
        },
      };
    }
    return legacy;
  });

  // One-time upgrade from generic Tahap 2 placeholder to NOSS F432-005-2:2019 (C01-C04)
  const lvl2Index = levels.findIndex((l) => l.id === 'lvl-2');
  const legacyCu201 = cus.find((c) => c.id === 'cu-201');
  if (
    lvl2Index !== -1 &&
    levels[lvl2Index].title === 'Asas Pemasangan & Penyelenggaraan Bengkel' &&
    legacyCu201 &&
    legacyCu201.title === 'Keselamatan Bengkel & Peraturan PPE Asas'
  ) {
    migrated = true;
    const seed = createInitialData();
    const seedLvl2 = seed.levels.find((l) => l.id === 'lvl-2');
    if (seedLvl2) {
      levels[lvl2Index] = seedLvl2;
    }
    const seedTahap2CUs = seed.cus.filter((c) => c.levelId === 'lvl-2');
    const nonPlaceholderOtherCUs = cus.filter(
      (c) => c.id !== 'cu-201' && c.id !== 'cu-202'
    );
    const mergedTahap2 = seedTahap2CUs.map((seedCu) => {
      const prev = cus.find((c) => c.id === seedCu.id);
      if (!prev) return seedCu;
      return {
        ...seedCu,
        teoriSub1: {
          ...seedCu.teoriSub1,
          notaSlot: prev.teoriSub1.notaSlot,
          panduanSoalanSlot: prev.teoriSub1.panduanSoalanSlot,
          googleDriveUrl: prev.teoriSub1.googleDriveUrl || seedCu.teoriSub1.googleDriveUrl,
          googleFormUrl: prev.teoriSub1.googleFormUrl || seedCu.teoriSub1.googleFormUrl,
        },
        teoriSub2: {
          ...seedCu.teoriSub2,
          notaSlot: prev.teoriSub2.notaSlot,
          panduanSoalanSlot: prev.teoriSub2.panduanSoalanSlot,
          googleDriveUrl: prev.teoriSub2.googleDriveUrl || seedCu.teoriSub2.googleDriveUrl,
          googleFormUrl: prev.teoriSub2.googleFormUrl || seedCu.teoriSub2.googleFormUrl,
        },
        amaliSub1: {
          ...seedCu.amaliSub1,
          sopDocSlot: prev.amaliSub1.sopDocSlot,
        },
        amaliSub2: {
          ...seedCu.amaliSub2,
          sopDocSlot: prev.amaliSub2.sopDocSlot,
        },
      };
    });
    cus.splice(0, cus.length, ...mergedTahap2, ...nonPlaceholderOtherCUs);
  }

  // One-time upgrade from generic Tahap 3 placeholder to NOSS F432-005-3:2019 (C01-C07)
  const lvl3Index = levels.findIndex((l) => l.id === 'lvl-3');
  const legacyCu301 = cus.find((c) => c.id === 'cu-301');
  if (
    lvl3Index !== -1 &&
    levels[lvl3Index].title === 'Kawalan Industri & Penyeliaan Teknikal' &&
    legacyCu301 &&
    legacyCu301.title === 'Kawalan Motor Tiga Fasa & Pemula DOL'
  ) {
    migrated = true;
    const seed = createInitialData();
    const seedLvl3 = seed.levels.find((l) => l.id === 'lvl-3');
    if (seedLvl3) {
      levels[lvl3Index] = seedLvl3;
    }
    const seedTahap3CUs = seed.cus.filter((c) => c.levelId === 'lvl-3');
    const nonPlaceholderOtherCUs = cus.filter(
      (c) => c.id !== 'cu-301' && c.id !== 'cu-302'
    );
    const mergedTahap3 = seedTahap3CUs.map((seedCu) => {
      const prev = cus.find((c) => c.id === seedCu.id);
      if (!prev) return seedCu;
      return {
        ...seedCu,
        teoriSub1: {
          ...seedCu.teoriSub1,
          notaSlot: prev.teoriSub1.notaSlot,
          panduanSoalanSlot: prev.teoriSub1.panduanSoalanSlot,
          googleDriveUrl: prev.teoriSub1.googleDriveUrl || seedCu.teoriSub1.googleDriveUrl,
          googleFormUrl: prev.teoriSub1.googleFormUrl || seedCu.teoriSub1.googleFormUrl,
        },
        teoriSub2: {
          ...seedCu.teoriSub2,
          notaSlot: prev.teoriSub2.notaSlot,
          panduanSoalanSlot: prev.teoriSub2.panduanSoalanSlot,
          googleDriveUrl: prev.teoriSub2.googleDriveUrl || seedCu.teoriSub2.googleDriveUrl,
          googleFormUrl: prev.teoriSub2.googleFormUrl || seedCu.teoriSub2.googleFormUrl,
        },
        amaliSub1: {
          ...seedCu.amaliSub1,
          sopDocSlot: prev.amaliSub1.sopDocSlot,
        },
        amaliSub2: {
          ...seedCu.amaliSub2,
          sopDocSlot: prev.amaliSub2.sopDocSlot,
        },
      };
    });
    const lvl2OrBefore = nonPlaceholderOtherCUs.filter((c) => c.levelId === 'lvl-2');
    const lvl4OrAfter = nonPlaceholderOtherCUs.filter((c) => c.levelId !== 'lvl-2');
    cus.splice(0, cus.length, ...lvl2OrBefore, ...mergedTahap3, ...lvl4OrAfter);
  }

  // One-time upgrade from generic Tahap 4 placeholder to NOSS F432-005-4:2019 (C01-C09)
  const lvl4Index = levels.findIndex((l) => l.id === 'lvl-4');
  const legacyCu401 = cus.find((c) => c.id === 'cu-401');
  if (
    lvl4Index !== -1 &&
    levels[lvl4Index].title === 'Pengurusan Sistem & Diagnostik Lanjutan' &&
    legacyCu401 &&
    legacyCu401.title === 'Diagnostik Kerosakan & Audit Keselamatan SOP'
  ) {
    migrated = true;
    const seed = createInitialData();
    const seedLvl4 = seed.levels.find((l) => l.id === 'lvl-4');
    if (seedLvl4) {
      levels[lvl4Index] = seedLvl4;
    }
    const seedTahap4CUs = seed.cus.filter((c) => c.levelId === 'lvl-4');
    const otherCUs = cus.filter((c) => c.id !== 'cu-401');
    const mergedTahap4 = seedTahap4CUs.map((seedCu) => {
      const prev = cus.find((c) => c.id === seedCu.id);
      if (!prev) return seedCu;
      return {
        ...seedCu,
        teoriSub1: {
          ...seedCu.teoriSub1,
          notaSlot: prev.teoriSub1.notaSlot,
          panduanSoalanSlot: prev.teoriSub1.panduanSoalanSlot,
          googleDriveUrl: prev.teoriSub1.googleDriveUrl || seedCu.teoriSub1.googleDriveUrl,
          googleFormUrl: prev.teoriSub1.googleFormUrl || seedCu.teoriSub1.googleFormUrl,
        },
        teoriSub2: {
          ...seedCu.teoriSub2,
          notaSlot: prev.teoriSub2.notaSlot,
          panduanSoalanSlot: prev.teoriSub2.panduanSoalanSlot,
          googleDriveUrl: prev.teoriSub2.googleDriveUrl || seedCu.teoriSub2.googleDriveUrl,
          googleFormUrl: prev.teoriSub2.googleFormUrl || seedCu.teoriSub2.googleFormUrl,
        },
        amaliSub1: {
          ...seedCu.amaliSub1,
          sopDocSlot: prev.amaliSub1.sopDocSlot,
        },
        amaliSub2: {
          ...seedCu.amaliSub2,
          sopDocSlot: prev.amaliSub2.sopDocSlot,
        },
      };
    });
    cus.splice(0, cus.length, ...otherCUs, ...mergedTahap4);
  }

  // Add Tahap 5 (DLKM F432-005-5:2019) if missing in existing store
  if (!levels.some((l) => l.id === 'lvl-5')) {
    migrated = true;
    const seed = createInitialData();
    const seedLvl5 = seed.levels.find((l) => l.id === 'lvl-5');
    if (seedLvl5) {
      levels.push(seedLvl5);
    }
    const seedTahap5CUs = seed.cus.filter((c) => c.levelId === 'lvl-5');
    for (const seedCu of seedTahap5CUs) {
      if (!cus.some((c) => c.id === seedCu.id)) {
        cus.push(seedCu);
      }
    }
  }

  // Backfill KPC01 (KP 1/5 - KP 5/5) E-Book modules onto Tahap 2 CU 1 (cu-201)
  const cu201Target = cus.find((c) => c.id === 'cu-201');
  if (cu201Target && (!cu201Target.ebookModules || cu201Target.ebookModules.length === 0)) {
    const seededEbooks = ensureKpc01EbookModules();
    if (seededEbooks.length > 0) {
      cu201Target.ebookModules = seededEbooks;
      migrated = true;
    }
  } else if (cu201Target && cu201Target.ebookModules && cu201Target.ebookModules.length > 0) {
    // Ensure underlying physical files exist in uploads/ if synced from seed
    ensureKpc01EbookModules();
  }

  // Backfill Google Drive folder & KPC02 (KP 1/19 - KP 19/19) E-Book modules onto Tahap 2 CU 2 (cu-202)
  const cu202Target = cus.find((c) => c.id === 'cu-202');
  if (cu202Target && !cu202Target.teoriSub1.googleDriveUrl) {
    cu202Target.teoriSub1.googleDriveUrl =
      'https://drive.google.com/drive/folders/1A8lD5Yh3s0-BjnE0Mtvqx_D2kj-Bney-?usp=sharing';
    cu202Target.teoriSub1.googleDriveTitle = 'Nota Pembelajaran C02 (Tahap 2) — Google Drive';
    migrated = true;
  }
  if (cu202Target && (!cu202Target.ebookModules || cu202Target.ebookModules.length === 0)) {
    const seededKpc02 = ensureKpc02EbookModules();
    if (seededKpc02.length > 0) {
      cu202Target.ebookModules = seededKpc02;
      migrated = true;
    }
  } else if (cu202Target && cu202Target.ebookModules && cu202Target.ebookModules.length > 0) {
    // Ensure underlying physical files exist in uploads/ if synced from seed
    ensureKpc02EbookModules();
  }

  // Backfill KPC03 (KP 1/5 - KP 5/5) E-Book modules onto Tahap 2 CU 3 (cu-203)
  const cu203Target = cus.find((c) => c.id === 'cu-203');
  if (cu203Target && (!cu203Target.ebookModules || cu203Target.ebookModules.length === 0)) {
    const seededKpc03 = ensureKpc03EbookModules();
    if (seededKpc03.length > 0) {
      cu203Target.ebookModules = seededKpc03;
      migrated = true;
    }
  } else if (cu203Target && cu203Target.ebookModules && cu203Target.ebookModules.length > 0) {
    // Ensure underlying physical files exist in uploads/ if synced from seed
    ensureKpc03EbookModules();
  }

  // Backfill KPC04 (KP 1/5 - KP 5/5) E-Book modules onto Tahap 2 CU 4 (cu-204)
  const cu204Target = cus.find((c) => c.id === 'cu-204');
  if (cu204Target && (!cu204Target.ebookModules || cu204Target.ebookModules.length === 0)) {
    const seededKpc04 = ensureKpc04EbookModules();
    if (seededKpc04.length > 0) {
      cu204Target.ebookModules = seededKpc04;
      migrated = true;
    }
  } else if (cu204Target && cu204Target.ebookModules && cu204Target.ebookModules.length > 0) {
    // Ensure underlying physical files exist in uploads/ if synced from seed
    ensureKpc04EbookModules();
  }

  for (const cu of cus) {
    if (!Array.isArray(cu.ebookModules)) {
      cu.ebookModules = [];
      migrated = true;
    }
  }

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

  const tugasanPapers: TugasanPaper[] = Array.isArray(base.tugasanPapers)
    ? [...base.tugasanPapers]
    : [];
  if (!Array.isArray(base.tugasanPapers)) {
    migrated = true;
  }
  const existingPaperIds = new Set(tugasanPapers.map((p) => p.id));
  for (const seededPaper of SEEDED_TUGASAN_PAPERS) {
    if (!existingPaperIds.has(seededPaper.id) && cus.some((c) => c.id === seededPaper.cuId)) {
      tugasanPapers.push({
        ...seededPaper,
        questions: seededPaper.questions.map((q) => ({ ...q })),
      });
      existingPaperIds.add(seededPaper.id);
      migrated = true;
    }
  }
  for (const cu of cus) {
    if (!tugasanPapers.some((p) => p.cuId === cu.id)) {
      const lvl = levels.find((l) => l.id === cu.levelId);
      if (lvl) {
        tugasanPapers.push(createDefaultTugasanForCustomCu(lvl, cu));
        migrated = true;
      }
    }
  }

  const tugasanSubmissions: TugasanSubmission[] = Array.isArray(base.tugasanSubmissions)
    ? [...base.tugasanSubmissions]
    : [];
  if (!Array.isArray(base.tugasanSubmissions)) {
    migrated = true;
  }

  return {
    store: {
      adminEmail: base.adminEmail || ADMIN_EMAIL,
      adminPasswordHash: base.adminPasswordHash ?? null,
      branding,
      users,
      levels,
      cus,
      tugasanPapers,
      tugasanSubmissions,
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

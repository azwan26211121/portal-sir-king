export type UserRole = 'pelatih' | 'pengajar' | 'admin' | 'master_admin';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type LearningSection = 'teori' | 'amali_sop' | 'latihan';

export type SubKey = 'sub1' | 'sub2';

export type FileSlotType =
  | 'teori_sub1_nota'
  | 'teori_sub1_panduan'
  | 'teori_sub2_nota'
  | 'teori_sub2_panduan'
  | 'amali_sub1_sop'
  | 'amali_sub2_sop';

export type SopCategory = 'LOTO' | 'PCD' | 'PPE' | 'Langkah Kerja';

export interface FileMetadata {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  extension: '.pdf' | '.doc' | '.docx';
  sizeBytes: number;
  uploadedAt: string;
  uploadedById: string;
  uploadedByName: string;
}

export interface SopStep {
  id: string;
  category: SopCategory;
  title: string;
  instruction: string;
  critical: boolean;
}

export interface TeoriSubContent {
  notaSlot: FileMetadata | null;
  panduanSoalanSlot: FileMetadata | null;
  googleFormUrl: string;
  googleFormTitle: string;
}

export interface AmaliSubContent {
  sopDocSlot: FileMetadata | null;
  sopSteps: SopStep[];
}

export interface TopicLevel {
  id: string;
  code: string;
  title: string;
  description: string;
  order: number;
  teoriSub1Title: string;
  teoriSub2Title: string;
  amaliSub1Title: string;
  amaliSub2Title: string;
}

export interface CUModule {
  id: string;
  levelId: string;
  code: string;
  title: string;
  description: string;
  order: number;
  // TEORI/ folder divided into 2 subs
  teoriSub1: TeoriSubContent;
  teoriSub2: TeoriSubContent;
  // AMALI/ folder divided into 2 subs
  amaliSub1: AmaliSubContent;
  amaliSub2: AmaliSubContent;
}

export interface PublicUser {
  id: string;
  userId: string;
  name: string;
  email?: string;
  role: UserRole;
  status: ApprovalStatus;
  passwordConfigured?: boolean;
  supervisorId: string | null;
  supervisorName: string | null;
  requestedLevelId: string | null;
  approvedLevelId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherOption {
  id: string;
  name: string;
}

export interface SopCheckProgress {
  userId: string;
  cuId: string;
  subKey: SubKey;
  checkedStepIds: string[];
  updatedAt: string;
}

export interface AccessLogEntry {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  cuId: string;
  cuCode: string;
  cuTitle: string;
  subKey?: SubKey;
  action: 'view_nota' | 'view_panduan' | 'open_form' | 'view_sop' | 'complete_sop';
  timestamp: string;
}

export interface AuthStatusResponse {
  adminConfigured: boolean;
  adminEmail: string;
}

export interface BrandingConfig {
  portalName: string;
  portalTagline: string;
  logoUrl: string;
  bannerUrl: string;
  hasCustomLogo: boolean;
  hasCustomBanner: boolean;
  updatedAt: string;
}

export type UserRole = 'pelatih' | 'pengajar' | 'admin' | 'master_admin';

export type AccessTierRole = 'MASTER_ADMIN' | 'ADMIN' | 'PENGAJAR' | 'PELATIH';

export type JpkDriveFileCategory =
  | 'kp'
  | 'kt'
  | 'kk'
  | 'penilaian_teori'
  | 'pmt_pma';

export interface JpkDriveCategoryMeta {
  key: JpkDriveFileCategory;
  codeBadge: string;
  label: string;
  description: string;
  staffOnly?: boolean;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type LearningSection = 'teori' | 'amali_sop' | 'latihan' | 'tugasan';

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
  googleDriveUrl: string;
  googleDriveTitle: string;
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

export interface EbookNoteModule {
  id: string;
  code: string;
  title: string;
  file: FileMetadata;
}

export interface CUModule {
  id: string;
  levelId: string;
  code: string;
  title: string;
  description: string;
  order: number;
  ebookModules?: EbookNoteModule[];
  // TEORI/ folder divided into 2 subs
  teoriSub1: TeoriSubContent;
  teoriSub2: TeoriSubContent;
  // AMALI/ folder divided into 2 subs
  amaliSub1: AmaliSubContent;
  amaliSub2: AmaliSubContent;
}

export type TugasanQuestionType =
  | 'text'
  | 'mcq'
  | 'true_false'
  | 'matching'
  | 'diagram_label'
  | 'symbol_draw';

export interface PdfPoint {
  page: number; // 1-indexed page number in source PDF
  x: number; // PDF coordinate (origin bottom-left, points)
  y: number; // PDF coordinate (origin bottom-left, points)
}

export interface PdfBox {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfQuestionOverlaySpec {
  markPos: PdfPoint;
  mcqChoices?: Record<string, PdfPoint>;
  textLines?: {
    page: number;
    x: number;
    y: number;
    width: number;
    lineHeight?: number;
    maxLines?: number;
  }[];
  trueFalseRows?: {
    key: string;
    page: number;
    boxX: number;
    boxY: number;
  }[];
  matchingLeftPoints?: { rowIdx: number; page: number; x: number; y: number }[];
  matchingRightPoints?: { rowIdx: number; page: number; x: number; y: number }[];
  symbolCells?: { rowIdx: number; page: number; x: number; y: number; w: number; h: number }[];
  answerSlots?: { key: string; page: number; x: number; y: number; maxWidth: number }[];
}

export interface PdfPaperOverlayMeta {
  namePos: PdfPoint;
  icPos: PdfPoint;
  datePos: PdfPoint;
  userIdPos?: PdfPoint;
  totalMarkPos: PdfPoint;
  statusPos?: PdfPoint;
  stampBox: PdfBox;
  headerLogoBox?: PdfBox;
  headerAddrBox?: PdfBox;
}

export interface TugasanQuestion {
  id: string;
  numberLabel: string;
  prompt: string;
  subPrompts?: string[];
  maxMarks: number;
  rubricHint: string;
  questionType?: TugasanQuestionType;
  mcqStatements?: string[];
  mcqOptions?: {
    key: string;
    label: string;
    imageUrl?: string;
    symbolId?: string;
  }[];
  diagramImageUrl?: string;
  diagramCaption?: string;
  diagramCallouts?: {
    key: string;
    topPercent: number;
    leftPercent: number;
    widthPercent?: number;
    heightPercent?: number;
    opaqueMask?: boolean;
  }[];
  trueFalseItems?: { key: string; text: string }[];
  matchingLeftHeader?: string;
  matchingRightHeader?: string;
  matchingRows?: {
    leftText: string;
    rightText?: string;
    rightImageUrl?: string;
  }[];
  symbolRows?: {
    bil: string;
    label: string;
    imageUrl: string;
  }[];
  pdfOverlay?: PdfQuestionOverlaySpec;
}

export interface TugasanPaper {
  id: string;
  cuId: string;
  setCode: string;
  programCodeTitle: string;
  tahap: string;
  cuCodeTitle: string;
  workActivities: string[];
  paperCode: string;
  title: string;
  purpose: string;
  instructions: string[];
  passingScore: number;
  questions: TugasanQuestion[];
  references: string[];
  sourceEbookId?: string;
  sourcePdfUrl?: string;
  sourcePdfStoredName?: string;
  sourcePdfFileName?: string;
  sourceDriveFileId?: string;
  sourceDriveFileName?: string;
  pdfOverlayMeta?: PdfPaperOverlayMeta;
  updatedAt: string;
}

export interface TugasanAnswerGrade {
  questionId: string;
  answerText: string;
  marksAwarded: number;
  maxMarks: number;
  status: 'betul' | 'separa' | 'salah';
  itemStatuses?: ('betul' | 'salah')[];
  aiFeedback: string;
  skemaJawapan: string;
}

export interface TugasanSubmission {
  id: string;
  templateId: string;
  cuId: string;
  userId: string;
  userName: string;
  userCodeId: string;
  userIcNumber?: string;
  submittedAt: string;
  answers: Record<string, string>;
  grades: TugasanAnswerGrade[];
  totalScore: number;
  maxTotalScore: number;
  percentage: number;
  passed: boolean;
  overallFeedback: string;
  gradedByModel: string;
  sourceDriveFileId?: string;
  sourceDriveFileName?: string;
  driveFolderId?: string;
  driveFolderName?: string;
  driveFolderUrl?: string;
  driveFileId?: string;
  driveFileUrl?: string;
  driveSyncedAt?: string;
}

export interface ExternalDrivePdfSession {
  cuId: string;
  driveFileId: string;
  fileName: string;
  subfolderName: string;
  category?: JpkDriveFileCategory;
  pdfBytes: Uint8Array;
  paper: TugasanPaper;
}

export interface UserChangeLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetUserId?: string;
  targetName?: string;
  details: string;
}

export interface DriveRegistryUserRecord {
  id: string;
  userId: string;
  name: string;
  icNumber: string;
  email: string;
  role: UserRole;
  accessTier: AccessTierRole;
  status: ApprovalStatus;
  supervisorId: string | null;
  supervisorName: string;
  requestedLevelId: string | null;
  requestedLevelLabel: string;
  approvedLevelId: string | null;
  approvedLevelLabel: string;
  createdAt: string;
  updatedAt: string;
}

export interface DriveSystemRegistryPayload {
  version: number;
  updatedAt: string;
  collegeName: string;
  driveRecordsFolderId: string;
  roles: AccessTierRole[];
  summary: {
    totalUsers: number;
    approved: number;
    pending: number;
    rejected: number;
  };
  users: DriveRegistryUserRecord[];
  changeLogs: UserChangeLogEntry[];
}

export interface PublicUser {
  id: string;
  userId: string;
  name: string;
  icNumber?: string;
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
  action:
    | 'view_nota'
    | 'view_panduan'
    | 'open_drive'
    | 'open_form'
    | 'view_sop'
    | 'complete_sop'
    | 'submit_tugasan'
    | 'print_tugasan'
    | 'sync_drive';
  timestamp: string;
}

export interface AuthStatusResponse {
  adminConfigured: boolean;
}

export interface BrandingConfig {
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
  logoUrl: string;
  bannerUrl: string;
  collegeName: string;
  collegeAddress: string;
  driveRecordsFolderId: string;
  driveRecordsFolderUrl: string;
  hasCustomLogo: boolean;
  hasCustomBanner: boolean;
  paymentQrUrl: string | null;
  hasPaymentQr: boolean;
  paymentQrTitle: string;
  paymentQrNote: string;
  whatsappQrUrl: string | null;
  hasWhatsappQr: boolean;
  whatsappQrTitle: string;
  whatsappQrNote: string;
  whatsappUrl: string;
  updatedAt: string;
}

import type {
  AccessLogEntry,
  ApprovalStatus,
  AuthStatusResponse,
  BrandingConfig,
  CUModule,
  FileSlotType,
  PublicUser,
  SopCheckProgress,
  SopStep,
  SubKey,
  TeacherOption,
  TopicLevel,
  UserRole,
} from '../types.ts';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function requestJson<T>(
  url: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(options.body instanceof FormData) && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  if (!res.ok) {
    const msg = typeof data.error === 'string' ? data.error : `Ralat pelayan (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const api = {
  getAuthStatus(): Promise<AuthStatusResponse> {
    return requestJson<AuthStatusResponse>('/api/auth/status');
  },

  getPublicInfo(): Promise<{ teachers: TeacherOption[]; levels: TopicLevel[] }> {
    return requestJson('/api/auth/public-info');
  },

  getBranding(): Promise<{ branding: BrandingConfig }> {
    return requestJson('/api/branding');
  },

  updateBrandingText(
    token: string,
    portalName: string,
    portalTagline: string
  ): Promise<{ branding: BrandingConfig }> {
    return requestJson(
      '/api/branding',
      {
        method: 'PATCH',
        body: JSON.stringify({ portalName, portalTagline }),
      },
      token
    );
  },

  uploadBrandingImage(
    token: string,
    kind: 'logo' | 'banner',
    file: File
  ): Promise<{ branding: BrandingConfig }> {
    const formData = new FormData();
    formData.append('file', file);
    return requestJson(
      `/api/branding/${encodeURIComponent(kind)}`,
      { method: 'POST', body: formData },
      token
    );
  },

  resetBrandingImage(
    token: string,
    kind: 'logo' | 'banner'
  ): Promise<{ branding: BrandingConfig }> {
    return requestJson(
      `/api/branding/${encodeURIComponent(kind)}`,
      { method: 'DELETE' },
      token
    );
  },

  claimAdminPassword(email: string, password: string): Promise<{ token: string; user: PublicUser }> {
    return requestJson('/api/auth/admin-claim', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  loginMasterAdmin(email: string, password: string): Promise<{ token: string; user: PublicUser }> {
    return requestJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ role: 'master_admin', email, password }),
    });
  },

  loginAdmin(userId: string, password: string): Promise<{ token: string; user: PublicUser }> {
    return requestJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ role: 'admin', userId, password }),
    });
  },

  loginWithPin(
    role: 'pelatih' | 'pengajar',
    userId: string,
    pin: string
  ): Promise<{ token: string; user: PublicUser }> {
    return requestJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ role, userId, pin }),
    });
  },

  registerUser(payload: {
    role: 'pelatih' | 'pengajar';
    userId: string;
    name: string;
    pin: string;
    supervisorId?: string;
    requestedLevelId?: string;
  }): Promise<{ token: string; user: PublicUser }> {
    return requestJson('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  logout(token: string): Promise<{ ok: boolean }> {
    return requestJson('/api/auth/logout', { method: 'POST' }, token);
  },

  getMe(token: string): Promise<{ user: PublicUser }> {
    return requestJson('/api/auth/me', {}, token);
  },

  updateOwnPin(
    token: string,
    currentPin: string,
    newPin: string
  ): Promise<{ ok: boolean; user: PublicUser }> {
    return requestJson(
      '/api/auth/pin',
      {
        method: 'PATCH',
        body: JSON.stringify({ currentPin, newPin }),
      },
      token
    );
  },

  updateOwnPassword(
    token: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ ok: boolean; user: PublicUser }> {
    return requestJson(
      '/api/auth/password',
      {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      },
      token
    );
  },

  getWorkspace(token: string): Promise<{
    levels: TopicLevel[];
    cus: CUModule[];
    sopProgress: SopCheckProgress[];
    accessLogs: AccessLogEntry[];
    teachers: TeacherOption[];
  }> {
    return requestJson('/api/workspace', {}, token);
  },

  createLevel(
    token: string,
    payload: {
      code: string;
      title: string;
      description: string;
      teoriSub1Title?: string;
      teoriSub2Title?: string;
      amaliSub1Title?: string;
      amaliSub2Title?: string;
    }
  ): Promise<{ level: TopicLevel }> {
    return requestJson(
      '/api/levels',
      { method: 'POST', body: JSON.stringify(payload) },
      token
    );
  },

  updateLevel(
    token: string,
    id: string,
    payload: {
      code?: string;
      title?: string;
      description?: string;
      teoriSub1Title?: string;
      teoriSub2Title?: string;
      amaliSub1Title?: string;
      amaliSub2Title?: string;
    }
  ): Promise<{ level: TopicLevel }> {
    return requestJson(
      `/api/levels/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
      token
    );
  },

  deleteLevel(token: string, id: string): Promise<{ ok: boolean }> {
    return requestJson(`/api/levels/${encodeURIComponent(id)}`, { method: 'DELETE' }, token);
  },

  createCU(
    token: string,
    payload: { levelId: string; code: string; title: string; description: string }
  ): Promise<{ cu: CUModule }> {
    return requestJson('/api/cus', { method: 'POST', body: JSON.stringify(payload) }, token);
  },

  updateCU(
    token: string,
    id: string,
    payload: { levelId?: string; code?: string; title?: string; description?: string }
  ): Promise<{ cu: CUModule }> {
    return requestJson(
      `/api/cus/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
      token
    );
  },

  deleteCU(token: string, id: string): Promise<{ ok: boolean }> {
    return requestJson(`/api/cus/${encodeURIComponent(id)}`, { method: 'DELETE' }, token);
  },

  uploadSlotFile(
    token: string,
    cuId: string,
    slotType: FileSlotType,
    file: File
  ): Promise<{ cu: CUModule }> {
    const formData = new FormData();
    formData.append('file', file);
    return requestJson(
      `/api/cus/${encodeURIComponent(cuId)}/slots/${encodeURIComponent(slotType)}`,
      { method: 'POST', body: formData },
      token
    );
  },

  deleteSlotFile(
    token: string,
    cuId: string,
    slotType: FileSlotType
  ): Promise<{ cu: CUModule }> {
    return requestJson(
      `/api/cus/${encodeURIComponent(cuId)}/slots/${encodeURIComponent(slotType)}`,
      { method: 'DELETE' },
      token
    );
  },

  async fetchProtectedFileBlob(token: string, fileId: string): Promise<Blob> {
    const res = await fetch(`/api/files/${encodeURIComponent(fileId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      let msg = 'Gagal memuat turun fail.';
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        // ignore
      }
      throw new ApiError(msg, res.status);
    }
    return res.blob();
  },

  updateGoogleForm(
    token: string,
    cuId: string,
    subKey: SubKey,
    googleFormUrl: string,
    googleFormTitle: string
  ): Promise<{ cu: CUModule }> {
    return requestJson(
      `/api/cus/${encodeURIComponent(cuId)}/google-form`,
      {
        method: 'PUT',
        body: JSON.stringify({ subKey, googleFormUrl, googleFormTitle }),
      },
      token
    );
  },

  updateSopSteps(
    token: string,
    cuId: string,
    subKey: SubKey,
    sopSteps: SopStep[]
  ): Promise<{ cu: CUModule }> {
    return requestJson(
      `/api/cus/${encodeURIComponent(cuId)}/sop-steps`,
      {
        method: 'PUT',
        body: JSON.stringify({ subKey, sopSteps }),
      },
      token
    );
  },

  saveSopCheck(
    token: string,
    cuId: string,
    subKey: SubKey,
    checkedStepIds: string[]
  ): Promise<{ progress: SopCheckProgress }> {
    return requestJson(
      `/api/cus/${encodeURIComponent(cuId)}/sop-check`,
      {
        method: 'POST',
        body: JSON.stringify({ subKey, checkedStepIds }),
      },
      token
    );
  },

  logAccess(
    token: string,
    cuId: string,
    action: AccessLogEntry['action'],
    subKey?: SubKey
  ): Promise<{ entry: AccessLogEntry }> {
    return requestJson(
      '/api/access-logs',
      {
        method: 'POST',
        body: JSON.stringify({ cuId, subKey, action }),
      },
      token
    );
  },

  getUsers(token: string): Promise<{ users: PublicUser[] }> {
    return requestJson('/api/users', {}, token);
  },

  approveUser(
    token: string,
    userId: string,
    status: ApprovalStatus,
    approvedLevelId?: string
  ): Promise<{ user: PublicUser }> {
    return requestJson(
      `/api/users/${encodeURIComponent(userId)}/approve`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, approvedLevelId }),
      },
      token
    );
  },

  adminCreateUser(
    token: string,
    payload: {
      userId: string;
      name: string;
      role: 'pelatih' | 'pengajar' | 'admin';
      pin?: string;
      password?: string;
      status: ApprovalStatus;
      supervisorId?: string;
      approvedLevelId?: string;
    }
  ): Promise<{ user: PublicUser }> {
    return requestJson(
      '/api/admin/users',
      { method: 'POST', body: JSON.stringify(payload) },
      token
    );
  },

  adminUpdateUser(
    token: string,
    userId: string,
    payload: {
      userId?: string;
      name?: string;
      role?: UserRole;
      status?: ApprovalStatus;
      supervisorId?: string | null;
      approvedLevelId?: string | null;
      newPin?: string;
      newPassword?: string;
    }
  ): Promise<{ user: PublicUser }> {
    return requestJson(
      `/api/admin/users/${encodeURIComponent(userId)}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
      token
    );
  },

  adminDeleteUser(token: string, userId: string): Promise<{ ok: boolean }> {
    return requestJson(
      `/api/admin/users/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
      token
    );
  },
};

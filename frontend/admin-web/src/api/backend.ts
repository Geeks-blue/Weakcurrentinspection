import type { AssetRoomEdit, AssetItemEdit } from "../types";
// 房间CRUD
export async function createRoom(payload: AssetRoomEdit): Promise<AssetRoomItem> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/assets/room`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`新增房间失败：${readErrorDetail(data)}`);
  return data as AssetRoomItem;
}

export async function updateRoom(room_id: number, payload: AssetRoomEdit): Promise<AssetRoomItem> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/assets/room/${room_id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`编辑房间失败：${readErrorDetail(data)}`);
  return data as AssetRoomItem;
}

export async function deleteRoom(room_id: number, force = false): Promise<{ ok: boolean }> {
  const token = getAccessToken();
  const url = `${getBackendBaseUrl()}/assets/room/${room_id}${force ? "?force=true" : ""}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json();
  if (!response.ok) {
    const detail: string = data?.detail ?? "";
    if (response.status === 409 && detail.startsWith("ROOM_HAS_INSPECTIONS:")) {
      const count = parseInt(detail.split(":")[1] || "0");
      const err = new Error(`ROOM_HAS_INSPECTIONS:${count}`) as Error & { inspectionCount: number };
      err.inspectionCount = count;
      throw err;
    }
    throw new Error(`删除房间失败：${readErrorDetail(data)}`);
  }
  return data as { ok: boolean };
}

export function getRoomQrcodeUrl(room_id: number): string {
  return `${getBackendBaseUrl()}/assets/room/${room_id}/qrcode?token=${getAccessToken()}`;
}

// 资产CRUD
export async function createAsset(payload: AssetItemEdit): Promise<AssetItemView> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/assets/item`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`新增资产失败：${readErrorDetail(data)}`);
  return data as AssetItemView;
}

export async function updateAsset(asset_id: number, payload: AssetItemEdit): Promise<AssetItemView> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/assets/item/${asset_id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`编辑资产失败：${readErrorDetail(data)}`);
  return data as AssetItemView;
}

export async function deleteAsset(asset_id: number): Promise<{ ok: boolean }> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/assets/item/${asset_id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`删除资产失败：${readErrorDetail(data)}`);
  return data as { ok: boolean };
}

export function getAssetQrcodeUrl(asset_id: number): string {
  return `${getBackendBaseUrl()}/assets/item/${asset_id}/qrcode?token=${getAccessToken()}`;
}
// 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
import type {
  ConsoleInspectionItem,
  DeleteInspectionResponse,
  DispatchRoomOption,
  DispatchStudentOption,
  AssetItemView,
  AssetRoomItem,
  ImportSummary,
  LoginResponse,
  InspectionPhotoUploadResponse,
  PendingReviewInspectionItem,
  RegisterUserRequest,
  RegisterUserResponse,
  ReviewAction,
  ReviewInspectionResponse,
  TaskDispatchOptionsResponse,
  TaskAssignmentItem,
  UserProfile,
  DeleteTaskAssignmentResponse,
  PendingTaskManageItem,
  UpdateTaskAssignmentPayload,
  UpdateTaskAssignmentResponse
} from "../types";
import { frontendConfig } from "../config";

const TOKEN_KEY = "wc.auth.token";

export function getBackendBaseUrl(): string {
  return frontendConfig.backendBaseUrl;
}

export function getMobileWebUrl(): string {
  return frontendConfig.mobileWebUrl;
}

export function getAccessToken(): string {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function readErrorDetail(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (typeof data === "object" && data !== null) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string") {
      return detail;
    }
    return JSON.stringify(detail ?? data);
  }
  return "未知错误";
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${getBackendBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const detail = data?.detail;
    throw new Error(typeof detail === "string" ? detail : `登录失败：${response.status}`);
  }

  return (await response.json()) as LoginResponse;
}

export async function getMyTasks(): Promise<TaskAssignmentItem[]> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/tasks/my`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`加载任务失败：${response.status}`);
  }

  return (await response.json()) as TaskAssignmentItem[];
}

export async function getMe(): Promise<UserProfile> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/auth/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`获取用户信息失败：${response.status}`);
  }

  return (await response.json()) as UserProfile;
}

export async function getPendingReviewInspections(): Promise<PendingReviewInspectionItem[]> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/inspections/pending-review`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`加载待审核记录失败：${response.status}`);
  }

  return (await response.json()) as PendingReviewInspectionItem[];
}

export async function uploadInspectionPhoto(file: Blob, filename: string): Promise<InspectionPhotoUploadResponse> {
  const token = getAccessToken();
  const formData = new FormData();
  formData.append("file", file, filename);

  const response = await fetch(`${getBackendBaseUrl()}/inspections/photos/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`上传照片失败：${readErrorDetail(data)}`);
  }

  return data as InspectionPhotoUploadResponse;
}

export interface ConsoleInspectionFilters {
  status?: string;
  room_code?: string;
  student_username?: string;
  submitted_from?: string;
  submitted_to?: string;
  limit?: number;
}

export async function getConsoleInspections(filters: ConsoleInspectionFilters = {}): Promise<ConsoleInspectionItem[]> {
  const token = getAccessToken();
  const params = new URLSearchParams();
  params.set("limit", String(filters.limit ?? 120));
  if (filters.status) params.set("status", filters.status);
  if (filters.room_code) params.set("room_code", filters.room_code);
  if (filters.student_username) params.set("student_username", filters.student_username);
  if (filters.submitted_from) params.set("submitted_from", filters.submitted_from);
  if (filters.submitted_to) params.set("submitted_to", filters.submitted_to);
  const response = await fetch(`${getBackendBaseUrl()}/inspections/console-records?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`加载巡检记录失败：${response.status}`);
  }

  return (await response.json()) as ConsoleInspectionItem[];
}

export async function deleteInspectionRecord(inspectionId: number): Promise<DeleteInspectionResponse> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/inspections/${inspectionId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`删除失败：${readErrorDetail(data)}`);
  }

  return data as DeleteInspectionResponse;
}

export async function reviewInspection(
  inspectionId: number,
  action: ReviewAction,
  reason: string
): Promise<ReviewInspectionResponse> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/inspections/${inspectionId}/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ action, reason: reason.trim() || null })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`审核失败：${readErrorDetail(data)}`);
  }

  return data as ReviewInspectionResponse;
}

export async function registerUser(payload: RegisterUserRequest): Promise<RegisterUserResponse> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`注册失败：${readErrorDetail(data)}`);
  }

  return data as RegisterUserResponse;
}

export async function getTaskDispatchOptions(): Promise<TaskDispatchOptionsResponse> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/tasks/dispatch-options`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`加载派单选项失败：${response.status}`);
  }

  return (await response.json()) as TaskDispatchOptionsResponse;
}

export async function getPendingTaskAssignments(): Promise<PendingTaskManageItem[]> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/tasks/pending`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`加载待巡检任务失败：${response.status}`);
  }

  return (await response.json()) as PendingTaskManageItem[];
}

export async function updateTaskAssignment(
  assignmentId: number,
  payload: UpdateTaskAssignmentPayload
): Promise<UpdateTaskAssignmentResponse> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/tasks/${assignmentId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`修改任务失败：${readErrorDetail(data)}`);
  }

  return data as UpdateTaskAssignmentResponse;
}

export async function deleteTaskAssignment(assignmentId: number): Promise<DeleteTaskAssignmentResponse> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/tasks/${assignmentId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`删除任务失败：${readErrorDetail(data)}`);
  }

  return data as DeleteTaskAssignmentResponse;
}

export async function getAssetRooms(): Promise<AssetRoomItem[]> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/assets/rooms`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new Error(`加载房间资产台账失败：${response.status}`);
  }
  return (await response.json()) as AssetRoomItem[];
}

export async function getAssets(): Promise<AssetItemView[]> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/assets/items`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new Error(`加载资产列表失败：${response.status}`);
  }
  return (await response.json()) as AssetItemView[];
}

async function postImportFile(path: string, file: File): Promise<ImportSummary> {
  const token = getAccessToken();
  const form = new FormData();
  form.append("file", file, file.name);

  const response = await fetch(`${getBackendBaseUrl()}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`导入失败：${readErrorDetail(data)}`);
  }
  return data as ImportSummary;
}

export async function importRoomsTable(file: File): Promise<ImportSummary> {
  return await postImportFile("/assets/import/rooms", file);
}

export async function importAssetsTable(file: File): Promise<ImportSummary> {
  return await postImportFile("/assets/import/items", file);
}

export interface CreateTaskAssignmentPayload {
  task_title: string;
  cycle_type: "one_off" | "weekly" | "monthly";
  room_id: number;
  student_user_id: number;
  due_at: string;
}

export interface CreateTaskAssignmentResponse {
  assignment_id: number;
  message: string;
}

export async function createTaskAssignment(
  payload: CreateTaskAssignmentPayload
): Promise<CreateTaskAssignmentResponse> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/tasks/assign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`派单失败：${readErrorDetail(data)}`);
  }

  return data as CreateTaskAssignmentResponse;
}

export type { DispatchRoomOption, DispatchStudentOption };

export interface UserManageItem {
  id: number;
  username: string;
  role: string;
  gender: string | null;
  is_active: boolean;
}

export interface UpdateUserRequest {
  role?: string;
  gender?: string | null;
  is_active?: boolean;
  new_password?: string;
}

export async function listUsers(): Promise<UserManageItem[]> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/auth/users`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`获取用户列表失败：${readErrorDetail(data)}`);
  return data as UserManageItem[];
}

export async function updateUser(user_id: number, payload: UpdateUserRequest): Promise<UserManageItem> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/auth/users/${user_id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`更新用户失败：${readErrorDetail(data)}`);
  return data as UserManageItem;
}

export async function deleteUser(user_id: number): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/auth/users/${user_id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(`删除用户失败：${readErrorDetail(data)}`);
  }
}


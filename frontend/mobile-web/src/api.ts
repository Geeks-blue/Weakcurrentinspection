// 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
import { mobileFrontendConfig } from "./config";

export interface UserProfile {
  id: number;
  username: string;
  role: string;
  gender: string | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: UserProfile;
}

export interface TaskItem {
  assignment_id: number;
  task_title: string;
  building_code: string;
  building_name: string;
  room_code: string;
  floor_label: string | null;
  location_text: string | null;
  due_at: string;
  status: string;
}

export interface SubmitPayload {
  assignment_id: number;
  checkin_mode: "qr" | "manual";
  checkin_lat: number;
  checkin_lng: number;
  manual_room_code?: string;
  door_plate_photo_key?: string;
  lock_state: "locked" | "unlocked" | "lock_damaged";
  clutter_state: "none" | "stacked_items" | "water" | "odor";
  indicator_state: "all_ok" | "partial_abnormal" | "all_abnormal";
  asset_match_state: "matched" | "missing" | "extra" | "moved";
  remark_text?: string;
  photo_keys: string[];
}

export interface SubmitResponse {
  inspection_id: number;
  assignment_status: string;
  inspection_status: string;
  message: string;
}

export interface MyInspectionItem {
  inspection_id: number;
  assignment_id: number;
  building_code: string;
  room_code: string;
  submitted_at: string;
  status: string;
  lock_state: string;
  clutter_state: string;
  indicator_state: string;
  asset_match_state: string;
  photo_count: number;
  photo_urls: string[];
}

export interface InspectionQueryFilters {
  status?: string;
  room_code?: string;
  submitted_from?: string;
  submitted_to?: string;
}

export interface InspectionPhotoUploadResponse {
  object_key: string;
  file_url: string;
}

const TOKEN_KEY = "wc.mobile.token";

export function getBackendUrl(): string {
  return mobileFrontendConfig.backendBaseUrl;
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${getBackendUrl()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    throw new Error(`登录失败: ${response.status}`);
  }
  return (await response.json()) as LoginResponse;
}

export async function getMe(): Promise<UserProfile> {
  const response = await fetch(`${getBackendUrl()}/auth/me`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  if (!response.ok) {
    throw new Error(`获取用户信息失败: ${response.status}`);
  }
  return (await response.json()) as UserProfile;
}

export async function loadMyTasks(): Promise<TaskItem[]> {
  const response = await fetch(`${getBackendUrl()}/tasks/my`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  if (!response.ok) {
    throw new Error(`获取任务失败: ${response.status}`);
  }
  return (await response.json()) as TaskItem[];
}

export async function submitInspection(payload: SubmitPayload): Promise<SubmitResponse> {
  const response = await fetch(`${getBackendUrl()}/inspections/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail : `提交失败: ${response.status}`);
  }
  return data as SubmitResponse;
}

export async function loadMyInspections(filters?: InspectionQueryFilters): Promise<MyInspectionItem[]> {
  const params = new URLSearchParams();
  if (filters?.status) {
    params.set("status", filters.status);
  }
  if (filters?.room_code) {
    params.set("room_code", filters.room_code);
  }
  if (filters?.submitted_from) {
    params.set("submitted_from", filters.submitted_from);
  }
  if (filters?.submitted_to) {
    params.set("submitted_to", filters.submitted_to);
  }
  const query = params.toString();
  const url = `${getBackendUrl()}/inspections/my${query ? `?${query}` : ""}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  if (!response.ok) {
    throw new Error(`获取记录失败: ${response.status}`);
  }
  return (await response.json()) as MyInspectionItem[];
}

export interface RoomAssetItem {
  asset_code: string;
  asset_name: string;
  asset_category: string;
  quantity: number;
  status: string;
  manufacturer: string | null;
  model: string | null;
  note: string | null;
}

export async function fetchRoomAssets(room_code: string): Promise<RoomAssetItem[]> {
  const response = await fetch(
    `${getBackendUrl()}/assets/room-assets/${encodeURIComponent(room_code)}`,
    { headers: { Authorization: `Bearer ${getToken()}` } }
  );
  if (!response.ok) {
    throw new Error(`获取资产列表失败: ${response.status}`);
  }
  return (await response.json()) as RoomAssetItem[];
}

export async function uploadInspectionPhoto(file: Blob, filename: string): Promise<InspectionPhotoUploadResponse> {
  const formData = new FormData();
  formData.append("file", file, filename);

  let response: Response;
  try {
    response = await fetch(`${getBackendUrl()}/inspections/photos/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData
    });
  } catch {
    throw new Error("上传失败：无法连接后端，请检查手机与服务端网络连通性。");
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const detail = data && typeof data.detail === "string" ? data.detail : "";
    throw new Error(detail || `上传照片失败: ${response.status}`);
  }

  if (!data) {
    throw new Error("上传失败：后端返回格式异常。请检查服务日志。");
  }

  return data as InspectionPhotoUploadResponse;
}


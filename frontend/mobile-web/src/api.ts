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
  room_code: string;
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

export async function loadMyInspections(): Promise<any[]> {
  const response = await fetch(`${getBackendUrl()}/inspections/my`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  if (!response.ok) {
    throw new Error(`获取记录失败: ${response.status}`);
  }
  return (await response.json()) as any[];
}


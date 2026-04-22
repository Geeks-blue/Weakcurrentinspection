// 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
import type {
  ConsoleInspectionItem,
  DispatchRoomOption,
  DispatchStudentOption,
  LoginResponse,
  PendingReviewInspectionItem,
  RegisterUserRequest,
  RegisterUserResponse,
  ReviewAction,
  ReviewInspectionResponse,
  TaskDispatchOptionsResponse,
  TaskAssignmentItem,
  UserProfile
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
    throw new Error(`登录失败：${response.status}`);
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

export async function getConsoleInspections(limit = 120): Promise<ConsoleInspectionItem[]> {
  const token = getAccessToken();
  const response = await fetch(`${getBackendBaseUrl()}/inspections/console-records?limit=${limit}`, {
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


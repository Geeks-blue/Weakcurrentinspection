// 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
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

export type UserRole = "student" | "teacher" | "admin" | "maintainer";
export type UserGender = "male" | "female";

export interface RegisterUserRequest {
  username: string;
  password: string;
  role: UserRole;
  gender: UserGender | null;
  is_active: boolean;
}

export interface RegisterUserResponse {
  message: string;
  user: UserProfile;
}

export interface TaskAssignmentItem {
  assignment_id: number;
  task_title: string;
  building_code: string;
  room_code: string;
  due_at: string;
  status: string;
}

export type ReviewAction = "approved" | "rejected" | "rectify_required";

export interface PendingReviewInspectionItem {
  inspection_id: number;
  assignment_id: number;
  student_username: string;
  building_code: string;
  room_code: string;
  submitted_at: string;
  status: string;
  lock_state: string;
  clutter_state: string;
  indicator_state: string;
  asset_match_state: string;
  remark_text: string | null;
  photo_count: number;
}

export interface ConsoleInspectionItem {
  inspection_id: number;
  assignment_id: number;
  student_username: string;
  building_code: string;
  room_code: string;
  submitted_at: string;
  reviewed_at: string | null;
  status: string;
  photo_count: number;
}

export interface ReviewInspectionResponse {
  inspection_id: number;
  inspection_status: string;
  assignment_status: string;
  reviewed_by: string;
  message: string;
}

export interface DispatchRoomOption {
  room_id: number;
  room_code: string;
  building_code: string;
  building_name: string;
}

export interface DispatchStudentOption {
  student_user_id: number;
  username: string;
  gender: string | null;
}

export interface TaskDispatchOptionsResponse {
  rooms: DispatchRoomOption[];
  students: DispatchStudentOption[];
}

export interface AiGatewayConfig {
  mode: "backend_proxy" | "direct";
  endpoint: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
}


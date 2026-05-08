// 房间编辑/新增类型
export interface AssetRoomEdit {
  building_code: string;
  building_name?: string;
  room_code: string;
  floor_label?: string | null;
  location_text?: string | null;
  is_active: boolean;
  gender_restriction: string;
}

// 资产编辑/新增类型
export interface AssetItemEdit {
  asset_code: string;
  asset_name: string;
  asset_category: string;
  room_code: string;
  quantity: number;
  status: string;
  manufacturer?: string | null;
  model?: string | null;
  note?: string | null;
}
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

export interface PendingTaskManageItem {
  assignment_id: number;
  task_id: number;
  task_title: string;
  cycle_type: "one_off" | "weekly" | "monthly";
  student_user_id: number;
  student_username: string;
  room_id: number;
  building_code: string;
  room_code: string;
  due_at: string;
  status: "todo" | "rejected" | "rectify_required" | "overdue";
}

export interface UpdateTaskAssignmentPayload {
  task_title?: string;
  cycle_type?: "one_off" | "weekly" | "monthly";
  room_id?: number;
  student_user_id?: number;
  due_at?: string;
  status?: "todo" | "rejected" | "rectify_required" | "overdue";
}

export interface UpdateTaskAssignmentResponse {
  assignment_id: number;
  task_id: number;
  assignment_status: string;
  message: string;
}

export interface DeleteTaskAssignmentResponse {
  assignment_id: number;
  task_id: number;
  deleted_inspection_count: number;
  deleted_photo_count: number;
  message: string;
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
  photo_urls: string[];
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
  lock_state: string;
  clutter_state: string;
  indicator_state: string;
  asset_match_state: string;
  remark_text: string | null;
  photo_count: number;
  photo_urls: string[];
}

export interface InspectionPhotoUploadResponse {
  object_key: string;
  file_url: string;
}

export interface DeleteInspectionResponse {
  inspection_id: number;
  assignment_id: number;
  assignment_status: string;
  deleted_photo_count: number;
  message: string;
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
  gender_restriction: string;
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

export interface AssetRoomItem {
  room_id: number;
  building_code: string;
  building_name: string;
  room_code: string;
  floor_label: string | null;
  location_text: string | null;
  is_active: boolean;
  gender_restriction: string;
}

export interface AssetItemView {
  asset_id: number;
  asset_code: string;
  asset_name: string;
  asset_category: string;
  building_code: string;
  room_code: string;
  quantity: number;
  status: string;
  manufacturer: string | null;
  model: string | null;
  note: string | null;
  updated_at: string;
}

export interface ImportSummary {
  total_rows: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  errors: string[];
}


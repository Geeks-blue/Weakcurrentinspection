<script setup lang="ts">
// 文件说明：该页面是管理端核心交互页面，按中文注释规范维护。
import { computed, onMounted, ref } from "vue";

import { callAiGateway } from "./api/ai";
import {
  getAssetRooms,
  getAssets,
  importAssetsTable,
  importRoomsTable,
  clearAccessToken,
  createTaskAssignment,
  deleteTaskAssignment,
  deleteInspectionRecord,
  getAccessToken,
  getBackendBaseUrl,
  getConsoleInspections,
  type ConsoleInspectionFilters,
  getMe,
  getMobileWebUrl,
  getPendingTaskAssignments,
  getPendingReviewInspections,
  getTaskDispatchOptions,
  login,
  registerUser,
  reviewInspection,
  setAccessToken,
  updateTaskAssignment,
  createRoom,
  updateRoom,
  deleteRoom,
  getRoomQrcodeUrl,
  createAsset,
  updateAsset,
  deleteAsset,
  getAssetQrcodeUrl
} from "./api/backend";
import { loadAiConfig, saveAiConfig } from "./storage";
import type {
  AssetItemView,
  AssetRoomItem,
  ConsoleInspectionItem,
  DispatchRoomOption,
  DispatchStudentOption,
  PendingTaskManageItem,
  PendingReviewInspectionItem,
  ReviewAction,
  UserProfile,
  UserRole,
  AssetRoomEdit,
  AssetItemEdit
} from "./types";

type ConsolePage = "workspace" | "settings";
type WorkspaceSub = "inspection" | "assets" | "records";
type ViewHash = ConsolePage | "login";

const username = ref("teacher01");
const password = ref("Teacher@123");
const authLoading = ref(false);
const authMessage = ref("");
const currentUser = ref<UserProfile | null>(null);

const pendingReviews = ref<PendingReviewInspectionItem[]>([]);
const pendingLoading = ref(false);
const pendingError = ref("");
const consoleInspections = ref<ConsoleInspectionItem[]>([]);
const consoleLoading = ref(false);
const consoleError = ref("");
const consoleFilterStatus = ref("");
const consoleFilterRoomCode = ref("");
const consoleFilterUsername = ref("");
const consoleFilterFrom = ref("");
const consoleFilterTo = ref("");
const deletingInspectionId = ref<number | null>(null);
const confirmDeleteInspectionId = ref<number | null>(null);
const selectedInspectionId = ref<number | null>(null);
const reviewAction = ref<ReviewAction>("approved");
const reviewReason = ref("");
const reviewLoading = ref(false);
const reviewMessage = ref("");

const dispatchRooms = ref<DispatchRoomOption[]>([]);
const dispatchStudents = ref<DispatchStudentOption[]>([]);
const dispatchOptionsLoading = ref(false);
const dispatchLoading = ref(false);
const dispatchError = ref("");
const dispatchMessage = ref("");
const dispatchTaskTitle = ref("例行弱电巡检");
const dispatchCycleType = ref<"one_off" | "weekly" | "monthly">("one_off");
const dispatchRoomId = ref<number | null>(null);
const dispatchStudentId = ref<number | null>(null);
const dispatchDueAt = ref(buildDefaultDueAt());

const assetRooms = ref<AssetRoomItem[]>([]);
const assets = ref<AssetItemView[]>([]);
const assetLoading = ref(false);
const assetError = ref("");
const assetMessage = ref("");
const importingRooms = ref(false);
const importingAssets = ref(false);
const roomsImportInput = ref<HTMLInputElement | null>(null);
const assetsImportInput = ref<HTMLInputElement | null>(null);
const selectedRoomCode = ref("");

const roomAssetCount = computed(() => {
  const counts: Record<string, number> = {};
  for (const asset of assets.value) {
    counts[asset.room_code] = (counts[asset.room_code] || 0) + 1;
  }
  return counts;
});

const filteredAssets = computed(() =>
  selectedRoomCode.value ? assets.value.filter((a) => a.room_code === selectedRoomCode.value) : assets.value
);

const pendingTasks = ref<PendingTaskManageItem[]>([]);
const pendingTasksLoading = ref(false);
const pendingTasksError = ref("");
const taskMessage = ref("");
const deletingTaskId = ref<number | null>(null);
const confirmDeleteTaskId = ref<number | null>(null);
const editingTaskId = ref<number | null>(null);
const taskUpdateLoading = ref(false);
const editTaskTitle = ref("");
const editTaskCycleType = ref<"one_off" | "weekly" | "monthly">("one_off");
const editTaskRoomId = ref<number | null>(null);
const editTaskStudentId = ref<number | null>(null);
const editTaskDueAt = ref("");
const editTaskStatus = ref<"todo" | "rejected" | "rectify_required" | "overdue">("todo");

const registerLoading = ref(false);
const registerMessage = ref("");
const registerUsername = ref("");
const registerPassword = ref("");
const registerRole = ref<UserRole>("student");
const registerGender = ref<"male" | "female">("female");
const registerActive = ref(true);

const aiConfig = ref(loadAiConfig());
const aiPrompt = ref("请对比当前巡检摘要与历史基线，输出异常风险和处置建议。");
const aiTemperature = ref(0.2);
const aiLoading = ref(false);
const aiResult = ref("");
const aiError = ref("");
const aiRaw = ref("");
const activePage = ref<ConsolePage>("workspace");
const workspaceSub = ref<WorkspaceSub>("inspection");
const isLoggedIn = computed(() => Boolean(currentUser.value && getAccessToken()));
const isReviewer = computed(() =>
  Boolean(currentUser.value && canEnterAdminConsole(currentUser.value.role))
);
const isAdmin = computed(() => currentUser.value?.role === "admin");
const userStatusText = computed(() => {
  if (!currentUser.value) {
    return "未登录";
  }
  return `已登录：${currentUser.value.username}（${formatRole(currentUser.value.role)}）`;
});

// 房间/资产编辑弹窗状态
const showRoomDialog = ref(false);
const editingRoom: any = ref(null); // AssetRoomEdit | null
const editingRoomId = ref<number | null>(null);
const showAssetDialog = ref(false);
const editingAsset: any = ref(null); // AssetItemEdit | null
const editingAssetId = ref<number | null>(null);
const showQrcodeDialog = ref(false);
const qrcodeUrl = ref("");
const qrcodeTitle = ref("");
const showRoomActionDialog = ref(false);
const actionRoom = ref<AssetRoomItem | null>(null);
const showAssetActionDialog = ref(false);
const actionAsset = ref<AssetItemView | null>(null);

function openRoomDialog(room?: AssetRoomItem) {
  if (room) {
    editingRoom.value = { ...room };
    editingRoomId.value = room.room_id;
  } else {
    editingRoom.value = { building_code: "", room_code: "", floor_label: "", location_text: "", is_active: true };
    editingRoomId.value = null;
  }
  showRoomDialog.value = true;
}

function closeRoomDialog() {
  showRoomDialog.value = false;
  editingRoom.value = null;
  editingRoomId.value = null;
}

async function submitRoomDialog() {
  try {
    if (editingRoomId.value) {
      await updateRoom(editingRoomId.value, editingRoom.value);
      assetMessage.value = "房间修改成功";
    } else {
      await createRoom(editingRoom.value);
      assetMessage.value = "房间新增成功";
    }
    await loadAssetData();
    closeRoomDialog();
  } catch (e) {
    assetError.value = e instanceof Error ? e.message : String(e);
  }
}

async function handleDeleteRoom(room_id: number) {
  if (!confirm("确定要删除该房间？")) return;
  try {
    await deleteRoom(room_id);
    assetMessage.value = "房间已删除";
    await loadAssetData();
  } catch (e) {
    assetError.value = e instanceof Error ? e.message : String(e);
  }
}

function handleShowRoomQrcode(room: AssetRoomItem) {
  qrcodeUrl.value = getRoomQrcodeUrl(room.room_id);
  qrcodeTitle.value = `房间二维码：${room.building_code}/${room.room_code}`;
  showQrcodeDialog.value = true;
}

function openAssetDialog(asset?: AssetItemView) {
  if (asset) {
    editingAsset.value = { ...asset };
    editingAssetId.value = asset.asset_id;
  } else {
    editingAsset.value = { asset_code: "", asset_name: "", asset_category: "weak_current", room_code: "", quantity: 1, status: "in_use", manufacturer: "", model: "", note: "" };
    editingAssetId.value = null;
  }
  showAssetDialog.value = true;
}

function closeAssetDialog() {
  showAssetDialog.value = false;
  editingAsset.value = null;
  editingAssetId.value = null;
}

async function submitAssetDialog() {
  try {
    if (editingAssetId.value) {
      await updateAsset(editingAssetId.value, editingAsset.value);
      assetMessage.value = "资产修改成功";
    } else {
      await createAsset(editingAsset.value);
      assetMessage.value = "资产新增成功";
    }
    await loadAssetData();
    closeAssetDialog();
  } catch (e) {
    assetError.value = e instanceof Error ? e.message : String(e);
  }
}

async function handleDeleteAsset(asset_id: number) {
  if (!confirm("确定要删除该资产？")) return;
  try {
    await deleteAsset(asset_id);
    assetMessage.value = "资产已删除";
    await loadAssetData();
  } catch (e) {
    assetError.value = e instanceof Error ? e.message : String(e);
  }
}

function handleShowAssetQrcode(asset: AssetItemView) {
  qrcodeUrl.value = getAssetQrcodeUrl(asset.asset_id);
  qrcodeTitle.value = `资产二维码：${asset.asset_code}`;
  showQrcodeDialog.value = true;
}

function closeQrcodeDialog() {
  showQrcodeDialog.value = false;
  qrcodeUrl.value = "";
  qrcodeTitle.value = "";
}

function openRoomActionDialog(room: AssetRoomItem): void {
  editingRoom.value = { ...room };
  editingRoomId.value = room.room_id;
  actionRoom.value = room;
  showRoomActionDialog.value = true;
}

function roomActionDelete(): void {
  const room = actionRoom.value;
  showRoomActionDialog.value = false;
  if (room) handleDeleteRoom(room.room_id);
}

function openAssetActionDialog(asset: AssetItemView): void {
  editingAsset.value = { ...asset };
  editingAssetId.value = asset.asset_id;
  actionAsset.value = asset;
  showAssetActionDialog.value = true;
}

function assetActionDelete(): void {
  const asset = actionAsset.value;
  showAssetActionDialog.value = false;
  if (asset) handleDeleteAsset(asset.asset_id);
}

async function submitRoomActionEdit(): Promise<void> {
  if (!editingRoomId.value || !editingRoom.value) return;
  try {
    await updateRoom(editingRoomId.value, editingRoom.value);
    assetMessage.value = "房间修改成功";
    await loadAssetData();
    showRoomActionDialog.value = false;
    actionRoom.value = null;
  } catch (e) {
    assetError.value = e instanceof Error ? e.message : String(e);
  }
}

async function submitAssetActionEdit(): Promise<void> {
  if (!editingAssetId.value || !editingAsset.value) return;
  try {
    await updateAsset(editingAssetId.value, editingAsset.value);
    assetMessage.value = "资产修改成功";
    await loadAssetData();
    showAssetActionDialog.value = false;
    actionAsset.value = null;
  } catch (e) {
    assetError.value = e instanceof Error ? e.message : String(e);
  }
}

function buildDefaultDueAt(): string {
  // 将默认截止时间设置为当前时间 +24 小时，并转换为 datetime-local 可直接绑定格式。
  const due = new Date(Date.now() + 24 * 60 * 60 * 1000);
  due.setSeconds(0, 0);
  const timezoneOffsetMs = due.getTimezoneOffset() * 60 * 1000;
  const local = new Date(due.getTime() - timezoneOffsetMs);
  return local.toISOString().slice(0, 16);
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return buildDefaultDueAt();
  }
  date.setSeconds(0, 0);
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  const local = new Date(date.getTime() - timezoneOffsetMs);
  return local.toISOString().slice(0, 16);
}

function formatRole(role: string): string {
  const labels: Record<string, string> = {
    student: "学生",
    teacher: "教师",
    admin: "管理员",
    maintainer: "运维",
    ops: "运维"
  };
  return labels[role] || role;
}

function formatTaskCycle(value: string): string {
  const labels: Record<string, string> = {
    one_off: "一次性",
    weekly: "每周",
    monthly: "每月"
  };
  return labels[value] || value;
}

function canEnterAdminConsole(role: string): boolean {
  return role === "teacher" || role === "admin";
}

function setViewHash(view: ViewHash): void {
  const nextHash = `#${view}`;
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}

function switchConsolePage(page: ConsolePage): void {
  activePage.value = page;
  setViewHash(page);
}

function switchWorkspaceSub(sub: WorkspaceSub): void {
  workspaceSub.value = sub;
}

function resolvePageFromHash(): ConsolePage {
  const hash = window.location.hash.replace("#", "").trim();
  if (hash === "settings" || hash === "workspace") {
    return hash;
  }
  return "workspace";
}

function buildStudentRedirectUrl(token: string): string {
  const url = new URL(getMobileWebUrl());
  url.searchParams.set("token", token);
  url.searchParams.set("backend", getBackendBaseUrl());
  url.searchParams.set("from", "portal");
  return url.toString();
}

function redirectStudentToMobile(token: string): void {
  try {
    const target = buildStudentRedirectUrl(token);
    authMessage.value = "识别到学生账号，正在跳转移动端...";
    window.location.assign(target);
  } catch {
    authMessage.value = "学生账号请使用移动端，当前移动端地址配置无效。";
    setViewHash("login");
  }
}

function formatLockState(value: string): string {
  const labels: Record<string, string> = {
    locked: "已锁",
    unlocked: "未锁",
    lock_damaged: "门锁损坏"
  };
  return labels[value] || value;
}

function formatClutterState(value: string): string {
  const labels: Record<string, string> = {
    none: "无杂物",
    stacked_items: "有堆放物",
    water: "有积水",
    odor: "有异味"
  };
  return labels[value] || value;
}

function formatIndicatorState(value: string): string {
  const labels: Record<string, string> = {
    all_ok: "全部正常",
    partial_abnormal: "部分异常",
    all_abnormal: "全部异常"
  };
  return labels[value] || value;
}

function formatAssetMatchState(value: string): string {
  const labels: Record<string, string> = {
    matched: "一致",
    missing: "缺失",
    extra: "多出",
    moved: "位置变动"
  };
  return labels[value] || value;
}

function formatStatus(value: string): string {
  const labels: Record<string, string> = {
    todo: "待巡检",
    pending_review: "待审核",
    approved: "已通过",
    rejected: "已驳回",
    rectify_required: "需整改",
    overdue: "已逾期"
  };
  return labels[value] || value;
}

function statusClass(value: string): string {
  return `status-${value.replace(/_/g, "-")}`;
}

function formatAssetStatus(value: string): string {
  const labels: Record<string, string> = {
    in_use: "使用中",
    idle: "闲置",
    maintenance: "维修中",
    scrapped: "已报废"
  };
  return labels[value] || value;
}

function openPhotoPreview(url: string): void {
  previewPhotoUrl.value = url;
}

function closePhotoPreview(): void {
  previewPhotoUrl.value = "";
}

function summarizeImport(prefix: string, total: number, created: number, updated: number, skipped: number): string {
  return `${prefix}完成：总行 ${total}，新增 ${created}，更新 ${updated}，跳过 ${skipped}`;
}

async function loadAssetData(): Promise<void> {
  if (!isReviewer.value) {
    return;
  }

  assetLoading.value = true;
  assetError.value = "";
  try {
    const [rooms, assetRows] = await Promise.all([getAssetRooms(), getAssets()]);
    assetRooms.value = rooms;
    assets.value = assetRows;
  } catch (error) {
    assetError.value = error instanceof Error ? error.message : "加载资产管理数据失败。";
  } finally {
    assetLoading.value = false;
  }
}

function triggerRoomsImport(): void {
  roomsImportInput.value?.click();
}

function triggerAssetsImport(): void {
  assetsImportInput.value?.click();
}

async function onRoomsImportChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";
  if (!file) {
    return;
  }

  importingRooms.value = true;
  assetError.value = "";
  try {
    const result = await importRoomsTable(file);
    assetMessage.value = summarizeImport("房间导入", result.total_rows, result.created_count, result.updated_count, result.skipped_count);
    if (result.errors.length > 0) {
      assetError.value = result.errors.slice(0, 6).join("；");
    }
    await Promise.all([loadAssetData(), loadDispatchOptions()]);
  } catch (error) {
    assetError.value = error instanceof Error ? error.message : "房间导入失败。";
  } finally {
    importingRooms.value = false;
  }
}

async function onAssetsImportChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";
  if (!file) {
    return;
  }

  importingAssets.value = true;
  assetError.value = "";
  try {
    const result = await importAssetsTable(file);
    assetMessage.value = summarizeImport("资产导入", result.total_rows, result.created_count, result.updated_count, result.skipped_count);
    if (result.errors.length > 0) {
      assetError.value = result.errors.slice(0, 6).join("；");
    }
    await loadAssetData();
  } catch (error) {
    assetError.value = error instanceof Error ? error.message : "资产导入失败。";
  } finally {
    importingAssets.value = false;
  }
}

async function loadPendingTasks(): Promise<void> {
  if (!isReviewer.value) {
    return;
  }

  pendingTasksLoading.value = true;
  pendingTasksError.value = "";
  try {
    pendingTasks.value = await getPendingTaskAssignments();
  } catch (error) {
    pendingTasksError.value = error instanceof Error ? error.message : "加载待巡检任务失败。";
  } finally {
    pendingTasksLoading.value = false;
  }
}

function startEditTask(item: PendingTaskManageItem): void {
  editingTaskId.value = item.assignment_id;
  editTaskTitle.value = item.task_title;
  editTaskCycleType.value = item.cycle_type;
  editTaskRoomId.value = item.room_id;
  editTaskStudentId.value = item.student_user_id;
  editTaskDueAt.value = toDateTimeLocal(item.due_at);
  editTaskStatus.value = item.status;
  taskMessage.value = "";
}

function cancelEditTask(): void {
  editingTaskId.value = null;
}

async function submitTaskUpdate(): Promise<void> {
  if (!editingTaskId.value) {
    return;
  }

  if (!editTaskTitle.value.trim()) {
    pendingTasksError.value = "任务标题不能为空。";
    return;
  }
  if (!editTaskRoomId.value || !editTaskStudentId.value) {
    pendingTasksError.value = "请先选择房间和学生。";
    return;
  }
  if (!editTaskDueAt.value.trim()) {
    pendingTasksError.value = "请填写截止时间。";
    return;
  }

  const dueDate = new Date(editTaskDueAt.value);
  if (Number.isNaN(dueDate.getTime())) {
    pendingTasksError.value = "截止时间格式无效。";
    return;
  }

  taskUpdateLoading.value = true;
  pendingTasksError.value = "";
  try {
    const result = await updateTaskAssignment(editingTaskId.value, {
      task_title: editTaskTitle.value.trim(),
      cycle_type: editTaskCycleType.value,
      room_id: editTaskRoomId.value,
      student_user_id: editTaskStudentId.value,
      due_at: dueDate.toISOString(),
      status: editTaskStatus.value
    });
    taskMessage.value = `${result.message}，任务ID ${result.assignment_id}`;
    editingTaskId.value = null;
    await Promise.all([loadPendingTasks(), loadPendingReviews()]);
  } catch (error) {
    pendingTasksError.value = error instanceof Error ? error.message : "修改待巡检任务失败。";
  } finally {
    taskUpdateLoading.value = false;
  }
}

async function requestDeleteTask(assignmentId: number): Promise<void> {
  if (confirmDeleteTaskId.value !== assignmentId) {
    confirmDeleteTaskId.value = assignmentId;
    return;
  }

  deletingTaskId.value = assignmentId;
  pendingTasksError.value = "";
  try {
    const result = await deleteTaskAssignment(assignmentId);
    taskMessage.value = `已删除待巡检任务 ${result.assignment_id}，清理巡检 ${result.deleted_inspection_count} 条。`;
    confirmDeleteTaskId.value = null;
    if (editingTaskId.value === assignmentId) {
      editingTaskId.value = null;
    }
    await Promise.all([loadPendingTasks(), loadPendingReviews(), loadConsoleInspections()]);
  } catch (error) {
    pendingTasksError.value = error instanceof Error ? error.message : "删除待巡检任务失败。";
  } finally {
    deletingTaskId.value = null;
  }
}

function cancelDeleteTask(): void {
  confirmDeleteTaskId.value = null;
}

async function requestDeleteInspection(inspectionId: number): Promise<void> {
  if (confirmDeleteInspectionId.value !== inspectionId) {
    confirmDeleteInspectionId.value = inspectionId;
    return;
  }

  deletingInspectionId.value = inspectionId;
  consoleError.value = "";
  reviewMessage.value = "";
  try {
    const result = await deleteInspectionRecord(inspectionId);
    reviewMessage.value = `已删除记录 ID ${result.inspection_id}，同时清理照片 ${result.deleted_photo_count} 张。`;
    confirmDeleteInspectionId.value = null;
    await Promise.all([loadConsoleInspections(), loadPendingReviews()]);
  } catch (error) {
    consoleError.value = error instanceof Error ? error.message : "删除巡检记录失败。";
  } finally {
    deletingInspectionId.value = null;
  }
}

function cancelDeleteInspection(): void {
  confirmDeleteInspectionId.value = null;
}

async function handleLogin(): Promise<void> {
  authLoading.value = true;
  authMessage.value = "";
  pendingError.value = "";
  reviewMessage.value = "";
  dispatchError.value = "";
  dispatchMessage.value = "";

  try {
    const data = await login(username.value.trim(), password.value);
    if (data.user.role === "student") {
      clearAccessToken();
      currentUser.value = null;
      pendingReviews.value = [];
      selectedInspectionId.value = null;
      redirectStudentToMobile(data.access_token);
      return;
    }

    if (!canEnterAdminConsole(data.user.role)) {
      clearAccessToken();
      currentUser.value = null;
      pendingReviews.value = [];
      selectedInspectionId.value = null;
      authMessage.value = `当前账号角色为${formatRole(data.user.role)}，暂不支持登录此端。`;
      setViewHash("login");
      return;
    }

    setAccessToken(data.access_token);
    currentUser.value = data.user;
    authMessage.value = `登录成功：${data.user.username}（${formatRole(data.user.role)}）`;
    await Promise.all([loadPendingReviews(), loadDispatchOptions(), loadPendingTasks()]);
    await Promise.all([loadConsoleInspections(), loadAssetData()]);
    switchConsolePage("workspace");
  } catch (error) {
    authMessage.value = error instanceof Error ? error.message : "登录失败。";
  } finally {
    authLoading.value = false;
  }
}

function handleLogout(): void {
  clearAccessToken();
  currentUser.value = null;
  pendingReviews.value = [];
  consoleInspections.value = [];
  selectedInspectionId.value = null;
  dispatchRooms.value = [];
  dispatchStudents.value = [];
  dispatchRoomId.value = null;
  dispatchStudentId.value = null;
  pendingTasks.value = [];
  assetRooms.value = [];
  assets.value = [];
  assetMessage.value = "";
  assetError.value = "";
  editingTaskId.value = null;
  confirmDeleteTaskId.value = null;
  deletingTaskId.value = null;
  reviewMessage.value = "";
  dispatchMessage.value = "";
  dispatchError.value = "";
  taskMessage.value = "";
  pendingTasksError.value = "";
  registerMessage.value = "";
  confirmDeleteInspectionId.value = null;
  deletingInspectionId.value = null;
  closePhotoPreview();
  authMessage.value = "已退出登录。";
  setViewHash("login");
}

async function loadPendingReviews(): Promise<void> {
  pendingLoading.value = true;
  pendingError.value = "";
  try {
    pendingReviews.value = await getPendingReviewInspections();
    if (pendingReviews.value.length > 0 && !selectedInspectionId.value) {
      selectedInspectionId.value = pendingReviews.value[0].inspection_id;
    }
  } catch (error) {
    pendingError.value = error instanceof Error ? error.message : "加载待审核列表失败。";
  } finally {
    pendingLoading.value = false;
  }
}

async function submitReview(): Promise<void> {
  if (!selectedInspectionId.value) {
    reviewMessage.value = "请先选择一条待审核记录。";
    return;
  }

  if ((reviewAction.value === "rejected" || reviewAction.value === "rectify_required") && !reviewReason.value.trim()) {
    reviewMessage.value = "驳回或整改必须填写原因。";
    return;
  }

  reviewLoading.value = true;
  reviewMessage.value = "";

  try {
    const result = await reviewInspection(selectedInspectionId.value, reviewAction.value, reviewReason.value);
    reviewMessage.value = `${result.message}，记录ID ${result.inspection_id}`;
    reviewReason.value = "";
    await loadPendingReviews();
    await loadConsoleInspections();
    if (
      selectedInspectionId.value &&
      !pendingReviews.value.some((item) => item.inspection_id === selectedInspectionId.value)
    ) {
      selectedInspectionId.value = pendingReviews.value[0]?.inspection_id ?? null;
    }
  } catch (error) {
    reviewMessage.value = error instanceof Error ? error.message : "审核失败。";
  } finally {
    reviewLoading.value = false;
  }
}

async function loadConsoleInspections(): Promise<void> {
  if (!isReviewer.value) {
    return;
  }

  consoleLoading.value = true;
  consoleError.value = "";
  try {
    const filters: ConsoleInspectionFilters = {};
    if (consoleFilterStatus.value) filters.status = consoleFilterStatus.value;
    if (consoleFilterRoomCode.value.trim()) filters.room_code = consoleFilterRoomCode.value.trim();
    if (consoleFilterUsername.value.trim()) filters.student_username = consoleFilterUsername.value.trim();
    if (consoleFilterFrom.value) filters.submitted_from = new Date(consoleFilterFrom.value).toISOString();
    if (consoleFilterTo.value) filters.submitted_to = new Date(consoleFilterTo.value).toISOString();
    consoleInspections.value = await getConsoleInspections(filters);
  } catch (error) {
    consoleError.value = error instanceof Error ? error.message : "加载巡检记录失败。";
  } finally {
    consoleLoading.value = false;
  }
}

async function loadDispatchOptions(): Promise<void> {
  if (!isReviewer.value) {
    return;
  }

  dispatchOptionsLoading.value = true;
  dispatchError.value = "";
  try {
    const data = await getTaskDispatchOptions();
    dispatchRooms.value = data.rooms;
    dispatchStudents.value = data.students;
    if (!dispatchRoomId.value && data.rooms.length > 0) {
      dispatchRoomId.value = data.rooms[0].room_id;
    }
    if (!dispatchStudentId.value && data.students.length > 0) {
      dispatchStudentId.value = data.students[0].student_user_id;
    }
  } catch (error) {
    dispatchError.value = error instanceof Error ? error.message : "加载派单选项失败。";
  } finally {
    dispatchOptionsLoading.value = false;
  }
}

async function submitDispatch(): Promise<void> {
  dispatchMessage.value = "";
  dispatchError.value = "";

  if (!dispatchTaskTitle.value.trim()) {
    dispatchError.value = "任务标题不能为空。";
    return;
  }
  if (!dispatchRoomId.value || !dispatchStudentId.value) {
    dispatchError.value = "请先选择派发房间和学生。";
    return;
  }
  if (!dispatchDueAt.value.trim()) {
    dispatchError.value = "请填写截止时间。";
    return;
  }

  const dueDate = new Date(dispatchDueAt.value);
  if (Number.isNaN(dueDate.getTime())) {
    dispatchError.value = "截止时间格式无效。";
    return;
  }

  dispatchLoading.value = true;
  try {
    const result = await createTaskAssignment({
      task_title: dispatchTaskTitle.value.trim(),
      cycle_type: dispatchCycleType.value,
      room_id: dispatchRoomId.value,
      student_user_id: dispatchStudentId.value,
      due_at: dueDate.toISOString()
    });
    dispatchMessage.value = `${result.message}，派单ID ${result.assignment_id}`;
    await Promise.all([loadPendingReviews(), loadPendingTasks()]);
  } catch (error) {
    dispatchError.value = error instanceof Error ? error.message : "派单失败。";
  } finally {
    dispatchLoading.value = false;
  }
}

function shouldCollectGender(role: UserRole): boolean {
  return role === "student";
}

async function submitRegisterUser(): Promise<void> {
  registerMessage.value = "";
  const normalizedUsername = registerUsername.value.trim();
  if (!normalizedUsername) {
    registerMessage.value = "账号不能为空。";
    return;
  }
  if (registerPassword.value.length < 6) {
    registerMessage.value = "密码长度至少为 6 位。";
    return;
  }

  registerLoading.value = true;
  try {
    const payload = {
      username: normalizedUsername,
      password: registerPassword.value,
      role: registerRole.value,
      gender: shouldCollectGender(registerRole.value) ? registerGender.value : null,
      is_active: registerActive.value
    };
    const result = await registerUser(payload);
    registerMessage.value = `创建成功：${result.user.username}（${formatRole(result.user.role)}）`;
    registerPassword.value = "";
  } catch (error) {
    registerMessage.value = error instanceof Error ? error.message : "注册失败。";
  } finally {
    registerLoading.value = false;
  }
}

function saveAiGateway(): void {
  saveAiConfig(aiConfig.value);
  aiError.value = "";
  aiResult.value = "AI 配置已保存到本地。";
}

async function testAiGateway(): Promise<void> {
  aiLoading.value = true;
  aiError.value = "";
  aiResult.value = "";
  aiRaw.value = "";

  try {
    const output = await callAiGateway({
      mode: aiConfig.value.mode,
      backendBaseUrl: getBackendBaseUrl(),
      accessToken: getAccessToken(),
      endpoint: aiConfig.value.endpoint,
      apiKey: aiConfig.value.apiKey,
      model: aiConfig.value.model,
      systemPrompt: aiConfig.value.systemPrompt,
      userPrompt: aiPrompt.value,
      temperature: aiTemperature.value
    });

    aiResult.value = output.text;
    aiRaw.value = JSON.stringify(output.raw, null, 2);
  } catch (error) {
    aiError.value = error instanceof Error ? error.message : "AI 请求失败。";
  } finally {
    aiLoading.value = false;
  }
}

onMounted(async () => {
  const token = getAccessToken();
  if (!token) {
    setViewHash("login");
    return;
  }

  try {
    currentUser.value = await getMe();
    if (currentUser.value.role === "student") {
      clearAccessToken();
      currentUser.value = null;
      pendingReviews.value = [];
      selectedInspectionId.value = null;
      redirectStudentToMobile(token);
      return;
    }

    if (!canEnterAdminConsole(currentUser.value.role)) {
      const role = currentUser.value.role;
      clearAccessToken();
      currentUser.value = null;
      pendingReviews.value = [];
      selectedInspectionId.value = null;
      authMessage.value = `当前账号角色为${formatRole(role)}，暂不支持登录此端。`;
      setViewHash("login");
      return;
    }

    await Promise.all([loadPendingReviews(), loadDispatchOptions(), loadConsoleInspections(), loadPendingTasks(), loadAssetData()]);
    switchConsolePage(resolvePageFromHash());
  } catch {
    clearAccessToken();
    currentUser.value = null;
    setViewHash("login");
  }
});
</script>

<template>
  <div class="page" :class="{ 'page-logged-in': isLoggedIn }">

    <template v-if="!isLoggedIn">
      <div class="login-center">
        <div class="login-card">
          <div class="login-card-brand">
            <p class="login-brand-tag">Campus Infra Console</p>
            <h1>弱电巡检管理台</h1>
            <p class="hint">教师 / 管理员统一入口，学生请使用移动端。</p>
          </div>
          <label for="username">账号</label>
          <input id="username" v-model="username" placeholder="teacher01 / admin" />
          <label for="password">密码</label>
          <input id="password" v-model="password" type="password" placeholder="请输入登录密码" />
          <button class="login-btn" :disabled="authLoading" @click="handleLogin">
            {{ authLoading ? "登录中..." : "立即登录" }}
          </button>
          <p class="hint" v-if="authMessage">{{ authMessage }}</p>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="workspace-shell">
        <aside class="workspace-sidebar">
          <nav class="view-switch">
        <button class="ghost tab-btn" :class="{ active: activePage === 'workspace' }" @click="switchConsolePage('workspace')">
          业务面板
        </button>
        <button
          v-if="activePage === 'workspace'"
          class="ghost tab-btn sub-tab-btn"
          :class="{ active: workspaceSub === 'inspection' }"
          @click="switchWorkspaceSub('inspection')"
        >
          巡检工作台
        </button>
        <button
          v-if="activePage === 'workspace'"
          class="ghost tab-btn sub-tab-btn"
          :class="{ active: workspaceSub === 'assets' }"
          @click="switchWorkspaceSub('assets')"
        >
          资产管理
        </button>
        <button
          v-if="activePage === 'workspace'"
          class="ghost tab-btn sub-tab-btn"
          :class="{ active: workspaceSub === 'records' }"
          @click="switchWorkspaceSub('records')"
        >
          巡检记录总览
        </button>
        <button class="ghost tab-btn" :class="{ active: activePage === 'settings' }" @click="switchConsolePage('settings')">
          系统设置
        </button>
        <button class="ghost" @click="handleLogout">退出登录</button>
        <span class="status-pill" :class="{ online: isLoggedIn }">{{ userStatusText }}</span>
          </nav>
        </aside>
        <div class="workspace-content">
          <header class="hero">
            <h1>弱电巡检管理台</h1>
            <p>统一登录后按角色自动分流，支持管理员注册、教师派单和巡检审核。</p>
          </header>

      <template v-if="activePage === 'settings'">
        <section class="panel">
          <h2>AI 接口输入网关</h2>
          <p class="hint">在这里配置接口地址、密钥和模型，然后发送测试提示词。</p>
          <div class="grid">
            <div class="row">
              <label for="aiMode">调用模式</label>
              <select id="aiMode" v-model="aiConfig.mode">
                <option value="backend_proxy">后端代理（推荐）</option>
                <option value="direct">浏览器直连</option>
              </select>
            </div>
            <div class="row">
              <label for="aiEndpoint">AI 接口地址</label>
              <input
                id="aiEndpoint"
                v-model="aiConfig.endpoint"
                placeholder="https://api.openai.com/v1/chat/completions"
              />
            </div>
            <div class="row">
              <label for="aiKey">API 密钥</label>
              <input id="aiKey" v-model="aiConfig.apiKey" type="password" placeholder="sk-..." />
            </div>
            <div class="row">
              <label for="aiModel">模型</label>
              <input id="aiModel" v-model="aiConfig.model" placeholder="gpt-4o-mini" />
            </div>
            <div class="row">
              <label for="aiSystem">系统提示词</label>
              <textarea id="aiSystem" v-model="aiConfig.systemPrompt" rows="3" />
            </div>
            <div class="row">
              <label for="aiPrompt">用户提示词</label>
              <textarea id="aiPrompt" v-model="aiPrompt" rows="4" />
            </div>
            <div class="row">
              <label for="aiTemperature">温度</label>
              <input id="aiTemperature" v-model.number="aiTemperature" type="number" min="0" max="2" step="0.1" />
            </div>
          </div>
          <div class="actions">
            <button @click="saveAiGateway">保存 AI 配置</button>
            <button :disabled="aiLoading" @click="testAiGateway">{{ aiLoading ? "请求中..." : "测试 AI 接口" }}</button>
          </div>
          <p class="hint" v-if="aiConfig.mode === 'backend_proxy'">
            当前为后端代理模式：需要先登录，AI 请求会发送到 /ai/proxy/chat。
          </p>
          <p class="hint" v-else>
            当前为浏览器直连模式：请求会直接从浏览器发送到 AI Endpoint。
          </p>
          <p class="error" v-if="aiError">{{ aiError }}</p>
          <pre class="result" v-if="aiResult">{{ aiResult }}</pre>
          <details v-if="aiRaw">
            <summary>原始 JSON</summary>
            <pre class="result">{{ aiRaw }}</pre>
          </details>
        </section>
      </template>

      <template v-else>
        <section class="panel" v-if="isAdmin && workspaceSub === 'inspection'">
          <h2>管理员账号注册</h2>
          <p class="hint">该面板仅管理员可见，用于新增学生、教师、运维和管理员账号。</p>
          <div class="grid">
            <div class="row">
              <label for="registerUsername">账号</label>
              <input id="registerUsername" v-model="registerUsername" placeholder="new_user" />
            </div>
            <div class="row">
              <label for="registerPassword">密码</label>
              <input id="registerPassword" v-model="registerPassword" type="password" placeholder="至少 6 位" />
            </div>
            <div class="row">
              <label for="registerRole">角色</label>
              <select id="registerRole" v-model="registerRole">
                <option value="student">学生</option>
                <option value="teacher">教师</option>
                <option value="maintainer">运维</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            <div class="row" v-if="shouldCollectGender(registerRole)">
              <label for="registerGender">性别（学生必填）</label>
              <select id="registerGender" v-model="registerGender">
                <option value="female">女</option>
                <option value="male">男</option>
              </select>
            </div>
            <div class="row">
              <label for="registerActive">账号状态</label>
              <select id="registerActive" v-model="registerActive">
                <option :value="true">启用</option>
                <option :value="false">禁用</option>
              </select>
            </div>
          </div>
          <div class="actions">
            <button :disabled="registerLoading" @click="submitRegisterUser">
              {{ registerLoading ? "提交中..." : "创建账号" }}
            </button>
          </div>
          <p class="hint" v-if="registerMessage">{{ registerMessage }}</p>
        </section>

        <section class="panel" v-if="isReviewer && workspaceSub === 'inspection'">
          <h2>教师任务派遣</h2>
          <p class="hint">教师和管理员都可派单，系统会按宿舍楼策略校验是否允许派发。</p>
          <div class="actions">
            <button class="ghost" :disabled="dispatchOptionsLoading" @click="loadDispatchOptions">
              {{ dispatchOptionsLoading ? "加载中..." : "刷新派单选项" }}
            </button>
          </div>
          <div class="grid">
            <div class="row">
              <label for="dispatchTitle">任务标题</label>
              <input id="dispatchTitle" v-model="dispatchTaskTitle" placeholder="例行弱电巡检" />
            </div>
            <div class="row">
              <label for="dispatchCycle">任务周期</label>
              <select id="dispatchCycle" v-model="dispatchCycleType">
                <option value="one_off">一次性</option>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
              </select>
            </div>
            <div class="row">
              <label for="dispatchRoom">派发房间</label>
              <select id="dispatchRoom" v-model.number="dispatchRoomId">
                <option v-for="room in dispatchRooms" :key="room.room_id" :value="room.room_id">
                  {{ room.building_code }} / {{ room.room_code }}（{{ room.building_name }}）
                </option>
              </select>
            </div>
            <div class="row">
              <label for="dispatchStudent">派发学生</label>
              <select id="dispatchStudent" v-model.number="dispatchStudentId">
                <option v-for="student in dispatchStudents" :key="student.student_user_id" :value="student.student_user_id">
                  {{ student.username }}（{{ student.gender || "未设置" }}）
                </option>
              </select>
            </div>
            <div class="row">
              <label for="dispatchDue">截止时间</label>
              <input id="dispatchDue" v-model="dispatchDueAt" type="datetime-local" />
            </div>
          </div>
          <div class="actions">
            <button :disabled="dispatchLoading" @click="submitDispatch">
              {{ dispatchLoading ? "派单中..." : "提交派单" }}
            </button>
          </div>
          <p class="hint" v-if="dispatchMessage">{{ dispatchMessage }}</p>
          <p class="error" v-if="dispatchError">{{ dispatchError }}</p>
        </section>

        <section class="panel" v-if="isReviewer && workspaceSub === 'inspection'">
          <h2>待巡检任务列表</h2>
          <div class="actions">
            <button class="ghost" :disabled="pendingTasksLoading" @click="loadPendingTasks">
              {{ pendingTasksLoading ? "加载中..." : "刷新待巡检任务" }}
            </button>
          </div>
          <p class="error" v-if="pendingTasksError">{{ pendingTasksError }}</p>
          <p class="hint" v-if="taskMessage">{{ taskMessage }}</p>

          <div class="two-col task-manage-layout">
            <div>
              <ul class="task-list" v-if="pendingTasks.length > 0">
                <li v-for="task in pendingTasks" :key="task.assignment_id">
                  <div class="record-head">
                    <strong>ID {{ task.assignment_id }} / {{ task.student_username }}</strong>
                    <span class="record-status" :class="statusClass(task.status)">{{ formatStatus(task.status) }}</span>
                  </div>
                  <div class="record-meta-grid">
                    <span>标题：{{ task.task_title }}</span>
                    <span>周期：{{ formatTaskCycle(task.cycle_type) }}</span>
                    <span>{{ task.building_code }} / {{ task.room_code }}</span>
                    <span>截止：{{ new Date(task.due_at).toLocaleString() }}</span>
                  </div>
                  <div class="actions">
                    <button class="ghost" @click="startEditTask(task)">修改</button>
                    <button class="danger" :disabled="deletingTaskId === task.assignment_id" @click="requestDeleteTask(task.assignment_id)">
                      {{
                        deletingTaskId === task.assignment_id
                          ? "删除中..."
                          : confirmDeleteTaskId === task.assignment_id
                            ? "再次点击确认删除"
                            : "删除任务"
                      }}
                    </button>
                    <button
                      class="ghost"
                      v-if="confirmDeleteTaskId === task.assignment_id"
                      :disabled="deletingTaskId === task.assignment_id"
                      @click="cancelDeleteTask"
                    >
                      取消
                    </button>
                  </div>
                </li>
              </ul>
              <p class="hint" v-else>暂无待巡检任务。</p>
            </div>

            <div class="task-edit-card" v-if="editingTaskId">
              <h3>修改任务 {{ editingTaskId }}</h3>
              <div class="grid">
                <div class="row">
                  <label for="editTaskTitle">任务标题</label>
                  <input id="editTaskTitle" v-model="editTaskTitle" placeholder="例行弱电巡检" />
                </div>
                <div class="row">
                  <label for="editTaskCycle">任务周期</label>
                  <select id="editTaskCycle" v-model="editTaskCycleType">
                    <option value="one_off">一次性</option>
                    <option value="weekly">每周</option>
                    <option value="monthly">每月</option>
                  </select>
                </div>
                <div class="row">
                  <label for="editTaskRoom">房间</label>
                  <select id="editTaskRoom" v-model.number="editTaskRoomId">
                    <option v-for="room in dispatchRooms" :key="room.room_id" :value="room.room_id">
                      {{ room.building_code }} / {{ room.room_code }}（{{ room.building_name }}）
                    </option>
                  </select>
                </div>
                <div class="row">
                  <label for="editTaskStudent">学生</label>
                  <select id="editTaskStudent" v-model.number="editTaskStudentId">
                    <option v-for="student in dispatchStudents" :key="student.student_user_id" :value="student.student_user_id">
                      {{ student.username }}（{{ student.gender || "未设置" }}）
                    </option>
                  </select>
                </div>
                <div class="row">
                  <label for="editTaskDueAt">截止时间</label>
                  <input id="editTaskDueAt" v-model="editTaskDueAt" type="datetime-local" />
                </div>
                <div class="row">
                  <label for="editTaskStatus">任务状态</label>
                  <select id="editTaskStatus" v-model="editTaskStatus">
                    <option value="todo">待巡检</option>
                    <option value="rejected">驳回</option>
                    <option value="rectify_required">需整改</option>
                    <option value="overdue">已逾期</option>
                  </select>
                </div>
              </div>
              <div class="actions">
                <button :disabled="taskUpdateLoading" @click="submitTaskUpdate">
                  {{ taskUpdateLoading ? "保存中..." : "保存修改" }}
                </button>
                <button class="ghost" :disabled="taskUpdateLoading" @click="cancelEditTask">取消</button>
              </div>
            </div>
          </div>
        </section>

        <section class="panel" v-if="isReviewer && workspaceSub === 'assets'">
          <h2>资产管理（房间与资产表格导入）</h2>
          <p class="hint">支持 CSV / XLSX。房间导入字段：building_code, room_code, floor_label, location_text, is_active。资产导入字段：asset_code, asset_name, room_code, quantity, asset_category, status, manufacturer, model, note。</p>
          <input ref="roomsImportInput" class="file-input-hidden" type="file" accept=".csv,.xlsx" @change="onRoomsImportChange" />
          <input ref="assetsImportInput" class="file-input-hidden" type="file" accept=".csv,.xlsx" @change="onAssetsImportChange" />

          <div class="actions">
            <button class="ghost" :disabled="assetLoading" @click="loadAssetData">{{ assetLoading ? "加载中..." : "刷新资产数据" }}</button>
            <button @click="openRoomDialog()">新增房间</button>
            <button @click="openAssetDialog()">新增资产</button>
            <button class="ghost" :disabled="importingRooms" @click="triggerRoomsImport">{{ importingRooms ? "导入中..." : "导入房间表" }}</button>
            <button class="ghost" :disabled="importingAssets" @click="triggerAssetsImport">{{ importingAssets ? "导入中..." : "导入资产表" }}</button>
          </div>
          <p class="hint" v-if="assetMessage">{{ assetMessage }}</p>
          <p class="error" v-if="assetError">{{ assetError }}</p>

          <div class="two-col asset-layout">
            <div class="table-card">
              <h3>房间台账（{{ assetRooms.length }}）</h3>
              <div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>楼栋</th>
                      <th>房间</th>
                      <th>楼层</th>
                      <th>位置</th>
                      <th>状态</th>
                      <th>资产数</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="room in assetRooms.slice(0, 120)"
                      :key="room.room_id"
                      class="room-row"
                      :class="{ 'room-row-selected': selectedRoomCode === room.room_code }"
                      @click="selectedRoomCode = selectedRoomCode === room.room_code ? '' : room.room_code"
                    >
                      <td>{{ room.building_code }}</td>
                      <td>{{ room.room_code }}</td>
                      <td>{{ room.floor_label || "-" }}</td>
                      <td>{{ room.location_text || "-" }}</td>
                      <td>{{ room.is_active ? "启用" : "禁用" }}</td>
                      <td><span class="asset-count-badge">{{ roomAssetCount[room.room_code] || 0 }} 件</span></td>
                      <td>
                        <button class="ghost btn-sm" @click.stop="openRoomActionDialog(room)">操作</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="table-card">
              <h3>
                资产台账（{{ filteredAssets.length }}<template v-if="selectedRoomCode"> / {{ assets.length }}</template>）
                <template v-if="selectedRoomCode">
                  <span class="room-filter-badge">{{ selectedRoomCode }}</span>
                  <button class="ghost btn-sm" style="margin-left:6px" @click="selectedRoomCode = ''">✕ 清除筛选</button>
                </template>
              </h3>
              <div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>资产编码</th>
                      <th>名称</th>
                      <th>位置</th>
                      <th>数量</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="asset in filteredAssets.slice(0, 200)" :key="asset.asset_id">
                      <td>{{ asset.asset_code }}</td>
                      <td>{{ asset.asset_name }}</td>
                      <td>{{ asset.building_code }} / {{ asset.room_code }}</td>
                      <td>{{ asset.quantity }}</td>
                      <td>{{ formatAssetStatus(asset.status) }}</td>
                      <td>
                        <button class="ghost btn-sm" @click="openAssetActionDialog(asset)">操作</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section class="panel" v-if="isReviewer && workspaceSub === 'inspection'">
          <h2>巡检审核中心</h2>
          <div class="actions">
            <button :disabled="pendingLoading" @click="loadPendingReviews">
              {{ pendingLoading ? "加载中..." : "刷新待审核列表" }}
            </button>
          </div>
          <p class="error" v-if="pendingError">{{ pendingError }}</p>

          <ul class="task-list" v-if="pendingReviews.length > 0">
            <li v-for="item in pendingReviews" :key="item.inspection_id">
              <strong>ID {{ item.inspection_id }} / {{ item.student_username }}</strong>
              <span>{{ item.building_code }} / {{ item.room_code }}</span>
              <span>提交时间: {{ new Date(item.submitted_at).toLocaleString() }}</span>
              <span>锁闭: {{ formatLockState(item.lock_state) }}，杂物: {{ formatClutterState(item.clutter_state) }}</span>
              <span>指示灯: {{ formatIndicatorState(item.indicator_state) }}，资产: {{ formatAssetMatchState(item.asset_match_state) }}</span>
              <span>照片: {{ item.photo_count }}</span>
              <span v-if="item.remark_text">备注: {{ item.remark_text }}</span>
              <div class="photo-preview-grid" v-if="item.photo_urls.length > 0">
                <img
                  v-for="photoUrl in item.photo_urls"
                  :key="photoUrl"
                  :src="photoUrl"
                  alt="巡检照片"
                  @click="openPhotoPreview(photoUrl)"
                />
              </div>
              <div class="actions">
                <button class="ghost" @click="selectedInspectionId = item.inspection_id">选中此记录</button>
              </div>
            </li>
          </ul>
          <p class="hint" v-else>暂无待审核巡检记录。</p>

          <div class="grid">
            <div class="row">
              <label for="selectedInspection">当前审核记录ID</label>
              <input id="selectedInspection" v-model.number="selectedInspectionId" type="number" min="1" />
            </div>
            <div class="row">
              <label for="reviewAction">审核动作</label>
              <select id="reviewAction" v-model="reviewAction">
                <option value="approved">通过</option>
                <option value="rejected">驳回</option>
                <option value="rectify_required">需整改</option>
              </select>
            </div>
            <div class="row">
              <label for="reviewReason">审核原因（驳回/整改必填）</label>
              <textarea id="reviewReason" v-model="reviewReason" rows="3" />
            </div>
          </div>
          <div class="actions">
            <button :disabled="reviewLoading" @click="submitReview">
              {{ reviewLoading ? "提交中..." : "提交审核" }}
            </button>
          </div>
          <p class="hint" v-if="reviewMessage">{{ reviewMessage }}</p>
        </section>

        <section class="panel" v-if="isReviewer && workspaceSub === 'records'">
          <h2>巡检记录总览（控制台）</h2>
          <div class="grid">
            <div class="row">
              <label>状态筛选</label>
              <select v-model="consoleFilterStatus">
                <option value="">全部状态</option>
                <option value="pending_review">待审核</option>
                <option value="approved">已通过</option>
                <option value="rejected">已驳回</option>
                <option value="rectify_required">需整改</option>
              </select>
            </div>
            <div class="row">
              <label>弱电间编号</label>
              <input v-model="consoleFilterRoomCode" placeholder="如 dorm-2-R1" />
            </div>
            <div class="row">
              <label>学生账号</label>
              <input v-model="consoleFilterUsername" placeholder="如 student_f01" />
            </div>
            <div class="row">
              <label>提交开始时间</label>
              <input v-model="consoleFilterFrom" type="datetime-local" />
            </div>
            <div class="row">
              <label>提交结束时间</label>
              <input v-model="consoleFilterTo" type="datetime-local" />
            </div>
          </div>
          <div class="actions">
            <button :disabled="consoleLoading" @click="loadConsoleInspections">
              {{ consoleLoading ? "加载中..." : "🔍 筛选查询" }}
            </button>
            <button class="ghost" @click="() => { consoleFilterStatus = ''; consoleFilterRoomCode = ''; consoleFilterUsername = ''; consoleFilterFrom = ''; consoleFilterTo = ''; loadConsoleInspections(); }">
              清空筛选
            </button>
          </div>
          <p class="error" v-if="consoleError">{{ consoleError }}</p>

          <ul class="task-list" v-if="consoleInspections.length > 0">
            <li v-for="item in consoleInspections" :key="item.inspection_id">
              <div class="record-head">
                <strong>ID {{ item.inspection_id }} / {{ item.student_username }}</strong>
                <span class="record-status" :class="statusClass(item.status)">{{ formatStatus(item.status) }}</span>
              </div>
              <div class="record-meta-grid">
                <span>{{ item.building_code }} / {{ item.room_code }}</span>
                <span>照片: {{ item.photo_count }}</span>
                <span>提交时间: {{ new Date(item.submitted_at).toLocaleString() }}</span>
                <span v-if="item.reviewed_at">审核时间: {{ new Date(item.reviewed_at).toLocaleString() }}</span>
              </div>
              <div class="photo-preview-grid" v-if="item.photo_urls.length > 0">
                <img
                  v-for="photoUrl in item.photo_urls"
                  :key="photoUrl"
                  :src="photoUrl"
                  alt="巡检照片"
                  @click="openPhotoPreview(photoUrl)"
                />
              </div>
              <div class="actions">
                <button
                  class="danger"
                  :disabled="deletingInspectionId === item.inspection_id"
                  @click="requestDeleteInspection(item.inspection_id)"
                >
                  {{
                    deletingInspectionId === item.inspection_id
                      ? "删除中..."
                      : confirmDeleteInspectionId === item.inspection_id
                        ? "再次点击确认删除"
                        : "删除记录"
                  }}
                </button>
                <button
                  class="ghost"
                  v-if="confirmDeleteInspectionId === item.inspection_id"
                  :disabled="deletingInspectionId === item.inspection_id"
                  @click="cancelDeleteInspection"
                >
                  取消
                </button>
                <span class="hint danger-hint" v-if="confirmDeleteInspectionId === item.inspection_id">
                  二次确认：删除后将清理该记录关联照片与审核日志，且不可恢复。
                </span>
              </div>
            </li>
          </ul>
          <p class="hint" v-else>暂无巡检记录。</p>
        </section>
      </template>
        </div>
      </div>
    </template>

    <div class="photo-lightbox" v-if="previewPhotoUrl" @click.self="closePhotoPreview">
      <button class="photo-lightbox-close" @click="closePhotoPreview">关闭</button>
      <img :src="previewPhotoUrl" alt="巡检照片预览" />
    </div>

    <!-- 房间操作弹窗 -->
    <div v-if="showRoomActionDialog && actionRoom" class="dialog-mask" @click.self="showRoomActionDialog = false">
      <div class="dialog-panel dialog-panel-wide">
        <h3>房间管理 · {{ actionRoom.building_code }} / {{ actionRoom.room_code }}</h3>
        <div class="dialog-two-col">
          <div class="grid">
            <div class="row">
              <label>楼栋编码</label>
              <input v-model="editingRoom.building_code" />
            </div>
            <div class="row">
              <label>房间号</label>
              <input v-model="editingRoom.room_code" />
            </div>
            <div class="row">
              <label>楼层</label>
              <input v-model="editingRoom.floor_label" />
            </div>
            <div class="row">
              <label>位置</label>
              <input v-model="editingRoom.location_text" />
            </div>
            <div class="row">
              <label>状态</label>
              <select v-model="editingRoom.is_active">
                <option :value="true">启用</option>
                <option :value="false">禁用</option>
              </select>
            </div>
          </div>
          <div class="dialog-qr-col">
            <img :src="getRoomQrcodeUrl(actionRoom.room_id)" alt="二维码" class="dialog-qr-img" />
            <a :href="getRoomQrcodeUrl(actionRoom.room_id)" download="二维码.png" target="_blank" class="qr-download-link">下载二维码</a>
          </div>
        </div>
        <div class="actions">
          <button @click="submitRoomActionEdit">保存修改</button>
          <button class="danger" @click="roomActionDelete">删除房间</button>
          <button class="ghost" @click="showRoomActionDialog = false">关闭</button>
        </div>
        <p class="hint" v-if="assetMessage">{{ assetMessage }}</p>
        <p class="error" v-if="assetError">{{ assetError }}</p>
      </div>
    </div>

    <!-- 资产操作弹窗 -->
    <div v-if="showAssetActionDialog && actionAsset" class="dialog-mask" @click.self="showAssetActionDialog = false">
      <div class="dialog-panel dialog-panel-wide">
        <h3>资产管理 · {{ actionAsset.asset_code }} {{ actionAsset.asset_name }}</h3>
        <div class="dialog-two-col">
          <div class="grid">
            <div class="row">
              <label>资产编码</label>
              <input v-model="editingAsset.asset_code" />
            </div>
            <div class="row">
              <label>名称</label>
              <input v-model="editingAsset.asset_name" />
            </div>
            <div class="row">
              <label>类别</label>
              <input v-model="editingAsset.asset_category" />
            </div>
            <div class="row">
              <label>房间号</label>
              <input v-model="editingAsset.room_code" />
            </div>
            <div class="row">
              <label>数量</label>
              <input type="number" v-model.number="editingAsset.quantity" min="1" />
            </div>
            <div class="row">
              <label>状态</label>
              <input v-model="editingAsset.status" />
            </div>
            <div class="row">
              <label>厂家</label>
              <input v-model="editingAsset.manufacturer" />
            </div>
            <div class="row">
              <label>型号</label>
              <input v-model="editingAsset.model" />
            </div>
            <div class="row">
              <label>备注</label>
              <input v-model="editingAsset.note" />
            </div>
          </div>
          <div class="dialog-qr-col">
            <img :src="getAssetQrcodeUrl(actionAsset.asset_id)" alt="二维码" class="dialog-qr-img" />
            <a :href="getAssetQrcodeUrl(actionAsset.asset_id)" download="二维码.png" target="_blank" class="qr-download-link">下载二维码</a>
          </div>
        </div>
        <div class="actions">
          <button @click="submitAssetActionEdit">保存修改</button>
          <button class="danger" @click="assetActionDelete">删除资产</button>
          <button class="ghost" @click="showAssetActionDialog = false">关闭</button>
        </div>
        <p class="hint" v-if="assetMessage">{{ assetMessage }}</p>
        <p class="error" v-if="assetError">{{ assetError }}</p>
      </div>
    </div>

    <!-- 房间编辑弹窗 -->
    <div v-if="showRoomDialog" class="dialog-mask">
      <div class="dialog-panel">
        <h3>{{ editingRoomId ? "编辑房间" : "新增房间" }}</h3>
        <div class="grid">
          <div class="row">
            <label>楼栋编码</label>
            <input v-model="editingRoom.building_code" />
          </div>
          <div class="row">
            <label>房间号</label>
            <input v-model="editingRoom.room_code" />
          </div>
          <div class="row">
            <label>楼层</label>
            <input v-model="editingRoom.floor_label" />
          </div>
          <div class="row">
            <label>位置</label>
            <input v-model="editingRoom.location_text" />
          </div>
          <div class="row">
            <label>状态</label>
            <select v-model="editingRoom.is_active">
              <option :value="true">启用</option>
              <option :value="false">禁用</option>
            </select>
          </div>
        </div>
        <div class="actions">
          <button @click="submitRoomDialog">保存</button>
          <button class="ghost" @click="closeRoomDialog">取消</button>
        </div>
      </div>
    </div>

    <!-- 资产编辑弹窗 -->
    <div v-if="showAssetDialog" class="dialog-mask">
      <div class="dialog-panel">
        <h3>{{ editingAssetId ? "编辑资产" : "新增资产" }}</h3>
        <div class="grid">
          <div class="row">
            <label>资产编码</label>
            <input v-model="editingAsset.asset_code" />
          </div>
          <div class="row">
            <label>名称</label>
            <input v-model="editingAsset.asset_name" />
          </div>
          <div class="row">
            <label>类别</label>
            <input v-model="editingAsset.asset_category" />
          </div>
          <div class="row">
            <label>房间号</label>
            <input v-model="editingAsset.room_code" />
          </div>
          <div class="row">
            <label>数量</label>
            <input type="number" v-model.number="editingAsset.quantity" min="1" />
          </div>
          <div class="row">
            <label>状态</label>
            <input v-model="editingAsset.status" />
          </div>
          <div class="row">
            <label>厂家</label>
            <input v-model="editingAsset.manufacturer" />
          </div>
          <div class="row">
            <label>型号</label>
            <input v-model="editingAsset.model" />
          </div>
          <div class="row">
            <label>备注</label>
            <input v-model="editingAsset.note" />
          </div>
        </div>
        <div class="actions">
          <button @click="submitAssetDialog">保存</button>
          <button class="ghost" @click="closeAssetDialog">取消</button>
        </div>
      </div>
    </div>

    <!-- 二维码弹窗 -->
    <div v-if="showQrcodeDialog" class="dialog-mask" @click.self="closeQrcodeDialog">
      <div class="dialog-panel">
        <h3>{{ qrcodeTitle }}</h3>
        <img :src="qrcodeUrl" alt="二维码" style="width:200px;height:200px;" />
        <div class="actions">
          <a :href="qrcodeUrl" download="二维码.png" target="_blank">下载二维码</a>
          <button class="ghost" @click="closeQrcodeDialog">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

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
  deleteUser,
  listUsers,
  updateUser,
  type UserManageItem,
  type UpdateUserRequest,
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
type WorkspaceSub = "inspection" | "assets" | "records" | "accounts";
type ViewHash = ConsolePage | "login";
type RoomInspectionGroup = { building_code: string; room_code: string; items: ConsoleInspectionItem[] };

const username = ref("");
const password = ref("");
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

const roomInspectionGroups = computed(() => {
  const map = new Map<string, { building_code: string; room_code: string; items: ConsoleInspectionItem[] }>();
  for (const item of consoleInspections.value) {
    const key = `${item.building_code}||${item.room_code}`;
    if (!map.has(key)) {
      map.set(key, { building_code: item.building_code, room_code: item.room_code, items: [] });
    }
    map.get(key)!.items.push(item);
  }
  return Array.from(map.values()).sort((a, b) => a.room_code.localeCompare(b.room_code));
});

const showRoomRecordsDialog = ref(false);
const roomRecordsGroup = ref<RoomInspectionGroup | null>(null);
const roomAiLoading = ref(false);
const roomAiResult = ref("");
const roomAiError = ref("");

const showInspectionDetailDialog = ref(false);
const detailItem = ref<ConsoleInspectionItem | null>(null);
const detailAiLoading = ref(false);
const detailAiResult = ref("");
const detailAiError = ref("");
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
const expandedBuildings = ref<Record<string, boolean>>({});

const buildingGroups = computed(() => {
  const map = new Map<string, { name: string; rooms: AssetRoomItem[] }>();
  for (const room of assetRooms.value) {
    const key = room.building_code;
    if (!map.has(key)) map.set(key, { name: room.building_name || room.building_code, rooms: [] });
    map.get(key)!.rooms.push(room);
  }
  return Array.from(map.entries()).map(([code, v]) => ({ code, ...v }));
});

function toggleBuilding(code: string): void {
  expandedBuildings.value = { ...expandedBuildings.value, [code]: !expandedBuildings.value[code] };
}

function isBuildingExpanded(code: string): boolean {
  return expandedBuildings.value[code] !== false; // 默认展开
}
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
const pendingTaskFilterTitle = ref("");
const pendingTaskFilterRoom = ref("");
const pendingTaskFilterStudent = ref("");
const pendingTaskFilterStatus = ref("");

const filteredPendingTasks = computed(() => {
  let list = pendingTasks.value;
  const title = pendingTaskFilterTitle.value.trim().toLowerCase();
  const room = pendingTaskFilterRoom.value.trim().toLowerCase();
  const student = pendingTaskFilterStudent.value.trim().toLowerCase();
  const status = pendingTaskFilterStatus.value;
  if (title) list = list.filter(t => t.task_title.toLowerCase().includes(title));
  if (room) list = list.filter(t => t.room_code.toLowerCase().includes(room) || t.building_code.toLowerCase().includes(room));
  if (student) list = list.filter(t => t.student_username.toLowerCase().includes(student));
  if (status) list = list.filter(t => t.status === status);
  return list;
});
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

const users = ref<UserManageItem[]>([]);
const usersLoading = ref(false);
const usersError = ref("");
const usersMessage = ref("");
const showEditUserDialog = ref(false);
const editingUser = ref<UserManageItem | null>(null);
const editUserRole = ref("");
const editUserGender = ref<"male" | "female" | "">(""); 
const editUserActive = ref(true);
const editUserNewPassword = ref("");
const editUserLoading = ref(false);
const deletingUserId = ref<number | null>(null);
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
const previewPhotoUrl = ref("");
const showRoomDeleteConfirm = ref(false);
const deleteConfirmRoomId = ref<number | null>(null);
const deleteConfirmInspectionCount = ref(0);
const showPrintDialog = ref(false);
const printPersonName = ref("");
const printPersonContact = ref("");
const printScope = ref<"all" | "selected">("all");
const actionRoom = ref<AssetRoomItem | null>(null);
const showAssetActionDialog = ref(false);
const actionAsset = ref<AssetItemView | null>(null);
const selectedRoomId = ref<number | null>(null);
const selectedAssetId = ref<number | null>(null);

function openRoomDialog(room?: AssetRoomItem) {
  if (room) {
    editingRoom.value = { ...room };
    editingRoomId.value = room.room_id;
  } else {
    editingRoom.value = { building_code: "", room_code: "", floor_label: "", location_text: "", is_active: true, gender_restriction: "none" };
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
  try {
    await deleteRoom(room_id);
    assetMessage.value = "房间已删除";
    await loadAssetData();
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("ROOM_HAS_INSPECTIONS:")) {
      const count = parseInt(e.message.split(":")[1] || "0");
      deleteConfirmRoomId.value = room_id;
      deleteConfirmInspectionCount.value = count;
      showRoomDeleteConfirm.value = true;
      return;
    }
    assetError.value = e instanceof Error ? e.message : String(e);
  }
}

async function confirmForceDeleteRoom() {
  if (!deleteConfirmRoomId.value) return;
  showRoomDeleteConfirm.value = false;
  try {
    await deleteRoom(deleteConfirmRoomId.value, true);
    assetMessage.value = `房间及 ${deleteConfirmInspectionCount.value} 条巡检记录已删除`;
    await loadAssetData();
  } catch (e) {
    assetError.value = e instanceof Error ? e.message : String(e);
  } finally {
    deleteConfirmRoomId.value = null;
  }
}

function printLabels(): void {
  const rooms =
    printScope.value === "selected" && selectedRoomId.value
      ? assetRooms.value.filter((r) => r.room_id === selectedRoomId.value)
      : assetRooms.value;

  if (rooms.length === 0) {
    assetError.value = "没有可打印的房间。";
    return;
  }

  const baseUrl = getBackendBaseUrl();
  const person = printPersonName.value.trim();
  const contact = printPersonContact.value.trim();

  const labelHtml = rooms
    .map(
      (room) => `
    <div class="label">
      <img class="qr" src="${baseUrl}/assets/room/${room.room_id}/qrcode" alt="QR" />
      <div class="info">
        <div class="building">${room.building_name || room.building_code}</div>
        <div class="room">${room.room_code}</div>
        <div class="location">${[room.floor_label, room.location_text].filter(Boolean).join(" · ") || "—"}</div>
        ${person ? `<div class="person">负责人：${person}</div>` : ""}
        ${contact ? `<div class="contact">联系：${contact}</div>` : ""}
      </div>
    </div>`
    )
    .join("");

  const printWin = window.open("", "_blank");
  if (!printWin) {
    assetError.value = "请允许浏览器弹出窗口以打印标签。";
    return;
  }

  printWin.document.write(`<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8"><title>房间标签</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:"Noto Sans SC","Segoe UI",sans-serif;padding:8mm;}
.labels{display:flex;flex-wrap:wrap;gap:4mm;}
.label{width:85mm;height:55mm;border:1px solid #aaa;border-radius:3mm;
  padding:4mm;display:flex;align-items:center;gap:4mm;page-break-inside:avoid;}
.qr{width:42mm;height:42mm;flex-shrink:0;border-radius:2mm;}
.info{flex:1;overflow:hidden;}
.building{font-size:9pt;color:#1a3a6a;font-weight:600;}
.room{font-size:15pt;font-weight:700;color:#1a3a6a;margin:1.5mm 0;}
.location{font-size:8.5pt;color:#555;}
.person,.contact{font-size:8.5pt;color:#333;margin-top:1.5mm;}
@media print{body{padding:4mm;}.label{border:1px solid #000;}}
</style></head><body>
<div class="labels">${labelHtml}</div>
<script>window.onload=()=>window.print();<\/script>
</body></html>`);
  printWin.document.close();
  showPrintDialog.value = false;
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
  selectedRoomId.value = room.room_id;
  selectedRoomCode.value = room.room_code;
  editingRoom.value = { ...room };
  editingRoomId.value = room.room_id;
  actionRoom.value = room;
}

function editSelectedRoom(): void {
  const room = assetRooms.value.find(r => r.room_id === selectedRoomId.value);
  if (room) openRoomDialog(room);
}

function deleteSelectedRoom(): void {
  const room = assetRooms.value.find(r => r.room_id === selectedRoomId.value);
  if (room) handleDeleteRoom(room.room_id);
}

function openAssetActionDialog(asset: AssetItemView): void {
  selectedAssetId.value = asset.asset_id;
  editingAsset.value = { ...asset };
  editingAssetId.value = asset.asset_id;
  actionAsset.value = asset;
}

function editSelectedAsset(): void {
  const asset = assets.value.find(a => a.asset_id === selectedAssetId.value);
  if (asset) openAssetDialog(asset);
}

function deleteSelectedAsset(): void {
  const asset = assets.value.find(a => a.asset_id === selectedAssetId.value);
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

function setViewHash(view: string): void {
  const nextHash = `#${view}`;
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}

function switchConsolePage(page: ConsolePage): void {
  activePage.value = page;
  if (page === "workspace") {
    setViewHash(`workspace/${workspaceSub.value}`);
  } else {
    setViewHash(page);
  }
}

function switchWorkspaceSub(sub: WorkspaceSub): void {
  workspaceSub.value = sub;
  setViewHash(`workspace/${sub}`);
  if (sub === "accounts" && users.value.length === 0) {
    loadUsers();
  }
}

function resolveStateFromHash(): { page: ConsolePage; sub: WorkspaceSub } {
  const hash = window.location.hash.replace("#", "").trim();
  if (hash === "settings") return { page: "settings", sub: "inspection" };
  if (hash.startsWith("workspace/")) {
    const subStr = hash.slice("workspace/".length) as WorkspaceSub;
    const valid: WorkspaceSub[] = ["inspection", "assets", "records", "accounts"];
    return { page: "workspace", sub: valid.includes(subStr) ? subStr : "inspection" };
  }
  return { page: "workspace", sub: "inspection" };
}

function resolvePageFromHash(): ConsolePage {
  return resolveStateFromHash().page;
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

function openInspectionDetail(item: ConsoleInspectionItem): void {
  detailItem.value = item;
  detailAiResult.value = "";
  detailAiError.value = "";
  showInspectionDetailDialog.value = true;
}

async function requestAiAnalysis(): Promise<void> {
  if (!detailItem.value) return;
  const item = detailItem.value;

  const lockMap: Record<string, string> = { locked: "已锁", unlocked: "未锁", lock_damaged: "门锁损坏" };
  const clutterMap: Record<string, string> = { none: "无杂物", stacked_items: "有堆放物品", water: "有积水", odor: "有异味" };
  const indicatorMap: Record<string, string> = { all_ok: "全部正常", partial_abnormal: "个别异常", all_abnormal: "全部异常" };
  const assetMap: Record<string, string> = { matched: "与台账一致", missing: "资产缺失", extra: "资产多余", moved: "位置变动" };

  const prompt = `以下是一条弱电机房巡检记录，请根据巡检结果给出专业的风险评估和整改建议：
房间：${item.building_code} / ${item.room_code}
巡检状态：${item.status}
锁闭状态：${lockMap[item.lock_state] || item.lock_state}
环境杂物：${clutterMap[item.clutter_state] || item.clutter_state}
设备指示灯：${indicatorMap[item.indicator_state] || item.indicator_state}
资产核对：${assetMap[item.asset_match_state] || item.asset_match_state}
照片数量：${item.photo_count} 张
${item.remark_text ? `巡检备注：${item.remark_text}` : ""}
提交时间：${new Date(item.submitted_at).toLocaleString()}

请给出：1.风险等级（低/中/高）2.主要风险点 3.整改建议`;

  detailAiLoading.value = true;
  detailAiError.value = "";
  detailAiResult.value = "";
  try {
    const output = await callAiGateway({
      mode: aiConfig.value.mode,
      backendBaseUrl: getBackendBaseUrl(),
      accessToken: getAccessToken(),
      endpoint: aiConfig.value.endpoint,
      apiKey: aiConfig.value.apiKey,
      model: aiConfig.value.model,
      systemPrompt: "你是弱电机房巡检专家，请根据巡检数据给出简洁专业的风险分析和整改建议。",
      userPrompt: prompt,
      temperature: 0.3,
    });
    detailAiResult.value = output.text;
  } catch (e) {
    detailAiError.value = e instanceof Error ? e.message : "AI 分析失败";
  } finally {
    detailAiLoading.value = false;
  }
}

function openRoomRecords(group: RoomInspectionGroup): void {
  roomRecordsGroup.value = group;
  roomAiResult.value = "";
  roomAiError.value = "";
  showRoomRecordsDialog.value = true;
}

async function requestRoomAiAnalysis(): Promise<void> {
  if (!roomRecordsGroup.value) return;
  const group = roomRecordsGroup.value;
  const lockMap: Record<string, string> = { locked: "已锁", unlocked: "未锁", lock_damaged: "门锁损坏" };
  const clutterMap: Record<string, string> = { none: "无杂物", stacked_items: "有堆放物品", water: "有积水", odor: "有异味" };
  const indicatorMap: Record<string, string> = { all_ok: "全部正常", partial_abnormal: "个别异常", all_abnormal: "全部异常" };
  const assetMap: Record<string, string> = { matched: "与台账一致", missing: "资产缺失", extra: "资产多余", moved: "位置变动" };
  const recordsSummary = group.items.map((item, i) =>
    `记录${i + 1}（${new Date(item.submitted_at).toLocaleDateString()}）：状态=${formatStatus(item.status)}，锁闭=${lockMap[item.lock_state] || item.lock_state}，杂物=${clutterMap[item.clutter_state] || item.clutter_state}，指示灯=${indicatorMap[item.indicator_state] || item.indicator_state}，资产=${assetMap[item.asset_match_state] || item.asset_match_state}${item.remark_text ? '，备注:' + item.remark_text : ''}`
  ).join("\n");

  const prompt = `以下是弱电机房「${group.building_code} / ${group.room_code}」的全部巡检记录（共 ${group.items.length} 条），请综合分析并给出整体评估：\n${recordsSummary}\n\n请给出：1.整体健康状态评分（0-100）2.主要风险趋势 3.近期整改优先项`;

  roomAiLoading.value = true;
  roomAiError.value = "";
  roomAiResult.value = "";
  try {
    const output = await callAiGateway({
      mode: aiConfig.value.mode,
      backendBaseUrl: getBackendBaseUrl(),
      accessToken: getAccessToken(),
      endpoint: aiConfig.value.endpoint,
      apiKey: aiConfig.value.apiKey,
      model: aiConfig.value.model,
      systemPrompt: "你是弱电机房运维专家，根据多条历史巡检记录，给出房间整体运行状况评估和优先整改建议。",
      userPrompt: prompt,
      temperature: 0.3,
    });
    roomAiResult.value = output.text;
  } catch (e) {
    roomAiError.value = e instanceof Error ? e.message : "AI 分析失败";
  } finally {
    roomAiLoading.value = false;
  }
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

async function loadUsers(): Promise<void> {
  usersLoading.value = true;
  usersError.value = "";
  try {
    users.value = await listUsers();
  } catch (e) {
    usersError.value = e instanceof Error ? e.message : "获取用户列表失败";
  } finally {
    usersLoading.value = false;
  }
}

function openEditUserDialog(user: UserManageItem): void {
  editingUser.value = { ...user };
  editUserRole.value = user.role;
  editUserGender.value = (user.gender as "male" | "female" | "") || "";
  editUserActive.value = user.is_active;
  editUserNewPassword.value = "";
  usersMessage.value = "";
  usersError.value = "";
  showEditUserDialog.value = true;
}

async function submitEditUser(): Promise<void> {
  if (!editingUser.value) return;
  editUserLoading.value = true;
  usersError.value = "";
  try {
    const payload: UpdateUserRequest = {
      role: editUserRole.value || undefined,
      gender: editUserRole.value === "student" ? (editUserGender.value || undefined) : undefined,
      is_active: editUserActive.value,
      new_password: editUserNewPassword.value || undefined
    };
    await updateUser(editingUser.value.id, payload);
    usersMessage.value = `用户 ${editingUser.value.username} 已更新`;
    showEditUserDialog.value = false;
    await loadUsers();
  } catch (e) {
    usersError.value = e instanceof Error ? e.message : "更新失败";
  } finally {
    editUserLoading.value = false;
  }
}

async function handleDeleteUser(user: UserManageItem): Promise<void> {
  if (!confirm(`确定删除用户 ${user.username}？此操作不可恢复。`)) return;
  deletingUserId.value = user.id;
  usersError.value = "";
  try {
    await deleteUser(user.id);
    usersMessage.value = `用户 ${user.username} 已删除`;
    await loadUsers();
  } catch (e) {
    usersError.value = e instanceof Error ? e.message : "删除失败";
  } finally {
    deletingUserId.value = null;
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
    const { page, sub } = resolveStateFromHash();
    activePage.value = page;
    workspaceSub.value = sub;
    if (sub === "accounts" && users.value.length === 0) loadUsers();

    window.addEventListener("hashchange", () => {
      if (!isLoggedIn.value) return;
      const { page: p, sub: s } = resolveStateFromHash();
      activePage.value = p;
      workspaceSub.value = s;
      if (s === "accounts" && users.value.length === 0) loadUsers();
    });
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
            <p class="login-brand-tag">弱电巡检管理台</p>
            <h1>弱电巡检管理台</h1>
            <p class="hint">教师 / 管理员统一入口，学生请使用移动端。</p>
          </div>
          <label for="username">账号</label>
          <input id="username" v-model="username" placeholder="请输入账号" />
          <label for="password">密码</label>
          <input id="password" v-model="password" type="password" placeholder="请输入登录密码" />
          <button class="login-btn" :disabled="authLoading" @click="handleLogin">
            {{ authLoading ? "登录中..." : "立即登录" }}
          </button>
          <p class="error" v-if="authMessage">{{ authMessage }}</p>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="workspace-shell">
        <div class="workspace-content">
          <header class="hero">
            <h1>弱电巡检管理台</h1>
            <p>弱电巡检管理台</p>
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
        <section class="panel" v-if="isAdmin && workspaceSub === 'accounts'">
          <h2>账户管理</h2>
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

        <section class="panel" v-if="isAdmin && workspaceSub === 'accounts'">
          <h2>用户列表</h2>
          <div class="actions">
            <button class="ghost" :disabled="usersLoading" @click="loadUsers">
              {{ usersLoading ? "加载中..." : "刷新用户列表" }}
            </button>
          </div>
          <p class="hint" v-if="usersMessage">{{ usersMessage }}</p>
          <p class="error" v-if="usersError">{{ usersError }}</p>
          <div class="table-wrap" v-if="users.length > 0">
            <table class="data-table">
              <thead>
                <tr>
                  <th>账号</th>
                  <th>角色</th>
                  <th>性别</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="user in users" :key="user.id">
                  <td>{{ user.username }}</td>
                  <td>{{ formatRole(user.role) }}</td>
                  <td>{{ user.gender === 'male' ? '男' : user.gender === 'female' ? '女' : '-' }}</td>
                  <td><span :class="user.is_active ? 'record-status status-approved' : 'record-status status-rejected'">{{ user.is_active ? '启用' : '禁用' }}</span></td>
                  <td>
                    <div class="table-action-group">
                      <button class="ghost btn-sm" @click="openEditUserDialog(user)">编辑</button>
                      <button class="danger btn-sm" :disabled="deletingUserId === user.id" @click="handleDeleteUser(user)">{{ deletingUserId === user.id ? '删除中...' : '删除' }}</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="hint" v-if="!usersLoading && users.length === 0">暂无用户数据，请先创建账号。</p>
        </section>

        <section class="panel" v-if="isReviewer && workspaceSub === 'inspection'">
          <h2>教师任务派遣</h2>
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
                  {{ student.username }}（{{ student.gender === 'female' ? '女' : student.gender === 'male' ? '男' : '未设置' }}）
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
          <div class="grid">
            <div class="row">
              <label>任务标题</label>
              <input v-model="pendingTaskFilterTitle" placeholder="搜索标题..." />
            </div>
            <div class="row">
              <label>楼栋/房间</label>
              <input v-model="pendingTaskFilterRoom" placeholder="搜索楼栋或房间..." />
            </div>
            <div class="row">
              <label>学生账号</label>
              <input v-model="pendingTaskFilterStudent" placeholder="搜索学生..." />
            </div>
            <div class="row">
              <label>状态</label>
              <select v-model="pendingTaskFilterStatus">
                <option value="">全部</option>
                <option value="todo">待巡检</option>
                <option value="rejected">驳回</option>
                <option value="rectify_required">需整改</option>
                <option value="overdue">已逾期</option>
              </select>
            </div>
          </div>
          <div class="actions">
            <button class="ghost" :disabled="pendingTasksLoading" @click="loadPendingTasks">
              {{ pendingTasksLoading ? "加载中..." : "刷新待巡检任务" }}
            </button>
          </div>
          <p class="error" v-if="pendingTasksError">{{ pendingTasksError }}</p>
          <p class="hint" v-if="taskMessage">{{ taskMessage }}</p>

          <div class="two-col task-manage-layout">
            <div>
              <div class="task-list-scroll">
              <ul class="task-list" v-if="filteredPendingTasks.length > 0">
                <li v-for="task in filteredPendingTasks" :key="task.assignment_id">
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
              <p class="hint" v-if="filteredPendingTasks.length === 0 && pendingTasks.length > 0">无符合条件的任务。</p>
              <p class="hint" v-if="pendingTasks.length === 0">暂无待巡检任务。</p>
              </div>
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
                      {{ student.username }}（{{ student.gender === 'female' ? '女' : student.gender === 'male' ? '男' : '未设置' }}）
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
          <h2>资产管理</h2>
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

          <div class="asset-stack-layout">
            <div class="table-card">
              <div class="table-card-header">
                <h3>房间台账（{{ assetRooms.length }}）</h3>
                <div class="table-header-actions">
                  <button class="ghost btn-sm" @click="showPrintDialog = true">🖨 打印标签</button>
                  <button class="ghost btn-sm" :disabled="!selectedRoomId" @click="editSelectedRoom">编辑</button>
                  <button class="ghost btn-sm" :disabled="!selectedRoomId" @click="() => { const r = assetRooms.find(x => x.room_id === selectedRoomId); if(r) handleShowRoomQrcode(r); }">二维码</button>
                  <button class="danger btn-sm" :disabled="!selectedRoomId" @click="deleteSelectedRoom">删除</button>
                </div>
              </div>
              <div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>房间</th>
                      <th>楼层</th>
                      <th>位置</th>
                      <th>状态</th>
                      <th>性别限制</th>
                      <th>资产数</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="grp in buildingGroups" :key="grp.code">
                      <tr class="building-header-row" @click="toggleBuilding(grp.code)">
                        <td colspan="6">
                          <span class="building-toggle">{{ isBuildingExpanded(grp.code) ? '▼' : '▶' }}</span>
                          <strong>{{ grp.name }}</strong>
                          <span class="building-count">{{ grp.rooms.length }} 间</span>
                        </td>
                      </tr>
                      <template v-if="isBuildingExpanded(grp.code)">
                        <tr
                          v-for="room in grp.rooms"
                          :key="room.room_id"
                          class="room-row"
                          :class="{ 'room-row-selected': selectedRoomId === room.room_id }"
                          @click="openRoomActionDialog(room)"
                        >
                          <td>{{ room.room_code }}</td>
                          <td>{{ room.floor_label || "-" }}</td>
                          <td>{{ room.location_text || "-" }}</td>
                          <td>{{ room.is_active ? "启用" : "禁用" }}</td>
                          <td>{{ room.gender_restriction === 'female' ? '仅限女生' : room.gender_restriction === 'male' ? '仅限男生' : '无限制' }}</td>
                          <td>
                            <span class="asset-count-badge" :class="{ 'asset-count-active': selectedRoomCode === room.room_code }">
                              {{ roomAssetCount[room.room_code] || 0 }} 件
                            </span>
                          </td>
                        </tr>
                      </template>
                    </template>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="table-card">
              <div class="table-card-header">
                <h3>
                  资产台账（{{ filteredAssets.length }}<template v-if="selectedRoomCode"> / {{ assets.length }}</template>）
                  <template v-if="selectedRoomCode">
                    <span class="room-filter-badge">{{ selectedRoomCode }}</span>
                    <button class="ghost btn-sm" style="margin-left:6px" @click="selectedRoomCode = ''; selectedRoomId = null">✕</button>
                  </template>
                </h3>
                <div class="table-header-actions">
                  <button class="ghost btn-sm" :disabled="!selectedAssetId" @click="editSelectedAsset">编辑</button>
                  <button class="danger btn-sm" :disabled="!selectedAssetId" @click="deleteSelectedAsset">删除</button>
                </div>
              </div>
              <div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>资产编码</th>
                      <th>名称</th>
                      <th>类别</th>
                      <th>位置</th>
                      <th>型号</th>
                      <th>厂家</th>
                      <th>数量</th>
                      <th>状态</th>
                      <th>备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="asset in filteredAssets.slice(0, 200)"
                      :key="asset.asset_id"
                      class="room-row"
                      :class="{ 'room-row-selected': selectedAssetId === asset.asset_id }"
                      @click="openAssetActionDialog(asset)"
                    >
                      <td>{{ asset.asset_code }}</td>
                      <td>{{ asset.asset_name }}</td>
                      <td>{{ asset.asset_category || "-" }}</td>
                      <td>{{ asset.building_code }} / {{ asset.room_code }}</td>
                      <td>{{ asset.model || "-" }}</td>
                      <td>{{ asset.manufacturer || "-" }}</td>
                      <td>{{ asset.quantity }}</td>
                      <td>{{ formatAssetStatus(asset.status) }}</td>
                      <td>{{ asset.note || "-" }}</td>
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
          <h2>巡检记录总览（按房间）</h2>
          <div class="actions">
            <button :disabled="consoleLoading" @click="loadConsoleInspections">
              {{ consoleLoading ? "加载中..." : "刷新数据" }}
            </button>
          </div>
          <p class="error" v-if="consoleError">{{ consoleError }}</p>
          <div class="room-card-grid" v-if="roomInspectionGroups.length > 0">
            <div
              class="room-card"
              v-for="group in roomInspectionGroups"
              :key="group.building_code + group.room_code"
              @click="openRoomRecords(group)"
            >
              <div class="room-card-building">{{ group.building_code }}</div>
              <div class="room-card-code">{{ group.room_code }}</div>
              <div class="room-card-stats">
                <span>{{ group.items.length }} 条记录</span>
                <span
                  class="record-status"
                  :class="statusClass(group.items[0].status)"
                >{{ formatStatus(group.items[0].status) }}</span>
              </div>
            </div>
          </div>
          <p class="hint" v-else>暂无巡检记录，请先筛选查询。</p>
        </section>
      </template>
        </div>
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
        <button
          v-if="activePage === 'workspace' && isAdmin"
          class="ghost tab-btn sub-tab-btn"
          :class="{ active: workspaceSub === 'accounts' }"
          @click="switchWorkspaceSub('accounts')"
        >
          账户管理
        </button>
        <button class="ghost tab-btn" :class="{ active: activePage === 'settings' }" @click="switchConsolePage('settings')">
          系统设置
        </button>
        <button class="ghost" @click="handleLogout">退出登录</button>
        <span class="status-pill" :class="{ online: isLoggedIn }">{{ userStatusText }}</span>
          </nav>
        </aside>
      </div>
    </template>

    <!-- 房间巡检记录 + 整体AI分析弹窗 -->
    <div v-if="showRoomRecordsDialog && roomRecordsGroup" class="dialog-mask" @click.self="showRoomRecordsDialog = false">
      <div class="dialog-panel dialog-panel-wide">
        <h3>{{ roomRecordsGroup.building_code }} / {{ roomRecordsGroup.room_code }} · {{ roomRecordsGroup.items.length }} 条记录</h3>
        <div class="actions">
          <button :disabled="roomAiLoading" @click="requestRoomAiAnalysis">
            {{ roomAiLoading ? "分析中..." : "🤖 AI 整体分析" }}
          </button>
          <button class="ghost" @click="showRoomRecordsDialog = false">关闭</button>
        </div>
        <p class="error" v-if="roomAiError">{{ roomAiError }}</p>
        <pre class="result" v-if="roomAiResult">{{ roomAiResult }}</pre>
        <ul class="task-list" style="margin-top:14px">
          <li v-for="item in roomRecordsGroup.items" :key="item.inspection_id">
            <div class="record-head">
              <strong>ID {{ item.inspection_id }} / {{ item.student_username }}</strong>
              <span class="record-status" :class="statusClass(item.status)">{{ formatStatus(item.status) }}</span>
            </div>
            <div class="record-meta-grid">
              <span>提交：{{ new Date(item.submitted_at).toLocaleString() }}</span>
              <span>照片：{{ item.photo_count }}</span>
              <span>锁闭：{{ formatLockState(item.lock_state) }}</span>
              <span>杂物：{{ formatClutterState(item.clutter_state) }}</span>
            </div>
            <div class="photo-preview-grid" v-if="item.photo_urls.length > 0">
              <img v-for="u in item.photo_urls" :key="u" :src="u" alt="照片" @click="openPhotoPreview(u)" />
            </div>
            <div class="actions">
              <button class="ghost btn-sm" @click="openInspectionDetail(item)">详情/AI</button>
              <button class="danger btn-sm" :disabled="deletingInspectionId === item.inspection_id" @click="requestDeleteInspection(item.inspection_id)">
                {{ deletingInspectionId === item.inspection_id ? "删除中..." : confirmDeleteInspectionId === item.inspection_id ? "确认删除" : "删除" }}
              </button>
              <button class="ghost btn-sm" v-if="confirmDeleteInspectionId === item.inspection_id" @click="cancelDeleteInspection">取消</button>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <!-- 巡检详情 + AI分析弹窗 -->
    <div v-if="showInspectionDetailDialog && detailItem" class="dialog-mask" @click.self="showInspectionDetailDialog = false">
      <div class="dialog-panel dialog-panel-wide">
        <h3>巡检详情 · ID {{ detailItem.inspection_id }}</h3>
        <div class="detail-grid">
          <div class="detail-row"><span class="detail-label">学生</span><span>{{ detailItem.student_username }}</span></div>
          <div class="detail-row"><span class="detail-label">房间</span><span>{{ detailItem.building_code }} / {{ detailItem.room_code }}</span></div>
          <div class="detail-row"><span class="detail-label">状态</span><span class="record-status" :class="statusClass(detailItem.status)">{{ formatStatus(detailItem.status) }}</span></div>
          <div class="detail-row"><span class="detail-label">锁闭</span><span>{{ formatLockState(detailItem.lock_state) }}</span></div>
          <div class="detail-row"><span class="detail-label">环境杂物</span><span>{{ formatClutterState(detailItem.clutter_state) }}</span></div>
          <div class="detail-row"><span class="detail-label">设备指示灯</span><span>{{ formatIndicatorState(detailItem.indicator_state) }}</span></div>
          <div class="detail-row"><span class="detail-label">资产核对</span><span>{{ formatAssetMatchState(detailItem.asset_match_state) }}</span></div>
          <div class="detail-row" v-if="detailItem.remark_text"><span class="detail-label">备注</span><span>{{ detailItem.remark_text }}</span></div>
          <div class="detail-row"><span class="detail-label">提交时间</span><span>{{ new Date(detailItem.submitted_at).toLocaleString() }}</span></div>
          <div class="detail-row" v-if="detailItem.reviewed_at"><span class="detail-label">审核时间</span><span>{{ new Date(detailItem.reviewed_at).toLocaleString() }}</span></div>
        </div>
        <div class="photo-preview-grid" v-if="detailItem.photo_urls.length > 0">
          <img v-for="url in detailItem.photo_urls" :key="url" :src="url" alt="巡检照片" @click="openPhotoPreview(url)" />
        </div>
        <div class="actions">
          <button :disabled="detailAiLoading" @click="requestAiAnalysis">
            {{ detailAiLoading ? "分析中..." : "🤖 AI 分析建议" }}
          </button>
          <button class="ghost" @click="showInspectionDetailDialog = false">关闭</button>
        </div>
        <p class="error" v-if="detailAiError">{{ detailAiError }}</p>
        <pre class="result" v-if="detailAiResult">{{ detailAiResult }}</pre>
      </div>
    </div>

    <div class="photo-lightbox" v-if="previewPhotoUrl" @click.self="closePhotoPreview">
      <button class="photo-lightbox-close" @click="closePhotoPreview">关闭</button>
      <img :src="previewPhotoUrl" alt="巡检照片预览" />
    </div>

    <!-- 批量打印标签弹窗 -->
    <div v-if="showPrintDialog" class="dialog-mask" @click.self="showPrintDialog = false">
      <div class="dialog-panel">
        <h3>🖨 批量打印房间标签</h3>
        <div class="grid">
          <div class="row">
            <label>负责人姓名</label>
            <input v-model="printPersonName" placeholder="选填，如：张三" />
          </div>
          <div class="row">
            <label>联系方式</label>
            <input v-model="printPersonContact" placeholder="选填，如：138xxxxxxxx" />
          </div>
          <div class="row">
            <label>打印范围</label>
            <select v-model="printScope">
              <option value="all">全部房间（{{ assetRooms.length }} 间）</option>
              <option value="selected" :disabled="!selectedRoomId">仅选中房间</option>
            </select>
          </div>
        </div>
        <p class="hint">标签内容：楼栋名、房间号、楼层/位置、二维码，以及负责人信息（若填写）。</p>
        <div class="actions">
          <button @click="printLabels">打印标签</button>
          <button class="ghost" @click="showPrintDialog = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 删除房间确认弹窗（有巡检记录时） -->
    <div v-if="showRoomDeleteConfirm" class="dialog-mask" @click.self="showRoomDeleteConfirm = false">
      <div class="dialog-panel">
        <h3>⚠️ 此房间存在巡检记录</h3>
        <p>该房间共有 <strong>{{ deleteConfirmInspectionCount }}</strong> 条巡检记录（含照片和审核日志）。</p>
        <p class="hint">确认删除后，房间及所有关联记录将被永久清除，且不可恢复。</p>
        <div class="actions">
          <button class="danger" @click="confirmForceDeleteRoom">确认全部删除</button>
          <button class="ghost" @click="showRoomDeleteConfirm = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 编辑用户弹窗 -->
    <div v-if="showEditUserDialog && editingUser" class="dialog-mask" @click.self="showEditUserDialog = false">
      <div class="dialog-panel">
        <h3>编辑用户：{{ editingUser.username }}</h3>
        <div class="grid">
          <div class="row">
            <label>角色</label>
            <select v-model="editUserRole">
              <option value="student">学生</option>
              <option value="teacher">教师</option>
              <option value="maintainer">运维</option>
              <option value="admin">管理员</option>
            </select>
          </div>
          <div class="row" v-if="editUserRole === 'student'">
            <label>性别</label>
            <select v-model="editUserGender">
              <option value="female">女</option>
              <option value="male">男</option>
            </select>
          </div>
          <div class="row">
            <label>账号状态</label>
            <select v-model="editUserActive">
              <option :value="true">启用</option>
              <option :value="false">禁用</option>
            </select>
          </div>
          <div class="row">
            <label>新密码（留空不修改）</label>
            <input v-model="editUserNewPassword" type="password" placeholder="至少 6 位，留空不修改" />
          </div>
        </div>
        <div class="actions">
          <button :disabled="editUserLoading" @click="submitEditUser">{{ editUserLoading ? '保存中...' : '保存' }}</button>
          <button class="ghost" @click="showEditUserDialog = false">取消</button>
        </div>
        <p class="error" v-if="usersError">{{ usersError }}</p>
      </div>
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
            <div class="row">
              <label>性别限制</label>
              <select v-model="editingRoom.gender_restriction">
                <option value="none">无限制（男女均可）</option>
                <option value="female">仅限女生</option>
                <option value="male">仅限男生</option>
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
          <div class="row">
            <label>性别限制</label>
            <select v-model="editingRoom.gender_restriction">
              <option value="none">无限制（男女均可）</option>
              <option value="female">仅限女生</option>
              <option value="male">仅限男生</option>
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

<script setup lang="ts">
// 文件说明：该页面是移动端核心交互页面，按中文注释规范维护。
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import {
  clearToken,
  fetchRoomAssets,
  fetchRoomReferencePhoto,
  fetchWxJssdkConfig,
  getMe,
  getToken,
  loadMyInspections,
  loadMyTasks,
  login,
  saveToken,
  submitInspection,
  uploadInspectionPhoto,
  type MyInspectionItem,
  type RoomAssetItem,
  type TaskItem
} from "./api";

const username = ref("");
const password = ref("");
const loginMessage = ref("");
const loading = ref(false);
const currentRole = ref("");
const currentUsername = ref("");

const tasks = ref<TaskItem[]>([]);
const selectedAssignmentId = ref<number | null>(null);
const taskFilterText = ref("");

const filteredTasks = computed(() => {
  const q = taskFilterText.value.trim().toLowerCase();
  if (!q) return tasks.value;
  return tasks.value.filter(
    (t) =>
      t.task_title.toLowerCase().includes(q) ||
      t.room_code.toLowerCase().includes(q) ||
      t.building_code.toLowerCase().includes(q)
  );
});

const checkinMode = ref<"qr" | "manual">("qr");
const lat = ref("");
const lng = ref("");
const geoLoading = ref(false);
const geoError = ref("");
const manualRoomCode = ref("");
const doorPlatePhotoKey = ref("");

const lockState = ref<"locked" | "unlocked" | "lock_damaged">("locked");
const clutterState = ref<"none" | "stacked_items" | "water" | "odor">("none");
const indicatorState = ref<"all_ok" | "partial_abnormal" | "all_abnormal">("all_ok");
const assetMatchState = ref<"matched" | "missing" | "extra" | "moved">("matched");
const remark = ref("");

watch(selectedAssignmentId, () => {
  checkinMode.value = "qr";
  qrScanResult.value = "";
  qrScanError.value = "";
  manualRoomCode.value = "";
  doorPlatePhotoKey.value = "";
  lockState.value = "locked";
  clutterState.value = "none";
  indicatorState.value = "all_ok";
  assetMatchState.value = "matched";
  remark.value = "";
  roomAssets.value = [];
  roomReferencePhotoUrl.value = null;
  submitMessage.value = "";
  submitError.value = "";
});

type CapturedPhoto = {
  id: string;
  key: string;
  previewUrl: string;
  createdAt: string;
};

const cameraInput = ref<HTMLInputElement | null>(null);
const capturedPhotos = ref<CapturedPhoto[]>([]);
const photoStatus = ref("未拍照");
const photoError = ref("");
const photoBusy = ref(false);

const qrScanInput = ref<HTMLInputElement | null>(null);
const qrScanResult = ref("");
const qrScanError = ref("");
const qrScanBusy = ref(false);
const roomAssets = ref<RoomAssetItem[]>([]);
const roomAssetsLoading = ref(false);
const roomReferencePhotoUrl = ref<string | null>(null);

const submitMessage = ref("");
const submitError = ref("");
const myInspections = ref<MyInspectionItem[]>([]);
const previewPhotoUrl = ref("");
const inspectionFilterStatus = ref("");
const inspectionFilterRoomCode = ref("");
const inspectionFilterFrom = ref("");
const inspectionFilterTo = ref("");

const photoKeys = computed(() =>
  capturedPhotos.value.map((item) => item.key)
);
const doorPlatePhotoOptions = computed(() => capturedPhotos.value.map((item) => item.key));

const isStudentLoggedIn = computed(() => currentRole.value === "student" && Boolean(getToken()));
const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
const wechatQrPasteValue = ref("");
const wxReady = ref(false);

async function initWxJssdk(): Promise<void> {
  if (!isWeChat) return;
  try {
    const pageUrl = window.location.href.split("#")[0];
    const cfg = await fetchWxJssdkConfig(pageUrl);
    const wx = (window as any).wx;
    if (!wx) return;
    wx.config({
      debug: false,
      appId: cfg.appId,
      timestamp: cfg.timestamp,
      nonceStr: cfg.nonceStr,
      signature: cfg.signature,
      jsApiList: ["scanQRCode"],
    });
    wx.ready(() => { wxReady.value = true; });
    wx.error((err: any) => { console.warn("wx.config error", err); });
  } catch (e) {
    console.warn("JSSDK init failed", e);
  }
}

function wxScanQRCode(): void {
  const wx = (window as any).wx;
  if (!wx || !wxReady.value) {
    qrScanError.value = "微信JSSDK未就绪，请稍后重试";
    return;
  }
  wx.scanQRCode({
    needResult: 1,
    scanType: ["qrCode"],
    success: async (res: any) => {
      const raw: string = res.resultStr || "";
      const roomCode = raw.startsWith("QR-") ? raw.slice(3) : raw;
      qrScanResult.value = roomCode;
      manualRoomCode.value = roomCode;
      qrScanError.value = "";
      roomAssetsLoading.value = true;
      roomAssets.value = [];
      roomReferencePhotoUrl.value = null;
      try {
        const [assets, refPhoto] = await Promise.all([
          fetchRoomAssets(roomCode),
          fetchRoomReferencePhoto(roomCode),
        ]);
        roomAssets.value = assets;
        roomReferencePhotoUrl.value = refPhoto;
      } catch {
        // 不阻断流程
      } finally {
        roomAssetsLoading.value = false;
      }
    },
    fail: (err: any) => {
      qrScanError.value = `扫码失败：${err?.errMsg || "未知错误"}`;
    },
  });
}

const canSubmit = computed(() => {
  if (!selectedAssignmentId.value) {
    return false;
  }

  if (checkinMode.value === "qr") {
    if (!qrScanResult.value) {
      return false;
    }
  }

  if (checkinMode.value === "manual") {
    if (!manualRoomCode.value.trim() || !doorPlatePhotoKey.value.trim()) {
      return false;
    }
  }

  const count = capturedPhotos.value.length;
  return count >= 1 && count <= 5;
});

function generatePhotoKey(index: number): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeUser = (currentUsername.value || username.value.trim() || "student").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safeUser}_${stamp}_${String(index + 1).padStart(2, "0")}.jpg`;
}

function formatWatermarkTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = src;
  });
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number
): void {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  context.drawImage(image, x, y, drawWidth, drawHeight);
}

function buildNoCacheUrl(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${Date.now()}`;
}

function pickLatestBackendPhotoUrl(): string {
  // 优先使用当前房间的历史参考图（已通过审核），其次使用学生自己的历史照片。
  if (roomReferencePhotoUrl.value) {
    return roomReferencePhotoUrl.value;
  }
  for (const inspection of myInspections.value) {
    if (inspection.photo_urls && inspection.photo_urls.length > 0) {
      return inspection.photo_urls[inspection.photo_urls.length - 1];
    }
  }
  return "";
}

async function refreshInspectionsForReference(): Promise<void> {
  try {
    myInspections.value = await loadMyInspections();
  } catch {
    // 参考图刷新失败不阻断拍照流程。
  }
}

async function renderWatermarkedPhoto(file: File): Promise<string> {
  const currentImageUrl = URL.createObjectURL(file);
  try {
    const currentImage = await loadImage(currentImageUrl);
    const canvas = document.createElement("canvas");
    const maxWidth = 1600;
    const scale = Math.min(1, maxWidth / currentImage.width);
    canvas.width = Math.max(1, Math.round(currentImage.width * scale));
    canvas.height = Math.max(1, Math.round(currentImage.height * scale));

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("无法创建图片画布");
    }

    context.save();
    context.fillStyle = "#0f172a";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();

    const latestBackendPhotoUrl = pickLatestBackendPhotoUrl();
    if (latestBackendPhotoUrl) {
      const previousImage = await loadImage(buildNoCacheUrl(latestBackendPhotoUrl));
      context.save();
      context.globalAlpha = 0.18;
      drawCoverImage(context, previousImage, canvas.width, canvas.height);
      context.restore();
    }

    drawCoverImage(context, currentImage, canvas.width, canvas.height);

    const watermarkHeight = Math.max(84, Math.round(canvas.height * 0.16));
    const gradient = context.createLinearGradient(0, canvas.height - watermarkHeight, 0, canvas.height);
    gradient.addColorStop(0, "rgba(4, 10, 24, 0)");
    gradient.addColorStop(0.38, "rgba(4, 10, 24, 0.26)");
    gradient.addColorStop(1, "rgba(4, 10, 24, 0.82)");
    context.fillStyle = gradient;
    context.fillRect(0, canvas.height - watermarkHeight, canvas.width, watermarkHeight);

    const now = new Date();
    const watermarkUser = currentUsername.value || username.value.trim() || "学生";
    const selectedTask = tasks.value.find((t) => t.assignment_id === selectedAssignmentId.value);
    const locationParts = selectedTask
      ? [
          selectedTask.building_name || selectedTask.building_code,
          selectedTask.floor_label,
          selectedTask.location_text,
          selectedTask.room_code,
        ].filter(Boolean).join(" ")
      : qrScanResult.value || "弱电巡检";
    context.fillStyle = "rgba(255, 255, 255, 0.96)";
    context.font = `${Math.max(18, Math.round(canvas.width * 0.022))}px "Noto Sans SC", sans-serif`;
    context.textBaseline = "top";
    context.fillText(`时间：${formatWatermarkTime(now)}`, 18, canvas.height - watermarkHeight + 14);
    context.fillText(`地点：${locationParts}`, 18, canvas.height - watermarkHeight + 42);
    context.fillText(`拍摄人：${watermarkUser}`, 18, canvas.height - watermarkHeight + 70);

    context.strokeStyle = "rgba(255, 255, 255, 0.65)";
    context.lineWidth = 2;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(currentImageUrl);
  }
}

async function uploadWatermarkedPhoto(dataUrl: string, filename: string): Promise<{ key: string; url: string }> {
  const imageResponse = await fetch(dataUrl);
  const blob = await imageResponse.blob();
  const uploaded = await uploadInspectionPhoto(blob, filename);
  return { key: uploaded.object_key, url: uploaded.file_url };
}

function openCameraPicker(): void {
  photoError.value = "";
  cameraInput.value?.click();
}

function openQrScanner(): void {
  qrScanError.value = "";
  qrScanInput.value?.click();
}

async function applyWechatQrPaste(): Promise<void> {
  const raw = wechatQrPasteValue.value.trim();
  if (!raw) {
    qrScanError.value = "请先粘贴二维码内容";
    return;
  }
  const roomCode = raw.startsWith("QR-") ? raw.slice(3) : raw;
  qrScanResult.value = roomCode;
  manualRoomCode.value = roomCode;
  wechatQrPasteValue.value = "";
  qrScanError.value = "";

  roomAssetsLoading.value = true;
  roomAssets.value = [];
  roomReferencePhotoUrl.value = null;
  try {
    const [assets, refPhoto] = await Promise.all([
      fetchRoomAssets(roomCode),
      fetchRoomReferencePhoto(roomCode),
    ]);
    roomAssets.value = assets;
    roomReferencePhotoUrl.value = refPhoto;
  } catch {
    // 不阻断签到流程
  } finally {
    roomAssetsLoading.value = false;
  }
}

const geoManual = ref(false);

function getLocation(): void {
  if (!navigator.geolocation) {
    geoError.value = "当前浏览器不支持定位，请手动输入坐标";
    geoManual.value = true;
    return;
  }
  if (!window.isSecureContext) {
    geoError.value = "定位需要 HTTPS 连接，当前页面为 HTTP，Safari 不会弹出授权框。请联系管理员启用 HTTPS，或手动输入坐标。";
    geoManual.value = true;
    return;
  }
  geoLoading.value = true;
  geoError.value = "";
  geoManual.value = false;

  let settled = false;

  const jsTimeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    geoLoading.value = false;
    geoError.value = "定位超时，请检查「设置 › 定位服务」是否已开启后重试，或手动输入坐标";
    geoManual.value = true;
  }, 12000);

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (settled) return;
      settled = true;
      clearTimeout(jsTimeout);
      lat.value = pos.coords.latitude.toFixed(6);
      lng.value = pos.coords.longitude.toFixed(6);
      geoLoading.value = false;
    },
    (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(jsTimeout);
      const msgs: Record<number, string> = {
        1: "定位权限被拒绝，请在「设置 › Safari › 定位」中选择「允许」后重试",
        2: "定位信号不可用，请移至信号较好处后重试",
        3: "定位超时，请重试或手动输入坐标",
      };
      geoError.value = msgs[err.code] ?? `获取定位失败（${err.message}）`;
      geoLoading.value = false;
      geoManual.value = true;
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
  );
}

async function handleQrScanInput(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";
  if (!file) return;

  qrScanBusy.value = true;
  qrScanError.value = "";
  qrScanResult.value = "";

  try {
    let rawValue = "";

    if ("BarcodeDetector" in window) {
      try {
        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as any);
        const barcodes = await detector.detect(bitmap);
        if (barcodes.length > 0) rawValue = barcodes[0].rawValue;
      } catch {
        // fall through to jsQR
      }
    }

    if (!rawValue) {
      const jsQR = (window as any).jsQR;
      if (!jsQR) {
        qrScanError.value = "二维码解析库尚未加载，请刷新页面后重试";
        return;
      }

      // Use imageOrientation to apply EXIF rotation (fixes iOS sideways photos)
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as any);
      } catch {
        bitmap = await createImageBitmap(file);
      }

      // Scale down to max 1024px so jsQR can process large camera photos
      const maxSize = 1024;
      const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("无法创建画布");

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(bitmap, 0, 0, w, h);

      let imageData = ctx.getImageData(0, 0, w, h);
      let result = jsQR(imageData.data, imageData.width, imageData.height);

      // If not found, try 90° clockwise rotation as EXIF fallback
      if (!result) {
        const c2 = document.createElement("canvas");
        c2.width = h;
        c2.height = w;
        const ctx2 = c2.getContext("2d")!;
        ctx2.translate(h / 2, w / 2);
        ctx2.rotate(Math.PI / 2);
        ctx2.drawImage(bitmap, -w / 2, -h / 2, w, h);
        imageData = ctx2.getImageData(0, 0, h, w);
        result = jsQR(imageData.data, imageData.width, imageData.height);
      }

      if (!result) {
        qrScanError.value = "未识别到二维码，请靠近后重新拍摄";
        return;
      }
      rawValue = result.data;
    }

    const roomCode = rawValue.startsWith("QR-") ? rawValue.slice(3) : rawValue;
    qrScanResult.value = roomCode;
    manualRoomCode.value = roomCode;

    roomAssetsLoading.value = true;
    roomAssets.value = [];
    roomReferencePhotoUrl.value = null;
    try {
      const [assets, refPhoto] = await Promise.all([
        fetchRoomAssets(roomCode),
        fetchRoomReferencePhoto(roomCode),
      ]);
      roomAssets.value = assets;
      roomReferencePhotoUrl.value = refPhoto;
    } catch {
      // 资产或参考图加载失败不阻断签到流程
    } finally {
      roomAssetsLoading.value = false;
    }
  } catch (err) {
    qrScanError.value = err instanceof Error ? err.message : "二维码识别失败";
  } finally {
    qrScanBusy.value = false;
  }
}

async function handleCameraInput(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";

  if (!file) {
    return;
  }

  if (capturedPhotos.value.length >= 5) {
    photoError.value = "照片最多 5 张，请先删除一张再继续拍摄。";
    return;
  }

  if (!file.type.startsWith("image/")) {
    photoError.value = "请选择图片文件。";
    return;
  }

  photoBusy.value = true;
  photoError.value = "";

  try {
    await refreshInspectionsForReference();
    const previewDataUrl = await renderWatermarkedPhoto(file);
    const nextIndex = capturedPhotos.value.length;
    const now = new Date();
    const generatedKey = generatePhotoKey(nextIndex);
    const uploaded = await uploadWatermarkedPhoto(previewDataUrl, generatedKey);
    capturedPhotos.value = [
      ...capturedPhotos.value,
      {
        id: `${now.getTime()}-${nextIndex}`,
        key: uploaded.key,
        previewUrl: uploaded.url || previewDataUrl,
        createdAt: now.toISOString()
      }
    ];
    if (checkinMode.value === "manual" && !doorPlatePhotoKey.value) {
      doorPlatePhotoKey.value = uploaded.key;
    }
    photoStatus.value = `已拍摄 ${capturedPhotos.value.length} 张`;
  } catch (error) {
    photoError.value = error instanceof Error ? error.message : "拍照处理失败";
  } finally {
    photoBusy.value = false;
  }
}

function removePhoto(photoId: string): void {
  const target = capturedPhotos.value.find((item) => item.id === photoId);
  capturedPhotos.value = capturedPhotos.value.filter((item) => item.id !== photoId);
  if (target && doorPlatePhotoKey.value === target.key) {
    doorPlatePhotoKey.value = "";
  }
  photoStatus.value = capturedPhotos.value.length ? `已拍摄 ${capturedPhotos.value.length} 张` : "未拍照";
}

function clearPhotos(): void {
  capturedPhotos.value = [];
  photoStatus.value = "未拍照";
  photoError.value = "";
  doorPlatePhotoKey.value = "";
}

function openPhotoPreview(url: string): void {
  previewPhotoUrl.value = url;
}

function closePhotoPreview(): void {
  previewPhotoUrl.value = "";
}

function isStudentRole(role: string): boolean {
  return role === "student";
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

function consumePortalParams(): void {
  const query = new URLSearchParams(window.location.search);
  const tokenFromPortal = (query.get("token") || "").trim();
  const fromPortal = query.get("from") === "portal";

  if (!tokenFromPortal) {
    return;
  }

  if (tokenFromPortal) {
    saveToken(tokenFromPortal);
    loginMessage.value = fromPortal ? "已从统一登录入口接入，正在校验账号..." : "正在校验登录信息...";
  }

  query.delete("token");
  query.delete("backend");
  query.delete("from");
  const clean = query.toString();
  const cleanUrl = `${window.location.pathname}${clean ? `?${clean}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", cleanUrl);
}

async function doLogin(): Promise<void> {
  loading.value = true;
  loginMessage.value = "";
  submitError.value = "";

  try {
    const result = await login(username.value.trim(), password.value);
    if (!isStudentRole(result.user.role)) {
      clearToken();
      currentRole.value = "";
      tasks.value = [];
      selectedAssignmentId.value = null;
      myInspections.value = [];
      loginMessage.value = `当前账号角色为${formatRole(result.user.role)}，请使用弱电巡检管理台登录`;
      return;
    }

    saveToken(result.access_token);
    currentRole.value = result.user.role;
    currentUsername.value = result.user.username;
    loginMessage.value = `登录成功：${result.user.username}`;
    await refreshTasks();
    await refreshInspections();
    startPolling();
    initWxJssdk();
  } catch (error) {
    loginMessage.value = error instanceof Error ? error.message : "登录失败";
  } finally {
    loading.value = false;
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

function startPolling(): void {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (!getToken()) return;
    try {
      await refreshTasks();
    } catch {
      // 静默失败，不影响用户操作
    }
  }, 30000);
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function doLogout(): void {
  clearToken();
  currentRole.value = "";
  currentUsername.value = "";
  tasks.value = [];
  selectedAssignmentId.value = null;
  myInspections.value = [];
  clearPhotos();
  closePhotoPreview();
  qrScanResult.value = "";
  roomAssets.value = [];
  roomReferencePhotoUrl.value = null;
  stopPolling();
  loginMessage.value = "已退出";
}

async function refreshTasks(): Promise<void> {
  try {
    tasks.value = await loadMyTasks();
    if (!selectedAssignmentId.value && tasks.value.length > 0) {
      selectedAssignmentId.value = tasks.value[0].assignment_id;
    }
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : "获取任务失败";
  }
}

function normalizeDateTimeLocal(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString();
}

async function refreshInspections(): Promise<void> {
  try {
    myInspections.value = await loadMyInspections({
      status: inspectionFilterStatus.value.trim() || undefined,
      room_code: inspectionFilterRoomCode.value.trim() || undefined,
      submitted_from: normalizeDateTimeLocal(inspectionFilterFrom.value) || undefined,
      submitted_to: normalizeDateTimeLocal(inspectionFilterTo.value) || undefined
    });
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : "获取记录失败";
  }
}

async function submit(): Promise<void> {
  submitMessage.value = "";
  submitError.value = "";

  if (!canSubmit.value || !selectedAssignmentId.value) {
    submitError.value = "请先完成必填项：签到、检查项、至少 1 张照片";
    return;
  }

  try {
    const result = await submitInspection({
      assignment_id: selectedAssignmentId.value,
      checkin_mode: checkinMode.value,
      checkin_lat: lat.value ? Number(lat.value) : 0,
      checkin_lng: lng.value ? Number(lng.value) : 0,
      manual_room_code: manualRoomCode.value || undefined,
      door_plate_photo_key: doorPlatePhotoKey.value || undefined,
      lock_state: lockState.value,
      clutter_state: clutterState.value,
      indicator_state: indicatorState.value,
      asset_match_state: assetMatchState.value,
      remark_text: remark.value || undefined,
      photo_keys: photoKeys.value
    });
    submitMessage.value = `提交成功，记录 ID: ${result.inspection_id}`;
    await refreshTasks();
    await refreshInspections();
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : "提交失败";
  }
}

onMounted(async () => {
  consumePortalParams();

  if (!getToken()) {
    return;
  }

  loading.value = true;
  loginMessage.value = "";

  try {
    const user = await getMe();
    if (!isStudentRole(user.role)) {
      clearToken();
      currentRole.value = "";
      tasks.value = [];
      selectedAssignmentId.value = null;
      myInspections.value = [];
      loginMessage.value = `当前账号角色为${formatRole(user.role)}，请使用弱电巡检管理台登录`;
      return;
    }

    currentRole.value = user.role;
    currentUsername.value = user.username;
    loginMessage.value = `已恢复登录：${user.username}`;
    await refreshTasks();
    await refreshInspections();
    startPolling();
    initWxJssdk();
  } catch (error) {
    clearToken();
    currentRole.value = "";
    currentUsername.value = "";
    loginMessage.value = error instanceof Error ? error.message : "登录状态失效，请重新登录";
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  stopPolling();
});
</script>

<template>
  <div class="mobile-page">
    <template v-if="!isStudentLoggedIn">
      <div class="login-center">
        <div class="login-card">
          <div class="login-card-brand">
            <p class="login-brand-tag">学生巡检端</p>
            <h1>弱电巡检移动工作台</h1>
            <p class="hint">学生账号登录后可执行任务签到与巡检填报。</p>
          </div>
          <label>账号</label>
          <input v-model="username" placeholder="请输入账号" />
          <label>密码</label>
          <input v-model="password" type="password" placeholder="请输入登录密码" />
          <button class="login-btn" :disabled="loading" @click="doLogin">{{ loading ? "登录中..." : "立即登录" }}</button>
          <p class="error" v-if="loginMessage">{{ loginMessage }}</p>
        </div>
      </div>
    </template>

    <template v-else>
      <header class="m-work-header">
        <h1>弱电巡检移动端</h1>
        <div class="header-right">
          <span class="user-badge">👤 {{ currentUsername }}</span>
          <div class="row">
            <button class="ghost" @click="() => { clearPhotos(); refreshTasks(); }">刷新任务</button>
            <button class="ghost" @click="doLogout">退出</button>
          </div>
        </div>
      </header>

      <section class="card">
        <h2>待巡检任务</h2>
        <input class="task-filter-input" v-model="taskFilterText" placeholder="搜索任务标题 / 楼栋 / 房间" />
        <div class="task-option-scroll" v-if="tasks.length > 0">
          <div class="task-option-grid">
            <button
              class="task-option-card"
              :class="{ active: selectedAssignmentId === task.assignment_id }"
              v-for="task in filteredTasks"
              :key="task.assignment_id"
              @click="selectedAssignmentId = task.assignment_id"
            >
              <strong>{{ task.task_title }}<span v-if="selectedAssignmentId === task.assignment_id" class="current-task-badge">当前</span></strong>
              <span>{{ task.building_code }} / {{ task.room_code }}</span>
              <span class="task-status-badge" :class="statusClass(task.status)">{{ formatStatus(task.status) }}</span>
              <span>截止：{{ new Date(task.due_at).toLocaleString() }}</span>
            </button>
          </div>
        </div>
        <p class="hint" v-if="tasks.length === 0">暂无可用任务，请先用教师账号分配任务。</p>
        <p class="hint" v-if="tasks.length > 0 && filteredTasks.length === 0">无符合条件的任务。</p>
      </section>

      <section class="card">
        <h2>巡检表单</h2>
        <label>签到方式</label>
        <select v-model="checkinMode">
          <option value="qr">扫码签到</option>
          <option value="manual">手动补录</option>
        </select>

        <template v-if="checkinMode === 'qr'">
          <input ref="qrScanInput" class="camera-input" type="file" accept="image/*" capture="environment" @change="handleQrScanInput" />
          <div class="qr-scan-area">
            <button :disabled="qrScanBusy" @click="openQrScanner">
              {{ qrScanBusy ? "识别中..." : "📷 扫描房间二维码" }}
            </button>
            <div class="qr-scanned-badge" v-if="qrScanResult">✅ 已扫描：{{ qrScanResult }}</div>
            <p class="error" v-if="qrScanError">{{ qrScanError }}</p>
            <div class="room-assets-panel" v-if="qrScanResult">
              <p class="room-assets-title">
                {{ roomAssetsLoading ? "正在加载资产台账..." : `本房间资产台账（${roomAssets.length} 项）` }}
              </p>
              <ul class="room-assets-list" v-if="!roomAssetsLoading && roomAssets.length > 0">
                <li v-for="a in roomAssets" :key="a.asset_code" class="room-asset-item">
                  <strong>{{ a.asset_name }}</strong>
                  <span>编码：{{ a.asset_code }}</span>
                  <span>数量：{{ a.quantity }}</span>
                  <span v-if="a.model">型号：{{ a.model }}</span>
                  <span v-if="a.note">备注：{{ a.note }}</span>
                </li>
              </ul>
              <p class="hint" v-if="!roomAssetsLoading && roomAssets.length === 0">该房间暂无资产记录。</p>
            </div>
          </div>
        </template>

        <div class="geo-row">
          <button class="ghost geo-btn" :disabled="geoLoading" @click="getLocation">
            {{ geoLoading ? "定位中..." : "📍 获取当前位置" }}
          </button>
          <span class="geo-value" v-if="lat && lng">{{ lat }}, {{ lng }}</span>
        </div>
        <p class="error" v-if="geoError">{{ geoError }}</p>
        <template v-if="geoManual">
          <label>纬度（手动输入）</label>
          <input v-model="lat" placeholder="如 23.123456" inputmode="decimal" />
          <label>经度（手动输入）</label>
          <input v-model="lng" placeholder="如 113.123456" inputmode="decimal" />
        </template>

        <template v-if="checkinMode === 'manual'">
          <label>手动房间编号</label>
          <input v-model="manualRoomCode" placeholder="dorm-2-R1" />
          <label>门牌照片</label>
          <select v-model="doorPlatePhotoKey">
            <option value="">请选择门牌照片</option>
            <option v-for="photoKey in doorPlatePhotoOptions" :key="photoKey" :value="photoKey">
              {{ photoKey }}
            </option>
          </select>
        </template>

        <label>锁闭状态</label>
        <select v-model="lockState">
          <option value="locked">已锁</option>
          <option value="unlocked">未锁</option>
          <option value="lock_damaged">门锁损坏</option>
        </select>

        <label>环境杂物</label>
        <select v-model="clutterState">
          <option value="none">无杂物</option>
          <option value="stacked_items">有堆放物品</option>
          <option value="water">有积水</option>
          <option value="odor">有异味</option>
        </select>

        <label>设备指示灯</label>
        <select v-model="indicatorState">
          <option value="all_ok">全正常</option>
          <option value="partial_abnormal">个别异常</option>
          <option value="all_abnormal">全部异常</option>
        </select>

        <label>资产核对</label>
        <select v-model="assetMatchState">
          <option value="matched">与台账一致</option>
          <option value="missing">缺失</option>
          <option value="extra">多出</option>
          <option value="moved">位置变动</option>
        </select>

        <label>备注</label>
        <textarea v-model="remark" rows="3" placeholder="可选" />

        <p class="hint">当前照片数：{{ photoKeys.length }}（要求 1-5）</p>

        <button :disabled="!canSubmit" @click="submit">提交巡检</button>
        <p class="hint" v-if="submitMessage">{{ submitMessage }}</p>
        <p class="error" v-if="submitError">{{ submitError }}</p>
      </section>

      <section class="card camera-card">
        <h2>照片采集</h2>
        <p class="hint">请对准房间同一角度拍摄，系统将自动以历史参考图为底层叠加，便于 AI 比对异常。</p>

        <div class="ref-photo-panel" v-if="roomReferencePhotoUrl">
          <p class="ref-photo-label">📷 历史参考图（请对准此角度拍摄）</p>
          <img :src="roomReferencePhotoUrl" class="ref-photo-img" alt="历史参考照片" @click="openPhotoPreview(roomReferencePhotoUrl)" />
        </div>
        <input
          ref="cameraInput"
          class="camera-input"
          type="file"
          accept="image/*"
          capture="environment"
          @change="handleCameraInput"
        />

        <div class="photo-toolbar">
          <button :disabled="photoBusy" @click="openCameraPicker">{{ photoBusy ? "处理中..." : "拍照" }}</button>
          <button class="ghost" :disabled="capturedPhotos.length === 0" @click="clearPhotos">清空照片</button>
          <span class="hint">{{ photoStatus }}</span>
        </div>

        <p class="error" v-if="photoError">{{ photoError }}</p>

        <div class="photo-stage" v-if="capturedPhotos.length > 0">
          <div class="photo-stage-frame">
            <img class="photo-stage-image" :src="capturedPhotos[capturedPhotos.length - 1].previewUrl" alt="最新拍摄照片" />
            <div class="photo-stage-reference" v-if="capturedPhotos.length > 1">
              <img :src="capturedPhotos[capturedPhotos.length - 2].previewUrl" alt="上一张参考照片" />
            </div>
            <div class="photo-stage-label">
              <span>时间水印已写入</span>
              <span>弱电巡检 · {{ currentUsername || username }}</span>
            </div>
          </div>
        </div>

        <div class="photo-grid" v-if="capturedPhotos.length > 0">
          <article class="photo-item" v-for="(photo, index) in capturedPhotos" :key="photo.id">
            <img :src="photo.previewUrl" :alt="`照片 ${index + 1}`" @click="openPhotoPreview(photo.previewUrl)" />
            <div class="photo-item-meta">
              <strong>第 {{ index + 1 }} 张</strong>
              <span>{{ new Date(photo.createdAt).toLocaleString() }}</span>
            </div>
            <button class="ghost photo-item-remove" @click="removePhoto(photo.id)">删除</button>
          </article>
        </div>
      </section>

      <section class="card">
        <h2>我的巡检记录</h2>
        <label>状态筛选</label>
        <select v-model="inspectionFilterStatus">
          <option value="">全部状态</option>
          <option value="pending_review">待审核</option>
          <option value="approved">已通过</option>
          <option value="rejected">已驳回</option>
          <option value="rectify_required">需整改</option>
        </select>
        <label>弱电间编号</label>
        <input v-model="inspectionFilterRoomCode" placeholder="如 dorm-2-R1" />
        <label>开始时间</label>
        <input v-model="inspectionFilterFrom" type="datetime-local" />
        <label>结束时间</label>
        <input v-model="inspectionFilterTo" type="datetime-local" />
        <div class="row">
          <button class="ghost" @click="refreshInspections">按条件筛选</button>
          <button
            class="ghost"
            @click="
              inspectionFilterStatus = '';
              inspectionFilterRoomCode = '';
              inspectionFilterFrom = '';
              inspectionFilterTo = '';
              refreshInspections();
            "
          >
            清空筛选
          </button>
        </div>
        <ul class="list">
          <li v-for="item in myInspections" :key="item.inspection_id">
            <strong>ID {{ item.inspection_id }}</strong>
            <span>{{ item.building_code }} / {{ item.room_code }}</span>
            <div class="insp-meta-row">
              <span class="insp-status-badge" :class="statusClass(item.status)">{{ formatStatus(item.status) }}</span>
              <span>照片：{{ item.photo_count }}</span>
            </div>
            <div class="history-photo-grid" v-if="item.photo_urls.length > 0">
              <img
                v-for="photoUrl in item.photo_urls"
                :key="photoUrl"
                :src="photoUrl"
                alt="巡检历史照片"
                @click="openPhotoPreview(photoUrl)"
              />
            </div>
          </li>
        </ul>
        <p class="hint" v-if="myInspections.length === 0">暂无巡检记录</p>
      </section>

      <div class="photo-lightbox" v-if="previewPhotoUrl" @click.self="closePhotoPreview">
        <button class="photo-lightbox-close" @click="closePhotoPreview">关闭</button>
        <img :src="previewPhotoUrl" alt="照片预览" />
      </div>
    </template>
  </div>
</template>

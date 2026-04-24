<script setup lang="ts">
// 文件说明：该页面是移动端核心交互页面，按中文注释规范维护。
import { computed, onMounted, ref } from "vue";

import {
  clearToken,
  getMe,
  getToken,
  loadMyInspections,
  loadMyTasks,
  login,
  saveToken,
  submitInspection,
  uploadInspectionPhoto,
  type MyInspectionItem,
  type TaskItem
} from "./api";

const username = ref("student_f01");
const password = ref("Student@123");
const loginMessage = ref("");
const loading = ref(false);
const currentRole = ref("");
const currentUsername = ref("");

const tasks = ref<TaskItem[]>([]);
const selectedAssignmentId = ref<number | null>(null);

const checkinMode = ref<"qr" | "manual">("qr");
const lat = ref("23.123456");
const lng = ref("113.123456");
const manualRoomCode = ref("");
const doorPlatePhotoKey = ref("");

const lockState = ref<"locked" | "unlocked" | "lock_damaged">("locked");
const clutterState = ref<"none" | "stacked_items" | "water" | "odor">("none");
const indicatorState = ref<"all_ok" | "partial_abnormal" | "all_abnormal">("all_ok");
const assetMatchState = ref<"matched" | "missing" | "extra" | "moved">("matched");
const remark = ref("");

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
const hasBarcodeDetector = "BarcodeDetector" in window;

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

const canSubmit = computed(() => {
  if (!selectedAssignmentId.value) {
    return false;
  }

  if (!lat.value.trim() || !lng.value.trim()) {
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
  // 严格仅使用后端历史已提交巡检记录中的最新照片。
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
    context.fillStyle = "rgba(255, 255, 255, 0.96)";
    context.font = `${Math.max(18, Math.round(canvas.width * 0.022))}px "Noto Sans SC", sans-serif`;
    context.textBaseline = "top";
    context.fillText(`时间：${formatWatermarkTime(now)}`, 18, canvas.height - watermarkHeight + 14);
    context.fillText(`地点：弱电巡检`, 18, canvas.height - watermarkHeight + 42);
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

async function handleQrScanInput(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";
  if (!file) return;

  qrScanBusy.value = true;
  qrScanError.value = "";
  qrScanResult.value = "";

  try {
    const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
    const bitmap = await createImageBitmap(file);
    const barcodes = await detector.detect(bitmap);
    if (barcodes.length === 0) {
      qrScanError.value = "未识别到二维码，请重新拍摄";
      return;
    }
    const rawValue: string = barcodes[0].rawValue;
    const roomCode = rawValue.startsWith("QR-") ? rawValue.slice(3) : rawValue;
    qrScanResult.value = roomCode;
    manualRoomCode.value = roomCode;
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
  } catch (error) {
    loginMessage.value = error instanceof Error ? error.message : "登录失败";
  } finally {
    loading.value = false;
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
      checkin_lat: Number(lat.value),
      checkin_lng: Number(lng.value),
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
  } catch (error) {
    clearToken();
    currentRole.value = "";
    currentUsername.value = "";
    loginMessage.value = error instanceof Error ? error.message : "登录状态失效，请重新登录";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="mobile-page">
    <template v-if="!isStudentLoggedIn">
      <section class="m-login-shell">
        <div class="m-login-hero">
          <p class="m-login-tag">Student Inspector</p>
          <h1>弱电巡检移动工作台</h1>
          <p>使用学生账号登录后，可执行任务签到、巡检填报、照片上传和记录查询。</p>
          <ul class="m-login-points">
            <li>统一入口自动识别身份</li>
            <li>支持扫码与手动补录签到</li>
            <li>巡检记录实时回写审核流</li>
          </ul>
        </div>

        <section class="card m-login-card">
          <h2>账号登录</h2>
          <p class="hint">移动端仅允许学生账号登录。</p>

          <label>账号</label>
          <input v-model="username" placeholder="student_f01" />
          <label>密码</label>
          <input v-model="password" type="password" placeholder="请输入登录密码" />

          <div class="row m-login-actions">
            <button class="m-primary-btn" :disabled="loading" @click="doLogin">{{ loading ? "登录中..." : "立即登录" }}</button>
          </div>
          <p class="hint" v-if="loginMessage">{{ loginMessage }}</p>
        </section>
      </section>
    </template>

    <template v-else>
      <header class="m-work-header">
        <div>
          <h1>弱电巡检移动端</h1>
          <p class="hint">登录成功后可执行任务巡检与记录查询。</p>
        </div>
        <div class="row">
          <button class="ghost" @click="refreshTasks">刷新任务</button>
          <button class="ghost" @click="doLogout">退出</button>
        </div>
      </header>

      <section class="card">
        <h2>待巡检任务</h2>
        <p class="hint">点击任务卡片即可选中，不再强制使用纵向下拉列表。</p>
        <div class="task-option-grid" v-if="tasks.length > 0">
          <button
            class="task-option-card"
            :class="{ active: selectedAssignmentId === task.assignment_id }"
            v-for="task in tasks"
            :key="task.assignment_id"
            @click="selectedAssignmentId = task.assignment_id"
          >
            <strong>{{ task.task_title }}</strong>
            <span>{{ task.building_code }} / {{ task.room_code }}</span>
            <span class="task-status-badge" :class="statusClass(task.status)">{{ formatStatus(task.status) }}</span>
            <span>截止：{{ new Date(task.due_at).toLocaleString() }}</span>
          </button>
        </div>
        <p class="hint" v-if="tasks.length === 0">暂无可用任务，请先用教师账号分配任务。</p>
      </section>

      <section class="card camera-card">
        <h2>照片采集</h2>
        <p class="hint">点击拍照后会调用摄像头；新照片会自动叠加上一张照片作为参考层，并写入时间、弱电巡检、学生名称水印。</p>
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
        <h2>巡检表单</h2>
        <label>签到方式</label>
        <select v-model="checkinMode">
          <option value="qr">扫码签到</option>
          <option value="manual">手动补录</option>
        </select>

        <template v-if="checkinMode === 'qr'">
          <input ref="qrScanInput" class="camera-input" type="file" accept="image/*" capture="camera" @change="handleQrScanInput" />
          <div class="qr-scan-area">
            <template v-if="hasBarcodeDetector">
              <button :disabled="qrScanBusy" @click="openQrScanner">
                {{ qrScanBusy ? "识别中..." : "📷 扫描房间二维码" }}
              </button>
              <div class="qr-scanned-badge" v-if="qrScanResult">✅ 已扫描：{{ qrScanResult }}</div>
              <p class="error" v-if="qrScanError">{{ qrScanError }}</p>
            </template>
            <template v-else>
              <p class="hint qr-fallback-hint">当前浏览器不支持自动识别，请切换为"手动补录"方式。</p>
            </template>
          </div>
        </template>

        <label>定位纬度</label>
        <input v-model="lat" placeholder="23.123456" />
        <label>定位经度</label>
        <input v-model="lng" placeholder="113.123456" />

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

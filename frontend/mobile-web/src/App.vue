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
  type TaskItem
} from "./api";

const username = ref("student_f01");
const password = ref("Student@123");
const loginMessage = ref("");
const loading = ref(false);
const currentRole = ref("");

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
const photoKeysText = ref("photo-1.jpg");

const submitMessage = ref("");
const submitError = ref("");
const myInspections = ref<any[]>([]);

const photoKeys = computed(() =>
  photoKeysText.value
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => Boolean(item))
);

const isStudentLoggedIn = computed(() => currentRole.value === "student" && Boolean(getToken()));

const canSubmit = computed(() => {
  if (!selectedAssignmentId.value) {
    return false;
  }

  if (!lat.value.trim() || !lng.value.trim()) {
    return false;
  }

  if (checkinMode.value === "manual") {
    if (!manualRoomCode.value.trim() || !doorPlatePhotoKey.value.trim()) {
      return false;
    }
  }

  const count = photoKeys.value.length;
  return count >= 1 && count <= 5;
});

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
  tasks.value = [];
  selectedAssignmentId.value = null;
  myInspections.value = [];
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

async function refreshInspections(): Promise<void> {
  try {
    myInspections.value = await loadMyInspections();
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
    loginMessage.value = `已恢复登录：${user.username}`;
    await refreshTasks();
    await refreshInspections();
  } catch (error) {
    clearToken();
    currentRole.value = "";
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
            <span>状态：{{ task.status }}</span>
            <span>截止：{{ new Date(task.due_at).toLocaleString() }}</span>
          </button>
        </div>
        <p class="hint" v-if="tasks.length === 0">暂无可用任务，请先用教师账号分配任务。</p>
      </section>

      <section class="card">
        <h2>巡检表单</h2>
        <label>签到方式</label>
        <select v-model="checkinMode">
          <option value="qr">扫码签到</option>
          <option value="manual">手动补录</option>
        </select>

        <label>定位纬度</label>
        <input v-model="lat" placeholder="23.123456" />
        <label>定位经度</label>
        <input v-model="lng" placeholder="113.123456" />

        <template v-if="checkinMode === 'manual'">
          <label>手动房间编号</label>
          <input v-model="manualRoomCode" placeholder="dorm-2-R1" />
          <label>门牌照片 Key</label>
          <input v-model="doorPlatePhotoKey" placeholder="door-plate-1.jpg" />
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

        <label>照片 Key（每行一条，1-5 张）</label>
        <textarea v-model="photoKeysText" rows="5" placeholder="photo-1.jpg" />
        <p class="hint">当前照片数：{{ photoKeys.length }}（要求 1-5）</p>

        <button :disabled="!canSubmit" @click="submit">提交巡检</button>
        <p class="hint" v-if="submitMessage">{{ submitMessage }}</p>
        <p class="error" v-if="submitError">{{ submitError }}</p>
      </section>

      <section class="card">
        <h2>我的巡检记录</h2>
        <button class="ghost" @click="refreshInspections">刷新记录</button>
        <ul class="list">
          <li v-for="item in myInspections" :key="item.inspection_id">
            <strong>ID {{ item.inspection_id }}</strong>
            <span>{{ item.building_code }} / {{ item.room_code }}</span>
            <span>状态：{{ item.status }}，照片：{{ item.photo_count }}</span>
          </li>
        </ul>
        <p class="hint" v-if="myInspections.length === 0">暂无巡检记录</p>
      </section>
    </template>
  </div>
</template>

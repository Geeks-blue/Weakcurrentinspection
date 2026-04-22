<script setup lang="ts">
// 文件说明：该页面是管理端核心交互页面，按中文注释规范维护。
import { computed, onMounted, ref } from "vue";

import { callAiGateway } from "./api/ai";
import {
  clearAccessToken,
  createTaskAssignment,
  getAccessToken,
  getBackendBaseUrl,
  getConsoleInspections,
  getMe,
  getMobileWebUrl,
  getPendingReviewInspections,
  getTaskDispatchOptions,
  login,
  registerUser,
  reviewInspection,
  setAccessToken
} from "./api/backend";
import { loadAiConfig, saveAiConfig } from "./storage";
import type {
  ConsoleInspectionItem,
  DispatchRoomOption,
  DispatchStudentOption,
  PendingReviewInspectionItem,
  ReviewAction,
  UserProfile,
  UserRole
} from "./types";

type ConsolePage = "workspace" | "settings";
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

const isLoggedIn = computed(() => Boolean(currentUser.value) && Boolean(getAccessToken()));
const isReviewer = computed(() => currentUser.value?.role === "teacher" || currentUser.value?.role === "admin");
const isAdmin = computed(() => currentUser.value?.role === "admin");
const userStatusText = computed(() => {
  if (!currentUser.value || !isLoggedIn.value) {
    return "未登录";
  }
  return `已登录：${currentUser.value.username}（${formatRole(currentUser.value.role)}）`;
});

function buildDefaultDueAt(): string {
  // 将默认截止时间设置为当前时间 +24 小时，并转换为 datetime-local 可直接绑定格式。
  const due = new Date(Date.now() + 24 * 60 * 60 * 1000);
  due.setSeconds(0, 0);
  const timezoneOffsetMs = due.getTimezoneOffset() * 60 * 1000;
  const local = new Date(due.getTime() - timezoneOffsetMs);
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
    await Promise.all([loadPendingReviews(), loadDispatchOptions()]);
    await loadConsoleInspections();
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
  reviewMessage.value = "";
  dispatchMessage.value = "";
  dispatchError.value = "";
  registerMessage.value = "";
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
    consoleInspections.value = await getConsoleInspections();
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
    await loadPendingReviews();
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

    await Promise.all([loadPendingReviews(), loadDispatchOptions(), loadConsoleInspections()]);
    switchConsolePage(resolvePageFromHash());
  } catch {
    clearAccessToken();
    currentUser.value = null;
    setViewHash("login");
  }
});
</script>

<template>
  <div class="page">
    <header class="hero" v-if="isLoggedIn">
      <h1>弱电巡检管理台</h1>
      <p>统一登录后按角色自动分流，支持管理员注册、教师派单和巡检审核。</p>
    </header>

    <template v-if="!isLoggedIn">
      <section class="login-shell">
        <div class="login-brand-panel">
          <p class="login-brand-tag">Campus Infra Console</p>
          <h1>弱电巡检统一登录入口</h1>
          <p>
            面向校园弱电巡检与资产核验场景，支持按角色自动分流：学生进入移动巡检端，教师/管理员进入管理控制台。
          </p>
          <ul class="login-brand-list">
            <li>统一身份认证</li>
            <li>教师派单与审核闭环</li>
            <li>管理员账号治理与权限隔离</li>
          </ul>
        </div>

        <section class="panel login-only-panel login-card-panel">
          <h2>账号登录</h2>
          <p class="hint">请输入账号和密码登录系统。</p>
          <p class="hint">后端与移动端地址已由配置文件统一托管。</p>
          <div class="grid login-form-grid">
            <div class="row">
              <label for="username">账号</label>
              <input id="username" v-model="username" placeholder="student_f01 / teacher01 / admin" />
            </div>
            <div class="row">
              <label for="password">密码</label>
              <input id="password" v-model="password" type="password" placeholder="请输入登录密码" />
            </div>
          </div>
          <div class="actions login-actions">
            <button class="login-submit-btn" :disabled="authLoading" @click="handleLogin">
              {{ authLoading ? "登录中..." : "立即登录" }}
            </button>
          </div>
          <p class="hint" v-if="authMessage">{{ authMessage }}</p>
        </section>
      </section>
    </template>

    <template v-else>
      <nav class="view-switch">
        <button class="ghost tab-btn" :class="{ active: activePage === 'workspace' }" @click="switchConsolePage('workspace')">
          业务面板
        </button>
        <button class="ghost tab-btn" :class="{ active: activePage === 'settings' }" @click="switchConsolePage('settings')">
          系统设置
        </button>
        <button class="ghost" @click="handleLogout">退出登录</button>
        <span class="status-pill" :class="{ online: isLoggedIn }">{{ userStatusText }}</span>
      </nav>

      <template v-if="activePage === 'settings'">
        <section class="panel two-col">
          <div>
            <h2>固定地址配置</h2>
            <p class="hint">地址改由配置文件维护，避免在前端页面直接编辑。</p>
            <div class="row">
              <label>后端地址</label>
              <input :value="getBackendBaseUrl()" readonly />
            </div>
            <div class="row">
              <label>移动端地址</label>
              <input :value="getMobileWebUrl()" readonly />
            </div>
          </div>

          <div>
            <h2>当前会话</h2>
            <p class="hint">当前登录账号：{{ currentUser?.username }}（{{ formatRole(currentUser?.role || "") }}）</p>
            <p class="hint">如需切换账号，请先退出后重新登录。</p>
            <div class="actions">
              <button class="ghost" @click="handleLogout">退出登录</button>
            </div>
          </div>
        </section>

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
        <section class="panel" v-if="isReviewer">
          <h2>管理台角色验证</h2>
          <p class="hint">当前账号已通过角色校验，可访问教师/管理员巡检功能。</p>
        </section>

        <section class="panel" v-if="isAdmin">
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

        <section class="panel" v-if="isReviewer">
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

        <section class="panel" v-if="isReviewer">
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

        <section class="panel" v-if="isReviewer">
          <h2>巡检记录总览（控制台）</h2>
          <div class="actions">
            <button class="ghost" :disabled="consoleLoading" @click="loadConsoleInspections">
              {{ consoleLoading ? "加载中..." : "刷新巡检记录" }}
            </button>
          </div>
          <p class="error" v-if="consoleError">{{ consoleError }}</p>

          <ul class="task-list" v-if="consoleInspections.length > 0">
            <li v-for="item in consoleInspections" :key="item.inspection_id">
              <strong>ID {{ item.inspection_id }} / {{ item.student_username }}</strong>
              <span>{{ item.building_code }} / {{ item.room_code }}</span>
              <span>提交时间: {{ new Date(item.submitted_at).toLocaleString() }}</span>
              <span v-if="item.reviewed_at">审核时间: {{ new Date(item.reviewed_at).toLocaleString() }}</span>
              <span>状态: {{ item.status }}，照片: {{ item.photo_count }}</span>
            </li>
          </ul>
          <p class="hint" v-else>暂无巡检记录。</p>
        </section>
      </template>
    </template>
  </div>
</template>

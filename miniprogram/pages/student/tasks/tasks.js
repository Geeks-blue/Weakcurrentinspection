// pages/student/tasks/tasks.js
const api = require("../../../utils/api");
const fmt = require("../../../utils/format");

Page({
  data: {
    tasks: [],
    loading: false,
    error: "",
    username: "",
    filterText: "",
    filteredTasks: [],
  },

  onLoad() {
    const app = getApp();
    if (!app.globalData.token) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    const user = app.globalData.user || {};
    this.setData({ username: user.username || "" });
  },

  onShow() {
    if (!getApp().globalData.token) return;
    this.loadTasks(this.data.tasks.length > 0);
    this._startAutoRefresh();
  },

  onHide() {
    this._stopAutoRefresh();
  },

  onUnload() {
    this._stopAutoRefresh();
  },

  async onPullDownRefresh() {
    await this.loadTasks(false);
    wx.stopPullDownRefresh();
  },

  _startAutoRefresh() {
    this._stopAutoRefresh();
    const that = this;
    this._refreshTimer = setInterval(function () {
      that.loadTasks(true);
    }, 10000);
  },

  _stopAutoRefresh() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  },

  async loadTasks(silent) {
    if (this._loadingTasks) return;
    this._loadingTasks = true;
    if (!silent) {
      this.setData({ loading: true, error: "" });
    } else {
      this.setData({ error: "" });
    }
    try {
      const tasks = await api.getMyTasks();
      const enriched = [];
      for (let i = 0; i < tasks.length; i += 1) {
        const t = tasks[i];
        enriched.push({
          assignment_id: t.assignment_id,
          task_title: t.task_title,
          building_code: t.building_code,
          building_name: t.building_name,
          room_code: t.room_code,
          room_name: t.room_name || t.location_text || "",
          floor_label: t.floor_label,
          location_text: t.location_text,
          due_at: t.due_at,
          status: t.status,
          statusLabel: fmt.formatStatus(t.status),
          statusClass: fmt.statusClass(t.status),
          dueDateShort: fmt.formatDateShort(t.due_at),
        });
      }
      this.setData({ tasks: enriched });
      this._applyFilter();
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      if (!silent) {
        this.setData({ loading: false });
      }
      this._loadingTasks = false;
    }
  },

  onFilterInput(e) {
    this.setData({ filterText: e.detail.value });
    this._applyFilter();
  },

  _applyFilter() {
    const q = this.data.filterText.trim().toLowerCase();
    const all = this.data.tasks;
    const filtered = [];
    if (!q) {
      this.setData({ filteredTasks: all });
      return;
    }
    for (let i = 0; i < all.length; i += 1) {
      const t = all[i];
      const title = String(t.task_title || "").toLowerCase();
      const room = String(t.room_code || "").toLowerCase();
      const building = String(t.building_name || "").toLowerCase();
      if (
        title.indexOf(q) !== -1 ||
        room.indexOf(q) !== -1 ||
        building.indexOf(q) !== -1
      ) {
        filtered.push(t);
      }
    }
    this.setData({ filteredTasks: filtered });
  },

  onTaskTap(e) {
    const id = Number(e.currentTarget.dataset.id);
    let task = null;
    for (let i = 0; i < this.data.tasks.length; i += 1) {
      if (this.data.tasks[i].assignment_id === id) {
        task = this.data.tasks[i];
        break;
      }
    }
    if (!task) {
      wx.showToast({ title: "任务不存在，请刷新", icon: "none" });
      return;
    }
    if (task.status === "done" || task.status === "approved") {
      wx.showToast({ title: "该任务已完成", icon: "none" });
      return;
    }
    const params = [
      "assignmentId=" + encodeURIComponent(task.assignment_id),
      "roomCode=" + encodeURIComponent(task.room_code || ""),
      "buildingName=" +
        encodeURIComponent(task.building_name || task.building_code || ""),
      "roomName=" +
        encodeURIComponent(task.room_name || task.location_text || ""),
      "taskTitle=" + encodeURIComponent(task.task_title || ""),
      "floor=" + encodeURIComponent(task.floor_label || ""),
      "location=" + encodeURIComponent(task.location_text || ""),
    ].join("&");
    wx.navigateTo({
      url: "/pages/student/inspect/inspect?" + params,
    });
  },

  onLogout() {
    wx.showModal({
      title: "退出登录",
      content: "确定退出吗？",
      success(res) {
        if (res.confirm) {
          getApp().clearAuth();
          wx.redirectTo({ url: "/pages/login/login" });
        }
      },
    });
  },
});

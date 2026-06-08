// pages/student/tasks/tasks.js
const api = require('../../../utils/api');
const fmt = require('../../../utils/format');

Page({
  data: {
    tasks: [],
    loading: false,
    error: '',
    username: '',
    filterText: '',
    filteredTasks: [],
  },

  onLoad() {
    const app = getApp();
    if (!app.globalData.token) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    const user = app.globalData.user || {};
    this.setData({ username: user.username || '' });
    this.loadTasks();
  },

  onShow() { this.loadTasks(); },

  async loadTasks() {
    this.setData({ loading: true, error: '' });
    try {
      const tasks = await api.getMyTasks();
      const enriched = tasks.map(t => ({
        ...t,
        statusLabel: fmt.formatStatus(t.status),
        statusClass: fmt.statusClass(t.status),
        dueDateShort: fmt.formatDateShort(t.due_at),
      }));
      this.setData({ tasks: enriched });
      this._applyFilter();
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  onFilterInput(e) {
    this.setData({ filterText: e.detail.value });
    this._applyFilter();
  },

  _applyFilter() {
    const q = this.data.filterText.trim().toLowerCase();
    const all = this.data.tasks;
    const filtered = q
      ? all.filter(t =>
          t.task_title.toLowerCase().includes(q) ||
          t.room_code.toLowerCase().includes(q) ||
          (t.building_name || '').toLowerCase().includes(q)
        )
      : all;
    this.setData({ filteredTasks: filtered });
  },

  onTaskTap(e) {
    const id = Number(e.currentTarget.dataset.id);
    const task = this.data.tasks.find(t => t.assignment_id === id);
    if (!task) {
      wx.showToast({ title: '任务不存在，请刷新', icon: 'none' });
      return;
    }
    if (task.status === 'done' || task.status === 'approved') {
      wx.showToast({ title: '该任务已完成', icon: 'none' });
      return;
    }
    const params = [
      `assignmentId=${encodeURIComponent(task.assignment_id)}`,
      `roomCode=${encodeURIComponent(task.room_code || '')}`,
      `buildingName=${encodeURIComponent(task.building_name || task.building_code || '')}`,
      `taskTitle=${encodeURIComponent(task.task_title || '')}`,
      `floor=${encodeURIComponent(task.floor_label || '')}`,
      `location=${encodeURIComponent(task.location_text || '')}`,
    ].join('&');
    wx.navigateTo({
      url: `/pages/student/inspect/inspect?${params}`
    });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出吗？',
      success(res) {
        if (res.confirm) {
          getApp().clearAuth();
          wx.redirectTo({ url: '/pages/login/login' });
        }
      }
    });
  },

  goHistory() { wx.navigateTo({ url: '/pages/student/history/history' }); }
});

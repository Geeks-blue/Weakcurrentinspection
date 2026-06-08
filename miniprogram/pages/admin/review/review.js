// pages/admin/review/review.js
const api = require('../../../utils/api');
const fmt = require('../../../utils/format');

Page({
  data: {
    items: [],
    loading: false,
    error: '',
    username: '',
    expanded: {},   // inspection_id → bool
    reviewing: {},  // inspection_id → bool
  },

  onLoad() {
    const app = getApp();
    if (!app.globalData.token || !app.isAdmin()) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    this.setData({ username: app.globalData.user?.username || '' });
    this.load();
  },

  onShow() { this.load(); },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const data = await api.getPendingReview();
      this.setData({
        items: data.map(r => ({
          ...r,
          statusLabel: fmt.formatStatus(r.status),
          statusClass: fmt.statusClass(r.status),
          dateStr: fmt.formatDate(r.submitted_at),
          lockLabel: fmt.formatLock(r.lock_state),
          clutterLabel: fmt.formatClutter(r.clutter_state),
          indicatorLabel: fmt.formatIndicator(r.indicator_state),
          assetLabel: fmt.formatAssetMatch(r.asset_match_state),
        }))
      });
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  toggleExpand(e) {
    const id = e.currentTarget.dataset.id;
    const expanded = { ...this.data.expanded, [id]: !this.data.expanded[id] };
    this.setData({ expanded });
  },

  onPreviewPhoto(e) {
    const { urls, current } = e.currentTarget.dataset;
    wx.previewImage({ urls, current });
  },

  async onApprove(e) {
    const id = e.currentTarget.dataset.id;
    await this._review(id, 'approved', '');
  },

  async onReject(e) {
    const id = e.currentTarget.dataset.id;
    const { value: reason } = await new Promise(resolve =>
      wx.showModal({
        title: '驳回原因',
        editable: true,
        placeholderText: '请填写驳回原因',
        success: r => resolve({ value: r.content || '' }),
        fail: () => resolve({ value: null })
      })
    );
    if (reason === null) return;
    await this._review(id, 'rejected', reason);
  },

  async onRectify(e) {
    const id = e.currentTarget.dataset.id;
    await this._review(id, 'rectify_required', '需整改');
  },

  async _review(id, action, reason) {
    this.setData({ reviewing: { ...this.data.reviewing, [id]: true } });
    try {
      await api.reviewInspection(id, action, reason);
      wx.showToast({ title: '审核完成', icon: 'success' });
      this.load();
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    } finally {
      this.setData({ reviewing: { ...this.data.reviewing, [id]: false } });
    }
  },

  onLogout() {
    wx.showModal({
      title: '退出', content: '确定退出吗？',
      success(r) {
        if (r.confirm) { getApp().clearAuth(); wx.redirectTo({ url: '/pages/login/login' }); }
      }
    });
  },

  goRecords() { wx.navigateTo({ url: '/pages/admin/records/records' }); },
  goDispatch() { wx.navigateTo({ url: '/pages/admin/dispatch/dispatch' }); },
});

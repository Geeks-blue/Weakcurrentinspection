// pages/student/history/history.js
const api = require('../../../utils/api');
const fmt = require('../../../utils/format');

Page({
  data: {
    records: [],
    loading: false,
    error: '',
  },

  onLoad() {
    if (!getApp().globalData.token) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    this.loadRecords();
  },

  async loadRecords() {
    this.setData({ loading: true, error: '' });
    try {
      const data = await api.getMyInspections();
      this.setData({
        records: data.map(r => ({
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

  onPreviewPhoto(e) {
    const { urls, current } = e.currentTarget.dataset;
    wx.previewImage({ urls, current });
  },

  goTasks() { wx.navigateBack(); }
});

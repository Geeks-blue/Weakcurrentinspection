// pages/admin/records/records.js
const api = require('../../../utils/api');
const fmt = require('../../../utils/format');

Page({
  data: {
    records: [],
    loading: false,
    error: '',
    filterStatus: '',
    filterRoom: '',
    filterStudent: '',
    statusOptions: [
      { label: '全部', value: '' },
      { label: '待审核', value: 'pending_review' },
      { label: '已通过', value: 'approved' },
      { label: '驳回', value: 'rejected' },
      { label: '需整改', value: 'rectify_required' },
    ],
    expanded: {},
  },

  onLoad() {
    if (!getApp().isAdmin()) {
      wx.redirectTo({ url: '/pages/login/login' }); return;
    }
    this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const data = await api.getConsoleRecords({
        status: this.data.filterStatus || undefined,
        room_code: this.data.filterRoom || undefined,
        student_username: this.data.filterStudent || undefined,
        limit: 60,
      });
      this.setData({
        records: data.map(r => ({
          ...r,
          photo_urls: r.photo_urls || [],
          statusLabel: fmt.formatStatus(r.status),
          statusClass: fmt.statusClass(r.status),
          dateStr: fmt.formatDateShort(r.submitted_at),
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

  onFilterStatusChange(e) {
    this.setData({ filterStatus: this.data.statusOptions[e.detail.value].value });
    this.load();
  },
  onFilterRoomInput(e) { this.setData({ filterRoom: e.detail.value }); },
  onFilterStudentInput(e) { this.setData({ filterStudent: e.detail.value }); },
  onSearch() { this.load(); },

  toggleExpand(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ expanded: { ...this.data.expanded, [id]: !this.data.expanded[id] } });
  },

  onPreviewPhoto(e) {
    wx.previewImage({ urls: e.currentTarget.dataset.urls, current: e.currentTarget.dataset.current });
  },

  goBack() { wx.navigateBack(); },
  goDispatch() { wx.navigateTo({ url: '/pages/admin/dispatch/dispatch' }); }
});

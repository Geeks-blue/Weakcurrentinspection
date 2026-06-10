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
      const records = [];
      for (let i = 0; i < data.length; i += 1) {
        const r = data[i];
        records.push({
          inspection_id: r.inspection_id,
          assignment_id: r.assignment_id,
          student_username: r.student_username,
          building_code: r.building_code,
          building_name: r.building_name,
          room_code: r.room_code,
          submitted_at: r.submitted_at,
          status: r.status,
          checkin_mode: r.checkin_mode,
          manual_room_code: r.manual_room_code,
          lock_state: r.lock_state,
          clutter_state: r.clutter_state,
          indicator_state: r.indicator_state,
          asset_match_state: r.asset_match_state,
          remark_text: r.remark_text,
          photo_urls: r.photo_urls || [],
          hasPhotos: !!(r.photo_urls && r.photo_urls.length),
          statusLabel: fmt.formatStatus(r.status),
          statusClass: fmt.statusClass(r.status),
          dateStr: fmt.formatDateShort(r.submitted_at),
          lockLabel: fmt.formatLock(r.lock_state),
          clutterLabel: fmt.formatClutter(r.clutter_state),
          indicatorLabel: fmt.formatIndicator(r.indicator_state),
          assetLabel: fmt.formatAssetMatch(r.asset_match_state),
        });
      }
      this.setData({ records: records });
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
    const expanded = {};
    const current = this.data.expanded;
    for (const key in current) {
      if (Object.prototype.hasOwnProperty.call(current, key)) {
        expanded[key] = current[key];
      }
    }
    expanded[id] = !this.data.expanded[id];
    this.setData({ expanded: expanded });
  },

  onPreviewPhoto(e) {
    const id = Number(e.currentTarget.dataset.id);
    const urls = this.findPhotoUrls(id);
    wx.previewImage({ urls: urls, current: e.currentTarget.dataset.current });
  },

  findPhotoUrls(id) {
    for (let i = 0; i < this.data.records.length; i += 1) {
      if (this.data.records[i].inspection_id === id) {
        return this.data.records[i].photo_urls || [];
      }
    }
    return [];
  },
});

// pages/student/history/history.js
const api = require("../../../utils/api");
const fmt = require("../../../utils/format");

Page({
  data: {
    records: [],
    loading: false,
    error: "",
  },

  onLoad() {
    if (!getApp().globalData.token) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
  },

  onShow() {
    if (!getApp().globalData.token) return;
    this.loadRecords(this.data.records.length > 0);
  },

  async onPullDownRefresh() {
    await this.loadRecords(false);
    wx.stopPullDownRefresh();
  },

  async loadRecords(silent) {
    if (this._loadingRecords) return;
    this._loadingRecords = true;
    if (!silent) {
      this.setData({ loading: true, error: "" });
    } else {
      this.setData({ error: "" });
    }
    try {
      const data = await api.getMyInspections();
      const records = [];
      for (let i = 0; i < data.length; i += 1) {
        const r = data[i];
        records.push({
          inspection_id: r.inspection_id,
          assignment_id: r.assignment_id,
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
          dateStr: fmt.formatDate(r.submitted_at),
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
      if (!silent) {
        this.setData({ loading: false });
      }
      this._loadingRecords = false;
    }
  },

  onPreviewPhoto(e) {
    const id = Number(e.currentTarget.dataset.id);
    const current = e.currentTarget.dataset.current;
    const urls = this.findPhotoUrls(id);
    wx.previewImage({ urls: urls, current: current });
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

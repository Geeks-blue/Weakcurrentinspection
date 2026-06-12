// pages/admin/review/review.js
const api = require("../../../utils/api");
const fmt = require("../../../utils/format");

Page({
  data: {
    items: [],
    loading: false,
    error: "",
    username: "",
    expanded: {}, // inspection_id → bool
    reviewing: {}, // inspection_id → bool
  },

  onLoad() {
    const app = getApp();
    if (!app.globalData.token || !app.isAdmin()) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    const user = app.globalData.user || {};
    this.setData({ username: user.username || "" });
  },

  onShow() {
    if (!getApp().isAdmin()) return;
    this.load(this.data.items.length > 0);
    this._startAutoRefresh();
  },

  onHide() {
    this._stopAutoRefresh();
  },

  onUnload() {
    this._stopAutoRefresh();
  },

  async onPullDownRefresh() {
    await this.load(false);
    wx.stopPullDownRefresh();
  },

  _startAutoRefresh() {
    this._stopAutoRefresh();
    const that = this;
    this._refreshTimer = setInterval(function () {
      that.load(true);
    }, 10000);
  },

  _stopAutoRefresh() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  },

  async load(silent) {
    if (this._loadingReview) return;
    this._loadingReview = true;
    if (!silent) {
      this.setData({ loading: true, error: "" });
    } else {
      this.setData({ error: "" });
    }
    try {
      const data = await api.getPendingReview();
      const items = [];
      for (let i = 0; i < data.length; i += 1) {
        const r = data[i];
        items.push({
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
          dateStr: fmt.formatDate(r.submitted_at),
          lockLabel: fmt.formatLock(r.lock_state),
          clutterLabel: fmt.formatClutter(r.clutter_state),
          indicatorLabel: fmt.formatIndicator(r.indicator_state),
          assetLabel: fmt.formatAssetMatch(r.asset_match_state),
        });
      }
      this.setData({ items: items });
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      if (!silent) {
        this.setData({ loading: false });
      }
      this._loadingReview = false;
    }
  },

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
    const current = e.currentTarget.dataset.current;
    const urls = this.findPhotoUrls(id);
    wx.previewImage({ urls: urls, current: current });
  },

  findPhotoUrls(id) {
    for (let i = 0; i < this.data.items.length; i += 1) {
      if (this.data.items[i].inspection_id === id) {
        return this.data.items[i].photo_urls || [];
      }
    }
    return [];
  },

  async onApprove(e) {
    const id = e.currentTarget.dataset.id;
    await this._review(id, "approved", "");
  },

  async onReject(e) {
    const id = e.currentTarget.dataset.id;
    const result = await new Promise(function (resolve) {
      wx.showModal({
        title: "驳回原因",
        editable: true,
        placeholderText: "请填写驳回原因",
        success(r) {
          resolve({ value: r.content || "" });
        },
        fail() {
          resolve({ value: null });
        },
      });
    });
    const reason = result.value;
    if (reason === null) return;
    await this._review(id, "rejected", reason);
  },

  async onRectify(e) {
    const id = e.currentTarget.dataset.id;
    await this._review(id, "rectify_required", "需整改");
  },

  async _review(id, action, reason) {
    this.setReviewing(id, true);
    try {
      await api.reviewInspection(id, action, reason);
      wx.showToast({ title: "审核完成", icon: "success" });
      this.load(false);
    } catch (e) {
      wx.showToast({ title: e.message, icon: "none" });
    } finally {
      this.setReviewing(id, false);
    }
  },

  setReviewing(id, value) {
    const reviewing = {};
    const current = this.data.reviewing;
    for (const key in current) {
      if (Object.prototype.hasOwnProperty.call(current, key)) {
        reviewing[key] = current[key];
      }
    }
    reviewing[id] = value;
    this.setData({ reviewing: reviewing });
  },

  onLogout() {
    wx.showModal({
      title: "退出",
      content: "确定退出吗？",
      success(r) {
        if (r.confirm) {
          getApp().clearAuth();
          wx.redirectTo({ url: "/pages/login/login" });
        }
      },
    });
  },
});

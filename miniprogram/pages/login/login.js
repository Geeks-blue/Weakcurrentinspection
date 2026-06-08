// pages/login/login.js
const api = require('../../utils/api');

Page({
  data: {
    username: '',
    password: '',
    loading: false,
    error: '',
  },

  onLoad() {
    const app = getApp();
    if (app.globalData.token && app.globalData.user) {
      this._navigate(app.globalData.user.role);
    }
  },

  onInputUsername(e) { this.setData({ username: e.detail.value }); },
  onInputPassword(e) { this.setData({ password: e.detail.value }); },

  async onLogin() {
    const { username, password } = this.data;
    if (!username.trim() || !password.trim()) {
      this.setData({ error: '请填写用户名和密码' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const data = await api.login(username.trim(), password);
      const app = getApp();
      app.setAuth(data.access_token, data.user);
      this._navigate(data.user.role);
    } catch (e) {
      this.setData({ error: e.message || '登录失败，请检查账号密码' });
    } finally {
      this.setData({ loading: false });
    }
  },

  _navigate(role) {
    if (role === 'student') {
      wx.redirectTo({ url: '/pages/student/tasks/tasks' });
    } else {
      wx.redirectTo({ url: '/pages/admin/review/review' });
    }
  }
});

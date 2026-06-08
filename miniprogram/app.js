// 弱电巡检小程序 - App 入口
App({
  globalData: {
    token: '',
    user: null,   // { id, username, role, gender }
    baseUrl: 'http://your-server-ip:8000'  // ← 修改为实际后端地址
  },

  onLaunch() {
    const token = wx.getStorageSync('access_token');
    const user = wx.getStorageSync('current_user');
    if (token && user) {
      this.globalData.token = token;
      this.globalData.user = user;
    }
  },

  setAuth(token, user) {
    this.globalData.token = token;
    this.globalData.user = user;
    wx.setStorageSync('access_token', token);
    wx.setStorageSync('current_user', user);
  },

  clearAuth() {
    this.globalData.token = '';
    this.globalData.user = null;
    wx.removeStorageSync('access_token');
    wx.removeStorageSync('current_user');
  },

  isStudent() {
    return this.globalData.user?.role === 'student';
  },

  isAdmin() {
    const role = this.globalData.user?.role;
    return role === 'admin' || role === 'teacher' || role === 'reviewer';
  }
});

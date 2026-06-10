// 弱电巡检小程序 - App 入口
App({
  globalData: {
    token: '',
    user: null,   // { id, username, role, gender }
    baseUrl: 'https://rdj-268749-4-1308736108.sh.run.tcloudbase.com'
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
    const user = this.globalData.user;
    return user && user.role === 'student';
  },

  isAdmin() {
    const user = this.globalData.user;
    const role = user && user.role;
    return role === 'admin' || role === 'teacher' || role === 'reviewer';
  }
});

// utils/api.js  弱电巡检 - API工具
const app = getApp();

function getBaseUrl() {
  return app.globalData.baseUrl;
}

function getToken() {
  return app.globalData.token || wx.getStorageSync('access_token') || '';
}

function request(method, path, data) {
  const url = getBaseUrl() + path;
  const token = getToken();
  return new Promise(function (resolve, reject) {
    const header = {
      'Content-Type': 'application/json'
    };
    if (token) {
      header.Authorization = 'Bearer ' + token;
    }
    wx.request({
      url: url,
      method: method,
      data: data,
      header: header,
      success(res) {
        if (res.statusCode >= 400) {
          const detail = res.data && res.data.detail;
          const msg = typeof detail === 'string' ? detail
            : typeof detail === 'object' && detail !== null ? JSON.stringify(detail)
            : '请求失败 (' + res.statusCode + ')';
          reject(new Error(msg));
        } else {
          resolve(res.data);
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络错误'));
      }
    });
  });
}

function uploadFile(localPath, filename) {
  const url = getBaseUrl() + '/inspections/photos/upload';
  const token = getToken();
  return new Promise(function (resolve, reject) {
    wx.uploadFile({
      url,
      filePath: localPath,
      name: 'file',
      header: { Authorization: 'Bearer ' + token },
      formData: { filename },
      success(res) {
        try {
          const data = JSON.parse(res.data);
          if (res.statusCode >= 400) {
            reject(new Error((data && data.detail) || '上传失败'));
          } else {
            resolve(data);
          }
        } catch (e) {
          reject(new Error('解析响应失败'));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '上传失败'));
      }
    });
  });
}

const api = {
  // 认证
  login: function (username, password) {
    return request('POST', '/auth/login', { username: username, password: password });
  },
  getMe: function () { return request('GET', '/auth/me'); },

  // 学生 - 任务
  getMyTasks: function () { return request('GET', '/tasks/my'); },

  // 学生 - 巡检提交
  submitInspection: function (payload) {
    return request('POST', '/inspections/submit', payload);
  },

  // 学生 - 历史记录
  getMyInspections: function () { return request('GET', '/inspections/my'); },

  // 学生 - 房间资产
  getRoomAssets: function (roomCode) {
    return request('GET', '/assets/room-assets/' + encodeURIComponent(roomCode));
  },

  // 学生 - 参考照片
  getRoomReferencePhoto: function (roomCode) {
    return request('GET', '/inspections/room-reference-photo?room_code=' + encodeURIComponent(roomCode));
  },

  // 照片上传
  uploadPhoto: function (localPath, filename) { return uploadFile(localPath, filename); },
  getPhotoUrl: function (objectKey) { return getBaseUrl() + '/inspections/photos/' + objectKey; },

  // 管理 - 待审核
  getPendingReview: function () { return request('GET', '/inspections/pending-review'); },
  reviewInspection: function (id, action, reason) {
    return request('POST', '/inspections/' + id + '/review', { action: action, reason: reason });
  },
  deleteInspection: function (id) { return request('DELETE', '/inspections/' + id); },

  // 管理 - 巡检总览
  getConsoleRecords: function (params) {
    const query = [];
    if (params && params.status) query.push('status=' + encodeURIComponent(params.status));
    if (params && params.room_code) query.push('room_code=' + encodeURIComponent(params.room_code));
    if (params && params.student_username) query.push('student_username=' + encodeURIComponent(params.student_username));
    query.push('limit=' + encodeURIComponent(String((params && params.limit) || 60)));
    return request('GET', '/inspections/console-records?' + query.join('&'));
  },

  // 管理 - 派发选项
  getDispatchOptions: function () { return request('GET', '/tasks/dispatch-options'); },

  // 管理 - 创建任务
  createAssignment: function (payload) { return request('POST', '/tasks/assign', payload); },

  // 管理 - 待处理任务列表
  getPendingTasks: function () { return request('GET', '/tasks/pending'); },

  // 管理 - 删除任务
  deleteTask: function (id) { return request('DELETE', '/tasks/' + id); },
};

module.exports = api;

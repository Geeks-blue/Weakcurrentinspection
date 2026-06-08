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
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      success(res) {
        if (res.statusCode >= 400) {
          const detail = res.data?.detail;
          const msg = typeof detail === 'string' ? detail
            : typeof detail === 'object' && detail !== null ? JSON.stringify(detail)
            : `请求失败 (${res.statusCode})`;
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
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url,
      filePath: localPath,
      name: 'file',
      header: { Authorization: `Bearer ${token}` },
      formData: { filename },
      success(res) {
        try {
          const data = JSON.parse(res.data);
          if (res.statusCode >= 400) {
            reject(new Error(data?.detail || '上传失败'));
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
  login: (username, password) =>
    request('POST', '/auth/login', { username, password }),
  getMe: () => request('GET', '/auth/me'),

  // 学生 - 任务
  getMyTasks: () => request('GET', '/tasks/my'),

  // 学生 - 巡检提交
  submitInspection: (payload) =>
    request('POST', '/inspections/submit', payload),

  // 学生 - 历史记录
  getMyInspections: () => request('GET', '/inspections/my'),

  // 学生 - 房间资产
  getRoomAssets: (roomCode) =>
    request('GET', `/assets/room-assets/${encodeURIComponent(roomCode)}`),

  // 学生 - 参考照片
  getRoomReferencePhoto: (roomCode) =>
    request('GET', `/inspections/room-reference-photo?room_code=${encodeURIComponent(roomCode)}`),

  // 照片上传
  uploadPhoto: (localPath, filename) => uploadFile(localPath, filename),
  getPhotoUrl: (objectKey) => getBaseUrl() + `/inspections/photos/${objectKey}`,

  // 管理 - 待审核
  getPendingReview: () => request('GET', '/inspections/pending-review'),
  reviewInspection: (id, action, reason) =>
    request('POST', `/inspections/${id}/review`, { action, reason }),
  deleteInspection: (id) => request('DELETE', `/inspections/${id}`),

  // 管理 - 巡检总览
  getConsoleRecords: (params) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.room_code) q.set('room_code', params.room_code);
    if (params?.student_username) q.set('student_username', params.student_username);
    q.set('limit', String(params?.limit ?? 60));
    return request('GET', `/inspections/console-records?${q.toString()}`);
  },

  // 管理 - 派发选项
  getDispatchOptions: () => request('GET', '/tasks/dispatch-options'),

  // 管理 - 创建任务
  createAssignment: (payload) => request('POST', '/tasks/assign', payload),

  // 管理 - 待处理任务列表
  getPendingTasks: () => request('GET', '/tasks/pending'),

  // 管理 - 删除任务
  deleteTask: (id) => request('DELETE', `/tasks/${id}`),
};

module.exports = api;

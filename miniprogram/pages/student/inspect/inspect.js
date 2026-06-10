// pages/student/inspect/inspect.js
const api = require('../../../utils/api');

Page({
  data: {
    assignmentId: null,
    roomCode: '',
    buildingName: '',
    taskTitle: '',
    floor: '',
    location: '',

    // 签到方式
    checkinMode: 'qr',  // 'qr' | 'manual'
    scannedCode: '',
    manualCode: '',

    // 巡检项目
    lockState: 'locked',
    clutterState: 'none',
    indicatorState: 'all_ok',
    assetMatchState: 'matched',
    remark: '',

    // 照片
    photos: [],  // [{localPath, key, uploading, error}]

    // 资产台账
    roomAssets: [],
    assetsLoading: false,
    refPhotoUrl: '',

    // 提交
    submitting: false,
    submitOk: false,
    submitError: '',

    // 展开状态
    showAssets: false,
  },

  onLoad(options) {
    this.setData({
      assignmentId: Number(options.assignmentId),
      roomCode: decodeURIComponent(options.roomCode || ''),
      buildingName: decodeURIComponent(options.buildingName || ''),
      taskTitle: decodeURIComponent(options.taskTitle || ''),
      floor: decodeURIComponent(options.floor || ''),
      location: decodeURIComponent(options.location || ''),
    });
    wx.setNavigationBarTitle({ title: '巡检·' + (options.roomCode || '') });
    this.loadRoomData();
  },

  async loadRoomData() {
    const roomCode = this.data.roomCode;
    this.setData({ assetsLoading: true });
    try {
      const assets = await api.getRoomAssets(roomCode);
      this.setData({ roomAssets: assets || [] });
    } catch (e) {
      this.setData({ roomAssets: [] });
    }
    try {
      const refData = await api.getRoomReferencePhoto(roomCode);
      this.setData({ refPhotoUrl: (refData && refData.photo_url) || '' });
    } catch (e) {
      this.setData({ refPhotoUrl: '' });
    } finally {
      this.setData({ assetsLoading: false });
    }
  },

  scanCode() {
    return new Promise(function (resolve, reject) {
      wx.scanCode({
        onlyFromCamera: false,
        scanType: ['qrCode'],
        success: resolve,
        fail: reject,
      });
    });
  },

  chooseImages() {
    return new Promise(function (resolve, reject) {
      if (wx.chooseMedia) {
        wx.chooseMedia({
          count: 3,
          mediaType: ['image'],
          sourceType: ['camera', 'album'],
          camera: 'back',
          success: resolve,
          fail: reject,
        });
        return;
      }
      wx.chooseImage({
        count: 3,
        sourceType: ['camera', 'album'],
        success(res) {
          const tempFiles = [];
          const paths = res.tempFilePaths || [];
          for (let i = 0; i < paths.length; i += 1) {
            tempFiles.push({ tempFilePath: paths[i] });
          }
          resolve({ tempFiles: tempFiles });
        },
        fail: reject,
      });
    });
  },

  // ---- QR扫码 ----
  async onScanQR() {
    try {
      const res = await this.scanCode();
      const code = res.result || '';
      // 提取房间code: 约定二维码内容包含 room_code 或 QR-XXX 格式
      const roomCode = this.data.roomCode;
      if (code.indexOf(roomCode) !== -1 || code.indexOf('QR-' + roomCode) !== -1) {
        this.setData({ checkinMode: 'qr', scannedCode: roomCode });
        wx.showToast({ title: '扫码成功', icon: 'success' });
      } else {
        const that = this;
        wx.showModal({
          title: '扫码内容',
          content: '扫描结果：' + code + '\n是否使用此代码签到？',
          success(r) {
            if (r.confirm) that.setData({ checkinMode: 'qr', scannedCode: code });
          }
        });
      }
    } catch (e) {
      if (e.errMsg !== 'scanCode:fail cancel') {
        wx.showToast({ title: '扫码失败: ' + e.errMsg, icon: 'none' });
      }
    }
  },

  onManualInput(e) { this.setData({ manualCode: e.detail.value }); },
  switchManual() { this.setData({ checkinMode: 'manual', scannedCode: '' }); },
  switchQR() { this.setData({ checkinMode: 'qr', manualCode: '' }); },

  // ---- 选项切换 ----
  setLock(e) { this.setData({ lockState: e.currentTarget.dataset.v }); },
  setClutter(e) { this.setData({ clutterState: e.currentTarget.dataset.v }); },
  setIndicator(e) { this.setData({ indicatorState: e.currentTarget.dataset.v }); },
  setAsset(e) { this.setData({ assetMatchState: e.currentTarget.dataset.v }); },
  onRemarkInput(e) { this.setData({ remark: e.detail.value }); },

  // ---- 拍照 ----
  async onTakePhoto() {
    try {
      const res = await this.chooseImages();
      const tempFiles = (res && res.tempFiles) || [];
      for (let i = 0; i < tempFiles.length; i += 1) {
        const item = tempFiles[i];
        const id = Date.now() + Math.random();
        const entry = { id, localPath: item.tempFilePath, key: '', uploading: true, error: '' };
        const photos = this.data.photos.slice();
        photos.push(entry);
        this.setData({ photos });
        this._uploadPhoto(id, item.tempFilePath);
      }
    } catch (e) {
      if (String(e.errMsg).indexOf('cancel') === -1) {
        wx.showToast({ title: '选择照片失败', icon: 'none' });
      }
    }
  },

  async _uploadPhoto(id, localPath) {
    try {
      const data = await api.uploadPhoto(localPath, 'photo_' + Date.now() + '.jpg');
      this._updatePhoto(id, { key: data.object_key, uploading: false });
    } catch (e) {
      this._updatePhoto(id, { uploading: false, error: '上传失败' });
    }
  },

  _updatePhoto(id, patch) {
    const photos = [];
    for (let i = 0; i < this.data.photos.length; i += 1) {
      const p = this.data.photos[i];
      if (p.id === id) {
        photos.push({
          id: p.id,
          localPath: p.localPath,
          key: patch.key !== undefined ? patch.key : p.key,
          uploading: patch.uploading !== undefined ? patch.uploading : p.uploading,
          error: patch.error !== undefined ? patch.error : p.error,
        });
      } else {
        photos.push(p);
      }
    }
    this.setData({ photos });
  },

  onDeletePhoto(e) {
    const id = e.currentTarget.dataset.id;
    const photos = [];
    for (let i = 0; i < this.data.photos.length; i += 1) {
      if (this.data.photos[i].id !== id) {
        photos.push(this.data.photos[i]);
      }
    }
    this.setData({ photos: photos });
  },

  onPreviewPhoto(e) {
    const src = e.currentTarget.dataset.src;
    wx.previewImage({ urls: [src], current: src });
  },

  toggleAssets() { this.setData({ showAssets: !this.data.showAssets }); },

  // ---- 提交 ----
  async onSubmit() {
    const assignmentId = this.data.assignmentId;
    const checkinMode = this.data.checkinMode;
    const scannedCode = this.data.scannedCode;
    const manualCode = this.data.manualCode;
    const lockState = this.data.lockState;
    const clutterState = this.data.clutterState;
    const indicatorState = this.data.indicatorState;
    const assetMatchState = this.data.assetMatchState;
    const remark = this.data.remark;
    const photos = this.data.photos;

    if (checkinMode === 'qr' && !scannedCode) {
      wx.showToast({ title: '请先扫描房间二维码', icon: 'none' }); return;
    }
    if (checkinMode === 'manual' && !manualCode.trim()) {
      wx.showToast({ title: '请输入房间编码', icon: 'none' }); return;
    }
    const uploadedKeys = [];
    for (let i = 0; i < photos.length; i += 1) {
      if (photos[i].uploading) {
        wx.showToast({ title: '照片上传中，请稍候', icon: 'none' }); return;
      }
      if (photos[i].key) {
        uploadedKeys.push(photos[i].key);
      }
    }
    if (checkinMode === 'manual' && uploadedKeys.length === 0) {
      wx.showToast({ title: '手动签到请先上传门牌照片', icon: 'none' }); return;
    }

    this.setData({ submitting: true, submitError: '' });
    try {
      await api.submitInspection({
        assignment_id: assignmentId,
        checkin_mode: checkinMode,
        checkin_lat: 0,
        checkin_lng: 0,
        manual_room_code: checkinMode === 'manual' ? manualCode.trim() : undefined,
        door_plate_photo_key: checkinMode === 'manual' ? uploadedKeys[0] : undefined,
        lock_state: lockState,
        clutter_state: clutterState,
        indicator_state: indicatorState,
        asset_match_state: assetMatchState,
        remark_text: remark || undefined,
        photo_keys: uploadedKeys,
      });
      this.setData({ submitOk: true });
      wx.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(function () {
        wx.redirectTo({ url: '/pages/student/tasks/tasks' });
      }, 1500);
    } catch (e) {
      this.setData({ submitError: e.message || '提交失败' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});

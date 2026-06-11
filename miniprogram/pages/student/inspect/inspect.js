// pages/student/inspect/inspect.js
const api = require('../../../utils/api');

Page({
  data: {
    assignmentId: null,
    roomCode: '',
    roomName: '',
    buildingName: '',
    taskTitle: '',
    floor: '',
    location: '',
    checkinLat: null,
    checkinLng: null,
    geoLocationText: '定位中...',
    geoLocationError: '',
    geoLocationLoading: false,

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
    watermarkCanvasWidth: 1,
    watermarkCanvasHeight: 1,

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
      roomName: decodeURIComponent(options.roomName || options.location || ''),
      buildingName: decodeURIComponent(options.buildingName || ''),
      taskTitle: decodeURIComponent(options.taskTitle || ''),
      floor: decodeURIComponent(options.floor || ''),
      location: decodeURIComponent(options.location || ''),
    });
    wx.setNavigationBarTitle({ title: '巡检·' + (options.roomCode || '') });
    this.loadRoomData();
    this.loadCurrentLocation(false);
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

  chooseImages(count) {
    return new Promise(function (resolve, reject) {
      if (wx.chooseMedia) {
        wx.chooseMedia({
          count: count,
          mediaType: ['image'],
          sourceType: ['camera', 'album'],
          camera: 'back',
          success: resolve,
          fail: reject,
        });
        return;
      }
      wx.chooseImage({
        count: count,
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

  getLocation() {
    return new Promise(function (resolve, reject) {
      wx.getLocation({
        type: 'gcj02',
        isHighAccuracy: true,
        highAccuracyExpireTime: 4000,
        success: resolve,
        fail: reject,
      });
    });
  },

  async loadCurrentLocation(showToast) {
    this.setData({
      geoLocationLoading: true,
      geoLocationError: '',
      geoLocationText: this._hasLocation() ? this.data.geoLocationText : '定位中...',
    });
    try {
      const location = await this.getLocation();
      const geoLocationText = this._formatGeoLocation(location);
      this.setData({
        checkinLat: location.latitude,
        checkinLng: location.longitude,
        geoLocationText: geoLocationText,
        geoLocationError: '',
      });
      if (showToast) {
        wx.showToast({ title: '定位成功', icon: 'success' });
      }
      return true;
    } catch (e) {
      const message = this._formatLocationError(e);
      this.setData({
        geoLocationError: message,
        geoLocationText: '未获取定位',
      });
      if (showToast) {
        wx.showToast({ title: message, icon: 'none' });
      }
      return false;
    } finally {
      this.setData({ geoLocationLoading: false });
    }
  },

  onRefreshLocation() {
    this.loadCurrentLocation(true);
  },

  _hasLocation() {
    return typeof this.data.checkinLat === 'number' && typeof this.data.checkinLng === 'number';
  },

  _formatGeoLocation(location) {
    const parts = [
      '纬度 ' + this._formatCoordinate(location.latitude),
      '经度 ' + this._formatCoordinate(location.longitude),
    ];
    if (typeof location.accuracy === 'number') {
      parts.push('精度 ±' + Math.round(location.accuracy) + 'm');
    }
    return parts.join('，');
  },

  _formatCoordinate(value) {
    const num = Number(value);
    return isFinite(num) ? num.toFixed(6) : '-';
  },

  _formatLocationError(e) {
    const msg = (e && e.errMsg) || '';
    if (msg.indexOf('auth deny') !== -1 || msg.indexOf('authorize no response') !== -1) {
      return '定位未授权，请开启位置权限';
    }
    if (msg.indexOf('fail') !== -1) {
      return '定位失败，请重试';
    }
    return '无法获取定位';
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
      if (!this._hasLocation()) {
        const located = await this.loadCurrentLocation(false);
        if (!located) {
          wx.showToast({ title: '请先获取定位', icon: 'none' });
          return;
        }
      }
      const remaining = 5 - this.data.photos.length;
      if (remaining <= 0) {
        wx.showToast({ title: '最多上传5张照片', icon: 'none' });
        return;
      }
      const res = await this.chooseImages(Math.min(3, remaining));
      const tempFiles = (res && res.tempFiles) || [];
      const pendingPhotos = [];
      const photos = this.data.photos.slice();
      for (let i = 0; i < tempFiles.length; i += 1) {
        const item = tempFiles[i];
        const localPath = item.tempFilePath;
        if (!localPath) {
          continue;
        }
        const id = Date.now() + Math.random();
        const entry = { id, localPath: localPath, key: '', uploading: true, error: '' };
        photos.push(entry);
        pendingPhotos.push(entry);
      }
      this.setData({ photos });
      for (let i = 0; i < pendingPhotos.length; i += 1) {
        await this._uploadPhoto(pendingPhotos[i].id, pendingPhotos[i].localPath);
      }
    } catch (e) {
      if (String(e.errMsg).indexOf('cancel') === -1) {
        wx.showToast({ title: '选择照片失败', icon: 'none' });
      }
    }
  },

  async _uploadPhoto(id, localPath) {
    let uploadPath = localPath;
    try {
      uploadPath = await this._createWatermarkedPhoto(localPath);
      this._updatePhoto(id, { localPath: uploadPath });
    } catch (e) {
      this._updatePhoto(id, { uploading: false, error: '添加水印失败' });
      return;
    }
    try {
      const data = await api.uploadPhoto(uploadPath, 'photo_' + Date.now() + '.jpg');
      this._updatePhoto(id, { key: data.object_key, uploading: false });
    } catch (e) {
      this._updatePhoto(id, { uploading: false, error: '上传失败' });
    }
  },

  _createWatermarkedPhoto(localPath) {
    const that = this;
    return this._getImageInfo(localPath).then(function (info) {
      const width = info.width;
      const height = info.height;
      if (!width || !height) {
        throw new Error('invalid image size');
      }
      that.setData({
        watermarkCanvasWidth: width,
        watermarkCanvasHeight: height,
      });
      return that._nextTick().then(function () {
        const ctx = wx.createCanvasContext('watermarkCanvas', that);
        const imagePath = info.path || localPath;
        const padding = Math.max(24, Math.round(width * 0.03));
        const fontSize = Math.max(24, Math.round(width * 0.032));
        const lineHeight = Math.ceil(fontSize * 1.45);
        const maxTextWidth = width - padding * 2;
        ctx.drawImage(imagePath, 0, 0, width, height);
        ctx.setFontSize(fontSize);
        const lines = that._wrapWatermarkLines(
          ctx,
          that._buildWatermarkTextLines(),
          maxTextWidth,
          fontSize
        );
        const panelHeight = lineHeight * lines.length + padding * 2;
        const top = Math.max(0, height - panelHeight);
        ctx.setFillStyle('rgba(0, 0, 0, 0.55)');
        ctx.fillRect(0, top, width, panelHeight);
        ctx.setFillStyle('#ffffff');
        ctx.setFontSize(fontSize);
        for (let i = 0; i < lines.length; i += 1) {
          ctx.fillText(lines[i], padding, top + padding + fontSize + i * lineHeight);
        }
        return that._drawCanvas(ctx).then(function () {
          return that._canvasToTempFilePath(width, height);
        });
      });
    });
  },

  _getImageInfo(src) {
    return new Promise(function (resolve, reject) {
      wx.getImageInfo({
        src: src,
        success: resolve,
        fail: reject,
      });
    });
  },

  _nextTick() {
    return new Promise(function (resolve) {
      if (wx.nextTick) {
        wx.nextTick(resolve);
      } else {
        setTimeout(resolve, 0);
      }
    });
  },

  _drawCanvas(ctx) {
    return new Promise(function (resolve) {
      ctx.draw(false, resolve);
    });
  },

  _canvasToTempFilePath(width, height) {
    const that = this;
    return new Promise(function (resolve, reject) {
      wx.canvasToTempFilePath(
        {
          canvasId: 'watermarkCanvas',
          x: 0,
          y: 0,
          width: width,
          height: height,
          destWidth: width,
          destHeight: height,
          fileType: 'jpg',
          quality: 0.92,
          success(res) {
            resolve(res.tempFilePath);
          },
          fail: reject,
        },
        that
      );
    });
  },

  _buildWatermarkTextLines() {
    const locationText = [
      this.data.buildingName,
      this.data.floor,
      this.data.location,
    ].filter(function (item) {
      return !!item;
    }).join(' ');
    const roomText = [
      this.data.roomCode,
      this.data.roomName || this.data.location || this.data.buildingName,
    ].filter(function (item) {
      return !!item;
    }).join(' ');
    return [
      '时间：' + this._formatWatermarkTime(new Date()),
      '地点：' + (locationText || '-'),
      '定位：' + (this._hasLocation() ? this.data.geoLocationText : '未获取定位'),
      '房间：' + (roomText || '-'),
    ];
  },

  _formatWatermarkTime(date) {
    return [
      date.getFullYear(),
      '-',
      this._pad2(date.getMonth() + 1),
      '-',
      this._pad2(date.getDate()),
      ' ',
      this._pad2(date.getHours()),
      ':',
      this._pad2(date.getMinutes()),
      ':',
      this._pad2(date.getSeconds()),
    ].join('');
  },

  _pad2(value) {
    const text = String(value);
    return text.length < 2 ? '0' + text : text;
  },

  _wrapWatermarkLines(ctx, lines, maxWidth, fontSize) {
    const result = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (this._measureText(ctx, line, fontSize) <= maxWidth) {
        result.push(line);
        continue;
      }
      let current = '';
      for (let j = 0; j < line.length; j += 1) {
        const next = current + line[j];
        if (current && this._measureText(ctx, next, fontSize) > maxWidth) {
          result.push(current);
          current = line[j];
        } else {
          current = next;
        }
      }
      if (current) {
        result.push(current);
      }
    }
    return result;
  },

  _measureText(ctx, text, fontSize) {
    if (ctx.measureText) {
      const metrics = ctx.measureText(text);
      if (metrics && metrics.width) {
        return metrics.width;
      }
    }
    return text.length * fontSize;
  },

  _updatePhoto(id, patch) {
    const photos = [];
    for (let i = 0; i < this.data.photos.length; i += 1) {
      const p = this.data.photos[i];
      if (p.id === id) {
        photos.push({
          id: p.id,
          localPath: patch.localPath !== undefined ? patch.localPath : p.localPath,
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
    if (!this._hasLocation()) {
      const located = await this.loadCurrentLocation(false);
      if (!located) {
        wx.showToast({ title: '请先获取定位', icon: 'none' }); return;
      }
    }

    this.setData({ submitting: true, submitError: '' });
    try {
      await api.submitInspection({
        assignment_id: assignmentId,
        checkin_mode: checkinMode,
        checkin_lat: this.data.checkinLat,
        checkin_lng: this.data.checkinLng,
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

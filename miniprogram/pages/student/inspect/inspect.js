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
    checkinAccuracy: null,
    geoLocationText: '未获取定位',
    geoLocationButtonText: '获取定位',
    geoLocationError: '',
    geoLocationLoading: false,
    mapLocationText: '未获取文字位置',
    mapLocationName: '',
    mapLocationAddress: '',

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
        success: resolve,
        fail: reject,
      });
    });
  },

  async loadCurrentLocation(showToast) {
    this.setData({
      geoLocationLoading: true,
      geoLocationButtonText: '定位中...',
      geoLocationError: '',
      geoLocationText: this._hasLocation() ? this.data.geoLocationText : '正在获取当前位置...',
      mapLocationText: this._hasLocation() ? this.data.mapLocationText : '正在解析文字位置...',
    });
    try {
      const location = await this.getLocation();
      const geoLocationText = this._formatGeoLocation(location);
      const place = await this._resolveTextLocation(location.latitude, location.longitude);
      this.setData({
        checkinLat: location.latitude,
        checkinLng: location.longitude,
        checkinAccuracy: typeof location.accuracy === 'number' ? location.accuracy : null,
        geoLocationText: geoLocationText,
        geoLocationButtonText: '重新获取',
        geoLocationError: place.error || '',
        mapLocationText: place.text,
        mapLocationName: place.name,
        mapLocationAddress: place.address,
      });
      if (showToast) {
        wx.showToast({ title: '定位成功', icon: 'success' });
      }
      return true;
    } catch (e) {
      const message = this._formatLocationError(e);
      this.setData({
        geoLocationError: message,
        geoLocationButtonText: '重新获取',
        geoLocationText: '未获取定位',
        mapLocationText: '未获取文字位置',
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

  async _resolveTextLocation(latitude, longitude) {
    try {
      const data = await api.reverseGeocode(latitude, longitude);
      const name = (data && data.name ? data.name : '').trim();
      const address = (data && data.address ? data.address : '').trim();
      return {
        name: name,
        address: address,
        text: this._formatMapLocation(name, address),
        error: '',
      };
    } catch (e) {
      const message = (e && e.message) || '';
      const friendlyMessage = message.indexOf('Tencent Map key') !== -1
        ? '文字位置服务未配置'
        : '文字位置获取失败';
      return {
        name: '',
        address: '',
        text: '文字位置获取失败，已保留经纬度',
        error: friendlyMessage,
      };
    }
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

  _formatMapLocation(name, address) {
    if (name && address && address.indexOf(name) === -1) {
      return name + ' · ' + address;
    }
    return name || address || '地图已确认当前位置';
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
      const sourceWidth = info.width;
      const sourceHeight = info.height;
      if (!sourceWidth || !sourceHeight) {
        throw new Error('invalid image size');
      }
      const maxWidth = 1280;
      const scale = sourceWidth > maxWidth ? maxWidth / sourceWidth : 1;
      const width = Math.round(sourceWidth * scale);
      const height = Math.round(sourceHeight * scale);
      that.setData({
        watermarkCanvasWidth: width,
        watermarkCanvasHeight: height,
      });
      return that._nextTick().then(function () {
        const ctx = wx.createCanvasContext('watermarkCanvas', that);
        const imagePath = info.path || localPath;
        ctx.drawImage(imagePath, 0, 0, width, height);
        that._drawReferenceWatermark(ctx, width, height);
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

  _drawReferenceWatermark(ctx, width, height) {
    const scale = Math.max(0.72, Math.min(1.35, width / 1080));
    const left = Math.round(width * 0.07);
    const bottom = Math.round(Math.max(44 * scale, height * 0.05));
    const data = this._buildReferenceWatermarkData(new Date());
    const cardWidth = Math.round(218 * scale);
    const cardHeight = Math.round(164 * scale);
    const headerHeight = Math.round(72 * scale);
    const cardRadius = Math.round(10 * scale);
    const textFontSize = Math.round(30 * scale);
    const smallFontSize = Math.round(27 * scale);
    const lineHeight = Math.round(47 * scale);
    const addressLines = this._wrapTextLines(ctx, data.addressText, width - left * 2, textFontSize, 2);
    const roomLines = this._wrapTextLines(ctx, data.roomText, width - left * 2 - 36 * scale, textFontSize, 2);
    const blockHeight = Math.round(
      cardHeight + 50 * scale + lineHeight * (2 + addressLines.length + roomLines.length)
    );
    const cardTop = Math.max(Math.round(24 * scale), height - bottom - blockHeight);
    let y = cardTop;

    this._drawPunchCard(ctx, left, y, cardWidth, cardHeight, headerHeight, cardRadius, scale, data.timeText);
    y += cardHeight + Math.round(52 * scale);

    this._drawShadowText(ctx, data.dateText, left, y, textFontSize, '#ffffff');
    y += lineHeight;

    for (let i = 0; i < addressLines.length; i += 1) {
      this._drawShadowText(ctx, addressLines[i], left, y, textFontSize, '#ffffff');
      y += lineHeight;
    }

    const quoteX = left;
    const roomX = left + Math.round(36 * scale);
    this._drawShadowText(ctx, '“', quoteX, y, Math.round(42 * scale), '#1bb8df');
    for (let i = 0; i < roomLines.length; i += 1) {
      this._drawShadowText(ctx, roomLines[i], roomX, y, textFontSize, '#ffffff');
      y += lineHeight;
    }

    this._drawSealText(ctx, left, y, smallFontSize, scale);
    this._drawBottomBrand(ctx, width, height, scale);
  },

  _drawPunchCard(ctx, x, y, width, height, headerHeight, radius, scale, timeText) {
    this._fillRoundRect(ctx, x, y, width, height, radius, 'rgba(255, 255, 255, 0.93)');
    this._fillRoundRect(ctx, x, y, width, headerHeight + radius, radius, '#21b9df');
    ctx.setFillStyle('#21b9df');
    ctx.fillRect(x, y + headerHeight - radius, width, radius);
    ctx.setFillStyle('rgba(255, 255, 255, 0.94)');
    ctx.fillRect(x, y + headerHeight, width, height - headerHeight - radius);
    this._fillRoundRect(
      ctx,
      x,
      y + height - radius * 2,
      width,
      radius * 2,
      radius,
      'rgba(255, 255, 255, 0.94)'
    );
    this._drawPlainText(ctx, '打卡记录', x + 20 * scale, y + 49 * scale, Math.round(38 * scale), '#ffffff');
    this._drawPlainText(ctx, timeText, x + 20 * scale, y + headerHeight + 70 * scale, Math.round(64 * scale), '#203a60');
  },

  _fillRoundRect(ctx, x, y, width, height, radius, color) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.setFillStyle(color);
    ctx.fill();
  },

  _drawSealText(ctx, x, y, fontSize, scale) {
    const radius = Math.round(15 * scale);
    const centerY = y - Math.round(fontSize * 0.35);
    ctx.beginPath();
    ctx.arc(x + radius, centerY, radius, 0, Math.PI * 2);
    ctx.setStrokeStyle('rgba(255, 255, 255, 0.72)');
    ctx.setLineWidth(Math.max(1, Math.round(2 * scale)));
    ctx.stroke();
    this._drawPlainText(
      ctx,
      '证',
      x + Math.round(4 * scale),
      centerY + Math.round(9 * scale),
      Math.round(21 * scale),
      'rgba(255, 255, 255, 0.72)'
    );
    this._drawShadowText(
      ctx,
      '水印相机已确保时间不可篡改',
      x + Math.round(44 * scale),
      y,
      fontSize,
      'rgba(255, 255, 255, 0.82)'
    );
  },

  _drawBottomBrand(ctx, width, height, scale) {
    const text = '弱电巡检';
    const fontSize = Math.round(28 * scale);
    const textWidth = this._measureText(ctx, text, fontSize);
    this._drawShadowText(
      ctx,
      text,
      width - textWidth - Math.round(44 * scale),
      height - Math.round(36 * scale),
      fontSize,
      'rgba(255, 255, 255, 0.78)'
    );
  },

  _drawPlainText(ctx, text, x, y, fontSize, color) {
    ctx.setFontSize(fontSize);
    ctx.setFillStyle(color);
    ctx.fillText(text, x, y);
  },

  _drawShadowText(ctx, text, x, y, fontSize, color) {
    ctx.setFontSize(fontSize);
    ctx.setFillStyle('rgba(0, 0, 0, 0.38)');
    ctx.fillText(text, x + 2, y + 2);
    ctx.setFillStyle(color);
    ctx.fillText(text, x, y);
  },

  _buildReferenceWatermarkData(date) {
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
    return {
      timeText: this._formatWatermarkClock(date),
      dateText: this._formatWatermarkDateWeek(date),
      addressText: this._getMapLocationLabel() || this.data.buildingName || this.data.geoLocationText || '未确认地图位置名称',
      roomText: locationText || roomText || '-',
    };
  },

  _getMapLocationLabel() {
    if (this.data.mapLocationName || this.data.mapLocationAddress) {
      return this._formatMapLocation(this.data.mapLocationName, this.data.mapLocationAddress);
    }
    return '';
  },

  _formatWatermarkClock(date) {
    return this._pad2(date.getHours()) + ':' + this._pad2(date.getMinutes());
  },

  _formatWatermarkDateWeek(date) {
    const weekLabels = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return [
      date.getFullYear(),
      '-',
      this._pad2(date.getMonth() + 1),
      '-',
      this._pad2(date.getDate()),
      ' ',
      weekLabels[date.getDay()],
    ].join('');
  },

  _pad2(value) {
    const text = String(value);
    return text.length < 2 ? '0' + text : text;
  },

  _wrapTextLines(ctx, text, maxWidth, fontSize, maxLines) {
    const result = [];
    let current = '';
    const source = String(text || '-');
    for (let i = 0; i < source.length; i += 1) {
      const next = current + source[i];
      if (current && this._measureText(ctx, next, fontSize) > maxWidth) {
        result.push(current);
        current = source[i];
        if (result.length === maxLines - 1) {
          break;
        }
      } else {
        current = next;
      }
    }
    if (current && result.length < maxLines) {
      result.push(current);
    }
    if (result.length === maxLines && source.length > result.join('').length) {
      let last = result[result.length - 1];
      while (last.length > 0 && this._measureText(ctx, last + '…', fontSize) > maxWidth) {
        last = last.slice(0, -1);
      }
      result[result.length - 1] = last + '…';
    }
    return result;
  },

  _measureText(ctx, text, fontSize) {
    ctx.setFontSize(fontSize);
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

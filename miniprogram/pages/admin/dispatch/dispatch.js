// pages/admin/dispatch/dispatch.js
const api = require('../../../utils/api');

Page({
  data: {
    rooms: [],
    students: [],
    displayRooms: [],
    displayStudents: [],
    loading: false,
    error: '',
    message: '',

    selectedRoomIds: [],
    selectedStudentIds: [],
    taskTitle: '例行弱电巡检',
    cycleType: 'one_off',
    dueDate: '',

    roomFilter: '',
    studentFilter: '',
    dispatching: false,

    cycleOptions: ['one_off', 'weekly', 'monthly'],
    cycleLabels: ['一次性', '每周', '每月'],
    cycleIndex: 0,
    cycleLabel: '一次性',
  },

  onLoad() {
    if (!getApp().isAdmin()) {
      wx.redirectTo({ url: '/pages/login/login' }); return;
    }
    const now = new Date();
    now.setDate(now.getDate() + 7);
    const y = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const m = month < 10 ? '0' + month : String(month);
    const d = day < 10 ? '0' + day : String(day);
    this.setData({ dueDate: y + '-' + m + '-' + d });
    this.loadOptions();
  },

  async loadOptions() {
    this.setData({ loading: true, error: '' });
    try {
      const data = await api.getDispatchOptions();
      this.setData({ rooms: data.rooms || [], students: data.students || [] });
      this.refreshDisplayLists();
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  refreshDisplayLists() {
    const roomQ = this.data.roomFilter.trim().toLowerCase();
    const studentQ = this.data.studentFilter.trim().toLowerCase();
    const selectedRoomMap = {};
    const selectedStudentMap = {};
    const displayRooms = [];
    const displayStudents = [];
    let i;

    for (i = 0; i < this.data.selectedRoomIds.length; i += 1) {
      selectedRoomMap[this.data.selectedRoomIds[i]] = true;
    }
    for (i = 0; i < this.data.selectedStudentIds.length; i += 1) {
      selectedStudentMap[this.data.selectedStudentIds[i]] = true;
    }

    for (i = 0; i < this.data.rooms.length; i += 1) {
      const r = this.data.rooms[i];
      const roomCode = String(r.room_code || '').toLowerCase();
      const building = String(r.building_name || r.building_code || '').toLowerCase();
      if (roomQ && roomCode.indexOf(roomQ) === -1 && building.indexOf(roomQ) === -1) {
        continue;
      }
      displayRooms.push({
        room_id: r.room_id,
        room_code: r.room_code,
        building_code: r.building_code,
        building_name: r.building_name,
        gender_restriction: r.gender_restriction,
        selected: !!selectedRoomMap[r.room_id],
        buildingLabel: r.building_name || r.building_code || '',
      });
    }

    for (i = 0; i < this.data.students.length; i += 1) {
      const s = this.data.students[i];
      const username = String(s.username || '').toLowerCase();
      if (studentQ && username.indexOf(studentQ) === -1) {
        continue;
      }
      displayStudents.push({
        student_user_id: s.student_user_id,
        username: s.username,
        gender: s.gender,
        selected: !!selectedStudentMap[s.student_user_id],
        genderLabel: s.gender === 'female' ? '女' : s.gender === 'male' ? '男' : '未设置',
      });
    }

    this.setData({ displayRooms, displayStudents });
  },

  normalizeId(value) {
    const id = Number(value);
    return isFinite(id) ? id : value;
  },

  canonicalBuildingCode(rawCode) {
    const code = String(rawCode || '').trim().toLowerCase().replace(/\s+/g, '');
    const match = code.match(/\d+/);
    if ((code.indexOf('dorm') !== -1 || code.indexOf('#') !== -1) && match) {
      return 'dorm-' + match[0];
    }
    return code;
  },

  isFemaleOnlyRoom(room) {
    const restriction = String(room.gender_restriction || 'none').trim().toLowerCase();
    if (restriction === 'female') return true;
    return restriction === 'none' && ['dorm-2', 'dorm-4', 'dorm-7'].indexOf(this.canonicalBuildingCode(room.building_code)) !== -1;
  },

  isMaleOnlyRoom(room) {
    return String(room.gender_restriction || 'none').trim().toLowerCase() === 'male';
  },

  toggleRoom(e) {
    const id = this.normalizeId(e.currentTarget.dataset.id);
    const sel = this.data.selectedRoomIds;
    const next = sel.slice();
    const index = next.indexOf(id);
    if (index >= 0) {
      next.splice(index, 1);
    } else {
      next.push(id);
    }
    this.setData({
      selectedRoomIds: next
    });
    this.refreshDisplayLists();
  },

  toggleStudent(e) {
    const id = this.normalizeId(e.currentTarget.dataset.id);
    const sel = this.data.selectedStudentIds;
    const next = sel.slice();
    const index = next.indexOf(id);
    if (index >= 0) {
      next.splice(index, 1);
    } else {
      next.push(id);
    }
    this.setData({
      selectedStudentIds: next
    });
    this.refreshDisplayLists();
  },

  onRoomFilter(e) { this.setData({ roomFilter: e.detail.value }); this.refreshDisplayLists(); },
  onStudentFilter(e) { this.setData({ studentFilter: e.detail.value }); this.refreshDisplayLists(); },
  onTitleInput(e) { this.setData({ taskTitle: e.detail.value }); },
  onDueDateChange(e) { this.setData({ dueDate: e.detail.value }); },
  onCycleChange(e) {
    const index = Number(e.detail.value) || 0;
    this.setData({
      cycleIndex: index,
      cycleType: this.data.cycleOptions[index] || this.data.cycleOptions[0],
      cycleLabel: this.data.cycleLabels[index] || this.data.cycleLabels[0],
    });
  },

  selectAllRooms() {
    const q = this.data.roomFilter.trim().toLowerCase();
    const selectedMap = {};
    const ids = [];
    let i;
    for (i = 0; i < this.data.selectedRoomIds.length; i += 1) {
      selectedMap[this.data.selectedRoomIds[i]] = true;
      ids.push(this.data.selectedRoomIds[i]);
    }
    for (i = 0; i < this.data.rooms.length; i += 1) {
      const r = this.data.rooms[i];
      const roomCode = String(r.room_code || '').toLowerCase();
      const building = String(r.building_name || r.building_code || '').toLowerCase();
      if (q && roomCode.indexOf(q) === -1 && building.indexOf(q) === -1) {
        continue;
      }
      if (!selectedMap[r.room_id]) {
        selectedMap[r.room_id] = true;
        ids.push(r.room_id);
      }
    }
    this.setData({ selectedRoomIds: ids });
    this.refreshDisplayLists();
  },
  clearRooms() { this.setData({ selectedRoomIds: [] }); this.refreshDisplayLists(); },

  findRoomById(id) {
    for (let i = 0; i < this.data.rooms.length; i += 1) {
      if (this.data.rooms[i].room_id === id) {
        return this.data.rooms[i];
      }
    }
    return null;
  },

  findStudentById(id) {
    for (let i = 0; i < this.data.students.length; i += 1) {
      if (this.data.students[i].student_user_id === id) {
        return this.data.students[i];
      }
    }
    return null;
  },

  filterStudentsByGender(studentIds, gender) {
    const result = [];
    for (let i = 0; i < studentIds.length; i += 1) {
      const student = this.findStudentById(studentIds[i]);
      if (student && student.gender === gender) {
        result.push(studentIds[i]);
      }
    }
    return result;
  },

  pickLeastAssignedStudent(studentIds, counts) {
    let selected = studentIds[0];
    let selectedCount = counts[selected] || 0;
    for (let i = 1; i < studentIds.length; i += 1) {
      const id = studentIds[i];
      const count = counts[id] || 0;
      if (count < selectedCount) {
        selected = id;
        selectedCount = count;
      }
    }
    return selected;
  },

  async onDispatch() {
    const taskTitle = this.data.taskTitle;
    const selectedRoomIds = this.data.selectedRoomIds;
    const selectedStudentIds = this.data.selectedStudentIds;
    const cycleType = this.data.cycleType;
    const dueDate = this.data.dueDate;
    if (!taskTitle.trim()) { wx.showToast({ title: '请填写任务标题', icon: 'none' }); return; }
    if (!selectedRoomIds.length || !selectedStudentIds.length) {
      wx.showToast({ title: '请选择房间和学生', icon: 'none' }); return;
    }
    if (!dueDate) { wx.showToast({ title: '请选择截止日期', icon: 'none' }); return; }

    const dueIso = new Date(dueDate + 'T23:59:00').toISOString();
    const rooms = this.data.rooms;
    const students = this.data.students;

    // 均分：楼栋优先分配
    const roomObjs = [];
    const stuIds = selectedStudentIds.slice();
    const counts = {};
    const buildingStu = {};
    const assignments = [];
    let i;

    for (i = 0; i < selectedRoomIds.length; i += 1) {
      const room = this.findRoomById(selectedRoomIds[i]);
      if (room) roomObjs.push(room);
    }
    for (i = 0; i < stuIds.length; i += 1) {
      counts[stuIds[i]] = 0;
    }

    for (i = 0; i < roomObjs.length; i += 1) {
      const room = roomObjs[i];
      const bk = room.building_code;
      let pool = stuIds;
      if (this.isFemaleOnlyRoom(room)) {
        pool = this.filterStudentsByGender(stuIds, 'female');
      } else if (this.isMaleOnlyRoom(room)) {
        pool = this.filterStudentsByGender(stuIds, 'male');
      }
      if (!pool.length) continue;
      const preferred = buildingStu[bk];
      const sid = (preferred && pool.indexOf(preferred) !== -1)
        ? preferred
        : this.pickLeastAssignedStudent(pool, counts);
      counts[sid] = (counts[sid] || 0) + 1;
      if (!buildingStu[bk]) buildingStu[bk] = sid;
      assignments.push({ room_id: room.room_id, student_user_id: sid });
    }

    if (!assignments.length) {
      wx.showToast({ title: '没有可派发的匹配组合', icon: 'none' });
      return;
    }

    this.setData({ dispatching: true, error: '', message: '' });
    try {
      for (let i = 0; i < assignments.length; i += 1) {
        const a = assignments[i];
        await api.createAssignment({
          task_title: taskTitle.trim(),
          cycle_type: cycleType,
          room_id: a.room_id,
          student_user_id: a.student_user_id,
          due_at: dueIso,
        });
      }
      this.setData({
        message: '成功派发 ' + assignments.length + ' 个任务',
        selectedRoomIds: [],
        selectedStudentIds: [],
      });
      this.refreshDisplayLists();
      wx.showToast({ title: '派发' + assignments.length + '个任务', icon: 'success' });
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      this.setData({ dispatching: false });
    }
  },
});

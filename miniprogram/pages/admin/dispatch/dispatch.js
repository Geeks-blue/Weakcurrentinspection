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
  },

  onLoad() {
    if (!getApp().isAdmin()) {
      wx.redirectTo({ url: '/pages/login/login' }); return;
    }
    const now = new Date();
    now.setDate(now.getDate() + 7);
    const y = now.getFullYear();
    const m = String(now.getMonth()+1).padStart(2,'0');
    const d = String(now.getDate()).padStart(2,'0');
    this.setData({ dueDate: `${y}-${m}-${d}` });
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
    const selectedRoomMap = this.data.selectedRoomIds.reduce((acc, id) => {
      acc[id] = true;
      return acc;
    }, {});
    const selectedStudentMap = this.data.selectedStudentIds.reduce((acc, id) => {
      acc[id] = true;
      return acc;
    }, {});

    const displayRooms = this.data.rooms
      .filter(r => {
        if (!roomQ) return true;
        return String(r.room_code || '').toLowerCase().includes(roomQ)
          || String(r.building_name || r.building_code || '').toLowerCase().includes(roomQ);
      })
      .map(r => ({
        ...r,
        selected: !!selectedRoomMap[r.room_id],
        buildingLabel: r.building_name || r.building_code || '',
      }));

    const displayStudents = this.data.students
      .filter(s => {
        if (!studentQ) return true;
        return String(s.username || '').toLowerCase().includes(studentQ);
      })
      .map(s => ({
        ...s,
        selected: !!selectedStudentMap[s.student_user_id],
        genderLabel: s.gender === 'female' ? '女' : s.gender === 'male' ? '男' : '未设置',
      }));

    this.setData({ displayRooms, displayStudents });
  },

  toggleRoom(e) {
    const id = e.currentTarget.dataset.id;
    const sel = this.data.selectedRoomIds;
    this.setData({
      selectedRoomIds: sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]
    });
    this.refreshDisplayLists();
  },

  toggleStudent(e) {
    const id = e.currentTarget.dataset.id;
    const sel = this.data.selectedStudentIds;
    this.setData({
      selectedStudentIds: sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]
    });
    this.refreshDisplayLists();
  },

  onRoomFilter(e) { this.setData({ roomFilter: e.detail.value }); this.refreshDisplayLists(); },
  onStudentFilter(e) { this.setData({ studentFilter: e.detail.value }); this.refreshDisplayLists(); },
  onTitleInput(e) { this.setData({ taskTitle: e.detail.value }); },
  onDueDateChange(e) { this.setData({ dueDate: e.detail.value }); },
  onCycleChange(e) { this.setData({ cycleType: this.data.cycleOptions[e.detail.value] }); },

  selectAllRooms() {
    const q = this.data.roomFilter.trim().toLowerCase();
    const visible = q
      ? this.data.rooms.filter(r => String(r.room_code || '').toLowerCase().includes(q) || String(r.building_name || r.building_code || '').toLowerCase().includes(q))
      : this.data.rooms;
    const ids = visible.map(r => r.room_id);
    this.setData({ selectedRoomIds: [...new Set([...this.data.selectedRoomIds, ...ids])] });
    this.refreshDisplayLists();
  },
  clearRooms() { this.setData({ selectedRoomIds: [] }); this.refreshDisplayLists(); },

  async onDispatch() {
    const { taskTitle, selectedRoomIds, selectedStudentIds, cycleType, dueDate } = this.data;
    if (!taskTitle.trim()) { wx.showToast({ title: '请填写任务标题', icon: 'none' }); return; }
    if (!selectedRoomIds.length || !selectedStudentIds.length) {
      wx.showToast({ title: '请选择房间和学生', icon: 'none' }); return;
    }
    if (!dueDate) { wx.showToast({ title: '请选择截止日期', icon: 'none' }); return; }

    const dueIso = new Date(dueDate + 'T23:59:00').toISOString();
    const rooms = this.data.rooms;
    const students = this.data.students;

    // 均分：楼栋优先分配
    const roomObjs = selectedRoomIds.map(id => rooms.find(r => r.room_id === id)).filter(Boolean);
    const stuIds = [...selectedStudentIds];
    const counts = new Map(stuIds.map(id => [id, 0]));
    const buildingStu = new Map();
    const assignments = [];

    for (const room of roomObjs) {
      const bk = room.building_code;
      const gender = room.gender_restriction || 'none';
      let pool = stuIds;
      if (gender === 'female') pool = stuIds.filter(id => {
        const student = students.find(s => s.student_user_id === id);
        return student && student.gender === 'female';
      });
      else if (gender === 'male') pool = stuIds.filter(id => {
        const student = students.find(s => s.student_user_id === id);
        return student && student.gender === 'male';
      });
      if (!pool.length) continue;
      const preferred = buildingStu.get(bk);
      const sid = (preferred && pool.includes(preferred))
        ? preferred
        : pool.reduce((a, b) => (counts.get(a) || 0) <= (counts.get(b) || 0) ? a : b);
      counts.set(sid, (counts.get(sid) || 0) + 1);
      if (!buildingStu.has(bk)) buildingStu.set(bk, sid);
      assignments.push({ room_id: room.room_id, student_user_id: sid });
    }

    if (!assignments.length) {
      wx.showToast({ title: '没有可派发的匹配组合', icon: 'none' });
      return;
    }

    this.setData({ dispatching: true, error: '', message: '' });
    try {
      await Promise.all(assignments.map(a =>
        api.createAssignment({
          task_title: taskTitle.trim(),
          cycle_type: cycleType,
          room_id: a.room_id,
          student_user_id: a.student_user_id,
          due_at: dueIso,
        })
      ));
      this.setData({
        message: `成功派发 ${assignments.length} 个任务`,
        selectedRoomIds: [],
        selectedStudentIds: [],
      });
      this.refreshDisplayLists();
      wx.showToast({ title: `派发${assignments.length}个任务`, icon: 'success' });
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      this.setData({ dispatching: false });
    }
  },

  goBack() { wx.navigateBack(); },
});

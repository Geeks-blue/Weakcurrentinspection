// utils/format.js  弱电巡检 - 格式化工具

const STATUS_LABEL = {
  todo: '待巡检',
  in_progress: '进行中',
  done: '已完成',
  submitted: '已提交',
  pending_review: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  rectify_required: '需整改',
  pending: '待审核',
};

const STATUS_CLASS = {
  todo: 'badge-pending',
  submitted: 'badge-submitted',
  pending_review: 'badge-pending',
  approved: 'badge-approved',
  rejected: 'badge-rejected',
  rectify_required: 'badge-rectify',
  done: 'badge-done',
  pending: 'badge-pending',
};

const LOCK_LABEL = {
  locked: '已锁',
  unlocked: '未锁',
  lock_damaged: '门锁损坏',
};

const CLUTTER_LABEL = {
  none: '无杂物',
  stacked_items: '有堆放物',
  water: '有积水',
  odor: '有异味',
};

const INDICATOR_LABEL = {
  all_ok: '全部正常',
  partial_abnormal: '个别异常',
  all_abnormal: '全部异常',
};

const ASSET_MATCH_LABEL = {
  matched: '与台账一致',
  missing: '资产缺失',
  extra: '资产多余',
  moved: '位置变动',
};

function formatStatus(status) {
  return STATUS_LABEL[status] || status;
}

function statusClass(status) {
  return STATUS_CLASS[status] || 'badge-pending';
}

function formatLock(v) { return LOCK_LABEL[v] || v; }
function formatClutter(v) { return CLUTTER_LABEL[v] || v; }
function formatIndicator(v) { return INDICATOR_LABEL[v] || v; }
function formatAssetMatch(v) { return ASSET_MATCH_LABEL[v] || v; }

function formatDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateShort(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = {
  formatStatus,
  statusClass,
  formatLock,
  formatClutter,
  formatIndicator,
  formatAssetMatch,
  formatDate,
  formatDateShort,
  LOCK_LABEL,
  CLUTTER_LABEL,
  INDICATOR_LABEL,
  ASSET_MATCH_LABEL,
};

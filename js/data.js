// Dữ liệu đã tải trên máy: đọc nhanh theo loại, tra theo ID, quyền phía client (chỉ để ẩn/hiện nút), tính hạn (1.4 §12.1)
import { session, todayVN } from './core.js';
import { getRecords, getMeta } from './sync.js';

/** Khóa chính theo loại hồ sơ (khớp SYNC_ENTITIES_ của máy chủ) */
export const KEY = {
  EQUIPMENT: 'equipment_id', EQUIPMENT_SPEC: 'spec_id', MATERIAL: 'material_id', EQUIPMENT_PART: 'equipment_part_id',
  EQUIPMENT_PART_EVENT: 'event_id', DOCUMENT: 'document_id', INSPECTION: 'inspection_id',
  INSPECTION_REQUIREMENT: 'requirement_id', INSPECTION_TYPE: 'inspection_type_id', LOCATION: 'location_id', VENDOR: 'vendor_id',
  LOOKUP: 'value_id', CONTRACT: 'contract_id', CONTRACT_EQUIPMENT: 'contract_equipment_id', CONTRACT_SERVICE: 'service_id',
  USER_PICK: 'user_id'
};
export const CODE = {
  EQUIPMENT: 'equipment_code', MATERIAL: 'material_code', INSPECTION: 'inspection_code', INSPECTION_REQUIREMENT: 'requirement_code',
  CONTRACT: 'contract_code', LOCATION: 'location_code', VENDOR: 'vendor_code'
};

let memo = {};
let bootMeta = null;

/** Xóa bộ nhớ tạm sau đồng bộ, đăng xuất */
export function invalidate() { memo = {}; bootMeta = null; }

export async function recs(type) {
  if (!memo[type]) memo[type] = await getRecords(type);
  return memo[type];
}

export async function byId(type, id) {
  if (!id) return null;
  const list = await recs(type);
  const k = KEY[type];
  return list.find((r) => r[k] === id) || null;
}

/** Bản đồ id → bản ghi */
export async function mapOf(type) {
  const k = KEY[type];
  const m = new Map();
  for (const r of await recs(type)) m.set(r[k], r);
  return m;
}

export async function boot() {
  if (!bootMeta) bootMeta = (await getMeta('bootstrap')) || {};
  return bootMeta;
}

/** Action được phép theo cấp/subrole (khối permissions của bootstrap; máy chủ vẫn kiểm lại) */
export function canSync(boot0, action) {
  const p = boot0 && boot0.permissions;
  return !!(p && Array.isArray(p.actions) && p.actions.indexOf(action) >= 0);
}
export async function can(action) { return canSync(await boot(), action); }

export async function costModules() {
  const b = await boot();
  return (b.permissions && b.permissions.cost_modules) || [];
}

export function roleLevel() { return Number(session.user && session.user.role_level) || 0; }
export function isOwner() { return !!(session.user && session.user.is_system_owner && roleLevel() === 4); }

/* ---------------- Ngày (giờ Việt Nam, ngày lịch) ---------------- */

function dayNum(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
}
export function isoFromDayNum(n) {
  const d = new Date(n * 86400000);
  return d.toISOString().slice(0, 10);
}
/** Số ngày lịch từ a tới b (b − a) */
export function daysBetween(a, b) {
  const x = dayNum(a), y = dayNum(b);
  return x === null || y === null ? null : y - x;
}
export function addDays(iso, n) {
  const x = dayNum(iso);
  return x === null ? null : isoFromDayNum(x + n);
}
/** Hôm nay theo máy chủ (TEST_TODAY ở THỬ) nếu có, không thì theo đồng hồ máy, giờ Việt Nam */
export function today() {
  const off = Number(session.settings && session.settings.__today_offset_days) || 0;
  const t = todayVN();
  return off ? addDays(t, off) : t;
}
/** Thứ trong tuần: 1 = Thứ Hai … 7 = Chủ nhật */
export function weekday(iso) {
  const n = dayNum(iso);
  return ((n + 3) % 7 + 7) % 7 + 1; // 1970-01-01 là Thứ Năm
}
export function weekStart(iso) {
  return addDays(iso, 1 - weekday(iso));
}

/**
 * Trạng thái hạn (1.4 §12.1): >40 NOT_DUE, 1…40 DUE_SOON, 0 DUE_TODAY, <0 OVERDUE, không có ngày hợp lệ MISSING.
 * Trả {state, days, key, vars}
 */
export function dueInfo(dueDate, todayIso = today(), leadDays) {
  const lead = Number(leadDays || (session.settings && session.settings.lead_days) || 40);
  const d = daysBetween(todayIso, dueDate);
  if (d === null) return { state: 'MISSING', days: null, key: 'due_state.MISSING' };
  if (d > lead) return { state: 'NOT_DUE', days: d, key: 'due_state.NOT_DUE' };
  if (d > 0) return { state: 'DUE_SOON', days: d, key: 'due_state.DUE_SOON', vars: { N: d } };
  if (d === 0) return { state: 'DUE_TODAY', days: 0, key: 'due_state.DUE_TODAY' };
  return { state: 'OVERDUE', days: d, key: 'due_state.OVERDUE', vars: { N: -d } };
}

/** Ngày tham chiếu của hợp đồng (2.7): min(hạn báo gia hạn, ngày hết hạn) */
export function contractRefDate(c) {
  const end = c.end_date || '', rn = c.renewal_notice_date || '';
  if (rn && end && rn < end) return { date: rn, kind: 'RENEWAL_NOTICE' };
  return { date: end || rn || '', kind: 'END_DATE' };
}

/**
 * record_status của yêu cầu kiểm định (3.17) từ các lần APPROVED/REVOKED mới nhất
 */
export function requirementRecordStatus(req, inspections) {
  if (req.operational_status === 'SUSPENDED') return 'SUSPENDED';
  const list = inspections.filter((i) => i.requirement_id === req.requirement_id && (i.status === 'APPROVED' || i.status === 'REVOKED'))
    .sort((a, b) => String(b.inspection_date).localeCompare(String(a.inspection_date)));
  const last = list[0];
  if (!last) return 'INCOMPLETE';
  if (last.status === 'REVOKED') return 'REVOKED';
  if (last.result === 'FAIL') return 'FAILED';
  return 'VALID';
}

/**
 * Các mục có hạn (trang chủ, Nhắc hạn): kiểm định theo current_due_date; hợp đồng theo ngày tham chiếu.
 * Trả [{kind:'INSPECTION'|'CONTRACT', id, code, rec, date, ref_kind, due, record_status, equipment_id, location_id, owner_user_id, href}]
 */
export async function deadlineItems() {
  const t = today();
  const out = [];
  const insp = await recs('INSPECTION');
  for (const r of await recs('INSPECTION_REQUIREMENT')) {
    if (r.active === false) continue;
    out.push({
      kind: 'INSPECTION', id: r.requirement_id, code: r.requirement_code, rec: r, date: r.current_due_date || '', ref_kind: 'VALID_TO',
      due: dueInfo(r.current_due_date, t), record_status: requirementRecordStatus(r, insp),
      equipment_id: r.equipment_id, location_id: r.location_id, owner_user_id: r.owner_user_id,
      type_id: r.inspection_type_id, href: '/inspections/' + r.requirement_id
    });
  }
  for (const c of await recs('CONTRACT')) {
    if (c.lifecycle_status && c.lifecycle_status !== 'ACTIVE') continue;
    const ref = contractRefDate(c);
    out.push({
      kind: 'CONTRACT', id: c.contract_id, code: c.contract_code, rec: c, date: ref.date, ref_kind: ref.kind, due: dueInfo(ref.date, t),
      end_date: c.end_date, renewal_notice_date: c.renewal_notice_date, owner_user_id: c.owner_user_id, href: '/contracts/' + c.contract_id
    });
  }
  return out;
}

/** Sắp xếp Nhắc hạn (5.2): quá hạn lâu nhất → hôm nay → sắp tới hạn (ít ngày trước) → chưa đủ hồ sơ */
export function dueSort(a, b) {
  const rank = (x) => ({ OVERDUE: 0, DUE_TODAY: 1, DUE_SOON: 2, NOT_DUE: 3, MISSING: 4 }[x.due.state]);
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (a.due.days !== null && b.due.days !== null && a.due.days !== b.due.days) return a.due.days - b.due.days;
  return String(a.code || '').localeCompare(String(b.code || ''));
}

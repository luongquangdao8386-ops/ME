// Phiếu công việc Đợt 2 (bảo trì, sửa chữa): gộp nháp trên máy lên bản máy chủ, điều kiện Gửi nghiệm thu (5.1.1, C8),
// danh sách Công việc (5.2), quyền phía client (chỉ để ẩn/hiện nút; máy chủ kiểm lại)
import { session, bi, badge, esc, nameText, fmtNumber } from './core.js';
import { recs, mapOf, can, today, daysBetween } from './data.js';
import { queueItems, enqueue } from './sync.js';

export const WO_OPEN = new Set(['DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_ACCEPTANCE']);
export const REPAIR_OPEN = new Set(['REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_ACCEPTANCE']);
export const PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];
export const SEVERITIES = ['HIGH', 'MEDIUM', 'LOW'];

export const uid = () => (session.user && session.user.user_id) || '';
export const level = () => Number(session.user && session.user.role_level) || 0;

/** Thao tác của tôi trong hàng chờ (thế hệ dữ liệu hiện tại) */
export async function myQueue() {
  const u = uid();
  return (await queueItems().catch(() => [])).filter((o) => o.user_id === u && o.dataset_epoch === session.epoch);
}

/* ---------------- Gộp nháp lên bản máy chủ ---------------- */

/**
 * Phiếu bảo trì + kết quả checklist sau khi áp các mục chờ gửi của tôi (maintenance.execute/submit theo thứ tự).
 * Trả {wo, results, local: bool, pending: [ops], blocked: bool, rejected: [ops]}
 */
export function overlayWorkOrder(wo, results, ops) {
  const mine = ops.filter((o) => o.entity_id === wo.work_order_id || o.parent_id === wo.work_order_id);
  const w = { ...wo };
  const rs = results.map((r) => ({ ...r }));
  const byId = new Map(rs.map((r) => [r.result_id, r]));
  const open = mine.filter((o) => o.state !== 'REJECTED' && o.state !== 'CONFLICT');
  for (const o of open) {
    const p = o.payload || {};
    if (o.action === 'maintenance.execute') {
      if (w.status === 'ASSIGNED') w.status = 'IN_PROGRESS';
      for (const k of ['start_at', 'end_at', 'downtime_start_at', 'downtime_end_at', 'downtime_note', 'labor_minutes', 'operating_hours', 'overall_result', 'result_vi', 'result_zh']) {
        if (p[k] !== undefined) w[k] = p[k];
      }
      for (const r of p.results || []) {
        const cur = byId.get(r.result_id);
        if (!cur) continue;
        for (const k of ['result_status', 'measured_value', 'note_vi', 'note_zh']) if (r[k] !== undefined) cur[k] = r[k];
        cur._local = true;
      }
      w._local = true;
    }
    if (o.action === 'maintenance.submit') { w.status = 'PENDING_ACCEPTANCE'; w._local = true; w._local_submit = true; }
  }
  return {
    wo: w, results: rs, local: open.length > 0, pending: open,
    blocked: open.some((o) => o.blocked), rejected: mine.filter((o) => o.state === 'REJECTED' || o.state === 'CONFLICT')
  };
}

/** Phiếu sửa chữa + việc con sau khi áp các mục chờ gửi của tôi (repair.editReport/process/submit) */
export function overlayRepair(rep, tasks, ops) {
  const mine = ops.filter((o) => o.entity_id === rep.repair_id || o.parent_id === rep.repair_id);
  const r = { ...rep };
  const ts = tasks.map((t) => ({ ...t }));
  const open = mine.filter((o) => o.state !== 'REJECTED' && o.state !== 'CONFLICT');
  for (const o of open) {
    const p = o.payload || {};
    if (o.action === 'repair.editReport' || o.action === 'repair.process') {
      if (o.action === 'repair.process' && r.status === 'ASSIGNED') r.status = 'IN_PROGRESS';
      for (const [k, v] of Object.entries(p)) if (k !== 'repair_id' && k !== 'tasks') r[k] = v;
      for (const t of p.tasks || []) {
        const cur = ts.find((x) => x.repair_task_id === t.repair_task_id);
        if (t.remove) { if (cur) cur._removed = true; continue; }
        if (cur) { Object.assign(cur, t, { _local: true }); } else ts.push({ status: 'PENDING', ...t, _local: true });
      }
      r._local = true;
    }
    if (o.action === 'repair.submit') { r.status = 'PENDING_ACCEPTANCE'; r._local = true; r._local_submit = true; }
  }
  return { repair: r, tasks: ts.filter((t) => !t._removed), local: open.length > 0, pending: open, blocked: open.some((o) => o.blocked), rejected: mine.filter((o) => o.state === 'REJECTED' || o.state === 'CONFLICT') };
}

/** Phiếu tạo trên máy chưa gửi (maintenance.wo.create, repair.report): bản giả có nhãn Chờ cấp mã */
export function localCreations(ops) {
  const wos = [], reps = [];
  for (const o of ops) {
    if (o.state === 'REJECTED') continue;
    const p = o.payload || {};
    if (o.action === 'maintenance.wo.create') {
      wos.push({ work_order_id: p.work_order_id, work_order_code: '', equipment_id: p.equipment_id, title_vi: p.title_vi || '', title_zh: p.title_zh || '', due_date: p.due_date || today(), status: 'DRAFT', priority: p.priority || 'NORMAL', created_by: uid(), _local: true, _op: o });
    }
    if (o.action === 'repair.report') {
      reps.push({ repair_id: p.repair_id, repair_code: '', equipment_id: p.equipment_id, symptom_vi: p.symptom_vi || '', symptom_zh: p.symptom_zh || '', severity: p.severity, priority: 'NORMAL', status: 'REPORTED', reported_by: uid(), reported_at: o.local_created_at, stopped_at: p.stopped_at || (p.machine_stopped ? o.local_created_at : ''), _local: true, _op: o });
    }
  }
  return { wos, reps };
}

/* ---------------- Điều kiện Gửi nghiệm thu (5.1.1) — client kiểm trước, máy chủ kiểm lại ---------------- */

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

/** Trả [{field, key, vars?}] — field dạng results[<id>] để cuộn tới mục thiếu đầu tiên (C8) */
export function woSubmitIssues(w, results, usage = []) {
  const out = [];
  let anyFail = false;
  for (const r of results) {
    const f = `results[${r.result_id}]`;
    const st = r.result_status || 'PENDING';
    if (st === 'FAIL') anyFail = true;
    if (r.required !== false && st !== 'PASS' && st !== 'FAIL') { out.push({ field: f, key: 'mt.issue.item_missing', step: r.step_no }); continue; }
    const hasNote = !!(String(r.note_vi || '').trim() || String(r.note_zh || '').trim());
    const mv = num(r.measured_value);
    if (r.result_type === 'NUMBER' && r.required !== false && (mv === null || Number.isNaN(mv))) { out.push({ field: f, key: 'mt.issue.item_missing', step: r.step_no }); continue; }
    if (r.result_type === 'NUMBER' && mv !== null && st === 'PASS' && outOfRange(r, mv) && !hasNote) out.push({ field: f, key: 'mt.issue.range_note', step: r.step_no });
    if (st === 'FAIL' && !hasNote) out.push({ field: f, key: 'mt.issue.fail_note', step: r.step_no });
  }
  if (!w.overall_result) out.push({ field: 'overall_result', key: 'mt.issue.overall' });
  else if (anyFail && w.overall_result !== 'FAIL') out.push({ field: 'overall_result', key: 'mt.issue.overall_mismatch' });
  const s = Date.parse(w.start_at || ''), e = Date.parse(w.end_at || '');
  if (!w.start_at) out.push({ field: 'start_at', key: 'mt.issue.start' });
  if (!w.end_at) out.push({ field: 'end_at', key: 'mt.issue.end' });
  if (w.start_at && w.end_at && (s > e || e > Date.now() + 5 * 60000)) out.push({ field: 'end_at', key: 'mt.issue.time_order' });
  if (w.downtime_start_at && !w.downtime_end_at && !String(w.downtime_note || '').trim()) out.push({ field: 'downtime_note', key: 'mt.issue.downtime_note' });
  if (w.downtime_start_at && w.downtime_end_at && Date.parse(w.downtime_start_at) > Date.parse(w.downtime_end_at)) out.push({ field: 'downtime_end_at', key: 'mt.issue.time_order' });
  for (const u of usage) if (Number(u.actual_used_qty || 0) < 0 || Number(u.scrap_qty || 0) < 0) out.push({ field: 'usage', key: 'mt.issue.usage' });
  return { issues: out, anyFail };
}

export function outOfRange(r, v) {
  const lo = num(r.min_value), hi = num(r.max_value);
  return (lo !== null && v < lo) || (hi !== null && v > hi);
}

export function repairSubmitIssues(r, tasks) {
  const out = [];
  if (!r.repair_start_at) out.push({ field: 'repair_start_at', key: 'rp.issue.start' });
  if (!r.repair_end_at) out.push({ field: 'repair_end_at', key: 'rp.issue.end' });
  if (!r.test_run_result) out.push({ field: 'test_run_result', key: 'rp.issue.test_run' });
  if (r.repair_start_at && r.repair_end_at && (Date.parse(r.repair_start_at) > Date.parse(r.repair_end_at) || Date.parse(r.repair_end_at) > Date.now() + 5 * 60000)) out.push({ field: 'repair_end_at', key: 'mt.issue.time_order' });
  if (r.stopped_at && r.restored_at && Date.parse(r.stopped_at) > Date.parse(r.restored_at)) out.push({ field: 'restored_at', key: 'mt.issue.time_order' });
  if (r.stopped_at && !r.restored_at && !String(r.downtime_note || '').trim()) out.push({ field: 'downtime_note', key: 'mt.issue.downtime_note' });
  for (const t of tasks) if (t.status === 'PENDING' || t.status === 'IN_PROGRESS') out.push({ field: `tasks[${t.repair_task_id}]`, key: 'rp.issue.task_open' });
  return out;
}

/* ---------------- Bước tiếp theo trên phiếu ---------------- */

/**
 * Dòng "Bước tiếp" trên phiếu BT/SC: ai bấm gì tiếp theo. next = {key, vars?, target?, at: 'top' | 'exec', wait?}.
 * here: chỗ đặt dòng ('top' đầu phiếu, 'exec' cuối khung Thực hiện/Xử lý); nút nằm ở chỗ khác thì kèm link "Tới nút".
 */
export function nextStepHtml(next, here) {
  if (!next) return '';
  const go = next.target && next.at !== here ? ` <button type="button" class="link small" data-jump="${esc(next.target)}">${bi('wk.next_go')}</button>` : '';
  return `<p class="next-step${next.wait ? ' wait' : ''}">${bi(next.key, next.vars)}${go}</p>`;
}

/** Link "Tới nút": cuộn tới nút và nháy sáng */
export function wireNextStep(view) {
  view.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => {
    const el = view.querySelector('#' + CSS.escape(b.dataset.jump));
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600);
  }));
}

/* ---------------- Danh sách Công việc (5.2) ---------------- */

/** Nhóm theo hạn: Quá hạn, Hôm nay, Sắp tới, Chờ nghiệm thu */
function groupOf(kind, rec) {
  if (rec.status === 'PENDING_ACCEPTANCE') return 'PENDING_ACCEPTANCE';
  const d = kind === 'WO' ? rec.due_date : String(rec.reported_at || '').slice(0, 10);
  if (kind === 'REPAIR') return 'TODAY'; // sự cố đang mở luôn là việc cần làm ngay
  const n = daysBetween(today(), d);
  if (n === null) return 'UPCOMING';
  if (n < 0) return 'OVERDUE';
  if (n === 0) return 'TODAY';
  return 'UPCOMING';
}

/**
 * Phiếu bảo trì/sửa chữa đang mở (kể cả phiếu tạo trên máy chưa gửi). opts.mine: chỉ của tôi (được giao, tôi báo/lập).
 * Trả [{kind, id, code, rec, eq, loc, date, group, href, local, sortKey}]
 */
export async function workItems({ mine = false, kinds = ['WO', 'REPAIR'] } = {}) {
  const ops = await myQueue();
  const eqs = await mapOf('EQUIPMENT');
  const locs = await mapOf('LOCATION');
  const tasks = await recs('REPAIR_TASK');
  const u = uid();
  const loc = { wos: [], reps: [] };
  Object.assign(loc, localCreations(ops));
  const out = [];
  if (kinds.includes('WO')) {
    for (const w0 of [...(await recs('WORK_ORDER')), ...loc.wos]) {
      if (!WO_OPEN.has(w0.status)) continue;
      const w = w0._local ? w0 : overlayWorkOrder(w0, [], ops).wo;
      if (mine && w.assignee_user_id !== u && w.created_by !== u) continue;
      const e = eqs.get(w.equipment_id);
      out.push({ kind: 'WO', id: w.work_order_id, code: w.work_order_code, rec: w, eq: e, loc: e ? locs.get(e.location_id) : null, date: w.due_date, group: groupOf('WO', w), href: '/maintenance/wo/' + w.work_order_id, local: !!w._local });
    }
  }
  if (kinds.includes('REPAIR')) {
    for (const r0 of [...(await recs('REPAIR')), ...loc.reps]) {
      if (!REPAIR_OPEN.has(r0.status)) continue;
      const r = overlayRepair(r0, [], ops).repair;
      const assignees = [r.assignee_user_id, ...tasks.filter((t) => t.repair_id === r.repair_id).map((t) => t.assignee_user_id)];
      if (mine && !assignees.includes(u) && r.reported_by !== u) continue;
      const e = eqs.get(r.equipment_id);
      out.push({ kind: 'REPAIR', id: r.repair_id, code: r.repair_code, rec: r, eq: e, loc: e ? locs.get(e.location_id) : null, date: String(r.reported_at || '').slice(0, 10), group: groupOf('REPAIR', r), href: '/repairs/' + r.repair_id, local: !!r._local });
    }
  }
  const rank = { OVERDUE: 0, TODAY: 1, PENDING_ACCEPTANCE: 2, UPCOMING: 3 };
  const prio = (x) => PRIORITIES.indexOf(x.rec.priority || 'NORMAL');
  out.sort((a, b) => rank[a.group] - rank[b.group] || String(a.date || '').localeCompare(String(b.date || '')) || prio(a) - prio(b) || String(a.code || '').localeCompare(String(b.code || '')));
  return out;
}

/* ---------------- Hiển thị ---------------- */

export function statusBadge(kind, status) {
  return badge((kind === 'WO' ? 'wo_status.' : 'repair_status.') + status);
}

/** Thẻ phụ: ưu tiên, mức độ (C4) */
export function prioBadges(rec, kind) {
  const p = rec.priority && rec.priority !== 'NORMAL' ? badge('priority.' + rec.priority) : '';
  const s = kind === 'REPAIR' && rec.severity ? badge('severity.' + rec.severity) : '';
  return [s, p].filter(Boolean).join(' ');
}

export function workTitle(item) {
  const r = item.rec;
  return item.kind === 'WO' ? (r.title_vi || r.title_zh ? biNameSafe(r, 'title') : '') : biNameSafe(r, 'symptom');
}

function biNameSafe(r, f) {
  const vi = r[f + '_vi'] || '', zh = r[f + '_zh'] || '';
  if (vi && zh && vi !== zh) return `<span class="vi">${esc(firstLine(vi))}</span> <span class="zh">${esc(firstLine(zh))}</span>`;
  return esc(firstLine(vi || zh));
}

function firstLine(s) { return String(s).split('\n')[0].slice(0, 140); }

export function eqText(e) { return e ? `${e.equipment_code} · ${nameText(e)}` : ''; }

/** Số lượng theo đơn vị cơ sở (5.4.1: tối đa 3 số lẻ) */
export function qtyText(v, unit) {
  if (v === '' || v === null || v === undefined) return '';
  return `${fmtNumber(v, 3)}${unit ? ' ' + esc(unit) : ''}`;
}

/** Quyền thao tác theo vai trò (chưa xét hồ sơ) */
export async function workPerms() {
  const p = {};
  for (const a of ['maintenance.view', 'maintenance.plan.edit', 'maintenance.checklist.edit', 'maintenance.wo.create', 'maintenance.assign', 'maintenance.execute',
    'maintenance.submit', 'maintenance.accept', 'maintenance.cancel', 'maintenance.hours.record', 'repair.view', 'repair.report', 'repair.editReport', 'repair.assign',
    'repair.process', 'repair.submit', 'repair.accept', 'repair.cancel', 'repair.reopen', 'matreq.create', 'matreq.submit', 'matreq.approve', 'matreq.cancel',
    'usage.record', 'usage.confirm', 'work.cost.edit', 'part.replace', 'qr.print', 'doc.upload', 'user.pickList']) p[a] = await can(a);
  return p;
}

/** Danh sách người nhận việc (C3/C4 có user.pickList) */
let pickCache = null;
/** Danh sách người làm đã tải (không gọi mạng); null nếu chưa có */
export const pickCached = () => pickCache;

export async function workerPick() {
  if (pickCache) return pickCache;
  const { api } = await import('./core.js');
  const r = await api('user.pickList', {}, { retry: true });
  pickCache = r.ok ? r.data.items : [];
  setTimeout(() => { pickCache = null; }, 60000);
  return pickCache;
}

/** Hàng chờ của phiếu: thêm thao tác gửi tuần tự sau các mục trước của cùng phiếu */
export function queueWork(action, payload, { entity_type, entity_id, expected_version, parent_id = '', chain = true, merge = null }) {
  return enqueue(action, payload, { entity_type, entity_id, expected_version, parent_id, chain, merge });
}

/** Gộp hai lần ghi maintenance.execute/repair.process chưa gửi (kết quả theo result_id, việc con theo repair_task_id) */
export function mergeExecPayload(a, b) {
  const out = { ...a, ...b };
  for (const key of ['results', 'tasks']) {
    const idk = key === 'results' ? 'result_id' : 'repair_task_id';
    if (!a[key] && !b[key]) continue;
    const m = new Map((a[key] || []).map((x) => [x[idk], { ...x }]));
    for (const x of b[key] || []) m.set(x[idk], { ...(m.get(x[idk]) || {}), ...x });
    out[key] = [...m.values()];
  }
  return out;
}


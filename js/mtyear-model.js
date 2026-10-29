// Kế hoạch bảo trì năm (d4.16, Bước 1) — phần tính, không phụ thuộc giao diện (test bằng Node: tests/server/mtyear_model.test.mjs).
// Dự kiến: lịch cố định của kế hoạch (ngày mốc + k × chu kỳ, khớp occurrence_ ở máy chủ 26_maintenance) từ ngày lập kế hoạch;
// kế hoạch theo giờ chạy: chỉ ƯỚC TÍNH từ tốc độ chạy 90 ngày gần nhất (≥ 2 lần đọc cách ≥ 7 ngày), thiếu số liệu thì không đoán.
// Thực hiện: phiếu bảo trì của kế hoạch (cùng hạn, hoặc cùng tháng), hạn kiểm định + chứng nhận đã duyệt, dịch vụ nhà thầu.
// Nhóm theo Loại thiết bị (Equipment.category_id); máy chưa phân loại vào nhóm riêng.

const pad2 = (n) => String(n).padStart(2, '0');
const dnum = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null;
};
const fromDnum = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const addDaysIso = (iso, n) => fromDnum(dnum(iso) + n);
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dayOf = (t) => String(t || '').slice(0, 10);

/** Cộng n tháng; ngày vượt cuối tháng lấy ngày cuối tháng (như addMonthsIso_ ở máy chủ) */
function addMonthsIso(iso, n, anchorDay) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  let y = +m[1], mo = +m[2] - 1 + n;
  y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
  const d = Math.min(anchorDay || +m[3], daysInMonth(y, mo + 1));
  return `${y}-${pad2(mo + 1)}-${pad2(d)}`;
}

/** Lần thứ k (k ≥ 0) của chuỗi mốc */
export function occurrence(plan, k) {
  const a = String(plan.anchor_date);
  const n = Number(plan.interval_value);
  if (plan.interval_type === 'MONTH') return addMonthsIso(a, k * n, +a.slice(8, 10));
  return addDaysIso(a, k * n);
}

/** Các lần của chuỗi mốc (kế hoạch ngày/tháng) trong [from, to] */
export function planDates(plan, from, to) {
  const a = String(plan.anchor_date || '');
  const n = Number(plan.interval_value);
  if (plan.interval_type === 'OPERATING_HOURS' || dnum(a) === null || !(n > 0) || a > to) return [];
  let k = 0;
  if (a < from) {
    k = plan.interval_type === 'MONTH'
      ? Math.max(0, Math.floor(((+from.slice(0, 4) - +a.slice(0, 4)) * 12 + (+from.slice(5, 7) - +a.slice(5, 7))) / n) - 1)
      : Math.max(0, Math.floor((dnum(from) - dnum(a)) / n) - 1);
  }
  const out = [];
  for (let g = 0; g < 2000; g++, k++) {
    const o = occurrence(plan, k);
    if (o > to) break;
    if (o >= from) out.push(o);
  }
  return out;
}

/**
 * Tốc độ giờ chạy (giờ/ngày) từ các lần đọc của một máy: chỉ sau lần đặt lại đồng hồ gần nhất, trong 90 ngày tới lần đọc mới nhất;
 * cần ≥ 2 lần đọc cách nhau ≥ 7 ngày và giờ tăng. Trả {perDay, latestHours, latestDate} hoặc null (chưa đủ số liệu).
 */
export function hoursRate(readings) {
  const list = (readings || []).filter((r) => !r.archived_at && r.measured_at && isFinite(Number(r.cumulative_hours)))
    .sort((a, b) => String(a.measured_at).localeCompare(String(b.measured_at)));
  let start = 0;
  list.forEach((r, i) => { if (r.is_reset === true) start = i; });
  const seg = list.slice(start);
  if (seg.length < 2) return null;
  const last = seg[seg.length - 1];
  const lastDay = dnum(dayOf(last.measured_at));
  const win = seg.filter((r) => lastDay - dnum(dayOf(r.measured_at)) <= 90);
  const first = win[0];
  const span = lastDay - dnum(dayOf(first.measured_at));
  const dh = Number(last.cumulative_hours) - Number(first.cumulative_hours);
  if (win.length < 2 || span < 7 || !(dh > 0)) return null;
  return { perDay: dh / span, latestHours: Number(last.cumulative_hours), latestDate: dayOf(last.measured_at) };
}

/**
 * Ngày ước tính các lần bảo trì theo giờ chạy trong [max(from, hôm nay), to]: mốc kế tiếp = operating_hours_target (hoặc giờ lần làm
 * trước + chu kỳ), rồi mỗi chu kỳ ÷ tốc độ. Có phiếu đang mở thì lần đầu là phiếu đó (bỏ một lần ước tính).
 */
export function hoursDates(plan, rate, from, to, today, hasOpenWo) {
  const n = Number(plan.interval_value);
  if (!rate || !(n > 0)) return [];
  const target = Number(plan.operating_hours_target) > 0 ? Number(plan.operating_hours_target) : (Number(plan.last_done_hours) || 0) + n;
  const step = n / rate.perDay;
  let d = rate.latestHours >= target ? dnum(today) : dnum(rate.latestDate) + Math.ceil((target - rate.latestHours) / rate.perDay);
  if (d < dnum(today)) d = dnum(today);
  if (hasOpenWo) d += Math.round(step);
  const out = [];
  const lo = Math.max(dnum(from), dnum(today)), hi = dnum(to);
  for (let g = 0; g < 400 && d <= hi; g++, d += Math.max(1, Math.round(step))) if (d >= lo) out.push(fromDnum(d));
  return out;
}

const WO_OPEN_ST = { DRAFT: 1, ASSIGNED: 1, IN_PROGRESS: 1, PENDING_ACCEPTANCE: 1 };

/** Trạng thái một lần theo phiếu: done (đúng hạn) · late (xong sau hạn) · open · overdue · cancelled */
function woState(w, due, today) {
  if (w.status === 'COMPLETED') return w.end_at && dayOf(w.end_at) > due ? 'late' : 'done';
  if (w.status === 'CANCELLED') return 'cancelled';
  return due < today ? 'overdue' : 'open';
}

/** Một lần đã "tới hạn" để tính %: hạn đã qua, hoặc đã làm xong (kể cả làm sớm). Ước tính và phiếu ngoài lịch không tính. */
export const isDueEntry = (e, today) => !e.est && !e.extra && (e.date < today || e.st === 'done' || e.st === 'late');
const isDoneEntry = (e) => e.st === 'done' || e.st === 'late';

/** Đếm cho một tập lần: kế hoạch (không tính ước tính/ngoài lịch), đã tới hạn, xong, đúng hạn, bỏ sót/quá hạn, ước tính, ngoài lịch */
export function tally(entries, today) {
  const t = { planned: 0, est: 0, extra: 0, due: 0, done: 0, onTime: 0, missed: 0 };
  for (const e of entries) {
    if (e.est) { t.est++; continue; }
    if (e.extra) { t.extra++; continue; }
    t.planned++;
    if (isDueEntry(e, today)) {
      t.due++;
      if (isDoneEntry(e)) t.done++;
      if (e.st === 'done') t.onTime++;
      if (e.st === 'missed' || e.st === 'overdue' || e.st === 'cancelled') t.missed++;
    }
  }
  return t;
}

/** Phần trăm (làm tròn) hoặc null khi chưa có lần nào tới hạn — không ghi 0 % giả */
export const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);

/**
 * Mô hình bảng năm. in = {year, today, equipment[], lookups[], plans[], workOrders[], readings[], requirements[], inspections[],
 * inspectionTypes[], services[], contractEquipment[], contracts[]}. Trả {year, groups[{key, name, rows[], months[12]: entries, tally}], tally}
 * rows: {kind: PLAN|HOURS|INSPECTION|SERVICE, eq, plan?, title, sub, months[12]: [{date, st, est?, extra?, ref}], tally}
 */
export function yearModel(inp) {
  const { year, today } = inp;
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const eqs = new Map((inp.equipment || []).map((e) => [e.equipment_id, e]));
  const cats = new Map((inp.lookups || []).filter((l) => l.group_key === 'EQUIPMENT_CATEGORY').map((l) => [l.value_id, l]));
  const inYear = (d) => d && d >= from && d <= to;
  const monthOf = (d) => Number(d.slice(5, 7)) - 1;
  const rows = [];
  const newRow = (kind, eq, extra) => ({ kind, eq, months: Array.from({ length: 12 }, () => []), ...extra });
  const put = (row, e) => { if (inYear(e.date)) row.months[monthOf(e.date)].push(e); };

  // Phiếu theo kế hoạch
  const wosByPlan = new Map();
  for (const w of inp.workOrders || []) {
    if (!w.plan_id || !w.due_date) continue;
    if (!wosByPlan.has(w.plan_id)) wosByPlan.set(w.plan_id, []);
    wosByPlan.get(w.plan_id).push(w);
  }
  const readsByEq = new Map();
  for (const r of inp.readings || []) {
    if (!readsByEq.has(r.equipment_id)) readsByEq.set(r.equipment_id, []);
    readsByEq.get(r.equipment_id).push(r);
  }

  for (const p of inp.plans || []) {
    if (p.archived_at) continue;
    const eq = eqs.get(p.equipment_id);
    if (!eq || eq.archived_at) continue;
    const wos = (wosByPlan.get(p.plan_id) || []).filter((w) => inYear(w.due_date)).sort((a, b) => a.due_date.localeCompare(b.due_date));
    const hours = p.interval_type === 'OPERATING_HOURS';
    const row = newRow(hours ? 'HOURS' : 'PLAN', eq, { plan: p });
    const used = new Set();
    if (!hours) {
      // Lịch cố định từ ngày lập kế hoạch; kế hoạch ngừng: không dự kiến sau ngày ngừng (ngày sửa cuối) hay sau hôm nay
      const created = dayOf(p.created_at) || from;
      let end = to;
      if (p.active === false) { const stop = dayOf(p.updated_at) || today; end = [to, stop, today].sort()[0]; }
      const occ = planDates(p, created > from ? created : from, end);
      for (const d of occ) {
        let w = wos.find((x) => !used.has(x) && x.due_date === d);
        if (!w) w = wos.find((x) => !used.has(x) && x.due_date.slice(0, 7) === d.slice(0, 7));
        if (w) { used.add(w); put(row, { date: d, st: woState(w, d, today), ref: w }); } else put(row, { date: d, st: d < today ? 'missed' : 'planned' });
      }
      for (const w of wos) if (!used.has(w)) put(row, { date: w.due_date, st: woState(w, w.due_date, today), ref: w, extra: true });
    } else {
      // Theo giờ chạy: phiếu thật là các lần thực hiện; tương lai chỉ ước tính
      for (const w of wos) put(row, { date: w.due_date, st: woState(w, w.due_date, today), ref: w });
      const rate = hoursRate(readsByEq.get(p.equipment_id));
      row.rate = rate;
      if (p.active !== false) {
        const open = wos.some((w) => WO_OPEN_ST[w.status]);
        for (const d of hoursDates(p, rate, from, to, today, open)) put(row, { date: d, st: 'planned', est: true });
      }
    }
    if (p.active === false && !row.months.some((m) => m.length)) continue;
    rows.push(row);
  }

  // Kiểm định: hạn hiện hành trong năm + chứng nhận đã duyệt có ngày kiểm định trong năm
  const types = new Map((inp.inspectionTypes || []).map((t) => [t.inspection_type_id, t]));
  const insByReq = new Map();
  for (const i of inp.inspections || []) {
    if (i.status !== 'APPROVED' || !inYear(i.inspection_date)) continue;
    if (!insByReq.has(i.requirement_id)) insByReq.set(i.requirement_id, []);
    insByReq.get(i.requirement_id).push(i);
  }
  for (const r of inp.requirements || []) {
    if (r.active === false || r.archived_at) continue;
    const eq = eqs.get(r.equipment_id);
    if (!eq || eq.archived_at) continue;
    const row = newRow('INSPECTION', eq, { requirement: r, type: types.get(r.inspection_type_id) });
    for (const i of insByReq.get(r.requirement_id) || []) put(row, { date: i.inspection_date, st: 'done', ref: i });
    if (inYear(r.current_due_date)) put(row, { date: r.current_due_date, st: r.current_due_date < today ? 'missed' : 'planned', ref: r });
    if (row.months.some((m) => m.length)) rows.push(row);
  }

  // Dịch vụ nhà thầu theo máy (hợp đồng đang hiệu lực)
  const contracts = new Map((inp.contracts || []).map((c) => [c.contract_id, c]));
  const svcByCe = new Map();
  for (const s of inp.services || []) {
    if (!s.contract_equipment_id) continue;
    if (!svcByCe.has(s.contract_equipment_id)) svcByCe.set(s.contract_equipment_id, []);
    svcByCe.get(s.contract_equipment_id).push(s);
  }
  for (const ce of inp.contractEquipment || []) {
    if (ce.archived_at) continue;
    const c = contracts.get(ce.contract_id);
    if (!c || c.archived_at) continue;
    const eq = eqs.get(ce.equipment_id);
    if (!eq || eq.archived_at) continue;
    const row = newRow('SERVICE', eq, { contractEquipment: ce, contract: c });
    const svcs = svcByCe.get(ce.contract_equipment_id) || [];
    for (const s of svcs) {
      if (s.performed_at) {
        const dd = dayOf(s.performed_at);
        put(row, { date: inYear(dd) ? dd : s.due_date, st: s.due_date && dd > s.due_date ? 'late' : 'done', ref: s });
      } else if (s.due_date) put(row, { date: s.due_date, st: s.due_date < today ? 'missed' : 'planned', ref: s });
    }
    if (c.lifecycle_status === 'ACTIVE' && inYear(ce.next_service_date) && !svcs.some((s) => s.due_date === ce.next_service_date)) {
      put(row, { date: ce.next_service_date, st: ce.next_service_date < today ? 'missed' : 'planned' });
    }
    if (row.months.some((m) => m.length)) rows.push(row);
  }

  // Nhóm theo loại thiết bị
  const KIND_ORDER = { PLAN: 0, HOURS: 0, INSPECTION: 1, SERVICE: 2 };
  const byCat = new Map();
  for (const row of rows) {
    const key = cats.has(row.eq.category_id) ? row.eq.category_id : '';
    if (!byCat.has(key)) byCat.set(key, { key, cat: cats.get(key) || null, rows: [] });
    byCat.get(key).rows.push(row);
  }
  const groups = [...byCat.values()];
  for (const g of groups) {
    g.rows.sort((a, b) => String(a.eq.equipment_code).localeCompare(String(b.eq.equipment_code)) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
      || String((a.plan && a.plan.plan_code) || '').localeCompare(String((b.plan && b.plan.plan_code) || '')));
    for (const r of g.rows) { r.months.forEach((m) => m.sort((x, y) => x.date.localeCompare(y.date))); r.tally = tally(r.months.flat(), today); }
    g.months = Array.from({ length: 12 }, (_, i) => g.rows.flatMap((r) => r.months[i]));
    g.monthTally = g.months.map((m) => tally(m, today));
    g.tally = tally(g.months.flat(), today);
    g.machines = new Set(g.rows.map((r) => r.eq.equipment_id)).size;
  }
  const catName = (g) => (g.cat ? String(g.cat.name_vi || g.cat.name_zh || g.cat.code || '') : '');
  groups.sort((a, b) => (a.key === '') - (b.key === '') || catName(a).localeCompare(catName(b), 'vi'));
  const allMonths = Array.from({ length: 12 }, (_, i) => groups.flatMap((g) => g.months[i]));
  return { year, today, from, to, groups, monthTally: allMonths.map((m) => tally(m, today)), tally: tally(allMonths.flat(), today) };
}

/* ---------------- So với bản kế hoạch năm đã duyệt (d4.18, Bước 3) ---------------- */

/** Khóa dòng: kế hoạch (cả theo giờ chạy) / yêu cầu kiểm định / máy trong hợp đồng — giống ref_id của bản chụp */
export function rowKey(r) {
  if (r.kind === 'PLAN' || r.kind === 'HOURS') return 'P:' + r.plan.plan_id;
  if (r.kind === 'INSPECTION') return 'I:' + r.requirement.requirement_id;
  return 'S:' + r.contractEquipment.contract_equipment_id;
}
const snapKey = (r) => (r.kind === 'PLAN' || r.kind === 'HOURS' ? 'P:' : (r.kind === 'INSPECTION' ? 'I:' : 'S:')) + r.ref_id;

/**
 * Đối chiếu bản chụp đã duyệt với tình hình hiện tại (mô hình yearModel cùng năm). Mỗi lần trong bản duyệt ghép với lần thực tế của
 * cùng dòng (cùng ngày, rồi cùng tháng); không có → quá ngày là bỏ sót, chưa tới là dự kiến. Lần thực tế chưa ghép: phiếu/chứng nhận/
 * dịch vụ đã làm hoặc đang làm → ngoài kế hoạch (extra); lịch dự kiến mới (kế hoạch lập/sửa sau khi duyệt) → added (không vào %).
 * Trả {entries[{date, st, base}], tally, months[12], extra, added}.
 */
export function compareBaseline(snap, model, today) {
  const live = new Map();
  for (const g of model.groups) for (const r of g.rows) live.set(rowKey(r), r);
  const used = new Set();
  const entries = [];
  for (const g of (snap && snap.groups) || []) {
    for (const r of g.rows || []) {
      const lr = live.get(snapKey(r));
      const list = lr ? lr.months.flat().filter((x) => !x.est) : [];
      for (const d of r.dates || []) {
        const e = list.find((x) => !used.has(x) && x.date === d) || list.find((x) => !used.has(x) && x.date.slice(0, 7) === d.slice(0, 7));
        if (e) used.add(e);
        const st = e ? e.st : (d < today ? 'missed' : 'planned');
        entries.push({ date: e && e.st === 'planned' && e.date > d ? e.date : d, st: st === 'planned' && !e && d < today ? 'missed' : st, base: d });
      }
    }
  }
  let extra = 0, added = 0;
  for (const r of live.values()) {
    for (const x of r.months.flat()) {
      if (x.est || used.has(x) || x.st === 'cancelled') continue;
      if (x.st === 'done' || x.st === 'late' || x.st === 'open' || x.st === 'overdue') extra++;
      else added++;
    }
  }
  const months = Array.from({ length: 12 }, (_, i) => tally(entries.filter((e) => Number(e.base.slice(5, 7)) - 1 === i), today));
  return { entries, tally: tally(entries, today), months, extra, added };
}

/** Đếm các lần của bản duyệt trong khoảng tháng [m0, m1] (0–11), vd một quý */
export function tallyMonths(entries, m0, m1, today) {
  return tally(entries.filter((e) => { const m = Number(e.base.slice(5, 7)) - 1; return m >= m0 && m <= m1; }), today);
}

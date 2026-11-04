// HOME-01 / WEB-HOME-01: logo 57 + M&E/机电管理 trên nền nhà máy, lưới 9 mục, bảng Việc cần làm (lịch tuần + thời hạn), bảng Công việc hôm nay (6.6)
import { bi, biText, esc, fmtDate, badge, nameText, session } from '../core.js';
import { brandHtml, ICON } from '../ui.js';
import * as shellMod from '../shell.js';
const { MODULES, isWide } = shellMod;
import { recs, mapOf, deadlineItems, today, weekStart, addDays, weekday, dueSort, daysBetween } from '../data.js';

const COUNT_TYPE = { equipment: 'EQUIPMENT', warehouse: 'MATERIAL', contracts: 'CONTRACT', inspections: 'INSPECTION_REQUIREMENT' };

/** Nội dung ngắn của một mục hạn: loại kiểm định + thiết bị, hoặc tên hợp đồng */
export async function deadlineText(it) {
  if (it.kind === 'INSPECTION') {
    const types = await mapOf('INSPECTION_TYPE');
    const eqs = await mapOf('EQUIPMENT');
    const t = types.get(it.type_id);
    const e = eqs.get(it.equipment_id);
    return [t ? nameText(t) : '', e ? `${e.equipment_code} ${nameText(e)}` : ''].filter(Boolean).join(' — ');
  }
  return nameText(it.rec, 'title');
}

const KIND_KEY = { INSPECTION: 'home.item_inspection', CONTRACT: 'home.item_contract', SERVICE: 'home.item_service', WO: 'home.item_wo', PLAN: 'cal.item_plan', REPAIR: 'home.item_repair', READING: 'home.item_reading' };
export function kindTag(kind) {
  return `<span class="kind k-${kind.toLowerCase()}">${bi(KIND_KEY[kind] || 'home.item_service')}</span>`;
}

/** Đợt 2, Đợt 3 đã chạy trên máy chủ */
const dot2 = () => shellMod.RELEASED_DOT >= 2;
const dot3 = () => shellMod.RELEASED_DOT >= 3;

/** Đồng hồ đang dùng và chỉ số của từng đồng hồ (máy chủ + chờ gửi trên máy) — Đợt 3 */
async function meterReads() {
  const meters = (await recs('METER')).filter((m) => !m.archived_at && m.active !== false);
  const by = new Map(meters.map((m) => [m.meter_id, []]));
  (await recs('METER_READING')).forEach((r) => { if (by.has(r.meter_id) && !r.archived_at) by.get(r.meter_id).push(r); });
  const { queueItems } = await import('../sync.js');
  (await queueItems().catch(() => [])).forEach((o) => {
    if (o.action === 'reading.create' && o.state !== 'REJECTED' && by.has(o.payload.meter_id)) by.get(o.payload.meter_id).push({ ...o.payload, status: 'VALID' });
  });
  return { meters, by };
}

/**
 * Việc theo ngày trong [from, to] cho lịch tuần (trang chủ) và lịch tháng: hạn kiểm định, hạn hợp đồng (hạn báo gia hạn, ngày hết hạn),
 * dịch vụ HĐ chưa làm (6.6), phiếu bảo trì theo hạn (Đợt 2) — không có mốc đọc chỉ số điện nước (d4.22); `plans` thêm hạn kế tiếp của kế hoạch bảo trì
 * chưa sinh phiếu (lịch tháng). Mỗi mục {date, kind, code, title, href, done, sub}.
 */
export async function calendarItems(from, to, { plans = false } = {}) {
  const out = [];
  const types = await mapOf('INSPECTION_TYPE');
  const eqs = await mapOf('EQUIPMENT');
  const eqText = (id) => { const e = eqs.get(id); return e ? `${e.equipment_code} ${nameText(e)}` : ''; };
  for (const r of await recs('INSPECTION_REQUIREMENT')) {
    if (r.active === false || !r.current_due_date) continue;
    if (r.current_due_date >= from && r.current_due_date <= to) {
      const ty = types.get(r.inspection_type_id);
      out.push({ date: r.current_due_date, kind: 'INSPECTION', code: r.requirement_code, href: '/inspections/' + r.requirement_id,
        title: [ty ? nameText(ty) : '', eqText(r.equipment_id)].filter(Boolean).join(' — ') });
    }
  }
  const contracts = new Map();
  for (const c of await recs('CONTRACT')) {
    contracts.set(c.contract_id, c);
    if (c.lifecycle_status !== 'ACTIVE') continue; // dự thảo, phiên cũ, đã kết thúc: không nhắc
    for (const [d, sub] of [[c.renewal_notice_date, 'RENEWAL'], [c.end_date, 'END']]) {
      if (d && d >= from && d <= to) out.push({ date: d, kind: 'CONTRACT', code: c.contract_code, href: '/contracts/' + c.contract_id, title: nameText(c, 'title'), sub });
    }
  }
  for (const s of await recs('CONTRACT_SERVICE')) {
    if (s.performed_at || !s.due_date) continue;
    if (s.due_date >= from && s.due_date <= to) {
      const c = contracts.get(s.contract_id);
      out.push({ date: s.due_date, kind: 'SERVICE', code: c ? c.contract_code : '', href: '/contracts/' + s.contract_id, title: c ? nameText(c, 'title') : '' });
    }
  }
  // Mốc đọc chỉ số điện nước không đưa vào lịch (người dùng yêu cầu 04/11/2026): việc đọc hằng ngày làm lịch rối;
  // số đồng hồ cần đọc vẫn ở ô Điện nước của trang chủ.
  // Phiếu bảo trì theo hạn (Đợt 2); kế hoạch chưa sinh phiếu cho hạn kế tiếp (lịch tháng)
  if (dot2()) {
    const wos = (await recs('WORK_ORDER')).filter((w) => w.status !== 'CANCELLED' && w.due_date);
    for (const w of wos) {
      if (w.due_date >= from && w.due_date <= to) out.push({ date: w.due_date, kind: 'WO', code: w.work_order_code, href: '/maintenance/wo/' + w.work_order_id, done: w.status === 'COMPLETED',
        title: [nameText(w, 'title'), eqText(w.equipment_id)].filter(Boolean).join(' — ') });
    }
    if (plans) {
      for (const p of await recs('MAINTENANCE_PLAN')) {
        if (p.active === false || p.archived_at || !p.next_due_date || p.next_due_date < from || p.next_due_date > to) continue;
        if (wos.some((w) => w.plan_id === p.plan_id && w.due_date === p.next_due_date)) continue;
        out.push({ date: p.next_due_date, kind: 'PLAN', code: p.plan_code, href: '/maintenance/plans/' + p.plan_id, title: [nameText(p, 'title'), eqText(p.equipment_id)].filter(Boolean).join(' — ') });
      }
    }
  }
  return out;
}

/** Bảng Công việc hôm nay (web): dịch vụ HĐ đến hạn/quá hạn chưa làm; kiểm định/hợp đồng đến hạn hôm nay hoặc quá hạn */
async function todayWorkHtml() {
  const t = today();
  const eqs = await mapOf('EQUIPMENT');
  const locs = await mapOf('LOCATION');
  const rows = [];
  for (const x of (await deadlineItems()).filter((d) => d.due.state === 'DUE_TODAY' || d.due.state === 'OVERDUE').sort(dueSort)) {
    const e = eqs.get(x.equipment_id);
    const l = locs.get(x.location_id || (e && e.location_id));
    rows.push({ kind: x.kind, code: x.code, href: x.href, text: await deadlineText(x), where: [e ? e.equipment_code : '', l ? l.location_code : ''].filter(Boolean).join(' · '), date: x.date, due: x.due, owner: x.rec.owner_name || '' });
  }
  for (const s of await recs('CONTRACT_SERVICE')) {
    if (s.performed_at || !s.due_date || s.due_date > t) continue;
    const d = daysBetween(t, s.due_date);
    rows.push({ kind: 'SERVICE', code: '', href: '/contracts/' + s.contract_id, text: '', where: '', date: s.due_date, due: d === 0 ? { key: 'due_state.DUE_TODAY' } : { key: 'due_state.OVERDUE', vars: { N: -d } }, owner: '' });
  }
  // Phiếu bảo trì đến hạn/quá hạn, sự cố đang mở (Đợt 2)
  if (dot2()) {
    const { workItems } = await import('../work.js');
    for (const x of (await workItems({ mine: false })).filter((i) => i.group === 'OVERDUE' || i.group === 'TODAY')) {
      const d = x.kind === 'WO' ? daysBetween(t, x.date) : null;
      rows.push({
        kind: x.kind, code: x.code, href: x.href, text: x.kind === 'WO' ? nameText(x.rec, 'title') : nameText(x.rec, 'symptom'),
        where: [x.eq ? x.eq.equipment_code : '', x.loc ? x.loc.location_code : ''].filter(Boolean).join(' · '), date: x.date,
        due: x.kind === 'REPAIR' ? { key: 'repair_status.' + x.rec.status } : (d === 0 ? { key: 'due_state.DUE_TODAY' } : { key: 'due_state.OVERDUE', vars: { N: -d } }),
        owner: x.rec.assignee_name || ''
      });
    }
  }
  return `<section class="card home-today"><div class="card-head"><h2>${bi('home.today_work')}</h2></div>
    ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr>
      <th>${bi('col.type')}</th><th>${bi('col.code')}</th><th>${bi('col.content')}</th><th>${bi('col.equipment_location')}</th><th>${bi('col.due')}</th><th>${bi('col.status')}</th><th>${bi('col.owner')}</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="click" data-href="${esc(r.href)}"><td>${kindTag(r.kind)}</td><td class="code">${esc(r.code)}</td><td>${esc(r.text)}</td><td>${esc(r.where)}</td><td class="num">${esc(fmtDate(r.date))}</td><td>${badge(r.due.key, r.due.vars)}</td><td>${esc(r.owner)}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="muted">${bi('home.no_work_today')}</p>`}
    ${dot2() ? '' : `<p class="muted dim-line">${bi('home.wo_coming')} — ${bi('tag.coming_soon')}</p>`}</section>`;
}

/** Ô "Chờ bạn xử lý" (C3/C4, Đợt 2): phiếu chờ nghiệm thu, đề nghị vật tư chờ duyệt */
async function pendingHtml() {
  if (!dot2()) return '';
  try {
    const m = await import('../work.js');
    return typeof m.pendingForMe === 'function' ? m.pendingPanelHtml(await m.pendingForMe()) : '';
  } catch (e) { console.warn(e); return ''; }
}

/* ---------------- Bố cục trang chủ (d4.30, người dùng chọn Mẫu 3): trái 9 ô chức năng to · phải bảng Việc cần làm ---------------- */

/** Dữ liệu trang chủ: tuần này, thời hạn, 9 ô chức năng */
async function homeData() {
  const t = today();
  const from = weekStart(t), to = addDays(from, 6);
  const items = await calendarItems(from, to);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const all = (await deadlineItems()).filter((x) => x.due.state !== 'NOT_DUE' && x.due.state !== 'MISSING').sort(dueSort);
  for (const x of all) x.text = await deadlineText(x);
  const soon = all.filter((x) => x.due.state === 'DUE_SOON' || x.due.state === 'DUE_TODAY');
  // Quá hạn: cùng nguồn với bảng Công việc hôm nay (d4.31 — trước chỉ lấy phiếu BT của tuần này nên sót phiếu quá hạn từ tuần trước):
  // kiểm định/hợp đồng quá hạn + phiếu bảo trì đang mở quá hạn (mọi ngày) + dịch vụ HĐ quá hạn chưa làm; quá hạn lâu nhất trước
  const over = all.filter((x) => x.due.state === 'OVERDUE').concat(await overdueWork(t));
  over.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  return { t, from, to, days, items, soon, over, tiles: await tileData() };
}

/** Phiếu bảo trì đang mở đã quá hạn (Đợt 2) và dịch vụ hợp đồng quá hạn chưa làm — dạng dòng của bảng Việc cần làm */
async function overdueWork(t) {
  const out = [];
  const eqs = await mapOf('EQUIPMENT');
  const eqText = (e) => (e ? `${e.equipment_code} ${nameText(e)}` : '');
  if (dot2()) {
    const { workItems } = await import('../work.js');
    for (const x of (await workItems({ mine: false, kinds: ['WO'] })).filter((i) => i.group === 'OVERDUE')) {
      out.push({ kind: 'WO', code: x.code, href: x.href, date: x.date, title: [nameText(x.rec, 'title'), eqText(x.eq || eqs.get(x.rec.equipment_id))].filter(Boolean).join(' — '),
        due: { state: 'OVERDUE', days: daysBetween(t, x.date) } });
    }
  }
  const contracts = await mapOf('CONTRACT');
  for (const s of await recs('CONTRACT_SERVICE')) {
    if (s.performed_at || !s.due_date || s.due_date >= t) continue;
    const c = contracts.get(s.contract_id);
    out.push({ kind: 'SERVICE', code: c ? c.contract_code : '', href: '/contracts/' + s.contract_id, date: s.due_date, title: c ? nameText(c, 'title') : '',
      due: { state: 'OVERDUE', days: daysBetween(t, s.due_date) } });
  }
  return out;
}

/** 9 ô chức năng: {m, soon, tail} — số hồ sơ, phiếu đang mở, đồng hồ cần đọc, số lộ, số mẫu báo cáo */
async function tileData() {
  const counts = {};
  for (const [k, type] of Object.entries(COUNT_TYPE)) counts[k] = (await recs(type)).length;
  const open = {};
  if (dot2()) {
    const { WO_OPEN, REPAIR_OPEN } = await import('../work.js');
    open.maintenance = (await recs('WORK_ORDER')).filter((w) => WO_OPEN.has(w.status)).length;
    open.repairs = (await recs('REPAIR')).filter((r) => REPAIR_OPEN.has(r.status)).length;
  }
  const extra = {};
  if (dot3()) {
    const { readingDue } = await import('../meters.js');
    const { meters, by } = await meterReads();
    const due = meters.filter((m) => readingDue(m, by.get(m.meter_id) || []).state !== 'DONE').length;
    if (due) extra.utilities = bi('home.meters_due', { N: due });
    else if (meters.length) extra.utilities = bi('home.records', { N: meters.length });
    const nc = (await recs('CIRCUIT')).filter((c) => !c.archived_at).length;
    if (nc) extra.circuits = bi('home.circuits_n', { N: nc });
    const nr = (await recs('REPORT_DEFINITION')).filter((d) => !d.archived_at && d.active !== false).length;
    if (nr) extra.reports = bi('home.reports_n', { N: nr });
  }
  return MODULES.map((m) => {
    const soon = m.dot > shellMod.RELEASED_DOT;
    const n = counts[m.key];
    const o = open[m.key];
    return { m, soon, tail: soon ? '' : (o ? bi('home.open_n', { N: o }) : (extra[m.key] || (n ? bi('home.records', { N: n }) : ''))) };
  });
}

/** Lưới 9 ô: iPhone 3×3 ô đứng; web ô nằm ngang (biểu tượng trái, chữ phải), cao theo bảng việc bên phải */
function tilesHtml(tiles) {
  return `<section class="grid9" aria-label="${esc(biText('menu.title'))}">${tiles.map(({ m, soon, tail }) => soon
    ? `<button type="button" class="tile dim" aria-disabled="true" data-soon="1"><span class="tile-ic">${ICON[m.icon]}</span><span class="tile-txt"><span class="tile-label">${bi('module.' + m.key)}</span><span class="soon">${bi('tag.coming_soon')}</span></span></button>`
    : `<a class="tile" href="#${m.path}"><span class="tile-ic">${ICON[m.icon]}</span><span class="tile-txt"><span class="tile-label">${bi('module.' + m.key)}</span>${tail ? `<span class="tile-count">${tail}</span>` : ''}</span></a>`).join('')}</section>`;
}

/** Đầu khung: ô biểu tượng theo màu khu + tiêu đề + phần phải */
const headHtml = (zone, icon, title, right = '') =>
  `<div class="hl-head"><span class="hl-ic ${zone}">${ICON[icon]}</span><h2>${bi(title)}</h2>${right}</div>`;
const monthBtn = () => `<a class="btn tiny hl-month" href="#/alerts/month">${ICON.calendar}<span>${bi('btn.month_calendar')}</span></a>`;
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Một dòng việc (danh sách): vạch màu theo loại, loại + mã, nội dung một dòng, nhãn phải */
const rowHtml = (x, right = '') => `<a class="hl-row ck-${x.kind.toLowerCase()}${x.done ? ' done' : ''}" href="#${esc(x.href)}">
  <span class="hl-row-top"><span class="hl-kind">${bi(KIND_KEY[x.kind] || 'home.item_service')}</span>${x.code ? `<span class="hl-code">${esc(x.code)}</span>` : ''}</span>
  ${x.title || x.text || right ? `<span class="hl-row-bot"><span class="hl-row-text">${esc(x.title || x.text || '')}</span>${right}</span>` : ''}</a>`;
const dueChip = (x) => (x.due.state === 'OVERDUE' ? `<span class="hl-due over">${bi('hl.days_over', { N: -x.due.days })}</span>`
  : x.due.state === 'DUE_TODAY' ? `<span class="hl-due over">${bi('cal.today')}</span>` : `<span class="hl-due soon">${bi('hl.days_left', { N: x.due.days })}</span>`)
  + (x.record_status === 'FAILED' || x.record_status === 'REVOKED' ? badge('record_status.' + x.record_status) : '');

/** Danh sách việc trong tuần theo ngày, từ hôm nay tới Chủ nhật */
function agendaHtml(d, { max = 12 } = {}) {
  const groups = d.days.filter((day) => day >= d.t).map((day) => ({ day, list: d.items.filter((x) => x.date === day) })).filter((g) => g.list.length);
  if (!groups.length) return `<div class="hl-empty">${ICON.calendar}<span>${bi('hl.week_empty')}</span></div>`;
  let n = 0;
  return `<div class="hl-agenda">${groups.map((g) => {
    const label = g.day === d.t ? bi('cal.today') : g.day === addDays(d.t, 1) ? bi('hl.tomorrow') : bi('weekday.' + weekday(g.day));
    const rows = g.list.filter(() => n++ < max);
    return rows.length ? `<div class="hl-agenda-day${g.day === d.t ? ' today' : ''}"><div class="hl-agenda-h"><span>${label}</span><span class="hl-agenda-d">${esc(ddmm(g.day))}</span></div>${rows.map((x) => rowHtml(x)).join('')}</div>` : '';
  }).join('')}${n > max ? `<a class="link-more" href="#/alerts/month">${bi('cal.more', { N: n - max })} →</a>` : ''}</div>`;
}

/** Bảng Việc cần làm: ô số Quá hạn / Sắp tới hạn / Việc tuần này, dải 7 ngày có chấm, danh sách quá hạn → từng ngày → sắp tới hạn sau tuần này */
function agendaPanelHtml(d) {
  const weekN = d.items.filter((x) => x.date >= d.t && !x.done).length;
  const over = d.over;
  const later = d.soon.filter((x) => x.date > d.to);
  const strip = `<div class="hl-strip">${d.days.map((day) => {
    const list = d.items.filter((x) => x.date === day);
    return `<div class="hl-pill${day === d.t ? ' today' : ''}${day < d.t ? ' past' : ''}"><span class="hl-pill-dow">${bi('weekday.' + weekday(day))}</span><span class="hl-pill-num">${esc(day.slice(8, 10))}</span>
      <span class="hl-dots">${list.slice(0, 3).map((x) => `<i class="ck-${x.kind.toLowerCase()}${x.done ? ' done' : ''}"></i>`).join('')}${list.length > 3 ? '<b>+</b>' : ''}</span></div>`;
  }).join('')}</div>`;
  const sec = (title, cls, rows) => rows.length ? `<div class="hl-sec ${cls}"><div class="hl-sec-h"><span>${bi(title)}</span><span class="hl-n">${rows.length}</span></div>${rows.slice(0, 4).map((x) => rowHtml(x, dueChip(x))).join('')}
    ${rows.length > 4 ? `<a class="link-more" href="#/alerts">${bi('cal.more', { N: rows.length - 4 })} →</a>` : ''}</div>` : '';
  // Chiều cao tối thiểu theo số dòng (web): ít việc thì khung gọn, nhiều việc thì cao hơn (tối đa 640 px, phần còn lại cuộn trong khung)
  const rowsN = Math.min(over.length, 4) + Math.min(d.items.filter((x) => x.date >= d.t).length, 8) + Math.min(later.length, 4);
  const minH = Math.max(440, Math.min(640, 250 + rowsN * 66));
  return `<section class="card hl-card hl-panel" style="--panel-min:${minH}px">${headHtml('z1', 'calendar', 'hl.agenda', monthBtn())}
    <div class="hl-stats three">
      <a class="hl-stat over${over.length ? '' : ' zero'}" href="#/alerts"><span class="n">${over.length}</span><span class="l">${bi('home.overdue')}</span></a>
      <a class="hl-stat soon${d.soon.length ? '' : ' zero'}" href="#/alerts"><span class="n">${d.soon.length}</span><span class="l">${bi('home.due_soon')}</span></a>
      <a class="hl-stat week${weekN ? '' : ' zero'}" href="#/alerts/month"><span class="n">${weekN}</span><span class="l">${bi('hl.this_week')}</span></a>
    </div>
    ${strip}
    <div class="hl-scroll">${over.length || later.length ? sec('home.overdue', 'over', over) : `<div class="hl-empty ok">${ICON.check}<span>${bi('hl.all_clear')}</span></div>`}
      <div class="hl-sec"><div class="hl-sec-h"><span>${bi('home.week')}</span><span class="hl-meta">${esc(ddmm(d.from))} – ${esc(ddmm(d.to))}</span></div>${agendaHtml(d, { max: 8 })}</div>
      ${sec('hl.later', 'soon', later)}</div></section>`;
}

export async function renderHome(view, { shell }) {
  shell.setScreen({ title: 'nav.home', home: true });
  const wide = isWide();
  const u = session.user || {};
  const d = await homeData();
  view.innerHTML = `<div class="home">
    <div class="home-hero">${brandHtml()}<div class="home-who">${esc(u.display_name || '')} · ${esc(fmtDate(today()))}</div></div>
    <div class="home-body hl">
      <div class="hl-main">${await pendingHtml()}<section class="card hl-card hl-mods">${headHtml('z3', 'apps', 'menu.title')}${tilesHtml(d.tiles)}</section></div>
      <div class="hl-side">${agendaPanelHtml(d)}</div>
      ${wide ? `<div class="home-bottom">${await todayWorkHtml()}</div>` : ''}
    </div></div>`;
  view.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => import('../router.js').then((r) => r.navigate(tr.dataset.href))));
}

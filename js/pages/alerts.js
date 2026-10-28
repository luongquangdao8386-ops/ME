// Nhắc hạn (nav 4, 5.2) và lịch tháng (HOME-02; từ d4.13 gom mọi việc theo ngày như lịch tuần ở trang chủ)
import { bi, biText, esc, fmtDate, badge, nameText } from '../core.js';
import { ICON, toast, listChunk, wireMore } from '../ui.js';
import { isWide } from '../shell.js';
import { mapOf, deadlineItems, dueSort, today, addDays, weekday, recs, can } from '../data.js';
import { writeOnline } from '../form.js';
import { afterCommit } from '../app.js';
import { deadlineText, calendarItems, kindTag } from './home.js';
import { handleWriteError } from './equipment.js';
import { excelLink } from '../excel-link.js';

const STATES = ['ALL', 'DUE_SOON', 'DUE_TODAY', 'OVERDUE', 'MISSING'];
// Bộ lọc chỉ giữ trong phiên làm việc (đăng xuất là mất, 2.5)
const filt = { state: 'ALL', kind: '', location: '', owner: '' };

export async function renderAlerts(view, { shell }) {
  shell.setScreen({ title: 'nav.alerts', actions: [{ icon: 'calendar', label: biText('btn.month_calendar'), onClick: () => import('../router.js').then((r) => r.navigate('/alerts/month')) }] });
  const all = (await deadlineItems()).filter((x) => x.due.state !== 'NOT_DUE').sort(dueSort);
  const eqs = await mapOf('EQUIPMENT');
  const locs = await mapOf('LOCATION');
  const locOf = (x) => x.location_id || (eqs.get(x.equipment_id) || {}).location_id || '';
  const owners = [...new Map(all.filter((x) => x.rec.owner_user_id).map((x) => [x.rec.owner_user_id, x.rec.owner_name || x.rec.owner_user_id])).entries()];
  const locIds = [...new Set(all.map(locOf).filter(Boolean))];
  const pass = (x, ignoreState) => (ignoreState || filt.state === 'ALL' || x.due.state === filt.state) &&
    (!filt.kind || x.kind === filt.kind) && (!filt.location || locOf(x) === filt.location) && (!filt.owner || x.rec.owner_user_id === filt.owner);
  const count = (st) => all.filter((x) => pass(x, true) && (st === 'ALL' || x.due.state === st)).length;
  const list = all.filter((x) => pass(x, false));
  const dateLines = (x) => {
    if (x.kind === 'INSPECTION') return `<div class="dates"><span>${bi('field.valid_to')}: <strong>${esc(fmtDate(x.date) || '—')}</strong></span></div>`;
    const mark = (k) => (x.ref_kind === k ? ' class="ref"' : '');
    return `<div class="dates"><span${mark('RENEWAL_NOTICE')}>${bi('field.renewal_notice_date')}: <strong>${esc(fmtDate(x.renewal_notice_date) || '—')}</strong></span>
      <span${mark('END_DATE')}>${bi('field.end_date')}: <strong>${esc(fmtDate(x.end_date) || '—')}</strong></span></div>`;
  };
  // Cảnh báo máy chủ (Alerts): trạng thái tiếp nhận; hạn tính ở máy để xem được khi offline
  const alertBy = new Map((await recs('ALERT')).filter((a) => a.alert_state !== 'RESOLVED').map((a) => [a.entity_id, a]));
  const canAck = await can('alert.acknowledge');
  const { shown, more } = listChunk('alerts', list, JSON.stringify(filt));
  const rows = await Promise.all(shown.map(async (x) => {
    const e = eqs.get(x.equipment_id), l = locs.get(locOf(x));
    const rs = ['FAILED', 'REVOKED', 'SUSPENDED'].includes(x.record_status) ? badge('record_status.' + x.record_status) : '';
    const al = alertBy.get(x.id);
    const ack = al && al.alert_state === 'ACKNOWLEDGED' ? badge('alert_state.ACKNOWLEDGED') : '';
    const ackBtn = al && al.alert_state === 'OPEN' && canAck ? `<button type="button" class="btn small" data-ack="${esc(al.alert_id)}">${ICON.check}${bi('btn.acknowledge')}</button>` : '';
    return { x, e, l, rs, ack, ackBtn, text: await deadlineText(x) };
  }));
  const chips = STATES.map((st) => `<button type="button" class="chip${filt.state === st ? ' on' : ''}" data-state="${st}">${bi('due_filter.' + st)} <span class="count">${count(st)}</span></button>`).join('');
  const sel = (id, opts, cur) => `<select id="${id}" class="sel">${opts.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  const body = isWide()
    ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('col.type')}</th><th>${bi('col.code')}</th><th>${bi('col.content')}</th><th>${bi('col.equipment_location')}</th><th>${bi('col.due')}</th><th>${bi('col.status')}</th><th>${bi('col.owner')}</th><th></th></tr></thead>
      <tbody>${rows.map(({ x, e, l, rs, ack, ackBtn, text }) => `<tr class="click" data-href="${esc(x.href)}"><td>${bi(x.kind === 'INSPECTION' ? 'module.inspections' : 'module.contracts')}</td><td class="code">${esc(x.code)}</td><td>${esc(text)}</td>
        <td>${esc([e && e.equipment_code, l && l.location_code].filter(Boolean).join(' · '))}</td><td>${dateLines(x)}</td><td>${badge(x.due.key, x.due.vars)} ${rs} ${ack}</td><td>${esc(x.rec.owner_name || '')}</td><td>${ackBtn}</td></tr>`).join('')}</tbody></table></div>${more}`
    : `<div class="cards">${rows.map(({ x, e, l, rs, ack, ackBtn, text }) => `<div class="card rec-card click" data-href="${esc(x.href)}" role="link" tabindex="0">
        <div class="rec-top"><span class="kind">${bi(x.kind === 'INSPECTION' ? 'module.inspections' : 'module.contracts')}</span><span class="code">${esc(x.code)}</span></div>
        <div class="rec-name">${esc(text)}</div>
        ${e || l ? `<div class="muted small">${esc([e && e.equipment_code, l && nameText(l)].filter(Boolean).join(' · '))}</div>` : ''}
        ${dateLines(x)}<div class="rec-badges">${badge(x.due.key, x.due.vars)} ${rs} ${ack}</div>
        ${x.rec.owner_name ? `<div class="muted small">${bi('col.owner')}: ${esc(x.rec.owner_name)}</div>` : ''}
        ${ackBtn ? `<div class="rec-actions">${ackBtn}</div>` : ''}</div>`).join('')}</div>${more}`;
  view.innerHTML = `<div class="filters"><div class="chips">${chips}</div>
    <div class="row">${sel('f-kind', [['', bi('due_filter.ALL')], ['INSPECTION', bi('module.inspections')], ['CONTRACT', bi('module.contracts')]], filt.kind)}
      ${sel('f-loc', [['', bi('field.location')]].concat(locIds.map((id) => [id, esc((locs.get(id) || {}).location_code || '') + ' ' + esc(nameText(locs.get(id)))])), filt.location)}
      ${sel('f-owner', [['', bi('col.owner')]].concat(owners.map(([id, n]) => [id, esc(n)])), filt.owner)}</div></div>
    <div class="row"><p class="muted small">${bi('field.total', { N: list.length })}</p>${await excelLink('alerts', { exportOnly: true })}</div>
    ${list.length ? body : `<div class="card empty-state">${ICON.bell}<p class="muted">${bi('draft.empty')}</p></div>`}`;
  const rerender = () => renderAlerts(view, { shell });
  wireMore(view, rerender);
  view.querySelectorAll('[data-state]').forEach((b) => b.addEventListener('click', () => { filt.state = b.dataset.state; rerender(); }));
  view.querySelector('#f-kind').addEventListener('change', (e) => { filt.kind = e.target.value; rerender(); });
  view.querySelector('#f-loc').addEventListener('change', (e) => { filt.location = e.target.value; rerender(); });
  view.querySelector('#f-owner').addEventListener('change', (e) => { filt.owner = e.target.value; rerender(); });
  view.querySelectorAll('[data-href]').forEach((el) => {
    const go = (ev) => { if (ev.target.closest('[data-ack]')) return; import('../router.js').then((r) => r.navigate(el.dataset.href)); };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(ev); });
  });
  // Tiếp nhận: chỉ ghi nhận đã thấy, không đổi hạn, email vẫn gửi theo mốc
  view.querySelectorAll('[data-ack]').forEach((b) => b.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    if (!navigator.onLine) { toast(bi('sync.need_network'), 'err'); return; }
    b.disabled = true;
    const res = await writeOnline('alert.acknowledge', { alert_id: b.dataset.ack });
    if (res.ok) { await afterCommit(); toast(bi('alert_state.ACKNOWLEDGED'), 'ok'); rerender(); } else { b.disabled = false; await handleWriteError(res); }
  }));
}

let monthCursor = null;
let selDay = null;   // ngày đang chọn (danh sách bên dưới/bên phải); null = cả tháng
let calKind = '';    // lọc theo loại việc; '' = tất cả
const CAL_KINDS = ['INSPECTION', 'CONTRACT', 'SERVICE', 'WO', 'PLAN', 'READING'];
const CAL_ORDER = Object.fromEntries(CAL_KINDS.map((k, i) => [k, i]));

/** Trạng thái hiển thị của một việc: xong · quá hạn · hôm nay */
function calState(x, t) {
  if (x.done) return 'done';
  if (x.date < t) return 'over';
  return x.date === t ? 'today' : '';
}

function calBadge(x, t) {
  const st = calState(x, t);
  if (st === 'done') return `<span class="cal-done">${ICON.check}${bi('cal.done')}</span>`;
  if (st === 'over') return badge('due_filter.OVERDUE');
  if (st === 'today') return badge('due_filter.DUE_TODAY');
  return '';
}

/**
 * HOME-02 lịch tháng: mọi việc theo ngày (kiểm định, hợp đồng, dịch vụ HĐ, phiếu/kế hoạch bảo trì, mốc đọc chỉ số), lọc theo loại có số đếm,
 * nút Hôm nay; ô ngày có tối đa 3 việc (web) hoặc chấm màu (iPhone); bấm ngày → danh sách việc của ngày đó, bấm lại → cả tháng.
 * Quá hạn tô đỏ, xong thì mờ. Dữ liệu trên máy (xem được khi mất mạng).
 */
export async function renderMonth(view, { shell }) {
  shell.setScreen({ title: 'btn.month_calendar', back: '/alerts' });
  const t = today();
  if (!monthCursor) { monthCursor = t.slice(0, 7); selDay = t; }
  const [y, m] = monthCursor.split('-').map(Number);
  const first = `${monthCursor}-01`;
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const last = addDays(`${nextMonth}-01`, -1);
  const start = addDays(first, 1 - weekday(first));
  const cells = [];
  for (let d = start; d <= last || weekday(d) !== 1; d = addDays(d, 1)) cells.push(d);
  if (selDay && selDay.slice(0, 7) !== monthCursor) selDay = null;
  const all = (await calendarItems(start, cells[cells.length - 1], { plans: true }))
    .sort((a, b) => a.date.localeCompare(b.date) || CAL_ORDER[a.kind] - CAL_ORDER[b.kind] || String(a.code).localeCompare(String(b.code)));
  const inMonth = (x) => x.date >= first && x.date <= last;
  const monthAll = all.filter(inMonth);
  if (calKind && !monthAll.some((x) => x.kind === calKind)) calKind = '';
  const shown = all.filter((x) => !calKind || x.kind === calKind);
  const byDay = new Map();
  shown.forEach((x) => { if (!byDay.has(x.date)) byDay.set(x.date, []); byDay.get(x.date).push(x); });
  const over = monthAll.filter((x) => calState(x, t) === 'over').length;
  const chips = [`<button type="button" class="chip${calKind ? '' : ' on'}" data-kind="">${bi('due_filter.ALL')} <span class="count">${monthAll.length}</span></button>`]
    .concat(CAL_KINDS.map((k) => [k, monthAll.filter((x) => x.kind === k).length]).filter(([, n]) => n)
      .map(([k, n]) => `<button type="button" class="chip cal-chip ck-${k.toLowerCase()}${calKind === k ? ' on' : ''}" data-kind="${k}"><i class="cal-key"></i>${bi(kindKey(k))} <span class="count">${n}</span></button>`)).join('');
  const cellHtml = (d) => {
    const list = byDay.get(d) || [];
    const out = d.slice(0, 7) !== monthCursor;
    const wd = weekday(d);
    const cls = ['cal-cell', out ? 'out' : '', d === t ? 'today' : '', d === selDay ? 'sel' : '', wd >= 6 ? 'we' : '', list.some((x) => calState(x, t) === 'over') ? 'has-over' : ''].filter(Boolean).join(' ');
    const label = `${fmtDate(d)} · ${list.length}`;
    return `<button type="button" class="${cls}" data-day="${d}" aria-label="${esc(label)}" aria-pressed="${d === selDay}">
      <span class="cal-num">${Number(d.slice(8, 10))}</span>
      <span class="cal-pills">${list.slice(0, 3).map((x) => `<span class="cal-ev ck-${x.kind.toLowerCase()} ${calState(x, t)}">${esc(x.kind === 'READING' ? biText('home.meters_due', { N: x.code }) : x.code || biText(kindKey(x.kind)))}</span>`).join('')}
        ${list.length > 3 ? `<span class="cal-more">${bi('cal.more', { N: list.length - 3 })}</span>` : ''}</span>
      <span class="cal-dots">${list.slice(0, 4).map((x) => `<i class="cal-dot ck-${x.kind.toLowerCase()} ${calState(x, t)}"></i>`).join('')}${list.length > 4 ? '<i class="cal-dot plus"></i>' : ''}</span>
    </button>`;
  };
  // Danh sách: ngày đang chọn hoặc cả tháng, nhóm theo ngày
  const listDays = selDay ? [selDay] : [...byDay.keys()].filter((d) => d >= first && d <= last);
  const agenda = listDays.map((d) => {
    const list = byDay.get(d) || [];
    return `<div class="cal-group"><div class="cal-date${d === t ? ' today' : ''}"><strong>${esc(fmtDate(d))}</strong> <span class="muted">${bi('weekday.' + weekday(d))}</span></div>
      ${list.length ? list.map((x) => `<a class="cal-item k-${x.kind.toLowerCase()} ${calState(x, t)}" href="#${esc(x.href)}">
        <div class="cal-item-top">${kindTag(x.kind)}${x.kind !== 'READING' && x.code ? `<span class="code">${esc(x.code)}</span>` : ''}${x.sub ? `<span class="muted small">${bi(x.sub === 'END' ? 'field.end_date' : 'field.renewal_notice_date')}</span>` : ''}${calBadge(x, t)}</div>
        ${x.title ? `<div class="cal-item-title">${esc(x.title)}</div>` : ''}</a>`).join('') : `<p class="muted small">${bi('cal.no_items_day')}</p>`}</div>`;
  }).join('');
  const agendaHead = selDay
    ? `<h2>${bi('cal.day_title', { D: fmtDate(selDay) })}</h2><button type="button" class="btn tiny" id="cal-all">${bi('cal.all_month')}</button>`
    : `<h2>${bi('cal.month_list')}</h2>`;
  const isCur = monthCursor === t.slice(0, 7);
  view.innerHTML = `<div class="cal-page">
    <section class="card cal">
      <div class="cal-head">
        <button type="button" class="icon-btn" id="m-prev" aria-label="‹">${ICON.back}</button>
        <h2 class="cal-title">${bi('cal.month_title', { M: String(m).padStart(2, '0'), Y: y })}</h2>
        <button type="button" class="icon-btn flip" id="m-next" aria-label="›">${ICON.back}</button>
        <button type="button" class="btn tiny cal-today" id="m-today"${isCur && selDay === t ? ' disabled' : ''}>${ICON.calendar}<span>${bi('cal.today')}</span></button>
      </div>
      <div class="cal-sum">${monthAll.length ? `<span>${bi('cal.month_count', { N: monthAll.length })}</span>${over ? `<span class="cal-sum-over">${bi('cal.over_count', { N: over })}</span>` : ''}` : `<span class="muted">${bi('cal.empty_month')}</span>`}</div>
      ${monthAll.length ? `<div class="chips cal-chips">${chips}</div>` : ''}
      <div class="cal-grid" role="grid">${[1, 2, 3, 4, 5, 6, 7].map((w) => `<div class="cal-wd${w >= 6 ? ' we' : ''}">${bi('weekday.' + w)}</div>`).join('')}${cells.map(cellHtml).join('')}</div>
    </section>
    <section class="card cal-agenda"><div class="card-head">${agendaHead}</div>
      ${listDays.length ? agenda : `<div class="empty-state">${ICON.calendar}<p class="muted">${bi(monthAll.length ? 'cal.no_items_filter' : 'cal.empty_month')}</p></div>`}</section>
  </div>`;
  const again = () => renderMonth(view, { shell });
  view.querySelector('#m-prev').addEventListener('click', () => { monthCursor = prevMonth; selDay = null; again(); });
  view.querySelector('#m-next').addEventListener('click', () => { monthCursor = nextMonth; selDay = null; again(); });
  view.querySelector('#m-today').addEventListener('click', () => { monthCursor = t.slice(0, 7); selDay = t; again(); });
  const all2 = view.querySelector('#cal-all');
  if (all2) all2.addEventListener('click', () => { selDay = null; again(); });
  view.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { calKind = b.dataset.kind; again(); }));
  view.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => {
    const d = b.dataset.day;
    if (d.slice(0, 7) !== monthCursor) { monthCursor = d.slice(0, 7); selDay = d; again(); return; }
    selDay = selDay === d ? null : d;
    again();
  }));
}

function kindKey(k) {
  return { INSPECTION: 'home.item_inspection', CONTRACT: 'home.item_contract', SERVICE: 'home.item_service', WO: 'home.item_wo', PLAN: 'cal.item_plan', READING: 'home.item_reading' }[k];
}

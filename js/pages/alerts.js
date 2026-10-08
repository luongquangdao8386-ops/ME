// Nhắc hạn (nav 4, 5.2) và lịch kiểm định tháng (HOME-02)
import { bi, biText, esc, fmtDate, badge, nameText } from '../core.js';
import { ICON } from '../ui.js';
import { isWide } from '../shell.js';
import { mapOf, deadlineItems, dueSort, today, addDays, weekday, recs, dueInfo } from '../data.js';
import { deadlineText } from './home.js';

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
  const rows = await Promise.all(list.map(async (x) => {
    const e = eqs.get(x.equipment_id), l = locs.get(locOf(x));
    const rs = ['FAILED', 'REVOKED', 'SUSPENDED'].includes(x.record_status) ? badge('record_status.' + x.record_status) : '';
    return { x, e, l, rs, text: await deadlineText(x) };
  }));
  const chips = STATES.map((st) => `<button type="button" class="chip${filt.state === st ? ' on' : ''}" data-state="${st}">${bi('due_filter.' + st)} <span class="count">${count(st)}</span></button>`).join('');
  const sel = (id, opts, cur) => `<select id="${id}" class="sel">${opts.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  const body = isWide()
    ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('col.type')}</th><th>${bi('col.code')}</th><th>${bi('col.content')}</th><th>${bi('col.equipment_location')}</th><th>${bi('col.due')}</th><th>${bi('col.status')}</th><th>${bi('col.owner')}</th></tr></thead>
      <tbody>${rows.map(({ x, e, l, rs, text }) => `<tr class="click" data-href="${esc(x.href)}"><td>${bi(x.kind === 'INSPECTION' ? 'module.inspections' : 'module.contracts')}</td><td class="code">${esc(x.code)}</td><td>${esc(text)}</td>
        <td>${esc([e && e.equipment_code, l && l.location_code].filter(Boolean).join(' · '))}</td><td>${dateLines(x)}</td><td>${badge(x.due.key, x.due.vars)} ${rs}</td><td>${esc(x.rec.owner_name || '')}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="cards">${rows.map(({ x, e, l, rs, text }) => `<a class="card rec-card" href="#${esc(x.href)}">
        <div class="rec-top"><span class="kind">${bi(x.kind === 'INSPECTION' ? 'module.inspections' : 'module.contracts')}</span><span class="code">${esc(x.code)}</span></div>
        <div class="rec-name">${esc(text)}</div>
        ${e || l ? `<div class="muted small">${esc([e && e.equipment_code, l && nameText(l)].filter(Boolean).join(' · '))}</div>` : ''}
        ${dateLines(x)}<div class="rec-badges">${badge(x.due.key, x.due.vars)} ${rs}</div>
        ${x.rec.owner_name ? `<div class="muted small">${bi('col.owner')}: ${esc(x.rec.owner_name)}</div>` : ''}</a>`).join('')}</div>`;
  view.innerHTML = `<div class="filters"><div class="chips">${chips}</div>
    <div class="row">${sel('f-kind', [['', bi('due_filter.ALL')], ['INSPECTION', bi('module.inspections')], ['CONTRACT', bi('module.contracts')]], filt.kind)}
      ${sel('f-loc', [['', bi('field.location')]].concat(locIds.map((id) => [id, esc((locs.get(id) || {}).location_code || '') + ' ' + esc(nameText(locs.get(id)))])), filt.location)}
      ${sel('f-owner', [['', bi('col.owner')]].concat(owners.map(([id, n]) => [id, esc(n)])), filt.owner)}</div></div>
    <p class="muted small">${bi('field.total', { N: list.length })}</p>
    ${list.length ? body : `<div class="card empty-state">${ICON.bell}<p class="muted">${bi('draft.empty')}</p></div>`}`;
  const rerender = () => renderAlerts(view, { shell });
  view.querySelectorAll('[data-state]').forEach((b) => b.addEventListener('click', () => { filt.state = b.dataset.state; rerender(); }));
  view.querySelector('#f-kind').addEventListener('change', (e) => { filt.kind = e.target.value; rerender(); });
  view.querySelector('#f-loc').addEventListener('change', (e) => { filt.location = e.target.value; rerender(); });
  view.querySelector('#f-owner').addEventListener('change', (e) => { filt.owner = e.target.value; rerender(); });
  view.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => import('../router.js').then((r) => r.navigate(tr.dataset.href))));
}

let monthCursor = null;

/** HOME-02: lịch tháng, chỉ hạn kiểm định hiện hành, và danh sách đến hạn trong tháng */
export async function renderMonth(view, { shell }) {
  shell.setScreen({ title: 'btn.month_calendar', back: '/alerts' });
  const t = today();
  if (!monthCursor) monthCursor = t.slice(0, 7);
  const [y, m] = monthCursor.split('-').map(Number);
  const first = `${monthCursor}-01`;
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const last = addDays(`${nextMonth}-01`, -1);
  const reqs = (await recs('INSPECTION_REQUIREMENT')).filter((r) => r.active !== false && r.current_due_date && r.current_due_date >= first && r.current_due_date <= last)
    .sort((a, b) => a.current_due_date.localeCompare(b.current_due_date));
  const types = await mapOf('INSPECTION_TYPE');
  const eqs = await mapOf('EQUIPMENT');
  const start = addDays(first, 1 - weekday(first));
  const cells = [];
  for (let d = start; d <= last || weekday(d) !== 1; d = addDays(d, 1)) cells.push(d);
  view.innerHTML = `<div class="card month">
    <div class="card-head"><button type="button" class="icon-btn" id="m-prev" aria-label="‹">${ICON.back}</button><h2>${String(m).padStart(2, '0')}/${y}</h2><button type="button" class="icon-btn flip" id="m-next" aria-label="›">${ICON.back}</button></div>
    <div class="month-grid">${[1, 2, 3, 4, 5, 6, 7].map((w) => `<div class="mg-head">${bi('weekday.' + w)}</div>`).join('')}
    ${cells.map((d) => {
      const n = reqs.filter((r) => r.current_due_date === d).length;
      return `<div class="mg-cell${d.slice(0, 7) !== monthCursor ? ' out' : ''}${d === t ? ' today' : ''}"><span>${Number(d.slice(8, 10))}</span>${n ? `<span class="mg-dot">${n}</span>` : ''}</div>`;
    }).join('')}</div></div>
    <div class="cards">${reqs.map((r) => {
      const ty = types.get(r.inspection_type_id), e = eqs.get(r.equipment_id), due = dueInfo(r.current_due_date);
      return `<a class="card rec-card" href="#/inspections/${esc(r.requirement_id)}"><div class="rec-top"><span class="code">${esc(r.requirement_code)}</span><span>${esc(fmtDate(r.current_due_date))}</span></div>
        <div class="rec-name">${esc(ty ? nameText(ty) : '')}</div><div class="muted small">${esc(e ? e.equipment_code + ' · ' + nameText(e) : '')}</div>${badge(due.key, due.vars)}</a>`;
    }).join('') || `<p class="muted">${bi('home.none')}</p>`}</div>`;
  view.querySelector('#m-prev').addEventListener('click', () => { monthCursor = prevMonth; renderMonth(view, { shell }); });
  view.querySelector('#m-next').addEventListener('click', () => { monthCursor = nextMonth; renderMonth(view, { shell }); });
}

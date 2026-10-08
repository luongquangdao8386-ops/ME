// HOME-01 / WEB-HOME-01: logo 57 + M&E/机电管理 trên nền nhà máy, lịch tuần, thẻ hạn, lưới 9 mục, bảng Công việc hôm nay (6.6)
import { bi, biText, esc, fmtDate, badge, biName, nameText, session } from '../core.js';
import { brandHtml, ICON } from '../ui.js';
import { MODULES, RELEASED_DOT, isWide } from '../shell.js';
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

function kindTag(kind) {
  return `<span class="kind k-${kind.toLowerCase()}">${bi(kind === 'INSPECTION' ? 'home.item_inspection' : kind === 'CONTRACT' ? 'home.item_contract' : 'home.item_service')}</span>`;
}

/** Mục trong lịch tuần: hạn kiểm định, hạn hợp đồng (hạn báo gia hạn, ngày hết hạn), dịch vụ HĐ chưa làm (6.6) */
async function weekItems(from, to) {
  const out = [];
  for (const r of await recs('INSPECTION_REQUIREMENT')) {
    if (r.active === false || !r.current_due_date) continue;
    if (r.current_due_date >= from && r.current_due_date <= to) out.push({ date: r.current_due_date, kind: 'INSPECTION', code: r.requirement_code, href: '/inspections/' + r.requirement_id });
  }
  for (const c of await recs('CONTRACT')) {
    if (c.lifecycle_status && c.lifecycle_status !== 'ACTIVE') continue;
    for (const d of [c.renewal_notice_date, c.end_date]) {
      if (d && d >= from && d <= to) out.push({ date: d, kind: 'CONTRACT', code: c.contract_code, href: '/contracts/' + c.contract_id });
    }
  }
  for (const s of await recs('CONTRACT_SERVICE')) {
    if (s.performed_at || !s.due_date) continue;
    if (s.due_date >= from && s.due_date <= to) out.push({ date: s.due_date, kind: 'SERVICE', code: '', href: '/contracts/' + s.contract_id });
  }
  return out;
}

async function weekHtml() {
  const t = today();
  const from = weekStart(t), to = addDays(from, 6);
  const items = await weekItems(from, to);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return `<section class="card home-week">
    <div class="card-head"><h2>${bi('home.week')}</h2><span class="muted">${esc(fmtDate(from))} – ${esc(fmtDate(to))}</span>
      <a class="btn tiny" href="#/alerts/month">${ICON.calendar}<span>${bi('btn.month_calendar')}</span></a></div>
    <div class="week">${days.map((d) => {
      const list = items.filter((x) => x.date === d);
      return `<div class="day${d === t ? ' today' : ''}"><div class="day-head"><span>${bi('weekday.' + weekday(d))}</span><span class="day-num">${esc(d.slice(8, 10))}/${esc(d.slice(5, 7))}</span></div>
        <div class="day-items">${list.map((x) => `<a class="day-item k-${x.kind.toLowerCase()}" href="#${x.href}">${kindTag(x.kind)}${x.code ? `<span class="code">${esc(x.code)}</span>` : ''}</a>`).join('')}</div></div>`;
    }).join('')}</div></section>`;
}

async function deadlinesHtml() {
  const all = (await deadlineItems()).filter((x) => x.due.state !== 'NOT_DUE' && x.due.state !== 'MISSING').sort(dueSort);
  const soon = all.filter((x) => x.due.state === 'DUE_SOON' || x.due.state === 'DUE_TODAY');
  const over = all.filter((x) => x.due.state === 'OVERDUE');
  const row = async (x) => `<a class="dl-item" href="#${x.href}">${kindTag(x.kind)}<span class="code">${esc(x.code)}</span>
      <span class="dl-text">${esc(await deadlineText(x))}</span>${badge(x.due.key, x.due.vars)}
      ${x.record_status === 'FAILED' || x.record_status === 'REVOKED' ? badge('record_status.' + x.record_status) : ''}</a>`;
  const col = async (title, list, cls) => `<div class="dl-col ${cls}"><h3>${bi(title)} <span class="count">${list.length || ''}</span></h3>
    ${list.length ? (await Promise.all(list.slice(0, 6).map(row))).join('') : `<p class="muted">${bi('home.none')}</p>`}
    ${list.length > 6 ? `<a class="link-more" href="#/alerts">${bi('nav.alerts')} →</a>` : ''}</div>`;
  return `<section class="card home-deadlines"><div class="card-head"><h2>${bi('home.deadlines')}</h2></div>
    <div class="dl-cols">${await col('home.due_soon', soon, 'soon')}${await col('home.overdue', over, 'over')}</div></section>`;
}

async function gridHtml() {
  const counts = {};
  for (const [k, type] of Object.entries(COUNT_TYPE)) counts[k] = (await recs(type)).length;
  return `<section class="grid9" aria-label="${esc(biText('menu.title'))}">${MODULES.map((m) => {
    const soon = m.dot > RELEASED_DOT;
    if (soon) {
      return `<button type="button" class="tile dim" aria-disabled="true" data-soon="1">${ICON[m.icon]}<span class="tile-label">${bi('module.' + m.key)}</span><span class="soon">${bi('tag.coming_soon')}</span></button>`;
    }
    const n = counts[m.key];
    return `<a class="tile" href="#${m.path}">${ICON[m.icon]}<span class="tile-label">${bi('module.' + m.key)}</span>${n ? `<span class="tile-count">${bi('home.records', { N: n })}</span>` : ''}</a>`;
  }).join('')}</section>`;
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
  return `<section class="card home-today"><div class="card-head"><h2>${bi('home.today_work')}</h2></div>
    ${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr>
      <th>${bi('col.type')}</th><th>${bi('col.code')}</th><th>${bi('col.content')}</th><th>${bi('col.equipment_location')}</th><th>${bi('col.due')}</th><th>${bi('col.status')}</th><th>${bi('col.owner')}</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="click" data-href="${esc(r.href)}"><td>${kindTag(r.kind)}</td><td class="code">${esc(r.code)}</td><td>${esc(r.text)}</td><td>${esc(r.where)}</td><td class="num">${esc(fmtDate(r.date))}</td><td>${badge(r.due.key, r.due.vars)}</td><td>${esc(r.owner)}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="muted">${bi('home.no_work_today')}</p>`}
    <p class="muted dim-line">${bi('home.wo_coming')} — ${bi('tag.coming_soon')}</p></section>`;
}

export async function renderHome(view, { shell }) {
  shell.setScreen({ title: 'nav.home', home: true });
  const wide = isWide();
  const u = session.user || {};
  const html = `<div class="home">
    <div class="home-hero">${brandHtml()}<div class="home-who">${esc(u.display_name || '')} · ${esc(fmtDate(today()))}</div></div>
    <div class="home-body${wide ? ' wide' : ''}">
      <div class="home-left">${await weekHtml()}${await deadlinesHtml()}</div>
      <div class="home-right">${await gridHtml()}</div>
      ${wide ? `<div class="home-bottom">${await todayWorkHtml()}</div>` : ''}
    </div></div>`;
  view.innerHTML = html;
  view.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => import('../router.js').then((r) => r.navigate(tr.dataset.href))));
}

// Công việc · 工单 (iPhone nav 2, menu web) — 5.2: lọc Của tôi / Trong phạm vi, loại, nhóm theo hạn; thẻ iPhone, bảng web
import { bi, biText, esc, fmtDate, fmtDateTime, badge } from '../core.js';
import { ICON, toTop, $, $$, setViewHtml, wireSearch } from '../ui.js';
import { isWide } from '../shell.js';
import { navigate } from '../router.js';
import { can, roleLevel } from '../data.js';
import { workItems, statusBadge, prioBadges, workTitle, eqText, pendingForMe, pendingPanelHtml } from '../work.js';

const GROUPS = ['OVERDUE', 'TODAY', 'UPCOMING', 'PENDING_ACCEPTANCE'];
const filt = { scope: null, kind: 'ALL', q: '', page: 0 };
const PAGE = 50;

export async function renderWork(view, ctx) {
  const { shell } = ctx;
  const wide = isWide();
  const canReport = await can('repair.report');
  const canWo = await can('maintenance.wo.create');
  // Mặc định: cấp 2 xem việc của mình, cấp 3/4 xem trong phạm vi
  if (filt.scope === null) filt.scope = roleLevel() >= 3 ? 'ALL' : 'MINE';
  shell.setScreen({
    title: 'nav.work', back: null,
    actions: !wide ? [
      ...(canReport ? [{ icon: 'repairs', label: biText('rp.new'), onClick: () => navigate('/repairs/new') }] : []),
      ...(canWo ? [{ icon: 'plus', label: biText('mt.wo_new'), onClick: () => navigate('/maintenance/wo/new') }] : [])
    ] : []
  });
  const kinds = filt.kind === 'ALL' ? ['WO', 'REPAIR'] : [filt.kind];
  let items = await workItems({ mine: filt.scope === 'MINE', kinds });
  const q = filt.q.trim().toLowerCase();
  if (q) items = items.filter((x) => [x.code, x.eq && x.eq.equipment_code, x.eq && x.eq.name_vi, x.eq && x.eq.name_zh, x.rec.title_vi, x.rec.title_zh, x.rec.symptom_vi, x.rec.symptom_zh].join(' ').toLowerCase().includes(q));
  const count = (g) => items.filter((x) => x.group === g).length;
  const toolbar = `<div class="toolbar">
    <div class="search"><span>${ICON.search}</span><input id="wk-q" type="search" value="${esc(filt.q)}" placeholder="${esc(biText('wk.search_placeholder'))}" autocomplete="off"></div>
    <div class="chips">
      <button type="button" class="chip${filt.scope === 'MINE' ? ' on' : ''}" data-scope="MINE">${bi('wk.mine')}</button>
      <button type="button" class="chip${filt.scope === 'ALL' ? ' on' : ''}" data-scope="ALL">${bi('wk.all')}</button>
    </div>
    <div class="chips">${['ALL', 'WO', 'REPAIR'].map((k) => `<button type="button" class="chip${filt.kind === k ? ' on' : ''}" data-kind="${k}">${bi('wk.kind.' + k)}</button>`).join('')}</div>
    <div class="row tools">
      ${wide && canReport ? `<a class="btn small" href="#/repairs/new">${ICON.repairs}<span>${bi('rp.new')}</span></a>` : ''}
      ${wide && canWo ? `<a class="btn small" href="#/maintenance/wo/new">${ICON.plus}<span>${bi('mt.wo_new')}</span></a>` : ''}
    </div>
    <p class="muted small">${bi('field.total', { N: items.length })}</p></div>`;
  let body = '';
  if (!items.length) {
    body = `<div class="card empty-state">${ICON.work}<p class="muted">${bi('wk.empty')}</p></div>`;
  } else if (wide) {
    const shown = items.slice(filt.page * PAGE, filt.page * PAGE + PAGE);
    body = `<div class="table-wrap"><table class="tbl" id="wk-table"><thead><tr><th>${bi('col.code')}</th><th>${bi('wk.col.kind')}</th><th>${bi('module.equipment')}</th>
      <th>${bi('field.location')}</th><th>${bi('wk.col.date')}</th><th>${bi('wk.col.assignee')}</th><th>${bi('wk.col.priority')}</th><th>${bi('wk.col.severity')}</th><th>${bi('col.status')}</th></tr></thead>
      <tbody>${shown.map((x) => `<tr class="click" data-href="${esc(x.href)}">
        <td class="code">${x.code ? esc(x.code) : bi('tag.pending_code')}</td>
        <td>${bi('wk.kind.' + x.kind)}</td>
        <td>${esc(eqText(x.eq))}<div class="muted small">${workTitle(x)}</div></td>
        <td>${esc(x.loc ? x.loc.location_code : '')}</td>
        <td class="num">${x.kind === 'WO' ? esc(fmtDate(x.date)) : esc(fmtDateTime(x.rec.reported_at))} ${x.group === 'OVERDUE' ? badge('wk.group.OVERDUE') : ''}</td>
        <td>${esc(x.rec.assignee_name || '')}</td>
        <td>${badge('priority.' + (x.rec.priority || 'NORMAL'))}</td>
        <td>${x.kind === 'REPAIR' && x.rec.severity ? badge('severity.' + x.rec.severity) : ''}</td>
        <td>${statusBadge(x.kind, x.rec.status)} ${x.local ? `<span class="badge t-amber">${bi('sync.local_saved')}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>
      ${items.length > PAGE ? `<div class="row pager"><button type="button" class="btn small" id="wk-prev" ${filt.page ? '' : 'disabled'}>‹</button><span class="muted small">${filt.page + 1} / ${Math.ceil(items.length / PAGE)}</span><button type="button" class="btn small" id="wk-next" ${(filt.page + 1) * PAGE < items.length ? '' : 'disabled'}>›</button></div>` : ''}`;
  } else {
    body = GROUPS.map((g) => {
      const list = items.filter((x) => x.group === g);
      if (!list.length) return '';
      return `<h2 class="group-title">${bi('wk.group.' + g)} <span class="count">${list.length}</span></h2><div class="cards">${list.map((x) => `<a class="card rec-card" href="#${esc(x.href)}">
        <div class="rec-top"><span class="code">${x.code ? esc(x.code) : bi('tag.pending_code')}</span>${statusBadge(x.kind, x.rec.status)}</div>
        <div class="rec-name">${bi('wk.kind.' + x.kind)} · ${workTitle(x)}</div>
        <div class="muted small">${esc([eqText(x.eq), x.loc && x.loc.location_code].filter(Boolean).join(' · '))}</div>
        <div class="dates"><span>${x.kind === 'WO' ? `${bi('mt.due_date')}: <strong>${esc(fmtDate(x.date))}</strong>` : `${bi('rp.reported_at')}: <strong>${esc(fmtDateTime(x.rec.reported_at))}</strong>`}</span>
          ${x.rec.assignee_name ? `<span>${bi('wk.col.assignee')}: <strong>${esc(x.rec.assignee_name)}</strong></span>` : ''}</div>
        <div class="rec-badges">${prioBadges(x.rec, x.kind)} ${x.local ? `<span class="badge t-amber">${bi('sync.local_saved')}</span>` : ''}</div></a>`).join('')}</div>`;
    }).join('');
  }
  // Việc chờ tôi nghiệm thu/duyệt (C3/C4) lên đầu — số trên nút Công việc chỉ tới đây
  setViewHtml(view, pendingPanelHtml(await pendingForMe()) + toolbar + `<div class="wk-counts muted small">${GROUPS.map((g) => `${bi('wk.group.' + g)}: <strong>${count(g)}</strong>`).join(' · ')}</div>` + body);
  const again = () => renderWork(view, ctx);
  wireSearch(view, '#wk-q', (v) => { filt.q = v; filt.page = 0; }, again);
  $$('[data-scope]', view).forEach((b) => b.addEventListener('click', () => { filt.scope = b.dataset.scope; filt.page = 0; again(); }));
  $$('[data-kind]', view).forEach((b) => b.addEventListener('click', () => { filt.kind = b.dataset.kind; filt.page = 0; again(); }));
  $$('tr[data-href]', view).forEach((tr) => tr.addEventListener('click', () => navigate(tr.dataset.href)));
  const prev = $('#wk-prev', view), next = $('#wk-next', view);
  if (prev) prev.addEventListener('click', () => { filt.page = Math.max(0, filt.page - 1); again().then(toTop); });
  if (next) next.addEventListener('click', () => { filt.page++; again().then(toTop); });
}

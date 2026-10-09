// Hợp đồng thuê ngoài: CO-01 danh sách, CO-02 hồ sơ, CO-03 gia hạn, WEB-CO-01 (1.4 §5.8; phụ lục 2.7, 3.17, 4.4.8, C10)
import { bi, biText, esc, api, fmtDate, fmtDateTime, fmtNumber, badge, biName, nameText, session, uuid, L } from '../core.js';
import { ICON, toast, dialog, h, $, $$ } from '../ui.js';
import { isWide } from '../shell.js';
import { recs, byId, mapOf, can, costModules, dueInfo, contractRefDate, today, daysBetween } from '../data.js';
import { navigate, back } from '../router.js';
import { afterCommit } from '../app.js';
import { enqueue, queueItems } from '../sync.js';
import {
  textInput, selectInput, dateInput, numberInput, bilingualInputs, wireForm, readField, showErrors, writeOnline, writeWithPin, oneLang, busy, fieldWrap, assistedFields, retranslateButton, wireRetranslate
} from '../form.js';
import { docsTabHtml, wireDocsTab } from './docs.js';
import { handleWriteError } from './equipment.js';
import { excelLink } from '../excel-link.js';

const INTERVALS = ['DAY', 'WEEK', 'MONTH', 'YEAR'];
const money = (v, cur) => (v === undefined || v === null || v === '' ? '' : `${fmtNumber(v, cur && cur !== 'VND' ? 2 : 0)} ${esc(cur || 'VND')}`);

/** Phiên đang dùng để hiển thị theo mã: ACTIVE nếu có, không thì phiên đã duyệt mới nhất */
function currentByCode(list) {
  const by = new Map();
  for (const c of list) {
    if (c.status !== 'APPROVED') continue;
    const cur = by.get(c.contract_code);
    const score = (x) => (x.lifecycle_status === 'ACTIVE' ? 1e6 : 0) + Number(x.revision || 0);
    if (!cur || score(c) > score(cur)) by.set(c.contract_code, c);
  }
  return [...by.values()];
}

function lifeBadge(c) {
  if (c.status === 'DRAFT' || c.status === 'PENDING_APPROVAL' || c.status === 'REJECTED') return badge('renewal_status.' + c.status);
  return badge('contract_lifecycle.' + (c.lifecycle_status || 'ACTIVE'));
}

/* ======================= CO-01 / WEB-CO-01 ======================= */

const filt = { q: '', state: 'ALL', life: 'ACTIVE' };

export async function renderContractList(view, ctx) {
  const { shell } = ctx;
  const wide = isWide();
  const canCreate = await can('contract.create');
  shell.setScreen({
    title: 'co.list', back: '/',
    actions: !wide && canCreate ? [{ icon: 'plus', label: biText('co.new'), onClick: () => navigate('/contracts/new'), disabled: !navigator.onLine }] : []
  });
  const all = currentByCode(await recs('CONTRACT'));
  const vendors = await mapOf('VENDOR');
  const eqs = await mapOf('EQUIPMENT');
  const ces = await recs('CONTRACT_EQUIPMENT');
  const t = today();
  const rows = all.map((c) => {
    const ref = contractRefDate(c);
    const due = c.lifecycle_status === 'ACTIVE' ? dueInfo(ref.date, t) : null;
    const eqList = ces.filter((x) => x.contract_id === c.contract_id).map((x) => eqs.get(x.equipment_id)).filter(Boolean);
    return { c, ref, due, eqList, endLeft: daysBetween(t, c.end_date), v: vendors.get(c.vendor_id) };
  });
  const q = filt.q.toLowerCase();
  const base = rows.filter((x) => (filt.life === 'ALL' || x.c.lifecycle_status === filt.life) &&
    (!q || [x.c.contract_code, x.c.contract_number, x.c.title_vi, x.c.title_zh, x.v && x.v.name, ...x.eqList.map((e) => e.equipment_code)].join(' ').toLowerCase().includes(q)));
  const states = ['ALL', 'OVERDUE', 'DUE_TODAY', 'DUE_SOON', 'NOT_DUE'];
  const count = (st) => base.filter((x) => st === 'ALL' || (x.due && x.due.state === st)).length;
  const list = base.filter((x) => filt.state === 'ALL' || (x.due && x.due.state === filt.state))
    .sort((a, b) => (a.due ? a.due.days ?? 1e9 : 1e9) - (b.due ? b.due.days ?? 1e9 : 1e9) || String(a.c.contract_code).localeCompare(String(b.c.contract_code)));
  const toolbar = `<div class="toolbar">
    <div class="search"><span>${ICON.search}</span><input id="co-q" type="search" value="${esc(filt.q)}" placeholder="${esc(biText('field.search_placeholder'))}" autocomplete="off"></div>
    <div class="chips">${states.map((st) => `<button type="button" class="chip${filt.state === st ? ' on' : ''}" data-state="${st}">${bi('due_filter.' + st)} <span class="count">${count(st)}</span></button>`).join('')}</div>
    <div class="row"><select id="co-life" class="sel" aria-label="${esc(biText('co.lifecycle_filter'))}">${['ACTIVE', 'ENDED', 'NOT_RENEWED', 'ALL'].map((k) => `<option value="${k}"${filt.life === k ? ' selected' : ''}>${k === 'ALL' ? bi('due_filter.ALL') : bi('contract_lifecycle.' + k)}</option>`).join('')}</select></div>
    <div class="row tools">
      ${canCreate && wide ? `<a class="btn small primary" href="#/contracts/new">${ICON.plus}<span>${bi('co.new')}</span></a>` : ''}
      <button type="button" class="btn small dim" data-soon="1" aria-disabled="true">${ICON.reports}<span>${bi('btn.report')}</span><span class="soon">${bi('tag.coming_soon')}</span></button>
      ${await excelLink('contracts')}
    </div>
    <p class="muted small">${bi('field.total', { N: list.length })}</p></div>`;
  let body;
  if (wide) {
    body = `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('col.code')}</th><th>${bi('co.title')}</th><th>${bi('field.vendor')}</th><th>${bi('module.equipment')}</th>
      <th>${bi('field.end_date')}</th><th>${bi('field.renewal_notice_date')}</th><th>${bi('col.status')}</th></tr></thead>
      <tbody>${list.map((x) => `<tr class="click" data-id="${esc(x.c.contract_id)}"><td class="code">${esc(x.c.contract_code)}${Number(x.c.revision) > 1 ? ` <span class="muted small">#${esc(x.c.revision)}</span>` : ''}</td>
        <td>${biName(x.c, 'title')}</td><td>${esc(x.v ? x.v.name : '')}</td><td>${esc(x.eqList.map((e) => e.equipment_code).join(', '))}</td>
        <td class="num${x.ref.kind === 'END_DATE' ? ' ref' : ''}">${esc(fmtDate(x.c.end_date))}</td><td class="num${x.ref.kind === 'RENEWAL_NOTICE' ? ' ref' : ''}">${esc(fmtDate(x.c.renewal_notice_date))}</td>
        <td>${x.due ? badge(x.due.key, x.due.vars) : ''} ${lifeBadge(x.c)}</td></tr>`).join('')}</tbody></table></div>`;
  } else {
    body = `<div class="cards">${list.map((x) => `<a class="card rec-card" href="#/contracts/${esc(x.c.contract_id)}">
      <div class="rec-top"><span class="code">${esc(x.c.contract_code)}</span>${lifeBadge(x.c)}</div>
      <div class="rec-name">${biName(x.c, 'title')}</div>
      <div class="muted small">${esc([x.v && x.v.name, x.eqList.map((e) => e.equipment_code).join(', ')].filter(Boolean).join(' · '))}</div>
      <div class="dates"><span${x.ref.kind === 'RENEWAL_NOTICE' ? ' class="ref"' : ''}>${bi('field.renewal_notice_date')}: <strong>${esc(fmtDate(x.c.renewal_notice_date) || '—')}</strong></span>
        <span${x.ref.kind === 'END_DATE' ? ' class="ref"' : ''}>${bi('field.end_date')}: <strong>${esc(fmtDate(x.c.end_date) || '—')}</strong></span></div>
      ${x.due ? `<div class="rec-badges">${badge(x.due.key, x.due.vars)}</div>` : ''}</a>`).join('')}</div>`;
  }
  view.innerHTML = toolbar + (list.length ? body : `<div class="card empty-state">${ICON.contracts}<p class="muted">${bi(all.length ? 'field.no_records' : 'co.no_contracts')}</p></div>`);
  const again = () => renderContractList(view, ctx);
  let tm = null;
  $('#co-q', view).addEventListener('input', (e) => { filt.q = e.target.value; clearTimeout(tm); tm = setTimeout(async () => { const pos = e.target.selectionStart; await again(); const el = $('#co-q', view); el.focus(); try { el.setSelectionRange(pos, pos); } catch (er) { /* bỏ qua */ } }, 250); });
  $$('[data-state]', view).forEach((b) => b.addEventListener('click', () => { filt.state = b.dataset.state; again(); }));
  $('#co-life', view).addEventListener('change', (e) => { filt.life = e.target.value; again(); });
  $$('tr[data-id]', view).forEach((tr) => tr.addEventListener('click', () => navigate('/contracts/' + tr.dataset.id)));
}

/* ======================= CO-02 Hồ sơ ======================= */

export async function renderContract(view, ctx) {
  const { shell, params } = ctx;
  const c = await byId('CONTRACT', params.id);
  const can_ = {};
  for (const a of ['contract.edit', 'contract.editTerms', 'contract.archive', 'contract.close', 'contract.renewal.create', 'contract.renewal.submit', 'contract.renewal.approve', 'contract.service.record', 'contract.service.accept']) can_[a] = await can(a);
  shell.setScreen({
    title: c && c.status !== 'APPROVED' ? 'co.renewal_draft' : 'co.detail', back: '/contracts',
    actions: c ? [
      ...(c.qr_key ? [{ icon: 'qr', label: biText('btn.view_qr'), onClick: () => navigate(`/qr/CONTRACT/${c.contract_id}`) }] : []),
      ...(can_['contract.edit'] && (c.lifecycle_status === 'ACTIVE' || c.status === 'DRAFT' || c.status === 'REJECTED') ? [{ icon: 'edit', label: biText('btn.edit'), onClick: () => navigate(`/contracts/${c.contract_id}/edit`), disabled: !navigator.onLine }] : [])
    ] : []
  });
  if (!c) { view.innerHTML = `<div class="card">${bi(navigator.onLine ? 'qr.unavailable' : 'sync.need_network')}</div>`; return; }
  const online = navigator.onLine;
  const uid = session.user && session.user.user_id;
  const showCost = (await costModules()).includes('contracts');
  const v = await byId('VENDOR', c.vendor_id);
  const ref = contractRefDate(c);
  const due = c.lifecycle_status === 'ACTIVE' ? dueInfo(ref.date) : null;
  const ces = (await recs('CONTRACT_EQUIPMENT')).filter((x) => x.contract_id === c.contract_id);
  const eqs = await mapOf('EQUIPMENT');
  const svcs = (await recs('CONTRACT_SERVICE')).filter((x) => x.contract_id === c.contract_id).sort((a, b) => String(a.due_date || a.performed_at).localeCompare(String(b.due_date || b.performed_at)));
  const local = (await queueItems()).filter((o) => o.action === 'contract.service.record' && o.payload && (o.payload.contract_id === c.contract_id || svcs.some((s) => s.service_id === o.payload.service_id)) && o.user_id === uid);
  const all = await recs('CONTRACT');
  const chain = all.filter((x) => x.contract_code === c.contract_code).sort((a, b) => Number(b.revision || 0) - Number(a.revision || 0));
  const isDraft = ['DRAFT', 'PENDING_APPROVAL', 'REJECTED'].includes(c.status);
  const openDraft = chain.find((x) => x.previous_contract_id === c.contract_id && ['DRAFT', 'PENDING_APPROVAL'].includes(x.status));
  const kv = (k, val, cls = '') => (val ? `<div class="kv${cls}"><span>${bi(k)}</span><strong>${val}</strong></div>` : '');
  const mark = (k) => (c.lifecycle_status === 'ACTIVE' && ref.kind === k ? ` <span class="badge t-amber">${bi('co.reference_marker')}</span>` : '');
  const ceName = (id) => { const ce = ces.find((x) => x.contract_equipment_id === id); const e = ce && eqs.get(ce.equipment_id); return e ? e.equipment_code : ''; };
  view.innerHTML = `<section class="card">
    ${isDraft ? `<p class="banner info">${bi('co.renewal_help')}</p>` : ''}
    <div class="rec-top"><span class="code big">${esc(c.contract_code)}</span><span>${lifeBadge(c)} ${due ? badge(due.key, due.vars) : ''}</span></div>
    <h2 class="eq-name">${biName(c, 'title')}</h2>
    ${retranslateButton('CONTRACT', c.contract_id, c, can_['contract.edit'] && c.lifecycle_status === 'ACTIVE') ? `<div class="row">${retranslateButton('CONTRACT', c.contract_id, c, can_['contract.edit'] && c.lifecycle_status === 'ACTIVE')}</div>` : ''}
    <div class="kv-grid">
      ${kv('co.revision', esc(String(c.revision || 1)))}
      ${kv('co.number', esc(c.contract_number || ''))}
      ${kv('field.vendor', v ? esc(v.vendor_code + ' · ' + v.name) : '')}
      ${kv('field.owner', esc(c.owner_name || ''))}
      ${kv('co.start_date', esc(fmtDate(c.start_date)))}
      ${kv('field.end_date', esc(fmtDate(c.end_date)) + mark('END_DATE'))}
      ${kv('field.renewal_notice_date', esc(fmtDate(c.renewal_notice_date) || biText('field.not_set')) + mark('RENEWAL_NOTICE'))}
      ${showCost && c.value !== undefined ? kv('co.value', money(c.value, c.currency)) : ''}
      ${kv('co.scope', c.scope_vi || c.scope_zh ? biName(c, 'scope') : '')}
      ${c.closed_at ? kv('co.close', `${esc(fmtDate(c.closed_at))} · ${biName(c, 'closed_reason')}`) : ''}
    </div>
    ${!showCost && c.meta && c.meta.cost_hidden ? `<p class="muted small">${bi('cost.hidden')}</p>` : ''}
    <div class="row">
      ${!isDraft && c.lifecycle_status === 'ACTIVE' && can_['contract.renewal.create'] && !openDraft ? `<button type="button" class="btn small primary" id="co-renew" ${online ? '' : 'disabled'}>${bi('co.renewal_new')}</button>` : ''}
      ${openDraft ? `<a class="btn small" href="#/contracts/${esc(openDraft.contract_id)}">${bi('co.renewal_draft')} · ${badge('renewal_status.' + openDraft.status)}</a>` : ''}
      ${!isDraft && c.lifecycle_status === 'ACTIVE' && can_['contract.editTerms'] ? `<button type="button" class="btn small" id="co-terms" ${online ? '' : 'disabled'}>${bi('co.edit_terms')}</button>` : ''}
      ${!isDraft && c.lifecycle_status === 'ACTIVE' && can_['contract.close'] ? `<button type="button" class="btn small" id="co-close" ${online ? '' : 'disabled'}>${bi('co.close')}</button>` : ''}
      ${isDraft && ['DRAFT', 'REJECTED'].includes(c.status) && can_['contract.renewal.submit'] ? `<button type="button" class="btn small primary" id="co-submit" ${online ? '' : 'disabled'}>${bi('btn.submit_review')}</button>` : ''}
      ${c.status === 'PENDING_APPROVAL' && can_['contract.renewal.approve'] && c.created_by !== uid && c.submitted_by !== uid ? `<button type="button" class="btn small primary" id="co-appr" ${online ? '' : 'disabled'}>${ICON.check}<span>${bi('btn.approve')}</span></button><button type="button" class="btn small" id="co-rej" ${online ? '' : 'disabled'}>${bi('btn.reject')}</button>` : ''}
      ${can_['contract.archive'] && !c.archived_at && c.lifecycle_status !== 'ACTIVE' ? `<button type="button" class="btn small" id="co-arch" ${online ? '' : 'disabled'}>${ICON.archive}<span>${bi('co.archive')}</span></button>` : ''}
    </div>
    ${!online ? `<p class="muted small">${bi('sync.need_network')}</p>` : ''}
  </section>
  <section class="card"><h3>${bi('co.equipment')}</h3>
    ${ces.length ? `<ul class="list">${ces.map((x) => { const e = eqs.get(x.equipment_id); return `<li>${e ? `<a class="code" href="#/equipment/${esc(e.equipment_id)}">${esc(e.equipment_code)}</a> ${biName(e)}` : ''}
      <div class="muted small">${x.service_vi || x.service_zh ? biName(x, 'service') : ''}${x.interval_value ? ` · ${bi('co.interval')}: ${fmtNumber(x.interval_value)} ${bi('interval.' + (x.interval_type || 'MONTH'))}` : ''}${x.next_service_date ? ` · ${bi('co.next_service')}: ${esc(fmtDate(x.next_service_date))}` : ''}${showCost && x.price !== undefined && x.price !== '' ? ' · ' + money(x.price, x.currency) : ''}</div></li>`; }).join('')}</ul>` : `<p class="muted">${bi('field.not_set')}</p>`}
    ${!isDraft && c.lifecycle_status === 'ACTIVE' && can_['contract.edit'] && online ? `<div class="row"><a class="btn small" id="co-add-eq" href="#/contracts/${esc(c.contract_id)}/edit">${ICON.plus}<span>${bi('co.add_equipment')}</span></a></div>` : ''}
  </section>
  <section class="card"><h3>${bi('co.services')}</h3>
    <ul class="list">
      ${local.map((o) => `<li>${esc(fmtDate(String(o.payload.performed_at).slice(0, 10)))} · ${esc(o.payload.result_vi || o.payload.result_zh || '')} <span class="badge t-amber">${bi('sync.local_saved')}</span> ${badge('op_state.' + (o.state === 'SENDING' ? 'SENDING' : o.state))}</li>`).join('')}
      ${svcs.map((s) => `<li class="hist-row"><div>${s.due_date ? `${bi('co.service_due')}: <strong>${esc(fmtDate(s.due_date))}</strong>` : ''}${ceName(s.contract_equipment_id) ? ' · ' + esc(ceName(s.contract_equipment_id)) : ''}
          ${s.performed_at ? ` · ${bi('co.performed_at')}: <strong>${esc(fmtDate(String(s.performed_at).slice(0, 10)))}</strong>` : ''} ${badge('service_status.' + (s.status || 'PLANNED'))}
          ${s.result_vi || s.result_zh ? `<div class="small">${biName(s, 'result')}</div>` : ''}
          ${showCost && s.cost !== undefined && s.cost !== '' ? `<div class="muted small">${bi('in.cost')}: ${money(s.cost, s.currency)}</div>` : ''}</div>
        <div class="row">
          ${s.status !== 'ACCEPTED' && can_['contract.service.record'] && c.lifecycle_status === 'ACTIVE' ? `<button type="button" class="btn tiny" data-rec="${esc(s.service_id)}">${bi('co.record_service')}</button>` : ''}
          ${s.status === 'DONE' && can_['contract.service.accept'] && s.created_by !== uid && s.updated_by !== uid ? `<button type="button" class="btn tiny primary" data-acc="${esc(s.service_id)}" ${online ? '' : 'disabled'}>${bi('co.accept_service')}</button>` : ''}
        </div></li>`).join('') || (local.length ? '' : `<li class="muted">${bi('field.not_set')}</li>`)}
    </ul>
    ${can_['contract.service.record'] && c.lifecycle_status === 'ACTIVE' ? `<div class="row"><button type="button" class="btn small" id="co-rec-new">${ICON.plus}<span>${bi('co.record_service')}</span></button></div>` : ''}
  </section>
  <section class="card tab-body"><h3>${bi('tab.documents')}</h3><div id="co-docs"></div></section>
  ${chain.length > 1 ? `<section class="card"><h3>${bi('co.history')}</h3><ul class="list">${chain.map((x) => `<li><a href="#/contracts/${esc(x.contract_id)}">${bi('co.revision')} ${esc(x.revision)}</a> · ${esc(fmtDate(x.start_date))} – ${esc(fmtDate(x.end_date))} ${lifeBadge(x)}</li>`).join('')}</ul></section>` : ''}`;
  const box = $('#co-docs', view);
  box.innerHTML = await docsTabHtml('CONTRACT', c);
  const repaint = () => renderContract(view, ctx);
  wireDocsTab(box, 'CONTRACT', c, repaint);
  wireRetranslate(view, async () => { await afterCommit(); repaint(); });
  const on = (id, fn) => { const el = $('#' + id, view); if (el) el.addEventListener('click', fn); };
  on('co-renew', () => navigate(`/contracts/${c.contract_id}/renew`));
  on('co-terms', async () => { if (await termsDialog(c, showCost)) repaint(); });
  on('co-close', async () => {
    const r = await dialog({
      title: bi('co.close'),
      body: `<p class="muted small">${bi('co.close_help')}</p><label for="cl-kind">${bi('co.close_kind')}</label><select id="cl-kind" class="inp sel"><option value="NOT_RENEWED">${bi('contract_lifecycle.NOT_RENEWED')}</option><option value="ENDED">${bi('contract_lifecycle.ENDED')}</option></select>
        <label for="cl-reason">${bi('field.reason')} <span class="req">*</span></label><input id="cl-reason" type="text" maxlength="300"><p class="muted small">${bi('in.no_mt')}</p>`,
      actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('co.close'), kind: 'primary danger', read: (w) => ({ kind: $('#cl-kind', w).value, reason: $('#cl-reason', w).value.trim() }) }]
    });
    if (!r) return;
    if (!r.reason) { toast(bi('field.reason_required'), 'err'); return; }
    const res = await writeWithPin('contract.close', { contract_id: c.contract_id, lifecycle_status: r.kind, ...oneLang('closed_reason', r.reason) }, { expected_version: c.record_version });
    if (res.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
  });
  on('co-submit', async () => {
    const res = await writeOnline('contract.renewal.submit', { contract_id: c.contract_id }, { expected_version: c.record_version });
    if (res.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else await handleWriteError(res);
  });
  const decide = async (decision) => {
    let reason = '';
    if (decision === 'REJECT') {
      reason = await dialog({ title: bi('btn.reject'), body: `<label for="rj">${bi('in.reject_reason')} <span class="req">*</span></label><input id="rj" type="text" maxlength="300">`, actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.reject'), kind: 'primary danger', read: (w) => $('#rj', w).value.trim() }] });
      if (reason === null) return;
      if (!reason) { toast(bi('field.reason_required'), 'err'); return; }
    }
    const res = await writeWithPin('contract.renewal.approve', { contract_id: c.contract_id, decision, reason }, { expected_version: c.record_version });
    if (res.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
  };
  on('co-appr', () => decide('APPROVE'));
  on('co-rej', () => decide('REJECT'));
  on('co-arch', async () => {
    const reason = await dialog({ title: bi('co.archive'), body: `<label for="ca">${bi('field.reason')} <span class="req">*</span></label><input id="ca" type="text" maxlength="300">`, actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('co.archive'), kind: 'primary danger', read: (w) => $('#ca', w).value.trim() }] });
    if (reason === null) return;
    if (!reason) { toast(bi('field.reason_required'), 'err'); return; }
    const res = await writeOnline('contract.archive', { contract_id: c.contract_id, reason }, { expected_version: c.record_version });
    if (res.ok) { await afterCommit(); navigate('/contracts', { replace: true }); } else await handleWriteError(res);
  });
  on('co-rec-new', async () => { if (await serviceDialog(c, null, ces, eqs, showCost)) repaint(); });
  $$('[data-rec]', view).forEach((b) => b.addEventListener('click', async () => { const s = svcs.find((x) => x.service_id === b.dataset.rec); if (await serviceDialog(c, s, ces, eqs, showCost)) repaint(); }));
  $$('[data-acc]', view).forEach((b) => b.addEventListener('click', async () => {
    const s = svcs.find((x) => x.service_id === b.dataset.acc);
    const res = await writeWithPin('contract.service.accept', { service_id: s.service_id }, { expected_version: s.record_version });
    if (res.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); repaint(); } else if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
  }));
}

/** Sửa hạn/giá trị phiên hiện hành (PIN, lý do) */
async function termsDialog(c, showCost) {
  const wrap = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card form-card">
    <h2>${bi('co.edit_terms')}</h2><p class="muted small">${bi('co.edit_terms_help')}</p>
    ${dateInput('start_date', 'co.start_date', c.start_date)}${dateInput('end_date', 'field.end_date', c.end_date, { required: true })}${dateInput('renewal_notice_date', 'field.renewal_notice_date', c.renewal_notice_date)}
    ${showCost ? numberInput('value', 'co.value', c.value) : ''}
    ${textInput('reason', 'field.reason', '', { required: true, maxlength: 300 })}
    <p class="form-err err"></p>
    <div class="modal-actions"><button type="button" class="btn" data-x="cancel">${bi('btn.cancel')}</button><button type="button" class="btn primary" data-x="save">${bi('btn.save')}</button></div></div></div>`);
  document.body.appendChild(wrap);
  wireForm(wrap);
  return new Promise((resolve) => {
    $('[data-x="cancel"]', wrap).addEventListener('click', () => { wrap.remove(); resolve(false); });
    $('[data-x="save"]', wrap).addEventListener('click', async (ev) => {
      const p = { contract_id: c.contract_id, reason: readField(wrap, 'reason') };
      for (const f of ['start_date', 'end_date', 'renewal_notice_date']) { const val = readField(wrap, f); if (val === null) { showErrors(wrap, [{ field: f, key: 'field.invalid_date' }]); return; } if (val !== (c[f] || '')) p[f] = val; }
      if (showCost) { const val = readField(wrap, 'value'); if (Number.isNaN(val)) { showErrors(wrap, [{ field: 'value', key: 'field.invalid' }]); return; } if (String(val ?? '') !== String(c.value ?? '')) p.value = val === null ? '' : val; }
      if (!p.reason) { showErrors(wrap, [{ field: 'reason', key: 'field.reason_required' }]); return; }
      busy(ev.currentTarget, true);
      const res = await writeWithPin('contract.editTerms', p, { expected_version: c.record_version });
      busy(ev.currentTarget, false);
      if (res.ok) { wrap.remove(); await afterCommit(); toast(bi('form.saved'), 'ok'); resolve(true); return; }
      if (res.code === 'VALIDATION_ERROR') { showErrors(wrap, res.errors); return; }
      wrap.remove();
      if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
      resolve(false);
    });
  });
}

/** Ghi dịch vụ (offline được): dòng dự kiến hoặc lần mới */
async function serviceDialog(c, s, ces, eqs, showCost) {
  const wrap = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card form-card">
    <h2>${bi('co.record_service')}</h2>
    ${s ? '' : selectInput('contract_equipment_id', 'module.equipment', ces.map((x) => [x.contract_equipment_id, esc((eqs.get(x.equipment_id) || {}).equipment_code || '')]), '')}
    ${dateInput('performed_at', 'co.performed_at', today(), { required: true })}
    ${textInput('result', 'co.result', s ? (s.result_vi || s.result_zh) : '', { required: true, maxlength: 500, hint: bi('in.no_mt') })}
    ${textInput('vendor_contact', 'co.vendor_contact', s ? s.vendor_contact : '', { maxlength: 120 })}
    ${showCost ? numberInput('cost', 'in.cost', s ? s.cost : '') : ''}
    <p class="form-err err"></p>
    <div class="modal-actions"><button type="button" class="btn" data-x="cancel">${bi('btn.cancel')}</button><button type="button" class="btn primary" data-x="save">${bi('btn.save')}</button></div></div></div>`);
  document.body.appendChild(wrap);
  wireForm(wrap);
  return new Promise((resolve) => {
    $('[data-x="cancel"]', wrap).addEventListener('click', () => { wrap.remove(); resolve(false); });
    $('[data-x="save"]', wrap).addEventListener('click', async (ev) => {
      const performed = readField(wrap, 'performed_at');
      const result = readField(wrap, 'result');
      const errs = [];
      if (!performed) errs.push({ field: 'performed_at', key: performed === null ? 'field.invalid_date' : 'field.required' });
      if (!result) errs.push({ field: 'result', key: 'field.required' });
      const cost = showCost ? readField(wrap, 'cost') : undefined;
      if (Number.isNaN(cost)) errs.push({ field: 'cost', key: 'field.invalid' });
      if (errs.length) { showErrors(wrap, errs); return; }
      const p = { service_id: s ? s.service_id : uuid(), performed_at: performed, ...oneLang('result', result), vendor_contact: readField(wrap, 'vendor_contact') };
      if (s) { if (s.result_vi && !p.result_vi) p.result_vi = ''; if (s.result_zh && !p.result_zh) p.result_zh = ''; } else { p.contract_id = c.contract_id; p.contract_equipment_id = readField(wrap, 'contract_equipment_id') || ''; }
      if (showCost && cost !== null) p.cost = cost;
      if (!navigator.onLine) {
        // contract.service.record vào hàng chờ khi offline (4.7)
        await enqueue('contract.service.record', p, { entity_type: 'CONTRACT_SERVICE', entity_id: p.service_id, expected_version: s ? s.record_version : 0 });
        wrap.remove(); toast(bi('sync.local_saved'), 'ok'); resolve(true); return;
      }
      busy(ev.currentTarget, true);
      const res = await writeOnline('contract.service.record', p, { expected_version: s ? s.record_version : 0 });
      busy(ev.currentTarget, false);
      if (res.ok) { wrap.remove(); await afterCommit(); toast(bi('form.saved'), 'ok'); resolve(true); return; }
      if (res.code === 'VALIDATION_ERROR') { showErrors(wrap, res.errors); return; }
      wrap.remove(); await handleWriteError(res); resolve(false);
    });
  });
}

/* ======================= Thêm/sửa, dự thảo gia hạn ======================= */

export async function renderContractForm(view, ctx) {
  const { shell, params } = ctx;
  const path = location.hash;
  const renew = /\/renew/.test(path);
  const isNew = !params.id;
  const base = params.id ? await byId('CONTRACT', params.id) : null;
  shell.setScreen({ title: renew ? 'co.renewal_new' : isNew ? 'co.new' : 'co.edit', back: params.id ? `/contracts/${params.id}` : '/contracts' });
  if (!navigator.onLine) { view.innerHTML = `<div class="card">${bi('sync.need_network')}</div>`; return; }
  const action = renew ? 'contract.renewal.create' : isNew ? 'contract.create' : 'contract.edit';
  if (!(await can(action))) { view.innerHTML = `<div class="card">${bi('err.forbidden')}</div>`; return; }
  if (params.id && !base) { view.innerHTML = `<div class="card">${bi('err.not_found')}</div>`; return; }
  const showCost = (await costModules()).includes('contracts');
  const termsEditable = isNew || renew || (base && ['DRAFT', 'REJECTED'].includes(base.status));
  const vendors = (await recs('VENDOR')).filter((v) => v.active !== false);
  const eqAll = (await recs('EQUIPMENT')).slice().sort((a, b) => String(a.equipment_code).localeCompare(String(b.equipment_code)));
  let users = [];
  if (await can('user.pickList')) { const u = await api('user.pickList', {}, { retry: true }); if (u.ok) users = u.data.items; }
  const ces = base && !renew ? (await recs('CONTRACT_EQUIPMENT')).filter((x) => x.contract_id === base.contract_id) : [];
  const rec = renew ? { start_date: base.end_date ? addOneDay(base.end_date) : '', end_date: '', renewal_notice_date: '', value: base.value } : (base || {});
  const eqRows = ces.map((x) => ({ ...x }));
  view.innerHTML = `<form class="card form-card" novalidate>
    ${renew ? `<p class="banner info">${bi('co.renewal_help')}</p><p><strong>${esc(base.contract_code)}</strong> · ${biName(base, 'title')}</p>` : ''}
    <div class="form-grid">
      ${renew ? '' : bilingualInputs('title', rec, { labelKey: 'co.title' })}
      ${renew ? '' : textInput('contract_number', 'co.number', rec.contract_number, { maxlength: 80 })}
      ${renew ? '' : selectInput('vendor_id', 'field.vendor', vendors.map((v) => [v.vendor_id, `${esc(v.vendor_code)} · ${esc(v.name)}`]), rec.vendor_id)}
      ${renew ? '' : selectInput('owner_user_id', 'field.owner', users.map((u) => [u.user_id, esc(`${u.employee_code} · ${u.display_name}`)]), rec.owner_user_id)}
      ${termsEditable ? dateInput('start_date', 'co.start_date', rec.start_date) + dateInput('end_date', 'field.end_date', rec.end_date, { required: true }) + dateInput('renewal_notice_date', 'field.renewal_notice_date', rec.renewal_notice_date) : ''}
      ${termsEditable && showCost ? numberInput('value', 'co.value', rec.value, { hint: 'VND' }) : ''}
      ${renew ? '' : bilingualInputs('scope', rec, { required: false, labelKey: 'co.scope', area: true, maxlength: 1000, suggest: 'contracts' })}
    </div>
    ${renew ? '' : `<p class="muted small">${bi('in.no_mt')} (${bi('co.scope')})</p>
    <fieldset class="bi-pair"><legend>${bi('co.equipment')}</legend><div id="ce-rows"></div>
      <div class="row"><select id="ce-add" class="sel"><option value="">${bi('co.add_equipment')}</option>${eqAll.map((e) => `<option value="${esc(e.equipment_id)}">${esc(e.equipment_code)} · ${esc(nameText(e))}</option>`).join('')}</select></div></fieldset>`}
    <p class="form-err err" role="alert"></p>
    <div class="row form-actions"><button type="button" class="btn" id="fm-cancel">${bi('btn.cancel')}</button><button type="submit" class="btn primary" id="fm-save">${bi(renew ? 'btn.save_draft' : 'btn.save')}</button></div>
  </form>`;
  const form = $('form', view);
  wireForm(form);
  const eqMap = new Map(eqAll.map((e) => [e.equipment_id, e]));
  const paintRows = () => {
    const box = $('#ce-rows', form);
    if (!box) return;
    box.innerHTML = eqRows.filter((x) => !x.remove).map((x) => `<div class="ce-row" data-ce="${esc(x.contract_equipment_id)}">
      <div><strong>${esc((eqMap.get(x.equipment_id) || {}).equipment_code || '')}</strong> ${esc(nameText(eqMap.get(x.equipment_id)))}</div>
      <div class="ce-grid">
        <input class="inp" data-k="service" placeholder="${esc(biText('field.service'))}" value="${esc(x.service_vi || x.service_zh || '')}">
        <input class="inp num" data-k="interval_value" inputmode="numeric" placeholder="${esc(biText('co.interval'))}" value="${esc(x.interval_value ?? '')}">
        <select class="inp sel" data-k="interval_type">${INTERVALS.map((k) => `<option value="${k}"${(x.interval_type || 'MONTH') === k ? ' selected' : ''}>${bi('interval.' + k)}</option>`).join('')}</select>
        <input class="inp" type="date" data-k="next_service_date" value="${esc(x.next_service_date || '')}" aria-label="${esc(biText('co.next_service'))}">
        ${showCost ? `<input class="inp num" data-k="price" inputmode="decimal" placeholder="${esc(biText('co.value'))}" value="${esc(x.price ?? '')}">` : ''}
        <button type="button" class="btn tiny" data-rm="${esc(x.contract_equipment_id)}">${ICON.trash}</button>
      </div></div>`).join('');
    $$('[data-rm]', box).forEach((b) => b.addEventListener('click', () => { const r = eqRows.find((y) => y.contract_equipment_id === b.dataset.rm); if (r) { if (r.__new) eqRows.splice(eqRows.indexOf(r), 1); else r.remove = true; } paintRows(); }));
    $$('.ce-row', box).forEach((row) => row.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('change', () => {
      const r = eqRows.find((y) => y.contract_equipment_id === row.dataset.ce);
      const k = inp.dataset.k;
      if (k === 'service') { Object.assign(r, { service_vi: '', service_zh: '' }, oneLang('service', inp.value)); r.__dirty = true; return; }
      r[k] = inp.value; r.__dirty = true;
    })));
  };
  paintRows();
  const add = $('#ce-add', form);
  if (add) add.addEventListener('change', () => {
    if (!add.value) return;
    if (!eqRows.some((x) => x.equipment_id === add.value && !x.remove)) eqRows.push({ contract_equipment_id: uuid(), equipment_id: add.value, interval_type: 'MONTH', __new: true, __dirty: true });
    add.value = '';
    paintRows();
  });
  $('#fm-cancel', form).addEventListener('click', () => back(params.id ? `/contracts/${params.id}` : '/contracts'));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const p = {};
    const errs = [];
    if (!renew) {
      p.title_vi = readField(form, 'title_vi'); p.title_zh = readField(form, 'title_zh');
      if (!p.title_vi && !p.title_zh) errs.push({ field: 'title', key: 'field.one_lang' });
      p.contract_number = readField(form, 'contract_number'); p.vendor_id = readField(form, 'vendor_id'); p.owner_user_id = readField(form, 'owner_user_id');
      p.scope_vi = readField(form, 'scope_vi'); p.scope_zh = readField(form, 'scope_zh');
    }
    if (termsEditable) {
      for (const f of ['start_date', 'end_date', 'renewal_notice_date']) { const v = readField(form, f); if (v === null) errs.push({ field: f, key: 'field.invalid_date' }); else p[f] = v; }
      if (!p.end_date) errs.push({ field: 'end_date', key: 'field.required' });
      if (p.renewal_notice_date && p.end_date && p.renewal_notice_date > p.end_date) errs.push({ field: 'renewal_notice_date', key: 'field.invalid_date' });
      if (showCost) { const v = readField(form, 'value'); if (Number.isNaN(v)) errs.push({ field: 'value', key: 'field.invalid' }); else if (v !== null) p.value = v; }
    }
    const as = assistedFields(form);
    if (!as.ok) errs.push(...as.errors);
    if (errs.length) { showErrors(form, errs); return; }
    if (as.bases.length) p.i18n_assisted = as.bases;
    if (!renew) {
      p.equipment = eqRows.filter((x) => x.__dirty || x.remove).map((x) => {
        if (x.remove) return { contract_equipment_id: x.contract_equipment_id, remove: true };
        const o = { contract_equipment_id: x.contract_equipment_id, service_vi: x.service_vi || '', service_zh: x.service_zh || '', interval_type: x.interval_type || 'MONTH', interval_value: x.interval_value === '' || x.interval_value === undefined ? '' : Number(x.interval_value), next_service_date: x.next_service_date || '' };
        if (x.__new) o.equipment_id = x.equipment_id;
        if (showCost && x.price !== undefined && x.price !== '') o.price = Number(String(x.price).replace(/[\s  ]/g, '').replace(',', '.'));
        // Dịch vụ tới: tạo dòng lịch dịch vụ dự kiến
        return o;
      });
      p.services = eqRows.filter((x) => !x.remove && x.__new && x.next_service_date).map((x) => ({ service_id: uuid(), contract_equipment_id: x.contract_equipment_id, due_date: x.next_service_date }));
    }
    let id = params.id;
    if (renew) { id = uuid(); p.contract_id = id; p.previous_contract_id = base.contract_id; } else if (isNew) { id = uuid(); p.contract_id = id; } else p.contract_id = base.contract_id;
    if (!isNew && !renew && !termsEditable) ['start_date', 'end_date', 'renewal_notice_date', 'value'].forEach((f) => delete p[f]);
    const btn = $('#fm-save', form);
    busy(btn, true);
    const res = await writeOnline(action, p, { expected_version: isNew || renew ? 0 : base.record_version });
    busy(btn, false);
    if (res.ok) { await afterCommit(); toast(bi('form.saved'), 'ok'); navigate(`/contracts/${id}`, { replace: true }); return; }
    if (res.code === 'VALIDATION_ERROR') { showErrors(form, res.errors); return; }
    await handleWriteError(res);
  });
}

function addOneDay(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export { L, fieldWrap, fmtDateTime };

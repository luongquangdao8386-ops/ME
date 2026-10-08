// Quản trị → Danh mục chung (4.4.13): khu vực (C4), nhà cung cấp (HĐ, C3, C4), danh mục tra cứu (C3, C4), thuật ngữ Glossary (C3, C4)
import { api, bi, esc, badge, biName, nameText, uuid, resMsg } from '../core.js';
import { $, $$, h, ICON, toast } from '../ui.js';
import { isWide } from '../shell.js';
import { recs, can } from '../data.js';
import { textInput, textArea, selectInput, bilingualInputs, wireForm, readField, showErrors, writeOnline, busy } from '../form.js';
import { afterCommit } from '../app.js';
import { handleWriteError } from './equipment.js';

const TABS = ['locations', 'vendors', 'lookups', 'glossary'];
const LOC_TYPES = ['AREA', 'BUILDING', 'WORKSHOP', 'ROOM', 'STATION', 'OTHER'];
const GROUPS = ['EQUIPMENT_CATEGORY', 'UNIT', 'SPEC_KEY', 'CAUSE'];
let tab = 'locations';
let group = 'EQUIPMENT_CATEGORY';

const activeBadge = (r) => badge(r.active === false ? 'catalog.inactive' : 'catalog.active');
const check = (id, key, on) => `<div class="fld" data-field="${id}"><label class="check"><input type="checkbox" id="f-${id}"${on ? ' checked' : ''}><span>${bi(key)}</span></label><div class="ferr" role="alert"></div></div>`;

/** Khung form trong hộp thoại; save(wrap) trả phản hồi ghi hoặc null (lỗi trên máy) */
function formDialog(titleHtml, inner, save) {
  const wrap = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card form-card"><h2>${titleHtml}</h2>${inner}
    <p class="form-err err"></p>
    <div class="modal-actions"><button type="button" class="btn" data-x="cancel">${bi('btn.cancel')}</button><button type="button" class="btn primary" data-x="save">${bi('btn.save')}</button></div></div></div>`);
  document.body.appendChild(wrap);
  wireForm(wrap);
  return new Promise((resolve) => {
    $('[data-x="cancel"]', wrap).addEventListener('click', () => { wrap.remove(); resolve(false); });
    $('[data-x="save"]', wrap).addEventListener('click', async (ev) => {
      if (!navigator.onLine) { toast(bi('sync.need_network'), 'err'); return; }
      busy(ev.currentTarget, true);
      const res = await save(wrap);
      busy(ev.currentTarget, false);
      if (!res) return;
      if (res.ok) { wrap.remove(); await afterCommit(); toast(bi('form.saved'), 'ok'); resolve(true); return; }
      if (res.code === 'VALIDATION_ERROR') { showErrors(wrap, res.errors); return; }
      wrap.remove();
      await handleWriteError(res);
      resolve(false);
    });
  });
}

/** Chỉ gửi trường đã đổi (sửa) — trường song ngữ gửi cả cặp khi một bên đổi */
function diff(payload, cur, pairs = []) {
  if (!cur) return payload;
  const out = {};
  Object.keys(payload).forEach((k) => {
    const base = pairs.find((p) => k === p + '_vi' || k === p + '_zh');
    if (base) { if ((payload[base + '_vi'] || '') !== (cur[base + '_vi'] || '') || (payload[base + '_zh'] || '') !== (cur[base + '_zh'] || '')) out[k] = payload[k]; return; }
    if (String(payload[k] ?? '') !== String(cur[k] ?? '')) out[k] = payload[k];
  });
  return out;
}

async function locationDialog(loc, all) {
  const others = all.filter((x) => !loc || x.location_id !== loc.location_id);
  const inner = `${loc ? `<p><strong class="code">${esc(loc.location_code)}</strong></p>` : textInput('location_code', 'field.location_code', '', { maxlength: 32, upper: true, hint: bi('field.code_auto') })}
    ${bilingualInputs('name', loc || {}, { labelKey: 'field.name' })}
    ${selectInput('type', 'field.location_type', LOC_TYPES.map((t) => [t, bi('location_type.' + t)]), (loc && loc.type) || 'AREA', { empty: '' })}
    ${selectInput('parent_location_id', 'field.parent_location', others.map((x) => [x.location_id, `${esc(x.location_code)} · ${esc(nameText(x))}`]), loc ? loc.parent_location_id : '')}
    ${check('active', 'field.in_use', !loc || loc.active !== false)}`;
  return formDialog(bi(loc ? 'btn.edit' : 'btn.add') + ' · ' + bi('adm.cat.locations'), inner, (w) => {
    const p = { name_vi: readField(w, 'name_vi'), name_zh: readField(w, 'name_zh'), type: readField(w, 'type'), parent_location_id: readField(w, 'parent_location_id') || '', active: readField(w, 'active') };
    if (!p.name_vi && !p.name_zh) { showErrors(w, [{ field: 'name', key: 'field.one_lang' }]); return null; }
    if (!loc) { const code = readField(w, 'location_code'); if (code) p.location_code = code; }
    return writeOnline('location.edit', { location_id: loc ? loc.location_id : uuid(), ...diff(p, loc, ['name']) }, { expected_version: loc ? loc.record_version : 0 });
  });
}

async function vendorDialog(v) {
  const inner = `${v ? `<p><strong class="code">${esc(v.vendor_code)}</strong></p>` : textInput('vendor_code', 'field.vendor_code', '', { maxlength: 32, upper: true, hint: bi('field.code_auto') })}
    ${textInput('name', 'field.vendor_name', v ? v.name : '', { required: true, maxlength: 200 })}
    ${textInput('contact_name', 'field.contact_name', v ? v.contact_name : '', { maxlength: 120 })}
    ${textInput('phone', 'field.phone', v ? v.phone : '', { maxlength: 40, inputmode: 'tel' })}
    ${textInput('email', 'field.email', v ? v.email : '', { maxlength: 120, inputmode: 'email' })}
    ${textInput('address', 'field.address', v ? v.address : '', { maxlength: 200 })}
    ${bilingualInputs('services', v || {}, { labelKey: 'field.services', required: false, area: true })}
    ${check('active', 'field.in_use', !v || v.active !== false)}`;
  return formDialog(bi(v ? 'btn.edit' : 'btn.add') + ' · ' + bi('adm.cat.vendors'), inner, (w) => {
    const p = { name: readField(w, 'name'), contact_name: readField(w, 'contact_name'), phone: readField(w, 'phone'), email: readField(w, 'email'), address: readField(w, 'address'),
      services_vi: readField(w, 'services_vi'), services_zh: readField(w, 'services_zh'), active: readField(w, 'active') };
    if (!p.name) { showErrors(w, [{ field: 'name', key: 'field.required' }]); return null; }
    if (!v) { const code = readField(w, 'vendor_code'); if (code) p.vendor_code = code; }
    return writeOnline('vendor.edit', { vendor_id: v ? v.vendor_id : uuid(), ...diff(p, v, ['services']) }, { expected_version: v ? v.record_version : 0 });
  });
}

async function lookupDialog(l) {
  const g = l ? l.group_key : group;
  const inner = `${l ? `<p>${bi('lookup_group.' + g)} · <strong class="code">${esc(l.code)}</strong></p>`
    : `${selectInput('group_key', 'field.lookup_group', GROUPS.map((x) => [x, bi('lookup_group.' + x)]), g, { empty: '' })}
       ${textInput('code', 'field.lookup_code', '', { required: true, maxlength: 40, hint: bi('field.lookup_code_hint') })}`}
    ${bilingualInputs('name', l || {}, { labelKey: 'field.name' })}
    ${check('active', 'field.in_use', !l || l.active !== false)}`;
  return formDialog(bi(l ? 'btn.edit' : 'btn.add') + ' · ' + bi('adm.cat.lookups'), inner, (w) => {
    const p = { name_vi: readField(w, 'name_vi'), name_zh: readField(w, 'name_zh'), active: readField(w, 'active') };
    if (!p.name_vi && !p.name_zh) { showErrors(w, [{ field: 'name', key: 'field.one_lang' }]); return null; }
    if (!l) { p.group_key = readField(w, 'group_key'); p.code = readField(w, 'code'); if (!p.code) { showErrors(w, [{ field: 'code', key: 'field.required' }]); return null; } }
    return writeOnline('lookup.edit', { value_id: l ? l.value_id : uuid(), ...diff(p, l, ['name']) }, { expected_version: l ? l.record_version : 0 });
  });
}

async function glossaryDialog(g) {
  const inner = `<p class="muted small">${bi('glossary.help')}</p>
    ${textInput('term_vi', 'field.term_vi', g ? g.term_vi : '', { required: true, maxlength: 120 })}
    ${textInput('term_zh', 'field.term_zh', g ? g.term_zh : '', { required: true, maxlength: 120 })}
    ${textArea('note', 'field.note', g ? g.note : '', { rows: 2 })}
    ${check('approve', 'glossary.approve', !!(g && g.approved_by))}
    ${check('active', 'field.in_use', !g || g.active !== false)}`;
  return formDialog(bi(g ? 'btn.edit' : 'btn.add') + ' · ' + bi('adm.cat.glossary'), inner, (w) => {
    const p = { term_vi: readField(w, 'term_vi'), term_zh: readField(w, 'term_zh'), note: readField(w, 'note'), active: readField(w, 'active') };
    const errs = [];
    if (!p.term_vi) errs.push({ field: 'term_vi', key: 'field.required' });
    if (!p.term_zh) errs.push({ field: 'term_zh', key: 'field.required' });
    if (errs.length) { showErrors(w, errs); return null; }
    const out = { glossary_id: g ? g.glossary_id : uuid(), ...diff(p, g) };
    const approve = readField(w, 'approve');
    if (!g || approve !== !!g.approved_by || out.term_vi !== undefined || out.term_zh !== undefined) out.approve = approve;
    return writeOnline('glossary.edit', out, { expected_version: g ? g.record_version : 0 });
  });
}

export async function renderCatalog(view, { shell }) {
  shell.setScreen({ title: 'admin.catalog', back: '/account' });
  const perm = { locations: await can('location.edit'), vendors: await can('vendor.edit'), lookups: await can('lookup.edit'), glossary: await can('glossary.edit') };
  const repaint = () => renderCatalog(view, { shell });
  const tabBar = `<div class="tabs-bar" role="tablist">${TABS.map((t) => `<button type="button" role="tab" class="tab${t === tab ? ' on' : ''}" data-tab="${t}" aria-selected="${t === tab}">${bi('adm.cat.' + t)}</button>`).join('')}</div>`;
  const addBtn = perm[tab] ? `<button type="button" class="btn small primary" id="cat-add"${navigator.onLine ? '' : ' disabled'}>${ICON.plus}${bi('btn.add')}</button>` : '';
  const editBtn = (id) => (perm[tab] ? `<button type="button" class="btn small" data-edit="${esc(id)}"${navigator.onLine ? '' : ' disabled'}>${ICON.edit}${bi('btn.edit')}</button>` : '');
  const table = (heads, rows) => (isWide()
    ? `<div class="table-wrap"><table class="tbl"><thead><tr>${heads.map((x) => `<th>${x}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map((r) => `<tr>${r.cells.map((c) => `<td>${c}</td>`).join('')}<td>${editBtn(r.id)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="cards">${rows.map((r) => `<div class="card rec-card">${r.card}${editBtn(r.id) ? `<div class="rec-actions">${editBtn(r.id)}</div>` : ''}</div>`).join('')}</div>`);
  let body = '', items = [];
  if (tab === 'locations') {
    items = (await recs('LOCATION')).slice().sort((a, b) => String(a.location_code).localeCompare(String(b.location_code)));
    const byId = new Map(items.map((x) => [x.location_id, x]));
    body = table([bi('field.location_code'), bi('field.name'), bi('field.location_type'), bi('field.parent_location'), bi('col.status')], items.map((x) => {
      const par = byId.get(x.parent_location_id);
      return { id: x.location_id, cells: [`<span class="code">${esc(x.location_code)}</span>`, biName(x), x.type ? bi('location_type.' + x.type) : '', par ? esc(par.location_code) : '—', activeBadge(x)],
        card: `<div class="rec-top"><span class="code">${esc(x.location_code)}</span>${activeBadge(x)}</div><div class="rec-name">${biName(x)}</div><div class="muted small">${x.type ? bi('location_type.' + x.type) : ''}${par ? ' · ' + esc(par.location_code) : ''}</div>` };
    }));
  } else if (tab === 'vendors') {
    items = (await recs('VENDOR')).slice().sort((a, b) => String(a.vendor_code).localeCompare(String(b.vendor_code)));
    body = table([bi('field.vendor_code'), bi('field.vendor_name'), bi('field.contact_name'), bi('field.services'), bi('col.status')], items.map((x) => ({
      id: x.vendor_id, cells: [`<span class="code">${esc(x.vendor_code)}</span>`, esc(x.name), esc([x.contact_name, x.phone, x.email].filter(Boolean).join(' · ')), biName(x, 'services'), activeBadge(x)],
      card: `<div class="rec-top"><span class="code">${esc(x.vendor_code)}</span>${activeBadge(x)}</div><div class="rec-name">${esc(x.name)}</div><div class="muted small">${esc([x.contact_name, x.phone, x.email].filter(Boolean).join(' · '))}</div>${x.services_vi || x.services_zh ? `<div class="small">${biName(x, 'services')}</div>` : ''}`
    })));
  } else if (tab === 'lookups') {
    items = (await recs('LOOKUP')).filter((x) => x.group_key === group).sort((a, b) => String(a.code).localeCompare(String(b.code)));
    body = `<div class="chips">${GROUPS.map((g) => `<button type="button" class="chip${g === group ? ' on' : ''}" data-group="${g}">${bi('lookup_group.' + g)}</button>`).join('')}</div>` +
      table([bi('field.lookup_code'), bi('field.name'), bi('col.status')], items.map((x) => ({
        id: x.value_id, cells: [`<span class="code">${esc(x.code)}</span>`, biName(x), activeBadge(x)],
        card: `<div class="rec-top"><span class="code">${esc(x.code)}</span>${activeBadge(x)}</div><div class="rec-name">${biName(x)}</div>`
      })));
  } else {
    if (!navigator.onLine) body = `<p class="muted">${bi('sync.need_network')}</p>`;
    else {
      const r = await api('catalog.view', {}, { retry: true });
      if (!r.ok) body = `<p class="muted">${esc(resMsg(r))}</p>`;
      else {
        items = r.data.glossary.slice().sort((a, b) => String(a.term_vi).localeCompare(String(b.term_vi), 'vi'));
        const st = (x) => `${badge(x.approved_by ? 'glossary.approved' : 'glossary.unapproved')} ${x.active === false ? badge('catalog.inactive') : ''}`;
        body = `<p class="muted small">${bi('glossary.help')}</p>` + table([bi('field.term_vi'), bi('field.term_zh'), bi('field.note'), bi('col.status')], items.map((x) => ({
          id: x.glossary_id, cells: [esc(x.term_vi), esc(x.term_zh), esc(x.note || ''), st(x)],
          card: `<div class="rec-name">${esc(x.term_vi)} · ${esc(x.term_zh)}</div>${x.note ? `<div class="muted small">${esc(x.note)}</div>` : ''}<div class="rec-badges">${st(x)}</div>`
        })));
      }
    }
  }
  view.innerHTML = `${tabBar}<div class="tab-body"><div class="toolbar"><div class="row"><span class="muted">${bi('field.total', { N: items.length })}</span>${addBtn}</div></div>${body}</div>`;
  $$('[data-tab]', view).forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; repaint(); }));
  $$('[data-group]', view).forEach((b) => b.addEventListener('click', () => { group = b.dataset.group; repaint(); }));
  const open = async (rec) => {
    const done = tab === 'locations' ? await locationDialog(rec, items) : tab === 'vendors' ? await vendorDialog(rec) : tab === 'lookups' ? await lookupDialog(rec) : await glossaryDialog(rec);
    if (done) repaint();
  };
  const add = $('#cat-add', view);
  if (add) add.addEventListener('click', () => open(null));
  const key = { locations: 'location_id', vendors: 'vendor_id', lookups: 'value_id', glossary: 'glossary_id' }[tab];
  $$('[data-edit]', view).forEach((b) => b.addEventListener('click', () => open(items.find((x) => x[key] === b.dataset.edit))));
}

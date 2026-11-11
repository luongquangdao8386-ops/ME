// Kết nối app ISO (d4.35): bảng mã biểu ISO → nguồn "ngày có hồ sơ" (Settings iso_form_map) mà app ISO đọc qua feed.isoEvidence;
// xem trước số ngày có hồ sơ 400 ngày gần nhất của từng mã (đúng như app ISO sẽ nhận); mã biểu của mẫu checklist (tự tính).
// Chỉ Quản trị (settings.edit + iso.feed.preview). Mã kết nối tạo trong trình soạn Apps Script (adminCreateFeedKeyIso), không hiện trong app.
import { api, bi, biText, esc, fmtDate, fmtNumber, resMsg } from '../core.js';
import { $, $$, ICON, dialog, toast } from '../ui.js';
import { writeWithPin, busy } from '../form.js';
import { handleWriteError } from './equipment.js';

const spinner = '<div class="spinner" role="status"></div>';
const ARG_PLACEHOLDER = { types: 'iso.arg.types', reports: 'iso.arg.reports' };

/** "NGUỒN:a,b" → {src, arg} */
const splitVal = (v) => {
  const s = String(v || '');
  const i = s.indexOf(':');
  return i < 0 ? { src: s, arg: '' } : { src: s.slice(0, i), arg: s.slice(i + 1) };
};
const joinVal = (src, arg) => (arg ? `${src}:${arg}` : src);
const rowsOf = (map) => Object.entries(map || {}).map(([code, v]) => ({ code, ...splitVal(v) }));

function statText(s) {
  if (!s) return `<span class="muted">${bi('iso.stat_none')}</span>`;
  return `<span title="${esc(biText('iso.stat_count', { N: fmtNumber(s.count) }))}">${bi('iso.stat', { N: fmtNumber(s.days) })}</span>
    <div class="muted small">${bi('iso.stat_last')}: ${esc(fmtDate(s.last_date))}</div>`;
}

export async function renderIsoMap(view, { shell }) {
  shell.setScreen({ title: 'iso.title', back: '/account' });
  if (!navigator.onLine) {
    view.innerHTML = `<div class="card empty-state">${ICON.sync}<p class="muted">${bi('sync.need_network')}</p></div>`;
    return;
  }
  view.innerHTML = spinner;
  const r = await api('iso.feed.preview', {}, { retry: true });
  if (!r.ok) { view.innerHTML = `<div class="card">${esc(resMsg(r))}</div>`; return; }
  const st = { d: r.data, rows: rowsOf(r.data.map), draft: false };
  const srcOf = (k) => st.d.sources.find((s) => s.key === k) || { key: k, arg: '', enabled: false };

  const srcSelect = (row, i) => `<select class="inp sel" data-i="${i}" data-f="src" aria-label="${esc(biText('iso.col.src'))}">
    ${st.d.sources.map((s) => `<option value="${esc(s.key)}"${s.key === row.src ? ' selected' : ''}>${esc(biText('iso.src.' + s.key))}${s.enabled ? '' : ` (${esc(biText('iso.src_off'))})`}</option>`).join('')}</select>`;
  const argInput = (row, i) => {
    const a = srcOf(row.src).arg;
    if (!a) return '<span class="muted">—</span>';
    if (a === 'utility') {
      const v = row.arg.split(',').filter(Boolean);
      const cur = v.length === 1 ? v[0] : '';
      return `<select class="inp sel" data-i="${i}" data-f="arg" aria-label="${esc(biText('iso.col.arg'))}">
        <option value=""${cur ? '' : ' selected'}>${esc(biText('iso.util_all'))}</option>
        ${['ELECTRICITY', 'WATER'].map((u) => `<option value="${u}"${cur === u ? ' selected' : ''}>${esc(biText('utility_type.' + u))}</option>`).join('')}</select>`;
    }
    return `<input class="inp" data-i="${i}" data-f="arg" value="${esc(row.arg)}" maxlength="300" autocomplete="off" placeholder="${esc(biText(ARG_PLACEHOLDER[a]))}" aria-label="${esc(biText('iso.col.arg'))}">`;
  };

  const draw = () => {
    const d = st.d;
    const stats = new Map(d.stats.map((s) => [s.form_code, s]));
    const mapped = new Set(st.rows.map((x) => x.code.trim()));
    const fromChecklist = d.stats.filter((s) => s.from === 'CHECKLIST' && !mapped.has(s.form_code));
    view.innerHTML = `<section class="card"><h2>${bi('iso.title')}</h2>
        <p class="muted small">${bi('iso.help')}</p>
        <p id="iso-key" class="banner ${d.key_set ? 'ok' : 'warn'}">${bi(d.key_set ? 'iso.key_on' : 'iso.key_off')}</p></section>
      <section class="card"><h2>${bi('iso.map')}</h2>
        <p class="muted small">${bi('iso.map_help')}</p>
        <div class="table-wrap"><table class="tbl iso-map"><thead><tr><th>${bi('iso.col.code')}</th><th>${bi('iso.col.src')}</th><th>${bi('iso.col.arg')}</th><th>${bi('iso.col.stat')}</th><th></th></tr></thead>
        <tbody>${st.rows.map((row, i) => `<tr data-row="${i}">
          <td><input class="inp code" data-i="${i}" data-f="code" value="${esc(row.code)}" maxlength="40" autocomplete="off" aria-label="${esc(biText('iso.col.code'))}"></td>
          <td>${srcSelect(row, i)}</td><td>${argInput(row, i)}</td>
          <td class="iso-stat">${statText(stats.get(row.code.trim()))}</td>
          <td><button type="button" class="icon-btn" data-del="${i}" aria-label="${esc(biText('btn.remove'))}">${ICON.trash}</button></td></tr>`).join('')}</tbody></table></div>
        ${st.draft ? `<p class="muted small" id="iso-draft">${bi('iso.preview_note')}</p>` : ''}
        <p class="form-err err" role="alert" id="iso-err"></p>
        <div class="row">
          <button type="button" class="btn small" id="iso-add">${ICON.plus}<span>${bi('iso.add_row')}</span></button>
          <button type="button" class="btn small" id="iso-default">${ICON.refresh}<span>${bi('iso.reset_default')}</span></button>
          <button type="button" class="btn small" id="iso-preview">${ICON.eye}<span>${bi('iso.preview')}</span></button></div>
        <label class="lbl" for="iso-reason">${bi('field.reason')}</label><input class="inp" id="iso-reason" maxlength="300">
        <div class="row"><button type="button" class="btn primary" id="iso-save">${ICON.check}<span>${bi('btn.save')}</span></button></div>
        <p class="muted small">${bi('iso.window', { A: fmtDate(d.since), B: fmtDate(d.today) })}</p></section>
      <section class="card" id="iso-cl"><h2>${bi('iso.checklists')}</h2>
        <p class="muted small">${bi(d.checklist_codes ? 'iso.checklists_help' : 'iso.checklists_old')}</p>
        ${fromChecklist.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('iso.col.code')}</th><th>${bi('iso.col.stat')}</th></tr></thead>
          <tbody>${fromChecklist.map((s) => `<tr><td class="code">${esc(s.form_code)}</td><td>${statText(s)}</td></tr>`).join('')}</tbody></table></div>`
          : (d.checklist_codes ? `<p class="muted">${bi('iso.checklists_none')}</p>` : '')}
      </section>`;
    wire();
  };

  /** Đọc bảng trên màn → {map, err} */
  const collect = () => {
    const map = {};
    const seen = new Set();
    for (const row of st.rows) {
      const code = row.code.trim().replace(/\s+/g, ' ');
      if (!code && !row.arg) continue;
      if (!code || code.length > 40) return { err: biText('iso.err.code') };
      if (seen.has(code)) return { err: biText('iso.err.dup', { C: code }) };
      seen.add(code);
      const arg = srcOf(row.src).arg ? row.arg.split(',').map((x) => x.trim()).filter(Boolean).join(',') : '';
      map[code] = joinVal(row.src, arg);
    }
    return { map };
  };
  const showErr = (msg) => { const el = $('#iso-err', view); if (el) el.textContent = msg || ''; };

  const preview = async (btn) => {
    const { map, err } = collect();
    if (err) { showErr(err); return; }
    busy(btn, true);
    const res = await api('iso.feed.preview', { map }, { retry: true });
    busy(btn, false);
    if (!res.ok) { showErr(resMsg(res)); return; }
    st.d = { ...st.d, stats: res.data.stats, since: res.data.since, today: res.data.today };
    st.draft = true;
    draw();
  };

  function wire() {
    $$('[data-f]', view).forEach((el) => {
      const ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        const row = st.rows[Number(el.dataset.i)];
        if (!row) return;
        if (el.dataset.f === 'src') {
          if (srcOf(el.value).arg !== srcOf(row.src).arg) row.arg = '';
          row.src = el.value;
          draw();
          return;
        }
        row[el.dataset.f] = el.value;
        if (el.dataset.f === 'arg' && el.tagName === 'SELECT') draw();
      });
    });
    $$('[data-del]', view).forEach((b) => b.addEventListener('click', () => { st.rows.splice(Number(b.dataset.del), 1); draw(); }));
    $('#iso-add', view).addEventListener('click', () => {
      st.rows.push({ code: '', src: 'WO_ACCEPTED', arg: '' });
      draw();
      const inputs = $$('[data-f="code"]', view);
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    $('#iso-default', view).addEventListener('click', async () => {
      const yes = await dialog({ title: bi('iso.reset_default'), body: `<p>${bi('iso.reset_confirm')}</p>`,
        actions: [{ label: bi('btn.cancel'), value: false }, { label: bi('iso.reset_default'), kind: 'primary', value: true }] });
      if (!yes) return;
      st.rows = rowsOf(st.d.default_map);
      await preview($('#iso-preview', view));
    });
    $('#iso-preview', view).addEventListener('click', (e) => preview(e.currentTarget));
    $('#iso-save', view).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const { map, err } = collect();
      if (err) { showErr(err); return; }
      busy(btn, true);
      const res = await writeWithPin('settings.edit', { changes: { iso_form_map: map }, reason: $('#iso-reason', view).value.trim() });
      busy(btn, false);
      if (res.ok) { toast(bi('form.saved'), 'ok'); renderIsoMap(view, { shell }); return; }
      if (res.code === 'VALIDATION_ERROR') { showErr(resMsg(res)); return; }
      if (res.code !== 'REAUTH_REQUIRED') await handleWriteError(res);
    });
  }

  draw();
}

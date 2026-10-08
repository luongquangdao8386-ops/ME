// Thành phần biểu mẫu dùng chung: ô song ngữ, ngày (5.4.3), số (5.4.2), chọn, lỗi theo trường, ghi trực tuyến chịu mất phản hồi (3.15)
import { bi, biText, esc, api, uuid, fmtDate, fmtNumber, L, session, resMsg } from './core.js';
import { getMeta, setMeta } from './sync.js';
import { isWide } from './shell.js';
import { $, $$, toast, askPin } from './ui.js';
import { reauth } from './auth.js';

/* ---------------- Ô nhập ---------------- */

export function fieldWrap(id, labelKey, inner, { hint = '', required = false, cls = '' } = {}) {
  return `<div class="fld ${cls}" data-field="${esc(id)}">
    <label for="f-${esc(id)}">${bi(labelKey)}${required ? ' <span class="req">*</span>' : ''}</label>
    ${inner}
    ${hint ? `<div class="hint">${hint}</div>` : ''}
    <div class="ferr" role="alert"></div></div>`;
}

export function textInput(id, labelKey, value, { maxlength = 200, required = false, hint = '', inputmode = '', upper = false, placeholder = '' } = {}) {
  return fieldWrap(id, labelKey, `<input class="inp" id="f-${esc(id)}" name="${esc(id)}" type="text" value="${esc(value ?? '')}" maxlength="${maxlength}"
    ${inputmode ? `inputmode="${inputmode}"` : ''} ${upper ? 'autocapitalize="characters" data-upper="1"' : ''} ${placeholder ? `placeholder="${esc(placeholder)}"` : ''} autocomplete="off" spellcheck="false">`, { hint, required });
}

export function textArea(id, labelKey, value, { rows = 3, hint = '' } = {}) {
  return fieldWrap(id, labelKey, `<textarea class="inp" id="f-${esc(id)}" name="${esc(id)}" rows="${rows}">${esc(value ?? '')}</textarea>`, { hint });
}

/** options: [[value, htmlLabel]] */
export function selectInput(id, labelKey, options, value, { required = false, hint = '', empty = 'field.choose' } = {}) {
  const opts = (empty ? [['', bi(empty)]] : []).concat(options);
  return fieldWrap(id, labelKey, `<select class="inp sel" id="f-${esc(id)}" name="${esc(id)}">${opts.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value ?? '') ? ' selected' : ''}>${t}</option>`).join('')}</select>`, { hint, required });
}

/** Ô ngày: iPhone dùng type=date (giá trị ISO) và hiện dd/mm/yyyy bên cạnh; web dùng ô chữ dd/mm/yyyy kèm nút lịch (5.4.3) */
export function dateInput(id, labelKey, iso, { required = false, hint = '' } = {}) {
  if (!isWide()) {
    return fieldWrap(id, labelKey, `<div class="date-row"><input class="inp" id="f-${esc(id)}" name="${esc(id)}" type="date" value="${esc(iso || '')}" data-date="native"><span class="date-show">${esc(fmtDate(iso))}</span></div>`, { required, hint });
  }
  return fieldWrap(id, labelKey, `<div class="date-row"><input class="inp" id="f-${esc(id)}" name="${esc(id)}" type="text" inputmode="numeric" placeholder="dd/mm/yyyy" maxlength="10" value="${esc(fmtDate(iso))}" data-date="text">
    <input type="date" class="date-picker" tabindex="-1" aria-hidden="true" value="${esc(iso || '')}">
    <button type="button" class="icon-btn date-btn" aria-label="${esc(biText('tab.calendar'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg></button></div>`, { required, hint });
}

/** "6/10/2026" → "2026-10-06"; sai ngày/tháng → null (không đảo sang mm/dd) */
export function parseDmy(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Đọc ô số theo 5.4.2. Trả {value:number|null, error:key|null, ambiguous:bool}
 */
export function parseNumberInput(s, { negative = false, integer = false } = {}) {
  let t = String(s ?? '').trim().replace(/[   ]/g, '');
  if (!t) return { value: null, error: null };
  const seps = (t.match(/[.,]/g) || []).length;
  if (seps > 1) return { value: null, error: 'field.number_bad_sep' };
  const ambiguous = /^-?\d{1,3}[.,]\d{3}$/.test(t);
  t = t.replace(',', '.');
  if (!(negative ? /^-?\d+(\.\d+)?$/ : /^\d+(\.\d+)?$/).test(t)) return { value: null, error: 'VALUE' };
  const v = Number(t);
  if (integer && !Number.isInteger(v)) return { value: null, error: 'VALUE' };
  return { value: v, error: null, ambiguous };
}

export function numberInput(id, labelKey, value, { integer = false, hint = '', required = false } = {}) {
  return fieldWrap(id, labelKey, `<input class="inp num" id="f-${esc(id)}" name="${esc(id)}" type="text" inputmode="${integer ? 'numeric' : 'decimal'}" value="${esc(value === null || value === undefined || value === '' ? '' : fmtNumber(value))}" data-num="${integer ? 'int' : 'dec'}" autocomplete="off">
    <div class="amb" hidden></div>`, { hint, required });
}

/** Cặp ô Việt/Trung: chỉ bắt nhập một thứ tiếng (A3); hiện nhãn dịch máy/chưa có bản dịch của bản đang lưu */
export function bilingualInputs(base, rec, { required = true, labelKey = 'field.name', maxlength = 200, area = false, suggest = '' } = {}) {
  const meta = rec && rec.i18n_meta && rec.i18n_meta[base];
  const tag = (lang) => {
    if (!meta) return '';
    if (meta.state === 'MACHINE' && meta.src !== lang) return `<span class="tag mt">${bi('tag.machine_translated')}</span>`;
    if ((meta.state === 'PENDING' || meta.state === 'MANUAL_REQUIRED') && meta.src !== lang) return `<span class="tag none">${bi('tag.no_translation')}</span>`;
    return '';
  };
  const inp = (lang) => area
    ? `<textarea class="inp" id="f-${base}_${lang}" name="${base}_${lang}" rows="2" maxlength="${maxlength}">${esc((rec && rec[base + '_' + lang]) || '')}</textarea>`
    : `<input class="inp" id="f-${base}_${lang}" name="${base}_${lang}" type="text" maxlength="${maxlength}" value="${esc((rec && rec[base + '_' + lang]) || '')}" autocomplete="off">`;
  return `<fieldset class="bi-pair" data-field="${esc(base)}"><legend>${bi(labelKey)}${required ? ' <span class="req">*</span>' : ''}</legend>
    <div class="fld" data-field="${base}_vi"><label for="f-${base}_vi">${bi('i18n.lang_vi')} ${tag('vi')}</label>${inp('vi')}<div class="ferr"></div></div>
    <div class="fld" data-field="${base}_zh"><label for="f-${base}_zh">${bi('i18n.lang_zh')} ${tag('zh')}</label>${inp('zh')}<div class="ferr"></div></div>
    <div class="hint">${bi('field.one_lang')}</div>
    ${suggest ? `<div class="i18n-suggest" data-suggest="${esc(suggest)}" data-base="${esc(base)}"><button type="button" class="btn tiny" data-sg>${bi('i18n.suggest')}</button>
      <label class="check" hidden><input type="checkbox" data-sg-ok><span>${bi('i18n.checked')}</span></label></div>` : ''}
    <div class="ferr" role="alert"></div></fieldset>`;
}

/** Gắn hành vi cho ô ngày, ô số, chữ hoa */
export function wireForm(root) {
  $$('input[data-date="native"]', root).forEach((i) => i.addEventListener('change', () => { const s = i.parentElement.querySelector('.date-show'); if (s) s.textContent = fmtDate(i.value); }));
  $$('input[data-date="text"]', root).forEach((i) => {
    i.addEventListener('blur', () => { const iso = parseDmy(i.value); if (iso) i.value = fmtDate(iso); });
    const pick = i.parentElement.querySelector('.date-picker');
    const btn = i.parentElement.querySelector('.date-btn');
    if (btn && pick) {
      btn.addEventListener('click', () => { try { pick.value = parseDmy(i.value) || ''; pick.showPicker(); } catch (e) { pick.focus(); } });
      pick.addEventListener('change', () => { if (pick.value) i.value = fmtDate(pick.value); });
    }
  });
  $$('input[data-num]', root).forEach((i) => {
    const amb = i.parentElement.querySelector('.amb');
    i.addEventListener('blur', () => {
      const r = parseNumberInput(i.value, { integer: i.dataset.num === 'int' });
      i.dataset.confirmed = '';
      if (r.error || r.value === null) { if (amb) amb.hidden = true; return; }
      i.value = fmtNumber(r.value);
      if (r.ambiguous && amb) {
        amb.hidden = false;
        amb.innerHTML = `${bi('field.number_ambiguous', { A: fmtNumber(r.value) })} <button type="button" class="btn tiny">${bi('btn.confirm')}</button>`;
        amb.querySelector('button').addEventListener('click', () => { i.dataset.confirmed = '1'; amb.hidden = true; });
      } else if (amb) amb.hidden = true;
    });
  });
  $$('input[data-upper]', root).forEach((i) => i.addEventListener('input', () => { const p = i.selectionStart; i.value = i.value.toUpperCase(); try { i.setSelectionRange(p, p); } catch (e) { /* bỏ qua */ } }));
  // Gợi ý dịch (2.3): trường không dịch tự động; điền bản dịch máy vào ô còn trống, phải tick "Đã kiểm tra bản dịch" mới lưu
  $$('[data-suggest]', root).forEach((box) => {
    const base = box.dataset.base;
    $('[data-sg]', box).addEventListener('click', async (ev) => {
      const vi = $(`#f-${base}_vi`, root), zh = $(`#f-${base}_zh`, root);
      const from = vi.value.trim() && !zh.value.trim() ? 'vi' : (zh.value.trim() && !vi.value.trim() ? 'zh' : '');
      if (!from) { toast(bi('i18n.suggest_need_one'), 'err'); return; }
      if (!navigator.onLine) { toast(bi('sync.need_network'), 'err'); return; }
      busy(ev.currentTarget, true);
      const r = await api('i18n.suggest', { module: box.dataset.suggest, text: (from === 'vi' ? vi : zh).value.trim(), from }, { retry: true });
      busy(ev.currentTarget, false);
      if (!r.ok) { toast(esc(resMsg(r)), 'err'); return; }
      (from === 'vi' ? zh : vi).value = r.data.text;
      box.dataset.assisted = '1';
      const lab = $('label.check', box);
      lab.hidden = false;
      $('[data-sg-ok]', box).checked = false;
    });
  });
}

/** Trường đã dùng Gợi ý dịch: phải tick đã kiểm tra; trả {ok, errors, bases} để gửi i18n_assisted */
export function assistedFields(root) {
  const bases = [], errors = [];
  $$('[data-suggest]', root).forEach((box) => {
    if (box.dataset.assisted !== '1') return;
    if (!$('[data-sg-ok]', box).checked) errors.push({ field: box.dataset.base, key: 'i18n.check_required' });
    else bases.push(box.dataset.base);
  });
  return { ok: !errors.length, errors, bases };
}

/** Nút "Dịch lại" khi hồ sơ còn trường chờ dịch (PENDING) và người xem sửa được hồ sơ */
export function retranslateButton(entityType, id, rec, canEdit) {
  const meta = (rec && rec.i18n_meta) || {};
  if (!canEdit || !Object.keys(meta).some((f) => meta[f] && meta[f].state === 'PENDING')) return '';
  return `<button type="button" class="btn small" data-retr="${esc(entityType)}" data-retr-id="${esc(id)}"${navigator.onLine ? '' : ' disabled'}>${bi('i18n.retranslate')}</button>`;
}
export function wireRetranslate(root, onDone) {
  $$('[data-retr]', root).forEach((b) => b.addEventListener('click', async () => {
    busy(b, true);
    const r = await writeOnline('i18n.retranslate', { entity_type: b.dataset.retr, entity_id: b.dataset.retrId });
    busy(b, false);
    if (!r.ok) { toast(esc(resMsg(r)), 'err'); return; }
    toast(bi(r.data && r.data.pending && r.data.pending.length ? 'i18n.still_pending' : 'i18n.retranslated'), r.data && r.data.pending && r.data.pending.length ? 'err' : 'ok');
    if (onDone) await onDone();
  }));
}

/** Đọc giá trị: ngày → ISO ('' khi trống, null khi sai); số → number|null|NaN khi sai */
export function readField(root, id) {
  const el = $(`#f-${CSS.escape(id)}`, root);
  if (!el) return undefined;
  if (el.dataset.date === 'text') return parseDmy(el.value);
  if (el.dataset.date === 'native') return el.value || '';
  if (el.dataset.num) { const r = parseNumberInput(el.value, { integer: el.dataset.num === 'int' }); return r.error ? NaN : r.value; }
  if (el.type === 'checkbox') return el.checked;
  return el.value.trim();
}

/** Ô số mơ hồ ("12,350") phải bấm Đúng một lần trước khi lưu (5.4.2) */
export function unconfirmedAmbiguous(root) {
  return $$('input[data-num]', root).find((i) => { const r = parseNumberInput(i.value); return r.ambiguous && i.dataset.confirmed !== '1'; }) || null;
}

/** Hiện lỗi theo trường (errors[] của máy chủ hoặc lỗi trên máy) */
export function showErrors(root, errors) {
  $$('.ferr', root).forEach((e) => { e.textContent = ''; });
  $$('.fld.bad', root).forEach((e) => e.classList.remove('bad'));
  let first = null;
  const general = [];
  for (const e of errors || []) {
    const f = String(e.field || '').replace(/_vi$|_zh$/, (m) => m);
    const box = $(`[data-field="${CSS.escape(f)}"] > .ferr`, root) || $(`[data-field="${CSS.escape(f.replace(/_(vi|zh)$/, ''))}"] > .ferr`, root);
    const msg = e.message_vi ? `${e.message_vi} · ${e.message_zh || ''}` : (L[e.key] ? biText(e.key, e.vars) : e.code);
    if (box) { box.textContent = msg; box.parentElement.classList.add('bad'); if (!first) first = box.parentElement; } else general.push(msg);
  }
  const g = $('.form-err', root);
  if (g) g.textContent = general.join(' · ');
  if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/* ---------------- Ghi trực tuyến (action loại mạng) ---------------- */

const UNSURE = new Set(['UNKNOWN_RESULT', 'INTERNAL_ERROR', 'RECOVERY_REQUIRED']);

/**
 * Ghi có xác nhận: mất phản hồi → hỏi sync.getOperationStatus → gửi lại đúng operation_id (3.3, PoC P-01).
 * Trả phản hồi cuối (ok + COMMITTED, hoặc lỗi).
 */
export async function writeOnline(action, payload, { expected_version = 0, reauth = null } = {}) {
  const operation_id = uuid();
  const opts = { write: true, operation_id, expected_version };
  if (reauth) opts.reauth_token = reauth;
  let r = await api(action, payload, opts);
  for (const wait of [1500, 4000, 8000]) {
    if (r.ok || !(UNSURE.has(r.code) || r.code === 'SERVER_BUSY' || r.code === 'NETWORK_ERROR')) break;
    await new Promise((res) => setTimeout(res, wait));
    if (UNSURE.has(r.code) || r.code === 'NETWORK_ERROR') {
      const st = await api('sync.getOperationStatus', { operation_id }, { retry: true });
      if (st.ok && st.data.state === 'COMMITTED') {
        return { ok: true, code: 'DUPLICATE_OPERATION', state: 'COMMITTED', data: st.data.result, record_version: st.data.record_version, operation_id };
      }
      if (!st.ok && st.code === 'NETWORK_ERROR') { r = { ok: false, code: 'UNKNOWN_RESULT', operation_id }; continue; }
    }
    r = await api(action, payload, opts);
  }
  return r;
}

/**
 * Ghi action loại PIN (4.7): thiếu/hết hạn reauth_token → hỏi PIN (auth.reauth) rồi gửi lại.
 * reauth_token giữ trong bộ nhớ, dùng lại trong reauth_window_minutes.
 */
export async function writeWithPin(action, payload, opts = {}) {
  let r = await writeOnline(action, payload, opts);
  for (let i = 0; i < 3 && r.code === 'REAUTH_REQUIRED'; i++) {
    const pin = await askPin('auth.reauth');
    if (!pin) return r;
    const a = await reauth(pin);
    if (!a.ok) { toast(esc(a.message_vi ? `${a.message_vi} · ${a.message_zh}` : a.code), 'err'); if (a.code === 'PIN_LOCKED') return a; continue; }
    r = await writeOnline(action, payload, opts);
  }
  return r;
}

/** Chữ có chữ Hán → trường _zh, không thì _vi (nhập một thứ tiếng, A3) */
export function oneLang(base, text) {
  const t = String(text || '').trim();
  if (!t) return {};
  return /[\u3400-\u9fff]/.test(t) ? { [base + '_zh']: t } : { [base + '_vi']: t };
}

/* ---------------- Nháp biểu mẫu trên máy (C2: rời màn thì tự lưu, không hỏi) ---------------- */

export async function loadFormDraft(key) {
  const d = await getMeta('form:' + key);
  return d && d.user_id === (session.user && session.user.user_id) ? d.values : null;
}
export async function saveFormDraft(key, values) {
  await setMeta('form:' + key, { user_id: session.user && session.user.user_id, values, at: Date.now() });
}
export async function clearFormDraft(key) { await setMeta('form:' + key, null); }

export function busy(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  btn.classList.toggle('busy', on);
}

export { toast };

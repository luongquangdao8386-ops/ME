// Thay linh kiện · 更换配件 (part.replace, Đợt 2): ghi tháo/lắp/thay theo phiếu bảo trì/sửa chữa; không trừ tồn (1.4 §5.1, phụ lục 4.4.2)
import { bi, biText, esc, nameText, uuid, isoNowVN } from '../core.js';
import { toast, h, $ } from '../ui.js';
import { recs, mapOf } from '../data.js';
import { afterCommit } from '../app.js';
import { enqueue } from '../sync.js';
import { writeOnline, busy, evBtn, oneLang, parseNumberInput } from '../form.js';
import { handleWriteError } from './equipment.js';
import { qtyText } from '../work.js';

const WT = { WO: 'WORK_ORDER', REPAIR: 'REPAIR' };
const KEY = { WO: 'work_order_id', REPAIR: 'repair_id' };

/** Hộp thoại thay linh kiện cho một phiếu (offline được: vào hàng chờ sau thao tác của phiếu) */
export async function replaceDialog(kind, work, presetPartId = '') {
  const parts = (await recs('EQUIPMENT_PART')).filter((p) => p.equipment_id === work.equipment_id && !p.removed_at && !p.archived_at);
  const mats = await mapOf('MATERIAL');
  const comps = (await recs('MATERIAL')).filter((m) => m.active !== false && m.is_equipment_component)
    .sort((a, b) => String(a.material_code).localeCompare(String(b.material_code)));
  const partLabel = (p) => { const m = mats.get(p.material_id) || {}; return `${m.material_code || ''} · ${nameText(m)} — ${qtyText(p.installed_qty, p.unit)}${p.position_vi || p.position_zh ? ' · ' + (p.position_vi || p.position_zh) : ''}`; };
  const wrap = h(`<div class="modal" role="dialog" aria-modal="true"><div class="modal-card form-card">
    <h2>${bi('part.replace')}</h2>
    <p class="muted small">${bi('part.replace_help')}</p>
    <label for="pr-type">${bi('part.event_type')}</label>
    <select id="pr-type" class="inp sel">${['REPLACED', 'REMOVED', 'INSTALLED'].map((t) => `<option value="${t}">${bi('part_event.' + t)}</option>`).join('')}</select>
    <div id="pr-old"><label for="pr-part">${bi('part.current')}</label>
      <select id="pr-part" class="inp sel">${parts.map((p) => `<option value="${esc(p.equipment_part_id)}"${p.equipment_part_id === presetPartId ? ' selected' : ''}>${esc(partLabel(p))}</option>`).join('')}</select></div>
    <div id="pr-new"><label for="pr-mat">${bi('part.new_material')}</label>
      <select id="pr-mat" class="inp sel"><option value="">${bi('part.same_material')}</option>${comps.map((m) => `<option value="${esc(m.material_id)}">${esc(m.material_code)} · ${esc(nameText(m))}</option>`).join('')}</select></div>
    <label for="pr-qty">${bi('part.quantity')}</label><input id="pr-qty" class="inp num" inputmode="decimal" value="1">
    <div id="pr-pos" hidden><label for="pr-position">${bi('field.position')}</label><input id="pr-position" class="inp" type="text" maxlength="200"></div>
    <label for="pr-note">${bi('field.note')}</label><input id="pr-note" class="inp" type="text" maxlength="300">
    <p class="muted small">${bi('part.no_stock')}</p>
    <p class="form-err err"></p>
    <div class="modal-actions"><button type="button" class="btn" data-x="cancel">${bi('btn.cancel')}</button><button type="button" class="btn primary" data-x="save">${bi('btn.save')}</button></div></div></div>`);
  document.body.appendChild(wrap);
  const sync = () => {
    const t = $('#pr-type', wrap).value;
    $('#pr-old', wrap).hidden = t === 'INSTALLED';
    $('#pr-new', wrap).hidden = t === 'REMOVED';
    $('#pr-pos', wrap).hidden = t !== 'INSTALLED';
    const first = $('#pr-mat option', wrap);
    first.textContent = t === 'INSTALLED' ? biText('field.choose') : biText('part.same_material');
  };
  $('#pr-type', wrap).addEventListener('change', sync);
  sync();
  return new Promise((resolve) => {
    $('[data-x="cancel"]', wrap).addEventListener('click', () => { wrap.remove(); resolve(false); });
    $('[data-x="save"]', wrap).addEventListener('click', async (ev) => {
      const t = $('#pr-type', wrap).value;
      const q = parseNumberInput($('#pr-qty', wrap).value);
      const err = $('.form-err', wrap);
      if (q.error || !(q.value > 0)) { err.textContent = biText('mat.line_invalid'); return; }
      const p = { event_id: uuid(), work_type: WT[kind], work_id: work[KEY[kind]], event_type: t, quantity: q.value, occurred_at: isoNowVN() };
      if (t !== 'INSTALLED') {
        p.equipment_part_id = $('#pr-part', wrap).value;
        if (!p.equipment_part_id) { err.textContent = biText('part.no_parts'); return; }
      }
      const mat = $('#pr-mat', wrap).value;
      if (t === 'INSTALLED' && !mat) { err.textContent = biText('field.required'); return; }
      if (t !== 'REMOVED' && mat) { p.material_id = mat; p.new_equipment_part_id = uuid(); }
      Object.assign(p, oneLang('note', $('#pr-note', wrap).value), t === 'INSTALLED' ? oneLang('position', $('#pr-position', wrap).value) : {});
      if (!navigator.onLine || work._local) {
        await enqueue('part.replace', p, { entity_type: 'EQUIPMENT_PART_EVENT', entity_id: p.event_id, parent_id: work[KEY[kind]] });
        wrap.remove(); toast(bi('sync.local_saved'), 'ok'); resolve(true); return;
      }
      busy(evBtn(ev), true);
      const res = await writeOnline('part.replace', p);
      busy(evBtn(ev), false);
      if (res.ok) { wrap.remove(); await afterCommit(); toast(bi('form.saved'), 'ok'); resolve(true); return; }
      if (res.code === 'VALIDATION_ERROR') { err.textContent = (res.errors || []).map((e) => `${e.message_vi} · ${e.message_zh}`).join(' — '); return; }
      wrap.remove(); await handleWriteError(res); resolve(false);
    });
  });
}

/** Phiếu đang mở của một thiết bị mà tôi ghi thay linh kiện được (nút Thay linh kiện ở tab Linh kiện, EQ-03) */
export async function openWorksOf(equipmentId) {
  const wos = (await recs('WORK_ORDER')).filter((w) => w.equipment_id === equipmentId && ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ACCEPTANCE'].includes(w.status));
  const reps = (await recs('REPAIR')).filter((r) => r.equipment_id === equipmentId && ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ACCEPTANCE'].includes(r.status));
  return [...wos.map((w) => ({ kind: 'WO', rec: w, code: w.work_order_code })), ...reps.map((r) => ({ kind: 'REPAIR', rec: r, code: r.repair_code }))];
}

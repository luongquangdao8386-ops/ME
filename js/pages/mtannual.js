// Tab Kế hoạch năm → khung "Kế hoạch năm (bản chốt)" (d4.18, Bước 3): chốt lịch hiện tại thành bản nháp, gửi duyệt, Trưởng bộ phận /
// Quản trị khác người lập duyệt bằng PIN hoặc trả lại có lý do; lần điều chỉnh (02, 03…) phải có lý do; PDF có logo + khối ký (máy chủ
// dựng). Có bản đã duyệt → KPI "so với bản đã duyệt" tính trên máy từ bản chụp (tải một lần bằng annual_plan.view, giữ trên máy).
import { bi, biText, esc, fmtDate, fmtDateTime, fmtNumber, uuid, api, resMsg, b64ToBytes } from '../core.js';
import { toast, dialog, $, $$ } from '../ui.js';
import { recs, can, today } from '../data.js';
import { RELEASED_DOT } from '../shell.js';
import { getMeta, setMeta } from '../sync.js';
import { afterCommit } from '../app.js';
import { writeOnline, writeWithPin, oneLang, busy } from '../form.js';
import { uid } from '../work.js';
import { compareBaseline, pct } from '../mtyear-model.js';
import { shareFileNow, isTouchMobile } from '../media.js';
import { handleWriteError } from './equipment.js';

const OPEN = { DRAFT: 1, SUBMITTED: 1, RETURNED: 1 };
const pctText = (p) => (p === null ? '—' : `${p}%`);
const pad2 = (n) => String(n).padStart(2, '0');
let pdfFiles = {};

/** Tình trạng kế hoạch năm của một năm: bản đã duyệt (mới nhất), bản đang mở, quyền, đối chiếu với bản duyệt (nếu đã có bản chụp) */
export async function annualInfo(year, model) {
  if (RELEASED_DOT < 5 || !(await can('maintenance.view'))) return null;
  const all = (await recs('ANNUAL_PLAN')).filter((r) => Number(r.year) === year && !r.archived_at);
  const approved = all.find((r) => r.status === 'APPROVED') || null;
  const open = all.find((r) => OPEN[r.status]) || null;
  const perms = {
    save: await can('annual_plan.save'), submit: await can('annual_plan.submit'), approve: await can('annual_plan.approve'),
    cancel: await can('annual_plan.cancel'), pdf: await can('annual_plan.pdf')
  };
  let base = null, baseState = '';
  if (approved) {
    const snap = await getMeta('ap_snap:' + approved.annual_plan_id).catch(() => null);
    if (snap) base = compareBaseline(snap, model, today());
    else baseState = navigator.onLine ? 'loading' : 'offline';
  }
  return { year, all, approved, open, perms, base, baseState };
}

/**
 * Nội dung một dòng (d4.19) cho "việc từng tháng": bước checklist (mới nhất, kèm giới hạn đo), lưu ý an toàn, người làm, thời gian
 * dự kiến của kế hoạch; kiểm định: hồ sơ cần có; dịch vụ HĐ: nội dung dịch vụ. Trả hàm (dòng mô hình năm) → {steps, safety, assignee, minutes}.
 */
export async function rowDetailer() {
  const latest = new Map();
  for (const it of await recs('CHECKLIST_ITEM')) {
    if (it.archived_at) continue;
    const cur = latest.get(it.template_id);
    const rev = Number(it.revision);
    if (!cur || rev > cur.rev) latest.set(it.template_id, { rev, items: [it] });
    else if (rev === cur.rev) cur.items.push(it);
  }
  const two = (vi, zh) => [vi, zh].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ');
  const has = (v) => v !== '' && v !== null && v !== undefined;
  const range = (it) => {
    const u = it.unit ? ' ' + it.unit : '';
    if (has(it.min_value) && has(it.max_value)) return ` (${it.min_value}–${it.max_value}${u})`;
    if (has(it.min_value)) return ` (≥ ${it.min_value}${u})`;
    if (has(it.max_value)) return ` (≤ ${it.max_value}${u})`;
    return it.unit ? ` (${it.unit})` : '';
  };
  return (r) => {
    if (r.kind === 'PLAN' || r.kind === 'HOURS') {
      const p = r.plan;
      const cl = p.checklist_template_id ? latest.get(p.checklist_template_id) : null;
      const steps = cl ? cl.items.slice().sort((a, b) => Number(a.step_no) - Number(b.step_no)).map((it) => two(it.label_vi, it.label_zh) + range(it)) : [];
      const minutes = has(p.estimated_minutes) ? Number(p.estimated_minutes) : null;
      return { steps, safety: two(p.safety_note_vi, p.safety_note_zh), assignee: p.assignee_name || '', minutes };
    }
    if (r.kind === 'INSPECTION') {
      const docs = r.type ? two(r.type.required_docs_vi, r.type.required_docs_zh) : '';
      return { steps: docs ? [docs] : [], safety: '', assignee: '', minutes: null };
    }
    const sv = two(r.contractEquipment.service_vi, r.contractEquipment.service_zh);
    return { steps: sv ? [sv] : [], safety: '', assignee: '', minutes: null };
  };
}

/** Bản chụp gửi máy chủ: theo loại → dòng (máy × kế hoạch/kiểm định/dịch vụ) → ngày dự kiến + ngày ước tính + nội dung (d4.19) */
export function snapshotOf(m, cycleText, detail) {
  const refOf = (r) => (r.kind === 'PLAN' || r.kind === 'HOURS' ? r.plan.plan_id : (r.kind === 'INSPECTION' ? r.requirement.requirement_id : r.contractEquipment.contract_equipment_id));
  const head = (r) => {
    if (r.kind === 'PLAN' || r.kind === 'HOURS') return { vi: r.plan.title_vi || '', zh: r.plan.title_zh || '', code: r.plan.plan_code || '', cycle: cycleText(r.plan) };
    if (r.kind === 'INSPECTION') return { vi: (r.type && r.type.name_vi) || '', zh: (r.type && r.type.name_zh) || '', code: r.requirement.requirement_code || '', cycle: '' };
    const ce = r.contractEquipment, c = r.contract;
    return { vi: ce.service_vi || c.title_vi || '', zh: ce.service_zh || c.title_zh || '', code: c.contract_code || '', cycle: '' };
  };
  return {
    year: m.year,
    groups: m.groups.map((g) => ({
      key: g.key, name_vi: g.cat ? g.cat.name_vi || '' : '', name_zh: g.cat ? g.cat.name_zh || '' : '',
      rows: g.rows.map((r) => {
        const all = r.months.flat();
        const h = head(r);
        return {
          kind: r.kind, ref_id: refOf(r), equipment_id: r.eq.equipment_id, equipment_code: r.eq.equipment_code || '', equipment_vi: r.eq.name_vi || '',
          equipment_zh: r.eq.name_zh || '', title_vi: h.vi, title_zh: h.zh, code: h.code, cycle: h.cycle,
          dates: all.filter((e) => !e.est && !e.extra).map((e) => e.date), est: all.filter((e) => e.est).map((e) => e.date),
          ...(detail ? detail(r) : {})
        };
      })
    }))
  };
}

const who = (name, at) => `${esc(name || '')}${at ? ' · ' + esc(fmtDateTime(at)) : ''}`;
const stTag = (s) => `<span class="ap-st ap-${s.toLowerCase()}">${bi('ap.status.' + s)}</span>`;

/** Khung trạng thái + nút theo vai trò */
export function annualBoxHtml(info) {
  if (!info) return '';
  const { year, approved, open, perms } = info;
  const online = navigator.onLine;
  const dis = online ? '' : ' disabled';
  const me = uid();
  const pdfBtn = (r) => (perms.pdf ? `<button type="button" class="btn tiny" data-ap-pdf="${esc(r.annual_plan_id)}"${dis}><span>${bi('ap.pdf')}</span></button>
    <button type="button" class="btn tiny primary" data-ap-open="${esc(r.annual_plan_id)}" hidden><span>${bi('btn.open_save')}</span></button>` : '');
  const parts = [];
  if (approved) {
    parts.push(`<div class="ap-line">${stTag('APPROVED')}<strong class="code">${esc(approved.annual_plan_code)}</strong>
      <span class="muted small">${bi('ap.approved_by')}: ${who(approved.approved_by_name, '')} · ${esc(fmtDate(approved.approved_at))}</span>${pdfBtn(approved)}</div>`);
  } else if (!open) {
    parts.push(`<p class="muted small ap-none">${bi('ap.none')}</p>`);
  }
  if (open) {
    const self = [open.created_by, open.prepared_by, open.submitted_by].includes(me);
    const reason = open.change_reason_vi || open.change_reason_zh;
    parts.push(`<div class="ap-line">${stTag(open.status)}<span>${bi('ap.rev_n', { R: pad2(open.revision) })}</span>
      <span class="muted small">${bi('ap.prepared')}: ${who(open.prepared_by_name, open.prepared_at)}</span>
      ${open.status === 'SUBMITTED' ? `<span class="muted small">${bi('ap.submitted')}: ${who(open.submitted_by_name, open.submitted_at)}</span>` : ''}
      <span class="muted small">${bi('ap.count', { N: fmtNumber(open.planned_count), R: fmtNumber(open.row_count) })}</span>${pdfBtn(open)}</div>
      ${reason ? `<p class="small">${bi('ap.change_reason')}: ${esc([open.change_reason_vi, open.change_reason_zh].filter(Boolean).join(' · '))}</p>` : ''}
      ${open.status === 'RETURNED' ? `<p class="banner warn small">${bi('ap.returned')}: ${esc(open.return_reason || '')}</p>` : ''}
      ${open.status === 'SUBMITTED' && (!perms.approve || self) ? `<p class="muted small">${bi(self && perms.approve ? 'ap.self_wait' : 'ap.wait')}</p>` : ''}`);
    const btns = [];
    if (open.status !== 'SUBMITTED' && perms.save) btns.push(`<button type="button" class="btn small" id="ap-resave"${dis}><span>${bi('ap.resave')}</span></button>`);
    if (open.status !== 'SUBMITTED' && perms.submit) btns.push(`<button type="button" class="btn small primary" id="ap-submit"${dis}><span>${bi('ap.submit')}</span></button>`);
    if (open.status === 'SUBMITTED' && perms.approve && !self) {
      btns.push(`<button type="button" class="btn small primary" id="ap-approve"${dis}><span>${bi('ap.approve')}</span></button>`);
      btns.push(`<button type="button" class="btn small" id="ap-return"${dis}><span>${bi('ap.return')}</span></button>`);
    }
    if (perms.cancel) btns.push(`<button type="button" class="btn small danger" id="ap-cancel"${dis}><span>${bi('ap.cancel')}</span></button>`);
    if (btns.length) parts.push(`<div class="row ap-actions">${btns.join('')}</div>`);
  } else if (perms.save) {
    const next = info.all.filter((r) => r.status === 'APPROVED' || r.status === 'SUPERSEDED').length + 1;
    parts.push(`<div class="row ap-actions"><button type="button" class="btn small primary" id="ap-new"${dis}><span>${bi(approved ? 'ap.new_rev' : 'ap.new', { Y: year, R: pad2(next) })}</span></button></div>`);
  }
  if (!online && (perms.save || perms.approve)) parts.push(`<p class="muted small">${bi('sync.need_network')}</p>`);
  return `<div class="ap-box" id="ap-box"><div class="ap-title"><h3>${bi('ap.box_title', { Y: year })}</h3></div>${parts.join('')}
    <details class="ap-help small"><summary>${bi('ap.help_title')}</summary><p class="muted">${bi('ap.help')}</p></details></div>`;
}

/** KPI theo bản đã duyệt (hoặc dòng tải/thiếu mạng) */
export function baseKpiHtml(info) {
  if (!info || !info.approved) return '';
  if (!info.base) return `<p class="muted small ap-base-note">${bi(info.baseState === 'offline' ? 'ap.base_offline' : 'ap.base_loading')}</p>`;
  const t = info.base.tally;
  return `<div class="ap-kpi-head"><strong>${bi('ap.base_title', { C: info.approved.annual_plan_code })}</strong></div>
    <div class="yr-kpis ap-kpis">
    <span class="yr-kpi"><small>${bi('ap.kpi.base')}</small><strong>${fmtNumber(t.planned)}</strong></span>
    <span class="yr-kpi"><small>${bi('yr.kpi.due')}</small><strong>${fmtNumber(t.due)}</strong></span>
    <span class="yr-kpi"><small>${bi('yr.kpi.done')}</small><strong>${pctText(pct(t.done, t.due))}</strong></span>
    <span class="yr-kpi"><small>${bi('yr.kpi.on_time')}</small><strong>${pctText(pct(t.onTime, t.due))}</strong></span>
    <span class="yr-kpi${t.missed ? ' bad' : ''}"><small>${bi('yr.kpi.missed')}</small><strong>${fmtNumber(t.missed)}</strong></span>
    <span class="yr-kpi"><small>${bi('ap.kpi.extra')}</small><strong>${fmtNumber(info.base.extra)}</strong></span>
    ${info.base.added ? `<span class="yr-kpi"><small>${bi('ap.kpi.added')}</small><strong>${fmtNumber(info.base.added)}</strong></span>` : ''}
  </div><div class="ap-kpi-head"><strong>${bi('ap.live_title')}</strong></div>`;
}

/** Hộp nhập lý do (bắt buộc) → chuỗi, hoặc null khi hủy */
async function askReason(titleKey, labelKey, okKey, danger = false) {
  const v = await dialog({
    title: bi(titleKey),
    body: `<label for="ap-r">${bi(labelKey)} <span class="req">*</span></label><textarea id="ap-r" rows="3" maxlength="500"></textarea>`,
    actions: [{ label: bi('btn.cancel'), value: null }, { label: bi(okKey), kind: danger ? 'primary danger' : 'primary', read: (w) => $('#ap-r', w).value.trim() }]
  });
  if (v === null) return null;
  if (!v) { toast(bi('field.reason_required'), 'err'); return null; }
  return v;
}

/** Gắn sự kiện khung kế hoạch năm. getModel: () => Promise<mô hình năm hiện tại>; cycleText cho bản chụp */
export function wireAnnual(view, info, again, getModel, cycleText) {
  if (!info) return;
  const { year, open, approved } = info;
  // Lần đầu có bản duyệt: tải bản chụp, giữ trên máy (bản đã duyệt không đổi)
  if (approved && info.baseState === 'loading') {
    api('annual_plan.view', { annual_plan_id: approved.annual_plan_id }, { retry: true }).then(async (r) => {
      if (!r.ok) return;
      await setMeta('ap_snap:' + approved.annual_plan_id, r.data.snapshot);
      again();
    });
  }
  const on = (id, fn) => { const el = $('#' + id, view); if (el) el.addEventListener('click', fn); };
  const done = async (res, key, vars) => {
    if (!res.ok) { await handleWriteError(res); return false; }
    await afterCommit();
    toast(bi(key, vars), 'ok');
    again();
    return true;
  };
  const save = async (btn, id, ver) => {
    const m = await getModel();
    if (!m.groups.length) { toast(bi('ap.empty'), 'err'); return; }
    busy(btn, true);
    const res = await writeOnline('annual_plan.save', { annual_plan_id: id, year, snapshot: snapshotOf(m, cycleText, await rowDetailer()) }, { expected_version: ver });
    busy(btn, false);
    await done(res, 'ap.saved');
  };
  on('ap-new', (ev) => save(ev.currentTarget, uuid(), 0));
  on('ap-resave', (ev) => save(ev.currentTarget, open.annual_plan_id, open.record_version));
  on('ap-submit', async (ev) => {
    const btn = ev.currentTarget;
    const p = { annual_plan_id: open.annual_plan_id };
    if (Number(open.revision) > 1 && !open.change_reason_vi && !open.change_reason_zh) {
      const r = await askReason('ap.submit', 'ap.reason_change', 'ap.submit');
      if (r === null) return;
      Object.assign(p, oneLang('change_reason', r));
    }
    busy(btn, true);
    const res = await writeOnline('annual_plan.submit', p, { expected_version: open.record_version });
    busy(btn, false);
    await done(res, 'ap.submitted_ok');
  });
  on('ap-approve', async (ev) => {
    const btn = ev.currentTarget;
    busy(btn, true);
    const res = await writeWithPin('annual_plan.approve', { annual_plan_id: open.annual_plan_id, decision: 'APPROVE' }, { expected_version: open.record_version });
    busy(btn, false);
    if (res.code === 'REAUTH_REQUIRED') return;
    await done(res, 'ap.approved_ok', { C: (res.data && res.data.display_code) || '' });
  });
  on('ap-return', async () => {
    const reason = await askReason('ap.return', 'ap.return_reason', 'ap.return', true);
    if (reason === null) return;
    const res = await writeWithPin('annual_plan.approve', { annual_plan_id: open.annual_plan_id, decision: 'RETURN', reason }, { expected_version: open.record_version });
    if (res.code === 'REAUTH_REQUIRED') return;
    await done(res, 'ap.returned_ok');
  });
  on('ap-cancel', async () => {
    const reason = await askReason('ap.cancel', 'ap.cancel_reason', 'ap.cancel', true);
    if (reason === null) return;
    const res = await writeOnline('annual_plan.cancel', { annual_plan_id: open.annual_plan_id, reason }, { expected_version: open.record_version });
    await done(res, 'ap.cancelled_ok');
  });
  // PDF: chọn in cả năm / chỉ tổng quan / một tháng; máy tính tải thẳng; iPhone bước 2 "Mở / Lưu" trong lần chạm
  $$('[data-ap-pdf]', view).forEach((b) => b.addEventListener('click', async () => {
    const cur = today();
    const m0 = Number(cur.slice(0, 4)) === year ? Number(cur.slice(5, 7)) : 1;
    const pick = await dialog({
      title: bi('ap.pdf_choose'),
      body: `<div class="ap-pick">
        <label class="check"><input type="radio" name="ap-part" value="ALL" checked><span>${bi('ap.pdf_all')}</span></label>
        <label class="check"><input type="radio" name="ap-part" value="OVERVIEW"><span>${bi('ap.pdf_overview')}</span></label>
        <label class="check"><input type="radio" name="ap-part" value="MONTH"><span>${bi('ap.pdf_month')}</span></label>
        <select class="inp sel" id="ap-month" aria-label="${esc(biText('ap.pdf_month'))}">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}"${i + 1 === m0 ? ' selected' : ''}>T${i + 1} · ${i + 1}月</option>`).join('')}</select></div>`,
      actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('ap.pdf_make'), kind: 'primary', read: (w) => ({ part: $('input[name="ap-part"]:checked', w).value, month: Number($('#ap-month', w).value) }) }]
    });
    if (!pick) return;
    busy(b, true);
    const r = await api('annual_plan.pdf', { annual_plan_id: b.dataset.apPdf, part: pick.part, month: pick.part === 'MONTH' ? pick.month : undefined }, { retry: true, timeoutMs: 90000 });
    busy(b, false);
    if (!r.ok) { toast(esc(resMsg(r)), 'err'); return; }
    const file = new File([b64ToBytes(r.data.content_b64)], r.data.file_name, { type: 'application/pdf' });
    const openBtn = $(`[data-ap-open="${CSS.escape(b.dataset.apPdf)}"]`, view);
    if (openBtn && isTouchMobile()) { pdfFiles[b.dataset.apPdf] = file; openBtn.hidden = false; openBtn.focus(); return; }
    shareFileNow(file);
  }));
  $$('[data-ap-open]', view).forEach((b) => b.addEventListener('click', () => { if (pdfFiles[b.dataset.apOpen]) shareFileNow(pdfFiles[b.dataset.apOpen]); }));
}

/** Việc "Chờ bạn xử lý" của kế hoạch năm: chờ duyệt (không phải mình lập/gửi), bị trả lại (mình lập), nhắc lập năm sau từ 01/12 */
export async function annualPending() {
  if (RELEASED_DOT < 5) return [];
  const me = uid();
  const [ca, cs] = [await can('annual_plan.approve'), await can('annual_plan.save')];
  if (!ca && !cs) return [];
  const list = (await recs('ANNUAL_PLAN')).filter((r) => !r.archived_at);
  const out = [];
  const href = (y) => `/maintenance?tab=year&year=${y}`;
  for (const r of list) {
    const code = `KHN ${r.year} · ${biText('ap.rev_n', { R: pad2(r.revision) })}`;
    if (ca && r.status === 'SUBMITTED' && ![r.created_by, r.prepared_by, r.submitted_by].includes(me)) out.push({ kind: 'ANNUAL', code, sub: r.submitted_by_name || '', href: href(r.year), at: r.submitted_at || '' });
    if (cs && r.status === 'RETURNED' && r.prepared_by === me) out.push({ kind: 'ANNUAL_RET', code, sub: r.return_reason || '', href: href(r.year), at: r.returned_at || '' });
  }
  const t = today();
  const next = Number(t.slice(0, 4)) + 1;
  if (cs && t.slice(5) >= '12-01' && !list.some((r) => Number(r.year) === next && r.status !== 'CANCELLED' && r.status !== 'SUPERSEDED')) {
    out.push({ kind: 'ANNUAL_TODO', code: `KHN ${next}`, sub: '', href: href(next), at: '' });
  }
  return out;
}

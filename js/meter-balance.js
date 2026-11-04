// d4.26: báo thất thoát điện nước vượt ngưỡng (tháng vừa kết thúc) trong "Chờ bạn xử lý" của Trưởng bộ phận và Quản trị.
// Số tính trên máy chủ (utility.view {balance_alerts}: cần chỉ số cả tháng, máy chỉ giữ 45 ngày). Giữ bản trên máy (meta) để mở app
// không phải chờ mạng; hỏi lại nền khi cũ hơn 30 phút. Sang tháng mới thì mục của tháng trước tự hết (không cần bấm "Đã kiểm tra").
import { api, bi, biText, esc, fmtNumber, nameText, resMsg, session } from './core.js';
import { ICON, toast, dialog, $, $$ } from './ui.js';
import { recs, can, today } from './data.js';
import { RELEASED_DOT } from './shell.js';
import { getMeta, setMeta } from './sync.js';
import { writeWithPin } from './form.js';

const META = 'ut:balance_alerts';
const FRESH_MS = 30 * 60 * 1000;
let inflight = null;

/** Tháng vừa kết thúc theo ngày trên máy: 'yyyy-mm' */
function prevMonth() {
  const t = today();
  const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Hỏi máy chủ (nền, trễ vài giây để lượt đăng nhập/mở app vẫn chỉ một lượt gọi); có thay đổi → phát sự kiện để vẽ lại
 *  ô Chờ bạn xử lý / số trên nút Công việc */
const DELAY_MS = 4000;
let timer = null;
function refreshAlerts(prev) {
  if (inflight || timer || !navigator.onLine) return;
  timer = setTimeout(() => { timer = null; fetchAlerts(prev); }, DELAY_MS);
}
function fetchAlerts(prev) {
  if (inflight || !navigator.onLine) return inflight;
  inflight = (async () => {
    try {
      const r = await api('utility.view', { balance_alerts: true }, { retry: true });
      if (!r.ok || !r.data || !Array.isArray(r.data.items)) return;
      const rec = { month: r.data.month, items: r.data.items, at: Date.now() };
      await setMeta(META, rec);
      const sig = (x) => (x ? x.month + JSON.stringify(x.items.map((i) => [i.meter_id, i.status, i.pct, i.tol])) : '');
      if (sig(rec) !== sig(prev)) window.dispatchEvent(new Event('me:pending-changed'));
    } catch (e) { /* phần phụ: lỗi mạng không làm hỏng trang */ } finally { inflight = null; }
  })();
  return inflight;
}

/** Mục "Chờ bạn xử lý": [{kind: 'BALANCE_OVER' | 'BALANCE_UNDER', code, sub, href, at}] */
export async function balancePending() {
  if (RELEASED_DOT < 3) return [];
  if (!(await can('meter.tolerance.set'))) return []; // Trưởng bộ phận, Quản trị
  const rec = await getMeta(META);
  if (!rec || !rec.at || Date.now() - rec.at > FRESH_MS || rec.month !== prevMonth()) refreshAlerts(rec);
  if (!rec || rec.month !== prevMonth()) return [];
  const [y, m] = rec.month.split('-');
  return rec.items.map((x) => ({
    kind: x.status === 'UNDER' ? 'BALANCE_UNDER' : 'BALANCE_OVER',
    code: x.meter_code,
    sub: biText('bal.pending_sub', { M: `${Number(m)}/${y}`, P: `${fmtNumber(x.pct, 2)}\u00A0%`, T: `${fmtNumber(x.tol, 1)}\u00A0%` }),
    href: `/reports/run/RPT_UTILITIES?period_type=MONTH&date=${rec.month}-01&meter_id=${x.meter_id}`,
    at: `${rec.month}-28`
  }));
}

/* ---------- Ngưỡng thất thoát (chung theo loại: Quản trị; riêng từng đồng hồ tổng: Trưởng bộ phận, Quản trị) ---------- */

const LOSS_DEFAULT = { ELECTRICITY: 3, WATER: 5 };

/** Ngưỡng đang dùng (Settings gửi xuống app; máy chủ cũ chưa có khóa → mặc định điện 3 %, nước 5 %) */
export function tolCfg() {
  const v = (session.settings || {}).meter_loss_tolerance;
  const o = v && typeof v === 'object' ? v : {};
  const n = (x, d) => (x === null || x === undefined || x === '' || !isFinite(Number(x)) ? d : Number(x));
  return { ELECTRICITY: n(o.ELECTRICITY, LOSS_DEFAULT.ELECTRICITY), WATER: n(o.WATER, LOSS_DEFAULT.WATER), meters: o.meters && typeof o.meters === 'object' ? o.meters : {} };
}

/** Ngưỡng của một đồng hồ tổng: {pct, custom} */
export function tolOf(m, cfg = tolCfg()) {
  const own = cfg.meters[m.meter_id];
  return own !== undefined && own !== null ? { pct: Number(own), custom: true } : { pct: cfg[m.utility_type], custom: false };
}

async function applyTol(v) {
  session.settings = { ...(session.settings || {}), meter_loss_tolerance: v };
  const b = await getMeta('bootstrap');
  if (b) { b.settings = { ...(b.settings || {}), meter_loss_tolerance: v }; await setMeta('bootstrap', b); }
  await setMeta(META, null); // ngưỡng đổi → mục "Chờ bạn xử lý" hỏi lại máy chủ
}

/** Hỏi ngưỡng (%) rồi lưu có PIN. target = {meter_id} | {utility_type}. Trả true khi đã lưu. */
export async function editTolerance(target, current, { allowClear = false } = {}) {
  const v = await dialog({
    title: bi('bal.tol_edit'),
    body: `<label for="tol-v">${bi(target.meter_id ? 'bal.tol_meter' : 'bal.tol_type')}</label>
      <input id="tol-v" class="inp" type="text" inputmode="decimal" maxlength="5" value="${esc(current ?? '')}" autocomplete="off">
      ${allowClear ? `<p class="muted small">${bi('bal.tol_meter_hint')}</p>` : ''}`,
    actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('btn.save'), kind: 'primary', read: (w) => $('#tol-v', w).value.trim().replace(',', '.') }]
  });
  if (v === null || v === undefined) return false;
  if (v === '' && !allowClear) { toast(bi('field.invalid'), 'err'); return false; }
  const n = v === '' ? null : Number(v);
  if (n !== null && (!isFinite(n) || n < 0 || n > 50)) { toast(bi('field.invalid'), 'err'); return false; }
  const r = await writeWithPin('meter.tolerance.set', { ...target, pct: n });
  if (r.ok) { await applyTol(r.data.meter_loss_tolerance); toast(bi('form.saved'), 'ok'); return true; }
  if (r.code !== 'REAUTH_REQUIRED') toast(esc(r.code === 'FEATURE_NOT_ENABLED' ? biText('bal.tol_server_old') : resMsg(r)), 'err');
  return false;
}

/** Nhánh trực tiếp của mỗi đồng hồ (trên máy) */
export function kidsOf(meters) {
  const k = new Map();
  meters.filter((m) => !m.archived_at && m.parent_meter_id).forEach((m) => { if (!k.has(m.parent_meter_id)) k.set(m.parent_meter_id, []); k.get(m.parent_meter_id).push(m); });
  return k;
}

/** Dòng trên trang đồng hồ tổng: "Cân bằng với N đồng hồ nhánh: ngưỡng 3 %" + Sửa ngưỡng + báo cáo cân bằng tháng trước */
export async function meterTolHtml(m, kids) {
  if (!kids || !kids.length || RELEASED_DOT < 3) return '';
  const t = tolOf(m);
  const canSet = await can('meter.tolerance.set');
  return `<div class="bal-line"><span>${bi('bal.tol_line', { N: kids.length, T: fmtNumber(t.pct, 1) })}${t.custom ? ` <span class="muted small">(${bi('bal.custom')})</span>` : ''}</span>
    <span class="row">${canSet ? `<button type="button" class="btn small" id="bal-tol" ${navigator.onLine ? '' : 'disabled'}>${ICON.edit}<span>${bi('bal.tol_edit')}</span></button>` : ''}
    <a class="btn small" href="#/reports/run/RPT_UTILITIES?period_type=MONTH&date=${prevMonth()}-01&meter_id=${esc(m.meter_id)}"><span>${bi('bal.title')}</span></a></span></div>`;
}

export function wireMeterTol(view, m, again) {
  const b = $('#bal-tol', view);
  if (!b) return;
  b.addEventListener('click', async () => {
    const t = tolOf(m);
    if (await editTolerance({ meter_id: m.meter_id }, t.custom ? t.pct : '', { allowClear: true })) again();
  });
}

/** Trang Ngưỡng thất thoát điện nước: ngưỡng chung (Quản trị sửa) + danh sách đồng hồ tổng có nhánh (ngưỡng riêng) */
export async function renderLossTolerance(view, { shell }) {
  shell.setScreen({ title: 'bal.tol_page', back: '/account' });
  const cfg = tolCfg();
  const canSet = await can('meter.tolerance.set');
  const isAdmin = Number((session.user || {}).role_level) >= 4;
  const meters = (await recs('METER')).filter((m) => !m.archived_at);
  const kids = kidsOf(meters);
  const byId = new Map(meters.map((m) => [m.meter_id, m]));
  const level = (m) => { let n = 0, x = m; const seen = new Set(); while (x && x.parent_meter_id && byId.has(x.parent_meter_id) && !seen.has(x.meter_id) && n < 10) { seen.add(x.meter_id); x = byId.get(x.parent_meter_id); n++; } return n; };
  const parents = meters.filter((m) => kids.has(m.meter_id))
    .sort((a, b) => String(a.utility_type).localeCompare(String(b.utility_type)) || String(a.meter_code).localeCompare(String(b.meter_code)));
  const off = navigator.onLine ? '' : 'disabled';
  view.innerHTML = `<section class="card"><h2>${bi('bal.tol_page')}</h2><p class="muted small">${bi('bal.tol_intro')}</p>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>${bi('col.type')}</th><th class="num">${bi('bal.tol_type')}</th><th></th></tr></thead><tbody>
      ${['ELECTRICITY', 'WATER'].map((t) => `<tr><td>${bi('utility_type.' + t)}</td><td class="num"><strong>${fmtNumber(cfg[t], 1)}\u00A0%</strong></td>
        <td>${canSet && isAdmin ? `<button type="button" class="btn small" data-tol-type="${t}" ${off}>${ICON.edit}<span>${bi('btn.edit')}</span></button>` : `<span class="muted small">${bi('bal.tol_type_hint')}</span>`}</td></tr>`).join('')}
      </tbody></table></div></section>
    <section class="card"><h2>${bi('bal.tol_meters')}</h2>
      ${parents.length ? `<div class="table-wrap"><table class="tbl bal-tol-tbl"><thead><tr><th>${bi('bal.col.main')}</th><th>${bi('col.type')}</th><th class="num">${bi('bal.col.tol')}</th><th></th></tr></thead><tbody>
      ${parents.map((m) => { const t = tolOf(m, cfg); return `<tr><td style="padding-left:${10 + level(m) * 14}px">${level(m) ? '↳ ' : ''}<a href="#/utilities/meters/${esc(m.meter_id)}"><span class="code">${esc(m.meter_code)}</span></a> ${esc(nameText(m))}
          <div class="muted small">${bi('bal.n_children', { N: kids.get(m.meter_id).length })}</div></td><td>${bi('utility_type.' + m.utility_type)}</td>
          <td class="num"><strong>${fmtNumber(t.pct, 1)}\u00A0%</strong><div class="muted small">${t.custom ? bi('bal.custom') : bi('bal.tol_default', { T: fmtNumber(cfg[m.utility_type], 1) })}</div></td>
          <td>${canSet ? `<button type="button" class="btn small" data-tol-meter="${esc(m.meter_id)}" ${off}>${ICON.edit}<span>${bi('btn.edit')}</span></button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>` : `<p class="muted">${bi('bal.tol_none')}</p>`}</section>`;
  const again = () => renderLossTolerance(view, { shell });
  $$('[data-tol-type]', view).forEach((b) => b.addEventListener('click', async () => {
    if (await editTolerance({ utility_type: b.dataset.tolType }, cfg[b.dataset.tolType])) again();
  }));
  $$('[data-tol-meter]', view).forEach((b) => b.addEventListener('click', async () => {
    const m = byId.get(b.dataset.tolMeter);
    const t = tolOf(m, cfg);
    if (await editTolerance({ meter_id: m.meter_id }, t.custom ? t.pct : '', { allowClear: true })) again();
  }));
}

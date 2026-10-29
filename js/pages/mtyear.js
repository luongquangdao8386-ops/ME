// Bảo trì → tab Kế hoạch năm (d4.16, Bước 1): bảng 12 tháng theo Loại thiết bị. Web: bảng, cột tên dính khi cuộn ngang, dòng loại bấm
// mở/thu; iPhone: mỗi loại một thẻ có dải 12 tháng, bấm mở từng máy. Ký hiệu luôn kèm chú giải và chữ khi rê/chạm (không chỉ dựa màu).
// Dự kiến/thực hiện tính trên máy (js/mtyear-model.js) — xem được khi mất mạng. Xuất Excel có logo công ty (nếu đã tải lên).
import { bi, biText, esc, fmtDate, fmtDateTime, fmtNumber, biName, nameText, isoNowVN, L } from '../core.js';
import { ICON, toast, $, $$ } from '../ui.js';
import { isWide } from '../shell.js';
import { recs, today, can } from '../data.js';
import { navigate } from '../router.js';
import { myQueue, overlayWorkOrder, localCreations } from '../work.js';
import { yearModel, pct } from '../mtyear-model.js';
import { loadXlsx, aoaSheet, workbookFile } from '../xlsx.js';
import { reportLogo, logoBytes, logoSize } from '../report-logo.js';
import { shareFileNow, isTouchMobile } from '../media.js';

let year = null;
let expanded = null;      // Set các loại đang mở; null = mặc định theo cỡ màn
let lastFile = null;      // tệp Excel vừa dựng (iPhone bấm tiếp "Mở / Lưu" trong lần chạm)

const SYM = { planned: '○', done: '●', late: '●', open: '◐', overdue: '✕', missed: '✕', cancelled: '⊘' };
const ST_ORDER = ['done', 'late', 'open', 'overdue', 'missed', 'cancelled', 'planned'];
const stKey = (st) => 'yr.st.' + st;

/** Dữ liệu trên máy → mô hình năm (phiếu gồm cả thay đổi chưa gửi của chính mình) */
async function loadModel(y) {
  const ops = await myQueue();
  const workOrders = [...(await recs('WORK_ORDER')).map((w) => overlayWorkOrder(w, [], ops).wo), ...localCreations(ops).wos];
  const [equipment, lookups, plans, readings, requirements, inspections, inspectionTypes, services, contractEquipment, contracts] = await Promise.all([
    recs('EQUIPMENT'), recs('LOOKUP'), recs('MAINTENANCE_PLAN'), recs('OPERATING_READING'), recs('INSPECTION_REQUIREMENT'), recs('INSPECTION'),
    recs('INSPECTION_TYPE'), recs('CONTRACT_SERVICE'), recs('CONTRACT_EQUIPMENT'), recs('CONTRACT')
  ]);
  return yearModel({ year: y, today: today(), equipment, lookups, plans, workOrders, readings, requirements, inspections, inspectionTypes, services, contractEquipment, contracts });
}

const catLabel = (g) => (g.cat ? biName(g.cat) : bi('yr.uncategorized'));
const catText = (g) => (g.cat ? nameText(g.cat) : biText('yr.uncategorized'));
const pctText = (p) => (p === null ? '—' : `${p}%`);

/** "Mỗi 3 tháng · 每3月", "500 giờ chạy · 500运行小时" */
function cycleText(p) {
  const v = fmtNumber(p.interval_value);
  const u = L['interval.' + p.interval_type] || [p.interval_type, p.interval_type], e = L['mt.every'];
  return p.interval_type === 'OPERATING_HOURS' ? biText([`${v} ${u[0]}`, `${v}${u[1]}`]) : biText([`${e[0]} ${v} ${u[0]}`, `${e[1]}${v}${u[1]}`]);
}

/** Cột Cả năm: số lần dự kiến (+ ≈ ước tính) · % hoàn thành khi đã có lần tới hạn */
const sumText = (t) => [t.planned || !t.est ? fmtNumber(t.planned) : '', t.est ? `≈${fmtNumber(t.est)}` : ''].filter(Boolean).join(' + ')
  + (t.due ? ` · ${pctText(pct(t.done, t.due))}` : '');

/** Nhãn dòng: {title, sub, href} theo loại dòng */
function rowInfo(r) {
  if (r.kind === 'PLAN' || r.kind === 'HOURS') {
    const p = r.plan;
    let sub = `${p.plan_code || ''} · ${cycleText(p)}`;
    if (r.kind === 'HOURS') {
      const v = r.rate && fmtNumber(Math.round(r.rate.perDay * 10) / 10), u = L['yr.hours_per_day'];
      sub += ' · ' + (r.rate ? biText([`≈ ${v} ${u[0]}`, `≈${v}${u[1]}`]) : biText('yr.hours_no_data'));
    }
    if (p.active === false) sub += ' · ' + biText('yr.plan_stopped');
    return { title: nameText(p, 'title') || p.plan_code, sub, href: '/maintenance/plans/' + p.plan_id };
  }
  if (r.kind === 'INSPECTION') {
    return { title: `${biText('home.item_inspection')}: ${r.type ? nameText(r.type) : ''}`, sub: r.requirement.requirement_code || '', href: '/inspections/' + r.requirement.requirement_id };
  }
  return { title: `${biText('home.item_service')}: ${nameText(r.contractEquipment, 'service') || ''}`, sub: r.contract.contract_code || '', href: '/contracts/' + r.contract.contract_id };
}

/** Chữ rê/chạm của một ô: từng lần (ngày · trạng thái · mã phiếu) */
const entryText = (e) => [fmtDate(e.date), biText(stKey(e.st)) + (e.est ? ` (${biText('yr.est')})` : '') + (e.extra ? ` (${biText('yr.extra')})` : ''),
  e.ref && (e.ref.work_order_code || e.ref.inspection_code) ? e.ref.work_order_code || e.ref.inspection_code : ''].filter(Boolean).join(' · ');

function sym(e) {
  return `<i class="ys ${e.est ? 'est' : 'ys-' + e.st}${e.extra ? ' extra' : ''}">${e.est ? '≈' : SYM[e.st]}</i>`;
}

/** Ô của một dòng: ≤ 2 lần thì từng ký hiệu; nhiều hơn thì gộp theo trạng thái kèm số */
function cellHtml(list) {
  if (!list.length) return '';
  let inner;
  if (list.length <= 2) inner = list.map(sym).join('');
  else {
    const by = new Map();
    for (const e of list) { const k = e.est ? 'est' : e.st; by.set(k, (by.get(k) || 0) + 1); }
    inner = ['est', ...ST_ORDER].filter((k) => by.has(k)).map((k) => `${k === 'est' ? '<i class="ys est">≈</i>' : `<i class="ys ys-${k}">${SYM[k]}</i>`}<small>${by.get(k)}</small>`).join('');
  }
  const wo = list.length === 1 && list[0].ref && list[0].ref.work_order_id ? list[0].ref.work_order_id : '';
  const tip = esc(list.map(entryText).join('\n'));
  return wo ? `<a class="yc" href="#/maintenance/wo/${esc(wo)}" title="${tip}" aria-label="${tip}">${inner}</a>` : `<span class="yc" title="${tip}" aria-label="${tip}">${inner}</span>`;
}

/** Ô tổng của loại trong một tháng: đã tới hạn "xong/tới hạn", phần còn dự kiến "○n", ước tính "≈n" */
function aggHtml(t) {
  if (!t.planned && !t.est && !t.extra) return '';
  const parts = [];
  if (t.due) parts.push(`<b class="ya ${t.done === t.due ? 'ok' : (t.missed ? 'bad' : '')}">${t.done}/${t.due}</b>`);
  if (t.planned - t.due > 0) parts.push(`<span class="ya-p">○${t.planned - t.due}</span>`);
  if (t.est) parts.push(`<span class="ya-p">≈${t.est}</span>`);
  return parts.join(' ');
}

function kpiHtml(m) {
  const t = m.tally;
  return `<div class="yr-kpis">
    <span class="yr-kpi"><small>${bi('yr.kpi.planned')}</small><strong>${fmtNumber(t.planned)}</strong></span>
    <span class="yr-kpi"><small>${bi('yr.kpi.due')}</small><strong>${fmtNumber(t.due)}</strong></span>
    <span class="yr-kpi"><small>${bi('yr.kpi.done')}</small><strong>${pctText(pct(t.done, t.due))}</strong></span>
    <span class="yr-kpi"><small>${bi('yr.kpi.on_time')}</small><strong>${pctText(pct(t.onTime, t.due))}</strong></span>
    <span class="yr-kpi${t.missed ? ' bad' : ''}"><small>${bi('yr.kpi.missed')}</small><strong>${fmtNumber(t.missed)}</strong></span>
    ${t.est ? `<span class="yr-kpi"><small>${bi('yr.kpi.est')}</small><strong>${fmtNumber(t.est)}</strong></span>` : ''}
    ${t.extra ? `<span class="yr-kpi"><small>${bi('yr.kpi.extra')}</small><strong>${fmtNumber(t.extra)}</strong></span>` : ''}
  </div>`;
}

function legendHtml() {
  const items = ['planned', 'done', 'late', 'open', 'missed', 'cancelled'].map((k) => `<span><i class="ys ys-${k}">${SYM[k]}</i>${bi(stKey(k))}</span>`);
  items.push(`<span><i class="ys est">≈</i>${bi('yr.est')}</span>`, `<span><i class="ys ys-done extra">${SYM.done}</i>${bi('yr.extra')}</span>`);
  return `<div class="yr-legend muted small" aria-label="${esc(biText('yr.legend'))}">${items.join('')}</div>`;
}

const monthHead = (i) => `<span class="vi">T${i + 1}</span><span class="zh">${i + 1}月</span>`;

function tableHtml(m) {
  const cur = m.today.slice(0, 4) === String(m.year) ? Number(m.today.slice(5, 7)) - 1 : -1;
  const th = Array.from({ length: 12 }, (_, i) => `<th class="ym${i === cur ? ' cur' : ''}">${monthHead(i)}</th>`).join('');
  const body = m.groups.map((g) => {
    const isOpen = expanded.has(g.key);
    const head = `<tr class="yg${isOpen ? ' open' : ''}" data-cat="${esc(g.key)}"><th class="yname"><button type="button" class="yg-btn" aria-expanded="${isOpen}">${ICON.chevron}<span>${catLabel(g)}</span><small class="muted">${bi('yr.machines', { N: g.machines })}</small></button></th>
      ${g.monthTally.map((t, i) => `<td class="ym${i === cur ? ' cur' : ''}">${aggHtml(t)}</td>`).join('')}
      <td class="ysum"><b>${sumText(g.tally)}</b></td></tr>`;
    const rows = isOpen ? g.rows.map((r) => {
      const info = rowInfo(r);
      return `<tr class="yr-row yk-${r.kind.toLowerCase()}"><th class="yname"><a href="#${esc(info.href)}"><span class="code">${esc(r.eq.equipment_code)}</span> ${esc(nameText(r.eq))}</a>
        <div class="ysub">${esc(info.title)}<span class="muted"> · ${esc(info.sub)}</span></div></th>
        ${r.months.map((list, i) => `<td class="ym${i === cur ? ' cur' : ''}">${cellHtml(list)}</td>`).join('')}
        <td class="ysum">${sumText(r.tally)}</td></tr>`;
    }).join('') : '';
    return head + rows;
  }).join('');
  const foot = (key, f) => `<tr class="yfoot"><th class="yname">${bi(key)}</th>${m.monthTally.map((t, i) => `<td class="ym${i === cur ? ' cur' : ''}">${t.due ? pctText(f(t)) : ''}</td>`).join('')}<td class="ysum">${pctText(f(m.tally))}</td></tr>`;
  return `<div class="table-wrap yr-wrap"><table class="tbl yr-table"><thead><tr><th class="yname">${bi('yr.col.cat_eq')}</th>${th}<th class="ysum">${bi('yr.col.year_sum')}</th></tr></thead>
    <tbody>${body}</tbody><tfoot>${foot('yr.row.done_pct', (t) => pct(t.done, t.due))}${foot('yr.row.on_time_pct', (t) => pct(t.onTime, t.due))}</tfoot></table></div>`;
}

/** iPhone: mỗi loại một thẻ, dải 12 tháng; mở ra từng dòng với dải riêng */
function cardsHtml(m) {
  const cur = m.today.slice(0, 4) === String(m.year) ? Number(m.today.slice(5, 7)) - 1 : -1;
  const strip = (cells) => `<div class="ystrip">${cells.map((c, i) => `<div class="ysc${i === cur ? ' cur' : ''}"><span class="ysm">${i + 1}</span>${c}</div>`).join('')}</div>`;
  return m.groups.map((g) => {
    const isOpen = expanded.has(g.key);
    return `<section class="card yg-card${isOpen ? ' open' : ''}">
      <button type="button" class="yg-head" data-cat="${esc(g.key)}" aria-expanded="${isOpen}"><span class="yg-name">${catLabel(g)}</span>
        <span class="muted small">${bi('yr.machines', { N: g.machines })} · ${bi('yr.kpi.planned')} ${fmtNumber(g.tally.planned)} · ${bi('yr.kpi.done')} ${pctText(pct(g.tally.done, g.tally.due))}</span>${ICON.chevron}</button>
      ${strip(g.monthTally.map(aggHtml))}
      ${isOpen ? g.rows.map((r) => {
        const info = rowInfo(r);
        return `<div class="yrow yk-${r.kind.toLowerCase()}"><a class="yrow-label" href="#${esc(info.href)}"><span class="code">${esc(r.eq.equipment_code)}</span> ${esc(nameText(r.eq))}
          <span class="ysub">${esc(info.title)}<span class="muted"> · ${esc(info.sub)}</span></span></a>${strip(r.months.map(cellHtml))}</div>`;
      }).join('') : ''}
    </section>`;
  }).join('');
}

/** Nội dung tab (gọi từ renderMaintenance) */
export async function yearTab(wide) {
  if (!year) year = Number(today().slice(0, 4));
  const m = await loadModel(year);
  if (!expanded) expanded = new Set(wide && m.groups.reduce((n, g) => n + g.rows.length, 0) <= 60 ? m.groups.map((g) => g.key) : []);
  const allOpen = m.groups.length && m.groups.every((g) => expanded.has(g.key));
  const canPlan = await can('maintenance.plan.edit');
  const head = `<section class="card yr-head">
      <div class="yr-top"><button type="button" class="icon-btn" id="yr-prev" aria-label="‹">${ICON.back}</button>
        <h2>${bi('yr.title', { Y: year })}</h2><button type="button" class="icon-btn flip" id="yr-next" aria-label="›">${ICON.back}</button>
        <span class="row yr-tools">${m.groups.length ? `<button type="button" class="btn tiny" id="yr-toggle">${bi(allOpen ? 'yr.close_all' : 'yr.open_all')}</button>` : ''}
          ${m.groups.length ? `<button type="button" class="btn tiny" id="yr-xlsx">${ICON.download}<span>${bi('yr.export')}</span></button>
          <button type="button" class="btn tiny primary" id="yr-file" hidden>${bi('btn.open_save')}</button>` : ''}</span></div>
      ${m.groups.length ? kpiHtml(m) : ''}
      <p class="muted small">${bi('yr.note')}</p>${legendHtml()}</section>`;
  if (!m.groups.length) {
    return `${head}<div class="card empty-state">${ICON.calendar}<p class="muted">${bi('yr.empty', { Y: year })}</p>
      ${canPlan ? `<a class="btn small" href="#/maintenance/plans/new">${ICON.plus}<span>${bi('mt.plan_new')}</span></a>` : ''}</div>`;
  }
  return head + (wide ? `<section class="card yr-card">${tableHtml(m)}</section>` : cardsHtml(m));
}

/** Gắn sự kiện sau khi vẽ (again = vẽ lại cả màn Bảo trì) */
export function wireYearTab(view, again) {
  const prev = $('#yr-prev', view), next = $('#yr-next', view);
  if (!prev) return;
  prev.addEventListener('click', () => { year -= 1; lastFile = null; again(); });
  next.addEventListener('click', () => { year += 1; lastFile = null; again(); });
  $$('[data-cat]', view).forEach((el) => el.addEventListener('click', (ev) => {
    if (ev.target.closest('a')) return;
    const k = el.dataset.cat;
    if (expanded.has(k)) expanded.delete(k); else expanded.add(k);
    again();
  }));
  const tg = $('#yr-toggle', view);
  if (tg) tg.addEventListener('click', async () => {
    const m = await loadModel(year);
    const allOpen = m.groups.every((g) => expanded.has(g.key));
    expanded = new Set(allOpen ? [] : m.groups.map((g) => g.key));
    again();
  });
  const xl = $('#yr-xlsx', view), fileBtn = $('#yr-file', view);
  if (xl) xl.addEventListener('click', async () => {
    xl.disabled = true;
    try {
      const file = await excelFile(await loadModel(year));
      if (isTouchMobile()) { lastFile = file; fileBtn.hidden = false; fileBtn.focus(); toast(bi('rpt.export_done', { F: file.name }), 'ok'); return; }
      shareFileNow(file);
      toast(bi('rpt.export_done', { F: file.name }), 'ok');
    } catch (e) {
      toast(bi('yr.export_failed'), 'err');
    } finally { xl.disabled = false; }
  });
  if (fileBtn) fileBtn.addEventListener('click', () => { if (lastFile) shareFileNow(lastFile); });
  $$('.yr-row a, .yrow-label', view).forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); navigate(a.getAttribute('href').slice(1)); }));
}

/* ---------------- Excel ---------------- */

const cellText = (list) => list.map((e) => `${e.est ? '≈' : SYM[e.st]}${e.date.slice(8, 10)}${e.extra ? '+' : ''}`).join(' ');
const aggText = (t) => [t.due ? `${t.done}/${t.due}` : '', t.planned - t.due > 0 ? `○${t.planned - t.due}` : '', t.est ? `≈${t.est}` : ''].filter(Boolean).join(' ');

/** Tệp Excel kế hoạch năm: logo công ty (nếu có) ở góc, dòng loại + từng máy, ô tháng ghi ký hiệu + ngày, dòng % cuối, chú giải */
async function excelFile(m) {
  const X = await loadXlsx();
  const logo = await reportLogo().catch(() => null);
  const months = Array.from({ length: 12 }, (_, i) => `T${i + 1} · ${i + 1}月`);
  const head = [biText('yr.col.category'), biText('col.code'), biText('yr.col.equipment'), biText('yr.col.work'), biText('yr.col.cycle'), ...months,
    biText('yr.col.planned'), biText('yr.col.done'), biText('yr.col.on_time')];
  const aoa = [];
  if (logo) aoa.push([''], [''], [''], ['']);
  aoa.push([biText('yr.title', { Y: m.year })], [`${biText('rpt.generated_at')}: ${fmtDateTime(isoNowVN())}`], [], head);
  for (const g of m.groups) {
    aoa.push([catText(g), '', biText('yr.machines', { N: g.machines }), '', '', ...g.monthTally.map(aggText), g.tally.planned, pctText(pct(g.tally.done, g.tally.due)), pctText(pct(g.tally.onTime, g.tally.due))]);
    for (const r of g.rows) {
      const info = rowInfo(r);
      aoa.push(['', r.eq.equipment_code || '', nameText(r.eq), info.title, info.sub, ...r.months.map(cellText), r.tally.planned,
        r.tally.due ? pctText(pct(r.tally.done, r.tally.due)) : '', r.tally.due ? pctText(pct(r.tally.onTime, r.tally.due)) : '']);
    }
  }
  aoa.push([biText('yr.row.done_pct'), '', '', '', '', ...m.monthTally.map((t) => (t.due ? pctText(pct(t.done, t.due)) : '')), m.tally.planned, pctText(pct(m.tally.done, m.tally.due)), '']);
  aoa.push([biText('yr.row.on_time_pct'), '', '', '', '', ...m.monthTally.map((t) => (t.due ? pctText(pct(t.onTime, t.due)) : '')), '', '', pctText(pct(m.tally.onTime, m.tally.due))]);
  aoa.push([], [biText('yr.legend')]);
  for (const k of ['planned', 'done', 'late', 'open', 'missed', 'cancelled']) aoa.push([`${SYM[k]}  ${biText(stKey(k))}`]);
  aoa.push([`≈  ${biText('yr.est')}`], [`+  ${biText('yr.extra')}`], [biText('yr.note')]);
  const ws = aoaSheet(X, aoa);
  ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 26 }, { wch: 28 }, { wch: 22 }, ...months.map(() => ({ wch: 9 })), { wch: 10 }, { wch: 10 }, { wch: 10 }];
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, `KH ${m.year}`);
  const image = logo ? { sheet: 1, bytes: logoBytes(logo), mime: logo.mime, ...(await logoSize(logo, 60).then((z) => ({ wPx: z.w, hPx: z.h }))) } : null;
  return workbookFile(X, wb, `KeHoachBaoTri_${m.year}.xlsx`, image);
}

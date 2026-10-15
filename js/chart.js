// Biểu đồ (Điện nước, Báo cáo): cột mảnh HTML/CSS (chữ không co theo khung trên iPhone), một trục, một chuỗi mỗi biểu đồ
// (điện kWh và nước m³ không chung trục). Màu theo đối tượng: điện = cam, nước = xanh (bảng màu đã kiểm CVD/độ tương phản).
// Rê chuột/chạm/Tab trên cột → chú giải; luôn có bảng số liệu đi kèm (không phụ thuộc màu hay chú giải).
import { bi, biText, esc, fmtNumber } from './core.js';

/** Bước chia trục "đẹp": 1, 2, 2.5, 5 × 10^n; tối đa 4 vạch trên 0 */
function niceScale(max) {
  if (!(max > 0)) return { top: 1, step: 1 };
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || 10 * p;
  return { top: Math.ceil(max / step) * step, step };
}

/** Nhãn trục gọn từ 1 000 trở lên (1K, 2,5K, 1,2M) */
function compact(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return fmtNumber(n / 1e6, 1) + 'M';
  if (a >= 1e3) return fmtNumber(n / 1e3, 1) + 'K';
  return fmtNumber(n, 2);
}

/**
 * Biểu đồ cột theo kỳ. points: [{label, title, value: number|null, state: 'ok'|'partial'|'open'|'none'}]
 * tone: 'elec' | 'water' | 'neutral'; unit: chữ đơn vị; tableHead: [nhãn cột kỳ, nhãn cột giá trị]
 * Cột đặc = đủ dữ liệu; cột rỗng (viền + nền nhạt) = thiếu số đo một phần hoặc kỳ chưa kết thúc; không có cột = chưa có dữ liệu.
 */
export function columnChartHtml({ title, unit = '', tone = 'neutral', points = [], note = '', tableHead = null, stateKey = (p) => '' }) {
  const vals = points.map((p) => (p.value === null || p.value === undefined ? 0 : Number(p.value)));
  const { top, step } = niceScale(Math.max(0, ...vals));
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  // Nhãn trên đầu cột chọn lọc: kỳ gần nhất có số và kỳ lớn nhất (không ghi số trên mọi cột)
  const okIdx = points.map((p, i) => (p.value !== null && p.value !== undefined && p.state !== 'none' ? i : -1)).filter((i) => i >= 0);
  const lastOk = okIdx.length ? okIdx[okIdx.length - 1] : -1;
  let maxIdx = -1;
  okIdx.forEach((i) => { if (maxIdx < 0 || vals[i] > vals[maxIdx]) maxIdx = i; });
  const labelAt = new Set([lastOk, maxIdx].filter((i) => i >= 0));
  // Chú giải: cột rỗng (kỳ thiếu một phần/chưa kết thúc) và dấu tròn (kỳ chưa đủ số liệu) chỉ hiện khi có trên biểu đồ
  const hollow = points.some((p) => (p.state === 'partial' || p.state === 'open') && p.value !== null && p.value !== undefined);
  const empty = points.some((p) => p.value === null || p.value === undefined || p.state === 'none');
  const u = unit ? `\u00A0${esc(unit)}` : '';
  const cols = points.map((p, i) => {
    const has = p.value !== null && p.value !== undefined && p.state !== 'none';
    const pct = has && top > 0 ? Math.max(0.6, (vals[i] / top) * 100) : 0;
    const tip = `${has ? fmtNumber(vals[i]) + (unit ? '\u00A0' + unit : '') : '—'}|${p.title || p.label}${stateKey(p) ? '|' + biText(stateKey(p)) : ''}`;
    return `<div class="vz-col" tabindex="0" role="listitem" data-tip="${esc(tip)}" aria-label="${esc(tip.replace(/\|/g, ' · '))}">
      ${has ? `<div class="vz-bar ${p.state === 'ok' ? '' : 'hollow'}" style="height:${pct.toFixed(2)}%">${labelAt.has(i) ? `<span class="vz-val">${fmtNumber(vals[i])}</span>` : ''}</div>`
        : '<div class="vz-none" aria-hidden="true"></div>'}
    </div>`;
  }).join('');
  const head = tableHead || [biText('rpt.period'), unit || ''];
  return `<figure class="vz tone-${tone}">
    ${title ? `<figcaption class="vz-title">${title}${unit ? ` <span class="muted small">(${esc(unit)})</span>` : ''}</figcaption>` : ''}
    <div class="vz-body">
      <div class="vz-axis" aria-hidden="true">${ticks.slice().reverse().map((t) => `<span style="bottom:${((t / top) * 100).toFixed(2)}%">${esc(compact(t))}</span>`).join('')}</div>
      <div class="vz-plot">
        <div class="vz-grid" aria-hidden="true">${ticks.map((t) => `<i style="bottom:${((t / top) * 100).toFixed(2)}%"></i>`).join('')}</div>
        <div class="vz-cols" role="list">${cols}</div>
        <div class="vz-tip" role="status" hidden><strong></strong><span></span><em></em></div>
      </div>
    </div>
    <div class="vz-x" aria-hidden="true">${points.map((p) => `<span>${esc(p.label)}</span>`).join('')}</div>
    ${hollow ? `<p class="vz-key muted small"><i class="vz-key-hollow"></i><span>${bi('ut.chart_hollow')}</span></p>` : ''}
    ${empty ? `<p class="vz-key muted small"><i class="vz-key-none"></i><span>${bi('chart.no_data')}</span></p>` : ''}
    ${note ? `<p class="vz-note muted small">${note}</p>` : ''}
    <details class="vz-table"><summary>${bi('chart.table_view')}</summary>
      <table class="tbl"><thead><tr><th>${esc(head[0])}</th><th class="num">${esc(head[1])}</th><th>${bi('col.status')}</th></tr></thead>
      <tbody>${points.map((p, i) => `<tr><td>${esc(p.title || p.label)}</td><td class="num">${p.value !== null && p.value !== undefined && p.state !== 'none' ? fmtNumber(vals[i]) + u : '—'}</td><td>${stateKey(p) ? bi(stateKey(p)) : ''}</td></tr>`).join('')}</tbody></table>
    </details>
  </figure>`;
}

/**
 * Thanh ngang theo nhóm (so sánh khu vực, đếm theo trạng thái). items: [{label (chữ), value}]; giá trị ghi ở đầu thanh.
 * Một chuỗi → một màu; không tô theo giá trị.
 */
export function barListHtml({ title, unit = '', tone = 'neutral', items = [], empty = '' }) {
  const max = Math.max(0, ...items.map((x) => Number(x.value) || 0));
  const u = unit ? `\u00A0${esc(unit)}` : '';
  return `<figure class="vz vz-hbar tone-${tone}">
    ${title ? `<figcaption class="vz-title">${title}</figcaption>` : ''}
    ${items.length ? `<ul class="vz-rows">${items.map((x) => {
      const v = Number(x.value) || 0;
      const pct = max > 0 ? Math.max(0.8, (v / max) * 100) : 0;
      return `<li tabindex="0"><span class="vz-lbl">${esc(x.label)}</span><span class="vz-track"><span class="vz-hfill" style="width:${pct.toFixed(2)}%"></span></span><span class="vz-num">${fmtNumber(v)}${u}</span></li>`;
    }).join('')}</ul>` : `<p class="muted small">${empty}</p>`}
  </figure>`;
}

/** Chú giải khi rê/chạm/Tab: giá trị trước, tên kỳ sau (textContent, không chèn HTML) */
export function wireCharts(root) {
  root.querySelectorAll('.vz').forEach((fig) => {
    const tip = fig.querySelector('.vz-tip');
    if (!tip) return;
    const show = (col) => {
      const [v, label, st] = String(col.dataset.tip || '').split('|');
      tip.querySelector('strong').textContent = v || '';
      tip.querySelector('span').textContent = label || '';
      tip.querySelector('em').textContent = st || '';
      tip.hidden = false;
      const plot = fig.querySelector('.vz-plot').getBoundingClientRect();
      const r = col.getBoundingClientRect();
      const x = Math.min(Math.max(r.left - plot.left + r.width / 2, 60), plot.width - 60);
      tip.style.left = x + 'px';
      fig.querySelectorAll('.vz-col.on').forEach((c) => c.classList.remove('on'));
      col.classList.add('on');
    };
    const hide = () => { tip.hidden = true; fig.querySelectorAll('.vz-col.on').forEach((c) => c.classList.remove('on')); };
    fig.querySelectorAll('.vz-col').forEach((col) => {
      col.addEventListener('pointerenter', () => show(col));
      col.addEventListener('focus', () => show(col));
      col.addEventListener('click', () => show(col));
      col.addEventListener('blur', hide);
    });
    fig.querySelector('.vz-cols').addEventListener('pointerleave', hide);
  });
}

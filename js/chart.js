// Biểu đồ (Điện nước, Báo cáo). Từ d4.22 (người dùng muốn kiểu đẹp hơn): cột SVG vẽ đúng bề rộng khung (chữ không co theo khung
// trên iPhone — đo khung rồi vẽ bằng điểm ảnh thật, vẽ lại khi khung đổi cỡ), cột ≤ 24 px đầu bo 4 px, lưới mảnh, một trục, một chuỗi
// mỗi biểu đồ (điện kWh và nước m³ không chung trục). Thêm: đường trung bình ngày (nét đứt, nhãn ở mép phải), dải nhạt ngày Chủ nhật,
// nhãn số chọn lọc (ngày/kỳ cao nhất, kỳ gần nhất), dải sáng + chú giải khi rê/chạm/phím ← →. Màu theo đối tượng: điện cam, nước xanh
// (bảng màu đã kiểm CVD/độ tương phản). Chữ dùng màu chữ, không dùng màu chuỗi. Luôn có "Bảng số liệu".
// Cùng mô hình vẽ được ảnh PNG (chartPng) để máy chủ chèn vào PDF.
import { bi, biText, esc, fmtNumber } from './core.js';

const TONE_C = { elec: '#EB6834', water: '#2A78D6', neutral: '#2A78D6' };
const INK = '#1F2933', MUTED = '#5B6875', GRID = '#E6E9EE', BASE = '#B8C0CC', NONE = '#A7B0BC', WEEKEND = '#F3F5F8', HOVER = '#E9EEF5', AVG = '#3E4C59';
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Noto Sans", "Noto Sans SC", "Microsoft YaHei", Arial, sans-serif';

/** Bước chia trục "đẹp": 1, 2, 2.5, 5 × 10^n; tối đa 4 vạch trên 0 */
function niceScale(max) {
  if (!(max > 0)) return { top: 1, step: 1 };
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || 10 * p;
  return { top: Math.ceil(max / step - 1e-9) * step, step };
}

/** Nhãn trục: đầy đủ dưới 10 000, gọn từ 10 000 (10K, 2,5M) — một kiểu cho cả trục */
function tickText(n, top) {
  if (top >= 1e6) return fmtNumber(n / 1e6, 1) + 'M';
  if (top >= 1e4) return fmtNumber(n / 1e3, 1) + 'K';
  return fmtNumber(n, 2);
}

const has = (p) => p.value !== null && p.value !== undefined && p.state !== 'none' && p.state !== 'future';
const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Đường cột: đáy vuông, đầu bo r */
function barPath(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Bố cục: lề, cỡ ô, thang — dùng chung cho vẽ và dò chuột */
function layout(m, W, H, o) {
  const f = o.font || 11;
  const pts = m.points;
  const n = Math.max(1, pts.length);
  const vals = pts.filter(has).map((p) => Number(p.value));
  const { top, step } = niceScale(Math.max(0, ...vals, m.avg || 0));
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const tickW = Math.max(...ticks.map((t) => tickText(t, top).length)) * f * 0.62 + 10;
  const head = o.title ? f * 2.6 : 0;
  const L = Math.round(tickW), R = 10, T = Math.round(head + f + 8), B = Math.round(f + 10);
  const pw = Math.max(40, W - L - R), ph = Math.max(40, H - T - B);
  const slot = pw / n;
  const bw = Math.max(2, Math.min(24, slot * (n > 20 ? 0.66 : 0.5), slot - 2));
  return { f, n, top, ticks, L, R, T, B, pw, ph, slot, bw, y: (v) => T + ph - (v / top) * ph, x: (i) => L + slot * (i + 0.5) };
}

/**
 * SVG của biểu đồ cột, đúng W × H điểm ảnh. o = {font, title: true (ảnh PNG: in tiêu đề + chú thích trong ảnh)}.
 * m = {titleText, unit, tone, points: [{label, title, value, state: ok|partial|open|none|future, weekend}], avg, labelAt: [chỉ số]}
 */
export function chartSvg(m, W, H, o = {}) {
  const g = layout(m, W, H, o);
  const c = TONE_C[m.tone] || TONE_C.neutral;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family='${FONT}' font-size="${g.f}" role="img" aria-hidden="true">`);
  if (o.title) {
    out.push(`<rect width="${W}" height="${H}" fill="#FFFFFF"/>`);
    out.push(`<text x="${g.L}" y="${g.f + 4}" font-size="${g.f + 3}" font-weight="700" fill="#17324F">${xmlEsc(m.titleText || '')}${m.unit ? ` <tspan font-weight="400" fill="${MUTED}" font-size="${g.f}">(${xmlEsc(m.unit)})</tspan>` : ''}</text>`);
    // Chú thích nhỏ ở góc phải: chỉ ký hiệu có trên biểu đồ
    const keys = [];
    if (m.avg > 0) keys.push(['avg', `${m.avgText || ''}: ${fmtNumber(m.avg, 1)}`]);
    if (m.points.some((p) => has(p) && p.state !== 'ok')) keys.push(['hollow', m.keyHollow || '']);
    if (m.points.some((p) => p.state === 'none')) keys.push(['none', m.keyNone || '']);
    let kx = W - g.R;
    keys.reverse().forEach(([k, t]) => {
      const tw = t.length * g.f * 0.55;
      kx -= tw;
      out.push(`<text x="${kx}" y="${g.f + 4}" fill="${MUTED}">${xmlEsc(t)}</text>`);
      kx -= 14;
      if (k === 'avg') { kx -= 8; out.push(`<line x1="${kx}" x2="${kx + 18}" y1="${g.f / 2 + 4}" y2="${g.f / 2 + 4}" stroke="${AVG}" stroke-width="1.5" stroke-dasharray="4 3"/>`); }
      else out.push(k === 'hollow' ? `<rect x="${kx}" y="${4}" width="10" height="${g.f}" rx="2" fill="${c}" fill-opacity="0.12" stroke="${c}" stroke-width="1.5"/>`
        : `<circle cx="${kx + 5}" cy="${g.f / 2 + 4}" r="3.5" fill="#FFFFFF" stroke="${NONE}" stroke-width="1.5"/>`);
      kx -= 18;
    });
  }
  // Dải nhạt ngày Chủ nhật (biểu đồ theo ngày)
  m.points.forEach((p, i) => { if (p.weekend) out.push(`<rect x="${(g.L + g.slot * i).toFixed(1)}" y="${g.T}" width="${g.slot.toFixed(1)}" height="${g.ph}" fill="${WEEKEND}"/>`); });
  out.push(`<rect class="vz-hl" x="0" y="${g.T}" width="${g.slot.toFixed(1)}" height="${g.ph}" fill="${HOVER}" visibility="hidden"/>`);
  // Lưới mảnh + vạch trục
  g.ticks.forEach((t, k) => {
    const y = g.y(t).toFixed(1);
    out.push(`<line x1="${g.L}" x2="${W - g.R}" y1="${y}" y2="${y}" stroke="${k ? GRID : BASE}" stroke-width="1"/>`);
    out.push(`<text x="${g.L - 6}" y="${y}" dy="0.35em" text-anchor="end" fill="${MUTED}">${xmlEsc(tickText(t, g.top))}</text>`);
  });
  // Cột
  m.points.forEach((p, i) => {
    const cx = g.x(i);
    if (p.state === 'future' || (p.state === 'open' && !has(p))) return; // ngày chưa tới / hôm nay chưa chốt: không vẽ
    if (!has(p)) { out.push(`<circle cx="${cx.toFixed(1)}" cy="${(g.T + g.ph - 4.5).toFixed(1)}" r="3.5" fill="#FFFFFF" stroke="${NONE}" stroke-width="1.5"/>`); return; }
    const v = Number(p.value);
    const h = Math.max(v > 0 ? 1.5 : 0, (v / g.top) * g.ph);
    const x = cx - g.bw / 2, y = g.T + g.ph - h;
    const d = barPath(x, y, g.bw, h, 4);
    out.push(p.state === 'ok' ? `<path d="${d}" fill="${c}"/>` : `<path d="${d}" fill="${c}" fill-opacity="0.12" stroke="${c}" stroke-width="1.5"/>`);
  });
  // Đường trung bình ngày
  if (m.avg > 0) {
    const y = g.y(m.avg).toFixed(1);
    out.push(`<line x1="${g.L}" x2="${W - g.R}" y1="${y}" y2="${y}" stroke="${AVG}" stroke-width="1" stroke-dasharray="4 3"/>`);
  }
  // Nhãn số chọn lọc trên đầu cột
  (m.labelAt || []).forEach((i) => {
    const p = m.points[i];
    if (!p || !has(p)) return;
    const y = g.y(Number(p.value)) - 5;
    out.push(`<text x="${g.x(i).toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-weight="700" fill="${INK}" stroke="#FFFFFF" stroke-width="3" paint-order="stroke">${xmlEsc(fmtNumber(Number(p.value)))}</text>`);
  });
  // Nhãn trục ngang: thưa dần khi ô hẹp
  const lw = Math.max(...m.points.map((p) => String(p.label).length)) * g.f * 0.62 + 4;
  const every = Math.max(1, Math.ceil(lw / g.slot));
  m.points.forEach((p, i) => {
    if (i % every && i !== m.points.length - 1) return;
    if (i === m.points.length - 1 && i % every && (i % every) < every / 2) return;
    out.push(`<text x="${g.x(i).toFixed(1)}" y="${H - 4}" text-anchor="middle" fill="${p.state === 'future' ? NONE : MUTED}">${xmlEsc(p.label)}</text>`);
  });
  out.push('</svg>');
  return out.join('');
}

/** Ảnh PNG (base64, không tiền tố) của biểu đồ cho PDF: vẽ SVG cỡ cố định có tiêu đề, nền trắng, độ phân giải ×2 */
export async function chartPng(m, { width = 900, height = 250, scale = 2 } = {}) {
  const svg = chartSvg(m, width, height, { font: 13, title: true });
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await (img.decode ? img.decode() : new Promise((ok, no) => { img.onload = ok; img.onerror = no; }));
  const cv = document.createElement('canvas');
  cv.width = width * scale; cv.height = height * scale;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/png').split(',')[1];
}

/* Mô hình của các biểu đồ trên màn: gắn vào phần tử khi wireCharts vẽ */
const MODELS = new Map();
let seq = 0;

/**
 * Biểu đồ cột (HTML giữ chỗ; wireCharts vẽ SVG theo bề rộng thật). points: [{label, title, value: number|null,
 * state: 'ok'|'partial'|'open'|'none'|'future', weekend}]; tone: 'elec' | 'water' | 'neutral'; unit; tableHead: [nhãn cột kỳ, nhãn cột giá trị];
 * avg: số (đường trung bình ngày); labels: 'peak' (chỉ cột cao nhất) | 'peak_last' (cao nhất + kỳ gần nhất, mặc định).
 * Cột đặc = đủ dữ liệu; cột rỗng = thiếu số đo một phần hoặc kỳ chưa kết thúc; dấu tròn = chưa có dữ liệu; ngày chưa tới: không vẽ.
 */
export function columnChartHtml({ title, titleText = '', unit = '', tone = 'neutral', points = [], note = '', tableHead = null, stateKey = () => '', avg = null, labels = 'peak_last', height = 0 }) {
  const okIdx = points.map((p, i) => (has(p) ? i : -1)).filter((i) => i >= 0);
  let maxIdx = -1;
  okIdx.forEach((i) => { if (maxIdx < 0 || Number(points[i].value) > Number(points[maxIdx].value)) maxIdx = i; });
  const lastOk = okIdx.length ? okIdx[okIdx.length - 1] : -1;
  const labelAt = [...new Set((labels === 'peak' ? [maxIdx] : [lastOk, maxIdx]).filter((i) => i >= 0))];
  const pts = points.map((p) => ({ ...p, stateText: stateKey(p) ? biText(stateKey(p)) : (p.state === 'future' ? biText('chart.future') : '') }));
  const id = 'vz' + (++seq);
  const model = { titleText, unit, tone, points: pts, avg: avg > 0 ? avg : null, avgText: biText('chart.avg'), labelAt, maxIdx, height,
    keyHollow: biText('chart.key_hollow'), keyNone: biText('chart.key_none') };
  MODELS.set(id, model);
  const hollow = points.some((p) => has(p) && p.state !== 'ok');
  const empty = points.some((p) => p.state === 'none' || ((p.value === null || p.value === undefined) && p.state !== 'future' && p.state !== 'open'));
  const u = unit ? `\u00A0${esc(unit)}` : '';
  const head = tableHead || [biText('rpt.period'), unit || ''];
  const aria = [titleText, unit, biText('chart.table_view')].filter(Boolean).join(' · ');
  return `<figure class="vz vz2 tone-${tone}" data-vz="${id}">
    ${title ? `<figcaption class="vz-title">${title}${unit ? ` <span class="muted small">(${esc(unit)})</span>` : ''}</figcaption>` : ''}
    <div class="vz-svg" tabindex="0" role="img" aria-label="${esc(aria)}"><div class="vz-tip" role="status" hidden><strong></strong><span></span><em></em></div></div>
    <div class="vz-keys">${model.avg ? `<span class="vz-key"><i class="vz-key-avg"></i><span>${bi('chart.avg')}: ${fmtNumber(model.avg, 1)}${u}</span></span>` : ''}
      ${hollow ? `<span class="vz-key"><i class="vz-key-hollow"></i><span>${bi('ut.chart_hollow')}</span></span>` : ''}
      ${empty ? `<span class="vz-key"><i class="vz-key-none"></i><span>${bi('chart.no_data')}</span></span>` : ''}</div>
    ${note ? `<p class="vz-note muted small">${note}</p>` : ''}
    <details class="vz-table"><summary>${bi('chart.table_view')}</summary>
      <table class="tbl"><thead><tr><th>${esc(head[0])}</th><th class="num">${esc(head[1])}</th><th>${bi('col.status')}</th></tr></thead>
      <tbody>${pts.map((p) => `<tr><td>${esc(p.title || p.label)}</td><td class="num">${has(p) ? fmtNumber(Number(p.value)) + u : (p.state === 'future' ? '' : '—')}</td><td>${esc(p.stateText)}</td></tr>`).join('')}</tbody></table>
    </details>
  </figure>`;
}

/** Mô hình biểu đồ (để vẽ ảnh PNG cho PDF) của phần tử biểu đồ đã có trên màn */
export function chartModelOf(fig) { return fig._vz || MODELS.get(fig.dataset.vz) || null; }

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

/** Vẽ (lại) SVG của một biểu đồ theo bề rộng khung */
function paint(fig) {
  const m = fig._vz;
  const box = fig.querySelector('.vz-svg');
  const W = Math.floor(box.clientWidth);
  if (!m || W < 60 || W === fig._vzW) return;
  fig._vzW = W;
  const H = m.height || (W < 520 ? 190 : 220);
  const old = box.querySelector('svg');
  const tmp = document.createElement('div');
  tmp.innerHTML = chartSvg(m, W, H, { font: 11 });
  const svg = tmp.firstChild;
  if (old) old.replaceWith(svg); else box.insertBefore(svg, box.firstChild);
  fig._vzG = layout(m, W, H, { font: 11 });
}

/** Vẽ biểu đồ trong root; chú giải khi rê/chạm/phím ← → (giá trị trước, tên kỳ sau; textContent, không chèn HTML) */
export function wireCharts(root) {
  root.querySelectorAll('.vz2[data-vz]').forEach((fig) => {
    if (!fig._vz) { fig._vz = MODELS.get(fig.dataset.vz); MODELS.delete(fig.dataset.vz); }
    if (!fig._vz) return;
    paint(fig);
    if (fig._vzWired) return;
    fig._vzWired = true;
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => paint(fig)).observe(fig.querySelector('.vz-svg'));
    const box = fig.querySelector('.vz-svg');
    const tip = box.querySelector('.vz-tip');
    let cur = -1;
    const show = (i) => {
      const m = fig._vz, g = fig._vzG;
      if (!g || i < 0 || i >= m.points.length) return;
      cur = i;
      const p = m.points[i];
      tip.querySelector('strong').textContent = has(p) ? fmtNumber(Number(p.value)) + (m.unit ? '\u00A0' + m.unit : '') : (p.state === 'future' ? '' : '—');
      tip.querySelector('span').textContent = p.title || p.label;
      tip.querySelector('em').textContent = p.stateText || '';
      tip.hidden = false;
      const x = g.x(i);
      tip.style.left = Math.min(Math.max(x, 70), box.clientWidth - 70) + 'px';
      const hl = box.querySelector('.vz-hl');
      if (hl) { hl.setAttribute('x', (g.L + g.slot * i).toFixed(1)); hl.setAttribute('visibility', 'visible'); }
    };
    const hide = () => {
      cur = -1;
      tip.hidden = true;
      const hl = box.querySelector('.vz-hl');
      if (hl) hl.setAttribute('visibility', 'hidden');
    };
    const at = (ev) => {
      const g = fig._vzG;
      if (!g) return -1;
      const r = box.getBoundingClientRect();
      const i = Math.floor((ev.clientX - r.left - g.L) / g.slot);
      return i >= 0 && i < g.n ? i : -1;
    };
    box.addEventListener('pointermove', (ev) => { const i = at(ev); if (i >= 0) show(i); else hide(); });
    box.addEventListener('pointerdown', (ev) => { const i = at(ev); if (i >= 0) show(i); });
    box.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') hide(); });
    box.addEventListener('focus', () => { const m = fig._vz; show(m.maxIdx >= 0 ? m.maxIdx : m.points.length - 1); });
    box.addEventListener('blur', hide);
    box.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      ev.preventDefault();
      const n = fig._vz.points.length;
      show(Math.min(n - 1, Math.max(0, (cur < 0 ? 0 : cur) + (ev.key === 'ArrowLeft' ? -1 : 1))));
    });
  });
}

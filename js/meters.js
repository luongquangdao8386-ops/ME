// Kỳ và mốc đọc chỉ số trên máy (khớp 30_utilities của máy chủ, phụ lục 3.12 B1): kỳ 1/5/10 ngày/tháng; mốc 00:00 giờ Việt Nam;
// số chốt = lần đọc hợp lệ đầu tiên trong W giờ sau mốc. Dùng cho nhãn "Cần đọc", ô trang chủ, lịch tuần, tiêu thụ tạm khi nhập.
import { session } from './core.js';
import { addDays, daysBetween, today } from './data.js';

export const UTILITY_TYPES = ['ELECTRICITY', 'WATER'];
export const UNIT = { ELECTRICITY: 'kWh', WATER: 'm³' };
export const TONE = { ELECTRICITY: 'elec', WATER: 'water' };
export const PERIOD_TYPES = ['DAY_1', 'DAY_5', 'DAY_10', 'MONTH', 'CUSTOM'];
export const READ_CYCLES = ['DAY_1', 'DAY_5', 'DAY_10', 'MONTH', 'CUSTOM'];

const pad2 = (n) => String(n).padStart(2, '0');
const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Cửa sổ chốt kỳ W (Settings meter_boundary_window_hours, 1–24, mặc định 24) */
export function windowHours() {
  const w = Number(session.settings && session.settings.meter_boundary_window_hours);
  return w >= 1 && w <= 24 ? Math.floor(w) : 24;
}

/** 00:00 giờ Việt Nam của ngày iso (ms) */
export const boundaryMs = (iso) => Date.parse(iso + 'T00:00:00+07:00');

/** Giờ hiện tại theo máy chủ (THỬ có thể đặt ngày thử TEST_TODAY) */
export function nowMs() {
  const off = Number(session.settings && session.settings.__today_offset_days) || 0;
  return Date.now() + off * 86400000;
}

/** Kỳ chứa ngày d: [đầu, cuối] (ngày, gồm hai đầu); kỳ cuối tháng gom phần còn lại (26–cuối, 21–cuối) */
export function periodOf(type, d) {
  const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)), day = Number(d.slice(8, 10));
  const ym = d.slice(0, 8);
  const last = lastDayOf(y, m);
  if (type === 'DAY_1') return [d, d];
  if (type === 'MONTH' || type === 'CUSTOM') return [ym + '01', ym + pad2(last)];
  const step = type === 'DAY_5' ? 5 : 10;
  let start = Math.floor((day - 1) / step) * step + 1;
  let lastStart = Math.floor((last - 1) / step) * step + 1;
  if (type === 'DAY_5' && lastStart > 26) lastStart = 26;
  if (type === 'DAY_10' && lastStart > 21) lastStart = 21;
  if (start > lastStart) start = lastStart;
  const end = start === lastStart ? last : start + step - 1;
  return [ym + pad2(start), ym + pad2(end)];
}
export const prevPeriod = (type, a) => periodOf(type, addDays(a, -1));
export const nextPeriod = (type, b) => periodOf(type, addDays(b, 1));

/** Danh sách n kỳ kết thúc ở kỳ chứa ngày a (cũ → mới) */
export function periodsBack(type, a, n) {
  const out = [];
  let cur = periodOf(type, a);
  for (let i = 0; i < n; i++) { out.unshift(cur); cur = prevPeriod(type, cur[0]); }
  return out;
}

/** Mốc đọc (ngày đầu kỳ đọc) gần nhất ≤ ngày iso theo chu kỳ đọc của đồng hồ */
export function lastBoundary(m, iso) {
  const t = m.reading_cycle_type || 'MONTH';
  if (t === 'CUSTOM') {
    const n = Math.max(1, Number(m.reading_cycle_value) || 1), a = m.reading_cycle_anchor_date;
    if (!a) return periodOf('MONTH', iso)[0];
    const diff = daysBetween(a, iso);
    if (diff === null || diff < 0) return a;
    return addDays(a, Math.floor(diff / n) * n);
  }
  return periodOf(t, iso)[0];
}

/** Mốc đọc kế tiếp sau ngày iso */
export function nextBoundary(m, iso) {
  const t = m.reading_cycle_type || 'MONTH';
  if (t === 'CUSTOM') {
    const n = Math.max(1, Number(m.reading_cycle_value) || 1);
    const b = lastBoundary(m, iso);
    return b > iso ? b : addDays(b, n);
  }
  return addDays(periodOf(t, iso)[1], 1);
}

/** Đồng hồ có mốc đọc vào ngày iso không */
export const isBoundary = (m, iso) => lastBoundary(m, iso) === iso;

const ms = (iso) => { const t = Date.parse(iso || ''); return Number.isNaN(t) ? null : t; };

/**
 * Trạng thái đọc ở mốc hiện tại: DONE (đã có số hợp lệ trong cửa sổ), DUE (cửa sổ còn mở hoặc chưa có số nào), MISSED (quá cửa sổ).
 * reads: chỉ số của đồng hồ (máy chủ + chờ gửi trên máy). Trả {state, boundary, from, to}
 */
export function readingDue(m, reads, todayIso = today(), now = nowMs()) {
  const B = lastBoundary(m, todayIso);
  const from = boundaryMs(B), to = from + windowHours() * 3600000;
  const ok = reads.filter((r) => r.status !== 'VOID' && r.status !== 'NEEDS_REVIEW');
  if (!ok.length) return { state: 'DUE', boundary: B, from, to, first: true };
  const hit = ok.some((r) => { const t = ms(r.measured_at); return t !== null && t >= from && t < to; });
  if (hit) return { state: 'DONE', boundary: B, from, to };
  return { state: now < to ? 'DUE' : 'MISSED', boundary: B, from, to };
}

/** Chỉ số hợp lệ cuối cùng (theo lúc đọc) trước thời điểm t (ms); null nếu không có */
export function lastValidBefore(reads, t = Infinity) {
  let best = null;
  for (const r of reads) {
    if (r.status === 'VOID' || r.status === 'NEEDS_REVIEW') continue;
    const x = ms(r.measured_at);
    if (x === null || x > t) continue;
    if (!best || x > ms(best.measured_at) || (x === ms(best.measured_at) && r.reading_kind === 'SEGMENT_OPENING')) best = r;
  }
  return best;
}

/** (mới − trước) × hệ số theo phần nghìn (5.4.1: không lệch số lẻ) */
export function useOf(prev, next, mult) {
  const d = Math.round(Number(next) * 1000) - Math.round(Number(prev) * 1000);
  return Math.round((d * Math.round(Number(mult) * 1000)) / 1000) / 1000;
}

// So tính kỳ / tiêu thụ điện nước app ↔ máy chủ. Cách chạy: tools/review/README.md
import fs from 'node:fs';
import { freshServer } from '../../tests/helpers.mjs';
const ROOT = new URL('../../', import.meta.url).pathname;
const env = freshServer();
const g = env.g;
const src = fs.readFileSync(ROOT + 'js/meters.js', 'utf8');
const grab = (re) => { const m = re.exec(src); if (!m) throw new Error('no ' + re); return m[0]; };
const code = [grab(/const pad2 = [^\n]+/), grab(/const lastDayOf = [^\n]+/), grab(/export function periodOf[\s\S]*?\n}\n/).replace('export ', ''),
  grab(/export const boundaryMs = [^\n]+/).replace('export ', '')].join('\n');
const client = new Function(code + '\nreturn { periodOf, boundaryMs };')();
// data.js addDays/daysBetween bằng ngày UTC
let bad = 0, n = 0;
const add = (iso, k) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
for (let d = '2024-01-01'; d <= '2028-12-31'; d = add(d, 1)) {
  for (const t of ['DAY_1', 'DAY_5', 'DAY_10', 'MONTH']) {
    n++;
    const a = client.periodOf(t, d), b = Array.from(g.periodOf_(t, d));
    if (a.join() !== b.join()) { bad++; if (bad < 10) console.log('DIFF', t, d, a, b); }
    // kỳ chứa ngày d, kỳ trước nối liền kỳ này
    if (!(a[0] <= d && d <= a[1])) { bad++; console.log('NOT CONTAIN', t, d, a); }
    const prev = client.periodOf(t, add(a[0], -1));
    if (add(prev[1], 1) !== a[0]) { bad++; console.log('GAP', t, d, prev, a); }
  }
  if (client.boundaryMs(d) !== g.boundaryMs_(d)) { bad++; console.log('BOUNDARY', d); }
}
// useOf (app) vs segUse_ (máy chủ): phần nghìn
const useSrc = grab(/export function useOf[\s\S]*?\n}\n/).replace('export ', '');
const useOf = new Function(useSrc + '\nreturn useOf;')();
let ub = 0;
for (let i = 0; i < 20000; i++) {
  const p = Math.round(Math.random() * 1e9) / 1000, q = p + Math.round(Math.random() * 1e7) / 1000, m = [1, 40, 80, 0.5, 1.25, 200, 3.333][i % 7];
  const a = useOf(p, q, m), b = g.segUse_(p, q, m);
  if (a !== b) { ub++; if (ub < 5) console.log('USE DIFF', p, q, m, a, b); }
}
console.log('period checks', n, 'bad', bad, '| use checks 20000 bad', ub);

// Dữ liệu thử dùng chung cho test báo cáo tháng Điện nước (d4.22): đồng hồ điện MSB1 và nước NT, đọc mỗi ngày ~08:00
// từ 01/10/2026 tới hôm qua của tháng hiện tại; thiếu ngày 12/10 (điện) để có ngày "—"; logo công ty tùy chọn.
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { freshServer, ownerClient, userClient, OWNER_PIN, uuid } from '../helpers.mjs';

export function png(w = 32, h = 24, rgb = [200, 60, 40]) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(x < w / 3 ? [0, 84, 167] : rgb, y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const T = (d, hm) => `${d}T${hm}:00+07:00`;
const shift = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dayVN = (n = 0) => new Date(Date.now() + 7 * 3600000 - n * 86400000).toISOString().slice(0, 10);

/**
 * Tháng trước của hôm nay (đầy đủ), đọc mỗi ngày từ ngày 1 tháng trước tới hôm qua. Trả {env, c, month (YYYY-MM-01 tháng trước), elec, water}
 */
export function monthSetup({ logo = false } = {}) {
  const env = freshServer();
  const c = ownerClient(env);
  c.reauth = () => c.call('auth.reauth', { pin: OWNER_PIN }).data.reauth_token;
  const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
  const loc = uuid();
  ok(c.write('location.edit', { location_id: loc, location_code: 'KV-002', name_vi: 'Xưởng 1', name_zh: '1号车间', type: 'WORKSHOP' }));
  const dn = userClient(env, 'U-DN', 2, '583016', 'DOC_DIEN_NUOC');
  const t = dayVN();
  const month = shift(t.slice(0, 8) + '01', -1).slice(0, 8) + '01';
  const elec = uuid(), water = uuid();
  ok(c.write('meter.edit', { meter_id: elec, meter_code: 'MSB1', name_vi: 'Điện tổng', name_zh: '总电力', utility_type: 'ELECTRICITY', location_id: loc, multiplier: 1, reading_cycle_type: 'DAY_1' }));
  ok(c.write('meter.edit', { meter_id: water, meter_code: 'NT', name_vi: 'Nước tổng', name_zh: '总水', utility_type: 'WATER', location_id: loc, multiplier: 1, reading_cycle_type: 'DAY_1' }));
  let e = 1993818, w = 11355, i = 0;
  for (let d = month; d < t; d = shift(d, 1), i++) {
    const sun = new Date(d + 'T00:00:00Z').getUTCDay() === 0;
    if (d !== shift(month, 11)) ok(dn.write('reading.create', { reading_id: uuid(), meter_id: elec, measured_at: T(d, i % 3 ? '08:05' : '07:50'), cumulative_value: e }));
    ok(dn.write('reading.create', { reading_id: uuid(), meter_id: water, measured_at: T(d, '08:20'), cumulative_value: w }));
    e += sun ? 1800 + (i % 4) * 90 : 5900 + ((i * 37) % 11) * 110;
    w += sun ? 9 : 30 + ((i * 13) % 7);
  }
  if (logo) ok(c.write('report.logo.set', { content_b64: png(420, 120).toString('base64'), mime_type: 'image/png' }, { reauth_token: c.reauth() }));
  return { env, c, month, elec, water };
}

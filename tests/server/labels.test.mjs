// NT1-03: từ điển nhãn đủ hai thứ tiếng; mọi mã lỗi API có lời báo Việt · 中文; màn hình không viết cứng cặp chữ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServer } from '../gas-mock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('i18n/labels.json: 0 khóa thiếu một thứ tiếng; không chữ cấm theo C1; js/dict.js và LABELS của Code.gs khớp nguồn', () => {
  const labels = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'labels.json'), 'utf8'));
  delete labels._comment;
  const bad = Object.entries(labels).filter(([, v]) => !Array.isArray(v) || !String(v[0] || '').trim() || !String(v[1] || '').trim());
  assert.deepEqual(bad, []);
  assert.ok(!/mạch điện|Kho linh kiện|备件库/.test(JSON.stringify(labels)));
  assert.equal(labels['module.warehouse'][1], '物料库');
  assert.equal(labels['sync.need_network'][1], '需要网络连接');
  const env = loadServer();
  assert.deepEqual(JSON.parse(JSON.stringify(env.g.LABELS)), labels);
});

test('mọi mã lỗi API và mã con có đủ hai thứ tiếng', () => {
  const env = loadServer();
  for (const [k, v] of Object.entries(env.g.MSG)) assert.ok(v[0] && v[1], k);
  for (const [k, v] of Object.entries(env.g.SUB_MSG)) assert.ok(v[0] && v[1], k);
});

test('màn hình Đợt 1 lấy chữ từ từ điển, không viết cứng cặp Việt/Trung (trừ bàn thử PoC)', () => {
  const dir = path.join(ROOT, 'js');
  const files = ['app.js', 'shell.js', 'data.js', 'form.js', 'main.js', ...fs.readdirSync(path.join(dir, 'pages')).map((f) => 'pages/' + f)];
  const hits = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/\bbi(Text)?\(\[\s*'/.test(src)) hits.push(f);
  }
  assert.deepEqual(hits, []);
});

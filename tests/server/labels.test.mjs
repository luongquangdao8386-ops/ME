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

test('mọi khóa nhãn viết cố định trong mã app (bi/biText/badge/key) có trong từ điển', () => {
  const labels = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'labels.json'), 'utf8'));
  const dir = path.join(ROOT, 'js');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'dict.js').concat(fs.readdirSync(path.join(dir, 'pages')).map((f) => 'pages/' + f));
  const missing = new Set();
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/\b(?:bi|biText|badge)\(\s*'([a-z][a-z0-9_]*\.[A-Za-z0-9_.]+)'\s*[,)]/g)) if (!labels[m[1]]) missing.add(`${f}: ${m[1]}`);
  }
  assert.deepEqual([...missing], []);
});

test('máy chủ: mọi khóa nhãn lab_(…)/LABELS[…] viết cố định và nhãn của các giá trị liệt kê Đợt 3 có trong từ điển', () => {
  const labels = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', 'labels.json'), 'utf8'));
  const dir = path.join(ROOT, 'server', 'src');
  const missing = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/\blab_\(\s*'([a-z][a-z0-9_]*\.[A-Za-z0-9_.]+)'\s*[,)]/g)) if (!labels[m[1]]) missing.add(`${f}: ${m[1]}`);
    for (const m of src.matchAll(/\bLABELS\[\s*'([a-z][a-z0-9_]*\.[A-Za-z0-9_.]+)'\s*\]/g)) if (!labels[m[1]]) missing.add(`${f}: ${m[1]}`);
  }
  const g = loadServer().g;
  const enums = {
    utility_type: g.UTILITY_TYPES_, period: g.PERIOD_TYPES_, panel_type: g.PANEL_TYPES_, circuit_status: g.CIRCUIT_STATUS_, supply_role: g.SUPPLY_ROLES_,
    utility_status: ['OK', 'MISSING_READING', 'BASELINE', 'NEEDS_REVIEW', 'OPEN_PERIOD', 'NO_READING'], missing_side: ['OPENING', 'CLOSING', 'BOTH'],
    trace_status: ['OK', 'ROOT_NOT_SOURCE', 'CYCLE_DETECTED', 'DEPTH_LIMIT'], chart_type: g.REPORT_CHART_TYPES_,
    drawing_status: ['DRAFT', 'APPROVED', 'SUPERSEDED', 'REJECTED']
  };
  for (const [k, vals] of Object.entries(enums)) {
    assert.ok(Array.isArray(vals) && vals.length, k);
    for (const v of vals) if (!labels[k + '.' + v]) missing.add(k + '.' + v);
  }
  // Nhãn liệt kê của cột báo cáo (enumKey) phải có cho mọi mẫu tích hợp
  for (const [ds, def] of Object.entries(g.REPORT_DATASETS_)) {
    for (const c of def.columns) {
      assert.ok(c.vi && c.zh, ds + '.' + c.key);
      if (c.enumKey && !Object.keys(labels).some((k) => k.startsWith(c.enumKey + '.'))) missing.add(ds + ' enumKey ' + c.enumKey);
    }
    if (!labels['rpt_dataset.' + ds]) missing.add('rpt_dataset.' + ds);
  }
  for (const b of g.RPT_BUILTIN_) if (!labels['rpt.' + b[0]]) missing.add('rpt.' + b[0]);
  assert.deepEqual([...missing], []);
});

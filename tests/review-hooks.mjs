// Móc rà soát cho giả lập Apps Script (tests/gas-mock.mjs) — MẶC ĐỊNH TẮT, chỉ bật bằng biến môi trường khi chạy bộ test máy chủ:
//  ME_SYNC_AUDIT=<tệp.jsonl>  theo dõi quy tắc đồng bộ: dòng bảng đồng bộ thêm/sửa phải có sync_revision mới hơn và table_rev.<sheet> tăng
//                             (ghi "in:<action>" = vi phạm trong request — lỗi thật; "between:" = test tự ghi sheet / migrateSchema thêm cột trống)
//  ME_MUT=<tệp.jsonl>         trước mỗi request thật, gửi thử các bản làm hỏng từng trường (xóa, null, sai kiểu, chuỗi dài…), chụp/khôi phục
//                             toàn bộ dữ liệu giả lập quanh mỗi lượt; ghi lại mọi INTERNAL_ERROR (ngoại lệ chưa bắt) kèm stack
//  ME_MUT_COUNT=<tệp>         (tùy chọn) đếm số lượt làm hỏng
// Cách chạy: tools/review/README.md
import fs from 'node:fs';
import crypto from 'node:crypto';

const LONG = 'Ă'.repeat(3000);
const WEIRD = [undefined, null, '', 'abc', -1, 1e15, 2.5, [], {}, true, LONG, '2026-02-30', '25:61', [null], [{}], { x: 1 }, ' ', 'NaN'];
const SKIP_MUT = /^(auth|pin|session|sync|poc|system\.reset|archive|backup\.run)/;

export function reviewHooks(env, st) {
  const AUD = process.env.ME_SYNC_AUDIT, MUT = process.env.ME_MUT, CNT = process.env.ME_MUT_COUNT;
  if (!AUD && !MUT) return null;
  const { g, logs, ssApp, drive, props, cache, mail, lockState } = st;
  const file = (process.argv[1] || '').split('/').pop();

  /* ---------- theo dõi đồng bộ ---------- */
  let snapSync = null, lastAction = '(start)';
  const takeSync = () => {
    try { g.dbReset_(); } catch (e) { return null; }
    let state;
    try { state = g.readState_().map; } catch (e) { return null; }
    const s = { head: Number(state.sync_revision || 0), sheets: {} };
    for (const ent of g.SYNC_ENTITIES_) {
      let rows;
      try { if (!g.book_(g.sheetSchema_(ent.sheet).book).getSheetByName(ent.sheet)) continue; rows = g.readRows_(ent.sheet); } catch (e) { continue; }
      const key = g.sheetSchema_(ent.sheet).key;
      const m = {};
      rows.forEach((r) => { const c = { ...r }; delete c.__row; m[r[key]] = { h: JSON.stringify(c), sr: Number(r.sync_revision || 0) }; });
      s.sheets[ent.sheet] = { rev: Number(state['table_rev.' + ent.sheet] || 0), rows: m };
    }
    try { g.dbReset_(); } catch (e) { /* */ }
    return s;
  };
  const diffCols = (h1, h2) => { const a = JSON.parse(h1), b = JSON.parse(h2); return Object.keys(b).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).join(','); };
  const diffSync = (a, b, where) => {
    if (!a || !b) return;
    for (const [sheet, nb] of Object.entries(b.sheets)) {
      const na = a.sheets[sheet];
      if (!na) continue;
      const changed = [];
      for (const [k, r] of Object.entries(nb.rows)) {
        const o = na.rows[k];
        if (!o) { changed.push(r.sr > a.head ? ['new', k] : ['NEW_ROW_OLD_SR', k]); continue; }
        if (o.h !== r.h) changed.push(r.sr > o.sr ? ['chg', k] : ['CHANGED_SAME_SR', k, diffCols(o.h, r.h)]);
      }
      const bad = changed.filter((c) => c[0] === 'NEW_ROW_OLD_SR' || c[0] === 'CHANGED_SAME_SR');
      const tableBad = changed.length && !(nb.rev > na.rev);
      if (bad.length || tableBad) fs.appendFileSync(AUD, JSON.stringify({ file, where, sheet, tableBad, bad: bad.slice(0, 3), n: changed.length }) + '\n');
    }
  };

  /* ---------- làm hỏng từng trường ---------- */
  const snap = () => {
    const books = new Map();
    for (const [id, b] of ssApp._books) books.set(id, { b, sheets: b._sheets.map((sh) => ({ sh, rows: sh._rows.map((r) => (r ? r.slice() : r)), mr: sh._maxRows, mc: sh._maxCols, fmt: JSON.stringify(sh._fmt || {}), name: sh._name })) });
    return {
      books, files: new Map([...drive._files].map(([k, v]) => [k, { ...v }])), folders: new Map([...drive._folders].map(([k, v]) => [k, { ...v }])),
      props: new Map(props._store._map), cache: new Map(cache._cache._map), mail: mail.sent.length
    };
  };
  const restore = (x) => {
    for (const id of [...ssApp._books.keys()]) if (!x.books.has(id)) ssApp._books.delete(id);
    for (const [id, s0] of x.books) {
      ssApp._books.set(id, s0.b);
      s0.b._sheets = s0.sheets.map((o) => { o.sh._rows = o.rows.map((r) => (r ? r.slice() : r)); o.sh._maxRows = o.mr; o.sh._maxCols = o.mc; o.sh._fmt = JSON.parse(o.fmt); o.sh._name = o.name; return o.sh; });
    }
    drive._files.clear(); x.files.forEach((v, k) => drive._files.set(k, { ...v }));
    drive._folders.clear(); x.folders.forEach((v, k) => drive._folders.set(k, { ...v }));
    props._store._map.clear(); x.props.forEach((v, k) => props._store._map.set(k, v));
    cache._cache._map.clear(); x.cache.forEach((v, k) => cache._cache._map.set(k, v));
    mail.sent.length = x.mail;
    lockState.busy = false; lockState.held = 0;
    try { g.dbReset_(); } catch (e) { /* */ }
  };
  const pick = () => WEIRD[Math.floor(Math.random() * WEIRD.length)];
  const mutate = (req) => {
    const p = req.payload;
    if (!p || typeof p !== 'object' || Array.isArray(p) || SKIP_MUT.test(req.action || '')) return;
    const keys = Object.keys(p);
    if (!keys.length) return;
    const tries = [];
    keys.forEach((k) => { tries.push([k, pick()]); tries.push([k, pick()]); });
    keys.filter((k) => Array.isArray(p[k]) && p[k].length && typeof p[k][0] === 'object' && p[k][0]).forEach((k) => {
      Object.keys(p[k][0]).forEach((sub) => { const arr = p[k].map((x) => ({ ...x })); arr[0][sub] = pick(); tries.push([k, arr]); });
    });
    const S0 = snap();
    for (const [k, v] of tries.slice(0, 40)) {
      if (CNT) fs.appendFileSync(CNT, req.action + '\n');
      const p2 = { ...p };
      if (v === undefined) delete p2[k]; else p2[k] = v;
      const r2 = { ...req, payload: p2, operation_id: req.operation_id ? crypto.randomUUID() : undefined };
      const before = logs.length;
      let res;
      try { res = JSON.parse(g.doPost({ postData: { contents: JSON.stringify(r2) } }).getContent()); } catch (e) { res = { code: 'THROW', e: String((e && e.stack) || e) }; }
      restore(S0);
      if (res.code === 'INTERNAL_ERROR' || res.code === 'THROW') {
        const log = logs.slice(before).find((l) => /INTERNAL_ERROR/.test(l)) || res.e || '';
        fs.appendFileSync(MUT, JSON.stringify({ file, action: req.action, field: k, value: JSON.stringify(v === undefined ? '<deleted>' : v).slice(0, 120), err: String(log).slice(0, 900) }) + '\n');
      }
    }
  };

  return {
    before(req) {
      if (!req || typeof req !== 'object') return;
      if (MUT) mutate(req);
      if (AUD) { const now = takeSync(); diffSync(snapSync, now, 'between:' + lastAction + '->' + req.action); snapSync = now; }
    },
    after(req) {
      if (!AUD || !req || typeof req !== 'object') return;
      const now = takeSync(); lastAction = req.action; diffSync(snapSync, now, 'in:' + lastAction); snapSync = now;
    }
  };
}

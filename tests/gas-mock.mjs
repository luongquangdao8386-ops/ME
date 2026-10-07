// Giả lập các dịch vụ Google Apps Script đủ để chạy apps-script/Code.gs trên Node (chỉ dùng cho test).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const toSigned = (b) => (b > 127 ? b - 256 : b);
const toSignedArr = (buf) => Array.from(buf, toSigned);
const toBuf = (v) => {
  if (typeof v === 'string') return Buffer.from(v, 'utf8');
  if (Buffer.isBuffer(v)) return v;
  if (Array.isArray(v)) return Buffer.from(v.map((b) => b & 0xff));
  throw new Error('bytes expected');
};

/** Đồng hồ giả: offset cộng thêm vào giờ thật */
export function makeClock() {
  const RealDate = Date;
  const clock = { offset: 0 };
  class FakeDate extends RealDate {
    constructor(...a) {
      if (a.length === 0) super(RealDate.now() + clock.offset);
      else super(...a);
    }
    static now() { return RealDate.now() + clock.offset; }
  }
  clock.Date = FakeDate;
  clock.advance = (ms) => { clock.offset += ms; };
  return clock;
}

/* ---------------- Utilities ---------------- */
class MockBlob {
  constructor(data, contentType, name) {
    this._bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : toBuf(data);
    this._type = contentType || 'application/octet-stream';
    this._name = name || '';
  }
  getBytes() { return toSignedArr(this._bytes); }
  getDataAsString() { return this._bytes.toString('utf8'); }
  getContentType() { return this._type; }
  getName() { return this._name; }
  setName(n) { this._name = n; return this; }
  copyBlob() { return new MockBlob(Buffer.from(this._bytes), this._type, this._name); }
}

function makeUtilities(clock) {
  return {
    DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5', SHA_1: 'sha1' },
    Charset: { UTF_8: 'UTF_8' },
    getUuid: () => crypto.randomUUID(),
    computeDigest: (alg, value) => toSignedArr(crypto.createHash(alg).update(toBuf(value)).digest()),
    computeHmacSha256Signature: (value, key) => toSignedArr(crypto.createHmac('sha256', toBuf(key)).update(toBuf(value)).digest()),
    base64Encode: (v) => toBuf(v).toString('base64'),
    base64Decode: (s) => toSignedArr(Buffer.from(String(s), 'base64')),
    base64EncodeWebSafe: (v) => toBuf(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: (s) => toSignedArr(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    newBlob: (data, type, name) => new MockBlob(data, type, name),
    sleep: (ms) => { clock.advance(ms); },
    formatDate: () => { throw new Error('formatDate not mocked'); }
  };
}

/* ---------------- Properties, Cache, Lock ---------------- */
function makeProperties() {
  const map = new Map();
  const store = {
    getProperty: (k) => (map.has(k) ? map.get(k) : null),
    setProperty: (k, v) => { map.set(k, String(v)); return store; },
    deleteProperty: (k) => { map.delete(k); return store; },
    getProperties: () => Object.fromEntries(map),
    setProperties: (o) => { Object.entries(o).forEach(([k, v]) => map.set(k, String(v))); return store; },
    _map: map
  };
  return { getScriptProperties: () => store, _store: store };
}

function makeCache(clock) {
  const map = new Map();
  const now = () => clock.Date.now();
  const get = (k) => {
    const e = map.get(k);
    if (!e) return null;
    if (e.exp <= now()) { map.delete(k); return null; }
    return e.v;
  };
  const cache = {
    get,
    getAll: (keys) => { const o = {}; keys.forEach((k) => { const v = get(k); if (v !== null) o[k] = v; }); return o; },
    put: (k, v, ttl = 600) => {
      if (typeof v !== 'string') throw new Error('cache value must be string');
      if (v.length > 100 * 1024) throw new Error('cache value too large');
      map.set(k, { v, exp: now() + Math.min(21600, ttl) * 1000 });
    },
    putAll: (o, ttl) => Object.entries(o).forEach(([k, v]) => cache.put(k, v, ttl)),
    remove: (k) => { map.delete(k); },
    removeAll: (keys) => keys.forEach((k) => map.delete(k)),
    _map: map
  };
  return { getScriptCache: () => cache, _cache: cache };
}

function makeLock(state) {
  return {
    getScriptLock: () => ({
      tryLock: () => { if (state.busy) return false; state.held++; return true; },
      waitLock: () => { state.held++; },
      releaseLock: () => { state.held = Math.max(0, state.held - 1); },
      hasLock: () => state.held > 0
    })
  };
}

/* ---------------- SpreadsheetApp ---------------- */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?)?$/;

class MockRange {
  constructor(sheet, r, c, nr, nc) {
    if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error(`Range invalid ${r},${c},${nr},${nc}`);
    if (r + nr - 1 > sheet._maxRows || c + nc - 1 > sheet._maxCols) {
      throw new Error(`The coordinates of the range are outside the dimensions of the sheet (${sheet._name} ${r},${c},${nr},${nc} max ${sheet._maxRows}x${sheet._maxCols})`);
    }
    Object.assign(this, { sheet, r, c, nr, nc });
  }
  getRow() { return this.r; }
  getColumn() { return this.c; }
  getNumRows() { return this.nr; }
  getValues() {
    this.sheet._ss._app._stats.reads++;
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(this.sheet._get(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(v) {
    this.sheet._ss._app._stats.writes++;
    if (v.length !== this.nr || v.some((row) => row.length !== this.nc)) throw new Error('setValues dimension mismatch');
    v.forEach((row, i) => row.forEach((val, j) => this.sheet._set(this.r + i, this.c + j, val)));
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setNumberFormat(f) { for (let j = 0; j < this.nc; j++) this.sheet._setFormat(this.c + j, this.r, this.r + this.nr - 1, f); return this; }
  setNumberFormats(fmts) {
    if (fmts.length !== this.nr) throw new Error('setNumberFormats dimension mismatch');
    for (let j = 0; j < this.nc; j++) this.sheet._setFormat(this.c + j, this.r, this.r + this.nr - 1, fmts[0][j]);
    return this;
  }
  setFontWeight() { return this; }
  createTextFinder(text) {
    const range = this;
    const f = {
      _entire: false, _case: false,
      matchEntireCell(b) { this._entire = b; return this; },
      matchCase(b) { this._case = b; return this; },
      findAll() {
        const res = [];
        for (let i = 0; i < range.nr; i++) for (let j = 0; j < range.nc; j++) {
          const v = range.sheet._get(range.r + i, range.c + j);
          const s = typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : (v instanceof Date ? v.toISOString() : String(v));
          const a = this._case ? s : s.toLowerCase(), b = this._case ? String(text) : String(text).toLowerCase();
          if (this._entire ? a === b : a.includes(b)) res.push(new MockRange(range.sheet, range.r + i, range.c + j, 1, 1));
        }
        return res;
      },
      findNext() { return this.findAll()[0] || null; }
    };
    return f;
  }
}

class MockSheet {
  constructor(ss, name) {
    this._ss = ss; this._name = name; this._rows = []; this._maxRows = 1000; this._maxCols = 26; this._fmt = {};
  }
  getName() { return this._name; }
  getParent() { return this._ss; }
  getMaxRows() { return this._maxRows; }
  getMaxColumns() { return this._maxCols; }
  getLastRow() {
    for (let i = this._rows.length - 1; i >= 0; i--) if (this._rows[i] && this._rows[i].some((v) => v !== '' && v !== null && v !== undefined)) return i + 1;
    return 0;
  }
  getLastColumn() {
    let m = 0;
    this._rows.forEach((r) => { if (!r) return; for (let j = r.length - 1; j >= 0; j--) if (r[j] !== '' && r[j] !== undefined) { m = Math.max(m, j + 1); break; } });
    return m;
  }
  getRange(r, c, nr = 1, nc = 1) {
    if (typeof r === 'string') throw new Error('A1 notation not mocked');
    return new MockRange(this, r, c, nr, nc);
  }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  insertRowsAfter(after, n) {
    this._maxRows += n;
    this._rows.splice(after, 0, ...Array.from({ length: n }, () => null));
    return this;
  }
  insertColumnsAfter(after, n) { this._maxCols += n; return this; }
  deleteRows(start, n) { this._rows.splice(start - 1, n); this._maxRows -= n; return this; }
  deleteRow(r) { return this.deleteRows(r, 1); }
  setFrozenRows() { return this; }
  _fmtAt(r, c) {
    const segs = this._fmt[c] || [];
    for (let k = segs.length - 1; k >= 0; k--) if (r >= segs[k][0] && r <= segs[k][1]) return segs[k][2];
    return 'General';
  }
  _setFormat(c, r1, r2, f) { (this._fmt[c] = this._fmt[c] || []).push([r1, r2, f]); }
  _get(r, c) {
    const row = this._rows[r - 1];
    const v = row ? row[c - 1] : undefined;
    return v === undefined || v === null ? '' : v;
  }
  _set(r, c, val) {
    if (val === undefined || val === null) val = '';
    if (typeof val === 'object' && !(val instanceof Date)) throw new Error('Cannot store object in cell');
    // Mô phỏng Sheets tự đổi kiểu khi ô định dạng General
    if (typeof val === 'string' && this._fmtAt(r, c) !== '@') {
      if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);
      else if (val === 'TRUE' || val === 'FALSE') val = val === 'TRUE';
      else if (ISO_DATE_RE.test(val)) val = new Date(val.length === 10 ? val + 'T00:00:00+07:00' : val);
      else if (val.startsWith('=')) throw new Error('Formula injection in mock: ' + val);
    }
    if (typeof val === 'string' && val.length > 50000) throw new Error('Cell over 50000 chars');
    while (this._rows.length < r) this._rows.push(null);
    if (!this._rows[r - 1]) this._rows[r - 1] = [];
    const row = this._rows[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = val;
  }
}

class MockSpreadsheet {
  constructor(app, name) {
    this._app = app; this._id = 'ss_' + crypto.randomBytes(8).toString('hex'); this._name = name;
    this._sheets = [new MockSheet(this, 'Sheet1')];
  }
  getId() { return this._id; }
  getName() { return this._name; }
  getSheetByName(n) { return this._sheets.find((s) => s._name === n) || null; }
  getSheets() { return this._sheets.slice(); }
  insertSheet(n) {
    if (this.getSheetByName(n)) throw new Error('Sheet exists ' + n);
    const s = new MockSheet(this, n); this._sheets.push(s); return s;
  }
  deleteSheet(s) { this._sheets = this._sheets.filter((x) => x !== s); }
  setSpreadsheetTimeZone(tz) { this._tz = tz; }
  getSpreadsheetTimeZone() { return this._tz; }
}

function makeSpreadsheetApp(drive) {
  const app = { _books: new Map(), _stats: { reads: 0, writes: 0, flushes: 0 } };
  app.create = (name) => {
    const ss = new MockSpreadsheet(app, name);
    app._books.set(ss.getId(), ss);
    drive._registerExternal(ss.getId(), name, 'application/vnd.google-apps.spreadsheet');
    return ss;
  };
  app.openById = (id) => { const b = app._books.get(id); if (!b) throw new Error('No spreadsheet ' + id); return b; };
  app.flush = () => { app._stats.flushes++; };
  return app;
}

/* ---------------- DriveApp ---------------- */
function makeDrive() {
  const files = new Map(), folders = new Map();
  const Access = { ANYONE: 'ANYONE', ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', DOMAIN: 'DOMAIN', DOMAIN_WITH_LINK: 'DOMAIN_WITH_LINK', PRIVATE: 'PRIVATE' };
  const Permission = { VIEW: 'VIEW', EDIT: 'EDIT', COMMENT: 'COMMENT', OWNER: 'OWNER', ORGANIZER: 'ORGANIZER', NONE: 'NONE' };
  const mkFile = (rec) => ({
    getId: () => rec.id, getName: () => rec.name, getSize: () => rec.bytes.length, getMimeType: () => rec.mime,
    getBlob: () => new MockBlob(rec.bytes, rec.mime, rec.name),
    setSharing: (a, p) => { if (drive._failSharing) throw new Error('sharing failed'); rec.access = a; rec.permission = p; },
    getSharingAccess: () => rec.access, getSharingPermission: () => rec.permission,
    setTrashed: (t) => { rec.trashed = !!t; }, isTrashed: () => rec.trashed,
    makeCopy: (name, folder) => {
      const id = 'f_' + crypto.randomBytes(8).toString('hex');
      const c = { ...rec, id, name, access: 'PRIVATE', permission: 'EDIT', trashed: false, parent: folder ? folder.getId() : rec.parent };
      files.set(id, c); return mkFile(c);
    },
    moveTo: (folder) => { rec.parent = folder.getId(); return mkFile(rec); }
  });
  const mkFolder = (rec) => ({
    getId: () => rec.id, getName: () => rec.name,
    createFolder: (name) => newFolder(name, rec.id),
    createFile: (blob) => {
      const id = 'f_' + crypto.randomBytes(8).toString('hex');
      const r = { id, name: blob.getName(), bytes: Buffer.from(blob._bytes), mime: blob.getContentType(), access: 'PRIVATE', permission: 'EDIT', trashed: false, parent: rec.id };
      files.set(id, r); return mkFile(r);
    },
    getFiles: () => { const list = [...files.values()].filter((f) => f.parent === rec.id && !f.trashed); let i = 0; return { hasNext: () => i < list.length, next: () => mkFile(list[i++]) }; }
  });
  const newFolder = (name, parent) => {
    const id = 'd_' + crypto.randomBytes(8).toString('hex');
    const r = { id, name, parent }; folders.set(id, r); return mkFolder(r);
  };
  const drive = {
    Access, Permission,
    createFolder: (name) => newFolder(name, null),
    getFolderById: (id) => { const r = folders.get(id); if (!r) throw new Error('No folder ' + id); return mkFolder(r); },
    getFileById: (id) => { const r = files.get(id); if (!r) throw new Error('No file ' + id); return mkFile(r); },
    _registerExternal: (id, name, mime) => files.set(id, { id, name, bytes: Buffer.alloc(0), mime, access: 'PRIVATE', permission: 'EDIT', trashed: false, parent: null }),
    _files: files, _folders: folders, _failSharing: false
  };
  return drive;
}

/* ---------------- Others ---------------- */
function makeScriptApp() {
  const triggers = [];
  const WeekDay = { MONDAY: 'MONDAY', TUESDAY: 'TUESDAY', WEDNESDAY: 'WEDNESDAY', THURSDAY: 'THURSDAY', FRIDAY: 'FRIDAY', SATURDAY: 'SATURDAY', SUNDAY: 'SUNDAY' };
  const app = {
    WeekDay, EventType: { CLOCK: 'CLOCK' },
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: (t) => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
    newTrigger: (fn) => {
      const spec = { fn };
      const b = {
        timeBased: () => b, everyDays: (n) => { spec.everyDays = n; return b; }, everyHours: (n) => { spec.everyHours = n; return b; },
        atHour: (h) => { spec.atHour = h; return b; }, onWeekDay: (d) => { spec.weekDay = d; return b; },
        inTimezone: (tz) => { spec.tz = tz; return b; }, after: (ms) => { spec.after = ms; return b; },
        create: () => { const t = { spec, getHandlerFunction: () => fn, getEventType: () => 'CLOCK', getUniqueId: () => String(triggers.length) }; triggers.push(t); return t; }
      };
      return b;
    },
    _triggers: triggers
  };
  return app;
}

/**
 * Tạo môi trường và nạp Code.gs. Trả {g: context, clock, drive, ss, mail, logs, post(req)}.
 */
export function loadServer(opts = {}) {
  const clock = makeClock();
  const drive = makeDrive();
  const ssApp = makeSpreadsheetApp(drive);
  const props = makeProperties();
  const cache = makeCache(clock);
  const lockState = { busy: false, held: 0 };
  const mail = { sent: [], quota: 100 };
  const logs = [];
  const mt = { fail: false, calls: 0 };
  const g = {
    Date: clock.Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, TypeError, isNaN, parseInt, parseFloat,
    Utilities: makeUtilities(clock),
    PropertiesService: props,
    CacheService: cache,
    LockService: makeLock(lockState),
    SpreadsheetApp: ssApp,
    DriveApp: drive,
    ContentService: {
      MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
      createTextOutput: (s) => ({ _c: s, setMimeType() { return this; }, getContent() { return this._c; } })
    },
    MailApp: {
      sendEmail: (o) => { if (mail.quota <= mail.sent.length) throw new Error('quota'); mail.sent.push(o); },
      getRemainingDailyQuota: () => mail.quota - mail.sent.length
    },
    LanguageApp: {
      translate: (text, from, to) => {
        mt.calls++;
        if (mt.fail) throw new Error('Service invoked too many times for one day: translate');
        return `[${to}] ${text}`;
      }
    },
    ScriptApp: makeScriptApp(),
    Session: { getEffectiveUser: () => ({ getEmail: () => 'me-owner@example.test' }), getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    Logger: { log: (m) => logs.push(String(m)) },
    console: { log: (m) => logs.push(String(m)), error: (m) => logs.push('ERR ' + String(m)), warn: (m) => logs.push('WARN ' + String(m)) }
  };
  vm.createContext(g);
  const code = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
  vm.runInContext(code, g, { filename: 'Code.gs' });
  const env = {
    g, clock, drive, ssApp, props: props._store, cache: cache._cache, lockState, mail, logs, mt,
    /** Gửi request như client: doPost → JSON */
    post(req) {
      const out = g.doPost({ postData: { contents: typeof req === 'string' ? req : JSON.stringify(req) } });
      return JSON.parse(out.getContent());
    },
    get(params) { return JSON.parse(g.doGet({ parameter: params }).getContent()); },
    /** Đọc bảng dưới dạng object (bỏ qua bộ nhớ đệm của Code.gs) */
    rows(name) { g.dbReset_(); return JSON.parse(JSON.stringify(g.readRows_(name))); }
  };
  return env;
}

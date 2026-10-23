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
  getDataAsString() { return this._bytes.toString('utf8'); }  // Apps Script nhận tham số bảng mã; giả lập luôn UTF-8
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
  clearContent() {
    this.sheet._ss._app._stats.writes++;
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet._set(this.r + i, this.c + j, '');
    return this;
  }
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
  /** Bản sao sâu (Drive makeCopy của file spreadsheet) */
  _clone(id, name) {
    const c = new MockSpreadsheet(this._app, name);
    c._id = id; c._tz = this._tz;
    c._sheets = this._sheets.map((sh) => {
      const n = new MockSheet(c, sh._name);
      n._rows = sh._rows.map((r) => (r ? r.slice() : r));
      n._maxRows = sh._maxRows; n._maxCols = sh._maxCols;
      n._fmt = JSON.parse(JSON.stringify(sh._fmt));
      return n;
    });
    return c;
  }
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
  drive._copyBook = (srcId, newId, name) => { const b = app._books.get(srcId); if (b) app._books.set(newId, b._clone(newId, name)); };
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
    getAs: (mime) => {
      const d = drive._docs.get(rec.id);
      if (!d) throw new Error('getAs: not a document');
      if (!d.saved) throw new Error('getAs before saveAndClose');
      const text = d.text();
      return new MockBlob(Buffer.from('%PDF-1.4\n' + text, 'utf8'), mime, rec.name + '.pdf');
    },
    setSharing: (a, p) => { if (drive._failSharing) throw new Error('sharing failed'); rec.access = a; rec.permission = p; },
    getSharingAccess: () => rec.access, getSharingPermission: () => rec.permission,
    setTrashed: (t) => { rec.trashed = !!t; }, isTrashed: () => rec.trashed,
    makeCopy: (name, folder) => {
      const id = 'f_' + crypto.randomBytes(8).toString('hex');
      const c = { ...rec, id, name, access: 'PRIVATE', permission: 'EDIT', trashed: false, parent: folder ? folder.getId() : rec.parent };
      files.set(id, c);
      if (drive._copyBook) drive._copyBook(rec.id, id, name);
      if (drive._afterCopy) drive._afterCopy(rec.id, id);
      return mkFile(c);
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
    getFiles: () => { const list = [...files.values()].filter((f) => f.parent === rec.id && !f.trashed); let i = 0; return { hasNext: () => i < list.length, next: () => mkFile(list[i++]) }; },
    getFolders: () => { const list = [...folders.values()].filter((f) => f.parent === rec.id && !f.trashed); let i = 0; return { hasNext: () => i < list.length, next: () => mkFolder(list[i++]) }; },
    getFilesByName: (n) => { const list = [...files.values()].filter((f) => f.parent === rec.id && !f.trashed && f.name === n); let i = 0; return { hasNext: () => i < list.length, next: () => mkFile(list[i++]) }; },
    setTrashed: (t) => { rec.trashed = !!t; }, isTrashed: () => !!rec.trashed
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
    _files: files, _folders: folders, _failSharing: false, _docs: new Map()
  };
  return drive;
}

/* ---------------- DocumentApp (PDF báo cáo, Đợt 3; chặt từ d4.11) ----------------
 * Chỉ có các phương thức có trong tài liệu Apps Script (không Proxy "gọi gì cũng được"): mã máy chủ gọi sai tên phương thức
 * hay truyền sai kiểu → test hỏng ngay, thay vì chỉ lộ ra khi người dùng xuất PDF thật. Kiểm thêm: cỡ chữ số nguyên dương,
 * màu dạng #RRGGBB, độ rộng cột trong phạm vi, ô bảng hình chữ nhật. drive._docs giữ mô hình tài liệu để test xem bố cục. */
function makeDocumentApp(drive) {
  const docs = new Map();
  const enumOf = (...ks) => Object.freeze(Object.fromEntries(ks.map((k) => [k, k])));
  const Attribute = enumOf('BACKGROUND_COLOR', 'BOLD', 'BORDER_COLOR', 'BORDER_WIDTH', 'CODE', 'FONT_FAMILY', 'FONT_SIZE', 'FOREGROUND_COLOR',
    'HEADING', 'HEIGHT', 'HORIZONTAL_ALIGNMENT', 'INDENT_END', 'INDENT_FIRST_LINE', 'INDENT_START', 'ITALIC', 'GLYPH_TYPE', 'LEFT_TO_RIGHT',
    'LINE_SPACING', 'LINK_URL', 'LIST_ID', 'MARGIN_BOTTOM', 'MARGIN_LEFT', 'MARGIN_RIGHT', 'MARGIN_TOP', 'NESTING_LEVEL', 'MINIMUM_HEIGHT',
    'PADDING_BOTTOM', 'PADDING_LEFT', 'PADDING_RIGHT', 'PADDING_TOP', 'PAGE_HEIGHT', 'PAGE_WIDTH', 'SPACING_AFTER', 'SPACING_BEFORE',
    'STRIKETHROUGH', 'UNDERLINE', 'VERTICAL_ALIGNMENT', 'WIDTH');
  const HorizontalAlignment = enumOf('LEFT', 'CENTER', 'RIGHT', 'JUSTIFY');
  const VerticalAlignment = enumOf('BOTTOM', 'CENTER', 'TOP');
  const ParagraphHeading = enumOf('NORMAL', 'HEADING1', 'HEADING2', 'HEADING3', 'HEADING4', 'HEADING5', 'HEADING6', 'TITLE', 'SUBTITLE');
  const ElementType = enumOf('BODY_SECTION', 'HEADER_SECTION', 'FOOTER_SECTION', 'PARAGRAPH', 'TABLE', 'TABLE_ROW', 'TABLE_CELL', 'TEXT', 'INLINE_IMAGE', 'HORIZONTAL_RULE');
  const fail = (m) => { throw new Error('DocumentApp (giả lập): ' + m); };
  const num = (v, what, { int = false, min = 0 } = {}) => {
    if (typeof v !== 'number' || !isFinite(v) || v < min || (int && !Number.isInteger(v))) fail(what + ' không hợp lệ: ' + v);
    return v;
  };
  const color = (c) => { if (typeof c !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(c)) fail('màu không hợp lệ: ' + c); return c; };
  const oneOf = (e, v, what) => { if (!Object.values(e).includes(v)) fail(what + ' không hợp lệ: ' + v); return v; };
  const attrs = (el, o) => {
    if (!o || typeof o !== 'object') fail('setAttributes cần object');
    Object.keys(o).forEach((k) => { if (!(k in Attribute)) fail('thuộc tính lạ ' + k); });
    Object.assign(el.st, o); return el;
  };
  // Chữ của một phần tử (đoạn, ô, hàng, bảng, phần): định dạng ghi vào phần tử
  function makeText(owner) {
    const t = {
      getType: () => ElementType.TEXT,
      getText: () => owner.getText(),
      setFontSize: (...a) => { owner.st.FONT_SIZE = num(a.length === 3 ? a[2] : a[0], 'cỡ chữ', { int: true, min: 1 }); return t; },
      setBold: (...a) => { const v = a.length === 3 ? a[2] : a[0]; if (typeof v !== 'boolean') fail('setBold cần boolean'); owner.st.BOLD = v; return t; },
      setItalic: (...a) => { const v = a.length === 3 ? a[2] : a[0]; if (typeof v !== 'boolean') fail('setItalic cần boolean'); owner.st.ITALIC = v; return t; },
      setForegroundColor: (...a) => { owner.st.FOREGROUND_COLOR = color(a.length === 3 ? a[2] : a[0]); return t; },
      setBackgroundColor: (...a) => { owner.st.TEXT_BG = color(a.length === 3 ? a[2] : a[0]); return t; },
      setAttributes: (o) => { attrs(owner, o); return t; }
    };
    return t;
  }
  function makeImage(blob) {
    if (!blob || typeof blob.getBytes !== 'function') fail('appendInlineImage cần Blob');
    const b = Buffer.from(blob.getBytes());
    let w = 100, h = 100;
    if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) { w = b.readUInt32BE(16); h = b.readUInt32BE(20); }
    const img = {
      kind: 'image', st: {}, w, h,
      getType: () => ElementType.INLINE_IMAGE,
      getWidth: () => img.w, getHeight: () => img.h,
      setWidth: (v) => { img.w = num(v, 'rộng ảnh', { min: 1 }); return img; },
      setHeight: (v) => { img.h = num(v, 'cao ảnh', { min: 1 }); return img; },
      setAttributes: (o) => attrs(img, o)
    };
    return img;
  }
  function makePara(text) {
    if (typeof text !== 'string') fail('appendParagraph cần chuỗi');
    const p = {
      kind: 'p', text, images: [], st: {},
      getType: () => ElementType.PARAGRAPH, asParagraph: () => p,
      getText: () => p.text,
      setText: (t) => { if (typeof t !== 'string') fail('setText cần chuỗi'); p.text = t; return p; },
      appendText: (t) => { p.text += String(t); return makeText(p); },
      appendInlineImage: (blob) => { const im = makeImage(blob); p.images.push(im); return im; },
      editAsText: () => makeText(p),
      setAlignment: (v) => { p.st.HORIZONTAL_ALIGNMENT = oneOf(HorizontalAlignment, v, 'căn lề'); return p; },
      getAlignment: () => p.st.HORIZONTAL_ALIGNMENT || null,
      setHeading: (v) => { p.st.HEADING = oneOf(ParagraphHeading, v, 'heading'); return p; },
      setSpacingBefore: (v) => { p.st.SPACING_BEFORE = num(v, 'spacing'); return p; },
      setSpacingAfter: (v) => { p.st.SPACING_AFTER = num(v, 'spacing'); return p; },
      setLineSpacing: (v) => { p.st.LINE_SPACING = num(v, 'line spacing', { min: 0.5 }); return p; },
      setIndentStart: (v) => { p.st.INDENT_START = num(v, 'indent'); return p; },
      setIndentEnd: (v) => { p.st.INDENT_END = num(v, 'indent'); return p; },
      setIndentFirstLine: (v) => { p.st.INDENT_FIRST_LINE = num(v, 'indent'); return p; },
      setAttributes: (o) => attrs(p, o), getAttributes: () => ({ ...p.st })
    };
    return p;
  }
  function makeTable(cells) {
    if (!Array.isArray(cells) || !cells.length || !cells.every(Array.isArray)) fail('appendTable cần mảng hai chiều');
    const n = cells[0].length;
    if (!n || cells.some((r) => r.length !== n)) fail('appendTable: các hàng phải cùng số ô');
    cells.forEach((r) => r.forEach((c) => { if (typeof c !== 'string') fail('ô bảng phải là chuỗi'); }));
    const t = { kind: 'table', st: {}, colWidths: new Array(n).fill(null) };
    t.rows = cells.map((r) => makeRow(t, r));
    const rowAt = (i) => { if (!Number.isInteger(i) || i < 0 || i >= t.rows.length) fail('getRow ngoài phạm vi ' + i); return t.rows[i]; };
    Object.assign(t, {
      getType: () => ElementType.TABLE, asTable: () => t,
      getRow: rowAt, getNumRows: () => t.rows.length,
      getCell: (r, c) => rowAt(r).getCell(c),
      getText: () => t.rows.map((r) => r.getText()).join('\n'),
      editAsText: () => makeText(t),
      setBorderWidth: (v) => { t.st.BORDER_WIDTH = num(v, 'viền'); return t; },
      setBorderColor: (v) => { t.st.BORDER_COLOR = color(v); return t; },
      setColumnWidth: (i, w) => { if (!Number.isInteger(i) || i < 0 || i >= n) fail('setColumnWidth cột ngoài phạm vi ' + i); t.colWidths[i] = num(w, 'rộng cột', { min: 1 }); return t; },
      getColumnWidth: (i) => t.colWidths[i],
      setAttributes: (o) => attrs(t, o)
    });
    return t;
  }
  function makeRow(table, texts) {
    const r = { kind: 'row', st: {} };
    r.cells = texts.map((x) => makeCell(r, x));
    Object.assign(r, {
      getType: () => ElementType.TABLE_ROW,
      getCell: (i) => { if (!Number.isInteger(i) || i < 0 || i >= r.cells.length) fail('getCell ngoài phạm vi ' + i); return r.cells[i]; },
      getNumCells: () => r.cells.length,
      getText: () => r.cells.map((c) => c.getText()).join(' | '),
      editAsText: () => makeText(r),
      setMinimumHeight: (v) => { r.st.MINIMUM_HEIGHT = num(v, 'cao hàng'); return r; },
      setAttributes: (o) => attrs(r, o)
    });
    return r;
  }
  function makeCell(row, text) {
    const c = { kind: 'cell', st: {}, children: [makePara(text)] };
    Object.assign(c, container(c), {
      getType: () => ElementType.TABLE_CELL, asTableCell: () => c,
      getText: () => c.children.map((x) => x.getText()).join('\n'),
      setText: (t) => { c.children = [makePara(String(t))]; return c; },
      setBackgroundColor: (v) => { c.st.BACKGROUND_COLOR = color(v); return c; },
      setPaddingTop: (v) => { c.st.PADDING_TOP = num(v, 'padding'); return c; },
      setPaddingBottom: (v) => { c.st.PADDING_BOTTOM = num(v, 'padding'); return c; },
      setPaddingLeft: (v) => { c.st.PADDING_LEFT = num(v, 'padding'); return c; },
      setPaddingRight: (v) => { c.st.PADDING_RIGHT = num(v, 'padding'); return c; },
      setVerticalAlignment: (v) => { c.st.VERTICAL_ALIGNMENT = oneOf(VerticalAlignment, v, 'căn dọc'); return c; },
      setWidth: (v) => { c.st.WIDTH = num(v, 'rộng ô', { min: 1 }); return c; },
      editAsText: () => makeText(c),
      setAttributes: (o) => attrs(c, o)
    });
    return c;
  }
  // Phần chung của khung chứa (thân, đầu/chân trang, ô bảng)
  function container(o) {
    return {
      appendParagraph: (t) => { const p = makePara(typeof t === 'string' ? t : fail('appendParagraph cần chuỗi')); o.children.push(p); return p; },
      appendTable: (cells) => { const t = makeTable(cells); o.children.push(t); return t; },
      getChild: (i) => { if (!Number.isInteger(i) || i < 0 || i >= o.children.length) fail('getChild ngoài phạm vi ' + i); return o.children[i]; },
      getNumChildren: () => o.children.length
    };
  }
  function makeSection(kind) {
    const s = { kind, st: {}, children: [makePara('')] };
    Object.assign(s, container(s), {
      getType: () => (kind === 'body' ? ElementType.BODY_SECTION : kind === 'header' ? ElementType.HEADER_SECTION : ElementType.FOOTER_SECTION),
      getParagraphs: () => s.children.filter((x) => x.kind === 'p'),
      getText: () => s.children.map((x) => x.getText()).join('\n'),
      editAsText: () => makeText(s),
      setAttributes: (o) => attrs(s, o)
    });
    if (kind === 'body') {
      const m = (k) => (v) => { s.st[k] = num(v, k); return s; };
      Object.assign(s, {
        setMarginTop: m('MARGIN_TOP'), setMarginBottom: m('MARGIN_BOTTOM'), setMarginLeft: m('MARGIN_LEFT'), setMarginRight: m('MARGIN_RIGHT'),
        setPageWidth: m('PAGE_WIDTH'), setPageHeight: m('PAGE_HEIGHT'),
        appendImage: (blob) => { const im = makeImage(blob); const p = makePara(''); p.images.push(im); s.children.push(p); return im; }
      });
    }
    return s;
  }
  // Chữ để tìm trong "PDF" giả: đầu trang, thân, chân trang; ảnh ghi [IMAGE]
  function flatText(sec) {
    if (!sec) return [];
    const out = [];
    const walk = (x) => {
      if (x.kind === 'p') { x.images.forEach(() => out.push('[IMAGE]')); out.push(x.text); return; }
      if (x.kind === 'table') { x.rows.forEach((r) => out.push(r.cells.map((c) => c.children.map((ch) => (ch.kind === 'p' ? ch.text : ch.getText())).join('\n')).join(' | '))); return; }
    };
    sec.children.forEach(walk);
    return out;
  }
  const app = {
    Attribute, HorizontalAlignment, VerticalAlignment, ParagraphHeading, ElementType,
    create: (name) => {
      const id = 'doc_' + crypto.randomBytes(8).toString('hex');
      const rec = { id, name, saved: false, body: makeSection('body'), header: null, footer: null };
      Object.defineProperty(rec, 'page', { get: () => ({ w: rec.body.st.PAGE_WIDTH || 612, h: rec.body.st.PAGE_HEIGHT || 792 }) });
      rec.text = () => [...flatText(rec.header), ...flatText(rec.body), ...flatText(rec.footer)].join('\n');
      docs.set(id, rec);
      drive._registerExternal(id, name, 'application/vnd.google-apps.document');
      drive._docs.set(id, rec);
      const doc = {
        getId: () => id, getName: () => name, getBody: () => rec.body,
        addHeader: () => { if (rec.header) fail('đã có đầu trang'); rec.header = makeSection('header'); return rec.header; },
        addFooter: () => { if (rec.footer) fail('đã có chân trang'); rec.footer = makeSection('footer'); return rec.footer; },
        getHeader: () => rec.header, getFooter: () => rec.footer,
        saveAndClose: () => { rec.saved = true; }
      };
      return doc;
    },
    _docs: docs
  };
  return app;
}

/* ---------------- Others ---------------- */
function makeScriptApp() {
  const triggers = [];
  let seq = 0;
  const WeekDay = { MONDAY: 'MONDAY', TUESDAY: 'TUESDAY', WEDNESDAY: 'WEDNESDAY', THURSDAY: 'THURSDAY', FRIDAY: 'FRIDAY', SATURDAY: 'SATURDAY', SUNDAY: 'SUNDAY' };
  const app = {
    WeekDay, EventType: { CLOCK: 'CLOCK' },
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: (t) => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
    newTrigger: (fn) => {
      const spec = { fn };
      const b = {
        timeBased: () => b, everyDays: (n) => { spec.everyDays = n; return b; }, everyHours: (n) => { spec.everyHours = n; return b; },
        everyMinutes: (n) => { spec.everyMinutes = n; return b; },
        atHour: (h) => { spec.atHour = h; return b; }, onWeekDay: (d) => { spec.weekDay = d; return b; },
        inTimezone: (tz) => { spec.tz = tz; return b; }, after: (ms) => { spec.after = ms; return b; },
        create: () => { const uid = 't' + (++seq); const t = { spec, getHandlerFunction: () => fn, getEventType: () => 'CLOCK', getUniqueId: () => uid }; triggers.push(t); return t; }
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
    DocumentApp: makeDocumentApp(drive),
    BigInt,
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

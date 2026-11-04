/* 35_report_pdf: Logo công ty trên báo cáo và PDF có định dạng (bản 1.0.0-d4.11, người dùng yêu cầu 23/10/2026).
 * Logo công ty (không phải logo app 57 — logo 57 vẫn không ở báo cáo): tệp riêng tư trong thư mục dữ liệu app, Settings giữ ID tệp
 * và mã phiên bản; C4 tải lên/gỡ ở Quản trị. Không có logo → báo cáo như cũ, không chừa chỗ trống.
 * PDF dựng bằng Google Docs. Từ d4.22 (người dùng: phần từ Tóm tắt trở lên quá rộng, mỗi báo cáo gói trong một mặt A4): đầu mỗi phần là
 * một dải viền mảnh [logo công ty | tiêu đề hai thứ tiếng | mã biểu mẫu, số, thời gian lập] + một dòng thông tin nhỏ; tóm tắt dạng ô thấp
 * một hàng; biểu đồ (ảnh do app vẽ gửi kèm, không có thì thanh ký tự khối); bảng (cột #, độ rộng theo nội dung, số căn phải, hàng xen kẽ);
 * chú thích; khối Người lập / Người duyệt. Chân trang: tên báo cáo, số, thời gian lập. Báo cáo Điện nước: mỗi loại (Điện, Nước) một
 * trang riêng — dải đầu, ô tóm tắt của loại đó, biểu đồ theo ngày, bảng theo ngày, chi tiết đồng hồ, khối ký.
 * Chỉ dùng phương thức DocumentApp có trong tài liệu Apps Script (setAttributes, editAsText, setAlignment, setColumnWidth…);
 * định dạng từng ô có hạn thời gian để PDF 500 dòng vẫn xong trước khi app hết chờ. */

var REPORT_LOGO_MAX_BYTES_ = 1048576;
var PDF_C_ = {
  navy: '#17324F', ink: '#1F2933', muted: '#5B6875', line: '#C9D3DF', head: '#E6ECF3', zebra: '#F7F9FC', tile: '#F1F5F9', white: '#FFFFFF',
  good: '#1E7B4A', bad: '#B42318', bar: '#2A78D6', elec: '#EB6834', water: '#2A78D6', elecLight: '#F6C1AA', waterLight: '#AFCBEF'
};
var PDF_STYLE_BUDGET_MS_ = 12000;
var PDF_LOGO_PX_H_ = 40;   // chiều cao logo trong dải đầu (Docs tính px ≈ 0,75 pt → khoảng 30 pt)
var PDF_MARGIN_ = 32;
var PDF_CHART_MAX_B64_ = 900000; // ảnh biểu đồ app gửi kèm (PNG), mỗi ảnh
var PDF_BAR_PT_ = 7;       // cỡ chữ của thanh; mỗi ký tự khối tính rộng tối đa 1 em (7 pt) để thanh dài nhất không tràn dòng dù phông thay thế rộng

/* ---------------- Logo báo cáo ---------------- */

/** Tệp logo đang dùng (Blob) hoặc null khi chưa có / tệp đã mất */
function reportLogoBlob_() {
  var id = setting_('report_logo_file_id');
  if (!id) return null;
  try {
    var f = DriveApp.getFileById(String(id));
    if (f.isTrashed()) return null;
    return f.getBlob();
  } catch (e) { return null; }
}

function reportLogoRev_() { return String(setting_('report_logo_rev') || ''); }

/** report.logo.get: logo cho bản xem trước và Excel trên máy ({rev: ''} khi chưa có) */
function reportLogoGet_(ctx) {
  var b = reportLogoBlob_();
  if (!b) return { rev: '' };
  return { rev: reportLogoRev_(), mime_type: b.getContentType(), content_b64: b64_(b.getBytes()) };
}

/**
 * report.logo.set {content_b64, mime_type: image/png | image/jpeg} hoặc {remove: true} — C4, PIN.
 * Ảnh ≤ 1 MB (app thu nhỏ trước khi gửi); cùng nội dung với logo đang dùng → trả luôn, không tạo tệp mới.
 */
function reportLogoSet_(ctx) {
  var p = ctx.req.payload || {};
  var by = ctx.user.user_id;
  var oldId = String(setting_('report_logo_file_id') || '');
  var before = { rev: reportLogoRev_() };
  var audit = function (after) {
    writeAudit_({ user_id: by, device_id: ctx.req.device_id, action: 'report.logo.set', entity_type: 'SETTINGS', entity_id: 'report_logo',
      before_json: before, after_json: after, operation_id: ctx.req.operation_id || '', auth_basis: authBasis_(ctx) });
  };
  if (p.remove === true) {
    withWriteLock_(function () {
      writeSetting_('report_logo_file_id', '', by);
      writeSetting_('report_logo_rev', '', by);
      audit({ rev: '' });
    });
    if (oldId) { try { trashQuietly_(DriveApp.getFileById(oldId)); } catch (e) { /* bỏ qua */ } }
    return { rev: '' };
  }
  var errs = [];
  if (p.mime_type !== 'image/png' && p.mime_type !== 'image/jpeg') errs.push(fieldError_('mime_type', 'FILE_TYPE'));
  if (typeof p.content_b64 !== 'string' || !p.content_b64) errs.push(fieldError_('content_b64', 'REQUIRED'));
  if (errs.length) throw validationError_(errs);
  var bytes;
  try { bytes = b64d_(p.content_b64); } catch (e) { throw validationError_([fieldError_('content_b64', 'INVALID_VALUE')]); }
  if (!bytes.length) throw validationError_([fieldError_('content_b64', 'REQUIRED')]);
  if (bytes.length > REPORT_LOGO_MAX_BYTES_) throw validationError_([fieldError_('content_b64', 'FILE_TOO_LARGE')]);
  if (!magicOk_(bytes, p.mime_type)) throw validationError_([fieldError_('mime_type', 'FILE_TYPE')]);
  var rev = b64url_(sha256_(bytes)).slice(0, 16);
  if (rev === before.rev && reportLogoBlob_()) return { rev: rev };
  var file = appFolder_().createFile(Utilities.newBlob(bytes, p.mime_type, 'report-logo.' + DOC_MIME_[p.mime_type].ext));
  try {
    withWriteLock_(function () {
      writeSetting_('report_logo_file_id', file.getId(), by);
      writeSetting_('report_logo_rev', rev, by);
      audit({ rev: rev, bytes: bytes.length, mime_type: p.mime_type });
    });
  } catch (e) {
    trashQuietly_(file);
    throw e;
  }
  if (oldId && oldId !== file.getId()) { try { trashQuietly_(DriveApp.getFileById(oldId)); } catch (e2) { /* bỏ qua */ } }
  return { rev: rev };
}

/* ---------------- Khung PDF dùng chung ---------------- */

function pdfAttrs_(o) {
  var A = DocumentApp.Attribute, out = {};
  Object.keys(o).forEach(function (k) { out[A[k]] = o[k]; });
  return out;
}

/** Chữ của cả phần tử: cỡ, màu, đậm, nghiêng (editAsText dùng được cho đoạn, ô, hàng, bảng) */
function pdfText_(el, size, color, bold, italic) {
  var t = el.editAsText();
  if (size) t.setFontSize(size);
  if (color) t.setForegroundColor(color);
  if (bold !== undefined && bold !== null) t.setBold(!!bold);
  if (italic !== undefined && italic !== null) t.setItalic(!!italic);
  return el;
}

function pdfPara_(p, o) {
  if (o.align) p.setAlignment(DocumentApp.HorizontalAlignment[o.align]);
  p.setSpacingBefore(o.before || 0);
  p.setSpacingAfter(o.after || 0);
  if (o.line) p.setLineSpacing(o.line);
  if (o.text !== undefined) pdfText_(p, o.size, o.color, o.bold, o.italic);
  return p;
}

/**
 * Tạo tài liệu tạm: khổ A4 (ngang khi `wide`), lề hẹp, chân trang một dòng; logo công ty (nếu có) giữ trong pd.logo để dải đầu
 * (pdfHead_) chèn — không còn đầu trang Docs riêng (tốn ~1/10 trang). Trả {doc, body, width (pt dùng được), t0, logo}.
 */
function pdfStart_(opts) {
  var doc = DocumentApp.create('ME_TMP_' + uuid_());
  var body = doc.getBody();
  var pageW = opts.wide ? 842 : 595, pageH = opts.wide ? 595 : 842;
  body.setPageWidth(pageW);
  body.setPageHeight(pageH);
  var logo = opts.logo === undefined ? reportLogoBlob_() : opts.logo;
  body.setMarginLeft(PDF_MARGIN_).setMarginRight(PDF_MARGIN_).setMarginBottom(36).setMarginTop(26);
  if (opts.footer) {
    var fs = doc.addFooter();
    var fp = fs.getParagraphs()[0] || fs.appendParagraph('');
    fp.setText(opts.footer);
    pdfPara_(fp, { align: 'CENTER', text: true, size: 7, color: PDF_C_.muted });
  }
  // Đoạn trống Docs luôn để ở đầu thân tài liệu: thu nhỏ để dải đầu sát lề trên
  var p0 = body.getParagraphs()[0];
  pdfPara_(p0, { line: 0.5 });
  try { p0.setAttributes(pdfAttrs_({ FONT_SIZE: 1 })); } catch (e) { /* bỏ qua */ }
  return { doc: doc, body: body, width: pageW - 2 * PDF_MARGIN_, t0: Date.now(), logo: logo || null };
}

/** Lưu, đổi sang PDF, bỏ tệp tạm vào thùng rác */
function pdfFinish_(pd) {
  var id = pd.doc.getId();
  try {
    pd.doc.saveAndClose();
    return DriveApp.getFileById(id).getAs('application/pdf').getBytes();
  } finally {
    try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* bỏ qua */ }
  }
}

function pdfTimeLeft_(pd) { return Date.now() - pd.t0 < PDF_STYLE_BUDGET_MS_; }

/** Đặt chữ cho đoạn đầu của ô rồi thêm các đoạn sau: parts = [{text, size, color, bold, italic}] */
function pdfCellLines_(c, parts) {
  parts.forEach(function (x, i) {
    var p = i === 0 ? c.getChild(0).asParagraph() : c.appendParagraph('');
    p.setText(x.text || '');
    pdfPara_(p, { align: x.align, before: x.before || 0, text: true, size: x.size || 8, color: x.color || PDF_C_.ink, bold: !!x.bold, italic: !!x.italic });
  });
}

/**
 * Dải đầu gọn (d4.22): bảng một hàng viền mảnh [logo | tiêu đề Việt (13) / Trung (10) / dòng phụ | mã biểu mẫu, số, thời gian lập]
 * rồi dòng thông tin nhỏ hai cột (trái: kỳ, khu vực…; phải: người lập…). Gọi lại ở đầu mỗi phần (trang Điện, trang Nước).
 * o = {vi, zh, sub, codes: [[nhãn, giá trị]] (bỏ dòng trống), left: [[nhãn, giá trị]], right: [[nhãn, giá trị]]}
 */
function pdfHead_(pd, o) {
  var logo = pd.logo;
  var codes = (o.codes || []).filter(function (x) { return x[1]; });
  var n = logo ? 3 : 2;
  var row = [];
  for (var i = 0; i < n; i++) row.push('');
  var t = pd.body.appendTable([row]);
  t.setBorderWidth(1).setBorderColor(PDF_C_.line);
  var wr = Math.round(pd.width * 0.26), wl = logo ? Math.round(pd.width * 0.2) : 0;
  if (logo) t.setColumnWidth(0, wl);
  t.setColumnWidth(n - 2, pd.width - wl - wr).setColumnWidth(n - 1, wr);
  var r = t.getRow(0);
  for (var k = 0; k < n; k++) { pdfCellPad_(r.getCell(k), 4, 6); r.getCell(k).setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER); }
  if (logo) {
    try {
      var lp = r.getCell(0).getChild(0).asParagraph();
      pdfPara_(lp, { align: 'CENTER' });
      var img = lp.appendInlineImage(logo);
      var w0 = img.getWidth(), h0 = img.getHeight();
      var h = PDF_LOGO_PX_H_, w = w0 && h0 ? Math.round(h * w0 / h0) : h;
      var maxW = Math.floor((wl - 12) / 0.75);
      if (w > maxW) { w = maxW; h = w0 && h0 ? Math.max(1, Math.round(w * h0 / w0)) : h; }
      img.setWidth(w).setHeight(h);
    } catch (e) { /* logo lỗi: ô trống */ }
  }
  var title = [{ text: o.vi || o.zh || '', size: 13, color: PDF_C_.navy, bold: true, align: 'CENTER' }];
  if (o.zh && o.vi) title.push({ text: o.zh, size: 10, color: PDF_C_.navy, bold: true, align: 'CENTER', before: 1 });
  if (o.sub) title.push({ text: o.sub, size: 9, color: PDF_C_.ink, bold: true, align: 'CENTER', before: 2 });
  pdfCellLines_(r.getCell(n - 2), title);
  var right = [];
  codes.forEach(function (x) { right.push({ text: x[0], size: 7, color: PDF_C_.muted }); right.push({ text: x[1], size: 9, color: PDF_C_.navy, bold: true }); });
  if (!right.length) right.push({ text: '' });
  pdfCellLines_(r.getCell(n - 1), right);
  if ((o.left && o.left.length) || (o.right && o.right.length)) pdfMeta_(pd, o.left || [], o.right || []);
  return t;
}

function pdfHeading_(pd, text, before) {
  return pdfPara_(pd.body.appendParagraph(text), { before: before === undefined ? 8 : before, after: 3, text: true, size: 9, color: PDF_C_.navy, bold: true });
}

function pdfNote_(pd, text) {
  return pdfPara_(pd.body.appendParagraph(text), { before: 2, text: true, size: 7, color: PDF_C_.muted, italic: true });
}

/** Bảng không viền, đệm ô nhỏ */
function pdfPlain_(t) {
  t.setBorderWidth(0);
  return t;
}

function pdfCellPad_(c, v, h) {
  c.setPaddingTop(v).setPaddingBottom(v).setPaddingLeft(h).setPaddingRight(h);
  return c;
}

/** Căn mọi đoạn trong ô */
function pdfCellAlign_(c, align) {
  var A = DocumentApp.HorizontalAlignment[align];
  for (var i = 0; i < c.getNumChildren(); i++) {
    var ch = c.getChild(i);
    if (ch.getType() === DocumentApp.ElementType.PARAGRAPH) ch.asParagraph().setAlignment(A);
  }
}

/** Dòng thông tin nhỏ hai cột dưới dải đầu: trái (kỳ, khu vực, lọc), phải (người lập… — căn phải). lines = [[nhãn, giá trị]] */
function pdfMeta_(pd, left, right) {
  var fmt = function (l) { return l[1] ? l[0] + ': ' + l[1] : l[0]; };
  var t = pdfPlain_(pd.body.appendTable([[left.map(fmt).join('\n'), right.map(fmt).join('\n')]]));
  t.setColumnWidth(0, Math.round(pd.width * 0.62)).setColumnWidth(1, pd.width - Math.round(pd.width * 0.62));
  pdfText_(t, 8, PDF_C_.ink);
  var r = t.getRow(0);
  pdfCellPad_(r.getCell(0), 3, 0);
  pdfCellPad_(r.getCell(1), 3, 0);
  pdfCellAlign_(r.getCell(1), 'RIGHT');
  return t;
}

/**
 * Ô số tóm tắt thấp, một hàng (≤ 4 ô: 4 cột; 5–6 ô: đủ cột; nhiều hơn xuống hàng 6 cột): nhãn nhỏ xám + số đậm 11 pt.
 * items = [{label, value, note}]
 */
function pdfTiles_(pd, items) {
  if (!items.length) return null;
  var per = items.length <= 4 ? 4 : Math.min(6, items.length);
  var rows = [];
  for (var i = 0; i < items.length; i += per) {
    var row = [];
    for (var j = 0; j < per; j++) row.push('');
    rows.push(row);
  }
  var t = pd.body.appendTable(rows);
  t.setBorderWidth(3).setBorderColor(PDF_C_.white);
  var w = Math.floor(pd.width / per);
  for (var k = 0; k < per; k++) t.setColumnWidth(k, w);
  items.forEach(function (it, n) {
    var c = t.getCell(Math.floor(n / per), n % per);
    c.setBackgroundColor(PDF_C_.tile);
    pdfCellPad_(c, 3, 6);
    var p0 = c.getChild(0).asParagraph();
    p0.setText(it.label);
    pdfText_(p0, 7, PDF_C_.muted, false);
    var p1 = c.appendParagraph(it.value);
    pdfPara_(p1, { before: 1, text: true, size: it.value.length > 18 ? 9 : 11, color: PDF_C_.navy, bold: true });
    if (it.note) pdfPara_(c.appendParagraph(it.note), { text: true, size: 7, color: PDF_C_.muted, bold: false });
  });
  return t;
}

/**
 * Biểu đồ thanh ngang bằng ký tự khối (chữ của tài liệu, in nét): [nhãn | thanh | số]. Một chuỗi → một màu, không chú giải;
 * số ghi bằng màu chữ thường. items = [{label, value (null = không vẽ), text (chữ ở cột số), light (thanh nhạt: thiếu một phần)}]
 */
function pdfBars_(pd, title, items, color, lightColor) {
  if (!items.length) return;
  pdfHeading_(pd, title, 10);
  var max = 0;
  items.forEach(function (it) { if (it.value !== null && it.value > max) max = it.value; });
  var wl = Math.round(pd.width * 0.3), wv = Math.round(pd.width * 0.2), wb = pd.width - wl - wv;
  var maxChars = Math.max(10, Math.min(60, Math.floor((wb - 8) / PDF_BAR_PT_)));
  var cells = items.map(function (it) {
    var n = it.value === null || !(max > 0) ? 0 : Math.max(it.value > 0 ? 1 : 0, Math.round(it.value / max * maxChars));
    return [it.label, n ? new Array(n + 1).join('\u2588') : '', it.text];
  });
  var t = pdfPlain_(pd.body.appendTable(cells));
  t.setColumnWidth(0, wl).setColumnWidth(1, wb).setColumnWidth(2, wv);
  pdfText_(t, 8, PDF_C_.ink);
  items.forEach(function (it, i) {
    var r = t.getRow(i);
    for (var c = 0; c < 3; c++) pdfCellPad_(r.getCell(c), 1, 2);
    var bar = r.getCell(1);
    if (bar.getText()) pdfText_(bar, PDF_BAR_PT_, it.light ? lightColor || color : color);
    if (it.value === null) pdfText_(r.getCell(2), 8, PDF_C_.muted, false, true);
  });
}

/**
 * Độ rộng cột (pt) theo nội dung: ước lượng số ký tự (dòng dài nhất trong ô, lấy mức 90 % các dòng để một ô quá dài không chiếm hết),
 * cột số/ngày hẹp, cột chữ có trần; thiếu chỗ thì co theo tỷ lệ nhưng không nhỏ hơn 26 pt; thừa chỗ thì giãn cho kín khổ.
 */
function pdfColWidths_(head, rows, types, avail, fixed0, caps) {
  var n = head.length;
  var longest = function (s) { return String(s || '').split('\n').reduce(function (m, x) { return Math.max(m, x.length); }, 0); };
  var ideal = [];
  for (var c = 0; c < n; c++) {
    if (fixed0 && c === 0) { ideal.push(fixed0); continue; }
    var lens = rows.map(function (r) { return longest(r[c]); }).sort(function (a, b) { return a - b; });
    var p90 = lens.length ? lens[Math.min(lens.length - 1, Math.floor(lens.length * 0.9))] : 0;
    var hl = longest(head[c]);
    var ty = types[c] || 'text';
    var cap = (caps && caps[c]) || (ty === 'num' || ty === 'money' || ty === 'date' ? 16 : (ty === 'time' ? 16 : (ty === 'code' ? 18 : 42)));
    var chars = Math.min(cap, Math.max(p90, Math.min(hl, cap), ty === 'num' ? 4 : (ty === 'code' ? 7 : 6)));
    ideal.push(chars * 5 + 12); // ~5 pt mỗi ký tự ở cỡ 7–8, đệm ô 2 × 5 pt + 2
  }
  var free = avail - (fixed0 || 0);
  var flex = ideal.slice(fixed0 ? 1 : 0);
  var sum = flex.reduce(function (a, b) { return a + b; }, 0);
  var out = flex.map(function (w) { return w * free / sum; });
  if (sum > free) {
    // Co: cột nhỏ hơn 26 pt nâng lên 26, phần thiếu trừ đều vào các cột còn lại theo tỷ lệ
    for (var k = 0; k < 4; k++) {
      var under = 0, rest = 0;
      out.forEach(function (w) { if (w < 26) under += 26 - w; else rest += w; });
      if (!under) break;
      if (!(rest > 0)) break;
      out = out.map(function (w) { return w < 26 ? 26 : w - under * w / rest; });
    }
  }
  out = out.map(function (w) { return Math.floor(w); });
  return fixed0 ? [fixed0].concat(out) : out;
}

/**
 * Bảng dữ liệu có định dạng: tiêu đề nền xám nhạt chữ đậm, viền mảnh, cột # (khi `numbered`), số/tiền căn phải, ngày căn giữa,
 * hàng xen kẽ (≤ 300 dòng). types[i]: num | money | date | time | code | text. cellColor(r, c) → màu chữ riêng của ô (vd Đạt/Không đạt).
 * caps[i]: số ký tự tối đa để tính độ rộng cột (cột ghi tay hẹp lại, nhường chỗ cho cột nội dung).
 */
function pdfTable_(pd, head, rows, types, opts) {
  opts = opts || {};
  var numbered = !!opts.numbered;
  var h = numbered ? ['#'].concat(head) : head.slice();
  var ty = numbered ? ['num'].concat(types) : types.slice();
  var data = rows.map(function (r, i) { return numbered ? [String(i + 1)].concat(r) : r; });
  if (!data.length) data = [h.map(function (x, i) { return i === (numbered ? 1 : 0) ? (opts.empty || lab_('field.no_records')) : ''; })];
  var t = pd.body.appendTable([h].concat(data));
  t.setBorderWidth(1).setBorderColor(PDF_C_.line);
  var widths = pdfColWidths_(h, data, ty, pd.width, numbered ? 24 : 0, opts.caps ? (numbered ? [null].concat(opts.caps) : opts.caps) : null);
  widths.forEach(function (w, i) { t.setColumnWidth(i, w); });
  var fs = opts.fontSize || (h.length > 9 ? 7 : 8);
  pdfText_(t, fs, PDF_C_.ink);
  var hr = t.getRow(0);
  pdfText_(hr, fs, PDF_C_.navy, true);
  for (var c = 0; c < h.length; c++) {
    var hc = hr.getCell(c);
    hc.setBackgroundColor(PDF_C_.head);
    hc.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
    if (ty[c] === 'num' || ty[c] === 'money') pdfCellAlign_(hc, 'RIGHT');
    else if (ty[c] === 'date') pdfCellAlign_(hc, 'CENTER');
  }
  if (!rows.length) { pdfText_(t.getRow(1), fs, PDF_C_.muted, false, true); return t; }
  var zebra = data.length <= 300;
  var alignCols = [];
  ty.forEach(function (x, i) { if (x === 'num' || x === 'money') alignCols.push([i, 'RIGHT']); else if (x === 'date') alignCols.push([i, 'CENTER']); });
  for (var r = 1; r <= data.length; r++) {
    if (!pdfTimeLeft_(pd)) break;
    var row = t.getRow(r);
    if (numbered) pdfText_(row.getCell(0), fs, PDF_C_.muted);
    if (zebra && r % 2 === 0) for (var z = 0; z < h.length; z++) row.getCell(z).setBackgroundColor(PDF_C_.zebra);
    for (var a = 0; a < alignCols.length; a++) {
      var cell = row.getCell(alignCols[a][0]);
      if (cell.getNumChildren()) cell.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment[alignCols[a][1]]);
    }
    if (opts.cellColor) {
      for (var cc = numbered ? 1 : 0; cc < h.length; cc++) {
        var col = opts.cellColor(r - 1, numbered ? cc - 1 : cc);
        if (col) pdfText_(row.getCell(cc), fs, col, true);
      }
    }
  }
  return t;
}

/** Bảng nhãn – giá trị (hồ sơ, phiếu): cột nhãn nền nhạt */
function pdfKv_(pd, kv) {
  var data = kv.length ? kv : [[lab_('field.no_records'), '']];
  var t = pd.body.appendTable(data);
  t.setBorderWidth(1).setBorderColor(PDF_C_.line);
  var wl = Math.round(pd.width * 0.32);
  t.setColumnWidth(0, wl).setColumnWidth(1, pd.width - wl);
  pdfText_(t, 9, PDF_C_.ink);
  for (var i = 0; i < data.length; i++) {
    if (!pdfTimeLeft_(pd)) break;
    var c = t.getRow(i).getCell(0);
    c.setBackgroundColor(PDF_C_.tile);
    pdfText_(c, 8, PDF_C_.muted, true);
  }
  return t;
}

/** Khối ký: Người lập (có tên người tạo khi biết) · Người duyệt; dòng hướng dẫn ký, khoảng trống để ký */
function pdfSign_(pd, preparedName) {
  var spacer = pd.body.appendParagraph('');
  pdfPara_(spacer, { before: 8 });
  var hint = lab_('rpt.sign_hint');
  var t = pdfPlain_(pd.body.appendTable([
    [lab_('rpt.prepared_by'), lab_('rpt.approved_by')],
    [hint, hint],
    ['\n\n', '\n\n'],
    [preparedName || '', '']
  ]));
  var half = Math.floor(pd.width / 2);
  t.setColumnWidth(0, half).setColumnWidth(1, pd.width - half);
  pdfText_(t, 9, PDF_C_.ink);
  pdfText_(t.getRow(0), 9, PDF_C_.navy, true);
  pdfText_(t.getRow(1), 7, PDF_C_.muted, false, true);
  pdfText_(t.getRow(3), 9, PDF_C_.ink, true);
  for (var r = 0; r < 4; r++) for (var c = 0; c < 2; c++) { pdfCellPad_(t.getRow(r).getCell(c), 1, 4); pdfCellAlign_(t.getRow(r).getCell(c), 'CENTER'); }
  return t;
}

/**
 * Khối ký nhiều cột (phiếu bảo trì, phiếu sửa chữa): cols = [{label, name, date}] — nhãn đậm, dòng hướng dẫn ký, chỗ ký tay,
 * tên và ngày lấy từ app (trống thì để ký tay).
 */
function pdfSignCols_(pd, cols) {
  pdfPara_(pd.body.appendParagraph(''), { before: 8 });
  var hint = lab_('rpt.sign_hint');
  var t = pdfPlain_(pd.body.appendTable([
    cols.map(function (c) { return c.label; }),
    cols.map(function () { return hint; }),
    cols.map(function () { return '\n\n'; }),
    cols.map(function (c) { return c.name || ''; }),
    cols.map(function (c) { return c.date ? lab_('ap.date') + ': ' + c.date : ''; })
  ]));
  var w = Math.floor(pd.width / cols.length);
  cols.forEach(function (c, i) { t.setColumnWidth(i, i === cols.length - 1 ? pd.width - w * (cols.length - 1) : w); });
  pdfText_(t, 9, PDF_C_.ink);
  pdfText_(t.getRow(0), 9, PDF_C_.navy, true);
  pdfText_(t.getRow(1), 7, PDF_C_.muted, false, true);
  pdfText_(t.getRow(3), 9, PDF_C_.ink, true);
  pdfText_(t.getRow(4), 8, PDF_C_.muted, false);
  for (var r = 0; r < 5; r++) for (var c = 0; c < cols.length; c++) { pdfCellPad_(t.getRow(r).getCell(c), 1, 4); pdfCellAlign_(t.getRow(r).getCell(c), 'CENTER'); }
  return t;
}

/** Mã biểu mẫu ISO của một loại PDF (Settings pdf_form_codes; d4.21); trống → không in */
function pdfFormCode_(kind) {
  var m = setting_('pdf_form_codes');
  var v = m && typeof m === 'object' && !Array.isArray(m) ? m[kind] : '';
  return v ? String(v) : '';
}

/* ---------------- PDF báo cáo (8 mẫu, bản đã lưu) ---------------- */

function pdfColType_(c) {
  if (c.type === 'num' || c.type === 'money' || c.type === 'date' || c.type === 'time' || c.type === 'code') return c.type;
  return 'text';
}

/** Biểu đồ của báo cáo (không phải Điện nước): đếm theo trạng thái — thanh ngang một màu */
function reportPdfCharts_(pd, data) {
  var ch = data.chart;
  if (!ch || !ch.series || !ch.series.length) return;
  pdfBars_(pd, lab_('rpt.chart'), ch.series.map(function (s) {
    return { label: lab_(s.enumKey + '.' + s.key), value: Number(s.value) || 0, text: fmtNumSrv_(s.value) };
  }), PDF_C_.bar);
}

/** Ô tóm tắt (nhãn, số) từ summary của báo cáo; `only` lọc theo loại điện nước */
function reportTiles_(data, only) {
  return (data.summary || []).filter(function (s) { return !only || (s.enumKey === 'utility_type' && s.enum === only); }).map(function (s) {
    var label = only ? (s.money ? lab_('ut.cost') : lab_('rpt.period_use')) :
      (s.enumKey ? lab_(s.enumKey + '.' + s.enum) + (s.label_vi ? ' — ' + s.label_vi + ' · ' + s.label_zh : '') : s.label_vi + ' · ' + s.label_zh);
    var val = s.money ? fmtMoneySrv_(s.value, s.currency) : (s.value === null ? lab_(s.na_key || 'field.not_set') : fmtNumSrv_(s.value) + (s.unit ? (s.unit === '%' ? '%' : ' ' + s.unit) : ''));
    return { label: label, value: val, note: s.partial ? lab_('ut.partial') : '', money: !!s.money };
  });
}

/** Nhãn hai dòng (Việt / Trung) cho tiêu đề cột */
function pdfHl_(key) { var x = LABELS[key] || [key, key]; return x[0] + '\n' + x[1]; }

/** Ảnh biểu đồ app gửi kèm (PNG base64) → Blob; sai/thiếu → null (PDF vẫn dựng, không ảnh) */
function reportChartBlob_(b64) {
  if (typeof b64 !== 'string' || !b64 || b64.length > PDF_CHART_MAX_B64_) return null;
  try {
    var bytes = b64d_(b64);
    if (!bytes.length || !magicOk_(bytes, 'image/png')) return null;
    return Utilities.newBlob(bytes, 'image/png', 'chart.png');
  } catch (e) { return null; }
}

/** Chèn ảnh biểu đồ vừa bề ngang trang (giữ tỷ lệ) */
function pdfChartImage_(pd, blob) {
  var p = pd.body.appendParagraph('');
  pdfPara_(p, { align: 'CENTER', before: 6, after: 2 });
  var img = p.appendInlineImage(blob);
  var w0 = img.getWidth(), h0 = img.getHeight();
  var w = Math.floor(pd.width / 0.75) - 4;
  var h = w0 && h0 ? Math.max(1, Math.round(w * h0 / w0)) : Math.round(w / 3.6);
  img.setWidth(w).setHeight(h);
  return img;
}

/* ---------------- Điện nước: mỗi loại một trang A4 (d4.22) ---------------- */

/** Loại điện nước có trong báo cáo (Điện trước, Nước sau); lọc một loại → chỉ loại đó */
function reportUtilTypes_(data) {
  var f = data.filters || {}, seen = {};
  (data.summary || []).forEach(function (s) { if (s.enumKey === 'utility_type') seen[s.enum] = true; });
  (data.rows || []).forEach(function (r) { if (r.utility_type) seen[r.utility_type] = true; });
  if (data.daily) Object.keys(data.daily.totals || {}).forEach(function (k) { seen[k] = true; });
  return UTILITY_TYPES_.filter(function (k) { return seen[k] && (!f.utility_type || f.utility_type === k); });
}

/** Thống kê theo ngày của một loại: số ngày đủ số, trung bình ngày đủ số, ngày cao nhất */
function utilDailyStats_(daily, ut) {
  var t = daily && daily.totals && daily.totals[ut];
  if (!t) return null;
  var n = 0, sum = 0, max = null, maxDay = '';
  t.v.forEach(function (v, i) {
    if (v === null || t.st[i] !== 'ok') return;
    n++; sum += v;
    if (max === null || v > max) { max = v; maxDay = daily.days[i]; }
  });
  return { ok: n, days: daily.days.length, avg: n ? Math.round(sum / n * 1000) / 1000 : null, max: max, maxDay: maxDay };
}

/** Ngày + thứ hai thứ tiếng: "05/10 CN 周日" */
function utilDayLabel_(iso) {
  var wd = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))).getUTCDay() || 7;
  var w = LABELS['weekday.' + wd] || ['', ''];
  return iso.slice(8, 10) + '/' + iso.slice(5, 7) + ' ' + w[0] + ' ' + w[1];
}

/** Ô số của một ngày: số; ngày chưa tới → trống; hôm nay (chưa chốt) → …; thiếu số đo → — */
function utilDayCell_(v, st) {
  if (v !== null && v !== undefined) return fmtNumSrv_(v) + (st === 'partial' ? '*' : '');
  if (st === 'FUTURE' || st === 'future') return '';
  if (st === 'OPEN_PERIOD' || st === 'open') return '…';
  return '—';
}

/**
 * Bảng theo ngày của một loại: một đồng hồ → [Ngày | Chỉ số đầu ngày (giờ đọc) | Tiêu thụ]; 2–4 đồng hồ → [Ngày | từng đồng hồ | Tổng];
 * nhiều hơn → [Ngày | Tổng]. Bảng ≤ 4 cột chia hai nửa đặt cạnh nhau (ngày 1–16 | 17–31) cho vừa một trang A4. Ngày lớn nhất in đậm.
 */
function utilDailyTable_(pd, daily, ut) {
  var tot = daily.totals[ut];
  if (!tot) return null;
  var days = daily.days, unit = tot.unit;
  var ms = daily.meters.filter(function (m) { return m.utility_type === ut; });
  var head, types, rowOf;
  if (ms.length === 1) {
    var m = ms[0];
    head = [pdfHl_('field.date'), pdfHl_('rpt.day_open'), pdfHl_('rpt.day_use') + ' (' + unit + ')'];
    types = ['text', 'num', 'num'];
    rowOf = function (i) {
      return [utilDayLabel_(days[i]), m.o[i] === null ? utilDayCell_(null, m.s[i] === 'FUTURE' ? 'FUTURE' : 'x') : fmtNumSrv_(m.o[i]) + (m.t[i] ? '  ' + m.t[i] : ''), utilDayCell_(m.v[i], m.s[i])];
    };
  } else if (ms.length <= 4) {
    head = [pdfHl_('field.date')].concat(ms.map(function (x) { return x.meter_code + (x.in_total ? '' : ' ↳'); })).concat([pdfHl_('rpt.day_total') + ' (' + unit + ')']);
    types = ['text'].concat(ms.map(function () { return 'num'; })).concat(['num']);
    rowOf = function (i) { return [utilDayLabel_(days[i])].concat(ms.map(function (x) { return utilDayCell_(x.v[i], x.s[i]); })).concat([utilDayCell_(tot.v[i], tot.st[i])]); };
  } else {
    head = [pdfHl_('field.date'), pdfHl_('rpt.day_total') + ' (' + unit + ')'];
    types = ['text', 'num'];
    rowOf = function (i) { return [utilDayLabel_(days[i]), utilDayCell_(tot.v[i], tot.st[i])]; };
  }
  var st = utilDailyStats_(daily, ut);
  var nc = head.length;
  var split = nc <= 4 && days.length > 10;
  var half = split ? Math.ceil(days.length / 2) : days.length;
  var blank = head.map(function () { return ''; });
  var cells = [split ? head.concat(['']).concat(head) : head];
  var dayAt = [];
  for (var i = 0; i < half; i++) {
    var left = rowOf(i);
    if (split) {
      var j = i + half;
      cells.push(left.concat(['']).concat(j < days.length ? rowOf(j) : blank));
      dayAt.push([i, j < days.length ? j : -1]);
    } else { cells.push(left); dayAt.push([i, -1]); }
  }
  var t = pd.body.appendTable(cells);
  t.setBorderWidth(0);
  var gap = split ? 14 : 0;
  var wHalf = split ? Math.floor((pd.width - gap) / 2) : pd.width;
  var wDay = Math.round(wHalf * (nc <= 2 ? 0.5 : 0.36));
  var wNum = Math.floor((wHalf - wDay) / (nc - 1));
  var widths = [wDay];
  for (var k = 1; k < nc; k++) widths.push(wNum);
  if (split) widths = widths.concat([gap]).concat(widths.slice());
  widths.forEach(function (w, x) { t.setColumnWidth(x, w); });
  var fs = 8;
  pdfText_(t, fs, PDF_C_.ink);
  var ncol = widths.length;
  var isGap = function (c) { return split && c === nc; };
  var numCol = function (c) { var cc = split && c > nc ? c - nc - 1 : c; return types[cc] === 'num'; };
  var hr = t.getRow(0);
  pdfText_(hr, 7, PDF_C_.navy, true);
  for (var c = 0; c < ncol; c++) {
    var hc = hr.getCell(c);
    pdfCellPad_(hc, 2, 4);
    if (isGap(c)) continue;
    hc.setBackgroundColor(PDF_C_.head);
    hc.setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
    if (numCol(c)) pdfCellAlign_(hc, 'RIGHT');
  }
  for (var r = 1; r < cells.length; r++) {
    if (!pdfTimeLeft_(pd)) break;
    var row = t.getRow(r);
    for (var c2 = 0; c2 < ncol; c2++) {
      var cell = row.getCell(c2);
      pdfCellPad_(cell, 1, 4);
      if (isGap(c2)) continue;
      if (r % 2 === 0) cell.setBackgroundColor(PDF_C_.zebra);
      if (numCol(c2)) pdfCellAlign_(cell, 'RIGHT');
    }
    // Ngày lớn nhất (đủ số): tô đậm ô tổng; ngày chủ nhật: chữ ngày màu nhạt
    [[dayAt[r - 1][0], 0], [dayAt[r - 1][1], split ? nc + 1 : -1]].forEach(function (x) {
      if (x[0] < 0 || x[1] < 0) return;
      if (/ CN /.test(cells[r][x[1]])) pdfText_(row.getCell(x[1]), fs, PDF_C_.muted);
      if (st && st.maxDay && days[x[0]] === st.maxDay) pdfText_(row.getCell(x[1] + nc - 1), fs, PDF_C_.navy, true);
    });
  }
  return t;
}

/** Bảng chi tiết đồng hồ của một loại, gọn cho khổ dọc: gộp số + giờ đọc, tiêu thụ + đơn vị; bỏ cột Loại (trang đã theo loại) */
function utilMeterTable_(pd, data, ut) {
  var cols = data.columns || [];
  var has = {};
  cols.forEach(function (c) { has[c.key] = c; });
  var hl = function (c) { return c.label_vi + '\n' + c.label_zh; };
  var short = function (iso) { var x = fmtTimeSrv_(iso); return x ? x.slice(0, 5) + ' ' + x.slice(11) : ''; };
  var spec = [];
  cols.forEach(function (c) {
    var k = c.key;
    if (k === 'utility_type' || k === 'unit' || k === 'opening_at' || k === 'closing_at') return;
    if (k === 'opening_value' || k === 'closing_value') {
      var at = k === 'opening_value' ? 'opening_at' : 'closing_at';
      spec.push({ h: hl(c), ty: 'num', f: function (r) { return [fmtNumSrv_(r[k]), has[at] ? short(r[at]) : ''].filter(Boolean).join('\n'); } });
      return;
    }
    if (k === 'consumption') {
      spec.push({ h: hl(c), ty: 'num', f: function (r) { return r[k] === '' || r[k] === null || r[k] === undefined ? '' : fmtNumSrv_(r[k]) + (r.unit ? ' ' + r.unit : ''); } });
      return;
    }
    spec.push({ h: hl(c), ty: pdfColType_(c), f: function (r) { return reportCellText_(c, r); } });
  });
  var rows = (data.rows || []).filter(function (r) { return !r.utility_type || r.utility_type === ut; });
  return pdfTable_(pd, spec.map(function (x) { return x.h; }), rows.map(function (r) { return spec.map(function (x) { return x.f(r); }); }),
    spec.map(function (x) { return x.ty; }), { numbered: true, fontSize: 7 });
}

/** Một trang Điện hoặc Nước: dải đầu, ô tóm tắt, biểu đồ (ảnh app), bảng theo ngày, chi tiết đồng hồ, chú thích, khối ký */
function reportUtilSection_(pd, data, ut, head, chartBlob) {
  var h = {};
  Object.keys(head).forEach(function (k) { h[k] = head[k]; });
  h.sub = lab_('utility_type.' + ut);
  pdfHead_(pd, h);
  var unit = UTILITY_UNIT_[ut];
  var tiles = reportTiles_(data, ut);
  var cons = tiles.filter(function (x) { return !x.money; });
  var cost = tiles.filter(function (x) { return x.money; });
  var st = utilDailyStats_(data.daily, ut);
  var more = [];
  if (st) {
    more.push({ label: lab_('rpt.daily_avg'), value: st.avg === null ? '—' : fmtNumSrv_(st.avg, 1) + ' ' + unit });
    more.push({ label: lab_('rpt.daily_max'), value: st.max === null ? '—' : fmtNumSrv_(st.max) + ' ' + unit, note: st.maxDay ? fmtDateVN_(st.maxDay) : '' });
    more.push({ label: lab_('rpt.daily_ok'), value: st.ok + '/' + st.days });
  }
  var line = (data.chart && data.chart.line) || [];
  if (line.length > 1) {
    var pv = (line[line.length - 2].totals || {})[ut];
    if (pv && pv.ok && !pv.partial && !pv.open) more.push({ label: lab_('rpt.prev_period'), value: fmtNumSrv_(pv.consumption) + ' ' + unit });
  }
  pdfTiles_(pd, cons.concat(more).concat(cost));
  if (chartBlob) {
    try { pdfChartImage_(pd, chartBlob); } catch (e) { chartBlob = null; }
  }
  if (!chartBlob && !data.daily && line.length) {
    pdfBars_(pd, lab_(ut === 'WATER' ? 'ut.chart_water' : 'ut.chart_elec') + ' (' + unit + ')', line.map(function (p) {
      var x = (p.totals || {})[ut];
      var label = pdfPeriodLabel_((data.period && data.period.period_type) || 'MONTH', p.period_start, p.period_end);
      if (!x || !x.ok) return { label: label, value: null, text: lab_(x && x.open ? 'utility_status.OPEN_PERIOD' : 'utility_status.NO_READING') };
      var part = x.open || x.partial;
      return { label: label, value: x.consumption, light: part, text: fmtNumSrv_(x.consumption) + ' ' + unit + (part ? ' (' + lab_(x.open ? 'utility_status.OPEN_PERIOD' : 'ut.partial') + ')' : '') };
    }), ut === 'WATER' ? PDF_C_.water : PDF_C_.elec, ut === 'WATER' ? PDF_C_.waterLight : PDF_C_.elecLight);
  }
  if (data.daily && data.daily.totals && data.daily.totals[ut]) {
    pdfHeading_(pd, lab_('rpt.by_day') + '  ·  ' + unit, 6);
    utilDailyTable_(pd, data.daily, ut);
  }
  pdfHeading_(pd, lab_('rpt.meters_detail'), 6);
  utilMeterTable_(pd, data, ut);
  var notes = ['rpt.note.utility_rule'];
  if (data.daily) notes.push('rpt.note.daily');
  if (st && data.daily.totals[ut].st.indexOf('partial') >= 0) notes.push('rpt.note.partial_day');
  pdfNote_(pd, notes.map(function (n) { return lab_(n); }).join('  ·  '));
  if (data.filters && data.filters.window_hours) pdfNote_(pd, lab_('ut.window_note', { W: data.filters.window_hours }));
  if (data.cost_hidden) pdfNote_(pd, lab_('cost.hidden'));
  if (data.truncated) pdfNote_(pd, lab_('rpt.truncated', { N: data.total_rows }));
  pdfSign_(pd, data.generated_by_name || '');
}

/** Nhãn kỳ ngắn cho biểu đồ (tháng: mm/yyyy; ngày: dd/mm/yyyy; khoảng: dd/mm – dd/mm/yyyy) */
function pdfPeriodLabel_(type, a, b) {
  if (type === 'MONTH') return a.slice(5, 7) + '/' + a.slice(0, 4);
  if (a === b) return fmtDateVN_(a);
  return a.slice(8, 10) + '/' + a.slice(5, 7) + ' – ' + fmtDateVN_(b);
}

/**
 * Dựng PDF một báo cáo (dữ liệu của reportCompute_ hoặc bản chụp đã lưu). Không cụm nhận diện app (1.4 §3.5); logo là logo công ty
 * do quản trị tải lên (nếu có). opts.charts = {ELECTRICITY | WATER: Blob PNG} biểu đồ app vẽ gửi kèm (báo cáo Điện nước).
 */
function reportPdf_(data, opts) {
  opts = opts || {};
  var cols = data.columns || [];
  var titleVi = data.title_vi || '', titleZh = data.title_zh || '';
  var gen = fmtTimeSrv_(data.generated_at);
  var formCode = pdfFormCode_((data.definition && data.definition.code) || '');
  var footer = [titleVi || titleZh, formCode, data.report_run_code ? lab_('rpt.number') + ': ' + data.report_run_code : '', lab_('rpt.generated_at') + ': ' + gen]
    .filter(Boolean).join('   ·   ');
  var util = data.definition && data.definition.dataset === 'UTILITIES';
  var types = util ? reportUtilTypes_(data) : [];
  var pd = pdfStart_({ wide: !types.length && cols.length > 7, footer: footer });
  try {
    // Điện nước: dòng "Số chốt kỳ…" chuyển xuống chú thích cuối trang (dải đầu chỉ giữ kỳ, khu vực)
    var wNote = util && data.filters && data.filters.window_hours ? lab_('ut.window_note', { W: data.filters.window_hours }) : '';
    var left = reportFilterLines_(data).filter(function (x) { return !wNote || x !== wNote; })
      .map(function (x) { var i = x.indexOf(': '); return i > 0 ? [x.slice(0, i), x.slice(i + 2)] : [x, '']; });
    var head = {
      vi: titleVi, zh: titleZh,
      codes: [[lab_('ap.form_code'), formCode], [lab_('rpt.number'), data.report_run_code || ''], [lab_('rpt.generated_at'), gen]],
      left: left, right: [[lab_('rpt.prepared_by'), data.generated_by_name || '']]
    };
    if (types.length) {
      types.forEach(function (ut, i) {
        if (i) pd.body.appendPageBreak();
        reportUtilSection_(pd, data, ut, head, (opts.charts || {})[ut] || null);
      });
    } else {
      pdfHead_(pd, head);
      var tiles = reportTiles_(data);
      if (tiles.length) pdfTiles_(pd, tiles);
      reportPdfCharts_(pd, data);
      pdfHeading_(pd, lab_('rpt.detail') + '  ·  ' + lab_('rpt.rows_n', { N: fmtNumSrv_(data.total_rows === undefined ? data.rows.length : data.total_rows) }), 8);
      var hd = cols.map(function (c) { return c.label_vi + '\n' + c.label_zh; });
      var rows = data.rows.map(function (r) { return cols.map(function (c) { return reportCellText_(c, r); }); });
      pdfTable_(pd, hd, rows, cols.map(pdfColType_), { numbered: true });
      if (data.cost_hidden) pdfNote_(pd, lab_('cost.hidden'));
      (data.notes || []).forEach(function (n) { pdfNote_(pd, lab_(n)); });
      if (data.truncated) pdfNote_(pd, lab_('rpt.truncated', { N: data.total_rows }));
      pdfSign_(pd, data.generated_by_name || '');
    }
  } catch (e) {
    try { DriveApp.getFileById(pd.doc.getId()).setTrashed(true); } catch (e2) { /* bỏ qua */ }
    throw e;
  }
  return pdfFinish_(pd);
}

/**
 * PDF hồ sơ/phiếu (export.pdf): title [vi, zh], kv [[nhãn, giá trị]], tables [{title, head, rows, types, cellColor, numbered, note}],
 * costNote, code (mã hồ sơ cho dải đầu và chân trang), preparedName; d4.21: formCode (mã biểu mẫu ISO), wide (A4 ngang),
 * tiles [{label, value}] trước bảng thông tin, kvTitle, notes [chữ], sign [{label, name, date}] thay khối Người lập / Người duyệt.
 */
function entityPdf_(o) {
  var gen = fmtTimeSrv_(isoVN_(now_()));
  var footer = [o.title[0] + (o.code ? ' ' + o.code : ''), o.formCode || '', lab_('rpt.generated_at') + ': ' + gen].filter(Boolean).join('   ·   ');
  var pd = pdfStart_({ wide: !!o.wide, footer: footer });
  try {
    pdfHead_(pd, {
      vi: o.title[0], zh: o.title[1],
      codes: [[lab_('ap.form_code'), o.formCode || ''], [lab_('col.code'), o.code || ''], [lab_('rpt.generated_at'), gen]],
      left: [], right: [[lab_('rpt.prepared_by'), o.preparedName || '']]
    });
    if (o.tiles && o.tiles.length) pdfTiles_(pd, o.tiles);
    pdfHeading_(pd, o.kvTitle || lab_('rpt.info'), 8);
    pdfKv_(pd, o.kv);
    (o.tables || []).forEach(function (t) {
      pdfHeading_(pd, t.title, 10);
      pdfTable_(pd, t.head, t.rows, t.types, { numbered: !!t.numbered, cellColor: t.cellColor, fontSize: t.fontSize || 8, empty: t.empty });
      if (t.note) pdfNote_(pd, t.note);
    });
    (o.notes || []).forEach(function (n) { pdfNote_(pd, n); });
    if (o.costNote) pdfNote_(pd, lab_('cost.hidden'));
    if (o.sign) pdfSignCols_(pd, o.sign);
    else pdfSign_(pd, o.preparedName || '');
  } catch (e) {
    try { DriveApp.getFileById(pd.doc.getId()).setTrashed(true); } catch (e2) { /* bỏ qua */ }
    throw e;
  }
  return pdfFinish_(pd);
}

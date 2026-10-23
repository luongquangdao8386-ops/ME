/* 35_report_pdf: Logo công ty trên báo cáo và PDF có định dạng (bản 1.0.0-d4.11, người dùng yêu cầu 23/10/2026).
 * Logo công ty (không phải logo app 57 — logo 57 vẫn không ở báo cáo): tệp riêng tư trong thư mục dữ liệu app, Settings giữ ID tệp
 * và mã phiên bản; C4 tải lên/gỡ ở Quản trị. Không có logo → báo cáo như cũ, không chừa chỗ trống.
 * PDF dựng bằng Google Docs: đầu trang mỗi trang là logo; chân trang là tên báo cáo, số báo cáo, thời gian lập; trang đầu có khối tiêu đề
 * hai thứ tiếng, thông tin hai cột, tóm tắt dạng ô, biểu đồ thanh (ký tự khối, một màu, số ghi bằng chữ), bảng chi tiết (cột #, độ rộng
 * theo nội dung, số căn phải, hàng xen kẽ), chú thích, khối Người lập / Người duyệt.
 * Chỉ dùng phương thức DocumentApp có trong tài liệu Apps Script (setAttributes, editAsText, setAlignment, setColumnWidth…);
 * định dạng từng ô có hạn thời gian để PDF 500 dòng vẫn xong trước khi app hết chờ. */

var REPORT_LOGO_MAX_BYTES_ = 1048576;
var PDF_C_ = {
  navy: '#17324F', ink: '#1F2933', muted: '#5B6875', line: '#C9D3DF', head: '#E6ECF3', zebra: '#F7F9FC', tile: '#F1F5F9', white: '#FFFFFF',
  good: '#1E7B4A', bad: '#B42318', bar: '#2A78D6', elec: '#EB6834', water: '#2A78D6', elecLight: '#F6C1AA', waterLight: '#AFCBEF'
};
var PDF_STYLE_BUDGET_MS_ = 12000;
var PDF_LOGO_PX_H_ = 56;   // chiều cao logo đầu trang (Docs tính px ≈ 0,75 pt → khoảng 42 pt, 1,5 cm)
var PDF_MARGIN_ = 40;
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
 * Tạo tài liệu tạm: khổ A4 (ngang khi `wide`), lề, đầu trang có logo (nếu có), chân trang một dòng.
 * Trả {doc, body, width (pt dùng được), t0, logo}.
 */
function pdfStart_(opts) {
  var doc = DocumentApp.create('ME_TMP_' + uuid_());
  var body = doc.getBody();
  var pageW = opts.wide ? 842 : 595, pageH = opts.wide ? 595 : 842;
  body.setPageWidth(pageW);
  body.setPageHeight(pageH);
  var logo = opts.logo === undefined ? reportLogoBlob_() : opts.logo;
  body.setMarginLeft(PDF_MARGIN_).setMarginRight(PDF_MARGIN_).setMarginBottom(44).setMarginTop(logo ? 84 : 40);
  if (logo) {
    try {
      var hs = doc.addHeader();
      var hp = hs.getParagraphs()[0] || hs.appendParagraph('');
      pdfPara_(hp, { align: 'LEFT' });
      var img = hp.appendInlineImage(logo);
      var w0 = img.getWidth(), h0 = img.getHeight();
      var h = PDF_LOGO_PX_H_, w = w0 && h0 ? Math.round(h * w0 / h0) : h;
      if (w > 220) { w = 220; h = w0 && h0 ? Math.round(w * h0 / w0) : h; }
      img.setWidth(w).setHeight(h);
    } catch (e) { logo = null; body.setMarginTop(40); }
  }
  if (opts.footer) {
    var fs = doc.addFooter();
    var fp = fs.getParagraphs()[0] || fs.appendParagraph('');
    fp.setText(opts.footer);
    pdfPara_(fp, { align: 'CENTER', text: true, size: 7, color: PDF_C_.muted });
  }
  return { doc: doc, body: body, width: pageW - 2 * PDF_MARGIN_, t0: Date.now(), logo: !!logo };
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

/** Khối tiêu đề: dòng Việt to, dòng Trung dưới, căn giữa (dùng đoạn trống đầu thân tài liệu) */
function pdfTitle_(pd, vi, zh) {
  var p0 = pd.body.getParagraphs()[0];
  p0.setText(vi || zh || '');
  pdfPara_(p0, { align: 'CENTER', after: zh && vi ? 2 : 10, text: true, size: 16, color: PDF_C_.navy, bold: true });
  if (zh && vi) pdfPara_(pd.body.appendParagraph(zh), { align: 'CENTER', after: 10, text: true, size: 12, color: PDF_C_.navy, bold: true });
}

function pdfHeading_(pd, text, before) {
  return pdfPara_(pd.body.appendParagraph(text), { before: before === undefined ? 12 : before, after: 4, text: true, size: 10, color: PDF_C_.navy, bold: true });
}

function pdfNote_(pd, text) {
  return pdfPara_(pd.body.appendParagraph(text), { before: 2, text: true, size: 8, color: PDF_C_.muted, italic: true });
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

/** Thông tin hai cột: trái (kỳ, khu vực, lọc), phải (số báo cáo, ngày lập, người lập — căn phải). lines = [[nhãn, giá trị]] */
function pdfMeta_(pd, left, right) {
  var fmt = function (l) { return l[1] ? l[0] + ': ' + l[1] : l[0]; };
  var t = pdfPlain_(pd.body.appendTable([[left.map(fmt).join('\n'), right.map(fmt).join('\n')]]));
  t.setColumnWidth(0, Math.round(pd.width * 0.56)).setColumnWidth(1, pd.width - Math.round(pd.width * 0.56));
  pdfText_(t, 9, PDF_C_.ink);
  var r = t.getRow(0);
  pdfCellPad_(r.getCell(0), 2, 0);
  pdfCellPad_(r.getCell(1), 2, 0);
  pdfCellAlign_(r.getCell(1), 'RIGHT');
  return t;
}

/** Ô số tóm tắt: tối đa 4 ô một hàng; mỗi ô nhãn nhỏ xám + số đậm. items = [{label, value}] */
function pdfTiles_(pd, items) {
  if (!items.length) return null;
  var per = 4; // cố định 4 cột: ít ô thì ô vẫn cỡ vừa, phần còn lại trống (không nền)
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
    pdfCellPad_(c, 5, 7);
    var p0 = c.getChild(0).asParagraph();
    p0.setText(it.label);
    pdfText_(p0, 8, PDF_C_.muted, false);
    var p1 = c.appendParagraph(it.value);
    pdfPara_(p1, { before: 2, text: true, size: it.value.length > 18 ? 10 : 13, color: PDF_C_.navy, bold: true });
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
function pdfColWidths_(head, rows, types, avail, fixed0) {
  var n = head.length;
  var longest = function (s) { return String(s || '').split('\n').reduce(function (m, x) { return Math.max(m, x.length); }, 0); };
  var ideal = [];
  for (var c = 0; c < n; c++) {
    if (fixed0 && c === 0) { ideal.push(fixed0); continue; }
    var lens = rows.map(function (r) { return longest(r[c]); }).sort(function (a, b) { return a - b; });
    var p90 = lens.length ? lens[Math.min(lens.length - 1, Math.floor(lens.length * 0.9))] : 0;
    var hl = longest(head[c]);
    var ty = types[c] || 'text';
    var cap = ty === 'num' || ty === 'money' || ty === 'date' ? 16 : (ty === 'time' ? 16 : (ty === 'code' ? 18 : 42));
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
  var widths = pdfColWidths_(h, data, ty, pd.width, numbered ? 24 : 0);
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
  pdfPara_(spacer, { before: 14 });
  var hint = lab_('rpt.sign_hint');
  var t = pdfPlain_(pd.body.appendTable([
    [lab_('rpt.prepared_by'), lab_('rpt.approved_by')],
    [hint, hint],
    ['\n\n\n', '\n\n\n'],
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

/* ---------------- PDF báo cáo (8 mẫu, bản đã lưu) ---------------- */

function pdfColType_(c) {
  if (c.type === 'num' || c.type === 'money' || c.type === 'date' || c.type === 'time' || c.type === 'code') return c.type;
  return 'text';
}

/** Nhãn kỳ ngắn cho biểu đồ (tháng: mm/yyyy; ngày: dd/mm/yyyy; khoảng: dd/mm – dd/mm/yyyy) */
function pdfPeriodLabel_(type, a, b) {
  if (type === 'MONTH') return a.slice(5, 7) + '/' + a.slice(0, 4);
  if (a === b) return fmtDateVN_(a);
  return a.slice(8, 10) + '/' + a.slice(5, 7) + ' – ' + fmtDateVN_(b);
}

/** Biểu đồ của báo cáo: đếm theo trạng thái (một màu); điện, nước theo kỳ (mỗi loại một biểu đồ, không chung trục) */
function reportPdfCharts_(pd, data) {
  var ch = data.chart;
  if (!ch) return;
  if (ch.series && ch.series.length) {
    pdfBars_(pd, lab_('rpt.chart'), ch.series.map(function (s) {
      return { label: lab_(s.enumKey + '.' + s.key), value: Number(s.value) || 0, text: fmtNumSrv_(s.value) };
    }), PDF_C_.bar);
    return;
  }
  if (!ch.line || !ch.line.length) return;
  var pt = (data.period && data.period.period_type) || 'MONTH';
  ['ELECTRICITY', 'WATER'].forEach(function (ut) {
    if (!ch.line.some(function (p) { return p.totals && p.totals[ut]; })) return;
    var unit = UTILITY_UNIT_[ut];
    var items = ch.line.map(function (p) {
      var x = (p.totals || {})[ut];
      var label = pdfPeriodLabel_(pt, p.period_start, p.period_end);
      if (!x || !x.ok) return { label: label, value: null, text: lab_(x && x.open ? 'utility_status.OPEN_PERIOD' : 'utility_status.NO_READING') };
      var part = x.open || x.partial;
      return { label: label, value: x.consumption, light: part, text: fmtNumSrv_(x.consumption) + ' ' + unit + (part ? ' (' + lab_(x.open ? 'utility_status.OPEN_PERIOD' : 'ut.partial') + ')' : '') };
    });
    pdfBars_(pd, lab_(ut === 'WATER' ? 'ut.chart_water' : 'ut.chart_elec') + ' (' + unit + ')', items,
      ut === 'WATER' ? PDF_C_.water : PDF_C_.elec, ut === 'WATER' ? PDF_C_.waterLight : PDF_C_.elecLight);
  });
}

/**
 * Dựng PDF một báo cáo (dữ liệu của reportCompute_ hoặc bản chụp đã lưu). Không cụm nhận diện app (1.4 §3.5); logo là logo công ty
 * do quản trị tải lên (nếu có).
 */
function reportPdf_(data) {
  var cols = data.columns || [];
  var titleVi = data.title_vi || '', titleZh = data.title_zh || '';
  var gen = fmtTimeSrv_(data.generated_at);
  var footer = [titleVi || titleZh, data.report_run_code ? lab_('rpt.number') + ': ' + data.report_run_code : '', lab_('rpt.generated_at') + ': ' + gen]
    .filter(Boolean).join('   ·   ');
  var pd = pdfStart_({ wide: cols.length > 7, footer: footer });
  try {
    pdfTitle_(pd, titleVi, titleZh);
    var left = reportFilterLines_(data).map(function (x) { var i = x.indexOf(': '); return i > 0 ? [x.slice(0, i), x.slice(i + 2)] : [x, '']; });
    var right = [];
    if (data.report_run_code) right.push([lab_('rpt.number'), data.report_run_code]);
    right.push([lab_('rpt.generated_at'), gen]);
    right.push([lab_('rpt.prepared_by'), data.generated_by_name || '']);
    pdfMeta_(pd, left, right);
    var tiles = (data.summary || []).map(function (s) {
      var label = s.enumKey ? lab_(s.enumKey + '.' + s.enum) + (s.label_vi ? ' — ' + s.label_vi + ' · ' + s.label_zh : '') : s.label_vi + ' · ' + s.label_zh;
      var val = s.money ? fmtMoneySrv_(s.value, s.currency) : (s.value === null ? lab_(s.na_key || 'field.not_set') : fmtNumSrv_(s.value) + (s.unit ? (s.unit === '%' ? '%' : ' ' + s.unit) : ''));
      return { label: label, value: val, note: s.partial ? lab_('ut.partial') : '' };
    });
    if (tiles.length) { pdfHeading_(pd, lab_('rpt.summary'), 10); pdfTiles_(pd, tiles); }
    reportPdfCharts_(pd, data);
    pdfHeading_(pd, lab_('rpt.detail') + '  ·  ' + lab_('rpt.rows_n', { N: fmtNumSrv_(data.total_rows === undefined ? data.rows.length : data.total_rows) }), 12);
    var head = cols.map(function (c) { return c.label_vi + '\n' + c.label_zh; });
    var rows = data.rows.map(function (r) { return cols.map(function (c) { return reportCellText_(c, r); }); });
    pdfTable_(pd, head, rows, cols.map(pdfColType_), { numbered: true });
    if (data.cost_hidden) pdfNote_(pd, lab_('cost.hidden'));
    (data.notes || []).forEach(function (n) { pdfNote_(pd, lab_(n)); });
    if (data.truncated) pdfNote_(pd, lab_('rpt.truncated', { N: data.total_rows }));
    pdfSign_(pd, data.generated_by_name || '');
  } catch (e) {
    try { DriveApp.getFileById(pd.doc.getId()).setTrashed(true); } catch (e2) { /* bỏ qua */ }
    throw e;
  }
  return pdfFinish_(pd);
}

/**
 * PDF hồ sơ/phiếu (export.pdf): title [vi, zh], kv [[nhãn, giá trị]], tables [{title, head, rows, types, cellColor}], costNote,
 * code (mã hồ sơ cho chân trang), preparedName.
 */
function entityPdf_(o) {
  var gen = fmtTimeSrv_(isoVN_(now_()));
  var footer = [o.title[0] + (o.code ? ' ' + o.code : ''), lab_('rpt.generated_at') + ': ' + gen].join('   ·   ');
  var pd = pdfStart_({ wide: false, footer: footer });
  try {
    pdfTitle_(pd, o.title[0], o.title[1]);
    pdfMeta_(pd, o.code ? [[lab_('col.code'), o.code]] : [], [[lab_('rpt.generated_at'), gen], [lab_('rpt.prepared_by'), o.preparedName || '']]);
    pdfHeading_(pd, lab_('rpt.info'), 10);
    pdfKv_(pd, o.kv);
    (o.tables || []).forEach(function (t) {
      pdfHeading_(pd, t.title, 12);
      pdfTable_(pd, t.head, t.rows, t.types, { numbered: false, cellColor: t.cellColor, fontSize: 8 });
    });
    if (o.costNote) pdfNote_(pd, lab_('cost.hidden'));
    pdfSign_(pd, o.preparedName || '');
  } catch (e) {
    try { DriveApp.getFileById(pd.doc.getId()).setTrashed(true); } catch (e2) { /* bỏ qua */ }
    throw e;
  }
  return pdfFinish_(pd);
}

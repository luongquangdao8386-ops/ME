/* 21_i18n: từ điển thuật ngữ khi dịch, gợi ý dịch, dịch lại — phụ lục 1.5 mục 2.3 (quy tắc 4, 8), 3.9, 4.4.17.
 * Thuật ngữ chỉ dùng dòng active có approved_by; cả chuỗi trùng → GLOSSARY; chứa thuật ngữ → token ⟦n⟧ rồi dịch. */

/** Thuật ngữ đã duyệt, cache 600 giây (3.9) */
function glossaryTerms_() {
  if (DB_.glossary) return DB_.glossary;
  var c = cache_().get('glossary:approved');
  var list;
  if (c) {
    list = JSON.parse(c);
  } else {
    list = readRows_('Glossary').filter(function (g) {
      return g.active && g.approved_by && !g.archived_at && trimStr_(g.term_vi) && trimStr_(g.term_zh);
    }).map(function (g) { return { vi: trimStr_(g.term_vi), zh: trimStr_(g.term_zh) }; });
    try { cache_().put('glossary:approved', JSON.stringify(list), 600); } catch (e) { /* quá cỡ: đọc lại lần sau */ }
  }
  DB_.glossary = list;
  return list;
}

function normTerm_(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function escapeRe_(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Cả chuỗi trùng một thuật ngữ: trả bản đích, không thì null */
function glossaryExact_(text, src, tgt) {
  var n = normTerm_(text);
  if (!n) return null;
  var terms = glossaryTerms_();
  for (var i = 0; i < terms.length; i++) if (normTerm_(terms[i][src]) === n) return terms[i][tgt];
  return null;
}

/** Mã hiển thị, model/serial dạng mã, số kèm đơn vị: giữ nguyên qua token */
var KEEP_RE_ = /\b[A-Z]{1,6}-[0-9A-Z]{2,}(?:-[0-9A-Z]+)*\b|\d+(?:[.,]\d+)?\s?(?:kVA|kWh|kW|kg\/h|t\/h|m³\/h|m3\/h|MPa|bar|°C|Hz|mm|kg|V|A)(?![A-Za-z])/g;

/**
 * Dịch có thuật ngữ (2.3 quy tắc 4). Trả {text, state: 'GLOSSARY'|'MACHINE'} hoặc null khi dịch lỗi.
 * Người gọi kiểm mtEnabled_ trước khi cần dịch máy.
 */
function translateText_(text, src, tgt) {
  var exact = glossaryExact_(text, src, tgt);
  if (exact) return { text: exact, state: 'GLOSSARY' };
  var tokens = [];
  var put = function (v) { tokens.push(v); return '⟦' + (tokens.length - 1) + '⟧'; };
  var work = String(text);
  glossaryTerms_().filter(function (t) { return t[src]; })
    .sort(function (a, b) { return b[src].length - a[src].length; })
    .forEach(function (t) {
      work = work.replace(new RegExp(escapeRe_(t[src]), 'gi'), function () { return put(t[tgt]); });
    });
  work = work.replace(KEEP_RE_, function (m) { return put(m); });
  var out = mtTranslate_(work, src, tgt);
  if (!out) return null;
  if (!tokens.length) return { text: out, state: 'MACHINE' };
  // Thiếu hoặc thừa token → coi như dịch lỗi
  var seen = {};
  var bad = false;
  var res = out.replace(/⟦\s*(\d+)\s*⟧/g, function (m, d) {
    var i = Number(d);
    if (i >= tokens.length || seen[i]) { bad = true; return m; }
    seen[i] = true;
    return tokens[i];
  });
  if (bad || Object.keys(seen).length !== tokens.length) return null;
  return { text: res, state: 'MACHINE' };
}

/** Bảng có dịch máy (dịch bù, dịch lại) — trường gốc */
var MT_SHEETS_ = {
  Equipment: ['name'], Documents: ['title'], Materials: ['name', 'specification'], EquipmentParts: ['function', 'position'],
  Contracts: ['title'], Locations: ['name'], LookupValues: ['name'], Vendors: ['services']
};

/**
 * Dịch một trường PENDING của một dòng và ghi (không tăng record_version, 2.3 quy tắc 8).
 * Gọi ngoài khóa ghi; ghi dưới khóa sau khi so lại bản gốc. Trả true nếu đã ghi.
 */
function fillPendingField_(sheet, r, f, actorId, opId) {
  var m = r.i18n_meta && r.i18n_meta[f];
  if (!m || m.state !== 'PENDING') return false;
  var tgt = m.src === 'vi' ? 'zh' : 'vi';
  var srcText = trimStr_(r[f + '_' + m.src]);
  if (!srcText) return false;
  var tr = translateText_(srcText, m.src, tgt);
  if (!tr) return false;
  var key = sheetSchema_(sheet).key;
  return withWriteLock_(function () {
    var rn = findRowNums_(sheet, key, r[key])[0];
    if (!rn) return false;
    var cur = readRowAt_(sheet, rn);
    if (trimStr_(cur[f + '_' + m.src]) !== srcText) return false;
    var meta = cur.i18n_meta || {};
    if (!meta[f] || meta[f].state !== 'PENDING') return false;
    meta[f] = { src: m.src, state: tr.state, at: isoVN_(now_()) };
    var st = readState_();
    var rev = Number(stateGet_(st, 'sync_revision', 0)) + 1;
    var upd = { i18n_meta: meta };
    if (sheetSchema_(sheet).cols.indexOf('sync_revision') >= 0) upd.sync_revision = rev;
    upd[f + '_' + tgt] = tr.text;
    writeCells_(sheet, rn, upd);
    var su = { sync_revision: ['INT', rev] };
    su['table_rev.' + sheet] = ['INT', rev];
    stateWrite_(st, su, actorId);
    writeAudit_({ user_id: actorId, action: 'i18n.machineTranslate', entity_type: sheet, entity_id: r[key], before_json: null, after_json: { field: f, state: tr.state }, operation_id: opId || '', auth_basis: actorId === SYSTEM_USER ? 'SYSTEM' : 'ROLE_LEVEL' });
    return true;
  });
}

/** Mỗi 3 giờ: dịch bù trường PENDING (2.3); không tăng record_version */
function runBackgroundJobs() {
  if (prop_('MAINTENANCE_MODE') === 'true') return;
  if (!mtEnabled_()) return;
  var t0 = Date.now();
  var done = 0;
  Object.keys(MT_SHEETS_).forEach(function (sheet) {
    if (Date.now() - t0 > 150000) return;
    readRows_(sheet).forEach(function (r) {
      if (Date.now() - t0 > 150000 || !r.i18n_meta || !mtEnabled_()) return;
      MT_SHEETS_[sheet].forEach(function (f) {
        if (fillPendingField_(sheet, r, f, SYSTEM_USER)) done++;
      });
    });
  });
  recordTriggerRun_('runBackgroundJobs', t0);
  log_('runBackgroundJobs: dịch bù ' + done + ' trường.');
}

/* ---------------- Gợi ý dịch, dịch lại (4.4.17) ---------------- */

/** i18n.suggest {module, text, from}: trả bản dịch gợi ý, không lưu gì. Cần cờ C hoặc E của module hồ sơ */
function i18nSuggest_(ctx) {
  var p = ctx.req.payload || {};
  var mod = String(p.module || '');
  if (BUSINESS_MODULES_.indexOf(mod) < 0) throw validationError_([fieldError_('module', 'INVALID_VALUE')]);
  authorize_(ctx, 'i18n.suggest', { module: mod });
  var from = p.from === 'zh' ? 'zh' : 'vi', to = from === 'vi' ? 'zh' : 'vi';
  var text = trimStr_(p.text);
  if (!text) throw validationError_([fieldError_('text', 'REQUIRED')]);
  if (text.length > 2000) throw validationError_([fieldError_('text', 'INVALID_VALUE')]);
  if (!setting_('machine_translation_enabled')) throw apiError_('FEATURE_NOT_ENABLED');
  var tr = translateText_(text, from, to);
  if (!tr) throw apiError_('SERVER_BUSY');
  return { text: tr.text, from: from, to: to, state: tr.state };
}

/** Loại hồ sơ → sheet, action sửa (quyền "theo hồ sơ"), module */
var RETRANSLATE_ = {
  EQUIPMENT: { sheet: 'Equipment', edit: 'equipment.edit' },
  MATERIAL: { sheet: 'Materials', edit: 'material.edit' },
  EQUIPMENT_PART: { sheet: 'EquipmentParts', edit: 'part.link' },
  CONTRACT: { sheet: 'Contracts', edit: 'contract.edit' },
  LOCATION: { sheet: 'Locations', edit: 'location.edit' },
  VENDOR: { sheet: 'Vendors', edit: 'vendor.edit' },
  LOOKUP: { sheet: 'LookupValues', edit: 'lookup.edit' },
  DOCUMENT: { sheet: 'Documents', edit: 'doc.upload' }
};

/** i18n.retranslate {entity_type, entity_id}: dịch lại các trường PENDING của hồ sơ; chỉ người sửa được hồ sơ */
function i18nRetranslate_(ctx) {
  var p = ctx.req.payload || {};
  var cfg = RETRANSLATE_[p.entity_type];
  if (!cfg) throw validationError_([fieldError_('entity_type', 'INVALID_VALUE')]);
  if (!isUuidV4_(p.entity_id)) throw validationError_([fieldError_('entity_id', 'ID_INVALID')]);
  var row = findOne_(cfg.sheet, sheetSchema_(cfg.sheet).key, p.entity_id);
  if (!row) throw apiError_('NOT_FOUND');
  var mod = p.entity_type === 'DOCUMENT' ? docModule_(row.entity_type) : ENTITY_TYPES[p.entity_type] ? ENTITY_TYPES[p.entity_type].module :
    (p.entity_type === 'EQUIPMENT_PART' ? 'equipment' : 'catalog');
  if (!mod || !can_(ctx, cfg.edit, { module: mod }) || !can_(ctx, 'i18n.retranslate', { module: mod })) throw apiError_('FORBIDDEN');
  if (!mtEnabled_()) throw apiError_('FEATURE_NOT_ENABLED');
  var done = [], left = [];
  (MT_SHEETS_[cfg.sheet] || []).forEach(function (f) {
    var m = row.i18n_meta && row.i18n_meta[f];
    if (!m || m.state !== 'PENDING') return;
    if (fillPendingField_(cfg.sheet, row, f, ctx.user.user_id, ctx.req.operation_id)) done.push(f); else left.push(f);
  });
  dbReset_();
  var cur = findOne_(cfg.sheet, sheetSchema_(cfg.sheet).key, p.entity_id);
  return { entity_type: p.entity_type, entity_id: p.entity_id, translated: done, pending: left, record: cfg.sheet === 'Documents' ? projectDoc_(ctx, cur) : projectRow_(ctx, cur, cfg.sheet) };
}

/* 08_ops: Operations (chống ghi trùng), mã hiển thị, qr_key, AuditLogs, dịch máy
 * (1.4 §10.3.1, §16.2; phụ lục 1.5 mục 2.3, 3.3, 3.4, 3.15) */

/** Băm payload chuẩn hóa: action, hồ sơ, expected_version, epoch, người dùng (1.4 §10.3.1) */
function payloadHash_(ctx) {
  var req = ctx.req;
  var norm = normalizeForHash_(req.payload || {});
  return b64url_(sha256_(stableStringify_({
    action: req.action, expected_version: req.expected_version === undefined ? null : req.expected_version,
    dataset_epoch: req.dataset_epoch, user_id: ctx.user.user_id, payload: norm
  })));
}

function normalizeForHash_(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(normalizeForHash_);
  var out = {};
  Object.keys(o).forEach(function (k) {
    if (SECRET_KEYS_.indexOf(k) >= 0) return;
    if ((k === 'content_b64' || k === 'thumb_b64') && typeof o[k] === 'string') { out[k] = 'sha:' + b64url_(sha256_(o[k])); return; }
    out[k] = normalizeForHash_(o[k]);
  });
  return out;
}

function writeAudit_(a) {
  var lim = function (v) {
    if (v === null || v === undefined) return '';
    var s = JSON.stringify(redact_(v));
    return s.length > 4000 ? JSON.stringify({ truncated: true, size: s.length }) : s;
  };
  insertRows_('AuditLogs', [{
    audit_id: uuid_(), occurred_at: isoVN_(now_()), user_id: a.user_id, device_id: isUuidV4_(a.device_id) ? a.device_id : '',
    action: a.action, entity_type: a.entity_type || '', entity_id: a.entity_id || '', before_json: lim(a.before_json),
    after_json: lim(a.after_json), operation_id: a.operation_id || '', import_batch_id: a.import_batch_id || '',
    dataset_epoch: sysProps_().dataset_epoch, reason: a.reason || '', auth_basis: a.auth_basis || ''
  }]);
}

/** Phản hồi khi operation_id đã có (3.15) */
function existingOpResponse_(ctx, ex, hash) {
  if (ex.user_id !== ctx.user.user_id || ex.payload_hash !== hash || ex.action !== ctx.req.action) {
    throw apiError_('OPERATION_ID_REUSED');
  }
  if (ex.state === 'COMMITTED') {
    var data = ex.result_json || null;
    return { ok: true, code: 'DUPLICATE_OPERATION', state: 'COMMITTED', data: data, record_version: data ? data.record_version : null };
  }
  if (ex.state === 'PREPARED') return replayPrepared_(ctx, ex);
  throw apiError_('RECOVERY_REQUIRED', { operation_state: ex.state });
}

/** Ghi các dòng của kế hoạch. Chế độ replay: bỏ qua dòng đã có/đã áp. */
function applyWrites_(writes, replay) {
  var inserts = {};
  writes.forEach(function (w) {
    if (w.mode === 'insert') {
      if (replay) {
        var key = sheetSchema_(w.sheet).key;
        if (findRowNums_(w.sheet, key, w.row[key]).length) return;
      }
      (inserts[w.sheet] = inserts[w.sheet] || []).push(w.row);
    } else if (w.mode === 'update') {
      var keyU = sheetSchema_(w.sheet).key;
      var rn = findRowNums_(w.sheet, keyU, w.row[keyU])[0];
      if (!rn) throw apiError_('RECOVERY_REQUIRED', { missing: w.sheet });
      if (replay && w.row.record_version !== undefined) {
        var cur = readRowAt_(w.sheet, rn);
        if ((cur.record_version || 0) >= w.row.record_version) return;
      }
      if (w.partial) writeCells_(w.sheet, rn, w.row); else writeRow_(w.sheet, rn, w.row);
    }
  });
  Object.keys(inserts).forEach(function (s) { insertRows_(s, inserts[s]); });
}

function replayPrepared_(ctx, ex) {
  var intent = ex.intent_json;
  if (!intent || !intent.writes) throw apiError_('RECOVERY_REQUIRED', { operation_state: 'PREPARED' });
  var st = readState_();
  applyWrites_(intent.writes, true);
  var su = {};
  Object.keys(intent.state || {}).forEach(function (k) {
    var v = intent.state[k];
    if (v[0] === 'INT' && Number(stateGet_(st, k, 0)) >= Number(v[1])) return;
    su[k] = v;
  });
  if (Object.keys(su).length) stateWrite_(st, su, ctx.user.user_id);
  if (intent.audit) writeAudit_(intent.audit);
  writeCells_('Operations', ex.__row, {
    state: 'COMMITTED', result_code: 'OK', committed_at: isoVN_(now_()), result_json: JSON.stringify(intent.result || null)
  });
  return { ok: true, code: 'DUPLICATE_OPERATION', state: 'COMMITTED', data: intent.result || null, record_version: intent.result ? intent.result.record_version : null };
}

/**
 * Thực hiện một thao tác ghi có xác nhận COMMITTED.
 * opts.build(st) chạy dưới khóa ghi, trả {writes, state, result, audit, record_version, noReplay}.
 *  - writes: [{sheet, mode:'insert'|'update', row, partial?}]
 *  - state: {khóa SystemState: [kiểu, giá trị]} (vd code_seq)
 *  - audit: {action, entity_type, entity_id, before_json, after_json, reason}
 */
function executeWrite_(ctx, opts) {
  var req = ctx.req;
  var hash = payloadHash_(ctx);
  return withWriteLock_(function () {
    var ex = findOne_('Operations', 'operation_id', req.operation_id);
    if (ex) return existingOpResponse_(ctx, ex, hash);
    var st = readState_();
    var plan = opts.build(st);
    var rev = Number(stateGet_(st, 'sync_revision', 0)) + 1;
    var nowIso = isoVN_(now_());
    var touched = {};
    plan.writes.forEach(function (w) {
      if (sheetSchema_(w.sheet).cols.indexOf('sync_revision') >= 0) w.row.sync_revision = rev;
      touched[w.sheet] = true;
    });
    var su = plan.state || {};
    su.sync_revision = ['INT', rev];
    Object.keys(touched).forEach(function (s) { su['table_rev.' + s] = ['INT', rev]; });
    var audit = null;
    if (plan.audit) {
      audit = {
        user_id: ctx.user.user_id, device_id: req.device_id, action: req.action, entity_type: plan.audit.entity_type,
        entity_id: plan.audit.entity_id, before_json: plan.audit.before_json || null, after_json: plan.audit.after_json || null,
        operation_id: req.operation_id, reason: plan.audit.reason || '', auth_basis: plan.audit.auth_basis || authBasis_(ctx)
      };
    }
    var intent = plan.noReplay ? { no_replay: true } : { writes: plan.writes, state: su, audit: audit, result: plan.result };
    var intentStr = JSON.stringify(intent);
    if (intentStr.length > 40000) intentStr = JSON.stringify({ too_large: true });
    var opRow = {
      operation_id: req.operation_id, user_id: ctx.user.user_id, device_id: isUuidV4_(req.device_id) ? req.device_id : '',
      entity_type: opts.entity_type || '', entity_id: opts.entity_id || '',
      expected_version: req.expected_version === undefined ? '' : req.expected_version, received_at: nowIso,
      state: 'PREPARED', result_code: '', sync_revision: rev, committed_at: '', dataset_epoch: sysProps_().dataset_epoch,
      action: req.action, payload_hash: hash, intent_json: intentStr, progress_json: '', result_json: ''
    };
    insertRows_('Operations', [opRow]);
    applyWrites_(plan.writes, false);
    stateWrite_(st, su, ctx.user.user_id);
    if (audit) writeAudit_(audit);
    writeCells_('Operations', opRow.__row, {
      state: 'COMMITTED', result_code: 'OK', committed_at: isoVN_(now_()), result_json: JSON.stringify(plan.result || null)
    });
    return { ok: true, code: 'OK', state: 'COMMITTED', data: plan.result || null, record_version: plan.record_version };
  });
}

/* ---------------- Mã hiển thị (3.3) ---------------- */

var MANUAL_CODE_RE_ = /^[A-Z0-9][A-Z0-9._\/-]{0,31}$/;

function codeExists_(sheet, col, code) {
  return findRowNums_(sheet, col, code).length > 0;
}

/**
 * Cấp mã hiển thị dưới khóa ghi. Mã nhập tay: chuẩn hóa và kiểm trùng.
 * su: object state update để ghi bộ đếm. Trả mã hoặc ném VALIDATION_ERROR.
 */
function allocCode_(st, su, entityType, manual, bizDate) {
  var et = ENTITY_TYPES[entityType];
  var pat = CODE_PATTERNS[entityType];
  if (manual) {
    var m = trimStr_(manual).toUpperCase();
    if (!pat.manual) throw validationError_([fieldError_(et.code, 'INVALID_VALUE')]);
    if (!MANUAL_CODE_RE_.test(m)) throw validationError_([fieldError_(et.code, 'CODE_INVALID')]);
    if (codeExists_(et.sheet, et.code, m)) throw validationError_([fieldError_(et.code, 'CODE_DUPLICATE')]);
    return m;
  }
  var ym = pat.yymm ? yymm_(bizDate || now_()) : '';
  var key = 'code_seq.' + pat.prefix + (pat.yymm ? '.' + ym : '');
  var n = Number(stateGet_(st, key, 0));
  var code;
  for (var guard = 0; guard < 100000; guard++) {
    n++;
    var num = String(n);
    while (num.length < pat.digits) num = '0' + num;
    code = pat.prefix + '-' + (pat.yymm ? ym + '-' : '') + num;
    if (!codeExists_(et.sheet, et.code, code)) break;
  }
  st.map[key] = n;
  su[key] = ['INT', n];
  return code;
}

/** qr_key mới không trùng (2.8) */
function allocQrKey_() {
  for (var i = 0; i < 5; i++) {
    var k = newQrKey_();
    if (!findRowNums_('QrRegistry', 'qr_key', k).length) return k;
  }
  throw new Error('qr_key collision');
}

function qrRow_(qrKey, entityType, entityId, code, labelVi, labelZh) {
  return {
    qr_key: qrKey, entity_type: entityType, entity_id: entityId, code: code, label_vi: labelVi || '',
    label_zh: labelZh || '', active: true, dataset_epoch: sysProps_().dataset_epoch
  };
}

/** Bộ cột C cho dòng mới */
function cNew_(ctx, row) {
  var nowIso = isoVN_(now_());
  row.dataset_epoch = sysProps_().dataset_epoch;
  row.record_version = 1;
  row.created_at = nowIso; row.created_by = ctx.user.user_id;
  row.updated_at = nowIso; row.updated_by = ctx.user.user_id;
  row.archived_at = '';
  return row;
}

function cUpdate_(ctx, row) {
  row.record_version = (row.record_version || 0) + 1;
  row.updated_at = isoVN_(now_());
  row.updated_by = ctx.user.user_id;
  return row;
}

/** So expected_version với bản trên máy chủ (dưới khóa) */
function assertVersion_(ctx, current, entityType, sheet) {
  var ev = ctx.req.expected_version;
  if (ev === undefined || ev === null || Number(ev) !== Number(current.record_version || 0)) {
    var server = sheet === 'Documents' ? projectDoc_(ctx, current) : projectRow_(ctx, current, sheet);
    throw apiError_('VERSION_CONFLICT', { entity_type: entityType, server: server, server_version: current.record_version });
  }
}

/** Ghi lỗi validation cho ID client tạo (3.3) */
function assertNewId_(sheet, field, id) {
  if (!isUuidV4_(id)) throw validationError_([fieldError_(field, 'ID_INVALID')]);
  if (findRowNums_(sheet, sheetSchema_(sheet).key, id).length) throw validationError_([fieldError_(field, 'ID_EXISTS')]);
}

/* ---------------- Dịch máy (2.3) ---------------- */

/** Commit Excel không dịch (2.3 quy tắc 9): trường cần dịch đặt PENDING cho runBackgroundJobs */
var MT_DEFER_ = false;

function mtEnabled_() {
  if (!setting_('machine_translation_enabled')) return false;
  var paused = parseTime_(sysStateCached_().mt_paused_until);
  return !(paused && paused.getTime() > now_().getTime());
}

/** Dịch một chuỗi; lỗi thì trả null. Cache theo SHA-256(nguồn + chiều). */
function mtTranslate_(text, from, to) {
  if (!text) return '';
  if (isTestEnv_() && prop_('TEST_MT_FAIL') === 'true') return null;
  var ck = 'mt:' + b64url_(sha256_(from + '>' + to + ':' + text));
  var c = cache_().get(ck);
  if (c !== null && c !== undefined) return c;
  try {
    var out = LanguageApp.translate(text, from === 'zh' ? 'zh-CN' : from, to === 'zh' ? 'zh-CN' : to, { contentType: 'text' });
    if (out && out.length < 90000) cache_().put(ck, out, 21600);
    return out;
  } catch (e) {
    var msg = String(e && e.message || e);
    if (/quota|limit|too many/i.test(msg)) {
      try {
        withWriteLock_(function () {
          var st = readState_();
          stateWrite_(st, { mt_paused_until: ['DATETIME', isoVN_(new Date(now_().getTime() + 86400000))] });
        });
        cache_().remove('sys:state');
      } catch (e2) { /* bỏ qua */ }
    }
    return null;
  }
}

/**
 * Điền bên còn thiếu của các cặp trường *_vi/*_zh theo 2.3 (quy tắc 1, 5, 7).
 * fields: tên trường gốc (vd ['name']). current: bản ghi hiện có (khi sửa) hoặc null.
 * Trả {values: {name_vi, name_zh}, meta: i18n_meta mới}. Gọi NGOÀI khóa ghi.
 */
function applyTranslations_(sheet, fields, input, current) {
  var noMt = NO_MT_FIELDS[sheet] || [];
  var meta = current && current.i18n_meta ? clone_(current.i18n_meta) : {};
  var values = {};
  var budgetEnd = now_().getTime() + setting_('mt_sync_budget_seconds') * 1000;
  var nowIso = isoVN_(now_());
  var has = function (k) { return Object.prototype.hasOwnProperty.call(input, k) && input[k] !== undefined && input[k] !== null; };

  function oneSide(f, src, text) {
    var kv = f + '_vi', kz = f + '_zh';
    values[kv] = src === 'vi' ? text : '';
    values[kz] = src === 'zh' ? text : '';
    if (noMt.indexOf(f) >= 0) { meta[f] = { src: src, state: 'MANUAL_REQUIRED', at: nowIso }; return; }
    var tgt = src === 'vi' ? 'zh' : 'vi';
    // Cả chuỗi trùng thuật ngữ đã duyệt: lấy từ điển, không cần dịch máy (2.3 quy tắc 4)
    var g = glossaryExact_(text, src, tgt);
    if (g) { values[tgt === 'zh' ? kz : kv] = g; meta[f] = { src: src, state: 'GLOSSARY', at: nowIso }; return; }
    if (MT_DEFER_ || !mtEnabled_() || now_().getTime() > budgetEnd) { meta[f] = { src: src, state: 'PENDING', at: nowIso }; return; }
    var out = translateText_(text, src, tgt);
    if (out) {
      values[tgt === 'zh' ? kz : kv] = out.text;
      meta[f] = { src: src, state: out.state, at: nowIso };
    } else {
      meta[f] = { src: src, state: 'PENDING', at: nowIso };
    }
  }

  fields.forEach(function (f) {
    var kv = f + '_vi', kz = f + '_zh';
    var curVi = current ? trimStr_(current[kv]) : '', curZh = current ? trimStr_(current[kz]) : '';
    var newVi = has(kv) ? trimStr_(input[kv]) : curVi;
    var newZh = has(kz) ? trimStr_(input[kz]) : curZh;
    var m = meta[f] || null;

    if (current && m && (m.state === 'MACHINE' || m.state === 'PENDING')) {
      var src = m.src, tgt = src === 'vi' ? 'zh' : 'vi';
      var srcNew = src === 'vi' ? newVi : newZh, srcCur = src === 'vi' ? curVi : curZh;
      var tgtNew = tgt === 'vi' ? newVi : newZh, tgtCur = tgt === 'vi' ? curVi : curZh;
      var tgtTouched = has(f + '_' + tgt) && tgtNew !== '' && tgtNew !== tgtCur;
      if (tgtTouched) {
        if (!srcNew) { oneSide(f, tgt, tgtNew); return; }
        values[kv] = newVi; values[kz] = newZh;
        meta[f] = { src: src, state: 'HUMAN', at: nowIso };
        return;
      }
      if (!srcNew) { values[kv] = ''; values[kz] = ''; delete meta[f]; return; }
      if (srcNew !== srcCur || m.state === 'PENDING') { oneSide(f, src, srcNew); return; }
      values[kv] = curVi; values[kz] = curZh;
      return;
    }

    if (newVi && newZh) {
      values[kv] = newVi; values[kz] = newZh;
      if (!current || newVi !== curVi || newZh !== curZh || !m) {
        meta[f] = { src: m ? m.src : (has(kv) ? 'vi' : 'zh'), state: 'HUMAN', at: nowIso };
      }
      return;
    }
    if (!newVi && !newZh) { values[kv] = ''; values[kz] = ''; delete meta[f]; return; }
    var s1 = newVi ? 'vi' : 'zh';
    var t1 = newVi || newZh;
    if (current && m && m.state === 'MANUAL_REQUIRED' && t1 === (s1 === 'vi' ? curVi : curZh)) {
      values[kv] = newVi; values[kz] = newZh;
      return;
    }
    oneSide(f, s1, t1);
  });
  return { values: values, meta: meta };
}

/** Kiểm bắt buộc một thứ tiếng (3.9) */
function requireOneLang_(errs, input, current, f) {
  var vi = input[f + '_vi'] !== undefined ? trimStr_(input[f + '_vi']) : (current ? trimStr_(current[f + '_vi']) : '');
  var zh = input[f + '_zh'] !== undefined ? trimStr_(input[f + '_zh']) : (current ? trimStr_(current[f + '_zh']) : '');
  if (!vi && !zh) errs.push(fieldError_(f, 'REQUIRED_ONE_LANGUAGE'));
}

/* ---------------- Chiếu dữ liệu ra client (4.5) ---------------- */

/** Bỏ khóa nội bộ, khóa giá khi không có quyền giá */
function projectRow_(ctx, row, sheet) {
  if (!row) return null;
  var out = {};
  Object.keys(row).forEach(function (k) { if (k !== '__row') out[k] = row[k]; });
  var s = sheet || row.__sheet;
  if (s && COST_FIELDS[s]) {
    var et = Object.keys(ENTITY_TYPES).filter(function (k) { return ENTITY_TYPES[k].sheet === s; })[0];
    // Dòng con của hợp đồng (ContractEquipment, ContractServices) theo quyền giá của module hợp đồng
    var mod = et ? ENTITY_TYPES[et].module : (s.indexOf('Contract') === 0 ? 'contracts' : null);
    if (!mod || !canViewCost_(ctx, mod)) {
      COST_FIELDS[s].forEach(function (f) { delete out[f]; });
      out.meta = { cost_hidden: true };
    }
  }
  return annotateNames_(out);
}

/** Trường giá trong payload ghi của người không có quyền giá → COST_FIELD_FORBIDDEN */
function assertNoCostFields_(ctx, sheet, module, payload) {
  var fields = COST_FIELDS[sheet] || [];
  if (canViewCost_(ctx, module)) return;
  var bad = fields.filter(function (f) { return payload[f] !== undefined && payload[f] !== null && payload[f] !== ''; });
  if (bad.length) throw validationError_(bad.map(function (f) { return fieldError_(f, 'COST_FIELD_FORBIDDEN'); }));
}

/* 12_docs: ảnh và tài liệu trên Drive (phụ lục 1.5 mục 2.6, 3.10, 4.4.12) */

var DOC_MIME_ = {
  'image/jpeg': { magic: [0xFF, 0xD8, 0xFF], ext: 'jpg' },
  'image/png': { magic: [0x89, 0x50, 0x4E, 0x47], ext: 'png' },
  'application/pdf': { magic: [0x25, 0x50, 0x44, 0x46], ext: 'pdf' }
};

function magicOk_(bytes, mime) {
  var m = DOC_MIME_[mime];
  if (!m) return false;
  for (var i = 0; i < m.magic.length; i++) if (u8_(bytes[i]) !== m.magic[i]) return false;
  return true;
}

function docModule_(entityType) {
  var et = ENTITY_TYPES[entityType];
  return et && et.module ? et.module : null;
}

function appFolder_() {
  var id = prop_('DRIVE_ROOT_FOLDER_ID');
  if (!id) throw apiError_('SYSTEM_NOT_READY');
  return DriveApp.getFolderById(id);
}

/** Bỏ ID Drive của tài liệu riêng tư trước khi gửi cho client (2.6) */
function projectDoc_(ctx, d) {
  var o = projectRow_(ctx, d, 'Documents');
  delete o.managed_folder_id;
  var linkOk = d.access_scope === 'LINK_VIEW' && d.drive_sharing_state === 'LINK_SHARED';
  if (!linkOk) { delete o.drive_file_id; delete o.thumb_drive_file_id; }
  return o;
}

/** Điều kiện cấp 2 cho doc.upload (4.4.12 chú thích 8) */
function docUploadCondOk_(ctx, auth, module, kind, entity) {
  if (!auth.conds.length) return true;
  return auth.conds.some(function (c) {
    if (c === 'SPEC:KY_THUAT') {
      return (module === 'equipment' || module === 'circuits') &&
        ['PHOTO_EQUIPMENT', 'PHOTO_SITE', 'MANUAL', 'DRAWING', 'OTHER'].indexOf(kind) >= 0;
    }
    if (c === 'SPEC:DOC_DIEN_NUOC') return module === 'utilities' && kind === 'PHOTO_METER';
    if (c === 'OWN:BAO_SU_CO') return module === 'repairs' && entity && entity.reported_by === ctx.user.user_id;
    return false;
  });
}

function docUpload_(ctx) {
  var p = ctx.req.payload;
  if (p.external_url !== undefined && p.content_b64 === undefined) return docAddLink_(ctx);
  var errs = [];
  if (!isUuidV4_(p.document_id)) errs.push(fieldError_('document_id', 'ID_INVALID'));
  var et = ENTITY_TYPES[p.entity_type];
  if (!et || !et.module) errs.push(fieldError_('entity_type', 'INVALID_VALUE'));
  if (!isUuidV4_(p.entity_id)) errs.push(fieldError_('entity_id', 'ID_INVALID'));
  var scope = DOC_KIND_SCOPE[p.kind];
  if (!scope) errs.push(fieldError_('kind', 'INVALID_VALUE'));
  if (!DOC_MIME_[p.mime_type]) errs.push(fieldError_('mime_type', 'FILE_TYPE'));
  if (scope === 'LINK_VIEW' && p.mime_type !== 'image/jpeg' && p.mime_type !== 'image/png') errs.push(fieldError_('mime_type', 'FILE_TYPE'));
  if (typeof p.content_b64 !== 'string' || !p.content_b64) errs.push(fieldError_('content_b64', 'REQUIRED'));
  if (p.document_date && !isDateStr_(p.document_date)) errs.push(fieldError_('document_date', 'INVALID_DATE'));
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);

  var module = et.module;
  var auth = authorize_(ctx, 'doc.upload', { module: module });
  var entity = findOne_(et.sheet, et.key, p.entity_id);
  if (!entity || entity.archived_at) throw validationError_([fieldError_('entity_id', 'NOT_FOUND')]);
  if (!docUploadCondOk_(ctx, auth, module, p.kind, entity)) throw apiError_('FORBIDDEN');
  if (scope === 'COST_VIEW' && !canViewCost_(ctx, module)) throw apiError_('FORBIDDEN');

  // Đã có thao tác này → không tạo thêm file
  var ex = findOne_('Operations', 'operation_id', ctx.req.operation_id);
  if (ex) return withWriteLock_(function () { return existingOpResponse_(ctx, ex, payloadHash_(ctx)); });
  if (findRowNums_('Documents', 'document_id', p.document_id).length) throw validationError_([fieldError_('document_id', 'ID_EXISTS')]);

  var bytes = b64d_(p.content_b64);
  var maxB = setting_('doc_max_bytes');
  if (bytes.length > maxB) throw validationError_([fieldError_('content_b64', 'FILE_TOO_LARGE')]);
  if (!magicOk_(bytes, p.mime_type)) throw validationError_([fieldError_('mime_type', 'FILE_TYPE')]);
  var thumbBytes = null;
  if (scope === 'LINK_VIEW' && typeof p.thumb_b64 === 'string' && p.thumb_b64) {
    thumbBytes = b64d_(p.thumb_b64);
    if (thumbBytes.length > 2000000 || !magicOk_(thumbBytes, 'image/jpeg')) throw validationError_([fieldError_('thumb_b64', 'FILE_TYPE')]);
  }

  // Drive: ngoài khóa ghi (3.15)
  var folder = appFolder_();
  var ext = DOC_MIME_[p.mime_type].ext;
  var file = folder.createFile(Utilities.newBlob(bytes, p.mime_type, p.document_id + '.' + ext));
  var thumb = thumbBytes ? folder.createFile(Utilities.newBlob(thumbBytes, 'image/jpeg', p.document_id + '_thumb.jpg')) : null;
  var sharing = 'NOT_SHARED', sharingErr = '';
  if (scope === 'LINK_VIEW') {
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      if (thumb) thumb.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      sharing = 'LINK_SHARED';
    } catch (e) {
      sharing = 'FAILED'; sharingErr = String(e && e.message || e).slice(0, 80);
    }
  }
  var nowIso = isoVN_(now_());
  var trTitle = applyTranslations_('Documents', ['title'], { title_vi: p.title_vi, title_zh: p.title_zh }, null);
  var res;
  try {
    res = executeWrite_(ctx, {
      entity_type: 'DOCUMENT', entity_id: p.document_id,
      build: function () {
        if (findRowNums_('Documents', 'document_id', p.document_id).length) throw validationError_([fieldError_('document_id', 'ID_EXISTS')]);
        var row = {
          document_id: p.document_id, entity_type: p.entity_type, entity_id: p.entity_id,
          title_vi: trTitle.values.title_vi, title_zh: trTitle.values.title_zh, i18n_meta: trTitle.meta,
          kind: p.kind, drive_file_id: file.getId(), external_url: '', mime_type: p.mime_type, file_version: 1,
          access_scope: scope, document_date: p.document_date || dateVN_(now_()), active: true,
          managed_folder_id: folder.getId(), storage_kind: 'DRIVE', owned_by_app: true,
          drive_sharing_state: sharing, sharing_updated_at: nowIso, sharing_error_code: sharingErr,
          size_bytes: bytes.length, thumb_drive_file_id: thumb ? thumb.getId() : ''
        };
        cNew_(ctx, row);
        return {
          writes: [{ sheet: 'Documents', mode: 'insert', row: row }],
          result: { entity_type: 'DOCUMENT', entity_id: p.document_id, document_id: p.document_id, record_version: 1, record: projectDoc_(ctx, row) },
          record_version: 1,
          audit: { entity_type: 'DOCUMENT', entity_id: p.document_id, before_json: null, after_json: { kind: p.kind, entity_type: p.entity_type, entity_id: p.entity_id, size_bytes: bytes.length, access_scope: scope } }
        };
      }
    });
  } catch (e) {
    trashQuietly_(file); trashQuietly_(thumb);
    throw e;
  }
  if (res.code === 'DUPLICATE_OPERATION') { trashQuietly_(file); trashQuietly_(thumb); }
  return res;
}

function trashQuietly_(f) {
  if (!f) return;
  try { f.setTrashed(true); } catch (e) { /* bỏ qua */ }
}

function docForRead_(ctx, documentId, action) {
  if (!isUuidV4_(documentId)) throw validationError_([fieldError_('document_id', 'ID_INVALID')]);
  var d = findOne_('Documents', 'document_id', documentId);
  if (!d || !d.active || d.archived_at) throw apiError_('NOT_FOUND');
  var module = docModule_(d.entity_type);
  authorize_(ctx, action, { module: module });
  if (d.access_scope === 'COST_VIEW' && !canViewCost_(ctx, module)) throw apiError_('FORBIDDEN');
  return d;
}

function docDownload_(ctx) {
  var d = docForRead_(ctx, (ctx.req.payload || {}).document_id, 'doc.download');
  var maxB = setting_('doc_max_bytes');
  if (d.size_bytes && d.size_bytes > maxB) throw validationError_([fieldError_('document_id', 'FILE_TOO_LARGE')]);
  var blob = DriveApp.getFileById(d.drive_file_id).getBlob();
  var bytes = blob.getBytes();
  if (bytes.length > maxB) throw validationError_([fieldError_('document_id', 'FILE_TOO_LARGE')]);
  var ext = DOC_MIME_[d.mime_type] ? DOC_MIME_[d.mime_type].ext : 'bin';
  return {
    document_id: d.document_id, file_name: d.document_id + '.' + ext, mime_type: d.mime_type,
    size_bytes: bytes.length, file_version: d.file_version, content_b64: b64_(bytes)
  };
}

function docThumbs_(ctx) {
  var ids = (ctx.req.payload || {}).document_ids;
  if (!Array.isArray(ids) || ids.length > 30) throw validationError_([fieldError_('document_ids', 'INVALID_VALUE')]);
  var out = {};
  ids.forEach(function (id) {
    try {
      var d = docForRead_(ctx, id, 'doc.thumbs');
      if (d.access_scope !== 'LINK_VIEW' && d.drive_sharing_state !== 'REVOKED') return;
      var fid = d.thumb_drive_file_id || d.drive_file_id;
      out[id] = b64_(DriveApp.getFileById(fid).getBlob().getBytes());
    } catch (e) { /* bỏ ảnh không xem được */ }
  });
  return { thumbs: out };
}

function docView_(ctx) {
  var p = ctx.req.payload || {};
  var module = docModule_(p.entity_type);
  if (!module || !isUuidV4_(p.entity_id)) throw validationError_([fieldError_('entity_id', 'INVALID_VALUE')]);
  authorize_(ctx, 'doc.view', { module: module });
  var cost = canViewCost_(ctx, module);
  var items = findAll_('Documents', 'entity_id', p.entity_id).filter(function (d) {
    return d.active && !d.archived_at && d.entity_type === p.entity_type && (d.access_scope !== 'COST_VIEW' || cost);
  }).map(function (d) { return projectDoc_(ctx, d); });
  return { items: items };
}

/** Đưa file về riêng tư, kiểm lại rồi mới báo REVOKED (2.6) */
function makePrivate_(fileId) {
  var f = DriveApp.getFileById(fileId);
  f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT);
  return f.getSharingAccess() === DriveApp.Access.PRIVATE;
}

function docSetPrivate_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.document_id)) throw validationError_([fieldError_('document_id', 'ID_INVALID')]);
  var d0 = findOne_('Documents', 'document_id', p.document_id);
  if (!d0 || !d0.active) throw apiError_('NOT_FOUND');
  var module = docModule_(d0.entity_type);
  var auth = authorize_(ctx, 'doc.setPrivate', { module: module });
  if (auth.conds.length && d0.created_by !== ctx.user.user_id) throw apiError_('FORBIDDEN');
  // Gửi lại cùng mã thao tác (sau khi đã REVOKED) → trả kết quả cũ trước khi kiểm điều kiện
  var ex = findOne_('Operations', 'operation_id', ctx.req.operation_id);
  if (ex) return withWriteLock_(function () { return existingOpResponse_(ctx, ex, payloadHash_(ctx)); });
  if (d0.access_scope !== 'LINK_VIEW' || d0.drive_sharing_state === 'REVOKED') throw validationError_([fieldError_('document_id', 'INVALID_VALUE')]);
  var ok = true, errCode = '';
  try {
    ok = makePrivate_(d0.drive_file_id);
    if (d0.thumb_drive_file_id) ok = makePrivate_(d0.thumb_drive_file_id) && ok;
  } catch (e) { ok = false; errCode = String(e && e.message || e).slice(0, 80); }
  return executeWrite_(ctx, {
    entity_type: 'DOCUMENT', entity_id: p.document_id,
    build: function () {
      var cur = findOne_('Documents', 'document_id', p.document_id);
      assertVersion_(ctx, cur, 'DOCUMENT', 'Documents');
      var row = clone_(cur);
      row.drive_sharing_state = ok ? 'REVOKED' : 'FAILED';
      row.sharing_updated_at = isoVN_(now_());
      row.sharing_error_code = ok ? '' : (errCode || 'NOT_PRIVATE');
      cUpdate_(ctx, row);
      return {
        writes: [{ sheet: 'Documents', mode: 'update', row: row }],
        result: { entity_type: 'DOCUMENT', entity_id: p.document_id, drive_sharing_state: row.drive_sharing_state, record_version: row.record_version, record: projectDoc_(ctx, row) },
        record_version: row.record_version,
        audit: { entity_type: 'DOCUMENT', entity_id: p.document_id, before_json: { drive_sharing_state: cur.drive_sharing_state }, after_json: { drive_sharing_state: row.drive_sharing_state } }
      };
    }
  });
}

/** doc.upload kèm external_url (không có tệp): liên kết tài liệu ngoài, riêng tư theo loại (EQ-04) */
function docAddLink_(ctx) {
  var p = ctx.req.payload;
  var errs = [];
  if (!isUuidV4_(p.document_id)) errs.push(fieldError_('document_id', 'ID_INVALID'));
  var et = ENTITY_TYPES[p.entity_type];
  if (!et || !et.module) errs.push(fieldError_('entity_type', 'INVALID_VALUE'));
  if (!isUuidV4_(p.entity_id)) errs.push(fieldError_('entity_id', 'ID_INVALID'));
  var scope = DOC_KIND_SCOPE[p.kind];
  if (!scope || scope === 'LINK_VIEW') errs.push(fieldError_('kind', 'INVALID_VALUE'));
  var url = trimStr_(p.external_url);
  if (!/^https:\/\/[^\s<>"]{3,2000}$/.test(url)) errs.push(fieldError_('external_url', 'URL_INVALID'));
  if (p.document_date && !isDateStr_(p.document_date)) errs.push(fieldError_('document_date', 'INVALID_DATE'));
  requireOneLang_(errs, p, null, 'title');
  if (Number(ctx.req.expected_version || 0) !== 0) errs.push(fieldError_('expected_version', 'INVALID_VALUE'));
  if (errs.length) throw validationError_(errs);
  var module = et.module;
  var auth = authorize_(ctx, 'doc.upload', { module: module });
  var entity = findOne_(et.sheet, et.key, p.entity_id);
  if (!entity || entity.archived_at) throw validationError_([fieldError_('entity_id', 'NOT_FOUND')]);
  if (!docUploadCondOk_(ctx, auth, module, p.kind, entity)) throw apiError_('FORBIDDEN');
  if (scope === 'COST_VIEW' && !canViewCost_(ctx, module)) throw apiError_('FORBIDDEN');
  var tr = applyTranslations_('Documents', ['title'], { title_vi: p.title_vi, title_zh: p.title_zh }, null);
  return executeWrite_(ctx, {
    entity_type: 'DOCUMENT', entity_id: p.document_id,
    build: function () {
      if (findRowNums_('Documents', 'document_id', p.document_id).length) throw validationError_([fieldError_('document_id', 'ID_EXISTS')]);
      var row = {
        document_id: p.document_id, entity_type: p.entity_type, entity_id: p.entity_id,
        title_vi: tr.values.title_vi, title_zh: tr.values.title_zh, i18n_meta: tr.meta,
        kind: p.kind, drive_file_id: '', external_url: url, mime_type: '', file_version: 1, access_scope: scope,
        document_date: p.document_date || dateVN_(now_()), active: true, managed_folder_id: '', storage_kind: 'LINK',
        owned_by_app: false, drive_sharing_state: 'NOT_SHARED', sharing_updated_at: '', sharing_error_code: '', size_bytes: '', thumb_drive_file_id: ''
      };
      cNew_(ctx, row);
      return {
        writes: [{ sheet: 'Documents', mode: 'insert', row: row }],
        result: { entity_type: 'DOCUMENT', entity_id: p.document_id, document_id: p.document_id, record_version: 1, record: projectDoc_(ctx, row) },
        record_version: 1,
        audit: { entity_type: 'DOCUMENT', entity_id: p.document_id, before_json: null, after_json: { kind: p.kind, entity_type: p.entity_type, entity_id: p.entity_id, external_url: url } }
      };
    }
  });
}

/** doc.archive: gỡ tài liệu khỏi hồ sơ (không xóa file Drive); ảnh LINK_VIEW đưa về riêng tư (2.6) */
function docArchive_(ctx) {
  var p = ctx.req.payload || {};
  if (!isUuidV4_(p.document_id)) throw validationError_([fieldError_('document_id', 'ID_INVALID')]);
  var d0 = findOne_('Documents', 'document_id', p.document_id);
  if (!d0) throw apiError_('NOT_FOUND');
  var module = docModule_(d0.entity_type);
  var auth = authorize_(ctx, 'doc.archive', { module: module });
  if (auth.conds.length && d0.created_by !== ctx.user.user_id) throw apiError_('FORBIDDEN');
  if (d0.access_scope === 'COST_VIEW' && !canViewCost_(ctx, module)) throw apiError_('FORBIDDEN');
  var ex = findOne_('Operations', 'operation_id', ctx.req.operation_id);
  if (ex) return withWriteLock_(function () { return existingOpResponse_(ctx, ex, payloadHash_(ctx)); });
  if (!d0.active || d0.archived_at) throw validationError_([fieldError_('document_id', 'INVALID_VALUE')]);
  var share = null;
  if (d0.access_scope === 'LINK_VIEW' && d0.drive_sharing_state === 'LINK_SHARED') {
    var ok = true, err = '';
    try {
      ok = makePrivate_(d0.drive_file_id);
      if (d0.thumb_drive_file_id) ok = makePrivate_(d0.thumb_drive_file_id) && ok;
    } catch (e) { ok = false; err = String(e && e.message || e).slice(0, 80); }
    share = { state: ok ? 'REVOKED' : 'FAILED', err: ok ? '' : (err || 'NOT_PRIVATE') };
  }
  return executeWrite_(ctx, {
    entity_type: 'DOCUMENT', entity_id: p.document_id,
    build: function () {
      var cur = findOne_('Documents', 'document_id', p.document_id);
      assertVersion_(ctx, cur, 'DOCUMENT', 'Documents');
      var row = clone_(cur);
      row.active = false;
      row.archived_at = isoVN_(now_());
      if (share) { row.drive_sharing_state = share.state; row.sharing_error_code = share.err; row.sharing_updated_at = row.archived_at; }
      cUpdate_(ctx, row);
      return {
        writes: [{ sheet: 'Documents', mode: 'update', row: row }],
        result: { entity_type: 'DOCUMENT', entity_id: p.document_id, record_version: row.record_version, archived: true },
        record_version: row.record_version,
        audit: { entity_type: 'DOCUMENT', entity_id: p.document_id, before_json: { active: true }, after_json: { active: false, drive_sharing_state: row.drive_sharing_state }, reason: trimStr_(p.reason) }
      };
    }
  });
}

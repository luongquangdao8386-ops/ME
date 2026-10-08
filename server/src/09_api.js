/* 09_api: doPost, doGet, điều phối action (phụ lục 1.5 mục 3.15, 4.2) */

/** Bảng thao tác đã có mã. Action có trong registry mà chưa có ở đây → FEATURE_NOT_ENABLED. */
var HANDLERS_ = {
  'auth.login': function (req) { return authLogin_(req); },
  'auth.reauth': function (ctx) { return authReauth_(ctx); },
  'auth.logout': function (ctx) { return authLogout_(ctx); },
  'auth.logoutAll': function (ctx) { return authLogoutAll_(ctx); },
  'pin.change': function (ctx) { return pinChange_(ctx); },
  'account.view': function (ctx) { return accountView_(ctx); },
  'session.listOwn': function (ctx) { return sessionListOwn_(ctx); },
  'session.revokeOwn': function (ctx) { return sessionRevokeOwn_(ctx); },
  'user.pickList': function (ctx) { return userPickList_(ctx); },
  'system.getPublicState': function (req) { return publicState_(req); },
  'system.health': function () { return { app_id: APP_ID }; },
  'sync.bootstrap': function (ctx) { return syncBootstrap_(ctx); },
  'sync.changes': function (ctx) { return syncChanges_(ctx); },
  'sync.push': function (ctx) { return syncPush_(ctx); },
  'sync.getOperationStatus': function (ctx) { return syncOpStatus_(ctx); },
  'equipment.view': function (ctx) { return equipmentView_(ctx); },
  'equipment.create': function (ctx) { return equipmentCreate_(ctx); },
  'equipment.edit': function (ctx) { return equipmentEdit_(ctx); },
  'equipment.archive': function (ctx) { return equipmentArchive_(ctx); },
  'equipment.unarchive': function (ctx) { return equipmentUnarchive_(ctx); },
  'equipment.spec.edit': function (ctx) { return equipmentSpecEdit_(ctx); },
  'material.view': function (ctx) { return materialView_(ctx); },
  'material.create': function (ctx) { return materialCreate_(ctx); },
  'material.edit': function (ctx) { return materialEdit_(ctx); },
  'material.archive': function (ctx) { return materialArchive_(ctx); },
  'part.link': function (ctx) { return partLink_(ctx); },
  'part.unlink': function (ctx) { return partUnlink_(ctx); },
  'part.approve': function (ctx) { return partApprove_(ctx); },
  'contract.view': function (ctx) { return contractView_(ctx); },
  'contract.create': function (ctx) { return contractCreate_(ctx); },
  'contract.edit': function (ctx) { return contractEdit_(ctx); },
  'contract.editTerms': function (ctx) { return contractEditTerms_(ctx); },
  'contract.archive': function (ctx) { return contractArchive_(ctx); },
  'contract.close': function (ctx) { return contractClose_(ctx); },
  'contract.renewal.create': function (ctx) { return contractRenewalCreate_(ctx); },
  'contract.renewal.submit': function (ctx) { return contractRenewalSubmit_(ctx); },
  'contract.renewal.approve': function (ctx) { return contractRenewalApprove_(ctx); },
  'contract.service.record': function (ctx) { return contractServiceRecord_(ctx); },
  'contract.service.accept': function (ctx) { return contractServiceAccept_(ctx); },
  'inspection.view': function (ctx) { return inspectionView_(ctx); },
  'inspection.submit': function (ctx) { return inspectionSubmit_(ctx); },
  'inspection.type.edit': function (ctx) { return inspectionTypeEdit_(ctx); },
  'inspection.requirement.edit': function (ctx) { return inspectionRequirementEdit_(ctx); },
  'inspection.approve': function (ctx) { return inspectionApprove_(ctx); },
  'inspection.revoke': function (ctx) { return inspectionRevoke_(ctx); },
  'alert.view': function (ctx) { return alertView_(ctx); },
  'alert.acknowledge': function (ctx) { return alertAcknowledge_(ctx); },
  'notify.log.view': function (ctx) { return notifyLogView_(ctx); },
  'notify.recipient.edit': function (ctx) { return notifyRecipientEdit_(ctx); },
  'notify.settings.edit': function (ctx) { return notifySettingsEdit_(ctx); },
  'notify.resend': function (ctx) { return notifyResend_(ctx); },
  'catalog.view': function (ctx) { return catalogView_(ctx); },
  'doc.view': function (ctx) { return docView_(ctx); },
  'doc.upload': function (ctx) { return docUpload_(ctx); },
  'doc.download': function (ctx) { return docDownload_(ctx); },
  'doc.thumbs': function (ctx) { return docThumbs_(ctx); },
  'doc.setPrivate': function (ctx) { return docSetPrivate_(ctx); },
  'doc.archive': function (ctx) { return docArchive_(ctx); },
  'qr.resolve': function (ctx) { return qrResolve_(ctx); },
  'qr.print': function (ctx) { return qrPrint_(ctx); },
  'poc.vectors': function (ctx) { return pocVectors_(ctx); },
  'poc.echo': function (ctx) { return pocEcho_(ctx); },
  'poc.sleep': function (ctx) { return pocSleep_(ctx); },
  'poc.stats': function (ctx) { return pocStats_(ctx); },
  'poc.mail': function (ctx) { return pocMail_(ctx); },
  'poc.translate': function (ctx) { return pocTranslate_(ctx); },
  'poc.makeTestFiles': function (ctx) { return pocMakeTestFiles_(ctx); },
  'poc.driveChecks': function (ctx) { return pocDriveChecks_(ctx); },
  'poc.triggers': function (ctx) { return pocTriggers_(ctx); }
};

/** Thao tác làm đổi hạn: ghi xong thì tính lại Alerts ngay (không đợi trigger hằng ngày) */
var DUE_ACTIONS_ = {
  'inspection.approve': 1, 'inspection.revoke': 1, 'inspection.requirement.edit': 1,
  'contract.create': 1, 'contract.edit': 1, 'contract.editTerms': 1, 'contract.archive': 1, 'contract.close': 1, 'contract.renewal.approve': 1
};

/** Action không cần phiên (chỉ qua bước 1 và 3 của 4.2) */
var PUBLIC_ACTIONS_ = { 'auth.login': 1, 'system.getPublicState': 1, 'system.health': 1 };

/** Action được chạy khi bảo trì (Đợt 1–3) */
var MAINTENANCE_ALLOW_ = { 'system.health': 1, 'system.getPublicState': 1, 'auth.logout': 1 };

function doPost(e) {
  var t0 = Date.now();
  var res;
  propsReset_(true);
  try {
    var body = e && e.postData ? e.postData.contents : '';
    var req;
    try { req = JSON.parse(body); } catch (err) { req = null; }
    if (!req || typeof req !== 'object' || Array.isArray(req)) {
      res = envelope_({}, { ok: false, code: 'VALIDATION_ERROR', errors: [fieldError_('body', 'INVALID_VALUE')] });
    } else {
      res = apiDispatch_(req);
    }
  } catch (err2) {
    res = internalError_({}, err2);
  } finally {
    propsReset_(false);
  }
  res.server_ms = Date.now() - t0;
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var out;
  if (p.action === 'system.health') {
    out = { ok: true, code: 'OK', api_contract_version: API_CONTRACT_VERSION, app_id: APP_ID, server_time: isoVN_(now_()) };
  } else {
    // via:'GET' giúp app nhận ra một POST đã bị chuyển thành GET trên đường đi (P-01)
    if (!p.action) pocNoteGet_();
    out = { ok: false, code: 'NOT_FOUND', via: 'GET', api_contract_version: API_CONTRACT_VERSION, app_id: APP_ID, server_time: isoVN_(now_()) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function publicState_(req) {
  var props = sysProps_();
  var out = {
    app_id: APP_ID, api_contract_version: API_CONTRACT_VERSION, server_version: SERVER_VERSION,
    maintenance_mode: props.maintenance_mode, env: props.env, min_client_version: setting_('min_client_version'),
    ready: !!prop_('BUSINESS_SPREADSHEET_ID')
  };
  var p = (req && req.payload) || {};
  if (p.probe_run && isTestEnv_()) {
    var d = pocProbe_(p);
    if (d) out.probe = d;
  }
  return out;
}

/** Phong bì phản hồi chuẩn (3.15) */
function envelope_(req, r) {
  var props;
  try { props = sysProps_(); } catch (e) { props = { dataset_epoch: '', maintenance_mode: false }; }
  var pair = MSG[r.code] || MSG.INTERNAL_ERROR;
  if (r.code === 'AUTH_REQUIRED' && r.data && (r.data.reason === 'REVOKED' || r.data.reason === 'AUTH_VERSION')) pair = MSG.AUTH_REQUIRED_REVOKED;
  pair = fmtMsg_(pair, r.msgVars);
  return {
    ok: !!r.ok, code: r.code, message_vi: pair[0], message_zh: pair[1],
    data: r.data === undefined ? null : r.data,
    api_contract_version: API_CONTRACT_VERSION, dataset_epoch: props.dataset_epoch || '',
    maintenance_mode: !!props.maintenance_mode,
    operation_id: req && req.operation_id ? String(req.operation_id) : null,
    state: r.state || null, record_version: r.record_version === undefined ? null : r.record_version,
    sync_cursor: r.sync_cursor || null, server_time: isoVN_(now_()), errors: r.errors || []
  };
}

function internalError_(req, err) {
  var id = uuid_();
  console.error('INTERNAL_ERROR ' + id + ' ' + (req && req.action) + ' ' + (err && err.stack ? err.stack : err));
  return envelope_(req, { ok: false, code: 'INTERNAL_ERROR', data: { error_id: id } });
}

function errorToResponse_(req, e) {
  if (e && e.apiCode) {
    return envelope_(req, { ok: false, code: e.apiCode, data: e.apiData, errors: e.apiErrors, msgVars: e.msgVars });
  }
  return internalError_(req, e);
}

/** Điều phối một request (đã parse JSON). Luôn trả object phản hồi. */
function apiDispatch_(req) {
  DB_.rolePerms = null;
  try {
    return dispatchInner_(req, false);
  } catch (e) {
    return errorToResponse_(req, e);
  }
}

function dispatchInner_(req, viaPush) {
  if (typeof req.action !== 'string' || typeof req.payload !== 'object' || req.payload === null || Array.isArray(req.payload)) {
    throw validationError_([fieldError_('action', 'REQUIRED')]);
  }
  if (req.api_contract_version !== API_CONTRACT_VERSION) throw apiError_('CLIENT_UPDATE_REQUIRED');
  // 1. Registry
  var def = ACTION_REGISTRY[req.action];
  if (!def || def.net === 'internal') throw apiError_('FORBIDDEN');
  if (!dotReleased_(def.dot) || !HANDLERS_[req.action]) throw apiError_('FEATURE_NOT_ENABLED');
  if (req.action !== 'system.health' && req.action !== 'system.getPublicState') {
    if (cmpVersion_(req.app_version, setting_('min_client_version')) < 0) throw apiError_('CLIENT_UPDATE_REQUIRED');
    if (!isUuidV4_(req.device_id)) throw validationError_([fieldError_('device_id', 'ID_INVALID')]);
  }
  // 3. Bảo trì
  if (sysProps_().maintenance_mode && !MAINTENANCE_ALLOW_[req.action]) throw apiError_('SYSTEM_MAINTENANCE');
  if (PUBLIC_ACTIONS_[req.action]) {
    if (!prop_('BUSINESS_SPREADSHEET_ID') && req.action !== 'system.health' && req.action !== 'system.getPublicState') throw apiError_('SYSTEM_NOT_READY');
    return envelope_(req, { ok: true, code: 'OK', data: HANDLERS_[req.action](req) });
  }
  // 2. Phiên
  var ctx = requireSession_(req, req.action);
  if (def.write && !isUuidV4_(req.operation_id)) throw validationError_([fieldError_('operation_id', 'ID_INVALID')]);
  // Bước 4–5: module cố định thì kiểm ngay; module theo hồ sơ ('*', '*work', 'contracts|inspections')
  // thì thao tác gọi authorize_ với hồ sơ đích. Action '-' chỉ xét ô theo cấp/subrole.
  var dynamic = def.module === '*' || def.module === '*work' || def.module === 'contracts|inspections';
  if (def.module === '-') {
    if (!evalCells_(ctx, def, null).allowed) throw apiError_('FORBIDDEN');
  } else if (!dynamic) {
    ctx.auth = authorize_(ctx, req.action, null);
  }
  // 8. Hỏi lại PIN — sau khi đã biết người dùng có quyền (không hỏi PIN người không có quyền)
  if (def.net === 'pin' && !verifyReauth_(ctx, req.reauth_token)) throw apiError_('REAUTH_REQUIRED');
  ctx.viaPush = !!viaPush;
  var out = HANDLERS_[req.action](ctx);
  if (DUE_ACTIONS_[req.action] && out && out.ok) afterDueChange_();
  if (out && out.__envelope) return out.__envelope; // sync.push: phản hồi giống action gốc
  if (out && out.state === 'COMMITTED' && out.ok) {
    return envelope_(req, out);
  }
  return envelope_(req, { ok: true, code: 'OK', data: out, sync_cursor: out && out.sync_cursor ? String(out.sync_cursor) : null });
}

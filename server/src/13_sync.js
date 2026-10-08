/* 13_sync: sync.bootstrap, sync.changes, sync.push, sync.getOperationStatus (phụ lục 1.5 mục 3.15) */

var SYNC_ENTITIES_ = [
  { type: 'LOCATION', sheet: 'Locations', action: 'catalog.view', module: 'catalog' },
  { type: 'VENDOR', sheet: 'Vendors', action: 'catalog.view', module: 'catalog' },
  { type: 'LOOKUP', sheet: 'LookupValues', action: 'catalog.view', module: 'catalog' },
  { type: 'EQUIPMENT', sheet: 'Equipment', action: 'equipment.view', module: 'equipment', qr: true },
  { type: 'EQUIPMENT_SPEC', sheet: 'EquipmentSpecs', action: 'equipment.view', module: 'equipment' },
  { type: 'MATERIAL', sheet: 'Materials', action: 'material.view', module: 'warehouse', qr: true },
  { type: 'EQUIPMENT_PART', sheet: 'EquipmentParts', action: 'equipment.view', module: 'equipment' },
  { type: 'EQUIPMENT_PART_EVENT', sheet: 'EquipmentPartEvents', action: 'equipment.view', module: 'equipment' },
  { type: 'CONTRACT', sheet: 'Contracts', action: 'contract.view', module: 'contracts', qr: true },
  { type: 'CONTRACT_EQUIPMENT', sheet: 'ContractEquipment', action: 'contract.view', module: 'contracts' },
  { type: 'CONTRACT_SERVICE', sheet: 'ContractServices', action: 'contract.view', module: 'contracts' },
  { type: 'INSPECTION_TYPE', sheet: 'InspectionTypes', action: 'inspection.view', module: 'inspections' },
  { type: 'INSPECTION_REQUIREMENT', sheet: 'InspectionRequirements', action: 'inspection.view', module: 'inspections', qr: true },
  { type: 'INSPECTION', sheet: 'Inspections', action: 'inspection.view', module: 'inspections', qr: true },
  { type: 'DOCUMENT', sheet: 'Documents', action: 'doc.view', module: null }
];

/** Dòng → bản ghi gửi client; null nếu không được xem */
function syncProject_(ctx, ent, row, qm, costCache) {
  if (ent.type === 'DOCUMENT') {
    var mod = docModule_(row.entity_type);
    if (!mod || !row.active) return null;
    if (!(mod in costCache)) {
      costCache[mod] = { view: can_(ctx, 'doc.view', { module: mod }), cost: canViewCost_(ctx, mod) };
    }
    if (!costCache[mod].view) return null;
    if (row.access_scope === 'COST_VIEW' && !costCache[mod].cost) return null;
    return projectDoc_(ctx, row);
  }
  var o = projectRow_(ctx, row, ent.sheet);
  if (ent.qr) o.qr_key = qm[o[sheetSchema_(ent.sheet).key]] || null;
  return o;
}

function visibleEntities_(ctx) {
  return SYNC_ENTITIES_.filter(function (ent) {
    if (!ent.module) return true;
    return can_(ctx, ent.action, { module: ent.module });
  });
}

function syncBootstrap_(ctx) {
  var p = ctx.req.payload || {};
  var pageSize = Math.min(2000, setting_('sync_page_size') || 500);
  var tok = String(p.page_token || '0:0').split(':');
  var ei = Number(tok[0]) || 0, off = Number(tok[1]) || 0;
  var cursor = p.page_token && p.sync_cursor ? Number(p.sync_cursor) : Number(stateGet_(readState_(), 'sync_revision', 0));
  var ents = visibleEntities_(ctx);
  var qm = qrMap_();
  var costCache = {};
  var records = {};
  var count = 0;
  var next = null;
  var t0 = Date.now();
  for (; ei < ents.length; ei++) {
    var ent = ents[ei];
    var rows = readRows_(ent.sheet);
    var list = records[ent.type] = records[ent.type] || [];
    for (var i = off; i < rows.length; i++) {
      if (count >= pageSize || Date.now() - t0 > 15000) { next = ei + ':' + i; break; }
      if (rows[i].archived_at) continue;
      var o = syncProject_(ctx, ent, rows[i], qm, costCache);
      if (o) { list.push(o); count++; }
    }
    off = 0;
    if (next) break;
  }
  var out = { records: records, next_page_token: next, sync_cursor: String(cursor) };
  if (!p.page_token) {
    out.user = publicUser_(ctx.user);
    out.subroles = ctxSubroles_(ctx);
    out.settings = clientSettings_();
    out.permissions = permissionSummary_(ctx);
    out.server_version = SERVER_VERSION;
    out.env = envName_();
  }
  return out;
}

function clientSettings_() {
  var s = settings_();
  var out = {};
  SETTINGS_DEFAULTS.forEach(function (d) { if (d[3]) out[d[0]] = s[d[0]]; });
  return out;
}

function syncChanges_(ctx) {
  var p = ctx.req.payload || {};
  var cursor = Number(p.cursor);
  if (!(cursor >= 0)) throw validationError_([fieldError_('cursor', 'INVALID_VALUE')]);
  var limit = Math.min(500, Number(p.limit) || 500);
  var st = readState_();
  var head = Number(stateGet_(st, 'sync_revision', 0));
  var qm = null, costCache = {};
  var changes = [];
  visibleEntities_(ctx).forEach(function (ent) {
    if (Number(stateGet_(st, 'table_rev.' + ent.sheet, 0)) <= cursor) return;
    if (ent.qr && !qm) qm = qrMap_();
    var key = sheetSchema_(ent.sheet).key;
    readRows_(ent.sheet).forEach(function (r) {
      if (!(Number(r.sync_revision || 0) > cursor)) return;
      var o = r.archived_at ? null : syncProject_(ctx, ent, r, qm || {}, costCache);
      changes.push({
        entity_type: ent.type, entity_id: r[key], op: o ? 'UPSERT' : 'TOMBSTONE',
        record_version: r.record_version, sync_revision: r.sync_revision, data: o
      });
    });
  });
  changes.sort(function (a, b) { return a.sync_revision - b.sync_revision; });
  var hasMore = false;
  if (changes.length > limit) {
    var cut = changes[limit - 1].sync_revision;
    var k = limit;
    while (k < changes.length && changes[k].sync_revision === cut) k++;
    hasMore = k < changes.length;
    changes = changes.slice(0, k);
  }
  var nextCursor = hasMore ? changes[changes.length - 1].sync_revision : head;
  return {
    changes: changes, next_cursor: String(nextCursor), has_more: hasMore,
    perm_version: sysStateCached_().perm_version || 1, sync_cursor: String(nextCursor)
  };
}

/** Một thao tác của hàng chờ offline (3.15) */
function syncPush_(ctx) {
  var op = (ctx.req.payload || {}).op;
  if (!op || typeof op !== 'object' || typeof op.action !== 'string') throw validationError_([fieldError_('op', 'REQUIRED')]);
  var def = ACTION_REGISTRY[op.action];
  if (!def || def.net === 'internal') throw apiError_('FORBIDDEN');
  if (def.net === 'pin') throw apiError_('REAUTH_REQUIRED');
  if (def.net !== 'offline') throw validationError_([fieldError_('op.action', 'NEEDS_NETWORK')]);
  var inner = {
    api_contract_version: ctx.req.api_contract_version, action: op.action, payload: op.payload || {},
    token: ctx.req.token, operation_id: op.operation_id, dataset_epoch: ctx.req.dataset_epoch,
    device_id: ctx.req.device_id, expected_version: op.expected_version, app_version: ctx.req.app_version,
    client_time: op.local_created_at
  };
  var env;
  try {
    env = dispatchInner_(inner, true);
  } catch (e) {
    env = errorToResponse_(inner, e);
  }
  return { __envelope: env };
}

function syncOpStatus_(ctx) {
  var id = (ctx.req.payload || {}).operation_id;
  if (!isUuidV4_(id)) throw validationError_([fieldError_('operation_id', 'ID_INVALID')]);
  var ex = findOne_('Operations', 'operation_id', id);
  if (!ex || ex.user_id !== ctx.user.user_id) return { operation_id: id, state: 'NOT_FOUND' };
  return {
    operation_id: id, state: ex.state, result_code: ex.result_code, action: ex.action,
    committed_at: ex.committed_at, result: ex.result_json || null,
    record_version: ex.result_json ? ex.result_json.record_version : null
  };
}

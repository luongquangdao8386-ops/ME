/* 07_perm: ACTION_REGISTRY, RolePermissions, tính quyền (phụ lục 1.5 mục 4) */

/*
 * Mỗi dòng: mã | module | cờ | ô C1 KT ĐN HĐ TK BS C3 C4 | mạng | đợt | R/W
 *  - module: tên module; '*' = theo hồ sơ (tài liệu, QR, nhập/xuất, dịch); '*work' = theo work_type;
 *    'contracts|inspections' = một trong hai.
 *  - cờ: V C E A I X $ R; 'C/E' = một trong hai (thao tác quyết định); 'I+A' = cả hai; '-' = không qua RolePermissions.
 *  - ô: Y được · N không · OWN của mình · ASG được giao · MC module chính · IFON nếu bật ·
 *       NS được nhưng không tự duyệt · OWNER chỉ owner · REC theo hồ sơ · SPEC quy tắc riêng trong thao tác.
 *  - mạng: cache · net · offline · pin · public (không cần phiên) · session (chỉ cần phiên) · internal.
 *  - đợt: 1–4; H = hoãn/chờ chốt; POC = chỉ ở môi trường THỬ khi chạy PoC.
 */
var ACTION_TABLE_ = [
  // 4.4.1 Thiết bị
  'equipment.view|equipment|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'equipment.create|equipment|C|N N N N N N Y Y|net|1|W',
  'equipment.edit|equipment|E|N N N N N N Y Y|net|1|W',
  'equipment.archive|equipment|E|N N N N N N Y Y|net|1|W',
  'equipment.unarchive|equipment|E|N N N N N N Y Y|net|1|W',
  'equipment.spec.edit|equipment|E|N N N N N N Y Y|net|1|W',
  // 4.4.2 Vật tư, linh kiện theo máy
  'material.view|warehouse|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'material.create|warehouse|C|N N N N IFON N Y Y|net|1|W',
  'material.edit|warehouse|E|N N N N IFON N Y Y|net|1|W',
  'material.archive|warehouse|E|N N N N N N Y Y|net|1|W',
  'part.link|equipment|E|N Y N N N N Y Y|net|1|W',
  'part.unlink|equipment|E|N OWN N N N N Y Y|net|1|W',
  'part.approve|equipment|A|N N N N N N NS NS|pin|1|W',
  'part.replace|equipment|E|N ASG N N N N Y Y|offline|2|W',
  // 4.4.3 Bảo trì
  'maintenance.view|maintenance|V|Y Y Y Y Y Y Y Y|cache|2|R',
  'maintenance.plan.edit|maintenance|C/E|N N N N N N Y Y|net|2|W',
  'maintenance.checklist.edit|maintenance|E|N N N N N N Y Y|net|2|W',
  'maintenance.wo.create|maintenance|C|N Y N N N N Y Y|offline|2|W',
  'maintenance.assign|maintenance|E|N N N N N N Y Y|net|2|W',
  'maintenance.execute|maintenance|E|N ASG N N N N Y Y|offline|2|W',
  'maintenance.submit|maintenance|E|N ASG N N N N Y Y|offline|2|W',
  'maintenance.accept|maintenance|A|N N N N N N NS NS|pin|2|W',
  'maintenance.cancel|maintenance|E|N OWN N N N N Y Y|net|2|W',
  // 4.4.4 Sửa chữa
  'repair.view|repairs|V|Y Y Y Y Y Y Y Y|cache|2|R',
  'repair.report|repairs|C|N Y Y Y Y Y Y Y|offline|2|W',
  'repair.editReport|repairs|E|N OWN OWN OWN OWN OWN Y Y|offline|2|W',
  'repair.assign|repairs|E|N N N N N N Y Y|net|2|W',
  'repair.process|repairs|E|N ASG N N N N Y Y|offline|2|W',
  'repair.submit|repairs|E|N ASG N N N N Y Y|offline|2|W',
  'repair.accept|repairs|A|N N N N N N NS NS|pin|2|W',
  'repair.cancel|repairs|E|N OWN OWN OWN OWN OWN Y Y|net|2|W',
  'repair.reopen|repairs|A|N N N N N N Y Y|pin|2|W',
  // 4.4.5 Đề nghị và lượng dùng vật tư
  'matreq.create|*work|C|N ASG N N N N Y Y|offline|2|W',
  'matreq.submit|*work|E|N OWN N N N N Y Y|offline|2|W',
  'matreq.approve|*work|A|N N N N N N NS NS|pin|2|W',
  'matreq.cancel|*work|E|N OWN N N N N Y Y|net|2|W',
  'usage.record|*work|C|N ASG N N N N Y Y|offline|2|W',
  'usage.confirm|*work|A|N N N N N N NS NS|pin|2|W',
  'work.cost.edit|*work|E+$|N N N N N N Y Y|net|2|W',
  // 4.4.6 Điện nước
  'utility.view|utilities|V|Y Y Y Y Y Y Y Y|cache|3|R',
  'meter.edit|utilities|C/E|N N N N N N Y Y|net|3|W',
  'reading.create|utilities|C|N N Y N N N Y Y|offline|3|W',
  'reading.editOwn|utilities|E|N N OWN N N N Y Y|net|3|W',
  'reading.editOthers|utilities|E|N N N N N N Y Y|net|3|W',
  'meter.event.create|utilities|C|N Y Y N N N Y Y|net|3|W',
  'meter.event.approve|utilities|A|N N N N N N NS NS|pin|3|W',
  'tariff.view|utilities|$|N N IFON N N N Y Y|cache|3|R',
  'tariff.edit|utilities|E+$|N N N N N N Y Y|net|3|W',
  'tariff.approve|utilities|A+$|N N N N N N NS NS|pin|3|W',
  // 4.4.7 Lộ điện
  'circuit.view|circuits|V|Y Y Y Y Y Y Y Y|cache|3|R',
  'circuit.edit|circuits|C/E|N N N N N N Y Y|net|3|W',
  'circuit.verify|circuits|A|N N N N N N NS NS|pin|3|W',
  'circuit.drawing.upload|circuits|C|N Y N N N N Y Y|net|3|W',
  'circuit.drawing.approve|circuits|A|N N N N N N NS NS|pin|3|W',
  // 4.4.8 Hợp đồng
  'contract.view|contracts|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'contract.create|contracts|C|N N N Y N N Y Y|net|1|W',
  'contract.edit|contracts|E|N N N Y N N Y Y|net|1|W',
  'contract.editTerms|contracts|A|N N N N N N NS NS|pin|1|W',
  'contract.archive|contracts|E|N N N N N N Y Y|net|1|W',
  'contract.close|contracts|A|N N N N N N Y Y|pin|1|W',
  'contract.renewal.create|contracts|C|N N N Y N N Y Y|net|1|W',
  'contract.renewal.submit|contracts|C|N N N Y N N Y Y|net|1|W',
  'contract.renewal.approve|contracts|A|N N N N N N NS NS|pin|1|W',
  'contract.service.record|contracts|C/E|N Y N Y N N Y Y|offline|1|W',
  'contract.service.accept|contracts|A|N N N N N N NS NS|pin|1|W',
  // 4.4.9 Kiểm định
  'inspection.view|inspections|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'inspection.type.edit|inspections|E|N N N N N N Y Y|net|1|W',
  'inspection.requirement.edit|inspections|C/E|N N N Y N N Y Y|net|1|W',
  'inspection.submit|inspections|C|N N N Y N N Y Y|offline|1|W',
  'inspection.approve|inspections|A|N N N N N N NS NS|pin|1|W',
  'inspection.revoke|inspections|A|N N N N N N Y Y|pin|1|W',
  'inspection.schedule|inspections|E|N N N Y N N Y Y|net|H|W',
  // 4.4.10 Báo cáo
  'report.run|reports|V|Y Y Y Y Y Y Y Y|net|3|R',
  'report.view|reports|V|Y Y Y Y Y Y Y Y|net|3|R',
  'report.save|reports|X|IFON IFON IFON IFON IFON N Y Y|net|3|W',
  'report.export|reports|X|IFON IFON IFON IFON IFON N Y Y|net|3|R',
  'report.definition.edit|reports|E|N N N N N N N Y|net|3|W',
  // 4.4.11 Nhập/xuất, QR
  'import.template|*|I|N MC MC MC MC N Y Y|net|1|R',
  'import.preview|*|I|N MC MC MC MC N Y Y|net|1|W',
  'import.errors|*|I|N MC MC MC MC N Y Y|net|1|R',
  'import.submit|*|I|N MC MC MC MC N Y Y|net|1|W',
  'import.commit|*|I+A|N N N N N N Y Y|pin|1|W',
  'import.cancel|*|I|N OWN OWN OWN OWN N Y Y|net|1|W',
  'export.xlsx|*|X|IFON IFON IFON IFON IFON N Y Y|net|1|R',
  'export.pdf|*|X|IFON IFON IFON IFON IFON N Y Y|net|3|R',
  'qr.resolve|*|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'qr.view|*|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'qr.print|*|V|N MC MC MC MC N Y Y|net|1|R',
  // 4.4.12 Tài liệu và ảnh
  'doc.view|*|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'doc.thumbs|*|V|Y Y Y Y Y Y Y Y|net|1|R',
  'doc.download|*|V|Y Y Y Y Y Y Y Y|net|1|R',
  'doc.upload|*|C|N SPEC SPEC MC IFON OWN Y Y|offline|1|W',
  'doc.setPrivate|*|E|N OWN OWN OWN OWN OWN Y Y|net|1|W',
  'doc.archive|*|E|N OWN OWN OWN OWN OWN Y Y|net|1|W',
  // 4.4.13 Danh mục chung
  'catalog.view|catalog|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'location.edit|catalog|E|N N N N N N N Y|net|1|W',
  'vendor.edit|catalog|C/E|N N N Y N N Y Y|net|1|W',
  'lookup.edit|catalog|E|N N N N N N Y Y|net|1|W',
  'glossary.edit|catalog|E|N N N N N N Y Y|net|1|W',
  // 4.4.14 Tài khoản và người dùng
  'auth.login|-|-|Y Y Y Y Y Y Y Y|public|1|R',
  'auth.reauth|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'auth.logout|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'account.view|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'pin.change|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'session.listOwn|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'session.revokeOwn|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'auth.logoutAll|-|-|Y Y Y Y Y Y Y Y|pin|1|R',
  'user.pickList|-|-|N N N Y N N Y Y|net|1|R',
  'user.view|users|V|N N N N N N Y Y|net|1|R',
  'user.create|users|C|N N N N N N N Y|pin|1|W',
  'user.setRole|users|E|N N N N N N N Y|pin|1|W',
  'user.lock|users|E|N N N N N N N Y|pin|1|W',
  'user.unlock|users|E|N N N N N N N Y|pin|1|W',
  'user.resetPin|users|E|N N N N N N N Y|pin|1|W',
  'user.revokeSessions|users|E|N N N N N N N Y|pin|1|W',
  // 4.4.15 Nhắc hạn và Gmail
  'alert.view|contracts|inspections|V|Y Y Y Y Y Y Y Y|cache|1|R',
  'alert.acknowledge|contracts|inspections|E|N N N Y N N Y Y|net|1|W',
  'notify.log.view|notifications|V|N N N N N N Y Y|net|1|R',
  'notify.recipient.edit|notifications|E|N N N N N N N Y|pin|1|W',
  'notify.settings.edit|notifications|E|N N N N N N N Y|pin|1|W',
  'notify.resend|notifications|E|N N N N N N N Y|pin|1|W',
  // 4.4.16 Nhật ký, sao lưu, cấu hình, xóa sạch
  'audit.own|-|-|Y Y Y Y Y Y Y Y|cache|1|R',
  'audit.view|audit|V|N N N N N N Y Y|net|1|R',
  'audit.auth|audit|V|N N N N N N N Y|pin|1|R',
  'backup.view|backup|V|N N N N N N N Y|net|1|R',
  'backup.run|backup|E|N N N N N N N Y|pin|1|W',
  'settings.edit|system|E|N N N N N N N Y|pin|1|W',
  'permission.view|system|V|N N N N N N N Y|pin|1|R',
  'permission.edit|system|E|N N N N N N N Y|pin|1|W',
  // Bổ sung kỹ thuật: màn Trạng thái hệ thống đọc healthCheck + Settings (5.2)
  'system.status|system|V|N N N N N N N Y|net|1|R',
  'system.reset.preview|system|R|N N N N N N N OWNER|pin|4|R',
  'system.reset.request|system|R|N N N N N N N OWNER|pin|4|W',
  'system.reset.status|system|R|N N N N N N N OWNER|pin|4|R',
  'system.reset.resume|system|R|N N N N N N N OWNER|pin|4|W',
  'system.restore.preview|system|R|N N N N N N N OWNER|pin|H|R',
  'system.restore.request|system|R|N N N N N N N OWNER|pin|H|W',
  // 4.4.17 Hệ thống, đồng bộ, dịch
  'system.health|-|-|Y Y Y Y Y Y Y Y|public|1|R',
  'system.getPublicState|-|-|Y Y Y Y Y Y Y Y|public|1|R',
  'sync.bootstrap|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'sync.changes|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'sync.push|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'sync.getOperationStatus|-|-|Y Y Y Y Y Y Y Y|session|1|R',
  'i18n.suggest|*|C/E|N REC REC REC REC REC REC REC|net|1|R',
  'i18n.retranslate|*|E|N REC REC REC REC REC REC REC|net|1|W',
  'i18n.machineTranslate|-|-|N N N N N N N N|internal|1|W',
  // PoC (chỉ môi trường THỬ, gỡ sau PoC)
  'poc.vectors|-|-|Y Y Y Y Y Y Y Y|session|POC|R',
  'poc.echo|-|-|Y Y Y Y Y Y Y Y|session|POC|R',
  'poc.sleep|-|-|Y Y Y Y Y Y Y Y|session|POC|W',
  'poc.stats|-|-|Y Y Y Y Y Y Y Y|session|POC|R',
  'poc.mail|-|-|N N N N N N N Y|session|POC|R',
  'poc.translate|-|-|N N N N N N N Y|session|POC|R',
  'poc.makeTestFiles|-|-|N N N N N N N Y|session|POC|R',
  'poc.driveChecks|-|-|N N N N N N N Y|session|POC|R',
  'poc.triggers|-|-|N N N N N N N Y|session|POC|R'
];

var ACTION_REGISTRY = (function () {
  var reg = {};
  ACTION_TABLE_.forEach(function (line) {
    var p = line.split('|');
    // module có thể chứa '|' (contracts|inspections): 7 hoặc 8 phần
    var code = p[0], module, rest;
    if (p.length === 8) { module = p[1] + '|' + p[2]; rest = p.slice(3); } else { module = p[1]; rest = p.slice(2); }
    var flagStr = rest[0];
    var flags = [], flagMode = 'all';
    if (flagStr !== '-') {
      if (flagStr.indexOf('/') >= 0) { flags = flagStr.split('/'); flagMode = 'any'; }
      else flags = flagStr.split('+');
    }
    var dot = rest[3];
    reg[code] = {
      code: code, module: module, flags: flags, flagMode: flagMode, cells: rest[1].split(' '),
      net: rest[2], dot: dot === 'H' || dot === 'POC' ? dot : Number(dot), write: rest[4] === 'W'
    };
  });
  return reg;
})();

var FLAG_COL_ = { V: 'can_view', C: 'can_create', E: 'can_edit', A: 'can_approve', I: 'can_import', X: 'can_export', $: 'can_view_cost', R: 'can_reset_system' };

var BUSINESS_MODULES_ = ['equipment', 'maintenance', 'repairs', 'warehouse', 'utilities', 'reports', 'circuits', 'contracts', 'inspections', 'catalog'];

/** Ma trận mặc định 4.8: [C1, C2, C3, C4] */
var ROLE_DEFAULTS_ = {
  equipment: ['V', 'VCEI', 'VCEAIX$', 'VCEAIX$'],
  warehouse: ['V', 'VI', 'VCEAIX$', 'VCEAIX$'],
  maintenance: ['V', 'VCEI', 'VCEAIX$', 'VCEAIX$'],
  repairs: ['V', 'VCEI', 'VCEAIX$', 'VCEAIX$'],
  utilities: ['V', 'VCEI', 'VCEAIX$', 'VCEAIX$'],
  circuits: ['V', 'VCI', 'VCEAIX', 'VCEAIX'],
  contracts: ['V', 'VCEI$', 'VCEAIX$', 'VCEAIX$'],
  inspections: ['V', 'VCEI$', 'VCEAIX$', 'VCEAIX$'],
  reports: ['V', 'V', 'VX', 'VEX'],
  catalog: ['V', 'VCE', 'VCEIX', 'VCEIX'],
  users: ['', '', 'V', 'VCEA'],
  notifications: ['', '', 'V', 'VE'],
  audit: ['', '', 'V', 'V'],
  backup: ['', '', '', 'VE'],
  system: ['', '', '', 'VER']
};

/** Trần quyền 4.8 */
function roleCeiling_(level, module) {
  var biz = BUSINESS_MODULES_.indexOf(module) >= 0;
  if (level === 1) return biz ? 'VX$' : '';
  if (level === 2) return biz ? 'VCEIX$' : '';
  if (level === 3) return biz ? 'VCEAIX$' : ({ users: 'V', notifications: 'V', audit: 'V' }[module] || '');
  if (level === 4) return biz ? 'VCEAIX$' : ({ users: 'VCEA', notifications: 'VE', audit: 'V', backup: 'VE', system: 'VER' }[module] || '');
  return '';
}

/** 60 dòng mặc định RolePermissions */
function defaultRolePermissionRows_() {
  var rows = [];
  [1, 2, 3, 4].forEach(function (lvl) {
    PERM_MODULES.forEach(function (m) {
      var f = ROLE_DEFAULTS_[m][lvl - 1];
      var r = { permission_id: 'RP-' + lvl + '-' + m, role_level: lvl, module: m };
      Object.keys(FLAG_COL_).forEach(function (k) { r[FLAG_COL_[k]] = f.indexOf(k) >= 0; });
      rows.push(r);
    });
  });
  return rows;
}

/** RolePermissions qua cache perm:<perm_version>, kẹp theo trần */
function rolePerms_() {
  if (DB_.rolePerms) return DB_.rolePerms;
  var pv = sysStateCached_().perm_version || 1;
  var ck = 'perm:' + pv;
  var c = cache_().get(ck);
  var map;
  if (c) {
    map = JSON.parse(c);
  } else {
    map = {};
    readRows_('RolePermissions').forEach(function (r) {
      var ceil = roleCeiling_(Number(r.role_level), r.module);
      var flags = '';
      Object.keys(FLAG_COL_).forEach(function (k) { if (r[FLAG_COL_[k]] && ceil.indexOf(k) >= 0) flags += k; });
      if (r.module === 'system' && Number(r.role_level) === 4) {
        // R cố định theo dòng đã nạp; không sửa được trong app
        if (r.can_reset_system && flags.indexOf('R') < 0) flags += 'R';
      }
      map[r.role_level + '|' + r.module] = flags;
    });
    cache_().put(ck, JSON.stringify(map), 21600);
  }
  DB_.rolePerms = map;
  return map;
}

function hasFlag_(level, module, flag) {
  var f = rolePerms_()[level + '|' + module];
  return typeof f === 'string' && f.indexOf(flag) >= 0;
}

/** Subrole active của người dùng cấp 2, qua cache scope:<uid>:<auth_version> */
function userScopes_(u) {
  if (Number(u.role_level) !== 2) return [];
  var ck = 'scope:' + u.user_id + ':' + (u.auth_version || 0);
  var c = cache_().get(ck);
  if (c) return JSON.parse(c);
  var list = findAll_('UserScopes', 'user_id', u.user_id).filter(function (s) {
    return s.active && SUBROLES[s.subrole] && !s.location_id && !s.module;
  }).map(function (s) { return { subrole: s.subrole }; });
  cache_().put(ck, JSON.stringify(list), 21600);
  return list;
}

function ctxSubroles_(ctx) {
  if (!ctx.subroles) ctx.subroles = userScopes_(ctx.user).map(function (s) { return s.subrole; });
  return ctx.subroles;
}

var CELL_INDEX_ = { 1: 0, KY_THUAT: 1, DOC_DIEN_NUOC: 2, HD_KD: 3, THU_KHO: 4, BAO_SU_CO: 5, 3: 6, 4: 7 };

/** Ô của một action với người dùng: {allowed, conds[], ns} — bước 5 (4.2) */
function evalCells_(ctx, def, module) {
  var lvl = Number(ctx.user.role_level);
  var cellsToCheck = [];
  if (lvl === 2) {
    // Cấp 2 = quyền cấp 1 cộng quyền theo subrole (4.1)
    cellsToCheck.push({ cell: def.cells[0], sub: null });
    ctxSubroles_(ctx).forEach(function (s) { cellsToCheck.push({ cell: def.cells[CELL_INDEX_[s]], sub: s }); });
  } else if (CELL_INDEX_[lvl] !== undefined) {
    cellsToCheck.push({ cell: def.cells[CELL_INDEX_[lvl]], sub: null });
  }
  var uncond = false, conds = [], ns = false;
  cellsToCheck.forEach(function (x) {
    var c = x.cell;
    if (c === 'Y') uncond = true;
    else if (c === 'NS') { uncond = true; ns = true; }
    else if (c === 'MC' || c === 'IFON') {
      if (lvl !== 2 || !x.sub || (module && SUBROLES[x.sub].indexOf(module) >= 0)) uncond = true;
    } else if (c === 'OWNER') {
      if (ctx.user.is_system_owner && hasFlag_(4, 'system', 'R')) uncond = true;
    } else if (c === 'OWN' || c === 'ASG' || c === 'REC' || c === 'SPEC') {
      conds.push(x.sub ? c + ':' + x.sub : c);
    }
  });
  if (uncond) return { allowed: true, conds: [], ns: ns };
  return { allowed: conds.length > 0, conds: conds, ns: ns };
}

function resolveModule_(def, target) {
  if (def.module === '*' || def.module === '*work') return target && target.module ? target.module : null;
  if (def.module === 'contracts|inspections') return target && target.module ? target.module : 'contracts';
  if (def.module === '-') return null;
  return def.module;
}

/**
 * Bước 4–5 của 4.2. Ném FORBIDDEN nếu không được.
 * Trả {module, conds, ns}. Điều kiện hồ sơ (bước 6), không tự duyệt (bước 7) do thao tác kiểm tiếp.
 */
function authorize_(ctx, code, target) {
  var def = ACTION_REGISTRY[code];
  if (!def) throw apiError_('FORBIDDEN');
  var module = resolveModule_(def, target);
  var lvl = Number(ctx.user.role_level);
  if (def.flags.length) {
    if (!module) throw apiError_('FORBIDDEN');
    var have = def.flags.map(function (f) { return hasFlag_(lvl, module, f); });
    var ok = def.flagMode === 'any' ? have.some(Boolean) : have.every(Boolean);
    if (!ok) throw apiError_('FORBIDDEN');
  }
  var ev = evalCells_(ctx, def, module);
  if (!ev.allowed) throw apiError_('FORBIDDEN');
  return { module: module, conds: ev.conds, ns: ev.ns };
}

/** Thử quyền, không ném lỗi */
function can_(ctx, code, target) {
  try { authorize_(ctx, code, target); return true; } catch (e) { return false; }
}

/** Quyền xem giá theo module (4.5): cấp 2 chỉ trong module chính của subrole */
function canViewCost_(ctx, module) {
  var lvl = Number(ctx.user.role_level);
  if (!hasFlag_(lvl, module, '$')) return false;
  if (lvl === 2) return ctxSubroles_(ctx).some(function (s) { return SUBROLES[s].indexOf(module) >= 0; });
  return true;
}

/** Bước 7: không tự duyệt (4.6). people: danh sách user_id không được duyệt. */
function assertNotSelf_(ctx, code, people) {
  var uid = ctx.user.user_id;
  if (people.indexOf(uid) < 0) return 'ROLE_LEVEL';
  var ex = setting_('self_approval_exceptions') || [];
  var reason = trimStr_((ctx.req.payload || {}).self_approval_reason);
  var allowed = ex.some(function (e) { return e && e.action_code === code; });
  if (allowed && reason) return 'SELF_APPROVAL_EXCEPTION';
  throw apiError_('FORBIDDEN');
}

/** Cơ sở quyền ghi vào AuditLogs.auth_basis */
function authBasis_(ctx) {
  var lvl = Number(ctx.user.role_level);
  if (lvl === 2) return 'SUBROLE:' + ctxSubroles_(ctx).join(',');
  return 'ROLE_LEVEL';
}

function dotReleased_(dot) {
  if (dot === 'POC') return isTestEnv_();
  if (dot === 'H') return false;
  return dot <= RELEASED_DOT;
}

/** Khối permissions của bootstrap: action được phép theo cấp/subrole (chưa xét hồ sơ) */
function permissionSummary_(ctx) {
  var actions = [];
  Object.keys(ACTION_REGISTRY).forEach(function (code) {
    var def = ACTION_REGISTRY[code];
    if (!dotReleased_(def.dot) || def.net === 'internal') return;
    if (!HANDLERS_[code]) return;
    var mods = def.module === '*' || def.module === '*work' ? BUSINESS_MODULES_ :
      (def.module === 'contracts|inspections' ? ['contracts', 'inspections'] : [resolveModule_(def, null)]);
    var any = mods.some(function (m) {
      if (def.flags.length && !m) return false;
      return can_(ctx, code, { module: m });
    });
    if (any) actions.push(code);
  });
  var costModules = BUSINESS_MODULES_.filter(function (m) { return canViewCost_(ctx, m); });
  return { perm_version: sysStateCached_().perm_version || 1, actions: actions, cost_modules: costModules };
}

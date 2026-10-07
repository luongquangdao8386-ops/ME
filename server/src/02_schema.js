/* 02_schema: sheet và cột của Đợt 1 (1.4 §10.2, §10.3.1; phụ lục 1.5 mục 3.1, 3.16, 6.4) */

/**
 * Bộ cột C (1.4 §10.1) cho bảng nghiệp vụ. Thêm `sync_revision` (mốc đồng bộ của dòng,
 * để `sync.changes` lấy được dòng đổi sau cursor; 3.15).
 */
var C_COLS = ['dataset_epoch', 'record_version', 'sync_revision', 'created_at', 'created_by', 'updated_at', 'updated_by', 'archived_at'];

/**
 * book: B = Nghiệp vụ, S = Bảo mật. c: thêm bộ C. i18n: thêm `i18n_meta`.
 * cols: tên cột cách nhau bằng dấu cách; kiểu suy theo tên (colType_), ghi đè bằng "ten:KIEU".
 */
var SHEETS = {
  // ---- Nghiệp vụ (26) ----
  Settings: { book: 'B', dot: 1, key: 'setting_key', i18n: true,
    cols: 'setting_key value:STRING value_type description_vi description_zh updated_at updated_by' },
  SystemState: { book: 'B', dot: 1, key: 'state_key',
    cols: 'state_key value:STRING value_type updated_at updated_by' },
  Locations: { book: 'B', dot: 1, key: 'location_id', c: true, i18n: true,
    cols: 'location_id location_code parent_location_id name_vi name_zh type active' },
  LookupValues: { book: 'B', dot: 1, key: 'value_id', c: true, i18n: true,
    cols: 'value_id group_key code name_vi name_zh parent_value_id active' },
  Vendors: { book: 'B', dot: 1, key: 'vendor_id', c: true, i18n: true,
    cols: 'vendor_id vendor_code name contact_name phone email address services_vi services_zh active' },
  Glossary: { book: 'B', dot: 1, key: 'glossary_id', c: true,
    cols: 'glossary_id term_vi term_zh note active approved_by approved_at' },
  Documents: { book: 'B', dot: 1, key: 'document_id', c: true, i18n: true,
    cols: 'document_id entity_type entity_id title_vi title_zh kind drive_file_id external_url mime_type file_version ' +
      'access_scope document_date active managed_folder_id storage_kind owned_by_app drive_sharing_state sharing_updated_at ' +
      'sharing_error_code size_bytes thumb_drive_file_id' },
  QrRegistry: { book: 'B', dot: 1, key: 'qr_key',
    cols: 'qr_key entity_type entity_id code label_vi label_zh active dataset_epoch' },
  Equipment: { book: 'B', dot: 1, key: 'equipment_id', c: true, i18n: true,
    cols: 'equipment_id equipment_code name_vi name_zh category_id location_id vendor_id manufacturer model serial ' +
      'manufacture_year install_date warranty_end status criticality owner_user_id' },
  EquipmentSpecs: { book: 'B', dot: 1, key: 'spec_id', c: true, i18n: true,
    cols: 'spec_id equipment_id spec_key label_vi label_zh value_num value_text unit sort_order' },
  Materials: { book: 'B', dot: 1, key: 'material_id', c: true, i18n: true,
    cols: 'material_id material_code name_vi name_zh part_number manufacturer model specification_vi specification_zh ' +
      'base_unit vendor_id lead_time_days reorder_level lot_tracking serial_tracking active group_key item_kind is_equipment_component' },
  EquipmentParts: { book: 'B', dot: 1, key: 'equipment_part_id', c: true, i18n: true,
    cols: 'equipment_part_id equipment_id material_id installed_qty unit function_vi function_zh alternate_part_id ' +
      'compatibility_note approved_by position_vi position_zh effective_from removed_at' },
  EquipmentPartEvents: { book: 'B', dot: 1, key: 'event_id', i18n: true,
    cols: 'event_id equipment_id equipment_part_id material_id event_type quantity unit position_vi position_zh occurred_at ' +
      'work_type work_id usage_line_id actor_user_id note_vi note_zh dataset_epoch sync_revision created_at created_by' },
  Contracts: { book: 'B', dot: 1, key: 'contract_id', c: true, i18n: true,
    cols: 'contract_id contract_code contract_number title_vi title_zh vendor_id start_date end_date renewal_notice_date ' +
      'value currency owner_user_id scope_vi scope_zh status revision previous_contract_id submitted_by submitted_at ' +
      'approved_by approved_at lifecycle_status closed_at closed_reason_vi closed_reason_zh due_revision' },
  ContractEquipment: { book: 'B', dot: 1, key: 'contract_equipment_id', c: true, i18n: true,
    cols: 'contract_equipment_id contract_id equipment_id service_vi service_zh interval_type interval_value next_service_date price currency' },
  ContractServices: { book: 'B', dot: 1, key: 'service_id', c: true, i18n: true,
    cols: 'service_id contract_id contract_equipment_id due_date performed_at result_vi result_zh vendor_contact cost currency ' +
      'status accepted_by accepted_at' },
  InspectionTypes: { book: 'B', dot: 1, key: 'inspection_type_id', c: true, i18n: true,
    cols: 'inspection_type_id code name_vi name_zh reference_basis default_interval_months required_docs_vi required_docs_zh active' },
  InspectionRequirements: { book: 'B', dot: 1, key: 'requirement_id', c: true,
    cols: 'requirement_id requirement_code equipment_id location_id inspection_type_id owner_user_id current_inspection_id ' +
      'current_due_date operational_status obligation_status active due_revision' },
  Inspections: { book: 'B', dot: 1, key: 'inspection_id', c: true, i18n: true,
    cols: 'inspection_id inspection_code requirement_id vendor_id inspection_date certificate_number valid_from valid_to ' +
      'next_due_date result restriction_vi restriction_zh cost currency status approved_by approved_at supersedes_inspection_id ' +
      'submitted_by submitted_at' },
  ImportBatches: { book: 'B', dot: 1, key: 'import_batch_id',
    cols: 'import_batch_id module schema_version imported_by imported_at file_document_id total_rows add_count update_count ' +
      'error_count status approved_by completed_at dataset_epoch source_sha256 committing_session_id commit_started_at ' +
      'record_version updated_at' },
  ImportRows: { book: 'B', dot: 1, key: 'import_row_id',
    cols: 'import_row_id import_batch_id row_number entity_type entity_id action expected_version validation_status error_text ' +
      'committed_at normalized_payload_json row_hash' },
  AuditLogs: { book: 'B', dot: 1, key: 'audit_id',
    cols: 'audit_id occurred_at user_id device_id action entity_type entity_id before_json after_json operation_id ' +
      'import_batch_id dataset_epoch reason auth_basis' },
  Operations: { book: 'B', dot: 1, key: 'operation_id',
    cols: 'operation_id user_id device_id entity_type entity_id expected_version received_at state result_code sync_revision ' +
      'committed_at dataset_epoch action payload_hash intent_json progress_json result_json' },
  Alerts: { book: 'B', dot: 1, key: 'alert_id',
    cols: 'alert_id entity_type entity_id due_revision due_date days_remaining alert_state owner_user_id acknowledged_at ' +
      'resolved_at refreshed_at dataset_epoch reference_date_kind stage sync_revision' },
  NotificationRecipients: { book: 'B', dot: 1, key: 'recipient_id', c: true,
    cols: 'recipient_id email user_id location_scope entity_scope active' },
  NotificationLogs: { book: 'B', dot: 1, key: 'notification_id',
    cols: 'notification_id dedupe_key run_date recipient_id entity_type entity_id due_revision due_date stage status ' +
      'attempt_at sent_at error_code dataset_epoch alert_id reference_date_kind days_remaining digest_id queued_at attempt_count' },

  // ---- Bảo mật (5) ----
  Users: { book: 'S', dot: 1, key: 'user_id',
    cols: 'user_id employee_code display_name email role_level active pin_hash salt pin_hash_version failed_attempts ' +
      'locked_until created_at updated_at auth_version is_system_owner must_change_pin temp_pin_expires_at pin_changed_at ' +
      'failed_window_started_at last_login_at record_version created_by updated_by' },
  RolePermissions: { book: 'S', dot: 1, key: 'permission_id',
    cols: 'permission_id role_level module can_view can_create can_edit can_approve can_import can_export can_view_cost ' +
      'can_reset_system updated_at updated_by' },
  UserScopes: { book: 'S', dot: 1, key: 'scope_id',
    cols: 'scope_id user_id location_id module subrole active created_at created_by updated_at updated_by' },
  Sessions: { book: 'S', dot: 1, key: 'session_id',
    cols: 'session_id token_hash user_id device_id issued_at expires_at revoked_at auth_version dataset_epoch app_id ' +
      'origin_key session_kind last_seen_at revoke_reason device_label' },
  AuthAttempts: { book: 'S', dot: 1, key: 'attempt_id',
    cols: 'attempt_id occurred_at employee_code_hash device_id outcome attempt_kind user_id' }
};

var TYPE_OVERRIDES_ = {
  drive_file_id: 'STRING', managed_folder_id: 'STRING', thumb_drive_file_id: 'STRING', external_url: 'STRING',
  employee_code_hash: 'STRING', token_hash: 'STRING', payload_hash: 'STRING', row_hash: 'STRING', source_sha256: 'STRING',
  pin_hash: 'STRING', salt: 'STRING', qr_key: 'STRING', dedupe_key: 'STRING', origin_key: 'STRING',
  valid_from: 'DATE', valid_to: 'DATE', effective_from: 'DATE', install_date: 'DATE', warranty_end: 'DATE', run_date: 'DATE',
  removed_at: 'DATETIME',
  value: 'NUMBER', price: 'NUMBER', cost: 'NUMBER', installed_qty: 'NUMBER', quantity: 'NUMBER', value_num: 'NUMBER',
  reorder_level: 'NUMBER',
  record_version: 'INT', sync_revision: 'INT', role_level: 'INT', auth_version: 'INT', failed_attempts: 'INT', file_version: 'INT',
  size_bytes: 'INT', total_rows: 'INT', add_count: 'INT', update_count: 'INT', error_count: 'INT', revision: 'INT',
  due_revision: 'INT', days_remaining: 'INT', attempt_count: 'INT', row_number: 'INT', expected_version: 'INT',
  sort_order: 'INT', interval_value: 'INT', lead_time_days: 'INT', manufacture_year: 'INT', default_interval_months: 'INT',
  active: 'BOOL', owned_by_app: 'BOOL', must_change_pin: 'BOOL', lot_tracking: 'BOOL', serial_tracking: 'BOOL',
  is_equipment_component: 'BOOL', is_system_owner: 'BOOL', i18n_meta: 'JSON', code: 'CODE', schema_version: 'STRING',
  phone: 'STRING', email: 'STRING'
};

/** Kiểu cột (3.1) suy theo tên. */
function colType_(name) {
  if (TYPE_OVERRIDES_[name]) return TYPE_OVERRIDES_[name];
  if (/^can_/.test(name)) return 'BOOL';
  if (/_json$/.test(name)) return 'JSON';
  if (/_id$/.test(name)) return 'ID';
  if (/_code$/.test(name)) return 'CODE';
  if (/_at$/.test(name) || /_until$/.test(name)) return 'DATETIME';
  if (/_date$/.test(name)) return 'DATE';
  return 'STRING';
}

var TEXT_FORMAT_TYPES_ = { ID: 1, CODE: 1, DATE: 1, DATETIME: 1, JSON: 1, STRING: 1, ENUM: 1 };

var schemaCache_ = {};

/** Danh sách cột và kiểu của một sheet: {cols:[name], types:{name:type}} */
function sheetSchema_(name) {
  if (schemaCache_[name]) return schemaCache_[name];
  var def = SHEETS[name];
  if (!def) throw new Error('Unknown sheet ' + name);
  var cols = [], types = {};
  def.cols.split(/\s+/).filter(String).forEach(function (spec) {
    var p = spec.split(':');
    cols.push(p[0]);
    types[p[0]] = p[1] || colType_(p[0]);
  });
  if (def.c) C_COLS.forEach(function (c) { if (cols.indexOf(c) < 0) { cols.push(c); types[c] = colType_(c); } });
  if (def.i18n && cols.indexOf('i18n_meta') < 0) { cols.push('i18n_meta'); types.i18n_meta = 'JSON'; }
  schemaCache_[name] = { cols: cols, types: types, key: def.key, book: def.book, dot: def.dot };
  return schemaCache_[name];
}

/** Sheet thuộc đợt ≤ RELEASED_DOT */
function sheetsForDot_(dot) {
  return Object.keys(SHEETS).filter(function (n) { return SHEETS[n].dot <= dot; });
}

/** Giá trị JS → ô Sheet */
function toCell_(type, v) {
  if (v === null || v === undefined) return '';
  switch (type) {
    case 'BOOL': return v === true || v === 'TRUE' || v === 'true';
    case 'INT':
    case 'NUMBER':
      if (v === '') return '';
      var n = Number(v);
      return isNaN(n) ? '' : n;
    case 'JSON': {
      var s = typeof v === 'string' ? v : JSON.stringify(v);
      if (s.length > 50000) throw new Error('JSON cell too large');
      return s;
    }
    default: return String(v);
  }
}

/** Ô Sheet → giá trị JS */
function fromCell_(type, v) {
  switch (type) {
    case 'BOOL': return v === true || v === 'TRUE' || v === 'true';
    case 'INT':
    case 'NUMBER':
      if (v === '' || v === null || v === undefined) return null;
      var n = Number(v);
      return isNaN(n) ? null : n;
    case 'DATE':
      if (v instanceof Date) return dateVN_(v);
      return v === null || v === undefined ? '' : String(v);
    case 'DATETIME':
      if (v instanceof Date) return isoVN_(v);
      return v === null || v === undefined ? '' : String(v);
    case 'JSON':
      if (v === '' || v === null || v === undefined) return null;
      try { return JSON.parse(String(v)); } catch (e) { return null; }
    default:
      return v === null || v === undefined ? '' : String(v);
  }
}

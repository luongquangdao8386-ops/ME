/* 02_schema: sheet và cột của Đợt 1–3 (1.4 §10.2, §10.3.1; phụ lục 1.5 mục 3.1, 3.12, 3.13, 3.16, 6.1, 6.4) */

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
      'sharing_error_code size_bytes thumb_drive_file_id approval_status approved_by approved_at' },
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
      'work_type work_id usage_line_id actor_user_id note_vi note_zh dataset_epoch sync_revision created_at created_by old_material_id' },
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
    cols: 'recipient_id email user_id location_scope entity_scope active confirmed_by confirmed_at' },
  NotificationLogs: { book: 'B', dot: 1, key: 'notification_id',
    cols: 'notification_id dedupe_key run_date recipient_id entity_type entity_id due_revision due_date stage status ' +
      'attempt_at sent_at error_code dataset_epoch alert_id reference_date_kind days_remaining digest_id queued_at attempt_count' },

  // ---- Nghiệp vụ Đợt 2 (10): Bảo trì, Sửa chữa, vật tư trên phiếu (6.1, 6.9.1) ----
  // Cột ngoài 1.4 §10.2 + 3.16: tên phiếu, bản checklist đã chụp, lý do trả lại/hủy, mốc giao việc, nguồn phiếu,
  // ghi chú dừng máy (5.1.1 mục 6), giờ chạy lúc làm, đề nghị sửa chữa sinh từ mục không đạt.
  MaintenancePlans: { book: 'B', dot: 2, key: 'plan_id', c: true, i18n: true,
    cols: 'plan_id plan_code equipment_id title_vi title_zh interval_type interval_value anchor_date next_due_date ' +
      'operating_hours_target checklist_template_id assignee_user_id priority estimated_minutes active safety_note_vi safety_note_zh ' +
      'last_work_order_id last_done_date last_done_hours' },
  ChecklistTemplates: { book: 'B', dot: 2, key: 'template_item_id', c: true, i18n: true,
    cols: 'template_item_id template_id revision step_no label_vi label_zh result_type unit min_value max_value required ' +
      'safety_note_vi safety_note_zh template_name_vi template_name_zh active' },
  WorkOrders: { book: 'B', dot: 2, key: 'work_order_id', c: true, i18n: true,
    cols: 'work_order_id work_order_code plan_id equipment_id due_date assignee_user_id status start_at end_at downtime_start_at ' +
      'downtime_end_at labor_minutes labor_cost other_cost result_vi result_zh approved_by approved_at next_due_date submitted_by ' +
      'submitted_at overall_result priority cost_currency title_vi title_zh checklist_template_id checklist_revision downtime_note ' +
      'operating_hours assigned_at returned_reason returned_at cancel_reason cancelled_at source repair_id' },
  WorkOrderResults: { book: 'B', dot: 2, key: 'result_id', c: true, i18n: true,
    cols: 'result_id work_order_id template_item_id template_revision step_no label_vi label_zh result_status measured_value unit ' +
      'note_vi note_zh result_type required min_value max_value safety_note_vi safety_note_zh' },
  Repairs: { book: 'B', dot: 2, key: 'repair_id', c: true, i18n: true,
    cols: 'repair_id repair_code equipment_id reported_by reported_at symptom_vi symptom_zh severity priority status ' +
      'assignee_user_id stopped_at repair_start_at repair_end_at restored_at root_cause_code action_vi action_zh labor_cost ' +
      'outside_cost acceptance_result approved_by approved_at submitted_by submitted_at assigned_at cost_currency diagnosis_vi ' +
      'diagnosis_zh vendor_id outside_service_vi outside_service_zh test_run_result test_run_note_vi test_run_note_zh downtime_note ' +
      'source_work_order_id returned_reason returned_at cancel_reason cancelled_at reopen_reason reopened_at' },
  RepairTasks: { book: 'B', dot: 2, key: 'repair_task_id', c: true, i18n: true,
    cols: 'repair_task_id repair_id assignee_user_id start_at end_at task_vi task_zh result_vi result_zh status sort_order' },
  MaterialRequests: { book: 'B', dot: 2, key: 'request_id', c: true, i18n: true,
    cols: 'request_id request_code work_type work_id equipment_id location_id warehouse_id requested_by requested_at needed_at status ' +
      'approved_by approved_at sent_to_warehouse_at note_vi note_zh submitted_at reject_reason cancel_reason' },
  MaterialRequestLines: { book: 'B', dot: 2, key: 'request_line_id', c: true, i18n: true,
    cols: 'request_line_id request_id material_id requested_qty unit approved_qty issued_qty_snapshot returned_qty_snapshot ' +
      'inventory_sync_at status note_vi note_zh sort_order work_type work_id' },
  MaterialUsageLines: { book: 'B', dot: 2, key: 'usage_line_id', c: true, i18n: true,
    cols: 'usage_line_id work_type work_id equipment_id material_id request_line_id actual_used_qty scrap_qty unit manual_unit_cost ' +
      'currency cost_source net_issue_qty_snapshot inventory_cost_snapshot inventory_sync_at recorded_by confirmed_by status ' +
      'note_vi note_zh recorded_at confirmed_at' },
  OperatingReadings: { book: 'B', dot: 2, key: 'operating_reading_id', c: true,
    cols: 'operating_reading_id equipment_id measured_at cumulative_hours reading_user_id note work_order_id is_reset' },

  // ---- Nghiệp vụ Đợt 3 (10): Điện nước, Lộ điện, Báo cáo (6.1, 6.9.2; 3.12 B1, 3.13 B2) ----
  // Cột ngoài 1.4 §10.2 + 3.16: vị trí đặt đồng hồ, ghi chú; số thứ tự giai đoạn; lý do sửa/hủy chỉ số, sự kiện sinh ra
  // dòng chỉ số; trạng thái/duyệt sự kiện, hệ số mới; tên/trạng thái/người gửi của biểu giá; ghi chú tủ/lộ/phụ tải;
  // mẫu báo cáo tích hợp, nhóm, tên tệp mẫu; tên, số dòng, tệp PDF của báo cáo đã lưu.
  Meters: { book: 'B', dot: 3, key: 'meter_id', c: true, i18n: true,
    cols: 'meter_id meter_code name_vi name_zh utility_type location_id parent_meter_id current_segment_id serial unit multiplier ' +
      'reading_cycle_type reading_cycle_value assigned_user_id active reading_cycle_anchor_date position_vi position_zh note' },
  MeterSegments: { book: 'B', dot: 3, key: 'segment_id', c: true,
    cols: 'segment_id meter_id serial start_at end_at opening_value closing_value multiplier event_id status seq_no' },
  MeterReadings: { book: 'B', dot: 3, key: 'reading_id', c: true, i18n: true,
    cols: 'reading_id meter_id meter_segment_id measured_at cumulative_value multiplier_at_reading reading_user_id status note_vi note_zh ' +
      'reading_kind event_id edit_reason void_reason' },
  MeterEvents: { book: 'B', dot: 3, key: 'event_id', c: true, i18n: true,
    cols: 'event_id meter_id event_type event_at old_serial new_serial closing_value opening_value old_segment_id new_segment_id ' +
      'approved_by note status approved_at new_multiplier old_multiplier note_vi note_zh reject_reason' },
  UtilityTariffs: { book: 'B', dot: 3, key: 'tariff_id', c: true, i18n: true,
    cols: 'tariff_id utility_type location_id effective_from effective_to pricing_type unit unit_price currency tax_rate detail_json ' +
      'approved_by status approved_at name_vi name_zh reject_reason' },
  Panels: { book: 'B', dot: 3, key: 'panel_id', c: true, i18n: true,
    cols: 'panel_id panel_code name_vi name_zh location_id supply_voltage rated_current status last_verified_at verified_by ' +
      'panel_type equipment_id note_vi note_zh' },
  Circuits: { book: 'B', dot: 3, key: 'circuit_id', c: true, i18n: true,
    cols: 'circuit_id circuit_code panel_id upstream_circuit_id supply_role name_vi name_zh phases voltage breaker_model ' +
      'breaker_rating_a protection_setting cable_type cable_section_mm2:STRING cable_length_m route_vi route_zh status verified_by verified_at note_vi note_zh' },
  CircuitLoads: { book: 'B', dot: 3, key: 'load_link_id', c: true, i18n: true,
    cols: 'load_link_id circuit_id equipment_id downstream_panel_id supply_role rated_load_kw note_vi note_zh' },
  ReportDefinitions: { book: 'B', dot: 3, key: 'report_definition_id', c: true, i18n: true,
    cols: 'report_definition_id code title_vi title_zh dataset filter_schema:JSON visible_columns:JSON chart_type allowed_roles:STRING active ' +
      'builtin group_key file_name' },
  ReportRuns: { book: 'B', dot: 3, key: 'report_run_id', c: true,
    cols: 'report_run_id report_definition_id generated_at generated_by filters_json source_revision snapshot_at status ' +
      'file_document_id access_scope dataset_epoch report_run_code title_vi title_zh row_count pdf_document_id dataset' },

  // ---- Đợt 4 (2): Xóa sạch dữ liệu vận hành (1.4 §10.3.1, §21; phụ lục 6.9.3). Chỉ máy chủ đọc/ghi, không đồng bộ xuống app.
  // Cột ngoài 1.4: run_kind/source_backup_ref (§10.3.1, RESTORE hoãn), bản kế hoạch lúc xem trước, phiên phục hồi, chi tiết lỗi;
  // ResetFiles: loại file (chính/ảnh nhỏ/thư mục), kết quả đưa về riêng tư.
  ResetRuns: { book: 'B', dot: 4, key: 'reset_run_id',
    cols: 'reset_run_id requested_by requested_at before_epoch after_epoch scope_key file_mode plan_hash confirmation_nonce_hash ' +
      'confirmation_expires_at backup_ref backup_verified_at status phase cursor_json summary_counts_json completed_at error_code ' +
      'run_kind source_backup_ref plan_json recovery_session_id error_detail updated_at' },
  ResetFiles: { book: 'B', dot: 4, key: 'reset_file_id',
    cols: 'reset_file_id reset_run_id drive_file_id source_document_id managed_folder_id owned_by_app file_mode status processed_at ' +
      'error_code file_kind privacy_status' },

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
  due_revision: 'STRING', days_remaining: 'INT', attempt_count: 'INT', row_number: 'INT', expected_version: 'INT',
  sort_order: 'INT', interval_value: 'INT', lead_time_days: 'INT', manufacture_year: 'INT', default_interval_months: 'INT',
  active: 'BOOL', owned_by_app: 'BOOL', must_change_pin: 'BOOL', lot_tracking: 'BOOL', serial_tracking: 'BOOL',
  is_equipment_component: 'BOOL', is_system_owner: 'BOOL', i18n_meta: 'JSON', code: 'CODE', schema_version: 'STRING',
  phone: 'STRING', email: 'STRING',
  // Đợt 2
  operating_hours_target: 'NUMBER', estimated_minutes: 'INT', last_done_hours: 'NUMBER', step_no: 'INT', min_value: 'NUMBER',
  max_value: 'NUMBER', required: 'BOOL', labor_minutes: 'INT', labor_cost: 'NUMBER', other_cost: 'NUMBER', outside_cost: 'NUMBER',
  checklist_revision: 'INT', operating_hours: 'NUMBER', template_revision: 'INT', measured_value: 'NUMBER',
  requested_qty: 'NUMBER', approved_qty: 'NUMBER', issued_qty_snapshot: 'NUMBER', returned_qty_snapshot: 'NUMBER',
  actual_used_qty: 'NUMBER', scrap_qty: 'NUMBER', manual_unit_cost: 'NUMBER', net_issue_qty_snapshot: 'NUMBER',
  inventory_cost_snapshot: 'NUMBER', cumulative_hours: 'NUMBER', is_reset: 'BOOL', needed_at: 'DATE',
  // Đợt 3
  multiplier: 'NUMBER', reading_cycle_value: 'INT', opening_value: 'NUMBER', closing_value: 'NUMBER', seq_no: 'INT',
  cumulative_value: 'NUMBER', multiplier_at_reading: 'NUMBER', new_multiplier: 'NUMBER', old_multiplier: 'NUMBER',
  unit_price: 'NUMBER', tax_rate: 'NUMBER', effective_to: 'DATE', supply_voltage: 'NUMBER', rated_current: 'NUMBER',
  phases: 'INT', voltage: 'NUMBER', breaker_rating_a: 'NUMBER', cable_length_m: 'NUMBER', rated_load_kw: 'NUMBER',
  builtin: 'BOOL', source_revision: 'INT', row_count: 'INT', reading_cycle_anchor_date: 'DATE'
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

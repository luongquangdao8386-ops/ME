/* 25_import: Nhập/xuất Excel Đợt 1 — 1.4 §11; phụ lục 1.5 mục 6.5.1, 3.15 (Nhập Excel), 4.4.11, 3.8.
 * File đọc ở trình duyệt (SheetJS), gửi theo khúc; máy chủ kiểm, ghi ImportBatches/ImportRows.
 * Dòng 1 là khóa cột, dòng 2 nhãn Việt · 中文, dữ liệu từ dòng 3. ID trống = ADD, có ID + record_version = UPDATE.
 * Commit: từng dòng chạy như action riêng (kiểm quyền người commit), operation_id = import_row_id (chống ghi lặp),
 * không dịch máy lúc commit (PENDING, dịch nền sau). Lô nhạy cảm: người commit khác người nhập, có PIN. */

var IMPORT_TEMPLATE_VERSION_ = '1';
var IMPORT_CHUNK_MAX_ = 200;
var IMPORT_COMMIT_MAX_ = 100;
var IMPORT_COMMIT_BUDGET_MS_ = 40000;

/** Một cột: [khóa, kiểu, Việt, 中文, tùy chọn] — kiểu: id ver key code text int num date bool enum ref */
function ic_(key, type, vi, zh, o) { var c = o || {}; c.key = key; c.type = type; c.vi = vi; c.zh = zh; return c; }

var LOOKUP_GROUP_ENUM_ = ['EQUIPMENT_CATEGORY', 'UNIT', 'SPEC_KEY', 'CAUSE'];

var IMPORT_TEMPLATES_ = {
  glossary: { module: 'catalog', sheets: [{ name: 'glossary', table: 'Glossary', entity: 'GLOSSARY', id: 'glossary_id', cols: [
    ic_('glossary_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'), ic_('term_vi', 'text', 'Thuật ngữ tiếng Việt', '越南语术语', { req: 1, max: 120 }),
    ic_('term_zh', 'text', 'Thuật ngữ tiếng Trung', '中文术语', { req: 1, max: 120 }), ic_('note', 'text', 'Ghi chú', '备注', { max: 300 }),
    ic_('active', 'bool', 'Đang dùng', '使用中'), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  locations: { module: 'catalog', sheets: [{ name: 'locations', table: 'Locations', entity: 'LOCATION', id: 'location_id', code: 'location_code', cols: [
    ic_('location_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'), ic_('location_code', 'code', 'Mã khu vực (trống = tự cấp)', '区域编号（空=自动）'),
    ic_('name_vi', 'text', 'Tên tiếng Việt', '越南语名称', { pair: 'name', max: 200 }), ic_('name_zh', 'text', 'Tên tiếng Trung', '中文名称', { pair: 'name', max: 200 }),
    ic_('type', 'enum', 'Loại khu vực', '区域类型', { options: LOCATION_TYPES_ }),
    ic_('parent_location_code', 'ref', 'Mã khu vực cha', '上级区域编号', { ref: 'Locations', to: 'parent_location_id', self: 1 }),
    ic_('active', 'bool', 'Đang dùng', '使用中'), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  lookups: { module: 'catalog', sheets: [{ name: 'lookups', table: 'LookupValues', entity: 'LOOKUP', id: 'value_id', cols: [
    ic_('value_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'), ic_('group_key', 'enum', 'Nhóm', '分组', { req: 1, options: LOOKUP_GROUP_ENUM_, fixed: 1 }),
    ic_('code', 'text', 'Mã', '编码', { req: 1, max: 40, fixed: 1, keep: 1 }),
    ic_('name_vi', 'text', 'Tên tiếng Việt', '越南语名称', { pair: 'name', max: 200 }), ic_('name_zh', 'text', 'Tên tiếng Trung', '中文名称', { pair: 'name', max: 200 }),
    ic_('active', 'bool', 'Đang dùng', '使用中'), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  vendors: { module: 'catalog', sheets: [{ name: 'vendors', table: 'Vendors', entity: 'VENDOR', id: 'vendor_id', code: 'vendor_code', cols: [
    ic_('vendor_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'), ic_('vendor_code', 'code', 'Mã nhà cung cấp (trống = tự cấp)', '供应商编号（空=自动）'),
    ic_('name', 'text', 'Tên nhà cung cấp', '供应商名称', { req: 1, max: 200 }), ic_('contact_name', 'text', 'Người liên hệ', '联系人', { max: 120 }),
    ic_('phone', 'text', 'Điện thoại', '电话', { max: 40, keep: 1 }), ic_('email', 'text', 'Email', '邮箱', { max: 120 }), ic_('address', 'text', 'Địa chỉ', '地址', { max: 200 }),
    ic_('services_vi', 'text', 'Dịch vụ (Việt)', '服务内容（越）', { pair: 'services', opt: 1, max: 500 }), ic_('services_zh', 'text', 'Dịch vụ (Trung)', '服务内容（中）', { pair: 'services', opt: 1, max: 500 }),
    ic_('active', 'bool', 'Đang dùng', '使用中'), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  materials: { module: 'warehouse', sheets: [{ name: 'materials', table: 'Materials', entity: 'MATERIAL', id: 'material_id', code: 'material_code', cols: [
    ic_('material_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'), ic_('material_code', 'code', 'Mã vật tư (trống = tự cấp)', '物料编号（空=自动）'),
    ic_('name_vi', 'text', 'Tên tiếng Việt', '越南语名称', { pair: 'name', max: 200 }), ic_('name_zh', 'text', 'Tên tiếng Trung', '中文名称', { pair: 'name', max: 200 }),
    ic_('specification_vi', 'text', 'Quy cách (Việt)', '规格（越）', { pair: 'specification', opt: 1, max: 500 }), ic_('specification_zh', 'text', 'Quy cách (Trung)', '规格（中）', { pair: 'specification', opt: 1, max: 500 }),
    ic_('group_key', 'enum', 'Nhóm vật tư', '物料分组', { options: MATERIAL_GROUPS_ }), ic_('item_kind', 'enum', 'Loại', '类型', { options: ITEM_KINDS_ }),
    ic_('is_equipment_component', 'bool', 'Gắn máy được', '可关联设备'), ic_('part_number', 'text', 'Part number', '零件号', { max: 120, keep: 1 }),
    ic_('manufacturer', 'text', 'Hãng', '品牌', { max: 120 }), ic_('model', 'text', 'Model', '型号', { max: 120, keep: 1 }),
    ic_('base_unit', 'text', 'Đơn vị cơ sở', '基本单位', { req: 'add', max: 20 }), ic_('vendor_code', 'ref', 'Mã nhà cung cấp', '供应商编号', { ref: 'Vendors', to: 'vendor_id' }),
    ic_('lead_time_days', 'int', 'Thời gian đặt hàng (ngày)', '采购周期（天）'), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  equipment: { module: 'equipment', sheets: [
    { name: 'equipment', table: 'Equipment', entity: 'EQUIPMENT', id: 'equipment_id', code: 'equipment_code', cols: [
      ic_('equipment_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'), ic_('row_key', 'key', 'Khóa dòng (để sheet thông số tham chiếu thiết bị mới)', '行键（供参数表引用新设备）'),
      ic_('equipment_code', 'code', 'Mã thiết bị (trống = tự cấp)', '设备编号（空=自动）'),
      ic_('name_vi', 'text', 'Tên tiếng Việt', '越南语名称', { pair: 'name', max: 200 }), ic_('name_zh', 'text', 'Tên tiếng Trung', '中文名称', { pair: 'name', max: 200 }),
      ic_('category_code', 'ref', 'Mã loại thiết bị', '设备类别编码', { ref: 'LookupValues', group: 'EQUIPMENT_CATEGORY', to: 'category_id' }),
      ic_('location_code', 'ref', 'Mã khu vực', '区域编号', { ref: 'Locations', to: 'location_id' }), ic_('vendor_code', 'ref', 'Mã nhà cung cấp', '供应商编号', { ref: 'Vendors', to: 'vendor_id' }),
      ic_('manufacturer', 'text', 'Hãng', '品牌', { max: 120 }), ic_('model', 'text', 'Model', '型号', { max: 120, keep: 1 }), ic_('serial', 'text', 'Số serial', '序列号', { max: 120, keep: 1 }),
      ic_('manufacture_year', 'int', 'Năm sản xuất', '生产年份'), ic_('install_date', 'date', 'Ngày lắp đặt', '安装日期'), ic_('warranty_end', 'date', 'Hết bảo hành', '保修到期'),
      ic_('status', 'enum', 'Tình trạng', '状态', { options: EQUIPMENT_STATUS_ }), ic_('criticality', 'enum', 'Mức quan trọng', '重要程度', { options: CRITICALITY_ }),
      ic_('owner_code', 'ref', 'Mã NV phụ trách', '负责人员工编号', { ref: 'Users', to: 'owner_user_id' }), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] },
    { name: 'equipment_specs', table: 'EquipmentSpecs', entity: 'EQUIPMENT_SPEC', id: 'spec_id', cols: [
      ic_('spec_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'),
      ic_('equipment_key', 'ref', 'Mã thiết bị hoặc khóa dòng', '设备编号或行键', { req: 1, ref: 'Equipment', to: 'equipment_id', fileSheet: 'equipment', fixed: 1 }),
      ic_('spec_key', 'text', 'Khóa thông số (vd electrical_power)', '参数键（如 electrical_power）', { req: 1, max: 40, keep: 1 }),
      ic_('value_num', 'num', 'Giá trị số', '数值'), ic_('value_text', 'text', 'Giá trị chữ', '文字值', { max: 200 }), ic_('unit', 'text', 'Đơn vị', '单位', { max: 20, keep: 1 }),
      ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  equipment_parts: { module: 'equipment', sheets: [{ name: 'equipment_parts', table: 'EquipmentParts', entity: 'EQUIPMENT_PART', id: 'equipment_part_id', cols: [
    ic_('equipment_part_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'),
    ic_('equipment_code', 'ref', 'Mã thiết bị', '设备编号', { req: 1, ref: 'Equipment', to: 'equipment_id', fixed: 1 }),
    ic_('material_code', 'ref', 'Mã vật tư', '物料编号', { req: 1, ref: 'Materials', to: 'material_id', fixed: 1 }),
    ic_('installed_qty', 'num', 'Số lượng lắp', '安装数量', { req: 1 }),
    ic_('function_vi', 'text', 'Chức năng (Việt)', '功能（越）', { pair: 'function', opt: 1, max: 200 }), ic_('function_zh', 'text', 'Chức năng (Trung)', '功能（中）', { pair: 'function', opt: 1, max: 200 }),
    ic_('position_vi', 'text', 'Vị trí lắp (Việt)', '安装位置（越）', { pair: 'position', opt: 1, max: 200 }), ic_('position_zh', 'text', 'Vị trí lắp (Trung)', '安装位置（中）', { pair: 'position', opt: 1, max: 200 }),
    ic_('effective_from', 'date', 'Lắp từ ngày', '安装日期'), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  inspection_types: { module: 'inspections', sheets: [{ name: 'inspection_types', table: 'InspectionTypes', entity: 'INSPECTION_TYPE', id: 'inspection_type_id', cols: [
    ic_('inspection_type_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'), ic_('code', 'text', 'Mã loại', '类型编码', { req: 1, max: 32, upper: 1 }),
    ic_('name_vi', 'text', 'Tên tiếng Việt', '越南语名称', { pair: 'name', max: 200 }), ic_('name_zh', 'text', 'Tên tiếng Trung', '中文名称', { pair: 'name', max: 200 }),
    ic_('required_docs_vi', 'text', 'Hồ sơ cần có (Việt)', '所需资料（越）', { pair: 'required_docs', opt: 1, max: 1000 }), ic_('required_docs_zh', 'text', 'Hồ sơ cần có (Trung)', '所需资料（中）', { pair: 'required_docs', opt: 1, max: 1000 }),
    ic_('reference_basis', 'text', 'Căn cứ', '依据', { max: 300 }), ic_('default_interval_months', 'int', 'Chu kỳ tham khảo (tháng)', '参考周期（月）'),
    ic_('active', 'bool', 'Đang dùng', '使用中'), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  inspection_requirements: { module: 'inspections', sheets: [{ name: 'inspection_requirements', table: 'InspectionRequirements', entity: 'INSPECTION_REQUIREMENT', id: 'requirement_id', cols: [
    ic_('requirement_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'),
    ic_('equipment_code', 'ref', 'Mã thiết bị', '设备编号', { ref: 'Equipment', to: 'equipment_id' }), ic_('location_code', 'ref', 'Mã khu vực', '区域编号', { ref: 'Locations', to: 'location_id' }),
    ic_('inspection_type_code', 'ref', 'Mã loại kiểm định', '检验类型编码', { req: 1, ref: 'InspectionTypes', to: 'inspection_type_id' }),
    ic_('owner_code', 'ref', 'Mã NV phụ trách', '负责人员工编号', { ref: 'Users', to: 'owner_user_id' }),
    ic_('obligation_status', 'enum', 'Bắt buộc/tự nguyện', '强制/自愿', { options: ['REQUIRED', 'VOLUNTARY'] }), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] },
  inspections: { module: 'inspections', sensitive: true, sheets: [{ name: 'inspections', table: 'Inspections', entity: 'INSPECTION', id: 'inspection_id', addOnly: true, cols: [
    ic_('inspection_id', 'id', 'ID (để trống)', 'ID（留空）'),
    ic_('requirement_code', 'ref', 'Mã yêu cầu kiểm định', '检验要求编号', { req: 1, ref: 'InspectionRequirements', to: 'requirement_id' }),
    ic_('inspection_date', 'date', 'Ngày kiểm định', '检验日期', { req: 1 }), ic_('valid_from', 'date', 'Hiệu lực từ', '有效期自'), ic_('valid_to', 'date', 'Hiệu lực đến', '有效期至'),
    ic_('next_due_date', 'date', 'Hạn kiểm định tiếp theo', '下次检验期限'), ic_('result', 'enum', 'Kết quả', '结果', { req: 1, options: ['PASS', 'CONDITIONAL_PASS', 'FAIL'] }),
    ic_('certificate_number', 'text', 'Số chứng nhận', '证书编号', { max: 80, keep: 1 }),
    ic_('restriction_vi', 'text', 'Hạn chế/kết luận (Việt)', '限制/结论（越）', { pair: 'restriction', opt: 1, max: 1000 }), ic_('restriction_zh', 'text', 'Hạn chế/kết luận (Trung)', '限制/结论（中）', { pair: 'restriction', opt: 1, max: 1000 }),
    ic_('vendor_code', 'ref', 'Mã đơn vị kiểm định', '检验单位编号', { ref: 'Vendors', to: 'vendor_id' }), ic_('cost', 'num', 'Chi phí', '费用', { cost: 1 })] }] },
  contracts: { module: 'contracts', sheets: [
    { name: 'contracts', table: 'Contracts', entity: 'CONTRACT', id: 'contract_id', cols: [
      ic_('contract_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'), ic_('row_key', 'key', 'Khóa dòng (để sheet thiết bị tham chiếu hợp đồng mới)', '行键（供设备表引用新合同）'),
      ic_('contract_code', 'code', 'Mã hợp đồng (máy chủ cấp)', '合同编号（系统分配）', { readonly: 1 }), ic_('contract_number', 'text', 'Số hợp đồng', '合同号', { max: 80, keep: 1 }),
      ic_('title_vi', 'text', 'Tên (Việt)', '名称（越）', { pair: 'title', max: 200 }), ic_('title_zh', 'text', 'Tên (Trung)', '名称（中）', { pair: 'title', max: 200 }),
      ic_('vendor_code', 'ref', 'Mã nhà cung cấp', '供应商编号', { ref: 'Vendors', to: 'vendor_id' }), ic_('owner_code', 'ref', 'Mã NV phụ trách', '负责人员工编号', { ref: 'Users', to: 'owner_user_id' }),
      ic_('start_date', 'date', 'Ngày bắt đầu', '开始日期', { term: 1 }), ic_('end_date', 'date', 'Ngày hết hạn', '到期日', { req: 'add', term: 1 }),
      ic_('renewal_notice_date', 'date', 'Hạn báo gia hạn', '续约通知期限', { term: 1 }), ic_('value', 'num', 'Giá trị', '金额', { cost: 1, term: 1 }), ic_('currency', 'text', 'Tiền tệ', '币种', { cost: 1, term: 1, max: 3, upper: 1 }),
      ic_('scope_vi', 'text', 'Phạm vi (Việt)', '范围（越）', { pair: 'scope', opt: 1, max: 2000 }), ic_('scope_zh', 'text', 'Phạm vi (Trung)', '范围（中）', { pair: 'scope', opt: 1, max: 2000 }),
      ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] },
    { name: 'contract_equipment', table: 'ContractEquipment', entity: 'CONTRACT_EQUIPMENT', id: 'contract_equipment_id', cols: [
      ic_('contract_equipment_id', 'id', 'ID (trống = thêm mới)', 'ID（空=新增）'),
      ic_('contract_key', 'ref', 'Mã hợp đồng hoặc khóa dòng', '合同编号或行键', { req: 1, ref: 'Contracts', to: 'contract_id', fileSheet: 'contracts', fixed: 1 }),
      ic_('equipment_code', 'ref', 'Mã thiết bị', '设备编号', { req: 1, ref: 'Equipment', to: 'equipment_id', fixed: 1 }),
      ic_('service_vi', 'text', 'Dịch vụ (Việt)', '服务（越）', { pair: 'service', opt: 1, max: 500 }), ic_('service_zh', 'text', 'Dịch vụ (Trung)', '服务（中）', { pair: 'service', opt: 1, max: 500 }),
      ic_('interval_type', 'enum', 'Chu kỳ theo', '周期单位', { options: INTERVAL_TYPES_ }), ic_('interval_value', 'int', 'Số chu kỳ', '周期数'),
      ic_('next_service_date', 'date', 'Ngày dịch vụ tiếp theo', '下次服务日期'), ic_('price', 'num', 'Đơn giá', '单价', { cost: 1 }), ic_('record_version', 'ver', 'Phiên bản bản ghi', '记录版本')] }] }
};

/** Bảng → cột mã dùng tra tham chiếu */
var REF_CODE_COL_ = {
  Locations: 'location_code', Vendors: 'vendor_code', LookupValues: 'code', Equipment: 'equipment_code', Materials: 'material_code',
  InspectionTypes: 'code', InspectionRequirements: 'requirement_code', Contracts: 'contract_code', Users: 'employee_code'
};

function importTemplate_(key) {
  var t = IMPORT_TEMPLATES_[key];
  if (!t) throw validationError_([fieldError_('template_key', 'INVALID_VALUE')]);
  return t;
}

/**
 * Quyền ghi lô (import.commit, cờ I + A). Danh mục chung không có cờ A ở bảng 4.8 → lô danh mục chỉ cần I
 * và ô C3/C4 của import.commit (quyết định kỹ thuật, ghi trong skill).
 */
function canImportCommit_(ctx, module) {
  if (module !== 'catalog') return can_(ctx, 'import.commit', { module: module });
  var def = ACTION_REGISTRY['import.commit'];
  return hasFlag_(Number(ctx.user.role_level), 'catalog', 'I') && evalCells_(ctx, def, 'catalog').allowed;
}
function assertImportCommit_(ctx, module) {
  if (!canImportCommit_(ctx, module)) throw apiError_('FORBIDDEN');
}

/** Cột giá ẩn với người không có quyền $ (4.5) */
function templateCols_(ctx, t, sh) {
  var cost = canViewCost_(ctx, t.module);
  return sh.cols.filter(function (c) { return !c.cost || cost; });
}

/* ---------------- Mẫu ---------------- */

/** import.template {template_key}: định nghĩa cột + danh mục mã để trình duyệt dựng file .xlsx */
function importTemplateAction_(ctx) {
  var p = ctx.req.payload || {};
  var t = importTemplate_(p.template_key);
  authorize_(ctx, 'import.template', { module: t.module });
  var lists = {};
  var addList = function (name, vals) { if (vals.length) lists[name] = vals.slice(0, 2000); };
  addList('locations', readRows_('Locations').filter(function (r) { return r.active !== false; }).map(function (r) { return [r.location_code, r.name_vi || r.name_zh]; }));
  addList('vendors', readRows_('Vendors').filter(function (r) { return r.active !== false; }).map(function (r) { return [r.vendor_code, r.name]; }));
  var lk = readRows_('LookupValues').filter(function (r) { return r.active !== false && !r.archived_at; });
  LOOKUP_GROUP_ENUM_.forEach(function (g) { addList('lookup_' + g, lk.filter(function (r) { return r.group_key === g; }).map(function (r) { return [r.code, r.name_vi || r.name_zh]; })); });
  if (t.module === 'inspections') addList('inspection_types', readRows_('InspectionTypes').filter(function (r) { return r.active !== false; }).map(function (r) { return [r.code, r.name_vi || r.name_zh]; }));
  addList('spec_keys', Object.keys(SPEC_STD_).map(function (k) { return [k, LABELS['spec.' + k] ? LABELS['spec.' + k][0] : k]; }));
  return {
    template_key: p.template_key, version: IMPORT_TEMPLATE_VERSION_, dataset_epoch: sysProps_().dataset_epoch, module: t.module, sensitive: !!t.sensitive,
    sheets: t.sheets.map(function (sh) {
      return { name: sh.name, cols: templateCols_(ctx, t, sh).map(function (c) {
        return { key: c.key, type: c.type, label_vi: c.vi, label_zh: c.zh, required: c.req === 1 || c.req === true, required_add: c.req === 'add', options: c.options || null, text: c.type === 'code' || c.type === 'ref' || c.type === 'key' || c.type === 'id' || !!c.keep };
      }) };
    }),
    lists: lists
  };
}

/* ---------------- Chuẩn hóa ô ---------------- */

/** dd/mm/yyyy hoặc yyyy-mm-dd → ISO; ngày không có thật → null */
function parseImportDate_(v) {
  var s = trimStr_(v);
  if (!s) return '';
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) || null;
  var y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; } else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (!m) return null;
    d = +m[1]; mo = +m[2]; y = +m[3];
  }
  var dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
}

/** Số trong ô chữ: bỏ khoảng trắng nghìn, một dấu thập phân (. hoặc ,) */
function parseImportNum_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  var s = trimStr_(v).replace(/[\s  ]/g, '');
  if (!s) return '';
  if (/^-?\d+([.,]\d+)?$/.test(s)) return Number(s.replace(',', '.'));
  return NaN;
}

function parseImportBool_(v) {
  if (v === true || v === false) return v;
  var s = trimStr_(v).toLowerCase();
  if (!s) return '';
  if (['true', '1', 'x', 'có', 'co', 'yes', 'y', '是'].indexOf(s) >= 0) return true;
  if (['false', '0', 'không', 'khong', 'no', 'n', '否'].indexOf(s) >= 0) return false;
  return null;
}

/** Chuẩn hóa một ô theo kiểu cột; trả {v} hoặc {err} */
function normCell_(c, raw) {
  if (raw === undefined) return { skip: true };
  if (raw === null) raw = '';
  if (c.type === 'int' || c.type === 'num' || c.type === 'ver') {
    var n = parseImportNum_(raw);
    if (n === '') return { v: '' };
    if (isNaN(n) || ((c.type === 'int' || c.type === 'ver') && Math.floor(n) !== n)) return { err: 'INVALID_VALUE' };
    return { v: n };
  }
  if (c.type === 'date') {
    var d = parseImportDate_(raw);
    if (d === null) return { err: 'INVALID_DATE' };
    return { v: d };
  }
  if (c.type === 'bool') {
    var b = parseImportBool_(raw);
    if (b === null) return { err: 'INVALID_VALUE' };
    return { v: b };
  }
  var s = typeof raw === 'number' ? String(raw) : trimStr_(raw);
  if (c.type === 'enum') {
    if (!s) return { v: '' };
    s = s.toUpperCase();
    if ((c.options || []).indexOf(s) < 0) return { err: 'INVALID_VALUE' };
    return { v: s };
  }
  if (c.type === 'code' || c.upper) s = s.toUpperCase();
  if (c.type === 'id') s = s.toLowerCase();
  if (c.max && s.length > c.max) return { err: 'INVALID_VALUE' };
  return { v: s };
}

/* ---------------- Xem trước theo khúc ---------------- */

function batchById_(id) {
  return isUuidV4_(id) ? findOne_('ImportBatches', 'import_batch_id', id) : null;
}

/**
 * import.preview {import_batch_id, template_key, chunk_index, chunk_count, total_rows, source_sha256, meta,
 *   rows: [{sheet, row_number, values: {key: raw}, formulas: [key]}]}
 * Khúc 100–200 dòng; khúc cuối (đủ total_rows) thì kiểm cả lô và trả kết quả xem trước.
 */
function importPreview_(ctx) {
  var p = ctx.req.payload || {};
  var t = importTemplate_(p.template_key);
  authorize_(ctx, 'import.preview', { module: t.module });
  var errs = [];
  if (!isUuidV4_(p.import_batch_id)) errs.push(fieldError_('import_batch_id', 'ID_INVALID'));
  if (!/^[0-9a-f]{64}$/.test(String(p.source_sha256 || ''))) errs.push(fieldError_('source_sha256', 'INVALID_VALUE'));
  var rows = Array.isArray(p.rows) ? p.rows : [];
  if (rows.length > IMPORT_CHUNK_MAX_) errs.push(fieldError_('rows', 'INVALID_VALUE'));
  var total = Number(p.total_rows);
  if (!(total >= 0 && total <= 5000)) errs.push(fieldError_('total_rows', 'INVALID_VALUE'));
  if (p.meta && p.meta.dataset_epoch && p.meta.dataset_epoch !== sysProps_().dataset_epoch) errs.push(fieldError_('template', 'TEMPLATE_EPOCH'));
  if (p.meta && p.meta.template_key && p.meta.template_key !== p.template_key) errs.push(fieldError_('template', 'TEMPLATE_MISMATCH'));
  var sheetNames = t.sheets.map(function (s) { return s.name; });
  rows.forEach(function (r) { if (!r || sheetNames.indexOf(r.sheet) < 0 || !(Number(r.row_number) >= 3)) errs.push(fieldError_('rows', 'INVALID_VALUE')); });
  if (errs.length) throw validationError_(errs);
  var stored = withWriteLock_(function () {
    var b = batchById_(p.import_batch_id);
    var nowIso = isoVN_(now_());
    if (b) {
      if (b.imported_by !== ctx.user.user_id || b.module !== p.template_key) throw apiError_('FORBIDDEN');
      if (b.source_sha256 !== p.source_sha256) throw validationError_([fieldError_('source_sha256', 'SOURCE_CHANGED')]);
      if (b.status !== 'VALIDATING') return { batch: b, done: true };
    } else {
      b = {
        import_batch_id: p.import_batch_id, module: p.template_key, schema_version: IMPORT_TEMPLATE_VERSION_, imported_by: ctx.user.user_id, imported_at: nowIso,
        file_document_id: '', total_rows: total, add_count: 0, update_count: 0, error_count: 0, status: 'VALIDATING', approved_by: '', completed_at: '',
        dataset_epoch: sysProps_().dataset_epoch, source_sha256: p.source_sha256, committing_session_id: '', commit_started_at: '', record_version: 1, updated_at: nowIso
      };
      insertRows_('ImportBatches', [b]);
    }
    var have = {};
    findAll_('ImportRows', 'import_batch_id', p.import_batch_id).forEach(function (r) { have[(r.normalized_payload_json || {}).s + '|' + r.row_number] = true; });
    var ins = [];
    rows.forEach(function (r) {
      var k = r.sheet + '|' + Number(r.row_number);
      if (have[k]) return;
      have[k] = true;
      ins.push({
        import_row_id: uuid_(), import_batch_id: p.import_batch_id, row_number: Number(r.row_number), entity_type: '', entity_id: '', action: '',
        expected_version: '', validation_status: 'PENDING', error_text: '', committed_at: '',
        normalized_payload_json: JSON.stringify({ s: r.sheet, raw: r.values || {}, f: Array.isArray(r.formulas) ? r.formulas : [] }),
        row_hash: b64url_(sha256_(JSON.stringify(r.values || {})))
      });
    });
    if (ins.length) insertRows_('ImportRows', ins);
    return { batch: b, count: Object.keys(have).length };
  });
  if (stored.done) return importSummary_(ctx, stored.batch, true);
  if (stored.count < total) return { import_batch_id: p.import_batch_id, status: 'VALIDATING', received: stored.count, total_rows: total };
  return validateImportBatch_(ctx, t, p.import_batch_id);
}

/** Kiểm cả lô (khúc cuối). Ghi kết quả từng dòng, trạng thái READY/NEEDS_FIX */
function validateImportBatch_(ctx, t, batchId) {
  dbReset_();
  var rows = findAll_('ImportRows', 'import_batch_id', batchId);
  var costOk = canViewCost_(ctx, t.module);
  // Bảng mã → dòng hiện có
  var codeMaps = {};
  var codeMap = function (table, group) {
    var k = table + (group ? ':' + group : '');
    if (!codeMaps[k]) {
      var m = {};
      readRows_(table).forEach(function (r) {
        if (r.archived_at) return;
        if (group && r.group_key !== group) return;
        var code = String(r[REF_CODE_COL_[table]] || '');
        m[table === 'LookupValues' || table === 'Users' ? code.toUpperCase() : code] = r;
      });
      codeMaps[k] = m;
    }
    return codeMaps[k];
  };
  var byId = {};
  var rowById = function (table, id) {
    if (!byId[table]) { byId[table] = {}; readRows_(table).forEach(function (r) { byId[table][r[sheetSchema_(table).key]] = r; }); }
    return byId[table][id] || null;
  };
  var sensitive = !!t.sensitive;
  var addN = 0, updN = 0, errN = 0, mtN = 0;
  // Khóa trong file: mã/khóa dòng → entity_id đã cấp (cho tham chiếu tới dòng thêm mới cùng file)
  var fileKeys = {};
  var parsed = rows.map(function (ir) {
    var np = ir.normalized_payload_json || {};
    return { ir: ir, sheet: np.s, raw: np.raw || {}, formulas: np.f || [], vals: {}, errs: [] };
  });
  var sheetDef = {};
  t.sheets.forEach(function (sh) { sheetDef[sh.name] = sh; });
  var order = t.sheets.map(function (s) { return s.name; });
  parsed.sort(function (a, b) { return order.indexOf(a.sheet) - order.indexOf(b.sheet) || a.ir.row_number - b.ir.row_number; });
  // Lượt 1: chuẩn hóa, ADD/UPDATE, cấp ID, mã trùng trong file
  var seenCodes = {};
  parsed.forEach(function (x) {
    var sh = sheetDef[x.sheet];
    var cols = templateCols_(ctx, t, sh);
    x.sh = sh;
    sh.cols.forEach(function (c) {
      if (c.cost && !costOk && x.raw[c.key] !== undefined && x.raw[c.key] !== '' && x.raw[c.key] !== null) x.errs.push([c.key, 'COST_FIELD_FORBIDDEN']);
    });
    x.formulas.forEach(function (k) { x.errs.push([k, 'FORMULA']); });
    cols.forEach(function (c) {
      var n = normCell_(c, x.raw[c.key]);
      if (n.skip) return;
      if (n.err) { x.errs.push([c.key, n.err]); return; }
      x.vals[c.key] = n.v;
    });
    var id = x.vals[sh.id] || '';
    if (id) {
      if (sh.addOnly) { x.errs.push([sh.id, 'INVALID_VALUE']); return; }
      var cur = isUuidV4_(id) ? rowById(sh.table, id) : null;
      if (!cur || cur.archived_at) { x.errs.push([sh.id, 'NOT_FOUND']); return; }
      x.action = 'UPDATE'; x.entityId = id; x.cur = cur;
      if (x.vals.record_version === undefined || x.vals.record_version === '') x.errs.push(['record_version', 'REQUIRED']);
      else if (Number(x.vals.record_version) !== Number(cur.record_version || 1)) x.errs.push(['record_version', 'VERSION_CONFLICT']);
    } else {
      x.action = 'ADD'; x.entityId = uuid_(); x.cur = null;
    }
    // Cột không đổi được khi sửa (khóa, nhóm, mã máy chủ cấp)
    sh.cols.forEach(function (c) {
      if (x.action === 'UPDATE' && c.fixed && x.vals[c.key] !== undefined && c.type !== 'ref' && String(x.vals[c.key]) !== String(x.cur[c.key])) x.errs.push([c.key, 'INVALID_VALUE']);
      if (c.readonly && x.action === 'ADD' && x.vals[c.key]) x.errs.push([c.key, 'INVALID_VALUE']);
      if (c.readonly && x.action === 'UPDATE' && x.vals[c.key] && x.vals[c.key] !== x.cur[c.key]) x.errs.push([c.key, 'INVALID_VALUE']);
      var req = c.req === 1 || c.req === true || (c.req === 'add' && x.action === 'ADD');
      if (req && (x.vals[c.key] === undefined || x.vals[c.key] === '')) {
        if (x.action === 'ADD' || x.vals[c.key] === '') x.errs.push([c.key, 'REQUIRED']);
      }
    });
    // Cặp song ngữ bắt buộc một bên
    var pairs = {};
    sh.cols.forEach(function (c) { if (c.pair) pairs[c.pair] = c.opt ? 'opt' : 'req'; });
    Object.keys(pairs).forEach(function (base) {
      var vi = x.vals[base + '_vi'], zh = x.vals[base + '_zh'];
      var curVi = x.cur ? x.cur[base + '_vi'] : '', curZh = x.cur ? x.cur[base + '_zh'] : '';
      var fvi = vi !== undefined ? vi : curVi, fzh = zh !== undefined ? zh : curZh;
      if (pairs[base] === 'req' && !fvi && !fzh) x.errs.push([base, 'REQUIRED_ONE_LANGUAGE']);
      if ((fvi && !fzh) || (!fvi && fzh)) {
        if ((NO_MT_FIELDS[sh.table] || []).indexOf(base) < 0) mtN++;
      }
    });
    // Mã trùng: trong file, và dòng thêm mới trùng mã đang có
    var codeCol = sh.code || (sh.table === 'InspectionTypes' ? 'code' : null);
    if (codeCol && x.vals[codeCol]) {
      var code = String(x.vals[codeCol]);
      var dupKey = sh.name + '|' + code;
      if (seenCodes[dupKey]) x.errs.push([codeCol, 'CODE_DUPLICATE']);
      seenCodes[dupKey] = true;
      var existing = codeMap(sh.table)[code];
      if (existing && (x.action === 'ADD' || existing[sh.id] !== x.entityId)) x.errs.push([codeCol, 'CODE_DUPLICATE']);
      if (x.action === 'ADD') fileKeys[sh.name + '|' + code] = x.entityId;
    }
    if (sh.table === 'LookupValues' && x.action === 'ADD' && x.vals.code) {
      var g = x.vals.group_key, lc = String(x.vals.code);
      if (g === 'SPEC_KEY' && !/^[a-z][a-z0-9_]{1,39}$/.test(lc)) x.errs.push(['code', 'CODE_INVALID']);
      if (g === 'SPEC_KEY' && SPEC_STD_[lc]) x.errs.push(['code', 'CODE_DUPLICATE']);
      var lkKey = 'lk|' + g + '|' + lc.toLowerCase();
      if (seenCodes[lkKey] || readRowsCached_('LookupValues').some(function (l) { return l.group_key === g && String(l.code).toLowerCase() === lc.toLowerCase(); })) x.errs.push(['code', 'CODE_DUPLICATE']);
      seenCodes[lkKey] = true;
    }
    if (sh.table === 'Glossary') {
      ['term_vi', 'term_zh'].forEach(function (f) {
        var v = normTerm_(x.vals[f] !== undefined ? x.vals[f] : (x.cur ? x.cur[f] : ''));
        if (!v) return;
        var k2 = 'g|' + f + '|' + v;
        if (seenCodes[k2] || readRowsCached_('Glossary').some(function (g2) { return g2.glossary_id !== x.entityId && g2.active && !g2.archived_at && normTerm_(g2[f]) === v; })) x.errs.push([f, 'CODE_DUPLICATE']);
        seenCodes[k2] = true;
      });
    }
    if (x.vals.row_key) {
      var rk = sh.name + '|' + String(x.vals.row_key).toUpperCase();
      if (fileKeys['rk|' + rk]) x.errs.push(['row_key', 'CODE_DUPLICATE']);
      fileKeys['rk|' + rk] = x.entityId;
    }
    if (x.action === 'UPDATE' && sh.code && x.cur) fileKeys[sh.name + '|' + x.cur[sh.code]] = x.entityId;
    // Lô nhạy cảm: hợp đồng có hạn/giá trị (thêm mới, hoặc sửa làm đổi)
    if (sh.table === 'Contracts') {
      sh.cols.forEach(function (c) {
        if (!c.term || x.vals[c.key] === undefined) return;
        if (x.action === 'ADD' ? x.vals[c.key] !== '' : String(x.vals[c.key]) !== String(x.cur[c.key] === undefined ? '' : x.cur[c.key])) sensitive = true;
      });
    }
  });
  // Lượt 2: tham chiếu (mã đang có hoặc dòng thêm mới cùng file)
  parsed.forEach(function (x) {
    x.refs = {};
    x.deps = [];
    templateCols_(ctx, t, x.sh).forEach(function (c) {
      if (c.type !== 'ref' || x.vals[c.key] === undefined) return;
      var code = String(x.vals[c.key]);
      if (!code) { x.refs[c.to] = ''; return; }
      var up = c.ref === 'LookupValues' || c.ref === 'Users' ? code.toUpperCase() : code;
      var inFileSheet = c.fileSheet || (c.self ? x.sh.name : null) || t.sheets.filter(function (s) { return s.table === c.ref; }).map(function (s) { return s.name; })[0];
      var fid = inFileSheet ? (fileKeys[inFileSheet + '|' + code] || fileKeys['rk|' + inFileSheet + '|' + code.toUpperCase()]) : null;
      if (fid) { x.refs[c.to] = fid; if (fid !== x.entityId) x.deps.push(fid); else x.errs.push([c.key, 'INVALID_VALUE']); return; }
      var r = codeMap(c.ref, c.group)[up];
      if (!r || (c.ref === 'Users' && !r.active)) { x.errs.push([c.key, 'NOT_FOUND']); return; }
      x.refs[c.to] = r[sheetSchema_(c.ref).key];
    });
    if (x.sh.table === 'InspectionRequirements' && x.action === 'ADD' && !x.refs.equipment_id && !x.refs.location_id) x.errs.push(['equipment_code', 'REQUIRED']);
    if (x.sh.table === 'EquipmentSpecs' && x.vals.spec_key && !specLabel_(String(x.vals.spec_key), readRowsCached_('LookupValues'))) x.errs.push(['spec_key', 'INVALID_VALUE']);
    if (x.sh.table === 'Inspections') {
      var res = x.vals.result;
      if (res && res !== 'FAIL' && !x.vals.valid_from) x.errs.push(['valid_from', 'REQUIRED']);
      if (res && res !== 'FAIL' && !x.vals.valid_to) x.errs.push(['valid_to', 'REQUIRED']);
      if (x.vals.valid_from && x.vals.valid_to && x.vals.valid_from > x.vals.valid_to) x.errs.push(['valid_to', 'INVALID_DATE']);
      if (res === 'CONDITIONAL_PASS' && !x.vals.restriction_vi && !x.vals.restriction_zh) x.errs.push(['restriction', 'RESTRICTION_REQUIRED']);
    }
    if (x.sh.table === 'Contracts') {
      var m2 = {};
      ['start_date', 'end_date', 'renewal_notice_date'].forEach(function (f) { m2[f] = x.vals[f] !== undefined ? x.vals[f] : (x.cur ? x.cur[f] : ''); });
      if (m2.start_date && m2.end_date && m2.start_date > m2.end_date) x.errs.push(['end_date', 'INVALID_DATE']);
      if (m2.renewal_notice_date && m2.end_date && m2.renewal_notice_date > m2.end_date) x.errs.push(['renewal_notice_date', 'RENEWAL_NOTICE_AFTER_END']);
      if (x.cur && (x.cur.lifecycle_status !== 'ACTIVE' || x.cur.status !== 'APPROVED')) x.errs.push(['contract_id', 'INVALID_VALUE']);
    }
  });
  // Ghi kết quả (dưới khóa, ghi theo khối)
  var nowIso = isoVN_(now_());
  parsed.forEach(function (x) {
    var ok = !x.errs.length;
    if (ok) { if (x.action === 'ADD') addN++; else updN++; } else errN++;
    x.ir.entity_type = x.sh ? x.sh.entity : '';
    x.ir.entity_id = x.entityId || '';
    x.ir.action = x.action || '';
    x.ir.expected_version = x.action === 'UPDATE' ? Number(x.vals.record_version) : 0;
    x.ir.validation_status = ok ? 'OK' : 'ERROR';
    x.ir.error_text = ok ? '' : JSON.stringify(x.errs.map(function (e) { return { field: e[0], code: e[1] }; }));
    var np = x.ir.normalized_payload_json || {};
    np.v = x.vals; np.r = x.refs; np.d = x.deps;
    x.ir.normalized_payload_json = np;
  });
  var batch = withWriteLock_(function () {
    writeRowsBulk_('ImportRows', parsed.map(function (x) { return x.ir; }));
    var b = batchById_(batchId);
    var upd = { add_count: addN, update_count: updN, error_count: errN, status: errN ? 'NEEDS_FIX' : 'READY', updated_at: nowIso, record_version: (b.record_version || 1) + 1 };
    writeCells_('ImportBatches', b.__row, upd);
    Object.keys(upd).forEach(function (k) { b[k] = upd[k]; });
    return b;
  });
  return importSummary_(ctx, batch, false, { mt_fields: mtN, sensitive: sensitive, parsed: parsed });
}

var READ_CACHE_ = {};
function readRowsCached_(table) {
  if (DB_.__rc !== READ_CACHE_) { READ_CACHE_ = {}; DB_.__rc = READ_CACHE_; }
  if (!READ_CACHE_[table]) READ_CACHE_[table] = readRows_(table);
  return READ_CACHE_[table];
}

/** Ghi lại nhiều dòng đã có (gom dòng liền nhau thành một lần setValues) */
function writeRowsBulk_(name, objs) {
  var h = hdr_(name);
  var sorted = objs.filter(function (o) { return o.__row; }).sort(function (a, b) { return a.__row - b.__row; });
  var i = 0;
  while (i < sorted.length) {
    var j = i;
    while (j + 1 < sorted.length && sorted[j + 1].__row === sorted[j].__row + 1) j++;
    var block = sorted.slice(i, j + 1).map(function (o) { return objToRow_(name, h, o); });
    sh_(name).getRange(sorted[i].__row, 1, block.length, h.cols.length).setValues(block);
    i = j + 1;
  }
}

/** Lô có nhạy cảm không (tính lại từ dòng: mẫu nhạy cảm, hoặc hợp đồng có hạn/giá trị) */
function batchSensitive_(t, rows) {
  if (t.sensitive) return true;
  if (t.module !== 'contracts') return false;
  return rows.some(function (r) {
    var np = r.normalized_payload_json || {};
    if (np.s !== 'contracts' || r.validation_status === 'ERROR') return false;
    var v = np.v || {};
    if (r.action === 'ADD') return ['start_date', 'end_date', 'renewal_notice_date', 'value', 'currency'].some(function (f) { return v[f] !== undefined && v[f] !== ''; });
    var cur = findOne_('Contracts', 'contract_id', r.entity_id) || {};
    return ['start_date', 'end_date', 'renewal_notice_date', 'value', 'currency'].some(function (f) { return v[f] !== undefined && String(v[f]) !== String(cur[f] === undefined ? '' : cur[f]); });
  });
}

function importErrorsOf_(rows, limit) {
  var out = [];
  rows.forEach(function (r) {
    if (r.validation_status !== 'ERROR' && r.validation_status !== 'FAILED') return;
    var list = [];
    try { list = JSON.parse(r.error_text || '[]'); } catch (e) { list = [{ field: '', code: 'INVALID_VALUE' }]; }
    list.forEach(function (e) {
      if (out.length >= limit) return;
      var fe = fieldError_(e.field, e.code, r.row_number);
      fe.sheet = (r.normalized_payload_json || {}).s || '';
      out.push(fe);
    });
  });
  return out;
}

function projectBatch_(ctx, b) {
  var dir = userDirectory_();
  var u = dir[b.imported_by];
  var t = IMPORT_TEMPLATES_[b.module];
  return {
    import_batch_id: b.import_batch_id, template_key: b.module, status: b.status, total_rows: b.total_rows, add_count: b.add_count, update_count: b.update_count,
    error_count: b.error_count, imported_by: b.imported_by, imported_by_name: u ? u.employee_code + ' · ' + u.display_name : '', imported_at: b.imported_at,
    completed_at: b.completed_at, approved_by: b.approved_by, mine: b.imported_by === ctx.user.user_id, module: t ? t.module : '',
    can_commit: t ? canImportCommit_(ctx, t.module) : false, record_version: b.record_version
  };
}

/** Tóm tắt lô cho màn xem trước (CM-03) */
function importSummary_(ctx, b, reload, extra) {
  var t = importTemplate_(b.module);
  var rows = findAll_('ImportRows', 'import_batch_id', b.import_batch_id);
  var out = projectBatch_(ctx, b);
  out.errors = importErrorsOf_(rows, 200);
  out.sensitive = extra && extra.sensitive !== undefined ? extra.sensitive : batchSensitive_(t, rows);
  out.mt_fields = extra ? extra.mt_fields : undefined;
  // Trước–sau của tối đa 30 dòng sửa
  var changes = [];
  rows.forEach(function (r) {
    if (r.action !== 'UPDATE' || r.validation_status !== 'OK' || changes.length >= 30) return;
    var np = r.normalized_payload_json || {};
    var sh = t.sheets.filter(function (s) { return s.name === np.s; })[0];
    var cur = sh ? findOne_(sh.table, sh.id, r.entity_id) : null;
    if (!cur) return;
    var diff = {};
    Object.keys(np.v || {}).forEach(function (k) {
      if (k === 'record_version' || k === sh.id || k === 'row_key') return;
      var col = sh.cols.filter(function (c) { return c.key === k; })[0];
      if (!col || col.type === 'ref') return;
      var before = cur[k] === undefined ? '' : cur[k];
      if (String(before) !== String(np.v[k])) diff[k] = [before, np.v[k]];
    });
    Object.keys(np.r || {}).forEach(function (k) { if (String(cur[k] || '') !== String(np.r[k] || '')) diff[k] = [cur[k] || '', np.r[k] || '']; });
    if (Object.keys(diff).length) changes.push({ sheet: np.s, row_number: r.row_number, code: cur[sh.code || 'code'] || '', diff: diff });
  });
  out.changes = changes;
  return out;
}

/* ---------------- Lỗi, gửi duyệt, hủy ---------------- */

/** import.errors {import_batch_id}: toàn bộ lỗi theo dòng; không có id → danh sách lô gần đây (của mình + chờ duyệt mình duyệt được) */
function importErrors_(ctx) {
  var p = ctx.req.payload || {};
  if (!p.import_batch_id) {
    var mods = {};
    Object.keys(IMPORT_TEMPLATES_).forEach(function (k) { mods[IMPORT_TEMPLATES_[k].module] = true; });
    var okMods = Object.keys(mods).filter(function (m) { return can_(ctx, 'import.errors', { module: m }); });
    if (!okMods.length) throw apiError_('FORBIDDEN');
    var list = readRows_('ImportBatches').filter(function (b) {
      var t = IMPORT_TEMPLATES_[b.module];
      if (!t || okMods.indexOf(t.module) < 0) return false;
      if (b.imported_by === ctx.user.user_id) return true;
      return (b.status === 'PENDING_APPROVAL' || b.status === 'PARTIAL') && canImportCommit_(ctx, t.module);
    }).sort(function (a, b) { return String(b.imported_at).localeCompare(String(a.imported_at)); }).slice(0, 30);
    return { items: list.map(function (b) { return projectBatch_(ctx, b); }) };
  }
  var b = batchById_(p.import_batch_id);
  if (!b) throw apiError_('NOT_FOUND');
  var t = importTemplate_(b.module);
  authorize_(ctx, 'import.errors', { module: t.module });
  if (b.imported_by !== ctx.user.user_id && !canImportCommit_(ctx, t.module)) throw apiError_('FORBIDDEN');
  return importSummary_(ctx, b, true);
}

/** import.submit {import_batch_id}: lô READY của mình → PENDING_APPROVAL (đề nghị, chờ C3/C4 commit) */
function importSubmit_(ctx) {
  var p = ctx.req.payload || {};
  var b0 = batchById_(p.import_batch_id);
  if (!b0) throw apiError_('NOT_FOUND');
  var t = importTemplate_(b0.module);
  authorize_(ctx, 'import.submit', { module: t.module });
  return withWriteLock_(function () {
    var b = batchById_(p.import_batch_id);
    if (b.imported_by !== ctx.user.user_id) throw apiError_('FORBIDDEN');
    if (b.status !== 'READY') throw validationError_([fieldError_('import_batch_id', 'INVALID_VALUE')]);
    writeCells_('ImportBatches', b.__row, { status: 'PENDING_APPROVAL', updated_at: isoVN_(now_()), record_version: (b.record_version || 1) + 1 });
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'import.submit', entity_type: 'IMPORT_BATCH', entity_id: b.import_batch_id,
      before_json: { status: b.status }, after_json: { status: 'PENDING_APPROVAL', template: b.module }, operation_id: ctx.req.operation_id || '', import_batch_id: b.import_batch_id, auth_basis: authBasis_(ctx) });
    b.status = 'PENDING_APPROVAL';
    return projectBatch_(ctx, b);
  });
}

/** import.cancel {import_batch_id}: hủy lô chưa ghi (của mình; C3/C4 hủy được lô chờ duyệt) */
function importCancel_(ctx) {
  var p = ctx.req.payload || {};
  var b0 = batchById_(p.import_batch_id);
  if (!b0) throw apiError_('NOT_FOUND');
  var t = importTemplate_(b0.module);
  authorize_(ctx, 'import.cancel', { module: t.module });
  return withWriteLock_(function () {
    var b = batchById_(p.import_batch_id);
    var mine = b.imported_by === ctx.user.user_id;
    if (!mine && !(Number(ctx.user.role_level) >= 3 && canImportCommit_(ctx, t.module))) throw apiError_('FORBIDDEN');
    if (['VALIDATING', 'NEEDS_FIX', 'READY', 'PENDING_APPROVAL'].indexOf(b.status) < 0) throw validationError_([fieldError_('import_batch_id', 'INVALID_VALUE')]);
    writeCells_('ImportBatches', b.__row, { status: 'FAILED', completed_at: isoVN_(now_()), updated_at: isoVN_(now_()), record_version: (b.record_version || 1) + 1 });
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'import.cancel', entity_type: 'IMPORT_BATCH', entity_id: b.import_batch_id,
      before_json: { status: b.status }, after_json: { status: 'FAILED', cancelled: true }, operation_id: ctx.req.operation_id || '', import_batch_id: b.import_batch_id, auth_basis: authBasis_(ctx) });
    b.status = 'FAILED';
    return projectBatch_(ctx, b);
  });
}

/* ---------------- Ghi lô (commit) ---------------- */

/** Bỏ hỏi PIN cho khúc commit tiếp theo: cùng phiên, cùng người, lô đang ghi dở, chưa quá 30 phút (3.8) */
function importCommitPinWaived_(ctx) {
  var b = batchById_((ctx.req.payload || {}).import_batch_id);
  if (!b || (b.status !== 'COMMITTING' && b.status !== 'PARTIAL')) return false;
  if (b.committing_session_id !== ctx.sid) return false;
  var t0 = parseTime_(b.commit_started_at);
  return !!t0 && now_().getTime() - t0.getTime() < 30 * 60000;
}

/** UUID v4 cố định suy từ một chuỗi (operation_id phụ của cùng một dòng nhập) */
function uuidFrom_(s) {
  var h = sha256_(s).slice(0, 16).map(function (b) { return ('0' + u8_(b).toString(16)).slice(-2); });
  h[6] = '4' + h[6].charAt(1);
  h[8] = ['8', '9', 'a', 'b'][parseInt(h[8].charAt(0), 16) % 4] + h[8].charAt(1);
  var x = h.join('');
  return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20, 32);
}

/** Gọi một action như request riêng (kiểm quyền người commit; thao tác ghi chống lặp theo operation_id) */
function runRowAction_(ctx, action, payload, opId, expectedVersion, module, user) {
  var u = user || ctx.user;
  var sub = {
    user: u, sid: ctx.sid, session: ctx.session, token: ctx.token, importBatch: true,
    req: { api_contract_version: ctx.req.api_contract_version, action: action, payload: payload, operation_id: opId, expected_version: expectedVersion,
      device_id: ctx.req.device_id, dataset_epoch: ctx.req.dataset_epoch, app_version: ctx.req.app_version }
  };
  var def = ACTION_REGISTRY[action];
  var mod = def.module === 'contracts|inspections' || def.module === '*' ? module : null;
  sub.auth = authorize_(sub, action, mod ? { module: mod } : null);
  if (sub.auth.conds && sub.auth.conds.length) throw apiError_('FORBIDDEN');
  return HANDLERS_[action](sub);
}

/** Dựng payload của một dòng (giá trị đã chuẩn hóa + ID tham chiếu) */
function rowPayload_(sh, r) {
  var np = r.normalized_payload_json || {};
  var v = np.v || {}, refs = np.r || {};
  var p = {};
  sh.cols.forEach(function (c) {
    if (c.type === 'id' || c.type === 'ver' || c.type === 'key' || c.type === 'ref' || c.readonly) return;
    if (v[c.key] === undefined) return;
    if (r.action === 'ADD' && v[c.key] === '') return;
    p[c.key] = v[c.key];
  });
  Object.keys(refs).forEach(function (k) { p[k] = refs[k]; });
  p[sh.id] = r.entity_id;
  return p;
}

/**
 * Ghi một dòng (hoặc một hợp đồng kèm thiết bị). Trả true nếu xong, ném lỗi nếu dòng hỏng.
 * group: các ImportRows contract_equipment thuộc hợp đồng này (ghi cùng contract.create/edit)
 */
function commitImportRow_(ctx, t, b, sh, r, importer, group) {
  var p = rowPayload_(sh, r);
  var ev = r.action === 'UPDATE' ? Number(r.expected_version) : 0;
  var add = r.action === 'ADD';
  var res;
  var run = function (action, payload, opId, ver, user) {
    var out = runRowAction_(ctx, action, payload, opId, ver, t.module, user);
    if (out && out.ok === false) throw apiError_(out.code || 'INTERNAL_ERROR');
    return out;
  };
  switch (sh.table) {
    case 'Glossary': res = run('glossary.edit', p, r.import_row_id, ev); break;
    case 'Locations': res = run('location.edit', p, r.import_row_id, ev); break;
    case 'LookupValues': if (!add) { delete p.group_key; delete p.code; } res = run('lookup.edit', p, r.import_row_id, ev); break;
    case 'Vendors': res = run('vendor.edit', p, r.import_row_id, ev); break;
    case 'Materials': res = run(add ? 'material.create' : 'material.edit', p, r.import_row_id, ev); break;
    case 'Equipment': res = run(add ? 'equipment.create' : 'equipment.edit', p, r.import_row_id, ev); break;
    case 'EquipmentSpecs': if (!add) delete p.equipment_id; res = run('equipment.spec.edit', p, r.import_row_id, ev); break;
    case 'EquipmentParts': if (!add) { delete p.equipment_id; delete p.material_id; } res = run('part.link', p, r.import_row_id, ev); break;
    case 'InspectionTypes': res = run('inspection.type.edit', p, r.import_row_id, ev); break;
    case 'InspectionRequirements': res = run('inspection.requirement.edit', p, r.import_row_id, ev); break;
    case 'Inspections': {
      // Người nhập là người nộp; người commit duyệt (commit lô nhạy cảm là duyệt, 4.4.11 ⁷)
      run('inspection.submit', p, r.import_row_id, 0, importer);
      var ins = findOne_('Inspections', 'inspection_id', r.entity_id);
      if (ins && ins.status === 'PENDING_APPROVAL') run('inspection.approve', { inspection_id: r.entity_id, decision: 'APPROVE' }, uuidFrom_(r.import_row_id + ':approve'), ins.record_version);
      res = true;
      break;
    }
    case 'Contracts': {
      var eqList = (group || []).map(function (g) { var q = rowPayload_(t.sheets[1], g); delete q.contract_id; if (g.action === 'UPDATE') delete q.equipment_id; return q; });
      var terms = {};
      CONTRACT_TERMS_.forEach(function (f) { if (p[f] !== undefined) { terms[f] = p[f]; delete p[f]; } });
      if (add) {
        Object.keys(terms).forEach(function (f) { p[f] = terms[f]; });
        if (eqList.length) p.equipment = eqList;
        res = run('contract.create', p, r.import_row_id, 0);
      } else {
        var cur = findOne_('Contracts', 'contract_id', r.entity_id);
        var changed = {};
        Object.keys(terms).forEach(function (f) { if (String(terms[f]) !== String(cur[f] === undefined ? '' : cur[f])) changed[f] = terms[f]; });
        if (eqList.length) p.equipment = eqList;
        res = run('contract.edit', p, r.import_row_id, ev);
        if (Object.keys(changed).length) {
          var c2 = findOne_('Contracts', 'contract_id', r.entity_id);
          changed.contract_id = r.entity_id;
          changed.reason = 'Excel ' + b.import_batch_id.slice(0, 8);
          run('contract.editTerms', changed, uuidFrom_(r.import_row_id + ':terms'), c2.record_version);
        }
      }
      break;
    }
    case 'ContractEquipment': {
      // Thiết bị của hợp đồng không có trong file: contract.edit chỉ với danh sách thiết bị
      var cid = (r.normalized_payload_json.r || {}).contract_id;
      var cc = findOne_('Contracts', 'contract_id', cid);
      if (!cc) throw apiError_('NOT_FOUND');
      var q = rowPayload_(sh, r); delete q.contract_id; if (r.action === 'UPDATE') delete q.equipment_id;
      res = run('contract.edit', { contract_id: cid, equipment: [q] }, r.import_row_id, cc.record_version);
      break;
    }
    default: throw apiError_('INTERNAL_ERROR');
  }
  return res;
}

/**
 * import.commit {import_batch_id}: ghi lô theo khúc (≤ 100 dòng hoặc ~40 giây mỗi request).
 * Còn dòng → status PARTIAL, trả continue; gọi lại cùng import_batch_id. PIN chỉ hỏi ở khúc đầu (3.8).
 */
function importCommit_(ctx) {
  var p = ctx.req.payload || {};
  var b0 = batchById_(p.import_batch_id);
  if (!b0) throw apiError_('NOT_FOUND');
  var t = importTemplate_(b0.module);
  assertImportCommit_(ctx, t.module);
  if (b0.dataset_epoch !== sysProps_().dataset_epoch) throw validationError_([fieldError_('import_batch_id', 'TEMPLATE_EPOCH')]);
  var rows0 = findAll_('ImportRows', 'import_batch_id', b0.import_batch_id);
  var sensitive = batchSensitive_(t, rows0);
  // Mở hoặc tiếp tục lô
  withWriteLock_(function () {
    var b = batchById_(p.import_batch_id);
    var nowIso = isoVN_(now_());
    if (b.status === 'READY' || b.status === 'PENDING_APPROVAL') {
      if (b.status === 'READY' && b.imported_by !== ctx.user.user_id) throw validationError_([fieldError_('import_batch_id', 'INVALID_VALUE')]);
      if (sensitive && b.imported_by === ctx.user.user_id) throw apiError_('FORBIDDEN');
      writeCells_('ImportBatches', b.__row, { status: 'COMMITTING', approved_by: ctx.user.user_id, committing_session_id: ctx.sid, commit_started_at: nowIso, updated_at: nowIso, record_version: (b.record_version || 1) + 1 });
    } else if (b.status === 'COMMITTING' || b.status === 'PARTIAL') {
      if (b.approved_by !== ctx.user.user_id) throw apiError_('FORBIDDEN');
      var fresh = importCommitPinWaived_(ctx);
      writeCells_('ImportBatches', b.__row, fresh ? { status: 'COMMITTING', updated_at: nowIso } : { status: 'COMMITTING', committing_session_id: ctx.sid, commit_started_at: nowIso, updated_at: nowIso });
    } else {
      throw validationError_([fieldError_('import_batch_id', 'INVALID_VALUE')]);
    }
  });
  var b1 = batchById_(p.import_batch_id);
  var importer = userCached_(b1.imported_by);
  var t0 = Date.now();
  var done = 0;
  var order = t.sheets.map(function (s) { return s.name; });
  var pending = rows0.filter(function (r) { return r.validation_status === 'OK'; });
  // Thứ tự: theo sheet; trong sheet dòng phụ thuộc (khu vực cha cùng file) sau dòng được tham chiếu
  pending.sort(function (a, b) { return order.indexOf(a.normalized_payload_json.s) - order.indexOf(b.normalized_payload_json.s) || a.row_number - b.row_number; });
  var byEntity = {};
  rows0.forEach(function (r) { byEntity[r.entity_id] = r; });
  var ready = function (r) { return (r.normalized_payload_json.d || []).every(function (id) { var dep = byEntity[id]; return !dep || dep.validation_status === 'COMMITTED' || dep.normalized_payload_json.s !== r.normalized_payload_json.s; }); };
  // Hợp đồng ghi cùng thiết bị của nó
  var ceByContract = {};
  if (t.module === 'contracts') pending.forEach(function (r) {
    if (r.normalized_payload_json.s !== 'contract_equipment') return;
    var cid = (r.normalized_payload_json.r || {}).contract_id;
    if (byEntity[cid] && byEntity[cid].normalized_payload_json.s === 'contracts') (ceByContract[cid] = ceByContract[cid] || []).push(r);
  });
  MT_DEFER_ = true;
  try {
    var progressed = true;
    while (progressed && done < IMPORT_COMMIT_MAX_ && Date.now() - t0 < IMPORT_COMMIT_BUDGET_MS_) {
      progressed = false;
      for (var i = 0; i < pending.length && done < IMPORT_COMMIT_MAX_ && Date.now() - t0 < IMPORT_COMMIT_BUDGET_MS_; i++) {
        var r = pending[i];
        var depBad = (r.normalized_payload_json.d || []).some(function (id) { return byEntity[id] && byEntity[id].validation_status === 'FAILED'; });
        if (r.validation_status !== 'OK' || (!depBad && !ready(r))) continue;
        if (r.normalized_payload_json.s === 'contract_equipment' && ceByContract[(r.normalized_payload_json.r || {}).contract_id]) continue;
        var sh = t.sheets.filter(function (s) { return s.name === r.normalized_payload_json.s; })[0];
        var group = sh.table === 'Contracts' ? (ceByContract[r.entity_id] || []) : null;
        var status, err = '';
        var depFailed = (r.normalized_payload_json.d || []).some(function (id) { return byEntity[id] && byEntity[id].validation_status === 'FAILED'; });
        if (depFailed) {
          status = 'FAILED';
          err = JSON.stringify([{ field: '', code: 'DEPENDENCY_FAILED' }]);
        } else try {
          dbReset_();
          commitImportRow_(ctx, t, b1, sh, r, importer, group);
          status = 'COMMITTED';
        } catch (e) {
          status = 'FAILED';
          var code = e && e.apiCode ? e.apiCode : 'INTERNAL_ERROR';
          var list = e && e.apiErrors && e.apiErrors.length ? e.apiErrors.map(function (x) { return { field: x.field, code: x.code }; }) : [{ field: '', code: code }];
          err = JSON.stringify(list);
          if (code === 'INTERNAL_ERROR') console.error('import row ' + r.import_row_id + ': ' + (e && e.message));
        }
        var nowIso = isoVN_(now_());
        var touched = [r].concat(group || []);
        withWriteLock_(function () {
          touched.forEach(function (x) {
            x.validation_status = status; x.error_text = err; x.committed_at = status === 'COMMITTED' ? nowIso : '';
            var cur = readRowAt_('ImportRows', x.__row);
            if (cur.import_row_id === x.import_row_id) writeCells_('ImportRows', x.__row, { validation_status: status, error_text: err, committed_at: x.committed_at });
            else { var rn = findRowNums_('ImportRows', 'import_row_id', x.import_row_id)[0]; if (rn) writeCells_('ImportRows', rn, { validation_status: status, error_text: err, committed_at: x.committed_at }); }
          });
        });
        done += touched.length;
        progressed = true;
      }
    }
  } finally {
    MT_DEFER_ = false;
  }
  dbReset_();
  var rows = findAll_('ImportRows', 'import_batch_id', p.import_batch_id);
  var left = rows.filter(function (r) { return r.validation_status === 'OK'; }).length;
  var failed = rows.filter(function (r) { return r.validation_status === 'FAILED'; }).length;
  var status = left ? 'PARTIAL' : (failed ? 'PARTIAL' : 'COMMITTED');
  var final = withWriteLock_(function () {
    var b = batchById_(p.import_batch_id);
    var nowIso = isoVN_(now_());
    var upd = { status: status, updated_at: nowIso, record_version: (b.record_version || 1) + 1 };
    if (!left) upd.completed_at = nowIso;
    writeCells_('ImportBatches', b.__row, upd);
    if (!left) writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'import.commit', entity_type: 'IMPORT_BATCH', entity_id: b.import_batch_id,
      before_json: { imported_by: b.imported_by, total_rows: b.total_rows }, after_json: { status: status, committed: rows.length - failed - left, failed: failed, sensitive: sensitive, template: b.module },
      operation_id: ctx.req.operation_id || '', import_batch_id: b.import_batch_id, auth_basis: authBasis_(ctx) });
    Object.keys(upd).forEach(function (k) { b[k] = upd[k]; });
    return b;
  });
  if (!left) afterDueChange_();
  var out = projectBatch_(ctx, final);
  out.committed = rows.filter(function (r) { return r.validation_status === 'COMMITTED'; }).length;
  out.failed = failed;
  out.remaining = left;
  out.continue_token = left ? final.import_batch_id : null;
  out.errors = importErrorsOf_(rows, 200);
  return out;
}

/* ---------------- Xuất Excel ---------------- */

/** Giá trị một cột khi xuất (mã thay cho ID tham chiếu) */
function exportCell_(c, row, codeOf) {
  if (c.type === 'ref') {
    var id = row[c.to];
    return id ? codeOf(c.ref, id) : '';
  }
  if (c.type === 'key') return '';
  var v = row[c.key];
  if (v === undefined || v === null) return '';
  if (c.type === 'bool') return v === true;
  return v;
}

/**
 * export.xlsx {template_key | list: 'alerts', due?: 'ALL'|'DUE40'|'OVERDUE'}: dòng đã lọc theo quyền,
 * bỏ cột giá khi thiếu quyền $, thêm cột i18n_machine_fields; trình duyệt dựng .xlsx (SheetJS). Ghi AuditLogs.
 */
function exportXlsx_(ctx) {
  var p = ctx.req.payload || {};
  var today = todayVN_();
  var dir = userDirectory_();
  var u = dir[ctx.user.user_id];
  var filters = [];
  var sheets = [];
  var module;
  if (p.list === 'alerts') {
    var okI = can_(ctx, 'export.xlsx', { module: 'inspections' }), okC = can_(ctx, 'export.xlsx', { module: 'contracts' });
    if (!okI && !okC) throw apiError_('FORBIDDEN');
    module = okI && okC ? 'contracts|inspections' : (okI ? 'inspections' : 'contracts');
    var reqs = {}, cons = {}, types = {}, eqs = {};
    readRows_('InspectionRequirements').forEach(function (x) { reqs[x.requirement_id] = x; });
    readRows_('Contracts').forEach(function (x) { cons[x.contract_id] = x; });
    readRows_('InspectionTypes').forEach(function (x) { types[x.inspection_type_id] = x; });
    readRows_('Equipment').forEach(function (x) { eqs[x.equipment_id] = x; });
    var rowsA = readRows_('Alerts').filter(function (a) { return a.alert_state !== 'RESOLVED' && (a.entity_type === 'CONTRACT' ? okC : okI); }).map(function (a) {
      var dr = daysRemaining_(a.due_date, today);
      var code = '', name = '', eqCode = '', owner = a.owner_user_id && dir[a.owner_user_id] ? dir[a.owner_user_id].display_name : '';
      if (a.entity_type === 'CONTRACT') { var c = cons[a.entity_id] || {}; code = c.contract_code; name = c.title_vi || c.title_zh; }
      else { var r = reqs[a.entity_id] || {}; var ty = types[r.inspection_type_id] || {}; var e = eqs[r.equipment_id] || {}; code = r.requirement_code; name = ty.name_vi || ty.name_zh; eqCode = e.equipment_code || ''; }
      return [a.entity_type === 'CONTRACT' ? 'CONTRACT' : 'INSPECTION', code || '', name || '', eqCode, a.due_date, a.reference_date_kind, dr, a.stage, a.alert_state, owner];
    }).sort(function (x, y) { return x[6] - y[6]; });
    sheets.push({ name: 'alerts', keys: ['kind', 'code', 'name', 'equipment_code', 'due_date', 'reference_date_kind', 'days_remaining', 'stage', 'alert_state', 'owner'],
      labels: [['Loại', '类型'], ['Mã', '编号'], ['Tên', '名称'], ['Mã thiết bị', '设备编号'], ['Ngày tham chiếu', '参考日期'], ['Loại ngày', '日期类型'], ['Còn (ngày)', '剩余天数'], ['Mốc', '节点'], ['Trạng thái', '状态'], ['Phụ trách', '负责人']], rows: rowsA });
    filters.push(['list', 'alerts']);
  } else {
    var t = importTemplate_(p.template_key);
    module = t.module;
    authorize_(ctx, 'export.xlsx', { module: t.module });
    var codeCache = {};
    var codeOf = function (table, id) {
      if (!codeCache[table]) { codeCache[table] = {}; readRows_(table).forEach(function (r) { codeCache[table][r[sheetSchema_(table).key]] = r[REF_CODE_COL_[table]]; }); }
      return codeCache[table][id] || '';
    };
    var due = ['DUE40', 'OVERDUE'].indexOf(p.due) >= 0 ? p.due : 'ALL';
    var lead = Number(setting_('lead_days') || 40);
    var keepIds = null;
    t.sheets.forEach(function (sh, si) {
      var cols = templateCols_(ctx, t, sh);
      var data = readRows_(sh.table).filter(function (r) { return !r.archived_at && !r.removed_at; });
      if (sh.table === 'InspectionRequirements' || sh.table === 'Contracts') {
        if (sh.table === 'Contracts') data = data.filter(function (r) { return r.lifecycle_status === 'ACTIVE'; });
        if (due !== 'ALL') data = data.filter(function (r) {
          var d = sh.table === 'Contracts' ? contractRef_(r).date : r.current_due_date;
          var dr = daysRemaining_(d, today);
          return dr !== null && (due === 'OVERDUE' ? dr < 0 : dr <= lead);
        });
        if (si === 0) keepIds = {};
        if (keepIds) data.forEach(function (r) { keepIds[r[sh.id]] = true; });
      }
      if (sh.table === 'ContractEquipment' && keepIds) data = data.filter(function (r) { return keepIds[r.contract_id]; });
      if (sh.table === 'Inspections') data = data.filter(function (r) { return r.status === 'APPROVED'; });
      var keys = cols.map(function (c) { return c.key; }).concat(['i18n_machine_fields']);
      var labels = cols.map(function (c) { return [c.vi, c.zh]; }).concat([['Trường dịch máy', '机器翻译字段']]);
      var rows = data.map(function (r) {
        var line = cols.map(function (c) {
          if (sh.table === 'ContractEquipment' && c.key === 'contract_key') return codeOf('Contracts', r.contract_id);
          if (sh.table === 'EquipmentSpecs' && c.key === 'equipment_key') return codeOf('Equipment', r.equipment_id);
          return exportCell_(c, r, codeOf);
        });
        var mt = Object.keys(r.i18n_meta || {}).filter(function (f) { return r.i18n_meta[f] && r.i18n_meta[f].state === 'MACHINE'; });
        line.push(mt.join(','));
        return line;
      });
      sheets.push({ name: sh.name, keys: keys, labels: labels, rows: rows });
    });
    filters.push(['template_key', p.template_key]);
    if (due !== 'ALL') filters.push(['due', due]);
  }
  withWriteLock_(function () {
    writeAudit_({ user_id: ctx.user.user_id, device_id: ctx.req.device_id, action: 'export.xlsx', entity_type: 'EXPORT', entity_id: p.template_key || p.list || '',
      before_json: null, after_json: { rows: sheets.reduce(function (s, x) { return s + x.rows.length; }, 0), filters: filters }, operation_id: '', auth_basis: authBasis_(ctx) });
  });
  return {
    sheets: sheets, filters: filters, generated_at: isoVN_(now_()), generated_by: u ? u.employee_code + ' · ' + u.display_name : '',
    scope: module, env: envName_(), template_version: IMPORT_TEMPLATE_VERSION_, dataset_epoch: sysProps_().dataset_epoch, cost_included: canViewCost_(ctx, module.split('|')[0])
  };
}

/* 36_feed: cửa chỉ-đọc danh sách thiết bị cho app Checksheet (1.0.0-d4.12, người dùng yêu cầu 28/10/2026).
 * Không cần phiên; khóa bằng mã kết nối FEED_KEY_CS trong Thuộc tính tập lệnh (tạo bằng adminCreateFeedKey, chép sang app
 * Checksheet). Chỉ trả khu vực và thiết bị (mã, tên, khu vực, trạng thái, loại, model, mã QR) — không có giá, hợp đồng, người dùng
 * hay dữ liệu khác. Checksheet lấy một chiều mỗi giờ; thiết bị vẫn chỉ sửa ở M&E. */

var FEED_MIN_KEY_ = 24;

/** Mốc phiên bản nguồn: đổi khi Thiết bị, Khu vực, Danh mục tra cứu hoặc mã QR đổi (Checksheet không đổi thì khỏi tải lại) */
function feedRev_(st) {
  return ['Equipment', 'Locations', 'LookupValues', 'QrRegistry'].map(function (n) { return Number(stateGet_(st, 'table_rev.' + n, 0)); }).join('.') +
    ':' + String(sysProps_().dataset_epoch || '').slice(0, 8);
}

/** feed.equipment {key, since_rev?, client?} — public; sai mã → FORBIDDEN */
function feedEquipment_(req) {
  var p = req.payload || {};
  var want = prop_('FEED_KEY_CS') || '';
  if (want.length < FEED_MIN_KEY_ || !ctEqualStr_(String(p.key || ''), want)) throw apiError_('FORBIDDEN');
  var st = readState_();
  var rev = feedRev_(st);
  if (p.since_rev && String(p.since_rev) === rev) return { unchanged: true, rev: rev };
  var tc = tableCache_(['Equipment', 'Locations', 'LookupValues', 'QrRegistry'], st);
  var cat = {};
  tc.rows('LookupValues').forEach(function (v) { if (v.group_key === 'EQUIPMENT_CATEGORY') cat[v.value_id] = v; });
  var qr = {};
  tc.rows('QrRegistry').forEach(function (q) { if (q.entity_type === 'EQUIPMENT' && q.active) qr[q.entity_id] = q.qr_key; });
  var locations = tc.rows('Locations').map(function (l) {
    return {
      location_id: l.location_id, location_code: l.location_code, name_vi: l.name_vi, name_zh: l.name_zh,
      parent_location_id: l.parent_location_id || '', active: l.active !== false && !l.archived_at
    };
  });
  var equipment = tc.rows('Equipment').map(function (e) {
    var c = cat[e.category_id];
    return {
      equipment_id: e.equipment_id, equipment_code: e.equipment_code, name_vi: e.name_vi, name_zh: e.name_zh,
      location_id: e.location_id || '', status: e.status || '', category_vi: c ? c.name_vi : '', category_zh: c ? c.name_zh : '',
      model: e.model || '', qr_key: qr[e.equipment_id] || '', archived: !!e.archived_at
    };
  });
  return { rev: rev, locations: locations, equipment: equipment, server_time: isoVN_(now_()) };
}

/**
 * Chạy từ trình soạn: tạo mã kết nối cho app Checksheet (một lần) và in ra nhật ký để chép sang
 * Checksheet → Tài khoản → Quản trị → Kết nối M&E. Đã có mã thì in lại mã cũ (không đổi, Checksheet vẫn chạy).
 * Muốn đổi mã (lộ mã): xóa FEED_KEY_CS trong Thuộc tính tập lệnh rồi chạy lại, nhập mã mới bên Checksheet.
 */
function adminCreateFeedKey() {
  var props = PropertiesService.getScriptProperties();
  var k = props.getProperty('FEED_KEY_CS');
  if (!k) {
    k = b64url_(randomSecret32_());
    props.setProperty('FEED_KEY_CS', k);
    log_('Đã tạo mã kết nối Checksheet: ' + k);
  } else {
    log_('Mã kết nối Checksheet (đang dùng): ' + k);
  }
  log_('Chép mã này và link /exec của máy chủ M&E này sang app Checksheet → Tài khoản → Quản trị → Kết nối M&E.');
}

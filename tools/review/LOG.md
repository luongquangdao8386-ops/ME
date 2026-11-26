# Sổ rà soát lỗi (mỗi lượt ghi một mục; lượt sau chọn phần CHƯA rà ở cuối sổ)

Quy tắc dừng (người dùng 26/11/2026): rà mỗi ~5 giờ cho tới khi **hai lượt liền nhau không tìm thêm lỗi** thì dừng (xóa tác vụ lên lịch
"Rà soát lỗi app M&E"); người dùng bảo dừng thì dừng ngay. Mỗi lượt có lỗi: sửa → test → tăng bản → đẩy nhánh + ME-thu + `main` ME (được phép
đẩy thẳng THẬT) → HUONG_DAN → cập nhật skill quan-ly-me → báo người dùng ngắn gọn (kèm bước dán Code.gs nếu máy chủ đổi).

## Lượt 1 — 25/11/2026, bản 1.0.0-d4.38 — 3 lỗi nhỏ
Đã rà: 252 + 146 test; ESLint Code.gs + js; bảng quyền ↔ HANDLERS_; mã lỗi song ngữ; quy tắc đồng bộ (ME_SYNC_AUDIT); 87 màn × 6 cấp × 2 thiết bị;
XSS; tính năng Safari 16.4; ngày giờ UTC/VN; đọc kỹ Lưu trữ theo năm.
Lỗi: trang Ảnh nền báo nhầm lý do khi không có quyền; healthCheck không báo tệp ảnh nền mất; tên tệp Excel theo giờ UTC.

## Lượt 2 — 26/11/2026, bản 1.0.0-d4.40 — 1 lỗi đáng kể + 4 nhỏ
Đã rà: request ngẫu nhiên sai mọi action (6 109); làm hỏng từng trường request thật (29 591, có chụp/khôi phục); app ↔ máy chủ tính kỳ
(mọi ngày 2024–2028); 87 màn khi mất mạng; 22 biểu mẫu bấm Lưu để trống; reading.bulk trên đồng hồ đã thay.
Lỗi: Lưu không đổi gì vẫn ghi (12 biểu mẫu + checklist sinh phiên bản giống hệt); reading.bulk báo nhầm trùng ngày với số do sự kiện;
hợp đồng equipment/services sai dạng → lỗi máy chủ; Biểu giá trống đơn giá báo sai chữ.

## Lượt 3 — 26/11/2026, bản 1.0.0-d4.41 — 1 lỗi + 1 test chập chờn
Đã rà: Excel xuất → nhập lại mọi mẫu (`excel-roundtrip.mjs` phía máy chủ 16 mẫu, `excel-ui.mjs` tệp .xlsx thật 14 mẫu); giả lập 16 tháng sinh phiếu
bảo trì (`time-sim.mjs`: cuối tháng 31, 29/02/2028, quý, năm, tuần; trigger chạy hai lần/ngày) — đúng; quyền app ↔ máy chủ: danh sách quyền gửi
xuống app tính bằng chính `can_` của máy chủ (khớp theo thiết kế; quy tắc theo hồ sơ có test riêng); bộ test máy chủ chạy 8 lần.
Lỗi: chữ dấu tách rời (NFD, Unikey "Unicode tổ hợp") ≠ dạng dựng sẵn (NFC) → tìm kiếm không thấy, Excel "Cập nhật" giả → NFC ở máy chủ
(`nfcDeep_` trong doPost), `readField`, `wireSearch`, mọi phép so khi tìm. Test chập chờn: `feed.test.mjs` tạo "mã sai" bằng thay ký tự cuối thành
'A' — trùng mã đúng khi mã kết thúc bằng 'A' (≈1/64) → sửa test.
Lưu ý: ngày mốc kế hoạch đã qua lúc lập → hạn đầu là kỳ kế tiếp (đúng thiết kế, gợi ý `mt.anchor_hint`).

## Lượt 4 — 27/11/2026, bản 1.0.0-d4.42 — 1 lỗi đáng kể + 5 nhỏ
Đã rà: dữ liệu lớn (`bigdata.mjs`: 1 000 thiết bị, 5 000 phiếu × 10 kết quả, 20 000 chỉ số — bootstrap, changes, màn tính ở máy chủ, đệm bảng);
chữ 60 000 ký tự vào từng trường của mọi request thật (`ME_MUT_LONG=60000`, 15 239 lượt); 9 mẫu báo cáo × 0 / vài / 600–2 100 dòng (`reports.mjs`:
xem, lưu, xem bản lưu, XLSX, PDF, khu vực trống, ngày tương lai, mẫu ẩn cột) + giao diện (màn 500 dòng, tệp Excel, PDF quá 500 dòng, báo cáo trống);
mọi màn ở 320 px (6 vai trò) và 1024 px chạm/chuột (`crawl.mjs DEV=se,tab,tabweb`) — 0 tràn ngang, 0 lỗi console (320 px: ô "Quá hạn / Sắp tới hạn"
trang chủ chữ xuống dòng nhiều nhưng đọc được). Test: 266 máy chủ + 152 giao diện.
Lỗi: **app dừng tải dữ liệu đầu sau 50 trang mà vẫn lưu** (≥ ~25 000 bản ghi → thiếu ngầm) → đọc tới hết (≤ 1 000 trang), chưa hết thì báo, không xóa
dữ liệu cũ; bảng quá lớn để đệm (> 1,2 triệu ký tự JSON, vd 50 000 kết quả checklist = 42 triệu) bị đọc lại cả bảng mỗi trang → trang 2 000 dòng cho
bảng đó (115 → 32 trang); kết quả ghi > 50 000 ký tự (checklist ≥ ~55 bước, lưu kết quả ≥ ~55 bước) → lỗi máy chủ SAU KHI đã ghi → `opResultStr_`
lưu bản gọn; chữ > 50 000 ký tự ở 62 trường → lỗi máy chủ → chặn chung `longTextFields_` (> 20 000 ký tự, trừ `*_b64`, `charts`, chuỗi base64) +
`maxlength` 20 000 cho textarea + dòng Excel > 45 000 ký tự báo theo dòng; Lưu trữ theo năm xóa dòng giữa hai trang bootstrap → lệch vị trí, sót dòng
→ mã trang kèm khóa dòng kế tiếp, app bỏ bản ghi trùng; Excel báo cáo > 2 000 dòng không ghi đã cắt; khúc đệm có thể cắt đôi emoji.
Lưu ý: replay cùng operation_id của `maintenance.checklist.edit` (và action kiểm expected_version trước executeWrite_) trả VERSION_CONFLICT thay vì
DUPLICATE — app không replay mà hỏi `sync.getOperationStatus` (form.js `writeOnline`) nên không ảnh hưởng.

## Phần CHƯA rà (lượt sau chọn 2–4 mục, làm xong thì chuyển lên mục của lượt)
- [x] Excel: xuất → nhập lại nguyên tệp = "Không đổi" cho **mọi** mẫu (17 mẫu) với dữ liệu khó: dấu tiếng Việt tách rời (NFD), chữ Trung, số có
      phân cách nghìn, ngày 29/02, ô trống, mã có số 0 đầu; nhập file CSV windows-1258
- [x] Báo cáo: mọi mẫu (9) xem / PDF / Excel với **0 dòng**, 1 dòng, 500 dòng; lọc khu vực không có dữ liệu; mẫu đã sửa cột (lượt 4)
- [x] Quyền: danh sách quyền gửi app = `can_` máy chủ (lượt 3). CÒN: bấm thử từng nút theo vai trò trên giao diện (nút hiện mà bấm bị FORBIDDEN)
- [ ] Quyền trên giao diện: mỗi vai trò mở các màn, bấm thử từng nút thao tác hiện ra → không được FORBIDDEN (quy tắc theo hồ sơ: của mình, được giao, không tự duyệt)
- [ ] Hàng chờ offline: chuỗi thao tác ngẫu nhiên (tạo nháp, sửa, xung đột, xóa nháp, đổi người dùng) — trạng thái cuối khớp máy chủ
- [x] Mốc thời gian: sinh phiếu bảo trì cuối tháng/năm nhuận/31→30; nhắc hạn 40/30/14/7/3/1/0 và quá hạn mỗi 7 ngày qua nhiều ngày giả lập; trigger chạy hai lần không trùng
- [x] Đồng bộ lớn: bootstrap phân trang > sync_page_size, đệm bảng `tableCache_` khi bảng > 1,2 MB, Lưu trữ năm giữa hai trang (lượt 4)
- [ ] Đồng bộ: bản ghi xóa/ẩn (TOMBSTONE), đổi quyền / đổi phạm vi khu vực → bản ghi hiện/ẩn đúng trên máy; chỉ số ra ngoài 45 ngày vẫn nằm trên máy (không xóa — xem có cần dọn)
- [x] Màn hẹp 320 px (iPhone SE) và 1024 px (máy tính bảng): tràn ngang mọi màn (lượt 4)
- [ ] Bảo mật phiên: token sửa tay, hết hạn, thu hồi, PIN sai 5 lần, reauth quá 5 phút, đổi máy chủ
- [ ] Hai người sửa cùng hồ sơ (UI xung đột: Sửa tiếp trên bản máy chủ / Dùng bản máy chủ) cho từng loại hồ sơ
- [x] Test chập chờn: 26/11 một lần `npm run check` có 1 test hỏng (không giữ được tên), chạy lại 4 lần đều đạt — chạy check 10 lần, tìm test và nguyên nhân (đồng hồ thật / thứ tự / đệm)
- [x] Dữ liệu lớn: 1 000 thiết bị, 20 000 chỉ số, 5 000 phiếu — thời gian trang, cỡ phản hồi, giới hạn 50 000 ký tự Operations.result_json (lượt 4)
- [ ] Hiệu năng máy chủ thật (Apps Script): đọc bảng 50 000 dòng mất bao lâu, sync.changes khi bảng lớn đổi (đọc cả bảng mỗi lần) — chỉ đo được trên THỬ thật

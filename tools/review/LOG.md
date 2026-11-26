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

## Phần CHƯA rà (lượt sau chọn 2–4 mục, làm xong thì chuyển lên mục của lượt)
- [ ] Excel: xuất → nhập lại nguyên tệp = "Không đổi" cho **mọi** mẫu (17 mẫu) với dữ liệu khó: dấu tiếng Việt tách rời (NFD), chữ Trung, số có
      phân cách nghìn, ngày 29/02, ô trống, mã có số 0 đầu; nhập file CSV windows-1258
- [ ] Báo cáo: mọi mẫu (9) xem / PDF / Excel với **0 dòng**, 1 dòng, 500 dòng; lọc khu vực không có dữ liệu; mẫu đã sửa cột
- [ ] Quyền: với mọi action × 8 ô vai trò, `can()` của app (nút hiện) khớp quyết định máy chủ (không có nút hiện mà bấm bị FORBIDDEN, và ngược lại)
- [ ] Hàng chờ offline: chuỗi thao tác ngẫu nhiên (tạo nháp, sửa, xung đột, xóa nháp, đổi người dùng) — trạng thái cuối khớp máy chủ
- [ ] Mốc thời gian: sinh phiếu bảo trì cuối tháng/năm nhuận/31→30; nhắc hạn 40/30/14/7/3/1/0 và quá hạn mỗi 7 ngày qua nhiều ngày giả lập; trigger chạy hai lần không trùng
- [ ] Đồng bộ lớn: bootstrap phân trang > sync_page_size, bản ghi xóa (TOMBSTONE), đổi quyền → bản ghi hiện/ẩn đúng; đệm bảng `tableCache_` khi bảng > 1,2 MB (30 000 ký tự × 40 khối)
- [ ] Màn hẹp 320 px (iPhone SE) và 1024 px (máy tính bảng): tràn ngang mọi màn
- [ ] Bảo mật phiên: token sửa tay, hết hạn, thu hồi, PIN sai 5 lần, reauth quá 5 phút, đổi máy chủ
- [ ] Hai người sửa cùng hồ sơ (UI xung đột: Sửa tiếp trên bản máy chủ / Dùng bản máy chủ) cho từng loại hồ sơ
- [ ] Test chập chờn: 26/11 một lần `npm run check` có 1 test hỏng (không giữ được tên), chạy lại 4 lần đều đạt — chạy check 10 lần, tìm test và nguyên nhân (đồng hồ thật / thứ tự / đệm)
- [ ] Dữ liệu lớn: 1 000 thiết bị, 20 000 chỉ số, 5 000 phiếu — thời gian trang, cỡ phản hồi, giới hạn 50 000 ký tự Operations.result_json

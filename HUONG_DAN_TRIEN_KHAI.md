# Hướng dẫn triển khai M&E — Đợt 1 (bản 1.0.0-d1.1)

Làm trên **máy tính**, trong **hồ sơ Chrome của tài khoản Google M&E** (không dùng tài khoản đang chạy app Cơ Điện).
Môi trường **THỬ** (`ME_MayChu_THU`) chỉ dùng dữ liệu mẫu ghi "MẪU". Không nhập dữ liệu thật, không in tem thật, không bật Gmail tới địa chỉ người ngoài khi chưa được duyệt.

Cần 2 tệp trong thư mục `apps-script/` của repo: `appsscript.json` và `Code.gs`.

---

## Phần A — Cập nhật máy chủ THỬ đang chạy (đã có từ PoC)

1. Mở <https://script.google.com> → dự án **ME_MayChu_THU** → **Trình chỉnh sửa** (`< >`).
2. Mở `Code.gs` → Ctrl+A → xóa → dán **toàn bộ** nội dung tệp `apps-script/Code.gs` mới → **Lưu** (Ctrl+S).
3. Ô chọn hàm → **`migrateSchema`** → **Chạy**. Nhật ký báo đã thêm cột/khóa còn thiếu (an toàn khi chạy nhiều lần).
4. Chọn **`installTriggers`** → **Chạy** (cài lại đúng 3 trigger: nhắc hạn hằng ngày, dịch bù 3 giờ/lần, sao lưu hằng tuần).
5. Chọn **`healthCheck`** → **Chạy** → đọc Nhật ký: mỗi dòng "ĐẠT" hoặc "CẢNH BÁO". Lúc này "Sao lưu gần nhất" và "Địa chỉ app trong email" còn cảnh báo — làm ở Phần C.
6. **Triển khai phiên bản mới, giữ nguyên link:** **Triển khai** → **Quản lý bản triển khai** → bút chì **Chỉnh sửa** → Phiên bản: **Phiên bản mới** → Mô tả `Đợt 1 d1.1` → **Triển khai**.
7. **Kiểm link:** mở **cửa sổ ẩn danh**, dán link `/exec` và thêm `?action=system.health` vào cuối → thấy `"ok":true` và `"app_id":"ME"` là đạt.

> Nếu dựng máy chủ mới từ đầu (THẬT hoặc THỬ mới): tạo dự án → dán `appsscript.json` và `Code.gs` → chạy `setup` → đặt 3 thuộc tính `SETUP_OWNER_CODE`, `SETUP_OWNER_NAME`, `SETUP_OWNER_TEMP_PIN` → chạy `adminSetupOwner` → `installTriggers` → Triển khai mới (Ứng dụng web, Thực thi với **Tôi**, Truy cập **Bất kỳ ai**) → gửi link `/exec` cho Claude. Môi trường THẬT đặt thuộc tính `ENV` = `THAT` **trước** khi chạy `setup`.

## Phần B — Đổi nhánh GitHub Pages sang bản Đợt 1

Mã Đợt 1 nằm trên nhánh `claude/intelligent-gauss-y0z9b3` (đã gồm toàn bộ lịch sử nhánh PoC cũ).

1. Repo `ME` trên GitHub → **Settings** → **Pages**.
2. Mục **Build and deployment** → Source: **Deploy from a branch** → Branch: chọn **`claude/intelligent-gauss-y0z9b3`**, thư mục **/ (root)** → **Save**.
3. Chờ 1–2 phút (tab **Actions** hiện "pages build and deployment" màu xanh).
4. Mở <https://luongquangdao8386-ops.github.io/ME/> → màn Đăng nhập. Đăng nhập bằng owner → trang chủ có 9 ô.
   - Máy đã mở bản cũ: app tự nhận bản mới; nếu vẫn thấy bản cũ, kéo xuống làm mới (iPhone) hoặc Ctrl+Shift+R (máy tính), rồi xem **Tài khoản → Thông tin**: Phiên bản app **1.0.0-d1.1**, Phiên bản máy chủ **1.0.0-d1.1**.

## Phần C — Cài đặt lần đầu trong app (owner, trên máy tính)

1. **Tài khoản → Trạng thái hệ thống · 系统状态**, phần **Cấu hình · 系统设置**:
   - `app_base_url` → **Sửa** → `https://luongquangdao8386-ops.github.io/ME/` (có dấu `/` cuối) → nhập lý do → PIN.
   - `offline_probe_seconds` (Thời gian chờ máy chủ khi mở app) → **12**.
2. **Tài khoản → Sao lưu · 备份** → **Sao lưu ngay · 立即备份** → PIN. Màn tự cập nhật; sau khoảng 1 phút có dòng **Đã kiểm chứng · 已校验**.
3. **Tài khoản → Phân quyền · 权限**: đọc kỹ bảng quyền (bắt buộc duyệt trước khi nhập dữ liệu thật). Muốn đổi ô nào thì báo Claude hoặc tự bật/tắt rồi **Lưu** kèm lý do.
4. (Khi muốn thử Gmail) **Tài khoản → Người nhận Gmail và nhật ký gửi**: thêm địa chỉ của chính anh/chị → tick **Xác nhận** → PIN → **Bật gửi Gmail** → **Gửi thử**.
5. Chạy lại **Trạng thái hệ thống**: các dòng nên là **Đạt · 正常** (trừ "Thư nhắc hạn gửi gần nhất" khi chưa có thư).

## Phần D — Thử nhanh các phần mới của Đợt 1

| Phần | Cách thử |
| --- | --- |
| Người dùng và PIN tạm | Quản trị → Người dùng → **Thêm người dùng** (cấp 2, vai trò HĐ) → ghi lại **PIN tạm hiện một lần** → đăng nhập bằng tài khoản mới ở cửa sổ ẩn danh → app bắt đổi PIN |
| Thiết bị, vật tư | Thêm thiết bị, thông số, gắn linh kiện; tab Linh kiện không có số tồn |
| Kiểm định | Tạo loại + yêu cầu → người HĐ nộp chứng nhận → C3/C4 duyệt (PIN). Người nộp không tự duyệt |
| Hợp đồng | Tạo hợp đồng có **Hạn báo gia hạn** và **Ngày hết hạn**; dự thảo gia hạn → duyệt có PIN |
| Nhắc hạn | Trang Nhắc hạn có nút **Tiếp nhận · 受理** (HĐ, C3, C4); hồ sơ hết hạn trong 40 ngày hiện ở đây |
| Excel | Danh sách Thiết bị → **Nhập/xuất Excel** → **Xuất Excel** → sửa một ô Model trong tệp → **Chọn tệp .xlsx để nhập** → xem trước → **Nhập dữ liệu** (PIN) |
| Danh mục chung | Quản trị → Danh mục chung: khu vực, nhà cung cấp, danh mục tra cứu, **Thuật ngữ** (tick "Duyệt" thì dịch máy dùng thuật ngữ) |
| Tem QR | Danh sách → tick vài dòng → **In QR** → xem trước (THỬ: chỉ in thử, không dán tem thật) |

## Phần E — Diễn tập khôi phục thủ công (bắt buộc trước khi nhập dữ liệu thật)

Làm trên **THỬ** theo đúng thứ tự, mỗi bước chạy hàm từ trình soạn Apps Script:

1. Báo mọi người ngừng nhập → chạy **`adminMaintenanceOn`**.
2. Chạy **`backupData`** (giữ hiện trạng).
3. Drive → `ME_HeThong_THU` → `ME_Backups_THU` → mở thư mục mới nhất có `manifest.json` ghi `"status": "VERIFIED"`.
4. Chuột phải tệp **ME_NghiepVu_…** trong thư mục đó → **Tạo bản sao** → đổi tên `ME_NghiepVu_khoiphuc_<ngày>` → **Di chuyển** về thư mục `ME_HeThong_THU`. Mở bản sao, chép **ID** trong địa chỉ (đoạn giữa `/d/` và `/edit`).
5. Cài đặt dự án → **Thuộc tính tập lệnh** → thêm `RESTORE_SOURCE_ID` = ID vừa chép → Lưu.
6. Chạy **`adminFinalizeManualRestore`** → Nhật ký báo "Khôi phục xong từ bản …". Bảo trì vẫn bật.
7. Kiểm tra trên app sau khi tắt bảo trì ở bước 8: mở 5 hồ sơ bất kỳ, quét 3 tem in trước lúc sao lưu (mở đúng hồ sơ), xem Nhắc hạn.
8. Chạy **`adminMaintenanceOff`** → mọi người đăng nhập lại.
9. **Quay lại bản trước** (để diễn tập đủ): bật bảo trì → đặt `RESTORE_SOURCE_ID` = giá trị của thuộc tính `PREVIOUS_BUSINESS_SPREADSHEET_ID` → chạy lại `adminFinalizeManualRestore` → kiểm tra → tắt bảo trì.

## Lưu ý an toàn

- Không đưa lên GitHub: đặc tả, phụ lục, PDF bản vẽ, ảnh nhà máy gốc, link bảng tính, PIN, tệp Excel dữ liệu thật.
- Không chia sẻ thư mục `ME_HeThong_THU` hay hai bảng tính cho ai. Thư mục sao lưu chỉ tài khoản M&E xem.
- Không gửi Claude PIN, mật khẩu, mã SMS. Chỉ gửi link `/exec` khi dựng máy chủ mới.
- Quên PIN: nhờ quản trị **Cấp PIN tạm** trong Quản trị → Người dùng. Owner quên PIN trên THỬ: thêm thuộc tính `POC_RESET_CODE` và `POC_RESET_TEMP_PIN` → chạy `pocResetPin`.

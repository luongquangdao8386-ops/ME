# Hướng dẫn triển khai M&E — Đợt 1 (bản 1.0.0-d1.3)

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
6. **Triển khai phiên bản mới, giữ nguyên link:** **Triển khai** → **Quản lý bản triển khai** → bút chì **Chỉnh sửa** → Phiên bản: **Phiên bản mới** → Mô tả `Đợt 1 d1.3` → **Triển khai**.
7. **Kiểm link:** mở **cửa sổ ẩn danh**, dán link `/exec` và thêm `?action=system.health` vào cuối → thấy `"ok":true` và `"app_id":"ME"` là đạt.

> Nếu dựng máy chủ mới từ đầu (THẬT hoặc THỬ mới): tạo dự án → dán `appsscript.json` và `Code.gs` → chạy `setup` → đặt 3 thuộc tính `SETUP_OWNER_CODE`, `SETUP_OWNER_NAME`, `SETUP_OWNER_TEMP_PIN` → chạy `adminSetupOwner` → `installTriggers` → Triển khai mới (Ứng dụng web, Thực thi với **Tôi**, Truy cập **Bất kỳ ai**) → gửi link `/exec` cho Claude. Môi trường THẬT đặt thuộc tính `ENV` = `THAT` **trước** khi chạy `setup`.

## Phần B — Đổi nhánh GitHub Pages sang bản Đợt 1

Mã Đợt 1 nằm trên nhánh `claude/intelligent-gauss-y0z9b3` (đã gồm toàn bộ lịch sử nhánh PoC cũ).

1. Repo `ME` trên GitHub → **Settings** → **Pages**.
2. Mục **Build and deployment** → Source: **Deploy from a branch** → Branch: chọn **`claude/intelligent-gauss-y0z9b3`**, thư mục **/ (root)** → **Save**.
3. Chờ 1–2 phút (tab **Actions** hiện "pages build and deployment" màu xanh).
4. Mở <https://luongquangdao8386-ops.github.io/ME/> → màn Đăng nhập. Đăng nhập bằng owner → trang chủ có 9 ô.
   - Máy đã mở bản cũ: app tự nhận bản mới; nếu vẫn thấy bản cũ, kéo xuống làm mới (iPhone) hoặc Ctrl+Shift+R (máy tính), rồi xem **Tài khoản → Thông tin**: Phiên bản app **1.0.0-d1.3**, Phiên bản máy chủ **1.0.0-d1.3**.

## Phần C — Cài đặt lần đầu trong app (owner, trên máy tính)

Các mục quản trị nằm ở trang **Tài khoản**, kéo xuống dưới phần Bảo mật/Phiên đăng nhập và Hướng dẫn, trong thẻ **Quản trị · 管理** (ngay trên thẻ Thông tin).

1. **Tài khoản → Quản trị → Trạng thái hệ thống · 系统状态**, phần **Cấu hình · 系统设置**:
   - `app_base_url` → **Sửa** → `https://luongquangdao8386-ops.github.io/ME/` (có dấu `/` cuối) → nhập lý do → PIN.
   - `offline_probe_seconds` (Thời gian chờ máy chủ khi mở app) → **12**.
2. **Tài khoản → Quản trị → Sao lưu · 备份** → **Sao lưu ngay · 立即备份** → PIN. Màn hiện "Đang chờ sao lưu…" rồi "Đang sao lưu…" và tự cập nhật; sau 1–5 phút (Google chạy trigger) có dòng **Đã kiểm chứng · 已校验**. Nếu ra **Thất bại**, chụp cả dòng đó (cột cuối ghi lý do) gửi Claude.
3. **Tài khoản → Quản trị → Phân quyền · 权限**: đọc kỹ bảng quyền (bắt buộc duyệt trước khi nhập dữ liệu thật). Muốn đổi ô nào thì báo Claude hoặc tự bật/tắt rồi **Lưu** kèm lý do.
4. (Khi muốn thử Gmail) **Tài khoản → Quản trị → Người nhận Gmail và nhật ký gửi**: thêm địa chỉ của chính anh/chị → tick **Xác nhận** → PIN → **Bật gửi Gmail** → **Gửi thử**.
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

Làm trên **THỬ**, sau Phần C (đã có ít nhất một bản sao lưu "Đã kiểm chứng" — gọi là **bản B1**).

**Chuẩn bị (trong app, trên máy tính):**
1. **Thiết bị → Thêm** một thiết bị tên `THỬ KHÔI PHỤC` → Lưu. Ghi lại mã (vd `TB-0005`). Thiết bị này tạo **sau** B1 nên sẽ mất khi khôi phục về B1.
2. Mở thiết bị `THỬ KHÔI PHỤC` → **Xem QR** → chụp màn hình mã QR (Windows: Win+Shift+S, dán vào Paint, lưu lại).
3. Mở một thiết bị MẪU có từ trước → **Xem QR** → chụp màn hình tương tự (đây là "tem cũ").

**Khôi phục (trong trình soạn Apps Script `ME_MayChu_THU`):**
4. Chọn hàm **`adminMaintenanceOn`** → **Chạy**. App sẽ báo "Hệ thống đang bảo trì".
5. Chọn **`backupData`** → **Chạy** → Nhật ký: `backupData: <ngày_giờ> → VERIFIED` (bản **B2**, giữ hiện trạng để quay lại).
6. Google Drive → `ME_HeThong_THU` → `ME_Backups_THU` → mở thư mục **B1** (tên ngày-giờ của lần Sao lưu ngay ở Phần C, **không** phải thư mục vừa tạo ở bước 5). Mở `manifest.json`: phải thấy `"status": "VERIFIED"`.
7. Trong thư mục B1, chuột phải tệp **`ME_NghiepVu_<ngày_giờ>`** (không lấy `ME_BaoMat_…`) → **Tạo bản sao**.
8. Chuột phải tệp "Bản sao của ME_NghiepVu_…" → **Đổi tên** → `ME_NghiepVu_khoiphuc_<ngày>` → chuột phải → **Sắp xếp → Di chuyển** → chọn thư mục `ME_HeThong_THU` → **Di chuyển**. **Bắt buộc chuyển ra ngoài** `ME_Backups_THU`, vì sao lưu tự động sẽ dọn các tệp cũ trong thư mục sao lưu.
9. Mở tệp `ME_NghiepVu_khoiphuc_…` → chép **ID** trên thanh địa chỉ: đoạn giữa `/d/` và `/edit`.
10. Apps Script → **Cài đặt dự án** (bánh răng) → **Thuộc tính tập lệnh** → **Chỉnh sửa thuộc tính tập lệnh** → **Thêm thuộc tính tập lệnh**: Thuộc tính `RESTORE_SOURCE_ID`, Giá trị = ID vừa chép → **Lưu thuộc tính tập lệnh**.
11. Về Trình chỉnh sửa → chọn **`adminFinalizeManualRestore`** → **Chạy** → Nhật ký: "Khôi phục xong từ bản … Bảo trì vẫn đang BẬT."
12. Chọn **`adminMaintenanceOff`** → **Chạy**.

**Kiểm tra (app):**
13. Mọi máy phải **đăng nhập lại** (phiên cũ bị thu hồi). Nháp chưa gửi trên máy cũ chuyển vào "Nháp thế hệ dữ liệu cũ".
14. Thiết bị `THỬ KHÔI PHỤC` không còn trong danh sách. Mở 5 hồ sơ khác: còn đủ.
15. Trên iPhone bấm **Quét QR · 扫码**: quét ảnh QR thiết bị MẪU → mở đúng hồ sơ; quét ảnh QR `THỬ KHÔI PHỤC` → báo "Không có mã này trong dữ liệu hiện tại…".
16. **Nhắc hạn** hiển thị bình thường; **Tài khoản → Sao lưu** có dòng "Đã khôi phục lúc … từ bản …".

**Quay lại bản trước khôi phục (diễn tập đủ bước):**
17. Chạy **`adminMaintenanceOn`**.
18. Cài đặt dự án → Thuộc tính tập lệnh: chép giá trị của **`PREVIOUS_BUSINESS_SPREADSHEET_ID`** → thêm lại thuộc tính `RESTORE_SOURCE_ID` = giá trị đó → Lưu.
19. Chạy **`adminFinalizeManualRestore`** → rồi **`adminMaintenanceOff`**.
20. Đăng nhập lại: thiết bị `THỬ KHÔI PHỤC` xuất hiện trở lại, QR của nó mở được.

Gặp lỗi đỏ ở bất kỳ bước nào: dừng, chụp Nhật ký thực thi gửi Claude (bảo trì đang bật thì cứ để bật).

## Lưu ý an toàn

- Không đưa lên GitHub: đặc tả, phụ lục, PDF bản vẽ, ảnh nhà máy gốc, link bảng tính, PIN, tệp Excel dữ liệu thật.
- Không chia sẻ thư mục `ME_HeThong_THU` hay hai bảng tính cho ai. Thư mục sao lưu chỉ tài khoản M&E xem.
- Không gửi Claude PIN, mật khẩu, mã SMS. Chỉ gửi link `/exec` khi dựng máy chủ mới.
- Quên PIN: nhờ quản trị **Cấp PIN tạm** trong Quản trị → Người dùng. Owner quên PIN trên THỬ: thêm thuộc tính `POC_RESET_CODE` và `POC_RESET_TEMP_PIN` → chạy `pocResetPin`.

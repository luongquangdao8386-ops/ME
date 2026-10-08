# Hướng dẫn triển khai M&E — Bước 0 (PoC)

Làm trên **máy tính**, trong **hồ sơ Chrome của tài khoản Google M&E** (không dùng tài khoản đang chạy app Cơ Điện).
Môi trường này là **THỬ**: chỉ có dữ liệu mẫu ghi "MẪU". Không nhập dữ liệu thật, không in tem thật.

Cần 2 tệp trong thư mục `apps-script/` của repo: `appsscript.json` và `Code.gs`.

---

## Phần A — Dựng máy chủ Apps Script (khoảng 15 phút)

1. Mở <https://script.google.com> → **Dự án mới**.
2. Bấm tên "Dự án không có tiêu đề" ở góc trên → đặt tên `ME_MayChu_THU` → **Đổi tên**.
3. Bánh răng **Cài đặt dự án** (cột trái) → tick **Hiển thị tệp kê khai "appsscript.json" trong trình chỉnh sửa**.
4. Quay lại **Trình chỉnh sửa** (biểu tượng `< >`):
   - Mở `appsscript.json` → chọn hết (Ctrl+A) → xóa → dán nội dung tệp `appsscript.json` → **Lưu** (Ctrl+S).
   - Mở `Code.gs` → chọn hết → xóa → dán toàn bộ nội dung tệp `Code.gs` → **Lưu**.
5. Ở thanh trên, ô chọn hàm → chọn **`setup`** → bấm **Chạy**.
   - Lần đầu Google hỏi quyền: **Xem xét quyền** → chọn tài khoản M&E → **Nâng cao** → **Đi tới ME_MayChu_THU (không an toàn)** → **Cho phép**.
   - Chờ Nhật ký thực thi hiện "Xong setup. ENV=THU …". Trong Google Drive sẽ có thư mục `ME_HeThong_THU` (2 bảng tính + thư mục dữ liệu).
6. **Tạo tài khoản chủ hệ thống (owner):** Cài đặt dự án → **Thuộc tính tập lệnh** → **Thêm thuộc tính tập lệnh** 3 lần:

   | Thuộc tính | Giá trị |
   | --- | --- |
   | `SETUP_OWNER_CODE` | Mã nhân viên của anh/chị, vd `NV-001` |
   | `SETUP_OWNER_NAME` | Họ tên hiển thị |
   | `SETUP_OWNER_TEMP_PIN` | 6 số tạm tự chọn (không dùng 123456, 000000, dãy liên tiếp, 6 số cuối mã nhân viên) |

   → **Lưu thuộc tính tập lệnh** → về Trình chỉnh sửa → chọn hàm **`adminSetupOwner`** → **Chạy**.
   Nhật ký báo "Đã tạo owner …". Ba thuộc tính trên tự xóa ngay sau đó; PIN tạm hết hạn sau 72 giờ.
7. Chọn **`pocSeedSampleData`** → **Chạy**. Nhật ký in **PIN của các tài khoản MẪU** (MAU-C1, MAU-KT, MAU-HD, MAU-C3, MAU-KHOA) — chép lại `MAU-C1 / ……` để thử P-07.
8. Chọn **`pocTestVectors`** → **Chạy** → phải thấy "Tất cả test vector ĐẠT."
9. Chọn **`installTriggers`** → **Chạy** (nếu hỏi quyền thì cho phép như bước 5).
10. **Triển khai:** nút **Triển khai** (góc phải) → **Triển khai mới** → bánh răng "Chọn loại" → **Ứng dụng web**:
    - Mô tả: `PoC 1`
    - Thực thi với tư cách: **Tôi**
    - Người có quyền truy cập: **Bất kỳ ai**
    - **Triển khai** → chép **URL ứng dụng web** (kết thúc bằng `/exec`).
11. **Kiểm link:** mở **cửa sổ ẩn danh** (Ctrl+Shift+N), dán link và thêm `?action=system.health` vào cuối, Enter.
    Thấy dòng có `"ok":true` và `"app_id":"ME"` là đạt.
12. **Gửi link `/exec` cho Claude** (chỉ link, không gửi PIN hay mật khẩu).

> Sửa mã về sau: dán `Code.gs` mới → Lưu → chạy `migrateSchema` (an toàn khi chạy nhiều lần) → **Triển khai** → **Quản lý bản triển khai** → bút chì **Chỉnh sửa** → Phiên bản: **Phiên bản mới** → **Triển khai**. Làm như vậy link `/exec` giữ nguyên. Kiểm lại: báo cáo PoC ghi đúng số **Máy chủ** mới.

## Phần B — Bật GitHub Pages

1. Mã nằm trên nhánh `claude/me-code-dot-1-eykm2j` của repo `ME`. Mở repo trên GitHub → **Compare & pull request** (hoặc tab **Pull requests** → **New pull request**, chọn nhánh trên vào `main`) → **Create pull request** → **Merge pull request** → **Confirm merge**.
2. Repo → **Settings** → **Pages** → Source: **Deploy from a branch** → Branch: **main**, thư mục **/ (root)** → **Save**.
3. Chờ 1–2 phút, mở <https://luongquangdao8386-ops.github.io/ME/> → thấy màn Đăng nhập · 登录 có ảnh nhà máy và logo.

## Phần C — Chạy PoC trên iPhone và máy tính

Mỗi nơi mở app (tab Safari, app trên Màn hình chính, máy tính) có bộ nhớ và đăng nhập **riêng**.

1. **Lần đầu, mỗi nơi:** ở màn đăng nhập mở "Địa chỉ máy chủ (/exec)" → dán link `/exec` → **Lưu** (khi Claude đã đưa link vào `config.js` thì không cần bước này).
2. Đăng nhập bằng mã owner + PIN tạm → app bắt **Đổi PIN** → đặt PIN 6 số mới (không dùng lại PIN của app Cơ Điện).
3. Trang **Kiểm thử PoC · PoC测试**: mở từng mục P-01 … P-19, bấm nút, làm theo dòng hướng dẫn trong mục.
4. **iPhone:** chạy trước trong tab Safari; sau đó Safari → nút Chia sẻ → **Thêm vào MH chính** → mở biểu tượng M&E → đăng nhập lại → chạy lại các mục (nhất là P-04, P-05, P-07, P-08).
5. Một số mục cần làm tay:
   - **P-04:** đăng nhập trong app Màn hình chính → bật **Chế độ máy bay** → vuốt tắt hẳn app → mở lại → màn **Mở khóa ngoại tuyến · 离线解锁** → nhập PIN → **Tạo nháp kiểm định** → tắt chế độ máy bay → **Đồng bộ ngay**.
   - **P-05:** trên máy tính mở mục P-05 → **In tem thử** → In (khổ A4, tỉ lệ 100%) → trên iPhone bấm **Quét QR · 扫码** quét 1 tem nhỏ và 1 tem lớn.
   - **P-06:** chụp 1 ảnh thật (thử cả ảnh 48 MP / HEIC nếu máy có) → sau khi **Đặt riêng tư**, mở link ảnh cũ trong cửa sổ ẩn danh chưa đăng nhập Google: phải không xem được.
   - **P-10:** 3 máy cùng lúc, mỗi máy một nhãn (A, B, C) → **Gửi 20 lệnh tạo** → **Kiểm tra tổng** phải đủ 60, không trùng mã.
   - **P-15:** **Ghi mốc** → mở app Cơ Điện trên cùng iPhone/trình duyệt → đăng xuất Cơ Điện → quay lại M&E → **Kiểm tra mốc**.
   - **P-16:** owner bấm **Tạo tệp 2/5/10 MB** một lần, rồi mỗi máy bấm **Tải xuống 2/5/10 MB**.
   - **P-17:** **Request 70 giây** mất khoảng 2 phút.
6. Xong mỗi nơi: **Sao chép báo cáo** (đầu trang) → dán vào cuộc trò chuyện với Claude.

## Lưu ý an toàn

- Không đưa lên GitHub: đặc tả, phụ lục, PDF bản vẽ, ảnh nhà máy gốc, link bảng tính, PIN.
- Không chia sẻ thư mục `ME_HeThong_THU` hay hai bảng tính cho ai.
- Quên PIN khi đang thử (hoặc bị khóa): Thuộc tính tập lệnh → thêm `POC_RESET_CODE` (mã nhân viên) và `POC_RESET_TEMP_PIN` (6 số tạm) → chạy hàm **`pocResetPin`** → đăng nhập bằng PIN tạm và đặt PIN mới. Hai khóa tự xóa sau khi chạy.

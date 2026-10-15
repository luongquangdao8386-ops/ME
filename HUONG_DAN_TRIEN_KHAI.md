# Hướng dẫn triển khai M&E — bản 1.0.0-d3.2 (Đợt 1, Đợt 2 đang chạy THẬT · Đợt 3 thử trên THỬ)

Làm trên **máy tính**, trong **hồ sơ Chrome của tài khoản Google M&E** (không dùng tài khoản đang chạy app Cơ Điện).

## Hai môi trường

| | **THẬT** (dùng hằng ngày) | **THỬ** (chỉ dữ liệu mẫu "MẪU") |
| --- | --- | --- |
| Địa chỉ app | <https://luongquangdao8386-ops.github.io/ME/> (in trên tem QR) | <https://luongquangdao8386-ops.github.io/ME-thu/> |
| Mã app | Repo `ME`, nhánh **`main`** — chỉ nhận bản đã thử xong trên THỬ | Repo `ME-thu` (bản sao mã, Claude đẩy mỗi phiên) |
| Máy chủ Apps Script | `ME_MayChu_THAT` (thuộc tính `ENV` = `THAT`) | `ME_MayChu_THU` (`ENV` = `THU`) |
| Dữ liệu Drive | `ME_HeThong` | `ME_HeThong_THU` |
| Nhãn trong app | không có | **THỬ · 测试** ở đầu trang; tên trên Màn hình chính "M&E THỬ" |

- Hai app cùng một mã; app tự chọn máy chủ theo địa chỉ trang. Một iPhone cài được cả hai biểu tượng, dữ liệu không lẫn nhau.
- Bàn thử PoC, tem thử và các hàm `poc…` chỉ chạy ở THỬ. THẬT không có ô nhập link máy chủ ở màn Đăng nhập.
- Không nhập dữ liệu thật vào THỬ; không in tem thật từ THỬ.

**Thứ tự lần này (Đợt 3):** Phần M (đưa máy chủ Đợt 3 lên THỬ) → Phần N (thử Đợt 3 trên `/ME-thu/`) → báo Claude kết quả → khi muốn dùng thật, nói **"phát hành THẬT"** → Phần O. **Trạng thái 15/10/2026:** Đợt 2 đã thử xong trên THỬ và **đã phát hành THẬT** (Phần J, K, L xong). Phần F, G, H (dựng THẬT, tạo `ME-thu`) xong 14/10/2026; Phần A–E là việc của THỬ ở Đợt 1 — giữ để tra cứu.

Cần 2 tệp trong thư mục `apps-script/` của repo: `appsscript.json` và `Code.gs`. Tệp `Code.gs` lớn: mở link raw `https://raw.githubusercontent.com/luongquangdao8386-ops/ME/<nhánh>/apps-script/Code.gs` → Ctrl+A → Ctrl+C.

---

## Phần M — Đưa Đợt 3 lên THỬ (`ME_MayChu_THU`)

Đợt 3 thêm **10 sheet** (Đồng hồ, Giai đoạn đồng hồ, Chỉ số, Sự kiện đồng hồ, Biểu giá, Tủ điện, Lộ điện, Phụ tải, Mẫu báo cáo, Báo cáo đã lưu), 3 cột duyệt bản vẽ ở sheet Tài liệu, 2 cấu hình (`meter_boundary_window_hours` = 24: số chốt kỳ là lần đọc hợp lệ đầu tiên trong 24 giờ sau mốc 00:00; `reading_self_edit_hours` = 24: người đọc tự sửa chỉ số của mình trong 24 giờ) và **8 mẫu báo cáo** có sẵn. Máy chủ mới cần thêm **một quyền Google**: tạo Google Tài liệu tạm để xuất PDF (báo cáo, hồ sơ thiết bị, phiếu).

Thứ tự lần này **khác Phần J**: cấp quyền → triển khai bản mới → **sau cùng** mới `migrateSchema`. Lý do: máy chủ đang triển khai (mã Đợt 2) mà thấy sheet đã nâng thì tự lùi về Đợt 1 — Bảo trì, Sửa chữa mờ đi cho tới khi triển khai bản mới. Mã mới thì chạy như Đợt 2 cho tới khi `migrateSchema` xong, nên làm theo thứ tự dưới đây app không lúc nào bị gián đoạn.

1. Trang THỬ đã tự cập nhật app: mở <https://luongquangdao8386-ops.github.io/ME-thu/> → Ctrl+Shift+R → **Tài khoản → Thông tin**: Phiên bản app **1.0.0-d3.2**. Lúc này Điện nước, Báo cáo, Tra cứu lộ điện còn mờ "Sắp có" — đúng (máy chủ chưa nâng).
2. **Sao lưu THỬ trước:** Tài khoản → Quản trị → **Sao lưu ngay** → PIN → chờ dòng **Đã kiểm chứng**.
3. Mở link raw `https://raw.githubusercontent.com/luongquangdao8386-ops/ME/claude/dot-3/apps-script/Code.gs` → Ctrl+A → Ctrl+C.
4. <https://script.google.com> → dự án **ME_MayChu_THU** → `Code.gs` → Ctrl+A → xóa → dán → **Lưu** (Ctrl+S).
5. **Cấp quyền mới:** ô chọn hàm → **`healthCheck`** → **Chạy** → Google hỏi quyền: **Xem xét quyền** → chọn tài khoản M&E → **Nâng cao** → **Đi tới ME_MayChu_THU (không an toàn)** → **Cho phép** (có thêm dòng xem/sửa/tạo Google Tài liệu). Nhật ký: dòng `CẢNH BÁO schema_version: 1.5.2 (1.5.3)` — đúng, chưa nâng. Không hỏi quyền cũng được (đã cấp trước đó).
6. **Triển khai** → **Quản lý bản triển khai** → bút chì → Phiên bản: **Phiên bản mới** → Mô tả `THỬ d3.2` → **Triển khai** (giữ nguyên link). Cửa sổ ẩn danh → link `/exec` của THỬ thêm `?action=system.health` → thấy `"ok":true`, `"app_id":"ME"`. App THỬ lúc này vẫn chạy như Đợt 2 (Bảo trì, Sửa chữa dùng bình thường).
7. Ô chọn hàm → **`migrateSchema`** → **Chạy**. Nhật ký: `migrateSchema xong. Thêm: Documents(approval_status,approved_by,approved_at); Meters; MeterSegments; MeterReadings; MeterEvents; UtilityTariffs; Panels; Circuits; CircuitLoads; ReportDefinitions; ReportRuns. schema_version=1.5.3`. Chạy lại nhiều lần vẫn an toàn (lần sau: `Thêm: không có`).
8. Chạy **`healthCheck`** → `schema_version: 1.5.3`, `server_version: 1.0.0-d3.2` ĐẠT (cảnh báo cũ đã biết thì bỏ qua). Không cần cài thêm trigger.
9. App THỬ: Ctrl+Shift+R (máy tính) / đóng hẳn rồi mở lại app (iPhone; app đang mở thì hiện thông báo "mở lại app") → lưới 9 ô **sáng hết**. **Tài khoản → Quản trị → Trạng thái hệ thống**: schema **1.5.3**, máy chủ **d3.2**.

## Phần N — Thử Đợt 3 trên THỬ

Làm sau Phần M, **theo đúng thứ tự** (bước sau dùng dữ liệu của bước trước). Máy tính: Chrome, trang `/ME-thu/`. iPhone: app **M&E THỬ**. Tài khoản: **NV001** (quản trị), **MAU-C3** (trưởng bộ phận), **MAU-KT** (kỹ thuật, không xem giá), **MAU-DN** (tạo ở bước 0). Người lập **không** tự duyệt việc của mình (biểu giá, sự kiện đồng hồ, xác minh, bản vẽ).

Quét QR khi chưa in tem: trên máy tính mở hồ sơ → biểu tượng **QR** (Xem QR) để mã hiện trên màn hình; trên iPhone bấm **Quét QR** (nút vàng giữa thanh dưới) rồi đưa camera vào màn hình.

### Bước 0 — Chuẩn bị
1. Máy tính, NV001: **Tài khoản → Quản trị → Người dùng và PIN tạm → Thêm người dùng**: mã `MAU-DN`, tên `Đọc điện nước (MẪU)`, cấp **Nhân viên**, vai trò **Đọc điện nước** → Lưu → ghi lại PIN tạm.
2. iPhone: đăng xuất người đang dùng (hoặc dùng máy khác) → đăng nhập **MAU-DN** bằng PIN tạm → đổi PIN mới.

### Bước 1 — Thêm 2 đồng hồ (máy tính, NV001)
1. **Điện nước → Đồng hồ → Thêm đồng hồ**.
2. Tên `Điện xưởng A`; Loại **Đồng hồ điện**; Mã đồng hồ để trống; Khu vực: chọn một khu vực; Hệ số nhân `1`; Chu kỳ đọc chỉ số **5 ngày**.
3. Khung **Chỉ số ban đầu**: ô **Chỉ số trên đồng hồ** `12350`, ô **Đọc lúc** `01/10/2026 07:45` → **Lưu**.
4. Thêm đồng hồ thứ hai: Tên `Nước xưởng A`, Loại **Đồng hồ nước**, chu kỳ **5 ngày**, chỉ số ban đầu `600` lúc `01/10/2026 07:00` → Lưu.

**Đúng khi:** có **DH-0001** (kWh) và **DH-0002** (m³). Nhãn **Đã qua mốc chưa đọc** là bình thường (ngày đọc lùi về đầu tháng).

### Bước 2 — Ví dụ B1: 130 kWh
1. Máy tính: mở DH-0001 → **Xem QR**.
2. iPhone, MAU-DN: **Quét QR** → app mở thẳng màn **Nhập chỉ số** của DH-0001.
3. **Ngày giờ đọc**: chọn `06/10/2026 08:00` → dòng **Chỉ số trước** hiện `12 350 · 01/10/2026 07:45`.
4. **Chỉ số mới** `12480` → dòng **Tiêu thụ kỳ đo** hiện **130 kWh** → **Gửi chỉ số** → báo "Đã lưu chỉ số — tiêu thụ 130 kWh".
5. Máy tính, NV001: **Điện nước** → kỳ **5 ngày** → bấm **‹** tới **01/10/2026 – 05/10/2026**.

**Đúng khi:** ô Điện **130 kWh**; bảng dưới: DH-0001 **Đủ dữ liệu**. Bấm **‹** thêm một lần (26/09 – 30/09): DH-0001 ghi **Mốc gốc**, ô Điện "—" (không phải 0).

### Bước 3 — B1: thiếu số chốt
1. iPhone, MAU-DN: DH-0002 → **Nhập chỉ số** → Ngày giờ đọc `07/10/2026 00:30`, Chỉ số mới `625` → Gửi chỉ số.
2. Máy tính: Điện nước → kỳ **01/10/2026 – 05/10/2026**.

**Đúng khi:** DH-0002 **Thiếu số đo** (lần đọc đầu sau mốc 06/10 00:00 đã quá 24 giờ); ô Nước "—"; biểu đồ nước ở kỳ đó không có cột, chỉ có dấu tròn. Không chia đều, không ghi 0.

### Bước 4 — Biểu giá, chi phí
1. Máy tính, NV001: Điện nước → **Biểu giá → Thêm biểu giá**: Loại **Điện**, Khu vực áp dụng **Toàn nhà máy**, Tên `Giá điện thử`, Hiệu lực từ `01/09/2026`, Đơn giá `2000`, Tiền tệ `VND`, Thuế (%) `8` → Lưu → trạng thái **Nháp chờ duyệt**; NV001 thấy "Bạn đã lập/sửa biểu giá này nên không tự duyệt".
2. MAU-C3: Điện nước → **Biểu giá** → **Duyệt** → nhập PIN → **Đã duyệt**.
3. NV001: Điện nước, kỳ 01/10 – 05/10.

**Đúng khi:** ô Điện có **Chi phí 280 800 VND** (130 × 2 000 × 1,08). Đăng nhập MAU-KT: không có dòng chi phí, không có nút Biểu giá.

### Bước 5 — Nhập chỉ số khi mất mạng (iPhone, MAU-DN)
1. Bật **Chế độ máy bay** → app hiện "Ngoại tuyến".
2. Điện nước → Đồng hồ → DH-0001 → **Nhập chỉ số**: giữ giờ hiện tại, Chỉ số mới `12600`, **Chụp ảnh** đồng hồ (chụp gì cũng được) → **Gửi chỉ số** → báo "Đã lưu chỉ số trên máy, gửi khi có mạng"; dòng chỉ số có nhãn **Đã lưu trên máy**.
3. Tắt Chế độ máy bay, chờ vài giây.

**Đúng khi:** nhãn "Đã lưu trên máy" mất; máy tính (NV001) mở DH-0001 thấy đúng **1** chỉ số 12 600 kèm **1** ảnh; **Tài khoản → Nháp chờ đồng bộ** trống.

### Bước 6 — Sửa, hủy chỉ số
1. iPhone, MAU-DN (có mạng): DH-0001 → tab **Lịch sử chỉ số** → dòng 12 600 → **Sửa chỉ số** → `12610`, Lý do `Gõ nhầm` → Lưu.
2. Máy tính, NV001: DH-0001 → dòng 12 610 → **Hủy chỉ số** → nhập lý do → xác nhận.

**Đúng khi:** dòng bị gạch, trạng thái **Đã hủy**; kỳ 01/10 – 05/10 vẫn 130 kWh. (Thêm nếu muốn: nhập số nhỏ hơn lần trước → app cảnh báo "Chỉ số nhỏ hơn lần trước…"; vẫn gửi thì lưu **Cần kiểm tra**, không dùng để tính — NV001 hủy dòng đó sau.)

### Bước 7 — Thay đồng hồ
1. Máy tính, NV001: DH-0001 → **Thay/reset/đổi hệ số** → Loại sự kiện **Thay đồng hồ**; Thời điểm: bây giờ; Số chốt đồng hồ cũ `12700`; Số mở đồng hồ mới `0` → Lưu → "Đã ghi sự kiện, chờ duyệt".
2. MAU-C3: mở DH-0001 → ô **Có sự kiện chờ duyệt** → **Duyệt** → PIN.
3. iPhone, MAU-DN: đóng hẳn rồi mở lại app (nhận giai đoạn mới) → DH-0001 → Nhập chỉ số (giờ hiện tại): **Chỉ số trước** hiện **0** → nhập `25` → Tiêu thụ **25 kWh** → Gửi.

**Đúng khi:** tab **Giai đoạn đồng hồ** có 2 dòng (giai đoạn 1 **Đã chốt** 12 350 → 12 700; giai đoạn 2 **Đang dùng**, mở 0); tiêu thụ không lấy 25 − 12 700. (Thêm nếu muốn: DH-0002 → **Đổi hệ số**: số chốt `630`, Hệ số mới `10` → MAU-C3 duyệt → các lần đọc sau tính × 10.)

### Bước 8 — Tủ và lộ điện (máy tính, NV001)
Chọn sẵn 2 thiết bị trên THỬ: một thiết bị làm **thiết bị của tủ DB1** (nên lấy thiết bị đã có phiếu sửa từ lúc thử Đợt 2; chưa có thì **Sửa chữa → Báo sự cố** cho nó), và một máy làm **phụ tải**.
1. **Tra cứu lộ điện → Thêm tủ** 4 lần:
   - `Điểm nhận lưới 22 kV` — Loại tủ **Điểm nhận lưới** → TU-0001
   - `MBA 1000 kVA` — **Máy biến áp (MBA)** → TU-0002
   - `Tủ tổng MSB` — **Tủ tổng (MSB)** → TU-0003
   - `Tủ DB1` — **Tủ phân phối**, ô **Thiết bị của tủ** chọn thiết bị đã chọn → TU-0004
2. Mở TU-0001 → **Thêm lộ** (Tủ cha tự là TU-0001) → Tên `Lộ lưới → MBA` → Lưu (LO-0001) → tab **Phụ tải** → **Thêm phụ tải** → **Tủ nhận nguồn** = TU-0002, Vai trò nguồn **Nguồn chính** → Lưu.
3. Tương tự: TU-0002 → lộ `Lộ MBA → MSB`, phụ tải tủ TU-0003; TU-0003 → lộ `Lộ MSB → DB1`, phụ tải tủ TU-0004.
4. TU-0004 → **Thêm lộ** `Lộ máy nén` (LO-0004) → **Thêm phụ tải** → **Thiết bị** = máy phụ tải → Lưu.

**Đúng khi:** có 4 tủ, 4 lộ; đều ghi **Chưa xác minh**.

### Bước 9 — B2: tủ ↔ thiết bị
1. Mở tủ **TU-0004**.

**Đúng khi:** dòng **Thiết bị của tủ** là thiết bị đã chọn; khung **Phiếu của thiết bị nối tủ** có phiếu **SC-** (và phiếu BT nếu có) của thiết bị đó. Bấm **Hồ sơ thiết bị** → trang thiết bị có nút **Lộ điện · TU-0004** và **Xem đường cấp**.

### Bước 10 — Đường cấp, chặn vòng
1. Mở thiết bị phụ tải (hoặc lộ LO-0004) → **Xem đường cấp**.
   **Đúng khi:** chuỗi từ trên xuống: Nguồn TU-0001 → LO-0001 → Nguồn TU-0002 → LO-0002 → Tủ TU-0003 → LO-0003 → Tủ TU-0004 → LO-0004 (→ Phụ tải); nhãn **Tới nguồn**; dòng "Tra cứu không xác nhận đã cô lập điện".
2. Lộ LO-0004 → tab Phụ tải → **Thêm phụ tải** → **Tủ nhận nguồn** = TU-0003 → Lưu.
   **Đúng khi:** báo **Không lưu được: tạo vòng cấp điện**, không lưu.
3. (Tùy chọn, nguồn dự phòng) Thêm tủ `Máy phát` (Loại **Máy phát**) → Thêm lộ → phụ tải tủ TU-0003, Vai trò nguồn **Nguồn dự phòng**. Xem lại đường cấp: có **2 đường**; bấm **Nguồn chính** chỉ còn đường qua lưới; **Nguồn dự phòng** chỉ còn đường qua máy phát (nhãn **Dự phòng**).

### Bước 11 — Xác minh, bản vẽ
1. NV001 mở TU-0004: thấy "Bạn sửa lần cuối nên không tự xác minh".
2. MAU-C3 mở TU-0004 → **Xác minh** → xác nhận → PIN → **Đã xác minh**. Làm thêm với LO-0004.
3. iPhone, MAU-KT: mở LO-0004 → tab **Tài liệu** → **Tải bản vẽ mới** → chọn 1 tệp PDF hoặc ảnh (≤ 5 MB) → tiêu đề → Tải lên → dòng **Chờ duyệt**.
4. MAU-C3: mở LO-0004 → tab Tài liệu → **Duyệt** → PIN → **Phiên bản đã duyệt**.
5. MAU-KT tải thêm bản thứ hai → MAU-C3 duyệt.

**Đúng khi:** bản mới **Phiên bản đã duyệt**, bản trước thành **Bản cũ**; MAU-KT không có nút Duyệt.

### Bước 12 — Báo cáo
1. Máy tính, NV001: **Báo cáo** → bảng mẫu → dòng **Điện nước** → **Xem** (khung Xem trước bên phải) → **Tạo báo cáo**.
2. Kỳ **5 ngày**, Ngày `01/10/2026` → **Tạo báo cáo**.
   **Đúng khi:** Tóm tắt Điện **130 kWh**, Chi phí **280 800 VND**, Nước **Chưa đủ số liệu để tính** (không ghi 0); bảng chi tiết DH-0001, DH-0002; **không logo**; cuối trang có ô Người lập / Người duyệt.
3. **Xuất Excel** → mở tệp: đúng số, không logo. **PDF** → mở được, không logo.
4. **Lưu báo cáo** → báo "Đã lưu báo cáo **BC-2610-001**"; mục **Báo cáo đã lưu** có dòng này và biểu tượng QR.
5. Đăng nhập MAU-KT → chạy cùng báo cáo: không có dòng/cột chi phí.
6. Thử thêm các mẫu **Hồ sơ linh kiện thiết bị**, **Sự cố và sửa chữa**, **Lộ điện và phụ tải**: số khớp các màn tương ứng.

### Bước 13 — Sửa mẫu báo cáo (máy tính, NV001)
1. Báo cáo → **Nhập mẫu Excel** (hoặc **Xuất mẫu**) → trang danh sách mẫu → bấm mẫu **Điện nước**.
2. **Cột hiển thị**: bỏ chọn 1 cột, đổi thứ tự bằng **Lên / Xuống** → **Lưu mẫu** → chạy lại báo cáo: cột đã đổi. Mẫu có sẵn chỉ đổi cột, cấp được xem, biểu đồ; muốn mẫu khác hẳn thì **Mẫu mới**.
3. **Xuất mẫu** → được tệp Excel → **Nhập mẫu Excel** chọn lại tệp đó → "Đã đọc mẫu từ tệp — kiểm tra rồi bấm Lưu mẫu".

### Bước 14 — Xuất PDF hồ sơ, phiếu
1. **Thiết bị** → mở một thiết bị → **Xuất PDF** (máy tính tải thẳng; iPhone bấm tiếp **Mở / Lưu**).
2. Mở một phiếu **BT** và một phiếu **SC** → **Xuất PDF**.

**Đúng khi:** PDF mở được, không logo, đủ thông tin; MAU-KT xuất phiếu có chi phí thì không thấy chi phí.

### Bước 15 — Nút Báo cáo ở các module
Thiết bị, Bảo trì, Sửa chữa, Kho vật tư, Kiểm định, Hợp đồng, Điện nước, Tra cứu lộ điện → nút **Báo cáo** mở đúng mẫu của module (Thiết bị, Điện nước, Lộ điện mang theo bộ lọc đang chọn).

### Bước 16 — Excel
1. Điện nước → **Nhập/xuất Excel** → **Đồng hồ và chỉ số** → **Xuất Excel** → tệp có sheet meters (DH-0001, DH-0002), sheet meter_readings trống → **Chọn tệp .xlsx để nhập** chọn lại tệp đó → Kết quả kiểm tra: **Không đổi (bỏ qua)**.
2. **Biểu giá điện nước** (lô nhạy cảm): NV001 **Tải mẫu** → điền 1 dòng từ dòng 3: Loại `WATER`, Hiệu lực từ `01/09/2026`, Đơn giá `15000`, Thuế `5` → chọn tệp → **Gửi duyệt** ("Đã gửi duyệt…"). MAU-C3: cùng trang Excel → **Lô gần đây** → mở lô → **Nhập dữ liệu** + PIN → biểu giá nước **Đã duyệt** (ghi là duyệt). NV001 không tự ghi được lô của mình.
3. Tra cứu lộ điện → **Nhập/xuất Excel** → **Tủ, lộ, phụ tải, bản vẽ** → Xuất Excel → nhập lại nguyên tệp → **Không đổi (bỏ qua)**.

### Bước 17 — Tem QR theo vai trò
1. Đồng hồ, tủ, lộ, báo cáo đã lưu đều có biểu tượng QR → **In QR** (chỉ in thử, không dán tem thật).
2. iPhone, MAU-KT quét QR DH-0001 → mở **trang đồng hồ** (không có Nhập chỉ số); MAU-DN quét → vào thẳng **Nhập chỉ số** (như bước 2).
3. Quét QR tủ/lộ → mở trang tủ/lộ. NV001 quét QR báo cáo đã lưu → mở BC-2610-001.

### Bước 18 — Trang chủ, logo
- Ô **Điện nước**: "N cần đọc"; ô **Tra cứu lộ điện**: "N lộ"; ô **Báo cáo**: "8 mẫu".
- **Lịch tuần này**: ngày có mốc đọc (chu kỳ 5 ngày: 16, 21, 26… hằng tháng) có mục **Chỉ số** kèm số đồng hồ.
- Không có logo ở các màn Điện nước, Lộ điện, Báo cáo, PDF, Excel, tem (logo chỉ ở biểu tượng app, Đăng nhập, Trang chủ).

Báo kết quả theo dạng "Bước 1 đạt, 2 đạt, … 7 lỗi" kèm ảnh chụp chỗ lỗi (có mã đồng hồ/tủ/lộ, giờ). Đổi cửa sổ chốt kỳ (1–24 giờ) hoặc thời gian tự sửa chỉ số: **Tài khoản → Quản trị → Trạng thái hệ thống → Cấu hình** → dòng tương ứng → **Sửa cấu hình**.

## Phần O — Phát hành Đợt 3 lên THẬT (chỉ sau khi nói "phát hành THẬT")

THẬT đang dùng Bảo trì, Sửa chữa hằng ngày: giữ đúng thứ tự **cấp quyền → triển khai → `migrateSchema`** (như Phần M) để không lúc nào bị lùi đợt. Nên làm ngoài giờ có người đang ghi phiếu.

1. Claude đưa đúng bản đã thử trên THỬ (nhánh `claude/dot-3`, bản **1.0.0-d3.2** trở lên) lên nhánh `main` của repo `ME` → trang `/ME/` tự cập nhật app (vẫn chạy như Đợt 2 tới khi máy chủ THẬT nâng). Chờ 2–3 phút (tab **Actions** của repo `ME` xanh); gặp màn lỗi thì bấm **Tải lại bản mới**.
2. App THẬT: **Tài khoản → Quản trị → Sao lưu ngay** → PIN → chờ **Đã kiểm chứng**.
3. Mở link raw `https://raw.githubusercontent.com/luongquangdao8386-ops/ME/main/apps-script/Code.gs` → Ctrl+A → Ctrl+C → <https://script.google.com> → dự án **`ME_MayChu_THAT`** → `Code.gs` → Ctrl+A → xóa → dán → **Lưu**.
4. Ô chọn hàm → **`healthCheck`** → **Chạy** → cấp quyền mới như Phần M bước 5 (**Đi tới ME_MayChu_THAT (không an toàn)** → **Cho phép**). Dòng `schema_version: 1.5.2 (1.5.3)` báo CẢNH BÁO — đúng.
5. **Triển khai → Quản lý bản triển khai → bút chì → Phiên bản: Phiên bản mới** → Mô tả `THẬT d3` → **Triển khai** (giữ nguyên link) → cửa sổ ẩn danh mở link `/exec` THẬT thêm `?action=system.health` → thấy `"ok":true`. App THẬT vẫn chạy như Đợt 2.
6. Ô chọn hàm → **`migrateSchema`** → **Chạy** → Nhật ký giống Phần M bước 7, kết thúc bằng `schema_version=1.5.3`. Chạy **`healthCheck`** → các dòng ĐẠT (trừ cảnh báo đã biết).
7. Mở `/ME/` → Ctrl+Shift+R → **Tài khoản**: phiên bản app đúng bản đã thử; **Trạng thái hệ thống**: schema **1.5.3**. Lưới 9 ô sáng hết.
8. Dữ liệu thật (từ đây mới in và dán tem thật):
   - **Người dùng:** cấp vai trò **Đọc điện nước** cho người đọc số (Tài khoản → Quản trị → Người dùng).
   - **Đồng hồ:** thêm từng cái hoặc Excel **Đồng hồ và chỉ số**; chỉ số ban đầu = số đọc thật lúc bắt đầu dùng app. In tem QR dán đồng hồ.
   - **Biểu giá:** nhập tay hoặc Excel **Biểu giá điện nước** → người khác cấp 3–4 duyệt + PIN. Chưa có biểu giá thì báo cáo không có chi phí (không tự lấy 0).
   - **Tủ, lộ, phụ tải:** Excel **Tủ, lộ, phụ tải, bản vẽ** (Xuất Excel lấy mẫu → điền → Nhập). Nguồn là **loại tủ** (Điểm nhận lưới, Máy biến áp, Máy phát). Đối chiếu thực tế xong thì C3/C4 **Xác minh** từng tủ/lộ.

## Phần J — Đưa Đợt 2 lên THỬ (`ME_MayChu_THU`) — đã xong 15/10/2026

Đợt 2 thêm **10 sheet** (Kế hoạch bảo trì, Mẫu checklist, Phiếu bảo trì, Kết quả checklist, Phiếu sửa chữa, Việc con, Đề nghị vật tư, Dòng đề nghị, Lượng dùng, Giờ chạy). App chỉ bật Bảo trì/Sửa chữa/Công việc **sau khi chạy `migrateSchema`**; trước đó app mới vẫn chạy như Đợt 1 (các ô đó mờ "Sắp có").

1. Trang THỬ đã tự cập nhật app: mở <https://luongquangdao8386-ops.github.io/ME-thu/> → Ctrl+Shift+R → **Tài khoản → Thông tin**: Phiên bản app **1.0.0-d2.1**. Lúc này Bảo trì, Sửa chữa còn mờ "Sắp có" — đúng.
2. **Sao lưu THỬ trước:** Tài khoản → Quản trị → **Sao lưu ngay** → PIN → chờ dòng **Đã kiểm chứng**.
3. Mở link raw `https://raw.githubusercontent.com/luongquangdao8386-ops/ME/claude/upbeat-heisenberg-tdnmpa/apps-script/Code.gs` → Ctrl+A → Ctrl+C.
4. <https://script.google.com> → dự án **ME_MayChu_THU** → `Code.gs` → Ctrl+A → xóa → dán → **Lưu** (Ctrl+S).
5. Ô chọn hàm → **`migrateSchema`** → **Chạy**. Nhật ký: `migrateSchema xong. Thêm: MaintenancePlans; ChecklistTemplates; WorkOrders; … ; EquipmentPartEvents(old_material_id). schema_version=1.5.2` (thêm cả cài đặt `wo_generate_days_ahead` = 7: phiếu bảo trì sinh trước hạn 7 ngày). Chạy lại nhiều lần vẫn an toàn.
6. Chạy **`healthCheck`** → các dòng ĐẠT (trừ cảnh báo đã biết). Không cần cài lại trigger: trigger nhắc hạn hằng ngày và dịch bù 3 giờ/lần tự sinh phiếu bảo trì tới hạn.
7. **Triển khai** → **Quản lý bản triển khai** → bút chì → Phiên bản: **Phiên bản mới** → Mô tả `THỬ d2.1` → **Triển khai** (giữ nguyên link).
8. **Kiểm link:** cửa sổ ẩn danh → dán link `/exec` của THỬ, thêm `?action=system.health` → thấy `"ok":true`, `"app_id":"ME"`.
9. App THỬ: Ctrl+Shift+R (máy tính) / mở lại app (iPhone) → lưới 9 ô: **Bảo trì, Sửa chữa** sáng; nút **Công việc** dùng được. **Trạng thái hệ thống**: schema **1.5.2**, máy chủ **d2.1**.

## Phần K — Thử Đợt 2 trên THỬ — đã xong 15/10/2026

Dùng tài khoản mẫu (MAU-KT kỹ thuật, MAU-C3 trưởng bộ phận, NV001 quản trị). Người lập/làm/báo **không** tự nghiệm thu phiếu của mình — cần người khác cấp 3–4.

| Phần | Cách thử |
| --- | --- |
| Mẫu checklist | Bảo trì → **Mẫu checklist** → Thêm: 3 bước (Đạt/Không đạt; Số đo, đơn vị `bar`, giới hạn 6–8; Ghi nhận). Sửa mẫu → tạo **phiên bản 2**, phiếu cũ giữ bản cũ |
| Kế hoạch | Bảo trì → **Thêm kế hoạch**: theo tháng, ngày mốc hôm nay, checklist vừa tạo, người làm mặc định MAU-KT → phiếu **BT-yymm-001** tự sinh, đã giao việc |
| Làm phiếu (iPhone, MAU-KT) | **Công việc** → phiếu → **Bắt đầu làm** → tắt mạng → ghi checklist, số đo 9 bar (tự Không đạt) → bấm **Còn N mục chưa xong** (cuộn tới mục thiếu) → ghi chú, **Bây giờ** cho giờ kết thúc → **Gửi nghiệm thu** (chọn mức độ) → bật mạng → tự gửi; có phiếu sửa **SC-** cho mục không đạt |
| Nghiệm thu | MAU-C3 (hoặc NV001) mở **phiếu BT** (không phải phiếu SC; từ phiếu SC bấm dòng **Từ phiếu bảo trì**) → cuối khung Thực hiện **Nghiệm thu đạt** + PIN → Hoàn thành; kế hoạch có hạn kế tiếp. MAU-KT không có nút nghiệm thu |
| Báo sự cố | iPhone, tắt mạng → **Sửa chữa → Báo sự cố**: mức độ phải chọn (không chọn sẵn), tick Máy đang dừng, chụp ảnh → Gửi → bật mạng → đúng **1** phiếu SC, 1 ảnh (bấm Đồng bộ lại không tạo trùng) |
| Sửa chữa | Trước đó NV001 thêm 2–3 mã: **Tài khoản → Quản trị → Danh mục chung → Danh mục tra cứu → Nguyên nhân → Thêm**. Mở phiếu **SC-**, làm theo dòng **Bước tiếp** (ô xanh dưới các nút): NV001 **Phân công** cho MAU-KT → MAU-KT **Bắt đầu sửa** (khung Xử lý mới mở) → ghi chẩn đoán, nguyên nhân, việc con (bấm **Xong**), **Kết thúc sửa → Bây giờ**, chạy thử **Đạt**, **Hoạt động lại → Bây giờ** → **Lưu** → **Gửi nghiệm thu** → MAU-C3 mở phiếu → cuối khung Xử lý **Nghiệm thu đạt** + PIN → đủ **6 mốc** |
| Vật tư trên phiếu | Trong phiếu đang làm: **Đề nghị vật tư** (Lưu nháp → Gửi duyệt) → MAU-C3 **Duyệt** + PIN (ghi "Chưa kết nối kho", không trừ tồn); **Ghi thực dùng** → nghiệm thu kèm xác nhận lượng dùng. Kho vật tư → tab **Đề nghị**, **Lượng dùng** |
| Thay linh kiện | Phiếu đang làm → **Thay linh kiện** (cùng mã hoặc mã khác) → Thiết bị → tab Lịch sử có dòng Thay, kèm mã phiếu |
| Giờ chạy | Kế hoạch **theo giờ chạy** → **Ghi giờ chạy** tới mốc → phiếu tự sinh; ghi số nhỏ hơn lần trước bị chặn (trừ khi tick đồng hồ đã thay) |
| Excel | Bảo trì → **Nhập/xuất Excel** (Kế hoạch bảo trì và checklist): **Xuất Excel** → nhập lại nguyên tệp → "Không đổi (bỏ qua)". Sửa chữa → Excel (**Sự cố (lịch sử)**): MAU-KT tải mẫu, điền 2 dòng, **Gửi duyệt** → MAU-C3 **Nhập dữ liệu** + PIN |
| Tem QR | Kế hoạch, phiếu BT, phiếu SC → biểu tượng QR → In (THỬ chỉ in thử, không dán tem thật) |
| Công việc, trang chủ | Công việc: **Của tôi / Trong phạm vi**, nhóm Quá hạn · Hôm nay · Sắp tới · Chờ nghiệm thu; trang chủ web: bảng Công việc hôm nay có phiếu BT/SC, lịch tuần có phiếu BT |

Gặp lỗi: chụp màn hình (có mã phiếu, giờ) gửi Claude. Nháp mất mạng xem ở **Tài khoản → Nháp chờ đồng bộ**.

## Phần L — Phát hành Đợt 2 lên THẬT — đã xong 15/10/2026

1. Claude đưa đúng bản đã thử (nhánh `claude/upbeat-heisenberg-tdnmpa`, bản 1.0.0-d2.13 trở lên) lên nhánh `main` của repo `ME` → trang `/ME/` tự cập nhật app (vẫn chạy như Đợt 1 tới khi máy chủ THẬT chạy `migrateSchema`). Chờ 2–3 phút (tab **Actions** của repo `ME` xanh) rồi mới làm bước 5; ngay sau khi phát hành, trình duyệt có thể còn nhận tệp cũ — gặp màn lỗi thì bấm **Tải lại bản mới**.
2. App THẬT: **Tài khoản → Quản trị → Sao lưu ngay** → PIN → chờ **Đã kiểm chứng**.
3. Mở link raw `https://raw.githubusercontent.com/luongquangdao8386-ops/ME/main/apps-script/Code.gs` → Ctrl+A → Ctrl+C → <https://script.google.com> → dự án **`ME_MayChu_THAT`** → `Code.gs` → Ctrl+A → xóa → dán → **Lưu**.
4. Ô chọn hàm → **`migrateSchema`** → **Chạy** → Nhật ký có `schema_version=1.5.2`. Chạy **`healthCheck`** → các dòng ĐẠT (trừ cảnh báo đã biết).
5. **Triển khai → Quản lý bản triển khai → bút chì → Phiên bản: Phiên bản mới** → Mô tả `THẬT d2` → **Triển khai** (giữ nguyên link) → cửa sổ ẩn danh mở link `/exec` THẬT thêm `?action=system.health` → thấy `"ok":true`.
6. Mở `/ME/` → Ctrl+Shift+R → **Tài khoản**: phiên bản app đúng bản đã thử; **Trạng thái hệ thống**: schema **1.5.2**. Lưới 9 ô: Bảo trì, Sửa chữa sáng; nút Công việc dùng được.
7. Dữ liệu thật: **Danh mục chung → Danh mục tra cứu → Nguyên nhân** (mã nguyên nhân hỏng), **Mẫu checklist**, **Kế hoạch bảo trì** (hoặc nhập Excel "Kế hoạch bảo trì và checklist"), sự cố cũ (Excel "Sự cố (lịch sử)": người nhập gửi duyệt, người khác cấp 3–4 Nhập dữ liệu + PIN). Cấp vai trò **Kỹ thuật** / **Báo sự cố** cho người dùng cấp 2 (Tài khoản → Quản trị → Người dùng).

## Phần F — Dựng máy chủ THẬT (làm một lần)

**Điều kiện đã đủ (6.7 bước 0):** bảng quyền và từ điển nhãn đã duyệt (14/10/2026), nghiệm thu Đợt 1 đạt 65/65, đã diễn tập khôi phục trên THỬ.

**Chuẩn bị trên giấy hoặc tệp riêng trên máy (không gửi lên GitHub, không gửi Claude):**
- Owner: mã nhân viên thật, tên hiển thị, một **PIN tạm 6 số** (không 6 số giống nhau, không 123456/654321, không trùng 6 số cuối mã nhân viên).
- Danh sách người dùng: mã NV, tên, cấp (1 Tra cứu · 2 Nhân viên · 3 Trưởng bộ phận · 4 Quản trị), vai trò cấp 2 (Kỹ thuật, Đọc điện nước, Hợp đồng/Kiểm định, Thủ kho, Báo sự cố), email (chỉ người nhận thư nhắc hạn). Cần **ít nhất 3 người cấp 3–4** (owner + 1 quản trị dự phòng + 1 trưởng bộ phận): người tạo/nhập không tự duyệt, nên lô Excel kiểm định/hợp đồng và các phiếu duyệt cần người thứ hai, thứ ba.

1. Mở <https://script.google.com> → **Dự án mới**. Bấm tên "Dự án không có tiêu đề" → đặt **`ME_MayChu_THAT`** → Đổi tên.
2. **Cài đặt dự án** (bánh răng bên trái) → tick **Hiển thị tệp kê khai "appsscript.json" trong trình chỉnh sửa**.
3. **Trình chỉnh sửa** (`< >`) → mở `appsscript.json` → Ctrl+A → dán toàn bộ tệp `apps-script/appsscript.json` → Lưu (Ctrl+S).
4. Mở `Code.gs` → Ctrl+A → xóa → dán toàn bộ `apps-script/Code.gs` (bản **1.0.0-d1.21** trở lên; d1.22 chỉ khác số phiên bản) → Lưu.
5. **Cài đặt dự án** → **Thuộc tính tập lệnh** → **Thêm thuộc tính tập lệnh**: Thuộc tính `ENV`, Giá trị **`THAT`** (chữ in hoa) → **Lưu thuộc tính tập lệnh**. Thiếu bước này thì `setup` báo lỗi và không tạo gì.
6. Trình chỉnh sửa → ô chọn hàm → **`setup`** → **Chạy**. Lần đầu Google hỏi quyền: **Xem xét quyền** → chọn tài khoản M&E → **Nâng cao** → **Đi tới ME_MayChu_THAT (không an toàn)** → **Cho phép**. Nhật ký: `Xong setup. ENV=THAT. Đã tạo 31 sheet trong thư mục ME_HeThong…`. Drive có thư mục **`ME_HeThong`** (không có đuôi `_THU`).
7. Thuộc tính tập lệnh → thêm 3 thuộc tính: `SETUP_OWNER_CODE` = mã NV của owner, `SETUP_OWNER_NAME` = tên hiển thị, `SETUP_OWNER_TEMP_PIN` = PIN tạm 6 số → Lưu.
8. Chạy **`adminSetupOwner`** → Nhật ký: `Đã tạo owner … Đã xóa 3 khóa SETUP_OWNER_*`. (PIN tạm có hạn 72 giờ — làm Phần H trong 3 ngày; quá hạn thì xem "Owner quên PIN" ở cuối.)
9. Chạy **`installTriggers`** (3 trigger: nhắc hạn hằng ngày, dịch bù 3 giờ/lần, sao lưu hằng tuần).
10. Chạy **`healthCheck`**. Lúc này các dòng **CẢNH BÁO** sau là bình thường: `last_backup` (chưa sao lưu), `app_base_url` (chưa điền). Dòng `env: THAT` và `temp_props:` (trống) phải **ĐẠT**.
11. **Triển khai** → **Bản triển khai mới** → bánh răng **Chọn loại** → **Ứng dụng web** → Mô tả `THẬT d1.21` → Thực thi với: **Tôi** → Ai có quyền truy cập: **Bất kỳ ai** → **Triển khai** → **Sao chép** URL ứng dụng web (kết thúc bằng `/exec`).
12. **Kiểm link:** mở **cửa sổ ẩn danh** (Ctrl+Shift+N), dán link và thêm `?action=system.health` vào cuối → thấy `"ok":true` và `"app_id":"ME"`.
13. **Gửi Claude link `/exec` của THẬT** (chỉ link này; không gửi PIN, mật khẩu, mã SMS).

## Phần G — Tạo trang THỬ riêng (repo `ME-thu`)

Sau khi trang `/ME/` chuyển sang THẬT, THỬ chạy ở trang riêng này (để thử Đợt 2 mà không đụng THẬT).

1. GitHub → dấu **+** góc phải → **New repository** → Repository name **`ME-thu`** → **Public** → không tick README/.gitignore/license → **Create repository**.
2. Cho Claude quyền vào repo mới: mở <https://github.com/apps/claude/installations/select_target> → chọn tài khoản `luongquangdao8386-ops` → mục **Repository access**: nếu đang là **Only select repositories** thì **Select repositories** → thêm **`ME-thu`** → **Save**.
3. Báo Claude "đã tạo ME-thu" → Claude đẩy mã lên nhánh `main` của `ME-thu`.
4. Repo `ME-thu` → **Settings** → **Pages** → Source **Deploy from a branch** → Branch **`main`**, thư mục **/ (root)** → **Save**. Chờ 1–2 phút (tab **Actions** xanh).
5. Mở <https://luongquangdao8386-ops.github.io/ME-thu/> → đăng nhập bằng tài khoản THỬ (NV001) → đầu trang có nhãn **THỬ · 测试**.
6. Trong app THỬ: **Tài khoản → Quản trị → Trạng thái hệ thống** → Cấu hình `app_base_url` → **Sửa** → `https://luongquangdao8386-ops.github.io/ME-thu/` → lý do → PIN.
7. iPhone: Safari mở link `/ME-thu/` → đăng nhập → **Chia sẻ** → **Thêm vào MH chính** → tên **M&E THỬ** → Thêm.

## Phần H — Chuyển trang `/ME/` sang THẬT và cài đặt lần đầu

Làm sau khi Claude báo đã ghi link THẬT vào `config.js` và đưa bản THẬT lên nhánh `main` của repo `ME`.

**Bật trang THẬT**
1. Repo `ME` → **Settings** → **Pages** → Branch: **`main`**, **/ (root)** → **Save**. Chờ tab **Actions** hiện "pages build and deployment" xanh.
2. Máy tính: mở <https://luongquangdao8386-ops.github.io/ME/> → Ctrl+Shift+R. Màn Đăng nhập **không** có nhãn THỬ, **không** có mục "Máy chủ". Máy đã từng mở `/ME/` lúc còn là THỬ sẽ tự về màn Đăng nhập, kèm một trong các dòng "App đã chuyển sang máy chủ khác", "Dữ liệu đã được đặt lại" hoặc "Đăng nhập lại" — đúng; dữ liệu THỬ trên máy đó bị xóa khi đăng nhập tài khoản THẬT.
3. Đăng nhập bằng mã owner + PIN tạm (Phần F bước 7) → app bắt **đổi PIN** → đặt PIN mới, nhớ kỹ.

**Cài đặt trong app (owner, máy tính)** — các mục ở **Tài khoản → Quản trị · 管理** (cuối trang Tài khoản):
4. **Trạng thái hệ thống · 系统状态**: dòng Môi trường = **THAT**. Phần **Cấu hình**: `app_base_url` → **Sửa** → `https://luongquangdao8386-ops.github.io/ME/` (có `/` cuối) → lý do → PIN.
5. **Sao lưu · 备份** → **Sao lưu ngay · 立即备份** → PIN → chờ 1–5 phút có dòng **Đã kiểm chứng · 已校验**.
6. **Phân quyền · 权限**: bảng quyền THẬT là bảng mặc định đã duyệt. Nếu trên THỬ anh/chị đã sửa ô nào thì sửa giống ở đây.
7. **Người dùng · 用户** → **Thêm người dùng** theo danh sách đã chuẩn bị (cấp, vai trò, email). Mỗi người có **PIN tạm hiện một lần** (hạn 72 giờ): đưa trực tiếp cho người đó (không gửi nhóm chat), người đó đăng nhập và đổi PIN. Tạo trước **1 quản trị dự phòng (cấp 4)** và các trưởng bộ phận (cấp 3).
8. Chạy lại **Trạng thái hệ thống**: các dòng **Đạt** (trừ "Thư nhắc hạn gửi gần nhất" khi chưa có thư).

**Nhập dữ liệu thật** (Excel: nút **Nhập/xuất Excel** → **Tải mẫu** (mẫu trống) → điền → **Chọn tệp .xlsx để nhập** → xem trước → **Nhập dữ liệu** + PIN). Đúng thứ tự:
9. Ở **Tài khoản → Quản trị → Danh mục chung**: Thuật ngữ → Khu vực → Danh mục tra cứu (nhóm thiết bị, đơn vị tính…) → Nhà cung cấp. Rồi **Kho vật tư**: Vật tư. Rồi **Thiết bị**: Thiết bị (+ thông số) → Linh kiện theo máy. Rồi **Kiểm định**: Loại kiểm định → Yêu cầu kiểm định → Chứng nhận kiểm định. Cuối cùng **Hợp đồng**.
   - Nhập thử lô nhỏ (5–10 dòng) trước, mở vài hồ sơ kiểm tra, rồi mới nhập cả lô.
   - Lô **chứng nhận kiểm định** và lô **hợp đồng** có ngày/giá trị: người bấm **Nhập dữ liệu** phải **khác** người tải tệp lên (người thứ hai có cấp 3–4), vì bấm Nhập là duyệt.

**Tem QR, Gmail, iPhone**
10. **Tem thật:** chỉ in từ trang `/ME/`. In một tờ, **quét thử 3 tem mỗi loại** bằng nút **Quét QR** trong app, mở đúng hồ sơ rồi mới dán.
11. **Gmail:** **Người nhận Gmail** → thêm email → tick **Xác nhận** → PIN → **Bật gửi Gmail** → **Gửi thử**.
12. **iPhone mỗi người:** Safari mở `https://luongquangdao8386-ops.github.io/ME/` → đăng nhập → **Chia sẻ** → **Thêm vào MH chính** (tên **M&E**). Dùng nút **Quét QR** trong app (không dùng app Camera).

## Phần I — Cập nhật sau khi đã có THẬT

1. Mỗi phiên làm việc, Claude đẩy mã lên nhánh phiên của repo `ME` **và** lên repo `ME-thu` (trang THỬ tự cập nhật). Anh/chị dán `Code.gs` mới vào **`ME_MayChu_THU`** (Phần A) và thử trên `/ME-thu/`.
2. Thử xong, nói với Claude **"phát hành THẬT"** → Claude đưa đúng bản đó lên nhánh `main` của `ME` (trang `/ME/` tự cập nhật trên mọi máy).
3. Cùng lúc, dán **cùng bản** `Code.gs` vào **`ME_MayChu_THAT`** → nếu Claude dặn thì chạy `migrateSchema` → **Triển khai → Quản lý bản triển khai → bút chì → Phiên bản mới → Triển khai** (giữ nguyên link).
4. Không bao giờ dán vào THẬT một bản chưa thử trên THỬ. Pages của repo `ME` luôn để nhánh **`main`**, không đổi sang nhánh phiên nữa.

## Phần A — Cập nhật máy chủ THỬ (`ME_MayChu_THU`)

1. Mở <https://script.google.com> → dự án **ME_MayChu_THU** → **Trình chỉnh sửa** (`< >`).
2. Mở `Code.gs` → Ctrl+A → xóa → dán **toàn bộ** nội dung tệp `apps-script/Code.gs` mới → **Lưu** (Ctrl+S).
3. Ô chọn hàm → **`migrateSchema`** → **Chạy**. Nhật ký báo đã thêm cột/khóa còn thiếu (an toàn khi chạy nhiều lần).
4. Chọn **`installTriggers`** → **Chạy** (cài lại đúng 3 trigger: nhắc hạn hằng ngày, dịch bù 3 giờ/lần, sao lưu hằng tuần).
5. Chọn **`healthCheck`** → **Chạy** → đọc Nhật ký: mỗi dòng "ĐẠT" hoặc "CẢNH BÁO". Lúc này "Sao lưu gần nhất" và "Địa chỉ app trong email" còn cảnh báo — làm ở Phần C.
6. **Triển khai phiên bản mới, giữ nguyên link:** **Triển khai** → **Quản lý bản triển khai** → bút chì **Chỉnh sửa** → Phiên bản: **Phiên bản mới** → Mô tả `THỬ d1.21` → **Triển khai**.
7. **Kiểm link:** mở **cửa sổ ẩn danh**, dán link `/exec` và thêm `?action=system.health` vào cuối → thấy `"ok":true` và `"app_id":"ME"` là đạt.

> Dựng máy chủ mới từ đầu (THẬT hoặc THỬ mới): làm như Phần F; thuộc tính `ENV` (`THAT` hoặc `THU`) phải đặt **trước** khi chạy `setup`.

## Phần B — GitHub Pages

- Repo `ME`: từ Phần H, Pages để nhánh **`main`** (bản THẬT). Trước đó (THỬ ở `/ME/`) Pages để nhánh `claude/intelligent-gauss-y0z9b3`.
- Repo `ME-thu`: Pages để nhánh **`main`** (Phần G).
- Xem phiên bản đang chạy: **Tài khoản → Thông tin** (Phiên bản app, Phiên bản máy chủ). Máy còn bản cũ: kéo xuống làm mới (iPhone) hoặc Ctrl+Shift+R (máy tính).

## Phần C — Cài đặt lần đầu trong app THỬ (owner, trên máy tính)

Các mục quản trị nằm ở trang **Tài khoản**, kéo xuống dưới phần Bảo mật/Phiên đăng nhập và Hướng dẫn, trong thẻ **Quản trị · 管理** (ngay trên thẻ Thông tin).

1. **Tài khoản → Quản trị → Trạng thái hệ thống · 系统状态**, phần **Cấu hình · 系统设置**:
   - `app_base_url` → **Sửa** → địa chỉ trang THỬ (từ Phần G: `https://luongquangdao8386-ops.github.io/ME-thu/`, có dấu `/` cuối) → nhập lý do → PIN.
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
| Excel | Danh sách Thiết bị → **Nhập/xuất Excel** → **Xuất Excel** (không phải *Tải mẫu*) → sửa một ô Model trong tệp → **Chọn tệp .xlsx để nhập** → xem trước: **Cập nhật 1**, các dòng còn lại **Không đổi (bỏ qua)** → **Nhập dữ liệu** (PIN). Thử lỗi: xóa trống **cả** `name_vi` **và** `name_zh` của một dòng, hoặc gõ ngày `31/02/2026` → bảng lỗi theo dòng, không có nút Nhập → **Hủy lô**. (Chỉ xóa một tiếng thì hợp lệ: máy dịch lại tiếng còn thiếu.) |
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

- Không đưa lên GitHub: đặc tả, phụ lục, PDF bản vẽ, ảnh nhà máy gốc, link bảng tính, PIN, danh sách nhân viên, tệp Excel dữ liệu thật.
- Không chia sẻ thư mục `ME_HeThong`, `ME_HeThong_THU` hay các bảng tính cho ai. Thư mục sao lưu chỉ tài khoản M&E xem.
- Không gửi Claude PIN, mật khẩu, mã SMS. Chỉ gửi link `/exec` khi dựng máy chủ mới.
- Quên PIN: nhờ quản trị **Cấp PIN tạm** trong **Tài khoản → Quản trị → Người dùng**.
- **Owner quên PIN** (THẬT hoặc THỬ): trong app không ai được đặt lại PIN của owner. Người giữ tài khoản Google M&E mở dự án Apps Script → Thuộc tính tập lệnh → thêm `OWNER_RESET_TEMP_PIN` = PIN tạm 6 số → chạy **`adminResetOwnerPin`** → owner đăng nhập bằng PIN tạm (72 giờ) và đổi PIN. Khóa tự xóa sau khi chạy.
- Sau mọi lần đặt thuộc tính tạm, chạy `healthCheck`: dòng `temp_props` phải trống (ĐẠT). Ở THẬT không được để `TEST_TODAY`, `TEST_SESSION_SECONDS`, `TEST_MT_FAIL`.

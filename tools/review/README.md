# Bộ công cụ rà soát lỗi M&E

Dùng khi rà soát toàn app (không phải test chạy thường xuyên). Chạy từ thư mục gốc repo, máy có Node 22 + Playwright cài sẵn
(`mkdir -p node_modules && ln -sfn /opt/node22/lib/node_modules/playwright node_modules/playwright`), ESLint ở `/opt/node22/lib/node_modules/eslint`.
Kết quả ghi ra thư mục tạm (`$S` = scratchpad), không ghi vào repo. Sổ các lượt rà: `tools/review/LOG.md`.

| Việc | Lệnh | Đọc kết quả |
| --- | --- | --- |
| Biến/hàm chưa định nghĩa, import↔export, route lazy, nhãn thiếu | `node tools/review/globals.cjs $S/g.json` rồi `node tools/review/lint.cjs $PWD $S/g.json $S/lint.json` | `no-undef` trong Code.gs/js = lỗi thật (trừ `importScripts` ở qr-worker.js); `label-missing` dạng `x.y_` là nhãn ghép động |
| Bảng quyền ↔ hàm xử lý, mã lỗi song ngữ | xem `actions.mjs`/`codes.mjs` trong LOG (đoạn ngắn, viết lại khi cần) | 5 dòng chỉ-quyền/hoãn không có hàm là đúng |
| Quy tắc đồng bộ (ghi bảng phải tăng phiên bản) | `ME_SYNC_AUDIT=$S/a.jsonl node --test "tests/server/*.test.mjs"` | dòng `where: "in:…"` = lỗi thật; `between:` = test tự ghi sheet / migrateSchema thêm cột trống |
| Làm hỏng từng trường của request thật (≈30 000 lượt, ~20 phút) | `ME_MUT=$S/m.jsonl ME_MUT_COUNT=$S/mc.txt node --test "tests/server/*.test.mjs"` | mỗi dòng trong m.jsonl = ngoại lệ chưa bắt (INTERNAL_ERROR) kèm stack; một số test hỏng là bình thường |
| Request ngẫu nhiên sai vào mọi action | `ROUNDS=20 node tools/review/fuzz.mjs $S/fuzz.json` | `internal 0` là đạt |
| Mở mọi màn (87) × 6 cấp × iPhone/web | `node tools/review/crawl.mjs $S/crawl.json $S/shots` (~25 phút; `WHO=NV-001:604817 DEV=iphone` để chạy một lượt; `DEV=se,tab,tabweb` = 320 px, máy tính bảng 1024 px chạm / chuột) | chỉ `ERRBOX #/circuits/trace` và `#/print` (mở không tham số) là đúng thiết kế; `OVERFLOW` = tràn ngang |
| Biểu mẫu trống + mất mạng | `node tools/review/forms-offline.mjs $S/fo.json $S/shots2` | biểu mẫu mới phải `stay`, không `CREATED`; mất mạng không `CONSOLE`/`TIMEOUT` |
| App ↔ máy chủ tính kỳ điện nước | `node tools/review/parity.mjs` | `bad 0` |
| Lưu không đổi gì có gửi không | `node tools/review/noop.mjs` | `version N → N`, không `writes` |
| Excel xuất → nhập lại (máy chủ, mọi mẫu) | `node tools/review/excel-roundtrip.mjs` | `mẫu 16 lỗi 0` |
| Excel tệp .xlsx thật qua trình duyệt (mọi mẫu) | `node tools/review/excel-ui.mjs $S/xl` | `mẫu 14 lỗi 0` |
| Giả lập 16 tháng sinh phiếu bảo trì | `node tools/review/time-sim.mjs` (~5 phút) | mọi kế hoạch `ĐẠT`, `lỗi làm phiếu 0` |
| Chữ quá dài vào từng trường (> 50 000 ký tự/ô Sheets) | `ME_MUT=$S/l.jsonl ME_MUT_LONG=60000 node --test "tests/server/*.test.mjs"` (~1 phút) | không có tệp l.jsonl = không lỗi máy chủ |
| Dữ liệu lớn (1 000 thiết bị, 5 000 phiếu × 10 bước, 20 000 chỉ số) | `node tools/review/bigdata.mjs` (~2 phút; `EQ= WO= RES= METERS= DAYS= PAGE=` đổi cỡ) | `sai 0`, `lỗi máy chủ 0`; số trang bootstrap, cỡ trang |
| Báo cáo 9 mẫu × 0 / vài / 600–2 100 dòng | `node tools/review/reports.mjs` | `lỗi 0`; > 500 dòng PDF báo `PDF_TOO_MANY_ROWS` là đúng |
| Quyền trên giao diện: bấm mọi nút theo vai trò | `node tools/review/clickall.mjs $S/click.json` (~30–60 phút; chia `WHO=` chạy song song; `ROUTES=/repairs` thu hẹp) | không có `FORBIDDEN` / `INTERNAL_ERROR` / `CONSOLE` |
| Hai người sửa cùng hồ sơ (10 biểu mẫu + nút thao tác) | `node tools/review/conflicts.mjs` | mọi dòng `ĐẠT`, `lỗi 0` |
| Hàng chờ offline (gộp, rớt mạng giữa chừng, mất phản hồi, xung đột, đổi người) | `node tools/review/queue-sim.mjs` | `lỗi 0` |

Móc giả lập ở `tests/review-hooks.mjs` (mặc định tắt). Khi thêm biểu mẫu sửa mới: gọi `sameAsRecord` (js/form.js) trước khi gửi.

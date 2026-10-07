# M&E · 机电管理

App quản lý cơ điện: Google Sheets + Apps Script (máy chủ) + PWA trên GitHub Pages (iPhone và máy tính).
Giao diện luôn song ngữ Việt · 中文. Đăng nhập bằng mã nhân viên + PIN 6 số.

**Trạng thái:** Đợt 1 — Bước 0 (PoC), phiên bản `1.0.0-poc.1`. Chỉ dùng với dữ liệu mẫu.

## Cấu trúc

| Thư mục | Nội dung |
| --- | --- |
| `index.html`, `config.js`, `sw.js`, `manifest.webmanifest`, `css/`, `js/` | App tĩnh (GitHub Pages, phạm vi `/ME/`) |
| `assets/` | Logo 57 (SVG, icon 180/192/512), ảnh nền đã thu nhỏ |
| `vendor/` | Thư viện cố định phiên bản (jsQR, qrcode-generator) — xem `vendor/README.md` |
| `server/src/` | Mã máy chủ theo mô-đun |
| `apps-script/` | `Code.gs` (tạo bằng `npm run build`) và `appsscript.json` để dán vào Apps Script |
| `tests/` | Giả lập Apps Script cho Node, test máy chủ, test giao diện Playwright |
| `tools/` | Ghép `Code.gs`, quét bí mật trước khi push |

## Lệnh

```
npm install          # chỉ cần cho test giao diện (Playwright)
npm run build        # ghép server/src → apps-script/Code.gs, kiểm phiên bản khớp
npm test             # test máy chủ
npm run test:ui      # test giao diện 390×844 và 1440×900
node tools/scan-secrets.mjs
```

Triển khai: xem `HUONG_DAN_TRIEN_KHAI.md`.

## Quy ước

- Không commit đặc tả, bản vẽ, ảnh nhà máy gốc, ID bảng tính, dữ liệu, PIN, khóa bí mật. Bí mật nằm trong Thuộc tính tập lệnh của Apps Script.
- Mọi tên lưu trữ trình duyệt có tiền tố `me` (IndexedDB `me_*`, Cache `me-*`, localStorage `me.*`) vì có thể chung origin với app khác.
- Logo 57 chỉ ở biểu tượng iPhone, màn đăng nhập và trang chủ.

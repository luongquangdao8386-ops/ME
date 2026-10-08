# Thư viện cố định trong repo

Không tải từ CDN (phụ lục 1.5 mục 2.4). Mỗi thư viện giữ nguyên tệp phát hành gốc.

| Tệp | Thư viện | Phiên bản | Giấy phép | Nguồn |
| --- | --- | --- | --- | --- |
| `jsQR-1.4.0.js` | jsQR (giải mã QR khi không có BarcodeDetector) | 1.4.0 | Apache-2.0 (`jsQR-1.4.0.LICENSE`) | npm `jsqr@1.4.0`, `dist/jsQR.js` |
| `qrcode-generator-2.0.4.mjs` | QR Code Generator (in tem QR) | 2.0.4 | MIT (ghi ở đầu tệp) | npm `qrcode-generator@2.0.4`, `dist/qrcode.mjs` |
| `xlsx-0.20.3.full.min.js` | SheetJS Community Edition (đọc/ghi Excel, có bảng mã ký tự) | 0.20.3 | Apache-2.0 (`xlsx-0.20.3.LICENSE`) | `cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` (không có trên npm chính thức; khớp từng byte với npm `@e965/xlsx@0.20.3`). SHA-256 `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`, kiểm ở `tests/vendor/xlsx.test.mjs` |

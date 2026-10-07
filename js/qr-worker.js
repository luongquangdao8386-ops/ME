// Giải mã QR bằng jsQR trong Web Worker (khi không có BarcodeDetector hỗ trợ qr_code)
/* global jsQR */
importScripts('../vendor/jsQR-1.4.0.js');
self.onmessage = (e) => {
  const { data, width, height } = e.data;
  let out = null;
  try {
    const r = jsQR(new Uint8ClampedArray(data), width, height, { inversionAttempts: 'attemptBoth' });
    out = r ? r.data : null;
  } catch (err) { out = null; }
  self.postMessage(out);
};

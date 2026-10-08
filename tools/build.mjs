// Ghép server/src/*.js thành apps-script/Code.gs (một tệp để dán vào trình soạn Apps Script)
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'server', 'src');
const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const header = `/**
 * M&E · 机电管理 — Code.gs ${pkg.version}
 * TỆP TẠO TỰ ĐỘNG từ server/src/*.js bằng "npm run build". Không sửa tay.
 * Dán toàn bộ nội dung vào tệp Code.gs của dự án Apps Script M&E.
 * Không chứa ID, khóa bí mật hay dữ liệu: các giá trị đó nằm trong Thuộc tính tập lệnh.
 */
`;
// Từ điển nhãn (phụ lục 1.5 mục 5.3): một nguồn i18n/labels.json → js/dict.js (app) và LABELS trong Code.gs (email, Excel)
const labels = JSON.parse(fs.readFileSync(path.join(root, 'i18n', 'labels.json'), 'utf8'));
delete labels._comment;
const TONES = ['green', 'amber', 'red', 'navy', 'grey'];
for (const [k, v] of Object.entries(labels)) {
  if (!Array.isArray(v) || v.length < 2 || v.length > 3 || typeof v[0] !== 'string' || typeof v[1] !== 'string' || !v[0].trim() || !v[1].trim()) {
    console.error(`Nhãn thiếu một thứ tiếng: ${k}`); process.exit(1);
  }
  if (v[2] && !TONES.includes(v[2])) { console.error(`Màu nhãn lạ: ${k} = ${v[2]}`); process.exit(1); }
  if (/mạch điện|Kho linh kiện|备件库/.test(v[0] + v[1])) { console.error(`Chữ bị cấm theo C1: ${k}`); process.exit(1); }
}
const dictSrc = `// TỆP TẠO TỰ ĐỘNG từ i18n/labels.json bằng "npm run build". Không sửa tay.\n` +
  `// Mỗi khóa: [Việt, 中文, màu?] (phụ lục 1.5 mục 5.3)\nexport const DICT = ${JSON.stringify(labels, null, 0).replace(/\],"/g, '],\n"')};\n`;
const dictPath = path.join(root, 'js', 'dict.js');
if (!fs.existsSync(dictPath) || fs.readFileSync(dictPath, 'utf8') !== dictSrc) fs.writeFileSync(dictPath, dictSrc);
const body = files.map((f) => `\n// ===== ${f} =====\n` + fs.readFileSync(path.join(srcDir, f), 'utf8')).join('') +
  `\n// ===== i18n/labels.json =====\n/** Bản chép từ điển nhãn của app (5.3) cho email, Excel, lời báo */\nvar LABELS = ${JSON.stringify(labels)};\n`;
const out = header + body;
fs.writeFileSync(path.join(root, 'apps-script', 'Code.gs'), out);

const manifest = {
  timeZone: 'Asia/Ho_Chi_Minh',
  dependencies: {},
  exceptionLogging: 'STACKDRIVER',
  runtimeVersion: 'V8',
  webapp: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' }
};
fs.writeFileSync(path.join(root, 'apps-script', 'appsscript.json'), JSON.stringify(manifest, null, 2) + '\n');
// Phiên bản phải khớp ở 4 nơi (máy chủ, config.js, Service Worker, package.json)
const ver = pkg.version;
const checks = {
  'server/src/00_config.js': /SERVER_VERSION = '([^']+)'/,
  'config.js': /BUILD_VERSION: '([^']+)'/,
  'sw.js': /const VERSION = '([^']+)'/
};
for (const [f, re] of Object.entries(checks)) {
  const m = re.exec(fs.readFileSync(path.join(root, f), 'utf8'));
  if (!m || m[1] !== ver) { console.error(`Phiên bản lệch: ${f} = ${m && m[1]}, package.json = ${ver}`); process.exit(1); }
}
// Mã băm nội dung vỏ app → tên cache của Service Worker đổi mỗi khi bất kỳ tệp nào đổi (thiết bị nhận bản mới)
const swPath = path.join(root, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
const listSrc = /const FILES = \[([\s\S]*?)\];/.exec(sw)[1];
const shellFiles = [...listSrc.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((f) => f !== './');
const h = crypto.createHash('sha256');
for (const f of shellFiles) {
  const fp = path.join(root, f);
  if (!fs.existsSync(fp)) { console.error(`sw.js liệt kê tệp không có: ${f}`); process.exit(1); }
  h.update(f + '\0');
  h.update(fs.readFileSync(fp));
}
const hash = h.digest('hex').slice(0, 12);
const sw2 = sw.replace(/const BUILD_HASH = '[^']*';/, `const BUILD_HASH = '${hash}';`);
if (sw2 !== sw) fs.writeFileSync(swPath, sw2);
console.log(`Code.gs: ${files.length} tệp, ${out.length} ký tự · phiên bản ${ver} · vỏ app ${hash}`);

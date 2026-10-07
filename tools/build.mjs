// Ghép server/src/*.js thành apps-script/Code.gs (một tệp để dán vào trình soạn Apps Script)
import fs from 'node:fs';
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
const body = files.map((f) => `\n// ===== ${f} =====\n` + fs.readFileSync(path.join(srcDir, f), 'utf8')).join('');
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
console.log(`Code.gs: ${files.length} tệp, ${out.length} ký tự`);

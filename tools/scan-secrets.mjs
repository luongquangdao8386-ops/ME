// Quét tệp sắp commit tìm thứ không được lên repo public (phụ lục 1.5 mục 2.4)
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const files = execSync('git ls-files -co --exclude-standard', { encoding: 'utf8' }).split('\n').filter(Boolean)
  .filter((f) => !f.startsWith('node_modules/') && !f.startsWith('vendor/') && !/\.(png|jpg|jpeg|webp|ico)$/.test(f));
const rules = [
  [/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,}/, 'ID spreadsheet'],
  [/drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]{20,}/, 'ID thư mục Drive'],
  [/[A-Za-z0-9._%+-]+@gmail\.com/, 'địa chỉ Gmail'],
  [/script\.google\.com\/macros\/s\/AKfy[A-Za-z0-9_-]{20,}/, 'link /exec (chỉ được ở config.js)'],
  [/(PIN_PEPPER_V\d|TOKEN_SECRET_V\d)\s*[:=]\s*['"][A-Za-z0-9+\/=]{40,}['"]/, 'khóa bí mật'],
  [/\.pdf$|\.xlsx$|factory-original/i, 'tệp cấm']
];
const allowExec = new Set(['config.js']);
let bad = 0;
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const text = fs.readFileSync(f, 'utf8');
  for (const [re, what] of rules) {
    if (what === 'link /exec (chỉ được ở config.js)' && allowExec.has(f)) continue;
    if (what === 'tệp cấm' ? re.test(f) : re.test(text)) { console.log(`✗ ${f}: ${what}`); bad++; }
  }
}
if (bad) { console.log(`Có ${bad} vấn đề — không push.`); process.exit(1); }
console.log(`Quét ${files.length} tệp: không thấy bí mật/ID/tệp cấm.`);

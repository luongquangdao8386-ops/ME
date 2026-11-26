// Cách chạy: tools/review/README.md
// Rà soát tĩnh M&E: ESLint (no-undef, biến không dùng, lỗi logic hay gặp) cho Code.gs + js/**; import/export; route lazy; nhãn bi()
const fs = require('fs');
const path = require('path');
const { Linter } = require('/opt/node22/lib/node_modules/eslint');
const ROOT = process.argv[2];
const linter = new Linter({ configType: 'flat' });
const RULES = {
  'no-undef': 'error', 'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }], 'no-redeclare': 'error', 'no-dupe-keys': 'error',
  'no-unreachable': 'error', 'no-self-assign': 'error', 'no-dupe-else-if': 'error', 'no-cond-assign': ['error', 'except-parens'], 'no-fallthrough': 'warn',
  'use-isnan': 'error', 'valid-typeof': 'error', 'no-sparse-arrays': 'error', 'no-unsafe-finally': 'error', 'no-loss-of-precision': 'error',
  'no-dupe-args': 'error', 'no-duplicate-case': 'error', 'no-func-assign': 'error', 'no-import-assign': 'error', 'no-const-assign': 'error',
  'no-unsafe-negation': 'error', 'no-compare-neg-zero': 'error', 'no-self-compare': 'error', 'no-unmodified-loop-condition': 'warn',
  'no-constant-binary-expression': 'error', 'no-unused-private-class-members': 'warn', 'no-shadow-restricted-names': 'error',
  'no-useless-backreference': 'error', 'no-misleading-character-class': 'error', 'no-empty-character-class': 'error', 'no-invalid-regexp': 'error',
  'no-control-regex': 'off', 'no-async-promise-executor': 'error', 'require-yield': 'error', 'getter-return': 'error', 'no-setter-return': 'error',
  'array-callback-return': ['warn', { checkForEach: false }], 'no-promise-executor-return': 'warn', 'no-template-curly-in-string': 'warn'
};
const GAS = ['SpreadsheetApp', 'DriveApp', 'DocumentApp', 'Utilities', 'CacheService', 'LockService', 'PropertiesService', 'ScriptApp', 'Session',
  'MailApp', 'GmailApp', 'LanguageApp', 'ContentService', 'HtmlService', 'Logger', 'console', 'Drive', 'UrlFetchApp', 'XmlService', 'Charts', 'DataStudioApp'];
const out = [];
function lint(file, code, sourceType, globals) {
  const g = {}; globals.forEach((n) => { g[n] = 'readonly'; });
  const msgs = linter.verify(code, [{ languageOptions: { ecmaVersion: 2022, sourceType, globals: g }, rules: RULES }], { filename: file });
  msgs.forEach((m) => out.push({ file, line: m.line, rule: m.ruleId, msg: m.message, sev: m.severity }));
}
// Máy chủ
const gs = fs.readFileSync(path.join(ROOT, 'apps-script/Code.gs'), 'utf8');
lint('Code.js', gs, 'script', GAS);
// App
const jsFiles = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) jsFiles.push(p); } })(path.join(ROOT, 'js'));
const BROWSER = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
for (const f of jsFiles) {
  const code = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  const isModule = /^\s*(import|export)\s/m.test(code);
  lint(rel, code, isModule ? 'module' : 'script', BROWSER.concat(['ME_CONFIG', 'jsQR', 'XLSX', 'qrcode']));
}
// import/export
const exportsOf = {};
function exps(file) {
  if (exportsOf[file]) return exportsOf[file];
  const code = fs.readFileSync(file, 'utf8');
  const s = new Set();
  for (const m of code.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) s.add(m[1]);
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(',').map((x) => x.trim()).filter(Boolean).forEach((x) => { const p = x.split(/\s+as\s+/); s.add((p[1] || p[0]).trim()); });
  if (/export\s+default/.test(code)) s.add('default');
  return (exportsOf[file] = s);
}
for (const f of jsFiles) {
  const code = fs.readFileSync(f, 'utf8');
  for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const target = path.resolve(path.dirname(f), m[2]);
    if (!fs.existsSync(target)) { out.push({ file: path.relative(ROOT, f), rule: 'import-missing-file', msg: m[2], sev: 2 }); continue; }
    if (!/\.js$/.test(target)) continue;
    const e = exps(target);
    m[1].split(',').map((x) => x.trim()).filter(Boolean).forEach((x) => { const n = x.split(/\s+as\s+/)[0].trim(); if (!e.has(n)) out.push({ file: path.relative(ROOT, f), rule: 'import-missing-export', msg: `${n} from ${m[2]}`, sev: 2 }); });
  }
  // lazy('./pages/x.js', 'fn') và import('./x.js') … m.fn
  for (const m of code.matchAll(/lazy\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)) {
    const target = path.resolve(path.dirname(f), m[1]);
    if (!fs.existsSync(target) || !exps(target).has(m[2])) out.push({ file: path.relative(ROOT, f), rule: 'lazy-missing', msg: `${m[2]} in ${m[1]}`, sev: 2 });
  }
}
// Nhãn
const labels = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n/labels.json'), 'utf8'));
const miss = new Map();
for (const f of jsFiles) {
  const code = fs.readFileSync(f, 'utf8');
  for (const m of code.matchAll(/\b(?:bi|biText|badge|biPair|pairOf|label)\(\s*'([a-z0-9_]+(?:\.[A-Za-z0-9_]+)+)'/g)) if (!labels[m[1]]) miss.set(m[1], path.relative(ROOT, f));
}
for (const m of gs.matchAll(/\b(?:lbl_|label_|LABELS\[)\(?\s*'([a-z0-9_]+(?:\.[A-Za-z0-9_]+)+)'/g)) if (!labels[m[1]]) miss.set(m[1], 'Code.gs');
miss.forEach((f, k) => out.push({ file: f, rule: 'label-missing', msg: k, sev: 2 }));
fs.writeFileSync(process.argv[4], JSON.stringify(out, null, 1));
const by = {};
out.forEach((o) => { by[o.rule] = (by[o.rule] || 0) + 1; });
console.log(JSON.stringify(by, null, 1));

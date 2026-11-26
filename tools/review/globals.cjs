// Lấy danh sách biến toàn cục của Chromium cho lint.cjs. Cách chạy: tools/review/README.md
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const names = await p.evaluate(() => { const s = new Set(); let o = window; while (o) { Object.getOwnPropertyNames(o).forEach((n) => s.add(n)); o = Object.getPrototypeOf(o); } return [...s].filter((n) => /^[A-Za-z_$][\w$]*$/.test(n)); });
  require('fs').writeFileSync(process.argv[2], JSON.stringify(names.concat(['self', 'caches', 'clients', 'registration', 'skipWaiting'])));
  await b.close();
  console.log(names.length);
})();

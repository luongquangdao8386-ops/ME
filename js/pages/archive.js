// d4.27: Tài khoản → Quản trị → Lưu trữ theo năm (Quản trị). Chuyển dữ liệu phát sinh cũ (chỉ số đồng hồ, ảnh chỉ số, nhật ký thao tác,
// thao tác đã xong, dòng nhập Excel) của năm đã kết thúc sang tệp lưu trữ trên Drive để app không chậm dần; giữ nguyên danh mục, thiết bị,
// tem QR, kế hoạch, phiếu (lý lịch máy). Máy chủ tự sao lưu trước, chạy theo bước (app gọi archive.step tới khi xong).
import { bi, esc, api, fmtDate, fmtDateTime, fmtNumber, resMsg, session } from '../core.js';
import { toast, dialog, $, $$ } from '../ui.js';
import { writeWithPin, busy } from '../form.js';

const TABLES = [['MeterReadings', 'arc.t.readings'], ['Documents', 'arc.t.photos'], ['AuditLogs', 'arc.t.audit'], ['Operations', 'arc.t.ops'], ['ImportRows', 'arc.t.import']];
const PHASES = ['BACKUP', 'SUMMARY', 'READINGS', 'PHOTOS', 'AUDIT', 'OPERATIONS', 'IMPORT_ROWS', 'DONE'];
let running = false;

const countsHtml = (c, moved) => `<div class="table-wrap"><table class="tbl arc-tbl"><tbody>${TABLES.map(([k, l]) => `<tr><td>${bi(l)}</td><td class="num"><strong>${fmtNumber((moved ? moved[k] : c[k]) || 0)}</strong></td></tr>`).join('')}</tbody></table></div>`;

function progressHtml(run) {
  const at = PHASES.indexOf(run.phase);
  const failed = run.phase === 'FAILED';
  return `<section class="card arc-run" id="arc-run"><h2>${bi('arc.run_title', { Y: run.year })}</h2>
    <ol class="arc-steps">${PHASES.slice(0, -1).map((p, i) => {
      const st = run.phase === 'DONE' || i < at ? 'done' : (i === at ? 'now' : 'todo');
      return `<li class="arc-${st}"><span class="arc-dot">${st === 'done' ? '✓' : (st === 'now' && !failed ? '…' : '')}</span>${bi('arc.phase.' + p)}${run.moved && run.moved[{ READINGS: 'MeterReadings', PHOTOS: 'Documents', AUDIT: 'AuditLogs', OPERATIONS: 'Operations', IMPORT_ROWS: 'ImportRows' }[p]] !== undefined ? ` <span class="muted small">${fmtNumber(run.moved[{ READINGS: 'MeterReadings', PHOTOS: 'Documents', AUDIT: 'AuditLogs', OPERATIONS: 'Operations', IMPORT_ROWS: 'ImportRows' }[p]])}</span>` : ''}</li>`;
    }).join('')}</ol>
    ${failed ? `<p class="banner warn">${bi('arc.failed')}<br><span class="muted small">${esc(run.error || '')}</span></p><div class="row"><button type="button" class="btn small primary" data-arc-year="${esc(run.year)}">${bi('arc.retry')}</button></div>`
    : (run.phase === 'DONE' ? `<p class="banner ok">${bi('arc.done', { Y: run.year })}</p>${run.file_url ? `<a class="btn small" href="${esc(run.file_url)}" target="_blank" rel="noopener">${bi('arc.open_file')}</a>` : ''}`
      : `<p class="muted small">${bi('arc.running_hint')}</p>${running ? '' : `<div class="row"><button type="button" class="btn small primary" id="arc-continue">${bi('arc.continue')}</button></div>`}`)}
  </section>`;
}

export async function renderArchive(view, { shell }) {
  shell.setScreen({ title: 'arc.title', back: '/account' });
  if (!navigator.onLine) { view.innerHTML = `<div class="card">${bi('sync.need_network')}</div>`; return; }
  view.innerHTML = '<div class="card"><div class="spinner small"></div></div>';
  const r = await api('archive.view', {}, { retry: true, timeoutMs: (session.settings.client_long_timeout_seconds || 55) * 1000 });
  if (!r.ok) { view.innerHTML = `<div class="card"><p class="banner warn">${esc(resMsg(r))}</p></div>`; return; }
  const d = r.data;
  const run = d.run && d.run.phase !== 'DONE' ? d.run : null;
  view.innerHTML = `<section class="card"><h2>${bi('arc.title')}</h2>
      <p>${bi('arc.intro')}</p>
      <div class="arc-cols"><div><h3>${bi('arc.moves')}</h3><ul class="small">${['arc.m1', 'arc.m2', 'arc.m3'].map((k) => `<li>${bi(k)}</li>`).join('')}</ul></div>
        <div><h3>${bi('arc.keeps')}</h3><ul class="small">${['arc.k1', 'arc.k2', 'arc.k3'].map((k) => `<li>${bi(k)}</li>`).join('')}</ul></div></div>
      <p class="muted small">${bi('arc.when')}</p><p class="muted small">${bi('arc.after')}</p></section>
    ${run ? progressHtml(run) : ''}
    <section class="card"><h2>${bi('arc.years')}</h2>
      ${d.years.length ? d.years.map((y) => `<div class="arc-year"><div class="row arc-year-head"><strong>${bi('arc.year_n', { Y: y.year })}</strong>
          ${y.allowed ? `<button type="button" class="btn small primary" data-arc-year="${y.year}" ${run ? 'disabled' : ''}>${bi('arc.start', { Y: y.year })}</button>` : `<span class="muted small">${bi('arc.from', { D: fmtDate(y.allowed_from) })}</span>`}</div>
          ${countsHtml(y.counts)}<p class="muted small">${bi('arc.kept_note', { N: fmtNumber(y.counts.readings_kept || 0) })}</p></div>`).join('')
    : `<p class="muted">${bi('arc.none', { Y: d.next_year, D: fmtDate(d.next_allowed_from) })}</p>`}
    </section>
    <section class="card"><h2>${bi('arc.archived')}</h2>
      ${d.archives.length ? d.archives.map((a) => `<div class="arc-year"><div class="row arc-year-head"><strong>${bi('arc.year_n', { Y: a.year })}</strong>
          <span class="muted small">${esc(fmtDateTime(a.at))}${a.by_name ? ' · ' + esc(a.by_name) : ''}</span>
          ${a.file_url ? `<a class="btn small" href="${esc(a.file_url)}" target="_blank" rel="noopener">${bi('arc.open_file')}</a>` : ''}</div>
          ${countsHtml({}, a.moved || {})}</div>`).join('') + `<p class="muted small">${bi('arc.file_hint')}</p>` : `<p class="muted">${bi('arc.archived_none')}</p>`}
    </section>`;
  const again = () => renderArchive(view, { shell });
  $$('[data-arc-year]', view).forEach((b) => b.addEventListener('click', async () => {
    const Y = Number(b.dataset.arcYear);
    const yes = await dialog({ title: bi('arc.confirm_title', { Y }), body: `<p>${bi('arc.confirm_body', { Y })}</p>`,
      actions: [{ label: bi('btn.cancel'), value: null }, { label: bi('arc.start', { Y }), kind: 'primary', value: true }] });
    if (!yes) return;
    busy(b, true);
    const s = await writeWithPin('archive.start', { year: Y });
    busy(b, false);
    if (!s.ok) { if (s.code !== 'REAUTH_REQUIRED') toast(esc(resMsg(s) + ((s.errors || [])[0] ? ' — ' + (s.errors[0].message_vi || s.errors[0].code) : '')), 'err'); return; }
    await drive(view, s.data.run);
    again();
  }));
  const cont = $('#arc-continue', view);
  if (cont) cont.addEventListener('click', async () => { await drive(view, run); again(); });
}

/** Gọi archive.step tới khi xong/lỗi; vẽ tiến độ sau mỗi lượt. Mất phản hồi (lượt sao lưu lâu) → chờ rồi hỏi lại */
async function drive(view, run) {
  running = true;
  let cur = run, miss = 0;
  const paint = () => {
    const box = $('#arc-run', view);
    const html = progressHtml(cur);
    if (box) box.outerHTML = html; else view.insertAdjacentHTML('afterbegin', html);
  };
  try {
    paint();
    while (cur.phase !== 'DONE' && cur.phase !== 'FAILED') {
      const r = await api('archive.step', {}, { timeoutMs: (session.settings.client_long_timeout_seconds || 55) * 1000 });
      if (r.ok && r.data && r.data.run) {
        cur = r.data.run; miss = 0; paint();
        if (r.data.busy) await new Promise((ok) => setTimeout(ok, 5000)); // máy chủ còn đang chạy lượt trước
        continue;
      }
      if (++miss > 20) { toast(esc(resMsg(r)), 'err'); break; }
      await new Promise((ok) => setTimeout(ok, 5000));
    }
  } finally { running = false; }
  if (cur.phase === 'DONE') toast(bi('arc.done', { Y: cur.year }), 'ok');
  else if (cur.phase === 'FAILED') toast(bi('arc.failed'), 'err');
}


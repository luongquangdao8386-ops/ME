// Khung app sau đăng nhập (không logo, 1.4 §3.5): header C2, nav 5 nút iPhone (1.4 §3.2), menu trái web (1.4 §3.7)
import { bi, biText, esc, fmtDate, fmtDateTime, session, badge, L } from './core.js';
import { ICON, h, $, $$, toast } from './ui.js';
import { isIosSafariTab } from './auth.js';

export const RELEASED_DOT = 1;

/** 9 mục theo từ điển 3.4, đúng thứ tự lưới 3 × 3 của HOME-01 */
export const MODULES = [
  { key: 'equipment', icon: 'equipment', path: '/equipment', dot: 1 },
  { key: 'maintenance', icon: 'maintenance', path: '/maintenance', dot: 2 },
  { key: 'repairs', icon: 'repairs', path: '/repairs', dot: 2 },
  { key: 'warehouse', icon: 'warehouse', path: '/materials', dot: 1 },
  { key: 'utilities', icon: 'utilities', path: '/utilities', dot: 3 },
  { key: 'reports', icon: 'reports', path: '/reports', dot: 3 },
  { key: 'circuits', icon: 'circuits', path: '/circuits', dot: 3 },
  { key: 'contracts', icon: 'contracts', path: '/contracts', dot: 1 },
  { key: 'inspections', icon: 'inspections', path: '/inspections', dot: 1 }
];
const NAV = [
  { key: 'home', label: 'nav.home', icon: 'home', path: '/', dot: 1 },
  { key: 'work', label: 'nav.work', icon: 'work', path: '/work', dot: 2 },
  { key: 'scan', label: 'nav.scan', icon: 'scan', dot: 1 },
  { key: 'alerts', label: 'nav.alerts', icon: 'bell', path: '/alerts', dot: 1 },
  { key: 'account', label: 'nav.account', icon: 'user', path: '/account', dot: 1 }
];

export const isWide = () => window.matchMedia('(min-width: 900px)').matches;

/** Chạm vào phần thuộc đợt sau: chỉ báo, không chuyển màn (6.6) */
export function comingSoon() { toast(bi('tag.coming_soon_hint')); }

function soonTag() { return `<span class="soon">${bi('tag.coming_soon')}</span>`; }

function sideItem(it, label) {
  const soon = it.dot > RELEASED_DOT;
  if (soon) {
    return `<button type="button" class="side-item dim" aria-disabled="true" data-soon="1" data-nav="${it.key}">${ICON[it.icon]}<span class="side-label">${bi(label)}${soonTag()}</span></button>`;
  }
  return `<a class="side-item" href="#${it.path}" data-nav="${it.key}">${ICON[it.icon]}<span class="side-label">${bi(label)}</span></a>`;
}

/**
 * Dựng khung. opts: {env, onScan}. Trả API {view, setScreen, setActive, setSync, setOffline}
 */
export function mountShell(root, { env, onScan }) {
  const el = h(`<div class="app">
    <aside class="side" aria-label="${esc(biText('menu.title'))}">
      <div class="side-title">${bi('menu.title')}</div>
      <nav class="side-nav">
        ${sideItem(NAV[0], 'nav.home')}
        ${MODULES.map((m) => sideItem(m, 'module.' + m.key)).join('')}
        <hr>
        ${sideItem(NAV[1], 'nav.work')}${sideItem(NAV[3], 'nav.alerts')}${sideItem(NAV[4], 'nav.account')}
      </nav>
      <button type="button" class="scan-btn side-scan" id="side-scan">${ICON.scan}<span>${bi('nav.scan')}</span></button>
    </aside>
    <div class="frame">
      <header class="hdr">
        <button type="button" class="icon-btn hdr-back" id="hdr-back" aria-label="${esc(biText('btn.back'))}" hidden>${ICON.back}</button>
        <h1 class="hdr-title" id="hdr-title"></h1>
        ${env === 'THU' ? `<span class="tag env">${bi('tag.env_test')}</span>` : ''}
        <span class="hdr-space"></span>
        <div class="hdr-actions" id="hdr-actions"></div>
        <button type="button" class="hdr-status" id="hdr-status"></button>
      </header>
      <div class="strip offline" id="st-offline" hidden>${ICON.wifiOff}<span id="st-offline-text"></span></div>
      ${isIosSafariTab() ? `<div class="strip warn" id="st-safari"><span>${bi('sync.safari_tab')}</span></div>` : ''}
      <div class="strip warn" id="st-session" hidden></div>
      <main class="view" id="view"></main>
    </div>
    <nav class="bnav" aria-label="${esc(biText('menu.title'))}">
      ${NAV.map((n) => {
        if (n.key === 'scan') return `<button type="button" class="bnav-item bnav-scan" id="bnav-scan"><span class="bnav-scan-box">${ICON.scan}</span><span class="bnav-label">${bi(n.label)}</span></button>`;
        const soon = n.dot > RELEASED_DOT;
        return `<button type="button" class="bnav-item${soon ? ' dim' : ''}" data-nav="${n.key}" ${soon ? 'aria-disabled="true" data-soon="1"' : `data-path="${n.path}"`}>${ICON[n.icon]}<span class="bnav-label">${bi(n.label)}</span>${soon ? soonTag() : ''}</button>`;
      }).join('')}
    </nav>
  </div>`);
  root.replaceChildren(el);
  const view = $('#view', el);
  let backTarget = null, onBack = null;

  el.addEventListener('click', (e) => {
    const soon = e.target.closest('[data-soon]');
    if (soon) { e.preventDefault(); comingSoon(); return; }
    const nb = e.target.closest('.bnav-item[data-path]');
    if (nb) { e.preventDefault(); import('./router.js').then((r) => r.navigate(nb.dataset.path)); }
  });
  $('#bnav-scan', el).addEventListener('click', () => onScan && onScan());
  $('#side-scan', el).addEventListener('click', () => onScan && onScan());
  $('#hdr-back', el).addEventListener('click', () => { if (onBack) onBack(backTarget); });
  $('#hdr-status', el).addEventListener('click', () => import('./router.js').then((r) => r.navigate('/account')));

  const api = {
    root: el,
    view,
    /** title: khóa từ điển hoặc cặp [vi, zh]; back: đường dẫn màn cha (null = không có nút); actions: [{icon, label, onClick, id, disabled}] */
    setScreen({ title, back = null, actions = [], home = false, wide = false }) {
      el.classList.toggle('is-home', !!home);
      el.classList.toggle('is-wide-page', !!wide);
      const pair = Array.isArray(title) ? title : (L[title] || [String(title), '']);
      $('#hdr-title', el).innerHTML = `<span class="vi">${esc(pair[0])}</span><span class="sep"> · </span><span class="zh">${esc(pair[1] || '')}</span>`;
      document.title = pair[0] ? `${pair[0]} · ${pair[1] || ''}` : 'M&E';
      backTarget = back;
      $('#hdr-back', el).hidden = back === null;
      const box = $('#hdr-actions', el);
      box.innerHTML = '';
      actions.slice(0, 2).forEach((a) => {
        const b = h(`<button type="button" class="icon-btn" ${a.id ? `id="${a.id}"` : ''} aria-label="${esc(a.label)}" title="${esc(a.label)}">${ICON[a.icon] || ''}</button>`);
        if (a.disabled) b.disabled = true;
        b.addEventListener('click', a.onClick);
        box.appendChild(b);
      });
      view.scrollTop = 0;
      window.scrollTo(0, 0);
    },
    setBackHandler(fn) { onBack = fn; },
    setActive(key) {
      $$('[data-nav]', el).forEach((x) => x.classList.toggle('active', x.dataset.nav === key));
    },
    /** Trạng thái đồng bộ ở góc phải header (web) */
    setSync({ offline, lastSync, queued = 0, problems = 0 }) {
      const u = session.user || {};
      const lvl = Number(u.role_level) || 0;
      $('#hdr-status', el).innerHTML = `<span class="pill ${offline ? 't-red' : 't-green'}">${offline ? ICON.wifiOff : ICON.sync}<span>${bi(offline ? 'sync.offline' : 'sync.online')}</span></span>
        <span class="hdr-sync muted">${bi('sync.last')}: ${esc(fmtDateTime(lastSync) || '—')}${queued ? ` · ${bi('sync.queued_count', { N: queued })}` : ''}${problems ? ` · <span class="t-red-text">${bi('sync.failed')} ${problems}</span>` : ''}</span>
        <span class="hdr-user"><strong>${esc(u.display_name || '')}</strong> ${lvl ? badge('level.' + lvl) : ''}</span>`;
      const strip = $('#st-offline', el);
      strip.hidden = !offline;
      $('#st-offline-text', el).innerHTML = `${bi('sync.offline')} — ${bi('sync.last')}: ${esc(fmtDateTime(lastSync) || '—')}`;
    },
    /** Dải "Phiên sắp hết hạn" (2.5) từ session_warn_days ngày trước hạn */
    setSessionWarn(expiresAt, onRelogin) {
      const s = $('#st-session', el);
      const warnDays = Number(session.settings.session_warn_days || 3);
      const t = Date.parse(expiresAt || '');
      if (!t || t - Date.now() > warnDays * 86400000) { s.hidden = true; return; }
      s.hidden = false;
      s.innerHTML = `<span>${bi('auth.session_warn', { D: fmtDate(expiresAt) })}</span><button type="button" class="btn tiny" id="st-relogin">${bi('btn.relogin')}</button>`;
      $('#st-relogin', s).addEventListener('click', onRelogin);
    }
  };
  return api;
}

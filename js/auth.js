// Đăng nhập, đổi PIN, mở khóa ngoại tuyến, đăng xuất (phụ lục 1.5 mục 2.5, 3.6, 3.8)
import { api, session, idb, ls, ss, bytesToB64, b64ToBytes, deviceInfo } from './core.js';

const SALT_BYTES = 16;

export function isIosSafariTab() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && window.navigator.standalone === false;
}
export function isSharedDevice() { return ls.get('shared_device') === '1'; }

export function deviceLabel() {
  const d = deviceInfo();
  return `${d.platform} · ${d.standalone ? 'Màn hình chính' : d.browser}`;
}

/* ---------------- PIN yếu (3.5), kiểm sớm ở app; máy chủ kiểm lại ---------------- */
export function pinWeakReason(pin, employeeCode, currentPin) {
  if (!/^\d{6}$/.test(pin)) return 'pin_format';
  if (/^(\d)\1{5}$/.test(pin)) return 'pin_weak';
  if ('0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'pin_weak';
  const digits = String(employeeCode || '').replace(/\D/g, '');
  if (digits && pin === (digits.length >= 6 ? digits.slice(-6) : digits.padStart(6, '0'))) return 'pin_weak';
  if (currentPin && pin === currentPin) return 'pin_weak';
  return null;
}

/* ---------------- Lưu phiên ---------------- */
export async function loadSession() {
  let s = null;
  if (isSharedDevice()) {
    try { s = JSON.parse(ss.get('session') || 'null'); } catch (e) { s = null; }
  } else {
    s = await idb.get('me_auth', 'kv', 'session').catch(() => null);
  }
  if (s && s.token) {
    session.token = s.token; session.epoch = s.epoch; session.user = s.user; session.kind = s.kind; session.expires_at = s.expires_at;
  }
  return s;
}

async function saveSession(data, epoch) {
  const s = { token: data.token, expires_at: data.expires_at, kind: data.session_kind, epoch, user: data.user, saved_at: Date.now() };
  session.token = s.token; session.epoch = epoch; session.user = s.user; session.kind = s.kind; session.expires_at = s.expires_at;
  if (isSharedDevice()) ss.set('session', JSON.stringify(s));
  else await idb.put('me_auth', 'kv', 'session', s);
}

export async function clearSession() {
  session.token = null; session.user = null; session.kind = null; session.reauth = null;
  ss.del('session');
  await idb.del('me_auth', 'kv', 'session').catch(() => {});
}

/* ---------------- Verifier PBKDF2 cho mở khóa ngoại tuyến ---------------- */
export async function pbkdf2(pin, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function createVerifier(pin, user, expiresAt) {
  if (isSharedDevice() || isIosSafariTab()) return false;
  const iterations = Number(session.settings.offline_pbkdf2_iterations || ls.get('pbkdf2_iterations') || 200000);
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const v = await pbkdf2(pin, salt, iterations);
  await idb.put('me_auth', 'kv', 'verifier', {
    user_id: user.user_id, employee_code: user.employee_code, display_name: user.display_name,
    verifier: bytesToB64(v), local_salt: bytesToB64(salt), iterations, session_expires_at: expiresAt,
    failed_count: 0, locked_until: 0, lockout_count: 0
  });
  return true;
}

export function getVerifier() {
  return idb.get('me_auth', 'kv', 'verifier').catch(() => null);
}

export async function clearVerifier() {
  await idb.del('me_auth', 'kv', 'verifier').catch(() => {});
}

/** Mở khóa ngoại tuyến. Trả {ok, expired, locked_minutes, attempts_left, wiped} */
export async function offlineUnlock(pin) {
  const v = await getVerifier();
  if (!v) return { ok: false, wiped: true };
  const now = Date.now();
  if (v.locked_until && v.locked_until > now) return { ok: false, locked_minutes: Math.ceil((v.locked_until - now) / 60000) };
  const got = await pbkdf2(pin, b64ToBytes(v.local_salt), v.iterations);
  const want = b64ToBytes(v.verifier);
  let diff = got.length ^ want.length;
  for (let i = 0; i < Math.max(got.length, want.length); i++) diff |= (got[i] || 0) ^ (want[i] || 0);
  const maxTry = Number(session.settings.offline_unlock_attempts || 5);
  const lockMin = Number(session.settings.offline_lock_minutes || 15);
  const maxLockouts = Number(session.settings.offline_max_lockouts || 3);
  if (diff === 0) {
    v.failed_count = 0; v.lockout_count = 0; v.locked_until = 0;
    await idb.put('me_auth', 'kv', 'verifier', v);
    const expired = v.session_expires_at && Date.parse(v.session_expires_at) <= now;
    return { ok: true, expired, verifier: v };
  }
  v.failed_count = (v.failed_count || 0) + 1;
  if (v.failed_count >= maxTry) {
    v.failed_count = 0;
    v.lockout_count = (v.lockout_count || 0) + 1;
    v.locked_until = now + lockMin * 60000;
    if (v.lockout_count >= maxLockouts) {
      await clearVerifier();
      await clearSession();
      return { ok: false, wiped: true };
    }
    await idb.put('me_auth', 'kv', 'verifier', v);
    return { ok: false, locked_minutes: lockMin };
  }
  await idb.put('me_auth', 'kv', 'verifier', v);
  return { ok: false, attempts_left: maxTry - v.failed_count };
}

/* ---------------- Đăng nhập, đổi PIN, hỏi lại PIN, đăng xuất ---------------- */

/** Dữ liệu nghiệp vụ của người dùng cũ bị xóa khi người khác đăng nhập (2.5); nháp giữ lại */
async function clearUserData() {
  await idb.clear('me_data', 'records').catch(() => {});
  await idb.clear('me_data', 'meta').catch(() => {});
  await idb.clear('me_files', 'files').catch(() => {});
}

export async function login(code, pin, shared) {
  if (shared) ls.set('shared_device', '1'); else ls.del('shared_device');
  const r = await api('auth.login', { employee_code: code, pin, device_label: deviceLabel() }, { token: null, epoch: null });
  if (r.ok || r.code === 'MUST_CHANGE_PIN') {
    const prev = await getVerifier();
    const prevSession = await idb.get('me_auth', 'kv', 'session').catch(() => null);
    const prevUser = (prev && prev.user_id) || (prevSession && prevSession.user && prevSession.user.user_id);
    if (prevUser && prevUser !== r.data.user.user_id) { await clearUserData(); await clearVerifier(); }
    await saveSession(r.data, r.dataset_epoch);
    if (r.ok) {
      try { await createVerifier(pin, r.data.user, r.data.expires_at); } catch (e) { /* không chặn đăng nhập */ }
      if (!isSharedDevice() && navigator.storage && navigator.storage.persist) {
        try { ls.set('persist_granted', String(await navigator.storage.persist())); } catch (e) { /* bỏ qua */ }
      }
    }
  }
  return r;
}

export async function changePin(currentPin, newPin) {
  const r = await api('pin.change', { current_pin: currentPin, new_pin: newPin });
  if (r.ok) {
    await saveSession(r.data, r.dataset_epoch || session.epoch);
    try { await createVerifier(newPin, r.data.user, r.data.expires_at); } catch (e) { /* bỏ qua */ }
  }
  return r;
}

export async function reauth(pin) {
  const r = await api('auth.reauth', { pin });
  if (r.ok) session.reauth = r.data.reauth_token;
  return r;
}

export async function logout() {
  const tok = session.token;
  if (tok) {
    if (navigator.onLine) {
      const r = await api('auth.logout');
      if (!r.ok && r.code === 'NETWORK_ERROR') await idb.put('me_auth', 'kv', 'pending_logout', { token: tok, epoch: session.epoch });
    } else {
      await idb.put('me_auth', 'kv', 'pending_logout', { token: tok, epoch: session.epoch });
    }
  }
  await clearSession();
  await clearVerifier();
  await clearUserData();
}

/** Gọi auth.logout cho phiên chờ thu hồi khi có mạng lại */
export async function flushPendingLogout() {
  const p = await idb.get('me_auth', 'kv', 'pending_logout').catch(() => null);
  if (!p || !navigator.onLine) return;
  const r = await api('auth.logout', {}, { token: p.token, epoch: p.epoch });
  if (r.ok || (r.code && r.code !== 'NETWORK_ERROR')) await idb.del('me_auth', 'kv', 'pending_logout');
}

/** Xử lý AUTH_REQUIRED REVOKED/AUTH_VERSION: xóa token, verifier, cache; giữ nháp (2.5) */
export async function handleRevoked() {
  await clearSession();
  await clearVerifier();
  await clearUserData();
}

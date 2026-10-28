// d4.12: cửa chỉ-đọc danh sách thiết bị cho app Checksheet (feed.equipment, khóa bằng mã kết nối)
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshServer, ownerClient, makeClient, uuid } from '../helpers.mjs';

function feedReq(env, key, extra = {}) {
  env.g.dbReset_();
  return env.post({ api_contract_version: '1.0', action: 'feed.equipment', payload: { key, ...extra }, device_id: uuid(), app_version: '1.0.0-d1.1' });
}

test('feed.equipment: chưa có mã / sai mã → FORBIDDEN; đúng mã → khu vực + thiết bị (không giá); since_rev không đổi → unchanged', () => {
  const env = freshServer();
  const owner = ownerClient(env);
  assert.equal(feedReq(env, 'x'.repeat(30)).code, 'FORBIDDEN');
  env.g.adminCreateFeedKey();
  const key = env.props.getProperty('FEED_KEY_CS');
  assert.ok(key && key.length >= 40);
  assert.match(env.logs.join('\n'), new RegExp(key));
  // chạy lại không đổi mã
  env.g.adminCreateFeedKey();
  assert.equal(env.props.getProperty('FEED_KEY_CS'), key);
  assert.equal(feedReq(env, key.slice(0, -1) + 'A').code, 'FORBIDDEN');
  // Khu vực + thiết bị
  const loc = uuid();
  let r = owner.write('location.edit', { location_id: loc, location_code: 'KV-A', name_vi: 'Xưởng A', type: 'WORKSHOP' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const eq = uuid();
  r = owner.write('equipment.create', { equipment_id: eq, name_vi: 'Máy nén khí 01', location_id: loc, model: 'GA30', status: 'RUNNING' });
  assert.equal(r.ok, true, JSON.stringify(r));
  r = feedReq(env, key);
  assert.equal(r.ok, true, JSON.stringify(r));
  const e = r.data.equipment.find((x) => x.equipment_id === eq);
  assert.equal(e.equipment_code, 'TB-0001');
  assert.equal(e.location_id, loc);
  assert.equal(e.status, 'RUNNING');
  assert.match(e.qr_key, /^[0-9A-HJKMNP-TV-Z]{20}$/);
  assert.equal(e.archived, false);
  assert.ok(!('vendor_id' in e) && !('owner_user_id' in e));
  assert.equal(r.data.locations.find((x) => x.location_id === loc).location_code, 'KV-A');
  const rev = r.data.rev;
  const r2 = feedReq(env, key, { since_rev: rev });
  assert.deepEqual(r2.data, { unchanged: true, rev });
  // Sửa thiết bị → rev đổi
  owner.write('equipment.edit', { equipment_id: eq, name_vi: 'Máy nén khí số 1' }, { expected_version: 1 });
  const r3 = feedReq(env, key, { since_rev: rev });
  assert.notEqual(r3.data.rev, rev);
  assert.equal(r3.data.equipment.find((x) => x.equipment_id === eq).name_vi, 'Máy nén khí số 1');
});

test('feed.equipment không theo phiên bản app M&E tối thiểu; healthCheck báo đã nối', () => {
  const env = freshServer();
  ownerClient(env);
  env.g.adminCreateFeedKey();
  const key = env.props.getProperty('FEED_KEY_CS');
  env.g.dbReset_();
  env.g.withWriteLock_(() => env.g.writeSetting_('min_client_version', '9.0.0', 'TEST'));
  env.cache.clear && env.cache.clear();
  env.g.dbReset_();
  env.g.cache_().remove('cfg:settings');
  assert.equal(feedReq(env, key).ok, true);
  const c = makeClient(env);
  assert.equal(c.login('NV-001', '358024').code, 'CLIENT_UPDATE_REQUIRED');
  env.g.dbReset_();
  assert.equal(env.g.healthRows_().find((x) => x.key === 'checksheet_feed').value, 'ON');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldStore } from './world-store.mjs';
import { AuthStore } from './auth-store.mjs';
import { createWorldServer } from './http-server.mjs';
import { request as httpRequest } from 'node:http';

test('verified identity binds guest progress once and restores the same life across devices', () => {
  const store = new WorldStore();
  const guest = store.createSession('Khách một');
  const original = store.execute(guest.token, { operationId: 'investigate', lifeId: guest.snapshot.life.id, action: { type: 'investigate', payload: {} } });
  const linked = store.linkVerifiedAccount('verified-user-1', 'Đạo hiệu Gmail', guest.token);
  assert.equal(linked.account.id, original.account.id);
  assert.equal(linked.life.id, original.life.id);
  assert.deepEqual(linked.account.journal, original.account.journal);
  assert.equal(linked.account.verified, true);
  assert.equal(linked.account.verifiedUserId, undefined);
  assert.equal(store.linkVerifiedAccount('verified-user-1', 'Đạo hiệu Gmail', guest.token).life.id, original.life.id);
  assert.throws(() => store.snapshot(guest.token), error => error.status === 401);
  const secondGuest = store.createSession('Khách hai');
  assert.throws(() => store.linkVerifiedAccount('verified-user-1', 'Tên mới', secondGuest.token), { code: 'WORLD_LINK_CONFLICT' });
  const resumed = store.linkVerifiedAccount('verified-user-1', 'Tên mới');
  assert.equal(resumed.life.id, original.life.id);
  assert.equal(store.snapshot(secondGuest.token).life.id, secondGuest.snapshot.life.id);
  assert.throws(() => store.linkVerifiedAccount('verified-user-2', 'Không được chiếm', guest.token), error => error.status === 401);
  assert.throws(() => store.snapshotForUser('unknown-user'), error => error.status === 401);
  assert.throws(() => store.linkVerifiedAccount('verified-user-1', 'Tên mới', { toString: 'bad' }), { code: 'INVALID_GUEST_TOKEN' });
  assert.equal(store.snapshotForUser('verified-user-1').life.id, original.life.id);
});

test('verified binding and command idempotency persist without importing client world balances', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cotienlo-linked-'));
  const filePath = join(directory, 'world.json');
  try {
    let store = new WorldStore({ filePath });
    const first = store.linkVerifiedAccount('verified-user-1', 'Người đi đường');
    const request = { operationId: 'known-command', lifeId: first.life.id, action: { type: 'investigate', payload: { stones: 99999 } } };
    const result = store.executeForUser('verified-user-1', request);
    store = new WorldStore({ filePath });
    const restored = store.linkVerifiedAccount('verified-user-1', 'Người đi đường');
    assert.equal(restored.account.id, first.account.id);
    assert.equal(restored.life.stones, 20);
    assert.equal(store.executeForUser('verified-user-1', request).account.journal.length, result.account.journal.length);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('HTTP linked world requires a live verified auth session and logout revokes world access', async t => {
  let now = 1_000_000;
  let code;
  const auth = new AuthStore({ filePath: null, now: () => now, mailer: (_email, otp) => { code = otp; } });
  const world = new WorldStore({ now: () => now });
  const server = createWorldServer({ store: world, authStore: auth, checkpointIntervalMs: 0 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, token) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const get = token => fetch(base + '/api/world', { headers: { Authorization: `Bearer ${token}` } });
  const guest = world.createSession('Khách đã chơi');
  await auth.sendOtp('linked.player@gmail.com');
  const session = auth.verifyOtp('linked.player@gmail.com', code, { name: 'Người đã xác minh' });
  const link = await post('/api/auth/world-session', { guestToken: guest.token, userId: 'forged-id', stones: 99999 }, session.token);
  assert.equal(link.status, 200);
  const data = await link.json();
  assert.equal(data.token, session.token);
  assert.equal(data.snapshot.life.id, guest.snapshot.life.id);
  assert.equal(data.snapshot.life.stones, 20);
  assert.equal((await get(session.token)).status, 200);
  assert.equal((await get(guest.token)).status, 401);
  const invalid = await post('/api/auth/world-session', {}, guest.token);
  assert.equal(invalid.status, 401);
  auth.logout(session.token);
  assert.equal((await get(session.token)).status, 401);
  now += 60_001;
  await auth.sendOtp('linked.player@gmail.com', 'login');
  const otherDevice = auth.verifyOtp('linked.player@gmail.com', code);
  const resumed = await post('/api/auth/world-session', {}, otherDevice.token);
  assert.equal((await resumed.json()).snapshot.life.id, guest.snapshot.life.id);
  now += 31 * 24 * 60 * 60 * 1000;
  assert.equal((await get(otherDevice.token)).status, 401);
});

test('verified-only servers reject guest play while allowing proof-based migration of an existing guest', async t => {
  let code;
  const auth = new AuthStore({ filePath: null, mailer: (_email, otp) => { code = otp; } });
  const world = new WorldStore();
  const guest = world.createSession('Bản cũ');
  const server = createWorldServer({ store: world, authStore: auth, requireVerifiedWorld: true, checkpointIntervalMs: 0 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const anonymous = await fetch(base + '/api/world/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Khách rác' }) });
  assert.equal(anonymous.status, 403);
  assert.equal((await fetch(base + '/api/world', { headers: { Authorization: `Bearer ${guest.token}` } })).status, 401);
  await auth.sendOtp('migrate@gmail.com');
  const session = auth.verifyOtp('migrate@gmail.com', code, { name: 'Người thật' });
  const linked = await fetch(base + '/api/auth/world-session', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ guestToken: guest.token }) });
  assert.equal(linked.status, 200);
  assert.equal((await linked.json()).snapshot.life.id, guest.snapshot.life.id);
  assert.equal((await fetch(base + '/api/world', { headers: { Authorization: `Bearer ${session.token}` } })).status, 200);
});

test('a session revoked or expired while the body streams cannot link or read a world', { timeout: 5000 }, async t => {
  let time = 1_000_000;
  let code;
  const auth = new AuthStore({ filePath: null, now: () => time, mailer: (_email, otp) => { code = otp; } });
  const world = new WorldStore();
  const server = createWorldServer({ store: world, authStore: auth, checkpointIntervalMs: 0 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  for (const mode of ['logout', 'expiry']) {
    const email = `${mode}@gmail.com`;
    await auth.sendOtp(email);
    const session = auth.verifyOtp(email, code, { name: mode });
    let client;
    const started = new Promise(resolve => server.once('request', incoming => incoming.once('data', resolve)));
    const completed = new Promise((resolve, reject) => {
      client = httpRequest(`http://127.0.0.1:${server.address().port}/api/auth/world-session`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      }, response => { response.resume(); response.once('end', () => resolve(response.statusCode)); });
      client.once('error', reject);
    });
    client.write('{');
    await started;
    if (mode === 'logout') auth.logout(session.token);
    else time += 31 * 24 * 60 * 60 * 1000;
    client.end('}');
    assert.equal(await completed, 401, mode);
    assert.throws(() => world.snapshotForUser(session.user.id), { code: 'UNAUTHORIZED' });
  }
});

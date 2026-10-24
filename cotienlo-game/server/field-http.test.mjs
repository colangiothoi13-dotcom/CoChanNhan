import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldStore } from './world-store.mjs';
import { AuthStore } from './auth-store.mjs';
import { createWorldServer } from './http-server.mjs';

async function serverFor(t, options = {}) {
  const server = createWorldServer({ checkpointIntervalMs: 0, simulationIntervalMs: 0, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = token => fetch(base + '/api/world/field', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const input = (token, body) => fetch(base + '/api/world/field/input', { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { get, input };
}

test('field HTTP authenticates inputs, preserves acknowledgement and never accepts uploaded balances', async t => {
  let time = 1_000_000;
  const store = new WorldStore({ now: () => time, randomIndex: () => 0 });
  const session = store.createSession('Khách Ngũ Vực');
  const { get, input } = await serverFor(t, { store, authStore: new AuthStore({ filePath: null, mailer: null }) });
  assert.equal((await get()).status, 401);
  const first = await (await get(session.token)).json();
  assert.equal(first.lifeId, session.snapshot.life.id);
  const command = { lifeId: first.lifeId, seq: 1, move: { x: -1, y: 0 }, aimAngle: 0, action: 'moonlight' };
  time += 100;
  const response = await input(session.token, command); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.seq, 1); assert.equal(result.mp, 44); assert.equal(result.actionResult.code, 'GU_REQUIRED');
  const replay = await (await input(session.token, command)).json(); assert.equal(replay.mp, 44);
  assert.equal((await input(session.token, { ...command, seq: 2, hp: 999, stones: 999 })).status, 400);
  assert.equal((await input(session.token, { ...command, seq: 2, lifeId: 'other-life' })).status, 409);
  assert.equal(JSON.stringify(result).includes(session.token), false);
  assert.equal(JSON.stringify(result).includes('tokenHash'), false);
});

test('verified-only field access requires a live Gmail session and revokes the previous guest capability', async t => {
  let time = 1_000_000, code;
  const authStore = new AuthStore({ filePath: null, now: () => time, mailer: (_email, otp) => { code = otp; } });
  const store = new WorldStore({ now: () => time, randomIndex: () => 0 });
  const guest = store.createSession('Khách cũ');
  await authStore.sendOtp('field.player@gmail.com');
  const auth = authStore.verifyOtp('field.player@gmail.com', code, { name: 'Người Gmail' });
  const linked = store.linkVerifiedAccount(auth.user.id, auth.user.name, guest.token);
  const { get, input } = await serverFor(t, { store, authStore, requireVerifiedWorld: true });
  assert.equal((await get(guest.token)).status, 401);
  const response = await get(auth.token); assert.equal(response.status, 200);
  assert.equal((await response.json()).lifeId, linked.life.id);
  authStore.logout(auth.token);
  assert.equal((await get(auth.token)).status, 401);
  assert.equal((await input(auth.token, { lifeId: linked.life.id, seq: 1, move: { x: 0, y: 0 }, aimAngle: 0, action: 'attack' })).status, 401);
});

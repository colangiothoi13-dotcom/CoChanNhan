import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WorldStore } from './world-store.mjs';
import { AuthStore } from './auth-store.mjs';
import { createWorldServer } from './http-server.mjs';

async function serverFor(t, options = {}) {
  const server = createWorldServer({ store: new WorldStore({ randomIndex: () => 0 }), authStore: new AuthStore({ filePath: null, mailer: null }), ...options });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, token, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: JSON.stringify(body) });
  return { server, base, post };
}

test('HTTP authenticates private snapshots and serializes structured failures', async t => {
  const { base, post } = await serverFor(t);
  assert.equal((await fetch(base + '/api/world/health')).status, 200);
  const missing = await fetch(base + '/api/world');
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).code, 'UNAUTHORIZED');
  const joined = await post('/api/world/session', { name: 'Lan' });
  assert.equal(joined.status, 201);
  const session = await joined.json();
  assert.equal(session.snapshot.catalog.places.length, 30);
  const response = await fetch(base + '/api/world', { headers: { Authorization: `Bearer ${session.token}` } });
  assert.equal(response.status, 200);
  const publicText = await response.text();
  assert.equal(publicText.includes(session.token), false);
  assert.equal(publicText.includes('effect'), false);
  const request = { operationId: 'work', lifeId: session.snapshot.life.id, action: { type: 'work', payload: {} } };
  const first = await (await post('/api/world/command', request, session.token)).json();
  const replay = await (await post('/api/world/command', request, session.token)).json();
  assert.equal(first.life.stones, 28);
  assert.equal(replay.life.stones, 28);
  const stale = await post('/api/world/command', { ...request, operationId: 'stale', lifeId: 'stolen-id' }, session.token);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, 'STALE_LIFE');
  const method = await fetch(base + '/api/world', { method: 'DELETE' });
  assert.equal(method.status, 405);
});

test('HTTP bounds JSON bytes, rejects malformed payloads and checks Android CORS origins', async t => {
  const { base, post } = await serverFor(t);
  const huge = await post('/api/world/session', { name: 'a'.repeat(17_000) });
  assert.equal(huge.status, 413);
  assert.equal((await huge.json()).code, 'BODY_TOO_LARGE');
  const malformed = await fetch(base + '/api/world/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, 'INVALID_JSON');
  const primitive = await post('/api/world/session', null);
  assert.equal(primitive.status, 400);
  const allowed = await fetch(base + '/api/world/command', { method: 'OPTIONS', headers: { Origin: 'https://appassets.androidplatform.net', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://appassets.androidplatform.net');
  const forbidden = await post('/api/world/session', { name: 'Bad' }, undefined, { Origin: 'https://evil.example' });
  assert.equal(forbidden.status, 403);
});

test('CORS permits loopback development ports while rejecting deceptive and external origins', async t => {
  const { base } = await serverFor(t);
  for (const origin of ['http://127.0.0.1:5174', 'http://localhost:5175', 'https://localhost:8443', 'https://127.0.0.1:9443']) {
    const result = await fetch(base + '/api/world/command', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } });
    assert.equal(result.status, 204, origin);
    assert.equal(result.headers.get('access-control-allow-origin'), origin);
  }
  for (const origin of ['http://localhost.evil:5174', 'http://127.0.0.1.evil:5174', 'http://evil.example:5174', 'http://localhost:5174/evil', 'http://evil@localhost:5174', 'null']) {
    const result = await fetch(base + '/api/world/command', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } });
    assert.equal(result.status, 403, origin);
    assert.equal(result.headers.get('access-control-allow-origin'), null);
  }
});

test('HTTP safely serves dist assets, HEAD and SPA fallback without exposing outside files', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'world-http-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const staticDir = join(dir, 'dist'); mkdirSync(staticDir);
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>World</title>');
  writeFileSync(join(staticDir, 'app.js'), 'console.log("world")');
  writeFileSync(join(dir, 'secret.txt'), 'PRIVATE');
  writeFileSync(join(staticDir, '.env'), 'SECRET');
  const { base } = await serverFor(t, { staticDir });
  const home = await fetch(base + '/'); assert.equal(home.status, 200); assert.match(await home.text(), /World/);
  const js = await fetch(base + '/app.js'); assert.match(js.headers.get('content-type'), /javascript/); assert.match(await js.text(), /world/);
  const head = await fetch(base + '/app.js', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  const spa = await fetch(base + '/adventure'); assert.equal(spa.status, 200);
  for (const path of ['/%2e%2e%5csecret.txt', '/.env', '/%00', '/api/world/nope', '/missing.js']) {
    const result = await fetch(base + path); assert.ok(result.status >= 400, path); assert.equal((await result.text()).includes('PRIVATE'), false);
  }
  const outside = join(dir, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'secret.txt'), 'PRIVATE');
  symlinkSync(outside, join(staticDir, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await fetch(base + '/escape/secret.txt')).status, 403);
});

test('simultaneous HTTP commitments award only one reservation and shared views keep journals private', async t => {
  const content = JSON.parse(readFileSync(new URL('../shared/world-content.json', import.meta.url), 'utf8'));
  const unique = content.inheritances.find(i => i.uniqueGu);
  unique.minRank = 1; unique.placeId = content.origins[0].placeId;
  const { base, post } = await serverFor(t, { store: new WorldStore({ content, randomIndex: () => 0 }) });
  const a = await (await post('/api/world/session', { name: 'A' })).json();
  const b = await (await post('/api/world/session', { name: 'B' })).json();
  const act = (session, op, type, payload) => post('/api/world/command', { operationId: op, lifeId: session.snapshot.life.id, action: { type, payload } }, session.token);
  await Promise.all([act(a, 'i-a', 'investigate', {}), act(b, 'i-b', 'investigate', {})]);
  const attempts = await Promise.all([act(a, 'c-a', 'commit', { inheritanceId: unique.id, acceptDeath: true }), act(b, 'c-b', 'commit', { inheritanceId: unique.id, acceptDeath: true })]);
  assert.deepEqual(attempts.map(r => r.status).sort(), [200, 409]);
  const snapshots = await Promise.all([a, b].map(s => fetch(base + '/api/world', { headers: { Authorization: `Bearer ${s.token}` } }).then(r => r.json())));
  const winner = snapshots.find(snapshot => snapshot.life.trial);
  const loser = snapshots.find(s => !s.life.trial);
  assert.equal(winner.inheritanceStates[unique.id].reservedBy, winner.life.id);
  assert.equal(loser.inheritanceStates[unique.id].reservedBy, 'Chưa xác định');
  assert.equal(loser.immortals.find(gu => gu.typeId === unique.uniqueGu).instanceId, '');
  assert.equal(loser.account.journal.some(e => e.title.startsWith('Cam kết')), false);
});

test('listening service checkpoints abandoned trials and releases holds without player requests', async t => {
  const content = JSON.parse(readFileSync(new URL('../shared/world-content.json', import.meta.url), 'utf8'));
  const unique = content.inheritances.find(i => i.uniqueGu); unique.minRank = 1; unique.placeId = content.origins[0].placeId;
  let time = 1_000_000;
  const dir = mkdtempSync(join(tmpdir(), 'world-clock-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'world.json');
  const store = new WorldStore({ content, now: () => time, filePath, randomIndex: () => 0 });
  const a = store.createSession('A');
  const command = (type, payload) => store.execute(a.token, { operationId: crypto.randomUUID(), lifeId: a.snapshot.life.id, action: { type, payload } });
  command('investigate', {}); command('commit', { inheritanceId: unique.id, acceptDeath: true });
  await serverFor(t, { store, checkpointIntervalMs: 5 });
  time += 390_001;
  await new Promise(resolve => setTimeout(resolve, 25));
  const persisted = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.equal(Object.values(persisted.accounts)[0].life.dead, true);
  assert.equal(persisted.inheritanceStates[unique.id].reservedBy, null);
  assert.throws(() => command('choose', { stageId: unique.stages[0].id, choiceId: unique.stages[0].choices[0].id }), { code: 'LIFE_DEAD' });
  assert.equal(store.snapshot(a.token).account.pastLives.length, 1);
});

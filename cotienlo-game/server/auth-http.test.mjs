import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createWorldServer } from './http-server.mjs';
import { WorldStore } from './world-store.mjs';
import { AuthStore } from './auth-store.mjs';

async function authServerFor(t, options = {}) {
  const deliveries = [];
  const authStore = new AuthStore({ filePath: null, mailer: (email, otp, purpose) => { deliveries.push({ email, otp, purpose }); return { text: otp }; } });
  const server = createWorldServer({ store: new WorldStore({ filePath: null }), authStore, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, token, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: JSON.stringify(body) });
  const get = (path, token) => fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { post, get, deliveries };
}

test('HTTP Gmail OTP login and progress roundtrip never expose a verification code', async t => {
  const { post, get, deliveries } = await authServerFor(t);
  const sent = await post('/api/auth/send-otp', { email: 'hero@gmail.com', purpose: 'register' });
  assert.equal(sent.status, 200);
  const body = await sent.json();
  assert.equal(Object.hasOwn(body, 'previewOtp'), false);
  assert.equal(Object.hasOwn(body, 'dispatch'), false);
  assert.equal(JSON.stringify(body).includes(deliveries[0].otp), false);
  const spam = await post('/api/auth/send-otp', { email: 'spam@temporary.example' });
  assert.equal((await spam.json()).code, 'GMAIL_REQUIRED');
  const verified = await post('/api/auth/verify-otp', { email: 'hero@gmail.com', otp: deliveries[0].otp, name: 'Cổ Sư', password: 'password123' });
  assert.equal(verified.status, 200);
  const account = await verified.json();
  assert.equal(account.user.name, 'Cổ Sư');
  const saved = await post('/api/auth/save-progress', { progress: { cultivator: { stones: 50 } }, expectedRevision: 0 }, account.token);
  assert.equal(saved.status, 200);
  assert.equal((await (await get('/api/auth/me', account.token)).json()).user.savedProgress.cultivator.stones, 50);
  const login = await post('/api/auth/login', { email: 'h.e.r.o+alias@googlemail.com', password: 'password123' });
  assert.equal((await login.json()).savedProgress.cultivator.stones, 50);
  const stale = await post('/api/auth/save-progress', { progress: { stones: 999 }, expectedRevision: 0 }, account.token);
  assert.equal(stale.status, 409);
  assert.equal((await post('/api/auth/logout', {}, account.token)).status, 200);
  assert.equal((await get('/api/auth/me', account.token)).status, 401);
});

test('HTTP request throttling uses actual socket address and ignores spoofed forwarded IP', async t => {
  const { post } = await authServerFor(t);
  for (let i = 0; i < 10; i++) assert.equal((await post('/api/auth/send-otp', { email: `player${i}@gmail.com` }, undefined, { 'X-Forwarded-For': `192.0.2.${i}` })).status, 200);
  const denied = await post('/api/auth/send-otp', { email: 'another@gmail.com' }, undefined, { 'X-Forwarded-For': '198.51.100.1' });
  assert.equal(denied.status, 429);
  assert.equal((await denied.json()).code, 'RATE_LIMITED');
});

test('HTTP missing SMTP reports an actionable error without accepting fake Gmail verification', async t => {
  const { post } = await authServerFor(t, { authStore: new AuthStore({ filePath: null, mailer: null }) });
  const sent = await post('/api/auth/send-otp', { email: 'hero@gmail.com' });
  assert.equal(sent.status, 503);
  assert.equal((await sent.json()).code, 'MAIL_NOT_CONFIGURED');
});

test('auth progress accepts a bounded complete save larger than world commands while keeping world size limits', async t => {
  const { post, deliveries } = await authServerFor(t);
  await post('/api/auth/send-otp', { email: 'large@gmail.com' });
  const account = await (await post('/api/auth/verify-otp', { email: 'large@gmail.com', otp: deliveries[0].otp })).json();
  const large = { text: 'a'.repeat(20_000) };
  assert.equal((await post('/api/auth/save-progress', { progress: large, expectedRevision: 0 }, account.token)).status, 200);
  assert.equal((await post('/api/auth/save-progress', { progress: { text: 'a'.repeat(65_536) }, expectedRevision: 1 }, account.token)).status, 413);
  assert.equal((await post('/api/world/session', { name: 'a'.repeat(20_000) })).status, 413);
});

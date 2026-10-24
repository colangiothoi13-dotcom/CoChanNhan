import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { AuthStore, isValidEmail, isGmail } from './auth-store.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
function harness(options = {}) {
  let time = 1_000_000;
  const deliveries = [];
  const store = new AuthStore({ filePath: null, now: () => time,
    mailer: async (email, otp, purpose) => { deliveries.push({ email, otp, purpose }); return { text: otp, sent: true }; },
    ...options });
  const issue = async (email = 'player@gmail.com', purpose = 'register', context) => {
    await store.sendOtp(email, purpose, context);
    return deliveries.at(-1).otp;
  };
  const register = async (email = 'player@gmail.com', options = {}) => store.verifyOtp(email, await issue(email), { name: 'Cổ Sư', password: 'password123', ...options });
  return { store, deliveries, issue, register, advance: ms => { time += ms; } };
}
function fixture(t) {
  const folder = mkdtempSync(resolve('.tmp/auth-store-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  return join(folder, 'users.json');
}

test('Gmail validation rejects malformed local parts and disposable domains', () => {
  for (const email of ['player@gmail.com', 'first.last+game@googlemail.com']) assert.equal(isGmail(email), true);
  for (const email of ['@gmail.com', '.bad@gmail.com', 'bad..name@gmail.com', 'bad@spam.example', 'a\nb@gmail.com']) assert.equal(isGmail(email), false);
  assert.equal(isValidEmail('player@example.com'), true);
});

test('OTP API never returns a code or transport details', async () => {
  const { store, deliveries } = harness();
  const response = await store.sendOtp('first.last+game@googlemail.com');
  assert.equal(response.ok, true);
  assert.equal(response.cooldownSec, 60);
  assert.equal(Object.hasOwn(response, 'previewOtp'), false);
  assert.equal(Object.hasOwn(response, 'dispatch'), false);
  assert.equal(JSON.stringify(response).includes(deliveries[0].otp), false);
  assert.match(deliveries[0].otp, /^\d{6}$/);
});

test('missing email transport fails closed without a verification challenge', async () => {
  const store = new AuthStore({ filePath: null, mailer: null });
  await assert.rejects(store.sendOtp('player@gmail.com'), { code: 'MAIL_NOT_CONFIGURED' });
  assert.throws(() => store.verifyOtp('player@gmail.com', '123456'), { code: 'OTP_NOT_FOUND' });
});

test('progress size includes server metadata so every accepted save remains downloadable', async () => {
  const { store, register } = harness();
  const session = await register();
  const progress = { padding: 'x'.repeat(60 * 1024 - Buffer.byteLength(JSON.stringify({ padding: '' }))) };
  assert.equal(Buffer.byteLength(JSON.stringify(progress)), 60 * 1024);
  assert.throws(() => store.saveProgress(session.token, progress, { expectedRevision: 0 }), { code: 'PROGRESS_TOO_LARGE' });
  assert.equal(store.getUserByToken(session.token).savedProgress, null);
  assert.equal(store.getUserByToken(session.token).revision, 0);
});

test('failed delivery invalidates the challenge and never reports success or a transport secret', async () => {
  let deliveredCode;
  const { store } = harness({ mailer: async (_email, code) => { deliveredCode = code; throw new Error('secret SMTP credential'); } });
  await assert.rejects(store.sendOtp('player@gmail.com'), error => error.code === 'MAIL_DELIVERY_FAILED' && !error.message.includes('secret'));
  assert.throws(() => store.verifyOtp('player@gmail.com', deliveredCode), { code: 'OTP_NOT_FOUND' });
});

test('canonical Gmail aliases share cooldown and one account', async () => {
  const h = harness();
  const code = await h.issue('First.Last+one@googlemail.com');
  await assert.rejects(h.issue('firstlast+two@gmail.com'), { code: 'OTP_COOLDOWN' });
  const first = h.store.verifyOtp('firstlast@gmail.com', code, { password: 'password123' });
  h.advance(61_000);
  const secondCode = await h.issue('f.i.r.s.t.l.a.s.t+other@gmail.com', 'login');
  const second = h.store.verifyOtp('firstlast@googlemail.com', secondCode);
  assert.equal(second.user.id, first.user.id);
  assert.equal(second.isNew, false);
  assert.equal(h.store.login('first.last+any@gmail.com', 'password123').user.id, first.user.id);
});

test('purpose, verification fields and password are checked before consuming OTP', async () => {
  const h = harness();
  await assert.rejects(h.store.sendOtp('player@gmail.com', 'reset-anything'), { code: 'INVALID_PURPOSE' });
  const code = await h.issue();
  for (const options of [{ name: {} }, { password: 5 }, { password: 'tiny' }]) {
    assert.throws(() => h.store.verifyOtp('player@gmail.com', code, options), error => ['INVALID_NAME', 'INVALID_PASSWORD'].includes(error.code));
  }
  assert.throws(() => h.store.verifyOtp('player@gmail.com', code, { purpose: 'login' }), { code: 'OTP_PURPOSE_MISMATCH' });
  assert.equal(h.store.verifyOtp('player@gmail.com', code, { purpose: 'register' }).ok, true);
  assert.throws(() => h.store.verifyOtp('player@gmail.com', code), { code: 'OTP_NOT_FOUND' });
});

test('five wrong codes invalidate the OTP and expired codes cannot be used', async () => {
  const h = harness();
  const code = await h.issue();
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.throws(() => h.store.verifyOtp('player@gmail.com', wrong), error => ['OTP_INCORRECT', 'OTP_MAX_ATTEMPTS'].includes(error.code));
  assert.throws(() => h.store.verifyOtp('player@gmail.com', code), { code: 'OTP_NOT_FOUND' });
  h.advance(61_000);
  const next = await h.issue();
  h.advance(300_000);
  assert.throws(() => h.store.verifyOtp('player@gmail.com', next), { code: 'OTP_EXPIRED' });
});

test('sessions expire for reads and progress writes at the same deadline', async () => {
  const h = harness();
  const account = await h.register();
  h.advance(30 * 24 * 60 * 60 * 1000);
  assert.throws(() => h.store.saveProgress(account.token, { test: true }), { code: 'UNAUTHORIZED' });
  assert.equal(h.store.getUserByToken(account.token), null);
});

test('per-IP send and password limits span different mailbox aliases', async () => {
  const h = harness();
  for (let i = 0; i < 10; i++) await h.issue(`player${i}@gmail.com`, 'register', { ip: '192.0.2.1' });
  await assert.rejects(h.issue('player11@gmail.com', 'register', { ip: '192.0.2.1' }), { code: 'RATE_LIMITED' });
  await h.issue('player12@gmail.com', 'register', { ip: '192.0.2.2' });
  for (let i = 0; i < 30; i++) assert.throws(() => h.store.login(`missing${i}@gmail.com`, 'bad-password', { ip: '192.0.2.3' }));
  assert.throws(() => h.store.login('another@gmail.com', 'bad-password', { ip: '192.0.2.3' }), { code: 'RATE_LIMITED' });
  h.advance(16 * 60_000);
  await h.issue('player11@gmail.com', 'register', { ip: '192.0.2.1' });
});

test('account password hashes are salted, session tokens are hashed at rest and persist across restart', async t => {
  const filePath = fixture(t);
  const h = harness({ filePath });
  const a = await h.register('playera@gmail.com');
  const b = await h.register('playerb@gmail.com');
  h.store.saveProgress(a.token, { cultivator: { stones: 73 }, inventory: [{ id: 'herb', count: 2 }] });
  const diskText = readFileSync(filePath, 'utf8');
  const disk = JSON.parse(diskText);
  assert.equal(diskText.includes(a.token), false);
  assert.equal(diskText.includes('password123'), false);
  assert.match(disk.users[a.user.id].passwordHash, /^scrypt\$/);
  assert.notEqual(disk.users[a.user.id].passwordHash, disk.users[b.user.id].passwordHash);
  const restored = harness({ filePath });
  assert.equal(restored.store.getUserByToken(a.token).savedProgress.cultivator.stones, 73);
  assert.equal(restored.store.login('playera@gmail.com', 'password123').savedProgress.inventory[0].count, 2);
  restored.store.logout(a.token);
  assert.equal(restored.store.getUserByToken(a.token), null);
});

test('progress snapshots and returned user data cannot mutate persisted state', async () => {
  const h = harness();
  const account = await h.register();
  const progress = { cultivator: { stones: 5 } };
  h.store.saveProgress(account.token, progress);
  progress.cultivator.stones = 999;
  const user = h.store.getUserByToken(account.token);
  user.savedProgress.cultivator.stones = 888;
  assert.equal(h.store.getUserByToken(account.token).savedProgress.cultivator.stones, 5);
});

test('progress revisions reject stale-device overwrites without changing a newer save', async () => {
  const h = harness();
  const account = await h.register();
  assert.equal(account.revision, 0);
  const saved = h.store.saveProgress(account.token, { stones: 5 }, { expectedRevision: 0 });
  assert.equal(saved.revision, 1);
  assert.throws(() => h.store.saveProgress(account.token, { stones: 999 }, { expectedRevision: 0 }), { code: 'PROGRESS_CONFLICT' });
  assert.throws(() => h.store.saveProgress(account.token, { stones: 999 }), { code: 'PROGRESS_CONFLICT' });
  assert.equal(h.store.getUserByToken(account.token).savedProgress.stones, 5);
  assert.equal(h.store.getUserByToken(account.token).revision, 1);
  assert.equal(h.store.saveProgress(account.token, { stones: 6 }, { expectedRevision: 1 }).revision, 2);
});

test('write failures preserve the previous in-memory state, OTP and disk data', async t => {
  const filePath = fixture(t);
  const h = harness({ filePath });
  const account = await h.register();
  h.store.saveProgress(account.token, { stones: 3 });
  const original = readFileSync(filePath, 'utf8');
  rmSync(filePath);
  mkdirSync(filePath);
  assert.throws(() => h.store.saveProgress(account.token, { stones: 999 }, { expectedRevision: 1 }), { code: 'AUTH_STORAGE_FAILED' });
  assert.equal(h.store.getUserByToken(account.token).savedProgress.stones, 3);
  const code = await h.issue('newplayer@gmail.com');
  assert.throws(() => h.store.verifyOtp('newplayer@gmail.com', code), { code: 'AUTH_STORAGE_FAILED' });
  rmSync(filePath, { recursive: true });
  writeFileSync(filePath, original);
  assert.equal(h.store.verifyOtp('newplayer@gmail.com', code).ok, true);
});

test('corrupt or invalid persisted accounts fail closed without modifying the file', t => {
  const filePath = fixture(t);
  for (const text of ['{broken', '{}', '{"users":[],"tokens":{}}', '{"schemaVersion":999,"users":{},"tokens":{}}']) {
    writeFileSync(filePath, text);
    assert.throws(() => new AuthStore({ filePath }), /corrupt|invalid|unsupported/i);
    assert.equal(readFileSync(filePath, 'utf8'), text);
  }
});

test('legacy valid accounts and sessions migrate without losing progress; successful password login upgrades SHA256', t => {
  const filePath = fixture(t);
  const rawToken = 'legacy_session_token_with_at_least_32_chars';
  const legacy = { users: { old: { id: 'old', email: 'Old.Player+mail@googlemail.com', name: 'Người chơi cũ', passwordHash: sha('legacy-password'), createdAt: 1, verifiedAt: 2, savedProgress: { stones: 43 } } }, tokens: { [rawToken]: { userId: 'old', createdAt: 2, expiresAt: 9_000_000 } } };
  writeFileSync(filePath, JSON.stringify(legacy));
  const h = harness({ filePath });
  assert.equal(h.store.getUserByToken(rawToken).savedProgress.stones, 43);
  assert.throws(() => h.store.login('oldplayer@gmail.com', 'wrong-password'), { code: 'WRONG_PASSWORD' });
  assert.equal(h.store.login('oldplayer@gmail.com', 'legacy-password').savedProgress.stones, 43);
  const diskText = readFileSync(filePath, 'utf8');
  assert.equal(diskText.includes(rawToken), false);
  assert.match(JSON.parse(diskText).users.old.passwordHash, /^scrypt\$/);
});

test('legacy Gmail alias collisions fail closed and preserve both histories for manual recovery', t => {
  const filePath = fixture(t);
  const user = { name: 'Cổ Sư', passwordHash: null, createdAt: 1, verifiedAt: 2 };
  const original = JSON.stringify({ users: {
    a: { ...user, id: 'a', email: 'old.player@gmail.com', savedProgress: { stones: 17 } },
    b: { ...user, id: 'b', email: 'oldplayer+alias@googlemail.com', savedProgress: { stones: 43 } },
  }, tokens: {} });
  writeFileSync(filePath, original);
  assert.throws(() => harness({ filePath }), /alias.*collision|duplicate.*Gmail/i);
  assert.equal(readFileSync(filePath, 'utf8'), original);
});

test('only the latest ten sessions remain valid for an account', async () => {
  const h = harness();
  const first = await h.register();
  const tokens = [];
  for (let i = 0; i < 10; i++) tokens.push(h.store.login('player@gmail.com', 'password123').token);
  assert.equal(h.store.getUserByToken(first.token), null);
  assert.ok(h.store.getUserByToken(tokens.at(-1)));
});

test('setting a new password with verified OTP revokes all old sessions for only that account', async () => {
  const h = harness();
  const first = await h.register();
  const second = h.store.login('player@gmail.com', 'password123');
  const other = await h.register('other@gmail.com');
  h.advance(61_000);
  const code = await h.issue('player@gmail.com', 'login');
  const reset = h.store.verifyOtp('player@gmail.com', code, { purpose: 'login', password: 'replacement-password' });
  assert.equal(h.store.getUserByToken(first.token), null);
  assert.equal(h.store.getUserByToken(second.token), null);
  assert.ok(h.store.getUserByToken(other.token));
  assert.ok(h.store.getUserByToken(reset.token));
  assert.throws(() => h.store.login('player@gmail.com', 'password123'), { code: 'WRONG_PASSWORD' });
  assert.equal(h.store.login('player@gmail.com', 'replacement-password').user.id, first.user.id);
});

test('failed password reset preserves old password, sessions and OTP until the same reset can commit', async t => {
  const filePath = fixture(t);
  const h = harness({ filePath });
  const first = await h.register();
  const original = readFileSync(filePath, 'utf8');
  h.advance(61_000);
  const code = await h.issue('player@gmail.com', 'login');
  rmSync(filePath);
  mkdirSync(filePath);
  assert.throws(() => h.store.verifyOtp('player@gmail.com', code, { password: 'replacement-password' }), { code: 'AUTH_STORAGE_FAILED' });
  assert.ok(h.store.getUserByToken(first.token));
  assert.throws(() => h.store.login('player@gmail.com', 'replacement-password'), { code: 'WRONG_PASSWORD' });
  rmSync(filePath, { recursive: true });
  writeFileSync(filePath, original);
  assert.equal(h.store.login('player@gmail.com', 'password123').user.id, first.user.id);
  const reset = h.store.verifyOtp('player@gmail.com', code, { password: 'replacement-password' });
  assert.ok(h.store.getUserByToken(reset.token));
  assert.equal(h.store.getUserByToken(first.token), null);
});

test('a long valid Gmail local part can register without entering a display name', async () => {
  const h = harness();
  const email = `${'p'.repeat(45)}@gmail.com`;
  const account = h.store.verifyOtp(email, await h.issue(email));
  assert.equal(account.ok, true);
  assert.equal(account.user.name, 'p'.repeat(40));
});

test('all account progress metadata uses revision at the public boundary', async () => {
  const h = harness();
  const account = await h.register();
  assert.equal(account.revision, 0);
  assert.equal(Object.hasOwn(account, 'progressRevision'), false);
  const saved = h.store.saveProgress(account.token, { stones: 17 }, { expectedRevision: 0 });
  assert.equal(saved.revision, 1);
  const login = h.store.login('player@gmail.com', 'password123');
  assert.equal(login.revision, 1);
  assert.equal(Object.hasOwn(login, 'progressRevision'), false);
  assert.equal(h.store.getUserByToken(login.token).revision, 1);
});

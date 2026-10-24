import { randomUUID, randomBytes, randomInt, createHash, createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSmtpMailer } from './email-transport.mjs';

const DEFAULT_USERS_FILE = fileURLToPath(new URL('../.world-data/users.json', import.meta.url));
const OTP_EXPIRY_MS = 5 * 60_000;
const OTP_COOLDOWN_MS = 60_000;
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60_000;
const MAX_PENDING_OTPS = 2_048;
const MAX_RATE_KEYS = 8_192;
const MAX_SESSIONS = 50_000;
const MAX_PROGRESS_BYTES = 60 * 1_024;
const PURPOSES = new Set(['register', 'login']);
const SCRYPT_FORMAT = /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/;
const SHA_FORMAT = /^[a-f0-9]{64}$/;
const clone = value => structuredClone(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const pauseBuffer = new Int32Array(new SharedArrayBuffer(4));

function replaceAtomically(temporary, destination) {
  // Windows file scanners may briefly hold the previous file open during replacement.
  for (let attempt = 0; ; attempt++) {
    try { renameSync(temporary, destination); return; }
    catch (error) {
      if (attempt >= 4 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
      Atomics.wait(pauseBuffer, 0, 0, 10 * (attempt + 1));
    }
  }
}

export class AuthError extends Error {
  constructor(code, message, status = 400) { super(message); this.name = 'AuthError'; this.code = code; this.status = status; }
}
const requireThat = (condition, code, message, status) => { if (!condition) throw new AuthError(code, message, status); };

export function isValidEmail(value) {
  if (typeof value !== 'string') return false;
  const email = value.trim().toLowerCase();
  if (email.length > 120 || /[\s\u0000-\u001f\u007f]/.test(email)) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return local.length > 0 && local.length <= 64 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
    && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..')
    && domain.includes('.') && domain.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part));
}
export function isGmail(value) {
  return isValidEmail(value) && ['gmail.com', 'googlemail.com'].includes(value.trim().toLowerCase().split('@')[1])
    && /^[a-z0-9.]+(?:\+[a-z0-9.!#$%&'*+/=?^_`{|}~-]*)?$/.test(value.trim().toLowerCase().split('@')[0]);
}
export function canonicalGmail(value) {
  requireThat(typeof value === 'string' && isValidEmail(value), 'INVALID_EMAIL', 'Định dạng email không hợp lệ.');
  requireThat(isGmail(value), 'GMAIL_REQUIRED', 'Vui lòng dùng địa chỉ Gmail (@gmail.com).');
  return `${value.trim().toLowerCase().split('@')[0].split('+')[0].replaceAll('.', '')}@gmail.com`;
}
function validatePassword(password, optional = false) {
  requireThat(typeof password === 'string' && ((optional && password === '') || (password.length >= 8 && password.length <= 128 && password.trim().length > 0)),
    'INVALID_PASSWORD', 'Mật khẩu cần từ 8 đến 128 ký tự.');
}
function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}
function matchesPassword(password, stored) {
  const actual = SCRYPT_FORMAT.test(stored) ? scryptSync(password, stored.split('$')[1], 64) : Buffer.from(hash(password), 'hex');
  const expected = Buffer.from(SCRYPT_FORMAT.test(stored) ? stored.split('$')[2] : stored, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function publicUser(user, includeProgress = false) {
  return { id: user.id, email: user.email, name: user.name, verifiedAt: user.verifiedAt,
    ...(includeProgress ? { savedProgress: clone(user.savedProgress), revision: user.progressRevision } : {}) };
}

/** One-process auth store: publish state only after an atomic durable write succeeds. */
export class AuthStore {
  #filePath;
  #data;
  #now;
  #mailer;
  #otpSecret = randomBytes(32);
  #pendingOtps = new Map();
  #rates = new Map();

  constructor({ filePath = DEFAULT_USERS_FILE, now = Date.now, mailer = createSmtpMailer() } = {}) {
    this.#filePath = filePath ? resolve(filePath) : null;
    this.#now = now;
    this.#mailer = mailer;
    this.#data = { schemaVersion: 2, users: {}, tokens: {} };
    if (this.#filePath && existsSync(this.#filePath)) {
      let data;
      try {
        const original = JSON.parse(readFileSync(this.#filePath, 'utf8'));
        data = this.#migrate(original);
        this.#validate(data);
        if (JSON.stringify(data) === JSON.stringify(original)) { this.#data = data; return; }
      } catch (error) {
        if (error.code === 'ALIAS_COLLISION') throw new Error('Auth migration blocked: duplicate Gmail alias collision. Both account histories were preserved for manual recovery.');
        throw new Error('Auth data is corrupt, invalid or unsupported. Existing file was preserved.');
      }
      if (data) this.#publish(data);
      else this.#data = data;
    }
  }

  #time() {
    const time = this.#now();
    requireThat(count(time), 'INVALID_CLOCK', 'Đồng hồ máy chủ không hợp lệ.', 500);
    return time;
  }
  #migrate(data) {
    if (!record(data) || !record(data.users) || !record(data.tokens) || (data.schemaVersion !== undefined && data.schemaVersion !== 2)) throw new Error('Unsupported auth schema');
    const legacy = data.schemaVersion === undefined;
    const next = { ...clone(data), schemaVersion: 2, users: {}, tokens: {} };
    for (const [id, user] of Object.entries(data.users)) {
      if (!record(user)) throw new Error('Invalid user');
      next.users[id] = legacy ? { ...clone(user), emailKey: canonicalGmail(user.email), progressRevision: 0 } : clone(user);
    }
    for (const [key, session] of Object.entries(data.tokens)) {
      if (!record(session)) throw new Error('Invalid session');
      const tokenKey = legacy ? hash(key) : key;
      next.tokens[tokenKey] = clone(session);
    }
    return next;
  }
  #validate(data) {
    if (!record(data) || data.schemaVersion !== 2 || !record(data.users) || !record(data.tokens) || Object.keys(data.tokens).length > MAX_SESSIONS) throw new Error('Invalid auth state');
    const mailboxes = new Set();
    for (const [id, user] of Object.entries(data.users)) {
      if (!record(user) || user.id !== id || typeof id !== 'string' || !id || id.length > 100
        || !isGmail(user.email) || user.emailKey !== canonicalGmail(user.email)
        || typeof user.name !== 'string' || user.name.length > 40
        || !count(user.createdAt) || !count(user.verifiedAt) || !count(user.progressRevision)
        || !(user.passwordHash === null || typeof user.passwordHash === 'string' && (SCRYPT_FORMAT.test(user.passwordHash) || SHA_FORMAT.test(user.passwordHash)))
        || !(user.savedProgress === null || record(user.savedProgress))) throw new Error('Invalid auth user');
      if (mailboxes.has(user.emailKey)) throw Object.assign(new Error('Duplicate Gmail alias'), { code: 'ALIAS_COLLISION' });
      mailboxes.add(user.emailKey);
    }
    for (const [key, session] of Object.entries(data.tokens)) {
      if (!SHA_FORMAT.test(key) || !record(session) || !Object.hasOwn(data.users, session.userId)
        || !count(session.createdAt) || !count(session.expiresAt) || session.expiresAt <= session.createdAt) throw new Error('Invalid auth session');
    }
  }
  #publish(next) {
    this.#validate(next);
    if (this.#filePath) {
      let descriptor;
      const temporary = `${this.#filePath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        mkdirSync(dirname(this.#filePath), { recursive: true });
        descriptor = openSync(temporary, 'wx', 0o600);
        writeFileSync(descriptor, JSON.stringify(next), 'utf8');
        fsyncSync(descriptor);
        closeSync(descriptor); descriptor = undefined;
        replaceAtomically(temporary, this.#filePath);
      } catch {
        if (descriptor !== undefined) { try { closeSync(descriptor); } catch {} }
        try { rmSync(temporary, { force: true }); } catch {}
        throw new AuthError('AUTH_STORAGE_FAILED', 'Không thể lưu tài khoản. Dữ liệu trước đó được giữ nguyên; hãy thử lại.', 503);
      }
    }
    this.#data = next;
  }
  #pruneMemory(time) {
    for (const [key, value] of this.#pendingOtps) if (value.expiresAt < time) this.#pendingOtps.delete(key);
    for (const [key, value] of this.#rates) if (value.expiresAt <= time) this.#rates.delete(key);
  }
  #limit(key, limit, windowMs, time) {
    let rate = this.#rates.get(key);
    if (!rate || rate.expiresAt <= time) {
      requireThat(this.#rates.size < MAX_RATE_KEYS, 'RATE_LIMITED', 'Máy chủ đang nhận nhiều yêu cầu. Hãy thử lại sau.', 429);
      rate = { count: 0, expiresAt: time + windowMs };
      this.#rates.set(key, rate);
    }
    requireThat(rate.count < limit, 'RATE_LIMITED', 'Quá nhiều yêu cầu xác thực. Hãy đợi trước khi thử lại.', 429);
    rate.count++;
  }
  #ip(context) { return typeof context?.ip === 'string' && context.ip.length <= 100 ? context.ip : 'local'; }
  #findUser(email) {
    return Object.values(this.#data.users).find(user => user.emailKey === email);
  }
  #otpHash(email, otp) { return createHmac('sha256', this.#otpSecret).update(`${email}:${otp}`).digest('hex'); }
  #session(token, time = this.#time()) {
    if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{30,200}$/.test(token)) return null;
    const key = hash(token);
    const session = Object.hasOwn(this.#data.tokens, key) && this.#data.tokens[key];
    if (!session || time >= session.expiresAt) return null;
    return { key, session, user: this.#data.users[session.userId] };
  }
  #issueSession(next, userId, time) {
    for (const [key, session] of Object.entries(next.tokens)) if (session.expiresAt <= time) delete next.tokens[key];
    const sessions = Object.entries(next.tokens).filter(([, session]) => session.userId === userId).sort(([, a], [, b]) => a.createdAt - b.createdAt);
    while (sessions.length >= 10) delete next.tokens[sessions.shift()[0]];
    requireThat(Object.keys(next.tokens).length < MAX_SESSIONS, 'AUTH_BUSY', 'Máy chủ đang bận. Hãy thử lại sau.', 503);
    const token = randomBytes(32).toString('base64url');
    next.tokens[hash(token)] = { userId, createdAt: time, expiresAt: time + SESSION_EXPIRY_MS };
    return token;
  }
  #result(user, token, isNew) {
    return { ok: true, ...(isNew !== undefined ? { isNew } : {}), token, user: publicUser(user), savedProgress: clone(user.savedProgress), revision: user.progressRevision };
  }

  async sendOtp(emailInput, purpose = 'register', context = {}) {
    const email = canonicalGmail(emailInput);
    requireThat(PURPOSES.has(purpose), 'INVALID_PURPOSE', 'Mục đích mã OTP không hợp lệ.');
    requireThat(typeof this.#mailer === 'function', 'MAIL_NOT_CONFIGURED', 'Máy chủ chưa cấu hình Gmail SMTP. Hãy thiết lập SMTP_USER và SMTP_PASS (mật khẩu ứng dụng).', 503);
    const time = this.#time();
    this.#pruneMemory(time);
    const cooldown = this.#rates.get(`cooldown:${email}`);
    requireThat(!cooldown || cooldown.expiresAt <= time, 'OTP_COOLDOWN', 'Vui lòng đợi 60 giây trước khi yêu cầu mã mới.', 429);
    this.#limit(`otp-ip:${this.#ip(context)}`, 10, 15 * 60_000, time);
    this.#limit(`otp-mail:${email}`, 5, 60 * 60_000, time);
    requireThat(this.#pendingOtps.has(email) || this.#pendingOtps.size < MAX_PENDING_OTPS, 'RATE_LIMITED', 'Máy chủ đang bận gửi mã. Hãy thử lại sau.', 429);
    this.#limit(`cooldown:${email}`, 1, OTP_COOLDOWN_MS, time);
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const pending = { hash: this.#otpHash(email, otp), expiresAt: time + OTP_EXPIRY_MS, attempts: 0, purpose, delivered: false };
    this.#pendingOtps.set(email, pending);
    try { await this.#mailer(email, otp, purpose); }
    catch {
      if (this.#pendingOtps.get(email) === pending) this.#pendingOtps.delete(email);
      throw new AuthError('MAIL_DELIVERY_FAILED', 'Chưa thể gửi mã Gmail. Hãy thử lại sau; nếu tiếp diễn, kiểm tra cấu hình SMTP của máy chủ.', 503);
    }
    pending.delivered = true;
    return { ok: true, message: 'Mã xác thực đã được gửi về Gmail. Hãy kiểm tra hộp thư đến và thư rác.', cooldownSec: 60 };
  }

  verifyOtp(emailInput, otpInput, options = {}) {
    const email = canonicalGmail(emailInput);
    requireThat(record(options), 'INVALID_OPTIONS', 'Thông tin xác thực không hợp lệ.');
    const { name = '', password = '', purpose } = options;
    requireThat(typeof name === 'string' && name.trim().length <= 40 && !/[\u0000-\u001f\u007f]/.test(name), 'INVALID_NAME', 'Tên Cổ Sư không hợp lệ hoặc dài quá 40 ký tự.');
    validatePassword(password, true);
    requireThat(typeof otpInput === 'string' && /^\d{6}$/.test(otpInput.trim()), 'INVALID_OTP', 'Mã OTP gồm 6 chữ số.');
    requireThat(purpose === undefined || PURPOSES.has(purpose), 'INVALID_PURPOSE', 'Mục đích mã OTP không hợp lệ.');
    const pending = this.#pendingOtps.get(email);
    requireThat(pending?.delivered, 'OTP_NOT_FOUND', 'Chưa có mã xác thực Gmail hợp lệ. Vui lòng yêu cầu mã mới.');
    if (this.#time() >= pending.expiresAt) {
      this.#pendingOtps.delete(email);
      throw new AuthError('OTP_EXPIRED', 'Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.');
    }
    requireThat(purpose === undefined || purpose === pending.purpose, 'OTP_PURPOSE_MISMATCH', 'Mã OTP không dành cho thao tác này.');
    if (!timingSafeEqual(Buffer.from(this.#otpHash(email, otpInput.trim()), 'hex'), Buffer.from(pending.hash, 'hex'))) {
      pending.attempts++;
      if (pending.attempts >= 5) {
        this.#pendingOtps.delete(email);
        throw new AuthError('OTP_MAX_ATTEMPTS', 'Mã OTP đã bị khóa sau 5 lần nhập sai. Vui lòng yêu cầu mã mới.', 429);
      }
      throw new AuthError('OTP_INCORRECT', `Mã OTP không chính xác. Còn ${5 - pending.attempts} lần thử.`);
    }
    const time = this.#time();
    const existing = this.#findUser(email);
    const next = clone(this.#data);
    const user = existing ? next.users[existing.id] : {
      id: randomUUID(), email, emailKey: email, name: name.trim() || email.split('@')[0].slice(0, 40),
      passwordHash: null, createdAt: time, verifiedAt: time, savedProgress: null, progressRevision: 0,
    };
    if (name.trim()) user.name = name.trim();
    if (password) {
      user.passwordHash = passwordHash(password);
      if (existing) {
        for (const [key, session] of Object.entries(next.tokens)) if (session.userId === user.id) delete next.tokens[key];
      }
    }
    user.verifiedAt = time;
    next.users[user.id] = user;
    const token = this.#issueSession(next, user.id, time);
    this.#publish(next);
    this.#pendingOtps.delete(email);
    return this.#result(user, token, !existing);
  }

  login(emailInput, password, context = {}) {
    const email = canonicalGmail(emailInput);
    // Existing passwords can be shorter than the new policy; upgrade only after a match.
    requireThat(typeof password === 'string' && password.length > 0 && password.length <= 128, 'INVALID_PASSWORD', 'Vui lòng nhập mật khẩu hợp lệ.');
    const time = this.#time();
    this.#pruneMemory(time);
    this.#limit(`login-ip:${this.#ip(context)}`, 30, 15 * 60_000, time);
    this.#limit(`login-mail:${email}`, 10, 15 * 60_000, time);
    const existing = this.#findUser(email);
    requireThat(existing, 'USER_NOT_FOUND', 'Tài khoản chưa tồn tại. Hãy đăng nhập bằng mã Gmail.', 404);
    requireThat(existing.passwordHash, 'NO_PASSWORD_SET', 'Tài khoản chưa có mật khẩu. Hãy đăng nhập bằng mã Gmail.');
    requireThat(matchesPassword(password, existing.passwordHash), 'WRONG_PASSWORD', 'Mật khẩu không chính xác.');
    const next = clone(this.#data);
    const user = next.users[existing.id];
    if (SHA_FORMAT.test(user.passwordHash)) user.passwordHash = passwordHash(password);
    const token = this.#issueSession(next, user.id, time);
    this.#publish(next);
    return this.#result(user, token);
  }

  getUserByToken(token) {
    const access = this.#session(token);
    return access ? publicUser(access.user, true) : null;
  }

  saveProgress(token, progress, { expectedRevision } = {}) {
    const time = this.#time();
    const access = this.#session(token, time);
    requireThat(access, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
    requireThat(record(progress), 'INVALID_PROGRESS', 'Dữ liệu tiến trình không hợp lệ.');
    let encoded;
    try { encoded = JSON.stringify(progress); } catch { throw new AuthError('INVALID_PROGRESS', 'Dữ liệu tiến trình không hợp lệ.'); }
    requireThat(encoded && Buffer.byteLength(encoded) <= MAX_PROGRESS_BYTES, 'PROGRESS_TOO_LARGE', 'Bản lưu vượt quá giới hạn 60 KB.', 413);
    const savedProgress = { ...JSON.parse(encoded), savedAt: time };
    requireThat(Buffer.byteLength(JSON.stringify(savedProgress)) <= MAX_PROGRESS_BYTES, 'PROGRESS_TOO_LARGE', 'Bản lưu cùng thông tin đồng bộ vượt quá giới hạn 60 KB.', 413);
    const revision = access.user.progressRevision;
    requireThat((expectedRevision === undefined && revision === 0) || count(expectedRevision) && expectedRevision === revision,
      'PROGRESS_CONFLICT', 'Bản lưu đã thay đổi trên thiết bị khác. Hãy tải bản mới trước khi lưu tiếp.', 409);
    requireThat(revision < Number.MAX_SAFE_INTEGER, 'PROGRESS_CONFLICT', 'Bản lưu cần được quản trị viên kiểm tra.', 409);
    const next = clone(this.#data);
    const user = next.users[access.user.id];
    user.savedProgress = savedProgress;
    user.progressRevision++;
    this.#publish(next);
    return { ok: true, savedAt: time, revision: user.progressRevision, message: 'Đã lưu tiến trình vào tài khoản trên máy chủ.' };
  }

  logout(token) {
    if (typeof token === 'string' && Object.hasOwn(this.#data.tokens, hash(token))) {
      const next = clone(this.#data);
      delete next.tokens[hash(token)];
      this.#publish(next);
    }
    return { ok: true };
  }
}

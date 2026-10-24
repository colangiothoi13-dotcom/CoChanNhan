import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, extname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorldStore, WorldError } from './world-store.mjs';
import { AuthStore, AuthError } from './auth-store.mjs';
import { FieldError } from './field-engine.mjs';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_AUTH_BODY_BYTES = 64 * 1024;
const DEFAULT_DATA = fileURLToPath(new URL('../.world-data/world.json', import.meta.url));
const DEFAULT_USERS = fileURLToPath(new URL('../.world-data/users.json', import.meta.url));
const DEFAULT_STATIC = fileURLToPath(new URL('../dist/', import.meta.url));
const DEFAULT_ORIGINS = [
  'https://appassets.androidplatform.net', 'capacitor://localhost', 'http://localhost', 'https://localhost',
  'http://localhost:5173', 'http://127.0.0.1:5173',
];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const below = (root, target) => { const path = relative(root, target); return !path.startsWith('..') && !isAbsolute(path); };

function isLoopbackOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol)
      && ['localhost', '127.0.0.1'].includes(parsed.hostname)
      && parsed.origin === origin;
  } catch { return false; }
}

function json(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store' });
  response.end(text);
}
async function readJson(request, maximum = MAX_BODY_BYTES) {
  if (Number(request.headers['content-length'] ?? 0) > maximum) throw new WorldError('BODY_TOO_LARGE', 'Nội dung vượt quá giới hạn cho phép.', 413);
  const chunks = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maximum) throw new WorldError('BODY_TOO_LARGE', 'Nội dung vượt quá giới hạn cho phép.', 413);
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new WorldError('INVALID_JSON', 'Nội dung JSON không hợp lệ.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WorldError('INVALID_JSON', 'Nội dung phải là một đối tượng JSON.');
  return value;
}
function bearer(request) {
  const authorization = request.headers.authorization;
  const match = typeof authorization === 'string' && /^Bearer ([a-zA-Z0-9_-]+)$/.exec(authorization);
  if (!match) throw new WorldError('UNAUTHORIZED', 'Cần mã phiên chơi hợp lệ.', 401);
  return match[1];
}
function method(response, allowed) {
  response.setHeader('Allow', allowed);
  throw new WorldError('METHOD_NOT_ALLOWED', 'Phương thức không được hỗ trợ.', 405);
}
async function serveStatic(request, response, pathname, staticDir) {
  if (!['GET', 'HEAD'].includes(request.method)) return method(response, 'GET, HEAD');
  let path;
  try { path = decodeURIComponent(pathname); }
  catch { throw new WorldError('INVALID_PATH', 'Đường dẫn không hợp lệ.'); }
  if (path.includes('\\') || path.includes('\0') || path.split('/').some(p => p.startsWith('.'))) throw new WorldError('FORBIDDEN_PATH', 'Không được truy cập đường dẫn này.', 403);
  const root = resolve(staticDir);
  let target = resolve(root, `.${path === '/' ? '/index.html' : path}`);
  if (!below(root, target)) throw new WorldError('FORBIDDEN_PATH', 'Không được truy cập đường dẫn này.', 403);
  try {
    const details = await stat(target);
    if (!details.isFile()) throw new WorldError('NOT_FOUND', 'Không tìm thấy tài nguyên.', 404);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (extname(path)) throw new WorldError('NOT_FOUND', 'Không tìm thấy tài nguyên.', 404);
    target = resolve(root, 'index.html');
  }
  let realRoot, realTarget;
  try { [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)]); }
  catch (error) { if (error.code === 'ENOENT') throw new WorldError('NOT_FOUND', 'Chưa có bản web. Hãy chạy npm run build.', 404); throw error; }
  if (!below(realRoot, realTarget)) throw new WorldError('FORBIDDEN_PATH', 'Không được truy cập đường dẫn này.', 403);
  const data = await readFile(realTarget);
  response.writeHead(200, { 'Content-Type': MIME[extname(realTarget)] ?? 'application/octet-stream', 'Content-Length': data.length, 'Cache-Control': extname(realTarget) === '.html' ? 'no-cache' : 'public, max-age=3600' });
  response.end(request.method === 'HEAD' ? undefined : data);
}

/** Returns an unbound HTTP server; the caller owns listen/close lifecycle. */
export function createWorldServer({ store, authStore, dataFile = process.env.WORLD_DATA_FILE ?? DEFAULT_DATA, usersFile = process.env.AUTH_DATA_FILE ?? DEFAULT_USERS, staticDir = DEFAULT_STATIC, allowedOrigins, checkpointIntervalMs = 5000, simulationIntervalMs = 50, requireVerifiedWorld = process.env.WORLD_REQUIRE_AUTH === 'true' } = {}) {
  const world = store ?? new WorldStore({ filePath: dataFile });
  const auth = authStore ?? new AuthStore({ filePath: usersFile });
  const origins = new Set(allowedOrigins ?? [...DEFAULT_ORIGINS, ...(process.env.WORLD_ALLOWED_ORIGINS ?? '').split(',').map(o => o.trim()).filter(Boolean)]);
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = new URL(request.url, 'http://localhost');
      const isWorldApi = url.pathname === '/api/world' || url.pathname.startsWith('/api/world/');
      const isAuthApi = url.pathname === '/api/auth' || url.pathname.startsWith('/api/auth/');
      if (isWorldApi || isAuthApi) {
        const origin = request.headers.origin;
        const ownOrigin = `${request.socket.encrypted ? 'https' : 'http'}://${request.headers.host}`;
        if (origin) {
          if (!origins.has(origin) && origin !== ownOrigin && !isLoopbackOrigin(origin)) throw new WorldError('ORIGIN_FORBIDDEN', 'Nguồn truy cập chưa được máy chủ cho phép.', 403);
          response.setHeader('Access-Control-Allow-Origin', origin);
          response.setHeader('Vary', 'Origin');
          response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        }
        if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }

        if (isAuthApi) {
          switch (url.pathname) {
            case '/api/auth/world-session': {
              if (request.method !== 'POST') return method(response, 'POST');
              const token = bearer(request);
              const body = await readJson(request);
              const user = auth.getUserByToken(token);
              if (!user) throw new AuthError('UNAUTHORIZED', 'Cần đăng nhập Gmail để liên kết thế giới.', 401);
              json(response, 200, { token, snapshot: world.linkVerifiedAccount(user.id, user.name, body.guestToken) }); return;
            }
            case '/api/auth/send-otp': {
              if (request.method !== 'POST') return method(response, 'POST');
              const body = await readJson(request);
              const result = await auth.sendOtp(body.email, body.purpose, { ip: request.socket.remoteAddress });
              json(response, 200, result); return;
            }
            case '/api/auth/verify-otp': {
              if (request.method !== 'POST') return method(response, 'POST');
              const body = await readJson(request);
              const result = auth.verifyOtp(body.email, body.otp, { name: body.name, password: body.password, purpose: body.purpose });
              json(response, 200, result); return;
            }
            case '/api/auth/login': {
              if (request.method !== 'POST') return method(response, 'POST');
              const body = await readJson(request);
              const result = auth.login(body.email, body.password, { ip: request.socket.remoteAddress });
              json(response, 200, result); return;
            }
            case '/api/auth/me': {
              if (request.method !== 'GET') return method(response, 'GET');
              const token = bearer(request);
              const account = auth.getUserByToken(token);
              if (!account) throw new AuthError('UNAUTHORIZED', 'Phiên đăng nhập không tồn tại hoặc đã hết hạn.', 401);
              const { revision, ...user } = account;
              json(response, 200, { ok: true, user, revision }); return;
            }
            case '/api/auth/save-progress': {
              if (request.method !== 'POST') return method(response, 'POST');
              const token = bearer(request);
              const body = await readJson(request, MAX_AUTH_BODY_BYTES);
              const result = auth.saveProgress(token, body.progress, { expectedRevision: body.expectedRevision });
              json(response, 200, result); return;
            }
            case '/api/auth/logout': {
              if (request.method !== 'POST') return method(response, 'POST');
              const token = bearer(request);
              const result = auth.logout(token);
              json(response, 200, result); return;
            }
            default: throw new WorldError('NOT_FOUND', 'Không tìm thấy API xác thực.', 404);
          }
        }

        switch (url.pathname) {
          case '/api/world/field': {
            if (request.method !== 'GET') return method(response, 'GET');
            const token = bearer(request); const user = auth.getUserByToken(token);
            if (requireVerifiedWorld && !user) throw new WorldError('UNAUTHORIZED', 'Cần đăng nhập Gmail đã xác minh.', 401);
            json(response, 200, user ? world.fieldSnapshotForUser(user.id) : world.fieldSnapshot(token)); return;
          }
          case '/api/world/field/input': {
            if (request.method !== 'POST') return method(response, 'POST');
            const token = bearer(request); const body = await readJson(request); const user = auth.getUserByToken(token);
            if (requireVerifiedWorld && !user) throw new WorldError('UNAUTHORIZED', 'Cần đăng nhập Gmail đã xác minh.', 401);
            json(response, 200, user ? world.fieldInputForUser(user.id, body) : world.fieldInput(token, body)); return;
          }
          case '/api/world/health':
            if (request.method !== 'GET') return method(response, 'GET');
            json(response, 200, { ok: true, service: 'co-tien-lo-world' }); return;
          case '/api/world/session': {
            if (request.method !== 'POST') return method(response, 'POST');
            if (requireVerifiedWorld) throw new WorldError('AUTH_REQUIRED', 'Máy chủ yêu cầu Gmail đã xác minh. Hãy đăng nhập rồi chọn Liên kết Ngũ Vực.', 403);
            const body = await readJson(request);
            json(response, 201, world.createSession(body.name)); return;
          }
          case '/api/world':
            if (request.method !== 'GET') return method(response, 'GET');
            {
              const token = bearer(request);
              const user = auth.getUserByToken(token);
              if (requireVerifiedWorld && !user) throw new WorldError('UNAUTHORIZED', 'Cần đăng nhập Gmail đã xác minh.', 401);
              json(response, 200, user ? world.snapshotForUser(user.id) : world.snapshot(token)); return;
            }
          case '/api/world/command': {
            if (request.method !== 'POST') return method(response, 'POST');
            const token = bearer(request);
            const body = await readJson(request);
            const user = auth.getUserByToken(token);
            if (requireVerifiedWorld && !user) throw new WorldError('UNAUTHORIZED', 'Cần đăng nhập Gmail đã xác minh.', 401);
            json(response, 200, user ? world.executeForUser(user.id, body) : world.execute(token, body)); return;
          }
          default: throw new WorldError('NOT_FOUND', 'Không tìm thấy API.', 404);
        }
      }
      if (url.pathname.startsWith('/api/')) throw new WorldError('NOT_FOUND', 'Không tìm thấy API.', 404);
      await serveStatic(request, response, url.pathname, staticDir);
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      const isKnownWorld = error instanceof WorldError || error instanceof FieldError;
      const isKnownAuth = error instanceof AuthError;
      const status = isKnownWorld || isKnownAuth ? error.status : 500;
      const code = isKnownWorld || isKnownAuth ? error.code : 'INTERNAL_ERROR';
      const message = isKnownWorld || isKnownAuth ? error.message : 'Máy chủ chưa thể lưu thao tác. Hãy thử lại cùng mã lệnh.';
      json(response, status, { code, message });
    }
  });
  let checkpointTimer, simulationTimer;
  server.on('listening', () => {
    if (checkpointIntervalMs > 0) {
      checkpointTimer = setInterval(() => {
        try { world.checkpoint(); }
        catch (error) { server.emit('worldError', error); }
      }, checkpointIntervalMs);
      checkpointTimer.unref();
    }
    if (simulationIntervalMs > 0) {
      simulationTimer = setInterval(() => {
        try { world.tick(); }
        catch (error) { server.emit('worldError', error); }
      }, simulationIntervalMs);
      simulationTimer.unref();
    }
  });
  server.on('close', () => { clearInterval(checkpointTimer); clearInterval(simulationTimer); });
  return server;
}

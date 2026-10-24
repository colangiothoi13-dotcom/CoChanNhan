import type { CloudProgress } from './CloudProgress';
export interface UserAccount {
  id: string;
  email: string;
  name: string;
  verifiedAt: number;
}
export type ProgressPayload = CloudProgress;
type TokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
interface Options {
  storage?: TokenStorage | null;
  fetcher?: typeof fetch;
  endpoint?: string;
  timeoutMs?: number;
}
interface SessionResponse {
  ok: boolean;
  token: string;
  user: UserAccount;
  savedProgress: unknown | null;
  revision: number;
}
export class AuthError extends Error {
  constructor(message: string, public status = 0, public code = '') { super(message); }
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
function userFrom(value: unknown): UserAccount {
  if (!record(value) || typeof value.id !== 'string' || !value.id || typeof value.email !== 'string' || !value.email.includes('@') ||
    typeof value.name !== 'string' || !value.name || value.name.length > 120 || !count(value.verifiedAt))
    throw new Error('Phản hồi tài khoản không hợp lệ.');
  return { id: value.id, email: value.email, name: value.name, verifiedAt: value.verifiedAt };
}
export function authEndpointFrom(input: string): string {
  const text = input.trim();
  if (!text || text === '/api/auth' || text === '/api/world')
    return '/api/auth';
  let url: URL;
  try {
    url = new URL(text);
  }
  catch {
    throw new Error('Địa chỉ máy chủ cần bắt đầu bằng http:// hoặc https://.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('Địa chỉ máy chủ không hợp lệ.');
  let path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/api/world'))
    path = path.slice(0, -10) + '/api/auth';
  if (path && !path.endsWith('/api/auth'))
    throw new Error('Dùng địa chỉ gốc máy chủ hoặc đường dẫn /api/auth.');
  url.pathname = path || '/api/auth';
  return url.href.replace(/\/$/, '');
}
/** Credentials are scoped to one server. Restored identity is trusted only after /me succeeds. */
export class AuthClient {
  private token: string | null = null;
  private user: UserAccount | null = null;
  private lastProgress: unknown | null = null;
  private revision = 0;
  private storage: TokenStorage | null;
  private fetcher: typeof fetch;
  private base = '/api/auth';
  private timeoutMs: number;
  private generation = 0;
  private disposed = false;
  private requests = new Set<AbortController>();
  public warning: string | null = null;
  constructor(options: Options = {}) {
    this.storage = options.storage ?? null;
    if (options.storage === undefined) {
      try {
        this.storage = globalThis.localStorage ?? null;
      }
      catch {
        this.warning = 'Thiết bị không cho lưu phiên; phiên này chỉ giữ trong bộ nhớ.';
      }
    }
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 10000;
    let selected = options.endpoint;
    if (selected === undefined) {
      try {
        selected = this.storage?.getItem('cotienlo_auth_endpoint_v2') ?? this.storage?.getItem('cotienlo_world_endpoint_v1') ?? '';
      }
      catch {
        this.warning = 'Không đọc được bộ nhớ phiên trên thiết bị.';
      }
    }
    try {
      this.base = authEndpointFrom(selected ?? '');
    }
    catch {
      this.base = '/api/auth';
    }
    this.restoreToken();
  }
  get endpoint(): string { return this.base; }
  getToken(): string | null { return this.token; }
  getUser(): UserAccount | null { return this.user ? { ...this.user } : null; }
  getLastProgress(): unknown | null { return this.lastProgress === null ? null : structuredClone(this.lastProgress); }
  getProgressRevision(): number { return this.revision; }
  isAuthenticated(): boolean { return !!this.token && !!this.user && !this.disposed; }
  private get sessionKey(): string { return 'cotienlo_auth_session_v2:' + encodeURIComponent(this.base); }
  private restoreToken(): void {
    try {
      const token = this.storage?.getItem(this.sessionKey);
      this.token = token && token.length <= 512 ? token : null;
    }
    catch {
      this.warning = 'Không đọc được bộ nhớ phiên trên thiết bị.';
    }
  }
  private keepToken(): void {
    try {
      if (this.token)
        this.storage?.setItem(this.sessionKey, this.token);
      else
        this.storage?.removeItem(this.sessionKey);
    }
    catch {
      this.warning = 'Không lưu được phiên trên thiết bị; đăng nhập lại khi mở lại game.';
    }
  }
  private invalidate(): void {
    this.generation++;
    for (const request of this.requests)
      request.abort();
    this.requests.clear();
  }
  private clear(): void { this.token = null; this.user = null; this.lastProgress = null; this.revision = 0; this.keepToken(); }
  setEndpoint(value: string): void {
    const next = authEndpointFrom(value);
    if (next === this.base)
      return;
    this.invalidate();
    this.token = null;
    this.user = null;
    this.lastProgress = null;
    this.revision = 0;
    this.base = next;
    try {
      this.storage?.setItem('cotienlo_auth_endpoint_v2', next);
    }
    catch {
      this.warning = 'Địa chỉ máy chủ chỉ giữ trong phiên này.';
    }
    this.restoreToken();
  }
  private async request(path: string, init: RequestInit = {}, base = this.base): Promise<Record<string, unknown>> {
    if (this.disposed)
      throw new AuthError('Phiên đã đóng.');
    const generation = this.generation;
    const controller = new AbortController();
    this.requests.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interrupted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new AuthError('Yêu cầu đã bị hủy.')), { once: true });
      timer = setTimeout(() => { reject(new AuthError('Máy chủ phản hồi quá thời gian. Vui lòng thử lại.')); controller.abort(); }, this.timeoutMs);
    });
    try {
      const response = this.fetcher(base + path, { ...init, signal: controller.signal }).then(async (res) => {
        let data: unknown;
        try {
          data = await res.json();
        }
        catch {
          throw new AuthError('Máy chủ trả về dữ liệu không đọc được.', res.status);
        }
        return { res, data };
      });
      const { res, data } = await Promise.race([response, interrupted]);
      if (this.disposed || generation !== this.generation || controller.signal.aborted)
        throw new AuthError('Yêu cầu đã bị hủy.');
      if (!record(data))
        throw new AuthError('Phản hồi máy chủ không hợp lệ.', res.status);
      if (!res.ok)
        throw new AuthError(typeof data.message === 'string' ? data.message : 'Không thể hoàn tất yêu cầu.', res.status, typeof data.code === 'string' ? data.code : '');
      return data;
    }
    finally {
      clearTimeout(timer);
      this.requests.delete(controller);
    }
  }
  private post(path: string, body: unknown, token?: string | null): Promise<Record<string, unknown>> {
    return this.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  }
  async sendOtp(email: string, purpose: 'register' | 'login' = 'register'): Promise<{
    ok: boolean;
    message: string;
    cooldownSec: number;
  }> {
    const data = await this.post('/send-otp', { email, purpose });
    if (typeof data.message !== 'string' || !count(data.cooldownSec))
      throw new Error('Phản hồi gửi mã không hợp lệ.');
    return { ok: true, message: data.message, cooldownSec: data.cooldownSec };
  }
  private installSession(data: Record<string, unknown>): SessionResponse {
    if (typeof data.token !== 'string' || !data.token || data.token.length > 512 || !count(data.revision))
      throw new Error('Phản hồi phiên đăng nhập không hợp lệ.');
    const user = userFrom(data.user);
    this.token = data.token;
    this.user = user;
    this.lastProgress = data.savedProgress ?? null;
    this.revision = data.revision;
    this.keepToken();
    return { ok: true, token: this.token, user: { ...user }, savedProgress: this.getLastProgress(), revision: this.revision };
  }
  async verifyOtp(email: string, otp: string, options: {
    name?: string;
    password?: string;
    purpose?: 'register' | 'login';
  } = {}): Promise<SessionResponse> {
    this.invalidate();
    return this.installSession(await this.post('/verify-otp', { email, otp, ...options }));
  }
  async loginWithPassword(email: string, password: string): Promise<SessionResponse> {
    this.invalidate();
    return this.installSession(await this.post('/login', { email, password }));
  }
  async checkSession(): Promise<UserAccount | null> {
    if (!this.token) {
      this.user = null;
      return null;
    }
    try {
      const data = await this.request('/me', { headers: { Authorization: `Bearer ${this.token}` } });
      const user = userFrom(data.user);
      if (!count(data.revision))
        throw new Error('Phiên thiếu phiên bản bản lưu.');
      this.user = user;
      this.revision = data.revision;
      this.lastProgress = record(data.user) ? data.user.savedProgress ?? null : null;
      return { ...user };
    }
    catch (error) {
      if (error instanceof AuthError && error.status === 401) {
        this.invalidate();
        this.clear();
        return null;
      }
      throw error;
    }
  }
  async refreshProgress(): Promise<unknown | null> {
    if (!await this.checkSession())
      throw new Error('Vui lòng đăng nhập Gmail trước.');
    return this.getLastProgress();
  }
  async saveProgress(progress: CloudProgress): Promise<{
    ok: boolean;
    message: string;
    savedAt: number;
    revision: number;
  }> {
    if (!this.isAuthenticated())
      throw new Error('Vui lòng đăng nhập Gmail trước khi lưu bản luyện tập.');
    const data = await this.post('/save-progress', { progress, expectedRevision: this.revision }, this.token);
    if (!count(data.revision) || !count(data.savedAt))
      throw new Error('Phản hồi bản lưu không hợp lệ.');
    this.revision = data.revision;
    this.lastProgress = { ...structuredClone(progress), savedAt: data.savedAt };
    return { ok: true, message: typeof data.message === 'string' ? data.message : 'Đã lưu bản luyện tập trên máy chủ.', savedAt: data.savedAt, revision: this.revision };
  }
  async logout(): Promise<void> {
    const token = this.token;
    this.invalidate();
    this.clear();
    if (token && !this.disposed) {
      try {
        await this.post('/logout', {}, token);
      }
      catch { /* Local access is already cleared even while the server is unreachable. */ }
    }
  }
  destroy(): void {
    if (this.disposed)
      return;
    this.invalidate();
    this.disposed = true;
    this.token = null;
    this.user = null;
    this.lastProgress = null;
  }
}

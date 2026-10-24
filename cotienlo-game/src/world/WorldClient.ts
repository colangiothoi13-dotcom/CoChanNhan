import type { WorldAction, WorldClientState, WorldCommand, WorldSnapshot } from './types';
import { isFieldSnapshot, type FieldInput, type FieldSnapshot } from './field-types';

interface Options {
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & Partial<Pick<Storage, 'key' | 'length'>>;
  fetcher?: typeof fetch;
  pollMs?: number;
  timeoutMs?: number;
}

class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

function endpointFrom(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed === '/api/world') return '/api/world';
  let url: URL;
  try { url = new URL(trimmed); } catch { throw new Error('Địa chỉ máy chủ cần bắt đầu bằng http:// hoặc https://.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Địa chỉ máy chủ không hợp lệ. Dùng địa chỉ HTTP hoặc HTTPS, không kèm thông tin đăng nhập.');
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  if (pathname && !pathname.endsWith('/api/world')) throw new Error('Dùng địa chỉ gốc máy chủ hoặc đường dẫn kết thúc bằng /api/world.');
  url.pathname = pathname || '/api/world';
  return url.href.replace(/\/$/, '');
}

function isSnapshot(value: unknown): value is WorldSnapshot {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<WorldSnapshot>;
  return typeof data.world?.id === 'string' && Number.isSafeInteger(data.world.revision) &&
    typeof data.account?.id === 'string' && typeof data.life?.id === 'string' &&
    Number.isFinite(data.serverTime) && Array.isArray(data.catalog?.places) &&
    Array.isArray(data.catalog?.inheritances) && Array.isArray(data.account.journal) &&
    Array.isArray(data.events) && Array.isArray(data.presence) && Array.isArray(data.immortals);
}

/** The client stores only its server capability. World state is always returned by the service. */
export class WorldClient {
  private current: WorldClientState = { snapshot: null, connection: 'idle', busy: false, error: null, pending: false };
  private listeners = new Set<(state: WorldClientState) => void>();
  private storage: Options['storage'];
  private fetcher: typeof fetch;
  private pollMs: number;
  private timeoutMs: number;
  private base = '/api/world';
  private token: string | null = null;
  private pendingCommand: WorldCommand | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private requests = new Set<AbortController>();
  private generation = 0;
  private disposed = false;
  private linkingVerified = false;

  constructor(options: Options = {}) {
    this.storage = options.storage;
    if (!this.storage) {
      try { this.storage = globalThis.localStorage; } catch { /* browser privacy settings may block even the getter */ }
    }
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.pollMs = options.pollMs ?? 2000;
    this.timeoutMs = options.timeoutMs ?? 10000;
    try { this.base = endpointFrom(this.storage?.getItem('cotienlo_world_endpoint_v1') ?? ''); } catch { /* use same origin */ }
  }

  get state(): WorldClientState { return this.current; }
  get endpoint(): string { return this.base; }

  subscribe(listener: (state: WorldClientState) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }

  private emit(patch: Partial<WorldClientState>): void {
    if (this.disposed) return;
    this.current = { ...this.current, ...patch };
    for (const listener of this.listeners) listener(this.current);
  }

  setEndpoint(value: string): void {
    const endpoint = endpointFrom(value);
    if (endpoint === this.base) return;
    this.generation++;
    this.cancelRequests();
    this.linkingVerified = false;
    this.base = endpoint;
    this.token = null;
    this.pendingCommand = null;
    try { this.storage?.setItem('cotienlo_world_endpoint_v1', endpoint); } catch { /* current session still works */ }
    this.emit({ snapshot: null, connection: 'idle', busy: false, error: null, pending: false });
  }

  private get sessionKey(): string { return 'cotienlo_world_session_v1:' + encodeURIComponent(this.base); }
  private get pendingKey(): string { return this.sessionKey + ':pending'; }

  private keepPending(command: WorldCommand | null): void {
    const previous = this.pendingCommand;
    this.pendingCommand = command;
    try {
      // One key per operation avoids read/modify/write races between separate tabs.
      if (command) this.storage?.setItem(this.pendingKey + ':' + command.operationId, JSON.stringify(command));
      else if (previous) {
        this.storage?.removeItem(this.pendingKey + ':' + previous.operationId);
        const raw = this.storage?.getItem(this.pendingKey);
        if (raw) {
          const legacy = JSON.parse(raw) as WorldCommand;
          if (legacy.operationId === previous.operationId) this.storage?.removeItem(this.pendingKey);
        }
      }
    } catch { /* retries within this page remain safe */ }
  }

  private readPending(): WorldCommand[] {
    const values: WorldCommand[] = [];
    try {
      const keys = [this.pendingKey];
      if (this.storage?.key && typeof this.storage.length === 'number') {
        for (let index = 0; index < this.storage.length; index++) {
          const key = this.storage.key(index);
          if (key?.startsWith(this.pendingKey + ':')) keys.push(key);
        }
      }
      for (const key of keys) {
        const raw = this.storage?.getItem(key);
        if (!raw) continue;
        try {
          const saved = JSON.parse(raw) as WorldCommand;
          if (typeof saved.operationId === 'string' && typeof saved.lifeId === 'string' && typeof saved.action?.type === 'string') values.push(saved);
        } catch { /* a broken cache entry never becomes a command */ }
      }
    } catch { /* restricted storage still allows an in-memory session */ }
    return values;
  }

  private acknowledgePending(): void {
    this.keepPending(null);
    this.pendingCommand = this.readPending()[0] ?? null;
  }

  private accept(snapshot: unknown): WorldSnapshot {
    if (!isSnapshot(snapshot)) throw new ApiError('Máy chủ trả dữ liệu không hợp lệ. Hãy kiểm tra địa chỉ hoặc phiên bản game.');
    const previous = this.current.snapshot;
    if (!previous || previous.world.id !== snapshot.world.id || snapshot.world.revision >= previous.world.revision) {
      this.emit({ snapshot, connection: 'online', error: null });
    }
    return snapshot;
  }

  private async request(path = '', body?: unknown, token = this.token, base = this.base): Promise<unknown> {
    const controller = new AbortController();
    this.requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await this.fetcher(base + path, {
        method: body === undefined ? 'GET' : 'POST', headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal, cache: 'no-store', credentials: 'omit',
      });
      let data: unknown;
      try { data = await response.json(); } catch { throw new ApiError('Không đọc được phản hồi máy chủ. Tiến trình vẫn do máy chủ lưu.', response.status >= 400 ? response.status : 0); }
      if (!response.ok) {
        const message = data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
          ? data.message : 'Máy chủ chưa thể xử lý yêu cầu này.';
        throw new ApiError(message, response.status);
      }
      return data;
    } finally {
      clearTimeout(timeout);
      this.requests.delete(controller);
    }
  }

  async requestField(input?: FieldInput): Promise<FieldSnapshot> {
    if (!this.token || this.disposed) throw new Error('Hãy đăng nhập hoặc tạo nhân vật để vào Ngũ Vực.');
    const generation = this.generation;
    const value = await this.request(input ? '/field/input' : '/field', input);
    if (generation !== this.generation || this.disposed) throw new Error('Phiên thế giới đã thay đổi.');
    if (!isFieldSnapshot(value)) throw new Error('Máy chủ chưa hỗ trợ bản đồ trực tiếp hoặc trả dữ liệu không hợp lệ.');
    return value;
  }

  private message(error: unknown): string {
    return error instanceof ApiError ? error.message : 'Mất kết nối máy chủ. Hãy kết nối lại; cuộc đời và khảo nghiệm vẫn được lưu.';
  }

  /** Explicitly prove guest custody; the server owns the binding and every world balance. */
  async linkVerifiedAccount(authToken: string, authEndpoint: string): Promise<void> {
    if (this.disposed || this.current.busy) throw new Error('Hãy đợi thao tác thế giới hiện tại kết thúc.');
    if (!authToken || !authEndpoint.endsWith('/api/auth')) throw new Error('Phiên hoặc địa chỉ tài khoản không hợp lệ.');
    this.setEndpoint(authEndpoint.slice(0, -'/api/auth'.length) + '/api/world');
    const wasLinked = this.current.snapshot?.account.verified || this.readLinkedMarker();
    const guestToken = wasLinked ? undefined : (this.token ?? this.readToken() ?? undefined);
    const generation = ++this.generation;
    this.cancelRequests();
    this.linkingVerified = true;
    this.emit({ busy: true, error: null });
    try {
      const result = await this.request('/world-session', { ...(guestToken ? { guestToken } : {}) }, authToken, authEndpoint) as { token?: unknown; snapshot?: unknown };
      if (generation !== this.generation || this.disposed) throw new Error('Thao tác liên kết đã bị hủy.');
      if (result.token !== authToken || !isSnapshot(result.snapshot) || !result.snapshot.account.verified) throw new Error('Máy chủ chưa xác nhận liên kết tài khoản.');
      this.token = authToken;
      let warning: string | null = null;
      try {
        if (!this.storage) throw new Error('Storage unavailable');
        this.storage.setItem(this.sessionKey, authToken);
        this.storage.setItem(this.sessionKey + ':verified', '1');
      } catch { warning = 'Không lưu được phiên trên thiết bị. Lần tới hãy đăng nhập Gmail để mở lại Ngũ Vực.'; }
      this.pendingCommand = this.readPending().find(command => command.lifeId === (result.snapshot as WorldSnapshot).life.id) ?? null;
      this.accept(result.snapshot);
      this.emit({ pending: !!this.pendingCommand, error: warning });
    } catch (error) {
      if (generation === this.generation) this.emit({ error: error instanceof Error ? error.message : 'Không thể liên kết Ngũ Vực.' });
      throw error;
    } finally {
      if (generation === this.generation) { this.linkingVerified = false; this.emit({ busy: false }); this.schedule(); }
    }
  }

  private readLinkedMarker(): boolean {
    try { return this.storage?.getItem(this.sessionKey + ':verified') === '1'; } catch { return false; }
  }

  disconnectVerifiedAccount(): void {
    if (!this.linkingVerified && !this.current.snapshot?.account.verified && !this.readLinkedMarker()) return;
    this.generation++;
    this.cancelRequests();
    this.linkingVerified = false;
    this.token = null;
    this.pendingCommand = null;
    try {
      this.storage?.removeItem(this.sessionKey);
      this.storage?.removeItem(this.sessionKey + ':verified');
    } catch { /* the server still revokes the auth session on logout */ }
    this.emit({ snapshot: null, connection: 'idle', busy: false, pending: false, error: null });
  }

  async join(name: string): Promise<void> {
    if (this.disposed || this.current.busy) return;
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 32) {
      this.emit({ error: 'Tên Cổ Sư cần từ 2 đến 32 ký tự.' });
      return;
    }
    // A saved identity must be resumed instead of silently creating a second life/account.
    if (this.token || this.readToken()) { await this.restore(); return; }
    const generation = this.generation;
    this.emit({ busy: true, connection: 'connecting', error: null });
    try {
      const data = await this.request('/session', { name: trimmed }) as { token?: unknown; snapshot?: unknown };
      if (generation !== this.generation || this.disposed) return;
      if (typeof data.token !== 'string' || data.token.length < 8 || !isSnapshot(data.snapshot)) throw new ApiError('Không tạo được phiên chơi hợp lệ.');
      this.token = data.token;
      let storageError: string | null = this.storage ? null : 'Thiết bị không lưu được phiên đăng nhập. Đừng đóng trang trước khi cho phép lưu trữ.';
      try { this.storage?.setItem(this.sessionKey, data.token); } catch { storageError = 'Thiết bị không lưu được phiên đăng nhập. Đừng đóng trang trước khi cho phép lưu trữ.'; }
      this.accept(data.snapshot);
      this.emit({ error: storageError });
    } catch (error) {
      if (generation === this.generation) this.emit({ connection: 'offline', error: this.message(error) });
    } finally {
      if (generation === this.generation) { this.emit({ busy: false }); this.schedule(); }
    }
  }

  private readToken(): string | null {
    try {
      const value = this.storage?.getItem(this.sessionKey);
      return typeof value === 'string' && value.length >= 8 && value.length <= 256 ? value : null;
    } catch { return null; }
  }

  async restore(): Promise<void> {
    if (this.disposed || this.current.busy) return;
    this.token ??= this.readToken();
    if (!this.token) { this.emit({ connection: 'idle', error: null }); return; }
    this.pendingCommand ??= this.readPending()[0] ?? null;
    const generation = this.generation;
    this.emit({ busy: true, connection: 'connecting', error: null, pending: !!this.pendingCommand });
    try {
      const snapshot = await this.request();
      if (generation === this.generation && !this.disposed) this.accept(snapshot);
    } catch (error) {
      if (generation === this.generation) {
        if (error instanceof ApiError && error.status === 401) {
          this.token = null;
          this.keepPending(null);
          try { this.storage?.removeItem(this.sessionKey); } catch { /* local session already invalid */ }
          this.emit({ snapshot: null, connection: 'idle', pending: false, error: 'Phiên đã hết hiệu lực. Bạn có thể bắt đầu một tài khoản khách mới.' });
        } else this.emit({ connection: 'offline', error: this.message(error) });
      }
    } finally {
      if (generation === this.generation) { this.emit({ busy: false }); this.schedule(); }
    }
  }

  async act(action: WorldAction): Promise<void> {
    if (this.disposed || this.current.busy) return;
    if (this.pendingCommand) { this.emit({ error: 'Cần xác nhận kết quả lệnh trước bằng nút Thử lại.' }); return; }
    if (!this.token || !this.current.snapshot) { this.emit({ error: 'Hãy kết nối thế giới trước khi hành động.' }); return; }
    const operationId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID()
      : Date.now().toString(36) + '-' + Array.from(crypto.getRandomValues(new Uint32Array(3)), n => n.toString(36)).join('-');
    this.keepPending({ operationId, lifeId: this.current.snapshot.life.id, action });
    await this.submitPending();
  }

  async retry(): Promise<void> {
    if (this.pendingCommand) await this.submitPending();
    else await this.restore();
  }

  private async submitPending(): Promise<void> {
    if (this.disposed || this.current.busy || !this.pendingCommand) return;
    const generation = this.generation;
    const command = this.pendingCommand;
    this.emit({ busy: true, error: null, pending: true });
    try {
      const snapshot = await this.request('/command', command);
      if (generation !== this.generation || this.disposed) return;
      this.accept(snapshot);
      this.acknowledgePending();
      this.emit({ pending: !!this.pendingCommand, error: null });
    } catch (error) {
      if (generation === this.generation) {
        const definiteRejection = error instanceof ApiError && error.status >= 400 && error.status < 500;
        if (definiteRejection) this.acknowledgePending();
        this.emit({ connection: definiteRejection ? 'online' : 'offline', pending: !!this.pendingCommand, error: this.message(error) });
      }
    } finally {
      if (generation === this.generation) { this.emit({ busy: false }); this.schedule(); }
    }
  }

  private schedule(): void {
    clearTimeout(this.timer);
    if (this.disposed || !this.token) return;
    this.timer = setTimeout(() => { void this.poll(); }, this.pollMs);
  }

  private async poll(): Promise<void> {
    if (this.disposed) return;
    if (this.current.busy) { this.schedule(); return; }
    const generation = this.generation;
    try {
      const snapshot = await this.request();
      if (generation === this.generation && !this.disposed) this.accept(snapshot);
    } catch (error) {
      if (generation === this.generation) this.emit({ connection: 'offline', error: this.message(error) });
    } finally { if (generation === this.generation) this.schedule(); }
  }

  private cancelRequests(): void {
    clearTimeout(this.timer);
    for (const controller of this.requests) controller.abort();
    this.requests.clear();
  }

  destroy(): void {
    this.disposed = true;
    this.generation++;
    this.cancelRequests();
    this.listeners.clear();
  }
}

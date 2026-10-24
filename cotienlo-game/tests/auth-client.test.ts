import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthClient } from '../src/systems/AuthClient';
const user = { id: 'u1', email: 'player@gmail.com', name: 'Cổ Sư', verifiedAt: 123 };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function storage() { const values = new Map<string, string>(); return { values, getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } }; }
const session = (extra = {}) => ({ ok: true, token: 'session-token', user, savedProgress: null, revision: 0, ...extra });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('Gmail auth session boundaries', () => {
  it('times out when response headers arrive but the JSON body stalls', async () => {
    vi.useFakeTimers();
    let release!: (data: unknown) => void;
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: () => new Promise(resolve => { release = resolve; }) } as Response));
    const client = new AuthClient({ storage: null, fetcher, timeoutMs: 50 });
    const request = client.verifyOtp(user.email, '123456');
    const assertion = expect(request).rejects.toThrow(/quá|thời gian/i);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
    release(session());
    await Promise.resolve();
    expect(client.isAuthenticated()).toBe(false);
    client.destroy();
  });
  it('scopes restored tokens to the canonical server and never trusts cached user data', async () => {
    const disk = storage();
    const fetcher = vi.fn(async () => response(session()));
    const a = new AuthClient({ storage: disk, fetcher, endpoint: 'https://one.example' });
    await a.verifyOtp(user.email, '123456', { purpose: 'register' });
    expect(a.isAuthenticated()).toBe(true);
    const restored = new AuthClient({ storage: disk, fetcher, endpoint: 'https://one.example/api/auth' });
    expect(restored.getToken()).toBe('session-token');
    expect(restored.getUser()).toBeNull();
    const other = new AuthClient({ storage: disk, fetcher, endpoint: 'https://two.example' });
    expect(other.getToken()).toBeNull();
    a.destroy();
    restored.destroy();
    other.destroy();
  });
  it('clears logout locally immediately and ignores a late login response', async () => {
    let finish!: (r: Response) => void;
    const disk = storage();
    const client = new AuthClient({ storage: disk, fetcher: vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })) });
    const pending = client.verifyOtp(user.email, '123456').catch(() => null);
    await client.logout();
    finish(response(session()));
    await pending;
    expect(client.isAuthenticated()).toBe(false);
    expect(client.getToken()).toBeNull();
    client.destroy();
  });
  it('uses server revision and refuses stale overwrites without rebasing', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/verify-otp'))
        return response(session({ revision: 7 }));
      expect(JSON.parse(String(init?.body)).expectedRevision).toBe(7);
      return response({ message: 'Có bản lưu mới hơn', code: 'PROGRESS_CONFLICT' }, 409);
    });
    const client = new AuthClient({ storage: storage(), fetcher });
    await client.verifyOtp(user.email, '123456');
    await expect(client.saveProgress({ schemaVersion: 1 } as never)).rejects.toThrow('Có bản lưu mới hơn');
    expect(client.getProgressRevision()).toBe(7);
    expect(fetcher).toHaveBeenCalledTimes(2);
    client.destroy();
  });
  it('does not authenticate cached identities without a token and survives blocked storage', async () => {
    const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    const client = new AuthClient({ storage: blocked, fetcher: vi.fn(async () => response(session())) });
    expect(await client.checkSession()).toBeNull();
    await client.verifyOtp(user.email, '123456');
    expect(client.isAuthenticated()).toBe(true);
    expect(client.warning).toBeTruthy();
    await client.logout();
    client.destroy();
  });
  it('aborts timed out requests and never installs a late session', async () => {
    vi.useFakeTimers();
    let finish!: (r: Response) => void;
    const client = new AuthClient({ storage: storage(), timeoutMs: 50, fetcher: vi.fn(() => new Promise<Response>(r => { finish = r; })) });
    const request = client.verifyOtp(user.email, '123456');
    const assertion = expect(request).rejects.toThrow(/quá|thời gian/i);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
    finish(response(session()));
    await Promise.resolve();
    expect(client.isAuthenticated()).toBe(false);
    client.destroy();
  });
  it('handles unauthorized separately from an offline session check', async () => {
    let status = 200;
    const client = new AuthClient({ storage: storage(), fetcher: vi.fn(async (url: string | URL | Request) => {
        if (String(url).endsWith('/verify-otp'))
          return response(session());
        if (status === 0)
          throw new Error('offline');
        return response({ message: 'hết phiên' }, 401);
      }) });
    await client.verifyOtp(user.email, '123456');
    status = 0;
    await expect(client.checkSession()).rejects.toThrow();
    expect(client.getToken()).toBe('session-token');
    status = 401;
    expect(await client.checkSession()).toBeNull();
    expect(client.getToken()).toBeNull();
    client.destroy();
  });
  it('rejects endpoint credentials or query and discards responses from the previous endpoint', async () => {
    let finish!: (r: Response) => void;
    const client = new AuthClient({ storage: storage(), fetcher: vi.fn(() => new Promise<Response>(r => { finish = r; })) });
    expect(() => client.setEndpoint('https://user:pass@example.com')).toThrow();
    expect(() => client.setEndpoint('https://example.com?token=x')).toThrow();
    const pending = client.verifyOtp(user.email, '123456').catch(() => null);
    client.setEndpoint('https://another.example');
    finish(response(session()));
    await pending;
    expect(client.getToken()).toBeNull();
    expect(client.endpoint).toBe('https://another.example/api/auth');
    client.destroy();
  });
});

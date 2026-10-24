import { afterEach, describe, expect, it, vi } from 'vitest';

const sample = (revision = 1) => ({
  world: { id: 'w', name: 'Ngũ Vực', day: 1, revision },
  account: { id: 'a', name: 'A', journal: [], pastLives: [] },
  life: { id: 'life-1', number: 1, name: 'A', originId: 'south', placeId: 'south-1', hp: 100,
    energy: 100, supplies: 8, stones: 20, rank: 1, skills: {}, discovered: ['south-1'],
    investigated: [], learned: [], gu: [], trained: [], lessons: [], dead: false, cause: null, trial: null },
  catalog: { regions: [], places: [], inheritances: [], legends: [], origins: [] },
  inheritanceStates: {}, immortals: [], events: [], presence: [], remains: [], serverTime: 1000,
});
function storage() {
  const items = new Map<string, string>();
  return { get length() { return items.size; }, key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => { items.set(k, v); }, removeItem: (k: string) => { items.delete(k); } };
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe('world client', () => {
  afterEach(() => vi.useRealTimers());

  it('links a proved guest to verified auth, then clears linked identity immediately on logout', async () => {
    const { WorldClient } = await import('../src/world/WorldClient');
    const saved = storage();
    const linked = { ...sample(4), account: { ...sample().account, verified: true } };
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/world-session')) {
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer auth-session-token');
        expect(JSON.parse(String(init?.body))).toEqual({ guestToken: 'private-guest-token' });
        return json({ token: 'auth-session-token', snapshot: linked });
      }
      if (String(url).endsWith('/session')) return json({ token: 'private-guest-token', snapshot: sample() });
      return json(linked);
    });
    const client = new WorldClient({ storage: saved, fetcher, pollMs: 100000 });
    await client.join('An');
    await client.linkVerifiedAccount('auth-session-token', '/api/auth');
    expect(client.state.snapshot?.account.verified).toBe(true);
    client.disconnectVerifiedAccount();
    expect(client.state.snapshot).toBeNull();
    const count = fetcher.mock.calls.length;
    await client.restore();
    expect(fetcher).toHaveBeenCalledTimes(count);
    client.destroy();
  });

  it('does not send a previous server guest token when connecting another verified server', async () => {
    const { WorldClient } = await import('../src/world/WorldClient');
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/world-session')) {
        expect(String(url)).toBe('https://world.example/api/auth/world-session');
        expect(JSON.parse(String(init?.body))).toEqual({});
        return json({ token: 'auth-new-server-token', snapshot: { ...sample(5), account: { ...sample().account, verified: true } } });
      }
      return json({ token: 'private-guest-token', snapshot: sample() });
    });
    const client = new WorldClient({ storage: storage(), fetcher, pollMs: 100000 });
    await client.join('An');
    await client.linkVerifiedAccount('auth-new-server-token', 'https://world.example/api/auth');
    expect(client.endpoint).toBe('https://world.example/api/world');
    client.destroy();
  });

  it('ignores a delayed verified binding response after logout', async () => {
    const { WorldClient } = await import('../src/world/WorldClient');
    let deliver: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/world-session')) return new Promise<Response>(resolve => { deliver = resolve; });
      return json({ token: 'private-guest-token', snapshot: sample() });
    });
    const client = new WorldClient({ storage: storage(), fetcher, pollMs: 100000 });
    await client.join('An');
    const linking = client.linkVerifiedAccount('auth-session-token', '/api/auth');
    client.disconnectVerifiedAccount();
    deliver!(json({ token: 'auth-session-token', snapshot: { ...sample(8), account: { ...sample().account, verified: true } } }));
    await expect(linking).rejects.toThrow();
    expect(client.state.snapshot).toBeNull();
    expect(client.state.busy).toBe(false);
    client.destroy();
  });

  it('preserves the current guest capability when Gmail is bound to another character', async () => {
    const { WorldClient } = await import('../src/world/WorldClient');
    const saved = storage();
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/world-session')) return json({ message: 'Gmail đã có nhân vật khác.' }, 409);
      if (String(url).endsWith('/session')) return json({ token: 'existing-guest-capability', snapshot: sample() });
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer existing-guest-capability');
      return json(sample(2));
    });
    const client = new WorldClient({ storage: saved, fetcher, pollMs: 100000 });
    await client.join('An');
    await expect(client.linkVerifiedAccount('auth-session-token', '/api/auth')).rejects.toThrow('nhân vật khác');
    client.destroy();
    const restored = new WorldClient({ storage: saved, fetcher, pollMs: 100000 });
    await restored.restore();
    expect(restored.state.snapshot?.life.id).toBe('life-1');
    restored.destroy();
  });

  it('resumes the server identity after reload without importing a local game save', async () => {
    const { WorldClient } = await import('../src/world/WorldClient');
    const saved = storage();
    let createCount = 0;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') { createCount++; return json({ token: 'secret-capability', snapshot: sample() }); }
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-capability');
      return json(sample(2));
    });
    const client = new WorldClient({ storage: saved, fetcher, pollMs: 100000 });
    await client.join('An');
    client.destroy();
    const resumed = new WorldClient({ storage: saved, fetcher, pollMs: 100000 });
    await resumed.restore();
    expect(createCount).toBe(1);
    expect(resumed.state.snapshot?.world.revision).toBe(2);
    expect(resumed.state.connection).toBe('online');
    resumed.destroy();
  });

  it('retries an uncertain mutation with exactly the same operation and life IDs', async () => {
    const { WorldClient } = await import('../src/world/WorldClient');
    const commands: unknown[] = [];
    let attempts = 0;
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/session')) return json({ token: 'test-token-capability', snapshot: sample() });
      commands.push(JSON.parse(String(init?.body)));
      if (++attempts === 1) throw new TypeError('response lost');
      return json(sample(2));
    });
    const client = new WorldClient({ storage: storage(), fetcher, pollMs: 100000 });
    await client.join('An');
    await client.act({ type: 'investigate', payload: {} });
    expect(client.state.pending).toBe(true);
    await client.retry();
    expect(commands).toHaveLength(2);
    expect(commands[1]).toEqual(commands[0]);
    expect(commands[0]).toMatchObject({ lifeId: 'life-1', action: { type: 'investigate' } });
    expect(client.state.pending).toBe(false);
    client.destroy();
  });

  it('does not send an existing capability to a different server', async () => {
    const { WorldClient } = await import('../src/world/WorldClient');
    const fetcher = vi.fn(async () => json({ token: 'private-capability', snapshot: sample() }));
    const client = new WorldClient({ storage: storage(), fetcher, pollMs: 100000 });
    await client.join('An');
    client.setEndpoint('http://127.0.0.1:9999');
    await client.restore();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.state.snapshot).toBeNull();
    expect(client.state.connection).toBe('idle');
    client.destroy();
  });

  it('times out requests and does not keep polling after destroy', async () => {
    vi.useFakeTimers();
    const { WorldClient } = await import('../src/world/WorldClient');
    const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const client = new WorldClient({ storage: storage(), fetcher, timeoutMs: 50, pollMs: 100 });
    const joining = client.join('An');
    await vi.advanceTimersByTimeAsync(60);
    await joining;
    expect(client.state.connection).toBe('offline');
    expect(client.state.busy).toBe(false);
    client.destroy();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps an unresolved operation when another tab acknowledges its own action', async () => {
    const { WorldClient } = await import('../src/world/WorldClient');
    const saved = storage();
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/session')) return json({ token: 'shared-tab-capability', snapshot: sample() });
      if (!init?.body) return json(sample(2));
      const request = JSON.parse(String(init.body));
      if (request.action.type === 'work') throw new TypeError('work response lost after commit');
      return json(sample(3));
    });
    const first = new WorldClient({ storage: saved, fetcher, pollMs: 100000 });
    await first.join('An');
    const second = new WorldClient({ storage: saved, fetcher, pollMs: 100000 });
    await second.restore();
    await first.act({ type: 'work', payload: {} });
    await second.act({ type: 'rest', payload: {} });
    first.destroy(); second.destroy();
    const reloaded = new WorldClient({ storage: saved, fetcher, pollMs: 100000 });
    await reloaded.restore();
    expect(reloaded.state.pending).toBe(true);
    reloaded.destroy();
  });

  it('can join with an in-memory session when the browser blocks access to localStorage', async () => {
    const { WorldClient } = await import('../src/world/WorldClient');
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
    let client: InstanceType<typeof WorldClient> | undefined;
    try {
      client = new WorldClient({ fetcher: async () => json({ token: 'memory-only-capability', snapshot: sample() }), pollMs: 100000 });
      await client.join('An');
      expect(client.state.connection).toBe('online');
      expect(client.state.snapshot?.life.id).toBe('life-1');
      expect(client.state.error).toContain('không lưu');
    } finally {
      client?.destroy();
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});

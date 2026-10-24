import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '../src/systems/AuthClient';
import type { CloudProgress } from '../src/systems/CloudProgress';
import type { Cultivator } from '../src/entities/Cultivator';
import { browserFixture } from './browser-fixture';
const hook = vi.hoisted(() => ({ client: null as AuthClient | null, capture: null as (() => CloudProgress) | null, apply: null as ((progress: CloudProgress) => void) | null }));
vi.mock('../src/ui/AuthModal', async (importOriginal) => {
  const { AuthModal } = await importOriginal<typeof import('../src/ui/AuthModal')>();
  return { AuthModal: class extends AuthModal {
      constructor(client: AuthClient, options: ConstructorParameters<typeof AuthModal>[1]) { super(client, options); hook.client = client; hook.capture = options?.onGetProgress ?? null; hook.apply = options?.onProgressLoaded ?? null; }
    } };
});
vi.mock('../src/world/bootstrap', () => ({ connectVerifiedWorld: vi.fn(async () => { }), disconnectVerifiedWorld: vi.fn() }));
const SAVE = 'cotienlo_save_v1';
describe('full practice account save integration', () => {
  let browser: ReturnType<typeof browserFixture>;
  let player: Cultivator;
  beforeEach(() => { vi.useFakeTimers(); vi.resetModules(); browser = browserFixture(); vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, token: 'token', user: { id: 'u1', name: 'Player', email: 'player@gmail.com', verifiedAt: 1 }, savedProgress: null, revision: 0 }), { headers: { 'Content-Type': 'application/json' } }))); });
  afterEach(() => { browser.win.dispatchEvent(new Event('cotienlo:destroy')); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  async function boot() { const { Cultivator } = await import('../src/entities/Cultivator'); const { GameMap } = await import('../src/engine/Map'); vi.spyOn(Cultivator.prototype, 'render').mockImplementation(function () { player = this; }); vi.spyOn(GameMap.prototype, 'render').mockImplementation(() => { }); vi.spyOn(GameMap.prototype, 'renderLighting').mockImplementation(() => { }); await import('../src/main'); browser.win.dispatchEvent(new Event('DOMContentLoaded')); browser.frame(performance.now()); await hook.client!.verifyOtp('player@gmail.com', '123456'); }
  function incoming(): CloudProgress {
    const progress = structuredClone(hook.capture!());
    const save = progress.localSave;
    save.realm = 'Nhất Chuyển Cao Giai';
    save.hp = 0;
    save.mp = 17;
    save.stamina = 13;
    save.x = 400;
    save.y = 500;
    save.stones = 71;
    save.ownedGuIds = ['bronze'];
    save.items = [];
    save.guHunger.moonlight = 23;
    save.chapter = 2;
    save.wolfKills = 2;
    save.herbsCollected = 2;
    save.chapterRewardClaimed = false;
    save.questCount = 0;
    save.hasRefinedGu = false;
    save.questRewardClaimed = true;
    const death = { lifeNumber: 3, causeOfDeath: 'Độc khí', deathX: 400, deathY: 500, realmReached: save.realm, monstersSlain: 9, timeSurvivedSeconds: 93, primevalStonesLeft: 10, timestamp: 1 };
    save.localLife = { lifeNumber: 3, origin: 'scholar', death, timeSurvivedSeconds: 93, monstersSlain: 9, remains: [{ x: 400, y: 500, lifeNumber: 3, primevalStones: 10, durability: 80 }] };
    progress.soulChronicle = { totalLives: 4, unlockedGuRecipes: ['moonblade'], discoveredSecretLore: ['Bí mật'], pastLives: [death] };
    return progress;
  }
  it('restores a dead life and empty inventory without reviving, minting starters or losing journal; live references remain valid', async () => {
    await boot();
    const reference = player;
    const data = incoming();
    hook.apply!(data);
    expect(player).toBe(reference);
    expect(player.hp).toBe(0);
    expect(player.mp).toBe(17);
    expect(player.stamina).toBe(13);
    expect(player.x).toBe(400);
    const actual = hook.capture!();
    expect({ ...actual.localSave, savedAt: 0 }).toEqual({ ...data.localSave, savedAt: 0 });
    expect(actual.soulChronicle).toEqual(data.soulChronicle);
    const saved = JSON.parse(browser.storage.getItem(SAVE)!);
    expect(saved.hp).toBe(0);
    expect(saved.items).toEqual([]);
    expect(saved.ownedGuIds).toEqual(['bronze']);
    browser.win.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(browser.storage.getItem(SAVE)!).hp).toBe(0);
  });
  it('retains a verified recovery snapshot under endpoint and account before replacing the local save', async () => {
    await boot();
    const previous = hook.capture!();
    const set = vi.spyOn(browser.storage, 'setItem');
    hook.apply!(incoming());
    const backup = set.mock.calls.find(([key]) => key.startsWith('cotienlo_cloud_backup_v1:'))!;
    expect(backup[0]).toContain(encodeURIComponent('/api/auth') + ':u1:');
    const retained = JSON.parse(backup[1]);
    expect({ ...retained.localSave, savedAt: 0 }).toEqual({ ...previous.localSave, savedAt: 0 });
    expect(retained.soulChronicle).toEqual(previous.soulChronicle);
  });
  it('blocks import when storage cannot retain the required backup and leaves live state unchanged', async () => {
    await boot();
    const previous = hook.capture!();
    vi.spyOn(browser.storage, 'setItem').mockImplementation(() => { throw new Error('disk full'); });
    expect(() => hook.apply!(incoming())).toThrow(/sao lưu/);
    expect(hook.capture!()).toEqual(previous);
    expect(player.hp).toBeGreaterThan(0);
  });
  it('rejects partial data without mutating live state or the current local save', async () => {
    await boot();
    const previous = hook.capture!();
    const disk = browser.storage.getItem(SAVE);
    expect(() => hook.apply!({ schemaVersion: 1, localSave: { stones: 1 } } as CloudProgress)).toThrow();
    expect(hook.capture!()).toEqual(previous);
    expect(browser.storage.getItem(SAVE)).toBe(disk);
  });
});

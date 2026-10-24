import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cultivator } from '../src/entities/Cultivator';
import { GuSystem } from '../src/systems/GuSystem';
import { InventorySystem } from '../src/systems/InventorySystem';
import { StorageSystem } from '../src/systems/StorageSystem';
import { SoulChronicle } from '../src/systems/SoulChronicle';

const death = {
  lifeNumber: 2, causeOfDeath: 'Độc khí <khảo nghiệm>', deathX: 700, deathY: 900,
  realmReached: 'Nhất Chuyển Cao Giai', monstersSlain: 11,
  timeSurvivedSeconds: 132.5, primevalStonesLeft: 12, timestamp: 12345,
};
const localLife = {
  lifeNumber: 2, origin: 'scholar' as const, death,
  timeSurvivedSeconds: 132.5, monstersSlain: 11,
  remains: [{ x: 700, y: 900, lifeNumber: 2, primevalStones: 12, durability: 75.5 }],
};
const chronicle = {
  totalLives: 3, unlockedGuRecipes: ['moonblade', 'ironskin'],
  discoveredSecretLore: ['Bí tàng <đã đọc>'], pastLives: [death],
};
const quest = {
  questCount: 2, hasRefinedGu: true, questRewardClaimed: true, chapterRewardClaimed: false,
  chapter: 3, wolfKills: 4, bearKills: 0, herbsCollected: 8,
};

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

function game() {
  const player = new Cultivator();
  player.advanceRealm('Nhất Chuyển Cao Giai');
  StorageSystem.applyOrigin(player, 'scholar');
  player.hp = 0; player.mp = 17.25; player.stamina = 23.5; player.x = 700; player.y = 900;
  const inventory = new InventorySystem();
  inventory.primevalStones = 0; inventory.items.clear(); inventory.ownedGuIds = [];
  const gu = new GuSystem();
  gu.getGu('moonlight')!.hunger = 0;
  gu.getGu('heal')!.hunger = 23.5;
  return { player, inventory, gu };
}

describe('complete practice cloud progress', () => {
  let disk: ReturnType<typeof memoryStorage>;
  beforeEach(() => { disk = memoryStorage(); vi.stubGlobal('localStorage', disk); });
  afterEach(() => vi.unstubAllGlobals());

  it('captures a dead life without writing and restores its exact assets into the same systems', () => {
    const { player, inventory, gu } = game();
    const snapshot = StorageSystem.captureGame(player, inventory, quest, gu, localLife);
    expect(disk.values.size).toBe(0);
    expect(snapshot).toMatchObject({
      version: 4, realm: 'Nhất Chuyển Cao Giai', hp: 0, mp: 17.25, stamina: 23.5,
      x: 700, y: 900, stones: 0, items: [], ownedGuIds: [], chapter: 3, chapterRewardClaimed: false,
      guHunger: { moonlight: 0, heal: 23.5 }, localLife,
    });
    player.hp = 70; inventory.primevalStones = 99; inventory.addGu('moonlight');
    const restored = StorageSystem.restoreGame(snapshot, player, inventory, gu);
    expect(player.hp).toBe(0); expect(player.mp).toBe(17.25); expect(player.maxMp).toBe(160);
    expect(player.permanentDefense).toBe(6); expect(inventory.primevalStones).toBe(0);
    expect(inventory.items.size).toBe(0); expect(inventory.ownedGuIds).toEqual([]);
    expect(gu.getGu('moonlight')!.hunger).toBe(0);
    expect(restored).toEqual({ ...quest, localLife });
    localLife.remains[0].durability = 10;
    expect(snapshot.localLife.remains[0].durability).toBe(75.5);
    localLife.remains[0].durability = 75.5;
  });

  it('validates the whole snapshot before changing any live system', () => {
    const { player, inventory, gu } = game();
    const snapshot = StorageSystem.captureGame(player, inventory, quest, gu, localLife);
    player.hp = 70; inventory.primevalStones = 99;
    expect(() => StorageSystem.restoreGame({ ...snapshot, items: [{ id: 'herb', count: -1 }] }, player, inventory, gu)).toThrow();
    expect(player.hp).toBe(70); expect(inventory.primevalStones).toBe(99);
    expect(() => StorageSystem.captureGame(player, inventory, quest, gu, localLife)).toThrow();
  });

  it('restores a living lower-realm body without keeping old defense, buffs, or missing inventory entries', () => {
    const { player, inventory, gu } = game();
    player.advanceRealm('Nhất Chuyển Sơ Giai');
    StorageSystem.applyOrigin(player, 'hunter');
    player.hp = 37; player.mp = 9; player.stamina = 8;
    inventory.primevalStones = 45; inventory.ownedGuIds = ['moonlight', 'moonblade'];
    inventory.addItem({ id: 'herb', name: 'ignored', icon: '', count: 3, description: '' });
    const snapshot = StorageSystem.captureGame(player, inventory, { ...quest, chapter: 1, hasRefinedGu: false }, gu,
      { ...localLife, origin: 'hunter', death: null });
    player.advanceRealm('Nhị Chuyển Sơ Giai'); player.cdHeal = 100; player.shieldDuration = 20;
    const restored = StorageSystem.restoreGame(snapshot, player, inventory, gu);
    expect(player.realm).toBe('Nhất Chuyển Sơ Giai'); expect(player.hp).toBe(37);
    expect(player.maxHp).toBe(100); expect(player.permanentDefense).toBe(0);
    expect(player.cdHeal).toBe(0); expect(player.shieldDuration).toBe(0);
    expect(player.baseSpeed).toBe(175);
    expect(inventory.ownedGuIds).toEqual(['moonlight', 'moonblade']);
    expect([...inventory.items.keys()]).toEqual(['herb']);
    expect(inventory.items.get('herb')).toMatchObject({ count: 3, name: 'Thanh Trúc Diệp' });
    expect(restored.hasRefinedGu).toBe(false);
  });

  it('roundtrips the account journal and full life without trusting references or backend timestamps', async () => {
    const { createCloudProgress, parseCloudProgress } = await import('../src/systems/CloudProgress');
    const { player, inventory, gu } = game();
    const snapshot = StorageSystem.captureGame(player, inventory, quest, gu, localLife);
    const progress = createCloudProgress(snapshot, chronicle);
    const restored = parseCloudProgress(JSON.parse(JSON.stringify({ ...progress, savedAt: 54321 })));
    expect(restored).toMatchObject({ schemaVersion: 1, localSave: snapshot, soulChronicle: chronicle, savedAt: 54321 });
    restored.soulChronicle.pastLives[0].causeOfDeath = 'changed';
    expect(chronicle.pastLives[0].causeOfDeath).toBe('Độc khí <khảo nghiệm>');
    expect(restored.localSave.localLife.death!.causeOfDeath).toBe('Độc khí <khảo nghiệm>');
  });

  it('rejects partial, legacy, nonfinite and unknown-content cloud snapshots instead of silently dropping data', async () => {
    const { createCloudProgress, parseCloudProgress } = await import('../src/systems/CloudProgress');
    const { player, inventory, gu } = game();
    const good = createCloudProgress(StorageSystem.captureGame(player, inventory, quest, gu, localLife), chronicle);
    const invalid: unknown[] = [null, {}, { ...good, schemaVersion: 2 }, { ...good, localSave: { version: 3 } },
      { ...good, soulChronicle: { totalLives: 3 } }, { ...good, savedAt: Infinity }];
    for (const key of ['hp', 'stamina', 'x', 'items', 'guHunger', 'chapterRewardClaimed', 'localLife']) {
      const partial = structuredClone(good); delete (partial.localSave as unknown as Record<string, unknown>)[key]; invalid.push(partial);
    }
    invalid.push({ ...good, localSave: { ...good.localSave, ownedGuIds: ['missing'] } });
    invalid.push({ ...good, localSave: { ...good.localSave, mp: NaN } });
    invalid.push({ ...good, localSave: { ...good.localSave, localLife: { ...localLife, remains: [null] } } });
    invalid.push({ ...good, soulChronicle: { ...chronicle, pastLives: [{ ...death, lifeNumber: 99 }] } });
    invalid.push({ ...good, world: { immortals: ['fake'] } });
    invalid.push({ ...good, localSave: { ...good.localSave, hasImmortalGu: true } });
    invalid.push({ ...good, localSave: { ...good.localSave, localLife: { ...localLife, serverAccountId: 'fake' } } });
    invalid.push({ ...good, soulChronicle: { ...chronicle, worldToken: 'fake' } });
    for (const value of invalid) expect(() => parseCloudProgress(value)).toThrow();
  });

  it('caps UTF-8 data at 60 KB before it can reach cloud or local storage', async () => {
    const { createCloudProgress } = await import('../src/systems/CloudProgress');
    const { player, inventory, gu } = game();
    const snapshot = StorageSystem.captureGame(player, inventory, quest, gu, localLife);
    expect(() => createCloudProgress(snapshot, { ...chronicle, discoveredSecretLore: ['界'.repeat(21000)] })).toThrow(/60 KB/);
    expect(disk.values.size).toBe(0);
  });

  it('exports independent journal data and fails visibly when a replacement cannot be persisted', () => {
    SoulChronicle.replaceSnapshot(chronicle);
    const exported = SoulChronicle.exportSnapshot();
    exported.unlockedGuRecipes.push('extra');
    expect(SoulChronicle.exportSnapshot().unlockedGuRecipes).toEqual(['moonblade', 'ironskin']);
    vi.stubGlobal('localStorage', { getItem: disk.getItem, setItem: () => { throw new Error('quota'); } });
    expect(() => SoulChronicle.replaceSnapshot({ ...chronicle, discoveredSecretLore: [] })).toThrow();
    expect(JSON.parse(disk.getItem('cotienlo_soul_chronicle_v1')!).discoveredSecretLore).toEqual(['Bí tàng <đã đọc>']);
  });

  it('keeps a verified, scoped recoverable backup without replacing the active save', async () => {
    const { backupCurrentProgress, createCloudProgress } = await import('../src/systems/CloudProgress');
    const { player, inventory, gu } = game();
    const progress = createCloudProgress(StorageSystem.captureGame(player, inventory, quest, gu, localLife), chronicle);
    disk.setItem('cotienlo_save_v1', 'current-local-data');
    const a = backupCurrentProgress(disk, { endpoint: 'https://one.example/api/auth', accountId: 'u1' }, progress);
    const b = backupCurrentProgress(disk, { endpoint: 'https://two.example/api/auth', accountId: 'u1' }, progress);
    const c = backupCurrentProgress(disk, { endpoint: 'https://one.example/api/auth', accountId: 'u1' }, progress);
    expect(a).not.toBe(b); expect(a).not.toBe(c);
    expect(JSON.parse(disk.getItem(a)!)).toEqual(progress);
    expect(disk.getItem('cotienlo_save_v1')).toBe('current-local-data');
    expect(() => backupCurrentProgress({ getItem: () => null, setItem: () => {} }, { endpoint: '/', accountId: 'u1' }, progress)).toThrow();
    expect(() => backupCurrentProgress({ getItem: () => null, setItem: () => { throw new Error('blocked'); } }, { endpoint: '/', accountId: 'u1' }, progress)).toThrow();
  });
});

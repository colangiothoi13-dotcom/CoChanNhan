import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cultivator } from '../src/entities/Cultivator';
import { GuSystem } from '../src/systems/GuSystem';
import { InventorySystem } from '../src/systems/InventorySystem';
import { StorageSystem } from '../src/systems/StorageSystem';

const SAVE_KEY = 'cotienlo_save_v1';

describe('saved progress', () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('restores spent and collected items, hunger, stamina and completed quest flags', () => {
    const player = new Cultivator();
    const inventory = new InventorySystem();
    const gu = new GuSystem();
    player.hp = 12;
    player.mp = 17;
    player.stamina = 23;
    inventory.primevalStones = 63;
    inventory.removeItem('moon_stone', 2);
    inventory.items.get('herb')!.count = 11;
    inventory.addGu('moonblade');
    gu.getGu('moonlight')!.hunger = 44;

    expect(StorageSystem.saveGame(player, inventory, {
      questCount: 3, hasRefinedGu: true, questRewardClaimed: true,
    }, gu)).toBe(true);

    const restoredPlayer = new Cultivator();
    const restoredInventory = new InventorySystem();
    const restoredGu = new GuSystem();
    const quest = StorageSystem.loadGame(restoredPlayer, restoredInventory, restoredGu);

    expect(restoredPlayer.hp).toBe(12);
    expect(restoredPlayer.mp).toBe(17);
    expect(restoredPlayer.stamina).toBe(23);
    expect(restoredInventory.primevalStones).toBe(63);
    expect(restoredInventory.items.has('moon_stone')).toBe(false);
    expect(restoredInventory.items.get('herb')?.count).toBe(11);
    expect(restoredInventory.hasGu('moonblade')).toBe(true);
    expect(restoredGu.getGu('moonlight')?.hunger).toBe(44);
    expect(quest).toEqual({ questCount: 3, hasRefinedGu: true, questRewardClaimed: true });
  });

  it('restores an empty inventory without recreating the starter items', () => {
    const inventory = new InventorySystem();
    inventory.items.clear();
    StorageSystem.saveGame(new Cultivator(), inventory, 0);
    const restored = new InventorySystem();
    StorageSystem.loadGame(new Cultivator(), restored);
    expect(restored.items.size).toBe(0);
  });

  it('migrates legacy saves and infers already refined Gu without claiming an unpaid reward', () => {
    values.set(SAVE_KEY, JSON.stringify({
      hp: 60, mp: 25, stamina: 32, stones: 40,
      ownedGuIds: ['moonlight', 'boar', 'ironskin'], questCount: 3,
    }));
    const player = new Cultivator();
    const inventory = new InventorySystem();
    const quest = StorageSystem.loadGame(player, inventory, new GuSystem());
    expect(player.stamina).toBe(32);
    expect(inventory.items.get('herb')?.count).toBe(8);
    expect(quest).toEqual({ questCount: 3, hasRefinedGu: true, questRewardClaimed: false });
  });

  it.each(['{broken', 'null', '[]', '42'])('ignores malformed save %s', (raw) => {
    values.set(SAVE_KEY, raw);
    const player = new Cultivator();
    const inventory = new InventorySystem();
    expect(StorageSystem.loadGame(player, inventory)).toEqual({
      questCount: 0, hasRefinedGu: false, questRewardClaimed: false,
    });
    expect(player.hp).toBe(100);
    expect(inventory.primevalStones).toBe(25);
  });

  it('rejects nonfinite values and malformed IDs while bounding resource bars', () => {
    values.set(SAVE_KEY, '{"hp":1000,"mp":-5,"stamina":1e309,"stones":-100,"questCount":"3","ownedGuIds":[1,"moonlight","moonlight","missing"],"guHunger":{"moonlight":1e309,"boar":-4}}');
    const player = new Cultivator();
    const inventory = new InventorySystem();
    const gu = new GuSystem();
    const quest = StorageSystem.loadGame(player, inventory, gu);
    expect(player.hp).toBe(100);
    expect(player.mp).toBe(0);
    expect(player.stamina).toBe(100);
    expect(inventory.primevalStones).toBe(25);
    expect(inventory.ownedGuIds).toEqual(['moonlight']);
    expect(gu.getGu('moonlight')?.hunger).toBe(90);
    expect(gu.getGu('boar')?.hunger).toBe(0);
    expect(quest.questCount).toBe(0);
  });

  it('drops invalid item counts and unknown item definitions from saved inventory', () => {
    values.set(SAVE_KEY, JSON.stringify({ items: [
      { id: 'herb', count: 9, name: '<script>bad</script>', icon: '<img src=x>' },
      { id: 'meat', count: -2 }, { id: 'moon_stone', count: 1.5 },
      { id: 'invented', count: 999 }, null,
    ] }));
    const inventory = new InventorySystem();
    StorageSystem.loadGame(new Cultivator(), inventory);
    expect([...inventory.items.keys()]).toEqual(['herb']);
    expect(inventory.items.get('herb')?.count).toBe(9);
    expect(inventory.items.get('herb')?.name).toBe('Thanh Trúc Diệp');
    expect(inventory.items.get('herb')?.icon).toBe('🌿');
  });

  it('does not write invalid runtime numbers over an existing valid save', () => {
    const player = new Cultivator();
    const inventory = new InventorySystem();
    StorageSystem.saveGame(player, inventory, 1);
    const validSave = values.get(SAVE_KEY);
    player.hp = Number.NaN;
    expect(StorageSystem.saveGame(player, inventory, 2)).toBe(false);
    expect(values.get(SAVE_KEY)).toBe(validSave);
  });

  it('reports storage write failures', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('storage full'); } });
    expect(StorageSystem.saveGame(new Cultivator(), new InventorySystem(), 0)).toBe(false);
  });
});

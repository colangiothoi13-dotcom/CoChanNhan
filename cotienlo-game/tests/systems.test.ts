import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GuSystem } from '../src/systems/GuSystem';
import { InventorySystem } from '../src/systems/InventorySystem';
import { RefinementSystem } from '../src/systems/RefinementSystem';
import { SoundEngine } from '../src/engine/SoundEngine';

describe('GuSystem & InventorySystem', () => {
  let guSystem: GuSystem;
  let inventory: InventorySystem;

  beforeEach(() => {
    guSystem = new GuSystem();
    inventory = new InventorySystem();
  });

  it('initializes with 4 starting Gu correctly', () => {
    const moonlight = guSystem.getGu('moonlight');
    const bronze = guSystem.getGu('bronze');
    const boar = guSystem.getGu('boar');
    const heal = guSystem.getGu('heal');

    expect(moonlight).toBeDefined();
    expect(moonlight?.name).toBe('Nguyệt Quang Cổ');
    expect(moonlight?.tier).toBe(1);

    expect(bronze).toBeDefined();
    expect(bronze?.name).toBe('Thanh Đồng Giáp Cổ');

    expect(boar).toBeDefined();
    expect(boar?.name).toBe('Bạch Trư Cổ');

    expect(heal).toBeDefined();
    expect(heal?.name).toBe('Thảo Hoàn Cổ');
  });

  it('allows feeding Gu to restore hunger/energy', () => {
    const gu = guSystem.getGu('moonlight');
    expect(gu).toBeDefined();
    gu!.hunger = 40;

    const fed = guSystem.feedGu('moonlight', inventory);
    expect(fed).toBe(true);
    expect(gu!.hunger).toBe(75);
    expect(inventory.items.get('moon_stone')?.count).toBe(1);
  });

  it('refuses feeding without the matching food, ownership, or hunger', () => {
    inventory.removeItem('moon_stone', 2);
    const gu = guSystem.getGu('moonlight')!;
    gu.hunger = 40;
    expect(guSystem.feedGu('moonlight', inventory)).toBe(false);
    expect(gu.hunger).toBe(40);
    expect(guSystem.feedGu('moonblade', inventory)).toBe(false);
    guSystem.getGu('boar')!.hunger = 100;
    expect(guSystem.feedGu('boar', inventory)).toBe(false);
    expect(inventory.items.get('meat')?.count).toBe(5);
  });

  it('does not feed an unowned Gu or one whose food is unavailable in this prototype', () => {
    inventory.ownedGuIds = ['bronze'];
    expect(guSystem.feedGu('moonlight', inventory)).toBe(false);
    expect(inventory.items.get('moon_stone')?.count).toBe(2);
    expect(guSystem.getGu('moonlight')?.hunger).toBe(90);
    expect(guSystem.feedGu('bronze', inventory)).toBe(false);
    expect(guSystem.getGu('bronze')?.hunger).toBe(85);
  });

  it('rejects feeding corrupted hunger without consuming food', () => {
    guSystem.getGu('moonlight')!.hunger = Number.NaN;
    expect(guSystem.feedGu('moonlight', inventory)).toBe(false);
    expect(inventory.items.get('moon_stone')?.count).toBe(2);
  });

  it.each([-1, 0, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid economy amounts %s', (amount) => {
    expect(inventory.spendStones(amount)).toBe(false);
    inventory.addStones(amount);
    expect(inventory.primevalStones).toBe(25);
    expect(inventory.removeItem('herb', amount)).toBe(false);
    inventory.addItem({ id: 'herb', name: 'Herb', icon: '🌿', count: amount, description: '' });
    expect(inventory.items.get('herb')?.count).toBe(8);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5])('rejects spending a corrupted balance %s', (balance) => {
    inventory.primevalStones = balance;
    expect(inventory.spendStones(1)).toBe(false);
  });

  it('prevents count and currency overflow', () => {
    inventory.primevalStones = Number.MAX_SAFE_INTEGER;
    inventory.addStones(1);
    expect(inventory.primevalStones).toBe(Number.MAX_SAFE_INTEGER);
    inventory.items.get('herb')!.count = Number.MAX_SAFE_INTEGER;
    inventory.addItem({ id: 'herb', name: 'Herb', icon: '🌿', count: 1, description: '' });
    expect(inventory.items.get('herb')?.count).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('manages Primeval stones in Inventory correctly', () => {
    expect(inventory.primevalStones).toBe(25);

    inventory.addStones(10);
    expect(inventory.primevalStones).toBe(35);

    const spent = inventory.spendStones(15);
    expect(spent).toBe(true);
    expect(inventory.primevalStones).toBe(20);

    const overspent = inventory.spendStones(50);
    expect(overspent).toBe(false);
    expect(inventory.primevalStones).toBe(20);
  });
});

describe('RefinementSystem (Hợp Luyện Cổ)', () => {
  afterEach(() => vi.restoreAllMocks());
  it('correctly matches fusion recipe for Nguyệt Quang + Bạch Trư -> Nguyệt Nhận Cổ', () => {
    const ref = new RefinementSystem();
    const recipe = ref.findRecipe('moonlight', 'boar');

    expect(recipe).toBeDefined();
    expect(recipe?.resultGu).toBe('moonblade');
    expect(recipe?.stoneCost).toBe(10);
    expect(recipe?.successRate).toBe(0.85);
  });

  it('rejects fusion if player does not have enough Primeval Stones', () => {
    const ref = new RefinementSystem();
    const inv = new InventorySystem();
    const guSys = new GuSystem();
    const sound = new SoundEngine();

    inv.primevalStones = 2; // Not enough for 10 cost
    const result = ref.executeRefinement('moonlight', 'boar', inv, guSys, sound);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Nguyên thạch bất túc');
  });

  it('rejects recipes whose source Gu is not owned without charging currency', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const inventory = new InventorySystem();
    inventory.ownedGuIds = ['moonlight'];
    const result = new RefinementSystem().executeRefinement(
      'moonlight', 'boar', inventory, new GuSystem(), new SoundEngine(),
    );
    expect(result.success).toBe(false);
    expect(inventory.primevalStones).toBe(25);
    expect(inventory.hasGu('moonblade')).toBe(false);
  });

  it('rejects an already owned result without charging currency', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const inventory = new InventorySystem();
    inventory.addGu('moonblade');
    const result = new RefinementSystem().executeRefinement(
      'moonlight', 'boar', inventory, new GuSystem(), new SoundEngine(),
    );
    expect(result.success).toBe(false);
    expect(inventory.primevalStones).toBe(25);
  });

  it('charges exactly once on success while preserving both source Gu', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const inventory = new InventorySystem();
    const refinement = new RefinementSystem();
    const gu = new GuSystem();
    const sound = new SoundEngine();
    const result = refinement.executeRefinement('moonlight', 'boar', inventory, gu, sound);
    expect(result.success).toBe(true);
    expect(inventory.primevalStones).toBe(15);
    expect(inventory.ownedGuIds).toEqual(['moonlight', 'bronze', 'boar', 'heal', 'moonblade']);
    expect(refinement.executeRefinement('moonlight', 'boar', inventory, gu, sound).success).toBe(false);
    expect(inventory.primevalStones).toBe(15);
  });

  it('charges the recipe price on failure while preserving the source Gu', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const inventory = new InventorySystem();
    const result = new RefinementSystem().executeRefinement(
      'moonlight', 'boar', inventory, new GuSystem(), new SoundEngine(),
    );
    expect(result.success).toBe(false);
    expect(inventory.primevalStones).toBe(15);
    expect(inventory.ownedGuIds).toEqual(['moonlight', 'bronze', 'boar', 'heal']);
  });
});

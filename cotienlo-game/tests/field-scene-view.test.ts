import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldSceneView } from '../src/world/FieldSceneView';
import { Cultivator } from '../src/entities/Cultivator';
import { Monster } from '../src/entities/Monster';
import { Projectile } from '../src/entities/Projectile';
import { Npc } from '../src/entities/Npc';
import { InventorySystem } from '../src/systems/InventorySystem';
import { OverworldMap } from '../src/engine/OverworldMap';
import { Camera } from '../src/engine/Camera';
import type { FieldSnapshot } from '../src/world/field-types';
import { browserFixture } from './browser-fixture';
import { createCultivationState } from '../shared/cultivation-core.mjs';
import { createResourceState, resourceSnapshot } from '../shared/resource-core.mjs';

function state(overrides: Partial<FieldSnapshot> = {}): FieldSnapshot {
  return {
    lifeId: 'life-one', seq: 1, serverTime: 1000, accountName: 'Người phương xa', lifeNumber: 1, placeId: 'a', cause: null,
    x: 60000, y: 60000, facing: Math.PI, hp: 67, mp: 41, stamina: 52, maxHp: 100, maxMp: 100, maxStamina: 100,
    stones: 7, dead: false, regionId: 'central', guIds: ['moonlight', 'ironskin'],
    cooldowns: { attack: 0.2, moonlight: 0.8, bronze: 4, boar: 2, heal: 6, dash: 1 },
    buffs: { bronze: 3, boar: 2, heal: 1, dash: 0.1 }, monsters: [], projectiles: [], nearbyPlayers: [], ...overrides,
  };
}

describe('authoritative field scene presentation', () => {
  let browser: ReturnType<typeof browserFixture>;
  let player: Cultivator;
  let inventory: InventorySystem;
  let map: OverworldMap;
  let view: FieldSceneView;
  beforeEach(() => {
    browser = browserFixture(); player = new Cultivator(); inventory = new InventorySystem(); map = new OverworldMap();
    view = new FieldSceneView(player, inventory, map);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('keeps an overlapping resource point from stealing interaction with a closer facility NPC', () => {
    const facility = { id: 'academy', hubId: 'hub', regionId: 'central' as const, role: 'academy' as const,
      name: 'Học đường', x: 60000, y: 60000, npc: { x: 60000, y: 60000, name: 'Giáo tập', role: 'Học đường' } };
    const resources = resourceSnapshot(createCultivationState({ lifeId: 'life-one' }), createResourceState({ lifeId: 'life-one' }), 0);
    resources.nearbyNodes = [{ id: 'garden', name: 'Vườn', kind: 'harvest', x: 60070, y: 60000, discovered: false, description: '' }];
    view.apply(state({ facilities: [facility], resources }));
    expect(view.resourceNode).toBeUndefined();
    player.x = 60070;
    expect(view.resourceNode?.id).toBe('garden');
  });

  it('applies large server coordinates and authoritative stats without importing legacy assets', () => {
    player.advanceRealm('Nhị Chuyển Sơ Giai');
    inventory.primevalStones = 9999; inventory.addItem({ id: 'meat', name: 'Thịt', icon: '', description: '', count: 9 });
    const input = state({ guIds: ['moonlight', 'ironskin', 'a-server-uuid'] });
    view.apply(input);
    expect([player.x, player.y, player.hp, player.mp, player.stamina]).toEqual([60000, 60000, 67, 41, 52]);
    expect([player.maxHp, player.maxMp, player.maxStamina]).toEqual([100, 100, 100]);
    expect(inventory.primevalStones).toBe(7);
    expect(inventory.ownedGuIds).toEqual(['moonlight', 'ironskin']);
    expect(inventory.items.size).toBe(0);
    expect(player.permanentDefense).toBe(15);
    expect(player.cdMoonlight).toBe(0.8);
    expect(player.shieldDuration).toBe(3);
    expect(player.isDashing).toBe(true);
    expect(input.guIds).toEqual(['moonlight', 'ironskin', 'a-server-uuid']);
  });

  it('smooths positions between snapshots without simulating damage, regeneration, costs or cooldowns', () => {
    view.apply(state());
    view.apply(state({ seq: 2, x: 60100, y: 60200 }));
    expect([player.x, player.y]).toEqual([60000, 60000]);
    view.update(1 / 60);
    expect(player.x).toBeGreaterThan(60000); expect(player.x).toBeLessThan(60100);
    expect(player.y).toBeGreaterThan(60000); expect(player.y).toBeLessThan(60200);
    for (let frame = 0; frame < 100; frame++) view.update(0.1);
    expect(player.x).toBeCloseTo(60100); expect(player.y).toBeCloseTo(60200);
    expect([player.hp, player.mp, player.stamina, player.cdMoonlight, player.shieldDuration, inventory.primevalStones])
      .toEqual([67, 41, 52, 0.8, 3, 7]);
  });

  it('snaps a new life immediately and clears the previous life visual population', () => {
    const monsters: Monster[] = [];
    vi.spyOn(Monster.prototype, 'render').mockImplementation(function () { monsters.push(this); });
    vi.spyOn(Npc.prototype, 'render').mockImplementation(() => {});
    const camera = new Camera(800, 600); camera.x = 59600; camera.y = 59700;
    view.apply(state({ monsters: [{ id: 'wolf-one', type: 'wolf', x: 60030, y: 60030, hp: 80, maxHp: 110, state: 'chase' }] }));
    view.render(browser.context as CanvasRenderingContext2D, camera);
    expect(monsters).toHaveLength(1);
    view.apply(state({ lifeId: 'life-two', seq: 0, x: 20000, y: 100000, monsters: [] }));
    expect([player.x, player.y]).toEqual([20000, 100000]);
    view.render(browser.context as CanvasRenderingContext2D, camera);
    expect(monsters).toHaveLength(1);
    expect(view.snapshot?.lifeId).toBe('life-two');
  });

  it('reuses stable render instances, removes absent entities and culls distant objects and the local avatar', () => {
    const monsters: Monster[] = []; const shots: Projectile[] = []; const avatars: Cultivator[] = [];
    vi.spyOn(Monster.prototype, 'render').mockImplementation(function () { monsters.push(this); });
    vi.spyOn(Projectile.prototype, 'render').mockImplementation(function () { shots.push(this); });
    vi.spyOn(Cultivator.prototype, 'render').mockImplementation(function () { avatars.push(this); });
    vi.spyOn(Npc.prototype, 'render').mockImplementation(() => {});
    const camera = new Camera(800, 600); camera.x = 59600; camera.y = 59700;
    view.setSelfAccountId('self');
    const input = state({
      monsters: [
        { id: 'near', type: 'wolf', x: 60020, y: 60020, hp: 70, maxHp: 110, state: 'chase' },
        { id: 'far', type: 'snake', x: 70000, y: 70000, hp: 60, maxHp: 60, state: 'patrol' },
      ],
      projectiles: [{ id: 'shot', type: 'moonlight', x: 60010, y: 60010, angle: Math.PI, vx: -460, vy: 0, life: 1 }],
      nearbyPlayers: [
        { accountId: 'self', name: 'Self', x: 60000, y: 60000, facing: 0 },
        { accountId: 'friend', name: '<img src=x>', x: 60060, y: 60060, facing: 0 },
        { accountId: 'far-peer', name: 'Far', x: 90000, y: 90000, facing: 0 },
      ],
    });
    view.apply(input); view.render(browser.context as CanvasRenderingContext2D, camera);
    expect(monsters).toHaveLength(1); expect(shots).toHaveLength(1); expect(avatars).toHaveLength(1);
    const firstMonster = monsters[0], firstShot = shots[0], firstAvatar = avatars[0];
    view.apply({ ...input, seq: 2 }); view.render(browser.context as CanvasRenderingContext2D, camera);
    expect(monsters[1]).toBe(firstMonster); expect(shots[1]).toBe(firstShot); expect(avatars[1]).toBe(firstAvatar);
    view.apply(state({ seq: 3 })); view.render(browser.context as CanvasRenderingContext2D, camera);
    expect(monsters).toHaveLength(2); expect(shots).toHaveLength(2); expect(avatars).toHaveLength(2);
  });

  it('uses the nearest detailed place for interaction rather than a distant hub', () => {
    const input = state() as FieldSnapshot & { nearbyPlaces: { id: string; name: string; x: number; y: number }[] };
    input.nearbyPlaces = [
      { id: 'near', name: 'Bến Ngũ Vực', x: 60100, y: 60000 },
      { id: 'far', name: 'Đồn xa', x: 62000, y: 62000 },
    ];
    view.apply(input);
    expect([view.npc.x, view.npc.y, view.npc.name]).toEqual([60100, 60000, 'Bến Ngũ Vực']);
    expect(view.npc.isNear(player.x, player.y, 220)).toBe(true);
  });

  it('never rolls accepted resources back to an older sequence or an earlier snapshot at the same sequence', () => {
    view.apply(state({ seq: 5, serverTime: 5000, hp: 23, stones: 19 }));
    view.apply(state({ seq: 4, serverTime: 6000, hp: 100, stones: 99 }));
    expect([player.hp, inventory.primevalStones]).toEqual([23, 19]);
    view.apply(state({ seq: 5, serverTime: 4000, hp: 100, stones: 99 }));
    expect([player.hp, inventory.primevalStones]).toEqual([23, 19]);
    expect(view.snapshot?.serverTime).toBe(5000);
  });

  it('reset drops presentation state without modifying balances or emitting gameplay actions', () => {
    view.apply(state({ dead: true, hp: 0 }));
    view.reset(); view.update(1);
    expect(view.snapshot).toBe(null);
    expect([player.hp, player.mp, inventory.primevalStones]).toEqual([0, 41, 7]);
  });
});

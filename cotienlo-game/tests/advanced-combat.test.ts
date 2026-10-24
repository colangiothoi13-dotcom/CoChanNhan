import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cultivator } from '../src/entities/Cultivator';
import type { Monster } from '../src/entities/Monster';
import type { Projectile } from '../src/entities/Projectile';
import { browserFixture } from './browser-fixture';

describe('crafted Gu combat effects', () => {
  let browser: ReturnType<typeof browserFixture>;
  let player: Cultivator;
  let projectiles: Projectile[];
  let CultivatorClass: typeof import('../src/entities/Cultivator').Cultivator;
  let MonsterClass: typeof import('../src/entities/Monster').Monster;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    browser = browserFixture();
    browser.addElement('btn-gu-moonlight');
    browser.addElement('btn-gu-boar');
    browser.addElement('btn-open-cultivator');
    browser.addElement('stat-def');
    browser.addElement('cd-moonlight');
    projectiles = [];
    CultivatorClass = (await import('../src/entities/Cultivator')).Cultivator;
    MonsterClass = (await import('../src/entities/Monster')).Monster;
    const { Projectile: ProjectileClass } = await import('../src/entities/Projectile');
    const { GameMap } = await import('../src/engine/Map');
    vi.spyOn(GameMap.prototype, 'render').mockImplementation(() => {});
    vi.spyOn(GameMap.prototype, 'renderLighting').mockImplementation(() => {});
    vi.spyOn(CultivatorClass.prototype, 'render').mockImplementation(function(this: Cultivator) { player = this; });
    vi.spyOn(ProjectileClass.prototype, 'render').mockImplementation(function(this: Projectile) { projectiles.push(this); });
  });

  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  async function start(advancedGu: string[] = [], mp = 100) {
    browser.storage.setItem('cotienlo_save_v1', JSON.stringify({
      hp: 100, mp, stones: 25,
      ownedGuIds: ['moonlight', 'bronze', 'boar', 'heal', ...advancedGu],
    }));
    await import('../src/main');
    browser.win.dispatchEvent(new Event('DOMContentLoaded'));
    browser.frame(performance.now());
  }

  function click(id: string) { browser.elements.get(id)!.dispatchEvent(new Event('click')); }

  it('keeps the base moonlight cost and cooldown', async () => {
    await start();
    click('btn-gu-moonlight');
    expect(player.mp).toBe(85);
    expect(player.cdMoonlight).toBe(1);
  });

  it('uses the crafted moonblade cost and cooldown and refuses cooldown recasts', async () => {
    await start(['moonblade']);
    click('btn-gu-moonlight');
    expect(player.mp).toBe(72);
    expect(player.cdMoonlight).toBe(1.2);
    click('btn-gu-moonlight');
    expect(player.mp).toBe(72);
  });

  it('does not cast moonblade with less than its 28 MP price', async () => {
    await start(['moonblade'], 27);
    click('btn-gu-moonlight');
    expect(player.mp).toBe(27);
    expect(player.cdMoonlight).toBe(0);
  });

  it('keeps the boar damage bonus on crafted moonblade', async () => {
    await start(['moonblade']);
    click('btn-gu-boar');
    click('btn-gu-moonlight');
    browser.frame(performance.now() + 10);
    expect(projectiles[0]?.damage).toBe(67);
  });

  it('shows the upgraded cooldown using its actual duration', async () => {
    await start(['moonblade']);
    player.cdMoonlight = 0.6;
    player.moonlightCooldownDuration = 1.2;
    const { HudView } = await import('../src/ui/HudView');
    const { InventorySystem } = await import('../src/systems/InventorySystem');
    const { GameMap } = await import('../src/engine/Map');
    new HudView().update(player, new InventorySystem(), new GameMap());
    expect(browser.elements.get('cd-moonlight')?.style.background).toContain('180deg');
  });

  it('pierces two targets and never damages the same target twice', async () => {
    const targets = new Set<Monster>();
    vi.spyOn(MonsterClass.prototype, 'update').mockImplementation(function(this: Monster) {
      if (targets.size < 2) {
        targets.add(this);
        this.x = 1240;
        this.y = 1100;
        this.hp = this.maxHp = 110;
      }
    });
    await start(['moonblade']);
    click('btn-gu-moonlight');
    const now = performance.now();
    browser.frame(now + 10);
    expect([...targets].map((target) => target.hp)).toEqual([55, 55]);
    browser.frame(now + 20);
    expect([...targets].map((target) => target.hp)).toEqual([55, 55]);
  });

  it('applies ironskin from loaded ownership and displays its defense bonus', async () => {
    await start(['ironskin']);
    const { ParticleSystem } = await import('../src/engine/ParticleSystem');
    expect(player.takeDamage(40, new ParticleSystem())).toBe(25);
    expect(player.hp).toBe(75);
    click('btn-open-cultivator');
    expect(browser.elements.get('stat-def')?.textContent).toBe('0 (+15)');
  });

  it('grants ironskin immediately after successful refinement', async () => {
    const { RefineModal } = await import('../src/ui/RefineModal');
    const originalOpen = RefineModal.prototype.open;
    let refining: RefineModal;
    vi.spyOn(RefineModal.prototype, 'open').mockImplementation(function(this: RefineModal) {
      refining = this;
      originalOpen.call(this);
    });
    browser.addElement('btn-open-refine');
    browser.addElement('btn-execute-refine');
    await start();
    click('btn-open-refine');
    // Select the real bronze + boar recipe without emulating HTML parsing in the browser fixture.
    Object.assign(refining!, { selectedGu1: 'bronze', selectedGu2: 'boar' });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    click('btn-execute-refine');
    const { ParticleSystem } = await import('../src/engine/ParticleSystem');
    expect(player.takeDamage(40, new ParticleSystem())).toBe(25);
  });

  it('applies the flat ironskin bonus before existing shield reduction without healing from weak hits', async () => {
    const { ParticleSystem } = await import('../src/engine/ParticleSystem');
    const cultivator = new CultivatorClass();
    cultivator.permanentDefense = 15;
    const particles = new ParticleSystem();
    expect(cultivator.takeDamage(10, particles)).toBe(0);
    expect(cultivator.hp).toBe(100);
    cultivator.shieldDuration = 1;
    expect(cultivator.takeDamage(40, particles)).toBe(11);
    expect(cultivator.hp).toBe(89);
  });
});

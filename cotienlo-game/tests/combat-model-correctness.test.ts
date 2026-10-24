import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cultivator } from '../src/entities/Cultivator';
import { ParticleSystem } from '../src/engine/ParticleSystem';
import { SoundEngine } from '../src/engine/SoundEngine';
import { GameMap } from '../src/engine/Map';
import { GuSystem } from '../src/systems/GuSystem';
import { InventorySystem } from '../src/systems/InventorySystem';
import { StorageSystem } from '../src/systems/StorageSystem';
import { CultivatorModal } from '../src/ui/CultivatorModal';
import { HudView } from '../src/ui/HudView';
import { browserFixture } from './browser-fixture';

describe('local combat model and truthful readouts', () => {
  let browser: ReturnType<typeof browserFixture>;
  beforeEach(() => { browser = browserFixture(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('retains realm defense when a passive Gu is added, synchronized again or removed', () => {
    const player = new Cultivator();
    player.advanceRealm('Nhị Chuyển Sơ Giai');
    player.syncGuDefense(15);
    player.syncGuDefense(15);
    expect(player.permanentDefense).toBe(33);
    expect(player.takeDamage(50, new ParticleSystem())).toBe(17);
    player.syncGuDefense(0);
    expect(player.permanentDefense).toBe(18);
    expect(player.takeDamage(50, new ParticleSystem())).toBe(32);
  });

  it('restores realm defense from a saved realm before applying the owned passive', () => {
    browser.storage.setItem('cotienlo_save_v1', JSON.stringify({
      realm: 'Nhị Chuyển Sơ Giai', hp: 200, ownedGuIds: ['ironskin'],
    }));
    const player = new Cultivator();
    const inventory = new InventorySystem();
    StorageSystem.loadGame(player, inventory);
    player.syncGuDefense(inventory.hasGu('ironskin') ? 15 : 0);
    expect(player.permanentDefense).toBe(33);
    expect(player.takeDamage(40, new ParticleSystem())).toBe(7);
  });

  it('rebuilds lower realm stats without retaining a previous higher realm defense or primeval grade', () => {
    const player = new Cultivator();
    player.advanceRealm('Nhị Chuyển Sơ Giai');
    player.advanceRealm('Nhất Chuyển Sơ Giai');
    expect([player.maxHp, player.maxMp, player.baseAttack, player.permanentDefense, player.primevalLevel])
      .toEqual([100, 100, 25, 0, 1]);
    player.originMpBonus = 20;
    player.advanceRealm('Nhất Chuyển Trung Giai');
    player.advanceRealm('Nhất Chuyển Trung Giai');
    expect([player.maxHp, player.maxMp, player.baseAttack, player.permanentDefense]).toEqual([120, 140, 28, 3]);
  });

  it('derives basic attack damage from realm attack and the active boar bonus', () => {
    const player = new Cultivator();
    expect(player.attackDamage).toBe(25);
    player.advanceRealm('Nhị Chuyển Sơ Giai');
    expect(player.attackDamage).toBe(48);
    player.boarBuffDuration = 1;
    expect(player.attackDamage).toBe(60);
  });

  it('charges active defensive, strength and healing Gu according to their supplied catalogue definitions', () => {
    const sound = new SoundEngine();
    const cases = [
      { cast: 'castBronzeShield', timer: 'cdBronze' },
      { cast: 'castBoarBuff', timer: 'cdBoar' },
      { cast: 'castHeal', timer: 'cdHeal' },
    ] as const;
    for (const { cast, timer } of cases) {
      const player = new Cultivator();
      expect(player[cast](sound, { mpCost: 7, cooldown: 2.5 })).toBe(true);
      expect(player.mp).toBe(93);
      expect(player[timer]).toBe(2.5);
      expect(player[cast](sound, { mpCost: 7, cooldown: 2.5 })).toBe(false);
      expect(player.mp).toBe(93);
    }
  });

  it('rejects unknown or unowned Gu and enables a known Gu when ownership is acquired', () => {
    const gu = new GuSystem();
    const inventory = new InventorySystem();
    inventory.ownedGuIds = [];
    expect(gu.canUseGu('moonlight', inventory)).toBe(false);
    inventory.addGu('moonlight');
    expect(gu.canUseGu('moonlight', inventory)).toBe(true);
    inventory.ownedGuIds.push('invented');
    expect(gu.canUseGu('invented', inventory)).toBe(false);
  });

  it('shows zero energy, actual flat defense and percent shield reduction in the character panel', () => {
    const sea = browser.addElement('aperture-sea');
    const defense = browser.addElement('stat-def');
    const attack = browser.addElement('stat-atk');
    const power = browser.addElement('stat-power');
    const player = new Cultivator();
    player.advanceRealm('Nhị Chuyển Sơ Giai');
    player.syncGuDefense(15);
    player.mp = 0;
    player.boarBuffDuration = 1;
    player.shieldDuration = 1;
    new CultivatorModal(player).render();
    expect(sea.style.width).toBe('0%');
    expect(defense.textContent).toBe('18 (+15), giảm 55%');
    expect(attack.textContent).toBe('48 (+12)');
    expect(power.textContent).toContain('tham khảo');
  });

  it('uses the supplied catalogue for HUD prices and disables unowned active Gu', () => {
    const cost = browser.addElement('skill-moonlight-cost');
    const moonlight = browser.addElement('btn-gu-moonlight', 'button');
    const bronze = browser.addElement('btn-gu-bronze', 'button');
    const boar = browser.addElement('btn-gu-boar', 'button');
    const heal = browser.addElement('btn-gu-heal', 'button');
    const inventory = new InventorySystem();
    inventory.ownedGuIds = [];
    const gu = new GuSystem();
    gu.getGu('moonlight')!.mpCost = 17;
    const hud = new HudView(gu);
    hud.update(new Cultivator(), inventory, new GameMap());
    expect(cost.textContent).toBe('17 CN');
    expect([moonlight, bronze, boar, heal].map(button => button.disabled)).toEqual([true, true, true, true]);
    inventory.addGu('moonlight');
    hud.update(new Cultivator(), inventory, new GameMap());
    expect(moonlight.disabled).toBe(false);
    expect(moonlight.getAttribute('aria-disabled')).toBe('false');
    expect(bronze.disabled).toBe(true);
  });

  it('labels the practice Immortal Gu effect as a simulation in its visible nameplate', () => {
    const player = new Cultivator();
    player.hasImmortalGu = true;
    player.immortalGuName = 'Xuân Thu Thiền';
    const labels: string[] = [];
    browser.context.fillText = (label: string) => labels.push(label);
    player.render(browser.context as CanvasRenderingContext2D, { worldToScreen: () => ({ x: 100, y: 100 }) } as never);
    expect(labels.some(label => label.includes('Mô phỏng Tiên Cổ') && label.includes('Xuân Thu Thiền'))).toBe(true);
  });
});

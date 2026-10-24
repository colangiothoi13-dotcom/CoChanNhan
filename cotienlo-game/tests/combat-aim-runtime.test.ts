import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cultivator } from '../src/entities/Cultivator';
import type { Projectile } from '../src/entities/Projectile';
import type { Camera } from '../src/engine/Camera';
import { browserFixture, keyEvent } from './browser-fixture';

describe('moving and firing independently', () => {
  let browser: ReturnType<typeof browserFixture>;
  let player: Cultivator;
  let camera: Camera;
  let projectiles: Set<Projectile>;
  let time: number;
  beforeEach(async () => {
    vi.useFakeTimers(); vi.resetModules();
    browser = browserFixture(); projectiles = new Set(); time = performance.now();
    for (const id of ['btn-attack', 'btn-gu-moonlight', 'btn-dash']) {
      const button = browser.addElement(id, 'button');
      Object.assign(button, { click: () => button.dispatchEvent(new Event('click')) });
    }
    const { Cultivator } = await import('../src/entities/Cultivator');
    const { Projectile } = await import('../src/entities/Projectile');
    const { GameMap } = await import('../src/engine/Map');
    vi.spyOn(Cultivator.prototype, 'render').mockImplementation(function (_ctx, view) { player = this; camera = view; });
    vi.spyOn(Projectile.prototype, 'render').mockImplementation(function () { projectiles.add(this); });
    vi.spyOn(GameMap.prototype, 'render').mockImplementation(() => {});
    vi.spyOn(GameMap.prototype, 'renderLighting').mockImplementation(() => {});
  });
  afterEach(() => {
    browser.win.dispatchEvent(new Event('cotienlo:destroy'));
    vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals();
  });
  function frame() { browser.frame(time += 16); }
  async function boot(ownedGuIds = ['moonlight']) {
    browser.storage.setItem('cotienlo_save_v1', JSON.stringify({ hp: 100, mp: 100, ownedGuIds }));
    await import('../src/main'); browser.win.dispatchEvent(new Event('DOMContentLoaded'));
    for (let count = 0; count < 20; count++) frame();
  }
  function aimLeft() {
    browser.canvas.dispatchEvent(Object.assign(new Event('pointermove'), {
      pointerId: 1, pointerType: 'mouse', buttons: 0,
      clientX: player.x - camera.x - 160, clientY: player.y - camera.y,
    }));
  }
  function click(id: string) { browser.elements.get(id)!.dispatchEvent(new Event('click')); }

  it.each([
    ['basic slash', 'btn-attack', [], 320, 100],
    ['moonlight', 'btn-gu-moonlight', ['moonlight'], 460, 85],
    ['piercing moonblade', 'btn-gu-moonlight', ['moonblade'], 460, 72],
  ] as const)('fires %s left while running and then dashing right', async (_name, button, gu, speed, remainingMp) => {
    await boot([...gu]);
    browser.win.dispatchEvent(keyEvent('keydown', 'KeyD')); frame();
    expect(player.facingAngle).toBe(0);
    aimLeft(); click(button); frame();
    const shot = [...projectiles][0];
    expect(shot?.vx).toBeCloseTo(-speed);
    expect(shot?.vy).toBeCloseTo(0);
    expect(player.mp).toBeCloseTo(remainingMp, 0);
    const x = player.x;
    frame(); expect(player.x).toBeGreaterThan(x);
    click('btn-dash'); frame();
    expect(player.isDashing).toBe(true);
    expect(player.x).toBeGreaterThan(x);
    expect(player.facingAngle).toBe(0);
  });

  it('casts the aimed Gu with K and respects cooldown and MP', async () => {
    await boot(); aimLeft();
    browser.win.dispatchEvent(keyEvent('keydown', 'KeyK')); frame();
    expect(projectiles.size).toBe(1);
    expect([...projectiles][0].vx).toBeLessThan(0);
    browser.win.dispatchEvent(keyEvent('keydown', 'KeyK')); frame();
    expect(projectiles.size).toBe(1);
    player.cdMoonlight = 0; player.mp = 0;
    browser.win.dispatchEvent(keyEvent('keydown', 'KeyK')); frame();
    expect(projectiles.size).toBe(1);
  });

  it('primary canvas clicks fire only while the player can act', async () => {
    await boot();
    const press = () => browser.canvas.dispatchEvent(Object.assign(new Event('click'), {
      button: 0, detail: 1, pointerType: 'mouse',
      clientX: player.x - camera.x - 160, clientY: player.y - camera.y,
    }));
    press(); frame(); expect(projectiles.size).toBe(1);
    expect([...projectiles][0].vx).toBeLessThan(0);
    player.cdAttack = 0;
    const modal = browser.addElement('modal-block'); modal.className = 'game-modal active';
    press(); frame(); expect(projectiles.size).toBe(1);
    modal.className = 'game-modal'; player.hp = 0;
    press(); expect(player.cdAttack).toBe(0);
  });

  it('J and K still cast after a HUD button gains focus, while native Space stays on the button', async () => {
    await boot();
    browser.elements.get('btn-gu-moonlight')!.focus();
    aimLeft();
    browser.win.dispatchEvent(keyEvent('keydown', 'KeyJ'));
    browser.win.dispatchEvent(keyEvent('keydown', 'KeyK')); frame();
    expect(projectiles.size).toBe(2);
    expect([...projectiles].every(shot => shot.vx < 0)).toBe(true);
    browser.win.dispatchEvent(keyEvent('keydown', 'Space'));
    expect(player.isDashing).toBe(false);
  });
});

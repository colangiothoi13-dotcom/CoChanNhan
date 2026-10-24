import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Camera } from '../src/engine/Camera';
import type { Monster } from '../src/entities/Monster';
import { browserFixture } from './browser-fixture';

describe('game runtime', () => {
  let browser: ReturnType<typeof browserFixture>;
  let CameraClass: typeof import('../src/engine/Camera').Camera;
  let MonsterClass: typeof import('../src/entities/Monster').Monster;
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    browser = browserFixture();
    const { GameMap } = await import('../src/engine/Map');
    CameraClass = (await import('../src/engine/Camera')).Camera;
    MonsterClass = (await import('../src/entities/Monster')).Monster;
    vi.spyOn(GameMap.prototype, 'render').mockImplementation(() => {});
    vi.spyOn(GameMap.prototype, 'renderLighting').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  async function start() {
    // Use the normal entry point and actual entities; only browser APIs are simulated.
    await import('../src/main');
    browser.win.dispatchEvent(new Event('DOMContentLoaded'));
  }

  it('uses CSS pixels for the initial camera on high DPI screens', async () => {
    let viewport: number | undefined;
    vi.spyOn(CameraClass.prototype, 'follow').mockImplementation(function(this: Camera) {
      viewport = this.viewportWidth;
    });
    await start();
    browser.frame(performance.now() + 16);
    expect(browser.canvas.width).toBe(1600);
    expect(viewport).toBe(800);
  });

  it('replaces one defeated population once, without queuing a spawn for every frame', async () => {
    const encountered = new Set<Monster>();
    vi.spyOn(MonsterClass.prototype, 'update').mockImplementation(function(this: Monster) {
      encountered.add(this);
      this.state = 'dead';
    });
    await start();
    const now = performance.now();
    for (let i = 1; i <= 120; i++) browser.frame(now + i * 50);
    vi.advanceTimersByTime(5000);
    browser.frame(now + 6050);
    expect(encountered.size).toBe(14);
  });

  it('saves progress when leaving the page', async () => {
    await start();
    browser.win.dispatchEvent(new Event('pagehide'));
    expect(browser.storage.getItem('cotienlo_save_v1')).not.toBeNull();
  });

  it('spawns every monster outside obstacles', async () => {
    const { GameMap } = await import('../src/engine/Map');
    const map = new GameMap();
    const invalid: string[] = [];
    vi.spyOn(MonsterClass.prototype, 'update').mockImplementation(function(this: Monster) {
      if (map.checkCollision(this.spawnX, this.spawnY, this.radius)) invalid.push(this.type);
    });
    await start();
    browser.frame(performance.now() + 16);
    expect(invalid).toEqual([]);
  });

  it('keeps only one main panel open and blocks combat through the panel', async () => {
    const inventory = browser.addElement('modal-inventory');
    const refine = browser.addElement('modal-refine');
    const cultivator = browser.addElement('modal-cultivator');
    [inventory, refine, cultivator].forEach((modal) => modal.classList.add('game-modal'));
    const openInventory = browser.addElement('btn-open-inventory');
    const openRefine = browser.addElement('btn-open-refine');
    const openCultivator = browser.addElement('btn-open-cultivator');
    const boar = browser.addElement('btn-gu-boar');
    await start();
    openInventory.dispatchEvent(new Event('click'));
    expect(inventory.classList.contains('active')).toBe(true);
    openRefine.dispatchEvent(new Event('click'));
    expect(inventory.classList.contains('active')).toBe(false);
    expect(refine.classList.contains('active')).toBe(true);
    openCultivator.dispatchEvent(new Event('click'));
    expect(refine.classList.contains('active')).toBe(false);
    expect(cultivator.classList.contains('active')).toBe(true);
    boar.dispatchEvent(new Event('click'));
    browser.win.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(browser.storage.getItem('cotienlo_save_v1')!).mp).toBe(100);
  });

  it('resumes once after native pause and destroys the loop and autosave', async () => {
    const update = vi.spyOn(MonsterClass.prototype, 'update');
    await start();
    const now = performance.now();
    browser.frame(now + 16);
    expect(update).toHaveBeenCalledTimes(7);
    browser.win.dispatchEvent(new Event('cotienlo:pause'));
    browser.doc.dispatchEvent(new Event('visibilitychange'));
    browser.frame(now + 32);
    expect(update).toHaveBeenCalledTimes(7);
    browser.win.dispatchEvent(new Event('cotienlo:resume'));
    browser.win.dispatchEvent(new Event('cotienlo:resume'));
    browser.frame(now + 48);
    expect(update).toHaveBeenCalledTimes(14);
    browser.win.dispatchEvent(new Event('cotienlo:destroy'));
    browser.frame(now + 64);
    expect(update).toHaveBeenCalledTimes(14);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('warns once when progress cannot be saved', async () => {
    const toasts = browser.addElement('toast-container');
    await start();
    vi.spyOn(browser.storage, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
    browser.win.dispatchEvent(new Event('pagehide'));
    browser.win.dispatchEvent(new Event('pagehide'));
    expect(toasts.children.filter(el => el.textContent.includes('Không thể lưu')).length).toBe(1);
  });
});

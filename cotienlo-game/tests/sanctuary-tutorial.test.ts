import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameMap } from '../src/engine/Map';
import { Cultivator } from '../src/entities/Cultivator';
import { Monster } from '../src/entities/Monster';
import { ParticleSystem } from '../src/engine/ParticleSystem';
import { SoundEngine } from '../src/engine/SoundEngine';
import { TutorialModal } from '../src/ui/TutorialModal';
import { browserFixture } from './browser-fixture';

describe('Sanctuary Safe Zone & Beginner Tutorial', () => {
  let map: GameMap;
  let particles: ParticleSystem;
  let sound: SoundEngine;

  beforeEach(() => {
    map = new GameMap();
    particles = new ParticleSystem();
    sound = new SoundEngine();
  });

  it('determines if coordinates lie inside the Elder sanctuary formation', () => {
    // Center is (1200, 960), radius is 260
    expect(map.isInsideSanctuary(1200, 960)).toBe(true);
    expect(map.isInsideSanctuary(1200, 920)).toBe(true); // Elder position
    expect(map.isInsideSanctuary(1200, 1100)).toBe(true); // Rebirth altar
    expect(map.isInsideSanctuary(1200, 700)).toBe(true); // 260px boundary
    expect(map.isInsideSanctuary(1200, 600)).toBe(false); // Outside
    expect(map.isInsideSanctuary(650, 740)).toBe(false); // Bamboo snake forest
    expect(map.isInsideSanctuary(1950, 1870)).toBe(false); // Beast boss lair
  });

  it('pushes monsters back so they cannot penetrate the sanctuary barrier', () => {
    const snake = new Monster(1200, 960, 'snake'); // Attempting to spawn/move inside
    const player = new Cultivator();
    player.x = 1200;
    player.y = 960;

    snake.update(0.1, player, particles, sound);

    const distToCenter = Math.hypot(snake.x - GameMap.SANCTUARY_X, snake.y - GameMap.SANCTUARY_Y);
    expect(distToCenter).toBeGreaterThanOrEqual(GameMap.SANCTUARY_RADIUS + snake.radius - 0.01);
  });

  it('prevents monsters from targeting or chasing a cultivator protected inside the sanctuary', () => {
    const wolf = new Monster(1480, 960, 'wolf'); // 280px away from center, within aggro range (280)
    const player = new Cultivator();
    player.x = 1200;
    player.y = 960; // Player is inside sanctuary

    expect(map.isInsideSanctuary(player.x, player.y)).toBe(true);
    wolf.update(0.1, player, particles, sound);

    // Wolf should not chase player inside the safe zone
    expect(wolf.state).toBe('patrol');
  });

  it('TutorialModal opens, confirms, and stores seen flag in localStorage', () => {
    const browser = browserFixture();
    browser.storage.clear?.();
    const modal = browser.addElement('modal-tutorial');
    modal.className = 'game-modal';
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    const card = browser.doc.createElement('section');
    card.className = 'modal-card';
    modal.appendChild(card);
    const btnOpen = browser.addElement('btn-open-tutorial', 'button');
    const btnClose = browser.addElement('btn-close-tutorial', 'button');
    const btnConfirm = browser.addElement('btn-tutorial-confirm', 'button');
    card.appendChild(btnClose);
    card.appendChild(btnConfirm);

    const tutorial = new TutorialModal();
    btnOpen.dispatchEvent(new Event('click'));
    expect(modal.classList.contains('active')).toBe(true);

    btnConfirm.dispatchEvent(new Event('click'));
    expect(modal.classList.contains('active')).toBe(false);
    expect(browser.storage.getItem('cotienlo_tutorial_seen')).toBe('true');
  });
  it('does not reopen the introduction after it was confirmed before the delayed first visit', () => {
    vi.useFakeTimers();
    try {
      const browser = browserFixture();
      const modal = browser.addElement('modal-tutorial'); modal.className = 'game-modal'; modal.hidden = true;
      const tutorial = new TutorialModal();
      tutorial.markTutorialSeen(); tutorial.close();
      vi.advanceTimersByTime(1000);
      expect(modal.classList.contains('active')).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});


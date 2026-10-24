import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoulChronicle, PastLifeRecord } from '../src/systems/SoulChronicle';
import { Remains } from '../src/entities/Remains';
import { Cultivator } from '../src/entities/Cultivator';
import { ParticleSystem } from '../src/engine/ParticleSystem';
import { SoundEngine } from '../src/engine/SoundEngine';
import { RebirthModal } from '../src/ui/RebirthModal';
import { browserFixture } from './browser-fixture';

describe('Multi-Life Roguelite & Immortal Gu Resonance Mechanics', () => {
  let browser: ReturnType<typeof browserFixture>;

  beforeEach(() => {
    browser = browserFixture();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records past life details and increases total lives', () => {
    const record: PastLifeRecord = {
      lifeNumber: 1,
      causeOfDeath: 'Hào Điện Lang Vương trảm kích',
      deathX: 1950,
      deathY: 1870,
      realmReached: 'Nhất Chuyển Cao Giai',
      monstersSlain: 8,
      timeSurvivedSeconds: 145,
      primevalStonesLeft: 20,
      timestamp: Date.now(),
    };

    SoulChronicle.recordDeath(record);
    const chronicle = SoulChronicle.load();

    expect(chronicle.totalLives).toBe(2);
    expect(chronicle.pastLives.length).toBe(1);
    expect(chronicle.pastLives[0].realmReached).toBe('Nhất Chuyển Cao Giai');
    expect(chronicle.pastLives[0].primevalStonesLeft).toBe(20);
  });

  it('Remains decays under environmental cataclysms and can be excavated for stones', () => {
    const remains = new Remains(1000, 1000, 1, 50);
    expect(remains.primevalStones).toBe(30); // 60% preserved
    expect(remains.durability).toBe(100);

    // Update with cataclysm active decays faster
    remains.update(10, true);
    expect(remains.durability).toBeLessThan(100);

    // Excavation
    const cultivator = new Cultivator();
    const particles = new ParticleSystem();
    const sound = new SoundEngine();

    const stones = remains.excavate(cultivator, particles, sound);
    expect(stones).toBe(30);
    expect(remains.isLooted).toBe(true);

    // Cannot excavate twice
    expect(remains.excavate(cultivator, particles, sound)).toBe(0);
  });

  it('cultivator possessing Immortal Gu emits Dao Mark Resonance if Mortal (< Lục Chuyển)', () => {
    const cultivator = new Cultivator();
    cultivator.realm = 'Nhất Chuyển Sơ Giai'; // Mortal
    cultivator.hasImmortalGu = true;
    cultivator.immortalGuName = 'Xuân Thu Thiền';

    const particles = new ParticleSystem();
    const map = { checkCollision: () => false } as any;

    cultivator.update(0.1, { x: 0, y: 0, length: 0 }, map, particles);
    expect(cultivator.daoResonancePulse).toBeGreaterThan(0);

    // When elevated to Immortal (Lục Chuyển)
    cultivator.realm = 'Lục Chuyển Sơ Giai' as any;
    cultivator.update(0.1, { x: 0, y: 0, length: 0 }, map, particles);
    expect(cultivator.daoResonancePulse).toBe(0); // Sealed by Tiên Khiếu!
  });

  it('RebirthModal binds events, selects origin, and triggers rebirth callback', () => {
    const modal = browser.addElement('modal-rebirth');
    modal.className = 'game-modal';
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');

    const card = browser.doc.createElement('section');
    card.className = 'modal-card';
    modal.appendChild(card);

    const title = browser.addElement('rebirth-life-title');
    const stats = browser.addElement('rebirth-death-stats');
    const btnExecute = browser.addElement('btn-execute-rebirth', 'button');

    const optClan = browser.addElement('opt-clan', 'button');
    optClan.className = 'origin-option-btn selected';
    optClan.setAttribute('data-origin', 'clan');

    const optHunter = browser.addElement('opt-hunter', 'button');
    optHunter.className = 'origin-option-btn';
    optHunter.setAttribute('data-origin', 'hunter');

    card.appendChild(title);
    card.appendChild(stats);
    card.appendChild(optClan);
    card.appendChild(optHunter);
    card.appendChild(btnExecute);

    let rebornOrigin = '';
    const rebirthModal = new RebirthModal();

    rebirthModal.show(
      {
        lifeNumber: 1,
        causeOfDeath: 'Ngã xuống',
        deathX: 100,
        deathY: 100,
        realmReached: 'Nhất Chuyển',
        monstersSlain: 5,
        timeSurvivedSeconds: 60,
        primevalStonesLeft: 10,
        timestamp: Date.now(),
      },
      10,
      (origin) => {
        rebornOrigin = origin;
      },
    );

    expect(modal.classList.contains('active')).toBe(true);

    // Switch origin to hunter
    optHunter.dispatchEvent(new Event('click'));
    btnExecute.dispatchEvent(new Event('click'));

    expect(modal.classList.contains('active')).toBe(false);
    expect(rebornOrigin).toBe('hunter');
  });
});


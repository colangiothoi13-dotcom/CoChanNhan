import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cultivator } from '../src/entities/Cultivator';
import { browserFixture } from './browser-fixture';

const SAVE = 'cotienlo_save_v1';
const CHRONICLE = 'cotienlo_soul_chronicle_v1';
const record = {
  lifeNumber: 1, causeOfDeath: 'Độc khí', deathX: 700, deathY: 900,
  realmReached: 'Nhất Chuyển Sơ Giai', monstersSlain: 2,
  timeSurvivedSeconds: 30, primevalStonesLeft: 12, timestamp: 12345,
};

describe('local practice life continuity', () => {
  let browser: ReturnType<typeof browserFixture>;
  let player: Cultivator;
  let time: number;

  function addRebirth() {
    const modal = browser.addElement('modal-rebirth');
    modal.className = 'game-modal';
    modal.hidden = true;
    const card = browser.doc.createElement('section');
    card.className = 'modal-card';
    modal.appendChild(card);
    for (const id of ['rebirth-life-title', 'rebirth-death-stats', 'btn-execute-rebirth']) {
      card.appendChild(browser.addElement(id, id.startsWith('btn') ? 'button' : 'div'));
    }
    for (const origin of ['clan', 'hunter', 'scholar']) {
      const option = browser.addElement(`origin-${origin}`, 'button');
      option.className = 'origin-option-btn' + (origin === 'clan' ? ' selected' : '');
      option.setAttribute('data-origin', origin);
      card.appendChild(option);
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    browser = browserFixture();
    addRebirth();
    time = performance.now();
  });
  afterEach(() => {
    browser.win.dispatchEvent(new Event('cotienlo:destroy'));
    vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals();
  });

  async function boot() {
    const { Cultivator } = await import('../src/entities/Cultivator');
    const { GameMap } = await import('../src/engine/Map');
    vi.spyOn(GameMap.prototype, 'render').mockImplementation(() => {});
    vi.spyOn(GameMap.prototype, 'renderLighting').mockImplementation(() => {});
    vi.spyOn(Cultivator.prototype, 'render').mockImplementation(function () { player = this; });
    await import('../src/main');
    browser.win.dispatchEvent(new Event('DOMContentLoaded'));
    frame();
  }
  function frame() { time += 50; browser.frame(time); }
  function die() { player.hp = 0; frame(); }
  function rebirth(origin: string) {
    browser.elements.get(`origin-${origin}`)!.dispatchEvent(new Event('click'));
    browser.elements.get('btn-execute-rebirth')!.dispatchEvent(new Event('click'));
  }
  function saved() { return JSON.parse(browser.storage.getItem(SAVE)!); }

  it('persists death immediately and reopening its panel never adds another death', async () => {
    await boot();
    die();
    expect(browser.storage.getItem(SAVE)).not.toBeNull();
    expect(saved().hp).toBe(0);
    const first = JSON.parse(browser.storage.getItem(CHRONICLE)!);
    expect(first.totalLives).toBe(2);
    expect(first.pastLives).toHaveLength(1);
    browser.doc.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' }));
    player.hp = 99;
    frame();
    expect(player.hp).toBe(0);
    expect(JSON.parse(browser.storage.getItem(CHRONICLE)!).pastLives).toHaveLength(1);
  });

  it('reloads a dead life without resurrecting, duplicating its grave or recording death again', async () => {
    await boot(); die();
    browser.win.dispatchEvent(new Event('pagehide'));
    const progress = browser.storage.getItem(SAVE)!;
    const history = browser.storage.getItem(CHRONICLE)!;
    browser.win.dispatchEvent(new Event('cotienlo:destroy'));
    vi.resetModules();
    browser = browserFixture(); addRebirth();
    browser.storage.setItem(SAVE, progress); browser.storage.setItem(CHRONICLE, history);
    await boot();
    expect(player.hp).toBe(0);
    expect(JSON.parse(browser.storage.getItem(CHRONICLE)!).pastLives).toHaveLength(1);
    expect(JSON.parse(browser.storage.getItem(CHRONICLE)!).totalLives).toBe(2);
    rebirth('hunter');
    expect(player.hp).toBe(100);
    expect(saved().localLife.remains).toHaveLength(1);
  });

  it('migrates the previously saved dead life without adding a second death', async () => {
    browser.storage.setItem(SAVE, JSON.stringify({ version: 3, hp: 0, stones: 20, realm: 'Nhất Chuyển Sơ Giai' }));
    browser.storage.setItem(CHRONICLE, JSON.stringify({
      totalLives: 2, unlockedGuRecipes: ['moonblade'], discoveredSecretLore: [], pastLives: [record],
    }));
    await boot();
    expect(player.hp).toBe(0);
    expect(JSON.parse(browser.storage.getItem(CHRONICLE)!).pastLives).toHaveLength(1);
    expect(JSON.parse(browser.storage.getItem(CHRONICLE)!).totalLives).toBe(2);
    rebirth('hunter');
    expect(saved().localLife.lifeNumber).toBe(2);
    expect(saved().localLife.remains[0].primevalStones).toBe(12);
  });

  it('starts a fresh body, starter equipment and quest while retaining account knowledge', async () => {
    browser.storage.setItem(SAVE, JSON.stringify({
      version: 3, realm: 'Nhị Chuyển Sơ Giai', hp: 180, mp: 150, stamina: 20,
      stones: 99, ownedGuIds: ['moonblade', 'ironskin'], items: [{ id: 'herb', count: 99 }],
      guHunger: { moonlight: 1 }, chapter: 4, questCount: 3, hasRefinedGu: true,
      questRewardClaimed: true, wolfKills: 9, bearKills: 8, herbsCollected: 12,
    }));
    await boot();
    player.hasImmortalGu = true; player.immortalGuName = 'Cổ thử'; player.cdDash = 10;
    die(); rebirth('scholar');
    expect(player.realm).toBe('Nhất Chuyển Sơ Giai');
    expect(player.maxHp).toBe(100); expect(player.maxMp).toBe(120);
    expect(player.baseAttack).toBe(25); expect(player.permanentDefense).toBe(0);
    expect(player.hasImmortalGu).toBe(false); expect(player.cdDash).toBe(0);
    const data = saved();
    expect(data.ownedGuIds).toEqual(['moonlight', 'bronze', 'boar', 'heal']);
    expect(data.items.find((item: { id: string }) => item.id === 'herb').count).toBe(8);
    expect(data.guHunger.moonlight).toBe(90);
    expect(data.chapter).toBe(1); expect(data.questCount).toBe(0);
    expect(data.wolfKills).toBe(0); expect(data.hasRefinedGu).toBe(false);
    expect(data.stones).toBe(15);
    expect(JSON.parse(browser.storage.getItem(CHRONICLE)!).pastLives).toHaveLength(1);
    expect(browser.storage.getItem('cotienlo_world_session_v1:%2Fapi%2Fworld')).toBeNull();
  });

  it('does not carry origin bonuses into the next life or run a consumed rebirth callback twice', async () => {
    await boot(); die(); rebirth('scholar');
    expect(player.maxMp).toBe(120);
    player.mp = 11;
    browser.elements.get('btn-execute-rebirth')!.dispatchEvent(new Event('click'));
    expect(player.mp).toBe(11);
    die(); rebirth('hunter');
    expect(player.maxMp).toBe(100); expect(player.baseSpeed).toBeGreaterThan(160);
    die(); rebirth('clan');
    expect(player.maxMp).toBe(100); expect(player.baseSpeed).toBe(160);
    expect(JSON.parse(browser.storage.getItem(CHRONICLE)!).pastLives).toHaveLength(3);
  });

  it('restores an origin bonus and remaining grave assets exactly once after reload', async () => {
    await boot(); die(); rebirth('scholar');
    const progress = browser.storage.getItem(SAVE)!;
    const history = browser.storage.getItem(CHRONICLE)!;
    browser.win.dispatchEvent(new Event('cotienlo:destroy'));
    vi.resetModules(); browser = browserFixture(); addRebirth();
    browser.storage.setItem(SAVE, progress); browser.storage.setItem(CHRONICLE, history);
    await boot();
    expect(player.originTitle).toBe('Thư sinh ngộ đạo');
    expect(player.maxMp).toBe(120);
    player.x = 1200; player.y = 1100; frame();
    browser.win.dispatchEvent(new Event('pagehide'));
    expect(saved().stones).toBe(30);
    expect(saved().localLife.remains).toHaveLength(0);
  });

  it.each([
    { origin: 'scholar' as const, bonus: 20, speed: 160 },
    { origin: 'hunter' as const, bonus: 0, speed: 175 },
    { origin: 'clan' as const, bonus: 0, speed: 160 },
  ])('keeps $origin bonuses through chapter breakthroughs without stacking', async ({ origin, bonus, speed }) => {
    const { Cultivator } = await import('../src/entities/Cultivator');
    const { StorageSystem } = await import('../src/systems/StorageSystem');
    const { InventorySystem } = await import('../src/systems/InventorySystem');
    const { QuestSystem } = await import('../src/systems/QuestSystem');
    const cultivator = new Cultivator();
    StorageSystem.applyOrigin(cultivator, origin);
    const quest = new QuestSystem(new InventorySystem());
    for (let i = 0; i < 3; i++) quest.recordSnakeKill();
    quest.recordRefinement();
    expect(quest.completeChapter(cultivator).success).toBe(true);
    expect(cultivator.realm).toBe('Nhất Chuyển Trung Giai');
    expect(cultivator.maxMp).toBe(120 + bonus);
    expect(cultivator.mp).toBe(120 + bonus);
    quest.advanceToNextChapter();
    quest.recordWolfKill(); quest.recordWolfKill(); quest.recordHerbCollect(); quest.recordHerbCollect();
    expect(quest.completeChapter(cultivator).success).toBe(true);
    expect(cultivator.maxMp).toBe(140 + bonus);
    quest.advanceToNextChapter(); quest.recordBearKill();
    expect(quest.completeChapter(cultivator).success).toBe(true);
    expect(cultivator.maxMp).toBe(160 + bonus);
    cultivator.advanceRealm('Nhị Chuyển Sơ Giai');
    cultivator.advanceRealm('Nhị Chuyển Sơ Giai');
    StorageSystem.applyOrigin(cultivator, origin);
    expect(cultivator.maxMp).toBe(200 + bonus);
    expect(cultivator.baseSpeed).toBe(speed);
    cultivator.advanceRealm('Nhất Chuyển Sơ Giai');
    cultivator.advanceRealm('Nhất Chuyển Sơ Giai');
    expect(cultivator.maxMp).toBe(100 + bonus);
  });

  it('records each life only once even when an identical death is delivered repeatedly', async () => {
    const { SoulChronicle } = await import('../src/systems/SoulChronicle');
    SoulChronicle.recordDeath(record); SoulChronicle.recordDeath({ ...record });
    expect(SoulChronicle.load().totalLives).toBe(2);
    expect(SoulChronicle.load().pastLives).toHaveLength(1);
  });

  it('showing death details does not mutate history or inject stored text as markup', async () => {
    const { RebirthModal } = await import('../src/ui/RebirthModal');
    const modal = new RebirthModal();
    modal.show({ ...record, causeOfDeath: '<img src=x onerror=alert(1)>', realmReached: '<script>bad</script>' }, 12, () => {});
    const html = browser.elements.get('rebirth-death-stats')!.innerHTML;
    expect(html).not.toContain('<img'); expect(html).not.toContain('<script>');
    const { SoulChronicle } = await import('../src/systems/SoulChronicle');
    expect(SoulChronicle.load().pastLives).toHaveLength(0);
  });

  it('does not mint grave money for a penniless life or excavate an expired grave', async () => {
    const { Remains } = await import('../src/entities/Remains');
    const { Cultivator } = await import('../src/entities/Cultivator');
    const { ParticleSystem } = await import('../src/engine/ParticleSystem');
    const { SoundEngine } = await import('../src/engine/SoundEngine');
    const empty = new Remains(500, 500, 1, 0);
    expect(empty.primevalStones).toBe(0);
    const expired = new Remains(500, 500, 1, 50);
    expired.update(100, true);
    expect(expired.excavate(new Cultivator(), new ParticleSystem(), new SoundEngine())).toBe(0);
  });
});

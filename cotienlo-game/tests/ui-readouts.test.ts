import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cultivator } from '../src/entities/Cultivator';
import { GameMap } from '../src/engine/Map';
import { GuSystem } from '../src/systems/GuSystem';
import { InventorySystem } from '../src/systems/InventorySystem';
import { RefinementSystem } from '../src/systems/RefinementSystem';
import { SoundEngine } from '../src/engine/SoundEngine';
import { HudView } from '../src/ui/HudView';
import { InventoryModal } from '../src/ui/InventoryModal';
import { RefineModal } from '../src/ui/RefineModal';
import { WikiModal } from '../src/ui/WikiModal';
import { guIcon, itemIcon } from '../src/ui/icons';
import { WIKI_GU_LIST, WIKI_RECIPES, boDau, renderAtlasSprite, searchWikiIndex } from '../src/data/wikiData';
import { browserFixture, keyEvent } from './browser-fixture';

describe('game UI state readouts', () => {
  let browser: ReturnType<typeof browserFixture>;
  beforeEach(() => { browser = browserFixture(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('shows the actual upgraded moonlight skill and its new resource cost', () => {
    const name = browser.addElement('skill-moonlight-name');
    const cost = browser.addElement('skill-moonlight-cost');
    const inventory = new InventorySystem();
    const hud = new HudView();
    hud.update(new Cultivator(), inventory, new GameMap());
    expect(name.textContent).toBe('Nguyệt Quang');
    expect(cost.textContent).toBe('15 CN');
    inventory.addGu('moonblade');
    hud.update(new Cultivator(), inventory, new GameMap());
    expect(name.textContent).toBe('Nguyệt Nhận');
    expect(cost.textContent).toBe('28 CN');
  });

  it('shows only the changing day phase beside the separately rendered location', () => {
    const phase = browser.addElement('zone-name');
    const map = new GameMap();
    const hud = new HudView();
    map.dayTime = 0.5;
    hud.update(new Cultivator(), new InventorySystem(), map);
    expect(phase.textContent).toBe('Nhật Chiếu U Cốc');
    map.dayTime = 0.9;
    hud.update(new Cultivator(), new InventorySystem(), map);
    expect(phase.textContent).toBe('Đêm Thanh Vắng');
  });
  it('moves between inventory tabs with arrow keys and excludes the inactive panel', () => {
    const modal = browser.addElement('modal-inventory');
    const nav = browser.doc.createElement('div');
    nav.className = 'tabs-nav';
    modal.appendChild(nav);
    const guTab = browser.doc.createElement('button');
    guTab.className = 'tab-btn active';
    guTab.setAttribute('data-tab', 'gu-tab');
    const itemsTab = browser.doc.createElement('button');
    itemsTab.className = 'tab-btn';
    itemsTab.setAttribute('data-tab', 'items-tab');
    nav.appendChild(guTab);
    nav.appendChild(itemsTab);
    const guPanel = browser.addElement('tab-gu-content');
    const itemsPanel = browser.addElement('tab-items-content');
    modal.appendChild(guPanel);
    modal.appendChild(itemsPanel);
    new InventoryModal(new InventorySystem(), new GuSystem());
    guTab.focus();
    guTab.dispatchEvent(keyEvent('keydown', 'ArrowRight'));
    expect(browser.doc.activeElement === itemsTab).toBe(true);
    expect(itemsTab.getAttribute('aria-selected')).toBe('true');
    expect(guTab.tabIndex).toBe(-1);
    expect(guPanel.hidden).toBe(true);
    expect(itemsPanel.hidden).toBe(false);
    itemsTab.dispatchEvent(keyEvent('keydown', 'Home'));
    expect(browser.doc.activeElement === guTab).toBe(true);
    expect(guPanel.hidden).toBe(false);
    expect(itemsPanel.hidden).toBe(true);
  });

  it('toggles a selected refinement chip without putting the same Gu into both slots', () => {
    const choices = browser.addElement('refine-available-gu');
    const primary = browser.addElement('slot-primary', 'button');
    const secondary = browser.addElement('slot-secondary', 'button');
    const modal = new RefineModal(new InventorySystem(), new GuSystem(), new RefinementSystem(), new SoundEngine(), () => {});
    modal.open();
    const boar = choices.children[2];
    boar.dispatchEvent(new Event('click'));
    expect(boar.getAttribute('aria-pressed')).toBe('false');
    expect(primary.innerHTML).toContain('Nguyệt Quang Cổ');
    expect(secondary.innerHTML).toContain('Cổ phụ');
    boar.dispatchEvent(new Event('click'));
    expect(boar.getAttribute('aria-pressed')).toBe('true');
    expect(primary.innerHTML).toContain('Nguyệt Quang Cổ');
    expect(secondary.innerHTML).toContain('Bạch Trư Cổ');
  });
  it('exposes chosen refinement ingredients as pressed buttons and supports changing them', () => {
    const choices = browser.addElement('refine-available-gu');
    const primary = browser.addElement('slot-primary', 'button');
    browser.addElement('slot-secondary', 'button');
    const modal = new RefineModal(new InventorySystem(), new GuSystem(), new RefinementSystem(), new SoundEngine(), () => {});
    modal.open();
    expect(choices.children.every((chip) => chip.tagName === 'BUTTON')).toBe(true);
    const moonlight = choices.children[0];
    const bronze = choices.children[1];
    expect(moonlight.getAttribute('aria-pressed')).toBe('true');
    expect(bronze.getAttribute('aria-pressed')).toBe('false');
    primary.dispatchEvent(new Event('click'));
    expect(moonlight.getAttribute('aria-pressed')).toBe('false');
    bronze.dispatchEvent(new Event('click'));
    expect(bronze.getAttribute('aria-pressed')).toBe('true');
    expect(primary.innerHTML).toContain('Thanh Đồng Giáp Cổ');
  });

  it('renders authentic sprite atlas spans for Gu worms and items and searches the Wiki index with boDau', () => {
    expect(WIKI_GU_LIST.length).toBe(377);
    expect(WIKI_RECIPES.length).toBe(70);
    expect(boDau('Nguyệt Quang cổ · Nhất chuyển')).toBe('nguyet quang co nhat chuyen');

    const moonlightSprite = guIcon('moonlight', 28);
    expect(moonlightSprite).toContain('o_tui_atlas.png');
    expect(moonlightSprite).toContain('gu-sprite-icon');

    const herbSprite = itemIcon('herb', 24);
    expect(herbSprite).toContain('o_tui_atlas.png');
    expect(renderAtlasSprite('gu_tuu_trung', 64)).toContain('width:64px;height:64px');

    const results = searchWikiIndex('nguyet quang co');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].targetId).toBe('gu_nguyet_quang');

    const modal = browser.addElement('modal-wiki');
    const content = browser.addElement('wiki-main-content');
    modal.appendChild(content);
    const wiki = new WikiModal(new InventorySystem());
    wiki.open('co', 'gu_nguyet_quang');
    expect(content.innerHTML).toContain('Nguyệt Quang cổ');
    expect(content.innerHTML).toContain('月光蛊');
    expect(content.innerHTML).toContain('Cánh hoa nguyệt lan');
  });
});

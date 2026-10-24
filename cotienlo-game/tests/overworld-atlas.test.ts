import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OverworldAtlas, type AtlasPosition } from '../src/ui/OverworldAtlas';
import { browserFixture, TestElement } from './browser-fixture';

describe('the continuous five-region atlas', () => {
  let browser: ReturnType<typeof browserFixture>;
  let root: TestElement;
  let card: TestElement;
  let ui: OverworldAtlas;
  let position: AtlasPosition | null;
  let journey: ReturnType<typeof vi.fn>;
  let login: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    browser = browserFixture();
    root = browser.addElement('modal-overworld-atlas');
    card = browser.addElement('atlas-card'); card.className = 'modal-card';
    root.descendants.set('.modal-card', card);
    position = { x: 60150, y: 100000, regionId: 'south', connected: true, lifeNumber: 4 };
    journey = vi.fn(); login = vi.fn();
    ui = new OverworldAtlas(root as unknown as HTMLElement, { getPosition: () => position, onJourney: journey, onLogin: login });
    root.appendChild(card);
  });
  afterEach(() => { ui.destroy(); vi.unstubAllGlobals(); });
  function control(attribute: string, value: string): TestElement {
    const button = browser.addElement('test-' + value, 'button'); button.setAttribute(attribute, value); card.appendChild(button); return button;
  }
  function click(target: TestElement) {
    const event = new Event('click'); Object.defineProperty(event, 'target', { value: target }); root.dispatchEvent(event);
  }
  it('shows five regions, fifteen safe hubs, roads and the server position without offering teleport', () => {
    ui.open();
    expect(card.innerHTML.match(/data-atlas-region=/g)).toHaveLength(5);
    expect(card.innerHTML.match(/class="oa-hub"/g)).toHaveLength(15);
    expect(card.innerHTML).toContain('oa-player');
    expect(card.innerHTML).toContain('Nam Cương');
    expect(card.innerHTML).toContain('120.000');
    expect(card.innerHTML).toContain('Đời 4');
    expect(card.innerHTML).not.toContain('Dịch chuyển');
  });
  it('selecting another region only changes its description and never mutates position or starts a journey', () => {
    ui.open();
    const before = structuredClone(position);
    click(control('data-atlas-region', 'east'));
    expect(card.innerHTML).toContain('Đông Hải');
    expect(card.innerHTML).toContain('Bãi triều');
    expect(position).toEqual(before); expect(journey).not.toHaveBeenCalled();
    expect(card.innerHTML).toContain('id="oa-region-east"');
  });
  it('supports Enter and arrow selection on the map without turning unrelated keys into selection', () => {
    ui.open();
    const target = control('data-atlas-region', 'west');
    const key = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Enter' });
    Object.defineProperty(key, 'target', { value: target }); root.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true); expect(card.innerHTML).toContain('Cồn cát');
    const arrow = Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowRight' });
    Object.defineProperty(arrow, 'target', { value: target }); root.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(true); expect(card.innerHTML).toContain('Bãi triều');
  });
  it('closes before opening the same character journal or account panel', () => {
    journey.mockImplementation(() => expect(root.classList.contains('active')).toBe(false));
    ui.open(); click(control('data-atlas-action', 'journey'));
    expect(journey).toHaveBeenCalledOnce();
    ui.open(); click(control('data-atlas-action', 'login'));
    expect(login).toHaveBeenCalledOnce(); expect(root.classList.contains('active')).toBe(false);
  });
  it('refreshes a moving character and clearly marks an offline last-known position', () => {
    ui.open(); position = { x: 100150, y: 60000, regionId: 'east', connected: false, lifeNumber: 4 }; ui.refresh();
    expect(card.innerHTML).toContain('Vị trí gần nhất'); expect(card.innerHTML).toContain('Đông Hải');
    expect(card.innerHTML).toContain('834.583');
  });
  it('does not invent a player marker for missing or invalid server coordinates', () => {
    position = null; ui.open();
    expect(card.innerHTML).not.toContain('class="oa-player"'); expect(card.innerHTML).toContain('Chưa nhập thế');
    position = { x: NaN, y: 40, regionId: 'south', connected: true, lifeNumber: 1 }; ui.refresh();
    expect(card.innerHTML).not.toContain('class="oa-player"'); expect(card.innerHTML).not.toContain('NaN');
  });
  it('ignores unknown actions and cannot run callbacks after destruction', () => {
    ui.open(); click(control('data-atlas-region', 'not-a-region'));
    expect(journey).not.toHaveBeenCalled(); ui.destroy();
    click(control('data-atlas-action', 'journey')); ui.open();
    expect(journey).not.toHaveBeenCalled(); expect(root.classList.contains('active')).toBe(false);
  });
});

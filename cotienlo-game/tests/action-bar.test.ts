import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionBarView } from '../src/ui/ActionBarView';
import { ActionSettings } from '../src/systems/ActionSettings';
import { Cultivator } from '../src/entities/Cultivator';
import { InventorySystem } from '../src/systems/InventorySystem';
import { GuSystem } from '../src/systems/GuSystem';
import { browserFixture } from './browser-fixture';
import { HudView } from '../src/ui/HudView';
import { GameMap } from '../src/engine/Map';

afterEach(() => vi.unstubAllGlobals());
it('renders the selected Gu, its key and shared cooldown in every assigned slot', () => {
  const browser = browserFixture();
  const slots = ['moonlight', 'bronze', 'boar', 'heal'];
  for (const id of slots) {
    const button = browser.addElement('btn-gu-' + id, 'button');
    for (const name of ['btn-sub', 'btn-icon', 'gu-cost', 'skill-key-badge', 'cd-overlay']) {
      const node = browser.addElement(id + '-' + name); node.className = name; button.appendChild(node);
    }
  }
  const settings = new ActionSettings({ storage: null });
  const player = new Cultivator(); const inventory = new InventorySystem();
  settings.assignSlot(0, 'heal', inventory.ownedGuIds);
  settings.assignSlot(1, 'heal', inventory.ownedGuIds);
  settings.rebind('slot1', 'KeyQ'); player.cdHeal = 6;
  new ActionBarView(settings, new GuSystem()).update(player, inventory);
  expect(browser.elements.get('moonlight-btn-sub')!.textContent).toContain('Thảo Hoàn');
  expect(browser.elements.get('moonlight-skill-key-badge')!.textContent).toBe('Q');
  expect(browser.elements.get('moonlight-gu-cost')!.textContent).toBe('30 CN');
  expect(browser.elements.get('moonlight-cd-overlay')!.style.background).toBe(browser.elements.get('bronze-cd-overlay')!.style.background);
  inventory.ownedGuIds = [];
  new ActionBarView(settings, new GuSystem()).update(player, inventory);
  expect(browser.elements.get('btn-gu-moonlight')!.disabled).toBe(true);
});

it('the normal HUD refresh does not replace a customized slot on the following frame', () => {
  const browser = browserFixture();
  const button = browser.addElement('btn-gu-moonlight', 'button');
  const label = browser.addElement('skill-moonlight-name'); label.className = 'btn-sub'; button.appendChild(label);
  const cost = browser.addElement('skill-moonlight-cost'); cost.className = 'gu-cost'; button.appendChild(cost);
  const settings = new ActionSettings({ storage: null });
  const inventory = new InventorySystem(), player = new Cultivator(), gu = new GuSystem();
  settings.assignSlot(0, 'heal', inventory.ownedGuIds);
  const bar = new ActionBarView(settings, gu), hud = new HudView(gu, true), map = new GameMap();
  hud.update(player, inventory, map); bar.update(player, inventory);
  hud.update(player, inventory, map); bar.update(player, inventory);
  expect(label.textContent).toContain('Thảo Hoàn');
  expect(cost.textContent).toBe('30 CN');
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventorySystem } from '../src/systems/InventorySystem';
import { GuSystem } from '../src/systems/GuSystem';
import { RefinementSystem } from '../src/systems/RefinementSystem';
import { Cultivator } from '../src/entities/Cultivator';
import { SoundEngine } from '../src/engine/SoundEngine';
import { StorageSystem } from '../src/systems/StorageSystem';
import { RefineModal } from '../src/ui/RefineModal';
import { InventoryModal } from '../src/ui/InventoryModal';
import { browserFixture, TestElement } from './browser-fixture';

describe('offline economy persistence', () => {
  let browser: ReturnType<typeof browserFixture>;
  beforeEach(() => { browser = browserFixture(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('saves the stone charge immediately even when a refinement fails', () => {
    browser.addElement('modal-refine');
    const execute = browser.addElement('btn-execute-refine');
    const inventory = new InventorySystem();
    const gu = new GuSystem();
    const save = () => StorageSystem.saveGame(new Cultivator(), inventory, 0, gu);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const modal = new RefineModal(inventory, gu, new RefinementSystem(), new SoundEngine(), () => {}, save);
    modal.open();
    execute.dispatchEvent(new Event('click'));
    const saved = browser.storage.getItem('cotienlo_save_v1');
    expect(saved).not.toBeNull();
    expect(JSON.parse(saved!).stones).toBe(15);
  });

  it('saves consumed food and restored hunger immediately', () => {
    const list = browser.addElement('gu-inventory-list');
    browser.doc.createElement = () => {
      const card = new TestElement();
      card.descendants.set('.btn-feed', new TestElement());
      return card;
    };
    const inventory = new InventorySystem();
    const gu = new GuSystem();
    const save = () => StorageSystem.saveGame(new Cultivator(), inventory, 0, gu);
    const modal = new InventoryModal(inventory, gu, save);
    modal.open();
    list.children[0].querySelector('.btn-feed')!.dispatchEvent(new Event('click'));
    const saved = browser.storage.getItem('cotienlo_save_v1');
    expect(saved).not.toBeNull();
    const data = JSON.parse(saved!);
    expect(data.items.find((item: { id: string }) => item.id === 'moon_stone').count).toBe(1);
    expect(data.guHunger.moonlight).toBe(100);
  });
});

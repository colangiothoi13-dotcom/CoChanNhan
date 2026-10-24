import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionSettings, DEFAULT_BINDINGS, formatKeyCode } from '../src/systems/ActionSettings';

function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
afterEach(() => vi.unstubAllGlobals());
describe('action loadout and key preferences', () => {
  it('starts with four active skills and left-hand number keys', () => {
    const model = new ActionSettings({ storage: memoryStorage() });
    expect(model.getSlots()).toEqual(['moonlight', 'bronze', 'boar', 'heal']);
    expect(model.getBindings()).toEqual(DEFAULT_BINDINGS);
    expect(model.actionForCode('Digit1')).toBe('slot1');
    expect(formatKeyCode('Digit4')).toBe('4');
  });
  it('allows only owned active Gu in a slot and can explicitly empty it', () => {
    const model = new ActionSettings({ storage: memoryStorage() });
    expect(model.assignSlot(0, 'ironskin' as never, ['ironskin']).ok).toBe(false);
    expect(model.assignSlot(0, 'moonblade', ['moonlight']).ok).toBe(false);
    expect(model.assignSlot(0, 'moonblade', ['moonblade']).ok).toBe(true);
    expect(model.assignSlot(2, null, []).ok).toBe(true);
    expect(model.getSlots()).toEqual(['moonblade', 'bronze', null, 'heal']);
  });
  it('resolves automatic Moonblade upgrades and ownership loss without granting a skill', () => {
    const model = new ActionSettings({ storage: memoryStorage() });
    expect(model.resolveSlot(0, ['moonlight', 'moonblade'])).toBe('moonblade');
    expect(model.resolveSlot(0, ['moonblade'])).toBe('moonblade');
    expect(model.resolveSlot(0, ['moonlight'])).toBe('moonlight');
    expect(model.resolveSlot(0, [])).toBeNull();
    model.assignSlot(0, 'moonblade', ['moonblade']);
    expect(model.resolveSlot(0, ['moonlight'])).toBeNull();
  });
  it('keeps preference duplicates but resolves each to the same Gu cooldown identity', () => {
    const model = new ActionSettings({ storage: memoryStorage() });
    expect(model.assignSlot(1, 'moonlight', ['moonlight']).ok).toBe(true);
    expect(model.resolveSlot(0, ['moonblade'])).toBe('moonblade');
    expect(model.resolveSlot(1, ['moonblade'])).toBe('moonblade');
  });
  it('rejects conflicting keys across movement, combat and UI without changing existing bindings', () => {
    const model = new ActionSettings({ storage: memoryStorage() });
    const before = model.getBindings();
    const conflict = model.rebind('slot1', 'KeyW');
    expect(conflict.ok).toBe(false);
    expect(conflict.message).toContain('Đi lên');
    expect(model.getBindings()).toEqual(before);
    expect(model.rebind('slot1', 'KeyQ').ok).toBe(true);
    expect(model.actionForCode('KeyQ')).toBe('slot1');
    expect(model.actionForCode('Digit1')).toBeNull();
  });
  it.each(['Escape', 'Enter', 'Tab', 'F5', 'ControlLeft', 'AltLeft', 'MetaLeft', 'Backspace', 'Delete', 'Unidentified'])('rejects reserved/unsupported code %s', code => {
    const model = new ActionSettings({ storage: memoryStorage() });
    expect(model.rebind('slot1', code).ok).toBe(false);
    expect(model.getBindings().slot1).toBe('Digit1');
  });
  it('persists choices, returns isolated snapshots and resets all preferences together', () => {
    const storage = memoryStorage();
    const model = new ActionSettings({ storage });
    model.assignSlot(2, 'heal', ['heal']);
    model.rebind('attack', 'KeyQ');
    const restored = new ActionSettings({ storage });
    expect(restored.getSlots()[2]).toBe('heal');
    expect(restored.getBindings().attack).toBe('KeyQ');
    const slots = restored.getSlots(); slots[0] = null;
    const bindings = restored.getBindings(); bindings.attack = 'KeyZ';
    expect(restored.getSlots()[0]).toBe('moonlight');
    expect(restored.getBindings().attack).toBe('KeyQ');
    restored.resetDefaults();
    expect(new ActionSettings({ storage }).getBindings()).toEqual(DEFAULT_BINDINGS);
    expect(restored.getSlots()).toEqual(['moonlight', 'bronze', 'boar', 'heal']);
  });
  it('preserves the saved loadout while inventory is empty between lives', () => {
    const storage = memoryStorage();
    const first = new ActionSettings({ storage });
    first.assignSlot(3, 'moonblade', ['moonblade']);
    const next = new ActionSettings({ storage });
    expect(next.resolveSlot(3, [])).toBeNull();
    expect(next.getSlots()[3]).toBe('moonblade');
    expect(next.resolveSlot(3, ['moonblade'])).toBe('moonblade');
  });
  it('keeps the canonical Moonbeam skill distinct from the legacy Moonblade across reloads', () => {
    const storage = memoryStorage();
    const model = new ActionSettings({ storage });
    expect(model.assignSlot(0, 'moonbeam', ['moonbeam']).ok).toBe(true);
    const restored = new ActionSettings({ storage });
    expect(restored.getSlots()[0]).toBe('moonbeam');
    expect(restored.resolveSlot(0, ['moonblade'])).toBeNull();
    expect(restored.resolveSlot(0, ['moonbeam'])).toBe('moonbeam');
    expect(restored.resolveSlot(0, [])).toBeNull();
  });
  it('ignores malformed or conflicting stored preferences and preserves the original bytes', () => {
    const storage = memoryStorage();
    const model = new ActionSettings({ storage });
    model.rebind('attack', 'KeyQ');
    const key = [...storage.values.keys()][0];
    const corrupted = JSON.stringify({ version: 1, slots: ['ironskin'], bindings: { slot1: 'KeyW' } });
    storage.values.set(key, corrupted);
    const restored = new ActionSettings({ storage });
    expect(restored.getBindings()).toEqual(DEFAULT_BINDINGS);
    expect(restored.warning).toBeTruthy();
    expect(storage.values.get(key)).toBe(corrupted);
  });
  it('survives blocked getters and writes with usable in-memory preferences and a visible warning', () => {
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
    const model = new ActionSettings({ storage: broken });
    expect(model.rebind('slot1', 'KeyQ').ok).toBe(true);
    expect(model.actionForCode('KeyQ')).toBe('slot1');
    expect(model.warning).toBeTruthy();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('privacy'); } });
    try { expect(() => new ActionSettings()).not.toThrow(); }
    finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else Reflect.deleteProperty(globalThis, 'localStorage'); }
  });
  it.each(['duplicate', 'reserved', 'extra-action'])('rejects a complete corrupted binding table (%s)', corruption => {
    const storage = memoryStorage();
    const model = new ActionSettings({ storage });
    model.rebind('attack', 'KeyQ');
    const key = [...storage.values.keys()][0];
    const bad = JSON.parse(storage.values.get(key)!);
    if (corruption === 'duplicate') bad.bindings.slot1 = bad.bindings.moveUp;
    if (corruption === 'reserved') bad.bindings.slot1 = 'F5';
    if (corruption === 'extra-action') bad.bindings.cheat = 'KeyZ';
    storage.values.set(key, JSON.stringify(bad));
    expect(new ActionSettings({ storage }).getBindings()).toEqual(DEFAULT_BINDINGS);
  });
  it('notifies subscribers once per committed update and cleans up on destroy', () => {
    const model = new ActionSettings({ storage: memoryStorage() });
    const changed = vi.fn();
    const unsubscribe = model.subscribe(changed);
    expect(changed).toHaveBeenCalledTimes(1);
    model.rebind('slot1', 'KeyQ'); expect(changed).toHaveBeenCalledTimes(2);
    model.rebind('slot1', 'KeyW'); expect(changed).toHaveBeenCalledTimes(2);
    unsubscribe(); model.resetDefaults(); expect(changed).toHaveBeenCalledTimes(2);
    model.destroy(); expect(model.rebind('slot1', 'KeyQ').ok).toBe(false);
  });
});


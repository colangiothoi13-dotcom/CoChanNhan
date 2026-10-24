import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionSettings } from '../src/systems/ActionSettings';
import { ActionSettingsModal } from '../src/ui/ActionSettingsModal';
import { browserFixture, TestElement } from './browser-fixture';

describe('accessible loadout and binding settings', () => {
  let browser: ReturnType<typeof browserFixture>;
  let root: TestElement;
  let card: TestElement;
  let body: TestElement;
  let status: TestElement;
  let model: ActionSettings;
  let ui: ActionSettingsModal;
  beforeEach(() => {
    browser = browserFixture();
    root = browser.addElement('modal-action-settings');
    card = browser.addElement('settings-card'); card.className = 'modal-card';
    body = browser.addElement('settings-body'); body.className = 'as-body';
    status = browser.addElement('settings-status'); status.className = 'as-status';
    root.descendants.set('.modal-card', card); root.descendants.set('.as-body', body); root.descendants.set('.as-status', status);
    model = new ActionSettings({ storage: null });
    ui = new ActionSettingsModal(root as unknown as HTMLElement, model, {
      getOwnedGuIds: () => ['moonlight', 'bronze', 'heal', 'moonblade', 'ironskin'],
      getGuDefinition: id => ({ name: id === 'moonlight' ? '<img src=x onerror=alert(1)>' : id, description: 'Description', mpCost: 15, cooldown: 1 }),
    });
    root.appendChild(card); card.appendChild(body); card.appendChild(status);
    for (const tab of ['skills', 'bindings']) {
      const button = browser.addElement('settings-tab-' + tab, 'button');
      button.setAttribute('data-settings-tab', tab); card.appendChild(button);
    }
    ui.open();
  });
  afterEach(() => { ui.destroy(); model.destroy(); vi.unstubAllGlobals(); });
  function button(action: string, value?: string): TestElement {
    const button = browser.addElement('as-' + action + (value ? '-' + value : ''), 'button');
    button.setAttribute('data-settings-action', action);
    if (value) button.setAttribute('data-binding-action', value);
    body.appendChild(button);
    return button;
  }
  function click(target: TestElement): void { const event = new Event('click'); Object.defineProperty(event, 'target', { value: target }); root.dispatchEvent(event); }
  function key(code: string, extra: Record<string, unknown> = {}): Event {
    const event = Object.assign(new Event('keydown', { cancelable: true }), { code, key: code === 'Escape' ? 'Escape' : code.replace(/^Key/, ''), ...extra });
    browser.doc.dispatchEvent(event); return event;
  }
  function switchTab(tab: string): void {
    const target = browser.elements.get('settings-tab-' + tab)!;
    click(target);
  }

  it('renders four slots with owned-only active choices, escaped names and automatic upgrade guidance', () => {
    expect(body.innerHTML).toContain('as-slot-0');
    expect(body.innerHTML).toContain('as-slot-3');
    expect(body.innerHTML).toContain('&lt;img');
    expect(body.innerHTML).not.toContain('<img');
    expect(body.innerHTML).not.toContain('value="ironskin"');
    expect(body.innerHTML).toContain('moonblade');
    expect(body.innerHTML).toContain('tự nâng');
  });
  it('applies a changed slot using the current inventory and keeps passive Gu rejected', () => {
    const select = browser.addElement('as-slot-0', 'select');
    select.setAttribute('data-slot-index', '0'); Object.assign(select, { value: 'moonblade' }); body.appendChild(select);
    const event = new Event('change'); Object.defineProperty(event, 'target', { value: select }); root.dispatchEvent(event);
    expect(model.getSlots()[0]).toBe('moonblade');
    Object.assign(select, { value: 'ironskin' }); root.dispatchEvent(event);
    expect(model.getSlots()[0]).toBe('moonblade');
  });
  it('captures a physical key, reports conflicts and leaves the modal open when Escape cancels capture', () => {
    switchTab('bindings');
    click(button('capture', 'slot1'));
    key('KeyW'); expect(model.getBindings().slot1).toBe('Digit1'); expect(status.textContent).toContain('Đi lên');
    key('KeyQ'); expect(model.getBindings().slot1).toBe('KeyQ');
    click(button('capture', 'slot2')); key('Escape');
    expect(root.classList.contains('active')).toBe(true); expect(model.getBindings().slot2).toBe('Digit2');
    key('Escape'); expect(root.classList.contains('active')).toBe(false);
  });
  it('rejects browser modifier chords and does not hijack native input while rebinding', () => {
    switchTab('bindings'); click(button('capture', 'slot1'));
    const chord = key('KeyR', { ctrlKey: true });
    expect(chord.defaultPrevented).toBe(true); expect(model.getBindings().slot1).toBe('Digit1');
    const field = browser.addElement('native-input', 'input'); body.appendChild(field); field.focus();
    key('KeyQ'); expect(model.getBindings().slot1).toBe('Digit1');
  });
  it('supports roving arrow-key tabs and resets slots and keys through one explicit button', () => {
    const tab = browser.elements.get('settings-tab-skills')!;
    const event = Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowRight' });
    Object.defineProperty(event, 'target', { value: tab }); root.dispatchEvent(event);
    expect(body.innerHTML).toContain('Đánh thường');
    model.rebind('attack', 'KeyQ'); model.assignSlot(0, null, []);
    click(button('reset'));
    expect(model.getBindings().attack).toBe('KeyJ'); expect(model.getSlots()[0]).toBe('moonlight');
  });
  it('stops pending capture and unsubscribes after destroy', () => {
    switchTab('bindings'); click(button('capture', 'slot1'));
    ui.destroy(); const before = body.innerHTML;
    key('KeyQ'); expect(model.getBindings().slot1).toBe('Digit1');
    model.resetDefaults(); expect(body.innerHTML).toBe(before);
    expect(root.classList.contains('active')).toBe(false);
  });
});


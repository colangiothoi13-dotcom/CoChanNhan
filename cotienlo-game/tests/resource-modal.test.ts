import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceModal } from '../src/ui/ResourceModal';
import type { FieldSnapshot } from '../src/world/field-types';
import { browserFixture, TestElement } from './browser-fixture';

describe('server resource management modal', () => {
  let browser: ReturnType<typeof browserFixture>;
  let root: TestElement, card: TestElement, content: TestElement, status: TestElement;
  let snapshot: FieldSnapshot | null;
  let ui: ResourceModal;
  let act: ReturnType<typeof vi.fn>;
  const gu = (id = 'gu-1', typeId = 'moonlight') => ({ id, typeId, name: 'Nguyệt Quang Cổ', rank: 1,
    holderLifeId: 'life-1', controllerLifeId: null, authorizedLifeIds: [], controlled: false, usable: false,
    healthBps: 10000, vitalForLifeId: null, willBps: 10000, tamingProgressBps: 0,
    feeding: { foodId: 'moon-orchid-petal', amount: 1, remainingMs: 300000, state: 'fed' },
    storage: 'bag', lock: null, care: { typeId, foodId: 'moon-orchid-petal', amount: 1, intervalMs: 300000, preservationAllowed: true } });
  beforeEach(() => {
    browser = browserFixture(); root = browser.addElement('modal-resources'); root.className = 'game-modal';
    card = browser.addElement('resource-card'); card.className = 'modal-card';
    content = browser.addElement('resource-content'); content.className = 'rp-content';
    status = browser.addElement('resource-status'); status.className = 'rp-status';
    root.descendants.set('.modal-card', card); root.descendants.set('.rp-content', content); root.descendants.set('.rp-status', status);
    snapshot = { lifeId: 'life-1', accountName: 'Người học', x: 60000, y: 99930, stones: 18, dead: false,
      cultivation: { rank: 1 }, resources: { lifeId: 'life-1', clockMs: 1000, items: [], gu: [gu()],
        recipes: [], jobs: [], farms: [], settings: { autoFeed: false, budget: 0, priority: [] }, notices: [],
        catalog: { resources: [], gu: [], recipes: [], crops: [] }, nearbyNodes: [], wildTargets: [], market: [], players: [], loans: [] } } as unknown as FieldSnapshot;
    act = vi.fn(async () => {});
    ui = new ResourceModal(root as unknown as HTMLElement, { snapshot: () => snapshot, act, error: () => null });
    root.appendChild(card); card.appendChild(content); card.appendChild(status);
  });
  afterEach(() => { ui.destroy(); vi.unstubAllGlobals(); });
  function control(attribute: string, value: string, tag = 'button'): TestElement {
    const button = browser.addElement('control-' + value, tag); button.setAttribute(attribute, value); content.appendChild(button); return button;
  }
  function event(type: string, target: TestElement): Event {
    const event = new Event(type, { cancelable: true }); Object.defineProperty(event, 'target', { value: target }); root.dispatchEvent(event); return event;
  }
  it('shows a real individual Gu with separate custody, control and feeding state', () => {
    ui.open(undefined, 'gu');
    expect(content.innerHTML).toContain('Nguyệt Quang Cổ');
    expect(content.innerHTML).toContain('Chưa luyện hóa');
    expect(content.innerHTML).toContain('data-resource-option="tame"');
    expect(content.innerHTML).toContain('gu-1');
    expect(content.innerHTML).not.toContain('NaN');
  });
  it('does not pretend resources exist before the service returns the resource snapshot', () => {
    snapshot = { lifeId: 'life-1', stones: 18, dead: false } as FieldSnapshot;
    ui.open();
    expect(content.innerHTML).toContain('Đang tải');
    expect(content.innerHTML).not.toContain('data-resource-option="buy-resource"');
    expect(act).not.toHaveBeenCalled();
  });
  it('never reveals wild Gu identity before that shared point is discovered', () => {
    const state = snapshot as unknown as { resources: { nearbyNodes: unknown[]; wildTargets: unknown[] } };
    state.resources.nearbyNodes = [{ id: 'patch', name: 'Dấu vết bên bụi cỏ', kind: 'wild', x: 60010, y: 99930, discovered: false, description: 'Chưa khảo sát' }];
    state.resources.wildTargets = [{ id: 'wild-secret', nodeId: 'patch', name: 'Bí Mật Tiên Cổ', typeId: 'secret', x: 60010, y: 99930, healthBps: 10000, resistanceBps: 9000, baited: false }];
    ui.open(undefined, 'capture');
    expect(content.innerHTML).toContain('Dấu vết chưa khảo sát');
    expect(content.innerHTML).not.toContain('Dấu vết bên bụi cỏ');
    expect(content.innerHTML).toContain('data-resource-option="scout"');
    expect(content.innerHTML).not.toContain('Bí Mật Tiên Cổ');
  });
  it('submits actual Gu instance identity and prevents a second command until the first settles', async () => {
    let complete: (() => void) | undefined;
    act.mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
    ui.open(undefined, 'gu');
    const button = control('data-resource-option', 'feed'); button.setAttribute('data-resource-payload', JSON.stringify({ instanceId: 'gu-1' }));
    event('click', button); event('click', button);
    expect(act).toHaveBeenCalledExactlyOnceWith({ type: 'resource', payload: { option: 'feed', instanceId: 'gu-1' } });
    complete!(); await Promise.resolve(); await Promise.resolve();
    expect(status.textContent).toContain('ghi nhận');
  });
  it('keeps a focused form and user draft during incoming inventory updates', () => {
    ui.open(undefined, 'market'); const html = content.innerHTML;
    const input = Object.assign(control('data-resource-draft', 'listing-price', 'input'), { value: '17', type: 'number' });
    input.focus(); event('input', input);
    (snapshot as unknown as { resources: { items: unknown[] } }).resources.items.push({ id: 'ore', name: 'Quặng', quantity: 3, known: true, definition: { id: 'ore', name: 'Quặng' } });
    ui.update();
    expect(content.innerHTML).toBe(html);
    expect(browser.doc.activeElement).toBe(input);
    expect(input.value).toBe('17');
  });
  it('restores focus on close and ignores controls after destruction', () => {
    const opener = browser.addElement('resource-opener', 'button'); opener.focus(); ui.open(opener as unknown as HTMLElement);
    ui.close(); expect(browser.doc.activeElement).toBe(opener);
    ui.destroy(); event('click', control('data-resource-option', 'feed'));
    expect(act).not.toHaveBeenCalled();
  });
  it('charges a buyer the listed price while identifying the seller fee separately', () => {
    const state = snapshot as unknown as { stones: number; facilities: unknown[]; resources: { market: unknown[] } };
    state.stones = 10; state.facilities = [{ role: 'academy', x: 60000, y: 99930 }];
    state.resources.market = [{ id: 'listing-1', sellerName: 'Người bán', kind: 'resource', resourceId: 'ore', quantity: 2, price: 10, fee: 1, own: false }];
    ui.open(undefined, 'market');
    const buy = content.innerHTML.match(/<button[^>]*data-resource-option="buy-listing"[^>]*>/)?.[0];
    expect(buy).toBeTruthy(); expect(buy).not.toContain('disabled');
    expect(content.innerHTML).toContain('người bán chịu phí 1');
  });
  it('sends a zero auto-feed budget without inventing a purchase allowance', async () => {
    ui.open(undefined, 'gu');
    const form = control('data-resource-form', '', 'form'); form.setAttribute('data-resource-option', 'auto-feed');
    const budget = Object.assign(browser.addElement('budget', 'input'), { value: '0' }); budget.setAttribute('data-resource-field', 'budget'); form.appendChild(budget);
    const enabled = Object.assign(browser.addElement('enabled', 'input'), { type: 'checkbox', checked: true }); enabled.setAttribute('data-resource-field', 'enabled'); form.appendChild(enabled);
    event('submit', form); await Promise.resolve();
    expect(act).toHaveBeenCalledExactlyOnceWith({ type: 'resource', payload: { option: 'auto-feed', budget: 0, enabled: true } });
  });
  it('requires two distinct Small Light instances before sending the Moonbeam recipe', async () => {
    const state = snapshot as unknown as { resources: { gu: ReturnType<typeof gu>[]; recipes: unknown[] } };
    state.resources.gu = [gu('moon', 'moonlight'), gu('small-a', 'smalllight'), gu('small-b', 'smalllight')];
    state.resources.recipes = [{ id: 'moonbeam-formula', known: true, progressBps: 10000, missing: [], definition: {
      name: 'Nguyệt Mang Cổ', inputs: [{ typeId: 'moonlight', count: 1 }, { typeId: 'smalllight', count: 2 }], materials: {}, preservedMaterials: {}, stones: 3, essenceBps: 500,
      durationMs: 10000, successBps: 7000, minRank: 1, minRefinement: 0, environment: 'academy', resultRank: 2, kind: 'combine',
    } }];
    ui.open(undefined, 'recipes');
    const form = control('data-resource-form', '', 'form'); form.setAttribute('data-resource-option', 'start-refine'); form.setAttribute('data-resource-payload', '{"recipeId":"moonbeam-formula"}');
    const addInput = (id: string, value: string) => { const input = Object.assign(browser.addElement(id, 'input'), { type: 'checkbox', checked: true, value }); input.setAttribute('data-resource-field', 'inputIds'); form.appendChild(input); return input; };
    addInput('moon-choice', 'moon'); addInput('first-small', 'small-a'); const second = addInput('second-small', 'small-a');
    event('submit', form); expect(act).not.toHaveBeenCalled(); expect(status.textContent).toContain('khác nhau');
    second.value = 'small-b'; event('submit', form); await Promise.resolve();
    expect(act).toHaveBeenCalledExactlyOnceWith({ type: 'resource', payload: { option: 'start-refine', recipeId: 'moonbeam-formula', inputIds: ['moon', 'small-a', 'small-b'] } });
  });
  it('requires an explicit irreversible confirmation before destroying a controlled Gu', async () => {
    ui.open(undefined, 'gu');
    const form = control('data-resource-form', '', 'form'); form.setAttribute('data-resource-option', 'destroy-gu'); form.setAttribute('data-resource-payload', '{"instanceId":"gu-1","mode":"confirm"}');
    const checkbox = Object.assign(browser.addElement('destroy-confirm', 'input'), { type: 'checkbox', checked: false }); checkbox.setAttribute('data-resource-confirm', ''); form.appendChild(checkbox);
    event('submit', form); expect(act).not.toHaveBeenCalled(); expect(status.textContent).toContain('vĩnh viễn');
    checkbox.checked = true; event('submit', form); await Promise.resolve();
    expect(act).toHaveBeenCalledExactlyOnceWith({ type: 'resource', payload: { option: 'destroy-gu', instanceId: 'gu-1', mode: 'confirm' } });
  });
  it('uses immortal stones rather than mortal money for an active Treasure Heaven listing', () => {
    const state = snapshot as unknown as { stones: number; cultivation: { rank: number }; resources: { items: unknown[]; marketAccess: unknown; market: unknown[] } };
    state.stones = 0; state.cultivation.rank = 6;
    state.resources.items = [{ id: 'immortal-stone', name: 'Tiên nguyên thạch', quantity: 2, known: true, definition: { id: 'immortal-stone', name: 'Tiên nguyên thạch', uses: [], grade: 6 } }];
    state.resources.marketAccess = { active: true, treasureHeavenUntilMs: 181000, serviceFee: 1, currency: 'immortal-stone' };
    state.resources.market = [{ id: 'heaven-listing', sellerName: 'Cổ Tiên', kind: 'gu', quantity: 1, price: 2, fee: 1, own: false, channel: 'treasure-heaven', gu: gu() }];
    ui.open(undefined, 'market');
    const buy = content.innerHTML.match(/<button[^>]*data-resource-option="buy-listing"[^>]*>/)?.[0];
    expect(buy).toBeTruthy(); expect(buy).not.toContain('disabled');
    expect(content.innerHTML).toContain('2 tiên nguyên thạch');
    expect(content.innerHTML).toContain('tiếp dẫn');
  });
  it('opens paid assisted Treasure Heaven access with the dedicated broker command', async () => {
    const state = snapshot as unknown as { cultivation: { rank: number }; facilities: unknown[]; resources: { items: unknown[]; marketAccess: unknown } };
    state.cultivation.rank = 6; state.facilities = [{ role: 'academy', x: 60000, y: 99930 }];
    state.resources.items = [{ id: 'immortal-stone', name: 'Tiên nguyên thạch', quantity: 1, known: true, definition: { id: 'immortal-stone', name: 'Tiên nguyên thạch', uses: [], grade: 6 } }];
    state.resources.marketAccess = { active: false, treasureHeavenUntilMs: 0, serviceFee: 1, currency: 'immortal-stone' };
    ui.open(undefined, 'market');
    const broker = content.innerHTML.match(/<button[^>]*data-resource-option="open-treasure-heaven"[^>]*>/)?.[0];
    expect(broker).toBeTruthy(); expect(broker).not.toContain('disabled');
    event('click', control('data-resource-option', 'open-treasure-heaven')); await Promise.resolve();
    expect(act).toHaveBeenCalledExactlyOnceWith({ type: 'resource', payload: { option: 'open-treasure-heaven' } });
  });
  it('keeps the selected Treasure Heaven channel in the listing command', async () => {
    ui.open(undefined, 'market');
    const form = control('data-resource-form', '', 'form'); form.setAttribute('data-resource-option', 'create-listing');
    for (const [field, value] of [['mode', 'treasure-heaven'], ['resourceId', 'moon-orchid-petal'], ['quantity', '2'], ['price', '3']]) {
      const input = Object.assign(browser.addElement('listing-' + field, 'input'), { value }); input.setAttribute('data-resource-field', field); form.appendChild(input);
    }
    event('submit', form); await Promise.resolve();
    expect(act).toHaveBeenCalledExactlyOnceWith({ type: 'resource', payload: { option: 'create-listing', mode: 'treasure-heaven', resourceId: 'moon-orchid-petal', quantity: 2, price: 3 } });
  });
  it('separates living Gu holdings from terminal refinement history', () => {
    const wealth = browser.addElement('test-wealth'); root.descendants.set('.rp-wealth', wealth);
    const state = snapshot as unknown as { resources: { gu: ReturnType<typeof gu>[] } };
    const consumed = gu('consumed'); consumed.healthBps = 0; consumed.feeding.state = 'dead'; state.resources.gu.push(consumed);
    ui.open(undefined, 'gu');
    expect(wealth.textContent).toContain('1 Cổ còn sống');
    expect(wealth.textContent).toContain('1 đã chết/tiêu hao');
    expect(content.innerHTML).toContain('Ghi nhận Cổ đã chết hoặc tiêu hao (1)');
  });
  it('disables an expired global offer without resetting the focused listing draft', () => {
    const state = snapshot as unknown as { resources: { clockMs: number; marketAccess: { active: boolean; treasureHeavenUntilMs: number }; market: unknown[] } };
    state.resources.marketAccess = { active: true, treasureHeavenUntilMs: 10000 };
    state.resources.market = [{ id: 'heaven-offer', kind: 'resource', sellerName: 'Cổ Tiên', resourceId: 'ore', price: 2, quantity: 1, fee: 1, own: false, channel: 'treasure-heaven' }];
    ui.open(undefined, 'market'); const before = content.innerHTML;
    const buy = Object.assign(control('data-resource-option', 'buy-listing'), { disabled: false }); buy.setAttribute('data-resource-payload', '{"listingId":"heaven-offer"}');
    const input = Object.assign(control('data-resource-draft', 'listing-price', 'input'), { value: '17', type: 'number' }); input.focus(); event('input', input);
    state.resources.clockMs = 11000; state.resources.marketAccess.active = false; ui.update();
    expect(buy.disabled).toBe(true); expect(input.value).toBe('17');
    expect(content.innerHTML).toBe(before); expect(browser.doc.activeElement).toBe(input);
  });
  it('keeps a pressed submit target attached across focusout and server updates until its native submit is captured', async () => {
    vi.useFakeTimers();
    try {
      ui.open(undefined, 'gu');
      const form = control('data-resource-form', '', 'form'); form.setAttribute('data-resource-option', 'feed'); form.setAttribute('data-resource-payload', '{"instanceId":"gu-1"}');
      const input = Object.assign(browser.addElement('last-recipe-choice', 'input'), { type: 'checkbox', checked: true }); form.appendChild(input);
      const submit = browser.addElement('pressed-submit', 'button'); submit.setAttribute('type', 'submit'); form.appendChild(submit);
      input.focus();
      const down = new Event('pointerdown'); Object.defineProperties(down, { target: { value: submit }, pointerId: { value: 7 } }); root.dispatchEvent(down);
      submit.focus(); event('focusout', input);
      (snapshot as unknown as { resources: { gu: ReturnType<typeof gu>[] } }).resources.gu[0].healthBps = 9900;
      ui.update(); await Promise.resolve();
      expect(content.contains(submit)).toBe(true);
      const up = new Event('pointerup'); Object.defineProperty(up, 'pointerId', { value: 7 }); browser.doc.dispatchEvent(up);
      expect(content.contains(submit)).toBe(true);
      event('submit', form);
      expect(act).toHaveBeenCalledExactlyOnceWith({ type: 'resource', payload: { option: 'feed', instanceId: 'gu-1' } });
      await vi.runAllTimersAsync();
      expect(act).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it('waits for every pressed pointer, releases cancelled interactions and clears timers on destroy', async () => {
    vi.useFakeTimers();
    try {
      ui.open(undefined, 'gu'); const button = control('data-test-pointer', 'target'); button.focus();
      const pointer = (type: string, id: number) => {
        const event = new Event(type); Object.defineProperties(event, { target: { value: button }, pointerId: { value: id } });
        (type === 'pointerdown' ? root : browser.doc).dispatchEvent(event);
      };
      pointer('pointerdown', 1); pointer('pointerdown', 2);
      (snapshot as unknown as { resources: { gu: ReturnType<typeof gu>[] } }).resources.gu[0].healthBps = 9800;
      ui.update(); expect(content.contains(button)).toBe(true);
      pointer('pointercancel', 1); await vi.runOnlyPendingTimersAsync();
      expect(content.contains(button)).toBe(true);
      pointer('pointerup', 2); expect(content.contains(button)).toBe(true);
      await vi.runOnlyPendingTimersAsync(); expect(content.contains(button)).toBe(false);
      const next = control('data-test-pointer', 'next');
      const down = new Event('pointerdown'); Object.defineProperties(down, { target: { value: next }, pointerId: { value: 3 } }); root.dispatchEvent(down);
      const up = new Event('pointerup'); Object.defineProperty(up, 'pointerId', { value: 3 }); browser.doc.dispatchEvent(up);
      expect(vi.getTimerCount()).toBe(1); ui.destroy(); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});

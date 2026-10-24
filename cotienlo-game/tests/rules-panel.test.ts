import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RulesPanel } from '../src/rules/RulesPanel';
import { DEMO_IDS as ids } from '../src/rules/types';
import { type RulesSimulation } from '../src/rules/RulesSimulation';
import { browserFixture, TestElement } from './browser-fixture';

describe('rules lesson controls', () => {
  let browser: ReturnType<typeof browserFixture>;
  let root: TestElement;
  let card: TestElement;
  let panel: RulesPanel;
  beforeEach(() => {
    browser = browserFixture();
    root = browser.addElement('modal-rules');
    card = browser.addElement('rules-card');
    root.querySelector = selector => selector === '.modal-card' ? card : null;
    panel = new RulesPanel(root as unknown as HTMLElement);
  });
  afterEach(() => { panel.destroy(); vi.unstubAllGlobals(); });
  function click(dataset: { rulesView?: string; rulesAction?: string }) {
    const target = browser.addElement('control', 'button');
    Object.assign(target, { dataset });
    for (const [key, value] of Object.entries(dataset))
      target.setAttribute(key === 'rulesView' ? 'data-rules-view' : 'data-rules-action', value);
    const event = new Event('click');
    Object.defineProperty(event, 'target', { value: target });
    root.dispatchEvent(event);
  }
  const engine = () => (panel as unknown as { engine: RulesSimulation }).engine;

  it('the risky absorption control reaches fatal overload after shattering', () => {
    click({ rulesView: 'ascension' });
    click({ rulesAction: 'rules-shatter' });
    click({ rulesAction: 'rules-absorb-risk' });
    expect(engine().snapshot().actors[ids.ascender].alive).toBe(false);
    expect(card.innerHTML).toContain('Mất cân bằng hoặc vượt nhân khí');
  });

  it('the 300-inner-year lesson keeps the owner alive to resolve both outcomes', () => {
    click({ rulesView: 'tribulation' });
    click({ rulesAction: 'rules-advance-three-hundred' });
    const before = engine().snapshot();
    expect(before.apertures[ids.aperture].innerTicks).toBe(300000);
    expect(before.actors[ids.immortal].alive).toBe(true);
    expect(before.tribulations).toHaveLength(33);
    click({ rulesAction: 'rules-defend' });
    const defended = engine().snapshot();
    expect(defended.tribulations[0].status).toBe('passed');
    expect(defended.actors[ids.immortal].stones).toBe(before.actors[ids.immortal].stones - 5);
    expect(defended.apertures[ids.aperture].daoMarks).toBe(10);
    click({ rulesAction: 'rules-fail-tribulation' });
    expect(engine().snapshot().tribulations[1].status).toBe('failed');
  });
});

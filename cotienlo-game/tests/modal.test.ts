import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as modalHelpers from '../src/ui/Modal';
import { browserFixture, keyEvent } from './browser-fixture';

describe('game modal keyboard boundaries', () => {
  let browser: ReturnType<typeof browserFixture>;
  beforeEach(() => { browser = browserFixture(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  function panel(id: string) {
    const modal = browser.addElement(`modal-${id}`);
    modal.className = 'game-modal';
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    const card = browser.doc.createElement('section');
    card.className = 'modal-card';
    card.tabIndex = -1;
    modal.appendChild(card);
    const first = browser.doc.createElement('button');
    const last = browser.doc.createElement('button');
    card.appendChild(first);
    card.appendChild(last);
    return { modal, card, first, last };
  }

  it('reveals one dialog, focuses its heading container, and isolates game controls', () => {
    const trigger = browser.addElement('btn-open-inventory', 'button');
    const hud = browser.addElement('top-hud');
    const { modal, card } = panel('inventory');
    trigger.focus();
    modalHelpers.openModal(modal as unknown as HTMLElement);
    expect(modal.hidden).toBe(false);
    expect(modal.getAttribute('aria-hidden')).toBe('false');
    expect(modal.classList.contains('active')).toBe(true);
    expect(browser.doc.activeElement === card).toBe(true);
    expect(hud.inert).toBe(true);
  });

  it('cycles Tab and Shift+Tab inside the open dialog and skips hidden or disabled controls', () => {
    const { modal, card, first, last } = panel('inventory');
    const disabled = browser.doc.createElement('button');
    disabled.disabled = true;
    const hidden = browser.doc.createElement('button');
    hidden.hidden = true;
    card.appendChild(disabled);
    card.appendChild(hidden);
    modalHelpers.openModal(modal as unknown as HTMLElement);
    const enter = keyEvent('keydown', 'Tab');
    browser.doc.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(browser.doc.activeElement === first).toBe(true);
    const reverse = Object.assign(keyEvent('keydown', 'Tab'), { shiftKey: true });
    browser.doc.dispatchEvent(reverse);
    expect(browser.doc.activeElement === last).toBe(true);
    browser.doc.dispatchEvent(keyEvent('keydown', 'Tab'));
    expect(browser.doc.activeElement === first).toBe(true);
  });

  it('closes on Escape, hides its controls, and restores the opener and previous inert state', () => {
    const trigger = browser.addElement('btn-open-inventory', 'button');
    const hud = browser.addElement('top-hud');
    const alreadyInert = browser.addElement('unavailable');
    alreadyInert.inert = true;
    const { modal } = panel('inventory');
    trigger.focus();
    modalHelpers.openModal(modal as unknown as HTMLElement);
    const escape = keyEvent('keydown', 'Escape');
    browser.doc.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(modal.hidden).toBe(true);
    expect(modal.getAttribute('aria-hidden')).toBe('true');
    expect(modal.classList.contains('active')).toBe(false);
    expect(browser.doc.activeElement === trigger).toBe(true);
    expect(hud.inert).toBe(false);
    expect(alreadyInert.inert).toBe(true);
    const outsideTab = keyEvent('keydown', 'Tab');
    browser.doc.dispatchEvent(outsideTab);
    expect(outsideTab.defaultPrevented).toBe(false);
  });

  it('switches panels without leaving an invisible dialog active and returns focus to the correct trigger', () => {
    const inventoryTrigger = browser.addElement('btn-open-inventory', 'button');
    const refineTrigger = browser.addElement('btn-open-refine', 'button');
    const inventory = panel('inventory');
    const refine = panel('refine');
    inventoryTrigger.focus();
    modalHelpers.openModal(inventory.modal as unknown as HTMLElement);
    (modalHelpers.openModal as (modal: HTMLElement, trigger: HTMLElement) => void)(
      refine.modal as unknown as HTMLElement, refineTrigger as unknown as HTMLElement,
    );
    expect(inventory.modal.hidden).toBe(true);
    expect(inventory.modal.getAttribute('aria-hidden')).toBe('true');
    expect(inventory.modal.classList.contains('active')).toBe(false);
    expect(browser.doc.activeElement === refine.card).toBe(true);
    expect(typeof modalHelpers.closeModal).toBe('function');
    modalHelpers.closeModal(refine.modal as unknown as HTMLElement);
    expect(browser.doc.activeElement === refineTrigger).toBe(true);
  });

  it('lets native Tab traversal continue from the wiki sidebar summary', () => {
    const { modal, card, last } = panel('wiki');
    const details = browser.doc.createElement('details');
    const summary = browser.doc.createElement('summary');
    details.appendChild(summary);
    card.appendChild(details);
    card.appendChild(last);
    modalHelpers.openModal(modal as unknown as HTMLElement);
    summary.focus();
    const tab = keyEvent('keydown', 'Tab');
    browser.doc.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(browser.doc.activeElement === summary).toBe(true);
    const reverse = Object.assign(keyEvent('keydown', 'Tab'), { shiftKey: true });
    browser.doc.dispatchEvent(reverse);
    expect(reverse.defaultPrevented).toBe(false);
  });
  it('keeps Tab inside the dialog when a refreshed card has programmatic focus', () => {
    const { modal, card, first } = panel('inventory');
    const refreshedCard = browser.doc.createElement('article');
    refreshedCard.tabIndex = -1;
    card.appendChild(refreshedCard);
    modalHelpers.openModal(modal as unknown as HTMLElement);
    refreshedCard.focus();
    const tab = keyEvent('keydown', 'Tab');
    browser.doc.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(browser.doc.activeElement === first).toBe(true);
  });
});

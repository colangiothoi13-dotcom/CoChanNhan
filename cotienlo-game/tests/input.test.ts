import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from '../src/engine/InputManager';
import { browserFixture, keyEvent, TestElement } from './browser-fixture';
import { DEFAULT_BINDINGS } from '../src/systems/ActionSettings';

describe('game input boundaries', () => {
  let browser: ReturnType<typeof browserFixture>;
  beforeEach(() => { browser = browserFixture(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('releases held movement when focus is lost', () => {
    const input = new InputManager();
    browser.win.dispatchEvent(keyEvent('keydown', 'KeyW'));
    expect(input.getMoveVector().y).toBe(-1);
    browser.win.dispatchEvent(new Event('blur'));
    expect(input.getMoveVector().length).toBe(0);
  });

  it('blocks and clears held movement while a modal is open', () => {
    const input = new InputManager();
    browser.win.dispatchEvent(keyEvent('keydown', 'KeyD'));
    const modal = browser.addElement('modal-inventory');
    modal.classList.add('game-modal');
    modal.classList.add('active');
    expect(input.getMoveVector().length).toBe(0);
    modal.classList.remove('active');
    expect(input.getMoveVector().length).toBe(0);
  });

  it('does not turn text entry into movement', () => {
    const input = new InputManager();
    const field = new TestElement();
    field.tagName = 'INPUT';
    browser.doc.activeElement = field;
    browser.win.dispatchEvent(keyEvent('keydown', 'KeyW'));
    expect(input.getMoveVector().length).toBe(0);
  });

  it('releases input when the document is hidden', () => {
    const input = new InputManager();
    browser.win.dispatchEvent(keyEvent('keydown', 'ArrowUp'));
    browser.doc.hidden = true;
    browser.doc.dispatchEvent(new Event('visibilitychange'));
    browser.doc.hidden = false;
    expect(input.getMoveVector().length).toBe(0);
  });

  it('uses the remapped movement key instead of the old WASD key', () => {
    const input = new InputManager();
    input.setBindings({ ...DEFAULT_BINDINGS, moveUp: 'KeyQ' });
    browser.win.dispatchEvent(keyEvent('keydown', 'KeyW'));
    expect(input.getMoveVector().length).toBe(0);
    browser.win.dispatchEvent(keyEvent('keydown', 'KeyQ'));
    expect(input.getMoveVector().y).toBe(-1);
    input.destroy();
  });

  it('does not also move when an arrow key is assigned to a skill', () => {
    const input = new InputManager();
    input.setBindings({ ...DEFAULT_BINDINGS, slot1: 'ArrowUp' });
    browser.win.dispatchEvent(keyEvent('keydown', 'ArrowUp'));
    expect(input.getMoveVector().length).toBe(0);
    browser.win.dispatchEvent(keyEvent('keydown', 'ArrowLeft'));
    expect(input.getMoveVector().x).toBe(-1);
    input.destroy();
  });
});

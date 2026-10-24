import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CombatAimInput } from '../src/engine/CombatAimInput';
import { browserFixture, TestElement } from './browser-fixture';

type PointerOptions = Partial<{ pointerId: number; pointerType: string; clientX: number; clientY: number; button: number; buttons: number }>;
function pointer(target: EventTarget, type: string, options: PointerOptions = {}): Event {
  const event = Object.assign(new Event(type, { cancelable: true }), {
    pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, button: 0, buttons: 1, ...options,
  });
  target.dispatchEvent(event);
  return event;
}
function click(target: EventTarget, detail = 1, extra: Record<string, unknown> = {}): void {
  target.dispatchEvent(Object.assign(new Event('click', { cancelable: true }), { detail, button: 0, clientX: 100, clientY: 100, ...extra }));
}

describe('independent combat aim input', () => {
  let browser: ReturnType<typeof browserFixture>;
  let attack: TestElement;
  let moonlight: TestElement;
  let controller: CombatAimInput;
  let allowed: boolean;
  let cast: ReturnType<typeof vi.fn>;
  const player = { x: 900, y: 600, facingAngle: Math.PI };
  let cameraX: number;
  const camera = { screenToWorld: (x: number, y: number) => ({ x: x + cameraX, y: y + 300 }) };

  beforeEach(() => {
    browser = browserFixture();
    attack = browser.addElement('btn-attack', 'button');
    moonlight = browser.addElement('btn-gu-moonlight', 'button');
    for (const button of [attack, moonlight]) Object.assign(button, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    Object.assign(browser.canvas, { width: 1600, height: 1200,
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 800, height: 600 }) });
    allowed = true;
    cameraX = 500;
    cast = vi.fn();
    controller = new CombatAimInput({ canvas: browser.canvas as unknown as HTMLCanvasElement,
      attackButton: attack as unknown as HTMLElement, moonlightButton: moonlight as unknown as HTMLElement,
      canAct: () => allowed, onCast: cast });
  });
  afterEach(() => { controller.destroy(); vi.unstubAllGlobals(); });

  it('converts CSS mouse coordinates at cast time without DPR scaling or changing movement facing', () => {
    expect(controller.hasAim()).toBe(false);
    expect(controller.getAngle(player, camera)).toBe(Math.PI);
    pointer(browser.canvas, 'pointermove', { pointerType: 'mouse', clientX: 610, clientY: 320, buttons: 0 });
    expect(controller.hasAim()).toBe(true);
    expect(controller.getAngle(player, camera)).toBe(0);
    cameraX = 100;
    expect(controller.getAngle(player, camera)).toBe(Math.PI);
    expect(player.facingAngle).toBe(Math.PI);
  });

  it('keeps the last canvas aim while moving over HUD buttons and uses the actual mouse click point on canvas', () => {
    pointer(browser.canvas, 'pointermove', { pointerType: 'mouse', clientX: 610, clientY: 320, buttons: 0 });
    pointer(moonlight, 'pointermove', { pointerType: 'mouse', clientX: 50, clientY: 50, buttons: 0 });
    click(moonlight);
    expect(cast).toHaveBeenLastCalledWith('moonlight');
    expect(controller.getAngle(player, camera)).toBe(0);
    click(browser.canvas, 1, { pointerType: 'mouse', clientX: 210, clientY: 320 });
    expect(cast).toHaveBeenLastCalledWith('attack');
    expect(controller.getAngle(player, camera)).toBe(Math.PI);
  });

  it('does not let a held mouse joystick pointer take over hover aim', () => {
    pointer(browser.canvas, 'pointermove', { pointerType: 'mouse', clientX: 610, clientY: 320, buttons: 0 });
    pointer(browser.canvas, 'pointermove', { pointerType: 'mouse', clientX: 210, clientY: 320, buttons: 1 });
    expect(controller.getAngle(player, camera)).toBe(0);
  });

  it('does not cast from touch or pen canvas taps; pen hover can still aim', () => {
    pointer(browser.canvas, 'pointerdown', { pointerType: 'touch' });
    click(browser.canvas, 1, { pointerType: 'touch' });
    expect(cast).not.toHaveBeenCalled();
    pointer(browser.canvas, 'pointermove', { pointerType: 'pen', clientX: 610, clientY: 320, buttons: 0 });
    expect(controller.getAngle(player, camera)).toBe(0);
    pointer(browser.canvas, 'pointerdown', { pointerType: 'pen' });
    click(browser.canvas, 1, { pointerType: 'pen' });
    expect(cast).not.toHaveBeenCalled();
    pointer(browser.canvas, 'pointerdown', { pointerType: 'mouse', buttons: 1 });
    click(browser.canvas, 1, { clientX: 610, clientY: 320 });
    expect(cast).toHaveBeenCalledExactlyOnceWith('attack');
  });

  it('aims a captured drag from finger-down, releases once, and suppresses its compatibility click', () => {
    pointer(moonlight, 'pointerdown', { pointerId: 7, clientX: 120, clientY: 100 });
    expect(cast).not.toHaveBeenCalled();
    pointer(browser.win, 'pointermove', { pointerId: 7, clientX: 120, clientY: 140 });
    expect(controller.getAngle(player, camera)).toBeCloseTo(Math.PI / 2);
    expect(controller.getDragPreview()).toEqual({ startX: 120, startY: 100, x: 120, y: 140 });
    pointer(browser.win, 'pointerup', { pointerId: 7, clientX: 120, clientY: 140 });
    expect(controller.getDragPreview()).toBeNull();
    expect(cast).toHaveBeenCalledExactlyOnceWith('moonlight');
    click(moonlight, 1, { pointerType: 'touch' });
    expect(cast).toHaveBeenCalledTimes(1);
    click(moonlight, 0);
    expect(cast).toHaveBeenCalledTimes(2);
  });

  it('retains the last dragged angle for taps inside the 12 CSS-pixel dead zone', () => {
    pointer(attack, 'pointerdown');
    pointer(browser.win, 'pointermove', { clientX: 140 });
    pointer(browser.win, 'pointerup', { clientX: 140 });
    pointer(attack, 'pointerdown', { pointerId: 2 });
    pointer(browser.win, 'pointermove', { pointerId: 2, clientX: 103, clientY: 105 });
    pointer(browser.win, 'pointerup', { pointerId: 2, clientX: 103, clientY: 105 });
    expect(controller.getAngle(player, camera)).toBe(0);
    expect(cast).toHaveBeenCalledTimes(2);
  });

  it.each(['pointercancel', 'lostpointercapture'])('never fires a cancelled gesture (%s)', type => {
    pointer(attack, 'pointerdown');
    pointer(browser.win, 'pointermove', { clientY: 150 });
    pointer(type === 'lostpointercapture' ? attack : browser.win, type);
    pointer(browser.win, 'pointerup', { clientY: 150 });
    click(attack, 1, { pointerType: 'touch' });
    expect(cast).not.toHaveBeenCalled();
    expect(controller.getDragPreview()).toBeNull();
  });

  it('ignores another finger moving or releasing while the aim finger remains active', () => {
    pointer(moonlight, 'pointerdown', { pointerId: 7 });
    pointer(browser.win, 'pointermove', { pointerId: 1, clientX: 400 });
    pointer(browser.win, 'pointerup', { pointerId: 1 });
    expect(controller.getDragPreview()).toEqual({ startX: 100, startY: 100, x: 100, y: 100 });
    pointer(browser.win, 'pointerup', { pointerId: 7, clientX: 140 });
    expect(cast).toHaveBeenCalledExactlyOnceWith('moonlight');
  });

  it('rejects a second aim finger without firing its native click or cancelling the first', () => {
    pointer(attack, 'pointerdown', { pointerId: 7 });
    pointer(moonlight, 'pointerdown', { pointerId: 8 });
    pointer(browser.win, 'pointerup', { pointerId: 8 });
    click(moonlight, 1, { pointerType: 'touch' });
    expect(cast).not.toHaveBeenCalled();
    pointer(browser.win, 'pointerup', { pointerId: 7, clientY: 140 });
    expect(cast).toHaveBeenCalledExactlyOnceWith('attack');
  });

  it('also rejects a second mouse pointer while a captured touch aim is active', () => {
    pointer(attack, 'pointerdown', { pointerId: 7 });
    pointer(moonlight, 'pointerdown', { pointerId: 8, pointerType: 'mouse' });
    click(moonlight, 1, { pointerType: 'mouse' });
    pointer(browser.canvas, 'pointerdown', { pointerId: 8, pointerType: 'mouse' });
    click(browser.canvas, 1, { pointerType: 'mouse' });
    expect(cast).not.toHaveBeenCalled();
    pointer(browser.win, 'pointerup', { pointerId: 7, clientX: 140 });
    expect(cast).toHaveBeenCalledExactlyOnceWith('attack');
  });

  it('cancels while blocked and never fires after a modal closes before the old click arrives', () => {
    pointer(attack, 'pointerdown');
    allowed = false;
    pointer(browser.win, 'pointermove', { clientX: 140 });
    allowed = true;
    pointer(browser.win, 'pointerup', { clientX: 140 });
    click(attack, 1, { pointerType: 'touch' });
    expect(cast).not.toHaveBeenCalled();
    allowed = false;
    pointer(moonlight, 'pointerdown', { pointerId: 3 });
    allowed = true;
    click(moonlight, 1, { pointerType: 'touch' });
    expect(cast).not.toHaveBeenCalled();
  });

  it.each(['blur', 'visibility'])('clears transient aim when the page is interrupted (%s)', type => {
    pointer(attack, 'pointerdown');
    pointer(browser.win, 'pointermove', { clientX: 140 });
    if (type === 'blur') browser.win.dispatchEvent(new Event('blur'));
    else { browser.doc.hidden = true; browser.doc.dispatchEvent(new Event('visibilitychange')); browser.doc.hidden = false; }
    pointer(browser.win, 'pointerup', { clientX: 140 });
    click(attack, 1, { pointerType: 'touch' });
    expect(cast).not.toHaveBeenCalled();
    expect(controller.hasAim()).toBe(false);
  });

  it('reset blocks late touch clicks but a fresh mouse down and keyboard clicks remain usable', () => {
    pointer(attack, 'pointerdown');
    controller.reset();
    pointer(browser.win, 'pointerup');
    click(attack, 1, { pointerType: 'touch' });
    expect(cast).not.toHaveBeenCalled();
    pointer(attack, 'pointerdown', { pointerType: 'mouse' });
    click(attack, 1, { pointerType: 'mouse' });
    click(moonlight, 0);
    expect(cast.mock.calls).toEqual([['attack'], ['moonlight']]);
  });

  it('destroy removes all interactions, cancels capture and remains idempotent', () => {
    pointer(attack, 'pointerdown');
    controller.destroy();
    controller.destroy();
    pointer(browser.win, 'pointerup');
    click(attack, 0);
    click(browser.canvas, 1, { pointerType: 'mouse' });
    expect(cast).not.toHaveBeenCalled();
    expect(controller.getDragPreview()).toBeNull();
    expect(controller.hasAim()).toBe(false);
  });

  it('does not cast disabled controls or update hover aim while actions are blocked', () => {
    attack.disabled = true;
    click(attack, 0);
    pointer(attack, 'pointerdown');
    pointer(browser.win, 'pointerup');
    allowed = false;
    pointer(browser.canvas, 'pointermove', { pointerType: 'mouse', clientX: 610, clientY: 320, buttons: 0 });
    click(moonlight, 0);
    expect(cast).not.toHaveBeenCalled();
    expect(controller.hasAim()).toBe(false);
  });
});


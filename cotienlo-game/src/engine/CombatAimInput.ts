export type CombatAction = 'attack' | 'moonlight' | 'slot1' | 'slot2' | 'slot3' | 'slot4';

interface Options {
  canvas: HTMLCanvasElement;
  attackButton: HTMLElement | null;
  moonlightButton: HTMLElement | null;
  skillButtons?: { button: HTMLElement | null; action: CombatAction }[];
  canAct: () => boolean;
  onCast: (action: CombatAction) => void;
}
interface Point { x: number; y: number; }
interface Gesture {
  pointerId: number;
  button: HTMLElement;
  action: CombatAction;
  start: Point;
  current: Point;
}
type Aim = { kind: 'screen'; point: Point } | { kind: 'angle'; angle: number };
export interface DragPreview { startX: number; startY: number; x: number; y: number; }

const DRAG_DEAD_ZONE = 12;
function pointFrom(event: MouseEvent | PointerEvent): Point | null {
  return Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
    ? { x: event.clientX, y: event.clientY } : null;
}
function isDragPointer(event: PointerEvent): boolean {
  return event.pointerType === 'touch' || event.pointerType === 'pen';
}

/** Independent weapon input. It never changes movement, facing, dash, or resources. */
export class CombatAimInput {
  private listeners = new AbortController();
  private aim: Aim | null = null;
  private gesture: Gesture | null = null;
  private suppressedClicks = new Set<HTMLElement>();
  private suppressCanvasClick = false;
  private disposed = false;

  constructor(private options: Options) {
    const signal = this.listeners.signal;
    options.canvas.addEventListener('pointermove', event => {
      // A held mouse may belong to the movement joystick.
      if (this.gesture || event.buttons !== 0 || !this.canAct()) return;
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') this.rememberMouse(event);
    }, { signal });
    options.canvas.addEventListener('pointerdown', event => {
      this.suppressCanvasClick = isDragPointer(event) || !!this.gesture || !this.canAct();
    }, { signal });
    options.canvas.addEventListener('click', event => {
      const pointerType = (event as PointerEvent).pointerType;
      if (event.button !== 0 || pointerType === 'touch' || pointerType === 'pen' ||
        this.suppressCanvasClick || this.gesture || !this.canAct()) return;
      this.rememberMouse(event);
      this.options.onCast('attack');
    }, { signal });

    this.bindButton(options.attackButton, 'attack');
    this.bindButton(options.moonlightButton, 'moonlight');
    for (const slot of options.skillButtons ?? []) this.bindButton(slot.button, slot.action);
    window.addEventListener('pointermove', event => this.move(event), { signal });
    window.addEventListener('pointerup', event => this.release(event), { signal });
    window.addEventListener('pointercancel', event => this.cancelPointer(event.pointerId), { signal });
    window.addEventListener('blur', () => this.reset(), { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    }, { signal });
  }

  private canAct(button?: HTMLElement): boolean {
    return !this.disposed && this.options.canAct() && (!button ||
      (!(button as HTMLButtonElement).disabled && button.getAttribute('aria-disabled') !== 'true'));
  }

  private bindButton(button: HTMLElement | null, action: CombatAction): void {
    if (!button) return;
    const signal = this.listeners.signal;
    button.addEventListener('pointerdown', event => {
      if (!isDragPointer(event)) {
        if (this.gesture) {
          this.suppressedClicks.add(button);
          event.preventDefault();
          return;
        }
        if (event.pointerType === 'mouse' && this.canAct(button)) this.suppressedClicks.delete(button);
        else if (!this.canAct(button)) this.suppressedClicks.add(button);
        return;
      }
      // Every touch/pen gesture owns its release; a following browser click must never repeat it.
      this.suppressedClicks.add(button);
      event.preventDefault();
      if (!this.canAct(button) || this.gesture) return;
      const point = pointFrom(event);
      if (!point) return;
      this.gesture = { pointerId: event.pointerId, button, action, start: point, current: point };
      try { button.setPointerCapture(event.pointerId); } catch { /* Window listeners also track release outside the button. */ }
    }, { signal });
    button.addEventListener('lostpointercapture', event => this.cancelPointer(event.pointerId), { signal });
    button.addEventListener('click', event => {
      if (!this.canAct(button)) return;
      const pointerType = (event as PointerEvent).pointerType;
      if (pointerType === 'touch' || pointerType === 'pen') return;
      // detail=0 is keyboard activation / HTMLElement.click(), not a compatibility mouse click.
      if (event.detail !== 0 && this.suppressedClicks.has(button)) {
        this.suppressedClicks.delete(button);
        return;
      }
      this.options.onCast(action);
    }, { signal });
  }

  private rememberMouse(event: MouseEvent | PointerEvent): void {
    const point = pointFrom(event);
    if (!point) return;
    const rect = this.options.canvas.getBoundingClientRect();
    this.aim = { kind: 'screen', point: { x: point.x - rect.left, y: point.y - rect.top } };
  }

  private updateGesture(event: PointerEvent): void {
    const gesture = this.gesture;
    const point = pointFrom(event);
    if (!gesture || !point) return;
    gesture.current = point;
    const dx = point.x - gesture.start.x;
    const dy = point.y - gesture.start.y;
    if (Math.hypot(dx, dy) >= DRAG_DEAD_ZONE) this.aim = { kind: 'angle', angle: Math.atan2(dy, dx) };
  }

  private move(event: PointerEvent): void {
    if (!this.gesture || event.pointerId !== this.gesture.pointerId) return;
    if (!this.canAct(this.gesture.button)) { this.cancelPointer(event.pointerId); return; }
    this.updateGesture(event);
    event.preventDefault();
  }

  private release(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const allowed = this.canAct(gesture.button);
    if (allowed) this.updateGesture(event);
    this.gesture = null;
    // Clear ownership before releasing capture: lostpointercapture may run synchronously.
    this.releaseCapture(gesture);
    event.preventDefault();
    if (allowed && this.canAct(gesture.button)) this.options.onCast(gesture.action);
  }

  private releaseCapture(gesture: Gesture): void {
    try { gesture.button.releasePointerCapture(gesture.pointerId); } catch { /* Capture may already have been released by the browser. */ }
  }

  private cancelPointer(pointerId: number): void {
    if (!this.gesture || this.gesture.pointerId !== pointerId) return;
    const gesture = this.gesture;
    this.gesture = null;
    this.releaseCapture(gesture);
  }

  public getAngle(player: { x: number; y: number; facingAngle: number },
    camera: { screenToWorld(x: number, y: number): Point }): number {
    const fallback = Number.isFinite(player.facingAngle) ? player.facingAngle : 0;
    if (!this.aim) return fallback;
    if (this.aim.kind === 'angle') return this.aim.angle;
    const world = camera.screenToWorld(this.aim.point.x, this.aim.point.y);
    const dx = world.x - player.x;
    const dy = world.y - player.y;
    return Number.isFinite(dx) && Number.isFinite(dy) && (dx !== 0 || dy !== 0) ? Math.atan2(dy, dx) : fallback;
  }

  public getDragPreview(): DragPreview | null {
    const gesture = this.gesture;
    return gesture ? { startX: gesture.start.x, startY: gesture.start.y, x: gesture.current.x, y: gesture.current.y } : null;
  }
  public hasAim(): boolean { return this.aim !== null; }

  public reset(): void {
    const gesture = this.gesture;
    this.gesture = null;
    this.aim = null;
    if (gesture) this.releaseCapture(gesture);
    // Keep click tombstones until fresh mouse input: a cancelled touch may still emit click on resume.
    this.suppressCanvasClick = true;
  }

  public destroy(): void {
    if (this.disposed) return;
    this.reset();
    this.disposed = true;
    this.listeners.abort();
    this.suppressedClicks.clear();
  }
}


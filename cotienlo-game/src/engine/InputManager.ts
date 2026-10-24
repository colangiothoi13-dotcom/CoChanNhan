export interface InputVector {
  x: number;
  y: number;
  length: number;
}

export class InputManager {
  private joystickBase: HTMLElement | null = null;
  private joystickThumb: HTMLElement | null = null;
  private joystickZone: HTMLElement | null = null;

  private isDraggingJoystick: boolean = false;
  private touchId: number | null = null;
  private centerPos: { x: number; y: number } = { x: 0, y: 0 };
  private radius: number = 44; // max travel radius

  private moveVector: InputVector = { x: 0, y: 0, length: 0 };
  private keysPressed: Set<string> = new Set();
  private isMouseDown = false;
  private listeners = new AbortController();
  private movementBindings = { moveUp: 'KeyW', moveDown: 'KeyS', moveLeft: 'KeyA', moveRight: 'KeyD' };
  private explicitlyBoundCodes = new Set<string>();

  constructor() {
    this.initElements();
    this.bindTouchEvents();
    this.bindKeyboardEvents();
    window.addEventListener('blur', () => this.reset(), { signal: this.listeners.signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    }, { signal: this.listeners.signal });
  }

  private initElements() {
    this.joystickBase = document.getElementById('joystick-base');
    this.joystickThumb = document.getElementById('joystick-thumb');
    this.joystickZone = document.getElementById('joystick-zone');
  }

  private bindTouchEvents() {
    if (!this.joystickZone || !this.joystickBase || !this.joystickThumb) return;

    const onTouchStart = (e: TouchEvent) => {
      if (this.isDraggingJoystick || this.isBlocked()) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const rect = this.joystickBase!.getBoundingClientRect();
        this.centerPos = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };

        const dist = Math.hypot(touch.clientX - this.centerPos.x, touch.clientY - this.centerPos.y);
        if (dist <= 80) { // within touch range
          this.isDraggingJoystick = true;
          this.touchId = touch.identifier;
          this.updateJoystick(touch.clientX, touch.clientY);
          break;
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!this.isDraggingJoystick || this.touchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.touchId) {
          if (e.cancelable) e.preventDefault();
          this.updateJoystick(touch.clientX, touch.clientY);
          break;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!this.isDraggingJoystick || this.touchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.touchId) {
          this.resetJoystick();
          break;
        }
      }
    };

    // Attach to window so drag continues if finger slides slightly out of zone
    const options = { passive: false, signal: this.listeners.signal };
    this.joystickZone.addEventListener('touchstart', onTouchStart, options);
    window.addEventListener('touchmove', onTouchMove, options);
    window.addEventListener('touchend', onTouchEnd, options);
    window.addEventListener('touchcancel', onTouchEnd, options);

    // Also support mouse drag on desktop for easy testing
    this.joystickZone.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || this.isBlocked()) return;
      this.isMouseDown = true;
      const rect = this.joystickBase!.getBoundingClientRect();
      this.centerPos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this.updateJoystick(e.clientX, e.clientY);
    }, { signal: this.listeners.signal });

    window.addEventListener('mousemove', (e) => {
      if (this.isMouseDown) {
        this.updateJoystick(e.clientX, e.clientY);
      }
    }, { signal: this.listeners.signal });

    window.addEventListener('mouseup', () => {
      if (this.isMouseDown) {
        this.isMouseDown = false;
        this.resetJoystick();
      }
    }, { signal: this.listeners.signal });
  }

  private updateJoystick(clientX: number, clientY: number) {
    const dx = clientX - this.centerPos.x;
    const dy = clientY - this.centerPos.y;
    const distance = Math.hypot(dx, dy);

    if (distance === 0) {
      this.moveVector = { x: 0, y: 0, length: 0 };
      if (this.joystickThumb) this.joystickThumb.style.transform = `translate(0px, 0px)`;
      return;
    }

    const clampedDist = Math.min(distance, this.radius);
    const nx = dx / distance;
    const ny = dy / distance;

    const thumbX = nx * clampedDist;
    const thumbY = ny * clampedDist;

    if (this.joystickThumb) {
      this.joystickThumb.style.transform = `translate(${thumbX}px, ${thumbY}px)`;
    }

    this.moveVector = {
      x: nx,
      y: ny,
      length: clampedDist / this.radius,
    };
  }

  private resetJoystick() {
    this.isDraggingJoystick = false;
    this.touchId = null;
    this.moveVector = { x: 0, y: 0, length: 0 };
    if (this.joystickThumb) {
      this.joystickThumb.style.transform = `translate(0px, 0px)`;
    }
  }

  private bindKeyboardEvents() {
    window.addEventListener('keydown', (e) => {
      if (this.isBlocked()) return;
      this.keysPressed.add(e.code);
    }, { signal: this.listeners.signal });

    window.addEventListener('keyup', (e) => {
      this.keysPressed.delete(e.code);
    }, { signal: this.listeners.signal });
  }

  private isBlocked(): boolean {
    const focused = document.activeElement as HTMLElement | null;
    return document.hidden || !!document.querySelector('.game-modal.active') ||
      focused?.isContentEditable === true ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(focused?.tagName ?? '');
  }

  public reset(): void {
    this.keysPressed.clear();
    this.isMouseDown = false;
    this.resetJoystick();
  }

  public setBindings(bindings: Record<string, string>): void {
    for (const direction of ['moveUp', 'moveDown', 'moveLeft', 'moveRight'] as const) {
      if (typeof bindings[direction] === 'string') this.movementBindings[direction] = bindings[direction];
    }
    this.explicitlyBoundCodes = new Set(Object.values(bindings));
    this.reset();
  }

  public destroy(): void {
    this.listeners.abort();
    this.reset();
  }

  public getMoveVector(): InputVector {
    if (this.isBlocked()) this.reset();
    // If joystick is actively moved, it takes precedence
    if (this.moveVector.length > 0.05) {
      return this.moveVector;
    }

    // Otherwise calculate from keyboard WASD / Arrow keys
    let kx = 0;
    let ky = 0;

    const pressed = (direction: keyof typeof this.movementBindings, alias: string) =>
      this.keysPressed.has(this.movementBindings[direction]) || (!this.explicitlyBoundCodes.has(alias) && this.keysPressed.has(alias));
    if (pressed('moveUp', 'ArrowUp')) ky -= 1;
    if (pressed('moveDown', 'ArrowDown')) ky += 1;
    if (pressed('moveLeft', 'ArrowLeft')) kx -= 1;
    if (pressed('moveRight', 'ArrowRight')) kx += 1;

    if (kx !== 0 || ky !== 0) {
      const length = Math.hypot(kx, ky);
      return {
        x: kx / length,
        y: ky / length,
        length: 1.0,
      };
    }

    return { x: 0, y: 0, length: 0 };
  }
}

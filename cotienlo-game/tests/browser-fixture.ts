import { vi } from 'vitest';

export class TestElement extends EventTarget {
  public style: Record<string, string> = {};
  public textContent = '';
  private markup = '';
  public get innerHTML() { return this.markup; }
  public set innerHTML(value: string) { this.markup = value; this.children = []; }
  public get className() { return [...this.classes].join(' '); }
  public set className(value: string) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
  public id = '';
  public tagName = 'DIV';
  public isContentEditable = false;
  public hidden = false;
  public inert = false;
  public disabled = false;
  public tabIndex = 0;
  public parentElement: TestElement | null = null;
  public ownerDocument: { activeElement: TestElement | null; dispatchEvent(event: Event): boolean } | null = null;
  public children: TestElement[] = [];
  public descendants = new Map<string, TestElement>();
  private attributes = new Map<string, string>();
  private classes = new Set<string>();
  public classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    contains: (name: string) => this.classes.has(name),
  };
  public setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
    if (name === 'tabindex') this.tabIndex = Number(value);
  }
  public getAttribute(name: string) {
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    if (name === 'disabled') return this.disabled ? '' : null;
    if (name === 'hidden') return this.hidden ? '' : null;
    if (name === 'inert') return this.inert ? '' : null;
    return this.attributes.get(name) ?? null;
  }
  public hasAttribute(name: string) { return this.getAttribute(name) !== null; }
  public removeAttribute(name: string) { this.attributes.delete(name); }
  public matches(selector: string): boolean {
    return selector.split(',').some((part) => {
      const withoutNot = part.trim().replace(/:not\(([^)]+)\)/g, (_, excluded: string) => this.matches(excluded) ? ':never' : '');
      if (withoutNot.includes(':never') || (withoutNot.includes(':disabled') && !this.disabled)) return false;
      const parts = withoutNot.split(/\s+/);
      const own = parts.pop()!;
      const tag = own.match(/^[a-zA-Z]+/)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      const id = own.match(/#([\w-]+)/)?.[1];
      if (id && this.id !== id) return false;
      if ([...own.matchAll(/\.([\w-]+)/g)].some((match) => !this.classList.contains(match[1]))) return false;
      if ([...own.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)].some((match) =>
        !this.hasAttribute(match[1]) || (match[2] !== undefined && this.getAttribute(match[1]) !== match[2]))) return false;
      if (parts.length) {
        let parent = this.parentElement;
        while (parent && !parent.matches(parts.join(' '))) parent = parent.parentElement;
        return !!parent;
      }
      return true;
    });
  }
  public querySelectorAll(selector: string): TestElement[] {
    const children = [...new Set([...this.children, ...this.descendants.values()])];
    return [...new Set(children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector),
    ]))];
  }
  public querySelector(selector: string) { return this.descendants.get(selector) ?? this.querySelectorAll(selector)[0] ?? null; }
  public appendChild(child: TestElement) {
    if (child.parentElement) child.parentElement.children = child.parentElement.children.filter((element) => element !== child);
    child.parentElement = this;
    child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }
  public contains(child: TestElement | null): boolean { return child === this || this.children.some((element) => element.contains(child)); }
  public closest(selector: string): TestElement | null { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  public focus() {
    const doc = this.ownerDocument ?? document as unknown as TestElement['ownerDocument'];
    if (!doc) return;
    doc.activeElement = this;
    const event = new Event('focusin');
    Object.defineProperty(event, 'target', { value: this });
    doc.dispatchEvent(event);
  }
  public getClientRects() { return this.closest('[hidden]') || this.style.display === 'none' ? [] : [this.getBoundingClientRect()]; }
  public get isConnected(): boolean { return !!this.ownerDocument; }
  public remove() {}
  public getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
}

export function browserFixture() {
  const elements = new Map<string, TestElement>();
  const body = new TestElement();
  const context = new Proxy<Record<string, unknown>>({}, {
    get(target, key: string) {
      return target[key] ?? (() => ({ addColorStop() {} }));
    },
  });
  const canvas = Object.assign(new TestElement(), { width: 0, height: 0, getContext: () => context });
  canvas.id = 'game-canvas';
  elements.set('game-canvas', canvas);
  const doc = Object.assign(new EventTarget(), {
    hidden: false,
    visibilityState: 'visible',
    activeElement: null as TestElement | null,
    getElementById: (id: string) => elements.get(id) ?? null,
    body,
    querySelectorAll: (selector: string) => body.querySelectorAll(selector),
    querySelector: (selector: string) => body.querySelector(selector),
    createElement: (tagName: string) => Object.assign(new TestElement(), { tagName: tagName.toUpperCase(), ownerDocument: doc }),
  });
  body.ownerDocument = doc;
  body.appendChild(canvas);
  const win = Object.assign(new EventTarget(), { innerWidth: 800, innerHeight: 600, devicePixelRatio: 2 });
  const saves = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saves.get(key) ?? null,
    setItem: (key: string, value: string) => saves.set(key, value),
    removeItem: (key: string) => saves.delete(key),
  };
  let nextFrame: FrameRequestCallback | undefined;
  const raf = vi.fn((callback: FrameRequestCallback) => { nextFrame = callback; return 1; });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', vi.fn(() => { nextFrame = undefined; }));
  return {
    doc, win, elements, canvas, context, storage, raf,
    frame(time: number) { const frame = nextFrame; nextFrame = undefined; frame?.(time); },
    addElement(id: string, tagName = 'div') {
      const el = doc.createElement(tagName);
      el.id = id;
      elements.set(id, el);
      body.appendChild(el);
      return el;
    },
  };
}

export function keyEvent(type: string, code: string): Event {
  return Object.assign(new Event(type, { cancelable: true }), { code, key: code });
}

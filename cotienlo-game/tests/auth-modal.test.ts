import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthClient } from '../src/systems/AuthClient';
import { AuthModal } from '../src/ui/AuthModal';
import { browserFixture, TestElement } from './browser-fixture';
const account = { id: 'u1', email: 'player@gmail.com', name: '<img src=x onerror=alert(1)>', verifiedAt: 100 };
const reply = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
describe('explicit Gmail account actions', () => {
  let browser: ReturnType<typeof browserFixture>;
  let body: TestElement;
  let modal: TestElement;
  let client: AuthClient;
  let ui: AuthModal;
  beforeEach(() => { vi.useFakeTimers(); browser = browserFixture(); modal = browser.addElement('modal-auth'); modal.className = 'game-modal'; const card = browser.addElement('auth-card'); card.className = 'modal-card'; modal.appendChild(card); body = browser.addElement('auth-body'); body.className = 'modal-body'; card.appendChild(body); card.appendChild(browser.addElement('btn-close-auth', 'button')); });
  afterEach(() => { ui?.destroy(); client?.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  function input(id: string, value: string) { const el = browser.addElement(id, 'input'); Object.assign(el, { value }); body.appendChild(el); return el; }
  function action(name: string) { const el = browser.addElement('action-' + name, 'button'); el.setAttribute('data-auth-action', name); body.appendChild(el); Object.defineProperty(el, 'parentElement', { value: body, writable: true }); const e = new Event('click'); Object.defineProperty(e, 'target', { value: el }); modal.dispatchEvent(e); return el; }
  async function flush() {
    for (let i = 0; i < 12; i++)
      await Promise.resolve();
  }
  it('does not import progress or link a world on login and escapes all account text', async () => {
    const apply = vi.fn();
    const link = vi.fn();
    client = new AuthClient({ storage: null, fetcher: vi.fn(async () => reply({ ok: true, token: 'token', user: account, savedProgress: { old: 'partial' }, revision: 4 })) });
    ui = new AuthModal(client, { onProgressLoaded: apply, onConnectWorld: link });
    await flush();
    input('auth-email-input', 'player@gmail.com');
    input('auth-otp-input', '123456');
    input('auth-name-input', '');
    input('auth-password-input', '');
    action('verify-otp');
    await flush();
    expect(client.isAuthenticated()).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
    expect(body.innerHTML).toContain('&lt;img');
    expect(body.innerHTML).not.toContain('<img');
    expect(body.innerHTML).toContain('Bản luyện tập trên máy chủ');
  });
  it('only connects the world after an explicit action and blocks repeated clicks while busy', async () => {
    let finish!: () => void;
    const link = vi.fn(() => new Promise<void>(r => { finish = r; }));
    client = new AuthClient({ storage: null, fetcher: vi.fn(async () => reply({ ok: true, token: 'token', user: account, savedProgress: null, revision: 0 })) });
    await client.verifyOtp('player@gmail.com', '123456');
    ui = new AuthModal(client, { onConnectWorld: link });
    await flush();
    action('connect-world');
    action('connect-world');
    expect(link).toHaveBeenCalledTimes(1);
    finish();
    await flush();
  });
  it('rejects partial legacy cloud data before invoking the importer', async () => {
    const apply = vi.fn();
    client = new AuthClient({ storage: null, fetcher: vi.fn(async (url: string | URL | Request) => reply(String(url).endsWith('/me') ? { ok: true, user: { ...account, savedProgress: { cultivator: { hp: 50 } } }, revision: 1 } : { ok: true, token: 'token', user: account, savedProgress: { cultivator: { hp: 50 } }, revision: 1 })) });
    await client.verifyOtp('player@gmail.com', '123456');
    ui = new AuthModal(client, { onProgressLoaded: apply });
    await flush();
    action('load-cloud');
    await flush();
    expect(apply).not.toHaveBeenCalled();
  });
  it('submits OTP through the form for keyboard users', async () => {
    const fetcher = vi.fn(async () => reply({ ok: true, token: 'token', user: account, savedProgress: null, revision: 0 }));
    client = new AuthClient({ storage: null, fetcher });
    ui = new AuthModal(client);
    await flush();
    input('auth-email-input', 'player@gmail.com');
    input('auth-otp-input', '123456');
    input('auth-name-input', '');
    input('auth-password-input', '');
    const form = browser.addElement('auth-otp-form', 'form');
    body.appendChild(form);
    const event = new Event('submit', { cancelable: true });
    Object.defineProperty(event, 'target', { value: form });
    modal.dispatchEvent(event);
    await flush();
    expect(event.defaultPrevented).toBe(true);
    expect(client.isAuthenticated()).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps resend cooldown across rendered forms and expires it while another view is visible', async () => {
    const fetcher = vi.fn(async () => reply({ ok: true, message: 'Đã gửi', cooldownSec: 60, previewOtp: '123456' }));
    client = new AuthClient({ storage: null, fetcher });
    ui = new AuthModal(client);
    await flush();
    input('auth-email-input', 'player@gmail.com');
    const send = action('send-otp');
    await flush();
    expect(send.disabled).toBe(true);
    expect(send.textContent).toContain('60');
    expect(body.innerHTML).not.toContain('123456');
    const switcher = browser.addElement('switch', 'button');
    switcher.setAttribute('data-auth-action', 'switch-mode');
    switcher.setAttribute('data-target-mode', 'password');
    body.appendChild(switcher);
    const event = new Event('click');
    Object.defineProperty(event, 'target', { value: switcher });
    modal.dispatchEvent(event);
    await vi.advanceTimersByTimeAsync(61000);
    input('auth-email-input', 'player@gmail.com');
    action('send-otp');
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Password view has a separate email field; returning to OTP permits another real request.
    const back = browser.addElement('back', 'button');
    back.setAttribute('data-auth-action', 'switch-mode');
    back.setAttribute('data-target-mode', 'login');
    body.appendChild(back);
    const go = new Event('click');
    Object.defineProperty(go, 'target', { value: back });
    modal.dispatchEvent(go);
    input('auth-email-input', 'player@gmail.com');
    action('send-otp');
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('destroys listeners and ignores a pending login completion', async () => {
    let finish!: (r: Response) => void;
    client = new AuthClient({ storage: null, fetcher: vi.fn(() => new Promise<Response>(r => { finish = r; })) });
    ui = new AuthModal(client);
    await flush();
    input('auth-email-input', 'player@gmail.com');
    input('auth-otp-input', '123456');
    input('auth-name-input', '');
    input('auth-password-input', '');
    action('verify-otp');
    ui.destroy();
    client.destroy();
    const before = body.innerHTML;
    finish(reply({ ok: true, token: 'token', user: account, savedProgress: null, revision: 0 }));
    await flush();
    expect(body.innerHTML).toBe(before);
    expect(client.isAuthenticated()).toBe(false);
  });
});

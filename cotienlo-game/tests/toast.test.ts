import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Toast } from '../src/ui/Toast';
import { browserFixture, type TestElement } from './browser-fixture';

let browser: ReturnType<typeof browserFixture>;
let container: TestElement;
beforeEach(() => {
  vi.useFakeTimers(); browser = browserFixture(); container = browser.addElement('toast-container');
  const create = browser.doc.createElement;
  vi.spyOn(browser.doc, 'createElement').mockImplementation(tag => {
    const node = create(tag);
    node.remove = () => {
      if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(child => child !== node);
      node.parentElement = null;
    };
    return node;
  });
});
afterEach(() => { vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('coalesces repeated cooldown notices into one existing notification', () => {
  Toast.show('Chiêu đang hồi.'); const first = container.children[0];
  for (let count = 0; count < 5; count++) Toast.show('Chiêu đang hồi.');
  expect(container.children).toHaveLength(1);
  expect(container.children[0]).toBe(first);
});

it('keeps at most the two newest distinct notices', () => {
  Toast.show('Một'); Toast.show('Hai'); Toast.show('Ba');
  expect(container.children.map(node => node.textContent)).toEqual(['Hai', 'Ba']);
});

it('renews a repeated notice timeout without creating another box', () => {
  Toast.show('Chiêu đang hồi.'); vi.advanceTimersByTime(2000);
  Toast.show('Chiêu đang hồi.'); vi.advanceTimersByTime(2000);
  expect(container.children).toHaveLength(1);
  vi.advanceTimersByTime(401);
  expect(container.children).toHaveLength(0);
});

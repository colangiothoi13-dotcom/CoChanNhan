import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventorySystem } from '../src/systems/InventorySystem';
import { WikiModal } from '../src/ui/WikiModal';
import { browserFixture, keyEvent } from './browser-fixture';

describe('wiki search keyboard navigation', () => {
  let browser: ReturnType<typeof browserFixture>;
  beforeEach(() => { browser = browserFixture(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  function openSearch(resultCount: number) {
    const modal = browser.addElement('modal-wiki');
    modal.className = 'game-modal';
    modal.hidden = true;
    const card = browser.doc.createElement('section');
    card.className = 'modal-card';
    card.tabIndex = -1;
    modal.appendChild(card);
    const input = browser.addElement('wiki-tim', 'input');
    const results = browser.addElement('wiki-tim-kq', 'ul');
    card.appendChild(input);
    card.appendChild(results);
    new WikiModal(new InventorySystem()).open();
    const links = Array.from({ length: resultCount }, (_, index) => {
      const link = browser.doc.createElement('a');
      link.setAttribute('href', '#result-' + index);
      link.setAttribute('data-search-idx', String(index));
      results.appendChild(link);
      return link;
    });
    results.hidden = false;
    input.focus();
    return { modal, input, results, links };
  }

  it('starts ArrowUp at the last result and wraps in both directions', () => {
    const { input, links } = openSearch(3);
    const up = keyEvent('keydown', 'ArrowUp');
    input.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(links[2].classList.contains('chon')).toBe(true);
    expect(links[1].classList.contains('chon')).toBe(false);
    input.dispatchEvent(keyEvent('keydown', 'ArrowDown'));
    expect(links[0].classList.contains('chon')).toBe(true);
    input.dispatchEvent(keyEvent('keydown', 'ArrowUp'));
    expect(links[2].classList.contains('chon')).toBe(true);
  });

  it('exposes search expansion, the active option, and collapse to assistive technology', () => {
    const { input, results } = openSearch(0);
    Object.assign(input, { value: 'co' });
    input.dispatchEvent(new Event('input'));
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-controls')).toBe('wiki-tim-kq');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(results.innerHTML).toContain('role="option"');
    const option = browser.doc.createElement('a');
    option.id = 'test-option';
    option.setAttribute('data-search-idx', '0');
    results.appendChild(option);
    input.dispatchEvent(keyEvent('keydown', 'ArrowDown'));
    expect(input.getAttribute('aria-activedescendant')).toBe(option.id);
    expect(option.getAttribute('aria-selected')).toBe('true');
    input.dispatchEvent(keyEvent('keydown', 'Escape'));
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('describes current controls separately from the original-game reference guide', () => {
    const modal = browser.addElement('modal-wiki');
    const content = browser.addElement('wiki-main-content');
    modal.appendChild(content);
    new WikiModal(new InventorySystem()).open('cam-nang');
    expect(content.innerHTML).toContain('Điều khiển trong bản thử hiện tại');
    expect(content.innerHTML).toContain('W A S D');
    expect(content.innerHTML).toContain('nút trên màn hình');
    expect(content.innerHTML).not.toContain('<kbd>Space</kbd>');
    expect(content.innerHTML).not.toContain('<kbd>1–7</kbd>');
    expect(content.innerHTML).toContain('Tham khảo từ game gốc');
  });
  it('dismisses an empty search dropdown on Escape while keeping the wiki open', () => {
    const { modal, input, results } = openSearch(0);
    const escape = keyEvent('keydown', 'Escape');
    const stop = vi.spyOn(escape, 'stopPropagation');
    input.dispatchEvent(escape);
    expect(results.hidden).toBe(true);
    expect(stop).toHaveBeenCalledOnce();
    expect(escape.defaultPrevented).toBe(true);
    expect(modal.classList.contains('active')).toBe(true);
  });
});
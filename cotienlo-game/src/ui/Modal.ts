interface ModalState {
  returnFocus: HTMLElement | null;
  restoreBackground: () => void;
  removeListeners: () => void;
}

const states = new WeakMap<HTMLElement, ModalState>();

function hideModal(modal: HTMLElement, restoreFocus: boolean): void {
  const state = states.get(modal);
  state?.removeListeners();
  state?.restoreBackground();
  states.delete(modal);
  modal.classList.remove('active');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');

  if (restoreFocus && state?.returnFocus?.isConnected) {
    state.returnFocus.focus({ preventScroll: true });
  }
}

export function closeModal(modal: HTMLElement | null): void {
  if (modal) hideModal(modal, true);
}

export function openModal(modal: HTMLElement | null, trigger?: HTMLElement | null): void {
  if (!modal || states.has(modal)) return;
  const doc = modal.ownerDocument;
  const focused = doc.activeElement as HTMLElement | null;
  const containingModal = focused?.closest<HTMLElement>('.game-modal');
  const returnFocus = trigger ?? (containingModal ? states.get(containingModal)?.returnFocus : focused) ?? null;

  doc.querySelectorAll<HTMLElement>('.game-modal.active').forEach((active) => hideModal(active, false));
  modal.hidden = false;
  modal.inert = false;
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('active');

  const card = modal.querySelector<HTMLElement>('.modal-card') ?? modal;
  if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '-1');

  const background = [...(modal.parentElement?.children ?? [])]
    .filter((element): element is HTMLElement => element !== modal && element.id !== 'toast-container')
    .map((element) => ({ element, inert: element.inert }));

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeModal(modal);
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [...card.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [tabindex]')]
      .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') &&
        !element.closest('[hidden], [inert]') && element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = doc.activeElement;
    if (!first || !focusable.includes(current as HTMLElement) ||
      (event.shiftKey && current === first) || (!event.shiftKey && current === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus({ preventScroll: true });
      if (!first) card.focus({ preventScroll: true });
    }
  };
  const onFocusIn = (event: FocusEvent): void => {
    if (!modal.contains(event.target as Node)) card.focus({ preventScroll: true });
  };
  doc.addEventListener('keydown', onKeydown);
  doc.addEventListener('focusin', onFocusIn);
  states.set(modal, {
    returnFocus,
    removeListeners: () => {
      doc.removeEventListener('keydown', onKeydown);
      doc.removeEventListener('focusin', onFocusIn);
    },
    restoreBackground: () => background.forEach(({ element, inert }) => { element.inert = inert; }),
  });

  card.focus({ preventScroll: true });
  background.forEach(({ element }) => { element.inert = true; });
}

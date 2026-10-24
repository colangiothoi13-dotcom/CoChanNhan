export class Toast {
  private static timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

  public static show(message: string, durationMs: number = 2400) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const notices = Array.from(container.children) as HTMLElement[];
    let el = notices.find(node => node.classList.contains('toast-msg') && node.textContent === message);
    if (!el) {
      for (const oldest of notices.slice(0, Math.max(0, notices.length - 1))) {
        clearTimeout(this.timers.get(oldest)); this.timers.delete(oldest); oldest.remove();
      }
      el = document.createElement('div'); el.className = 'toast-msg'; el.textContent = message;
      container.appendChild(el);
    }
    const notice = el;
    clearTimeout(this.timers.get(notice));
    this.timers.set(notice, setTimeout(() => {
      notice.remove();
      this.timers.delete(notice);
    }, durationMs));
  }
}

import { Toast } from '../ui/Toast';
import type { RulesPanel } from './RulesPanel';

function startRules(): void {
  const root = document.getElementById('modal-rules');
  const trigger = document.getElementById('btn-open-rules');
  if (!root || !trigger) return;
  const controller = new AbortController();
  let panel: RulesPanel | undefined;
  let loading = false;
  let destroyed = false;
  trigger.addEventListener('click', () => {
    if (loading || destroyed) return;
    loading = true;
    trigger.setAttribute('aria-busy', 'true');
    void import('./RulesPanel').then(module => {
      if (destroyed) return;
      panel ??= new module.RulesPanel(root);
      panel.open();
    }).catch(() => { if (!destroyed) Toast.show('Chưa mở được phòng thử. Hãy tải lại trang.'); })
      .finally(() => { loading = false; trigger.removeAttribute('aria-busy'); });
  }, { signal: controller.signal });
  window.addEventListener('cotienlo:destroy', () => {
    destroyed = true; controller.abort(); panel?.destroy();
  }, { once: true });
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', startRules, { once: true });
else startRules();

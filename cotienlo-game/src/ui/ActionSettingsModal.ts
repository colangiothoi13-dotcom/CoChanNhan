import {
  ActionSettings, ACTIVE_SKILLS, ACTION_LABELS, GAME_ACTIONS, formatKeyCode,
  type ActiveSkill, type GameAction, type SettingsResult,
} from '../systems/ActionSettings';
import { closeModal, openModal } from './Modal';
import './action-settings.css';

export interface SettingsSkillInfo { name: string; description?: string; mpCost?: number; cooldown?: number; }
interface Options {
  getOwnedGuIds: () => readonly string[];
  getGuDefinition: (id: ActiveSkill) => SettingsSkillInfo | undefined;
  onChange?: () => void;
}
type SettingsTab = 'skills' | 'bindings';
const escape = (value: string): string => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

/** Accessible device preferences. The game owns casting and keyboard dispatch. */
export class ActionSettingsModal {
  private events = new AbortController();
  private unsubscribe: () => void;
  private tab: SettingsTab = 'skills';
  private capturing: GameAction | null = null;
  private disposed = false;
  private message = '';
  private messageError = false;

  constructor(private root: HTMLElement, private model: ActionSettings, private options: Options) {
    root.id ||= 'modal-action-settings';
    root.classList.add('game-modal');
    root.classList.add('action-settings-modal');
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    const titleId = escape(root.id + '-title');
    root.innerHTML = `
      <div class="modal-backdrop"></div>
      <section class="modal-card as-panel" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1">
        <header class="as-header">
          <span class="as-emblem" aria-hidden="true">⌘</span>
          <div><p class="as-eyebrow">Bốn ô · một bộ Cổ</p><h2 id="${titleId}">Điều khiển &amp; kỹ năng</h2></div>
          <button type="button" class="as-close" data-settings-action="close" aria-label="Đóng cài đặt">×</button>
        </header>
        <nav class="as-tabs" role="tablist" aria-label="Cài đặt chiến đấu">
          <button type="button" id="as-tab-skills" data-settings-tab="skills" role="tab" aria-controls="as-content">Bộ kỹ năng</button>
          <button type="button" id="as-tab-bindings" data-settings-tab="bindings" role="tab" aria-controls="as-content">Phím bấm</button>
        </nav>
        <p class="as-status" role="status" aria-live="polite" aria-atomic="true"></p>
        <div class="as-body" id="as-content" role="tabpanel" tabindex="0"></div>
        <footer class="as-footer"><p>Cài đặt áp dụng ngay trên thiết bị này.</p>
          <button type="button" class="as-reset" data-settings-action="reset">Khôi phục mặc định</button>
        </footer>
      </section>`;
    const signal = this.events.signal;
    root.querySelector('.modal-backdrop')?.addEventListener('click', () => this.close(), { signal });
    root.addEventListener('click', event => this.onClick(event), { signal });
    root.addEventListener('change', event => this.onChange(event), { signal });
    root.addEventListener('keydown', event => this.onTabKey(event), { signal });
    root.ownerDocument.addEventListener('keydown', event => this.onCaptureKey(event), { capture: true, signal });
    this.unsubscribe = model.subscribe(() => this.render());
  }

  public open(trigger?: HTMLElement): void {
    if (this.disposed) return;
    this.capturing = null;
    this.render();
    openModal(this.root, trigger);
  }
  public close(): void { this.capturing = null; closeModal(this.root); }
  private isOpen(): boolean { return this.root.classList.contains('active'); }

  private onClick(event: Event): void {
    if (this.disposed) return;
    const target = event.target as HTMLElement;
    const tab = target.closest<HTMLElement>('[data-settings-tab]')?.getAttribute('data-settings-tab');
    if (tab === 'skills' || tab === 'bindings') {
      this.tab = tab;
      this.capturing = null;
      this.message = '';
      this.render();
      return;
    }
    const button = target.closest<HTMLElement>('[data-settings-action]');
    if (!button) return;
    const action = button.getAttribute('data-settings-action');
    if (action === 'close') this.close();
    else if (action === 'reset') {
      this.capturing = null;
      const result = this.model.resetDefaults();
      this.showResult(result);
      if (result.ok) this.options.onChange?.();
    } else if (action === 'capture') {
      const binding = button.getAttribute('data-binding-action');
      if (!(GAME_ACTIONS as readonly string[]).includes(binding ?? '')) return;
      this.capturing = binding as GameAction;
      this.message = 'Nhấn phím mới. Escape để hủy, Tab để tiếp tục điều hướng.';
      this.messageError = false;
      this.render(button.id);
    }
  }

  private onChange(event: Event): void {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>('[data-slot-index]');
    if (!select || this.disposed) return;
    const index = Number(select.getAttribute('data-slot-index'));
    const result = this.model.assignSlot(index, (select.value || null) as ActiveSkill | null, this.options.getOwnedGuIds());
    if (!result.ok) this.render(select.id);
    this.showResult(result);
    if (result.ok) this.options.onChange?.();
  }

  private onCaptureKey(event: KeyboardEvent): void {
    if (this.disposed || !this.capturing || !this.isOpen()) return;
    const focused = this.root.ownerDocument.activeElement as HTMLElement | null;
    if (focused?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(focused?.tagName ?? '')) {
      this.capturing = null;
      this.showResult({ ok: true, message: 'Đã hủy đổi phím để tiếp tục nhập liệu.' });
      this.render(focused?.id);
      return;
    }
    if (event.key === 'Escape' || event.code === 'Escape' || event.key === 'Tab' || event.code === 'Tab') {
      const focus = 'as-bind-' + this.capturing;
      const escapeKey = event.key === 'Escape' || event.code === 'Escape';
      this.capturing = null;
      if (escapeKey) { event.preventDefault(); event.stopImmediatePropagation(); }
      this.message = 'Đã hủy đổi phím.';
      this.messageError = false;
      this.render(focus);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat || event.isComposing) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
      this.showResult({ ok: false, message: 'Không dùng tổ hợp Ctrl, Alt, Shift hoặc phím hệ thống. Nhấn một phím riêng.' });
      return;
    }
    const action = this.capturing;
    const result = this.model.rebind(action, event.code);
    if (result.ok) this.capturing = null;
    this.showResult(result);
    this.render('as-bind-' + action);
    if (result.ok) this.options.onChange?.();
  }

  private onTabKey(event: KeyboardEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-settings-tab]');
    if (!target || this.capturing) return;
    let next: SettingsTab;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = this.tab === 'skills' ? 'bindings' : 'skills';
    else if (event.key === 'Home') next = 'skills';
    else if (event.key === 'End') next = 'bindings';
    else return;
    event.preventDefault();
    this.tab = next;
    this.render();
    this.root.querySelector<HTMLElement>(`[data-settings-tab="${next}"]`)?.focus({ preventScroll: true });
  }

  private showResult(result: SettingsResult): void {
    this.message = result.message;
    this.messageError = !result.ok;
    this.renderStatus();
  }
  private renderStatus(): void {
    const status = this.root.querySelector<HTMLElement>('.as-status');
    if (!status) return;
    status.textContent = this.message || this.model.warning || '';
    status.classList.remove('is-error');
    if (this.messageError || this.model.warning) status.classList.add('is-error');
  }
  private skillName(id: ActiveSkill): string { return this.options.getGuDefinition(id)?.name ?? id; }

  private renderSkills(): string {
    const owned = this.options.getOwnedGuIds();
    const slots = this.model.getSlots();
    const bindings = this.model.getBindings();
    return `<div class="as-intro"><p class="as-eyebrow">Chuẩn bị trước khi giao chiến</p><h3>Bốn ô kỹ năng của bạn</h3>
      <p>Lắp Cổ chủ động đang sở hữu vào từng ô. Ô Nguyệt Quang tự nâng thành Nguyệt Nhận khi bạn có Cổ đó.</p></div>
      <div class="as-slot-grid">${slots.map((skill, index) => {
        const effective = this.model.resolveSlot(index, owned);
        const definition = effective ? this.options.getGuDefinition(effective) : undefined;
        const options = ACTIVE_SKILLS.map(id => `<option value="${id}" ${skill === id ? 'selected' : ''} ${owned.includes(id) ? '' : 'disabled'}>${escape(this.skillName(id))}${owned.includes(id) ? '' : ' · Chưa sở hữu'}</option>`).join('');
        return `<article class="as-slot-card">
          <div class="as-slot-heading"><label for="as-slot-${index}">Kỹ năng ô ${index + 1}</label><kbd>${escape(formatKeyCode(bindings[('slot' + (index + 1)) as GameAction]))}</kbd></div>
          <select id="as-slot-${index}" data-slot-index="${index}" aria-describedby="as-slot-info-${index}"><option value="" ${skill === null ? 'selected' : ''}>Để trống</option>${options}</select>
          <div class="as-slot-info" id="as-slot-info-${index}"><strong class="${effective ? '' : 'as-unavailable'}">${effective ? escape(this.skillName(effective)) : skill ? 'Chưa sở hữu Cổ để thi triển' : 'Ô kỹ năng đang trống'}</strong>
            <p>${escape(definition?.description ?? (skill ? 'Giữ cấu hình cho lần sau khi có lại Cổ này.' : 'Chọn một Cổ trong túi để lắp vào ô.'))}</p>
            ${definition ? `<span>${definition.mpCost ?? 0} chân nguyên · Hồi ${definition.cooldown ?? 0} giây</span>` : ''}
          </div></article>`;
      }).join('')}</div><p class="as-note">Thiết Cốt là Cổ thụ động nên không chiếm ô. Các ô lắp cùng Cổ dùng chung hồi chiêu.</p>`;
  }

  private renderBindings(): string {
    const bindings = this.model.getBindings();
    const groups: { title: string; actions: GameAction[] }[] = [
      { title: 'Chiến đấu', actions: ['slot1', 'slot2', 'slot3', 'slot4', 'attack', 'dash'] },
      { title: 'Di chuyển', actions: ['moveUp', 'moveDown', 'moveLeft', 'moveRight'] },
      { title: 'Hành trang & khám phá', actions: ['interact', 'inventory', 'refine', 'wiki', 'character', 'settings'] },
    ];
    return `<div class="as-intro"><p class="as-eyebrow">Thuận tay · đúng nhịp</p><h3>Đặt lại phím điều khiển</h3>
      <p>Chọn một phím bên dưới rồi nhấn phím mới. Phím trùng được báo trước; Escape hủy đổi, Tab tiếp tục điều hướng.</p></div>
      <div class="as-binding-groups">${groups.map(group => `<section class="as-binding-group"><h4>${group.title}</h4><div class="as-binding-list">${group.actions.map(action => `
        <div class="as-binding-row"><span id="as-label-${action}">${ACTION_LABELS[action]}</span>
          <button type="button" class="as-key ${this.capturing === action ? 'is-capturing' : ''}" id="as-bind-${action}" data-settings-action="capture" data-binding-action="${action}" aria-pressed="${this.capturing === action}" aria-label="Đổi phím cho ${ACTION_LABELS[action]}, hiện tại ${escape(formatKeyCode(bindings[action]))}">
            ${this.capturing === action ? 'Nhấn phím…' : `<kbd>${escape(formatKeyCode(bindings[action]))}</kbd><span>Đổi phím</span>`}
          </button></div>`).join('')}</div></section>`).join('')}</div>
      <p class="as-note">Escape, Tab, Enter và tổ hợp phím trình duyệt được giữ cho điều hướng. Có thể gán chữ, số, Space hoặc mũi tên.</p>`;
  }

  public render(focusId?: string): void {
    if (this.disposed) return;
    const active = this.root.ownerDocument.activeElement as HTMLElement | null;
    const restoreId = focusId ?? (active && this.root.contains(active) ? active.id : '');
    this.root.querySelectorAll<HTMLElement>('[data-settings-tab]').forEach(button => {
      const selected = button.getAttribute('data-settings-tab') === this.tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      button.classList.remove('is-active');
      if (selected) button.classList.add('is-active');
    });
    const body = this.root.querySelector<HTMLElement>('.as-body');
    if (body) {
      body.setAttribute('aria-labelledby', 'as-tab-' + this.tab);
      body.innerHTML = this.tab === 'skills' ? this.renderSkills() : this.renderBindings();
    }
    this.renderStatus();
    if (restoreId && this.isOpen()) {
      const control = this.root.ownerDocument.getElementById(restoreId);
      if (control && this.root.contains(control)) control.focus({ preventScroll: true });
    }
  }

  public destroy(): void {
    if (this.disposed) return;
    this.close();
    this.disposed = true;
    this.events.abort();
    this.unsubscribe();
  }
}


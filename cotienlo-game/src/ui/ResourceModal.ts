import type { FieldSnapshot } from '../world/field-types';
import type { WorldAction } from '../world/types';
import type { GuCareView, RecipeView, ResourceAction, ResourceSnapshot } from '../../shared/resource-core.mjs';
import { RESOURCE_BALANCE } from '../../shared/resource-core.mjs';
import { closeModal, openModal } from './Modal';
import { guIcon, icon, itemIcon } from './icons';
import './resource-modal.css';

export type ResourceTab = 'resources' | 'capture' | 'gu' | 'recipes' | 'production' | 'market';
export interface ResourceModalOptions {
  snapshot: () => FieldSnapshot | null;
  act: (action: WorldAction) => Promise<void>;
  error: () => string | null;
}
const TABS: readonly [ResourceTab, string][] = [
  ['resources', 'Tài nguyên'], ['capture', 'Tìm & bắt Cổ'], ['gu', 'Chăm sóc Cổ'],
  ['recipes', 'Cổ phương'], ['production', 'Nuôi trồng'], ['market', 'Giao dịch'],
];
const FEEDING: Record<string, string> = { fed: 'Đủ thức ăn', 'due-soon': 'Sắp đến kỳ ăn', hungry: 'Thiếu thức ăn', weak: 'Suy yếu', critical: 'Nguy kịch', dead: 'Đã chết' };
const STORAGE: Record<string, string> = { bag: 'Trong túi', vault: 'Trong kho', preservation: 'Kho bảo tồn', aperture: 'Trong tiên khiếu' };
const ENVIRONMENT: Record<string, string> = { 'moon-garden': 'Vườn Nguyệt Lan', 'star-meadow': 'Thảo địa ánh sao', 'refining-hall': 'Tịnh thất luyện hóa', academy: 'Học đường', sanctuary: 'Khu an toàn' };
const USE: Record<string, string> = { food: 'Thức ăn', refining: 'Luyện chế', medicine: 'Chữa thương', capture: 'Bắt Cổ', bait: 'Dẫn dụ', seed: 'Giống', habitat: 'Sinh cảnh', colony: 'Gây đàn', irrigation: 'Tưới tiêu', 'immortal-currency': 'Giao dịch tiên cảnh', 'essence-conversion': 'Chuyển hóa nguyên lực' };
const RARITY: Record<string, string> = { common: 'Phổ biến', uncommon: 'Ít gặp', rare: 'Hiếm', unique: 'Duy nhất' };
const escape = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const number = (value: number): string => Number.isFinite(value) ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value) : '—';
const duration = (milliseconds: number): string => {
  if (!Number.isFinite(milliseconds)) return '—';
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  if (seconds === 0) return 'Đến kỳ';
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)} giờ ${Math.floor(seconds % 3600 / 60)} phút`;
  return seconds >= 60 ? `${Math.floor(seconds / 60)} phút ${seconds % 60} giây` : `${seconds} giây`;
};
const pct = (bps: number): string => `${number(Math.max(0, Math.min(10000, bps)) / 100)}%`;

/** All mutations are server commands. Drafts and focus survive incoming field snapshots. */
export class ResourceModal {
  private readonly events = new AbortController();
  private tab: ResourceTab = 'resources';
  private busy = false;
  private disposed = false;
  private generation = 0;
  private lifeId = '';
  private signature = '';
  private message = '';
  private error = false;
  private readonly drafts = new Map<string, string | boolean | string[]>();
  private readonly pressedPointers = new Set<number>();
  private readonly pointerReleaseTimers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(private root: HTMLElement, private options: ResourceModalOptions) {
    root.id ||= 'modal-resources'; root.classList.add('game-modal'); root.classList.add('resource-modal');
    root.hidden = true; root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `<div class="modal-backdrop"></div><section class="modal-card rp-panel" role="dialog" aria-modal="true" aria-labelledby="resource-title" tabindex="-1">
      <header class="rp-header"><span class="rp-emblem" aria-hidden="true">${icon('bag')}</span><div class="rp-heading"><p class="rp-eyebrow">Hành trang trên tiên lộ</p><h2 id="resource-title">Tài nguyên &amp; Cổ trùng</h2><p class="rp-wealth"></p></div><button type="button" class="rp-close" data-resource-close aria-label="Đóng tài nguyên">${icon('close')}</button></header>
      <nav class="rp-tabs" role="tablist" aria-label="Quản lý tài nguyên">${TABS.map(([id, label]) => `<button type="button" id="resource-tab-${id}" data-resource-tab="${id}" role="tab" aria-controls="resource-content" aria-selected="false" tabindex="-1">${label}</button>`).join('')}</nav>
      <p class="rp-status" role="status" aria-live="polite" aria-atomic="true"></p>
      <div class="rp-content" id="resource-content" role="tabpanel" tabindex="0"></div>
      <footer class="rp-footer"><span>Giá, chu kỳ và xác suất hiển thị là quy ước game.</span><button type="button" data-resource-refresh class="rp-link">Cập nhật</button></footer>
    </section>`;
    const signal = this.events.signal;
    root.addEventListener('click', event => this.onClick(event), { signal });
    root.addEventListener('submit', event => this.onSubmit(event), { signal });
    root.addEventListener('input', event => this.rememberDraft(event), { signal });
    root.addEventListener('change', event => this.rememberDraft(event), { signal });
    root.addEventListener('keydown', event => this.onTabKey(event), { signal });
    root.addEventListener('focusout', () => queueMicrotask(() => this.update()), { signal });
    root.addEventListener('pointerdown', event => this.onPointerDown(event), { signal, capture: true });
    root.ownerDocument.addEventListener('pointerup', event => this.onPointerEnd(event), { signal, capture: true });
    root.ownerDocument.addEventListener('pointercancel', event => this.onPointerEnd(event), { signal, capture: true });
    root.ownerDocument.addEventListener('visibilitychange', () => { if (root.ownerDocument.hidden) this.clearPointerInteraction(); }, { signal });
    window.addEventListener('blur', () => this.clearPointerInteraction(), { signal });
  }

  open(trigger?: HTMLElement, tab: ResourceTab = this.tab): void {
    if (this.disposed) return;
    this.clearPointerInteraction();
    if (TABS.some(([id]) => id === tab)) this.tab = tab;
    this.message = ''; this.error = false; this.signature = '';
    openModal(this.root, trigger); this.render(true);
  }
  close(): void { this.clearPointerInteraction(); closeModal(this.root); }
  update(): void { if (!this.disposed && this.root.classList.contains('active')) this.render(); }
  destroy(): void { if (this.disposed) return; this.disposed = true; this.generation++; this.events.abort(); this.close(); this.drafts.clear(); }

  private view(snapshot = this.options.snapshot()): ResourceSnapshot | undefined {
    const resources = (snapshot as (FieldSnapshot & { resources?: ResourceSnapshot }) | null)?.resources;
    return resources?.lifeId === snapshot?.lifeId ? resources : undefined;
  }
  private setText(selector: string, value: string): void {
    const element = this.root.querySelector<HTMLElement>(selector);
    if (element && element.textContent !== value) element.textContent = value;
  }
  private render(force = false): void {
    const snapshot = this.options.snapshot(), view = this.view(snapshot);
    if (snapshot?.lifeId !== this.lifeId) {
      this.lifeId = snapshot?.lifeId ?? ''; this.generation++; this.drafts.clear(); this.signature = ''; this.message = ''; this.busy = false;
    }
    if (snapshot?.dead) { this.close(); return; }
    const liveGuCount = view?.gu.filter(gu => gu.healthBps > 0 && gu.feeding.state !== 'dead').length ?? 0;
    const terminalGuCount = (view?.gu.length ?? 0) - liveGuCount;
    this.setText('.rp-wealth', snapshot ? `${number(snapshot.stones)} nguyên thạch · ${liveGuCount} Cổ còn sống${terminalGuCount ? ` · ${terminalGuCount} đã chết/tiêu hao` : ''}` : 'Chưa kết nối nhân vật');
    const status = this.root.querySelector<HTMLElement>('.rp-status');
    this.setText('.rp-status', this.busy ? 'Đang xác nhận thao tác…' : this.message);
    if (status) status.classList[this.error ? 'add' : 'remove']('is-error');
    this.root.querySelectorAll<HTMLElement>('[data-resource-tab]').forEach(button => {
      const active = button.getAttribute('data-resource-tab') === this.tab;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    });
    const content = this.root.querySelector<HTMLElement>('.rp-content');
    if (!content) return;
    content.setAttribute('aria-labelledby', 'resource-tab-' + this.tab);
    this.updateTimers(view);
    const signature = JSON.stringify([this.tab, snapshot?.lifeId, snapshot?.stones, this.busy, view ? {
      items: view.items, gu: view.gu.map(gu => ({ ...gu, feeding: { ...gu.feeding, remainingMs: 0 } })),
      recipes: view.recipes, jobs: view.jobs.map(job => ({ ...job, stage: 0 })),
      farms: view.farms.map(farm => ({ ...farm, growthMs: 0, lastClockMs: 0 })), settings: view.settings,
      nearbyNodes: view.nearbyNodes?.map(node => ({ ...node, readyInMs: 0 })), wildTargets: view.wildTargets,
      market: view.market, marketAccess: view.marketAccess, players: view.players, loans: view.loans, activity: view.activity, notices: view.notices,
    } : null]);
    if (!force && signature === this.signature) return;
    // A pointer press changes focus before the native click/submit is dispatched.
    // Keep its target attached until that complete interaction has been captured.
    if (!force && this.pressedPointers.size > 0) return;
    const focused = this.root.ownerDocument.activeElement as HTMLElement | null;
    if (!force && focused && content.contains(focused) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(focused.tagName)) return;
    const focusKey = focused?.getAttribute('data-resource-focus');
    const scrollTop = content.scrollTop;
    this.signature = signature;
    if (!view || !snapshot) content.innerHTML = '<div class="rp-empty"><h3>Đang tải hành trang</h3><p>Kết nối nhân vật để nhận tài nguyên và Cổ từ máy chủ.</p></div>';
    else {
      const renderers: Record<ResourceTab, () => string> = {
        resources: () => this.renderResources(view), capture: () => this.renderCapture(view, snapshot),
        gu: () => this.renderGu(view), recipes: () => this.renderRecipes(view),
        production: () => this.renderProduction(view), market: () => this.renderMarket(view, snapshot),
      };
      const activity = view.activity;
      const activityName = activity?.kind === 'taming' ? `Đang luyện hóa ${view.gu.find(gu => gu.id === activity.instanceId)?.name ?? 'Cổ'}` : activity?.kind === 'research' ? `Đang nghiên cứu ${view.recipes.find(recipe => recipe.id === activity.recipeId)?.definition.name ?? 'cổ phương'}` : '';
      const progress = activityName ? `<aside class="rp-callout"><h4>${escape(activityName)}</h4><p>${activity?.finishClockMs ? `Còn <strong data-resource-activity-timer>${duration(activity.finishClockMs - view.clockMs)}</strong>. ` : ''}Có thể đóng bảng để tiếp tục. ${activity?.kind === 'taming' ? 'Dừng giữa chừng có thể mất tiến độ.' : ''}</p>${activity?.kind === 'taming' ? this.action('cancel-taming', 'Dừng luyện hóa', {}, false, true) : ''}</aside>` : '';
      const notices = view.notices.length ? `<aside class="rp-recent" aria-label="Diễn biến gần đây"><h4>Diễn biến gần đây</h4><ul>${view.notices.slice(-3).map(notice => `<li>${escape(notice)}</li>`).join('')}</ul></aside>` : '';
      content.innerHTML = progress + renderers[this.tab]() + notices;
    }
    content.scrollTop = scrollTop;
    if (focusKey) [...content.querySelectorAll<HTMLElement>('[data-resource-focus]')].find(element => element.getAttribute('data-resource-focus') === focusKey)?.focus({ preventScroll: true });
    this.updateTimers(view);
  }

  private onPointerDown(event: PointerEvent): void {
    const content = this.root.querySelector('.rp-content');
    if (!event.target || !content?.contains(event.target as Node)) return;
    const pointerId = event.pointerId ?? 0;
    const pendingRelease = this.pointerReleaseTimers.get(pointerId);
    if (pendingRelease !== undefined) clearTimeout(pendingRelease);
    this.pointerReleaseTimers.delete(pointerId);
    this.pressedPointers.add(pointerId);
  }
  private onPointerEnd(event: PointerEvent): void {
    const pointerId = event.pointerId ?? 0;
    if (!this.pressedPointers.has(pointerId)) return;
    const previous = this.pointerReleaseTimers.get(pointerId);
    if (previous !== undefined) clearTimeout(previous);
    // Keep the guard through pointerup's native click and submit default actions.
    this.pointerReleaseTimers.set(pointerId, setTimeout(() => {
      this.pointerReleaseTimers.delete(pointerId);
      this.pressedPointers.delete(pointerId);
      this.update();
    }, 0));
  }
  private clearPointerInteraction(): void {
    for (const timer of this.pointerReleaseTimers.values()) clearTimeout(timer);
    this.pointerReleaseTimers.clear(); this.pressedPointers.clear();
  }

  private resourceName(view: ResourceSnapshot, id: string): string { return view.catalog.resources.find(item => item.id === id)?.name ?? view.items.find(item => item.id === id)?.name ?? id; }
  private resourceCount(view: ResourceSnapshot, id: string): number { return view.items.find(item => item.id === id)?.quantity ?? 0; }
  private nearService(roles: readonly string[]): boolean {
    const snapshot = this.options.snapshot();
    return !!snapshot && (snapshot.facilities ?? []).some(facility => roles.includes(facility.role) && Math.hypot(facility.x - snapshot.x, facility.y - snapshot.y) <= 220);
  }
  private treasureActive(view: ResourceSnapshot): boolean {
    return !!view.marketAccess?.active && view.marketAccess.treasureHeavenUntilMs > view.clockMs;
  }
  private listingChannel(key: string): 'local' | 'treasure-heaven' {
    return this.drafts.get(key) === 'treasure-heaven' ? 'treasure-heaven' : 'local';
  }
  private listingChannelFields(view: ResourceSnapshot, key: string): string {
    const active = this.treasureActive(view);
    const current = this.listingChannel(key);
    const entries: [string, string][] = [['local', 'Chợ địa phương · nguyên thạch']];
    if (active || current === 'treasure-heaven') entries.push(['treasure-heaven', active ? 'Bảo Hoàng Thiên · tiên nguyên thạch' : 'Bảo Hoàng Thiên · phiên đã hết hạn']);
    const note = current === 'treasure-heaven' ? 'Giá và phí người bán tính bằng tiên nguyên thạch. Cần phiên tiếp dẫn còn hiệu lực.' : 'Giá và phí người bán tính bằng nguyên thạch. Giao dịch tại cơ sở trong cùng khu dân cư.';
    return this.select(key, 'mode', 'Kênh giao dịch', entries, 'local') + `<p class="rp-muted rp-currency-note">${note}</p>`;
  }
  private action(option: string, label: string, payload: Partial<ResourceAction> = {}, disabled = false, secondary = false): string {
    const key = option + ':' + JSON.stringify(payload);
    return `<button type="button" class="rp-action${secondary ? ' is-secondary' : ''}" data-resource-option="${escape(option)}" data-resource-payload="${escape(JSON.stringify(payload))}" data-resource-focus="${escape(key)}" ${this.busy || disabled ? 'disabled' : ''}>${escape(label)}</button>`;
  }
  private form(option: string, body: string, label: string, payload: Partial<ResourceAction> = {}, disabled = false): string {
    return `<form class="rp-form" data-resource-form data-resource-option="${escape(option)}" data-resource-payload="${escape(JSON.stringify(payload))}">${body}<button type="submit" class="rp-action" data-resource-focus="submit:${escape(option + ':' + JSON.stringify(payload))}" ${this.busy || disabled ? 'disabled' : ''}>${escape(label)}</button></form>`;
  }
  private destroyForm(instanceId: string): string {
    const key = 'destroy-confirm:' + instanceId;
    const confirmed = this.drafts.get(key) === true;
    return `<details class="rp-danger"><summary>Phá hủy Cổ vĩnh viễn</summary><p>Cổ sẽ chết và không thể hoàn tác. Quan hệ bản mệnh có thể gây phản phệ cho chủ; đang cho mượn cũng không tránh được hậu quả này.</p>${this.form('destroy-gu', `<label class="rp-toggle"><input type="checkbox" data-resource-confirm data-resource-draft="${escape(key)}" data-resource-focus="${escape(key)}" ${confirmed ? 'checked' : ''}><span>Tôi hiểu Cổ sẽ mất vĩnh viễn và chấp nhận hậu quả.</span></label>`, 'Xác nhận phá hủy Cổ', { instanceId, mode: 'confirm' }, !confirmed)}</details>`;
  }
  private input(key: string, field: string, label: string, initial: number | string, max = 999999): string {
    const value = this.drafts.get(key) ?? initial;
    return `<label class="rp-field"><span>${escape(label)}</span><input type="number" data-resource-draft="${escape(key)}" data-resource-field="${field}" data-resource-focus="${escape(key)}" min="${field === 'budget' ? 0 : 1}" max="${max}" step="1" value="${escape(value)}" required></label>`;
  }
  private select(key: string, field: string, label: string, entries: readonly [string, string][], initial: string | string[] = '', multiple = false): string {
    const current = this.drafts.get(key) ?? initial;
    const values = Array.isArray(current) ? current : [String(current)];
    return `<label class="rp-field"><span>${escape(label)}</span><select data-resource-draft="${escape(key)}" data-resource-field="${escape(field)}" data-resource-focus="${escape(key)}" ${multiple ? 'multiple size="4"' : 'required'}>${!multiple && !initial ? '<option value="">Chọn…</option>' : ''}${entries.map(([id, name]) => `<option value="${escape(id)}" ${values.includes(id) ? 'selected' : ''}>${escape(name)}</option>`).join('')}</select></label>`;
  }
  private intro(eyebrow: string, heading: string, text: string): string { return `<header class="rp-section-intro"><p class="rp-eyebrow">${escape(eyebrow)}</p><h3>${escape(heading)}</h3><p>${escape(text)}</p></header>`; }
  private materials(view: ResourceSnapshot, materials: Readonly<Record<string, number>>): string { return Object.entries(materials).map(([id, quantity]) => `${quantity} ${this.resourceName(view, id)}`).join(' · ') || 'Không cần'; }
  private card(title: string, body: string, extraClass = ''): string { return `<article class="rp-card ${extraClass}"><h4>${escape(title)}</h4>${body}</article>`; }

  private renderResources(view: ResourceSnapshot): string {
    const cards = view.items.filter(item => item.quantity > 0).map(item => `<article class="rp-card rp-stack"><span class="rp-item-icon" aria-hidden="true">${itemIcon(item.id)}</span><div><div class="rp-card-heading"><h4>${escape(item.name)}</h4><span class="rp-count">${number(item.quantity)}</span></div><p>${escape(item.definition?.description ?? '')}</p><p class="rp-muted">${escape(item.definition?.uses?.map(use => USE[use] ?? 'Công dụng đặc biệt').join(' · ') ?? '')}</p><details><summary>Nguồn &amp; bảo quản</summary><p>${escape(item.definition?.source ?? 'Chưa rõ nguồn')}</p><p>${escape(item.definition?.storage ?? 'Chưa có thông tin bảo quản')}</p><p>Phẩm cấp ${number(item.definition?.grade ?? 0)} · ${escape(RARITY[item.definition?.rarity] ?? 'Chưa rõ độ hiếm')}</p></details></div></article>`).join('');
    return this.intro('Kho tài nguyên', 'Biết thứ mình đang giữ', 'Thức ăn, vật liệu và giống được theo dõi riêng. Một vật phẩm có thể phục vụ nhiều công dụng.') +
      `<div class="rp-grid">${cards || '<div class="rp-empty"><h4>Chưa có tài nguyên</h4><p>Đến mục Tìm &amp; bắt Cổ để khảo sát điểm thu hái, hoặc mua thức ăn và vật tư ở Cổ khố.</p></div>'}</div>` +
      `<section class="rp-callout"><h4>Bổ sung nguyên lực</h4><p>Dùng nguyên thạch để hồi chân nguyên; thức ăn nuôi Cổ vẫn phải cung cấp riêng.</p>${this.form('restore-essence', this.input('restore-quantity', 'quantity', 'Số nguyên thạch', 1), 'Dùng nguyên thạch')}${this.form('convert-immortal-stone', this.input('convert-quantity', 'quantity', 'Số tiên nguyên thạch', 1), 'Chuyển thành thanh đề tiên nguyên')}<p class="rp-muted">Chỉ quy đổi sang thanh đề theo điều kiện tương ứng; không tự đổi thành tiên nguyên chuyển cao hoặc đổi ngược.</p></section>` +
      `<div class="rp-row">${this.action('feed-all', 'Cho Cổ ăn từ dự trữ', {}, view.gu.length === 0, true)}${this.action('work', 'Nhận việc kiếm nguyên thạch', {}, !this.nearService(['academy', 'gu-warehouse', 'inn']), true)}</div>`;
  }

  private renderCapture(view: ResourceSnapshot, snapshot: FieldSnapshot): string {
    const nodes = view.nearbyNodes ?? [];
    const cards = nodes.map(node => {
      const distance = Math.hypot(node.x - snapshot.x, node.y - snapshot.y);
      const near = distance <= 220;
      const targets = node.discovered ? (view.wildTargets ?? []).filter(target => target.nodeId === node.id) : [];
      const actions = !node.discovered ? this.action('scout', 'Khảo sát dấu vết', { nodeId: node.id }, !near) : node.kind === 'harvest'
        ? this.action('harvest', 'Thu hái', { nodeId: node.id }, !near || node.stock === 0)
        : targets.map(target => `<section class="rp-wild"><h5>${escape(target.name)}</h5><p>Sức khỏe ${pct(target.healthBps)} · chống cự ${pct(target.resistanceBps)}${target.baited ? ' · Đã dẫn dụ' : ''}</p><div class="rp-row">${this.action('bait', 'Dẫn dụ', { nodeId: node.id, targetId: target.id }, !near, true)}${this.action('weaken', 'Làm yếu có kiểm soát', { nodeId: node.id, targetId: target.id }, !near, true)}${this.action('capture', 'Bắt sống', { nodeId: node.id, targetId: target.id }, !near)}</div></section>`).join('') || '<p class="rp-muted">Chưa thấy Cổ còn sống ở đây. Hãy theo dõi dấu vết hoặc chờ nguồn tái tạo.</p>';
      return this.card(node.discovered ? node.name : 'Dấu vết chưa khảo sát', `<div class="rp-card-heading"><span class="rp-tag">${node.discovered ? node.kind === 'wild' ? 'Nơi xuất hiện Cổ' : 'Điểm thu hái' : 'Chưa khảo sát'}</span><span class="rp-muted">Cách ${number(Math.round(distance))} bước</span></div><p>${escape(node.discovered ? node.description : 'Khảo sát trước để nhận biết nguồn tài nguyên hoặc sinh vật tại đây.')}</p>${node.discovered && node.resourceId ? `<p>${escape(this.resourceName(view, node.resourceId))}${node.stock === undefined ? '' : ` · còn ${number(node.stock)}`}</p>` : ''}${node.discovered && node.readyInMs ? `<p class="rp-muted">Tái tạo sau <span data-node-timer="${escape(node.id)}">${duration(node.readyInMs)}</span></p>` : ''}${!near ? '<p class="rp-hint">Đến cách điểm này tối đa 220 bước để thao tác.</p>' : ''}<div class="rp-node-actions">${actions}</div>`);
    }).join('');
    return this.intro('Thăm dò vùng gần', 'Bắt được chưa phải dùng được', 'Tới gần dấu vết trên bản đồ, khảo sát rồi chọn cách khống chế. Cổ có thể chống cự, bị thương hoặc trốn thoát.') + `<div class="rp-callout"><p>Chuẩn bị thức ăn dẫn dụ và phương tiện giam giữ tại Cổ khố. Khi bắt sống, Cổ vẫn cần luyện hóa và nuôi dưỡng.</p></div><div class="rp-grid">${cards || '<div class="rp-empty"><h4>Chưa thấy điểm tài nguyên lân cận</h4><p>Đi dọc đường quanh khu dân cư. Bản đồ chỉ ghi dấu vết mà nhân vật có thể biết.</p></div>'}</div>`;
  }

  private renderGu(view: ResourceSnapshot): string {
    const living = view.gu.filter(gu => gu.healthBps > 0 && gu.feeding.state !== 'dead');
    const terminal = view.gu.filter(gu => gu.healthBps <= 0 || gu.feeding.state === 'dead');
    const cards = living.map(gu => this.renderGuCard(view, gu)).join('');
    const enabled = this.drafts.get('autofeed-enabled') ?? view.settings.autoFeed;
    const ordered = [...living].sort((a, b) => {
      const index = (id: string) => { const value = view.settings.priority.indexOf(id); return value < 0 ? view.settings.priority.length : value; };
      return index(a.id) - index(b.id);
    });
    const priority = ordered.length ? `<fieldset class="rp-priority-list"><legend>Thứ tự cho ăn · số nhỏ được ưu tiên trước</legend>${ordered.map((gu, index) => `<label><span>${escape(gu.name)} · ${escape(gu.id.split(':').at(-1))}</span><input type="number" min="1" max="256" step="1" data-resource-priority="${escape(gu.id)}" data-resource-draft="priority-${escape(gu.id)}" data-resource-focus="priority-${escape(gu.id)}" value="${escape(this.drafts.get('priority-' + gu.id) ?? index + 1)}" aria-label="Thứ tự cho ăn ${escape(gu.name)}" required></label>`).join('')}</fieldset>` : '';
    const auto = this.form('auto-feed', `<label class="rp-toggle"><input type="checkbox" data-resource-draft="autofeed-enabled" data-resource-field="enabled" ${enabled ? 'checked' : ''}><span>Tự cho ăn khi có thức ăn và quyền dùng kho</span></label>${this.input('autofeed-budget', 'budget', 'Ngân sách mua thức ăn (nguyên thạch)', view.settings.budget, Number(RESOURCE_BALANCE.autoFeedBudgetMax))}${priority}`, 'Lưu chăm sóc tự động');
    const loans = (view.loans ?? []).map(loan => this.card(loan.own ? 'Cổ đang cho mượn' : 'Cổ đang mượn', `<p>${escape(loan.borrowerName)} · ${loan.status === 'revoked' ? 'Đã thu hồi quyền dùng' : 'Quyền mượn đang hiệu lực'}</p>${!loan.own ? '<p class="rp-hint">Đến gần chủ luyện hóa để trả thân Cổ.</p>' : ''}<div class="rp-row">${loan.own ? this.action('revoke-loan', 'Thu hồi quyền dùng', { instanceId: loan.instanceId }, loan.status === 'revoked', true) : this.action('return-loan', 'Trả Cổ cho chủ', { instanceId: loan.instanceId }, !(view.players ?? []).some(player => player.lifeId === loan.controllerLifeId), true)}</div>${loan.own ? this.destroyForm(loan.instanceId) : ''}`)).join('');
    const history = terminal.length ? `<details class="rp-terminal-history"><summary>Ghi nhận Cổ đã chết hoặc tiêu hao (${terminal.length})</summary><div class="rp-grid">${terminal.map(gu => this.renderGuCard(view, gu)).join('')}</div></details>` : '';
    return this.intro('Chăm sóc từng cá thể', 'Giữ được, điều khiển được, nuôi được', 'Chuyển kho hoặc đổi người giữ không đặt lại lịch ăn và thương tích. Luyện hóa, chữa thương và lập bản mệnh cần về khu an toàn.') + `<div class="rp-grid">${cards || '<div class="rp-empty"><h4>Chưa có Cổ còn sống để chăm sóc</h4><p>Nhận một Cổ nhập môn ở học đường hoặc bắt sống Cổ trong thiên địa.</p></div>'}</div><section class="rp-callout"><h4>Kế hoạch thức ăn</h4>${auto}<p class="rp-muted">Thức ăn và phí kích hoạt là hai khoản riêng. Tự động hóa dừng khi hết nguồn hoặc vượt ngân sách đã đặt.</p>${this.action('feed-all', 'Cho Cổ ăn từ dự trữ', {}, !living.length, true)}</section>${loans ? `<div class="rp-grid">${loans}</div>` : ''}${history}`;
  }
  private renderGuCard(view: ResourceSnapshot, gu: GuCareView): string {
    const ours = gu.controllerLifeId === view.lifeId;
    const borrowed = !ours && gu.authorizedLifeIds.includes(view.lifeId);
    const dead = gu.feeding.state === 'dead' || gu.healthBps <= 0;
    const locked = !!gu.lock;
    const control = gu.controlled ? ours ? 'Đã luyện hóa' : borrowed ? 'Được cho mượn quyền dùng' : 'Còn ý chí chủ cũ' : 'Chưa luyện hóa';
    const canTame = !dead && !locked && !borrowed && (!gu.controlled || !ours);
    const noOtherVital = !view.gu.some(item => item.vitalForLifeId === view.lifeId && item.id !== gu.id && item.healthBps > 0 && item.feeding.state !== 'dead');
    const storageModes: [string, string][] = [['bag', 'Mang theo'], ['vault', 'Cất kho'], ...(gu.care.preservationAllowed ? [['preservation', 'Kho bảo tồn'] as [string, string]] : []), ['aperture', 'Tiên khiếu']];
    const storage = this.form('store-gu', this.select('storage-' + gu.id, 'mode', 'Nơi giữ Cổ', storageModes, gu.storage), 'Chuyển nơi giữ', { instanceId: gu.id }, dead || locked);
    const players = (view.players ?? []).filter(player => player.lifeId !== view.lifeId);
    const isLoan = (view.loans ?? []).some(loan => loan.instanceId === gu.id && loan.holderLifeId === view.lifeId && !loan.own);
    const bound = !!gu.starterGrantLifeId;
    const transferModes: [string, string][] = [...(ours ? [['loan', 'Cho mượn · giữ quyền điều khiển'] as [string, string]] : []), ['gift', ours ? 'Cho tặng · chuyển quyền điều khiển' : 'Chuyển thân Cổ · giữ tình trạng ý chí']];
    const transfer = !borrowed && !isLoan && !bound && !locked && !dead ? `<details><summary>Cho tặng hoặc cho mượn</summary>${this.form('transfer-gu', this.select('recipient-' + gu.id, 'targetAccountId', 'Người đứng gần', players.map(player => [player.accountId, player.name])) + this.select('transfer-mode-' + gu.id, 'mode', 'Quyền chuyển giao', transferModes, ours ? 'loan' : 'gift'), 'Chuyển giao Cổ', { instanceId: gu.id }, !players.length)}${!players.length ? '<p class="rp-hint">Cần có người nhận đứng gần.</p>' : ''}</details>` : bound ? '<p class="rp-hint">Cổ nhập môn được cấp cho cuộc đời này, không chuyển giao hoặc gửi bán.</p>' : '';
    const buttons = [
      this.action('feed', 'Cho ăn đúng thức ăn', { instanceId: gu.id }, dead || this.resourceCount(view, gu.feeding.foodId) < gu.feeding.amount),
      canTame ? this.action('tame', `Bắt đầu luyện hóa · ${RESOURCE_BALANCE.tamingStones} thạch`, { instanceId: gu.id }) : '',
      !dead && gu.healthBps < 10000 ? this.action('heal-gu', 'Chữa thương · 1 linh thảo', { instanceId: gu.id }, locked || this.resourceCount(view, 'spirit-herb') < 1, true) : '',
      gu.tamingProgressBps > 0 && !gu.controlled ? this.action('cancel-taming', 'Dừng luyện hóa', {}, false, true) : '',
      ours && !gu.vitalForLifeId && noOtherVital ? this.action('set-vital', 'Lập quan hệ bản mệnh', { instanceId: gu.id }, dead || locked, true) : '',
    ].join('');
    return `<article class="rp-card rp-gu-card">
      <div class="rp-gu-heading"><span aria-hidden="true">${guIcon(gu.typeId, 42)}</span><div><h4>${escape(gu.name)}</h4><span class="rp-muted">Chuyển ${gu.rank} · cá thể ${escape(gu.id.split(':').at(-1))}</span></div><span class="rp-tag ${gu.usable ? 'is-good' : ''}">${escape(control)}</span></div>
      <p>${gu.holderLifeId === view.lifeId ? 'Bạn đang giữ thân Cổ.' : 'Cổ ở người giữ khác.'} ${ours ? 'Bạn giữ quyền điều khiển.' : gu.controllerLifeId ? 'Quyền điều khiển thuộc chủ khác.' : 'Chưa có chủ luyện hóa.'}</p>
      <div class="rp-gu-vitals"><span>Sức khỏe <strong data-gu-health="${escape(gu.id)}">${pct(gu.healthBps)}</strong></span><span>Chống cự <strong>${pct(gu.willBps)}</strong></span><span>${escape(STORAGE[gu.storage] ?? gu.storage)}</span>${bound ? '<span class="rp-tag">Cổ nhập môn · gắn với cuộc đời</span>' : ''}${gu.vitalForLifeId ? '<span class="rp-tag">Có quan hệ bản mệnh</span>' : ''}</div>
      <p class="rp-food-state is-${escape(gu.feeding.state)}">${escape(FEEDING[gu.feeding.state] ?? gu.feeding.state)} · <span data-gu-feed-timer="${escape(gu.id)}">${duration(gu.feeding.remainingMs)}</span></p>
      <p>Cần ${gu.feeding.amount} ${escape(this.resourceName(view, gu.feeding.foodId))} · dự trữ ${number(this.resourceCount(view, gu.feeding.foodId))}</p>
      ${canTame ? `<p class="rp-muted">Luyện hóa cần ${Number(RESOURCE_BALANCE.tamingEssenceBps) / 100}% toàn khiếu; thời gian cơ sở ${duration(Number(RESOURCE_BALANCE.tamingMs))}.</p>` : ''}
      ${gu.tamingProgressBps > 0 && !gu.controlled ? `<p>Tiến độ luyện hóa <strong data-gu-tame-progress="${escape(gu.id)}">${pct(gu.tamingProgressBps)}</strong>. Gián đoạn có thể mất tiến độ.</p>` : ''}
      ${locked ? '<p class="rp-hint">Cá thể đang được giữ cho một hoạt động khác; chưa thể chuyển giao hoặc dùng đồng thời.</p>' : ''}
      <div class="rp-row">${buttons}</div>
      <details><summary>Bảo quản &amp; quyền chuyển giao</summary>${storage}<p class="rp-muted">Bảo tồn chỉ áp dụng khi loại Cổ và môi trường đáp ứng; không phải mọi Cổ đều ngủ đông được.</p>${transfer}</details>
      ${ours && gu.controlled && !dead ? this.destroyForm(gu.id) : ''}
    </article>`;
  }

  private renderRecipes(view: ResourceSnapshot): string {
    const recipes = view.recipes.map(recipe => this.renderRecipe(view, recipe)).join('');
    const jobs = view.jobs.map(job => this.card(view.catalog.recipes.find(recipe => recipe.id === job.recipeId)?.name ?? 'Lần luyện Cổ', `<p class="rp-tag">${({ running: 'Đang luyện', success: 'Thành công', failed: 'Thất bại', cancelled: 'Đã dừng' })[job.status]}</p><p>${escape(job.message)}</p>${job.status === 'running' ? `<p>Còn <strong data-job-timer="${escape(job.id)}">${duration(job.finishClockMs - view.clockMs)}</strong></p>${this.action('cancel-refine', 'Dừng lần luyện', { instanceId: job.id }, false, true)}` : ''}`)).join('');
    return this.intro('Cổ phương & luyện chế', 'Một phương, từng thành phần thật', 'Chọn từng cá thể làm đầu vào. Cổ đang luyện không thể đồng thời bán, cho mượn hoặc dùng chiêu.') + `<div class="rp-grid">${recipes || '<div class="rp-empty"><h4>Chưa biết cổ phương</h4><p>Tìm tri thức, tàn phương hoặc học phương pháp tại tịnh thất luyện hóa.</p></div>'}</div>${jobs ? `<section><h3 class="rp-subheading">Các lần luyện</h3><div class="rp-grid">${jobs}</div></section>` : ''}`;
  }
  private renderRecipe(view: ResourceSnapshot, recipe: RecipeView): string {
    const definition = recipe.definition;
    const nearby = this.nearService(['academy', 'refining-hall']);
    if (!recipe.known) return this.card(definition.name, `<p>Tàn phương · nghiên cứu ${pct(recipe.progressBps)}</p><p>Biết thành phẩm chưa đồng nghĩa biết đủ phương pháp luyện.</p><p class="rp-muted">Nghiên cứu cần ${RESOURCE_BALANCE.researchStones} nguyên thạch · ${duration(Number(RESOURCE_BALANCE.researchMs))}.</p>${!nearby ? '<p class="rp-hint">Đến gần giáo tập hoặc tịnh thất luyện hóa để nghiên cứu.</p>' : ''}${this.action('research', 'Nghiên cứu cổ phương', { recipeId: recipe.id }, !nearby || view.activity?.kind === 'research')}`);
    const required = definition.inputs.map(input => `${input.count} ${view.catalog.gu.find(gu => gu.typeId === input.typeId)?.name ?? view.gu.find(gu => gu.typeId === input.typeId)?.name ?? input.typeId}`).join(' + ') || 'Không cần Cổ đầu vào';
    const relevant = view.gu.filter(gu => !gu.lock && gu.healthBps > 0 && gu.feeding.state !== 'dead' && gu.controlled && gu.controllerLifeId === view.lifeId && definition.inputs.some(input => input.typeId === gu.typeId));
    const selected = this.drafts.get('recipe-inputs-' + recipe.id);
    const choices = `<fieldset class="rp-instance-picker"><legend>Chọn cá thể đầu vào</legend>${relevant.map(gu => `<label><input type="checkbox" data-resource-draft="recipe-inputs-${escape(recipe.id)}" data-resource-field="inputIds" data-resource-focus="recipe-input:${escape(recipe.id + ':' + gu.id)}" value="${escape(gu.id)}" ${Array.isArray(selected) && selected.includes(gu.id) ? 'checked' : ''}><span>${escape(gu.name)} · ${escape(gu.id.split(':').at(-1))}${gu.vitalForLifeId === view.lifeId ? ' · bản mệnh' : ''}</span></label>`).join('') || '<p>Chưa có cá thể phù hợp.</p>'}</fieldset>`;
    return this.card(definition.name, `<p class="rp-tag">${definition.kind === 'reverse' ? 'Nghịch luyện' : definition.kind === 'upgrade' ? 'Thăng chuyển' : 'Hợp luyện'} · thành phẩm chuyển ${definition.resultRank}</p><p class="rp-recipe-line">${escape(required)}</p><dl class="rp-definition-list"><div><dt>Tiêu hao</dt><dd>${escape(this.materials(view, definition.materials))}</dd></div><div><dt>Giữ lại</dt><dd>${escape(this.materials(view, definition.preservedMaterials))}</dd></div><div><dt>Chi phí</dt><dd>${definition.stones} nguyên thạch · ${definition.essenceBps / 100}% toàn khiếu</dd></div><div><dt>Thực hiện</dt><dd>${duration(definition.durationMs)} · xác suất cơ sở ${pct(definition.successBps)}</dd></div><div><dt>Điều kiện</dt><dd>Tu vi ${definition.minRank} · Luyện đạo ${definition.minRefinement} · ${escape(ENVIRONMENT[definition.environment] ?? definition.environment)}</dd></div></dl>${!nearby ? '<p class="rp-hint">Đến gần giáo tập hoặc tịnh thất luyện hóa để thực hiện.</p>' : ''}${recipe.missing.length ? `<ul class="rp-missing">${recipe.missing.map(item => `<li>${escape(item)}</li>`).join('')}</ul>` : '<p class="rp-good">Đã đủ điều kiện cơ sở; cần chọn đúng cá thể.</p>'}${this.form('start-refine', choices, 'Bắt đầu luyện chế', { recipeId: recipe.id }, !nearby || recipe.missing.length > 0)}<details><summary>Khi thất bại</summary><p>Chỉ những thành phần tham gia được xử lý theo diễn biến. Đầu vào có thể bị thương hoặc mất; bản mệnh có cơ chế bảo toàn riêng. Nghịch luyện không mặc định hoàn lại mọi nguyên liệu.</p></details>`);
  }

  private renderProduction(view: ResourceSnapshot): string {
    const crops = view.catalog.crops.map(crop => {
      const environment = ENVIRONMENT[crop.environment] ?? 'Sinh cảnh phù hợp';
      const output = crop.sourceGuTypeId ? view.catalog.gu.find(gu => gu.typeId === crop.sourceGuTypeId)?.name ?? 'Cổ hình thành trong môi trường' : this.resourceName(view, crop.productId);
      const missingInputs = Object.entries(crop.inputs).some(([id, amount]) => this.resourceCount(view, id) < amount);
      return this.card(crop.name, `
        <p>Giống: ${escape(this.resourceName(view, crop.seedId))} · dự trữ ${number(this.resourceCount(view, crop.seedId))}</p>
        <p>Đầu vào: ${escape(this.materials(view, crop.inputs))}</p><p>Sản vật: ${escape(output)}</p>
        <p>${escape(environment)} · ${duration(crop.durationMs)} mỗi chu kỳ · sản lượng ${crop.yield} · sức chứa ${crop.capacity}</p>
        ${crop.sourceGuTypeId ? '<p class="rp-muted">Cổ hình thành từ chuỗi môi trường này khác đàn côn trùng thông thường; không có cơ chế ghép đôi Cổ bất kỳ.</p>' : ''}
        ${missingInputs ? '<p class="rp-hint">Chưa đủ đầu vào duy trì nguồn sản xuất.</p>' : ''}
        ${this.form('plant', this.select('plant-environment-' + crop.id, 'mode', 'Môi trường bố trí', [[crop.environment, environment]], crop.environment), 'Bố trí nguồn sản xuất', { cropId: crop.id }, this.resourceCount(view, crop.seedId) < 1 || missingInputs)}
      `);
    }).join('');
    const farms = view.farms.map(farm => this.card(farm.definition.name, `
      <p>${escape(ENVIRONMENT[farm.environment] ?? 'Sinh cảnh phù hợp')} · chất lượng ${pct(farm.qualityBps)}</p>
      <p>Phát triển <strong data-farm-progress="${escape(farm.id)}">${pct(farm.growthMs / Math.max(1, farm.definition.durationMs) * 10000)}</strong> · đang giữ ${number(farm.stored)} / ${farm.definition.capacity}</p>
      <p>${farm.running ? 'Nguồn đang sản xuất' : 'Nguồn đã dừng; kiểm tra đầu vào và môi trường'}</p>
      <div class="rp-row">${this.action('harvest-farm', 'Thu sản vật', { farmId: farm.id }, !farm.ready || farm.stored <= 0)}${this.action('improve-farm', `Cải tạo · ${RESOURCE_BALANCE.farmingImprovementStones} nguyên thạch`, { farmId: farm.id }, !this.nearService(['academy', 'training']) || farm.qualityBps >= 15000, true)}</div>
      <details><summary>Chi phí đã đầu tư</summary><p>${farm.costStones} nguyên thạch · ${escape(this.materials(view, farm.consumed))}</p></details>
    `)).join('');
    return this.intro('Nguồn thu & thức ăn', 'Đầu tư một nguồn có thể duy trì', 'Sinh trưởng, thức ăn và sản lượng tuân theo đồng hồ nơi sản xuất. Môi trường, giống và đầu vào quyết định nguồn có tiếp tục được hay không.') + `${farms ? `<section><h3 class="rp-subheading">Nguồn đang quản lý</h3><div class="rp-grid">${farms}</div></section>` : ''}<section><h3 class="rp-subheading">Bố trí nguồn mới</h3><div class="rp-grid">${crops || '<div class="rp-empty">Chưa biết nguồn nuôi trồng phù hợp.</div>'}</div></section>`;
  }

  private renderMarket(view: ResourceSnapshot, snapshot: FieldSnapshot): string {
    const resources = view.catalog.resources.filter(resource => resource.buyPrice > 0 && (resource.grade < 6 || (snapshot.cultivation?.rank ?? 0) >= 6));
    const nearShop = this.nearService(['academy', 'gu-warehouse']);
    const resourceOptions = resources.map(resource => [resource.id, `${resource.name} · mua ${resource.buyPrice} / bán ${resource.sellPrice} thạch`] as [string, string]);
    const heldOptions = view.items.filter(item => item.quantity > 0).map(item => [item.id, `${item.name} · có ${item.quantity}`] as [string, string]);
    const shop = this.card('Cổ khố · vật tư', `${!nearShop ? '<p class="rp-hint">Đến gần học đường hoặc Cổ khố để giao dịch.</p>' : ''}${this.form('buy-resource', this.select('buy-resource', 'resourceId', 'Mua vật tư', resourceOptions) + this.input('buy-quantity', 'quantity', 'Số lượng', 1), 'Mua vật tư', {}, !nearShop)}${this.form('sell-resource', this.select('sell-resource', 'resourceId', 'Bán tài nguyên đang có', heldOptions) + this.input('sell-quantity', 'quantity', 'Số lượng', 1), 'Bán tài nguyên', {}, !nearShop || !heldOptions.length)}`);
    const guShop = this.card('Cổ khố · Cổ chưa luyện hóa', `<p>Mỗi lần mua là một cá thể riêng. Kiểm tra thức ăn và khả năng luyện hóa trước khi mua.</p>${this.form('buy-gu', this.select('buy-gu', 'guId', 'Loại Cổ', view.catalog.gu.filter(gu => typeof gu.purchaseStones === 'number').map(gu => [gu.typeId, `${gu.name} · ${gu.purchaseStones} nguyên thạch`])), 'Mua một cá thể Cổ', {}, !nearShop)}${this.action('work', 'Nhận việc kiếm nguyên thạch', {}, !this.nearService(['academy', 'gu-warehouse', 'inn']), true)}`);
    const treasure = this.treasureActive(view);
    const immortalBalance = this.resourceCount(view, 'immortal-stone');
    const listingForm = this.card('Gửi bán tài nguyên', `<p>Vật phẩm gửi bán được tách khỏi lượng đang dùng; hủy bán trả đúng phần còn lại.</p>${this.form('create-listing', this.listingChannelFields(view, 'listing-channel-resource') + this.select('listing-resource', 'resourceId', 'Tài nguyên', heldOptions) + this.input('listing-quantity', 'quantity', 'Số lượng gửi', 1) + this.input('listing-price', 'price', 'Giá toàn bộ lô', 1), 'Đăng bán lô tài nguyên', {}, (this.listingChannel('listing-channel-resource') === 'treasure-heaven' ? !treasure : !nearShop) || !heldOptions.length)}`);
    const movable = view.gu.filter(gu => !gu.lock && gu.healthBps > 0 && !gu.starterGrantLifeId && !gu.vitalForLifeId && !(view.loans ?? []).some(loan => loan.instanceId === gu.id && !loan.own));
    const guListing = this.card('Gửi bán cá thể Cổ', `${this.form('create-listing', this.listingChannelFields(view, 'listing-channel-gu') + this.select('listing-gu', 'instanceId', 'Cá thể', movable.map(gu => [gu.id, `${gu.name} · ${gu.id.split(':').at(-1)}`])) + this.input('listing-gu-price', 'price', 'Giá bán cá thể', 1), 'Gửi bán cá thể', {}, (this.listingChannel('listing-channel-gu') === 'treasure-heaven' ? !treasure : !nearShop) || !movable.length)}<p class="rp-muted">Lịch ăn và thương tích tiếp tục theo cá thể trong thời gian chờ mua.</p>`);
    const listings = (view.market ?? []).map(listing => {
      const heaven = listing.channel === 'treasure-heaven';
      const currency = heaven ? 'tiên nguyên thạch' : 'nguyên thạch';
      const canBuy = heaven ? treasure && immortalBalance >= listing.price : nearShop && snapshot.stones >= listing.price;
      const condition = listing.gu ? `<p>Sức khỏe ${pct(listing.gu.healthBps)} · ${escape(FEEDING[listing.gu.feeding.state] ?? listing.gu.feeding.state)} · kỳ ăn ${duration(listing.gu.feeding.remainingMs)}</p>` : '';
      return this.card(listing.kind === 'gu' ? listing.gu?.name ?? 'Cá thể Cổ' : this.resourceName(view, listing.resourceId ?? ''), `<span class="rp-tag ${heaven ? 'is-heaven' : ''}">${heaven ? 'Bảo Hoàng Thiên' : 'Chợ địa phương'}</span><p>${escape(listing.sellerName)} · ${listing.kind === 'resource' ? `${number(listing.quantity)} đơn vị` : 'một cá thể'}</p>${condition}<p class="rp-price">${number(listing.price)} ${currency} <span>· người bán chịu phí ${number(listing.fee)} ${currency}</span></p>${listing.own ? this.action('cancel-listing', 'Hủy gửi bán', { listingId: listing.id }, !nearShop, true) : this.action('buy-listing', 'Mua lô hàng', { listingId: listing.id }, !canBuy)}`);
    }).join('');
    const immortal = (snapshot.cultivation?.rank ?? 0) >= 6;
    const fee = view.marketAccess?.serviceFee ?? 1;
    const access = `<section class="rp-callout rp-treasure-service"><h4>Bảo Hoàng Thiên · dịch vụ tiếp dẫn</h4><p>Nhờ người tiếp dẫn tại học đường hoặc Cổ khố kết nối giao dịch tiên cảnh. Dịch vụ này không cấp Thông Thiên Cổ cho nhân vật.</p><p>Bạn có <strong>${number(immortalBalance)} tiên nguyên thạch</strong> · phí mở phiên ${fee} tiên nguyên thạch.</p>${treasure ? `<p class="rp-good">Phiên tiếp dẫn còn <strong data-treasure-access-timer>${duration((view.marketAccess?.treasureHeavenUntilMs ?? 0) - view.clockMs)}</strong>. Có thể giao dịch hàng Bảo Hoàng Thiên từ nơi khác khi phiên còn hiệu lực.</p>` : `<p class="rp-hint">${!immortal ? 'Cần đạt lục chuyển để dùng dịch vụ.' : !nearShop ? 'Đến gần người tiếp dẫn ở học đường hoặc Cổ khố.' : immortalBalance < fee ? 'Chưa đủ tiên nguyên thạch mở phiên.' : 'Chưa có phiên tiếp dẫn đang hoạt động.'}</p>`}${this.action('open-treasure-heaven', treasure ? 'Phiên tiếp dẫn đang hoạt động' : `Mở phiên tiếp dẫn · ${fee} tiên nguyên thạch`, {}, treasure || !immortal || !nearShop || immortalBalance < fee)}<p class="rp-muted">Lô gửi bán dùng tiền tệ của kênh đã chọn. Phiên hết hạn vẫn có thể về người tiếp dẫn để hủy lô của mình. Bảo quang không bảo đảm nhân vật biết hết thông tin món hàng.</p></section>`;
    return this.intro('Nguồn cung & trao đổi', 'Mua đúng thứ mình cần', 'Giá vật tư, phí và điều kiện nguồn hàng được công bố trước giao dịch. Mua Cổ không tự hoàn tất luyện hóa.') + `<div class="rp-grid">${shop}${guShop}</div>${access}<section><h3 class="rp-subheading">Chợ chung</h3><div class="rp-grid">${listings || '<div class="rp-empty"><p>Chưa có lô hàng phù hợp đang chờ mua.</p></div>'}</div></section><details class="rp-callout"><summary>Gửi hàng của mình lên chợ</summary><div class="rp-grid">${listingForm}${guListing}</div></details>`;
  }

  private updateTimers(view?: ResourceSnapshot): void {
    if (!view) return;
    const accessTime = this.root.querySelector<HTMLElement>('[data-treasure-access-timer]');
    if (accessTime) accessTime.textContent = this.treasureActive(view) ? duration((view.marketAccess?.treasureHeavenUntilMs ?? 0) - view.clockMs) : 'đã hết hạn';
    const activityTime = this.root.querySelector<HTMLElement>('[data-resource-activity-timer]');
    if (activityTime && view.activity?.finishClockMs) activityTime.textContent = duration(view.activity.finishClockMs - view.clockMs);
    const gu = new Map(view.gu.map(item => [item.id, item]));
    for (const element of this.root.querySelectorAll<HTMLElement>('[data-gu-feed-timer]')) {
      const current = gu.get(element.getAttribute('data-gu-feed-timer') ?? ''); if (current) element.textContent = duration(current.feeding.remainingMs);
    }
    for (const element of this.root.querySelectorAll<HTMLElement>('[data-job-timer]')) {
      const job = view.jobs.find(job => job.id === element.getAttribute('data-job-timer')); if (job) element.textContent = job.status === 'running' ? duration(job.finishClockMs - view.clockMs) : job.message;
    }
    for (const element of this.root.querySelectorAll<HTMLElement>('[data-node-timer]')) {
      const node = view.nearbyNodes?.find(node => node.id === element.getAttribute('data-node-timer')); if (node) element.textContent = duration(node.readyInMs ?? 0);
    }
    for (const element of this.root.querySelectorAll<HTMLElement>('[data-farm-progress]')) {
      const farm = view.farms.find(farm => farm.id === element.getAttribute('data-farm-progress')); if (farm) element.textContent = pct(farm.growthMs / Math.max(1, farm.definition.durationMs) * 10000);
    }
    this.updateMarketControls(view);
  }
  private updateMarketControls(view = this.view()): void {
    const snapshot = this.options.snapshot();
    if (this.tab !== 'market' || !view || !snapshot) return;
    const active = this.treasureActive(view), nearShop = this.nearService(['academy', 'gu-warehouse']);
    const immortalBalance = this.resourceCount(view, 'immortal-stone');
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button[data-resource-option="buy-listing"]')) {
      const id = this.basePayload(button).listingId;
      const listing = view.market?.find(listing => listing.id === id);
      if (listing) button.disabled = this.busy || (listing.channel === 'treasure-heaven' ? !active || immortalBalance < listing.price : !nearShop || snapshot.stones < listing.price);
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button[data-resource-option="open-treasure-heaven"]')) {
      button.disabled = this.busy || active || (snapshot.cultivation?.rank ?? 0) < 6 || !nearShop || immortalBalance < (view.marketAccess?.serviceFee ?? 1);
    }
    for (const form of this.root.querySelectorAll<HTMLFormElement>('form[data-resource-option="create-listing"]')) {
      const mode = form.querySelector<HTMLSelectElement>('[data-resource-field="mode"]')?.value ?? 'local';
      const global = mode === 'treasure-heaven';
      const note = form.querySelector<HTMLElement>('.rp-currency-note');
      if (note) note.textContent = global ? active ? 'Giá và phí người bán tính bằng tiên nguyên thạch. Phiên tiếp dẫn đang hoạt động.' : 'Phiên tiếp dẫn đã hết hạn; giữ nguyên lô đang nhập và mở lại kết nối trước khi gửi.' : 'Giá và phí người bán tính bằng nguyên thạch. Giao dịch tại cơ sở trong cùng khu dân cư.';
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!submit) continue;
      const guId = form.querySelector<HTMLSelectElement>('[data-resource-field="instanceId"]')?.value;
      const resourceId = form.querySelector<HTMLSelectElement>('[data-resource-field="resourceId"]')?.value;
      const quantity = Number(form.querySelector<HTMLInputElement>('[data-resource-field="quantity"]')?.value ?? 1);
      const price = Number(form.querySelector<HTMLInputElement>('[data-resource-field="price"]')?.value ?? 0);
      const available = guId ? view.gu.some(gu => gu.id === guId && !gu.lock && gu.healthBps > 0 && !gu.starterGrantLifeId && !gu.vitalForLifeId) : !!resourceId && Number.isSafeInteger(quantity) && quantity > 0 && this.resourceCount(view, resourceId) >= quantity;
      submit.disabled = this.busy || !available || !Number.isSafeInteger(price) || price < 1 || (global ? !active : !nearShop);
    }
  }
  private onClick(event: Event): void {
    if (this.disposed) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-resource-close], .modal-backdrop')) { this.close(); return; }
    const tab = target.closest<HTMLElement>('[data-resource-tab]')?.getAttribute('data-resource-tab');
    if (TABS.some(([id]) => id === tab)) { this.tab = tab as ResourceTab; this.message = ''; this.error = false; this.render(true); return; }
    if (target.closest('[data-resource-refresh]')) { this.signature = ''; this.render(true); return; }
    const button = target.closest<HTMLButtonElement>('button[data-resource-option]');
    if (!button || button.disabled || button.type === 'submit') return;
    const option = button.getAttribute('data-resource-option');
    if (option) void this.execute({ option, ...this.basePayload(button) });
  }
  private basePayload(element: HTMLElement): Partial<ResourceAction> {
    try { return JSON.parse(element.getAttribute('data-resource-payload') ?? '{}') as Partial<ResourceAction>; }
    catch { return {}; }
  }
  private rememberDraft(event: Event): void {
    const element = event.target as HTMLInputElement | HTMLSelectElement;
    const key = element.getAttribute('data-resource-draft'); if (!key) return;
    if (element.hasAttribute('data-resource-confirm')) {
      const confirmed = (element as HTMLInputElement).checked;
      this.drafts.set(key, confirmed);
      const button = element.closest('form')?.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (button) button.disabled = !confirmed || this.busy;
      return;
    }
    if (element.getAttribute('data-resource-field') === 'inputIds') {
      const checked = [...this.root.querySelectorAll<HTMLInputElement>('[data-resource-field="inputIds"]')].filter(input => input.getAttribute('data-resource-draft') === key && input.checked).map(input => input.value);
      this.drafts.set(key, checked);
    } else if (element.tagName === 'SELECT' && (element as HTMLSelectElement).multiple) this.drafts.set(key, [...(element as HTMLSelectElement).selectedOptions].map(option => option.value));
    else this.drafts.set(key, (element as HTMLInputElement).type === 'checkbox' ? (element as HTMLInputElement).checked : element.value);
    this.updateMarketControls();
  }
  private onSubmit(event: Event): void {
    const form = (event.target as HTMLElement).closest<HTMLFormElement>('form[data-resource-form]');
    if (!form || this.disposed) return;
    event.preventDefault(); if (this.busy) return;
    const option = form.getAttribute('data-resource-option'); if (!option) return;
    const payload: ResourceAction = { option, ...this.basePayload(form) };
    if (option === 'destroy-gu' && !form.querySelector<HTMLInputElement>('[data-resource-confirm]')?.checked) {
      this.showError('Cần xác nhận đã hiểu việc mất Cổ vĩnh viễn trước khi thực hiện.'); return;
    }
    const selected: string[] = [];
    const priorities: { id: string; order: number }[] = [];
    for (const element of form.querySelectorAll<HTMLInputElement>('[data-resource-priority]')) {
      const order = Number(element.value);
      if (!Number.isSafeInteger(order) || order < 1 || order > 256) { this.showError('Thứ tự cho ăn phải từ 1 đến 256.'); return; }
      priorities.push({ id: element.getAttribute('data-resource-priority')!, order });
    }
    if (priorities.length) payload.priority = priorities.sort((a, b) => a.order - b.order).map(item => item.id);
    for (const element of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-resource-field]')) {
      const field = element.getAttribute('data-resource-field')!;
      if (field === 'inputIds') { if ((element as HTMLInputElement).checked) selected.push(element.value); continue; }
      if (field === 'enabled') payload.enabled = (element as HTMLInputElement).checked;
      else if (field === 'priority') payload.priority = [...(element as HTMLSelectElement).selectedOptions].map(option => option.value);
      else if (['quantity', 'price', 'budget'].includes(field)) {
        const value = Number(element.value);
        if (!Number.isSafeInteger(value) || value < (field === 'budget' ? 0 : 1) || value > 999999) { this.showError('Số lượng, giá và ngân sách cần là số nguyên trong phạm vi cho phép.'); return; }
        Object.assign(payload, { [field]: value });
      } else {
        if (!element.value) { this.showError('Hãy chọn đủ thông tin trước khi thực hiện.'); return; }
        Object.assign(payload, { [field]: element.value });
      }
    }
    if (option === 'start-refine') {
      if (new Set(selected).size !== selected.length) { this.showError('Mỗi đầu vào phải là một cá thể Cổ khác nhau.'); return; }
      const recipe = this.view()?.recipes.find(recipe => recipe.id === payload.recipeId)?.definition;
      const gu = this.view()?.gu ?? [];
      if (!recipe || selected.length !== recipe.inputs.reduce((sum, input) => sum + input.count, 0) || recipe.inputs.some(input => selected.filter(id => gu.find(item => item.id === id)?.typeId === input.typeId).length !== input.count)) { this.showError('Hãy chọn đúng số cá thể của từng loại Cổ theo cổ phương.'); return; }
      payload.inputIds = selected;
    }
    void this.execute(payload);
  }
  private showError(message: string): void { this.message = message; this.error = true; this.setText('.rp-status', message); this.root.querySelector('.rp-status')?.classList.add('is-error'); }
  private async execute(payload: ResourceAction): Promise<void> {
    if (this.disposed || this.busy || !this.options.snapshot() || this.options.snapshot()?.dead) return;
    const generation = this.generation, lifeId = this.options.snapshot()!.lifeId;
    this.busy = true; this.message = ''; this.error = false; this.render(true);
    try {
      await this.options.act({ type: 'resource', payload });
      if (this.disposed || generation !== this.generation || this.options.snapshot()?.lifeId !== lifeId) return;
      const error = this.options.error(); this.message = error ?? 'Máy chủ đã ghi nhận thao tác.'; this.error = !!error;
    } catch (error) {
      if (this.disposed || generation !== this.generation || this.options.snapshot()?.lifeId !== lifeId) return;
      this.message = error instanceof Error ? error.message : 'Chưa thực hiện được. Hãy kiểm tra điều kiện và thử lại.'; this.error = true;
    } finally {
      if (!this.disposed && generation === this.generation) { this.busy = false; this.signature = ''; if (this.root.classList.contains('active')) this.render(true); }
    }
  }
  private onTabKey(event: KeyboardEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-resource-tab]');
    if (!target) return;
    const index = TABS.findIndex(([tab]) => tab === target.getAttribute('data-resource-tab'));
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault(); this.tab = TABS[next][0]; this.message = ''; this.render(true);
    this.root.querySelector<HTMLElement>('[data-resource-tab="' + this.tab + '"]')?.focus();
  }
}

import { closeModal, openModal } from '../ui/Modal';
import { icon, type IconName } from '../ui/icons';
import type { WorldClient } from './WorldClient';
import type { Inheritance, Place, Skill, WorldAction, WorldClientState, WorldSnapshot } from './types';
import './world.css';
import balance from '../../shared/world-balance.json';

type View = 'journey' | 'journal' | 'world' | 'lessons';
const skillNames: Record<Skill, string> = {
  care: 'Dưỡng cổ', combat: 'Chiến đấu', survival: 'Sinh tồn',
  insight: 'Lĩnh ngộ', refinement: 'Luyện cổ', diplomacy: 'Giao thiệp',
};
const skillIcons: Record<Skill, IconName> = {
  care: 'leaf', combat: 'sword', survival: 'mountain',
  insight: 'sun', refinement: 'flask', diplomacy: 'user',
};
const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);
const color = (value: string): string => /^#[\da-f]{3,8}$/i.test(value) ? value : '#6ee7c8';
const tag = (text: string, className = ''): string => `<span class="wp-tag ${className}">${esc(text)}</span>`;
const empty = (text: string): string => `<p class="wp-empty">${esc(text)}</p>`;
const humanize = (value: string): string => ({
  'hai-kinh': 'Hải Kính', 'hai-kinh-immortal': 'Hải Kính Tiên Cổ',
}[value] ?? value.replace(/[-_]/g, ' '));

/** The shared world's UI. Commands and all game rules remain authoritative on the service. */
export class WorldPanel {
  private state: WorldClientState;
  private unsubscribe: () => void = () => {};
  private view: View = 'journey';
  private regionId = '';
  private selectedPlaceId = '';
  private name = '';
  private endpoint: string;
  private restored = false;
  private destroyed = false;
  private dispatching = false;
  private localError = '';
  private exitWarning = false;
  private accepted = new Set<string>();
  private clockOffset = 0;
  private renderedPhase = '';
  private observedEndpoint = '';
  private timer: ReturnType<typeof setInterval>;
  private readonly card: HTMLElement;

  constructor(private readonly root: HTMLElement, private readonly client: WorldClient) {
    this.state = client.state;
    this.endpoint = client.endpoint;
    root.classList.add('world-modal');
    // Modal.ts keeps this card as the focus-trap boundary. Preserve it through polling.
    root.innerHTML = `<div class="modal-backdrop" data-world-action="close"></div><section class="modal-card wp-panel" role="dialog" aria-modal="true" aria-labelledby="world-title" aria-describedby="world-subtitle" tabindex="-1"></section>`;
    this.card = root.querySelector<HTMLElement>('.wp-panel')!;
    root.addEventListener('click', this.onClick);
    root.addEventListener('submit', this.onSubmit);
    root.addEventListener('input', this.onInput);
    root.addEventListener('change', this.onChange);
    root.ownerDocument.addEventListener('keydown', this.onKeydown, true);
    this.unsubscribe = client.subscribe((state) => {
      const previousLife = this.state.snapshot?.life;
      const previousPlace = previousLife?.placeId;
      if (this.client.endpoint !== this.observedEndpoint) {
        this.endpoint = this.client.endpoint;
        this.observedEndpoint = this.client.endpoint;
      }
      this.state = state;
      if (state.snapshot) {
        this.clockOffset = state.snapshot.serverTime - Date.now();
        if (previousPlace !== state.snapshot.life.placeId || !this.regionId) {
          this.regionId = this.currentPlace(state.snapshot)?.regionId ?? '';
          this.selectedPlaceId = state.snapshot.life.placeId;
        }
        if (previousLife?.id !== state.snapshot.life.id || previousLife?.trial?.inheritanceId !== state.snapshot.life.trial?.inheritanceId) {
          this.accepted.clear();
          this.exitWarning = false;
        }
      }
      if (this.root.classList.contains('active')) this.render();
    });
    this.timer = setInterval(() => this.updateCountdown(), 1000);
  }

  public open(trigger?: HTMLElement): void {
    if (this.destroyed) return;
    this.render();
    openModal(this.root, trigger);
    if (!this.restored) {
      this.restored = true;
      void this.run(() => this.client.restore());
    }
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    clearInterval(this.timer);
    this.unsubscribe();
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('submit', this.onSubmit);
    this.root.removeEventListener('input', this.onInput);
    this.root.removeEventListener('change', this.onChange);
    this.root.ownerDocument.removeEventListener('keydown', this.onKeydown, true);
    closeModal(this.root);
  }

  private currentPlace(snapshot: WorldSnapshot): Place | undefined {
    return snapshot.catalog.places.find((place) => place.id === snapshot.life.placeId);
  }

  private knownPlace(snapshot: WorldSnapshot, placeId: string): boolean {
    return snapshot.life.placeId === placeId || snapshot.life.discovered.includes(placeId)
      || !!this.currentPlace(snapshot)?.neighbors.includes(placeId);
  }

  private placeName(snapshot: WorldSnapshot, placeId: string): string {
    if (!this.knownPlace(snapshot, placeId)) return 'miền đất chưa biết';
    return snapshot.catalog.places.find((place) => place.id === placeId)?.name ?? 'miền đất chưa biết';
  }

  private publicEventText(snapshot: WorldSnapshot, text: string): string {
    return snapshot.catalog.places.filter((place) => !this.knownPlace(snapshot, place.id))
      .sort((first, second) => second.name.length - first.name.length)
      .reduce((result, place) => result.split(place.name).join('miền đất chưa biết'), text);
  }

  private immortalOwner(snapshot: WorldSnapshot, owner: string): string {
    if (owner === snapshot.life.id) return `${snapshot.life.name} · cuộc đời ${snapshot.life.number}`;
    if (owner.startsWith('inheritance:')) return 'Đang chờ người đủ cơ duyên';
    return 'Một người lữ hành trong thế giới';
  }

  private blocked(): boolean {
    return this.state.busy || this.state.pending || this.dispatching || this.state.connection !== 'online';
  }

  private button(text: string, action: string, options: { icon?: IconName; value?: string; detail?: string; className?: string; disabled?: boolean; id?: string } = {}): string {
    return `<button type="button" id="${esc(options.id ?? `wp-action-${action}-${options.value ?? ''}`)}" class="wp-button ${options.className ?? ''}" data-world-action="${action}"${options.value === undefined ? '' : ` data-value="${esc(options.value)}"`}${options.disabled ? ' disabled' : ''}>
      ${options.icon ? icon(options.icon) : ''}<span>${esc(text)}${options.detail ? `<small>${esc(options.detail)}</small>` : ''}</span></button>`;
  }

  private render(): void {
    if (this.destroyed) return;
    const snapshot = this.state.snapshot;
    const phase = snapshot
      ? [snapshot.account.id, snapshot.life.id, snapshot.life.placeId, snapshot.life.dead, snapshot.life.trial?.inheritanceId ?? '', snapshot.life.trial?.stage.id ?? '', this.view].join(':')
      : `welcome:${this.view}`;
    const phaseChanged = phase !== this.renderedPhase;
    this.renderedPhase = phase;
    const doc = this.root.ownerDocument;
    const focused = doc.activeElement as HTMLInputElement | null;
    const focusId = !phaseChanged && focused && this.root.contains(focused) ? focused.id : '';
    const selection = focused?.tagName === 'INPUT' && ['text', 'url'].includes(focused.type)
      ? [focused.selectionStart, focused.selectionEnd] : null;
    const scroll = phaseChanged ? 0 : this.root.querySelector('.wp-scroll')?.scrollTop ?? 0;
    const opened = new Set(phaseChanged ? [] : [...this.root.querySelectorAll<HTMLDetailsElement>('details[id][open]')].map((element) => element.id));
    const connected = this.state.connection === 'online';
    const connectionLabel = { idle: 'Chưa kết nối', connecting: 'Đang kết nối', online: 'Đã kết nối', offline: 'Mất kết nối' }[this.state.connection];
    const status = this.state.pending ? 'Một hành động đang chờ xác nhận. Thử lại để nhận kết quả; không tạo hành động mới.'
      : this.state.busy || this.dispatching ? 'Đang chờ máy chủ xác nhận…'
        : connected ? 'Tiến trình được lưu trên máy chủ.' : 'Kết nối máy chủ để tiếp tục hành trình.';
    this.card.setAttribute('aria-busy', String(this.state.busy || this.dispatching));
    this.card.innerHTML = `<header class="wp-header">
          <div class="wp-brand-mark">${icon('mountain')}</div>
          <div class="wp-heading"><span class="wp-eyebrow">CỔ TIÊN LỘ / THIÊN ĐỊA ĐỒ</span><h2 id="world-title">Giữa năm đại vực</h2><p id="world-subtitle">Ngũ Vực · bản đồ chơi trực tiếp</p></div>
          <button type="button" id="wp-close" class="wp-close" data-world-action="close" aria-label="Về bản đồ" title="Về bản đồ">${icon('close')}</button>
        </header>
        <div class="wp-connection"><span class="wp-connection-dot ${connected ? 'is-online' : ''}" aria-hidden="true"></span><span>${connectionLabel}</span><span class="wp-connection-meta">${snapshot ? `Ngày ${esc(snapshot.world.day)} <span aria-hidden="true">/</span> ${esc(snapshot.world.name)}` : 'Mỗi cuộc đời là một lần lựa chọn'}</span></div>
        <div class="wp-scroll">
          ${this.exitWarning ? `<section class="wp-notice wp-notice-danger" role="alert"><h3>Thử luyện vẫn tiếp diễn</h3><p>Máy chủ tiếp tục đếm thời gian khi đóng màn hình. Rời đi không hủy cam kết và không khôi phục cuộc đời.</p><div class="wp-inline-actions">${this.button('Tiếp tục thử luyện', 'keep-playing', { id: 'wp-keep-playing', className: 'wp-primary' })}${this.button('Về bản đồ', 'confirm-close')}</div></section>` : ''}
          <div class="wp-status" role="status" aria-live="polite" aria-atomic="true">${esc(status)}</div>
          ${this.state.error || this.localError ? `<div class="wp-notice wp-notice-danger" role="alert"><p>${esc(this.state.error || this.localError)}</p>${this.button(this.state.pending ? 'Thử lại hành động đang chờ' : 'Kết nối lại', 'retry', { icon: 'dash', disabled: this.state.busy || this.dispatching })}</div>` : ''}
          ${this.state.pending && !this.state.error ? `<div class="wp-notice">${this.button('Thử lại hành động đang chờ', 'retry', { icon: 'dash', disabled: this.state.busy || this.dispatching })}</div>` : ''}
          ${snapshot ? this.renderConnected(snapshot) : this.renderWelcome()}
          <footer class="wp-footer"><span>${icon('book')} Địa danh, cổ trùng và thử luyện là sáng tác phỏng theo thế giới truyện.</span>${this.button('Về bản đồ', 'close', { icon: 'arrow-right', className: 'wp-text-button' })}</footer>
        </div>`;
    this.root.querySelector<HTMLElement>('.wp-scroll')?.scrollTo({ top: scroll });
    opened.forEach((id) => { const detail = doc.getElementById(id); if (detail && this.root.contains(detail)) detail.setAttribute('open', ''); });
    if (phaseChanged && !this.root.hidden) this.card.focus({ preventScroll: true });
    if (focusId) {
      const replacement = doc.getElementById(focusId);
      if (replacement && this.root.contains(replacement) && !(replacement as HTMLButtonElement).disabled) {
        replacement.focus({ preventScroll: true });
        if (selection && replacement instanceof HTMLInputElement && replacement.type === 'text') {
          replacement.setSelectionRange(selection[0], selection[1]);
        }
      } else if (!this.root.hidden) this.root.querySelector<HTMLElement>('.wp-panel')?.focus({ preventScroll: true });
    }
    this.updateCountdown();
  }

  private renderWelcome(): string {
    return `<div class="wp-welcome-grid"><section class="wp-welcome">
      <div class="wp-compass" aria-hidden="true"><span>N</span>${icon('target')}<span>THIÊN ĐỊA</span></div>
      <span class="wp-eyebrow">MỘT THẾ GIỚI. NHIỀU CUỘC ĐỜI.</span><h3>Để dấu chân mình<br>trên thiên địa đồ.</h3>
      <p>Bước vào bản đồ liền mạch 120.000 × 120.000 đơn vị, tự do đi qua Nam Cương, Bắc Nguyên, Tây Mạc, Đông Hải và Trung Châu. Mỗi cuộc đời có nơi sinh ngẫu nhiên trong cả năm vực.</p>
      <div class="wp-welcome-promises"><span>${icon('mountain')} Di chuyển tự do trong Ngũ Vực</span><span>${icon('book')} Kiến thức nối qua luân hồi</span><span>${icon('gem')} Kỳ vật hữu hạn dùng chung</span></div>
      <p class="wp-small">Bạn điều khiển nhân vật trực tiếp trên bản đồ. Vị trí, tài nguyên, chiến đấu và cuộc đời được máy chủ lưu; nhật ký và truyền thừa thuộc cùng nhân vật đang chơi.</p>
    </section><section class="wp-card wp-session"><span class="wp-eyebrow">BẮT ĐẦU HÀNH TRÌNH</span><h3>Tạo tài khoản khách</h3><p>Trình duyệt lưu chìa khóa truy cập để trở lại đúng tài khoản. Hành trình bắt đầu bằng một cuộc đời riêng.</p>
      <form id="wp-join-form"><label for="wp-name">Đạo hiệu</label><input id="wp-name" name="name" type="text" maxlength="24" minlength="2" required autocomplete="nickname" value="${esc(this.name)}" placeholder="Tên người lữ hành" aria-describedby="wp-name-hint"><small id="wp-name-hint">2–24 ký tự. Tên sẽ xuất hiện trong thế giới chung.</small>
        <details class="wp-server-settings"><summary>Kết nối nâng cao</summary><label for="wp-endpoint">Địa chỉ dịch vụ</label><input id="wp-endpoint" name="endpoint" type="text" inputmode="url" value="${esc(this.endpoint)}" placeholder="Để trống: máy chủ cùng địa chỉ" aria-describedby="wp-endpoint-hint"><small id="wp-endpoint-hint">Mặc định tự kết nối cùng địa chỉ game. Chỉ đổi khi chuyển sang một dịch vụ khác.</small></details>
        <button id="wp-join" class="wp-button wp-primary" type="submit"${this.state.busy || this.dispatching || this.state.pending ? ' disabled' : ''}>${icon('arrow-right')}<span>Tạo tài khoản và nhập thế</span></button>
      </form><p class="wp-small">Đã từng nhập thế? ${this.button('Khôi phục tài khoản đã lưu', 'restore', { disabled: this.state.busy || this.dispatching || this.state.pending, className: 'wp-text-button', id: 'wp-restore' })}</p>
    </section></div>`;
  }

  private renderConnected(snapshot: WorldSnapshot): string {
    const life = snapshot.life;
    const tabs: [View, string, IconName][] = [
      ['journey', 'Hành trình', 'mountain'], ['journal', 'Nhật ký', 'book'],
      ['world', 'Thế gian', 'gem'], ['lessons', 'Bài học', 'sun'],
    ];
    return `<section class="wp-character" aria-label="Nhân vật trong thế giới chung"><div class="wp-avatar">${icon(life.dead ? 'moon' : 'user')}</div><div class="wp-character-name"><span class="wp-eyebrow">CUỘC ĐỜI ${esc(life.number)} ${life.dead ? '· ĐÃ KHÉP LẠI' : '· ĐANG SỐNG'}</span><h3>${esc(life.name)}</h3><p>${esc(snapshot.catalog.origins.find((origin) => origin.id === life.originId)?.name ?? 'Lữ hành')} <span aria-hidden="true">·</span> Cổ sư ${esc(life.rank)} chuyển</p></div><div class="wp-discovery"><strong>${life.discovered.length}<span> / ${snapshot.catalog.places.length}</span></strong><span>địa điểm đã đến</span></div></section>
      <div class="wp-resources" aria-label="Tài nguyên cuộc đời">${this.resource('Sinh lực', life.hp, 'shield', 'wp-health')}${this.resource('Thể lực', life.energy, 'dash', 'wp-energy')}${this.resource('Lương thực', life.supplies, 'bag', '')}${this.resource('Nguyên thạch', life.stones, 'gem', '')}</div>
      <nav class="wp-tabs" aria-label="Mục thế giới chung">${tabs.map(([view, label, name]) => `<button type="button" id="wp-tab-${view}" data-world-action="view" data-value="${view}" aria-current="${this.view === view ? 'page' : 'false'}" class="${this.view === view ? 'is-active' : ''}">${icon(name)}<span>${label}</span></button>`).join('')}</nav>
      <div id="wp-view-${this.view}" class="wp-view">${this.view === 'journey' ? (life.dead ? this.renderRebirth(snapshot) : this.renderJourney(snapshot)) : this.view === 'journal' ? this.renderJournal(snapshot) : this.view === 'world' ? this.renderWorld(snapshot) : this.renderLessons(snapshot)}</div>
      <details id="wp-server-settings" class="wp-server-settings"><summary id="wp-server-summary">Máy chủ & tài khoản khách</summary><p class="wp-small">Tài khoản: ${esc(snapshot.account.name)}. Chìa khóa chỉ lưu trong trình duyệt này. Máy chủ mới có tài khoản và thế giới riêng.</p><form id="wp-server-form"><label for="wp-settings-endpoint">Máy chủ thế giới</label><div class="wp-server-field"><input id="wp-settings-endpoint" name="endpoint" type="text" inputmode="url" value="${esc(this.endpoint)}" placeholder="Để trống: cùng địa chỉ"><button id="wp-server-submit" class="wp-button" type="submit"${this.state.busy || this.dispatching || this.state.pending ? ' disabled' : ''}>Dùng máy chủ này</button></div></form></details>`;
  }

  private resource(label: string, value: number, name: IconName, className: string): string {
    return `<div class="wp-resource ${className}">${icon(name)}<div><span>${label}</span><strong>${esc(value)}</strong></div></div>`;
  }

  private renderJourney(snapshot: WorldSnapshot): string {
    const life = snapshot.life;
    const place = this.currentPlace(snapshot);
    if (!place) return empty('Đang chờ dữ liệu địa điểm từ máy chủ.');
    const region = snapshot.catalog.regions.find((item) => item.id === place.regionId);
    const investigated = life.investigated.includes(place.id);
    return `${life.trial ? this.renderTrial(snapshot) : ''}<div class="wp-journey-grid"><div class="wp-atlas-column">${this.renderMap(snapshot)}${this.renderRoutes(snapshot, place)}</div>
      <div class="wp-territory-column"><section class="wp-card wp-territory" style="--region-color:${color(region?.color ?? '')}"><div class="wp-card-heading"><span class="wp-eyebrow">${esc(region?.name ?? '')} / ĐANG ĐẶT CHÂN</span>${tag(investigated ? 'Đã điều tra' : 'Chưa điều tra', investigated ? 'wp-tag-jade' : '')}</div><h3>${esc(place.name)}</h3><p>${esc(place.summary)}</p>
        <div class="wp-site-resource">${icon('leaf')}<div><span>Tài nguyên bản địa</span><strong>${esc(place.resource)}</strong></div></div>
        ${investigated ? `<div class="wp-clue"><span class="wp-eyebrow">DẤU VẾT ĐÃ TÌM</span><p>${esc(place.secret)}</p><p class="wp-small">${esc(place.returnReason)}</p></div>` : `<p class="wp-small wp-fog-note">${icon('target')} Điều tra để mở manh mối và truyền thừa tại đây.</p>`}
        <div class="wp-local-actions">${this.button(investigated ? 'Đã điều tra' : 'Điều tra', 'investigate', { icon: 'target', detail: 'Miễn phí · tìm manh mối', disabled: this.blocked() || !!life.trial || investigated, id: 'wp-investigate', className: investigated ? '' : 'wp-primary' })}${this.button('Làm việc', 'work', { icon: 'bag', detail: '−10 thể lực · +8 thạch · +3 lương', disabled: this.blocked() || !!life.trial || life.energy < 10, id: 'wp-work' })}${this.button('Nghỉ ngơi', 'rest', { icon: 'moon', detail: 'Miễn phí · hồi đầy sinh lực & thể lực', disabled: this.blocked() || !!life.trial || (life.hp === 100 && life.energy === 100), id: 'wp-rest' })}</div>
        ${this.renderRemains(snapshot)}
      </section>${this.renderCultivation(snapshot)}</div></div>
      ${investigated ? this.renderInheritances(snapshot, place) : `<section class="wp-locked-inheritance">${icon('book')}<div><h3>Truyền thừa còn ẩn trong sương</h3><p>Điều tra ${esc(place.name)} để biết nơi này có để lại cơ duyên nào.</p></div></section>`}`;
  }

  private renderMap(snapshot: WorldSnapshot): string {
    const places = snapshot.catalog.places.filter((place) => place.regionId === this.regionId);
    const region = snapshot.catalog.regions.find((item) => item.id === this.regionId) ?? snapshot.catalog.regions[0];
    const current = this.currentPlace(snapshot);
    const positions = [[100, 43], [300, 62], [500, 43], [100, 182], [300, 163], [500, 182]];
    const lines = places.flatMap((place, index) => place.neighbors.map((id) => places.findIndex((neighbor) => neighbor.id === id))
      .filter((neighbor) => neighbor > index)
      .map((neighbor) => {
        const first = positions[index % positions.length]!;
        const second = positions[neighbor % positions.length]!;
        const known = this.knownPlace(snapshot, place.id) && this.knownPlace(snapshot, places[neighbor]!.id);
        return `<line x1="${first[0]}" y1="${first[1]}" x2="${second[0]}" y2="${second[1]}" class="${known ? 'is-charted' : ''}"/>`;
      })).join('');
    return `<section class="wp-atlas" aria-label="Bản đồ chiến lược năm đại vực" style="--region-color:${color(region?.color ?? '')}"><div class="wp-atlas-top"><div><span class="wp-eyebrow">THIÊN ĐỊA ĐỒ</span><h3>Năm đại vực</h3></div><span class="wp-map-scale">${snapshot.catalog.places.length} địa điểm<br>khám phá theo tuyến</span></div>
      <div class="wp-region-tabs" role="group" aria-label="Chọn đại vực">${snapshot.catalog.regions.map((item) => `<button type="button" id="wp-region-${esc(item.id)}" data-world-action="region" data-value="${esc(item.id)}" aria-pressed="${item.id === this.regionId}" style="--region-color:${color(item.color)}"><span class="wp-region-dot" aria-hidden="true"></span>${esc(item.name)}<small>${snapshot.catalog.places.filter((place) => place.regionId === item.id && snapshot.life.discovered.includes(place.id)).length}/${snapshot.catalog.places.filter((place) => place.regionId === item.id).length}</small></button>`).join('')}</div>
      <div class="wp-map-header"><span>${esc(region?.name)}</span><p>${esc(region?.subtitle)}</p></div>
      <div class="wp-map-field"><div class="wp-map-mountains" aria-hidden="true">${icon('mountain')}${icon('mountain')}${icon('mountain')}</div><svg class="wp-map-paths" viewBox="0 0 600 240" preserveAspectRatio="none" aria-hidden="true" focusable="false">${lines}</svg><div class="wp-map-nodes">${places.map((place, index) => {
        const isCurrent = place.id === snapshot.life.placeId;
        const discovered = snapshot.life.discovered.includes(place.id);
        const neighbor = current?.neighbors.includes(place.id);
        const known = this.knownPlace(snapshot, place.id);
        return `<div class="wp-map-node wp-map-node-${index % 6} ${isCurrent ? 'is-current' : discovered ? 'is-discovered' : neighbor ? 'is-neighbor' : 'is-unknown'}"><span class="wp-node-symbol" aria-hidden="true">${icon(isCurrent ? 'user' : known ? 'mountain' : 'moon')}</span><strong>${known ? esc(place.name) : 'Chưa biết'}</strong><span>${isCurrent ? 'Bạn đang ở đây' : discovered ? 'Đã đặt chân' : neighbor ? 'Có đường tới' : 'Chưa khám phá'}</span></div>`;
      }).join('')}</div><span class="wp-map-north" aria-hidden="true">B<br>↑</span></div>
      <div class="wp-map-legend"><span><i class="wp-key-current"></i>Hiện tại</span><span><i class="wp-key-discovered"></i>Đã đến</span><span><i class="wp-key-unknown"></i>Chưa khám phá</span></div>
    </section>`;
  }

  private renderRoutes(snapshot: WorldSnapshot, place: Place): string {
    if (document.getElementById('game-container')?.getAttribute('data-game-mode') === 'overworld') {
      return `<section class="wp-card"><h3>Đi tới địa danh bằng bước chân</h3><p>Đóng nhật ký để tiếp tục điều khiển nhân vật trên bản đồ Ngũ Vực. Hoạt động tại địa danh chỉ thực hiện được khi đứng gần nơi đó; chọn vùng trong bản đồ chỉ xem thông tin.</p>${this.button('Về bản đồ', 'close', { className: 'wp-primary' })}</section>`;
    }
    const routes = place.neighbors.map((id) => snapshot.catalog.places.find((item) => item.id === id)).filter((item): item is Place => !!item);
    const selected = routes.find((item) => item.id === this.selectedPlaceId) ?? routes[0];
    const blocked = this.blocked() || !!snapshot.life.trial;
    const border = selected?.regionId !== place.regionId;
    const roadStones = 2 + (border ? 3 : 0);
    const roadSupplies = 1 + (border ? 1 : 0);
    const trailStones = border ? 3 : 0;
    const trailSupplies = 2 + (border ? 1 : 0);
    const trailHarm = Math.max(0, 8 - 2 * snapshot.life.skills.survival);
    return `<section class="wp-card wp-routes"><div class="wp-card-heading"><div><span class="wp-eyebrow">BƯỚC TIẾP THEO</span><h3>Đường rời ${esc(place.name)}</h3></div>${icon('arrow-right')}</div><div class="wp-route-list" role="group" aria-label="Chọn nơi đến">${routes.map((destination) => `<button type="button" class="wp-route ${destination.id === selected?.id ? 'is-selected' : ''}" id="wp-route-${esc(destination.id)}" data-world-action="select-route" data-value="${esc(destination.id)}" aria-pressed="${destination.id === selected?.id}"><span>${esc(destination.name)}<small>${esc(snapshot.catalog.regions.find((region) => region.id === destination.regionId)?.name)}${destination.regionId !== place.regionId ? ' · Vượt đại vực' : ''}</small></span>${icon(destination.id === selected?.id ? 'check' : 'chevron-right')}</button>`).join('')}</div>
      ${selected ? `<div class="wp-route-options"><p class="wp-small">Đến <strong>${esc(selected.name)}</strong>${border ? ' qua ranh giới đại vực; giá đã gồm 3 thạch và 1 lương phụ phí' : ''}. Chọn lộ trình trước khi lên đường.</p><div class="wp-inline-actions">${this.button('Theo đường lớn', 'road', { value: selected.id, icon: 'shield', detail: `${roadStones} thạch · ${roadSupplies} lương thực · an toàn`, disabled: blocked || snapshot.life.stones < roadStones || snapshot.life.supplies < roadSupplies, id: 'wp-travel-road' })}${this.button('Men đường mòn', 'trail', { value: selected.id, icon: 'mountain', detail: `${trailStones} thạch · ${trailSupplies} lương thực · mất ${trailHarm} sinh lực`, disabled: blocked || snapshot.life.stones < trailStones || snapshot.life.supplies < trailSupplies, id: 'wp-travel-trail', className: snapshot.life.hp <= trailHarm ? 'wp-danger-button' : '' })}</div>${snapshot.life.hp <= trailHarm ? '<p class="wp-small wp-route-danger">Sinh lực hiện tại không đủ: đường mòn sẽ khiến cuộc đời này kết thúc. Hãy nghỉ ngơi hoặc chọn đường lớn.</p>' : ''}</div>` : empty('Chưa tìm thấy đường rời nơi này.')}</section>`;
  }

  private renderCultivation(snapshot: WorldSnapshot): string {
    const life = snapshot.life;
    const skills = Object.entries(life.skills) as [Skill, number][];
    const localSkill = this.currentPlace(snapshot)!.skill;
    return `<section class="wp-card wp-cultivation"><div class="wp-card-heading"><div><span class="wp-eyebrow">CHUẨN BỊ CHO CƠ DUYÊN</span><h3>Căn cơ & kỹ nghệ</h3></div>${tag(`${esc(life.rank)} chuyển`, 'wp-tag-jade')}</div><div class="wp-rank-progress"><span>Đã lĩnh ngộ <strong>${life.learned.length}</strong> truyền thừa</span><small>Mỗi 2 truyền thừa tăng 1 chuyển · tối đa 6 chuyển</small></div><div class="wp-skills">${skills.map(([skill, value]) => `<div class="wp-skill">${icon(skillIcons[skill])}<div><span>${skillNames[skill]} <strong>${esc(value)}/5</strong></span><div class="wp-skill-track" aria-hidden="true"><i style="width:${Math.min(100, Math.max(0, value * 20))}%"></i></div></div></div>`).join('')}</div><form id="wp-train-form"><label for="wp-train-skill">Kỹ nghệ bản địa có thể rèn</label><div class="wp-train-field"><select id="wp-train-skill" name="skill"><option value="${esc(localSkill)}">${skillNames[localSkill]}</option></select><button id="wp-train" type="submit" class="wp-button"${this.blocked() || life.trial || life.energy < 15 || life.stones < 2 || life.skills[localSkill] >= 5 || life.trained.includes(life.placeId) ? ' disabled' : ''}>${icon('sparkles')}Rèn luyện</button></div><small>${life.trained.includes(life.placeId) ? 'Đã rèn luyện tại đây trong cuộc đời này.' : '15 thể lực · 2 thạch · +1 kỹ nghệ. Mỗi nơi rèn một lần mỗi đời; tối đa 5 điểm.'}</small></form><div class="wp-gu-list"><span class="wp-eyebrow">CỔ TRÙNG TRONG ĐỜI NÀY</span>${life.gu.length ? life.gu.map((gu) => tag(humanize(gu))).join('') : '<p class="wp-small">Chưa sở hữu cổ trùng.</p>'}</div></section>`;
  }

  private renderInheritances(snapshot: WorldSnapshot, place: Place): string {
    const inheritances = snapshot.catalog.inheritances.filter((inheritance) => inheritance.placeId === place.id);
    return `<section class="wp-inheritances"><div class="wp-section-heading"><span class="wp-eyebrow">CƠ DUYÊN SAU MÀN SƯƠNG</span><h3>Truyền thừa tại ${esc(place.name)}</h3><p>Đọc đủ dấu vết, chuẩn bị căn cơ rồi mới đặt cược cuộc đời.</p></div>${inheritances.length ? inheritances.map((inheritance) => this.renderInheritance(snapshot, inheritance)).join('') : empty('Cuộc điều tra chưa tìm thấy truyền thừa ở địa điểm này. Những dấu vết khác vẫn có thể giúp ích về sau.')}</section>`;
  }

  private renderInheritance(snapshot: WorldSnapshot, inheritance: Inheritance): string {
    const record = snapshot.inheritanceStates[inheritance.id];
    const fields: [string, string][] = [
      ['01 · Nguồn gốc', inheritance.origin], ['02 · Manh mối', inheritance.clue],
      ['03 · Điều kiện', inheritance.requirement], ['04 · Cam kết', inheritance.commitment],
      ['05 · Khi thành công', inheritance.success], ['06 · Khi thất bại', inheritance.failure],
      ['07 · Phần thưởng', inheritance.reward], ['08 · Hệ quả với thế gian', inheritance.consequence],
    ];
    const learned = snapshot.life.learned.includes(inheritance.id);
    const reservedElsewhere = !!record?.reservedBy && record.reservedBy !== snapshot.life.id;
    const immortal = inheritance.uniqueGu ? snapshot.immortals.find((item) => item.typeId === inheritance.uniqueGu) : undefined;
    const uniqueUnavailable = !!inheritance.uniqueGu && (!immortal || immortal.status !== 'reserved');
    const disabled = this.blocked() || !!snapshot.life.trial || snapshot.life.rank < inheritance.minRank || snapshot.life.energy < 30 || snapshot.life.supplies < 3 || learned || reservedElsewhere || uniqueUnavailable || !this.accepted.has(inheritance.id);
    return `<details class="wp-inheritance wp-card" id="wp-inheritance-${esc(inheritance.id)}"><summary id="wp-summary-${esc(inheritance.id)}"><span class="wp-inheritance-emblem">${icon(inheritance.uniqueGu ? 'gem' : 'book')}</span><span><span class="wp-eyebrow">${esc(skillNames[inheritance.skill])} · TỪ ${esc(inheritance.minRank)} CHUYỂN</span><strong>${esc(inheritance.name)}</strong></span>${icon('chevron-right')}</summary><div class="wp-inheritance-body"><div class="wp-inheritance-tags">${tag('Sáng tác phỏng theo')}${record ? tag(`Thưởng hữu hạn còn ${record.bonusRemaining}`, record.bonusRemaining ? 'wp-tag-jade' : '') : ''}${inheritance.uniqueGu ? tag('Tiên Cổ độc nhất', 'wp-tag-gold') : ''}${record?.reservedBy ? tag('Có người đang thử luyện') : ''}${learned ? tag('Đã lĩnh ngộ đời này', 'wp-tag-jade') : ''}${uniqueUnavailable ? tag('Cá thể độc nhất không còn sẵn có') : ''}</div><dl class="wp-eight-parts">${fields.map(([label, text]) => `<div><dt>${label}</dt><dd>${esc(text)}</dd></div>`).join('')}</dl><div class="wp-commitment"><h4>${icon('shield')} Cam kết không thể rút lại</h4><p>Thất bại quyết định sẽ khiến nhân vật chết vĩnh viễn. Tải lại trang hoặc đóng màn hình không hủy thử luyện; nhật ký và lịch sử thế giới vẫn tiếp tục.</p><p class="wp-small">Cần chuẩn bị ít nhất 30 thể lực và 3 lương thực. Chi phí mỗi cửa được hiển thị trước khi chọn.</p><label class="wp-death-consent" for="wp-consent-${esc(inheritance.id)}"><input type="checkbox" id="wp-consent-${esc(inheritance.id)}" data-consent="${esc(inheritance.id)}"${this.accepted.has(inheritance.id) ? ' checked' : ''}${this.blocked() || snapshot.life.trial ? ' disabled' : ''}><span>Tôi hiểu và chấp nhận mất vĩnh viễn cuộc đời này nếu thất bại.</span></label>${snapshot.life.rank < inheritance.minRank ? `<p class="wp-small">Cần đạt ${esc(inheritance.minRank)} chuyển trước khi cam kết.</p>` : ''}${this.button('Cam kết bước vào thử luyện', 'commit', { value: inheritance.id, icon: 'arrow-right', disabled, className: 'wp-danger-button', id: `wp-commit-${inheritance.id}` })}</div></div></details>`;
  }

  private renderTrial(snapshot: WorldSnapshot): string {
    const trial = snapshot.life.trial!;
    const inheritance = snapshot.catalog.inheritances.find((item) => item.id === trial.inheritanceId);
    const choices = trial.stage.choices.filter((choice) => choice.id !== 'concede');
    const concede = trial.stage.choices.find((choice) => choice.id === 'concede');
    const affordable = (choice: typeof trial.stage.choices[number]): boolean => snapshot.life.energy >= choice.energyCost
      && snapshot.life.supplies >= choice.supplyCost
      && (choice.requiredSkill === undefined || (!!inheritance && snapshot.life.skills[inheritance.skill] >= choice.requiredSkill));
    const exhausted = choices.length > 0 && !choices.some(affordable);
    return `<section class="wp-trial" aria-labelledby="wp-trial-title">
      <div class="wp-trial-top"><div><span class="wp-eyebrow">ĐÃ CAM KẾT / CỬA ${esc(trial.stageIndex + 1)}</span><h3 id="wp-trial-title">${esc(inheritance?.name ?? 'Thử luyện truyền thừa')}</h3></div><div class="wp-countdown"><span>Thời gian còn lại</span><strong id="wp-deadline" role="timer" aria-live="off">—</strong></div></div>
      <div class="wp-trial-meta">${tag(`Nguy hiểm: ${trial.danger}/3`, 'wp-tag-danger')}${tag(`Dự phòng vắng mặt: ${Math.ceil(trial.pauseRemainingMs / 1000)} giây`)}</div>
      <h4>${esc(trial.stage.title)}</h4><p>${esc(trial.stage.text)}</p>
      <div class="wp-trial-choices">${choices.map((choice) => this.button(choice.label, 'choose', { value: choice.id, icon: choice.requiredSkill === undefined ? 'chevron-right' : 'sparkles', detail: `${choice.hint} · ${choice.energyCost} thể lực · ${choice.supplyCost} lương thực${choice.requiredSkill === undefined ? '' : ` · cần ${choice.requiredSkill} ${inheritance ? skillNames[inheritance.skill] : 'điểm kỹ nghệ'}`}`, disabled: this.blocked() || !affordable(choice), id: `wp-choice-${choice.id}` })).join('')}</div>
      ${exhausted ? '<div class="wp-notice wp-notice-danger" role="alert"><p>Bạn không đủ tài nguyên hoặc kỹ nghệ cho những lựa chọn tiếp tục. Chấp nhận thất bại bên dưới sẽ kết thúc thử luyện và khiến nhân vật chết ngay, không thể hoàn tác.</p></div>' : ''}
      ${concede ? `<div class="wp-trial-concede">${this.button(concede.label, 'choose', { value: concede.id, icon: 'sword', detail: 'Nhân vật chết ngay. Không thể hoàn tác.', disabled: this.blocked(), className: 'wp-danger-button', id: 'wp-choice-concede' })}</div>` : ''}
      <p class="wp-small">Máy chủ quyết định kết quả. Đóng màn hình, chuyển ứng dụng hoặc tải lại trang không kết thúc thử luyện. Khoảng dự phòng khi vắng mặt là hữu hạn.</p></section>`;
  }

  private updateCountdown(): void {
    if (!this.root.classList.contains('active')) return;
    const trial = this.state.snapshot?.life.trial;
    const target = this.root.querySelector<HTMLElement>('#wp-deadline');
    if (!trial || !target) return;
    const seconds = Math.max(0, Math.ceil((trial.deadlineAt - Date.now() - this.clockOffset) / 1000));
    target.textContent = seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Chờ kết quả…';
    target.classList.toggle('is-urgent', seconds <= 30);
  }

  private renderRemains(snapshot: WorldSnapshot): string {
    const remains = snapshot.remains.filter((item) => item.placeId === snapshot.life.placeId);
    if (!remains.length) return '';
    return `<div class="wp-remains"><h4>Di vật còn lại tại đây</h4><p class="wp-small">Túi mang tối đa ${balance.supplyCapacity} lương thực. Phần chưa nhận được tiếp tục ở lại di vật.</p>${remains.map((item) => {
      const full = item.supplies > 0 && item.stones === 0 && !item.gu.length && snapshot.life.supplies >= balance.supplyCapacity;
      return `<div><p>${esc(item.stones)} nguyên thạch · ${esc(item.supplies)} lương thực${item.gu.length ? ` · ${esc(item.gu.map(humanize).join(', '))}` : ''}</p>${this.button(full ? 'Túi lương đã đầy' : 'Thu nhận di vật', 'loot', { value: item.id, icon: 'bag', disabled: this.blocked() || !!snapshot.life.trial || full, id: `wp-loot-${item.id}` })}</div>`;
    }).join('')}</div>`;
  }

  private renderRebirth(snapshot: WorldSnapshot): string {
    if (document.getElementById('game-container')?.getAttribute('data-game-mode') === 'overworld') {
      return '<section class="wp-card"><h3>Khởi đầu lại giữa Ngũ Vực</h3><p>Vị trí đời mới được bốc ngẫu nhiên trong cả năm vực, không chọn hoặc giữ vùng cũ.</p>'+this.button('Tái sinh ngẫu nhiên','rebirth',{value:snapshot.catalog.origins[0].id,id:'wp-rebirth-random',disabled:this.blocked(),className:'wp-primary'})+'</section>';
    }
    return `<section class="wp-death-summary"><span class="wp-eyebrow">CUỘC ĐỜI ${esc(snapshot.life.number)} ĐÃ KHÉP LẠI</span><h3>Một đời dừng lại.<br>Thiên địa vẫn đi tiếp.</h3><p>${esc(snapshot.life.cause ?? 'Cuộc đời này đã kết thúc.')}</p><p class="wp-small">Căn cơ, nguyên thạch và cổ trùng thuộc về cuộc đời đã mất. Nhật ký tài khoản, bài học và lịch sử thế giới vẫn được giữ lại.</p></section><section><div class="wp-section-heading"><span class="wp-eyebrow">CHỌN MỘT KHỞI ĐẦU KHÁC</span><h3>Năm xuất thân, một đời mới</h3><p>Chọn xuất thân để tái sinh trong cùng thế giới.</p></div><div class="wp-origins">${snapshot.catalog.origins.map((origin, index) => `<article class="wp-card wp-origin"><span class="wp-origin-number">0${index + 1}</span>${icon(skillIcons[origin.skill])}<h4>${esc(origin.name)}</h4><p>${esc(origin.description)}</p><span class="wp-small">Sở trường: ${skillNames[origin.skill]}</span>${this.button('Chọn xuất thân này', 'rebirth', { value: origin.id, icon: 'arrow-right', disabled: this.blocked(), id: `wp-rebirth-${origin.id}` })}</article>`).join('')}</div></section>`;
  }

  private renderJournal(snapshot: WorldSnapshot): string {
    return `<div class="wp-section-heading"><span class="wp-eyebrow">TRÍ NHỚ QUA NHỮNG CUỘC ĐỜI</span><h3>Nhật ký của ${esc(snapshot.account.name)}</h3><p>Những điều đã hiểu vẫn theo tài khoản sau mỗi lần luân hồi.</p></div><div class="wp-journal-grid"><section class="wp-card"><h4>Dấu chân & lĩnh ngộ</h4>${snapshot.account.journal.length ? `<ol class="wp-timeline">${[...snapshot.account.journal].reverse().map((entry) => `<li><span class="wp-timeline-day">NGÀY ${esc(entry.day)}</span><h4>${esc(entry.title)}</h4><p>${esc(entry.text)}</p></li>`).join('')}</ol>` : empty('Nhật ký sẽ ghi lại những dấu mốc trong hành trình đầu tiên.')}</section><section class="wp-card"><h4>Những cuộc đời đã qua</h4>${snapshot.account.pastLives.length ? `<ol class="wp-past-lives">${[...snapshot.account.pastLives].reverse().map((life) => `<li><span class="wp-eyebrow">CUỘC ĐỜI ${esc(life.number)} · ${esc(life.rank)} CHUYỂN</span><h4>${esc(snapshot.catalog.origins.find((origin) => origin.id === life.originId)?.name ?? 'Người lữ hành')}</h4><p>${esc(life.cause)}</p><span class="wp-small">Ngày ${esc(life.day)} · ${esc(this.placeName(snapshot, life.placeId))}</span></li>`).join('')}</ol>` : empty('Bạn đang viết cuộc đời đầu tiên.')}</section></div>`;
  }

  private renderWorld(snapshot: WorldSnapshot): string {
    return `<div class="wp-section-heading"><span class="wp-eyebrow">VẬN MỆNH ĐAN VÀO NHAU</span><h3>Thế gian đang chuyển động</h3><p>Chung lịch sử, chung cơ duyên hữu hạn. Mỗi người giữ một hành trình riêng.</p></div><div class="wp-world-grid"><section class="wp-card wp-unique"><span class="wp-eyebrow">DANH BỘ TIÊN CỔ ĐỘC NHẤT</span><h3>${icon('gem')} Hải Kính</h3><p>Một cá thể duy nhất trong thế giới: có thể được giữ, được đặt chỗ trong thử luyện hoặc đã bị hủy.</p>${snapshot.immortals.length ? snapshot.immortals.map((immortal) => `<div class="wp-immortal-record"><h4>${esc(immortal.name)} <span>${esc(immortal.rank)} chuyển</span></h4>${tag({ held: 'Đã có chủ', reserved: 'Đang được giữ chỗ', destroyed: 'Đã bị hủy' }[immortal.status], immortal.status === 'destroyed' ? '' : 'wp-tag-gold')}<p>${immortal.status === 'destroyed' ? 'Cá thể này không còn tồn tại.' : `Người liên quan: ${esc(this.immortalOwner(snapshot, immortal.owner))}`}</p><span class="wp-small">Danh bộ ghi nhận duy nhất một cá thể.</span></div>`).join('') : empty('Danh bộ chưa ghi nhận cá thể nào được hiện thế.')}</section><section class="wp-card"><h4>Người đang hiện diện <span class="wp-count">${snapshot.presence.length}</span></h4>${snapshot.presence.length ? `<ul class="wp-presence">${snapshot.presence.map((person) => `<li>${icon('user')}<span><strong>${esc(person.name)}</strong><small>Đời ${esc(person.lifeNumber)} · ${esc(this.placeName(snapshot, person.placeId))}</small></span></li>`).join('')}</ul>` : empty('Chưa thấy người lữ hành khác hiện diện.')}</section><section class="wp-card wp-history"><h4>Biên niên thế giới</h4>${snapshot.events.length ? `<ol class="wp-timeline">${[...snapshot.events].reverse().map((event) => `<li><span class="wp-timeline-day">NGÀY ${esc(event.day)}</span><p>${esc(this.publicEventText(snapshot, event.text))}</p></li>`).join('')}</ol>` : empty('Những biến cố đầu tiên đang chờ được viết.')}</section></div>`;
  }

  private renderLessons(snapshot: WorldSnapshot): string {
    return `<div class="wp-section-heading"><span class="wp-eyebrow">NGỤ NGÔN & LỰA CHỌN</span><h3>Lĩnh ngộ trước khi dấn bước</h3><p>Bốn tình huống gợi mở cách đọc lòng người và chuẩn bị cho thử luyện. Mỗi bài chỉ lĩnh ngộ một lần trong cuộc đời.</p></div><div class="wp-lessons">${snapshot.catalog.legends.map((legend, index) => {
      const learned = snapshot.life.lessons.includes(legend.id);
      return `<article class="wp-card wp-lesson"><div class="wp-card-heading"><span class="wp-eyebrow">BÀI HỌC 0${index + 1}</span>${learned ? tag('Đã lĩnh ngộ', 'wp-tag-jade') : tag('Chưa lĩnh ngộ')}</div><h3>${esc(legend.title)}</h3><p class="wp-lesson-source">Sáng tác phỏng theo · Nguồn cảm hứng: ${esc(legend.source)}</p><p>${esc(legend.text)}</p><div class="wp-lesson-choices">${legend.choices.map((choice) => `<button class="wp-button" type="button" id="wp-lesson-${esc(legend.id)}-${esc(choice.id)}" data-world-action="lesson" data-legend="${esc(legend.id)}" data-value="${esc(choice.id)}"${this.blocked() || learned || snapshot.life.dead || snapshot.life.trial ? ' disabled' : ''}>${icon('chevron-right')}<span>${esc(choice.label)}<small>${esc(choice.hint)}</small></span></button>`).join('')}</div></article>`;
    }).join('')}</div>`;
  }

  private async run(operation: () => Promise<void>): Promise<void> {
    if (this.dispatching || this.state.busy || this.destroyed) return;
    this.dispatching = true;
    this.localError = '';
    this.render();
    try { await operation(); }
    catch (error) { this.localError = error instanceof Error ? error.message : 'Không thể hoàn thành yêu cầu. Hãy thử kết nối lại.'; }
    finally { this.dispatching = false; this.render(); }
  }

  private requestClose(): void {
    if (this.state.snapshot?.life.trial) {
      this.exitWarning = true;
      this.render();
      this.root.querySelector<HTMLElement>('#wp-keep-playing')?.focus();
    } else closeModal(this.root);
  }

  private onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || this.root.hidden || !this.state.snapshot?.life.trial) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.requestClose();
  };

  private onInput = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    if (input.id === 'wp-name') this.name = input.value;
    if (input.id === 'wp-endpoint' || input.id === 'wp-settings-endpoint') this.endpoint = input.value;
  };

  private onChange = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    if (!input.dataset.consent) return;
    if (input.checked) this.accepted.add(input.dataset.consent);
    else this.accepted.delete(input.dataset.consent);
    this.render();
  };

  private onSubmit = (event: Event): void => {
    const form = event.target as HTMLFormElement;
    if (!['wp-join-form', 'wp-server-form', 'wp-train-form'].includes(form.id)) return;
    event.preventDefault();
    if (this.state.pending || this.state.busy || this.dispatching) return;
    if (form.id === 'wp-train-form') {
      const skill = (form.elements.namedItem('skill') as HTMLSelectElement).value as Skill;
      if (skill in skillNames && !this.blocked() && !this.state.snapshot?.life.dead && !this.state.snapshot?.life.trial) {
        void this.run(() => this.client.act({ type: 'train', payload: { skill } }));
      }
    } else {
      const endpoint = (form.elements.namedItem('endpoint') as HTMLInputElement).value.trim();
      const name = form.id === 'wp-join-form' ? (form.elements.namedItem('name') as HTMLInputElement).value.trim() : '';
      this.endpoint = endpoint;
      this.name = name || this.name;
      void this.run(async () => {
        this.client.setEndpoint(endpoint);
        if (form.id === 'wp-join-form') await this.client.join(name);
        else await this.client.restore();
      });
    }
  };

  private onClick = (event: MouseEvent): void => {
    const target = (event.target as Element).closest<HTMLElement>('[data-world-action]');
    if (!target || !this.root.contains(target) || (target as HTMLButtonElement).disabled) return;
    const action = target.dataset.worldAction;
    const value = target.dataset.value ?? '';
    if (action === 'login') { closeModal(this.root); window.dispatchEvent(new Event('cotienlo:open-auth')); return; }
    if (action === 'close') { this.requestClose(); return; }
    if (action === 'confirm-close') { this.exitWarning = false; closeModal(this.root); return; }
    if (action === 'keep-playing') { this.exitWarning = false; this.render(); return; }
    if (action === 'view' && ['journey', 'journal', 'world', 'lessons'].includes(value)) { this.view = value as View; this.render(); return; }
    if (action === 'region') { this.regionId = value; this.render(); return; }
    if (action === 'select-route') { this.selectedPlaceId = value; this.render(); return; }
    if (action === 'retry') { void this.run(() => this.client.retry()); return; }
    if (action === 'restore') {
      if (this.state.pending) return;
      void this.run(async () => { this.client.setEndpoint(this.endpoint.trim()); await this.client.restore(); });
      return;
    }
    if (this.blocked() || !this.state.snapshot) return;
    const snapshot = this.state.snapshot;
    let command: WorldAction | undefined;
    if (action === 'road' || action === 'trail') command = { type: 'travel', payload: { placeId: value, route: action } };
    else if (action === 'investigate' || action === 'work' || action === 'rest') command = { type: action, payload: {} };
    else if (action === 'commit' && this.accepted.has(value)) command = { type: 'commit', payload: { inheritanceId: value, acceptDeath: true } };
    else if (action === 'choose' && snapshot.life.trial) command = { type: 'choose', payload: { stageId: snapshot.life.trial.stage.id, choiceId: value } };
    else if (action === 'rebirth') command = { type: 'rebirth', payload: { originId: value } };
    else if (action === 'loot') command = { type: 'loot', payload: { remainsId: value } };
    else if (action === 'lesson' && target.dataset.legend) command = { type: 'lesson', payload: { legendId: target.dataset.legend, choiceId: value } };
    if (command) {
      const chosen = command;
      void this.run(() => this.client.act(chosen));
    }
  };
}

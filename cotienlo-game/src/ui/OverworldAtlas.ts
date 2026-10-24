import {
  OVERWORLD_REGIONS, OVERWORLD_HUBS, OVERWORLD_ROADS, worldDimensions, getRegionAt,
  type OverworldRegionId,
} from '../world/Overworld';
import { closeModal, openModal } from './Modal';
import './overworld-atlas.css';

export interface AtlasPosition {
  x: number; y: number; regionId: string; connected: boolean; lifeNumber: number;
}
interface Options {
  getPosition: () => AtlasPosition | null;
  onJourney: () => void;
  onLogin: () => void;
  onRebirth?: () => void;
}

const shapes: Record<OverworldRegionId, { points: string; labelX: number; labelY: number }> = {
  north: { points: '0,0 1000,0 666.667,333.333 333.333,333.333', labelX: 500, labelY: 170 },
  south: { points: '0,1000 333.333,666.667 666.667,666.667 1000,1000', labelX: 500, labelY: 840 },
  west: { points: '0,0 333.333,333.333 333.333,666.667 0,1000', labelX: 165, labelY: 500 },
  east: { points: '1000,0 1000,1000 666.667,666.667 666.667,333.333', labelX: 835, labelY: 500 },
  central: { points: '333.333,333.333 666.667,333.333 666.667,666.667 333.333,666.667', labelX: 500, labelY: 476 },
};
const escape = (value: string): string => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));
const number = (value: number): string => Math.round(value).toLocaleString('vi-VN');
const sx = (value: number): string => (value * 1000 / worldDimensions.width).toFixed(3);
const sy = (value: number): string => (value * 1000 / worldDimensions.height).toFixed(3);
function validPosition(value: AtlasPosition | null): value is AtlasPosition {
  return value !== null && Number.isFinite(value.x) && Number.isFinite(value.y)
    && value.x >= 0 && value.x <= worldDimensions.width && value.y >= 0 && value.y <= worldDimensions.height
    && Number.isSafeInteger(value.lifeNumber) && value.lifeNumber > 0 && typeof value.connected === 'boolean';
}

/** Overview of the same continuous field; selecting a region never moves the character. */
export class OverworldAtlas {
  private events = new AbortController();
  private selected: OverworldRegionId = 'central';
  private disposed = false;
  private card: HTMLElement;

  constructor(private root: HTMLElement, private options: Options) {
    root.id ||= 'modal-overworld-atlas';
    root.classList.add('game-modal'); root.classList.add('overworld-atlas-modal');
    root.hidden = true; root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '<div class="modal-backdrop" data-atlas-action="close"></div><section class="modal-card oa-panel" role="dialog" aria-modal="true" aria-labelledby="oa-title" tabindex="-1"></section>';
    this.card = root.querySelector<HTMLElement>('.modal-card') ?? root;
    const signal = this.events.signal;
    root.addEventListener('click', event => this.onClick(event), { signal });
    root.addEventListener('keydown', event => this.onMapKey(event), { signal });
    this.refresh();
  }

  public open(trigger?: HTMLElement): void {
    if (this.disposed) return;
    const position = this.options.getPosition();
    if (validPosition(position)) this.selected = getRegionAt(position.x, position.y).id;
    this.refresh(); openModal(this.root, trigger);
  }
  public close(): void { closeModal(this.root); }
  public destroy(): void {
    if (this.disposed) return;
    this.disposed = true; this.events.abort(); this.close();
  }

  private select(id: string | null): void {
    if (!OVERWORLD_REGIONS.some(region => region.id === id)) return;
    this.selected = id as OverworldRegionId;
    this.refresh();
  }
  private onClick(event: Event): void {
    if (this.disposed) return;
    const target = event.target as HTMLElement;
    const region = target.closest('[data-atlas-region]')?.getAttribute('data-atlas-region');
    if (region) { this.select(region); return; }
    const action = target.closest('[data-atlas-action]')?.getAttribute('data-atlas-action');
    if (!action || !['close', 'journey', 'login', 'rebirth'].includes(action)) return;
    this.close();
    if (action === 'journey') this.options.onJourney();
    else if (action === 'login') this.options.onLogin();
    else if (action === 'rebirth') this.options.onRebirth?.();
  }
  private onMapKey(event: KeyboardEvent): void {
    if (this.disposed) return;
    const target = (event.target as HTMLElement).closest('[data-atlas-region]');
    if (!target) return;
    const id = target.getAttribute('data-atlas-region');
    const index = OVERWORLD_REGIONS.findIndex(region => region.id === id);
    if (index < 0) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.select(id); return; }
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? OVERWORLD_REGIONS.length - 1
      : (index + step + OVERWORLD_REGIONS.length) % OVERWORLD_REGIONS.length;
    this.select(OVERWORLD_REGIONS[next]!.id);
    this.root.querySelector<HTMLElement>('#oa-region-' + this.selected)?.focus({ preventScroll: true });
  }

  public refresh(): void {
    if (this.disposed) return;
    const rawPosition = this.options.getPosition();
    const position = validPosition(rawPosition) ? rawPosition : null;
    const currentRegion = position ? getRegionAt(position.x, position.y) : null;
    const selected = OVERWORLD_REGIONS.find(region => region.id === this.selected)!;
    const hubs = OVERWORLD_HUBS.filter(hub => hub.regionId === selected.id);
    const focused = this.root.ownerDocument.activeElement as HTMLElement | null;
    const focusId = focused && this.root.contains(focused) ? focused.id : '';
    const oldScroll = this.root.querySelector<HTMLElement>('.oa-body')?.scrollTop ?? 0;
    this.card.innerHTML = `
      <header class="oa-header"><div><p class="oa-eyebrow">Cổ Tiên Lộ / Thiên địa đồ</p><h2 id="oa-title">Ngũ Vực liên thông</h2><p>Một bản đồ · nhiều cuộc đời</p></div>
        <button id="oa-close" class="oa-close" data-atlas-action="close" type="button" aria-label="Đóng bản đồ">×</button></header>
      <div class="oa-body">
        <section class="oa-map-area" aria-label="Tổng quan bản đồ Ngũ Vực">
          <div class="oa-map-caption"><span>${number(worldDimensions.width)} × ${number(worldDimensions.height)} đơn vị</span><span>15 trạm an toàn</span></div>
          <svg class="oa-map" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Chọn đại vực để xem mô tả" aria-describedby="oa-map-help">
            <title>Bản đồ năm đại vực</title>
            ${OVERWORLD_REGIONS.map(region => { const shape = shapes[region.id]; return `<g id="oa-region-${region.id}" class="oa-region${this.selected === region.id ? ' is-selected' : ''}" role="button" tabindex="0" aria-label="${escape(region.name)}" aria-pressed="${this.selected === region.id}" data-atlas-region="${region.id}" style="--region-fill:${region.palette[1]};--region-accent:${region.accent}"><polygon points="${shape.points}"/><text x="${shape.labelX}" y="${shape.labelY}" text-anchor="middle">${escape(region.name)}</text></g>`; }).join('')}
            <g class="oa-roads" aria-hidden="true">${OVERWORLD_ROADS.map(road => `<line x1="${sx(road.from.x)}" y1="${sy(road.from.y)}" x2="${sx(road.to.x)}" y2="${sy(road.to.y)}"/>`).join('')}</g>
            ${OVERWORLD_HUBS.map(hub => `<g class="oa-hub" transform="translate(${sx(hub.x)} ${sy(hub.y)})"><title>${escape(hub.name)}</title><circle r="5"/></g>`).join('')}
            ${position ? `<g class="oa-player" transform="translate(${sx(position.x)} ${sy(position.y)})" aria-label="Vị trí nhân vật"><title>Vị trí nhân vật</title><circle class="oa-player-ring" r="18"/><circle r="8"/></g>` : ''}
          </svg>
          <p class="oa-map-key"><span class="oa-key-player"></span>Nhân vật <span class="oa-key-hub"></span>Trạm an toàn <span class="oa-key-road"></span>Đường nối</p>
          <p id="oa-map-help" class="oa-map-help">Chọn vùng để đọc. Tab và phím mũi tên để xem các vực. Bản đồ tổng quan không dịch chuyển nhân vật.</p>
        </section>
        <aside class="oa-details">
          <div class="oa-position" role="status" aria-live="polite"><span class="oa-status-dot${position?.connected ? ' is-online' : ''}"></span>
            <div><strong>${position ? position.connected ? 'Vị trí hiện tại' : 'Vị trí gần nhất · mất kết nối' : 'Chưa nhập thế'}</strong>
            <p>${position && currentRegion ? `${escape(currentRegion.name)} · Đời ${position.lifeNumber}<br><span class="oa-coordinates">${number(position.x)}, ${number(position.y)}</span>` : 'Đăng nhập hoặc tạo nhân vật để bắt đầu cuộc đời.'}</p></div></div>
          <section class="oa-region-detail" aria-labelledby="oa-detail-title"><p class="oa-eyebrow">Đang xem đại vực</p><h3 id="oa-detail-title">${escape(selected.name)}</h3><p>${escape(selected.subtitle)}</p>
            <h4>Trạm dừng chân</h4><ul>${hubs.map(hub => `<li>${escape(hub.name)}</li>`).join('')}</ul></section>
          <div class="oa-exploration"><strong>Không khóa ở quê quán</strong><p>Đi dọc các đường nối để qua ranh giới và khám phá cả năm vực. Mỗi cuộc đời mới được bốc nơi sinh ngẫu nhiên trong Ngũ Vực.</p></div>
        </aside>
      </div>
      <footer class="oa-footer"><p>Địa lý game phỏng theo thế giới truyện.</p><div>
        <button id="oa-journey" type="button" data-atlas-action="journey">Nhật ký &amp; truyền thừa</button>
        <button id="oa-login" type="button" data-atlas-action="login">Tài khoản Gmail</button>
        ${this.options.onRebirth ? '<button id="oa-rebirth" type="button" data-atlas-action="rebirth">Sinh Tử Môn</button>' : ''}
        <button id="oa-return" class="oa-primary" type="button" data-atlas-action="close">Về bản đồ đang chơi</button>
      </div></footer>`;
    const body = this.root.querySelector<HTMLElement>('.oa-body'); if (body) body.scrollTop = oldScroll;
    if (focusId) this.root.querySelector<HTMLElement>('#' + focusId)?.focus({ preventScroll: true });
  }
}

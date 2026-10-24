import type { FieldSnapshot } from '../world/field-types';
import type { OverworldFacility, OverworldFacilityRole } from '../world/Overworld';
import type { WorldAction } from '../world/types';
import { GU_DEFINITIONS, CULTIVATION_BALANCE, type GuTypeId } from '../../shared/cultivation-core.mjs';
import { closeModal, openModal } from './Modal';
import { guIcon } from './icons';
import './academy.css';

const escape = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const allowed: Record<OverworldFacilityRole, readonly string[]> = {
  academy: ['claim-gu', 'tame-gu', 'cultivate', 'stop-cultivating', 'breakthrough'],
  'gu-warehouse': ['claim-gu', 'buy-gu'], 'refining-hall': ['tame-gu'],
  training: ['cultivate', 'stop-cultivating', 'breakthrough', 'ascend-shatter', 'ascend-absorb', 'ascend-release', 'resolve-tribulation'],
  clinic: ['rest'], inn: ['rest'],
};
interface Options {
  snapshot: () => FieldSnapshot | null;
  act: (action: WorldAction) => Promise<void>;
  error: () => string | null;
}

/** The service owns inventory, cultivation clocks, location checks and results. */
export class AcademyModal {
  private events = new AbortController();
  private facility: OverworldFacility | undefined;
  private busy = false;
  private message = '';
  private signature = '';
  constructor(private root: HTMLElement, private options: Options) {
    root.innerHTML = '<div class="modal-backdrop"></div><section class="modal-card academy-panel" role="dialog" aria-modal="true" aria-labelledby="academy-title" tabindex="-1"><header class="modal-header"><div class="modal-heading"><p class="eyebrow" id="academy-npc"></p><h2 id="academy-title">Học đường</h2></div><button type="button" class="btn-close" data-academy-close aria-label="Đóng học đường">×</button></header><div class="modal-body academy-body"><p class="academy-message" role="status" aria-live="polite"></p><div class="academy-content"></div></div></section>';
    root.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-academy-close], .modal-backdrop')) { closeModal(root); return; }
      const button = target.closest<HTMLButtonElement>('[data-academy-option]');
      if (button) void this.execute(button.dataset.academyOption!, button.dataset.gu);
    }, { signal: this.events.signal });
  }
  open(facility: OverworldFacility, trigger?: HTMLElement): void {
    this.facility = facility; this.message = ''; this.signature = '';
    openModal(this.root, trigger); this.update();
  }
  update(): void {
    if (!this.root.classList.contains('active') || !this.facility) return;
    const snapshot = this.options.snapshot();
    if (!snapshot || snapshot.dead) { closeModal(this.root); return; }
    const model = snapshot.cultivation;
    const stats = snapshot.cultivationStats;
    const signature = JSON.stringify([this.facility.id, model?.rank, model?.subrealm, model?.firstGuClaimed,
      model?.guInstances, model?.activity?.kind, model?.ascension?.stage, snapshot.stones, this.busy]);
    const status = this.root.querySelector<HTMLElement>('.academy-message')!;
    status.textContent = this.message || (this.busy ? 'Đang xác nhận…' : '');
    this.updateProgress(snapshot);
    if (signature === this.signature) return;
    this.signature = signature;
    this.root.querySelector('#academy-title')!.textContent = this.facility.name;
    this.root.querySelector('#academy-npc')!.textContent = `${this.facility.npc.name} · ${this.facility.npc.role}`;
    const options = allowed[this.facility.role];
    const button = (option: string, label: string, guId?: string) => `<button type="button" class="academy-action" data-academy-option="${option}" ${guId ? `data-gu="${escape(guId)}"` : ''} ${this.busy ? 'disabled' : ''}>${escape(label)}</button>`;
    const actions: string[] = [];
    if (options.includes('claim-gu') || options.includes('buy-gu')) {
      for (const [id, gu] of Object.entries(GU_DEFINITIONS)) {
        if (gu.rank !== 1 || snapshot.guIds.includes(id)) continue;
        const option = !model?.firstGuClaimed && options.includes('claim-gu') ? 'claim-gu' : 'buy-gu';
        if (!options.includes(option)) continue;
        actions.push(`<article class="academy-gu"><span aria-hidden="true">${guIcon(id, 36)}</span><div><h3>${escape(gu.name)}</h3><p>Chưa luyện hóa · ${option === 'claim-gu' ? 'Suất đầu đời miễn phí' : `${gu.purchaseStones} nguyên thạch`}</p>${button(option, option === 'claim-gu' ? 'Nhận Cổ đầu đời' : 'Mua Cổ', id)}</div></article>`);
      }
    }
    if (options.includes('tame-gu')) for (const id of snapshot.guIds) {
      if (model?.guInstances.some(gu => gu.typeId === id && gu.controlled && gu.alive && (gu.holderLifeId ?? gu.ownerLifeId) === model.lifeId)) continue;
      const gu = GU_DEFINITIONS[id as GuTypeId];
      if (gu) actions.push(button('tame-gu', `Luyện hóa ${gu.name} · ${CULTIVATION_BALANCE.tamingStones} thạch · ${CULTIVATION_BALANCE.tamingMs / 1000}s`, id));
    }
    if (options.includes('cultivate')) {
      actions.push(button('cultivate', 'Tĩnh tọa tu luyện'));
      actions.push(button('stop-cultivating', 'Dừng tu luyện'));
      actions.push(button('breakthrough', 'Thử đột phá'));
    }
    if (options.includes('ascend-shatter') && (model?.rank ?? 0) >= 5) {
      actions.push('<p>Thăng tiên có thể tử vong. Cần chuẩn bị nhân khí và cân bằng thiên–địa khí; phá khiếu không thể hoàn tác.</p>');
      if (model?.rank === 5 && !model.ascension) actions.push(button('ascend-shatter', 'Bắt đầu thăng tiên · phá khiếu (nguy hiểm)'));
      if (model?.ascension?.stage === 'shattered') {
        actions.push('<label>Thiên khí <input name="heavenQi" type="number" min="0" max="100" value="50"></label><label>Địa khí <input name="earthQi" type="number" min="0" max="100" value="50"></label>');
        actions.push(button('ascend-absorb', 'Tiếp nhận thiên–địa khí'));
      }
      if (model?.ascension?.stage === 'balanced') actions.push(button('ascend-release', 'Thả bản mệnh Cổ, kết tiên khiếu'));
      if ((model?.rank ?? 0) >= 6) actions.push(button('resolve-tribulation', 'Ứng kiếp trong tiên khiếu'));
    }
    if (options.includes('rest')) actions.push(button('rest', this.facility.role === 'clinic' ? 'Dưỡng thương · 2 nguyên thạch' : 'Nghỉ ngơi miễn phí'));
    const controlled = model?.guInstances.filter(gu => gu.alive && gu.controlled && (gu.holderLifeId ?? gu.ownerLifeId) === model.lifeId).length ?? 0;
    this.root.querySelector('.academy-content')!.innerHTML = `<div class="academy-summary"><strong>${escape(stats ? `${stats.rankLabel} ${stats.subrealmLabel ?? ''}` : 'Người học mới khai khiếu')}</strong><span>${snapshot.stones} nguyên thạch · ${snapshot.guIds.length} Cổ sở hữu · ${controlled} đã luyện hóa · ${snapshot.usableGuIds?.length ?? 0} dùng được</span><span class="academy-resource"></span></div><p>Mỗi đời bắt đầu không có Cổ. Nhận một Cổ, luyện hóa để điều khiển, rồi rèn khiếu huyệt. Sở hữu Cổ chưa đủ để sử dụng chiêu.</p><p class="academy-progress"></p><div class="academy-actions">${actions.join('') || '<p>Đến học đường hoặc kho Cổ để bắt đầu.</p>'}</div><details><summary>Các cơ sở trong khu dân cư</summary><ul>${(snapshot.facilities ?? []).map(f => `<li>${escape(f.name)} · (${Math.round(f.x)}, ${Math.round(f.y)})</li>`).join('')}</ul></details>`;
    this.updateProgress(snapshot);
  }
  private updateProgress(snapshot: FieldSnapshot): void {
    const progress = this.root.querySelector<HTMLElement>('.academy-progress');
    if (progress && snapshot.cultivation) progress.textContent = describeCultivation(snapshot);
    const resource = this.root.querySelector<HTMLElement>('.academy-resource');
    const energy = snapshot.cultivationStats?.energy;
    if (resource && energy) resource.textContent = energy.unit === 'whole-aperture-bps'
      ? `${energy.label}: ${(energy.current / 100).toFixed(1)} / ${energy.capacity / 100}% toàn khiếu · ${energy.quality} phẩm chất`
      : `${energy.label}: ${energy.current} viên`;
  }
  private async execute(option: string, guId?: string): Promise<void> {
    if (this.busy || !this.facility) return;
    const payload = { facilityId: this.facility.id, option, ...(guId ? { guId } : {}),
      ...(option === 'ascend-absorb' ? {
        heavenQi: Number(this.root.querySelector<HTMLInputElement>('[name="heavenQi"]')?.value ?? 50),
        earthQi: Number(this.root.querySelector<HTMLInputElement>('[name="earthQi"]')?.value ?? 50),
      } : {}),
    };
    this.busy = true; this.message = ''; this.update();
    try {
      await this.options.act({ type: 'academy', payload });
      this.message = this.options.error() ?? 'Đã ghi nhận. Thời gian luyện hóa và tu luyện do máy chủ tính.';
    } catch (error) { this.message = error instanceof Error ? error.message : 'Chưa thực hiện được.'; }
    finally { this.busy = false; this.signature = ''; this.update(); }
  }
  destroy(): void { this.events.abort(); closeModal(this.root); }
}

function describeCultivation(snapshot: FieldSnapshot): string {
  const state = snapshot.cultivation!;
  const activity = state.activity;
  if (activity?.kind === 'taming') return `Đang luyện hóa · còn ${Math.max(0, Math.ceil((activity.completeAt - snapshot.serverTime) / 1000))} giây. Có thể đóng cửa sổ.`;
  if (state.mortal) return `${activity?.kind === 'cultivating' ? 'Đang tĩnh tọa' : 'Khiếu huyệt'} · tiến độ rèn vách ${(state.mortal.wallProgress / 100).toFixed(1)}%. Luyện hóa cần ${CULTIVATION_BALANCE.tamingCostBps / 100}% toàn khiếu.`;
  if (state.immortal) return `Tiên khiếu: ${state.immortal.apertureKind === 'blessed-land' ? 'Phúc địa' : 'Động thiên'} · ${state.immortal.passedTribulations} kiếp đã qua${state.immortal.pendingTribulation ? ' · đang đến kỳ ứng kiếp' : ''}.`;
  return `Tu vi: chuyển ${state.rank}.`;
}

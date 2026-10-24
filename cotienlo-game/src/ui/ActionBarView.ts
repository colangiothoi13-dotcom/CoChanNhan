import type { Cultivator } from '../entities/Cultivator';
import type { InventorySystem } from '../systems/InventorySystem';
import { ActionSettings, formatKeyCode, type ActiveSkill, type GameAction } from '../systems/ActionSettings';
import type { GuSystem } from '../systems/GuSystem';
import { guIcon } from './icons';

export const SKILL_BUTTON_IDS = ['btn-gu-moonlight', 'btn-gu-bronze', 'btn-gu-boar', 'btn-gu-heal'] as const;
const timers: Record<ActiveSkill, keyof Cultivator> = { moonlight: 'cdMoonlight', moonblade: 'cdMoonlight', moonbeam: 'cdMoonbeam', bronze: 'cdBronze', boar: 'cdBoar', heal: 'cdHeal' };

/** Slots refer to Gu identities, so duplicate placements share one cooldown. */
export class ActionBarView {
  private displayed = new Map<number, string>();
  constructor(private settings: ActionSettings, private gu: GuSystem) {}
  update(player: Cultivator, inventory: InventorySystem): void {
    const attackHint = document.querySelector<HTMLElement>('#btn-attack .keyboard-hint');
    if (attackHint) attackHint.textContent = `${formatKeyCode(this.settings.getBinding('attack'))} · Đánh thường`;
    const dash = document.getElementById('btn-dash');
    if (dash) dash.setAttribute('title', `${formatKeyCode(this.settings.getBinding('dash'))}: lướt theo hướng chạy`);
    SKILL_BUTTON_IDS.forEach((id, index) => {
      const button = document.getElementById(id) as HTMLButtonElement | null;
      if (!button) return;
      const configured = this.settings.getSlots()[index];
      const skill = this.settings.resolveSlot(index, inventory.usableGuIds ?? inventory.ownedGuIds);
      const definition = this.gu.getGu(skill ?? configured ?? '');
      const key = formatKeyCode(this.settings.getBinding(`slot${index + 1}` as GameAction));
      const guName = definition?.name.replace(/ Cổ.*$/, '').replace(/ \[.*$/, '') ?? 'Ô trống';
      const label = skill ? guName : configured && inventory.hasGu(configured)
        ? definition && definition.tier > player.primevalLevel ? `Cần ${definition.tier} chuyển` : 'Chưa thể dùng' : 'Chưa có Cổ';
      const signature = `${skill}:${configured}:${key}:${definition?.mpCost}:${inventory.energyUnitLabel}:${configured && inventory.hasGu(configured)}`;
      if (this.displayed.get(index) !== signature) {
        const name = button.querySelector<HTMLElement>('.btn-sub');
        const badge = button.querySelector<HTMLElement>('.skill-key-badge');
        const image = button.querySelector<HTMLElement>('.btn-icon');
        const cost = button.querySelector<HTMLElement>('.gu-cost');
        if (name) name.textContent = label;
        if (badge) badge.textContent = key;
        if (image) image.innerHTML = definition ? guIcon(definition.id, 28) : '';
        if (cost) cost.textContent = definition ? `${definition.mpCost} ${inventory.energyUnitLabel}` : 'Lắp trong Cài đặt';
        button.setAttribute('title', `${key}: ${label}. Kéo rồi thả để ngắm trên cảm ứng.`);
        button.setAttribute('aria-label', `Ô ${index + 1}, ${key}, ${label}${skill ? '' : ', chưa đủ điều kiện dùng'}`);
        this.displayed.set(index, signature);
      }
      button.disabled = !skill; button.setAttribute('aria-disabled', String(!skill));
      const overlay = button.querySelector<HTMLElement>('.cd-overlay');
      if (overlay) {
        const cooldown = skill ? Number(player[timers[skill]]) : 0;
        overlay.style.display = cooldown > 0 ? 'block' : 'none';
        if (cooldown > 0) overlay.style.background = `conic-gradient(rgba(0,0,0,.75) ${Math.min(1, cooldown / (definition?.cooldown ?? 1)) * 360}deg, transparent 0deg)`;
      }
    });
  }
}

import { Cultivator } from '../entities/Cultivator';
import { InventorySystem } from '../systems/InventorySystem';
import { GameMap } from '../engine/Map';
import { QuestSystem } from '../systems/QuestSystem';
import { GuSystem } from '../systems/GuSystem';
import { guIcon, icon } from './icons';

export class HudView {
  private hpFill: HTMLElement | null = null;
  private hpText: HTMLElement | null = null;
  private mpFill: HTMLElement | null = null;
  private mpText: HTMLElement | null = null;
  private staminaFill: HTMLElement | null = null;
  private staminaText: HTMLElement | null = null;
  private currencyCount: HTMLElement | null = null;
  private timeIcon: HTMLElement | null = null;
  private zoneName: HTMLElement | null = null;
  private moonlightName: HTMLElement | null = null;
  private moonlightCost: HTMLElement | null = null;
  private moonlightButton: HTMLElement | null = null;
  private moonlightIcon: HTMLElement | null = null;
  private hudRealm: HTMLElement | null = null;
  private avatarRank: HTMLElement | null = null;
  private questHeading: HTMLElement | null = null;
  private questChapter: HTMLElement | null = null;
  private questText: HTMLElement | null = null;
  private questFill: HTMLElement | null = null;
  private questReward: HTMLElement | null = null;
  private questAction: HTMLElement | null = null;

  private displayedTimeIcon = '';
  private displayedMoonlightGu = '';
  private displayedRealm = '';

  // Cooldown elements
  private cdDash: HTMLElement | null = null;
  private cdMoonlight: HTMLElement | null = null;
  private cdBronze: HTMLElement | null = null;
  private cdBoar: HTMLElement | null = null;
  private cdHeal: HTMLElement | null = null;

  constructor(private guSystem: GuSystem = new GuSystem(), private customSlots = false) {
    this.hpFill = document.getElementById('hud-hp-fill');
    this.hpText = document.getElementById('hud-hp-text');
    this.mpFill = document.getElementById('hud-mp-fill');
    this.mpText = document.getElementById('hud-mp-text');
    this.staminaFill = document.getElementById('hud-stamina-fill');
    this.staminaText = document.getElementById('hud-stamina-text');
    this.currencyCount = document.getElementById('currency-count');
    this.timeIcon = document.getElementById('time-icon');
    this.zoneName = document.getElementById('zone-name');
    this.moonlightName = document.getElementById('skill-moonlight-name');
    this.moonlightCost = document.getElementById('skill-moonlight-cost');
    this.moonlightButton = document.getElementById('btn-gu-moonlight');
    this.moonlightIcon = this.moonlightButton?.querySelector('.btn-icon') ?? null;
    this.hudRealm = document.getElementById('hud-realm');
    this.avatarRank = document.querySelector('.avatar-rank');

    this.questHeading = document.getElementById('quest-heading');
    this.questChapter = document.querySelector('.quest-chapter');
    this.questText = document.getElementById('quest-text');
    this.questFill = document.getElementById('quest-progress-fill');
    this.questReward = document.querySelector('.quest-reward');
    this.questAction = document.getElementById('quest-banner-action');

    this.cdDash = document.getElementById('cd-dash');
    this.cdMoonlight = document.getElementById('cd-moonlight');
    this.cdBronze = document.getElementById('cd-bronze');
    this.cdBoar = document.getElementById('cd-boar');
    this.cdHeal = document.getElementById('cd-heal');
  }

  public update(cultivator: Cultivator, inventory: InventorySystem, map: GameMap, quest?: QuestSystem) {
    // 1. Status bars
    const hpRatio = Math.max(0, Math.min(1, cultivator.hp / Math.max(1, cultivator.maxHp)));
    const mpRatio = Math.max(0, Math.min(1, cultivator.mp / Math.max(1, cultivator.maxMp)));
    const staminaRatio = Math.max(0, Math.min(1, cultivator.stamina / Math.max(1, cultivator.maxStamina)));

    if (this.hpFill) this.hpFill.style.width = `${hpRatio * 100}%`;
    if (this.hpText) this.hpText.textContent = `${Math.ceil(cultivator.hp)}/${cultivator.maxHp}`;

    if (this.mpFill) this.mpFill.style.width = `${mpRatio * 100}%`;
    if (this.mpText) this.mpText.textContent = `${Math.ceil(cultivator.mp)}/${cultivator.maxMp}`;

    if (this.staminaFill) this.staminaFill.style.width = `${staminaRatio * 100}%`;
    if (this.staminaText) this.staminaText.textContent = `${Math.ceil(cultivator.stamina)}/${cultivator.maxStamina}`;

    // Realm display & Avatar Rank
    const realmLabel = cultivator.displayRealm ?? cultivator.realm;
    if (this.hudRealm && this.displayedRealm !== realmLabel) {
      this.hudRealm.textContent = realmLabel;
      this.displayedRealm = realmLabel;
      if (this.avatarRank) {
        this.avatarRank.textContent = cultivator.primevalLevel >= 2 ? 'II' : 'I';
      }
    }

    // Quest banner update
    if (quest) {
      const cur = quest.currentChapter;
      if (this.questHeading) this.questHeading.textContent = cur.title;
      if (this.questChapter) this.questChapter.textContent = cur.code;
      if (this.questText) this.questText.textContent = cur.progressText;
      if (this.questFill) this.questFill.style.width = `${quest.progress}%`;
      if (this.questReward) {
        this.questReward.innerHTML = `<span data-icon="gem" aria-hidden="true">${icon('gem')}</span>${cur.rewardText}`;
      }
      if (this.questAction) {
        if (cur.isComplete && !cur.rewardClaimed) {
          this.questAction.innerHTML = `<button type="button" class="btn-quest-banner" id="btn-claim-banner">${quest.chapter === 4 ? 'Đột phá · Phí 50 · Thưởng 80' : 'Nhận thưởng &amp; Đột phá'} →</button>`;
        } else if (cur.rewardClaimed) {
          const nextNum = quest.chapter + 1;
          this.questAction.innerHTML = `<button type="button" class="btn-quest-banner" id="btn-next-banner">Tiếp nhận Chương ${nextNum < 5 ? '0' + nextNum : nextNum} →</button>`;
        } else {
          this.questAction.innerHTML = '';
        }
      }
    }

    // 2. Currency
    if (this.currencyCount) {
      this.currencyCount.textContent = `${inventory.primevalStones}`;
    }

    // 3. Time of day & zone
    const timeInfo = map.getTimeOfDayName();
    const timeIconName = map.dayTime < 0.2 || map.dayTime >= 0.85 ? 'moon' : 'sun';
    if (this.timeIcon && this.displayedTimeIcon !== timeIconName) {
      this.timeIcon.innerHTML = icon(timeIconName);
      this.displayedTimeIcon = timeIconName;
    }
    if (this.zoneName) this.zoneName.textContent = timeInfo.name.replace(/^[^•]*•\s*/, '');

    if (this.customSlots) {
      this.updateCooldownOverlay(this.cdDash, cultivator.cdDash, cultivator.MAX_CD_DASH);
      return;
    }
    const upgraded = inventory.hasGu('moonblade');
    const activeGuId = upgraded ? 'moonblade' : 'moonlight';
    const activeGu = this.guSystem.getGu(activeGuId);
    if (this.moonlightName) this.moonlightName.textContent = upgraded ? 'Nguyệt Nhận' : 'Nguyệt Quang';
    if (this.moonlightCost) this.moonlightCost.textContent = `${activeGu?.mpCost ?? 0} CN`;
    if (this.moonlightIcon && this.displayedMoonlightGu !== activeGuId) {
      this.moonlightIcon.innerHTML = guIcon(activeGuId, 28);
      this.displayedMoonlightGu = activeGuId;
    }

    for (const [buttonId, guId] of [
      ['btn-gu-moonlight', activeGuId], ['btn-gu-bronze', 'bronze'],
      ['btn-gu-boar', 'boar'], ['btn-gu-heal', 'heal'],
    ]) {
      const button = document.getElementById(buttonId) as HTMLButtonElement | null;
      const gu = this.guSystem.getGu(guId);
      if (!button || !gu) continue;
      const owned = this.guSystem.canUseGu(guId, inventory);
      button.disabled = !owned;
      button.setAttribute('aria-disabled', String(!owned));
      button.setAttribute('aria-label', `${gu.name}, ${gu.mpCost} chân nguyên${owned ? '' : ', chưa sở hữu'}`);
      const cost = button.querySelector('.gu-cost');
      if (cost) cost.textContent = `${gu.mpCost} CN`;
    }

    // 4. Cooldown overlays
    this.updateCooldownOverlay(this.cdDash, cultivator.cdDash, cultivator.MAX_CD_DASH);
    this.updateCooldownOverlay(this.cdMoonlight, cultivator.cdMoonlight, cultivator.moonlightCooldownDuration);
    this.updateCooldownOverlay(this.cdBronze, cultivator.cdBronze, cultivator.bronzeCooldownDuration);
    this.updateCooldownOverlay(this.cdBoar, cultivator.cdBoar, cultivator.boarCooldownDuration);
    this.updateCooldownOverlay(this.cdHeal, cultivator.cdHeal, cultivator.healCooldownDuration);
  }

  private updateCooldownOverlay(el: HTMLElement | null, currentCd: number, maxCd: number) {
    if (!el) return;
    if (currentCd > 0) {
      const ratio = currentCd / maxCd;
      el.style.display = 'block';
      el.style.background = `conic-gradient(rgba(0, 0, 0, 0.75) ${ratio * 360}deg, transparent 0deg)`;
    } else {
      el.style.display = 'none';
    }
  }
}

import { closeModal, openModal } from './Modal';
import type { PastLifeRecord } from '../systems/SoulChronicle';

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

export class RebirthModal {
  private modal: HTMLElement | null = null;
  private lifeTitle: HTMLElement | null = null;
  private deathStats: HTMLElement | null = null;
  private btnRebirth: HTMLElement | null = null;
  private selectedOrigin = 'clan';
  private onRebirthCallback: ((origin: string) => void) | null = null;
  private events = new AbortController();

  constructor() {
    this.modal = document.getElementById('modal-rebirth');
    this.lifeTitle = document.getElementById('rebirth-life-title');
    this.deathStats = document.getElementById('rebirth-death-stats');
    this.btnRebirth = document.getElementById('btn-execute-rebirth');

    this.bindEvents();
  }

  private bindEvents(): void {
    this.btnRebirth?.addEventListener('click', () => {
      if (!this.modal?.classList.contains('active') || !this.onRebirthCallback) return;
      const callback = this.onRebirthCallback;
      this.onRebirthCallback = null;
      this.close();
      callback(this.selectedOrigin);
    }, { signal: this.events.signal });

    const originOptions = this.modal?.querySelectorAll('.origin-option-btn');
    originOptions?.forEach((btn) => {
      btn.addEventListener('click', () => {
        originOptions.forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedOrigin = btn.getAttribute('data-origin') || 'clan';
      }, { signal: this.events.signal });
    });
  }

  public show(
    record: PastLifeRecord,
    stonesPreserved: number,
    onRebirth: (origin: string) => void,
  ): void {
    this.onRebirthCallback = onRebirth;
    this.selectedOrigin = 'clan';
    this.modal?.querySelectorAll('.origin-option-btn').forEach(button => {
      if (button.getAttribute('data-origin') === 'clan') button.classList.add('selected');
      else button.classList.remove('selected');
    });

    if (this.lifeTitle) {
      this.lifeTitle.textContent = `Hồn Quy Sinh Tử Môn · Kiếp Thứ ${record.lifeNumber + 1}`;
    }

    if (this.deathStats) {
      this.deathStats.innerHTML = `
        <div class="rebirth-stat-item"><span>Nguyên nhân tạ thế:</span><strong>${escapeHtml(record.causeOfDeath)}</strong></div>
        <div class="rebirth-stat-item"><span>Cảnh giới đạt đến:</span><strong class="text-gold">${escapeHtml(record.realmReached)}</strong></div>
        <div class="rebirth-stat-item"><span>Dị thú trảm sát:</span><strong>${record.monstersSlain}</strong></div>
        <div class="rebirth-stat-item"><span>Thời gian tồn sinh:</span><strong>${Math.round(record.timeSurvivedSeconds)} giây</strong></div>
        <div class="rebirth-stat-item"><span>Vị trí tạ thế:</span><strong>(${Math.round(record.deathX)}, ${Math.round(record.deathY)})</strong></div>
        <div class="rebirth-stat-item highlight"><span>Di trạch tiền kiếp:</span><strong class="text-gold">+${stonesPreserved} Nguyên thạch tại bia mộ</strong></div>
      `;
    }

    if (this.modal) {
      openModal(this.modal);
    }
  }

  public close(): void {
    if (this.modal) {
      closeModal(this.modal);
    }
  }

  public destroy(): void {
    this.events.abort();
    this.onRebirthCallback = null;
    this.close();
  }
}


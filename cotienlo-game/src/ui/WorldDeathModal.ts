import type { FieldSnapshot } from '../world/field-types';
import { closeModal, openModal } from './Modal';

/** A server life is reborn once; region is deliberately never selected by this UI. */
export class WorldDeathModal {
  private events = new AbortController();
  private busy = false;
  private lifeId = '';
  constructor(private root: HTMLElement, private rebirth: () => Promise<void>) {
    root.innerHTML = '<div class="modal-backdrop"></div><section class="modal-card field-death-panel" role="dialog" aria-modal="true" aria-labelledby="field-death-title" tabindex="-1"><p class="eyebrow">Sinh tử luân hồi</p><h2 id="field-death-title">Cuộc đời đã kết thúc</h2><p id="field-death-cause"></p><p>Đời mới sẽ khởi đầu ngẫu nhiên tại một điểm an toàn trong cả năm đại vực. Không giữ nguyên vùng vừa sống.</p><p id="field-death-status" role="status" aria-live="polite"></p><button type="button" id="btn-world-rebirth" class="btn-primary-action">Tái sinh ngẫu nhiên trong Ngũ Vực</button></section>';
    root.querySelector('#btn-world-rebirth')?.addEventListener('click', () => { void this.execute(); }, { signal: this.events.signal });
  }
  show(snapshot: FieldSnapshot): void {
    if (snapshot.lifeId === this.lifeId && this.root.classList.contains('active')) return;
    this.lifeId = snapshot.lifeId;
    const cause = this.root.querySelector<HTMLElement>('#field-death-cause');
    if (cause) cause.textContent = `Đời ${snapshot.lifeNumber}: ${snapshot.cause ?? 'Trọng thương giữa hành trình.'}`;
    openModal(this.root);
  }
  close(): void { closeModal(this.root); }
  private async execute(): Promise<void> {
    if (this.busy) return;
    const button = this.root.querySelector<HTMLButtonElement>('#btn-world-rebirth');
    const status = this.root.querySelector<HTMLElement>('#field-death-status');
    this.busy = true; if (button) button.disabled = true;
    if (status) status.textContent = 'Đang khởi tạo cuộc đời mới…';
    try { await this.rebirth(); this.close(); }
    catch (error) { if (status) status.textContent = error instanceof Error ? error.message : 'Chưa tái sinh được. Hãy thử lại.'; }
    finally { this.busy = false; if (button) button.disabled = false; }
  }
  destroy(): void { this.events.abort(); this.close(); }
}

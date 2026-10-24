import { InventorySystem } from '../systems/InventorySystem';
import { GuSystem } from '../systems/GuSystem';
import { Toast } from './Toast';
import { closeModal, openModal } from './Modal';
import { guIcon, itemIcon } from './icons';

export class InventoryModal {
  private modal: HTMLElement | null = null;
  private btnClose: HTMLElement | null = null;
  private btnOpen: HTMLElement | null = null;
  private guListContainer: HTMLElement | null = null;
  private itemsGridContainer: HTMLElement | null = null;
  private tabButtons: NodeListOf<HTMLButtonElement> | null = null;

  constructor(
    private inventory: InventorySystem,
    private guSystem: GuSystem,
    private onChange: () => void = () => {},
    private onOpen?: () => boolean,
  ) {
    this.modal = document.getElementById('modal-inventory');
    this.btnClose = document.getElementById('btn-close-inventory');
    this.btnOpen = document.getElementById('btn-open-inventory');
    this.guListContainer = document.getElementById('gu-inventory-list');
    this.itemsGridContainer = document.getElementById('items-inventory-grid');
    this.tabButtons = this.modal?.querySelectorAll('.tabs-nav .tab-btn') ?? null;

    this.bindEvents();
  }

  private bindEvents() {
    this.btnOpen?.addEventListener('click', () => this.open());
    this.btnClose?.addEventListener('click', () => this.close());

    // Backdrop click close
    this.modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.close());

    // Only the selected tab participates in the tab order.
    this.tabButtons?.forEach((btn) => {
      btn.addEventListener('click', () => this.selectTab(btn));
      btn.addEventListener('keydown', (event) => {
        const tabs = [...(this.tabButtons ?? [])];
        const index = tabs.indexOf(btn);
        let next: number;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault();
        this.selectTab(tabs[next]);
        tabs[next].focus({ preventScroll: true });
      });
    });
    const initialTab = [...(this.tabButtons ?? [])].find((btn) => btn.classList.contains('active')) ?? this.tabButtons?.[0];
    if (initialTab) this.selectTab(initialTab);
  }

  private selectTab(selected: HTMLButtonElement): void {
    this.tabButtons?.forEach((button) => {
      const active = button === selected;
      const target = button.getAttribute('data-tab') === 'gu-tab' ? 'tab-gu-content' : 'tab-items-content';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', target);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      if (!button.id) button.id = `${target}-trigger`;
      if (active) button.classList.add('active');
      else button.classList.remove('active');
      const panel = document.getElementById(target);
      if (!panel) return;
      panel.hidden = !active;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
      if (active) panel.classList.add('active');
      else panel.classList.remove('active');
    });
  }

  public open() {
    if (this.onOpen?.()) return;
    this.render();
    openModal(this.modal, this.btnOpen);
  }

  public close() {
    closeModal(this.modal);
  }

  public render(focusGuId?: string) {
    // 1. Render Gu Cards
    if (this.guListContainer) {
      this.guListContainer.innerHTML = '';
      if (this.inventory.ownedGuIds.length === 0) {
        this.guListContainer.innerHTML = `<p class="empty-state">${this.inventory.usableGuIds === null ? 'Chưa thu phục được Cổ trùng nào. Hãy vào rừng săn tìm!' : 'Đời mới chưa có Cổ. Đến học đường nhận Cổ đầu đời rồi luyện hóa để sử dụng.'}</p>`;
      } else {
        this.inventory.ownedGuIds.forEach((guId) => {
          const gu = this.guSystem.getGu(guId);
          if (!gu) return;

          const foodCount = gu.foodItemId ? this.inventory.items.get(gu.foodItemId)?.count ?? 0 : 0;
          const online = this.inventory.usableGuIds !== null;
          const canFeed = !online && gu.hunger < 100 && foodCount > 0;
          const card = document.createElement('article');
          card.className = 'gu-card';
          card.tabIndex = -1;
          card.innerHTML = `
            <div class="gu-card-icon" aria-hidden="true">${guIcon(gu.id)}</div>
            <div class="gu-card-info">
              <div class="gu-card-heading">
                <h3 class="gu-card-title">${gu.name.replace(/\s*\[.*?\]/g, '')}</h3>
                <span class="gu-card-tier">Chuyển ${gu.tier}</span>
              </div>
              <p class="gu-card-desc">${gu.description}</p>
              <div class="gu-feed-row">
                <span>Độ no:</span>
                <div class="hunger-bar" role="progressbar" aria-label="Độ no của ${gu.name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${gu.hunger}">
                  <div class="hunger-fill" style="width: ${gu.hunger}%;"></div>
                </div>
                <span>${gu.hunger}%</span>
              </div>
              <div class="gu-feed-action">
                <p class="gu-food-note">${gu.foodType} <span>· Trong túi: ${foodCount}</span></p>
                <button type="button" class="btn-feed" data-guid="${gu.id}" aria-label="Cho ${gu.name} ăn" ${canFeed ? '' : 'disabled'}>${gu.hunger >= 100 ? 'Đã no' : canFeed ? 'Cho ăn' : 'Thiếu thức ăn'}</button>
              </div>
            </div>
          `;
          if (online) {
            card.querySelector('.gu-feed-action')?.remove();
            const row = card.querySelector<HTMLElement>('.gu-feed-row');
            if (row) row.textContent = this.inventory.canControlGu(guId) ? 'Đã luyện hóa · có thể điều khiển' : 'Chưa dùng được · cần luyện hóa và tu vi phù hợp';
          }

          // Feed button action
          const feedButton = card.querySelector<HTMLButtonElement>('.btn-feed');
          feedButton?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this.guSystem.feedGu(gu.id, this.inventory)) {
              Toast.show(gu.hunger >= 100 ? `${gu.name} đã no.` : `Cần 1 ${gu.foodType} để cho Cổ ăn.`);
              return;
            }
            Toast.show(`Đã dùng 1 ${gu.foodType} cho ${gu.name} ăn.`);
            this.onChange();
            this.render(gu.id);
          });

          this.guListContainer?.appendChild(card);
          if (focusGuId === gu.id) {
            (feedButton && !feedButton.disabled ? feedButton : card).focus({ preventScroll: true });
          }
        });
      }
    }

    // 2. Render Items Grid
    if (this.itemsGridContainer) {
      this.itemsGridContainer.innerHTML = '';
      if (this.inventory.items.size === 0) {
        this.itemsGridContainer.innerHTML = `<p class="empty-state">Túi đồ rỗng.</p>`;
      } else {
        this.inventory.items.forEach((item) => {
          const slot = document.createElement('article');
          slot.className = 'item-slot';
          slot.innerHTML = `
            <div class="item-slot-icon" aria-hidden="true">${itemIcon(item.id)}</div>
            <div class="item-info">
              <div class="item-heading">
                <h3 class="item-name">${item.name}</h3>
                <span class="item-count"><span class="sr-only">Số lượng: </span>×${item.count}</span>
              </div>
              <p class="item-desc">${item.description}</p>
            </div>
          `;
          this.itemsGridContainer?.appendChild(slot);
        });
      }
    }
  }
}

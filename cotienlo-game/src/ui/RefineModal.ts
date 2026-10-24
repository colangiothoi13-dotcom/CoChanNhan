import { InventorySystem } from '../systems/InventorySystem';
import { GuSystem } from '../systems/GuSystem';
import { RefinementSystem } from '../systems/RefinementSystem';
import { SoundEngine } from '../engine/SoundEngine';
import { Toast } from './Toast';
import { closeModal, openModal } from './Modal';
import { guIcon } from './icons';

export class RefineModal {
  private modal: HTMLElement | null = null;
  private btnClose: HTMLElement | null = null;
  private btnOpen: HTMLElement | null = null;
  private slotPrimary: HTMLElement | null = null;
  private slotSecondary: HTMLElement | null = null;
  private slotResult: HTMLElement | null = null;
  private availableGuContainer: HTMLElement | null = null;
  private btnExecute: HTMLElement | null = null;
  private chanceLabel: HTMLElement | null = null;
  private costLabel: HTMLElement | null = null;

  private selectedGu1: string | null = null;
  private selectedGu2: string | null = null;

  constructor(
    private inventory: InventorySystem,
    private guSystem: GuSystem,
    private refinement: RefinementSystem,
    private sound: SoundEngine,
    private onRefineSuccess: () => void,
    private onChange: () => void = () => {},
    private onServerRefine?: (resultGu: string) => void,
    private onOpen?: () => boolean,
  ) {
    this.modal = document.getElementById('modal-refine');
    this.btnClose = document.getElementById('btn-close-refine');
    this.btnOpen = document.getElementById('btn-open-refine');
    this.slotPrimary = document.getElementById('slot-primary');
    this.slotSecondary = document.getElementById('slot-secondary');
    this.slotResult = document.getElementById('slot-result');
    this.availableGuContainer = document.getElementById('refine-available-gu');
    this.btnExecute = document.getElementById('btn-execute-refine');
    this.chanceLabel = document.getElementById('refine-chance');
    this.costLabel = document.getElementById('refine-cost');

    this.bindEvents();
  }

  private bindEvents() {
    this.btnOpen?.addEventListener('click', () => this.open());
    this.btnClose?.addEventListener('click', () => this.close());
    this.modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.close());

    this.slotPrimary?.addEventListener('click', () => {
      this.selectedGu1 = null;
      this.updateSlots();
    });

    this.slotSecondary?.addEventListener('click', () => {
      this.selectedGu2 = null;
      this.updateSlots();
    });

    this.btnExecute?.addEventListener('click', () => this.execute());
  }

  public open() {
    if (this.onOpen?.()) return;
    if (this.selectedGu1 && !this.inventory.hasGu(this.selectedGu1)) this.selectedGu1 = null;
    if (this.selectedGu2 && !this.inventory.hasGu(this.selectedGu2)) this.selectedGu2 = null;
    if (!this.selectedGu1 && !this.selectedGu2) {
      const recipe = this.inventory.ownedGuIds.flatMap((first, index) =>
        this.inventory.ownedGuIds.slice(index + 1).map((second) => this.refinement.findRecipe(first, second)),
      ).find((candidate) => candidate && !this.inventory.hasGu(candidate.resultGu));
      if (recipe) {
        this.selectedGu1 = recipe.primaryGu;
        this.selectedGu2 = recipe.secondaryGu;
      }
    }
    this.updateSlots();
    this.renderAvailableGu();
    openModal(this.modal, this.btnOpen);
  }

  public close() {
    closeModal(this.modal);
  }

  private renderAvailableGu() {
    if (!this.availableGuContainer) return;
    this.availableGuContainer.innerHTML = '';

    this.inventory.ownedGuIds.forEach((guId) => {
      const gu = this.guSystem.getGu(guId);
      if (!gu) return;

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'gu-mini-chip';
      chip.setAttribute('data-gu-id', gu.id);
      chip.setAttribute('aria-pressed', String(this.selectedGu1 === gu.id || this.selectedGu2 === gu.id));
      chip.innerHTML = `${guIcon(gu.id)} <span>${gu.name.replace(/\s*\[.*?\]/g, '')}</span>`;

      chip.addEventListener('click', () => {
        if (this.selectedGu1 === gu.id) {
          this.selectedGu1 = null;
        } else if (this.selectedGu2 === gu.id) {
          this.selectedGu2 = null;
        } else if (!this.selectedGu1) {
          this.selectedGu1 = gu.id;
        } else if (!this.selectedGu2) {
          this.selectedGu2 = gu.id;
        } else {
          this.selectedGu1 = gu.id;
        }
        this.updateSlots();
      });

      this.availableGuContainer?.appendChild(chip);
    });
    this.updateAvailableSelection();
  }

  private updateAvailableSelection(): void {
    this.availableGuContainer?.querySelectorAll<HTMLButtonElement>('.gu-mini-chip').forEach((chip) => {
      const id = chip.getAttribute('data-gu-id');
      const selected = this.selectedGu1 === id || this.selectedGu2 === id;
      chip.setAttribute('aria-pressed', String(selected));
      if (selected) chip.classList.add('selected');
      else chip.classList.remove('selected');
    });
  }

  private updateSlot(slot: HTMLElement | null, guId: string | null, placeholder: string, canClear = false): void {
    if (!slot) return;
    const gu = guId ? this.guSystem.getGu(guId) : undefined;
    if (gu) {
      const name = gu.name.replace(/\s*\[.*?\]/g, '');
      slot.innerHTML = `<span class="furnace-slot-icon" aria-hidden="true">${guIcon(gu.id)}</span><span class="furnace-slot-name">${name}</span>`;
      slot.setAttribute('aria-label', canClear ? `Bỏ chọn ${name}` : `Thành phẩm: ${name}`);
      slot.title = canClear ? `Bỏ chọn ${name}` : name;
    } else {
      slot.innerHTML = `<span class="slot-placeholder">${placeholder}</span>`;
      slot.setAttribute('aria-label', placeholder);
      slot.title = placeholder;
    }
    if (canClear) (slot as HTMLButtonElement).disabled = !gu;
  }

  private updateSlots() {
    this.updateSlot(this.slotPrimary, this.selectedGu1, 'Cổ chủ thể', true);
    this.updateSlot(this.slotSecondary, this.selectedGu2, 'Cổ phụ', true);
    this.updateAvailableSelection();

    // Recipe check & Prediction
    if (this.selectedGu1 && this.selectedGu2) {
      const recipe = this.refinement.findRecipe(this.selectedGu1, this.selectedGu2);
      if (recipe) {
        this.updateSlot(this.slotResult, recipe.resultGu, 'Thành phẩm');
        if (this.chanceLabel) this.chanceLabel.textContent = `${Math.round(recipe.successRate * 100)}%`;
        if (this.costLabel) this.costLabel.textContent = `${recipe.stoneCost} Nguyên Thạch`;
      } else {
        this.updateSlot(this.slotResult, null, 'Chưa có phối phương');
        if (this.chanceLabel) this.chanceLabel.textContent = `0%`;
        if (this.costLabel) this.costLabel.textContent = `Không có phối phương`;
      }
    } else {
      this.updateSlot(this.slotResult, null, 'Thành phẩm');
      if (this.chanceLabel) this.chanceLabel.textContent = '—';
      if (this.costLabel) this.costLabel.textContent = 'Chọn đủ 2 Cổ trùng';
    }
  }

  private execute() {
    if (!this.selectedGu1 || !this.selectedGu2) {
      Toast.show('Vui lòng chọn đủ 2 Cổ trùng vào lò!');
      return;
    }

    if (this.onServerRefine) {
      const recipe = this.refinement.findRecipe(this.selectedGu1, this.selectedGu2);
      if (!recipe) { Toast.show('Hai Cổ này chưa có phối phương.'); return; }
      this.onServerRefine(recipe.resultGu);
      this.close();
      return;
    }

    const result = this.refinement.executeRefinement(
      this.selectedGu1,
      this.selectedGu2,
      this.inventory,
      this.guSystem,
      this.sound
    );

    Toast.show(result.message);

    if (result.success) {
      this.onRefineSuccess();
      this.renderAvailableGu();
      this.updateSlots();
    }
    this.onChange();
  }
}

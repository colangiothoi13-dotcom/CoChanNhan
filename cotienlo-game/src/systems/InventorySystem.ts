export interface InventoryItem {
  id: string;
  name: string;
  icon: string;
  count: number;
  description: string;
}

export const ITEM_DEFINITIONS: readonly InventoryItem[] = [
  {
    id: 'herb', name: 'Thanh Trúc Diệp', icon: '🌿', count: 8,
    description: 'Lá trúc tươi mọc ven suối, có thể dùng làm thuốc hoặc cho Thảo Hoàn Cổ ăn.',
  },
  {
    id: 'moon_stone', name: 'U Quang Thạch', icon: '🔮', count: 2,
    description: 'Đá khoáng phát quang trong bóng đêm, phối phương thiết yếu để thăng chuyển Nguyệt Quang Cổ.',
  },
  {
    id: 'meat', name: 'Thịt Lợn Rừng', icon: '🥩', count: 5,
    description: 'Thức ăn khoái khẩu của Bạch Trư Cổ.',
  },
];

function isPositiveCount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export class InventorySystem {
  public primevalStones: number = 25; // Currency
  public ownedGuIds: string[] = ['moonlight', 'bronze', 'boar', 'heal'];
  /** Online authority distinguishes possession from control. Null keeps legacy practice behavior. */
  public usableGuIds: string[] | null = null;
  public energyUnitLabel = 'CN';
  public items: Map<string, InventoryItem> = new Map();

  constructor() {
    ITEM_DEFINITIONS.forEach((item) => this.addItem(item));
  }

  public addItem(item: InventoryItem) {
    if (!item.id || !isPositiveCount(item.count)) return;
    const existing = this.items.get(item.id);
    if (existing) {
      const nextCount = existing.count + item.count;
      if (Number.isSafeInteger(nextCount)) existing.count = nextCount;
    } else {
      this.items.set(item.id, { ...item });
    }
  }

  public removeItem(id: string, count: number = 1): boolean {
    if (!isPositiveCount(count)) return false;
    const item = this.items.get(id);
    if (!item || item.count < count) return false;
    item.count -= count;
    if (item.count <= 0) {
      this.items.delete(id);
    }
    return true;
  }

  public addGu(guId: string) {
    if (!this.ownedGuIds.includes(guId)) {
      this.ownedGuIds.push(guId);
    }
  }

  public hasGu(guId: string): boolean {
    return this.ownedGuIds.includes(guId);
  }

  public canControlGu(guId: string): boolean {
    return this.hasGu(guId) && (this.usableGuIds === null || this.usableGuIds.includes(guId));
  }

  public addStones(amount: number) {
    if (!isPositiveCount(amount)) return;
    const nextAmount = this.primevalStones + amount;
    if (Number.isSafeInteger(nextAmount)) this.primevalStones = nextAmount;
  }

  public spendStones(amount: number): boolean {
    if (!isPositiveCount(amount) || !Number.isSafeInteger(this.primevalStones) || this.primevalStones < 0) return false;
    if (this.primevalStones < amount) return false;
    this.primevalStones -= amount;
    return true;
  }
}

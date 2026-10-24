import type { InventorySystem } from './InventorySystem';
import { GU_DEFINITIONS as LIVE_GU_DEFINITIONS } from '../../shared/cultivation-core.mjs';

export interface GuCombatStats {
  mpCost: number;
  cooldown: number;
}

/** Shared defaults for casting, catalogue descriptions and HUD readouts. */
export const GU_COMBAT_STATS = {
  moonlight: { mpCost: 15, cooldown: 1 },
  bronze: { mpCost: 25, cooldown: 8 },
  boar: { mpCost: 20, cooldown: 10 },
  heal: { mpCost: 30, cooldown: 12 },
  moonblade: { mpCost: 28, cooldown: 1.2 },
  ironskin: { mpCost: 35, cooldown: 15 },
} as const satisfies Record<string, GuCombatStats>;

export interface GuDefinition extends GuCombatStats {
  id: string;
  name: string;
  tier: number; // 1 = Nhất chuyển, 2 = Nhị chuyển...
  icon: string;
  description: string;
  foodType: string;
  foodItemId?: string;
  hunger: number; // 0..100%
}

export class GuSystem {
  private guCatalog: Map<string, GuDefinition> = new Map();

  constructor() {
    this.initCatalog();
  }

  private initCatalog() {
    this.registerGu({
      id: 'moonlight',
      name: 'Nguyệt Quang Cổ',
      tier: 1,
      icon: '🌙',
      description: 'Phát ra đao quang trăng lưỡi liềm chém địch từ xa, gây sát thương linh lực sắc bén.',
      ...GU_COMBAT_STATS.moonlight,
      foodType: 'U Quang Thạch',
      foodItemId: 'moon_stone',
      hunger: 90,
    });

    this.registerGu({
      id: 'bronze',
      name: 'Thanh Đồng Giáp Cổ',
      tier: 1,
      icon: '🛡️',
      description: 'Ngưng tụ màng phòng hộ thanh đồng quanh thân, giảm 55% sát thương nhận vào trong 5 giây.',
      ...GU_COMBAT_STATS.bronze,
      foodType: 'Thanh Đồng Tiết',
      hunger: 85,
    });

    this.registerGu({
      id: 'boar',
      name: 'Bạch Trư Cổ',
      tier: 1,
      icon: '🐗',
      description: 'Cường hóa thể lực và gân cốt, tăng tốc độ di chuyển và uy lực đòn đánh.',
      ...GU_COMBAT_STATS.boar,
      foodType: 'Thịt Lợn Rừng',
      foodItemId: 'meat',
      hunger: 95,
    });

    this.registerGu({
      id: 'heal',
      name: 'Thảo Hoàn Cổ',
      tier: 1,
      icon: '🌿',
      description: 'Tỏa ra hương thảo dược thanh khiết, liên tục hồi phục sinh lực theo thời gian.',
      ...GU_COMBAT_STATS.heal,
      foodType: 'Cỏ Linh Lan',
      foodItemId: 'herb',
      hunger: 80,
    });

    // Tier 2 Advanced Gu (Created via Refinement)
    this.registerGu({
      id: 'moonblade',
      name: 'Nguyệt Nhận Cổ [Nhị Chuyển]',
      tier: 2,
      icon: '⚔️',
      description: 'Thăng chuyển từ Nguyệt Quang Cổ: Đao quang lớn gấp đôi, xuyên thấu nhiều kẻ địch cùng lúc.',
      ...GU_COMBAT_STATS.moonblade,
      foodType: 'Nguyệt Hoa Thạch',
      hunger: 100,
    });

    this.registerGu({
      id: 'ironskin',
      name: 'Thiết Cốt Cổ [Nhị Chuyển]',
      tier: 2,
      icon: '🥋',
      description: 'Dung hợp Đồng Giáp và Bạch Trư: Biến xương cốt thành huyền thiết, tăng vĩnh viễn 15 phòng ngự.',
      ...GU_COMBAT_STATS.ironskin,
      foodType: 'Huyền Thiết Tinh',
      hunger: 100,
    });
    for (const [id, description, symbol] of [
      ['smalllight', 'Phàm Cổ hỗ trợ quang đạo; là một cá thể riêng khi tham gia cổ phương.', '✦'],
      ['moonbeam', 'Nguyệt Quang cùng hai cá thể Tiểu Quang hợp luyện thành Cổ nhị chuyển.', '☽'],
      ['starfirefly', 'Cổ hình thành từ chuỗi nuôi Tinh Tiết Thảo và đàn đom đóm trong môi trường thích hợp.', '✧'],
    ] as const) {
      const definition = LIVE_GU_DEFINITIONS[id];
      if (!definition) continue;
      this.registerGu({ id, name: definition.name, tier: definition.rank, icon: symbol, description,
        mpCost: definition.primevalCostBps / 100, cooldown: definition.cooldownMs / 1000,
        foodType: 'Xem hồ sơ nuôi dưỡng', hunger: 100 });
    }
  }

  public registerGu(gu: GuDefinition) {
    this.guCatalog.set(gu.id, gu);
  }

  public getGu(id: string): GuDefinition | undefined {
    return this.guCatalog.get(id);
  }

  public getAllGu(): GuDefinition[] {
    return Array.from(this.guCatalog.values());
  }

  public canUseGu(id: string, inventory: InventorySystem): boolean {
    return this.guCatalog.has(id) && inventory.canControlGu(id);
  }

  public feedGu(id: string, inventory: InventorySystem): boolean {
    const gu = this.guCatalog.get(id);
    if (!gu || !inventory.hasGu(id) || !Number.isFinite(gu.hunger)
      || gu.hunger < 0 || gu.hunger >= 100 || !gu.foodItemId) return false;
    if (!inventory.removeItem(gu.foodItemId)) return false;
    gu.hunger = Math.min(100, gu.hunger + 35);
    return true;
  }
}

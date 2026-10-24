import { InventorySystem } from './InventorySystem';
import { GuSystem } from './GuSystem';
import { SoundEngine } from '../engine/SoundEngine';
import confetti from 'canvas-confetti';

export interface RefineRecipe {
  primaryGu: string;
  secondaryGu: string;
  resultGu: string;
  stoneCost: number;
  successRate: number; // 0..1
}

export class RefinementSystem {
  private recipes: RefineRecipe[] = [
    {
      primaryGu: 'moonlight',
      secondaryGu: 'boar',
      resultGu: 'moonblade',
      stoneCost: 10,
      successRate: 0.85,
    },
    {
      primaryGu: 'bronze',
      secondaryGu: 'boar',
      resultGu: 'ironskin',
      stoneCost: 15,
      successRate: 0.80,
    },
  ];

  public findRecipe(gu1: string, gu2: string): RefineRecipe | undefined {
    return this.recipes.find(
      (r) =>
        (r.primaryGu === gu1 && r.secondaryGu === gu2) ||
        (r.primaryGu === gu2 && r.secondaryGu === gu1)
    );
  }

  public executeRefinement(
    gu1: string,
    gu2: string,
    inventory: InventorySystem,
    guSystem: GuSystem,
    sound: SoundEngine
  ): { success: boolean; resultGuId?: string; message: string } {
    const recipe = this.findRecipe(gu1, gu2);
    if (!recipe) {
      return {
        success: false,
        message: 'Không tìm thấy phối phương hợp luyện phù hợp giữa hai Cổ này!',
      };
    }

    if (!inventory.hasGu(gu1) || !inventory.hasGu(gu2)) {
      return { success: false, message: 'Bạn chưa sở hữu đủ hai Cổ trùng của phối phương.' };
    }

    if (inventory.hasGu(recipe.resultGu)) {
      return { success: false, message: 'Bạn đã sở hữu Cổ trùng này; không cần hợp luyện lại.' };
    }

    if (inventory.primevalStones < recipe.stoneCost) {
      return {
        success: false,
        message: `Nguyên thạch bất túc! Cần tối thiểu ${recipe.stoneCost} Nguyên thạch để tế luyện.`,
      };
    }

    // Spend stones
    if (!inventory.spendStones(recipe.stoneCost)) {
      return { success: false, message: 'Không thể thanh toán Nguyên thạch để hợp luyện.' };
    }

    // Roll success
    const roll = Math.random();
    if (roll <= recipe.successRate) {
      // Success!
      inventory.addGu(recipe.resultGu);
      sound.playRefineSuccess();

      // Confetti celebration
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#ffd700', '#00b4d8', '#3fb950'],
        });
      } catch {}

      const resultDef = guSystem.getGu(recipe.resultGu);
      return {
        success: true,
        resultGuId: recipe.resultGu,
        message: `Hợp luyện đại thành! Bạn đã luyện hóa thành công ${resultDef?.name || 'Cổ mới'}!`,
      };
    } else {
      // Failure recoil
      return {
        success: false,
        message: 'Luyện Cổ thất bại! Khí tức nghịch chuyển, tiêu hao Nguyên thạch nhưng bảo toàn được Cổ bản mệnh.',
      };
    }
  }
}

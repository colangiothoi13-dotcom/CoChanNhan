import { InventorySystem } from './InventorySystem';
import type { Cultivator, RealmRank } from '../entities/Cultivator';

const CHAPTER_REALMS: readonly RealmRank[] = [
  'Nhất Chuyển Sơ Giai', 'Nhất Chuyển Trung Giai', 'Nhất Chuyển Cao Giai',
  'Nhất Chuyển Đỉnh Phong', 'Nhị Chuyển Sơ Giai',
];
export interface QuestCompletionResult { success: boolean; message: string; }

export interface QuestProgress {
  questCount: number;
  hasRefinedGu?: boolean;
  questRewardClaimed?: boolean;
  chapterRewardClaimed?: boolean;
  chapter?: number;
  wolfKills?: number;
  bearKills?: number;
  herbsCollected?: number;
}

export interface QuestChapterInfo {
  chapter: number;
  code: string;
  title: string;
  desc: string;
  progressText: string;
  rewardText: string;
  isComplete: boolean;
  rewardClaimed: boolean;
}

/** Owns multi-chapter quest progression, objectives, and repeatable clan bounties. */
export class QuestSystem {
  public chapter: number = 1;
  public readonly requiredKills = 3;
  public readonly requiredWolves = 2;
  public readonly requiredBears = 1;

  private snakeKills: number;
  private wolfKills: number = 0;
  private bearKills: number = 0;
  private herbsCollected: number = 0;
  private refined: boolean;
  private rewardClaimed: boolean;

  constructor(private inventory: InventorySystem, saved?: QuestProgress) {
    this.chapter = Math.max(1, Math.floor(saved?.chapter ?? 1));
    this.snakeKills = Math.min(this.requiredKills, Math.max(0, Math.floor(saved?.questCount ?? 0)));
    this.wolfKills = Math.max(0, Math.floor(saved?.wolfKills ?? 0));
    this.bearKills = Math.max(0, Math.floor(saved?.bearKills ?? 0));
    this.herbsCollected = Math.max(0, Math.floor(saved?.herbsCollected ?? 0));
    this.refined = saved?.hasRefinedGu === true;
    this.rewardClaimed = this.chapter === 1
      ? saved?.questRewardClaimed === true
      : saved?.chapterRewardClaimed === true;
  }

  public get state(): Required<QuestProgress> {
    return {
      questCount: this.snakeKills,
      hasRefinedGu: this.refined,
      questRewardClaimed: this.chapter === 1 ? this.rewardClaimed : true,
      chapterRewardClaimed: this.rewardClaimed,
      chapter: this.chapter,
      wolfKills: this.wolfKills,
      bearKills: this.bearKills,
      herbsCollected: this.herbsCollected,
    };
  }

  public get currentChapter(): QuestChapterInfo {
    switch (this.chapter) {
      case 1: {
        const isComplete = this.snakeKills >= this.requiredKills && this.refined;
        return {
          chapter: 1,
          code: '01',
          title: 'Bước đầu tu hành',
          desc: 'Gia tộc khảo hạch sơ đệ tử: săn bắt Thanh Trúc Xà trong rừng và dùng Lô Đỉnh hợp luyện Cổ trùng đầu tiên.',
          progressText: isComplete
            ? (this.rewardClaimed ? 'Đã hoàn thành! Đạt Nhất Chuyển Trung Giai.' : 'Đủ điều kiện nhận thưởng (30 Nguyên thạch)!')
            : `Săn rắn (${this.snakeKills}/${this.requiredKills}) & Hợp Luyện Cổ (${this.refined ? '1/1' : '0/1'})`,
          rewardText: 'Hoàn thành hành trình · nhận 30 nguyên thạch & đạt Trung Giai',
          isComplete,
          rewardClaimed: this.rewardClaimed,
        };
      }
      case 2: {
        const isComplete = this.wolfKills >= this.requiredWolves && this.herbsCollected >= 2;
        return {
          chapter: 2,
          code: '02',
          title: 'Dẹp trừ Lang họa',
          desc: 'Bạch Lang Thú tràn xuống chân núi quấy nhiễu. Tiến vào Bắc Lĩnh trảm diệt bầy sói và thu thập dược liệu.',
          progressText: isComplete
            ? (this.rewardClaimed ? 'Đã dẹp xong bầy sói! Đạt Nhất Chuyển Cao Giai.' : 'Đủ điều kiện nhận thưởng (45 Nguyên thạch)!')
            : `Hạ Bạch Lang (${Math.min(this.requiredWolves, this.wolfKills)}/${this.requiredWolves}) & Dược thảo (${Math.min(2, this.herbsCollected)}/2)`,
          rewardText: 'Bảo vệ sơn trại · nhận 45 nguyên thạch & đạt Cao Giai',
          isComplete,
          rewardClaimed: this.rewardClaimed,
        };
      }
      case 3: {
        const isComplete = this.bearKills >= this.requiredBears;
        return {
          chapter: 3,
          code: '03',
          title: 'Khảo nghiệm Hùng Vương',
          desc: 'Khiêu chiến Hùng Thú Vương [Tinh Anh] trên sườn núi phía Bắc. Đọc vòng đỏ né chấn động và trảm sát thú vương!',
          progressText: isComplete
            ? (this.rewardClaimed ? 'Hùng Vương đã bị trảm! Đạt Nhất Chuyển Đỉnh Phong.' : 'Đủ điều kiện nhận thưởng (60 Nguyên thạch)!')
            : `Trảm sát Hùng Thú Vương [Tinh Anh] (${Math.min(this.requiredBears, this.bearKills)}/${this.requiredBears})`,
          rewardText: 'Trảm sát Tinh Anh · nhận 60 nguyên thạch & Cổ Nhị Chuyển',
          isComplete,
          rewardClaimed: this.rewardClaimed,
        };
      }
      case 4: {
        const hasTier2Gu = this.inventory.hasGu('moonblade') || this.inventory.hasGu('ironskin');
        const isComplete = this.rewardClaimed || (hasTier2Gu && this.inventory.primevalStones >= 50);
        return {
          chapter: 4,
          code: '04',
          title: 'Đột phá Nhị Chuyển',
          desc: 'Hợp luyện thành công Cổ Nhị Chuyển (Nguyệt Nhận hoặc Thiết Cốt) và tích lũy đủ 50 Nguyên thạch để đột phá Khiếu huyệt!',
          progressText: isComplete
            ? (this.rewardClaimed ? 'Đột phá thành công Nhị Chuyển Sơ Giai!' : 'Đã hội đủ điều kiện đột phá Khiếu huyệt!')
            : `Sở hữu Cổ Nhị Chuyển (${hasTier2Gu ? '1/1' : '0/1'}) & Nguyên thạch (${Math.min(50, this.inventory.primevalStones)}/50)`,
          rewardText: 'Đột phá Nhị Chuyển · mở chân nguyên Xích Thiết & chỉ số cực phẩm',
          isComplete,
          rewardClaimed: this.rewardClaimed,
        };
      }
      default: {
        // Repeatable Bounty Board
        const bountyKills = this.snakeKills + this.wolfKills + this.bearKills;
        const isComplete = bountyKills >= 3;
        return {
          chapter: this.chapter,
          code: `B${this.chapter - 4}`,
          title: 'Cáo thị Sơn Trại · Trừ thú',
          desc: 'Nhiệm vụ tuần hoàn: Quét sạch các dị thú quanh sơn trại bảo vệ tộc nhân, nhận thưởng nguyên thạch vô hạn.',
          progressText: isComplete
            ? (this.rewardClaimed ? 'Đã hoàn thành cáo thị tuần tra!' : 'Cáo thị đã hoàn thành, bấm nhận thưởng!')
            : `Tiêu diệt dị thú các loại (${Math.min(3, bountyKills)}/3)`,
          rewardText: 'Cáo thị gia tộc · nhận 35 nguyên thạch & dược liệu quý',
          isComplete,
          rewardClaimed: this.rewardClaimed,
        };
      }
    }
  }

  public get progress(): number {
    const cur = this.currentChapter;
    if (cur.isComplete) return 100;
    if (this.chapter === 1) {
      return Math.round(((this.snakeKills + Number(this.refined)) / (this.requiredKills + 1)) * 100);
    }
    if (this.chapter === 2) {
      return Math.round(((Math.min(2, this.wolfKills) + Math.min(2, this.herbsCollected)) / 4) * 100);
    }
    if (this.chapter === 3) {
      return Math.min(100, Math.round((this.bearKills / this.requiredBears) * 100));
    }
    if (this.chapter === 4) {
      const hasTier2Gu = this.inventory.hasGu('moonblade') || this.inventory.hasGu('ironskin');
      const stoneRatio = Math.min(1, this.inventory.primevalStones / 50);
      return Math.round(((Number(hasTier2Gu) + stoneRatio) / 2) * 100);
    }
    const bountyKills = this.snakeKills + this.wolfKills + this.bearKills;
    return Math.min(100, Math.round((bountyKills / 3) * 100));
  }

  public recordSnakeKill(): void {
    if (this.chapter === 1) {
      if (this.snakeKills >= this.requiredKills) return;
      this.snakeKills++;
      if (this.snakeKills === this.requiredKills) this.inventory.addStones(15);
    } else {
      this.snakeKills++;
    }
  }

  public recordWolfKill(): void {
    this.wolfKills++;
  }

  public recordBearKill(): void {
    this.bearKills++;
  }

  public recordHerbCollect(): void {
    this.herbsCollected++;
  }

  public recordRefinement(): void {
    this.refined = true;
  }

  /** Repair historical UI paths that paid a chapter but omitted its realm; never repay or charge old assets. */
  public reconcileRealm(cultivator: Cultivator): boolean {
    const completedChapter = Math.min(4, this.rewardClaimed ? this.chapter : this.chapter - 1);
    const expected = CHAPTER_REALMS[Math.max(0, completedChapter)];
    if (CHAPTER_REALMS.indexOf(cultivator.realm) >= CHAPTER_REALMS.indexOf(expected)) return false;
    const { hp, mp, stamina } = cultivator;
    cultivator.advanceRealm(expected);
    cultivator.hp = Math.min(hp, cultivator.maxHp);
    cultivator.mp = Math.min(mp, cultivator.maxMp);
    cultivator.stamina = stamina;
    return true;
  }

  /** Complete the chapter as one transaction shared by dialogue and the quest banner. */
  public completeChapter(cultivator: Cultivator): QuestCompletionResult {
    const cur = this.currentChapter;
    if (cultivator.hp <= 0) return { success: false, message: 'Kiếp này đã kết thúc.' };
    if (this.rewardClaimed) return { success: false, message: 'Chương này đã nhận thưởng.' };
    if (!cur.isComplete) return { success: false, message: 'Chưa đủ điều kiện hoàn thành chương này.' };
    const requiredRealm = CHAPTER_REALMS[Math.min(4, this.chapter - 1)];
    if (CHAPTER_REALMS.indexOf(cultivator.realm) < CHAPTER_REALMS.indexOf(requiredRealm)) {
      return { success: false, message: 'Cần hoàn thành cảnh giới của chương trước.' };
    }
    const cost = this.chapter === 4 ? 50 : 0;
    const reward = this.chapter === 1 ? 30 : this.chapter === 2 ? 45 : this.chapter === 3 ? 60 : this.chapter === 4 ? 80 : 35;
    const balance = this.inventory.primevalStones - cost + reward;
    if (!Number.isSafeInteger(this.inventory.primevalStones) || this.inventory.primevalStones < cost || !Number.isSafeInteger(balance)) {
      return { success: false, message: 'Không thể thanh toán hoặc nhận thưởng Nguyên thạch.' };
    }

    // All preconditions were checked before the first mutation.
    this.inventory.primevalStones = balance;
    if (this.chapter === 3) {
      if (!this.inventory.hasGu('moonblade')) {
        this.inventory.addGu('moonblade');
      } else if (!this.inventory.hasGu('ironskin')) {
        this.inventory.addGu('ironskin');
      }
    }
    if (this.chapter <= 4) {
      const targetRealm = CHAPTER_REALMS[this.chapter];
      if (CHAPTER_REALMS.indexOf(cultivator.realm) < CHAPTER_REALMS.indexOf(targetRealm)) cultivator.advanceRealm(targetRealm);
    }
    this.rewardClaimed = true;
    return { success: true, message: this.chapter === 4
      ? 'Đột phá Nhị Chuyển: đã dùng 50 và nhận thưởng 80 Nguyên thạch.'
      : `Đã hoàn thành ${cur.title}, nhận ${reward} Nguyên thạch!` };
  }

  public advanceToNextChapter(): boolean {
    if (!this.rewardClaimed || this.chapter >= Number.MAX_SAFE_INTEGER) return false;
    this.chapter++;
    this.snakeKills = 0;
    this.wolfKills = 0;
    this.bearKills = 0;
    this.herbsCollected = 0;
    this.rewardClaimed = false;
    return true;
  }
}


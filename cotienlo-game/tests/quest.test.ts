import { describe, expect, it } from 'vitest';
import { InventorySystem } from '../src/systems/InventorySystem';
import { QuestSystem } from '../src/systems/QuestSystem';
import { Cultivator } from '../src/entities/Cultivator';

describe('quest rewards', () => {
  it('pays the hunting reward once and caps the objective at three snakes', () => {
    const inventory = new InventorySystem();
    const quest = new QuestSystem(inventory);
    for (let i = 0; i < 10; i++) quest.recordSnakeKill();
    expect(inventory.primevalStones).toBe(40);
    expect(quest.state.questCount).toBe(3);
    expect(quest.progress).toBe(75);
  });

  it.each(['hunting-first', 'refinement-first'])('pays the full completion reward once (%s)', (order) => {
    const inventory = new InventorySystem();
    const quest = new QuestSystem(inventory);
    if (order === 'refinement-first') quest.recordRefinement();
    for (let i = 0; i < 3; i++) quest.recordSnakeKill();
    quest.recordRefinement();
    quest.recordRefinement();
    quest.recordSnakeKill();
    expect(inventory.primevalStones).toBe(40);
    expect(quest.completeChapter(new Cultivator()).success).toBe(true);
    expect(inventory.primevalStones).toBe(70); // 25 starting + 15 hunting + 30 completion
    expect(quest.progress).toBe(100);
    expect(quest.state.questRewardClaimed).toBe(true);
  });

  it('does not repay rewards when a completed save is loaded', () => {
    const inventory = new InventorySystem();
    const quest = new QuestSystem(inventory, {
      questCount: 3, hasRefinedGu: true, questRewardClaimed: true,
    });
    quest.recordSnakeKill();
    quest.recordRefinement();
    expect(inventory.primevalStones).toBe(25);
  });

  it('requires explicit completion for a legacy objective whose reward was not paid', () => {
    const inventory = new InventorySystem();
    const quest = new QuestSystem(inventory, { questCount: 3, hasRefinedGu: true });
    quest.recordRefinement();
    expect(inventory.primevalStones).toBe(25);
    expect(quest.completeChapter(new Cultivator()).success).toBe(true);
    expect(inventory.primevalStones).toBe(55);
    expect(quest.state.questRewardClaimed).toBe(true);
  });

  it('supports chapter 2 wolf extermination & herb gathering progression', () => {
    const inventory = new InventorySystem();
    const quest = new QuestSystem(inventory, {
      questCount: 3, hasRefinedGu: true, questRewardClaimed: true, chapter: 2,
    });
    expect(quest.currentChapter.chapter).toBe(2);
    expect(quest.currentChapter.isComplete).toBe(false);

    // Hunt 2 wolves
    quest.recordWolfKill();
    quest.recordWolfKill();
    // Gather 3 herbs
    quest.recordHerbCollect();
    quest.recordHerbCollect();
    quest.recordHerbCollect();

    expect(quest.currentChapter.isComplete).toBe(true);
    const stonesBefore = inventory.primevalStones;
    const player = new Cultivator();
    player.advanceRealm('Nhất Chuyển Trung Giai');
    const claimed = quest.completeChapter(player);
    expect(claimed.success).toBe(true);
    expect(inventory.primevalStones).toBe(stonesBefore + 45);

    // Advance to Chapter 3
    quest.advanceToNextChapter();
    expect(quest.currentChapter.chapter).toBe(3);
    expect(quest.currentChapter.title).toContain('Hùng Vương');
  });

  it('supports chapter 3 elite bear boss slaying and grants Tier 2 Gu reward', () => {
    const inventory = new InventorySystem();
    const quest = new QuestSystem(inventory, {
      questCount: 3, hasRefinedGu: true, questRewardClaimed: true, chapter: 3,
    });
    expect(quest.currentChapter.isComplete).toBe(false);
    quest.recordBearKill();
    expect(quest.currentChapter.isComplete).toBe(true);

    const player = new Cultivator();
    player.advanceRealm('Nhất Chuyển Cao Giai');
    const claimed = quest.completeChapter(player);
    expect(claimed.success).toBe(true);
    expect(inventory.hasGu('moonblade')).toBe(true);
  });
});

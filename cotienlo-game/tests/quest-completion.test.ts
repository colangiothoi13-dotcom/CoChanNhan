import {describe,expect,it} from 'vitest';
import {QuestSystem} from '../src/systems/QuestSystem';
import {InventorySystem} from '../src/systems/InventorySystem';
import {Cultivator} from '../src/entities/Cultivator';

describe('atomic local chapter completion',()=>{
  it.each(['hunt-first','refine-first'])('waits for explicit completion, then grants realm and stones once (%s)',order=>{
    const inventory=new InventorySystem();const quest=new QuestSystem(inventory);const player=new Cultivator();
    if(order==='refine-first')quest.recordRefinement();
    for(let i=0;i<3;i++)quest.recordSnakeKill();
    quest.recordRefinement();
    expect(inventory.primevalStones).toBe(40);expect(quest.currentChapter.rewardClaimed).toBe(false);expect(player.realm).toBe('Nhất Chuyển Sơ Giai');
    expect(quest.completeChapter(player).success).toBe(true);expect(inventory.primevalStones).toBe(70);expect(player.realm).toBe('Nhất Chuyển Trung Giai');
    expect(quest.completeChapter(player).success).toBe(false);expect(inventory.primevalStones).toBe(70);
  });
  it('does not pay a constructor reward for an unpaid legacy objective',()=>{
    const inventory=new InventorySystem();const quest=new QuestSystem(inventory,{questCount:3,hasRefinedGu:true});expect(inventory.primevalStones).toBe(25);expect(quest.currentChapter.rewardClaimed).toBe(false);
  });
  it('repairs a previously paid missing realm without adding stones or reviving a dead life',()=>{
    const inventory=new InventorySystem();const player=new Cultivator();player.hp=0;player.mp=17;
    const quest=new QuestSystem(inventory,{chapter:1,questCount:3,hasRefinedGu:true,questRewardClaimed:true});
    expect(quest.reconcileRealm(player)).toBe(true);expect(player.realm).toBe('Nhất Chuyển Trung Giai');expect(player.hp).toBe(0);expect(player.mp).toBe(17);expect(inventory.primevalStones).toBe(25);
    expect(quest.reconcileRealm(player)).toBe(false);expect(inventory.primevalStones).toBe(25);
  });
  it('charges 50 and grants 80 only together with a valid rank-two breakthrough',()=>{
    const inventory=new InventorySystem();inventory.addGu('moonblade');inventory.primevalStones=50;const player=new Cultivator();player.advanceRealm('Nhất Chuyển Đỉnh Phong');
    const quest=new QuestSystem(inventory,{chapter:4,questCount:0});
    expect(quest.completeChapter(player).success).toBe(true);expect(player.realm).toBe('Nhị Chuyển Sơ Giai');expect(inventory.primevalStones).toBe(80);expect(quest.currentChapter.rewardClaimed).toBe(true);
    expect(quest.completeChapter(player).success).toBe(false);expect(inventory.primevalStones).toBe(80);
    inventory.primevalStones=0;expect(quest.advanceToNextChapter()).toBe(true);expect(quest.chapter).toBe(5);
  });
  it.each([49,0])('leaves everything unchanged when breakthrough funds are insufficient (%s)',stones=>{
    const inventory=new InventorySystem();inventory.addGu('moonblade');inventory.primevalStones=stones;const player=new Cultivator();player.advanceRealm('Nhất Chuyển Đỉnh Phong');const quest=new QuestSystem(inventory,{chapter:4,questCount:0});const before=quest.state;
    expect(quest.completeChapter(player).success).toBe(false);expect(inventory.primevalStones).toBe(stones);expect(player.realm).toBe('Nhất Chuyển Đỉnh Phong');expect(quest.state).toEqual(before);
  });
  it('cannot skip a completed chapter before its reward and realm have been applied',()=>{
    const quest=new QuestSystem(new InventorySystem(),{chapter:2,questCount:0,wolfKills:2,herbsCollected:2});expect(quest.currentChapter.isComplete).toBe(true);expect(quest.advanceToNextChapter()).toBe(false);expect(quest.chapter).toBe(2);
  });
  it('preserves historical assets when repairing the old already-paid chapter-four banner path',()=>{
    const inventory=new InventorySystem();inventory.primevalStones=130;const player=new Cultivator();const quest=new QuestSystem(inventory,{chapter:5,questCount:0});expect(quest.reconcileRealm(player)).toBe(true);expect(player.realm).toBe('Nhị Chuyển Sơ Giai');expect(inventory.primevalStones).toBe(130);
  });
});


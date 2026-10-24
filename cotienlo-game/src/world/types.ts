import type { ResourceAction, ResourceSnapshot } from '../../shared/resource-core.mjs';

export type Skill = 'care' | 'combat' | 'survival' | 'insight' | 'refinement' | 'diplomacy';

export interface Region { id: string; name: string; subtitle: string; color: string }
export interface Place {
  id: string; regionId: string; name: string; summary: string; resource: string;
  secret: string; returnReason: string; neighbors: string[]; skill: Skill;
}
export interface TrialChoice {
  id: string; label: string; hint: string; energyCost: number; supplyCost: number;
  requiredSkill?: number;
}
export interface TrialStage { id: string; title: string; text: string; choices: TrialChoice[] }
export interface Inheritance {
  id: string; name: string; placeId: string; skill: Skill; minRank: number;
  origin: string; clue: string; requirement: string; commitment: string;
  success: string; failure: string; reward: string; consequence: string;
  uniqueGu?: string;
}
export interface Legend {
  id: string; title: string; source: string; text: string;
  choices: { id: string; label: string; hint: string }[];
}
export interface Origin { id: string; name: string; placeId: string; description: string; skill: Skill; spawnPlaceIds?: string[] }
export interface JournalEntry { id: string; title: string; text: string; day: number }
export interface PastLife { id: string; number: number; originId: string; cause: string; placeId: string; rank: number; day: number }
export interface ActiveTrial {
  inheritanceId: string; stageIndex: number; stage: TrialStage;
  danger: number; deadlineAt: number; pauseRemainingMs: number;
}
export interface WorldLife {
  id: string; number: number; name: string; originId: string; placeId: string;
  hp: number; energy: number; supplies: number; stones: number; rank: number;
  skills: Record<Skill, number>; discovered: string[]; investigated: string[];
  learned: string[]; gu: string[]; dead: boolean; cause: string | null;
  trained: string[]; lessons: string[];
  trial: ActiveTrial | null;
  resources?: ResourceSnapshot;
}
export interface WorldSnapshot {
  world: { id: string; name: string; day: number; revision: number };
  account: { id: string; name: string; journal: JournalEntry[]; pastLives: PastLife[]; verified?: boolean };
  life: WorldLife;
  catalog: { regions: Region[]; places: Place[]; inheritances: Inheritance[]; legends: Legend[]; origins: Origin[] };
  inheritanceStates: Record<string, { bonusRemaining: number; reservedBy: string | null; completedBy: string[] }>;
  immortals: { typeId: string; name: string; instanceId: string; rank: number; owner: string; status: 'held' | 'reserved' | 'destroyed' }[];
  events: { id: string; day: number; text: string }[];
  presence: { name: string; placeId: string; lifeNumber: number }[];
  remains: { id: string; placeId: string; stones: number; supplies: number; gu: string[] }[];
  serverTime: number;
}
export type WorldAction =
  | { type: 'resource'; payload: ResourceAction }
  | { type: 'academy'; payload: { facilityId: string; option: string; guId?: string; heavenQi?: number; earthQi?: number } }
  | { type: 'travel'; payload: { placeId: string; route: 'road' | 'trail' } }
  | { type: 'investigate'; payload: Record<string, never> }
  | { type: 'work'; payload: Record<string, never> }
  | { type: 'rest'; payload: Record<string, never> }
  | { type: 'train'; payload: { skill: Skill } }
  | { type: 'commit'; payload: { inheritanceId: string; acceptDeath: true } }
  | { type: 'choose'; payload: { stageId: string; choiceId: string } }
  | { type: 'rebirth'; payload: { originId: string } }
  | { type: 'loot'; payload: { remainsId: string } }
  | { type: 'lesson'; payload: { legendId: string; choiceId: string } };
export interface WorldCommand { operationId: string; lifeId: string; action: WorldAction }
export type ConnectionState = 'idle' | 'connecting' | 'online' | 'offline';
export interface WorldClientState {
  snapshot: WorldSnapshot | null; connection: ConnectionState; busy: boolean;
  error: string | null; pending: boolean;
}

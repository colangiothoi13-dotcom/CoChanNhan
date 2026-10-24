export type CultivationRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type MortalSubrealm = 'initial' | 'middle' | 'upper' | 'peak';
export type GuTypeId = 'moonlight' | 'bronze' | 'boar' | 'heal' | 'moonblade' | 'ironskin' | 'smalllight' | 'moonbeam' | 'starfirefly';
export interface GuInstance {
  id:string;typeId:GuTypeId;rank:CultivationRank;ownerLifeId:string;alive:boolean;controlled:boolean;mastery:number;
  holderLifeId?:string;controllerLifeId?:string|null;authorizedLifeIds?:string[];healthBps?:number;vitalForLifeId?:string|null;
  willBps?:number;tamingProgressBps?:number;oldControllerLifeId?:string|null;storage?:'bag'|'vault'|'preservation'|'aperture';
  lock?:{kind:'refining'|'listed'|'transport';id:string}|null;
  starterGrantLifeId?:string;
  tamingByLifeId?:string|null;
  feeding?:{remainingMs:number;lastClockMs:number;state:'fed'|'due-soon'|'hungry'|'weak'|'critical'|'dead'};
}
export interface MortalAperture {
  capacityBps: number; amountBps: number; essence: { quality: number; amountBps: number }[];
  wall: 'stable' | 'strained' | 'shattered'; wallProgress: number;
  recoveryRemainder: number; cultivationRemainderMs: number;
}
export interface ImmortalAperture {
  ownerLifeId: string; kind: string; units: number; apertureKind: 'blessed-land' | 'grotto-heaven';
  reserves: { ownerLifeId: string; kind: string; units: number }[];
  innerMs: number; timeRatio: number; habitatBps: number; productionRemainderMs: number;
  nextTribulationAtInnerMs: number; pendingTribulation: { dueInnerMs: number; kind: 'earth' | 'heaven' | 'grand' | 'myriad'; major: boolean } | null;
  passedMajorTribulations: number; passedTribulations: number;
}
export interface CultivationState {
  version: 1; lifeId: string; rank: CultivationRank; subrealm: MortalSubrealm | null; aptitudeBps: number;
  mortal: MortalAperture | null; immortal: ImmortalAperture | null;
  guInstances: GuInstance[]; nextGuSequence: number; firstGuClaimed: boolean;
  activity: { kind: 'taming'; guInstanceId: string; startedAt: number; completeAt: number } | { kind: 'cultivating'; startedAt: number } | null;
  ascension: { stage: 'shattered' | 'balanced'; humanQi: number; heavenQi: number; earthQi: number } | null;
  pathAttainment: Record<string, number>; daoMarks: Record<string, number>;
  body: { woundBps: number }; soul: { strength: number; woundBps: number };
  alive: boolean; ageMs: number; lifespanMs: number; lastAdvancedAt: number;
}
export interface CultivationStats {
  maxHp: number; maxMp: number; mp: number; maxStamina: number; moveSpeed: number; physicalDamage: number; defense: number;
  rankLabel: string; subrealmLabel: string | null;
  energy: { kind: string; label: string; unit: 'whole-aperture-bps' | 'immortal-unit'; current: number; capacity: number; quality: number; reserves?: { ownerLifeId: string; kind: string; units: number }[] };
}
export interface GuDefinition {
  readonly name: string; readonly rank: CultivationRank; readonly path: string; readonly primevalCostBps: number; readonly immortalCostUnits: number;
  readonly cooldownMs: number; readonly purchaseStones: number | null; readonly damage: number; readonly healing: number;
  readonly durationMs: number; readonly shieldReduction: number; readonly speedMultiplier: number; readonly passiveDefense?: number;
}
export interface RankProfile {
  readonly rank: CultivationRank; readonly name: string; readonly energyKind: string; readonly energyLabel: string;
  readonly apertureKind: 'mortal' | 'blessed-land' | 'grotto-heaven'; readonly maxHp: number; readonly physicalDamage: number;
  readonly defense: number; readonly moveSpeed: number; readonly maxStamina: number; readonly balance: 'proposed-game-balance';
}
export interface AcademyAction {
  option: 'claim-gu' | 'buy-gu' | 'tame-gu' | 'cultivate' | 'stop-cultivating' | 'breakthrough' | 'ascend-shatter' | 'ascend-absorb' | 'ascend-release' | 'resolve-tribulation';
  guId?: string; heavenQi?: number; earthQi?: number;
}
export class CultivationError extends Error { code: string; constructor(code: string, message: string) }
export const CULTIVATION_BALANCE: Readonly<{
  basis: 'proposed-game-balance'; fullApertureBps: number; tamingMs: number; tamingStones: number; tamingCostBps: number;
  cultivationCostPerSecondBps: number; cultivationWallPerSecond: number; safeRecoveryPerSecondBps: number; outerRecoveryPerSecondBps: number;
  breakthroughCostBps: number; breakthroughStones: number; ascensionCostBps: number; ascensionStones: number;
  innerYearMs: number; bodyYearMs: number; initialLifespanYears: number; immortalTimeRatio: number; immortalProductionUnitsPerYear: number;
  majorTribulationsForPromotion: number; rankNineCanonicalRequirements: 'unverified-blocked';
  maxAliveGu:number;maxDeadGuHistory:number;
}>;
export const GU_DEFINITIONS: Readonly<Record<GuTypeId, GuDefinition>>;
export const RANK_PROFILES: readonly RankProfile[];
export function rankProfile(rank: number): RankProfile;
export function createCultivationState(options: { lifeId: string; rank?: number; aptitudeBps?: number; now?: number; legacyGuIds?: readonly string[] }): CultivationState;
export function migrateCultivationState(raw: unknown, options: { lifeId: string; rank?: number; guIds?: readonly string[]; now?: number }): CultivationState;
export function validateCultivationState(state: unknown): true;
export function addGuInstance(state: CultivationState, typeId: string, options?: { controlled?: boolean; rank?: number; ownerLifeId?: string; mastery?: number }): GuInstance;
export function ownedGuIds(state: CultivationState): GuTypeId[];
export function usableGuIds(state: CultivationState): GuTypeId[];
export function canUseGuInstance(state:CultivationState,gu:GuInstance):boolean;
export function compactGuHistory(state:CultivationState):void;
export function deriveCultivationStats(state: CultivationState): CultivationStats;
export function spendPrimeval(state: CultivationState, costBps: number, requiredQuality?: number): number;
export function spendImmortal(state:CultivationState,units?:number,requiredGuRank?:number):{units:number;kind:string};
export interface CombatContext { guRank?: number; baseDamage?: number; baseHealing?: number; path?: string; mastery?: number; targetDefense?: number; targetRank?: number; counter?: number; externalPower?: number; energyQuality?: number }
export interface CombatEffect { damage: number; healing: number; factor: number; log: string[] }
export function resolveCombatEffect(state: CultivationState, context?: CombatContext): CombatEffect;
export function useGu(state: CultivationState, typeId: string, context?: CombatContext): CombatEffect & { ok: true; guId: string; shieldReduction: number; durationMs: number; speedMultiplier: number; primevalSpentBps: number; immortalSpentUnits: number; immortalSpentKind: string | null };
export function advanceCultivation(state: CultivationState, now: number, context?: { inSanctuary?: boolean }): { changed: boolean; critical: boolean; code?: string };
export function applyAcademyAction(state: CultivationState, action: AcademyAction, context: { now: number; stones: number; inSanctuary?: boolean; canAscend?: boolean }): { stones: number; code: string; dead?: boolean };

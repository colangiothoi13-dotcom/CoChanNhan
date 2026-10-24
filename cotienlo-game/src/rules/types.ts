/** These rules run in an isolated teaching simulation, never in either live save. */
export const SIM_YEAR_TICKS = 1000;
export const FULL_APERTURE_BPS = 10_000;
export const PROPOSED_TIME_RATIOS = [1, 10, 20, 30] as const;
export const DEMO_IDS = {
  mortal: 'mortal', borrower: 'borrower', ascender: 'ascender', immortal: 'immortal',
  aperture: 'demo-aperture', moonGu: 'demo-moon', boarGu: 'demo-boar', wineGu: 'demo-wine',
  ascensionGu: 'ascension-moon', secondMoonGu: 'second-moon', secondBoarGu: 'second-boar',
  recipe6: 'mirror-six', recipe7: 'mirror-seven', immortalType: 'lab-mirror',
} as const;

export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type MortalSubrealm = 'initial' | 'middle' | 'upper' | 'peak';
export type ApertureGrade = 'lower' | 'middle' | 'upper' | 'special';
export type TribulationKind = 'earth' | 'heaven' | 'grand' | 'myriad';
export type FailureCategory = 'validation' | 'permission' | 'resources' | 'unique' | 'technical' | 'natural';
export const SUBREALM_LABELS: Record<MortalSubrealm, string> = {
  initial: 'Sơ giai', middle: 'Trung giai', upper: 'Cao giai', peak: 'Đỉnh phong',
};
export const RANK_ENERGY_LABELS: Record<Rank, string> = {
  1: 'Chân nguyên thanh đồng', 2: 'Chân nguyên xích thiết', 3: 'Chân nguyên bạch ngân',
  4: 'Chân nguyên hoàng kim', 5: 'Chân nguyên tử tinh', 6: 'Tiên nguyên thanh đề',
  7: 'Tiên nguyên hồng táo', 8: 'Tiên nguyên bạch lệ', 9: 'Tiên nguyên hoàng hạnh',
};
export const TRIBULATION_LABELS: Record<TribulationKind, string> = {
  earth: 'Địa tai', heaven: 'Thiên kiếp', grand: 'Hạo kiếp', myriad: 'Vạn kiếp',
};

export interface EssenceBucket { quality: number; amountBps: number }
export interface MortalAperture {
  id: string; capacityBps: number; amountBps: number; essence: EssenceBucket[];
  wall: 'stable' | 'strained' | 'shattered'; wallProgress: number;
  recoveryRemainder: number; pressureRemainder: number;
  tenExtreme: { pressure: number; suppressedUntilAge: number } | null;
}
export interface RulesActor {
  id: string; name: string; rank: Rank; subrealm: MortalSubrealm | null;
  aptitudeBps: number; ageTicks: number; lifespanTicks: number; alive: boolean; hp: number;
  stones: number; location: 'outer' | string; mortal: MortalAperture | null;
  immortalEssence: { ownerId: string; kind: string; units: number } | null;
  ascension: { stage: 'shattered' | 'balanced'; humanQi: number; heavenQi: number; earthQi: number } | null;
}
export interface GuInstance {
  id: string; typeId: string; name: string; rank: Rank; immortal: boolean; alive: boolean;
  ownerId: string; holderId: string | null; location: { kind: 'actor' | 'aperture' | 'refinement' | 'remains' | 'destroyed'; id: string };
  controllerId: string; vitalApertureId: string | null;
}
export interface GuGrant { instanceId: string; ownerId: string; granteeId: string; revoked: boolean }
export interface RefinementJob {
  id: string; actorId: string; recipeId: string; inputIds: string[]; outputRank: Rank;
  status: 'working' | 'succeeded' | 'failed'; failure: FailureCategory | null;
}
export interface Ecology {
  water: number; food: number; plants: number; plantCapacity: number; habitatBps: number;
  /** Proposed balance per completed simulated inner year. */
  growthPerYear: number; foodDemandPerYear: number; shortageYears: number;
}
export interface RulesAperture {
  id: string; ownerId: string; grade: ApertureGrade; rank: 6 | 7 | 8 | 9;
  innerTicks: number; lastOuterTicks: number; ratio: number; placed: boolean;
  daoMarks: number; ecology: Ecology;
}
export interface Tribulation {
  id: string; apertureId: string; kind: TribulationKind; dueInnerYear: number;
  status: 'pending' | 'passed' | 'failed'; habitatDamageBps: number;
}
export interface RuleEvent { type: string; message: string }
export interface RuleOutcome { ok: boolean; code: string; message: string; category?: FailureCategory; jobId?: string; instanceId?: string; apertureId?: string }
export interface RulesSnapshot {
  metadata: { mode: 'isolated-rules-lab'; version: 1; balance: 'proposed'; yearTicks: number; notice: string };
  revision: number; outerTicks: number;
  actors: Record<string, RulesActor>; gu: Record<string, GuInstance>; grants: GuGrant[];
  jobs: Record<string, RefinementJob>; reservations: Record<string, string>;
  apertures: Record<string, RulesAperture>; tribulations: Tribulation[];
}

export type RuleAction =
  | { type: 'spend-primeval'; actorId: string; costBps: number; requiredQuality?: number }
  | { type: 'refine-quality'; actorId: string; inputBps: number }
  | { type: 'cultivate'; actorId: string }
  | { type: 'breakthrough'; actorId: string }
  | { type: 'suppress-extreme'; actorId: string }
  | { type: 'grant-use'; actorId: string; instanceId: string; granteeId: string; handOver?: boolean }
  | { type: 'revoke-use'; actorId: string; instanceId: string; granteeId: string }
  | { type: 'use-gu'; actorId: string; instanceId: string }
  | { type: 'destroy-gu'; actorId: string; instanceId: string }
  | { type: 'start-refinement'; actorId: string; recipeId: string; inputIds: string[] }
  | { type: 'finish-refinement'; jobId: string; techniqueScore: number }
  | { type: 'ascend'; actorId: string; step: 'shatter' | 'absorb' | 'release'; heavenQi?: number; earthQi?: number; instanceId?: string }
  /** Absolute target; at most 100 simulated outer years beyond the current clock. */
  | { type: 'advance-time'; outerTicks: number }
  | { type: 'change-ratio'; apertureId: string; ratio: number }
  | { type: 'set-aperture-placed'; apertureId: string; placed: boolean }
  | { type: 'enter-aperture'; actorId: string; apertureId: string }
  | { type: 'leave-aperture'; actorId: string }
  | { type: 'supply-ecology'; actorId: string; apertureId: string; water: number }
  | { type: 'resolve-tribulation'; actorId: string; tribulationId: string; defend: boolean };
export interface RuleCommand { operationId: string; expectedRevision?: number; action: RuleAction }
export interface RuleResult { snapshot: RulesSnapshot; outcome: RuleOutcome; events: RuleEvent[] }
export interface DemoOptions {
  aptitudeBps?: number; extremePressure?: number; ratio?: number;
  /** Test/lab-only random source, an integer from 0 through 9999. */
  naturalRollBps?: () => number;
}

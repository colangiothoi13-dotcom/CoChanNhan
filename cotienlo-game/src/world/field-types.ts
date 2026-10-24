import type { MonsterType } from '../entities/Monster';
import type { OverworldFacility } from './Overworld';
import type { CultivationState, CultivationStats } from '../../shared/cultivation-core.mjs';
import type { ResourceSnapshot } from '../../shared/resource-core.mjs';

export type FieldResources = ResourceSnapshot;

export type FieldCombatAction = 'attack' | 'moonlight' | 'moonbeam' | 'bronze' | 'boar' | 'heal' | 'dash';
export type FieldAction = FieldCombatAction | 'refine-moonblade' | 'refine-ironskin';
export interface FieldInput {
  lifeId: string; seq: number; move: { x: number; y: number }; aimAngle: number; action?: FieldAction;
  /** Acknowledgement for optional resource views; never an input to simulation time. */
  resourceClockMs?: number;
}
export interface FieldSnapshot {
  lifeId: string; seq: number; serverTime: number;
  accountName: string; lifeNumber: number; placeId: string; cause: string | null;
  x: number; y: number; facing: number; hp: number; mp: number; stamina: number;
  maxHp: number; maxMp: number; maxStamina: number; stones: number; dead: boolean; regionId: string;
  guIds: string[];
  usableGuIds?: string[];
  cultivation?: CultivationState;
  cultivationStats?: CultivationStats;
  resources?: ResourceSnapshot;
  facilities?: OverworldFacility[];
  combatLog?: string[];
  cooldowns: Record<Exclude<FieldCombatAction, 'moonbeam'>, number> & { moonbeam?: number };
  buffs: { bronze: number; boar: number; heal: number; dash: number };
  monsters: { id: string; type: MonsterType; x: number; y: number; hp: number; maxHp: number; state: 'patrol' | 'chase' | 'attack' | 'hurt' | 'dead' }[];
  projectiles: { id: string; type: 'slash' | 'moonlight'; x: number; y: number; angle: number; vx: number; vy: number; life: number }[];
  nearbyPlayers: { accountId: string; name: string; x: number; y: number; facing: number }[];
  nearbyPlaces?: { id: string; name: string; regionId?: string; x: number; y: number }[];
  actionResult?: { ok: boolean; code: string } | null;
}

export function isFieldSnapshot(value: unknown): value is FieldSnapshot {
  if (!value || typeof value !== 'object') return false;
  const state = value as FieldSnapshot;
  return typeof state.lifeId === 'string' && Number.isSafeInteger(state.seq) && state.seq >= 0
    && [state.x, state.y, state.hp, state.mp, state.stamina, state.facing, state.serverTime, state.maxHp, state.maxMp, state.maxStamina, state.stones].every(Number.isFinite)
    && typeof state.dead === 'boolean' && typeof state.regionId === 'string'
    && Array.isArray(state.guIds) && state.guIds.every(id => typeof id === 'string')
    && (state.usableGuIds === undefined || Array.isArray(state.usableGuIds) && state.usableGuIds.every(id => typeof id === 'string' && state.guIds.includes(id)))
    && !!state.cooldowns && !!state.buffs
    && ['attack', 'moonlight', 'bronze', 'boar', 'heal', 'dash'].every(key => Number.isFinite(state.cooldowns[key as FieldCombatAction]))
    && Array.isArray(state.monsters) && state.monsters.length <= 192
    && state.monsters.every(m => ['snake', 'wolf', 'elite_bear', 'centipede'].includes(m.type) && [m.x, m.y, m.hp, m.maxHp].every(Number.isFinite))
    && Array.isArray(state.projectiles) && state.projectiles.length <= 128
    && state.projectiles.every(p => ['slash', 'moonlight'].includes(p.type) && [p.x, p.y, p.angle, p.vx, p.vy].every(Number.isFinite))
    && Array.isArray(state.nearbyPlayers) && state.nearbyPlayers.length <= 128;
}

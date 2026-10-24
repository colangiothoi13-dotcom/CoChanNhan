import { checkWorldCollision as geometryCollision, getNearbyEncounters, getRegionAt, isInsideSanctuary, worldDimensions, OVERWORLD_HUBS, generateChunk, DEFAULT_WORLD_SEED } from '../shared/overworld-core.mjs';
import { randomInt } from 'node:crypto';
import { deriveCultivationStats, ownedGuIds, usableGuIds, useGu, advanceCultivation, addGuInstance, GU_DEFINITIONS } from '../shared/cultivation-core.mjs';

export const FIELD_GU_IDS = Object.freeze(['moonlight', 'bronze', 'boar', 'heal']);
const ACTIONS = new Set(['attack', ...FIELD_GU_IDS, 'moonbeam', 'dash', 'refine-moonblade', 'refine-ironskin']);
const KEYS = new Set(['lifeId', 'seq', 'move', 'aimAngle', 'action', 'resourceClockMs']);
const COOLDOWNS = { attack: 0.35, moonlight: 1, moonbeam: 1.2, bronze: 8, boar: 10, heal: 12, dash: 1.5 };
const COSTS = { attack: 0, moonlight: 15, moonbeam: 18, bronze: 25, boar: 20, heal: 30, dash: 0 };
const MONSTERS = {
  snake: { radius: 16, maxHp: 60, speed: 95, damage: 12, range: 38, aggro: 240, reward: 8 },
  wolf: { radius: 24, maxHp: 110, speed: 130, damage: 20, range: 46, aggro: 280, reward: 12 },
  elite_bear: { radius: 38, maxHp: 300, speed: 85, damage: 30, range: 60, aggro: 340, reward: 24 },
  centipede: { radius: 32, maxHp: 380, speed: 85, damage: 32, range: 60, aggro: 340, reward: 30 },
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const finite = value => typeof value === 'number' && Number.isFinite(value);
export const FIELD_INPUT_HOLD_MS = 350;
export const FIELD_INTEREST_MS = 250;
export const FIELD_MONSTER_LIMIT = 4096;
const CELL = 384;
const MAX_COLD_INTEREST_QUERIES = 8;
function boundedGeometryCache(limit) {
  const chunks = new Map();
  return (cx, cy) => {
    const key = cx + ':' + cy;
    let chunk = chunks.get(key);
    if (!chunk) chunk = generateChunk(cx, cy, DEFAULT_WORLD_SEED);
    chunks.delete(key); chunks.set(key, chunk);
    if (chunks.size > limit) chunks.delete(chunks.keys().next().value);
    return chunk;
  };
}
// Collision chunks have a separate bounded cache: a broad interest query in a
// distant region must not evict every other player's hot collision geometry.
const collisionChunk = boundedGeometryCache(4096);
const interestChunk = boundedGeometryCache(256);
const checkWorldCollision = (x, y, radius = 22) => geometryCollision(x, y, radius, DEFAULT_WORLD_SEED, collisionChunk);
const encounterSectors = new Map();
function nearbySharedEncounters(x, y, allowCold = true) {
  const sx = Math.floor(x / 256), sy = Math.floor(y / 256), key = sx + ':' + sy;
  let encounters = encounterSectors.get(key);
  if (!encounters && !allowCold) return null;
  if (!encounters) encounters = getNearbyEncounters(sx * 256 + 128, sy * 256 + 128, 2000, DEFAULT_WORLD_SEED, interestChunk);
  encounterSectors.delete(key); encounterSectors.set(key, encounters);
  if (encounterSectors.size > 512) encounterSectors.delete(encounterSectors.keys().next().value);
  return encounters.filter(point => Math.hypot(point.x - x, point.y - y) <= 1800);
}
const statsFor = life => life.cultivation ? deriveCultivationStats(life.cultivation) : {
  maxHp: 100, maxMp: 100, maxStamina: 100, mp: life.field?.mp ?? 100,
  moveSpeed: 160, physicalDamage: 25, defense: 0,
};
function syncCultivation(life) {
  if (!life.cultivation) return;
  const stats = statsFor(life);
  life.rank = life.cultivation.rank;
  life.field.mp = stats.mp;
  life.field.guIds = ownedGuIds(life.cultivation);
}
export class FieldError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
function requireField(condition, code, message, status) { if (!condition) throw new FieldError(code, message, status); }

export function validateFieldInput(input, lifeId) {
  requireField(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).every(key => KEYS.has(key)), 'INVALID_FIELD_INPUT', 'Dữ liệu điều khiển không hợp lệ.');
  requireField(input.lifeId === lifeId, 'STALE_LIFE', 'Cuộc đời đã thay đổi. Hãy tải lại nhân vật.', 409);
  requireField(Number.isSafeInteger(input.seq) && input.seq >= 1 && input.move && typeof input.move === 'object' &&
    !Array.isArray(input.move) && Object.keys(input.move).every(key => key === 'x' || key === 'y') &&
    finite(input.move.x) && finite(input.move.y) && Math.abs(input.move.x) <= 1000 && Math.abs(input.move.y) <= 1000 && finite(input.aimAngle) &&
    (input.resourceClockMs === undefined || Number.isSafeInteger(input.resourceClockMs) && input.resourceClockMs >= 0) &&
    (input.action === undefined || ACTIONS.has(input.action)), 'INVALID_FIELD_INPUT', 'Hướng chạy, hướng ngắm hoặc chiêu không hợp lệ.');
}

export function createFieldState(spawn, time, guIds = []) {
  return { version: 1, x: spawn.x, y: spawn.y, regionId: spawn.regionId, hubId: spawn.hubId, facing: 0, aimAngle: 0,
    seq: 0, lastInputAt: time, move: { x: 0, y: 0 }, mp: guIds.length ? 100 : 44, stamina: 100, guIds: [...guIds],
    cooldowns: Object.fromEntries(Object.keys(COOLDOWNS).map(key => [key, 0])),
    buffs: { bronze: 0, boar: 0, heal: 0, dash: 0 }, dashAngle: 0,
    healRate: 15, shieldReduction: 0.55, boarSpeedMultiplier: 1.35,
    monsters: {}, projectiles: [], nextProjectile: 0, actionResult: null };
}

export function validateFieldState(field, life) {
  const stats = life ? statsFor(life) : { maxMp: 1e12, maxStamina: 1e9 };
  requireField(field?.version === 1 && finite(field.x) && finite(field.y) && field.x >= 62 && field.x <= worldDimensions.width - 62 &&
    field.y >= 62 && field.y <= worldDimensions.height - 62 && finite(field.facing) && finite(field.aimAngle) &&
    field.regionId === getRegionAt(field.x, field.y).id && OVERWORLD_HUBS.some(hub => hub.id === field.hubId) &&
    (field.entered === undefined || typeof field.entered === 'boolean') &&
    Number.isSafeInteger(field.seq) && field.seq >= 0 && finite(field.lastInputAt) &&
    finite(field.mp) && field.mp >= 0 && field.mp <= stats.maxMp && finite(field.stamina) && field.stamina >= 0 && field.stamina <= stats.maxStamina &&
    (field.move === undefined || field.move && finite(field.move.x) && finite(field.move.y) && Math.hypot(field.move.x, field.move.y) <= 1.000001) &&
    Array.isArray(field.guIds) && new Set(field.guIds).size === field.guIds.length &&
    field.guIds.every(id => Object.hasOwn(GU_DEFINITIONS, id)) &&
    field.cooldowns && Object.keys(COOLDOWNS).every(id => id === 'moonbeam' && field.cooldowns[id] === undefined || finite(field.cooldowns[id]) && field.cooldowns[id] >= 0 && field.cooldowns[id] <= (id === 'moonlight' ? 1.2 : COOLDOWNS[id])) &&
    field.buffs && ['bronze', 'boar', 'heal', 'dash'].every(id => finite(field.buffs[id]) && field.buffs[id] >= 0 && field.buffs[id] <= 6) &&
    (field.healRate === undefined || finite(field.healRate) && field.healRate >= 0 && field.healRate <= 1e9) &&
    (field.shieldReduction === undefined || finite(field.shieldReduction) && field.shieldReduction >= 0 && field.shieldReduction <= 1) &&
    (field.boarSpeedMultiplier === undefined || finite(field.boarSpeedMultiplier) && field.boarSpeedMultiplier >= 1 && field.boarSpeedMultiplier <= 10) &&
    field.monsters && typeof field.monsters === 'object' && !Array.isArray(field.monsters) && Object.keys(field.monsters).length <= 192 &&
    Array.isArray(field.projectiles) && field.projectiles.length <= 32 && Number.isSafeInteger(field.nextProjectile) && field.nextProjectile >= 0,
  'INVALID_FIELD_STATE', 'Trạng thái bản đồ không hợp lệ.', 500);
  for (const [id, monster] of Object.entries(field.monsters)) {
    const config = MONSTERS[monster.type];
    requireField(config && monster.id === id && [monster.x, monster.y, monster.spawnX, monster.spawnY, monster.hp, monster.cooldown, monster.respawnAt].every(finite) &&
      monster.hp >= 0 && monster.hp <= config.maxHp && monster.cooldown >= 0 && monster.cooldown <= 2 &&
      ['patrol', 'chase', 'attack', 'hurt', 'dead'].includes(monster.state) && (monster.facing === undefined || finite(monster.facing)),
    'INVALID_FIELD_STATE', 'Trạng thái dị thú không hợp lệ.', 500);
  }
  for (const shot of field.projectiles) requireField(['slash', 'moonlight'].includes(shot.type) && typeof shot.id === 'string' &&
    [shot.x, shot.y, shot.angle, shot.vx, shot.vy, shot.life, shot.damage].every(finite) && shot.life > 0 && shot.life <= 2 && shot.damage > 0 && shot.damage <= 1e12 &&
    (shot.hitIds === undefined || Array.isArray(shot.hitIds) && shot.hitIds.length <= 192 && shot.hitIds.every(id => typeof id === 'string')),
  'INVALID_FIELD_STATE', 'Trạng thái đạn không hợp lệ.', 500);
}

function moveWithCollision(body, dx, dy, radius) {
  // Substeps prevent fast dashes from tunnelling through thin scenery.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 10));
  for (let step = 0; step < steps; step++) {
    if (!checkWorldCollision(body.x + dx / steps, body.y, radius)) body.x += dx / steps;
    if (!checkWorldCollision(body.x, body.y + dy / steps, radius)) body.y += dy / steps;
  }
}
function segmentHits(ax, ay, bx, by, target, radius) {
  const dx = bx - ax, dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((target.x - ax) * dx + (target.y - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(target.x - ax - dx * t, target.y - ay - dy * t) <= radius;
}
function cast(life, action, roll) {
  const field = life.field;
  syncCultivation(life);
  const reject = code => { field.actionResult = { ok: false, code }; };
  if (!action) return;
  if (action.startsWith('refine-')) {
    if (life.resources) return reject('RECIPE_MENU_REQUIRED');
    const target = action.slice('refine-'.length);
    const inputs = target === 'moonblade' ? ['moonlight', 'boar'] : ['bronze', 'boar'];
    const price = target === 'moonblade' ? 10 : 15;
    const successThreshold = target === 'moonblade' ? 8500 : 8000;
    if (!isInsideSanctuary(field.x, field.y)) return reject('SANCTUARY_REQUIRED');
    if ((life.cultivation ? ownedGuIds(life.cultivation) : field.guIds).includes(target)) return reject('ALREADY_OWNED');
    if (!inputs.every(id => (life.cultivation ? usableGuIds(life.cultivation) : field.guIds).includes(id))) return reject('GU_REQUIRED');
    if (life.stones < price) return reject('INSUFFICIENT_STONES');
    const result = roll();
    requireField(Number.isInteger(result) && result >= 0 && result < 10000, 'INVALID_RANDOM', 'Không tạo được kết quả luyện Cổ.', 500);
    life.stones -= price; life.starterStonesRemaining = Math.max(0, life.starterStonesRemaining - price);
    if (result < successThreshold) {
      if (life.cultivation) { addGuInstance(life.cultivation, target, { controlled: true }); syncCultivation(life); }
      else field.guIds.push(target);
    }
    field.actionResult = { ok: result < successThreshold, code: result < successThreshold ? 'REFINEMENT_SUCCESS' : 'REFINEMENT_FAILED' };
    return true;
  }
  if (field.cooldowns[action] > 0) return reject('COOLDOWN');
  const upgraded = action === 'moonlight' && (life.cultivation ? usableGuIds(life.cultivation) : field.guIds).includes('moonblade');
  if (action !== 'attack' && action !== 'dash' && !field.guIds.includes(action) && !upgraded) return reject('GU_REQUIRED');
  const cost = upgraded ? 28 : COSTS[action];
  if (!life.cultivation && field.mp < cost) return reject('INSUFFICIENT_MP');
  if (action === 'dash' && field.stamina < 30) return reject('INSUFFICIENT_STAMINA');
  if ((action === 'attack' || action === 'moonlight') && field.projectiles.length >= 32) return reject('PROJECTILE_LIMIT');
  let effect;
  if (life.cultivation && action !== 'attack' && action !== 'dash') {
    try { effect = useGu(life.cultivation, upgraded ? 'moonblade' : action); }
    catch (error) { if (!error.code) throw error; return reject(error.code); }
    syncCultivation(life);
  } else if (!life.cultivation) field.mp -= cost;
  field.cooldowns[action] = upgraded ? 1.2 : COOLDOWNS[action];
  if (action === 'dash') { field.stamina -= 30; field.buffs.dash = 0.22; field.dashAngle = field.facing; }
  else if (action === 'bronze') { field.buffs.bronze = effect ? effect.durationMs / 1000 : 5; field.shieldReduction = effect?.shieldReduction ?? 0.55; }
  else if (action === 'boar') { field.buffs.boar = effect ? effect.durationMs / 1000 : 6; field.boarSpeedMultiplier = effect?.speedMultiplier ?? 1.35; }
  else if (action === 'heal') { field.buffs.heal = effect ? effect.durationMs / 1000 : 3; field.healRate = effect ? effect.healing / Math.max(0.001, field.buffs.heal) : 15; }
  else {
    const speed = action === 'attack' ? 320 : 460;
    const angle = field.aimAngle;
    field.projectiles.push({ id: `${life.id}:shot:${++field.nextProjectile}`, type: action === 'attack' ? 'slash' : 'moonlight',
      x: field.x + Math.cos(angle) * 26, y: field.y + Math.sin(angle) * 26, angle,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: action === 'attack' ? 0.35 : 2,
      damage: (action === 'attack' ? statsFor(life).physicalDamage : effect?.damage ?? (upgraded ? 55 : 32)) + (field.buffs.boar > 0 ? 12 : 0),
      ownerLifeId: life.id, piercing: upgraded || action === 'moonbeam', hitIds: [] });
  }
  field.actionResult = { ok: true, code: 'OK' };
  if (effect?.log) field.combatLog = effect.log;
}

/** Receipt is independent of the service clock. Duplicate packets never recast. */
export function acceptFieldInput(life, input, time, roll = () => randomInt(10000)) {
  validateFieldInput(input, life.id);
  const field = life.field;
  if (input.seq <= field.seq) return { changed: false, critical: false, died: false };
  if (life.dead) throw new FieldError('LIFE_DEAD', 'Cuộc đời này đã kết thúc.', 409);
  if (life.trial) throw new FieldError('TRIAL_ACTIVE', 'Hãy hoàn tất khảo nghiệm trước khi điều khiển nhân vật.', 409);
  const length = Math.max(1, Math.hypot(input.move.x, input.move.y));
  field.seq = input.seq; field.lastInputAt = time;
  field.move = { x: input.move.x / length, y: input.move.y / length };
  field.aimAngle = Math.atan2(Math.sin(input.aimAngle), Math.cos(input.aimAngle));
  if (Math.hypot(field.move.x, field.move.y) > 0) field.facing = Math.atan2(field.move.y, field.move.x);
  field.actionResult = null;
  const critical = !!cast(life, input.action, roll);
  validateFieldState(field, life);
  return { changed: true, critical, died: false };
}

export function createFieldRuntime(time) { return { version: 1, lastTickAt: time, monsters: {} }; }
export function validateFieldRuntime(runtime) {
  requireField(runtime?.version === 1 && finite(runtime.lastTickAt) && runtime.monsters &&
    typeof runtime.monsters === 'object' && !Array.isArray(runtime.monsters) && Object.keys(runtime.monsters).length <= FIELD_MONSTER_LIMIT &&
    (runtime.nextPruneAt === undefined || finite(runtime.nextPruneAt)) &&
    (runtime.interestCursor === undefined || Number.isSafeInteger(runtime.interestCursor) && runtime.interestCursor >= 0),
  'INVALID_FIELD_STATE', 'Thế giới đang chạy không hợp lệ.', 500);
  for (const [id, monster] of Object.entries(runtime.monsters)) {
    const config = MONSTERS[monster.type];
    requireField(config && monster.id === id && [monster.x, monster.y, monster.spawnX, monster.spawnY, monster.hp, monster.cooldown, monster.respawnAt].every(finite) &&
      monster.hp >= 0 && monster.hp <= config.maxHp && monster.cooldown >= 0 && monster.cooldown <= 2 &&
      ['patrol', 'chase', 'attack', 'hurt', 'dead'].includes(monster.state),
    'INVALID_FIELD_STATE', 'Dị thú dùng chung không hợp lệ.', 500);
  }
}

// Both player and monster queries visit a small number of nearby cells.
function spatialIndex(items, position = item => item, cellSize = CELL) {
  const cells = new Map();
  for (const item of items) {
    const point = position(item), key = Math.floor(point.x / cellSize) + ':' + Math.floor(point.y / cellSize);
    const bucket = cells.get(key) ?? []; bucket.push(item); cells.set(key, bucket);
  }
  return (x, y, radius) => {
    const found = [];
    for (let cx = Math.floor((x - radius) / cellSize); cx <= Math.floor((x + radius) / cellSize); cx++)
      for (let cy = Math.floor((y - radius) / cellSize); cy <= Math.floor((y + radius) / cellSize); cy++)
        found.push(...(cells.get(cx + ':' + cy) ?? []));
    return found;
  };
}
function loadSharedEncounters(lives, runtime, time, counters) {
  if (!lives.length || !runtime.nextPruneAt || time >= runtime.nextPruneAt) {
    const playerIndex = spatialIndex(lives, life => life.field, 3200);
    for (const [id, monster] of Object.entries(runtime.monsters)) {
      // A dead spawn is a tombstone until its server respawn time; walking away
      // cannot reset health or mint another kill reward. Pruning runs coarsely,
      // while close-range collision/AI keeps the normal 20Hz service clock.
      if ((monster.hp > 0 || time >= monster.respawnAt) && !playerIndex(monster.x, monster.y, 3200).some(life => distance(life.field, monster) <= 3200)) delete runtime.monsters[id];
    }
    runtime.nextPruneAt = time + 1000;
  }
  let count = Object.keys(runtime.monsters).length;
  let coldQueries = 0;
  const first = lives.length ? (runtime.interestCursor ?? 0) % lives.length : 0;
  for (let index = 0; index < lives.length; index++) {
    const life = lives[(first + index) % lives.length];
    const field = life.field;
    if (field.nextInterestAt > time && field.interestX !== undefined && Math.hypot(field.x - field.interestX, field.y - field.interestY) < 256) continue;
    const key = Math.floor(field.x / 256) + ':' + Math.floor(field.y / 256);
    const cold = !encounterSectors.has(key);
    const encounters = nearbySharedEncounters(field.x, field.y, coldQueries < MAX_COLD_INTEREST_QUERIES);
    // Defer a cold query to the next step without consuming its player's lease.
    // Already loaded sectors are free to refresh, so moving crowds cannot starve
    // established fights while new regions enter the bounded geometry cache.
    if (!encounters) continue;
    if (cold) coldQueries++;
    const phase = [...life.id].reduce((value, character) => (value * 31 + character.charCodeAt(0)) % 100, 0);
    field.nextInterestAt = time + FIELD_INTEREST_MS + phase; field.interestX = field.x; field.interestY = field.y;
    counters.interestQueries++;
    for (const encounter of encounters) {
      const previous = runtime.monsters[encounter.id];
      if (previous && (previous.hp > 0 || time < previous.respawnAt)) continue;
      if (!previous && count >= FIELD_MONSTER_LIMIT) break;
      runtime.monsters[encounter.id] = { ...encounter, spawnX: encounter.x, spawnY: encounter.y,
        hp: MONSTERS[encounter.type].maxHp, state: 'patrol', facing: 0, cooldown: 0, respawnAt: 0 };
      if (!previous) count++;
    }
  }
  runtime.interestCursor = lives.length ? (first + MAX_COLD_INTEREST_QUERIES) % lives.length : 0;
}

/** One service-owned step. All accounts share the same geometry spawn identities. */
export function advanceFieldWorld(lives, runtime, time) {
  const counters = { activePlayers: lives.length, monsters: 0, interestQueries: 0, monsterSteps: 0, projectileChecks: 0 };
  const dt = Math.max(0, Math.min(0.25, (time - runtime.lastTickAt) / 1000));
  const start = time - dt * 1000;
  runtime.lastTickAt = Math.max(runtime.lastTickAt, time);
  if (dt === 0) return { changed: false, critical: false, deaths: [], counters };
  let critical = false;
  for (const life of lives) {
    const field = life.field, stats = statsFor(life), previous = { ...field.buffs };
    const safe = isInsideSanctuary(field.x, field.y);
    for (const id of Object.keys(field.cooldowns)) field.cooldowns[id] = Math.max(0, field.cooldowns[id] - dt);
    for (const id of Object.keys(field.buffs)) field.buffs[id] = Math.max(0, field.buffs[id] - dt);
    if (life.cultivation) {
      const progress = advanceCultivation(life.cultivation, time, { inSanctuary: safe });
      critical ||= progress.critical;
      if (progress.code) field.actionResult = { ok: !['LIFESPAN_EXHAUSTED', 'ACTIVITY_INTERRUPTED'].includes(progress.code), code: progress.code };
      if (!life.cultivation.alive) life.hp = 0;
      syncCultivation(life);
    } else field.mp = Math.min(stats.maxMp, field.mp + dt * (safe ? 19 : 4));
    field.stamina = Math.min(stats.maxStamina, field.stamina + 12 * dt);
    if (life.hp > 0) life.hp = Math.min(stats.maxHp, life.hp + (safe ? 20 * dt : 0) + Math.min(dt, previous.heal) * (field.healRate ?? 15));
    const holdTime = Math.max(0, Math.min(dt, (field.lastInputAt + FIELD_INPUT_HOLD_MS - start) / 1000));
    const move = field.move ?? { x: 0, y: 0 };
    const dashTime = Math.min(dt, previous.dash);
    const speed = stats.moveSpeed * (previous.boar > 0 ? field.boarSpeedMultiplier ?? 1.35 : 1);
    moveWithCollision(field, move.x * speed * Math.max(0, holdTime - dashTime) + Math.cos(field.dashAngle) * 480 * dashTime,
      move.y * speed * Math.max(0, holdTime - dashTime) + Math.sin(field.dashAngle) * 480 * dashTime, 22);
    field.regionId = getRegionAt(field.x, field.y).id;
    // Legacy per-life encounters were migrated to runtime at load, never simulated twice.
    field.monsters = {};
  }
  loadSharedEncounters(lives, runtime, time, counters);
  const monsters = Object.values(runtime.monsters);
  const monsterIndex = spatialIndex(monsters);
  for (const life of lives) {
    const remaining = [];
    for (const shot of life.field.projectiles) {
      const elapsed = Math.min(dt, shot.life), x = shot.x + shot.vx * elapsed, y = shot.y + shot.vy * elapsed;
      let hit = false;
      if (!checkWorldCollision(x, y, 5)) {
        const radius = Math.hypot(x - shot.x, y - shot.y) / 2 + 50;
        for (const monster of monsterIndex((shot.x + x) / 2, (shot.y + y) / 2, radius)) {
          counters.projectileChecks++;
          if (monster.hp <= 0 || shot.hitIds?.includes(monster.id) || !segmentHits(shot.x, shot.y, x, y, monster, MONSTERS[monster.type].radius + 8)) continue;
          monster.hp = Math.max(0, monster.hp - shot.damage); monster.state = monster.hp ? 'hurt' : 'dead'; hit = true;
          (shot.hitIds ??= []).push(monster.id);
          if (!monster.hp) {
            monster.respawnAt = time + 30_000;
            life.stones += MONSTERS[monster.type].reward;
            life.supplies = Math.min(20, life.supplies + 1);
            critical = true;
          }
          if (!shot.piercing) break;
        }
        if (shot.piercing) hit = false;
      } else hit = true;
      shot.x = x; shot.y = y; shot.life -= elapsed;
      if (!hit && shot.life > 0) remaining.push(shot);
    }
    life.field.projectiles = remaining;
  }
  const playerIndex = spatialIndex(lives.filter(life => !isInsideSanctuary(life.field.x, life.field.y)), life => life.field);
  for (const monster of monsters) {
    if (monster.hp <= 0) continue;
    counters.monsterSteps++;
    const config = MONSTERS[monster.type]; monster.cooldown = Math.max(0, monster.cooldown - dt);
    let target, nearest = config.aggro;
    for (const life of playerIndex(monster.x, monster.y, config.aggro)) {
      const range = distance(life.field, monster);
      if (life.hp > 0 && range <= nearest) { target = life; nearest = range; }
    }
    if (target) {
      const field = target.field;
      monster.facing = Math.atan2(field.y - monster.y, field.x - monster.x); monster.state = 'chase';
      if (nearest <= config.range) {
        monster.state = 'attack';
        if (monster.cooldown === 0) {
          const raw = Math.max(0, config.damage - statsFor(target).defense - (!target.cultivation && field.guIds.includes('ironskin') ? 15 : 0));
          target.hp = Math.max(0, target.hp - Math.round(raw * (field.buffs.bronze > 0 ? 1 - (field.shieldReduction ?? 0.55) : 1))); monster.cooldown = 1.2;
        }
      } else {
        const dx = Math.cos(monster.facing) * config.speed * dt, dy = Math.sin(monster.facing) * config.speed * dt;
        if (!isInsideSanctuary(monster.x + dx, monster.y + dy)) moveWithCollision(monster, dx, dy, config.radius);
      }
    } else {
      monster.state = 'patrol';
      const phase = time / 4000 + monster.spawnX * 0.001;
      const destination = { x: monster.spawnX + Math.cos(phase) * 65, y: monster.spawnY + Math.sin(phase) * 65 };
      monster.facing = Math.atan2(destination.y - monster.y, destination.x - monster.x);
      const step = Math.min(config.speed * 0.25 * dt, distance(monster, destination));
      const dx = Math.cos(monster.facing) * step, dy = Math.sin(monster.facing) * step;
      if (!isInsideSanctuary(monster.x + dx, monster.y + dy)) moveWithCollision(monster, dx, dy, config.radius);
    }
  }
  counters.monsters = monsters.length;
  return { changed: true, critical, deaths: lives.filter(life => life.hp <= 0), counters };
}

/** Standalone deterministic harness retained for low-level collision tests. */
export function advanceField(life, input, time, roll = () => randomInt(10000)) {
  validateFieldInput(input, life.id);
  if (input.seq <= life.field.seq) return { changed: false, critical: false, died: false };
  const previous = life.field.lastInputAt;
  const magnitude = Math.max(1, Math.hypot(input.move.x, input.move.y));
  life.field.move = { x: input.move.x / magnitude, y: input.move.y / magnitude };
  life.field.lastInputAt = time;
  const runtime = { ...createFieldRuntime(previous), monsters: life.field.monsters };
  const tick = advanceFieldWorld([life], runtime, time);
  life.field.monsters = runtime.monsters;
  const received = life.hp > 0 ? acceptFieldInput(life, input, time, roll) : { critical: false };
  return { changed: true, critical: tick.critical || received.critical, died: life.hp <= 0 };
}

export function fieldView(life, time, runtime, shots) {
  const field = life.field, stats = statsFor(life);
  return { lifeId: life.id, lifeNumber: life.number, seq: field.seq, x: field.x, y: field.y, facing: field.facing, aimAngle: field.aimAngle,
    hp: life.hp, mp: field.mp, stamina: field.stamina, maxHp: stats.maxHp, maxMp: stats.maxMp, maxStamina: stats.maxStamina, stones: life.stones,
    dead: life.dead, regionId: field.regionId, placeId: life.placeId, cause: life.cause, guIds: [...field.guIds], cooldowns: { ...field.cooldowns }, buffs: { ...field.buffs },
    ...(life.cultivation ? { cultivation: structuredClone(life.cultivation), cultivationStats: stats } : {}),
    combatLog: [...(field.combatLog ?? [])],
    monsters: Object.values(runtime?.monsters ?? field.monsters).filter(monster => distance(field, monster) <= 1600).slice(0, 192).map(monster => ({ id: monster.id, type: monster.type, name: monster.name,
      x: monster.x, y: monster.y, hp: monster.hp, maxHp: MONSTERS[monster.type].maxHp, state: monster.state, facing: monster.facing ?? 0 })),
    projectiles: structuredClone((shots ?? field.projectiles).filter(shot => distance(field, shot) <= 1800).slice(0, 128)), serverTime: time, actionResult: field.actionResult };
}

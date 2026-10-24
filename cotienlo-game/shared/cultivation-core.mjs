/** Shared live-world rules. Every numeric duration/stat is proposed game balance,
 * not a numerical claim about the novel. No browser clock, I/O or randomness. */
export class CultivationError extends Error {
  constructor(code, message) { super(message); this.name = 'CultivationError'; this.code = code; }
}
const requireThat = (condition, code, message) => { if (!condition) throw new CultivationError(code, message); };
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const SUBREALMS = ['initial', 'middle', 'upper', 'peak'];
const SUBREALM_LABELS = ['Sơ giai', 'Trung giai', 'Cao giai', 'Đỉnh phong'];
const freeze = value => Object.freeze(value);
export const CULTIVATION_BALANCE = freeze({
  basis: 'proposed-game-balance', fullApertureBps: 10000,
  tamingMs: 10000, tamingStones: 2, tamingCostBps: 500,
  cultivationCostPerSecondBps: 100, cultivationWallPerSecond: 60,
  safeRecoveryPerSecondBps: 80, outerRecoveryPerSecondBps: 20,
  breakthroughCostBps: 1000, breakthroughStones: 2,
  ascensionCostBps: 3000, ascensionStones: 50,
  innerYearMs: 60000, bodyYearMs: 3600000, initialLifespanYears: 100,
  immortalTimeRatio: 1, immortalProductionUnitsPerYear: 1,
  majorTribulationsForPromotion: 3, rankNineCanonicalRequirements: 'unverified-blocked',
  maxAliveGu: 256, maxDeadGuHistory: 32,
});

const names = ['Nhất chuyển', 'Nhị chuyển', 'Tam chuyển', 'Tứ chuyển', 'Ngũ chuyển', 'Lục chuyển', 'Thất chuyển', 'Bát chuyển', 'Cửu chuyển'];
const energies = ['green-copper', 'red-iron', 'white-silver', 'yellow-gold', 'purple-crystal', 'green-grape', 'red-date', 'white-litchi', 'yellow-apricot'];
const energyLabels = ['Chân nguyên thanh đồng', 'Chân nguyên xích thiết', 'Chân nguyên bạch ngân', 'Chân nguyên hoàng kim', 'Chân nguyên tử tinh', 'Tiên nguyên thanh đề', 'Tiên nguyên hồng táo', 'Tiên nguyên bạch lệ', 'Tiên nguyên hoàng hạnh'];
const hp = [100, 135, 180, 245, 330, 660, 1050, 1700, 3000];
const physical = [6, 7, 9, 12, 15, 18, 22, 28, 40];
const defense = [0, 2, 4, 7, 10, 18, 28, 45, 75];
export const RANK_PROFILES = freeze(names.map((name, i) => freeze({
  rank: i + 1, name, energyKind: energies[i], energyLabel: energyLabels[i],
  apertureKind: i < 5 ? 'mortal' : i < 7 ? 'blessed-land' : 'grotto-heaven',
  maxHp: hp[i], physicalDamage: physical[i], defense: defense[i],
  moveSpeed: 160 + i * 8, maxStamina: 100, balance: 'proposed-game-balance',
})));
export function rankProfile(rank) {
  requireThat(integer(rank, 1, 9), 'INVALID_RANK', 'Tu vi cần từ nhất đến cửu chuyển.');
  return RANK_PROFILES[rank - 1];
}
export const GU_DEFINITIONS = freeze({
  moonlight: freeze({ name: 'Nguyệt Quang Cổ', rank: 1, path: 'moon', primevalCostBps: 1000, immortalCostUnits: 1, cooldownMs: 1000, purchaseStones: 12, damage: 32, healing: 0, durationMs: 0, shieldReduction: 0, speedMultiplier: 1 }),
  bronze: freeze({ name: 'Thanh Đồng Giáp Cổ', rank: 1, path: 'metal', primevalCostBps: 1500, immortalCostUnits: 1, cooldownMs: 8000, purchaseStones: 14, damage: 0, healing: 0, durationMs: 5000, shieldReduction: 0.55, speedMultiplier: 1 }),
  boar: freeze({ name: 'Bạch Trư Cổ', rank: 1, path: 'strength', primevalCostBps: 1500, immortalCostUnits: 1, cooldownMs: 10000, purchaseStones: 14, damage: 0, healing: 0, durationMs: 6000, shieldReduction: 0, speedMultiplier: 1.35 }),
  heal: freeze({ name: 'Thảo Hoàn Cổ', rank: 1, path: 'wood', primevalCostBps: 2000, immortalCostUnits: 1, cooldownMs: 12000, purchaseStones: 16, damage: 0, healing: 90, durationMs: 6000, shieldReduction: 0, speedMultiplier: 1 }),
  moonblade: freeze({ name: 'Nguyệt Nhận Cổ', rank: 2, path: 'moon', primevalCostBps: 1800, immortalCostUnits: 1, cooldownMs: 1200, purchaseStones: null, damage: 55, healing: 0, durationMs: 0, shieldReduction: 0, speedMultiplier: 1 }),
  ironskin: freeze({ name: 'Thiết Bì Cổ', rank: 2, path: 'metal', primevalCostBps: 0, immortalCostUnits: 0, cooldownMs: 0, purchaseStones: null, damage: 0, healing: 0, durationMs: 0, shieldReduction: 0, speedMultiplier: 1, passiveDefense: 15 }),
  smalllight: freeze({ name: 'Tiểu Quang Cổ', rank: 1, path: 'light', primevalCostBps: 400, immortalCostUnits: 1, cooldownMs: 4000, purchaseStones: 5, damage: 0, healing: 0, durationMs: 4000, shieldReduction: 0, speedMultiplier: 1 }),
  moonbeam: freeze({ name: 'Nguyệt Mang Cổ', rank: 2, path: 'moon', primevalCostBps: 1800, immortalCostUnits: 1, cooldownMs: 1100, purchaseStones: null, damage: 60, healing: 0, durationMs: 0, shieldReduction: 0, speedMultiplier: 1 }),
  starfirefly: freeze({ name: 'Tinh Huỳnh Cổ', rank: 1, path: 'star', primevalCostBps: 300, immortalCostUnits: 1, cooldownMs: 5000, purchaseStones: 7, damage: 0, healing: 0, durationMs: 5000, shieldReduction: 0, speedMultiplier: 1 }),
});

const quality = state => (state.rank - 1) * 4 + SUBREALMS.indexOf(state.subrealm) + 1;
const sumEssence = aperture => aperture.essence.reduce((total, b) => total + b.amountBps, 0);
const syncEssence = aperture => { aperture.essence = aperture.essence.filter(b => b.amountBps > 0).sort((a, b) => a.quality - b.quality); aperture.amountBps = sumEssence(aperture); };
function addEssence(aperture, q, amount) {
  amount = Math.min(amount, aperture.capacityBps - aperture.amountBps);
  if (amount <= 0) return;
  const bucket = aperture.essence.find(b => b.quality === q);
  if (bucket) bucket.amountBps += amount; else aperture.essence.push({ quality: q, amountBps: amount });
  syncEssence(aperture);
}
function makeImmortal(lifeId, rank) {
  return { ownerLifeId: lifeId, kind: rankProfile(rank).energyKind, units: 0, reserves: [],
    apertureKind: rankProfile(rank).apertureKind, innerMs: 0, timeRatio: CULTIVATION_BALANCE.immortalTimeRatio,
    habitatBps: 10000, productionRemainderMs: 0, nextTribulationAtInnerMs: CULTIVATION_BALANCE.innerYearMs * 10,
    pendingTribulation: null, passedMajorTribulations: 0, passedTribulations: 0 };
}
export function createCultivationState({ lifeId, rank = 1, aptitudeBps = 4400, now = 0, legacyGuIds = [] }) {
  rankProfile(rank);
  requireThat(typeof lifeId === 'string' && lifeId.length > 0 && lifeId.length <= 200 && integer(now, 0, Number.MAX_SAFE_INTEGER) && integer(aptitudeBps, 2000, 10000), 'INVALID_CULTIVATION', 'Dữ liệu khởi tạo tu luyện không hợp lệ.');
  const mortal = rank <= 5 ? { capacityBps: aptitudeBps, amountBps: aptitudeBps,
    essence: [{ quality: (rank - 1) * 4 + 1, amountBps: aptitudeBps }], wall: 'stable', wallProgress: 0, recoveryRemainder: 0, cultivationRemainderMs: 0 } : null;
  const state = { version: 1, lifeId, rank, subrealm: rank <= 5 ? 'initial' : null,
    aptitudeBps, mortal, immortal: rank >= 6 ? makeImmortal(lifeId, rank) : null,
    guInstances: [], nextGuSequence: 1, firstGuClaimed: false, activity: null, ascension: null,
    pathAttainment: {}, daoMarks: {}, body: { woundBps: 0 }, soul: { strength: 1, woundBps: 0 },
    alive: true, ageMs: 0, lifespanMs: CULTIVATION_BALANCE.bodyYearMs * CULTIVATION_BALANCE.initialLifespanYears,
    lastAdvancedAt: now };
  for (const typeId of new Set(legacyGuIds)) if (GU_DEFINITIONS[typeId]) addGuInstance(state, typeId, { controlled: true });
  if (state.guInstances.length) state.firstGuClaimed = true;
  return state;
}
/** Migration only: existing earned Gu survive loading; a new life never receives them. */
export function migrateCultivationState(raw, { lifeId, rank = 1, guIds = [], now = 0 }) {
  if (raw != null) { validateCultivationState(raw); requireThat(raw.lifeId === lifeId, 'INVALID_CULTIVATION', 'Tu luyện thuộc cuộc đời khác.'); return structuredClone(raw); }
  return createCultivationState({ lifeId, rank, now, legacyGuIds: guIds });
}
export function addGuInstance(state, typeId, { controlled = true, rank = GU_DEFINITIONS[typeId]?.rank, ownerLifeId = state.lifeId, mastery = 0 } = {}) {
  requireThat(GU_DEFINITIONS[typeId] && integer(rank, 1, 9) && integer(mastery, 0, 10000), 'INVALID_GU', 'Cổ trùng không hợp lệ.');
  requireThat(state.guInstances.filter(g=>g.alive).length < CULTIVATION_BALANCE.maxAliveGu, 'GU_CAPACITY', 'Không còn chỗ giữ thêm cá thể Cổ.');
  compactGuHistory(state);
  requireThat(state.guInstances.length<1000,'GU_CAPACITY','Cần giải quyết các cá thể đang khóa trước khi giữ thêm Cổ.');
  const gu = { id: `${state.lifeId}:gu:${state.nextGuSequence++}`, typeId, rank, ownerLifeId, alive: true, controlled: Boolean(controlled), mastery };
  state.guInstances.push(gu); return gu;
}
/** Physical/live/locked instances are never discarded. Terminal records are a
 * bounded display history; the monotonically increasing sequence is untouched. */
export function compactGuHistory(state) {
  const protectedId=state.activity?.guInstanceId;
  const terminal=state.guInstances.filter(gu=>!gu.alive&&!gu.lock&&gu.id!==protectedId);
  if(terminal.length<=CULTIVATION_BALANCE.maxDeadGuHistory)return;
  const retained=new Set(terminal.slice(-CULTIVATION_BALANCE.maxDeadGuHistory).map(gu=>gu.id));
  state.guInstances=state.guInstances.filter(gu=>gu.alive||gu.lock||gu.id===protectedId||retained.has(gu.id));
}
const heldBy = (state, gu) => (gu.holderLifeId ?? gu.ownerLifeId) === state.lifeId;
const ownVitalGu = state => state.guInstances.find(gu => gu.alive && heldBy(state,gu) && gu.controlled &&
  (gu.controllerLifeId === undefined ? gu.ownerLifeId : gu.controllerLifeId) === state.lifeId &&
  gu.vitalForLifeId === state.lifeId && (gu.healthBps ?? 10000) > 0 && !gu.lock && !gu.tamingByLifeId);
export function canUseGuInstance(state, gu) {
  const controller = gu.controllerLifeId === undefined ? gu.controlled ? gu.ownerLifeId : null : gu.controllerLifeId;
  return Boolean(gu.alive && heldBy(state, gu) && gu.controlled && (controller === state.lifeId || gu.authorizedLifeIds?.includes(state.lifeId)) && gu.rank <= state.rank && (gu.healthBps ?? 10000) > 0 && !gu.lock && !gu.tamingByLifeId && !['critical', 'dead'].includes(gu.feeding?.state) && !['vault', 'preservation'].includes(gu.storage));
}
export function ownedGuIds(state) { return [...new Set(state.guInstances.filter(g => g.alive && heldBy(state, g)).map(g => g.typeId))]; }
export function usableGuIds(state) { return [...new Set(state.guInstances.filter(g => canUseGuInstance(state, g)).map(g => g.typeId))]; }
export function deriveCultivationStats(state) {
  const profile = rankProfile(state.rank);
  const mortal = state.mortal;
  const current = mortal?.amountBps ?? state.immortal?.units ?? 0;
  const capacity = mortal?.capacityBps ?? Math.max(1, current);
  const ironskin = state.guInstances.some(g => g.typeId === 'ironskin' && canUseGuInstance(state, g));
  return { maxHp: Math.max(1, Math.floor(profile.maxHp * (1 - state.body.woundBps / 20000))),
    maxMp: mortal ? capacity / 100 : capacity, mp: mortal ? current / 100 : current,
    maxStamina: profile.maxStamina, moveSpeed: profile.moveSpeed,
    physicalDamage: profile.physicalDamage, defense: profile.defense + (ironskin ? 15 : 0),
    rankLabel: profile.name, subrealmLabel: state.subrealm === null ? null : SUBREALM_LABELS[SUBREALMS.indexOf(state.subrealm)],
    energy: { kind: profile.energyKind, label: profile.energyLabel, unit: mortal ? 'whole-aperture-bps' : 'immortal-unit', current, capacity, quality: mortal ? quality(state) : state.rank,
      ...(!mortal ? { reserves: structuredClone(state.immortal?.reserves ?? []) } : {}) } };
}

/** Atomic cost at a reference quality. A higher-quality bucket has greater power;
 * cost never uses the actor's capacity as its denominator. */
function primevalPlan(state, costBps, requiredQuality = 1) {
  requireThat(integer(costBps, 0, 1000000) && integer(requiredQuality, 1, 20), 'INVALID_COST', 'Chi phí chân nguyên không hợp lệ.');
  requireThat(state.mortal && state.mortal.wall !== 'shattered', 'APERTURE_UNAVAILABLE', 'Không khiếu không thể vận chuyển chân nguyên.');
  let remaining = costBps * 4; let spent = 0; let weightedQuality = 0;
  const buckets = structuredClone(state.mortal.essence).sort((a, b) => b.quality - a.quality);
  for (const bucket of buckets) {
    if (bucket.quality < requiredQuality || remaining <= 0) continue;
    const power = 4 + bucket.quality - requiredQuality;
    const amount = Math.min(bucket.amountBps, Math.ceil(remaining / power));
    bucket.amountBps -= amount; remaining -= amount * power; spent += amount; weightedQuality += amount * bucket.quality;
  }
  requireThat(remaining <= 0, 'INSUFFICIENT_ESSENCE', 'Chưa đủ chân nguyên đúng phẩm chất.');
  return { buckets, spent, energyQuality: spent ? weightedQuality / spent : quality(state) };
}
export function spendPrimeval(state, costBps, requiredQuality = 1) {
  const plan = primevalPlan(state, costBps, requiredQuality);
  state.mortal.essence = plan.buckets; syncEssence(state.mortal); return plan.spent;
}
function immortalPlan(state, units, requiredGuRank) {
  const aperture = state.immortal;
  requireThat(aperture?.ownerLifeId === state.lifeId && aperture.kind === rankProfile(state.rank).energyKind, 'ESSENCE_OWNER_MISMATCH', 'Tiên nguyên không thuộc quyền sử dụng.');
  const pools = [...(aperture.reserves ?? []), aperture];
  requireThat(pools.every(p => p.ownerLifeId === state.lifeId), 'ESSENCE_OWNER_MISMATCH', 'Tiên nguyên dự trữ không thuộc quyền sử dụng.');
  const requiredRank = Math.max(6, requiredGuRank);
  const pool = pools.filter(p => energies.indexOf(p.kind) + 1 >= requiredRank && p.units >= units).sort((a, b) => energies.indexOf(a.kind) - energies.indexOf(b.kind))[0];
  requireThat(pool, 'INSUFFICIENT_IMMORTAL_ESSENCE', 'Chưa đủ hạt tiên nguyên đúng loại thuộc bản thân.');
  return { pool, energyQuality: 20 + (energies.indexOf(pool.kind) - 4) * 4 };
}
export function spendImmortal(state,units=1,requiredGuRank=1) {
  requireThat(integer(units,0,1000000000)&&integer(requiredGuRank,1,9),'INVALID_COST','Chi phí tiên nguyên không hợp lệ.');
  const plan=immortalPlan(state,units,requiredGuRank);plan.pool.units-=units;
  return{units,kind:plan.pool.kind};
}

/** Computes a contextual effect, never a win/loss verdict. External power must
 * be supplied by a server-owned formation/Gu-house subsystem, never the client. */
export function resolveCombatEffect(state, { guRank = 1, baseDamage = 0, baseHealing = 0, path = '', mastery = 0, targetDefense, targetRank = 1, counter = 1, externalPower = 1, energyQuality: suppliedEnergyQuality } = {}) {
  const defender = rankProfile(targetRank);
  targetDefense ??= defender.defense;
  requireThat(integer(guRank, 1, 9) && integer(mastery, 0, 10000) && [baseDamage, baseHealing, targetDefense].every(n => Number.isFinite(n) && n >= 0) && Number.isFinite(counter) && counter >= 0 && counter <= 2 && Number.isFinite(externalPower) && externalPower >= 1 && externalPower <= 100, 'INVALID_COMBAT', 'Thông số giao chiến không hợp lệ.');
  const energyQuality = suppliedEnergyQuality ?? (state.rank <= 5 ? quality(state) : 20 + (state.rank - 5) * 4);
  requireThat(Number.isFinite(energyQuality) && energyQuality >= 1 && energyQuality <= 36, 'INVALID_COMBAT', 'Phẩm chất nguyên lực giao chiến không hợp lệ.');
  const required = guRank <= 5 ? (guRank - 1) * 4 + 1 : 20 + (guRank - 5) * 4;
  const energyFactor = 1 + Math.max(0, energyQuality - required) * 0.025;
  const tierFactor = [1, 1.35, 1.8, 2.4, 3.2, 8, 16, 32, 80][guRank - 1];
  const masteryFactor = 1 + mastery / 20000;
  const attainment = Math.max(0, Number(state.pathAttainment[path]) || 0);
  const attainmentFactor = 1 + Math.min(0.5, attainment / 20000);
  const matchingMarks = Math.max(0, Number(state.daoMarks[path]) || 0);
  const conflictingMarks = Object.entries(state.daoMarks).reduce((sum, [markPath, marks]) => sum + (markPath === path ? 0 : marks), 0);
  const daoFactor = 1 + Math.min(4, matchingMarks / 10000);
  const conflictFactor = 1 / (1 + Math.min(3, conflictingMarks / 20000));
  const injuryFactor = Math.max(0.1, 1 - (state.body.woundBps + state.soul.woundBps) / 25000);
  const soulFactor = path === 'soul' ? 1 + Math.min(1, Math.log2(state.soul.strength) / 20) : 1;
  const factor = tierFactor * energyFactor * masteryFactor * attainmentFactor * daoFactor * conflictFactor * soulFactor * injuryFactor * externalPower;
  const damage = Math.max(0, Math.round(baseDamage * factor * counter - targetDefense));
  const healing = Math.max(0, Math.round(baseHealing * energyFactor * masteryFactor * attainmentFactor * conflictFactor * injuryFactor));
  const log = [
    `Cổ ${guRank} chuyển: phương tiện ×${tierFactor}; tu vi ${state.rank} không tự cấp thêm chiêu.`,
    `Phẩm chất nguyên lực ${energyQuality.toFixed(2)} ×${energyFactor.toFixed(2)}; độ thuần thục ×${masteryFactor.toFixed(2)}.`,
    `Cảnh giới đạo ${path || 'không xác định'} ${attainment} ×${attainmentFactor.toFixed(2)}; hồn phách ×${soulFactor.toFixed(2)}.`,
    `Cộng hưởng ${matchingMarks} đạo ngân ${path || 'không xác định'} ×${daoFactor.toFixed(2)}.`,
    `Xung đột đạo ngân khác đạo ${conflictingMarks} ×${conflictFactor.toFixed(2)}.`,
    `Thân/hồn ×${injuryFactor.toFixed(2)}; khắc chế ×${counter}; phòng thủ trừ ${targetDefense}.`,
    `Ngoại lực ×${externalPower}; sát thương thực ${damage}.`,
  ];
  return { damage, healing, factor, log };
}
export function useGu(state, typeId, context = {}) {
  requireThat(state.alive, 'DEAD', 'Cuộc đời đã kết thúc.');
  const definition = GU_DEFINITIONS[typeId];
  requireThat(definition, 'INVALID_GU', 'Cổ trùng không hợp lệ.');
  const gu = state.guInstances.find(g => g.typeId === typeId && canUseGuInstance(state, g)) ?? state.guInstances.find(g => g.typeId === typeId && g.alive && heldBy(state, g));
  requireThat(gu, 'GU_NOT_OWNED', 'Chưa sở hữu Cổ trùng còn sống.');
  requireThat(gu.controlled, 'GU_UNCONTROLLED', 'Cần luyện hóa để điều khiển Cổ trùng.');
  requireThat((gu.controllerLifeId === undefined ? gu.ownerLifeId : gu.controllerLifeId) === state.lifeId || gu.authorizedLifeIds?.includes(state.lifeId), 'GU_PERMISSION_REQUIRED', 'Chưa được chủ luyện hóa cho phép sử dụng.');
  requireThat(!gu.lock&&!gu.tamingByLifeId, 'GU_BUSY', 'Cổ đang tham gia một hoạt động khác.');
  requireThat(!['vault', 'preservation'].includes(gu.storage), 'GU_IN_STORAGE', 'Hãy lấy Cổ khỏi kho bảo tồn trước khi sử dụng.');
  requireThat((gu.healthBps ?? 10000) > 0 && !['critical', 'dead'].includes(gu.feeding?.state), 'GU_CONDITION', 'Tình trạng Cổ không đáp ứng việc sử dụng.');
  requireThat(gu.rank <= state.rank, 'GU_RANK_UNSUPPORTED', 'Tu vi chưa đáp ứng Cổ trùng này.');
  const effectContext = { ...context, guRank: gu.rank, baseDamage: definition.damage, baseHealing: definition.healing, path: definition.path, mastery: gu.mastery };
  // Validate contextual inputs before debiting resources; use the actual consumed
  // bucket quality, not a free quality increase from a recent rank promotion.
  resolveCombatEffect(state, effectContext);
  let primevalSpentBps = 0; let immortalSpentUnits = 0; let immortalSpentKind = null;
  let effect;
  if (state.rank <= 5) {
    const plan = primevalPlan(state, definition.primevalCostBps, (gu.rank - 1) * 4 + 1);
    effect = resolveCombatEffect(state, { ...effectContext, energyQuality: plan.energyQuality });
    state.mortal.essence = plan.buckets; syncEssence(state.mortal); primevalSpentBps = plan.spent;
  } else {
    immortalSpentUnits = definition.immortalCostUnits;
    const plan = immortalPlan(state, immortalSpentUnits, gu.rank);
    effect = resolveCombatEffect(state, { ...effectContext, energyQuality: plan.energyQuality });
    plan.pool.units -= immortalSpentUnits; immortalSpentKind = plan.pool.kind;
  }
  effect.log.push(state.rank <= 5 ? `Tiêu hao ${primevalSpentBps / 100} điểm phần trăm toàn khiếu.` : `Tiêu hao ${immortalSpentUnits} hạt ${immortalSpentKind} thuộc bản thân.`);
  gu.mastery = Math.min(10000, gu.mastery + 5);
  if (gu.feeding) gu.feeding.remainingMs -= 1000;
  if (gu.healthBps !== undefined && gu.healthBps < 10000) {
    const condition = Math.max(0.1, gu.healthBps / 10000); effect.damage = Math.floor(effect.damage * condition); effect.healing = Math.floor(effect.healing * condition);
    effect.log.push(`Tình trạng cá thể ${gu.healthBps / 100}% điều chỉnh công dụng ×${condition.toFixed(2)}.`);
  }
  return { ok: true, guId: typeId, ...effect, shieldReduction: definition.shieldReduction,
    durationMs: definition.durationMs, speedMultiplier: definition.speedMultiplier, primevalSpentBps, immortalSpentUnits, immortalSpentKind };
}

/** Advances only supplied authoritative server time; repeated timestamps are inert. */
export function advanceCultivation(state, now, { inSanctuary = false } = {}) {
  requireThat(integer(now, state.lastAdvancedAt, Number.MAX_SAFE_INTEGER), 'INVALID_TIME', 'Thời gian máy chủ không được lùi.');
  const delta = now - state.lastAdvancedAt;
  if (!delta || !state.alive) return { changed: false, critical: false };
  state.lastAdvancedAt = now;
  const experienced = Math.min(delta, Math.max(0, state.lifespanMs - state.ageMs));
  state.ageMs += experienced;
  let critical = false; let code;
  if (state.ageMs >= state.lifespanMs) { state.alive = false; state.activity = null; return { changed: true, critical: true, code: 'LIFESPAN_EXHAUSTED' }; }
  if (state.activity && !inSanctuary) { state.activity = null; critical = true; code = 'ACTIVITY_INTERRUPTED'; }
  if (state.mortal && state.mortal.wall !== 'shattered') {
    const aperture = state.mortal;
    const recover = elapsed => {
      const recovered = aperture.recoveryRemainder + elapsed * (inSanctuary ? CULTIVATION_BALANCE.safeRecoveryPerSecondBps : CULTIVATION_BALANCE.outerRecoveryPerSecondBps);
      addEssence(aperture, quality(state), Math.floor(recovered / 1000)); aperture.recoveryRemainder = recovered % 1000;
    };
    // Resolve the finite set of one-second cultivation boundaries in order.
    // At most ~210 iterations fill a wall, even when an aperture starts empty.
    let remaining = experienced;
    while (state.activity?.kind === 'cultivating' && remaining > 0) {
      const step = Math.min(remaining, 1000 - aperture.cultivationRemainderMs);
      recover(step); aperture.cultivationRemainderMs += step; remaining -= step;
      if (aperture.cultivationRemainderMs < 1000) break;
      aperture.cultivationRemainderMs = 0;
      const natural = aperture.essence.find(b => b.quality === quality(state));
      if ((natural?.amountBps ?? 0) >= CULTIVATION_BALANCE.cultivationCostPerSecondBps) {
        spendPrimeval(state, CULTIVATION_BALANCE.cultivationCostPerSecondBps, quality(state));
        aperture.wallProgress = Math.min(10000, aperture.wallProgress + CULTIVATION_BALANCE.cultivationWallPerSecond);
      }
      if (aperture.wallProgress === 10000) { state.activity = null; critical = true; code = 'WALL_READY'; }
    }
    if (remaining > 0) recover(remaining);
  }
  if (state.activity?.kind === 'taming' && now >= state.activity.completeAt) {
    const gu = state.guInstances.find(g => g.id === state.activity.guInstanceId && g.alive && heldBy(state, g));
    if (gu) { gu.controlled = true; if (gu.holderLifeId !== undefined) { gu.controllerLifeId = state.lifeId; gu.willBps = 0; gu.tamingProgressBps = 10000; gu.authorizedLifeIds = []; } }
    state.activity = null; critical = true; code = gu ? 'GU_TAMED' : 'GU_UNAVAILABLE';
  }
  if (state.immortal) {
    const aperture = state.immortal;
    const innerDelta = experienced * aperture.timeRatio;
    const productiveDelta = aperture.pendingTribulation ? 0 : Math.max(0, Math.min(innerDelta, aperture.nextTribulationAtInnerMs - aperture.innerMs));
    aperture.innerMs += innerDelta;
    const production = aperture.productionRemainderMs + productiveDelta;
    if (aperture.habitatBps >= 5000 && !aperture.pendingTribulation) aperture.units += Math.floor(production / CULTIVATION_BALANCE.innerYearMs) * CULTIVATION_BALANCE.immortalProductionUnitsPerYear;
    aperture.productionRemainderMs = production % CULTIVATION_BALANCE.innerYearMs;
    if (!aperture.pendingTribulation && aperture.innerMs >= aperture.nextTribulationAtInnerMs) {
      const year = Math.round(aperture.nextTribulationAtInnerMs / CULTIVATION_BALANCE.innerYearMs);
      const major = year % 100 === 0;
      aperture.pendingTribulation = { dueInnerMs: aperture.nextTribulationAtInnerMs, kind: major ? state.rank === 6 ? 'heaven' : state.rank === 7 ? 'grand' : 'myriad' : state.rank === 6 ? 'earth' : 'heaven', major };
      critical = true; code = 'TRIBULATION_DUE';
    }
  }
  return { changed: true, critical, ...(code ? { code } : {}) };
}

/** Run on a server draft only after facility proximity checks. All checks happen
 * before each command's economic mutation. Store transaction owns persistence. */
export function applyAcademyAction(state, action, { now, stones, inSanctuary = false, canAscend = true } = {}) {
  requireThat(action && typeof action.option === 'string' && integer(stones, 0, Number.MAX_SAFE_INTEGER) && integer(now, state.lastAdvancedAt, Number.MAX_SAFE_INTEGER), 'INVALID_ACADEMY_ACTION', 'Yêu cầu học viện không hợp lệ.');
  requireThat(state.alive, 'DEAD', 'Cuộc đời đã kết thúc.');
  requireThat(inSanctuary, 'SANCTUARY_REQUIRED', 'Cần ở khu an toàn của học viện.');
  const option = action.option;
  if (option === 'stop-cultivating') { requireThat(!state.activity || state.activity.kind === 'cultivating', 'ACTIVITY_BUSY', 'Đang luyện hóa Cổ.'); state.activity = null; return { stones, code: 'CULTIVATION_STOPPED' }; }
  requireThat(!state.activity || state.activity.kind === 'cultivating' && option === 'breakthrough', 'ACTIVITY_BUSY', 'Hãy hoàn thành hoặc dừng việc đang làm.');
  if (option === 'claim-gu' || option === 'buy-gu') {
    const definition = GU_DEFINITIONS[action.guId];
    requireThat(definition?.rank === 1 && definition.purchaseStones !== null, 'INVALID_STARTER_GU', 'Học viện chỉ cấp hoặc bán Phàm Cổ nhất chuyển.');
    if (option === 'claim-gu') requireThat(!state.firstGuClaimed, 'FIRST_GU_ALREADY_CLAIMED', 'Mỗi cuộc đời chỉ được nhận một Cổ nhập môn.');
    const cost = option === 'claim-gu' ? 0 : definition.purchaseStones;
    requireThat(stones >= cost, 'INSUFFICIENT_STONES', 'Chưa đủ nguyên thạch mua Cổ.');
    addGuInstance(state, action.guId, { controlled: false }); state.firstGuClaimed = true;
    return { stones: stones - cost, code: option === 'claim-gu' ? 'GU_CLAIMED_UNTAMED' : 'GU_BOUGHT_UNTAMED' };
  }
  if (option === 'tame-gu') {
    const gu = state.guInstances.find(g => g.typeId === action.guId && g.alive && heldBy(state, g) && !g.controlled);
    requireThat(gu && !gu.controlled, 'GU_NOT_UNTAMED', 'Cần một Cổ thuộc sở hữu chưa luyện hóa.');
    requireThat(gu.rank <= state.rank, 'GU_RANK_UNSUPPORTED', 'Chưa thể luyện hóa Cổ vượt tu vi.');
    requireThat(stones >= CULTIVATION_BALANCE.tamingStones, 'INSUFFICIENT_STONES', 'Luyện hóa cần hai nguyên thạch.');
    if (state.rank <= 5) spendPrimeval(state, CULTIVATION_BALANCE.tamingCostBps, (gu.rank - 1) * 4 + 1);
    else { const plan = immortalPlan(state, 1, gu.rank); plan.pool.units--; }
    state.activity = { kind: 'taming', guInstanceId: gu.id, startedAt: now, completeAt: now + CULTIVATION_BALANCE.tamingMs };
    return { stones: stones - CULTIVATION_BALANCE.tamingStones, code: 'TAMING_STARTED' };
  }
  if (option === 'cultivate') {
    requireThat(state.mortal && state.mortal.wall !== 'shattered', 'MORTAL_REQUIRED', 'Tu luyện chân nguyên cần không khiếu phàm nhân.');
    requireThat(state.mortal.wallProgress < 10000, 'WALL_ALREADY_READY', 'Vách khiếu đã sẵn sàng đột phá.');
    state.activity = { kind: 'cultivating', startedAt: now }; state.mortal.cultivationRemainderMs = 0;
    return { stones, code: 'CULTIVATION_STARTED' };
  }
  if (option === 'breakthrough') {
    if (state.rank >= 6) {
      requireThat(state.rank < 8, 'RANK_NINE_UNVERIFIED', 'Điều kiện lên cửu chuyển trong phạm vi nguyên tác chưa được kiểm chứng; chưa mở khóa.');
      requireThat(!state.immortal.pendingTribulation && state.immortal.passedMajorTribulations >= CULTIVATION_BALANCE.majorTribulationsForPromotion, 'TRIBULATIONS_REQUIRED', 'Cần vượt đủ ba đại kiếp của chuyển hiện tại.');
      requireThat(state.immortal.units >= 10, 'INSUFFICIENT_IMMORTAL_ESSENCE', 'Chưa đủ tiên nguyên cho bước chuyển.');
      state.immortal.units -= 10;
      state.immortal.reserves ??= [];
      if (state.immortal.units > 0) state.immortal.reserves.push({ ownerLifeId: state.lifeId, kind: state.immortal.kind, units: state.immortal.units });
      state.immortal.units = 0; state.rank++; state.immortal.kind = rankProfile(state.rank).energyKind;
      state.immortal.apertureKind = rankProfile(state.rank).apertureKind; state.immortal.passedMajorTribulations = 0;
      return { stones, code: 'IMMORTAL_PROMOTED' };
    }
    requireThat(!(state.rank === 5 && state.subrealm === 'peak'), 'ASCENSION_REQUIRED', 'Ngũ chuyển đỉnh phong phải trải qua thăng tiên.');
    requireThat(state.mortal.wall !== 'shattered' && state.mortal.wallProgress >= 10000, 'WALL_NOT_READY', 'Vách khiếu chưa đủ tiến trình.');
    requireThat(stones >= CULTIVATION_BALANCE.breakthroughStones, 'INSUFFICIENT_STONES', 'Đột phá cần nguyên thạch.');
    spendPrimeval(state, CULTIVATION_BALANCE.breakthroughCostBps, quality(state));
    const next = SUBREALMS.indexOf(state.subrealm) + 1;
    if (next === 4) { state.rank++; state.subrealm = 'initial'; } else state.subrealm = SUBREALMS[next];
    state.mortal.wallProgress = 0; state.activity = null;
    return { stones: stones - CULTIVATION_BALANCE.breakthroughStones, code: 'MORTAL_PROMOTED' };
  }
  if (option === 'ascend-shatter') {
    requireThat(canAscend && state.rank === 5 && state.subrealm === 'peak' && state.mortal?.wall !== 'shattered' && state.mortal?.wallProgress >= 10000, 'ASCENSION_NOT_READY', 'Cần ngũ chuyển đỉnh phong, chuẩn bị vách khiếu và nơi thăng tiên.');
    requireThat(ownVitalGu(state), 'VITAL_GU_REQUIRED', 'Cần một Cổ bản mệnh còn sống, do bản thân luyện hóa và đang giữ trước khi phá khiếu.');
    requireThat(stones >= CULTIVATION_BALANCE.ascensionStones, 'INSUFFICIENT_STONES', 'Chưa đủ tài nguyên chuẩn bị thăng tiên.');
    spendPrimeval(state, CULTIVATION_BALANCE.ascensionCostBps, quality(state));
    state.mortal.wall = 'shattered'; state.ascension = { stage: 'shattered', humanQi: 50, heavenQi: 0, earthQi: 0 };
    return { stones: stones - CULTIVATION_BALANCE.ascensionStones, code: 'APERTURE_SHATTERED' };
  }
  if (option === 'ascend-absorb') {
    requireThat(state.ascension?.stage === 'shattered', 'ASCENSION_STAGE', 'Cần phá không khiếu trước khi hấp thu khí.');
    requireThat(integer(action.heavenQi, 0, 100) && integer(action.earthQi, 0, 100), 'INVALID_QI', 'Thiên khí và địa khí cần trong khoảng 0–100.');
    state.ascension.heavenQi = action.heavenQi; state.ascension.earthQi = action.earthQi;
    if (Math.abs(action.heavenQi - 50) > 10 || Math.abs(action.earthQi - 50) > 10 || Math.abs(action.heavenQi - action.earthQi) > 10) {
      state.alive = false; state.activity = null; return { stones, code: 'ASCENSION_OVERLOAD', dead: true };
    }
    state.ascension.stage = 'balanced'; return { stones, code: 'THREE_QI_BALANCED' };
  }
  if (option === 'ascend-release') {
    requireThat(state.ascension?.stage === 'balanced', 'ASCENSION_STAGE', 'Cần cân bằng tam khí trước khi hình thành tiên khiếu.');
    requireThat(ownVitalGu(state), 'VITAL_GU_REQUIRED', 'Cổ bản mệnh phải còn sống và thuộc quyền điều khiển của bản thân để hoàn tất thăng tiên.');
    state.rank = 6; state.subrealm = null; state.mortal = null; state.immortal = makeImmortal(state.lifeId, 6); state.ascension = null;
    return { stones, code: 'IMMORTAL_APERTURE_FORMED' };
  }
  if (option === 'resolve-tribulation') {
    const tribulation = state.immortal?.pendingTribulation;
    requireThat(tribulation, 'NO_TRIBULATION', 'Chưa có tai kiếp đến hạn.');
    const needed = tribulation.major ? state.rank * 4 : state.rank;
    requireThat(state.immortal.units >= needed, 'INSUFFICIENT_IMMORTAL_ESSENCE', 'Chưa đủ tiên nguyên chống tai kiếp.');
    const tools = state.guInstances.filter(g => g.alive && g.controlled && g.ownerLifeId === state.lifeId && g.rank <= state.rank);
    const defendingGu = tools.find(g => g.rank >= state.rank - (tribulation.major ? 0 : 1));
    requireThat(defendingGu, 'TRIBULATION_MEANS_REQUIRED', 'Cần Cổ và phương tiện thực tế đủ cấp để chống kiếp.');
    state.immortal.units -= needed; state.immortal.passedTribulations++;
    if (tribulation.major) state.immortal.passedMajorTribulations++;
    const path = GU_DEFINITIONS[defendingGu.typeId].path;
    state.daoMarks[path] = (state.daoMarks[path] ?? 0) + (tribulation.major ? 1000 : 100);
    state.immortal.pendingTribulation = null; state.immortal.nextTribulationAtInnerMs += CULTIVATION_BALANCE.innerYearMs * 10;
    return { stones, code: 'TRIBULATION_PASSED' };
  }
  throw new CultivationError('INVALID_ACADEMY_ACTION', 'Hoạt động học viện chưa được hỗ trợ.');
}

export function validateCultivationState(state) {
  const valid = condition => requireThat(condition, 'INVALID_CULTIVATION', 'Dữ liệu tu luyện không hợp lệ.');
  valid(state && state.version === 1 && typeof state.lifeId === 'string' && state.lifeId.length > 0 && state.lifeId.length <= 200);
  valid(integer(state.rank, 1, 9) && integer(state.aptitudeBps, 2000, 10000) && typeof state.alive === 'boolean' && typeof state.firstGuClaimed === 'boolean');
  valid(integer(state.lastAdvancedAt, 0, Number.MAX_SAFE_INTEGER) && integer(state.ageMs, 0, Number.MAX_SAFE_INTEGER) && integer(state.lifespanMs, state.ageMs, Number.MAX_SAFE_INTEGER));
  valid(integer(state.nextGuSequence, 1, Number.MAX_SAFE_INTEGER) && Array.isArray(state.guInstances) && state.guInstances.length <= 1000);
  const ids = new Set();
  for (const gu of state.guInstances) {
    valid(gu && typeof gu.id === 'string' && gu.id.length > 0 && !ids.has(gu.id) && GU_DEFINITIONS[gu.typeId] && integer(gu.rank, 1, 9) && typeof gu.ownerLifeId === 'string' && typeof gu.alive === 'boolean' && typeof gu.controlled === 'boolean' && integer(gu.mastery, 0, 10000)); ids.add(gu.id);
    valid(gu.holderLifeId===undefined||typeof gu.holderLifeId==='string'&&gu.holderLifeId===state.lifeId);
    valid(gu.controllerLifeId===undefined||gu.controllerLifeId===null||typeof gu.controllerLifeId==='string'&&gu.controllerLifeId.length>0&&gu.controllerLifeId.length<=200);
    valid(gu.authorizedLifeIds===undefined||Array.isArray(gu.authorizedLifeIds)&&gu.authorizedLifeIds.length<=128&&new Set(gu.authorizedLifeIds).size===gu.authorizedLifeIds.length&&gu.authorizedLifeIds.every(id=>typeof id==='string'&&id.length>0&&id.length<=200));
    for(const key of['healthBps','willBps','tamingProgressBps'])valid(gu[key]===undefined||integer(gu[key],0,10000));
    valid(gu.vitalForLifeId===undefined||gu.vitalForLifeId===null||typeof gu.vitalForLifeId==='string'&&gu.vitalForLifeId.length<=200);
    valid(gu.starterGrantLifeId===undefined||typeof gu.starterGrantLifeId==='string'&&gu.starterGrantLifeId.length>0&&gu.starterGrantLifeId.length<=200);
    valid(gu.tamingByLifeId===undefined||gu.tamingByLifeId===null||typeof gu.tamingByLifeId==='string'&&gu.tamingByLifeId.length>0&&gu.tamingByLifeId.length<=200);
    valid(gu.storage===undefined||['bag','vault','preservation','aperture'].includes(gu.storage));
    valid(gu.lock===undefined||gu.lock===null||gu.lock&&['refining','listed','transport'].includes(gu.lock.kind)&&typeof gu.lock.id==='string'&&gu.lock.id.length>0&&gu.lock.id.length<=200);
    valid(gu.feeding===undefined||gu.feeding&&integer(gu.feeding.remainingMs,-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER)&&integer(gu.feeding.lastClockMs,0,Number.MAX_SAFE_INTEGER)&&['fed','due-soon','hungry','weak','critical','dead'].includes(gu.feeding.state));
  }
  for (const stats of [state.pathAttainment, state.daoMarks]) { valid(stats && typeof stats === 'object' && !Array.isArray(stats)); for (const [key, value] of Object.entries(stats)) valid(key.length <= 80 && integer(value, 0, 1000000000)); }
  valid(state.body && integer(state.body.woundBps, 0, 10000) && state.soul && integer(state.soul.woundBps, 0, 10000) && integer(state.soul.strength, 1, 1000000000));
  if (state.rank <= 5) {
    const a = state.mortal;
    valid(SUBREALMS.includes(state.subrealm) && a && state.immortal === null && a.capacityBps === state.aptitudeBps && integer(a.amountBps, 0, a.capacityBps) && Array.isArray(a.essence) && a.essence.length <= 20);
    const qualities = new Set();
    for (const b of a.essence) { valid(b && integer(b.quality, 1, 20) && integer(b.amountBps, 1, a.capacityBps) && !qualities.has(b.quality)); qualities.add(b.quality); }
    valid(a.amountBps === sumEssence(a) && ['stable', 'strained', 'shattered'].includes(a.wall) && integer(a.wallProgress, 0, 10000) && integer(a.recoveryRemainder, 0, 999) && integer(a.cultivationRemainderMs, 0, 999));
  } else {
    const a = state.immortal; const profile = rankProfile(state.rank);
    valid(state.subrealm === null && state.mortal === null && a && a.ownerLifeId === state.lifeId && a.kind === profile.energyKind && a.apertureKind === profile.apertureKind);
    valid(integer(a.units, 0, 1000000000) && integer(a.innerMs, 0, Number.MAX_SAFE_INTEGER) && integer(a.timeRatio, 1, 100) && integer(a.habitatBps, 0, 10000) && integer(a.productionRemainderMs, 0, CULTIVATION_BALANCE.innerYearMs - 1) && integer(a.nextTribulationAtInnerMs, 0, Number.MAX_SAFE_INTEGER) && integer(a.passedMajorTribulations, 0, 1000000) && integer(a.passedTribulations, 0, 1000000));
    valid(a.reserves === undefined || Array.isArray(a.reserves) && a.reserves.length <= 4 && a.reserves.every(p => p.ownerLifeId === state.lifeId && energies.indexOf(p.kind) >= 5 && energies.indexOf(p.kind) < state.rank - 1 && integer(p.units, 0, 1000000000)));
    valid(a.pendingTribulation === null || a.pendingTribulation && integer(a.pendingTribulation.dueInnerMs, 0, a.innerMs) && ['earth', 'heaven', 'grand', 'myriad'].includes(a.pendingTribulation.kind) && typeof a.pendingTribulation.major === 'boolean');
  }
  valid(state.activity === null || state.activity && ['taming', 'cultivating'].includes(state.activity.kind) && integer(state.activity.startedAt, 0, Number.MAX_SAFE_INTEGER));
  if (state.activity?.kind === 'taming') valid(integer(state.activity.completeAt, state.activity.startedAt, Number.MAX_SAFE_INTEGER) && ids.has(state.activity.guInstanceId));
  if (state.activity?.kind === 'cultivating') valid(state.mortal && state.mortal.wall !== 'shattered');
  valid(state.ascension === null || state.ascension && state.rank === 5 && state.subrealm === 'peak' && state.mortal.wall === 'shattered' && ['shattered', 'balanced'].includes(state.ascension.stage) && ['humanQi', 'heavenQi', 'earthQi'].every(k => integer(state.ascension[k], 0, 100)));
  return true;
}

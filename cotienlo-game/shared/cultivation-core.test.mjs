import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CULTIVATION_BALANCE, GU_DEFINITIONS, RANK_PROFILES, createCultivationState,
  migrateCultivationState, validateCultivationState, deriveCultivationStats,
  ownedGuIds, usableGuIds, applyAcademyAction, advanceCultivation, addGuInstance,
  useGu, resolveCombatEffect, spendPrimeval,
} from './cultivation-core.mjs';

const fresh = (options = {}) => createCultivationState({ lifeId: 'life-a', now: 0, ...options });
const act = (state, option, extra = {}, context = {}) => applyAcademyAction(state, { option, ...extra }, { now: state.lastAdvancedAt, stones: 100, inSanctuary: true, ...context });
const fill = state => { const a = state.mortal; a.essence = [{ quality: (state.rank - 1) * 4 + ['initial', 'middle', 'upper', 'peak'].indexOf(state.subrealm) + 1, amountBps: a.capacityBps }]; a.amountBps = a.capacityBps; };

test('a fresh life has an opened 44% aperture and absolutely no Gu', () => {
  const state = fresh();
  assert.equal(state.rank, 1); assert.equal(state.subrealm, 'initial');
  assert.equal(state.mortal.capacityBps, 4400); assert.equal(state.mortal.amountBps, 4400);
  assert.deepEqual(ownedGuIds(state), []); assert.deepEqual(usableGuIds(state), []);
  assert.equal(deriveCultivationStats(state).maxMp, 44);
  assert.equal(validateCultivationState(state), true);
});

test('all nine profiles use the correct distinct energy and aperture kinds', () => {
  assert.equal(RANK_PROFILES.length, 9);
  assert.deepEqual(RANK_PROFILES.map(p => p.energyKind), ['green-copper', 'red-iron', 'white-silver', 'yellow-gold', 'purple-crystal', 'green-grape', 'red-date', 'white-litchi', 'yellow-apricot']);
  for (let rank = 1; rank <= 9; rank++) {
    const state = fresh({ rank }); assert.equal(validateCultivationState(state), true);
    assert.equal(state.subrealm === null, rank >= 6);
    assert.equal(state.mortal === null, rank >= 6);
    assert.equal(state.immortal === null, rank <= 5);
    assert.deepEqual(ownedGuIds(state), []);
  }
  assert.equal(RANK_PROFILES[5].apertureKind, 'blessed-land');
  assert.equal(RANK_PROFILES[7].apertureKind, 'grotto-heaven');
});

test('first Gu is an owned untamed individual; taming requires server time and resources', () => {
  const state = fresh();
  act(state, 'claim-gu', { guId: 'moonlight' });
  assert.deepEqual(ownedGuIds(state), ['moonlight']); assert.deepEqual(usableGuIds(state), []);
  assert.throws(() => useGu(state, 'moonlight'), { code: 'GU_UNCONTROLLED' });
  assert.throws(() => act(state, 'claim-gu', { guId: 'heal' }), { code: 'FIRST_GU_ALREADY_CLAIMED' });
  assert.throws(() => act(state, 'tame-gu', { guId: 'moonlight' }, { stones: 1 }), { code: 'INSUFFICIENT_STONES' });
  assert.equal(state.activity, null);
  const result = act(state, 'tame-gu', { guId: 'moonlight' });
  assert.equal(result.stones, 98); assert.equal(state.mortal.amountBps, 3900);
  advanceCultivation(state, 9999, { inSanctuary: true }); assert.deepEqual(usableGuIds(state), []);
  assert.equal(advanceCultivation(state, 10000, { inSanctuary: true }).critical, true);
  assert.deepEqual(usableGuIds(state), ['moonlight']); assert.equal(state.activity, null);
});

test('leaving sanctuary interrupts academy channeling and never completes control remotely', () => {
  const state = fresh(); act(state, 'claim-gu', { guId: 'moonlight' }); act(state, 'tame-gu', { guId: 'moonlight' });
  advanceCultivation(state, 1000, { inSanctuary: false }); advanceCultivation(state, 10000, { inSanctuary: true });
  assert.deepEqual(usableGuIds(state), []); assert.equal(state.activity, null);
  assert.throws(() => act(state, 'cultivate', {}, { inSanctuary: false }), { code: 'SANCTUARY_REQUIRED' });
});

test('44% capacity permits four 10pp casts, never ten normalized casts', () => {
  const state = fresh(); addGuInstance(state, 'moonlight', { controlled: true });
  assert.equal(GU_DEFINITIONS.moonlight.primevalCostBps, 1000);
  for (let n = 0; n < 4; n++) useGu(state, 'moonlight');
  assert.equal(state.mortal.amountBps, 400);
  const before = structuredClone(state);
  assert.throws(() => useGu(state, 'moonlight'), { code: 'INSUFFICIENT_ESSENCE' });
  assert.deepEqual(state, before);
});

test('quality changes efficiency without changing whole-aperture units; failed spend is atomic', () => {
  const state = fresh({ rank: 2 });
  const amount = spendPrimeval(state, 1000, 1);
  assert.equal(amount, 500); assert.equal(state.mortal.amountBps, 3900);
  const before = structuredClone(state);
  assert.throws(() => spendPrimeval(state, 9000, 20), { code: 'INSUFFICIENT_ESSENCE' });
  assert.deepEqual(state, before);
});

test('combat consumes the real old-quality essence after a breakthrough', () => {
  const low = fresh(); addGuInstance(low, 'moonlight', { controlled: true });
  const promoted = fresh({ rank: 2 }); addGuInstance(promoted, 'moonlight', { controlled: true });
  promoted.mortal.essence = [{ quality: 1, amountBps: 4400 }]; promoted.mortal.amountBps = 4400;
  assert.equal(useGu(promoted, 'moonlight').damage, useGu(low, 'moonlight').damage);
  assert.equal(promoted.mortal.amountBps, 3400);
});

test('server time is monotonic and replaying a settled timestamp has no effect', () => {
  const state = fresh(); advanceCultivation(state, 1000, { inSanctuary: true });
  const before = structuredClone(state);
  assert.deepEqual(advanceCultivation(state, 1000, { inSanctuary: true }), { changed: false, critical: false });
  assert.deepEqual(state, before);
  assert.throws(() => advanceCultivation(state, 999), { code: 'INVALID_TIME' });
});

test('continuous server-clock cultivation advances wall and cannot finish instantly', () => {
  const state = fresh(); act(state, 'cultivate');
  advanceCultivation(state, 1000, { inSanctuary: true });
  assert.ok(state.mortal.wallProgress > 0); assert.ok(state.mortal.wallProgress < 10000);
  assert.throws(() => act(state, 'breakthrough'), { code: 'WALL_NOT_READY' });
  act(state, 'stop-cultivating'); assert.equal(state.activity, null);
});

test('cultivation and recovery settle the same way in one tick or many ticks', () => {
  const batched = fresh(); const stepped = fresh(); act(batched, 'cultivate'); act(stepped, 'cultivate');
  advanceCultivation(batched, 180000, { inSanctuary: true });
  for (let now = 1000; now <= 180000; now += 1000) advanceCultivation(stepped, now, { inSanctuary: true });
  assert.deepEqual(batched, stepped);
  assert.equal(batched.mortal.wallProgress, 10000);
});

test('additional Gu must be purchased untamed and still consume refining resources', () => {
  const state = fresh(); act(state, 'claim-gu', { guId: 'moonlight' });
  const result = act(state, 'buy-gu', { guId: 'heal' });
  assert.equal(result.stones, 100 - GU_DEFINITIONS.heal.purchaseStones);
  assert.deepEqual(ownedGuIds(state), ['moonlight', 'heal']); assert.deepEqual(usableGuIds(state), []);
  assert.throws(() => act(state, 'buy-gu', { guId: 'moonblade' }), { code: 'INVALID_STARTER_GU' });
});

test('all twenty mortal stages progress without any Gu rank or lifespan gift', () => {
  const state = fresh(); addGuInstance(state, 'moonlight', { controlled: true });
  const lifespan = state.lifespanMs;
  for (let stage = 0; stage < 19; stage++) {
    fill(state); state.mortal.wallProgress = 10000;
    act(state, 'breakthrough');
    assert.equal(state.guInstances[0].rank, 1); assert.equal(state.lifespanMs, lifespan);
    assert.equal(validateCultivationState(state), true);
  }
  assert.equal(state.rank, 5); assert.equal(state.subrealm, 'peak');
  assert.throws(() => act(state, 'breakthrough'), { code: 'ASCENSION_REQUIRED' });
  assert.deepEqual(usableGuIds(state), ['moonlight']);
});

test('ascension has three separate stages; no automatic Immortal Gu or lifespan', () => {
  const state = fresh({ rank: 5 }); state.subrealm = 'peak'; fill(state); state.mortal.wallProgress = 10000;
  const vital=addGuInstance(state,'moonlight',{controlled:true});vital.vitalForLifeId=state.lifeId;
  const lifespan = state.lifespanMs;
  assert.throws(() => act(state, 'ascend-release'), { code: 'ASCENSION_STAGE' });
  act(state, 'ascend-shatter'); assert.equal(state.mortal.wall, 'shattered');
  assert.throws(() => useGu(state, 'moonlight'), { code: 'APERTURE_UNAVAILABLE' });
  act(state, 'ascend-absorb', { heavenQi: 50, earthQi: 50 }); assert.equal(state.rank, 5);
  act(state, 'ascend-release'); assert.equal(state.rank, 6); assert.equal(state.mortal, null);
  assert.equal(state.immortal.units, 0); assert.equal(state.lifespanMs, lifespan); assert.deepEqual(ownedGuIds(state), ['moonlight']);
  assert.equal(state.guInstances.length,1);assert.equal(state.guInstances[0].id,vital.id);assert.equal(vital.rank,1);assert.equal(vital.vitalForLifeId,state.lifeId);
  assert.equal(validateCultivationState(state), true);
});

test('unsafe qi absorption has an explicit fatal outcome and grants no rank', () => {
  const state = fresh({ rank: 5 }); state.subrealm = 'peak'; fill(state); state.mortal.wallProgress = 10000;
  const vital=addGuInstance(state,'moonlight',{controlled:true});vital.vitalForLifeId=state.lifeId;
  act(state, 'ascend-shatter');
  const result = act(state, 'ascend-absorb', { heavenQi: 100, earthQi: 0 });
  assert.equal(result.dead, true); assert.equal(result.code, 'ASCENSION_OVERLOAD'); assert.equal(state.alive, false); assert.equal(state.rank, 5);
});

test('ascension requires a real own vital relation before spending or irreversibly shattering the aperture',()=>{
  const state=fresh({rank:5});state.subrealm='peak';fill(state);state.mortal.wallProgress=10000;
  let before=structuredClone(state);assert.throws(()=>act(state,'ascend-shatter'),{code:'VITAL_GU_REQUIRED'});assert.deepEqual(state,before);
  const primary=addGuInstance(state,'moonlight',{controlled:true});
  before=structuredClone(state);assert.throws(()=>act(state,'ascend-shatter'),{code:'VITAL_GU_REQUIRED'});assert.deepEqual(state,before);
  primary.vitalForLifeId=state.lifeId;primary.controlled=false;
  before=structuredClone(state);assert.throws(()=>act(state,'ascend-shatter'),{code:'VITAL_GU_REQUIRED'});assert.deepEqual(state,before);
  primary.controlled=true;primary.controllerLifeId='someone-else';primary.authorizedLifeIds=[state.lifeId];
  before=structuredClone(state);assert.throws(()=>act(state,'ascend-shatter'),{code:'VITAL_GU_REQUIRED'});assert.deepEqual(state,before);
});

test('destroying the vital Gu mid-ascension blocks release without granting rank or an immortal aperture',()=>{
  const state=fresh({rank:5});state.subrealm='peak';fill(state);state.mortal.wallProgress=10000;
  const vital=addGuInstance(state,'moonlight',{controlled:true});vital.vitalForLifeId=state.lifeId;
  act(state,'ascend-shatter');act(state,'ascend-absorb',{heavenQi:50,earthQi:50});
  vital.alive=false;vital.controlled=false;vital.healthBps=0;
  const before=structuredClone(state);assert.throws(()=>act(state,'ascend-release'),{code:'VITAL_GU_REQUIRED'});assert.deepEqual(state,before);
  assert.equal(state.rank,5);assert.equal(state.immortal,null);assert.equal(state.mortal.wall,'shattered');
});

test('immortal units are discrete, personally owned and do not become a 100 point mana bar', () => {
  const state = fresh({ rank: 6 }); addGuInstance(state, 'moonlight', { controlled: true });
  assert.throws(() => useGu(state, 'moonlight'), { code: 'INSUFFICIENT_IMMORTAL_ESSENCE' });
  state.immortal.units = 2; useGu(state, 'moonlight');
  assert.equal(state.immortal.units, 1); assert.equal(deriveCultivationStats(state).mp, 1);
  state.immortal.ownerLifeId = 'other'; assert.throws(() => validateCultivationState(state), { code: 'INVALID_CULTIVATION' });
});

test('immortal promotion preserves old essence kinds instead of upgrading every unit for free', () => {
  const state = fresh({ rank: 6 }); state.immortal.units = 100; state.immortal.passedMajorTribulations = 3;
  addGuInstance(state, 'moonlight', { controlled: true });
  act(state, 'breakthrough');
  assert.equal(state.rank, 7); assert.equal(state.immortal.units, 0);
  assert.deepEqual(state.immortal.reserves, [{ ownerLifeId: state.lifeId, kind: 'green-grape', units: 90 }]);
  useGu(state, 'moonlight'); assert.equal(state.immortal.reserves[0].units, 89);
  advanceCultivation(state, CULTIVATION_BALANCE.innerYearMs, { inSanctuary: true });
  assert.equal(state.immortal.kind, 'red-date'); assert.equal(state.immortal.units, 1);
  assert.equal(validateCultivationState(state), true);
});

test('tribulations use inner time and rank nine is explicitly unavailable', () => {
  const state = fresh({ rank: 6 }); state.immortal.units = 200;
  advanceCultivation(state, CULTIVATION_BALANCE.innerYearMs * 10, { inSanctuary: true });
  assert.ok(state.immortal.pendingTribulation); assert.equal(state.rank, 6);
  assert.throws(() => act(state, 'breakthrough'), { code: 'TRIBULATIONS_REQUIRED' });
  const nine = fresh({ rank: 8 }); nine.immortal.passedMajorTribulations = 3;
  assert.throws(() => act(nine, 'breakthrough'), { code: 'RANK_NINE_UNVERIFIED' });
  assert.equal(nine.rank, 8);
});

test('an unresolved tribulation halts essence production from its due date even on a long tick', () => {
  const batched = fresh({ rank: 6 }); const stepped = fresh({ rank: 6 });
  advanceCultivation(batched, CULTIVATION_BALANCE.innerYearMs * 30, { inSanctuary: true });
  for (let year = 1; year <= 30; year++) advanceCultivation(stepped, CULTIVATION_BALANCE.innerYearMs * year, { inSanctuary: true });
  assert.deepEqual(batched, stepped);
  assert.equal(batched.immortal.units, 10);
});

test('legacy migration preserves every existing Gu as controlled individuals without raising Gu ranks', () => {
  const state = migrateCultivationState(undefined, { lifeId: 'legacy', rank: 4, guIds: ['moonlight', 'moonblade', 'ironskin', 'moonlight'], now: 100 });
  assert.deepEqual(usableGuIds(state).sort(), ['ironskin', 'moonblade', 'moonlight']);
  assert.equal(state.guInstances.find(g => g.typeId === 'moonlight').rank, 1);
  assert.equal(state.guInstances.find(g => g.typeId === 'moonblade').rank, 2);
  assert.equal(validateCultivationState(state), true);
  assert.deepEqual(migrateCultivationState(state, { lifeId: 'legacy', rank: 9, guIds: [], now: 200 }), state);
  assert.deepEqual(ownedGuIds(fresh({ lifeId: 'next-life' })), []);
});

test('ownership, control and Gu rank separately gate combat before resource consumption', () => {
  const state = fresh(); addGuInstance(state, 'moonblade', { controlled: true });
  const amount = state.mortal.amountBps;
  assert.throws(() => useGu(state, 'moonblade'), { code: 'GU_RANK_UNSUPPORTED' }); assert.equal(state.mortal.amountBps, amount);
  state.guInstances[0].ownerLifeId = 'other'; assert.deepEqual(usableGuIds(state), []);
  assert.throws(() => useGu(state, 'moonblade'), { code: 'GU_NOT_OWNED' });
});

test('combat explains tools, mastery, energy quality, dao marks and counters without a rank win switch', () => {
  const low = fresh(); const high = fresh({ rank: 5 });
  const a = resolveCombatEffect(low, { guRank: 1, baseDamage: 32, path: 'moon', mastery: 0 });
  const b = resolveCombatEffect(high, { guRank: 1, baseDamage: 32, path: 'moon', mastery: 10000 });
  assert.ok(b.damage > a.damage); assert.ok(b.damage < a.damage * 4);
  high.daoMarks.moon = 10000;
  const matching = resolveCombatEffect(high, { guRank: 1, baseDamage: 32, path: 'moon', mastery: 10000 });
  assert.ok(matching.damage > b.damage);
  const countered = resolveCombatEffect(high, { guRank: 1, baseDamage: 32, path: 'moon', mastery: 10000, counter: 0.1, targetDefense: 50 });
  assert.equal(countered.damage, 0); assert.ok(matching.log.some(line => line.includes('đạo ngân')));
  assert.ok(deriveCultivationStats(high).physicalDamage < a.damage);
});

test('external tools are explicit and do not mutate personal cultivation', () => {
  const state = fresh({ rank: 6 });
  const base = resolveCombatEffect(state, { guRank: 6, baseDamage: 50 });
  const house = resolveCombatEffect(state, { guRank: 6, baseDamage: 50, externalPower: 5 });
  assert.ok(house.damage > base.damage); assert.equal(state.rank, 6);
  assert.ok(house.log.some(line => line.includes('Ngoại lực')));
});

test('path attainment improves actual Gu use; conflicting dao marks reduce efficiency', () => {
  const state = fresh({ rank: 6 });
  const baseline = resolveCombatEffect(state, { guRank: 6, baseDamage: 50, path: 'moon' });
  state.pathAttainment.moon = 10000;
  const learned = resolveCombatEffect(state, { guRank: 6, baseDamage: 50, path: 'moon' });
  assert.ok(learned.damage > baseline.damage);
  state.daoMarks.fire = 100000;
  const conflicted = resolveCombatEffect(state, { guRank: 6, baseDamage: 50, path: 'moon' });
  assert.ok(conflicted.damage < learned.damage);
  state.daoMarks.moon = 100000;
  assert.ok(resolveCombatEffect(state, { guRank: 6, baseDamage: 50, path: 'moon' }).damage > conflicted.damage);
  assert.ok(conflicted.log.some(line => line.includes('Xung đột đạo ngân')));
});

test('target rank supplies its foundation defense unless a concrete defense is supplied', () => {
  const state = fresh();
  const mortal = resolveCombatEffect(state, { baseDamage: 50, targetRank: 1 });
  const venerable = resolveCombatEffect(state, { baseDamage: 50, targetRank: 9 });
  assert.ok(venerable.damage < mortal.damage);
  assert.equal(resolveCombatEffect(state, { baseDamage: 50, targetRank: 9, targetDefense: 0 }).damage, mortal.damage);
});

test('state validation rejects duplicate identities, malformed quantities and immortal subrealms', () => {
  const state = fresh(); addGuInstance(state, 'moonlight', { controlled: true }); state.guInstances.push({ ...state.guInstances[0] });
  assert.throws(() => validateCultivationState(state), { code: 'INVALID_CULTIVATION' });
  const invalid = fresh(); invalid.mortal.amountBps = 10000;
  assert.throws(() => validateCultivationState(invalid), { code: 'INVALID_CULTIVATION' });
  const immortal = fresh({ rank: 8 }); immortal.subrealm = 'peak';
  assert.throws(() => validateCultivationState(immortal), { code: 'INVALID_CULTIVATION' });
});

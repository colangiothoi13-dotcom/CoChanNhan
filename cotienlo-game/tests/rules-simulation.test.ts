import { describe, expect, it } from 'vitest';
import {
  createRulesDemo, RulesSimulation, DEMO_IDS as ID, SIM_YEAR_TICKS as YEAR,
  RANK_ENERGY_LABELS, aptitudeLabel, qualityLabel,
  type RuleAction,
} from '../src/rules';

let sequence = 0;
const run = (engine: RulesSimulation, action: RuleAction, operationId = `rules-${++sequence}`) => engine.execute({ operationId, action });
const cast = (engine: RulesSimulation, costBps = 1000) => run(engine, { type: 'spend-primeval', actorId: ID.mortal, costBps });
const start = (engine: RulesSimulation, actorId = ID.mortal, recipeId: string = ID.recipe6, inputIds: string[] = [ID.moonGu, ID.boarGu]) => run(engine, { type: 'start-refinement', actorId, recipeId, inputIds });
const advance = (engine: RulesSimulation, years: number) => run(engine, { type: 'advance-time', outerTicks: engine.snapshot().outerTicks + years * YEAR });

describe('isolated cultivation rules', () => {
  it('labels its balances and fixtures as a simulation and returns defensive snapshots', () => {
    const engine = createRulesDemo();
    const copy = engine.snapshot();
    expect(copy.metadata.mode).toBe('isolated-rules-lab');
    expect(copy.metadata.balance).toBe('proposed');
    copy.actors[ID.mortal]!.stones = 999999;
    expect(engine.snapshot().actors[ID.mortal]!.stones).not.toBe(999999);
  });

  it.each([
    [2000, 'Đinh'], [3999, 'Đinh'], [4000, 'Bính'], [5999, 'Bính'],
    [6000, 'Ất'], [7999, 'Ất'], [8000, 'Giáp'], [9999, 'Giáp'], [10000, 'Thập Tuyệt'],
  ])('classifies the absolute aperture capacity %i without changing its denominator', (capacity, label) => {
    expect(aptitudeLabel(capacity as number)).toBe(label);
  });

  it('rejects impossible or fractional capacities and does not invent subrealms for immortals', () => {
    for (const aptitudeBps of [1999, 10001, 4400.5, NaN]) expect(() => createRulesDemo({ aptitudeBps })).toThrow();
    const state = createRulesDemo().snapshot();
    expect(state.actors[ID.immortal]!.subrealm).toBeNull();
    state.actors[ID.immortal]!.subrealm = 'initial';
    expect(() => new RulesSimulation(state)).toThrow();
    expect(Object.keys(RANK_ENERGY_LABELS)).toHaveLength(9);
  });

  it('casts four absolute ten-point costs from 44 percent and atomically rejects the fifth', () => {
    const engine = createRulesDemo();
    for (const amount of [3400, 2400, 1400, 400]) {
      expect(cast(engine).outcome.ok).toBe(true);
      expect(engine.snapshot().actors[ID.mortal]!.mortal!.amountBps).toBe(amount);
    }
    const before = engine.snapshot();
    expect(cast(engine).outcome.category).toBe('resources');
    expect(engine.snapshot()).toEqual(before);
  });

  it('refines quality at an explicit volume loss while keeping realm, aptitude and lifespan unchanged', () => {
    const engine = createRulesDemo();
    const old = engine.snapshot().actors[ID.mortal]!;
    const result = run(engine, { type: 'refine-quality', actorId: ID.mortal, inputBps: 2000 });
    const actor = result.snapshot.actors[ID.mortal]!;
    expect(result.outcome.ok).toBe(true);
    expect(actor.rank).toBe(old.rank); expect(actor.subrealm).toBe(old.subrealm);
    expect(actor.aptitudeBps).toBe(old.aptitudeBps); expect(actor.lifespanTicks).toBe(old.lifespanTicks);
    expect(actor.mortal!.amountBps).toBe(3400);
    expect(actor.mortal!.essence).toContainEqual({ quality: 2, amountBps: 1000 });
    expect(qualityLabel(2)).toContain('Trung giai');
    run(engine, { type: 'spend-primeval', actorId: ID.mortal, costBps: 1000 });
    expect(engine.snapshot().actors[ID.mortal]!.mortal!.amountBps).toBe(2600);
  });

  it('does not recover high-quality essence for free and keeps recovery capped', () => {
    const engine = createRulesDemo();
    run(engine, { type: 'refine-quality', actorId: ID.mortal, inputBps: 2000 });
    advance(engine, 1);
    const aperture = engine.snapshot().actors[ID.mortal]!.mortal!;
    expect(aperture.essence.find(b => b.quality === 2)!.amountBps).toBe(1000);
    expect(aperture.amountBps).toBeLessThanOrEqual(aperture.capacityBps);
  });

  it('requires a living, controlled wine Gu rather than granting a quality button to every owner', () => {
    const engine = createRulesDemo();
    run(engine, { type: 'destroy-gu', actorId: ID.mortal, instanceId: ID.wineGu });
    const before = engine.snapshot();
    expect(run(engine, { type: 'refine-quality', actorId: ID.mortal, inputBps: 2000 }).outcome.code).toBe('WINE_GU_REQUIRED');
    expect(engine.snapshot()).toEqual(before);
  });

  it('cultivation spends declared resources, progresses the wall and never bypasses its gate', () => {
    const engine = createRulesDemo();
    expect(run(engine, { type: 'breakthrough', actorId: ID.mortal }).outcome.ok).toBe(false);
    for (let i = 0; i < 4; i++) expect(run(engine, { type: 'cultivate', actorId: ID.mortal }).outcome.ok).toBe(true);
    expect(run(engine, { type: 'breakthrough', actorId: ID.mortal }).outcome.ok).toBe(true);
    const actor = engine.snapshot().actors[ID.mortal]!;
    expect(actor.subrealm).toBe('middle'); expect(actor.mortal!.wallProgress).toBe(0);
    expect(actor.aptitudeBps).toBe(4400);
  });

  it('Ten Extreme pressure grows with experienced time and suppression costs real resources', () => {
    const engine = createRulesDemo({ aptitudeBps: 10000, extremePressure: 6000 });
    advance(engine, 1);
    const before = engine.snapshot().actors[ID.mortal]!;
    expect(before.mortal!.tenExtreme!.pressure).toBeGreaterThan(6000);
    expect(run(engine, { type: 'suppress-extreme', actorId: ID.mortal }).outcome.ok).toBe(true);
    const actor = engine.snapshot().actors[ID.mortal]!;
    expect(actor.stones).toBeLessThan(before.stones);
    expect(actor.mortal!.tenExtreme!.pressure).toBeLessThan(before.mortal!.tenExtreme!.pressure);
  });

  it('extreme overpressure can kill and a retry cannot resurrect or duplicate its death', () => {
    const engine = createRulesDemo({ aptitudeBps: 10000, extremePressure: 9900 });
    const action: RuleAction = { type: 'advance-time', outerTicks: YEAR };
    const first = run(engine, action, 'death-time');
    expect(first.snapshot.actors[ID.mortal]!.alive).toBe(false);
    const repeated = run(engine, action, 'death-time');
    expect(repeated.snapshot).toEqual(first.snapshot);
    expect(run(engine, { type: 'cultivate', actorId: ID.mortal }).outcome.ok).toBe(false);
  });
});

describe('Gu instances, grants and transactional refinements', () => {
  it('a handover preserves ownership and a revoked borrower cannot activate a Gu', () => {
    const engine = createRulesDemo();
    const grant = run(engine, { type: 'grant-use', actorId: ID.mortal, instanceId: ID.moonGu, granteeId: ID.borrower, handOver: true });
    expect(grant.outcome.ok).toBe(true);
    expect(grant.snapshot.gu[ID.moonGu]!.ownerId).toBe(ID.mortal);
    expect(grant.snapshot.gu[ID.moonGu]!.holderId).toBe(ID.borrower);
    expect(run(engine, { type: 'use-gu', actorId: ID.borrower, instanceId: ID.moonGu }).outcome.ok).toBe(true);
    run(engine, { type: 'revoke-use', actorId: ID.mortal, instanceId: ID.moonGu, granteeId: ID.borrower });
    const before = engine.snapshot();
    expect(run(engine, { type: 'use-gu', actorId: ID.borrower, instanceId: ID.moonGu }).outcome.category).toBe('permission');
    expect(engine.snapshot()).toEqual(before);
    expect(before.gu[ID.moonGu]!.holderId).toBe(ID.borrower);
  });

  it('ownership does not bypass physical access or allow the borrower to destroy a loan', () => {
    const engine = createRulesDemo();
    run(engine, { type: 'grant-use', actorId: ID.mortal, instanceId: ID.moonGu, granteeId: ID.borrower, handOver: true });
    expect(run(engine, { type: 'use-gu', actorId: ID.mortal, instanceId: ID.moonGu }).outcome.ok).toBe(false);
    expect(run(engine, { type: 'destroy-gu', actorId: ID.borrower, instanceId: ID.moonGu }).outcome.category).toBe('permission');
  });

  it('ownership of an unrefined Gu alone grants neither activation nor the right to lend its control', () => {
    const initial = createRulesDemo().snapshot();
    initial.gu[ID.moonGu]!.controllerId = ID.borrower;
    const engine = new RulesSimulation(initial);
    expect(run(engine, { type: 'use-gu', actorId: ID.mortal, instanceId: ID.moonGu }).outcome.code).toBe('CONTROL_REQUIRED');
    expect(run(engine, { type: 'grant-use', actorId: ID.mortal, instanceId: ID.moonGu, granteeId: ID.borrower }).outcome.code).toBe('CONTROL_REQUIRED');
  });

  it('reserves one immortal type across output ranks before spending a competing actor resources', () => {
    const engine = createRulesDemo();
    expect(start(engine).outcome.ok).toBe(true);
    const before = engine.snapshot();
    const conflict = start(engine, ID.borrower, ID.recipe7, [ID.secondMoonGu, ID.secondBoarGu]);
    expect(conflict.outcome.category).toBe('unique');
    expect(engine.snapshot()).toEqual(before);
    expect(Object.keys(before.reservations)).toEqual([ID.immortalType]);
  });

  it('rejects duplicated input IDs and prevents using or lending reserved inputs', () => {
    const engine = createRulesDemo();
    expect(start(engine, ID.mortal, ID.recipe6, [ID.moonGu, ID.moonGu]).outcome.ok).toBe(false);
    const job = start(engine).outcome.jobId!;
    expect(job).toBeTruthy();
    expect(run(engine, { type: 'use-gu', actorId: ID.mortal, instanceId: ID.moonGu }).outcome.ok).toBe(false);
    expect(run(engine, { type: 'grant-use', actorId: ID.mortal, instanceId: ID.moonGu, granteeId: ID.borrower }).outcome.ok).toBe(false);
  });

  it('success consumes inputs once and creates exactly one existing immortal instance', () => {
    const engine = createRulesDemo({ naturalRollBps: () => 0 });
    const jobId = start(engine).outcome.jobId!;
    const action: RuleAction = { type: 'finish-refinement', jobId, techniqueScore: 100 };
    const result = run(engine, action, 'finish-once');
    expect(result.outcome.ok).toBe(true);
    expect(Object.values(result.snapshot.gu).filter(g => g.immortal && g.alive)).toHaveLength(1);
    expect(result.snapshot.gu[ID.moonGu]!.alive).toBe(false);
    expect(run(engine, action, 'finish-once').snapshot).toEqual(result.snapshot);
    expect(start(engine, ID.borrower, ID.recipe7, [ID.secondMoonGu, ID.secondBoarGu]).outcome.category).toBe('unique');
  });

  it('natural failure protects only the configured vital input and releases the type', () => {
    const engine = createRulesDemo({ naturalRollBps: () => 9999 });
    const jobId = start(engine).outcome.jobId!;
    const result = run(engine, { type: 'finish-refinement', jobId, techniqueScore: 100 });
    expect(result.outcome.category).toBe('natural');
    expect(result.snapshot.gu[ID.moonGu]!.alive).toBe(true);
    expect(result.snapshot.gu[ID.boarGu]!.alive).toBe(false);
    expect(result.snapshot.actors[ID.mortal]!.hp).toBe(100);
    expect(result.snapshot.reservations[ID.immortalType]).toBeUndefined();
    expect(start(engine, ID.borrower, ID.recipe7, [ID.secondMoonGu, ID.secondBoarGu]).outcome.ok).toBe(true);
  });

  it('technical failure cannot use natural-risk protection and applies vital backlash', () => {
    const engine = createRulesDemo({ naturalRollBps: () => 0 });
    const jobId = start(engine).outcome.jobId!;
    const result = run(engine, { type: 'finish-refinement', jobId, techniqueScore: 0 });
    expect(result.outcome.category).toBe('technical');
    expect(result.snapshot.gu[ID.moonGu]!.alive).toBe(false);
    expect(result.snapshot.actors[ID.mortal]!.hp).toBe(80);
    expect(result.snapshot.jobs[jobId]!.status).toBe('failed');
  });

  it('destruction, rather than changing holders or ranks, is what permits a new immortal instance', () => {
    const engine = createRulesDemo({ naturalRollBps: () => 0 });
    const jobId = start(engine).outcome.jobId!;
    const created = run(engine, { type: 'finish-refinement', jobId, techniqueScore: 100 }).outcome.instanceId!;
    expect(run(engine, { type: 'destroy-gu', actorId: ID.mortal, instanceId: created }).outcome.ok).toBe(true);
    const second = start(engine, ID.borrower, ID.recipe7, [ID.secondMoonGu, ID.secondBoarGu]);
    const result = run(engine, { type: 'finish-refinement', jobId: second.outcome.jobId!, techniqueScore: 100 });
    expect(result.outcome.instanceId).not.toBe(created);
    expect(result.snapshot.gu[created]!.alive).toBe(false);
    expect(result.snapshot.gu[result.outcome.instanceId!]!.rank).toBe(7);
  });
});

describe('three-stage ascension', () => {
  it('requires the declared order and cannot use a rank-one body', () => {
    const engine = createRulesDemo();
    expect(run(engine, { type: 'ascend', actorId: ID.mortal, step: 'shatter' }).outcome.ok).toBe(false);
    expect(run(engine, { type: 'ascend', actorId: ID.ascender, step: 'release', instanceId: ID.ascensionGu }).outcome.ok).toBe(false);
  });

  it('balances three qi and forms a new aperture without gifting an immortal Gu or lifespan', () => {
    const engine = createRulesDemo();
    const old = engine.snapshot().actors[ID.ascender]!;
    expect(run(engine, { type: 'ascend', actorId: ID.ascender, step: 'shatter' }).outcome.ok).toBe(true);
    expect(run(engine, { type: 'ascend', actorId: ID.ascender, step: 'absorb', heavenQi: 45, earthQi: 45 }).outcome.ok).toBe(true);
    const result = run(engine, { type: 'ascend', actorId: ID.ascender, step: 'release', instanceId: ID.ascensionGu });
    const actor = result.snapshot.actors[ID.ascender]!;
    expect(actor.rank).toBe(6); expect(actor.subrealm).toBeNull(); expect(actor.mortal).toBeNull();
    expect(actor.lifespanTicks).toBe(old.lifespanTicks); expect(actor.ageTicks).toBe(old.ageTicks);
    expect(actor.immortalEssence!.units).toBe(0);
    expect(result.snapshot.apertures[result.outcome.apertureId!]!.ownerId).toBe(ID.ascender);
    expect(Object.values(result.snapshot.gu).filter(g => g.immortal && g.alive)).toHaveLength(0);
    expect(result.snapshot.gu[ID.ascensionGu]!.rank).toBe(1);
  });

  it('overabsorbing or severely unbalancing qi has a recorded fatal result', () => {
    for (const [heavenQi, earthQi] of [[80, 80], [70, 10]]) {
      const engine = createRulesDemo();
      run(engine, { type: 'ascend', actorId: ID.ascender, step: 'shatter' });
      const result = run(engine, { type: 'ascend', actorId: ID.ascender, step: 'absorb', heavenQi: heavenQi!, earthQi: earthQi! });
      expect(result.outcome.ok).toBe(false);
      expect(result.snapshot.actors[ID.ascender]!.alive).toBe(false);
      expect(result.snapshot.actors[ID.ascender]!.rank).toBe(5);
    }
  });
});

describe('segmented time, location, ecology and coincident tribulations', () => {
  it('settles old and new ratios by their own segments and ages the outside owner only outside', () => {
    const engine = createRulesDemo({ ratio: 10 });
    const initial = engine.snapshot().actors[ID.immortal]!.ageTicks;
    advance(engine, 2);
    run(engine, { type: 'change-ratio', apertureId: ID.aperture, ratio: 20 });
    const result = advance(engine, 1);
    expect(result.snapshot.apertures[ID.aperture]!.innerTicks).toBe(40 * YEAR);
    expect(result.snapshot.actors[ID.immortal]!.ageTicks - initial).toBe(3 * YEAR);
  });

  it('ages a visitor at the containing aperture clock and respects placed gates', () => {
    const engine = createRulesDemo({ ratio: 20 });
    run(engine, { type: 'set-aperture-placed', apertureId: ID.aperture, placed: false });
    expect(run(engine, { type: 'enter-aperture', actorId: ID.borrower, apertureId: ID.aperture }).outcome.ok).toBe(false);
    run(engine, { type: 'set-aperture-placed', apertureId: ID.aperture, placed: true });
    run(engine, { type: 'enter-aperture', actorId: ID.borrower, apertureId: ID.aperture });
    const age = engine.snapshot().actors[ID.borrower]!.ageTicks;
    advance(engine, 1);
    expect(engine.snapshot().actors[ID.borrower]!.ageTicks - age).toBe(20 * YEAR);
    expect(run(engine, { type: 'set-aperture-placed', apertureId: ID.aperture, placed: false }).outcome.ok).toBe(false);
    run(engine, { type: 'leave-aperture', actorId: ID.borrower });
    advance(engine, 1);
    expect(engine.snapshot().actors[ID.borrower]!.ageTicks - age).toBe(21 * YEAR);
  });

  it('generates both events at overlapping boundaries and exactly 30 plus 3 through inner year 300', () => {
    const engine = createRulesDemo({ ratio: 10 });
    const result = advance(engine, 30);
    const events = result.snapshot.tribulations.filter(t => t.apertureId === ID.aperture);
    expect(events.filter(t => t.kind === 'earth')).toHaveLength(30);
    expect(events.filter(t => t.kind === 'heaven')).toHaveLength(3);
    expect(events.filter(t => t.dueInnerYear === 100).map(t => t.kind)).toEqual(['earth', 'heaven']);
    expect(new Set(events.map(t => t.id)).size).toBe(33);
  });

  it('changing ratios across year 100 never resets or skips either due cycle', () => {
    const engine = createRulesDemo({ ratio: 10 });
    advance(engine, 9);
    advance(engine, 0.5);
    run(engine, { type: 'change-ratio', apertureId: ID.aperture, ratio: 20 });
    const result = advance(engine, 0.5);
    expect(result.snapshot.apertures[ID.aperture]!.innerTicks).toBe(105 * YEAR);
    expect(result.snapshot.tribulations.filter(t => t.dueInnerYear === 100)).toHaveLength(2);
  });

  it('small advances and one large advance produce the same ecology, clocks, ages and due events', () => {
    const one = createRulesDemo({ ratio: 10 }); const many = createRulesDemo({ ratio: 10 });
    advance(one, 2);
    for (let i = 0; i < 20; i++) advance(many, 0.1);
    const a = one.snapshot(); const b = many.snapshot();
    expect(a.apertures).toEqual(b.apertures); expect(a.actors).toEqual(b.actors);
    expect(a.tribulations).toEqual(b.tribulations);
  });

  it('never credits personal essence after death when a single time jump crosses the lifespan', () => {
    const one = createRulesDemo({ ratio: 1 }); const many = createRulesDemo({ ratio: 1 });
    advance(one, 100);
    for (let i = 0; i < 100; i++) advance(many, 1);
    expect(one.snapshot().actors).toEqual(many.snapshot().actors);
    expect(one.snapshot().apertures).toEqual(many.snapshot().apertures);
    expect(one.snapshot().actors[ID.immortal]!.alive).toBe(false);
    expect(one.snapshot().actors[ID.immortal]!.immortalEssence!.units).toBe(59);
  });

  it('water-limited production does not appear for free, while food consumption and shortage continue', () => {
    const state = createRulesDemo({ ratio: 1 }).snapshot();
    state.apertures[ID.aperture]!.ecology.water = 0;
    state.apertures[ID.aperture]!.ecology.food = 1;
    const engine = new RulesSimulation(state);
    const oldPlants = state.apertures[ID.aperture]!.ecology.plants;
    advance(engine, 2);
    const ecology = engine.snapshot().apertures[ID.aperture]!.ecology;
    expect(ecology.plants).toBe(oldPlants); expect(ecology.food).toBe(0); expect(ecology.shortageYears).toBe(1);
  });

  it('settles habitat damage at the due year before producing the next year', () => {
    const engine = createRulesDemo({ ratio: 1 });
    advance(engine, 9);
    const at9 = engine.snapshot().apertures[ID.aperture]!.ecology;
    advance(engine, 1);
    const at10 = engine.snapshot().apertures[ID.aperture]!.ecology;
    expect(at10.habitatBps).toBeLessThan(at9.habitatBps);
    const due = engine.snapshot().tribulations[0]!;
    const result = run(engine, { type: 'resolve-tribulation', actorId: ID.immortal, tribulationId: due.id, defend: true });
    expect(result.outcome.ok).toBe(true);
    const marks = result.snapshot.apertures[ID.aperture]!.daoMarks;
    expect(marks).toBeGreaterThan(0);
    expect(run(engine, { type: 'resolve-tribulation', actorId: ID.immortal, tribulationId: due.id, defend: true }).outcome.ok).toBe(false);
    expect(engine.snapshot().apertures[ID.aperture]!.daoMarks).toBe(marks);
  });

  it('rejects negative, fractional, unsafe time and unsupported ratios atomically', () => {
    const engine = createRulesDemo(); const old = engine.snapshot();
    for (const outerTicks of [-1, 0, 0.5, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(run(engine, { type: 'advance-time', outerTicks }).outcome.ok).toBe(false);
      expect(engine.snapshot()).toEqual(old);
    }
    expect(run(engine, { type: 'change-ratio', apertureId: ID.aperture, ratio: 33 }).outcome.ok).toBe(false);
    expect(engine.snapshot()).toEqual(old);
  });
});

describe('simulation transaction boundaries', () => {
  it('returns a recorded retry before checking a now-stale revision, rejects payload reuse and leaves invalid commands unchanged', () => {
    const engine = createRulesDemo();
    const command = { operationId: 'same', expectedRevision: 0, action: { type: 'spend-primeval', actorId: ID.mortal, costBps: 1000 } as RuleAction };
    const first = engine.execute(command);
    expect(engine.execute(command).snapshot).toEqual(first.snapshot);
    expect(engine.execute({ ...command, action: { ...command.action, type: 'spend-primeval', actorId: ID.mortal, costBps: 2000 } }).outcome.code).toBe('OPERATION_CONFLICT');
    expect(engine.execute({ operationId: 'stale', expectedRevision: 0, action: { type: 'cultivate', actorId: ID.mortal } }).outcome.code).toBe('STALE_REVISION');
    expect(engine.snapshot()).toEqual(first.snapshot);
  });

  it('rejects duplicate living singleton instances in imported simulation state', () => {
    const engine = createRulesDemo({ naturalRollBps: () => 0 });
    const jobId = start(engine).outcome.jobId!;
    const result = run(engine, { type: 'finish-refinement', jobId, techniqueScore: 100 });
    const state = result.snapshot; const gu = state.gu[result.outcome.instanceId!]!;
    state.gu['duplicate'] = { ...gu, id: 'duplicate', rank: 7 };
    expect(() => new RulesSimulation(state)).toThrow();
  });
});

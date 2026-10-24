import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldStore } from './world-store.mjs';
import { createFieldState, advanceField, FIELD_GU_IDS } from './field-engine.mjs';
import { sampleSpawn, getNearbyEncounters, checkWorldCollision, isInsideSanctuary } from '../shared/overworld-core.mjs';

function harness(options = {}) {
  let time = 1_000_000;
  const { legacyGu, ...storeOptions } = options;
  let store = new WorldStore({ now: () => time, randomIndex: () => 0, ...storeOptions });
  const session = store.createSession('Người đi đường');
  if (legacyGu) {
    const disk = JSON.parse(readFileSync(options.filePath, 'utf8'));
    const life = Object.values(disk.accounts)[0].life;
    delete life.cultivation; life.rank = 2; life.field.guIds = [...FIELD_GU_IDS];
    writeFileSync(options.filePath, JSON.stringify(disk));
    store = new WorldStore({ now: () => time, randomIndex: () => 0, ...storeOptions });
  }
  const field = () => store.fieldSnapshot(session.token);
  const input = (seq, extra = {}) => store.fieldInput(session.token, { lifeId: field().lifeId, seq, move: { x: 1, y: 0 }, aimAngle: 0, ...extra });
  return { store, session, field, input, advance: ms => { time += ms; }, now: () => time };
}

test('field uses server time and normalized movement, never client balances; duplicate sequences cannot repeat casts', () => {
  const h = harness(); const first = h.field();
  assert.equal(first.hp, 100); assert.equal(first.mp, 44); assert.equal(first.stamina, 100);
  h.advance(10_000);
  const moved = h.input(1, { move: { x: 99, y: 0 }, action: 'moonlight' });
  assert.ok(moved.x - first.x <= 40.001 && moved.x >= first.x);
  assert.equal(moved.mp, 44); assert.equal(moved.projectiles.length, 0); assert.equal(moved.actionResult.code, 'GU_REQUIRED');
  assert.equal(h.input(1, { action: 'moonlight' }).mp, 44);
  assert.throws(() => h.input(2, { stones: 99999 }), { code: 'INVALID_FIELD_INPUT' });
  assert.throws(() => h.input(2, { move: { x: NaN, y: 0 } }), { code: 'INVALID_FIELD_INPUT' });
  assert.throws(() => h.input(2, { lifeId: 'old-life' }), { code: 'STALE_LIFE' });
  assert.equal(h.store.snapshot(h.session.token).life.stones, 20);
});

test('field spawn persists across restart, reads and verified account linking without touching earned assets', t => {
  const directory = mkdtempSync(join(tmpdir(), 'cotienlo-field-')); t.after(() => rmSync(directory, { force: true, recursive: true }));
  const filePath = join(directory, 'world.json'); const h = harness({ filePath });
  const first = h.field(); h.advance(250); const moved = h.input(1); h.store.checkpoint();
  const restored = new WorldStore({ filePath, now: h.now, randomIndex: maximum => maximum - 1 });
  const field = restored.fieldSnapshot(h.session.token);
  assert.equal(field.lifeId, first.lifeId); assert.equal(field.x, moved.x); assert.equal(field.y, moved.y);
  restored.linkVerifiedAccount('verified-field-user', 'Người Gmail', h.session.token);
  assert.equal(restored.fieldSnapshotForUser('verified-field-user').x, moved.x);
  assert.throws(() => restored.fieldSnapshot(h.session.token), { code: 'UNAUTHORIZED' });
  assert.equal(JSON.stringify(field).includes('tokenHash'), false);
  assert.equal(Object.values(JSON.parse(readFileSync(filePath, 'utf8')).accounts)[0].life.stones, 20);
});

test('field epoch follows decisive trial death and rebirth exactly once, with a server chosen new spawn', () => {
  const h = harness(); const before = h.field();
  let life = h.store.snapshot(h.session.token).life; let id = 0;
  const act = (type, payload = {}) => h.store.execute(h.session.token, { operationId: `field-life-${++id}`, lifeId: life.id, action: { type, payload } });
  act('investigate'); act('commit', { inheritanceId: 'duong-truc', acceptDeath: true });
  life = h.store.snapshot(h.session.token).life;
  act('choose', { stageId: life.trial.stage.id, choiceId: 'concede' });
  assert.equal(h.field().dead, true); assert.equal(h.field().hp, 0);
  const born = act('rebirth', { originId: 'east' }); life = born.life;
  const after = h.field(); assert.notEqual(after.lifeId, before.lifeId); assert.equal(after.seq, 0);
  assert.equal(after.regionId, 'south', 'Flavor origin must not force the spatial region');
  assert.equal(after.hp, 100); assert.equal(born.account.pastLives.length, 1);
  assert.throws(() => h.store.fieldInput(h.session.token, { lifeId: before.lifeId, seq: 99, move: { x: 0, y: 0 }, aimAngle: 0 }), { code: 'STALE_LIFE' });
});

test('server-owned refinement spends starter coins first once, grants upgrades and uses their real combat costs', t => {
  const directory = mkdtempSync(join(tmpdir(), 'cotienlo-field-craft-')); t.after(() => rmSync(directory, { force: true, recursive: true }));
  const h = harness({ filePath: join(directory, 'world.json'), legacyGu: true }); const first = h.field();
  const bypass = h.input(1, { move: { x: 0, y: 0 }, action: 'refine-moonblade' });
  assert.equal(bypass.actionResult.code, 'RECIPE_MENU_REQUIRED'); assert.equal(bypass.stones, 20);
  const inputIds = first.resources.gu.filter(gu => ['moonlight', 'boar'].includes(gu.typeId)).map(gu => gu.id);
  const request = { operationId: 'legacy-recipe-command', lifeId: first.lifeId, action: { type: 'resource', payload: { option: 'start-refine', recipeId: 'legacy-moonblade', inputIds } } };
  assert.equal(h.store.execute(h.session.token, request).life.stones, 10);
  assert.equal(h.store.execute(h.session.token, request).life.stones, 10);
  assert.equal(h.field().guIds.includes('moonblade'), false);
  h.advance(10000); h.store.tick();
  const crafted = h.field(); assert.ok(crafted.guIds.includes('moonblade'));
  h.advance(250);
  const shot = h.input(2, { move: { x: 0, y: 0 }, action: 'moonlight' });
  assert.equal(shot.mp, 26); assert.equal(shot.cooldowns.moonlight, 1.2);
  assert.ok(shot.projectiles[0].damage >= 55); assert.equal(shot.projectiles[0].piercing, true);
  assert.equal(shot.lifeId, first.lifeId);
});

test('projectile hits and monster death rewards are computed on server and cannot repeat from one shot', () => {
  const spawn = sampleSpawn(() => 0); const encounter = getNearbyEncounters(spawn.x, spawn.y, 4000).find(item => item.type === 'snake');
  assert.ok(encounter);
  const pose = [{ x: encounter.x - 90, y: encounter.y }, { x: encounter.x + 90, y: encounter.y }, { x: encounter.x, y: encounter.y - 90 }, { x: encounter.x, y: encounter.y + 90 }]
    .find(point => !checkWorldCollision(point.x, point.y) && !isInsideSanctuary(point.x, point.y));
  assert.ok(pose);
  const life = { id: 'test-life', number: 1, hp: 100, stones: 20, supplies: 8, dead: false, trial: null,
    starterStonesRemaining: 20, field: createFieldState({ ...spawn, ...pose }, 1000, [...FIELD_GU_IDS]) };
  life.field.monsters[encounter.id] = { ...encounter, spawnX: encounter.x, spawnY: encounter.y, hp: 60, cooldown: 0, respawnAt: 0, state: 'patrol' };
  Object.assign(life.field, { nextInterestAt: 30_000, interestX: pose.x, interestY: pose.y });
  let now = 1000, sequence = 0;
  for (let count = 0; count < 12 && life.hp > 0; count++) {
    now += 250;
    const target = life.field.monsters[encounter.id];
    const aimAngle = Math.atan2(target.y - pose.y, target.x - pose.x);
    advanceField(life, { lifeId: life.id, seq: ++sequence, move: { x: 0, y: 0 }, aimAngle, action: 'moonlight' }, now);
  }
  assert.equal(life.field.monsters[encounter.id].hp, 0);
  assert.ok(life.stones >= 28);
  const stones = life.stones;
  advanceField(life, { lifeId: life.id, seq: sequence, move: { x: 0, y: 0 }, aimAngle: 0, action: 'moonlight' }, now);
  assert.equal(life.stones, stones);
});

test('server combat death is persisted before response and only earned assets enter remains', t => {
  const directory = mkdtempSync(join(tmpdir(), 'cotienlo-field-death-')); t.after(() => rmSync(directory, { force: true, recursive: true }));
  const filePath = join(directory, 'world.json'); const h = harness({ filePath });
  const first = h.field();
  // Trusted persisted fixture puts the body beside an actual deterministic encounter.
  const disk = JSON.parse(readFileSync(filePath, 'utf8')); const life = Object.values(disk.accounts)[0].life;
  const encounter = getNearbyEncounters(first.x, first.y, 4000).find(item => item.type === 'snake');
  life.field.x = encounter.x; life.field.y = encounter.y; life.hp = 1;
  life.stones = 28;
  return import('node:fs').then(({ writeFileSync }) => {
    writeFileSync(filePath, JSON.stringify(disk));
    const store = new WorldStore({ filePath, now: h.now }); h.advance(250);
    store.tick();
    const result = store.fieldInput(h.session.token, { lifeId: life.id, seq: 1, move: { x: 0, y: 0 }, aimAngle: 0 });
    assert.equal(result.dead, true); assert.equal(result.hp, 0);
    const saved = Object.values(JSON.parse(readFileSync(filePath, 'utf8')).accounts)[0];
    assert.equal(saved.pastLives.length, 1); assert.equal(saved.life.dead, true);
    const snapshot = store.snapshot(h.session.token);
    assert.equal(snapshot.remains.at(-1).stones, 8);
    store.fieldInput(h.session.token, { lifeId: life.id, seq: 1, move: { x: 0, y: 0 }, aimAngle: 0 });
    assert.equal(store.snapshot(h.session.token).account.pastLives.length, 1);
  });
});

test('a field read durably archives a trial timeout before publishing the death', t => {
  const directory = mkdtempSync(join(tmpdir(), 'cotienlo-field-timeout-')); t.after(() => rmSync(directory, { force: true, recursive: true }));
  const filePath = join(directory, 'world.json'); const h = harness({ filePath, legacyGu: true });
  const field = h.field();
  const act = (id, type, payload = {}) => h.store.execute(h.session.token, { operationId: id, lifeId: field.lifeId, action: { type, payload } });
  act('timeout-investigate', 'investigate'); act('timeout-commit', 'commit', { inheritanceId: 'duong-truc', acceptDeath: true });
  h.advance(400_001);
  assert.equal(h.field().dead, true);
  const saved = Object.values(JSON.parse(readFileSync(filePath, 'utf8')).accounts)[0];
  assert.equal(saved.life.dead, true);
  assert.equal(saved.pastLives.filter(item => item.id === field.lifeId).length, 1);
});

test('all authored field POIs lie on walkable connecting roads and birth agrees with its nearest POI', () => {
  const regions = new Set(), places = new Set();
  for (let region = 0; region < 5; region++) {
    for (let hub = 0; hub < 3; hub++) {
      let selection = 0;
      const h = harness({ randomIndex: max => max === 1_000_000 ? [region * 200_000 + 1, hub * 333_334 + 1, 0][selection++] : 0 });
      const field = h.field(); regions.add(field.regionId);
      const current = field.nearbyPlaces.find(place => place.id === field.placeId);
      assert.ok(current && Math.hypot(current.x - field.x, current.y - field.y) <= 220, `Spawn mismatch ${region}/${hub}`);
      assert.equal(field.nearbyPlaces.length, 2);
      for (const point of field.nearbyPlaces) {
        places.add(point.id);
        assert.equal(checkWorldCollision(point.x, point.y, 22), false, point.id);
        const anchor = field.nearbyPlaces[0];
        for (let step = 0; step <= 20; step++) {
          assert.equal(checkWorldCollision(anchor.x + (point.x - anchor.x) * step / 20, anchor.y + (point.y - anchor.y) * step / 20, 22), false, point.id);
        }
      }
    }
  }
  assert.equal(regions.size, 5);
  assert.equal(places.size, 30);
});

test('critical refinement persistence failure preserves coins, equipment and the acknowledged sequence', t => {
  const directory = mkdtempSync(join(tmpdir(), 'cotienlo-field-rollback-')); t.after(() => rmSync(directory, { force: true, recursive: true }));
  const filePath = join(directory, 'world.json'); const h = harness({ filePath, legacyGu: true });
  const before = h.field(); const disk = readFileSync(filePath, 'utf8');
  const inputIds = before.resources.gu.filter(gu => ['moonlight', 'boar'].includes(gu.typeId)).map(gu => gu.id);
  const request = { operationId: 'rollback-recipe-command', lifeId: before.lifeId, action: { type: 'resource', payload: { option: 'start-refine', recipeId: 'legacy-moonblade', inputIds } } };
  rmSync(filePath); mkdirSync(filePath);
  assert.throws(() => h.store.execute(h.session.token, request));
  rmSync(filePath, { recursive: true }); writeFileSync(filePath, disk);
  const unchanged = h.field();
  assert.equal(unchanged.seq, before.seq); assert.equal(unchanged.stones, before.stones);
  assert.deepEqual(unchanged.guIds, before.guIds);
  assert.equal(h.store.execute(h.session.token, request).life.stones, 10);
});

test('Iron Skin refinement retains its established 15-stone fee and 80 percent success rate', () => {
  const makeLife = () => ({ id: 'iron-life', number: 1, hp: 100, stones: 20, supplies: 8, dead: false, trial: null,
    starterStonesRemaining: 20, field: createFieldState(sampleSpawn(() => 0), 1000, [...FIELD_GU_IDS]) });
  const input = { lifeId: 'iron-life', seq: 1, move: { x: 0, y: 0 }, aimAngle: 0, action: 'refine-ironskin' };
  const failed = makeLife(); advanceField(failed, input, 1250, () => 8100);
  assert.equal(failed.stones, 5); assert.equal(failed.starterStonesRemaining, 5);
  assert.equal(failed.field.guIds.includes('ironskin'), false);
  assert.equal(failed.field.actionResult.code, 'REFINEMENT_FAILED');
  const succeeded = makeLife(); advanceField(succeeded, input, 1250, () => 7900);
  assert.equal(succeeded.stones, 5); assert.equal(succeeded.field.guIds.includes('ironskin'), true);
  assert.ok(succeeded.field.guIds.includes('bronze') && succeeded.field.guIds.includes('boar'));
});

test('nearby player interest remains bounded even when more than128 players enter one hub', () => {
  const h = harness(); h.field();
  for (let index = 0; index < 130; index++) {
    const peer = h.store.createSession('Người gần ' + index);
    h.store.fieldSnapshot(peer.token);
  }
  const result = h.field();
  assert.equal(result.nearbyPlayers.length, 128);
  assert.equal(result.nearbyPlayers.some(peer => peer.accountId === h.session.snapshot.account.id), false);
  assert.equal(JSON.stringify(result.nearbyPlayers).includes('tokenHash'), false);
});

test('corrupt persisted field identity cannot silently move a body into a forged region', t => {
  const directory = mkdtempSync(join(tmpdir(), 'cotienlo-field-corrupt-')); t.after(() => rmSync(directory, { force: true, recursive: true }));
  const filePath = join(directory, 'world.json'); const h = harness({ filePath }); h.field();
  const good = readFileSync(filePath, 'utf8');
  for (const change of [field => { field.regionId = 'forged-region'; }, field => { field.hubId = 'unknown-hub'; }, field => { field.entered = 'yes'; }]) {
    const disk = JSON.parse(good); change(Object.values(disk.accounts)[0].life.field); writeFileSync(filePath, JSON.stringify(disk));
    assert.throws(() => new WorldStore({ filePath, now: h.now }), /corrupt/i);
  }
});

test('motion is checkpointed and an idle read cannot keep moving the last input', t => {
  const directory = mkdtempSync(join(tmpdir(), 'cotienlo-field-checkpoint-')); t.after(() => rmSync(directory, { force: true, recursive: true }));
  const filePath = join(directory, 'world.json'); const h = harness({ filePath });
  h.field(); const before = readFileSync(filePath, 'utf8');
  h.advance(250); const moved = h.input(1);
  assert.equal(readFileSync(filePath, 'utf8'), before, 'Pose input must not replace the durable file at frame rate');
  h.advance(10_000); const idle = h.field();
  assert.equal(idle.x, moved.x); assert.equal(idle.y, moved.y); assert.equal(idle.seq, moved.seq);
  h.store.checkpoint();
  const saved = Object.values(JSON.parse(readFileSync(filePath, 'utf8')).accounts)[0].life.field;
  assert.equal(saved.x, moved.x); assert.equal(saved.seq, moved.seq);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldStore } from './world-store.mjs';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getNearbyEncounters, checkWorldCollision, isInsideSanctuary } from '../shared/overworld-core.mjs';
import { createWorldServer } from './http-server.mjs';
import { AuthStore } from './auth-store.mjs';

function sharedFixture(t, { shooters = false } = {}) {
  let time = 1_000_000;
  const directory = mkdtempSync(join(tmpdir(), 'cotienlo-living-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const filePath = join(directory, 'world.json');
  const original = new WorldStore({ filePath, now: () => time, randomIndex: () => 0 });
  const sessions = [original.createSession('Người thứ nhất'), original.createSession('Người thứ hai')];
  const spawn = original.fieldSnapshot(sessions[0].token);
  const encounter = getNearbyEncounters(spawn.x, spawn.y, 4000).find(item => item.type === 'snake');
  assert.ok(encounter, 'An authored hunt must be reachable outside the sanctuary');
  const pose = [{ x: encounter.x - 90, y: encounter.y }, { x: encounter.x + 90, y: encounter.y }, { x: encounter.x, y: encounter.y - 90 }, { x: encounter.x, y: encounter.y + 90 }]
    .find(point => !checkWorldCollision(point.x, point.y) && !isInsideSanctuary(point.x, point.y));
  assert.ok(pose);
  const disk = JSON.parse(readFileSync(filePath, 'utf8'));
  disk.fieldRuntime.monsters = { [encounter.id]: { ...encounter, spawnX: encounter.x, spawnY: encounter.y, hp: 60, state: 'patrol', cooldown: 0, respawnAt: 0 } };
  for (const account of Object.values(disk.accounts)) {
    Object.assign(account.life.field, pose, { entered: true, nextInterestAt: time + 30_000, interestX: pose.x, interestY: pose.y });
    if (shooters) {
      const angle = Math.atan2(encounter.y - pose.y, encounter.x - pose.x);
      account.life.field.projectiles.push({ id: account.life.id + ':shot:1', ownerLifeId: account.life.id, type: 'moonlight',
        x: pose.x, y: pose.y, angle, vx: Math.cos(angle) * 460, vy: Math.sin(angle) * 460, life: 2, damage: 400, hitIds: [] });
      account.life.field.nextProjectile = 1;
    }
  }
  writeFileSync(filePath, JSON.stringify(disk));
  const store = new WorldStore({ filePath, now: () => time, randomIndex: () => 0 });
  return { store, sessions, filePath, encounter, advance: ms => { time += ms; }, now: () => time };
}

test('new lives enter the settlement with no owned or equipped Gu', () => {
  const store = new WorldStore({ now: () => 1_000_000, randomIndex: () => 0 });
  const session = store.createSession('Học viên');
  const field = store.fieldSnapshot(session.token);
  assert.deepEqual(field.guIds, []);
  assert.deepEqual(session.snapshot.life.gu, []);
  assert.equal(field.mp, 44);
  assert.equal(field.maxMp, 44);
});

test('service ticks integrate held controls once and stop stale movement after350ms', () => {
  let time = 1_000_000;
  const store = new WorldStore({ now: () => time, randomIndex: () => 0 });
  const session = store.createSession('Bộ pháp');
  const first = store.fieldSnapshot(session.token);
  store.fieldInput(session.token, { lifeId: first.lifeId, seq: 1, move: { x: 1, y: 0 }, aimAngle: 0 });
  for (let i = 0; i < 20; i++) { time += 50; store.tick(); }
  const stopped = store.fieldSnapshot(session.token);
  assert.ok(stopped.x > first.x);
  assert.ok(stopped.x - first.x <= 56.01);
  time += 1000; store.tick();
  assert.equal(store.fieldSnapshot(session.token).x, stopped.x);
  assert.equal(store.runtimeMetrics().ticks, 21);
});

test('shared monsters continue chasing without input and spend one actor step per clock tick', t => {
  const h = sharedFixture(t);
  h.advance(50); h.store.tick();
  const before = h.store.fieldSnapshot(h.sessions[0].token);
  const monster = before.monsters.find(item => item.id === h.encounter.id);
  assert.ok(monster);
  assert.equal(monster.state, 'chase');
  h.advance(200); h.store.tick();
  const after = h.store.fieldSnapshot(h.sessions[0].token);
  const moved = after.monsters.find(item => item.id === monster.id);
  assert.notDeepEqual([moved.x, moved.y], [monster.x, monster.y]);
  const peer = h.store.fieldSnapshot(h.sessions[1].token).monsters.find(item => item.id === monster.id);
  assert.deepEqual(peer, moved);
  assert.equal(before.seq, after.seq, 'AI advances without a new control packet');
  h.advance(15_001); h.store.tick();
  assert.equal(h.store.runtimeMetrics().activePlayers, 0);
  assert.equal(h.store.runtimeMetrics().monsters, 0);
});

test('a shared monster gives exactly one durable reward to the projectile owner', t => {
  const h = sharedFixture(t, { shooters: true });
  h.advance(250); h.store.tick();
  const views = h.sessions.map(session => h.store.fieldSnapshot(session.token));
  assert.equal(views[0].monsters.find(item => item.id === h.encounter.id).hp, 0);
  assert.equal(views[1].monsters.find(item => item.id === h.encounter.id).hp, 0);
  assert.equal(views.reduce((sum, view) => sum + view.stones, 0), 48);
  const saved = JSON.parse(readFileSync(h.filePath, 'utf8'));
  assert.equal(saved.fieldRuntime.monsters[h.encounter.id].hp, 0);
  assert.equal(Object.values(saved.accounts).reduce((sum, account) => sum + account.life.stones, 0), 48);
  h.advance(50); h.store.tick();
  assert.equal(h.sessions.reduce((sum, session) => sum + h.store.fieldSnapshot(session.token).stones, 0), 48);
});

test('critical shared reward save failure rolls back both the actor and monster pool', t => {
  const h = sharedFixture(t, { shooters: true });
  const disk = readFileSync(h.filePath, 'utf8');
  const before = h.store.fieldSnapshot(h.sessions[0].token);
  rmSync(h.filePath); mkdirSync(h.filePath);
  h.advance(250);
  assert.throws(() => h.store.tick());
  const after = h.store.fieldSnapshot(h.sessions[0].token);
  assert.equal(after.stones, before.stones);
  assert.deepEqual(after.projectiles, before.projectiles);
  assert.equal(after.monsters.find(item => item.id === h.encounter.id).hp, 60);
  rmSync(h.filePath, { recursive: true }); writeFileSync(h.filePath, disk);
  h.store.tick();
  assert.equal(h.sessions.reduce((sum, session) => sum + h.store.fieldSnapshot(session.token).stones, 0), 48);
});

test('ordinary field and world polls plus control packets do not replace the durable file', t => {
  const h = sharedFixture(t);
  const disk = readFileSync(h.filePath, 'utf8');
  const writes = h.store.runtimeMetrics().durableWrites;
  for (let i = 0; i < 8; i++) {
    const field = h.store.fieldSnapshot(h.sessions[0].token);
    h.store.snapshot(h.sessions[0].token);
    h.store.fieldInput(h.sessions[0].token, { lifeId: field.lifeId, seq: i + 1, move: { x: 0, y: 0 }, aimAngle: 0 });
  }
  assert.equal(h.store.runtimeMetrics().durableWrites, writes);
  assert.equal(readFileSync(h.filePath, 'utf8'), disk);
  h.store.checkpoint();
  assert.equal(h.store.runtimeMetrics().durableWrites, writes + 1);
});

test('HTTP service owns the simulation timer while no input request is in flight', async t => {
  const h = sharedFixture(t);
  const offset = h.now() - Date.now();
  const store = new WorldStore({ filePath: h.filePath, now: () => Date.now() + offset });
  const server = createWorldServer({ store, authStore: new AuthStore({ filePath: null, mailer: null }), checkpointIntervalMs: 0, simulationIntervalMs: 20 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const headers = { Authorization: 'Bearer ' + h.sessions[0].token };
  const url = 'http://127.0.0.1:' + server.address().port + '/api/world/field';
  await new Promise(resolve => setTimeout(resolve, 70));
  const before = await (await fetch(url, { headers })).json();
  const monster = before.monsters.find(item => item.id === h.encounter.id);
  await new Promise(resolve => setTimeout(resolve, 150));
  const after = await (await fetch(url, { headers })).json();
  const moved = after.monsters.find(item => item.id === h.encounter.id);
  assert.ok(after.runtime.ticks > before.runtime.ticks);
  assert.notDeepEqual([moved.x, moved.y], [monster.x, monster.y]);
  assert.equal(after.seq, 0);
});

test('academy claims an untamed Gu once, refines on the server clock and persists before usability', t => {
  let time = 1_000_000, sequence = 0;
  const directory = mkdtempSync(join(tmpdir(), 'cotienlo-academy-')); t.after(() => rmSync(directory, { force: true, recursive: true }));
  const filePath = join(directory, 'world.json');
  const store = new WorldStore({ filePath, now: () => time, randomIndex: () => 0 });
  const session = store.createSession('Học viên mới');
  const initial = store.fieldSnapshot(session.token);
  const facilityId = initial.facilities.find(facility => facility.role === 'academy').id;
  const request = (option, extra = {}) => ({ operationId: 'academy-' + ++sequence, lifeId: initial.lifeId, action: { type: 'academy', payload: { facilityId, option, ...extra } } });
  const claim = request('claim-gu', { guId: 'moonlight' });
  store.execute(session.token, claim);
  const untamed = store.fieldSnapshot(session.token);
  assert.deepEqual(untamed.guIds, ['moonlight']); assert.deepEqual(untamed.usableGuIds, []);
  assert.throws(() => store.execute(session.token, request('claim-gu', { guId: 'bronze' })), { code: 'FIRST_GU_ALREADY_CLAIMED' });
  const failedCast = store.fieldInput(session.token, { lifeId: initial.lifeId, seq: 1, move: { x: 0, y: 0 }, aimAngle: 0, action: 'moonlight' });
  assert.equal(failedCast.actionResult.code, 'GU_UNCONTROLLED');
  const tame = request('tame-gu', { guId: 'moonlight' });
  assert.equal(store.execute(session.token, tame).life.stones, 18);
  assert.equal(store.execute(session.token, tame).life.stones, 18);
  time += 9999; store.tick(); assert.deepEqual(store.fieldSnapshot(session.token).usableGuIds, []);
  time++; store.tick();
  const ready = store.fieldSnapshot(session.token);
  assert.deepEqual(ready.usableGuIds, ['moonlight']);
  assert.equal(ready.actionResult.code, 'GU_TAMED');
  assert.equal(Object.values(JSON.parse(readFileSync(filePath, 'utf8')).accounts)[0].life.cultivation.guInstances[0].controlled, true);
  const cast = store.fieldInput(session.token, { lifeId: initial.lifeId, seq: 2, move: { x: 0, y: 0 }, aimAngle: 0, action: 'moonlight' });
  assert.equal(cast.mp, 34); assert.equal(cast.projectiles.length, 1);
  assert.throws(() => store.execute(session.token, request('buy-gu', { guId: 'bronze' })), { code: 'FACILITY_ACTION_REQUIRED' });
  assert.throws(() => store.execute(session.token, request('claim-gu', { facilityId: 'forged' })), { code: 'FACILITY_REQUIRED' });
  assert.throws(() => store.execute(session.token, request('cultivate', { stones: 999 })), { code: 'INVALID_ACADEMY_ACTION' });
});

test('a disconnected cultivation activity pauses until a real player heartbeat resumes it', () => {
  let time = 1_000_000, operation = 0;
  const store = new WorldStore({ now: () => time, randomIndex: () => 0 });
  const session = store.createSession('Nghỉ học');
  const initial = store.fieldSnapshot(session.token);
  const facilityId = initial.facilities.find(facility => facility.role === 'academy').id;
  const act = (option, guId) => store.execute(session.token, { operationId: 'pause-' + ++operation, lifeId: initial.lifeId, action: { type: 'academy', payload: { facilityId, option, guId } } });
  act('claim-gu', 'moonlight'); act('tame-gu', 'moonlight');
  time += 1000; store.tick();
  time += 20_000; store.tick();
  const resumed = store.fieldSnapshot(session.token);
  assert.equal(resumed.cultivation.ageMs, 1000);
  assert.deepEqual(resumed.usableGuIds, []);
  time += 8999; store.tick(); assert.deepEqual(store.fieldSnapshot(session.token).usableGuIds, []);
  time++; store.tick(); assert.deepEqual(store.fieldSnapshot(session.token).usableGuIds, ['moonlight']);
});

test('death and rebirth clear every owned Gu, activity and instance identity', () => {
  let time = 1_000_000, sequence = 0;
  const store = new WorldStore({ now: () => time, randomIndex: () => 0 });
  const session = store.createSession('Luân hồi');
  let lifeId = session.snapshot.life.id;
  const first = store.fieldSnapshot(session.token);
  const facilityId = first.facilities.find(facility => facility.role === 'academy').id;
  const act = (type, payload = {}) => store.execute(session.token, { operationId: 'rebirth-gu-' + ++sequence, lifeId, action: { type, payload } });
  act('academy', { facilityId, option: 'claim-gu', guId: 'moonlight' });
  act('academy', { facilityId, option: 'tame-gu', guId: 'moonlight' });
  time += 10000; store.tick();
  assert.deepEqual(store.fieldSnapshot(session.token).usableGuIds, ['moonlight']);
  act('investigate'); const committed = act('commit', { inheritanceId: 'duong-truc', acceptDeath: true });
  act('choose', { stageId: committed.life.trial.stage.id, choiceId: 'concede' });
  const ended = store.fieldSnapshot(session.token);
  assert.deepEqual(ended.guIds, []); assert.deepEqual(ended.usableGuIds, []); assert.equal(ended.cultivation.alive, false);
  const born = act('rebirth', { originId: 'east' }); lifeId = born.life.id;
  const fresh = store.fieldSnapshot(session.token);
  assert.notEqual(lifeId, first.lifeId);
  assert.deepEqual(fresh.guIds, []); assert.deepEqual(fresh.cultivation.guInstances, []);
  assert.equal(fresh.cultivation.firstGuClaimed, false); assert.equal(fresh.cultivation.activity, null);
  assert.equal(fresh.mp, 44);
});

test('legacy lives preserve all owned Gu, earned stones and the first-claim provenance', t => {
  const h = sharedFixture(t);
  const disk = JSON.parse(readFileSync(h.filePath, 'utf8'));
  const account = Object.values(disk.accounts)[0];
  delete account.life.cultivation;
  account.life.field.guIds = ['moonlight', 'bronze', 'boar', 'heal', 'moonblade', 'ironskin'];
  account.life.stones = 47;
  writeFileSync(h.filePath, JSON.stringify(disk));
  const restored = new WorldStore({ filePath: h.filePath, now: h.now });
  const field = restored.fieldSnapshot(h.sessions[0].token);
  assert.deepEqual(field.guIds, account.life.field.guIds);
  assert.deepEqual(field.usableGuIds, ['moonlight', 'bronze', 'boar', 'heal']);
  assert.equal(field.stones, 47);
  assert.equal(field.cultivation.firstGuClaimed, true);
  assert.equal(field.cultivation.guInstances.length, 6);
  assert.ok(field.cultivation.guInstances.every(gu => gu.ownerLifeId === field.lifeId && gu.controlled));
});

test('academy persistence failure does not spend stones, record an operation or start an activity', t => {
  let time = 1_000_000;
  const directory = mkdtempSync(join(tmpdir(), 'cotienlo-academy-rollback-')); t.after(() => rmSync(directory, { force: true, recursive: true }));
  const filePath = join(directory, 'world.json');
  const store = new WorldStore({ filePath, now: () => time, randomIndex: () => 0 });
  const session = store.createSession('Luyện hóa');
  const first = store.fieldSnapshot(session.token);
  const facilityId = first.facilities.find(facility => facility.role === 'academy').id;
  const request = (operationId, option) => ({ operationId, lifeId: first.lifeId, action: { type: 'academy', payload: { facilityId, option, guId: 'moonlight' } } });
  store.execute(session.token, request('claim', 'claim-gu'));
  const disk = readFileSync(filePath, 'utf8');
  const before = store.fieldSnapshot(session.token);
  rmSync(filePath); mkdirSync(filePath);
  assert.throws(() => store.execute(session.token, request('tame', 'tame-gu')));
  const failed = store.fieldSnapshot(session.token);
  assert.equal(failed.stones, before.stones); assert.equal(failed.mp, before.mp);
  assert.equal(failed.cultivation.activity, null);
  rmSync(filePath, { recursive: true }); writeFileSync(filePath, disk);
  assert.equal(store.execute(session.token, request('tame', 'tame-gu')).life.stones, 18);
});

test('a first field entry cannot accrue dormant cultivation time from menu polling', () => {
  let time = 1_000_000;
  const store = new WorldStore({ now: () => time, randomIndex: () => 0 });
  const session = store.createSession('Chờ nhập thế');
  for (let index = 0; index < 20; index++) { time += 5000; store.snapshot(session.token); }
  const first = store.fieldSnapshot(session.token);
  time += 50; store.tick();
  const active = store.fieldSnapshot(session.token);
  assert.equal(first.cultivation.ageMs, 0);
  assert.equal(active.cultivation.ageMs, 50);
});

test('shared combat death is archived once only after its critical checkpoint succeeds', t => {
  const h = sharedFixture(t);
  const disk = JSON.parse(readFileSync(h.filePath, 'utf8'));
  for (const account of Object.values(disk.accounts)) {
    account.life.hp = 1;
    account.life.field.x = h.encounter.x; account.life.field.y = h.encounter.y;
  }
  writeFileSync(h.filePath, JSON.stringify(disk));
  const store = new WorldStore({ filePath: h.filePath, now: h.now });
  const saved = readFileSync(h.filePath, 'utf8');
  rmSync(h.filePath); mkdirSync(h.filePath);
  h.advance(50); assert.throws(() => store.tick());
  assert.equal(h.sessions.filter(session => store.fieldSnapshot(session.token).dead).length, 0);
  rmSync(h.filePath, { recursive: true }); writeFileSync(h.filePath, saved);
  store.tick();
  assert.equal(h.sessions.filter(session => store.fieldSnapshot(session.token).dead).length, 1);
  const after = JSON.parse(readFileSync(h.filePath, 'utf8'));
  assert.equal(Object.values(after.accounts).reduce((sum, account) => sum + account.pastLives.length, 0), 1);
  h.advance(50); store.tick();
  assert.equal(h.sessions.reduce((sum, session) => sum + store.snapshot(session.token).account.pastLives.length, 0), 1);
});

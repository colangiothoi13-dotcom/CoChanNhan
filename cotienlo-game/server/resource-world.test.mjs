import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldStore } from './world-store.mjs';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addGuInstance, createCultivationState } from '../shared/cultivation-core.mjs';
import { addResource, initializeGuLifecycle } from '../shared/resource-core.mjs';
import { RESOURCE_NODES } from './resource-world.mjs';
import { OVERWORLD_HUBS } from '../shared/overworld-core.mjs';

function fixture() {
  let time = 1_000_000, operation = 0;
  const store = new WorldStore({ filePath: null, now: () => time, randomIndex: () => 0 });
  const a = store.createSession('Người bắt Cổ');
  const b = store.createSession('Người cùng làng');
  const field = session => store.fieldSnapshot(session.token);
  field(a); field(b);
  const act = (session, option, payload = {}) => store.execute(session.token, {
    operationId: 'resource-test-' + ++operation, lifeId: field(session).lifeId,
    action: { type: 'resource', payload: { option, ...payload } },
  });
  return { store, a, b, field, act, advance(ms) { time += ms; store.tick(); }, get time() { return time; } };
}

test('resource snapshot starts a fresh Gu-empty life with bounded discoverable nearby sources', () => {
  const h = fixture(), snapshot = h.field(h.a);
  assert.deepEqual(snapshot.guIds, []);
  assert.ok(snapshot.resources);
  assert.ok(snapshot.resources.nearbyNodes.length > 0 && snapshot.resources.nearbyNodes.length <= 24);
  assert.ok(snapshot.resources.nearbyNodes.some(node => node.kind === 'wild'));
  assert.equal(snapshot.resources.gu.length, 0);
});

test('resource commands reject forged authority and remote node interactions without spending', () => {
  const h = fixture(), before = h.field(h.a);
  assert.throws(() => h.act(h.a, 'harvest', { nodeId: 'not-a-node', stones: 100000 }), { code: 'INVALID_RESOURCE_ACTION' });
  const remote = before.resources.nearbyNodes.find(node => Math.hypot(node.x - before.x, node.y - before.y) > 220);
  assert.ok(remote);
  assert.throws(() => h.act(h.a, 'harvest', { nodeId: remote.id }), { code: 'RESOURCE_TOO_FAR' });
  assert.equal(h.field(h.a).stones, before.stones);
});

test('resource time advances from the service clock only while a real player is active', () => {
  const h = fixture(), before = h.field(h.a).resources.clockMs;
  h.advance(1000);
  const after = h.field(h.a).resources.clockMs;
  assert.equal(after - before, 1000);
  h.advance(16000);
  const stopped = h.field(h.a).resources.clockMs;
  assert.equal(stopped, after);
});

function seeded(t, { wild = false, guTypes = ['moonlight'], receiverGuTypes = [], roll = 0, rank = 1, farBuyer = false } = {}) {
  let time = 1_000_000, operation = 0;
  const directory = mkdtempSync(join(tmpdir(), 'cotienlo-resource-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const filePath = join(directory, 'world.json');
  let store = new WorldStore({ filePath, now: () => time, randomIndex: () => 0 });
  const a = store.createSession('Chủ Cổ'), b = store.createSession('Người giao dịch');
  store.fieldSnapshot(a.token); store.fieldSnapshot(b.token);
  const disk = JSON.parse(readFileSync(filePath, 'utf8'));
  if (rank !== 1) for (const account of Object.values(disk.accounts)) {
    account.life.cultivation = createCultivationState({ lifeId: account.life.id, rank, now: time }); account.life.rank = rank;
  }
  const actor = disk.accounts[a.snapshot.account.id].life;
  for (const type of guTypes) addGuInstance(actor.cultivation, type, { controlled: true });
  for (const type of receiverGuTypes) addGuInstance(disk.accounts[b.snapshot.account.id].life.cultivation, type, { controlled: true });
  initializeGuLifecycle(actor.cultivation, 0);
  for (const account of Object.values(disk.accounts)) {
    for (const [id, count] of Object.entries({ 'capture-net': 4, bait: 4, 'moon-orchid-petal': 8, 'spirit-herb': 8, 'copper-ore': 8, water: 8 })) addResource(account.life.resources, id, count);
    if (rank >= 6) addResource(account.life.resources, 'immortal-stone', 10);
    if (wild) {
      const node = RESOURCE_NODES.find(node => node.hubId === actor.field.hubId && node.suffix === 'light-glade');
      account.life.field.x = node.x; account.life.field.y = node.y;
    }
  }
  if (farBuyer) {
    const hub = OVERWORLD_HUBS.find(hub => hub.regionId === actor.field.regionId && hub.id !== actor.field.hubId);
    Object.assign(disk.accounts[b.snapshot.account.id].life.field, { x: hub.x + 120, y: hub.y - 70, hubId: hub.id, regionId: hub.regionId });
  }
  writeFileSync(filePath, JSON.stringify(disk));
  store = new WorldStore({ filePath, now: () => time, randomIndex: maximum => Math.min(roll, maximum - 1) });
  const field = session => store.fieldSnapshot(session.token);
  const request = (session, option, payload = {}) => ({ operationId: 'resource-seeded-' + ++operation, lifeId: field(session).lifeId, action: { type: 'resource', payload: { option, ...payload } } });
  const act = (session, option, payload = {}) => store.execute(session.token, request(session, option, payload));
  return { store, a, b, field, act, request, filePath, advance(ms) { time += ms; store.tick(); }, get time() { return time; } };
}

test('shared capture gives one physical individual and replay cannot catch the same target twice', t => {
  const h = seeded(t, { wild: true, guTypes: [] });
  const node = h.field(h.a).resources.nearbyNodes.find(node => node.kind === 'wild' && Math.hypot(node.x - h.field(h.a).x, node.y - h.field(h.a).y) < 10);
  h.act(h.a, 'scout', { nodeId: node.id }); h.act(h.b, 'scout', { nodeId: node.id });
  h.advance(400);
  const target = h.field(h.a).resources.wildTargets[0];
  const request = h.request(h.a, 'capture', { nodeId: node.id, targetId: target.id });
  h.store.execute(h.a.token, request); h.store.execute(h.a.token, request);
  assert.equal(h.field(h.a).resources.gu.length, 1);
  assert.equal(h.field(h.a).resources.gu[0].controlled, false);
  assert.throws(() => h.act(h.b, 'capture', { nodeId: node.id, targetId: target.id }), { code: 'TARGET_UNAVAILABLE' });
  assert.equal(h.field(h.b).resources.items.find(item => item.id === 'capture-net').quantity, 4);
});

test('loans move the actual instance, preserve nutrition and can revoke use without teleporting it', t => {
  const h = seeded(t), before = h.field(h.a).resources.gu[0];
  h.act(h.a, 'transfer-gu', { instanceId: before.id, targetAccountId: h.b.snapshot.account.id, mode: 'loan' });
  assert.equal(h.field(h.a).resources.gu.length, 0);
  assert.equal(h.field(h.b).resources.gu[0].id, before.id);
  assert.ok(h.field(h.b).usableGuIds.includes('moonlight'));
  h.advance(1000);
  h.act(h.a, 'revoke-loan', { instanceId: before.id });
  assert.equal(h.field(h.b).resources.gu[0].id, before.id);
  assert.deepEqual(h.field(h.b).usableGuIds, []);
  assert.throws(() => h.act(h.b, 'tame', { instanceId: before.id }), { code: 'LOAN_RETURN_REQUIRED' });
  h.advance(400);
  h.act(h.b, 'return-loan', { instanceId: before.id });
  const returned = h.field(h.a).resources.gu[0];
  assert.equal(returned.id, before.id);
  assert.ok(returned.feeding.remainingMs < before.feeding.remainingMs);
  assert.equal(h.field(h.b).resources.gu.length, 0);
});

test('a market listing escrows stock and two buyers cannot buy one resource stack', t => {
  const h = seeded(t);
  const before = h.field(h.a).resources.items.find(item => item.id === 'moon-orchid-petal').quantity;
  h.act(h.a, 'create-listing', { resourceId: 'moon-orchid-petal', quantity: 2, price: 5 });
  const listing = h.field(h.a).resources.market[0];
  assert.equal(h.field(h.a).resources.items.find(item => item.id === 'moon-orchid-petal').quantity, before - 2);
  const request = h.request(h.b, 'buy-listing', { listingId: listing.id });
  h.store.execute(h.b.token, request); h.store.execute(h.b.token, request);
  assert.equal(h.field(h.b).stones, 15);
  assert.equal(h.field(h.a).stones, 24);
  assert.equal(h.field(h.b).resources.items.find(item => item.id === 'moon-orchid-petal').quantity, 10);
  h.advance(400);
  assert.throws(() => h.act(h.b, 'buy-listing', { listingId: listing.id }), { code: 'LISTING_UNAVAILABLE' });
});

test('timed recipe locks three exact Gu, consumes its inputs and never exposes the outcome roll', t => {
  const h = seeded(t, { guTypes: ['moonlight', 'smalllight', 'smalllight'] });
  h.act(h.a, 'research', { recipeId: 'moonbeam' }); h.advance(6000);
  const inputIds = h.field(h.a).resources.gu.map(gu => gu.id);
  h.act(h.a, 'start-refine', { recipeId: 'moonbeam', inputIds });
  const running = h.field(h.a);
  assert.equal(running.resources.jobs[0].status, 'running');
  assert.equal(JSON.stringify(running.resources).includes('"roll"'), false);
  assert.equal(JSON.stringify(h.store.snapshot(h.a.token).life.resources).includes('"roll"'), false);
  assert.equal(running.resources.gu.filter(gu => gu.lock?.kind === 'refining').length, 3);
  assert.throws(() => h.act(h.a, 'transfer-gu', { instanceId: inputIds[0], targetAccountId: h.b.snapshot.account.id, mode: 'gift' }), { code: 'GU_BUSY' });
  h.advance(12000);
  const result = h.field(h.a);
  assert.equal(result.resources.jobs[0].status, 'success');
  assert.deepEqual(result.guIds, ['moonbeam']);
  assert.deepEqual(result.usableGuIds, [], 'A rank-one actor does not automatically use the newly made rank-two Gu');
});

test('a critical resource transaction rolls back money, escrow and operation receipt if disk save fails', t => {
  const h = seeded(t), before = h.field(h.a);
  const request = h.request(h.a, 'create-listing', { resourceId: 'moon-orchid-petal', quantity: 2, price: 5 });
  rmSync(h.filePath); mkdirSync(h.filePath);
  assert.throws(() => h.store.execute(h.a.token, request));
  const after = h.field(h.a);
  assert.deepEqual(after.resources.items, before.resources.items);
  assert.equal(after.resources.market.length, 0);
  rmSync(h.filePath, { recursive: true });
  h.store.execute(h.a.token, request);
  assert.equal(h.field(h.a).resources.market.length, 1);
});

test('leaving the actual workshop cancels refinement and returns only unused materials', t => {
  const h = seeded(t, { guTypes: ['moonlight', 'smalllight', 'smalllight'] });
  h.act(h.a, 'research', { recipeId: 'moonbeam' }); h.advance(6000);
  const inputIds = h.field(h.a).resources.gu.map(gu => gu.id);
  h.act(h.a, 'start-refine', { recipeId: 'moonbeam', inputIds });
  for (let seq = 1; seq <= 5; seq++) {
    h.store.fieldInput(h.a.token, { lifeId: h.field(h.a).lifeId, seq, move: { x: 1, y: 0 }, aimAngle: 0 });
    h.advance(250);
  }
  const result = h.field(h.a).resources;
  assert.equal(result.jobs[0].status, 'cancelled');
  assert.equal(result.gu.filter(gu => gu.lock).length, 0);
  assert.equal(result.items.find(item => item.id === 'moon-orchid-petal').quantity, 6);
  assert.equal(result.items.find(item => item.id === 'spirit-herb').quantity, 8);
});

test('player death moves actual Gu into remains and a new holder must overcome the old will', t => {
  const h = seeded(t), before = h.field(h.a).resources.gu[0];
  let operation = 0;
  const worldAction = (session, type, payload = {}) => h.store.execute(session.token, { operationId: 'resource-death-' + ++operation,
    lifeId: h.field(session).lifeId, action: { type, payload } });
  worldAction(h.a, 'investigate'); worldAction(h.a, 'commit', { inheritanceId: 'duong-truc', acceptDeath: true });
  const trial = h.store.snapshot(h.a.token).life.trial;
  worldAction(h.a, 'choose', { stageId: trial.stage.id, choiceId: 'concede' });
  const dead = h.field(h.a);
  assert.equal(dead.dead, true); assert.equal(dead.resources.gu.length, 0);
  const remains = h.store.snapshot(h.b.token).remains[0];
  assert.equal(remains.capturedGuCount, 1);
  worldAction(h.b, 'loot', { remainsId: remains.id });
  const recovered = h.field(h.b).resources.gu[0];
  assert.equal(recovered.id, before.id); assert.equal(recovered.controllerLifeId, dead.lifeId);
  assert.equal(recovered.usable, false); assert.equal(recovered.feeding.remainingMs, before.feeding.remainingMs);
  h.act(h.b, 'tame', { instanceId: recovered.id });
  assert.ok(h.field(h.b).resources.gu[0].willBps >= 8000);
  worldAction(h.a, 'rebirth', { originId: 'south' });
  assert.deepEqual(h.field(h.a).guIds, []);
});

test('vital starvation settles against current max HP instead of failing persistence forever', t => {
  const h = seeded(t);
  const disk = JSON.parse(readFileSync(h.filePath, 'utf8'));
  const life = disk.accounts[h.a.snapshot.account.id].life;
  life.cultivation.guInstances[0].vitalForLifeId = life.id;
  disk.resourceWorld.clockMs = 3_000_000;
  writeFileSync(h.filePath, JSON.stringify(disk));
  const restored = new WorldStore({ filePath: h.filePath, now: () => h.time, randomIndex: () => 0 });
  const view = restored.fieldSnapshot(h.a.token);
  assert.equal(view.resources.gu[0].feeding.state, 'dead');
  assert.equal(view.hp, 80); assert.equal(view.maxHp, 80);
  assert.deepEqual(view.guIds, []);
  const twice = restored.fieldSnapshot(h.a.token);
  assert.equal(twice.hp, 80); assert.equal(twice.cultivation.body.woundBps, 4000);
});

test('controller-only self destruction revokes a remote borrowed Gu and commits exactly once', t => {
  const h = seeded(t), gu = h.field(h.a).resources.gu[0];
  h.act(h.a, 'transfer-gu', { instanceId: gu.id, targetAccountId: h.b.snapshot.account.id, mode: 'loan' });
  h.advance(400);
  assert.throws(() => h.act(h.b, 'destroy-gu', { instanceId: gu.id, mode: 'confirm' }), { code: 'CONTROLLER_REQUIRED' });
  const request = h.request(h.a, 'destroy-gu', { instanceId: gu.id, mode: 'confirm' });
  h.store.execute(h.a.token, request); h.store.execute(h.a.token, request);
  assert.equal(h.field(h.b).resources.gu[0].feeding.state, 'dead');
  assert.deepEqual(h.field(h.b).usableGuIds, []);
  assert.equal(h.field(h.a).resources.loans.length, 0);
});

test('restart preserves unfinished resource clocks and refuses duplicate physical Gu across holders', t => {
  const h = seeded(t), before = h.field(h.a);
  h.advance(2000); h.store.checkpoint();
  const restored = new WorldStore({ filePath: h.filePath, now: () => h.time + 3_600_000, randomIndex: () => 0 });
  const view = restored.fieldSnapshot(h.a.token);
  assert.equal(view.resources.clockMs, 2000);
  assert.equal(view.resources.gu[0].id, before.resources.gu[0].id);
  assert.equal(view.resources.gu[0].feeding.remainingMs, before.resources.gu[0].feeding.remainingMs - 2000);
  const disk = JSON.parse(readFileSync(h.filePath, 'utf8'));
  disk.accounts[h.b.snapshot.account.id].life.cultivation.guInstances.push(structuredClone(disk.accounts[h.a.snapshot.account.id].life.cultivation.guInstances[0]));
  writeFileSync(h.filePath, JSON.stringify(disk));
  assert.throws(() => new WorldStore({ filePath: h.filePath, now: () => h.time }), /corrupt|invalid/i);
});

test('resource acknowledgement trims motion payloads without changing authority or starving another device', () => {
  const h = fixture(), first = h.field(h.a);
  const input = (seq, resourceClockMs) => h.store.fieldInput(h.a.token, { lifeId: first.lifeId, seq, move: { x: 0, y: 0 }, aimAngle: 0, resourceClockMs });
  const slim = input(1, first.resources.clockMs);
  assert.equal(slim.resources, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(slim)) < Buffer.byteLength(JSON.stringify(first)) / 2);
  assert.ok(h.field(h.a).resources, 'A different device GET always receives a complete resource view');
  h.advance(1100);
  const next = input(2, first.resources.clockMs);
  assert.equal(next.resources.clockMs, 1100);
  assert.ok(input(3, undefined).resources, 'Older clients without an acknowledgement remain supported');
  const before = h.field(h.a).resources.clockMs;
  input(4, Number.MAX_SAFE_INTEGER);
  assert.equal(h.field(h.a).resources.clockMs, before, 'A future acknowledgement never advances game time');
  assert.throws(() => input(5, -1), { code: 'INVALID_FIELD_INPUT' });
  assert.throws(() => input(5, 1.5), { code: 'INVALID_FIELD_INPUT' });
});

test('free first Gu binding is recorded and cannot be laundered through gifts or listings', () => {
  const h = fixture(), initial = h.field(h.a);
  const facilityId = initial.facilities.find(facility => facility.role === 'academy').id;
  h.store.execute(h.a.token, { operationId: 'resource-first-gu', lifeId: initial.lifeId, action: { type: 'academy', payload: { facilityId, option: 'claim-gu', guId: 'moonlight' } } });
  const gu = h.field(h.a).resources.gu[0];
  assert.equal(gu.starterGrantLifeId, initial.lifeId);
  assert.throws(() => h.act(h.a, 'transfer-gu', { instanceId: gu.id, targetAccountId: h.b.snapshot.account.id, mode: 'gift' }), { code: 'STARTER_GU_BOUND' });
  assert.throws(() => h.act(h.a, 'create-listing', { instanceId: gu.id, price: 10 }), { code: 'CONTROLLER_REQUIRED' });
  assert.equal(h.field(h.a).resources.gu[0].id, gu.id);
  assert.equal(h.field(h.b).resources.gu.length, 0);
});

test('prototype-named recipients are rejected as absent players without changing custody', t => {
  const h = seeded(t), gu = h.field(h.a).resources.gu[0];
  assert.throws(() => h.act(h.a, 'transfer-gu', { instanceId: gu.id, targetAccountId: '__proto__', mode: 'gift' }), { code: 'PLAYER_TOO_FAR' });
  assert.equal(h.field(h.a).resources.gu[0].id, gu.id);
});

test('paid broker access enables cross-hub BHT trade in real immortal stones and preserves the Gu instance', t => {
  const h = seeded(t, { rank: 6, farBuyer: true });
  const gu = h.field(h.a).resources.gu[0];
  h.act(h.a, 'open-treasure-heaven'); h.advance(400);
  h.act(h.a, 'create-listing', { instanceId: gu.id, price: 4, mode: 'treasure-heaven' });
  const listing = h.field(h.a).resources.market[0];
  assert.equal(listing.currency, 'immortal-stone');
  assert.equal(h.field(h.b).resources.market.length, 0, 'Unconnected people cannot see BHT inventory');
  h.act(h.b, 'open-treasure-heaven'); h.advance(400);
  assert.equal(h.field(h.b).resources.market[0].id, listing.id);
  h.act(h.b, 'buy-listing', { listingId: listing.id });
  const buyer = h.field(h.b), seller = h.field(h.a);
  assert.equal(buyer.resources.gu[0].id, gu.id);
  assert.ok(buyer.resources.gu[0].feeding.remainingMs < gu.feeding.remainingMs);
  assert.equal(buyer.resources.gu[0].controllerLifeId, buyer.lifeId);
  assert.equal(buyer.resources.items.find(item => item.id === 'immortal-stone').quantity, 5);
  assert.equal(seller.resources.items.find(item => item.id === 'immortal-stone').quantity, 12);
  assert.equal(buyer.stones, 20); assert.equal(seller.stones, 20);
});

test('BHT access expires on world time and own escrow remains recoverable without minting or a renewal fee', t => {
  const h = seeded(t, { rank: 6, farBuyer: true });
  h.act(h.a, 'open-treasure-heaven'); h.advance(400);
  h.act(h.a, 'create-listing', { resourceId: 'moon-orchid-petal', quantity: 2, price: 3, mode: 'treasure-heaven' });
  const listing = h.field(h.a).resources.market[0];
  for (let i = 0; i < 18; i++) { h.field(h.a); h.field(h.b); h.advance(10000); }
  assert.equal(h.field(h.a).resources.marketAccess.active, false);
  assert.equal(h.field(h.a).resources.market.length, 1, 'The sender can still see their own escrow');
  assert.equal(h.field(h.b).resources.market.length, 0);
  assert.throws(() => h.act(h.b, 'buy-listing', { listingId: listing.id }), { code: 'TREASURE_HEAVEN_ACCESS_REQUIRED' });
  h.act(h.a, 'cancel-listing', { listingId: listing.id });
  assert.equal(h.field(h.a).resources.items.find(item => item.id === 'moon-orchid-petal').quantity, 8);
  assert.equal(h.field(h.a).resources.items.find(item => item.id === 'immortal-stone').quantity, 9);
});

test('mortal access and forged BHT channels fail without spending money or posting goods', t => {
  const h = seeded(t);
  assert.throws(() => h.act(h.a, 'open-treasure-heaven'), { code: 'IMMORTAL_ACCESS_REQUIRED' });
  assert.throws(() => h.act(h.a, 'create-listing', { resourceId: 'moon-orchid-petal', quantity: 1, price: 3, mode: 'treasure-heaven' }), { code: 'TREASURE_HEAVEN_ACCESS_REQUIRED' });
  assert.throws(() => h.act(h.a, 'create-listing', { resourceId: 'moon-orchid-petal', quantity: 1, price: 3, mode: 'forged-channel' }), { code: 'INVALID_MARKET_CHANNEL' });
  assert.equal(h.field(h.a).stones, 20);
  assert.equal(h.field(h.a).resources.market.length, 0);
});

test('taming locks custody and player death clears the personal channel before looting', t => {
  const h = seeded(t, { guTypes: [] });
  h.act(h.a, 'buy-gu', { guId: 'moonlight' });
  const gu = h.field(h.a).resources.gu[0];
  h.act(h.a, 'tame', { instanceId: gu.id });
  assert.throws(() => h.act(h.a, 'transfer-gu', { instanceId: gu.id, targetAccountId: h.b.snapshot.account.id, mode: 'gift' }), { code: 'GU_BUSY' });
  assert.throws(() => h.act(h.a, 'create-listing', { instanceId: gu.id, price: 5 }), { code: 'GU_BUSY' });
  const worldAction = (session, operationId, type, payload = {}) => h.store.execute(session.token, { operationId,
    lifeId: h.store.snapshot(session.token).life.id, action: { type, payload } });
  worldAction(h.a, 'taming-death-investigate', 'investigate'); worldAction(h.a, 'taming-death-commit', 'commit', { inheritanceId: 'duong-truc', acceptDeath: true });
  worldAction(h.a, 'taming-death-concede', 'choose', { stageId: h.store.snapshot(h.a.token).life.trial.stage.id, choiceId: 'concede' });
  const remains = h.store.snapshot(h.b.token).remains[0];
  worldAction(h.b, 'taming-death-loot', 'loot', { remainsId: remains.id });
  h.act(h.b, 'tame', { instanceId: gu.id });
  assert.equal(h.field(h.b).resources.activity.kind, 'taming');
});

test('death returns unparticipated refinement materials and moves exact locked inputs once', t => {
  const h = seeded(t, { guTypes: ['moonlight', 'smalllight', 'smalllight'] });
  h.act(h.a, 'research', { recipeId: 'moonbeam' }); h.advance(6000);
  const ids = h.field(h.a).resources.gu.map(gu => gu.id);
  h.act(h.a, 'start-refine', { recipeId: 'moonbeam', inputIds: ids });
  const act = (session, operationId, type, payload = {}) => h.store.execute(session.token, { operationId,
    lifeId: h.store.snapshot(session.token).life.id, action: { type, payload } });
  act(h.a, 'recipe-death-investigate', 'investigate'); act(h.a, 'recipe-death-commit', 'commit', { inheritanceId: 'duong-truc', acceptDeath: true });
  act(h.a, 'recipe-death-concede', 'choose', { stageId: h.store.snapshot(h.a.token).life.trial.stage.id, choiceId: 'concede' });
  act(h.b, 'recipe-death-loot', 'loot', { remainsId: h.store.snapshot(h.b.token).remains[0].id });
  const result = h.field(h.b).resources;
  assert.deepEqual(result.gu.map(gu => gu.id).sort(), ids.sort());
  assert.equal(result.gu.filter(gu => gu.lock).length, 0);
  assert.equal(result.items.find(item => item.id === 'moon-orchid-petal').quantity, 14);
  assert.equal(result.items.find(item => item.id === 'spirit-herb').quantity, 16);
  assert.equal(result.items.find(item => item.id === 'copper-ore').quantity, 16);
});

test('death remains use the balance after lazy automatic food purchases, never the stale earned amount', t => {
  const h = seeded(t);
  const lifeId = h.a.snapshot.life.id;
  h.store.execute(h.a.token, { operationId: 'feed-death-investigate', lifeId, action: { type: 'investigate', payload: {} } });
  h.store.execute(h.a.token, { operationId: 'feed-death-commit', lifeId, action: { type: 'commit', payload: { inheritanceId: 'duong-truc', acceptDeath: true } } });
  const disk = JSON.parse(readFileSync(h.filePath, 'utf8'));
  const life = disk.accounts[h.a.snapshot.account.id].life;
  life.stones = 10; life.starterStonesRemaining = 0;
  life.resources.items['moon-orchid-petal'] = 0; life.resources.settings.autoFeed = true; life.resources.settings.budget = 2;
  life.cultivation.guInstances[0].feeding.remainingMs = 0;
  disk.resourceWorld.clockMs = 1;
  writeFileSync(h.filePath, JSON.stringify(disk));
  const restored = new WorldStore({ filePath: h.filePath, now: () => h.time, randomIndex: () => 0 });
  const stageId = restored.snapshot(h.a.token).life.trial.stage.id;
  restored.execute(h.a.token, { operationId: 'feed-death-concede', lifeId, action: { type: 'choose', payload: { stageId, choiceId: 'concede' } } });
  assert.equal(restored.snapshot(h.b.token).remains[0].stones, 8);
});

test('a full recipient rejects a gifted Gu atomically without changing controller or holder', t => {
  const h = seeded(t, { receiverGuTypes: Array(256).fill('smalllight') });
  const gu = h.field(h.a).resources.gu[0];
  assert.throws(() => h.act(h.a, 'transfer-gu', { instanceId: gu.id, targetAccountId: h.b.snapshot.account.id, mode: 'gift' }), { code: 'GU_CAPACITY' });
  const kept = h.field(h.a).resources.gu[0];
  assert.equal(kept.controllerLifeId, gu.controllerLifeId); assert.equal(kept.holderLifeId, gu.holderLifeId);
  assert.equal(h.field(h.b).resources.gu.filter(gu => gu.healthBps > 0).length, 256);
});

test('corpse loot retains a live Gu overflow until its recipient frees capacity', t => {
  const h = seeded(t, { receiverGuTypes: Array(256).fill('smalllight') });
  const worldAction = (session, id, type, payload = {}) => h.store.execute(session.token, { operationId: id,
    lifeId: h.store.snapshot(session.token).life.id, action: { type, payload } });
  worldAction(h.a, 'capacity-investigate', 'investigate'); worldAction(h.a, 'capacity-commit', 'commit', { inheritanceId: 'duong-truc', acceptDeath: true });
  worldAction(h.a, 'capacity-concede', 'choose', { stageId: h.store.snapshot(h.a.token).life.trial.stage.id, choiceId: 'concede' });
  const remainsId = h.store.snapshot(h.b.token).remains[0].id;
  worldAction(h.b, 'capacity-first-loot', 'loot', { remainsId });
  assert.equal(h.store.snapshot(h.b.token).remains[0].capturedGuCount, 1);
  const ownGu = h.field(h.b).resources.gu.find(gu => gu.controllerLifeId === h.field(h.b).lifeId);
  h.act(h.b, 'destroy-gu', { instanceId: ownGu.id, mode: 'confirm' });
  worldAction(h.b, 'capacity-second-loot', 'loot', { remainsId });
  assert.equal(h.store.snapshot(h.b.token).remains.length, 0);
  assert.equal(h.field(h.b).resources.gu.filter(gu => gu.healthBps > 0).length, 256);
});

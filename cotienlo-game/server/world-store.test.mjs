import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldStore } from './world-store.mjs';

const skills = ['care', 'combat', 'survival', 'insight', 'refinement', 'diplomacy'];
const effect = (danger = 0, hp = 0, skill = 0) => ({ danger, hp, skill });
export const fixture = {
  regions: [{ id: 'r1', name: 'Một', subtitle: '', color: '#fff' }, { id: 'r2', name: 'Hai', subtitle: '', color: '#000' }],
  places: [
    { id: 'a', regionId: 'r1', name: 'A', summary: '', resource: '', secret: 'Mật thư A', returnReason: '', neighbors: ['b'], skill: 'care' },
    { id: 'b', regionId: 'r2', name: 'B', summary: '', resource: '', secret: 'Mật thư B', returnReason: '', neighbors: ['a'], skill: 'survival' },
    { id: 'c', regionId: 'r2', name: 'C', summary: '', resource: '', secret: '', returnReason: '', neighbors: [], skill: 'combat' },
  ],
  origins: [{ id: 'o', name: 'Người mới', placeId: 'a', description: '', skill: 'care' }],
  inheritances: ['common', 'unique', 'deadly'].map(id => ({
    id, name: id, placeId: 'a', skill: 'care', minRank: 1,
    origin: '', clue: '', requirement: '', commitment: '', success: '', failure: '', reward: '', consequence: '',
    ...(id === 'unique' ? { uniqueGu: 'hai-kinh' } : {}),
    stages: [0, 1, 2].map(i => ({ id: `${id}-${i}`, title: `Bước ${i}`, text: '', choices: [
      { id: 'safe', label: 'Đọc', hint: '', energyCost: 2, supplyCost: 0, effect: effect(0, 0, 1) },
      { id: 'risk', label: 'Liều', hint: '', energyCost: 2, supplyCost: 0, effect: effect(1, -5) },
      { id: 'fatal', label: 'Sai', hint: '', energyCost: 2, supplyCost: 0, effect: effect(3, -100) },
      { id: 'costly', label: 'Tốn', hint: '', energyCost: 200, supplyCost: 200, effect: effect() },
    ] })),
  })),
  legends: [{ id: 'l', title: 'Bài học', source: '[TK]', text: '', choices: [
    { id: 'yes', label: 'Đúng', hint: '', effect: { correct: true, skill: 'insight' } },
    { id: 'no', label: 'Sai', hint: '', effect: { correct: false, skill: 'combat' } },
  ] }],
};

function setup(options = {}) {
  let time = 1_000_000;
  const store = new WorldStore({ content: fixture, now: () => time, randomIndex: () => 0, ...options });
  const session = store.createSession('Lan');
  let sequence = 0;
  const act = (type, payload = {}, extra = {}) => {
    time += 1001;
    return store.execute(session.token, { operationId: `op-${++sequence}`, lifeId: store.snapshot(session.token).life.id, action: { type, payload }, ...extra });
  };
  return { store, session, act, tick: n => { time += n; }, now: () => time };
}

test('sessions start with independent lives, authenticated identity and private catalogs', () => {
  const { store, session } = setup();
  const second = store.createSession('Bình');
  assert.notEqual(second.token, session.token);
  assert.notEqual(second.snapshot.account.id, session.snapshot.account.id);
  assert.deepEqual(Object.values(session.snapshot.life.skills), [1, 0, 0, 0, 0, 0]);
  assert.equal(session.snapshot.life.hp, 100);
  assert.equal(session.snapshot.life.stones, 20);
  assert.equal(session.snapshot.life.supplies, 8);
  assert.equal(session.snapshot.life.placeId, 'a');
  assert.throws(() => store.snapshot(session.snapshot.account.id), { code: 'UNAUTHORIZED' });
  assert.equal(JSON.stringify(session.snapshot.catalog).includes('effect'), false);
  assert.equal('stages' in session.snapshot.catalog.inheritances[0], false);
  assert.equal(JSON.stringify(store.snapshot(second.token)).includes('tokenHash'), false);
});

test('world date advances every six real hours and new journal entries use the shared current day', () => {
  const { store, session, act, tick } = setup();
  tick(21_600_000);
  assert.equal(store.snapshot(session.token).world.day, 2);
  assert.equal(act('investigate').account.journal.at(-1).day, 2);
});

test('economy validates routes and resources, local training and sustainable rest', () => {
  const { store, session, act } = setup();
  assert.throws(() => act('travel', { placeId: 'c', route: 'road' }), { code: 'INVALID_ROUTE' });
  assert.throws(() => act('train', { skill: 'combat' }), { code: 'INVALID_SKILL' });
  let s = act('train', { skill: 'care' });
  assert.equal(s.life.skills.care, 2);
  assert.equal(s.life.energy, 85);
  assert.equal(s.life.stones, 18);
  assert.deepEqual(s.life.trained, ['a']);
  assert.throws(() => act('train', { skill: 'care' }), { code: 'ALREADY_TRAINED' });
  s = act('travel', { placeId: 'b', route: 'road' });
  assert.equal(s.life.stones, 13);
  assert.equal(s.life.supplies, 6);
  s = act('travel', { placeId: 'a', route: 'trail' });
  assert.equal(s.life.stones, 10);
  assert.equal(s.life.supplies, 3);
  assert.equal(s.life.hp, 92);
  s = act('rest');
  assert.equal(s.life.hp, 100);
  assert.equal(s.life.energy, 100);
  for (let i = 0; i < 10; i++) s = act('work');
  assert.equal(s.life.energy, 0);
  assert.equal(s.life.supplies, 20);
  s = act('rest');
  assert.equal(s.life.energy, 100);
  assert.equal(s.life.stones, 90);
  assert.equal(store.snapshot(session.token).life.id, s.life.id);
});

test('lessons are private once per life; investigation records durable knowledge', () => {
  const { store, session, act } = setup();
  const other = store.createSession('Khác');
  let s = act('investigate');
  assert.deepEqual(s.life.investigated, ['a']);
  assert.match(s.account.journal.at(-1).text, /Mật thư A/);
  s = act('lesson', { legendId: 'l', choiceId: 'yes' });
  assert.equal(s.life.skills.insight, 1);
  assert.equal(s.life.skills.combat, 0);
  assert.deepEqual(s.life.lessons, ['l']);
  assert.throws(() => act('lesson', { legendId: 'l', choiceId: 'yes' }), { code: 'ALREADY_LEARNED' });
  assert.deepEqual(store.snapshot(other.token).account.journal, []);
  assert.equal(JSON.stringify(store.snapshot(other.token).presence).includes('journal'), false);
  assert.equal(session.snapshot.life.skills.insight, 0);
});

test('trial locks activity, rejects stale/expensive choices atomically and awards finite bonuses', () => {
  const { store, session, act } = setup();
  assert.throws(() => act('commit', { inheritanceId: 'common', acceptDeath: true }), { code: 'INVESTIGATION_REQUIRED' });
  act('investigate');
  let s = act('commit', { inheritanceId: 'common', acceptDeath: true });
  assert.equal(s.life.trial.stage.id, 'common-0');
  assert.equal(JSON.stringify(s.life.trial).includes('effect'), false);
  assert.throws(() => act('rest'), { code: 'TRIAL_ACTIVE' });
  assert.throws(() => act('choose', { stageId: 'common-1', choiceId: 'safe' }), { code: 'STALE_STAGE' });
  const before = store.snapshot(session.token).life;
  assert.throws(() => act('choose', { stageId: 'common-0', choiceId: 'costly' }), { code: 'INSUFFICIENT_RESOURCES' });
  assert.equal(store.snapshot(session.token).life.energy, before.energy);
  for (let i = 0; i < 3; i++) s = act('choose', { stageId: `common-${i}`, choiceId: i === 0 ? 'risk' : 'safe' });
  assert.equal(s.life.trial, null);
  assert.deepEqual(s.life.learned, ['common']);
  assert.equal(s.life.stones, 40);
  assert.equal(s.life.skills.care, 2);
  assert.equal(s.inheritanceStates.common.bonusRemaining, 0);
  assert.throws(() => act('commit', { inheritanceId: 'common', acceptDeath: true }), { code: 'ALREADY_LEARNED' });
  const b = store.createSession('Sau');
  const cmd = (type, payload) => store.execute(b.token, { operationId: crypto.randomUUID(), lifeId: b.snapshot.life.id, action: { type, payload } });
  cmd('investigate', {}); cmd('commit', { inheritanceId: 'common', acceptDeath: true });
  for (let i = 0; i < 3; i++) s = cmd('choose', { stageId: `common-${i}`, choiceId: 'safe' });
  assert.equal(s.life.stones, 30);
});

test('trial effects exactly match public danger and health hints regardless of skill', () => {
  const content = structuredClone(fixture);
  content.inheritances[0].stages[0].choices[1].effect.skill = 1;
  const { act } = setup({ content });
  act('investigate'); act('commit', { inheritanceId: 'common', acceptDeath: true });
  const s = act('choose', { stageId: 'common-0', choiceId: 'risk' });
  assert.equal(s.life.trial.danger, 1);
  assert.equal(s.life.hp, 95);
});

test('unique reservation is exclusive, failure releases it and loot transfers the exact instance', () => {
  const { store, session, act, tick } = setup();
  const b = store.createSession('B');
  const cmd = (type, payload) => { tick(1001); return store.execute(b.token, { operationId: crypto.randomUUID(), lifeId: store.snapshot(b.token).life.id, action: { type, payload } }); };
  act('investigate'); cmd('investigate', {});
  act('commit', { inheritanceId: 'unique', acceptDeath: true });
  assert.throws(() => cmd('commit', { inheritanceId: 'unique', acceptDeath: true }), { code: 'UNIQUE_UNAVAILABLE' });
  const dead = act('choose', { stageId: 'unique-0', choiceId: 'fatal' });
  assert.equal(dead.life.dead, true);
  assert.equal(dead.inheritanceStates.unique.reservedBy, null);
  cmd('commit', { inheritanceId: 'unique', acceptDeath: true });
  let s;
  for (let i = 0; i < 3; i++) s = cmd('choose', { stageId: `unique-${i}`, choiceId: 'safe' });
  const instance = s.life.gu[0];
  assert.equal(s.immortals.length, 1);
  assert.equal(s.immortals[0].instanceId, instance);
  cmd('commit', { inheritanceId: 'deadly', acceptDeath: true });
  s = cmd('choose', { stageId: 'deadly-0', choiceId: 'fatal' });
  const remains = s.remains.find(r => r.gu.length === 1);
  assert.ok(remains);
  assert.equal(s.immortals[0].owner, 'Chưa xác định');
  assert.equal(remains.gu.includes(instance), false);
  const priorLife = dead.life.id;
  const reborn = act('rebirth', { originId: 'o' });
  assert.notEqual(reborn.life.id, priorLife);
  assert.equal(reborn.account.pastLives.length, 1);
  s = act('loot', { remainsId: remains.id });
  assert.deepEqual(s.life.gu, [instance]);
  assert.equal(s.immortals[0].owner, s.life.id);
  assert.throws(() => act('loot', { remainsId: remains.id }), { code: 'REMAINS_UNAVAILABLE' });
  assert.throws(() => act('commit', { inheritanceId: 'unique', acceptDeath: true }), { code: 'INVESTIGATION_REQUIRED' });
});

test('global unique views do not reveal another life or the physical immortal instance', () => {
  const { store, session, act } = setup();
  const observer = store.createSession('Người chưa biết');
  act('investigate');
  const committed = act('commit', { inheritanceId: 'unique', acceptDeath: true });
  assert.equal(committed.immortals[0].owner, committed.life.id);
  const reserved = store.snapshot(observer.token);
  assert.equal(reserved.immortals[0].owner, 'Chưa xác định');
  assert.equal(reserved.immortals[0].instanceId, '');
  assert.notEqual(reserved.inheritanceStates.unique.reservedBy, committed.life.id);
  let owner;
  for (let index = 0; index < 3; index++) owner = act('choose', { stageId: `unique-${index}`, choiceId: 'safe' });
  const physicalId = owner.life.gu[0];
  assert.equal(owner.immortals[0].owner, owner.life.id);
  assert.equal(owner.immortals[0].instanceId, physicalId);
  const hidden = store.snapshot(observer.token);
  assert.equal(hidden.immortals[0].owner, 'Chưa xác định');
  assert.equal(hidden.immortals[0].instanceId, '');
  assert.equal(JSON.stringify(hidden).includes(physicalId), false);
  assert.equal(JSON.stringify(hidden.inheritanceStates).includes(owner.life.id), false);
  assert.equal(hidden.events.some(event => event.text.includes(session.snapshot.account.name)), false);
  assert.ok(owner.account.journal.some(entry => entry.title === 'Hoàn thành unique'));
  act('commit', { inheritanceId: 'deadly', acceptDeath: true });
  const dead = act('choose', { stageId: 'deadly-0', choiceId: 'fatal' });
  const afterDeath = store.snapshot(observer.token);
  assert.equal(JSON.stringify(afterDeath).includes(physicalId), false);
  assert.equal(afterDeath.events.some(event => event.text.includes(session.snapshot.account.name)), false);
  assert.equal(dead.account.pastLives[0].placeId, 'a', 'Private history still records the actual death place');
});

test('historical global acquisition, death and looting events are anonymized at the public boundary', t => {
  const directory = mkdtempSync(join(tmpdir(), 'world-private-chronicle-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filePath = join(directory, 'world.json');
  const { store, now } = setup({ filePath });
  const observer = store.createSession('Người xem biên niên');
  const disk = JSON.parse(readFileSync(filePath, 'utf8'));
  disk.events = [
    { id: 'old-acquisition', day: 1, text: 'Lan đã hoàn thành unique.' },
    { id: 'old-death', day: 1, text: 'Lan, đời thứ 1, đã mất tại A.' },
    { id: 'old-loot', day: 1, text: 'Lan đã thu nhặt một di vật tại A.' },
  ];
  writeFileSync(filePath, JSON.stringify(disk));
  const restored = new WorldStore({ content: fixture, filePath, now });
  const events = restored.snapshot(observer.token).events;
  assert.equal(events.length, 3);
  assert.equal(events.some(event => /Lan|unique|tại A/.test(event.text)), false);
  assert.match(JSON.parse(readFileSync(filePath, 'utf8')).events[0].text, /Lan/, 'Private persisted history is preserved rather than erased');
});

test('rebirth preserves account/world history and resets strength, assets and stale identity', () => {
  const { store, session, act } = setup();
  act('investigate'); act('lesson', { legendId: 'l', choiceId: 'yes' });
  act('commit', { inheritanceId: 'deadly', acceptDeath: true });
  const dead = act('choose', { stageId: 'deadly-0', choiceId: 'fatal' });
  assert.equal(dead.account.pastLives.length, 1);
  assert.equal(dead.life.stones, 0);
  assert.equal(dead.life.supplies, 0);
  assert.deepEqual(dead.life.gu, []);
  assert.throws(() => act('work'), { code: 'LIFE_DEAD' });
  const s = act('rebirth', { originId: 'o' });
  assert.equal(s.life.number, 2);
  assert.equal(s.life.energy, 100);
  assert.equal(s.life.rank, 1);
  assert.equal(s.life.skills.insight, 0);
  assert.deepEqual(s.life.learned, []);
  assert.ok(s.account.journal.length >= 2);
  assert.throws(() => store.execute(session.token, { operationId: 'stale', lifeId: dead.life.id, action: { type: 'work', payload: {} } }), { code: 'STALE_LIFE' });
});

test('looting a full supply bag keeps overflow while transferring money and the exact Gu once', () => {
  const { store, session, act, tick } = setup();
  for (let index = 0; index < 4; index++) act('work');
  act('investigate'); act('commit', { inheritanceId: 'unique', acceptDeath: true });
  for (let index = 0; index < 3; index++) act('choose', { stageId: `unique-${index}`, choiceId: 'safe' });
  const exactGu = store.snapshot(session.token).life.gu;
  act('commit', { inheritanceId: 'deadly', acceptDeath: true });
  const dead = act('choose', { stageId: 'deadly-0', choiceId: 'fatal' });
  const grave = dead.remains.at(-1);
  assert.equal(grave.supplies, 12);
  assert.equal(grave.gu.length, 1);
  const second = store.createSession('Người thu nhận');
  const command = (type, payload = {}, operationId = crypto.randomUUID()) => {
    tick(1001);
    return store.execute(second.token, { operationId, lifeId: second.snapshot.life.id, action: { type, payload } });
  };
  for (let index = 0; index < 4; index++) command('work');
  const looted = command('loot', { remainsId: grave.id }, 'first-loot');
  assert.equal(looted.life.supplies, 20);
  assert.equal(looted.life.stones, 52 + grave.stones);
  assert.deepEqual(looted.life.gu, exactGu);
  assert.equal(looted.immortals[0].owner, second.snapshot.life.id);
  assert.deepEqual(looted.remains.find(item => item.id === grave.id), { ...grave, stones: 0, gu: [] });
  assert.throws(() => command('loot', { remainsId: grave.id }), { code: 'BAG_FULL' });
  const retried = command('loot', { remainsId: grave.id }, 'first-loot');
  assert.equal(retried.life.stones, looted.life.stones);
  assert.equal(retried.remains.find(item => item.id === grave.id).supplies, 12);
  assert.equal(store.snapshot(session.token).life.dead, true);
});

test('partial supply loot conserves the remainder and removes it only after the final transfer', () => {
  const { store, act, tick } = setup();
  for (let index = 0; index < 4; index++) act('work');
  act('investigate'); act('commit', { inheritanceId: 'deadly', acceptDeath: true });
  const grave = act('choose', { stageId: 'deadly-0', choiceId: 'fatal' }).remains.at(-1);
  const second = store.createSession('Túi còn chỗ');
  const command = (type, payload = {}) => {
    tick(1001);
    return store.execute(second.token, { operationId: crypto.randomUUID(), lifeId: second.snapshot.life.id, action: { type, payload } });
  };
  command('work'); command('work'); // 14 supplies: six free slots.
  let result = command('loot', { remainsId: grave.id });
  assert.equal(result.life.supplies, 20);
  assert.equal(result.remains.find(item => item.id === grave.id).supplies, 6);
  for (let index = 0; index < 2; index++) {
    command('travel', { placeId: 'b', route: 'road' });
    command('travel', { placeId: 'a', route: 'road' });
  }
  result = command('loot', { remainsId: grave.id });
  assert.equal(result.life.supplies, 18); // 20 - 8 road supplies + 6 recovered.
  assert.equal(result.remains.some(item => item.id === grave.id), false);
});

test('birth uses only valid spawn pools and an acknowledged rebirth never rerolls on retry', () => {
  const content = structuredClone(fixture);
  content.origins[0].spawnPlaceIds = ['a', 'b'];
  let rolls = 0;
  const { store, session, act } = setup({ content, randomIndex: maximum => { rolls++; return rolls <= 2 ? 0 : maximum - 1; } });
  assert.equal(session.snapshot.life.placeId, 'a');
  act('investigate'); act('commit', { inheritanceId: 'deadly', acceptDeath: true });
  const dead = act('choose', { stageId: 'deadly-0', choiceId: 'fatal' });
  const request = { operationId: 'new-life-once', lifeId: dead.life.id, action: { type: 'rebirth', payload: { originId: 'o' } } };
  const born = store.execute(session.token, request);
  assert.equal(born.life.placeId, 'b');
  assert.deepEqual(born.life.discovered, ['b']);
  const count = rolls;
  assert.equal(store.execute(session.token, request).life.id, born.life.id);
  assert.equal(rolls, count);
  const invalid = structuredClone(content);
  invalid.origins[0].spawnPlaceIds = ['unknown-place'];
  assert.throws(() => new WorldStore({ content: invalid }), /spawn/i);
});

test('new accounts can start in each authored origin while existing lives keep their location', () => {
  const first = new WorldStore({ randomIndex: () => 0 }).createSession('Người đầu').snapshot;
  const last = new WorldStore({ randomIndex: maximum => maximum - 1 }).createSession('Người cuối').snapshot;
  assert.notEqual(first.life.originId, last.life.originId);
  assert.notEqual(first.life.placeId, last.life.placeId);
  assert.ok(last.catalog.places.some(place => place.id === last.life.placeId));
});

test('unearned starter grants never become loot across repeated concede, rebirth and looting', () => {
  let time = 1_000_000;
  const store = new WorldStore({ now: () => time, randomIndex: () => 0 });
  const session = store.createSession('Không nhân quà');
  let snapshot = session.snapshot;
  const act = (type, payload = {}) => {
    time += 1001;
    snapshot = store.execute(session.token, { operationId: crypto.randomUUID(), lifeId: snapshot.life.id, action: { type, payload } });
    return snapshot;
  };
  for (let i = 0; i < 4; i++) {
    act('investigate'); act('commit', { inheritanceId: 'duong-truc', acceptDeath: true });
    const dead = act('choose', { stageId: snapshot.life.trial.stage.id, choiceId: 'concede' });
    const remains = dead.remains.at(-1);
    assert.equal(remains.stones, 0); assert.equal(remains.supplies, 0);
    act('rebirth', { originId: 'south' });
    const looted = act('loot', { remainsId: remains.id });
    assert.equal(looted.life.stones, 20); assert.equal(looted.life.supplies, 8);
    assert.equal(JSON.stringify(looted).includes('starterStonesRemaining'), false);
    assert.equal(JSON.stringify(looted).includes('starterSuppliesRemaining'), false);
  }
});

test('spent starter gifts are consumed first while real work and trial earnings remain lootable', () => {
  const { store, session, act } = setup();
  act('train', { skill: 'care' }); // Spend two starter stones before earning any property.
  act('work');
  act('investigate'); act('commit', { inheritanceId: 'common', acceptDeath: true });
  for (let i = 0; i < 3; i++) act('choose', { stageId: `common-${i}`, choiceId: 'safe' });
  act('commit', { inheritanceId: 'deadly', acceptDeath: true });
  const dead = act('choose', { stageId: 'deadly-0', choiceId: 'fatal' });
  const remains = dead.remains.at(-1);
  assert.equal(remains.stones, 28); assert.equal(remains.supplies, 3);
  act('rebirth', { originId: 'o' });
  const looted = act('loot', { remainsId: remains.id });
  assert.equal(looted.life.stones, 48); assert.equal(looted.life.supplies, 11);
  // Looted earnings stay earned: spending one supply still consumes the new starter grant first.
  act('travel', { placeId: 'b', route: 'road' });
  act('travel', { placeId: 'a', route: 'road' });
  act('investigate'); act('commit', { inheritanceId: 'deadly', acceptDeath: true });
  const again = act('choose', { stageId: 'deadly-0', choiceId: 'fatal' });
  assert.equal(again.remains.at(-1).stones, 28);
  assert.equal(again.remains.at(-1).supplies, 3);
});

test('version one saves preserve historical assets once while new births track grants and invalid accounting is rejected', t => {
  const dir = mkdtempSync(join(tmpdir(), 'world-grants-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'world.json');
  const { session, act, now } = setup({ filePath });
  act('work');
  const legacy = JSON.parse(readFileSync(filePath, 'utf8'));
  delete legacy.starterAccountingVersion;
  const oldLife = Object.values(legacy.accounts)[0].life;
  delete oldLife.starterStonesRemaining; delete oldLife.starterSuppliesRemaining;
  writeFileSync(filePath, JSON.stringify(legacy));
  const migrated = new WorldStore({ content: fixture, filePath, now });
  const saved = JSON.parse(readFileSync(filePath, 'utf8'));
  const savedLife = Object.values(saved.accounts)[0].life;
  assert.equal(savedLife.starterStonesRemaining, 0); assert.equal(savedLife.starterSuppliesRemaining, 0);
  const command = (type, payload) => migrated.execute(session.token, { operationId: crypto.randomUUID(), lifeId: migrated.snapshot(session.token).life.id, action: { type, payload } });
  command('investigate', {}); command('commit', { inheritanceId: 'deadly', acceptDeath: true });
  const dead = command('choose', { stageId: 'deadly-0', choiceId: 'fatal' });
  assert.equal(dead.remains.at(-1).stones, 28); assert.equal(dead.remains.at(-1).supplies, 11);
  command('rebirth', { originId: 'o' }); command('investigate', {}); command('commit', { inheritanceId: 'deadly', acceptDeath: true });
  const nextDeath = command('choose', { stageId: 'deadly-0', choiceId: 'fatal' });
  assert.equal(nextDeath.remains.at(-1).stones, 0); assert.equal(nextDeath.remains.at(-1).supplies, 0);
  assert.equal(nextDeath.remains[0].stones, 28, 'Historical estate remains intact');
  for (const [field, value] of [['starterStonesRemaining', 29], ['starterSuppliesRemaining', 12], ['starterStonesRemaining', 21], ['starterSuppliesRemaining', 9], ['starterStonesRemaining', -1]]) {
    const corrupt = structuredClone(legacy); const life = Object.values(corrupt.accounts)[0].life;
    life.starterStonesRemaining = 20; life.starterSuppliesRemaining = 8; life[field] = value;
    writeFileSync(filePath, JSON.stringify(corrupt));
    assert.throws(() => new WorldStore({ content: fixture, filePath, now }), /corrupt/i);
  }
  delete Object.values(saved.accounts)[0].life.starterStonesRemaining;
  writeFileSync(filePath, JSON.stringify(saved));
  assert.throws(() => new WorldStore({ content: fixture, filePath, now }), /corrupt/i, 'An upgraded save must retain its grant provenance');
});

test('legacy remains preserve all historical value and exact Gu custody across migration', t => {
  const dir = mkdtempSync(join(tmpdir(), 'world-legacy-remains-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'world.json');
  const { session, act, now } = setup({ filePath });
  act('investigate'); act('commit', { inheritanceId: 'unique', acceptDeath: true });
  for (let i = 0; i < 3; i++) act('choose', { stageId: `unique-${i}`, choiceId: 'safe' });
  act('work'); act('commit', { inheritanceId: 'deadly', acceptDeath: true });
  const dead = act('choose', { stageId: 'deadly-0', choiceId: 'fatal' });
  const legacy = JSON.parse(readFileSync(filePath, 'utf8'));
  const instance = legacy.remains.at(-1).gu[0];
  delete legacy.starterAccountingVersion;
  for (const account of Object.values(legacy.accounts)) { delete account.life.starterStonesRemaining; delete account.life.starterSuppliesRemaining; }
  // Before grant accounting, this earned 28-stone/3-supply estate also contained its 20/8 starter gifts.
  legacy.remains.at(-1).stones = 48; legacy.remains.at(-1).supplies = 11;
  writeFileSync(filePath, JSON.stringify(legacy));
  const migrated = new WorldStore({ content: fixture, filePath, now });
  const snapshot = migrated.snapshot(session.token);
  assert.equal(snapshot.remains.at(-1).stones, 48); assert.equal(snapshot.remains.at(-1).supplies, 11);
  assert.deepEqual(snapshot.remains.at(-1).gu, ['Chưa xác định']);
  assert.equal(snapshot.immortals[0].owner, 'Chưa xác định');
  const persisted = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.deepEqual(persisted.remains.at(-1).gu, [instance]);
  assert.equal(persisted.immortals[0].owner, persisted.remains.at(-1).id);
  const restarted = new WorldStore({ content: fixture, filePath, now });
  assert.equal(restarted.snapshot(session.token).remains.at(-1).stones, 48, 'Migration preserves assets across every restart');
});

test('operation retries survive cooldown, reject conflicting payloads and persist across reload', t => {
  const dir = mkdtempSync(join(tmpdir(), 'world-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'world.json');
  const { store, session, tick, now } = setup({ filePath });
  const request = { operationId: 'durable-op', lifeId: session.snapshot.life.id, action: { type: 'work', payload: {} } };
  const first = store.execute(session.token, request);
  const replay = store.execute(session.token, request);
  assert.equal(replay.life.stones, first.life.stones);
  assert.throws(() => store.execute(session.token, { ...request, action: { type: 'rest', payload: {} } }), { code: 'OPERATION_CONFLICT' });
  assert.throws(() => store.execute(session.token, { ...request, operationId: 'too-fast' }), { code: 'COOLDOWN' });
  tick(1001);
  const reloaded = new WorldStore({ content: fixture, filePath, now });
  assert.equal(reloaded.execute(session.token, request).life.stones, 28);
  assert.equal(readFileSync(filePath, 'utf8').includes(session.token), false);
  const a = reloaded.snapshot(session.token); a.life.stones = 9999;
  assert.equal(reloaded.snapshot(session.token).life.stones, 28);
});

test('every valid operation id, including inherited object property names, is idempotent', () => {
  const { store, session } = setup();
  const request = { operationId: '__proto__', lifeId: session.snapshot.life.id, action: { type: 'work', payload: {} } };
  assert.equal(store.execute(session.token, request).life.stones, 28);
  assert.equal(store.execute(session.token, request).life.stones, 28);
});

test('timeout grants one 90 second offline allowance, sweeps before heartbeat and archives once', () => {
  const { store, session, act, tick } = setup();
  act('investigate'); const committed = act('commit', { inheritanceId: 'unique', acceptDeath: true });
  tick(300_000);
  let s = store.snapshot(session.token);
  assert.equal(s.life.dead, false);
  assert.equal(s.life.trial.deadlineAt, committed.life.trial.deadlineAt + 90_000);
  assert.equal(s.life.trial.pauseRemainingMs, 0);
  tick(90_001);
  s = store.snapshot(session.token);
  assert.equal(s.life.dead, true);
  assert.equal(s.account.pastLives.length, 1);
  assert.equal(s.inheritanceStates.unique.reservedBy, null);
  assert.equal(store.snapshot(session.token).account.pastLives.length, 1);
});

test('restart shifts outstanding deadlines by downtime, preserves unique reservations and fails on corrupt data', t => {
  const dir = mkdtempSync(join(tmpdir(), 'world-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'world.json');
  const { session, act, tick, now } = setup({ filePath });
  act('investigate'); const before = act('commit', { inheritanceId: 'unique', acceptDeath: true });
  tick(3_600_000);
  const resumed = new WorldStore({ content: fixture, filePath, now });
  const s = resumed.snapshot(session.token);
  assert.equal(s.life.dead, false);
  assert.equal(s.life.trial.deadlineAt, before.life.trial.deadlineAt + 3_600_000);
  assert.equal(s.inheritanceStates.unique.reservedBy, s.life.id);
  writeFileSync(filePath, '{broken');
  assert.throws(() => new WorldStore({ content: fixture, filePath, now }), /corrupt|Unexpected|JSON/i);
});

test('semantically corrupt persistence cannot silently recreate missing unique items or dates', t => {
  const dir = mkdtempSync(join(tmpdir(), 'world-corrupt-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'world.json');
  setup({ filePath });
  const good = JSON.parse(readFileSync(filePath, 'utf8'));
  for (const change of [s => { s.immortals = []; }, s => { delete s.world.createdAt; }, s => { Object.values(s.accounts)[0].operations = []; }]) {
    const broken = structuredClone(good); change(broken); writeFileSync(filePath, JSON.stringify(broken));
    assert.throws(() => new WorldStore({ content: fixture, filePath }), /corrupt/i);
  }
});

test('reserved unique custody rejects unknown owners and mismatched active reservations at startup', t => {
  const dir = mkdtempSync(join(tmpdir(), 'world-custody-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'world.json');
  const { act, now } = setup({ filePath });
  const unclaimed = JSON.parse(readFileSync(filePath, 'utf8'));
  act('investigate'); act('commit', { inheritanceId: 'unique', acceptDeath: true });
  const active = JSON.parse(readFileSync(filePath, 'utf8'));
  const cases = [
    [unclaimed, s => { s.immortals[0].owner = 'unknown-life'; }],
    [unclaimed, s => { s.immortals[0].owner = 'inheritance:common'; }],
    [active, s => { s.immortals[0].owner = 'unknown-life'; }],
    [active, s => { s.immortals[0].owner = 'inheritance:unique'; }],
    [active, s => { s.inheritanceStates.unique.reservedBy = null; }],
  ];
  for (const [source, change] of cases) {
    const broken = structuredClone(source); change(broken); writeFileSync(filePath, JSON.stringify(broken));
    assert.throws(() => new WorldStore({ content: fixture, filePath, now }), /corrupt/i);
  }
});

test('mastery requires the inheritance skill before spending and gives every trained skill a resource advantage', () => {
  for (const skill of skills) {
    const content = structuredClone(fixture);
    content.origins[0].skill = skill; content.places[0].skill = skill; content.inheritances[0].skill = skill;
    for (const stage of content.inheritances[0].stages) {
      stage.choices[0].energyCost = 10; stage.choices[0].supplyCost = 1;
      stage.choices.push({ id: 'mastery', label: 'Vận dụng kỹ năng', hint: '', requiredSkill: 2, energyCost: 4, supplyCost: 0, effect: effect(-1) });
    }
    const untrained = setup({ content });
    untrained.act('investigate');
    const before = untrained.act('commit', { inheritanceId: 'common', acceptDeath: true });
    assert.equal(before.life.trial.stage.choices.find(c => c.id === 'mastery').requiredSkill, 2);
    assert.throws(() => untrained.act('choose', { stageId: 'common-0', choiceId: 'mastery' }), { code: 'SKILL_REQUIRED' }, skill);
    assert.deepEqual(untrained.store.snapshot(untrained.session.token).life, before.life, skill);
    let ordinary;
    for (let i = 0; i < 3; i++) ordinary = untrained.act('choose', { stageId: `common-${i}`, choiceId: 'safe' });
    const trained = setup({ content });
    trained.act('train', { skill }); trained.act('rest'); trained.act('investigate'); trained.act('commit', { inheritanceId: 'common', acceptDeath: true });
    let skilled;
    for (let i = 0; i < 3; i++) skilled = trained.act('choose', { stageId: `common-${i}`, choiceId: 'mastery' });
    assert.equal(ordinary.life.energy, 70, skill); assert.equal(ordinary.life.supplies, 5, skill);
    assert.equal(skilled.life.energy, 88, skill); assert.equal(skilled.life.supplies, 8, skill);
    assert.deepEqual(skilled.life.learned, ['common'], skill);
    assert.equal(skilled.life.skills[skill], 3, skill);
  }
});

test('an exhausted committed life can concede decisively, archive once and release its unique reservation', () => {
  const content = JSON.parse(readFileSync(new URL('../shared/world-content.json', import.meta.url), 'utf8'));
  const unique = content.inheritances.find(i => i.uniqueGu);
  unique.minRank = 1; unique.placeId = content.origins[0].placeId;
  const { store, session, act } = setup({ content });
  act('train', { skill: content.places.find(p => p.id === unique.placeId).skill });
  for (let i = 0; i < 5; i++) act('work');
  act('investigate');
  const committed = act('commit', { inheritanceId: unique.id, acceptDeath: true });
  assert.equal(committed.life.energy, 35);
  act('choose', { stageId: committed.life.trial.stage.id, choiceId: 'observe' });
  const exhausted = act('choose', { stageId: store.snapshot(session.token).life.trial.stage.id, choiceId: 'observe' });
  assert.equal(exhausted.life.energy, 3);
  assert.equal(exhausted.life.dead, false);
  assert.throws(() => act('rest'), { code: 'TRIAL_ACTIVE' });
  assert.throws(() => act('choose', { stageId: exhausted.life.trial.stage.id, choiceId: 'prepare' }), { code: 'INSUFFICIENT_RESOURCES' });
  const concede = exhausted.life.trial.stage.choices.find(c => c.id === 'concede');
  assert.ok(concede, 'An explicit decisive failure remains available even without resources');
  assert.equal(concede.energyCost, 0); assert.equal(concede.supplyCost, 0);
  const request = { operationId: 'concede-once', lifeId: exhausted.life.id, action: { type: 'choose', payload: { stageId: exhausted.life.trial.stage.id, choiceId: 'concede' } } };
  const dead = store.execute(session.token, request);
  assert.equal(dead.life.dead, true); assert.equal(dead.life.trial, null);
  assert.equal(dead.account.pastLives.length, 1);
  assert.equal(dead.inheritanceStates[unique.id].reservedBy, null);
  assert.equal(dead.immortals[0].owner, 'Chưa xác định');
  assert.equal(dead.immortals[0].status, 'reserved');
  assert.equal(store.execute(session.token, request).account.pastLives.length, 1);
});

test('server checkpoints expire abandoned trials even when every player stops polling', () => {
  const { store, session, act, tick } = setup();
  act('investigate'); act('commit', { inheritanceId: 'unique', acceptDeath: true });
  tick(390_001);
  store.checkpoint();
  assert.equal(store.snapshot(session.token).life.dead, true);
  assert.equal(store.snapshot(session.token).inheritanceStates.unique.reservedBy, null);
});

test('a failed persistence write never publishes a partially committed reward', t => {
  const dir = mkdtempSync(join(tmpdir(), 'world-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'world.json');
  const { store, session, act, tick } = setup({ filePath });
  rmSync(filePath); mkdirSync(filePath);
  tick(1001);
  assert.throws(() => act('work'));
  rmSync(filePath, { recursive: true });
  assert.equal(store.snapshot(session.token).life.stones, 20);
});

test('a preserved legacy sixth-rank life can reach every inheritance and the singleton using public actions', t => {
  let time = 1_000_000;
  const dir = mkdtempSync(join(tmpdir(), 'world-legacy-rank-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'world.json');
  const original = new WorldStore({ filePath, now: () => time });
  const session = original.createSession('Hành trình');
  const legacy = JSON.parse(readFileSync(filePath, 'utf8'));
  const saved = Object.values(legacy.accounts)[0].life;
  delete saved.cultivation; saved.rank = 6;
  writeFileSync(filePath, JSON.stringify(legacy));
  const store = new WorldStore({ filePath, now: () => time });
  let s = store.snapshot(session.token);
  const act = (type, payload = {}) => { time += 1001; s = store.execute(session.token, { operationId: crypto.randomUUID(), lifeId: s.life.id, action: { type, payload } }); return s; };
  const refill = () => { act('rest'); while (s.life.supplies < 12 || s.life.stones < 30) act('work'); act('rest'); };
  const routeTo = goal => {
    const queue = [[s.life.placeId]], seen = new Set([s.life.placeId]);
    while (queue.length) {
      const route = queue.shift(); const here = route.at(-1);
      if (here === goal) return route.slice(1);
      for (const next of s.catalog.places.find(p => p.id === here).neighbors) if (!seen.has(next)) { seen.add(next); queue.push([...route, next]); }
    }
    assert.fail(`No connected route to ${goal}`);
  };
  for (const inheritance of s.catalog.inheritances) {
    for (const placeId of routeTo(inheritance.placeId)) { refill(); act('travel', { placeId, route: 'road' }); }
    refill(); act('investigate');
    assert.ok(s.life.rank >= inheritance.minRank, `${inheritance.id} is reachable at current rank`);
    act('commit', { inheritanceId: inheritance.id, acceptDeath: true });
    while (s.life.trial) act('choose', { stageId: s.life.trial.stage.id, choiceId: 'prepare' });
    assert.equal(s.life.dead, false);
  }
  assert.equal(s.life.learned.length, 12);
  assert.equal(s.life.rank, 6);
  assert.equal(s.life.gu.length, 1);
  assert.equal(s.immortals[0].instanceId, s.life.gu[0]);
  assert.ok(Object.values(s.life.skills).every(value => value <= 5));
});

test('inheritance knowledge cannot bypass cultivation rank even before first field entry', () => {
  const { store, session, act } = setup();
  act('investigate');
  for (const inheritanceId of ['common', 'unique']) {
    act('commit', { inheritanceId, acceptDeath: true });
    for (let stage = 0; stage < 3; stage++) act('choose', { stageId: `${inheritanceId}-${stage}`, choiceId: 'safe' });
  }
  const result = store.snapshot(session.token);
  assert.equal(result.life.rank, 1);
  assert.equal(result.life.cultivation.rank, 1);
  assert.equal(result.life.cultivation.guInstances.length, 0);
  assert.equal(result.life.cultivation.mortal.wallProgress, 0);
});

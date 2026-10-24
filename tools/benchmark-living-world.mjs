/** Reproduce the synthetic server timing review. Never opens a writable world file. */
import { performance } from 'node:perf_hooks';
import { WorldStore } from '../cotienlo-game/server/world-store.mjs';
import { createFieldState, createFieldRuntime, advanceFieldWorld } from '../cotienlo-game/server/field-engine.mjs';
import { createCultivationState } from '../cotienlo-game/shared/cultivation-core.mjs';
import { getRegionAt, nearestHub, isInsideSanctuary, OVERWORLD_HUBS } from '../cotienlo-game/shared/overworld-core.mjs';

function summarize(label, samples, details = {}) {
  const ordered = [...samples].sort((a, b) => a - b);
  const warm = samples.slice(5).sort((a, b) => a - b);
  const round = value => Number(value.toFixed(3));
  return { label, iterations: samples.length,
    meanMs: round(samples.reduce((sum, sample) => sum + sample, 0) / samples.length),
    p50Ms: round(ordered[Math.floor(ordered.length * 0.5)]),
    p95Ms: round(ordered[Math.floor(ordered.length * 0.95)]),
    maxMs: round(ordered.at(-1)), firstMs: round(samples[0]),
    warmP95Ms: round(warm[Math.floor(warm.length * 0.95)]), ...details };
}

let now = 1_000_000;
// Explicit null is mandatory: this benchmark must not use a production data path.
const store = new WorldStore({ filePath: null, now: () => now, randomIndex: () => 0 });
const sessions = [];
for (let i = 0; i < 100; i++) {
  const session = store.createSession(`Benchmark ${i}`);
  store.fieldSnapshot(session.token); sessions.push(session);
}
const writes = store.runtimeMetrics().durableWrites;
const ticks = [];
for (let i = 0; i < 200; i++) {
  now += 50; const started = performance.now(); store.tick(); ticks.push(performance.now() - started);
}
const results = [summarize('WorldStore: 100 active idle in one safe village', ticks,
  { durableWritesDuringTicks: store.runtimeMetrics().durableWrites - writes })];
const reads = [];
for (const session of sessions) {
  const started = performance.now(); store.fieldSnapshot(session.token); reads.push(performance.now() - started);
}
results.push(summarize('100 complete field snapshot requests', reads));

function syntheticLife(i, spread) {
  let x = spread ? 7000 + (i % 10) * 10000 : OVERWORLD_HUBS[0].x + 3000;
  const y = spread ? 7000 + Math.floor(i / 10) * 10000 : OVERWORLD_HUBS[0].y;
  while (isInsideSanctuary(x, y)) x += 3000;
  const id = `synthetic-${i}`;
  return { id, number: 1, hp: 100, energy: 100, supplies: 8, stones: 20, dead: false, rank: 1,
    cultivation: createCultivationState({ lifeId: id, now: 1_000_000 }),
    field: createFieldState({ x, y, regionId: getRegionAt(x, y).id, hubId: nearestHub(x, y).id }, 1_000_000) };
}
for (const [label, spread, moving] of [
  ['Pure engine: 100 co-located outside safe', false, false],
  ['Pure engine: 100 spread across 100 areas, idle', true, false],
  ['Pure engine: 100 spread across 100 areas, moving right', true, true],
]) {
  const lives = Array.from({ length: 100 }, (_, i) => syntheticLife(i, spread));
  const runtime = createFieldRuntime(1_000_000); const samples = []; let counters;
  for (let i = 0; i < 60; i++) {
    const time = 1_000_000 + (i + 1) * 50;
    if (moving) for (const life of lives) {
      life.field.lastInputAt = time; life.field.move = { x: 1, y: 0 };
    }
    const started = performance.now();
    counters = advanceFieldWorld(lives.filter(life => life.hp > 0), runtime, time).counters;
    samples.push(performance.now() - started);
  }
  results.push(summarize(label, samples, { counters, monsterCount: Object.keys(runtime.monsters).length }));
}
console.log(JSON.stringify({ recordedAt: new Date().toISOString(), node: process.version,
  platform: process.platform, arch: process.arch,
  scope: 'Synthetic synchronous Node microbenchmark; no HTTP, file writes or client rendering. Not device FPS.',
  results }, null, 2));

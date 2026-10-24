import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE, MAX_CACHED_CHUNKS, OVERWORLD_HUBS, OVERWORLD_REGIONS, OVERWORLD_ROADS,
  generateChunk, getNearbyEncounters, getRegionAt, isInsideSanctuary, nearestHub,
  sampleSpawn, worldDimensions, getNearbyFacilities, getFacility, getSpawnPool, getNearbyStructures,
} from '../src/world/Overworld';
import { OverworldMap } from '../src/engine/OverworldMap';
import { GameMap } from '../src/engine/Map';
import { Camera } from '../src/engine/Camera';

describe('continuous five-region geography', () => {
  it('covers a much larger continuous plane while leaving the legacy map unchanged', () => {
    expect(worldDimensions).toEqual({ width: 120000, height: 120000 });
    expect(new GameMap().width).toBe(2400);
    expect(OVERWORLD_REGIONS.map(r => r.id).sort()).toEqual(['central', 'east', 'north', 'south', 'west']);
    expect(getRegionAt(60000, 60000).id).toBe('central');
    expect(getRegionAt(60000, 12000).id).toBe('north');
    expect(getRegionAt(60000, 108000).id).toBe('south');
    expect(getRegionAt(12000, 60000).id).toBe('west');
    expect(getRegionAt(108000, 60000).id).toBe('east');
    for (let y = 0; y <= 120000; y += 3000) for (let x = 0; x <= 120000; x += 3000) {
      expect(OVERWORLD_REGIONS.some(r => r.id === getRegionAt(x, y).id)).toBe(true);
    }
  });

  it('makes each hub safe, gives it a nearby NPC and leaves walkable routes all the way to the center', () => {
    const map = new OverworldMap();
    expect(OVERWORLD_HUBS).toHaveLength(15);
    for (const region of OVERWORLD_REGIONS) expect(OVERWORLD_HUBS.filter(h => h.regionId === region.id)).toHaveLength(3);
    for (const hub of OVERWORLD_HUBS) {
      expect(getRegionAt(hub.x, hub.y).id).toBe(hub.regionId);
      expect(nearestHub(hub.x, hub.y).id).toBe(hub.id);
      expect(isInsideSanctuary(hub.x, hub.y)).toBe(true);
      expect(Math.hypot(hub.npc.x - hub.x, hub.npc.y - hub.y)).toBeLessThan(hub.safeRadius);
      expect(map.checkCollision(hub.npc.x, hub.npc.y, 40)).toBe(false);
    }
    for (const road of OVERWORLD_ROADS) {
      const length = Math.hypot(road.to.x - road.from.x, road.to.y - road.from.y);
      for (let i = 0; i <= Math.ceil(length / 1000); i++) {
        const t = Math.min(1, i * 1000 / length);
        expect(map.checkCollision(road.from.x + (road.to.x - road.from.x) * t, road.from.y + (road.to.y - road.from.y) * t, 40)).toBe(false);
      }
    }
    for (const x of [12000, 39999, 40000, 60000, 79999, 80000, 108000]) expect(map.checkCollision(x, 60000, 22)).toBe(false);
    for (const y of [12000, 39999, 40000, 60000, 79999, 80000, 108000]) expect(map.checkCollision(60000, y, 22)).toBe(false);
  });

  it('samples regions uniformly before choosing a hub and a walkable spawn point', () => {
    const map = new OverworldMap();
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const values = [i / 5 + 0.001, 0.4, 0.8]; let next = 0;
      const spawn = sampleSpawn(() => values[next++]!);
      seen.add(spawn.regionId);
      expect(getRegionAt(spawn.x, spawn.y).id).toBe(spawn.regionId);
      expect(map.isInsideSanctuary(spawn.x, spawn.y)).toBe(true);
      expect(map.checkCollision(spawn.x, spawn.y, 40)).toBe(false);
    }
    expect(seen.size).toBe(5);
    for (const n of [0, 0.01, 0.33, 0.5, 0.99, 0.999999]) {
      const spawn = sampleSpawn(() => n);
      expect(map.checkCollision(spawn.x, spawn.y, 40)).toBe(false);
    }
    expect(() => sampleSpawn(() => 1)).toThrow();
    expect(() => sampleSpawn(() => NaN)).toThrow();
  });

  it('starts each life beside an academy inside a large settlement with all six services', () => {
    const roles = ['academy', 'clinic', 'gu-warehouse', 'inn', 'refining-hall', 'training'];
    const map = new OverworldMap();
    for (const hub of OVERWORLD_HUBS) {
      expect(hub.safeRadius).toBeGreaterThanOrEqual(2200);
      const facilities = getNearbyFacilities(hub.x, hub.y, hub.safeRadius).filter(f => f.hubId === hub.id);
      expect(facilities.map(f => f.role).sort()).toEqual(roles);
      expect(new Set(facilities.map(f => f.id)).size).toBe(6);
      for (const facility of facilities) {
        expect(getFacility(facility.id)).toEqual(facility);
        expect(isInsideSanctuary(facility.x, facility.y)).toBe(true);
        expect(map.checkCollision(facility.x, facility.y, 40)).toBe(false);
      }
      const academy = facilities.find(f => f.role === 'academy')!;
      for (const spawn of getSpawnPool(hub.regionId).filter(s => s.hubId === hub.id)) {
        expect(Math.hypot(spawn.x - academy.x, spawn.y - academy.y)).toBeLessThanOrEqual(200);
      }
      const structures = getNearbyStructures(hub.x, hub.y, hub.safeRadius);
      expect(structures.filter(s => s.kind === 'house').length).toBeGreaterThanOrEqual(12);
      expect(structures.every(s => isInsideSanctuary(s.x, s.y))).toBe(true);
      expect(getNearbyEncounters(hub.x, hub.y, hub.safeRadius)).toEqual([]);
    }
    expect(getFacility('missing')).toBeUndefined();
    expect(getNearbyFacilities(1, 1, 300)).toEqual([]);
    expect(() => getNearbyFacilities(0, 0, Infinity)).toThrow();
    expect(() => getNearbyStructures(0, 0, 10000)).toThrow();
  });

  it('regenerates identical chunks independent of query order and changes with a world seed', () => {
    const first = generateChunk(14, 74);
    generateChunk(75, 8); generateChunk(1, 1);
    expect(generateChunk(14, 74)).toEqual(first);
    expect(generateChunk(14, 74, 47)).not.toEqual(first);
    expect(first.obstacles.length).toBeLessThanOrEqual(18);
    expect(() => generateChunk(-1, 1)).toThrow();
    expect(() => generateChunk(1.5, 1)).toThrow();
    expect(() => generateChunk(999999, 1)).toThrow();
  });

  it('finds encounters by stable identity around every region, outside sanctuary and on walkable points', () => {
    const map = new OverworldMap();
    for (const region of OVERWORLD_REGIONS) {
      const hub = OVERWORLD_HUBS.find(h => h.regionId === region.id)!;
      const encounters = getNearbyEncounters(hub.x, hub.y, 3700);
      expect(new Set(encounters.map(e => e.type))).toEqual(new Set(['snake', 'wolf', 'elite_bear', 'centipede']));
      expect(new Set(encounters.map(e => e.id)).size).toBe(encounters.length);
      expect(encounters.length).toBeLessThanOrEqual(64);
      expect(getNearbyEncounters(hub.x, hub.y, 3700)).toEqual(encounters);
      for (const point of encounters) {
        expect(isInsideSanctuary(point.x, point.y)).toBe(false);
        expect(map.checkCollision(point.x, point.y, 40)).toBe(false);
      }
    }
    expect(() => getNearbyEncounters(0, 0, Infinity)).toThrow();
    expect(() => getNearbyEncounters(0, 0, 10000)).toThrow();
  });
});

describe('viewport-limited overworld map', () => {
  it('collides at actual obstacles including across chunk edges and only blocks the outer world perimeter', () => {
    const map = new OverworldMap();
    const chunk = generateChunk(22, 42);
    const obstacle = chunk.obstacles[0]!;
    expect(obstacle).toBeDefined();
    expect(map.checkCollision(obstacle.x, obstacle.y, 22)).toBe(true);
    expect(map.checkCollision(30, 60000, 22)).toBe(true);
    expect(map.checkCollision(119980, 60000, 22)).toBe(true);
    expect(map.checkCollision(NaN, 20, 22)).toBe(true);
    let checkedEdge = false;
    for (let cx = 12; cx < 22 && !checkedEdge; cx++) for (const item of generateChunk(cx, 14).obstacles) {
      if (item.x % CHUNK_SIZE > CHUNK_SIZE - item.radius) {
        expect(map.checkCollision(item.x + item.radius - 1, item.y, 22)).toBe(true);
        checkedEdge = true; break;
      }
    }
    expect(checkedEdge).toBe(true);
  });

  it('evicts old chunks without changing their deterministic geometry', () => {
    const map = new OverworldMap();
    const original = map.getChunk(5, 9);
    for (let cx = 0; cx < 25; cx++) for (let cy = 0; cy < 10; cy++) map.getChunk(cx, cy);
    expect(map.cachedChunkCount).toBeLessThanOrEqual(MAX_CACHED_CHUNKS);
    expect(map.getChunk(5, 9)).toEqual(original);
    expect(map.getChunk(5, 9)).not.toBe(original);
  });

  it('renders a bounded viewport instead of walking every tile or obstacle in the world', () => {
    const map = new OverworldMap(); const camera = new Camera(1280, 720); camera.x = 58000; camera.y = 59000;
    let draws = 0;
    const context = new Proxy({}, { get: (_target, key) => {
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => ({ addColorStop() {} });
      return () => { draws++; };
    }, set: () => true }) as CanvasRenderingContext2D;
    map.render(context, camera);
    expect(draws).toBeGreaterThan(20); expect(draws).toBeLessThan(10000);
    expect(map.cachedChunkCount).toBeLessThan(25);
    expect(map.obstacles.length).toBeLessThan(500);
    expect(map.getTimeOfDayName().name).not.toContain('Thanh Mao Sơn');
  });
});

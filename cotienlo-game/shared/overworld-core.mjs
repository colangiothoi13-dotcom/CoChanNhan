/** Proposed game geography inspired by five regions; coordinates and settlements are invented. */
export const worldDimensions = Object.freeze({ width: 120000, height: 120000 });
export const CHUNK_SIZE = 1024;
export const MAX_CACHED_CHUNKS = 96;
export const MAX_OBSTACLE_RADIUS = 44;
export const WORLD_MARGIN = 40;
export const DEFAULT_WORLD_SEED = 271828;
export const TERRAIN_TILE_SIZE = 192;
/** Game scale, not a claim about settlement sizes in the novel. */
export const SETTLEMENT_SAFE_RADIUS = 2200;
const CENTER = 60000;
const REGION_IDS = ['south', 'north', 'west', 'east', 'central'];
const finite = (...numbers) => numbers.every(Number.isFinite);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export const OVERWORLD_REGIONS = Object.freeze([
  { id: 'south', name: 'Nam Cương', biome: 'bamboo', subtitle: 'Rừng trúc, đồi xanh và các trạm đường núi', palette: ['#14251b', '#1c3021', '#223b27'], accent: '#65c38a', feature: '#345a39' },
  { id: 'north', name: 'Bắc Nguyên', biome: 'steppe', subtitle: 'Đồng cỏ rộng, gió lạnh và lữ điếm thảo nguyên', palette: ['#2b3524', '#34412b', '#3b4930'], accent: '#b8cc83', feature: '#71845b' },
  { id: 'west', name: 'Tây Mạc', biome: 'desert', subtitle: 'Cồn cát, cột đá và trạm nghỉ quanh giếng', palette: ['#413321', '#4b3b25', '#55432a'], accent: '#e1bb72', feature: '#876b43' },
  { id: 'east', name: 'Đông Hải', biome: 'tidal', subtitle: 'Bãi triều, vũng nông và đường cầu gỗ nối các trạm', palette: ['#15333b', '#1a3d43', '#21484a'], accent: '#7fd4d5', feature: '#527d78' },
  { id: 'central', name: 'Trung Châu', biome: 'highland', subtitle: 'Cao nguyên, sân đá và ngã đường hội tụ', palette: ['#2b3024', '#333b2b', '#3b4330'], accent: '#cfcd91', feature: '#6b7550' },
].map(region => Object.freeze({ ...region, palette: Object.freeze(region.palette) })));
const regionById = new Map(OVERWORLD_REGIONS.map(region => [region.id, region]));

export function getRegionAt(x, y) {
  if (!finite(x, y)) throw new RangeError('Tọa độ Ngũ Vực phải hữu hạn.');
  x = clamp(x, 0, worldDimensions.width); y = clamp(y, 0, worldDimensions.height);
  if (x >= 40000 && x < 80000 && y >= 40000 && y < 80000) return regionById.get('central');
  const dx = x - CENTER; const dy = y - CENTER;
  return regionById.get(Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 'west' : 'east' : dy < 0 ? 'north' : 'south');
}

const hubSeeds = [
  ['south', 'Trạm Trúc Ngọc', 60000, 100000], ['south', 'Lữ Điếm Khe Xanh', 42000, 104000], ['south', 'Trạm Đồi Mưa', 78000, 104000],
  ['north', 'Trạm Gió Thảo', 60000, 20000], ['north', 'Lều Sao Bắc', 42000, 16000], ['north', 'Trạm Cỏ Bạc', 78000, 16000],
  ['west', 'Giếng Cát Vàng', 20000, 60000], ['west', 'Trạm Bóng Đá', 16000, 42000], ['west', 'Ốc Đảo Lữ Hành', 16000, 78000],
  ['east', 'Bến Triều Ngọc', 100000, 60000], ['east', 'Trạm Cầu Gỗ', 104000, 42000], ['east', 'Bến Sương Biển', 104000, 78000],
  ['central', 'Trạm Ngũ Lộ', 60000, 60000], ['central', 'Sân Đá Tùng Phong', 52000, 52000], ['central', 'Lữ Điếm Cao Nguyên', 68000, 68000],
];
export const OVERWORLD_HUBS = Object.freeze(hubSeeds.map(([regionId, name, x, y], index) => Object.freeze({
  id: `${regionId}-hub-${index % 3 + 1}`, regionId, name, x, y, safeRadius: SETTLEMENT_SAFE_RADIUS,
  npc: Object.freeze({ x, y: y - 70, name: `Người giữ ${name}`, role: 'Hướng dẫn và tiếp nhận nhiệm vụ' }),
})));
const facilityLayouts = Object.freeze([
  ['academy', 'Học đường', 'Giáo tập', 0, -70],
  ['gu-warehouse', 'Cổ khố', 'Quản sự Cổ khố', 430, -180],
  ['refining-hall', 'Tịnh thất luyện hóa', 'Chấp sự luyện hóa', -430, -180],
  ['training', 'Sân tu luyện', 'Giáo đầu', -450, 420],
  ['clinic', 'Y xá', 'Y sư', 450, 420],
  ['inn', 'Khách xá', 'Chủ khách xá', 0, 820],
]);
/** Coordinates are the NPC/entrance interaction points, also used by the server. */
export const OVERWORLD_FACILITIES = Object.freeze(OVERWORLD_HUBS.flatMap(hub => facilityLayouts.map(([role, name, npcName, dx, dy]) => {
  const x = hub.x + dx; const y = hub.y + dy;
  return Object.freeze({ id: `${hub.id}:facility:${role}`, hubId: hub.id, regionId: hub.regionId, role, name, x, y,
    npc: Object.freeze({ x, y, name: npcName, role: name }) });
})));
const facilityById = new Map(OVERWORLD_FACILITIES.map(facility => [facility.id, facility]));
export function getFacility(id) { return facilityById.get(id); }
function validateSettlementQuery(x, y, radius) {
  if (!finite(x, y, radius) || radius < 1 || radius > 4000) throw new RangeError('Bán kính truy vấn khu dân cư cần từ 1 đến 4.000.');
}
export function getNearbyFacilities(x, y, radius = 1400) {
  validateSettlementQuery(x, y, radius);
  return OVERWORLD_FACILITIES.filter(facility => Math.hypot(facility.x - x, facility.y - y) <= radius)
    .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y) || a.id.localeCompare(b.id));
}
const settlementStructures = new Map();
function structuresForHub(hub) {
  let structures = settlementStructures.get(hub.id);
  if (structures) return structures;
  const facilities = OVERWORLD_FACILITIES.filter(facility => facility.hubId === hub.id);
  structures = facilities.map(facility => Object.freeze({ id: `${facility.id}:building`, hubId: hub.id,
    regionId: hub.regionId, kind: 'facility', role: facility.role, name: facility.name,
    x: facility.x - (facility.role === 'academy' || facility.role === 'inn' ? 220 : 0),
    y: facility.y - 120, width: facility.role === 'academy' ? 220 : 180, height: 135 }));
  let index = 0;
  for (const dx of [-1500, -1050, -600, 600, 1050, 1500]) for (const dy of [-1250, -750, -300, 300, 750, 1250]) {
    if (Math.hypot(dx, dy) > 1850 || facilities.some(facility => Math.hypot(hub.x + dx - facility.x, hub.y + dy - facility.y) < 350)) continue;
    structures.push(Object.freeze({ id: `${hub.id}:house:${index++}`, hubId: hub.id, regionId: hub.regionId,
      kind: 'house', name: 'Dân cư', x: hub.x + dx, y: hub.y + dy, width: 136, height: 105 }));
  }
  structures = Object.freeze(structures); settlementStructures.set(hub.id, structures);
  return structures;
}
/** Small deterministic settlement templates are created only for queried hubs. */
export function getNearbyStructures(x, y, radius = 1400) {
  validateSettlementQuery(x, y, radius);
  const result = [];
  for (const hub of OVERWORLD_HUBS) {
    if (Math.hypot(hub.x - x, hub.y - y) > hub.safeRadius + radius) continue;
    for (const structure of structuresForHub(hub)) if (Math.hypot(structure.x - x, structure.y - y) <= radius + 180) result.push(structure);
  }
  return result.sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
}
const roads = new Map();
function addRoad(x1, y1, x2, y2) {
  if (x1 === x2 && y1 === y2) return;
  const from = { x: x1, y: y1 }; const to = { x: x2, y: y2 };
  const key = [x1, y1, x2, y2].join(':');
  roads.set(key, Object.freeze({ id: `road:${key}`, from: Object.freeze(from), to: Object.freeze(to), halfWidth: 72 }));
}
// A continuous north/south and east/west spine, with short branches from each settlement.
addRoad(60000, 1000, 60000, 119000); addRoad(1000, 60000, 119000, 60000);
for (const hub of OVERWORLD_HUBS) addRoad(hub.x, hub.y, CENTER, hub.y);
export const OVERWORLD_ROADS = Object.freeze([...roads.values()]);

export function nearestHub(x, y) {
  if (!finite(x, y)) throw new RangeError('Tọa độ trạm phải hữu hạn.');
  let best = OVERWORLD_HUBS[0]; let distance = Infinity;
  for (const hub of OVERWORLD_HUBS) {
    const squared = (hub.x - x) ** 2 + (hub.y - y) ** 2;
    if (squared < distance) { best = hub; distance = squared; }
  }
  return best;
}
export function isInsideSanctuary(x, y) {
  if (!finite(x, y)) return false;
  const hub = nearestHub(x, y);
  return Math.hypot(hub.x - x, hub.y - y) <= hub.safeRadius;
}
export function distanceToRoad(x, y, road) {
  const dx = road.to.x - road.from.x; const dy = road.to.y - road.from.y;
  const t = clamp(((x - road.from.x) * dx + (y - road.from.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(x - road.from.x - dx * t, y - road.from.y - dy * t);
}
export function isOnRoad(x, y, padding = 0) {
  return OVERWORLD_ROADS.some(road => distanceToRoad(x, y, road) <= road.halfWidth + padding);
}
export function getSpawnPool(regionId) {
  if (!REGION_IDS.includes(regionId)) throw new RangeError('Đại vực không hợp lệ.');
  return OVERWORLD_HUBS.filter(hub => hub.regionId === regionId).flatMap(hub => Array.from({ length: 8 }, (_, index) => {
    const angle = index * Math.PI / 4;
    return Object.freeze({ x: Math.round(hub.npc.x + Math.cos(angle) * 120), y: Math.round(hub.npc.y + Math.sin(angle) * 120), regionId, hubId: hub.id });
  }));
}
export function sampleSpawn(random = Math.random) {
  const pick = length => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Nguồn ngẫu nhiên phải trả số từ 0 đến dưới 1.');
    return Math.floor(value * length);
  };
  const regionId = REGION_IDS[pick(REGION_IDS.length)];
  const hubs = OVERWORLD_HUBS.filter(hub => hub.regionId === regionId);
  const hub = hubs[pick(hubs.length)]; const index = pick(8); const angle = index * Math.PI / 4;
  return { x: Math.round(hub.npc.x + Math.cos(angle) * 120), y: Math.round(hub.npc.y + Math.sin(angle) * 120), regionId, hubId: hub.id };
}

export function terrainHash(x, y, salt = DEFAULT_WORLD_SEED) {
  let value = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ (salt | 0);
  value = Math.imul(value ^ value >>> 13, 1274126177);
  return (value ^ value >>> 16) >>> 0;
}
const noise = (cx, cy, index, salt) => terrainHash(cx * 47 + index * 13, cy * 59 - index * 17, salt) / 4294967296;
const insideWorld = (x, y, padding = 0) => x >= WORLD_MARGIN + padding && y >= WORLD_MARGIN + padding && x <= worldDimensions.width - WORLD_MARGIN - padding && y <= worldDimensions.height - WORLD_MARGIN - padding;
const monsterNames = {
  south: ['Trúc Xà', 'Sói Rừng Mưa', 'Hùng Vương Đồi Xanh', 'Ngô Công Khe Núi'],
  north: ['Xà Cỏ Bạc', 'Sói Thảo Nguyên', 'Hùng Vương Đồng Gió', 'Ngô Công Đất Lạnh'],
  west: ['Sa Xà', 'Sói Cát', 'Hùng Vương Cột Đá', 'Ngô Công Cát Đỏ'],
  east: ['Xà Bãi Triều', 'Sói Bến Biển', 'Hùng Vương Đá Triều', 'Ngô Công Cầu Gỗ'],
  central: ['Xà Cao Nguyên', 'Sói Tùng Phong', 'Hùng Vương Sân Đá', 'Ngô Công Đồi Tùng'],
};
const monsterTypes = ['snake', 'wolf', 'elite_bear', 'centipede'];
function encounter(id, x, y, type) {
  const regionId = getRegionAt(x, y).id;
  return Object.freeze({ id, x, y, type, regionId, name: `${monsterNames[regionId][monsterTypes.indexOf(type)]} [Phóng tác]` });
}
// Starter encounters are along cleared roads; every region supports the existing four hunting targets.
const hubEncounters = OVERWORLD_HUBS.flatMap(hub => [
  ['snake', 550, -35], ['snake', 640, 35], ['snake', 730, -35], ['wolf', 880, 35], ['wolf', 990, -35],
  ['elite_bear', 1200, 30], ['centipede', 1400, -30],
].map(([type, offset, side], index) => {
  const horizontal = hub.x !== CENTER;
  const direction = horizontal ? Math.sign(CENTER - hub.x) : hub.y > CENTER ? -1 : 1;
  const distance = hub.safeRadius + offset;
  return encounter(`${hub.id}:encounter:${index}`, hub.x + (horizontal ? direction * distance : side), hub.y + (horizontal ? side : direction * distance), type);
}));

export function generateChunk(cx, cy, seed = DEFAULT_WORLD_SEED) {
  const maxX = Math.ceil(worldDimensions.width / CHUNK_SIZE); const maxY = Math.ceil(worldDimensions.height / CHUNK_SIZE);
  if (!Number.isInteger(cx) || !Number.isInteger(cy) || cx < 0 || cy < 0 || cx >= maxX || cy >= maxY || !Number.isSafeInteger(seed)) throw new RangeError('Chỉ số mảnh bản đồ hoặc hạt giống không hợp lệ.');
  const bounds = Object.freeze({ x: cx * CHUNK_SIZE, y: cy * CHUNK_SIZE, width: Math.min(CHUNK_SIZE, worldDimensions.width - cx * CHUNK_SIZE), height: Math.min(CHUNK_SIZE, worldDimensions.height - cy * CHUNK_SIZE) });
  const obstacles = [];
  for (let index = 0; index < 18; index++) {
    const x = Math.floor(bounds.x + noise(cx, cy, index, seed) * bounds.width);
    const y = Math.floor(bounds.y + noise(cx, cy, index, seed + 97) * bounds.height);
    const radius = 18 + Math.floor(noise(cx, cy, index, seed + 211) * 27);
    const hub = nearestHub(x, y);
    if (!insideWorld(x, y, radius + 42) || Math.hypot(x - hub.x, y - hub.y) < hub.safeRadius + radius + 64 || isOnRoad(x, y, radius + 48)) continue;
    const region = getRegionAt(x, y);
    const variant = Math.floor(noise(cx, cy, index, seed + 313) * 100);
    const type = variant < 18 ? 'pillar' : region.biome === 'bamboo' || region.biome === 'steppe' ? variant < 73 ? 'bamboo' : 'rock' : 'rock';
    obstacles.push(Object.freeze({ x, y, radius, type, regionId: region.id, variant }));
  }
  const encounters = [];
  for (let index = 0; index < 4; index++) {
    const x = bounds.x + 128 + Math.floor(noise(cx, cy, index, seed + 1009) * 768);
    const y = bounds.y + 128 + Math.floor(noise(cx, cy, index, seed + 2003) * 768);
    if (!insideWorld(x, y, 80) || isInsideSanctuary(x, y) || obstacles.some(o => Math.hypot(x - o.x, y - o.y) < o.radius + 44)) continue;
    const distance = Math.hypot(x - nearestHub(x, y).x, y - nearestHub(x, y).y);
    const roll = noise(cx, cy, index, seed + 4001);
    const type = distance < 700 || roll < 0.5 ? 'snake' : roll < 0.82 ? 'wolf' : roll < 0.94 ? 'elite_bear' : 'centipede';
    encounters.push(encounter(`chunk:${seed}:${cx}:${cy}:${index}`, x, y, type));
  }
  return Object.freeze({ id: `chunk:${seed}:${cx}:${cy}`, cx, cy, bounds, regionId: getRegionAt(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2).id,
    obstacles: Object.freeze(obstacles), encounters: Object.freeze(encounters) });
}

export class ChunkCache {
  #chunks = new Map();
  constructor(seed = DEFAULT_WORLD_SEED, limit = MAX_CACHED_CHUNKS) {
    if (!Number.isSafeInteger(seed) || !Number.isInteger(limit) || limit < 1 || limit > MAX_CACHED_CHUNKS) throw new RangeError('Cấu hình bộ nhớ mảnh không hợp lệ.');
    this.seed = seed; this.limit = limit;
  }
  get size() { return this.#chunks.size; }
  get(cx, cy) {
    const key = `${cx}:${cy}`;
    let chunk = this.#chunks.get(key);
    if (!chunk) chunk = generateChunk(cx, cy, this.seed);
    this.#chunks.delete(key); this.#chunks.set(key, chunk);
    if (this.#chunks.size > this.limit) this.#chunks.delete(this.#chunks.keys().next().value);
    return chunk;
  }
  clear() { this.#chunks.clear(); }
}
const sharedCache = new ChunkCache();
function chunkAt(cx, cy, seed, provider) { return provider ? provider(cx, cy) : seed === DEFAULT_WORLD_SEED ? sharedCache.get(cx, cy) : generateChunk(cx, cy, seed); }

export function checkWorldCollision(x, y, radius = 22, seed = DEFAULT_WORLD_SEED, provider) {
  if (!finite(x, y, radius) || radius < 0 || radius > 512 || !insideWorld(x, y, radius)) return true;
  const reach = radius + MAX_OBSTACLE_RADIUS;
  const minX = Math.max(0, Math.floor((x - reach) / CHUNK_SIZE)); const maxX = Math.min(Math.ceil(worldDimensions.width / CHUNK_SIZE) - 1, Math.floor((x + reach) / CHUNK_SIZE));
  const minY = Math.max(0, Math.floor((y - reach) / CHUNK_SIZE)); const maxY = Math.min(Math.ceil(worldDimensions.height / CHUNK_SIZE) - 1, Math.floor((y + reach) / CHUNK_SIZE));
  for (let cx = minX; cx <= maxX; cx++) for (let cy = minY; cy <= maxY; cy++) {
    if (chunkAt(cx, cy, seed, provider).obstacles.some(o => Math.hypot(x - o.x, y - o.y) < radius + o.radius)) return true;
  }
  return false;
}

export function getNearbyEncounters(x, y, radius = 1400, seed = DEFAULT_WORLD_SEED, provider) {
  if (!finite(x, y, radius) || radius < 1 || radius > 4000) throw new RangeError('Bán kính truy vấn quái cần từ 1 đến 4.000.');
  const points = hubEncounters.filter(point => Math.hypot(point.x - x, point.y - y) <= radius);
  const minX = Math.max(0, Math.floor((x - radius) / CHUNK_SIZE)); const maxX = Math.min(Math.ceil(worldDimensions.width / CHUNK_SIZE) - 1, Math.floor((x + radius) / CHUNK_SIZE));
  const minY = Math.max(0, Math.floor((y - radius) / CHUNK_SIZE)); const maxY = Math.min(Math.ceil(worldDimensions.height / CHUNK_SIZE) - 1, Math.floor((y + radius) / CHUNK_SIZE));
  for (let cx = minX; cx <= maxX; cx++) for (let cy = minY; cy <= maxY; cy++) for (const point of chunkAt(cx, cy, seed, provider).encounters) {
    if (Math.hypot(point.x - x, point.y - y) <= radius) points.push(point);
  }
  return points.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y) || a.id.localeCompare(b.id)).slice(0, 64);
}

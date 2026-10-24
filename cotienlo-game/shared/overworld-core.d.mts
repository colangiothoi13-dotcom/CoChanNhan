export type OverworldRegionId = 'south' | 'north' | 'west' | 'east' | 'central';
export interface WorldPoint { readonly x: number; readonly y: number }
export interface OverworldRegion { readonly id: OverworldRegionId; readonly name: string; readonly biome: 'bamboo' | 'steppe' | 'desert' | 'tidal' | 'highland'; readonly subtitle: string; readonly palette: readonly string[]; readonly accent: string; readonly feature: string }
export interface OverworldHub extends WorldPoint { readonly id: string; readonly regionId: OverworldRegionId; readonly name: string; readonly safeRadius: number; readonly npc: WorldPoint & { readonly name: string; readonly role: string } }
export interface OverworldRoad { readonly id: string; readonly from: WorldPoint; readonly to: WorldPoint; readonly halfWidth: number }
export interface OverworldSpawn extends WorldPoint { readonly regionId: OverworldRegionId; readonly hubId: string }
export type OverworldFacilityRole = 'academy' | 'gu-warehouse' | 'refining-hall' | 'training' | 'clinic' | 'inn';
export interface OverworldFacility extends WorldPoint { readonly id: string; readonly hubId: string; readonly regionId: OverworldRegionId; readonly role: OverworldFacilityRole; readonly name: string; readonly npc: WorldPoint & { readonly name: string; readonly role: string } }
export interface OverworldStructure extends WorldPoint { readonly id: string; readonly hubId: string; readonly regionId: OverworldRegionId; readonly kind: 'facility' | 'house'; readonly role?: OverworldFacilityRole; readonly name: string; readonly width: number; readonly height: number }
export interface OverworldObstacle extends WorldPoint { readonly radius: number; readonly type: 'rock' | 'pillar' | 'bamboo'; readonly regionId: OverworldRegionId; readonly variant: number }
export interface OverworldEncounter extends WorldPoint { readonly id: string; readonly type: 'snake' | 'wolf' | 'elite_bear' | 'centipede'; readonly regionId: OverworldRegionId; readonly name: string }
export interface TerrainChunk { readonly id: string; readonly cx: number; readonly cy: number; readonly bounds: WorldPoint & { readonly width: number; readonly height: number }; readonly regionId: OverworldRegionId; readonly obstacles: readonly OverworldObstacle[]; readonly encounters: readonly OverworldEncounter[] }
export const worldDimensions: Readonly<{ width: number; height: number }>;
export const CHUNK_SIZE: number;
export const MAX_CACHED_CHUNKS: number;
export const MAX_OBSTACLE_RADIUS: number;
export const WORLD_MARGIN: number;
export const DEFAULT_WORLD_SEED: number;
export const TERRAIN_TILE_SIZE: number;
export const SETTLEMENT_SAFE_RADIUS: number;
export const OVERWORLD_REGIONS: readonly OverworldRegion[];
export const OVERWORLD_HUBS: readonly OverworldHub[];
export const OVERWORLD_ROADS: readonly OverworldRoad[];
export const OVERWORLD_FACILITIES: readonly OverworldFacility[];
export function getFacility(id: string): OverworldFacility | undefined;
export function getNearbyFacilities(x: number, y: number, radius?: number): OverworldFacility[];
export function getNearbyStructures(x: number, y: number, radius?: number): OverworldStructure[];
export function getRegionAt(x: number, y: number): OverworldRegion;
export function nearestHub(x: number, y: number): OverworldHub;
export function isInsideSanctuary(x: number, y: number): boolean;
export function distanceToRoad(x: number, y: number, road: OverworldRoad): number;
export function isOnRoad(x: number, y: number, padding?: number): boolean;
export function getSpawnPool(regionId: OverworldRegionId): readonly OverworldSpawn[];
export function sampleSpawn(random?: () => number): OverworldSpawn;
export function terrainHash(x: number, y: number, salt?: number): number;
export function generateChunk(cx: number, cy: number, seed?: number): TerrainChunk;
export class ChunkCache { constructor(seed?: number, limit?: number); readonly seed: number; readonly limit: number; readonly size: number; get(cx: number, cy: number): TerrainChunk; clear(): void }
export function checkWorldCollision(x: number, y: number, radius?: number, seed?: number, provider?: (cx: number, cy: number) => TerrainChunk): boolean;
export function getNearbyEncounters(x: number, y: number, radius?: number, seed?: number, provider?: (cx: number, cy: number) => TerrainChunk): OverworldEncounter[];

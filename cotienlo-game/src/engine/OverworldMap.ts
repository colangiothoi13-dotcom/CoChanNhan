import { GameMap } from './Map';
import type { Camera } from './Camera';
import {
  CHUNK_SIZE, ChunkCache, DEFAULT_WORLD_SEED, OVERWORLD_HUBS, OVERWORLD_ROADS, TERRAIN_TILE_SIZE,
  checkWorldCollision, getNearbyEncounters as nearbyEncounters, getNearbyFacilities, getNearbyStructures, getRegionAt as regionAt,
  isInsideSanctuary as insideSanctuary, nearestHub as closestHub, terrainHash, worldDimensions,
  type OverworldObstacle, type OverworldRegion, type OverworldStructure, type TerrainChunk,
} from '../world/Overworld';

/** Continuous, streamed terrain. The 2,400px legacy GameMap remains unchanged. */
export class OverworldMap extends GameMap {
  public readonly mode = 'five-regions' as const;
  private readonly chunks: ChunkCache;
  private readonly seed: number;
  private animationTime = 0;
  private focusRegion = regionAt(60000, 60000);

  constructor(seed = DEFAULT_WORLD_SEED) {
    super();
    this.seed = seed;
    this.chunks = new ChunkCache(seed);
    this.width = worldDimensions.width; this.height = worldDimensions.height; this.obstacles = [];
  }
  get cachedChunkCount(): number { return this.chunks.size; }
  getChunk(cx: number, cy: number): TerrainChunk { return this.chunks.get(cx, cy); }
  clearChunkCache(): void { this.chunks.clear(); this.obstacles = []; }
  getRegionAt(x: number, y: number): OverworldRegion { return regionAt(x, y); }
  nearestHub(x: number, y: number) { return closestHub(x, y); }
  getNearbyFacilities(x: number, y: number, radius = 1400) { return getNearbyFacilities(x, y, radius); }
  getNearbyEncounters(x: number, y: number, radius = 1400) {
    return nearbyEncounters(x, y, radius, this.seed, (cx, cy) => this.chunks.get(cx, cy));
  }
  override isInsideSanctuary(x: number, y: number): boolean { return insideSanctuary(x, y); }
  override checkCollision(x: number, y: number, radius: number): boolean {
    return checkWorldCollision(x, y, radius, this.seed, (cx, cy) => this.chunks.get(cx, cy));
  }
  override update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    super.update(dt); this.animationTime += dt;
  }
  override getTimeOfDayName(): { name: string; icon: string } {
    const night = this.dayTime < 0.2 || this.dayTime >= 0.85;
    return { name: `${this.focusRegion.name} • ${night ? 'Đêm thanh vắng' : this.dayTime < 0.35 ? 'Rạng đông' : this.dayTime < 0.65 ? 'Ban ngày' : 'Hoàng hôn'}`, icon: night ? '🌙' : this.dayTime < 0.35 ? '🌅' : this.dayTime < 0.65 ? '☀️' : '🌇' };
  }

  override render(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const { x, y, viewportWidth: width, viewportHeight: height } = camera;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
    this.focusRegion = regionAt(x + width / 2, y + height / 2);
    const tile = TERRAIN_TILE_SIZE;
    const left = Math.max(0, Math.floor(x / tile) * tile); const top = Math.max(0, Math.floor(y / tile) * tile);
    const right = Math.min(this.width, x + width + tile); const bottom = Math.min(this.height, y + height + tile);
    for (let wx = left; wx < right; wx += tile) for (let wy = top; wy < bottom; wy += tile) {
      const region = regionAt(wx + tile / 2, wy + tile / 2); const hash = terrainHash(wx / tile, wy / tile, this.seed);
      const sx = wx - x; const sy = wy - y;
      ctx.fillStyle = region.palette[hash % region.palette.length]!; ctx.fillRect(sx, sy, tile + 1, tile + 1);
      ctx.strokeStyle = region.feature; ctx.globalAlpha = 0.42; ctx.lineWidth = 1.3;
      ctx.beginPath();
      if (region.biome === 'tidal') {
        for (let line = 0; line < 3; line++) {
          const dy = 35 + line * 58; const drift = Math.sin(this.animationTime * 0.8 + hash % 20) * 8;
          ctx.moveTo(sx + 20 + drift, sy + dy); ctx.quadraticCurveTo(sx + 65, sy + dy - 9, sx + 110 + drift, sy + dy);
        }
      } else if (region.biome === 'desert') {
        ctx.moveTo(sx + 12, sy + 80); ctx.quadraticCurveTo(sx + 95, sy + 35, sx + 180, sy + 85);
        ctx.moveTo(sx + 25, sy + 145); ctx.quadraticCurveTo(sx + 100, sy + 105, sx + 172, sy + 151);
      } else if (region.biome === 'highland' && hash % 3 === 0) {
        ctx.rect(sx + 18, sy + 22, 72, 54); ctx.rect(sx + 95, sy + 84, 70, 55);
      } else {
        for (let blade = 0; blade < 4; blade++) {
          const gx = sx + 22 + (hash >>> blade * 3) % 140; const gy = sy + 30 + blade * 40;
          ctx.moveTo(gx, gy); ctx.lineTo(gx - 4, gy - 10); ctx.moveTo(gx, gy); ctx.lineTo(gx + 5, gy - 7);
        }
      }
      ctx.stroke(); ctx.globalAlpha = 1;
      if (hash % 13 === 0 && region.biome !== 'desert') {
        ctx.fillStyle = region.accent; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(sx + 112, sy + 84, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    this.renderRoads(ctx, camera);
    const visibleChunks = this.visibleChunks(camera);
    // Compatibility snapshot only; collision always queries the appropriate chunks independently.
    this.obstacles = visibleChunks.flatMap(chunk => [...chunk.obstacles]);
    const visible = visibleChunks.flatMap(chunk => chunk.obstacles).filter(obstacle => obstacle.x + obstacle.radius + 40 >= x && obstacle.x - obstacle.radius - 40 <= x + width && obstacle.y + 80 >= y && obstacle.y - obstacle.radius - 90 <= y + height);
    visible.sort((a, b) => a.y - b.y);
    for (const obstacle of visible) this.renderObstacle(ctx, camera, obstacle);
    for (const hub of OVERWORLD_HUBS) if (hub.x + hub.safeRadius >= x && hub.x - hub.safeRadius <= x + width && hub.y + hub.safeRadius >= y && hub.y - hub.safeRadius <= y + height) {
      this.renderHub(ctx, camera, hub);
    }
    const structureRadius = Math.min(4000, Math.hypot(width, height) / 2 + 220);
    for (const structure of getNearbyStructures(x + width / 2, y + height / 2, structureRadius)) {
      if (structure.x + structure.width / 2 + 30 < x || structure.x - structure.width / 2 - 30 > x + width
        || structure.y + 70 < y || structure.y - structure.height - 40 > y + height) continue;
      this.renderStructure(ctx, camera, structure);
    }
  }

  private visibleChunks(camera: Camera): TerrainChunk[] {
    const margin = 128;
    const minX = Math.max(0, Math.floor((camera.x - margin) / CHUNK_SIZE));
    const minY = Math.max(0, Math.floor((camera.y - margin) / CHUNK_SIZE));
    const maxX = Math.min(Math.ceil(this.width / CHUNK_SIZE) - 1, Math.floor((camera.x + camera.viewportWidth + margin) / CHUNK_SIZE));
    const maxY = Math.min(Math.ceil(this.height / CHUNK_SIZE) - 1, Math.floor((camera.y + camera.viewportHeight + margin) / CHUNK_SIZE));
    const chunks: TerrainChunk[] = [];
    for (let cx = minX; cx <= maxX; cx++) for (let cy = minY; cy <= maxY; cy++) chunks.push(this.chunks.get(cx, cy));
    return chunks;
  }

  private renderRoads(ctx: CanvasRenderingContext2D, camera: Camera): void {
    for (const road of OVERWORLD_ROADS) {
      const minX = Math.min(road.from.x, road.to.x); const minY = Math.min(road.from.y, road.to.y);
      const maxX = Math.max(road.from.x, road.to.x); const maxY = Math.max(road.from.y, road.to.y);
      if (maxX + 90 < camera.x || minX - 90 > camera.x + camera.viewportWidth || maxY + 90 < camera.y || minY - 90 > camera.y + camera.viewportHeight) continue;
      const horizontal = road.from.y === road.to.y;
      const startX = horizontal ? Math.max(minX, camera.x - 100) : road.from.x;
      const endX = horizontal ? Math.min(maxX, camera.x + camera.viewportWidth + 100) : road.from.x;
      const startY = horizontal ? road.from.y : Math.max(minY, camera.y - 100);
      const endY = horizontal ? road.from.y : Math.min(maxY, camera.y + camera.viewportHeight + 100);
      ctx.save(); ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(startX - camera.x, startY - camera.y); ctx.lineTo(endX - camera.x, endY - camera.y);
      ctx.strokeStyle = '#1f241d'; ctx.lineWidth = 158; ctx.stroke();
      ctx.strokeStyle = '#665b3e'; ctx.lineWidth = 138; ctx.stroke();
      ctx.strokeStyle = '#7b7050'; ctx.globalAlpha = 0.45; ctx.lineWidth = 104; ctx.stroke(); ctx.globalAlpha = 1;
      // Eastern routes are visible timber causeways across traversable tidal shallows.
      const length = Math.hypot(endX - startX, endY - startY);
      ctx.strokeStyle = '#ae9769'; ctx.lineWidth = 2;
      for (let distance = 0; distance < length; distance += 48) {
        const wx = horizontal ? startX + distance : startX; const wy = horizontal ? startY : startY + distance;
        if (regionAt(wx, wy).id !== 'east') continue;
        ctx.beginPath(); ctx.moveTo(wx - camera.x - (horizontal ? 0 : 54), wy - camera.y - (horizontal ? 54 : 0));
        ctx.lineTo(wx - camera.x + (horizontal ? 0 : 54), wy - camera.y + (horizontal ? 54 : 0)); ctx.stroke();
      }
      ctx.restore();
    }
  }

  private renderObstacle(ctx: CanvasRenderingContext2D, camera: Camera, obstacle: OverworldObstacle): void {
    const x = obstacle.x - camera.x; const y = obstacle.y - camera.y; const r = obstacle.radius;
    const region = regionAt(obstacle.x, obstacle.y);
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.30)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 12, r * 1.08, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    if (obstacle.type === 'bamboo') {
      if (region.biome === 'steppe') {
        ctx.fillStyle = '#728153'; ctx.beginPath(); ctx.ellipse(x, y - 10, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#abb884'; ctx.lineWidth = 2;
        for (let offset = -14; offset <= 14; offset += 7) { ctx.beginPath(); ctx.moveTo(x + offset, y); ctx.lineTo(x + offset + 6, y - r * 1.5); ctx.stroke(); }
      } else {
        ctx.strokeStyle = '#51865b'; ctx.lineWidth = 5;
        for (const offset of [-9, 0, 9]) { ctx.beginPath(); ctx.moveTo(x + offset, y + 6); ctx.lineTo(x + offset, y - r * 1.8); ctx.stroke(); }
        ctx.fillStyle = '#3c7751'; ctx.beginPath(); ctx.ellipse(x - 10, y - r * 1.5, r * 0.8, r * 0.45, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#69a170'; ctx.beginPath(); ctx.ellipse(x + 8, y - r * 1.65, r * 0.8, r * 0.4, 0.3, 0, Math.PI * 2); ctx.fill();
      }
    } else if (obstacle.type === 'pillar') {
      ctx.fillStyle = region.biome === 'desert' ? '#8d7650' : region.biome === 'tidal' ? '#6c6550' : '#636657';
      ctx.fillRect(x - r * 0.55, y - r * 1.9, r * 1.1, r * 2.15);
      ctx.strokeStyle = region.accent; ctx.lineWidth = 2; ctx.strokeRect(x - r * 0.4, y - r * 1.7, r * 0.8, r * 1.7);
      ctx.fillStyle = '#d7c68e'; ctx.font = 'bold 15px Georgia,serif'; ctx.textAlign = 'center'; ctx.fillText('◇', x, y - r * 0.7);
    } else {
      ctx.fillStyle = region.biome === 'desert' ? '#8b714d' : region.biome === 'tidal' ? '#4b6b6b' : '#59645a';
      ctx.beginPath(); ctx.moveTo(x - r, y + r * 0.3); ctx.lineTo(x - r * 0.8, y - r * 0.6); ctx.lineTo(x - r * 0.05, y - r);
      ctx.lineTo(x + r * 0.8, y - r * 0.65); ctx.lineTo(x + r, y + r * 0.3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = region.feature; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.55); ctx.lineTo(x - r * 0.05, y - r * 0.8); ctx.lineTo(x + r * 0.35, y - r * 0.6); ctx.stroke();
    }
    ctx.restore();
  }

  private renderHub(ctx: CanvasRenderingContext2D, camera: Camera, hub: typeof OVERWORLD_HUBS[number]): void {
    const x = hub.x - camera.x; const y = hub.y - camera.y;
    ctx.save();
    const aura = ctx.createRadialGradient(x, y, 50, x, y, hub.safeRadius);
    aura.addColorStop(0, 'rgba(85,165,112,.04)'); aura.addColorStop(0.9, 'rgba(106,200,151,.09)'); aura.addColorStop(1, 'rgba(217,190,119,0)');
    ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(x, y, hub.safeRadius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(152,211,160,.5)'; ctx.lineWidth = 2; ctx.setLineDash([16, 12]); ctx.beginPath(); ctx.arc(x, y, hub.safeRadius - 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    // Local avenues remain walkable. Only their visible segments are drawn.
    const reach = hub.safeRadius - 260;
    ctx.strokeStyle = '#625b41'; ctx.lineWidth = 72;
    ctx.beginPath(); ctx.moveTo(Math.max(x - reach, -100), y + 180); ctx.lineTo(Math.min(x + reach, camera.viewportWidth + 100), y + 180); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 260, Math.max(y - reach, -100)); ctx.lineTo(x + 260, Math.min(y + reach, camera.viewportHeight + 100)); ctx.stroke();
    ctx.fillStyle = '#414636'; ctx.beginPath(); ctx.ellipse(x, y + 4, 130, 100, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c0ab70'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y + 4, 126, 96, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = '600 14px "Segoe UI",sans-serif'; ctx.strokeStyle = '#102016'; ctx.lineWidth = 4;
    ctx.strokeText(hub.name, x, y + 38); ctx.fillStyle = '#ede0ae'; ctx.fillText(hub.name, x, y + 38);
    ctx.font = '11px "Segoe UI",sans-serif'; ctx.fillStyle = '#a5d7af'; ctx.fillText('KHU DÂN CƯ AN TOÀN · HỌC ĐƯỜNG', x, y + 59);
    ctx.restore();
  }

  private renderStructure(ctx: CanvasRenderingContext2D, camera: Camera, structure: OverworldStructure): void {
    const x = structure.x - camera.x; const y = structure.y - camera.y;
    const w = structure.width; const h = structure.height;
    const facility = structure.kind === 'facility';
    const region = regionAt(structure.x, structure.y);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x + 8, y + 20, w * 0.59, 30, 0, 0, Math.PI * 2); ctx.fill();
    if (structure.role === 'training') {
      ctx.fillStyle = '#77724e'; ctx.fillRect(x - w / 2, y - h / 2, w, h * 0.7);
      ctx.strokeStyle = '#c0aa70'; ctx.lineWidth = 3; ctx.strokeRect(x - w / 2, y - h / 2, w, h * 0.7);
      for (const dx of [-48, 0, 48]) {
        ctx.strokeStyle = '#815b37'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x + dx, y - 48); ctx.lineTo(x + dx, y + 4); ctx.stroke();
        ctx.strokeStyle = '#d0bc85'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x + dx, y - 48, 17, 0, Math.PI * 2); ctx.stroke();
      }
    } else {
      ctx.fillStyle = facility ? '#675338' : '#514733'; ctx.fillRect(x - w * 0.44, y - h * 0.62, w * 0.88, h * 0.75);
      ctx.strokeStyle = '#ab9463'; ctx.lineWidth = facility ? 5 : 3; ctx.strokeRect(x - w * 0.44, y - h * 0.62, w * 0.88, h * 0.75);
      ctx.fillStyle = '#282a21'; ctx.fillRect(x - 15, y - 35, 30, 52);
      ctx.fillStyle = '#bba36c'; ctx.globalAlpha = 0.7; ctx.fillRect(x - w * 0.32, y - 52, 19, 18); ctx.fillRect(x + w * 0.2, y - 52, 19, 18); ctx.globalAlpha = 1;
      ctx.fillStyle = facility ? '#3c6248' : region.id === 'west' ? '#8e7450' : '#425746';
      ctx.beginPath(); ctx.moveTo(x - w * 0.56, y - h * 0.52); ctx.lineTo(x, y - h); ctx.lineTo(x + w * 0.56, y - h * 0.52); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = facility ? '#d3bb7c' : '#8f9166'; ctx.lineWidth = facility ? 3 : 2; ctx.stroke();
    }
    if (facility) {
      ctx.textAlign = 'center'; ctx.font = '600 13px "Segoe UI",sans-serif'; ctx.strokeStyle = '#17241b'; ctx.lineWidth = 4;
      ctx.strokeText(structure.name, x, y + 39); ctx.fillStyle = '#f0dfad'; ctx.fillText(structure.name, x, y + 39);
    }
    ctx.restore();
  }
}

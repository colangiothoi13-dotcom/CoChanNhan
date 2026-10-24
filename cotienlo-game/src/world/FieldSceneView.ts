import { Camera } from '../engine/Camera';
import { OverworldMap } from '../engine/OverworldMap';
import { Cultivator } from '../entities/Cultivator';
import { Monster } from '../entities/Monster';
import { Npc } from '../entities/Npc';
import { Projectile } from '../entities/Projectile';
import { GuSystem } from '../systems/GuSystem';
import { InventorySystem } from '../systems/InventorySystem';
import type { FieldSnapshot } from './field-types';
import type { OverworldFacility } from './Overworld';

interface PlaceMarker { id: string; name: string; x: number; y: number }
type PresentedSnapshot = FieldSnapshot & { nearbyPlaces?: PlaceMarker[] };
interface Visual<T extends { x: number; y: number }> { object: T; targetX: number; targetY: number }

/** Renders accepted server state; no movement authority, AI, resource ticks or rewards live here. */
export class FieldSceneView {
  private current: PresentedSnapshot | null = null;
  private targetX = 0;
  private targetY = 0;
  private selfAccountId: string | null = null;
  private monsters = new Map<string, Visual<Monster>>();
  private projectiles = new Map<string, Visual<Projectile>>();
  private avatars = new Map<string, Visual<Cultivator>>();
  private guide = new Npc();
  private facilityNpcs = new Map<string, Npc>();
  private selectedFacility: OverworldFacility | undefined;
  private guideIsPlace = false;
  private knownGuIds = new Set(new GuSystem().getAllGu().map(gu => gu.id));

  constructor(private player: Cultivator, private inventory: InventorySystem, private map: OverworldMap) {}

  get snapshot(): FieldSnapshot | null { return this.current; }
  get npc(): Npc { return this.guide; }
  get facility(): OverworldFacility | undefined { return this.selectedFacility; }
  get resourceNode() {
    const nodes = this.current?.resources?.nearbyNodes ?? [];
    let nearest: typeof nodes[number] | undefined, distance = 220;
    for (const node of nodes) {
      const candidate = Math.hypot(node.x - this.player.x, node.y - this.player.y);
      if (candidate <= distance) { nearest = node; distance = candidate; }
    }
    if (this.selectedFacility && Math.hypot(this.selectedFacility.x - this.player.x, this.selectedFacility.y - this.player.y) <= distance) return undefined;
    return nearest;
  }
  setSelfAccountId(id: string | null): void {
    this.selfAccountId = id;
    if (id) this.avatars.delete(id);
  }

  apply(snapshot: FieldSnapshot): void {
    const freshLife = this.current?.lifeId !== snapshot.lifeId;
    if (!freshLife && this.current && (snapshot.seq < this.current.seq ||
      (snapshot.seq === this.current.seq && snapshot.serverTime < this.current.serverTime))) return;
    if (freshLife) {
      this.monsters.clear(); this.projectiles.clear(); this.avatars.clear();
      Object.assign(this.player, new Cultivator());
      this.inventory.items.clear();
      this.player.x = snapshot.x; this.player.y = snapshot.y;
    }
    const places = (snapshot as PresentedSnapshot).nearbyPlaces;
    this.current = {
      ...snapshot,
      guIds: [...snapshot.guIds], cooldowns: { ...snapshot.cooldowns }, buffs: { ...snapshot.buffs },
      monsters: snapshot.monsters.map(monster => ({ ...monster })),
      projectiles: snapshot.projectiles.map(projectile => ({ ...projectile })),
      nearbyPlayers: snapshot.nearbyPlayers.map(peer => ({ ...peer })),
      ...(places ? { nearbyPlaces: places.map(place => ({ ...place })) } : {}),
    };
    this.targetX = snapshot.x; this.targetY = snapshot.y;
    this.player.facingAngle = snapshot.facing;
    this.player.hp = snapshot.hp; this.player.mp = snapshot.mp; this.player.stamina = snapshot.stamina;
    this.player.maxHp = snapshot.maxHp; this.player.maxMp = snapshot.maxMp; this.player.maxStamina = snapshot.maxStamina;
    this.player.cdAttack = snapshot.cooldowns.attack; this.player.cdMoonlight = snapshot.cooldowns.moonlight;
    this.player.cdMoonbeam = snapshot.cooldowns.moonbeam ?? 0;
    this.player.cdBronze = snapshot.cooldowns.bronze; this.player.cdBoar = snapshot.cooldowns.boar;
    this.player.cdHeal = snapshot.cooldowns.heal; this.player.cdDash = snapshot.cooldowns.dash;
    this.player.shieldDuration = snapshot.buffs.bronze; this.player.boarBuffDuration = snapshot.buffs.boar;
    this.player.healDuration = snapshot.buffs.heal; this.player.isDashing = snapshot.buffs.dash > 0;
    this.inventory.primevalStones = snapshot.stones;
    this.inventory.ownedGuIds = [...new Set(snapshot.guIds.filter(id => this.knownGuIds.has(id)))];
    this.inventory.usableGuIds = [...(snapshot.usableGuIds ?? snapshot.guIds)];
    if (snapshot.resources) {
      this.inventory.items.clear();
      for (const item of snapshot.resources.items) if (item.quantity > 0) this.inventory.addItem({
        id: item.id, name: item.name, count: item.quantity, description: item.definition.description, icon: '',
      });
    }
    this.player.syncGuDefense(this.inventory.canControlGu('ironskin') ? 15 : 0);
    this.player.moonlightCooldownDuration = this.inventory.canControlGu('moonblade') ? 1.2 : this.player.MAX_CD_MOONLIGHT;
    Object.assign(this.player, { displayName: snapshot.accountName });
    if (snapshot.cultivationStats) {
      this.player.displayRealm = `${snapshot.cultivationStats.rankLabel} ${snapshot.cultivationStats.subrealmLabel ?? ''}`.trim();
      this.player.baseAttack = snapshot.cultivationStats.physicalDamage;
      this.player.baseSpeed = snapshot.cultivationStats.moveSpeed;
    }
    if (snapshot.cultivation) this.player.primevalLevel = snapshot.cultivation.rank;
    const region = this.map.getRegionAt(snapshot.x, snapshot.y);
    this.player.originTitle = `${region.name} · Đời ${snapshot.lifeNumber}`;
    this.syncPopulation(snapshot);
    this.updateGuide(snapshot);
  }

  private syncPopulation(snapshot: FieldSnapshot): void {
    const liveMonsters = new Set(snapshot.monsters.map(monster => monster.id));
    for (const id of this.monsters.keys()) if (!liveMonsters.has(id)) this.monsters.delete(id);
    for (const data of snapshot.monsters) {
      let entry = this.monsters.get(data.id);
      if (!entry || entry.object.type !== data.type) {
        entry = { object: new Monster(data.x, data.y, data.type), targetX: data.x, targetY: data.y };
        this.monsters.set(data.id, entry);
      }
      entry.targetX = data.x; entry.targetY = data.y;
      entry.object.hp = data.hp; entry.object.maxHp = data.maxHp; entry.object.state = data.state;
      const extra = data as typeof data & { name?: string; facing?: number };
      if (typeof extra.name === 'string') entry.object.name = extra.name;
      if (Number.isFinite(extra.facing)) entry.object.facingAngle = extra.facing!;
    }
    const liveShots = new Set(snapshot.projectiles.map(projectile => projectile.id));
    for (const id of this.projectiles.keys()) if (!liveShots.has(id)) this.projectiles.delete(id);
    for (const data of snapshot.projectiles) {
      let entry = this.projectiles.get(data.id);
      const extra = data as typeof data & { damage?: number; piercing?: boolean };
      if (!entry || entry.object.type !== data.type || entry.object.piercing !== (extra.piercing === true)) {
        entry = { object: new Projectile(data.x, data.y, data.angle, Math.hypot(data.vx, data.vy), extra.damage ?? 0, data.type, extra.piercing === true), targetX: data.x, targetY: data.y };
        this.projectiles.set(data.id, entry);
      }
      entry.targetX = data.x; entry.targetY = data.y;
      entry.object.angle = data.angle; entry.object.vx = data.vx; entry.object.vy = data.vy; entry.object.life = data.life;
    }
    const livePeers = new Set(snapshot.nearbyPlayers.filter(peer => peer.accountId !== this.selfAccountId).map(peer => peer.accountId));
    for (const id of this.avatars.keys()) if (!livePeers.has(id)) this.avatars.delete(id);
    for (const data of snapshot.nearbyPlayers) {
      if (data.accountId === this.selfAccountId) continue;
      let entry = this.avatars.get(data.accountId);
      if (!entry) {
        const avatar = new Cultivator(); avatar.x = data.x; avatar.y = data.y;
        entry = { object: avatar, targetX: data.x, targetY: data.y }; this.avatars.set(data.accountId, entry);
      }
      entry.targetX = data.x; entry.targetY = data.y; entry.object.facingAngle = data.facing;
      Object.assign(entry.object, { displayName: data.name });
      entry.object.originTitle = 'Cổ Sư đồng hành';
    }
  }

  private updateGuide(snapshot: FieldSnapshot): void {
    this.guideIsPlace = false;
    const facilities = snapshot.facilities ?? [];
    const ids = new Set(facilities.map(facility => facility.id));
    for (const id of this.facilityNpcs.keys()) if (!ids.has(id)) this.facilityNpcs.delete(id);
    for (const facility of facilities) {
      const npc = this.facilityNpcs.get(facility.id) ?? new Npc();
      npc.x = facility.npc.x; npc.y = facility.npc.y;
      npc.name = facility.npc.name; npc.title = facility.npc.role;
      this.facilityNpcs.set(facility.id, npc);
    }
    this.selectedFacility = facilities.reduce<OverworldFacility | undefined>((nearest, candidate) => !nearest ||
      Math.hypot(candidate.x - snapshot.x, candidate.y - snapshot.y) < Math.hypot(nearest.x - snapshot.x, nearest.y - snapshot.y) ? candidate : nearest, undefined);
    if (this.selectedFacility && Math.hypot(this.selectedFacility.x - snapshot.x, this.selectedFacility.y - snapshot.y) <= 220) {
      this.guide = this.facilityNpcs.get(this.selectedFacility.id)!;
      return;
    }
    this.selectedFacility = undefined;
    this.guide = new Npc();
    const place = this.current?.nearbyPlaces?.filter(item => Number.isFinite(item.x) && Number.isFinite(item.y))
      .reduce<PlaceMarker | undefined>((nearest, candidate) => !nearest ||
        Math.hypot(candidate.x - snapshot.x, candidate.y - snapshot.y) < Math.hypot(nearest.x - snapshot.x, nearest.y - snapshot.y) ? candidate : nearest, undefined);
    if (place) {
      this.guideIsPlace = true;
      this.guide.x = place.x; this.guide.y = place.y; this.guide.name = place.name;
      this.guide.title = 'Người dẫn đường';
    } else {
      const hub = this.map.nearestHub(snapshot.x, snapshot.y);
      this.guide.x = hub.npc.x; this.guide.y = hub.npc.y; this.guide.name = hub.npc.name; this.guide.title = hub.npc.role;
    }
  }

  update(dt: number): void {
    if (!this.current || !Number.isFinite(dt) || dt <= 0) return;
    const alpha = 1 - Math.exp(-16 * Math.min(dt, 0.25));
    const ease = (object: { x: number; y: number }, x: number, y: number) => {
      object.x += (x - object.x) * alpha; object.y += (y - object.y) * alpha;
    };
    ease(this.player, this.targetX, this.targetY);
    for (const population of [this.monsters, this.projectiles, this.avatars])
      for (const entry of population.values()) ease(entry.object, entry.targetX, entry.targetY);
    this.guide.update(Math.min(dt, 0.25));
    for (const npc of this.facilityNpcs.values()) if (npc !== this.guide) npc.update(Math.min(dt, 0.25));
  }

  render(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (!this.current) return;
    const visible = (point: { x: number; y: number }, margin = 100) =>
      point.x >= camera.x - margin && point.y >= camera.y - margin
      && point.x <= camera.x + camera.viewportWidth + margin && point.y <= camera.y + camera.viewportHeight + margin;
    for (const { object } of this.monsters.values()) if (object.state !== 'dead' && visible(object)) object.render(ctx, camera);
    for (const [id, { object }] of this.avatars) if (id !== this.selfAccountId && visible(object)) object.render(ctx, camera);
    for (const { object } of this.projectiles.values()) if (object.life > 0 && visible(object)) object.render(ctx, camera);
    for (const place of this.current.nearbyPlaces ?? []) {
      if (!visible(place) || Math.hypot(place.x - this.guide.x, place.y - this.guide.y) < 1) continue;
      const point = camera.worldToScreen(place.x, place.y);
      ctx.save(); ctx.strokeStyle = '#d9b45a'; ctx.fillStyle = '#f3d89b'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(point.x, point.y, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.font = '12px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(place.name, point.x, point.y - 23); ctx.restore();
    }
    for (const node of this.current.resources?.nearbyNodes ?? []) {
      if (!visible(node, 60)) continue;
      const point = camera.worldToScreen(node.x, node.y);
      const near = Math.hypot(node.x - this.player.x, node.y - this.player.y) <= 220;
      ctx.save(); ctx.fillStyle = '#13291ee0';
      ctx.strokeStyle = node.discovered ? node.kind === 'wild' ? '#eed28b' : '#86cfa7' : '#a39b80';
      ctx.lineWidth = near ? 2.5 : 1.5;
      ctx.beginPath(); ctx.arc(point.x, point.y, near ? 19 : 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; ctx.textAlign = 'center'; ctx.font = 'bold 16px "Segoe UI", sans-serif';
      ctx.fillText(node.discovered ? node.kind === 'wild' ? '✦' : '❧' : '?', point.x, point.y + 6);
      ctx.font = '11px "Segoe UI", sans-serif';
      ctx.fillText(node.discovered ? node.name : 'Dấu vết chưa khảo sát', point.x, point.y - 28);
      if (near) ctx.fillText('[F] Khảo sát & thu thập', point.x, point.y + 38);
      ctx.restore();
    }
    for (const npc of this.facilityNpcs.values()) if (visible(npc, 150)) npc.render(ctx, camera, npc.isNear(this.player.x, this.player.y, 220));
    if (!this.selectedFacility && (this.guideIsPlace || !this.facilityNpcs.size) && visible(this.guide, 150)) this.guide.render(ctx, camera, this.guide.isNear(this.player.x, this.player.y, 220));
  }

  reset(): void {
    this.current = null; this.monsters.clear(); this.projectiles.clear(); this.avatars.clear(); this.facilityNpcs.clear(); this.selectedFacility = undefined;
  }
}

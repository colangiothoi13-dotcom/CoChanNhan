import { Camera } from '../engine/Camera';
import { Cultivator } from './Cultivator';
import { ParticleSystem } from '../engine/ParticleSystem';
import { SoundEngine } from '../engine/SoundEngine';

export interface SavedRemains {
  x: number; y: number; lifeNumber: number; primevalStones: number; durability: number;
}

export class Remains {
  public x: number;
  public y: number;
  public radius: number = 22;
  public lifeNumber: number;
  public primevalStones: number;
  public durability: number = 100; // Decreases over time from environmental wear & cataclysms
  public isLooted: boolean = false;
  private animTime: number = 0;

  constructor(x: number, y: number, lifeNumber: number, stones: number) {
    this.x = x;
    this.y = y;
    this.lifeNumber = lifeNumber;
    this.primevalStones = Number.isSafeInteger(stones) && stones >= 0 ? Math.floor(stones * 0.6) : 0;
  }

  public snapshot(): SavedRemains {
    return { x: this.x, y: this.y, lifeNumber: this.lifeNumber, primevalStones: this.primevalStones, durability: this.durability };
  }

  public static restore(value: unknown): Remains | null {
    if (!value || typeof value !== 'object') return null;
    const saved = value as SavedRemains;
    if (![saved.x, saved.y, saved.durability].every(Number.isFinite) || saved.durability <= 0 || saved.durability > 100 ||
      !Number.isSafeInteger(saved.lifeNumber) || saved.lifeNumber < 1 || !Number.isSafeInteger(saved.primevalStones) || saved.primevalStones < 0) return null;
    const remains = new Remains(saved.x, saved.y, saved.lifeNumber, 0);
    remains.primevalStones = saved.primevalStones;
    remains.durability = saved.durability;
    return remains;
  }

  public update(dt: number, cataclysmActive: boolean): boolean {
    this.animTime += dt * 2.5;

    // Environmental decay
    const decayRate = cataclysmActive ? 2.5 : 0.4;
    this.durability -= decayRate * dt;

    return this.durability <= 0 || this.isLooted;
  }

  public isNear(playerX: number, playerY: number, range = 55): boolean {
    return Math.hypot(playerX - this.x, playerY - this.y) <= range;
  }

  public excavate(_cultivator: Cultivator, particles: ParticleSystem, sound: SoundEngine): number {
    if (this.isLooted || this.durability <= 0) return 0;
    this.isLooted = true;
    particles.emitHitSparks(this.x, this.y, '#f59e0b');
    particles.addDamageText(this.x, this.y - 30, `+${this.primevalStones} Nguyên Thạch (Di Trạch Kiếp ${this.lifeNumber})`, '#ffd700', 16);
    sound.playRefineSuccess();
    return this.primevalStones;
  }

  public render(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.isLooted) return;
    const sp = camera.worldToScreen(this.x, this.y);

    // Skip if off screen
    if (sp.x < -60 || sp.x > camera.viewportWidth + 60 || sp.y < -60 || sp.y > camera.viewportHeight + 60) {
      return;
    }

    ctx.save();
    ctx.translate(sp.x, sp.y);

    // 1. Weathered Stone Tombstele Shadow & Mound
    ctx.fillStyle = 'rgba(15, 12, 10, 0.6)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Small stone cairn
    ctx.fillStyle = '#44403c';
    ctx.beginPath();
    ctx.arc(-8, 5, 7, 0, Math.PI * 2);
    ctx.arc(8, 4, 8, 0, Math.PI * 2);
    ctx.arc(0, 1, 9, 0, Math.PI * 2);
    ctx.fill();

    // 2. Weathered Stone Slab (Bia Mộ Tiền Kiếp)
    ctx.fillStyle = '#292524';
    ctx.fillRect(-10, -18, 20, 24);
    ctx.strokeStyle = '#78716c';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-10, -18, 20, 24);

    // Ancient inscription carved in stone
    ctx.fillStyle = '#d97706';
    ctx.font = 'bold 9px serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Kiếp ${this.lifeNumber}`, 0, -5);

    // 3. Hovering Soul Wisp / Remembrance Flame
    const bob = Math.sin(this.animTime) * 3;
    const wispY = -28 + bob;
    const wispGrad = ctx.createRadialGradient(0, wispY, 1, 0, wispY, 8);
    wispGrad.addColorStop(0, '#fef08a');
    wispGrad.addColorStop(0.5, '#38bdf8');
    wispGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = wispGrad;
    ctx.beginPath();
    ctx.arc(0, wispY, 8, 0, Math.PI * 2);
    ctx.fill();

    // 4. Floating Nameplate
    ctx.font = 'bold 10px "Segoe UI", sans-serif';
    ctx.fillStyle = '#fde68a';
    ctx.strokeStyle = 'rgba(10, 8, 6, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.strokeText(`[Di Trạch Kiếp ${this.lifeNumber}]`, 0, -38 + bob);
    ctx.fillText(`[Di Trạch Kiếp ${this.lifeNumber}]`, 0, -38 + bob);

    ctx.restore();
  }
}

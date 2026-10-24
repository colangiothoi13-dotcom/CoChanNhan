import { Camera } from '../engine/Camera';
import { ParticleSystem } from '../engine/ParticleSystem';

export class Projectile {
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public radius: number = 14;
  public damage: number = 30;
  public type: 'moonlight' | 'slash';
  public life: number = 1.6; // max flight duration in seconds
  public angle: number;
  private hitTargets = new WeakSet<object>();

  constructor(
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
    type: 'moonlight' | 'slash' = 'moonlight',
    public readonly piercing: boolean = false
  ) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.damage = damage;
    this.type = type;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    if (piercing) this.radius *= 2;
  }

  public registerHit(target: object): boolean {
    if (this.hitTargets.has(target)) return false;
    this.hitTargets.add(target);
    return true;
  }

  public update(dt: number, particles: ParticleSystem): boolean {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;

    if (this.type === 'moonlight') {
      particles.emitMoonlightTrail(this.x, this.y);
    }

    return this.life <= 0;
  }

  public render(ctx: CanvasRenderingContext2D, camera: Camera) {
    const sp = camera.worldToScreen(this.x, this.y);

    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(this.angle);
    if (this.piercing) ctx.scale(1.65, 1.65);

    if (this.type === 'moonlight') {
      // Crescent Moon Blade (Nguyệt Quang Cổ / Nguyệt Nhận Cổ)
      ctx.shadowColor = this.piercing ? '#f4d35e' : '#48cae4';
      ctx.shadowBlur = 14;

      // Outer energy crescent
      ctx.beginPath();
      ctx.arc(0, 0, 20, -Math.PI * 0.44, Math.PI * 0.44, false);
      ctx.arc(7, 0, 15, Math.PI * 0.38, -Math.PI * 0.38, true);
      ctx.closePath();

      ctx.fillStyle = this.piercing ? '#fef3c7' : '#caf0f8';
      ctx.fill();
      ctx.strokeStyle = this.piercing ? '#d97706' : '#0096c7';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner razor core gleam
      ctx.beginPath();
      ctx.arc(2, 0, 15, -Math.PI * 0.3, Math.PI * 0.3, false);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Radiant burst rays radiating outward from crescent (matching Feature 04 in cotienlo.com)
      ctx.strokeStyle = this.piercing ? 'rgba(254, 240, 138, 0.75)' : 'rgba(186, 230, 253, 0.75)';
      ctx.lineWidth = 1.5;
      for (let r = -4; r <= 4; r++) {
        const ra = r * 0.14;
        const rx1 = Math.cos(ra) * 16;
        const ry1 = Math.sin(ra) * 16;
        const rx2 = Math.cos(ra) * 28;
        const ry2 = Math.sin(ra) * 28;
        ctx.beginPath();
        ctx.moveTo(rx1, ry1);
        ctx.lineTo(rx2, ry2);
        ctx.stroke();
      }
    } else {
      // Crimson & Gold Blood Crescent Slash Sweep (matching Images 03 & 04 from cotienlo.com)
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, 20, -Math.PI * 0.42, Math.PI * 0.42);
      ctx.stroke();

      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(2, 0, 20, -Math.PI * 0.35, Math.PI * 0.35);
      ctx.stroke();
    }

    ctx.restore();
  }
}

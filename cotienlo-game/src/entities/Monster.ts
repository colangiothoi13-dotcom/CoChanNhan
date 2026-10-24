import { Camera } from '../engine/Camera';
import { Cultivator } from './Cultivator';
import { ParticleSystem } from '../engine/ParticleSystem';
import { DropItem } from './DropItem';
import { SoundEngine } from '../engine/SoundEngine';

export type MonsterType = 'snake' | 'wolf' | 'elite_bear' | 'centipede';

export class Monster {
  public x: number;
  public y: number;
  public spawnX: number;
  public spawnY: number;
  public type: MonsterType;
  public name: string;
  public radius: number;
  public maxHp: number;
  public hp: number;
  public speed: number;
  public attackPower: number;
  public attackRange: number;
  public aggroRange: number;

  public state: 'patrol' | 'chase' | 'attack' | 'hurt' | 'dead' = 'patrol';
  public facingAngle: number = 0;
  private attackCooldown: number = 0;
  private hurtTimer: number = 0;
  private patrolTimer: number = 0;
  private patrolDir: { x: number; y: number } = { x: 0, y: 0 };
  private animTime: number = 0;

  // Telegraph warning for elite attack
  public isTelegraphing: boolean = false;
  public telegraphTimer: number = 0;
  private stompCooldown: number = 4.0;
  public isStaggered: boolean = false;
  public staggerTimer: number = 0;

  constructor(x: number, y: number, type: MonsterType = 'snake') {
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    this.type = type;

    if (type === 'snake') {
      this.name = 'Thanh Trúc Xà';
      this.radius = 16;
      this.maxHp = 60;
      this.hp = 60;
      this.speed = 95;
      this.attackPower = 12;
      this.attackRange = 36;
      this.aggroRange = 240;
    } else if (type === 'wolf') {
      this.name = 'Điện Lang [Lang Triều]';
      this.radius = 24;
      this.maxHp = 110;
      this.hp = 110;
      this.speed = 130;
      this.attackPower = 20;
      this.attackRange = 44;
      this.aggroRange = 280;
    } else if (type === 'centipede') {
      this.name = 'Thiên Khảm Ngô Công [Tam Chuyển]';
      this.radius = 32;
      this.maxHp = 380;
      this.hp = 380;
      this.speed = 85;
      this.attackPower = 32;
      this.attackRange = 58;
      this.aggroRange = 340;
    } else {
      this.name = 'Hào Điện Lang Vương [Thú Vương]';
      this.radius = 38;
      this.maxHp = 300;
      this.hp = 300;
      this.speed = 85;
      this.attackPower = 38;
      this.attackRange = 58;
      this.aggroRange = 340;
    }
  }

  public update(
    dt: number,
    player: Cultivator,
    particles: ParticleSystem,
    sound: SoundEngine
  ): { died: boolean; drops: DropItem[] } {
    if (this.state === 'dead') {
      return { died: false, drops: [] };
    }

    this.animTime += dt * 6;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    if (this.stompCooldown > 0) this.stompCooldown -= dt;

    if (this.isStaggered) {
      this.staggerTimer -= dt;
      if (this.staggerTimer <= 0) this.isStaggered = false;
      return { died: false, drops: [] };
    }

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distToPlayer = Math.hypot(dx, dy);

    // Safe Zone Barrier Check (Tông Môn Hộ Thần Trận near Elder: 1200, 960, radius 260)
    const SANCTUARY_X = 1200;
    const SANCTUARY_Y = 960;
    const SANCTUARY_RADIUS = 260;
    const sDx = this.x - SANCTUARY_X;
    const sDy = this.y - SANCTUARY_Y;
    const distToSanctuary = Math.hypot(sDx, sDy);
    const minSafeDist = SANCTUARY_RADIUS + this.radius;

    if (distToSanctuary < minSafeDist) {
      const pushAngle = distToSanctuary > 0.001 ? Math.atan2(sDy, sDx) : 0;
      this.x = SANCTUARY_X + Math.cos(pushAngle) * minSafeDist;
      this.y = SANCTUARY_Y + Math.sin(pushAngle) * minSafeDist;
      if (Math.random() < 0.2) {
        particles.emitHitSparks(this.x, this.y, '#34d399');
      }
      if (this.state === 'chase') {
        this.state = 'patrol';
        this.patrolTimer = 2.0;
        this.patrolDir = { x: Math.cos(pushAngle), y: Math.sin(pushAngle) };
      }
    }

    const playerInSanctuary = Math.hypot(player.x - SANCTUARY_X, player.y - SANCTUARY_Y) <= SANCTUARY_RADIUS;
    if (playerInSanctuary && this.isTelegraphing) {
      this.isTelegraphing = false;
    }

    // Elite Boss Telegraph Stomp Logic
    if (this.type === 'elite_bear' && !playerInSanctuary) {
      if (this.isTelegraphing) {
        this.telegraphTimer -= dt;
        if (this.telegraphTimer <= 0) {
          this.isTelegraphing = false;
          this.stompCooldown = 7.0;
          particles.emitHitSparks(this.x, this.y, '#e63946');
          sound.playMonsterHit();

          if (distToPlayer <= 95) {
            player.takeDamage(38, particles);
            particles.addDamageText(player.x, player.y, 'Chấn địa!', '#ff4d6d', 20);
          } else {
            // Player successfully dodged! Bear is staggered!
            this.isStaggered = true;
            this.staggerTimer = 2.2;
            particles.addDamageText(this.x, this.y, 'Khựng đòn (sát thương ×1.5)!', '#f3d27a', 15);
          }
        }
        return { died: false, drops: [] };
      } else if (distToPlayer <= 160 && this.stompCooldown <= 0 && this.state !== 'patrol') {
        // Initiate telegraph warning
        this.isTelegraphing = true;
        this.telegraphTimer = 1.0;
        this.facingAngle = Math.atan2(dy, dx);
        particles.addDamageText(this.x, this.y, '⚠ Nộ kình tụ lực!', '#ef4444', 16);
        return { died: false, drops: [] };
      }
    }

    // AI State Machine
    if (distToPlayer <= this.aggroRange && !playerInSanctuary) {
      this.facingAngle = Math.atan2(dy, dx);

      if (distToPlayer <= this.attackRange) {
        // In Attack Range
        if (this.attackCooldown <= 0) {
          this.executeAttack(player, particles, sound);
        }
      } else {
        // Chase Player
        this.state = 'chase';
        const vx = (dx / distToPlayer) * this.speed;
        const vy = (dy / distToPlayer) * this.speed;
        this.x += vx * dt;
        this.y += vy * dt;
      }
    } else {
      // Idle / Patrol near spawn
      this.state = 'patrol';
      this.patrolTimer -= dt;
      if (this.patrolTimer <= 0) {
        this.patrolTimer = 2 + Math.random() * 3;
        const pAngle = Math.random() * Math.PI * 2;
        this.patrolDir = { x: Math.cos(pAngle), y: Math.sin(pAngle) };
      }

      // Check distance from spawn
      const distFromSpawn = Math.hypot(this.x - this.spawnX, this.y - this.spawnY);
      if (distFromSpawn > 180) {
        // Return towards spawn
        const backAngle = Math.atan2(this.spawnY - this.y, this.spawnX - this.x);
        this.x += Math.cos(backAngle) * (this.speed * 0.4) * dt;
        this.y += Math.sin(backAngle) * (this.speed * 0.4) * dt;
        this.facingAngle = backAngle;
      } else {
        this.x += this.patrolDir.x * (this.speed * 0.35) * dt;
        this.y += this.patrolDir.y * (this.speed * 0.35) * dt;
        this.facingAngle = Math.atan2(this.patrolDir.y, this.patrolDir.x);
      }
    }

    // Re-check safe zone perimeter after movement
    const sDxAfter = this.x - SANCTUARY_X;
    const sDyAfter = this.y - SANCTUARY_Y;
    const distAfter = Math.hypot(sDxAfter, sDyAfter);
    if (distAfter < minSafeDist) {
      const pushAngle = distAfter > 0.001 ? Math.atan2(sDyAfter, sDxAfter) : 0;
      this.x = SANCTUARY_X + Math.cos(pushAngle) * minSafeDist;
      this.y = SANCTUARY_Y + Math.sin(pushAngle) * minSafeDist;
    }

    return { died: false, drops: [] };
  }

  private executeAttack(player: Cultivator, particles: ParticleSystem, sound: SoundEngine) {
    this.attackCooldown = 1.4;
    player.takeDamage(this.attackPower, particles);
    sound.playMonsterHit();
  }

  public takeDamage(amount: number, particles: ParticleSystem, sound: SoundEngine): { died: boolean; drops: DropItem[] } {
    if (this.state === 'dead') return { died: false, drops: [] };
    const effectiveDamage = this.isStaggered ? Math.round(amount * 1.5) : amount;
    this.hp -= effectiveDamage;
    this.hurtTimer = 0.2;
    particles.addDamageText(this.x, this.y, `-${effectiveDamage}${this.isStaggered ? ' 💥' : ''}`, '#ffd700', 17);
    particles.emitHitSparks(this.x, this.y, '#e63946');
    sound.playMonsterHit();

    if (this.hp <= 0) {
      this.state = 'dead';
      particles.emitHitSparks(this.x, this.y, '#ffd700');

      // Generate drops
      const drops: DropItem[] = [];
      // Guaranteed Primeval stones
      const stoneCount = this.type === 'elite_bear' ? 8 : (this.type === 'wolf' ? 4 : 2);
      for (let i = 0; i < stoneCount; i++) {
        drops.push(new DropItem(this.x, this.y, 'stone', 1));
      }

      // Chance of herbs
      if (Math.random() < 0.6) {
        drops.push(new DropItem(this.x, this.y, 'herb', 1));
      }

      // Elite chance of Wild Gu
      if (this.type === 'elite_bear' || Math.random() < 0.25) {
        drops.push(new DropItem(this.x, this.y, 'wild_gu', 1));
      }

      return { died: true, drops };
    }

    return { died: false, drops: [] };
  }

  public render(ctx: CanvasRenderingContext2D, camera: Camera) {
    if (this.state === 'dead') return;

    const sp = camera.worldToScreen(this.x, this.y);
    const isHurt = this.hurtTimer > 0;
    const sway = Math.sin(this.animTime) * 2.5;

    ctx.save();
    // Ground Shadow
    ctx.beginPath();
    ctx.ellipse(sp.x, sp.y + this.radius * 0.72, this.radius * 0.95, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fill();

    // Elite crimson-gold aura ring on the ground
    if (this.type === 'elite_bear') {
      if (this.isTelegraphing) {
        const prog = Math.max(0, Math.min(1, 1 - (this.telegraphTimer / 1.0)));
        ctx.save();
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 95, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 95 * prog, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y + this.radius * 0.65, this.radius * 1.25, 11, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(217, 180, 90, 0.65)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.translate(sp.x, sp.y);
    ctx.rotate(this.facingAngle);

    if (this.type === 'snake') {
      // Emerald Bamboo Viper (Thanh Trúc Xà) — S-coil body + triangular viper head + forked tongue
      ctx.strokeStyle = isHurt ? '#ffffff' : '#1b4332';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(-this.radius * 1.1, sway);
      ctx.quadraticCurveTo(-4, -sway * 1.4, this.radius * 0.5, 0);
      ctx.stroke();

      ctx.strokeStyle = isHurt ? '#ffffff' : '#40916c';
      ctx.lineWidth = 6.5;
      ctx.stroke();

      // Viper head
      ctx.fillStyle = isHurt ? '#ffffff' : '#2d6a4f';
      ctx.beginPath();
      ctx.ellipse(this.radius * 0.55, 0, 9, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#74c69d';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Flicking crimson forked tongue
      ctx.strokeStyle = '#ef233c';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(this.radius * 0.55 + 9, 0);
      ctx.lineTo(this.radius * 0.55 + 15, -2.5);
      ctx.moveTo(this.radius * 0.55 + 9, 0);
      ctx.lineTo(this.radius * 0.55 + 15, 2.5);
      ctx.stroke();

      // Glowing ruby eyes
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.arc(this.radius * 0.65, -3.5, 2.2, 0, Math.PI * 2);
      ctx.arc(this.radius * 0.65, 3.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'wolf') {
      // Frost Wolf (Bạch Lang Thú) — bushy tail, silver-slate body, shoulder mane, snout & ice eyes
      // Bushy tail
      ctx.fillStyle = isHurt ? '#ffffff' : '#475569';
      ctx.beginPath();
      ctx.ellipse(-this.radius * 0.95, sway * 0.6, 10, 5, 0.2, 0, Math.PI * 2);
      ctx.fill();

      // Torso & shoulder mane
      ctx.fillStyle = isHurt ? '#ffffff' : '#64748b';
      ctx.beginPath();
      ctx.ellipse(-2, 0, this.radius * 0.95, this.radius * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Wolf head & snout
      ctx.fillStyle = isHurt ? '#ffffff' : '#94a3b8';
      ctx.beginPath();
      ctx.arc(this.radius * 0.45, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(this.radius * 0.9, 0, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pointed ears
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(4, -10);
      ctx.lineTo(12, -19);
      ctx.lineTo(15, -7);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(4, 10);
      ctx.lineTo(12, 19);
      ctx.lineTo(15, 7);
      ctx.closePath();
      ctx.fill();

      // Glowing ice-blue eyes
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(this.radius * 0.62, -4.5, 2.8, 0, Math.PI * 2);
      ctx.arc(this.radius * 0.62, 4.5, 2.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'centipede') {
      // Giant Golden Centipede (Thiên Khảm Ngô Công [Tam Chuyển Dị Thú]) — matching Feature 05 screenshot
      const segCount = 8;
      // Draw legs on both sides
      for (let s = segCount - 1; s >= 0; s--) {
        const segX = (s - segCount / 2) * 11;
        const segY = Math.sin(this.animTime + s * 0.8) * 6;
        const legSway = Math.sin(this.animTime * 1.5 + s) * 5;

        // Golden barbed legs
        ctx.strokeStyle = isHurt ? '#ffffff' : '#d97706';
        ctx.lineWidth = 2.5;
        // Left leg
        ctx.beginPath();
        ctx.moveTo(segX, segY - 10);
        ctx.lineTo(segX - 8, segY - 20 + legSway);
        ctx.lineTo(segX - 14, segY - 26 + legSway);
        ctx.stroke();
        // Right leg
        ctx.beginPath();
        ctx.moveTo(segX, segY + 10);
        ctx.lineTo(segX - 8, segY + 20 - legSway);
        ctx.lineTo(segX - 14, segY + 26 - legSway);
        ctx.stroke();

        // Chitin segmented body armor plate
        const segRadius = 14 - (s * 0.6);
        ctx.fillStyle = isHurt ? '#ffffff' : '#b45309';
        ctx.beginPath();
        ctx.ellipse(segX, segY, segRadius, segRadius * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Golden dorsal crest plate
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.ellipse(segX, segY, segRadius * 0.6, segRadius * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ferocious Head & Golden Razor Mandibles
      const headX = (segCount / 2) * 11 + 4;
      const headY = Math.sin(this.animTime) * 3;

      ctx.fillStyle = isHurt ? '#ffffff' : '#78350f';
      ctx.beginPath();
      ctx.arc(headX, headY, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Giant curved mandibles (kìm kẹp vàng)
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(headX + 6, headY - 6);
      ctx.quadraticCurveTo(headX + 20, headY - 14, headX + 22, headY - 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(headX + 6, headY + 6);
      ctx.quadraticCurveTo(headX + 20, headY + 14, headX + 22, headY + 4);
      ctx.stroke();

      // Glowing crimson multi-eyes
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(headX + 6, headY - 4, 3, 0, Math.PI * 2);
      ctx.arc(headX + 6, headY + 4, 3, 0, Math.PI * 2);
      ctx.arc(headX + 2, headY - 7, 2, 0, Math.PI * 2);
      ctx.arc(headX + 2, headY + 7, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Elite Bear Beast (Hùng Thú Vương [Tinh Anh]) — armored shoulders, massive body, '王' forehead rune, gold claws
      // Massive armored torso
      ctx.fillStyle = isHurt ? '#ffffff' : '#3b1d0a';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d9b45a';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Bronze-gold shoulder armor plates
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.ellipse(-4, -this.radius * 0.72, 14, 8, -0.3, 0, Math.PI * 2);
      ctx.ellipse(-4, this.radius * 0.72, 14, 8, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Round bear ears
      ctx.fillStyle = '#291305';
      ctx.beginPath();
      ctx.arc(8, -18, 7, 0, Math.PI * 2);
      ctx.arc(8, 18, 7, 0, Math.PI * 2);
      ctx.fill();

      // Heavy golden claws
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(this.radius * 0.82, -14 + sway * 0.4, 7, 0, Math.PI * 2);
      ctx.arc(this.radius * 0.82, 14 - sway * 0.4, 7, 0, Math.PI * 2);
      ctx.fill();

      // Forehead King Rune (王) & fierce crimson eyes
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 12px serif';
      ctx.textAlign = 'center';
      ctx.fillText('王', 10, 4);

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(this.radius * 0.55, -7, 3.2, 0, Math.PI * 2);
      ctx.arc(this.radius * 0.55, 7, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Health bar above monster (matching cotienlo.com's wood/brass bordered HP bars)
    const barWidth = Math.max(40, this.radius * 2.2);
    const barHeight = 5;
    const hpRatio = Math.max(0, this.hp / this.maxHp);
    const barX = sp.x - barWidth / 2;
    const barY = sp.y - this.radius - 14;

    ctx.save();
    ctx.fillStyle = 'rgba(16, 12, 8, 0.82)';
    ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

    ctx.fillStyle = this.type === 'elite_bear' ? '#d9a84e' : '#c0392b';
    ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
    ctx.strokeStyle = this.type === 'elite_bear' ? '#f3d27a' : '#6e5233';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

    // Outlined Name tag
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(10, 8, 6, 0.95)';
    ctx.lineWidth = 3;
    ctx.strokeText(this.name, sp.x, barY - 5);
    ctx.fillStyle = this.type === 'elite_bear' ? '#f6d878' : '#e8dfc5';
    ctx.fillText(this.name, sp.x, barY - 5);
    ctx.restore();
  }
}

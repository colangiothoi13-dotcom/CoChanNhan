import { Camera } from '../engine/Camera';
import { GameMap } from '../engine/Map';
import { ParticleSystem } from '../engine/ParticleSystem';
import { SoundEngine } from '../engine/SoundEngine';
import { GU_COMBAT_STATS, type GuCombatStats } from '../systems/GuSystem';

export type RealmRank =
  | 'Nhất Chuyển Sơ Giai'
  | 'Nhất Chuyển Trung Giai'
  | 'Nhất Chuyển Cao Giai'
  | 'Nhất Chuyển Đỉnh Phong'
  | 'Nhị Chuyển Sơ Giai';

const REALM_STATS: Record<RealmRank, { hp: number; mp: number; attack: number; defense: number; primevalLevel: number }> = {
  'Nhất Chuyển Sơ Giai': { hp: 100, mp: 100, attack: 25, defense: 0, primevalLevel: 1 },
  'Nhất Chuyển Trung Giai': { hp: 120, mp: 120, attack: 28, defense: 3, primevalLevel: 1 },
  'Nhất Chuyển Cao Giai': { hp: 140, mp: 140, attack: 32, defense: 6, primevalLevel: 1 },
  'Nhất Chuyển Đỉnh Phong': { hp: 160, mp: 160, attack: 38, defense: 10, primevalLevel: 1 },
  'Nhị Chuyển Sơ Giai': { hp: 200, mp: 200, attack: 48, defense: 18, primevalLevel: 2 },
};

export class Cultivator {
  public displayName = 'Cổ Sư Cổ Nguyệt';
  public displayRealm: string | null = null;
  public x: number = 1200;
  public y: number = 1100;
  public radius: number = 22;
  public facingAngle: number = 0; // in radians
  public baseSpeed: number = 160;

  // Stats
  public realm: RealmRank = 'Nhất Chuyển Sơ Giai';
  public maxHp: number = 100;
  public hp: number = 100;
  public maxMp: number = 100;
  public mp: number = 100;
  public maxStamina: number = 100;
  public stamina: number = 100;
  public primevalLevel: number = 1;
  private realmDefense: number = 0;
  private passiveGuDefense: number = 0;
  public baseAttack: number = 25;

  public get baseDefense(): number { return this.realmDefense; }
  public get guDefense(): number { return this.passiveGuDefense; }
  public get permanentDefense(): number { return this.realmDefense + this.passiveGuDefense; }
  // Compatibility for callers that formerly assigned total flat defense.
  public set permanentDefense(total: number) { this.syncGuDefense(total - this.realmDefense); }
  public syncGuDefense(bonus: number): void {
    this.passiveGuDefense = Number.isFinite(bonus) ? Math.max(0, bonus) : 0;
  }
  public get attackDamage(): number { return this.baseAttack + (this.boarBuffDuration > 0 ? 12 : 0); }

  // Cooldown timers (in seconds)
  public cdMoonlight: number = 0;
  public cdMoonbeam: number = 0;
  public cdBronze: number = 0;
  public cdBoar: number = 0;
  public cdHeal: number = 0;
  public cdDash: number = 0;
  public cdAttack: number = 0;

  // Max cooldown constants
  public readonly MAX_CD_MOONLIGHT = GU_COMBAT_STATS.moonlight.cooldown;
  public readonly MAX_CD_BRONZE = GU_COMBAT_STATS.bronze.cooldown;
  public readonly MAX_CD_BOAR = GU_COMBAT_STATS.boar.cooldown;
  public readonly MAX_CD_HEAL = GU_COMBAT_STATS.heal.cooldown;
  public readonly MAX_CD_DASH = 1.5;
  public moonlightCooldownDuration: number = this.MAX_CD_MOONLIGHT;
  public bronzeCooldownDuration: number = this.MAX_CD_BRONZE;
  public boarCooldownDuration: number = this.MAX_CD_BOAR;
  public healCooldownDuration: number = this.MAX_CD_HEAL;

  // Active Buffs
  public shieldDuration: number = 0; // Thanh Đồng Giáp active timer
  public boarBuffDuration: number = 0; // Bạch Trư Cổ active timer
  public healDuration: number = 0; // Thảo Hoàn Cổ active timer

  // Practice-only Immortal Gu visual. Real unique assets belong to the world server.
  public hasImmortalGu: boolean = false;
  public immortalGuName: string = '';
  public daoResonancePulse: number = 0;
  public originTitle: string = 'Đệ tử chi thứ Cổ Nguyệt';
  public originMpBonus: number = 0;

  // Dash state
  public isDashing: boolean = false;
  private dashTime: number = 0;
  private dashVx: number = 0;
  private dashVy: number = 0;

  // Animation walk cycle
  private walkTime: number = 0;

  constructor() {}

  public update(dt: number, moveInput: { x: number; y: number; length: number }, map: GameMap, particles: ParticleSystem) {
    if (this.hp <= 0) return;
    // 1. Cooldown decay
    if (this.cdMoonlight > 0) this.cdMoonlight = Math.max(0, this.cdMoonlight - dt);
    if (this.cdBronze > 0) this.cdBronze = Math.max(0, this.cdBronze - dt);
    if (this.cdBoar > 0) this.cdBoar = Math.max(0, this.cdBoar - dt);
    if (this.cdHeal > 0) this.cdHeal = Math.max(0, this.cdHeal - dt);
    if (this.cdDash > 0) this.cdDash = Math.max(0, this.cdDash - dt);
    if (this.cdAttack > 0) this.cdAttack = Math.max(0, this.cdAttack - dt);

    // 2. Buff duration decay
    if (this.shieldDuration > 0) this.shieldDuration = Math.max(0, this.shieldDuration - dt);
    if (this.boarBuffDuration > 0) this.boarBuffDuration = Math.max(0, this.boarBuffDuration - dt);
    if (this.healDuration > 0) {
      const healingTime = Math.min(dt, this.healDuration);
      this.healDuration = Math.max(0, this.healDuration - dt);
      // Continuous healing
      this.hp = Math.min(this.maxHp, this.hp + 15 * healingTime);
      particles.emitHealAura(this.x, this.y);
    }

    // 3. Natural MP and Stamina Regen
    this.mp = Math.min(this.maxMp, this.mp + 4 * dt); // Chân nguyên tự phục hồi
    this.stamina = Math.min(this.maxStamina, this.stamina + 12 * dt);

    // Dao Mark Resonance (Đạo Ngân Ba Động) for Mortals (< Lục Chuyển)
    if (this.hasImmortalGu) {
      const isMortal = !this.realm.includes('Lục Chuyển') && !this.realm.includes('Thất Chuyển') && !this.realm.includes('Bát Chuyển') && !this.realm.includes('Cửu Chuyển');
      if (isMortal) {
        this.daoResonancePulse = (this.daoResonancePulse + dt * 2.5) % (Math.PI * 2);
      } else {
        this.daoResonancePulse = 0;
      }
    }

    // 4. Movement handling
    if (this.isDashing) {
      this.dashTime -= dt;
      const nextX = this.x + this.dashVx * dt;
      const nextY = this.y + this.dashVy * dt;

      if (!map.checkCollision(nextX, this.y, this.radius)) this.x = nextX;
      if (!map.checkCollision(this.x, nextY, this.radius)) this.y = nextY;
      particles.emitDashDust(this.x, this.y);

      if (this.dashTime <= 0) {
        this.isDashing = false;
      }
    } else if (moveInput.length > 0.05) {
      // Calculate speed (boosted by White Boar Gu)
      const currentSpeed = this.boarBuffDuration > 0 ? this.baseSpeed * 1.35 : this.baseSpeed;
      const intensity = Math.min(1, moveInput.length);
      const vx = moveInput.x * currentSpeed * intensity;
      const vy = moveInput.y * currentSpeed * intensity;

      this.facingAngle = Math.atan2(moveInput.y, moveInput.x);
      this.walkTime += dt * 10;

      const nextX = this.x + vx * dt;
      const nextY = this.y + vy * dt;

      // Axis independent collision for smooth sliding along walls
      if (!map.checkCollision(nextX, this.y, this.radius)) {
        this.x = nextX;
      }
      if (!map.checkCollision(this.x, nextY, this.radius)) {
        this.y = nextY;
      }
    }
  }

  public advanceRealm(newRealm: RealmRank): void {
    const stats = REALM_STATS[newRealm];
    this.realm = newRealm;
    this.maxHp = stats.hp;
    this.maxMp = stats.mp + this.originMpBonus;
    this.baseAttack = stats.attack;
    this.realmDefense = stats.defense;
    this.primevalLevel = stats.primevalLevel;
    this.hp = this.maxHp;
    this.mp = this.maxMp;
  }

  // Dash ability
  public dash(sound: SoundEngine): boolean {
    if (this.cdDash > 0) return false;
    if (this.stamina < 30) return false;

    this.stamina -= 30;
    this.cdDash = this.MAX_CD_DASH;
    this.isDashing = true;
    this.dashTime = 0.22; // 220ms dash
    const dashSpeed = 480;
    this.dashVx = Math.cos(this.facingAngle) * dashSpeed;
    this.dashVy = Math.sin(this.facingAngle) * dashSpeed;

    sound.playDash();
    return true;
  }

  // Bronze Skin Gu active shield
  public castBronzeShield(sound: SoundEngine, gu: GuCombatStats = GU_COMBAT_STATS.bronze): boolean {
    if (this.cdBronze > 0 || this.mp < gu.mpCost) return false;
    this.mp -= gu.mpCost;
    this.cdBronze = this.bronzeCooldownDuration = gu.cooldown;
    this.shieldDuration = 5.0; // 5 seconds of 55% damage reduction
    sound.playBronzeShield();
    return true;
  }

  // White Boar Gu strength buff
  public castBoarBuff(sound: SoundEngine, gu: GuCombatStats = GU_COMBAT_STATS.boar): boolean {
    if (this.cdBoar > 0 || this.mp < gu.mpCost) return false;
    this.mp -= gu.mpCost;
    this.cdBoar = this.boarCooldownDuration = gu.cooldown;
    this.boarBuffDuration = 6.0; // 6 seconds speed & attack boost
    sound.playBoarBuff();
    return true;
  }

  // Grass Herbal Gu healing
  public castHeal(sound: SoundEngine, gu: GuCombatStats = GU_COMBAT_STATS.heal): boolean {
    if (this.cdHeal > 0 || this.mp < gu.mpCost) return false;
    this.mp -= gu.mpCost;
    this.cdHeal = this.healCooldownDuration = gu.cooldown;
    this.healDuration = 3.0; // Heal over 3 seconds
    sound.playHeal();
    return true;
  }

  public takeDamage(amount: number, particles: ParticleSystem): number {
    // Realm armor and passive Gu armor add first; the active shield reduces the remainder.
    let finalDmg = Math.max(0, amount - this.permanentDefense);
    if (this.shieldDuration > 0) {
      finalDmg = Math.round(finalDmg * 0.45); // 55% reduction
      particles.emitHitSparks(this.x, this.y, '#2a9d8f');
    }
    this.hp = Math.max(0, this.hp - finalDmg);
    particles.addDamageText(this.x, this.y, `-${finalDmg}`, '#ef233c', 18);
    return finalDmg;
  }

  public render(ctx: CanvasRenderingContext2D, camera: Camera) {
    const sp = camera.worldToScreen(this.x, this.y);
    const bob = Math.sin(this.walkTime * 1.4) * 2;
    const stride = Math.sin(this.walkTime) * 3.5;
    const facingLeft = Math.cos(this.facingAngle) < -0.15;
    const dir = facingLeft ? -1 : 1;

    ctx.save();

    // 1. Ground shadow under cultivator
    ctx.beginPath();
    ctx.ellipse(sp.x, sp.y + 18, this.radius * 0.85, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    ctx.fill();

    // 2. Draw Boar Buff Golden Strength Formation if active
    if (this.boarBuffDuration > 0) {
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y + 16, this.radius + 10, 12, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(242, 200, 96, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(242, 200, 96, 0.14)';
      ctx.fill();
    }

    // 3. Draw Bronze Shield Hexagonal Barrier if active
    if (this.shieldDuration > 0) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + this.shieldDuration * 1.5;
        const hx = sp.x + Math.cos(a) * (this.radius + 13);
        const hy = sp.y - 2 + Math.sin(a) * (this.radius + 13);
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(86, 212, 184, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(58, 165, 138, 0.16)';
      ctx.fill();
    }

    // 0. Dao Mark Resonance Shockwaves (Đạo Ngân Ba Động) for Mortals possessing an Immortal Gu
    if (this.hasImmortalGu && this.daoResonancePulse > 0) {
      const ringRadius = 22 + (this.daoResonancePulse * 14);
      ctx.save();
      ctx.strokeStyle = 'rgba(217, 180, 90, 0.75)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(52, 211, 153, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, ringRadius * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 4. 2.5D Chibi Xianxia Daoist Sprite (like cotienlo.com)
    ctx.translate(sp.x, sp.y + bob);

    // 4a. Spirit Sword slung diagonally across the back
    ctx.save();
    ctx.rotate(dir * 0.55);
    ctx.fillStyle = '#5c4028'; // Scabbard
    ctx.fillRect(-3, -26, 6, 36);
    ctx.strokeStyle = '#d9b45a'; // Brass scabbard fittings
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-3, -26, 6, 36);
    // Sword hilt & pommel above shoulder
    ctx.fillStyle = '#d9b45a';
    ctx.fillRect(-6, -29, 12, 3);
    ctx.fillStyle = '#8e2a20';
    ctx.fillRect(-2, -36, 4, 7);
    ctx.restore();

    // 4b. Stepping boots
    ctx.fillStyle = '#1b1612';
    ctx.beginPath();
    ctx.ellipse(-6 + stride * 0.5, 14 + stride * 0.4, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.ellipse(6 - stride * 0.5, 14 - stride * 0.4, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4c. Layered Daoist Robe (Áo Bào Cổ Nguyệt)
    ctx.fillStyle = '#1b2634';
    ctx.beginPath();
    ctx.moveTo(-11, -4);
    ctx.lineTo(11, -4);
    ctx.lineTo(14, 13);
    ctx.lineTo(-14, 13);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#c8a050';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Jade inner robe collar (V-neck crossover)
    ctx.strokeStyle = '#56d4b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.lineTo(0, 4);
    ctx.lineTo(6, -4);
    ctx.stroke();

    // Crimson & gold waist sash (Đai Lưng Cổ Sư)
    ctx.fillStyle = '#8e2a20';
    ctx.fillRect(-12, 3, 24, 4);
    ctx.fillStyle = '#d9b45a';
    ctx.fillRect(-3, 2.5, 6, 5);

    // 4d. Chibi Head & Face
    ctx.fillStyle = '#f2d2b6';
    ctx.beginPath();
    ctx.arc(0, -13, 10.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a1b10';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Dark flowing Daoist hair & side locks
    ctx.fillStyle = '#151922';
    ctx.beginPath();
    ctx.arc(0, -15, 11, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    // Hair topknot bun (Búi Tóc)
    ctx.beginPath();
    ctx.arc(0, -26, 5, 0, Math.PI * 2);
    ctx.fill();
    // Golden crown / hairpin (Trâm Cài Đồng Vàng)
    ctx.fillStyle = '#d9b45a';
    ctx.fillRect(-5, -24, 10, 2.5);
    //Jade headband across forehead
    ctx.fillStyle = '#3aa58a';
    ctx.fillRect(-10, -18, 20, 2.5);

    // Expressive eyes looking toward facing direction
    const eyeShift = dir * 2;
    ctx.fillStyle = '#1b140e';
    ctx.beginPath();
    ctx.arc(-3.5 + eyeShift, -12, 1.6, 0, Math.PI * 2);
    ctx.arc(3.5 + eyeShift, -12, 1.6, 0, Math.PI * 2);
    ctx.fill();

    // 4e. Aiming Spirit Orb / Hand Qi towards facingAngle
    const handX = Math.cos(this.facingAngle) * 16;
    const handY = Math.sin(this.facingAngle) * 12 + 2;
    ctx.fillStyle = '#8ef0dc';
    ctx.beginPath();
    ctx.arc(handX, handY, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d9b45a';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.restore();

    // 5. Overhead HP Bar & Nameplate (matching cotienlo.com's in-world character HUD)
    const barW = 46;
    const barH = 5;
    const barX = sp.x - barW / 2;
    const barY = sp.y - 44;
    const hpRatio = Math.max(0, Math.min(1, this.hp / this.maxHp));

    ctx.save();
    ctx.fillStyle = 'rgba(18, 14, 10, 0.85)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(barX, barY, barW * hpRatio, barH);
    ctx.strokeStyle = '#8c6d42';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX - 1, barY - 1, barW + 2, barH + 2);

    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(12, 10, 8, 0.95)';
    ctx.lineWidth = 3;
    ctx.strokeText(this.displayName, sp.x, barY - 5);
    ctx.fillStyle = '#f6e7c8';
    ctx.fillText(this.displayName, sp.x, barY - 5);

    if (this.hasImmortalGu) {
      ctx.font = 'bold 9.5px "Segoe UI", sans-serif';
      ctx.strokeStyle = 'rgba(10, 8, 5, 0.95)';
      ctx.lineWidth = 2.5;
      ctx.strokeText(`✨ [Mô phỏng Tiên Cổ: ${this.immortalGuName}]`, sp.x, barY - 18);
      ctx.fillStyle = '#fde68a';
      ctx.fillText(`✨ [Mô phỏng Tiên Cổ: ${this.immortalGuName}]`, sp.x, barY - 18);
    }
    ctx.restore();
  }
}

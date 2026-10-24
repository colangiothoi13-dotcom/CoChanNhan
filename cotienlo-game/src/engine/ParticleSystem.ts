import { Camera } from './Camera';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
  shape?: 'circle' | 'spark' | 'ring';
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  vy: number;
  fontSize: number;
  life: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];

  public update(dt: number) {
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.alpha -= p.decay * dt * 60;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Update floating damage texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy * dt * 60;
      ft.life -= dt;
      if (ft.life <= 0.3) {
        ft.alpha = Math.max(0, ft.life / 0.3);
      }
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  public emitMoonlightTrail(x: number, y: number) {
    for (let i = 0; i < 2; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 1,
        vy: (Math.random() - 0.5) * 1,
        radius: 3 + Math.random() * 3,
        color: '#00b4d8',
        alpha: 0.8,
        decay: 0.04,
      });
    }
  }

  public emitHitSparks(x: number, y: number, color: string = '#ffd700') {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 2,
        color,
        alpha: 1,
        decay: 0.05,
        shape: 'spark',
      });
    }
  }

  public emitDashDust(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 1.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 4 + Math.random() * 4,
        color: '#e9c46a',
        alpha: 0.5,
        decay: 0.03,
      });
    }
  }

  public emitHealAura(x: number, y: number) {
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 30,
        y: y + 20,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -1.5 - Math.random() * 1.5,
        radius: 3 + Math.random() * 2,
        color: '#3fb950',
        alpha: 0.9,
        decay: 0.03,
      });
    }
  }

  public addDamageText(x: number, y: number, text: string, color: string = '#ef233c', fontSize: number = 16) {
    this.floatingTexts.push({
      x: x + (Math.random() - 0.5) * 16,
      y: y - 10,
      text,
      color,
      alpha: 1,
      vy: -1.2,
      fontSize,
      life: 0.8,
    });
  }

  public render(ctx: CanvasRenderingContext2D, camera: Camera) {
    ctx.save();
    // Render particles
    for (const p of this.particles) {
      const sp = camera.worldToScreen(p.x, p.y);
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Render floating text numbers
    for (const ft of this.floatingTexts) {
      const sp = camera.worldToScreen(ft.x, ft.y);
      ctx.globalAlpha = ft.alpha;
      ctx.font = `bold ${ft.fontSize}px 'Noto Serif', serif`;
      ctx.fillStyle = ft.color;
      ctx.textAlign = 'center';
      // Outline for readability
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(ft.text, sp.x, sp.y);
      ctx.fillText(ft.text, sp.x, sp.y);
    }
    ctx.restore();
  }
}

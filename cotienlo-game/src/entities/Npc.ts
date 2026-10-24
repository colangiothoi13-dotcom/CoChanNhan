import { Camera } from '../engine/Camera';

export class Npc {
  public x: number = 1200;
  public y: number = 920;
  public radius: number = 24;
  public name: string = 'Gia Lão Học Đường';
  public title: string = 'Cổ Nguyệt Dược Cơ';
  private animTime: number = 0;

  constructor(x = 1200, y = 920) {
    this.x = x;
    this.y = y;
  }

  public update(dt: number): void {
    this.animTime += dt * 3;
  }

  public isNear(playerX: number, playerY: number, range = 85): boolean {
    return Math.hypot(playerX - this.x, playerY - this.y) <= range;
  }

  public render(ctx: CanvasRenderingContext2D, camera: Camera, isNearby: boolean): void {
    const sp = camera.worldToScreen(this.x, this.y);
    const floatBob = Math.sin(this.animTime) * 2;

    ctx.save();
    // 1. Gentle Lotus Ground Aura
    ctx.beginPath();
    ctx.ellipse(sp.x, sp.y + 16, this.radius * 1.1, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(217, 180, 90, 0.22)';
    ctx.fill();
    ctx.strokeStyle = '#d9b45a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.translate(sp.x, sp.y + floatBob);

    // 2. Daoist Sage Robe (Purple & Gold)
    ctx.fillStyle = '#2c1b3d';
    ctx.beginPath();
    ctx.moveTo(-11, -4);
    ctx.lineTo(11, -4);
    ctx.lineTo(15, 14);
    ctx.lineTo(-15, 14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d9b45a';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Golden collar & sash
    ctx.strokeStyle = '#f3d27a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.lineTo(0, 4);
    ctx.lineTo(6, -4);
    ctx.stroke();
    ctx.fillStyle = '#8e2a20';
    ctx.fillRect(-12, 3, 24, 4);

    // 3. Wooden Elder Staff with glowing spirit gourd
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(13, -24);
    ctx.lineTo(13, 16);
    ctx.stroke();
    // Spirit gourd
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.arc(13, -20, 5, 0, Math.PI * 2);
    ctx.arc(13, -13, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 4. Sage Head & Long White Beard
    ctx.fillStyle = '#fce7d2';
    ctx.beginPath();
    ctx.arc(0, -13, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3a2618';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Long flowing white beard
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(-6, -7);
    ctx.quadraticCurveTo(0, 10, 0, 16);
    ctx.quadraticCurveTo(0, 10, 6, -7);
    ctx.closePath();
    ctx.fill();

    // White sage eyebrows & serene eyes
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-7, -15);
    ctx.lineTo(-2, -14);
    ctx.moveTo(2, -14);
    ctx.lineTo(7, -15);
    ctx.stroke();

    // Topknot hair & golden hairpin
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(0, -25, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d9b45a';
    ctx.fillRect(-5, -23, 10, 2);

    ctx.restore();

    // 5. Overhead Nameplate
    const barY = sp.y - 42;
    ctx.save();
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(10, 8, 6, 0.95)';
    ctx.lineWidth = 3;
    ctx.strokeText(`[NPC] ${this.name}`, sp.x, barY);
    ctx.fillStyle = '#f3d27a';
    ctx.fillText(`[NPC] ${this.name}`, sp.x, barY);

    // 6. Interaction Bubble if nearby
    if (isNearby) {
      const bubbleY = barY - 18 + Math.sin(this.animTime * 2) * 2;
      ctx.fillStyle = 'rgba(26, 18, 11, 0.9)';
      ctx.strokeStyle = '#e2be75';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(sp.x - 42, bubbleY - 12, 84, 20, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.fillText('💬 [F] Đàm đạo', sp.x, bubbleY + 2);
    }
    ctx.restore();
  }
}


import { Camera } from '../engine/Camera';
import { Cultivator } from './Cultivator';
import { SoundEngine } from '../engine/SoundEngine';
import { SPRITE_ATLAS_MAP } from '../data/wikiData';

export type DropItemType = 'stone' | 'herb' | 'wild_gu';

let sharedAtlasImage: HTMLImageElement | null = null;
function getAtlasImage(): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  if (!sharedAtlasImage) {
    sharedAtlasImage = new Image();
    sharedAtlasImage.src = './assets/visual/o_tui_atlas.png';
  }
  return sharedAtlasImage.complete && sharedAtlasImage.naturalWidth > 0 ? sharedAtlasImage : null;
}

export class DropItem {
  public x: number;
  public y: number;
  public type: DropItemType;
  public value: number;
  public radius: number = 14;
  public floatOffset: number = 0;
  private lifeTime: number = 0;
  public isCollected: boolean = false;

  constructor(x: number, y: number, type: DropItemType, value: number = 1) {
    this.x = x + (Math.random() - 0.5) * 20;
    this.y = y + (Math.random() - 0.5) * 20;
    this.type = type;
    this.value = value;
  }

  public update(dt: number, player: Cultivator, sound: SoundEngine): boolean {
    this.lifeTime += dt * 4;
    this.floatOffset = Math.sin(this.lifeTime) * 4;

    // Proximity check for magnetic collection
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);

    // Magnetic pull when player is within 100px
    if (dist < 110) {
      const speed = 280 * dt;
      this.x += (dx / dist) * speed;
      this.y += (dy / dist) * speed;

      // Collect when touching
      if (dist < player.radius + this.radius) {
        this.isCollected = true;
        sound.playPickup();
        return true;
      }
    }
    return false;
  }

  public render(ctx: CanvasRenderingContext2D, camera: Camera) {
    const sp = camera.worldToScreen(this.x, this.y + this.floatOffset);

    ctx.save();
    // Item ground shadow
    ctx.beginPath();
    ctx.ellipse(sp.x, sp.y + 12 - this.floatOffset, 10, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();

    ctx.translate(sp.x, sp.y);

    if (this.type === 'stone') {
      // Faceted Primeval Stone Crystal (Nguyên Thạch)
      ctx.shadowColor = '#f4d35e';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#e9c46a';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(8, -2);
      ctx.lineTo(5, 9);
      ctx.lineTo(-5, 9);
      ctx.lineTo(-8, -2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff3b0';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Inner crystal facet
      ctx.fillStyle = '#fff8d6';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(4, -1);
      ctx.lineTo(0, 5);
      ctx.lineTo(-4, -1);
      ctx.closePath();
      ctx.fill();
    } else if (this.type === 'herb') {
      // Spiritual Herb Sprig (Thanh Trúc Diệp / Linh Thảo)
      ctx.shadowColor = '#52b788';
      ctx.shadowBlur = 9;
      ctx.strokeStyle = '#74c69d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 9);
      ctx.quadraticCurveTo(1, 0, 0, -8);
      ctx.stroke();

      ctx.fillStyle = '#40916c';
      ctx.beginPath();
      ctx.ellipse(-5, -1, 6, 3, -0.5, 0, Math.PI * 2);
      ctx.ellipse(5, -2, 6, 3, 0.5, 0, Math.PI * 2);
      ctx.ellipse(0, -7, 4, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Wild Gu Spirit Orb (Cổ Trùng Hoang Dã)
      ctx.shadowColor = '#48cae4';
      ctx.shadowBlur = 12;

      // Golden seal ring
      ctx.strokeStyle = '#d9b45a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.stroke();

      // Glowing Gu core
      ctx.fillStyle = '#90e0ef';
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const atlasImg = getAtlasImage();
    if (atlasImg) {
      const spriteKey = this.type === 'stone' ? 'item_nguyen_thach' : this.type === 'herb' ? 'item_thao_duoc' : 'gu_nguyet_quang';
      const tuple = SPRITE_ATLAS_MAP[spriteKey];
      if (tuple && tuple[0] === 0) {
        const [, sx, sy] = tuple;
        ctx.drawImage(atlasImg, sx + 3, sy + 3, 34, 34, -12, -12, 24, 24);
      }
    }
    ctx.restore();
  }
}

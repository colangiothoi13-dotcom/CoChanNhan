import { Camera } from './Camera';

export interface Obstacle {
  x: number;
  y: number;
  radius: number;
  type: 'rock' | 'pillar' | 'bamboo';
}

export class GameMap {
  public static readonly SANCTUARY_X = 1200;
  public static readonly SANCTUARY_Y = 960;
  public static readonly SANCTUARY_RADIUS = 260;

  public width: number = 2400;
  public height: number = 2400;
  public obstacles: Obstacle[] = [];
  public dayTime: number = 0.25; // 0..1 (0: midnight, 0.25: morning, 0.5: noon, 0.75: dusk)
  public cataclysmActive: boolean = false;
  private cataclysmTimer: number = 0;
  private timeSpeed: number = 0.005; // completes a day in ~200s
  private elapsedTime: number = 0;

  constructor() {
    this.generateObstacles();
  }

  private generateObstacles() {
    // Generate scattered ancient pillars, boulders, and bamboo groves
    const seedPositions: Obstacle[] = [
      // Safe village area center
      { x: 1000, y: 1000, radius: 28, type: 'pillar' },
      { x: 1400, y: 1000, radius: 28, type: 'pillar' },
      { x: 1200, y: 800, radius: 35, type: 'rock' },
      // Bamboo forest zones
      { x: 600, y: 600, radius: 20, type: 'bamboo' },
      { x: 650, y: 640, radius: 22, type: 'bamboo' },
      { x: 720, y: 580, radius: 18, type: 'bamboo' },
      { x: 550, y: 700, radius: 24, type: 'bamboo' },
      { x: 1700, y: 700, radius: 30, type: 'rock' },
      { x: 1850, y: 650, radius: 25, type: 'rock' },
      { x: 1600, y: 1500, radius: 20, type: 'bamboo' },
      { x: 1680, y: 1550, radius: 22, type: 'bamboo' },
      { x: 1750, y: 1480, radius: 24, type: 'bamboo' },
      { x: 800, y: 1700, radius: 36, type: 'rock' },
      { x: 500, y: 1400, radius: 28, type: 'pillar' },
      { x: 1900, y: 1800, radius: 40, type: 'rock' },
      { x: 400, y: 900, radius: 22, type: 'bamboo' },
      { x: 450, y: 950, radius: 20, type: 'bamboo' },
    ];
    this.obstacles = seedPositions;
  }

  public update(dt: number) {
    this.dayTime = (this.dayTime + dt * this.timeSpeed) % 1.0;
    this.elapsedTime += dt;

    // Environmental Cataclysm (Địa Chấn / Biến Động Địa Mạch Nam Cương)
    this.cataclysmTimer += dt;
    if (!this.cataclysmActive && this.cataclysmTimer >= 120) {
      this.cataclysmActive = true;
      this.cataclysmTimer = 0;
    } else if (this.cataclysmActive && this.cataclysmTimer >= 8) {
      this.cataclysmActive = false;
      this.cataclysmTimer = 0;
    }
  }

  public checkCollision(x: number, y: number, radius: number): boolean {
    // World border collision
    if (x - radius < 40 || x + radius > this.width - 40) return true;
    if (y - radius < 40 || y + radius > this.height - 40) return true;

    // Obstacle collision
    for (const obs of this.obstacles) {
      const dist = Math.hypot(x - obs.x, y - obs.y);
      if (dist < radius + obs.radius) {
        return true;
      }
    }
    return false;
  }

  public isInsideSanctuary(x: number, y: number): boolean {
    return Math.hypot(x - GameMap.SANCTUARY_X, y - GameMap.SANCTUARY_Y) <= GameMap.SANCTUARY_RADIUS;
  }

  public render(ctx: CanvasRenderingContext2D, camera: Camera) {
    const startX = Math.floor(camera.x / 120) * 120;
    const startY = Math.floor(camera.y / 120) * 120;
    const endX = camera.x + camera.viewportWidth + 120;
    const endY = camera.y + camera.viewportHeight + 120;

    // 1. Draw base terrain tiles (Cổ Nguyệt Sơn Trại flagstones & Thanh Mao bamboo forest)
    for (let x = startX; x < endX; x += 120) {
      for (let y = startY; y < endY; y += 120) {
        const screenPos = camera.worldToScreen(x, y);
        const tileHash = Math.abs(((x * 73856093) ^ (y * 19349663)) % 100);
        const isVillagePlaza = x >= 960 && x <= 1320 && y >= 840 && y <= 1200;

        if (isVillagePlaza) {
          // Ancient stone courtyard flagstones (like cotienlo.com's weathered stone tiles)
          ctx.fillStyle = tileHash > 50 ? '#2b2d26' : '#252720';
          ctx.fillRect(screenPos.x, screenPos.y, 120, 120);

          // Flagstone sub-blocks (60x60) with dark mortar and warm stone bevel
          ctx.strokeStyle = 'rgba(14, 15, 12, 0.55)';
          ctx.lineWidth = 2;
          ctx.strokeRect(screenPos.x + 1, screenPos.y + 1, 58, 58);
          ctx.strokeRect(screenPos.x + 61, screenPos.y + 1, 58, 58);
          ctx.strokeRect(screenPos.x + 1, screenPos.y + 61, 58, 58);
          ctx.strokeRect(screenPos.x + 61, screenPos.y + 61, 58, 58);

          ctx.strokeStyle = 'rgba(217, 180, 90, 0.08)';
          ctx.lineWidth = 1;
          ctx.strokeRect(screenPos.x + 2, screenPos.y + 2, 56, 56);

          // Moss in flagstone corners
          if (tileHash % 3 === 0) {
            ctx.fillStyle = 'rgba(45, 106, 79, 0.32)';
            ctx.beginPath();
            ctx.arc(screenPos.x + 60, screenPos.y + 60, 10, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          if (tileHash > 72) {
            ctx.fillStyle = '#18281d'; // Lush moss patch
          } else if (tileHash > 38) {
            ctx.fillStyle = '#142118'; // Bamboo forest turf
          } else {
            ctx.fillStyle = '#101a13'; // Deep mountain soil
          }
          ctx.fillRect(screenPos.x, screenPos.y, 120, 120);

          // Organic soil & grass details
          if (tileHash > 60) {
            ctx.fillStyle = 'rgba(56, 118, 82, 0.22)';
            ctx.beginPath();
            ctx.ellipse(screenPos.x + 48, screenPos.y + 54, 28, 16, 0.2, 0, Math.PI * 2);
            ctx.fill();
          }

          // Grass blades
          if (tileHash % 2 === 0) {
            const gx = screenPos.x + 24 + (tileHash % 65);
            const gy = screenPos.y + 28 + ((tileHash * 3) % 65);
            ctx.strokeStyle = '#2d6a4f';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(gx, gy);
            ctx.lineTo(gx - 4, gy - 9);
            ctx.moveTo(gx + 3, gy);
            ctx.lineTo(gx + 6, gy - 10);
            ctx.stroke();
          }

          // Glowing spirit flower (Linh Thảo)
          if (tileHash > 88) {
            const fx = screenPos.x + 76;
            const fy = screenPos.y + 42;
            ctx.fillStyle = 'rgba(120, 224, 194, 0.85)';
            ctx.beginPath();
            ctx.arc(fx, fy, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(217, 180, 90, 0.9)';
            ctx.beginPath();
            ctx.arc(fx, fy, 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // 1b. Tông Môn Hộ Thần Trận - Khu Vực An Toàn Quanh Gia Lão (1200, 960)
    const sanctuaryScreen = camera.worldToScreen(GameMap.SANCTUARY_X, GameMap.SANCTUARY_Y);
    if (
      sanctuaryScreen.x > -320 &&
      sanctuaryScreen.x < camera.viewportWidth + 320 &&
      sanctuaryScreen.y > -320 &&
      sanctuaryScreen.y < camera.viewportHeight + 320
    ) {
      ctx.save();
      ctx.translate(sanctuaryScreen.x, sanctuaryScreen.y);

      // Radiant emerald-gold protective aura floor
      const sancGrad = ctx.createRadialGradient(0, 0, 30, 0, 0, GameMap.SANCTUARY_RADIUS);
      sancGrad.addColorStop(0, 'rgba(52, 211, 153, 0.08)');
      sancGrad.addColorStop(0.65, 'rgba(16, 185, 129, 0.04)');
      sancGrad.addColorStop(0.92, 'rgba(217, 180, 90, 0.12)');
      sancGrad.addColorStop(1, 'rgba(217, 180, 90, 0)');
      ctx.fillStyle = sancGrad;
      ctx.beginPath();
      ctx.arc(0, 0, GameMap.SANCTUARY_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Outer rotating Bát Quái talisman ring
      const spin = this.elapsedTime * 0.25;
      ctx.strokeStyle = 'rgba(217, 180, 90, 0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.arc(0, 0, GameMap.SANCTUARY_RADIUS - 2, spin, spin + Math.PI * 2);
      ctx.stroke();

      // Inner counter-rotating emerald ward ring
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 14]);
      ctx.beginPath();
      ctx.arc(0, 0, GameMap.SANCTUARY_RADIUS - 12, -spin * 1.4, -spin * 1.4 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 8 Bagua nodes along the perimeter
      for (let i = 0; i < 8; i++) {
        const nodeAngle = spin + (Math.PI * 2 / 8) * i;
        const nx = Math.cos(nodeAngle) * (GameMap.SANCTUARY_RADIUS - 2);
        const ny = Math.sin(nodeAngle) * (GameMap.SANCTUARY_RADIUS - 2);
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(nx, ny, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Sanctuary label on the northern edge
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#6ee7b7';
      ctx.strokeStyle = 'rgba(10, 20, 15, 0.9)';
      ctx.lineWidth = 3;
      ctx.strokeText('🛡️ KHU VỰC AN TOÀN · TRỊ THƯƠNG & TRÁNH THÚ', 0, -GameMap.SANCTUARY_RADIUS - 8);
      ctx.fillText('🛡️ KHU VỰC AN TOÀN · TRỊ THƯƠNG & TRÁNH THÚ', 0, -GameMap.SANCTUARY_RADIUS - 8);

      ctx.restore();
    }

    // 1c. Ancient Crescent Formation Plaza at Village Center (1200, 1100) — Feature 01: Giấc Mơ Lặp Lại (Tế Đàn Khai Khiếu & Xuân Thu Thiền)
    const plazaCenter = camera.worldToScreen(1200, 1100);
    if (
      plazaCenter.x > -180 &&
      plazaCenter.x < camera.viewportWidth + 180 &&
      plazaCenter.y > -180 &&
      plazaCenter.y < camera.viewportHeight + 180
    ) {
      ctx.save();
      ctx.translate(plazaCenter.x, plazaCenter.y);

      // Outer carved stone ring
      ctx.beginPath();
      ctx.arc(0, 0, 118, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(32, 34, 27, 0.85)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(184, 150, 85, 0.35)';
      ctx.stroke();

      // Feature 01: Glowing Red Rebirth Magic Array (Trận Pháp Trùng Sinh Xuân Thu Thiền)
      const arrayTime = this.elapsedTime * 1.5;
      ctx.save();
      ctx.rotate(arrayTime * 0.15);
      ctx.beginPath();
      ctx.arc(0, 0, 84, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Concentric intersecting ritual circles
      for (let c = 0; c < 3; c++) {
        const ca = (Math.PI * 2 / 3) * c;
        ctx.beginPath();
        ctx.arc(Math.cos(ca) * 42, Math.sin(ca) * 42, 42, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.28)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();

      // Stone Tombstone / Stele (Bia Đá Cổ) on the left
      ctx.fillStyle = '#292524';
      ctx.fillRect(-85, -20, 18, 38);
      ctx.strokeStyle = '#78716c';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-85, -20, 18, 38);
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 9px serif';
      ctx.textAlign = 'center';
      ctx.fillText('古', -76, 2);

      // Center: Multi-tiered Pagoda Stone Altar / Brazier (Linh Phách Lô)
      // Base stone tier
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.arc(0, 8, 36, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Brazier structure with charcoal embers
      ctx.fillStyle = '#441c0a';
      ctx.beginPath();
      ctx.arc(0, -6, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // Glowing Golden Soul Core (Xuân Thu Thiền / Linh Phách Orb)
      const pulse = 1 + Math.sin(this.elapsedTime * 4) * 0.18;
      const orbGrad = ctx.createRadialGradient(0, -6, 3, 0, -6, 22 * pulse);
      orbGrad.addColorStop(0, '#fef08a');
      orbGrad.addColorStop(0.45, '#f59e0b');
      orbGrad.addColorStop(0.85, '#dc2626');
      orbGrad.addColorStop(1, 'rgba(220, 38, 38, 0)');
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.arc(0, -6, 22 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Roaring Flame tendrils rising into the air
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2;
      for (let f = 0; f < 5; f++) {
        const fa = (Math.PI * 2 / 5) * f + this.elapsedTime * 2;
        const fx = Math.cos(fa) * 16;
        const fy = -6 + Math.sin(fa) * 12;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo(fx * 1.3, fy - 18, fx * 0.4, fy - 30);
        ctx.stroke();
      }

      ctx.restore();
    }

    // 1c. Snow Mountain & Howling Wolf Monument (Feature 04: Thú Vương Tuyết Sơn) at (1950, 1850)
    const snowWolfCenter = camera.worldToScreen(1950, 1850);
    if (
      snowWolfCenter.x > -220 &&
      snowWolfCenter.x < camera.viewportWidth + 220 &&
      snowWolfCenter.y > -220 &&
      snowWolfCenter.y < camera.viewportHeight + 220
    ) {
      ctx.save();
      ctx.translate(snowWolfCenter.x, snowWolfCenter.y);

      // Snow & Ice field base
      ctx.beginPath();
      ctx.ellipse(0, 0, 160, 110, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(224, 242, 254, 0.22)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Wolf skull bones scattered on the snow
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(-60, 35, 7, 0, Math.PI * 2);
      ctx.arc(75, -25, 8, 0, Math.PI * 2);
      ctx.arc(-30, -50, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Giant Stone Wolf Monument (Tượng Cự Lang Hống Nguyệt)
      // Pedestal base
      ctx.fillStyle = '#334155';
      ctx.fillRect(-45, -30, 90, 40);
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.strokeRect(-45, -30, 90, 40);

      // Carved Howling Wolf Silhouette out of stone
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.moveTo(-35, -30);
      ctx.lineTo(-20, -75);
      ctx.lineTo(0, -95); // Wolf snout howling upward
      ctx.lineTo(20, -80); // Wolf ears
      ctx.lineTo(25, -65);
      ctx.lineTo(35, -30);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Glowing ice rune eye in the wolf statue
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(0, -82, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Title plaque
      ctx.fillStyle = '#f1f5f9';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TƯỢNG CỰ LANG', 0, -8);

      ctx.restore();
    }

    // 1d. Subterranean Mine Shaft / Hoa Tửu Cave (Feature 05: Phó Bản Thú Huyệt) at (550, 1900)
    const caveCenter = camera.worldToScreen(550, 1900);
    if (
      caveCenter.x > -200 &&
      caveCenter.x < camera.viewportWidth + 200 &&
      caveCenter.y > -200 &&
      caveCenter.y < camera.viewportHeight + 200
    ) {
      ctx.save();
      ctx.translate(caveCenter.x, caveCenter.y);

      // Dark slate dungeon floor
      ctx.beginPath();
      ctx.ellipse(0, 0, 150, 110, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(12, 10, 9, 0.75)';
      ctx.fill();
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Wooden mine support struts
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-80, -60);
      ctx.lineTo(-80, 50);
      ctx.moveTo(80, -60);
      ctx.lineTo(80, 50);
      ctx.moveTo(-85, -55);
      ctx.lineTo(85, -55);
      ctx.stroke();

      // Warm glowing wall lanterns (Đèn Dầu Hầm Mỏ)
      const lanternFlicker = Math.sin(this.elapsedTime * 6) * 3;
      const lanternGrad = ctx.createRadialGradient(-80, -20, 2, -80, -20, 28 + lanternFlicker);
      lanternGrad.addColorStop(0, '#fef08a');
      lanternGrad.addColorStop(0.4, 'rgba(245, 158, 11, 0.7)');
      lanternGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = lanternGrad;
      ctx.beginPath();
      ctx.arc(-80, -20, 28 + lanternFlicker, 0, Math.PI * 2);
      ctx.fill();

      // Plaque: Mật Đạo Hoa Tửu
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MẬT ĐẠO HOA TỬU', 0, 42);

      ctx.restore();
    }

    // 2. Draw Mountain Stream (Suối Cổ Nguyệt)
    ctx.save();
    const streamY = 1300;
    const screenStream = camera.worldToScreen(0, streamY);

    // Riverbank stone/mud edge
    ctx.beginPath();
    ctx.moveTo(screenStream.x, screenStream.y);
    for (let wx = 0; wx <= this.width; wx += 120) {
      const wy = streamY + Math.sin(wx * 0.004) * 60;
      const sp = camera.worldToScreen(wx, wy);
      ctx.lineTo(sp.x, sp.y);
    }
    ctx.lineWidth = 72;
    ctx.strokeStyle = 'rgba(26, 30, 22, 0.75)';
    ctx.stroke();

    // Deep jade stream water
    ctx.lineWidth = 54;
    ctx.strokeStyle = 'rgba(18, 108, 128, 0.42)';
    ctx.stroke();

    // Luminous cyan mid-stream current
    ctx.lineWidth = 30;
    ctx.strokeStyle = 'rgba(86, 204, 218, 0.38)';
    ctx.stroke();

    // Shimmering water ripples
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(214, 248, 252, 0.32)';
    for (let wx = 80; wx < this.width; wx += 160) {
      const wy = streamY + Math.sin(wx * 0.004) * 60;
      const sp = camera.worldToScreen(wx, wy);
      const drift = Math.sin(this.elapsedTime * 2.5 + wx * 0.02) * 8;
      ctx.beginPath();
      ctx.moveTo(sp.x - 16 + drift, sp.y - 4);
      ctx.quadraticCurveTo(sp.x + drift, sp.y - 9, sp.x + 16 + drift, sp.y - 4);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Draw Obstacles (Pillars, Rocks, Bamboo)
    for (const obs of this.obstacles) {
      const sp = camera.worldToScreen(obs.x, obs.y);
      if (
        sp.x + obs.radius + 40 < 0 ||
        sp.x - obs.radius - 40 > camera.viewportWidth ||
        sp.y + obs.radius + 70 < 0 ||
        sp.y - obs.radius - 70 > camera.viewportHeight
      ) {
        continue;
      }

      ctx.save();
      if (obs.type === 'rock') {
        // Ground Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.ellipse(sp.x + 2, sp.y + obs.radius * 0.65, obs.radius * 1.12, obs.radius * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();

        // Craggy Mountain Boulder
        const grad = ctx.createRadialGradient(sp.x - obs.radius * 0.3, sp.y - obs.radius * 0.35, 4, sp.x, sp.y, obs.radius);
        grad.addColorStop(0, '#5a655e');
        grad.addColorStop(0.65, '#353e39');
        grad.addColorStop(1, '#1d2420');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, obs.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#141916';
        ctx.stroke();

        // Moss cap on top of boulder
        ctx.fillStyle = 'rgba(58, 125, 88, 0.55)';
        ctx.beginPath();
        ctx.ellipse(sp.x - 4, sp.y - obs.radius * 0.35, obs.radius * 0.55, obs.radius * 0.28, -0.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (obs.type === 'pillar') {
        // Ancient Stone Stele / Boundary Pillar (Bia Đá Cổ Nguyệt)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y + obs.radius * 0.82, obs.radius * 1.25, obs.radius * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        const pw = obs.radius * 1.5;
        const ph = obs.radius * 2.15;
        const px = sp.x - pw / 2;
        const py = sp.y - ph * 0.78;

        // Stepped stone pedestal base
        ctx.fillStyle = '#38362e';
        ctx.fillRect(px - 5, sp.y + obs.radius * 0.25, pw + 10, 12);
        ctx.strokeStyle = '#1b1a15';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px - 5, sp.y + obs.radius * 0.25, pw + 10, 12);

        // Pillar shaft
        const pGrad = ctx.createLinearGradient(px, py, px + pw, py + ph);
        pGrad.addColorStop(0, '#4a473b');
        pGrad.addColorStop(0.5, '#333128');
        pGrad.addColorStop(1, '#22201a');
        ctx.fillStyle = pGrad;
        ctx.fillRect(px, py, pw, ph);

        // Carved brass/gold border
        ctx.strokeStyle = '#c8a050';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, pw - 4, ph - 4);

        // Pillar cap
        ctx.fillStyle = '#575243';
        ctx.fillRect(px - 4, py - 6, pw + 8, 8);

        // Glowing ancient seal rune
        ctx.fillStyle = '#f3d27a';
        ctx.font = 'bold 14px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('古', sp.x, sp.y - obs.radius * 0.45);
      } else if (obs.type === 'bamboo') {
        // Multi-stalk Jade Bamboo Cluster (Trúc Thanh Mao)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y + 12, 18, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        const stalks = [
          { dx: -6, dy: 2, h: 48, w: 5, color: '#2b6e4e' },
          { dx: 5, dy: 4, h: 44, w: 4.5, color: '#235c40' },
          { dx: 0, dy: 0, h: 56, w: 6, color: '#378862' },
        ];
        for (const s of stalks) {
          ctx.strokeStyle = s.color;
          ctx.lineWidth = s.w;
          ctx.beginPath();
          ctx.moveTo(sp.x + s.dx, sp.y + 10 + s.dy);
          ctx.lineTo(sp.x + s.dx, sp.y - s.h);
          ctx.stroke();

          // Bamboo segment nodes (đốt trúc)
          ctx.strokeStyle = '#74c69d';
          ctx.lineWidth = 1.2;
          for (let ny = sp.y - 6; ny > sp.y - s.h + 6; ny -= 14) {
            ctx.beginPath();
            ctx.moveTo(sp.x + s.dx - s.w * 0.6, ny);
            ctx.lineTo(sp.x + s.dx + s.w * 0.6, ny);
            ctx.stroke();
          }
        }

        // Layered Bamboo Canopy
        ctx.fillStyle = '#2d6a4f';
        ctx.beginPath();
        ctx.arc(sp.x - 10, sp.y - 46, 14, 0, Math.PI * 2);
        ctx.arc(sp.x + 10, sp.y - 48, 15, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#40916c';
        ctx.beginPath();
        ctx.arc(sp.x - 4, sp.y - 54, 15, 0, Math.PI * 2);
        ctx.arc(sp.x + 6, sp.y - 56, 13, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#74c69d';
        ctx.beginPath();
        ctx.arc(sp.x - 2, sp.y - 58, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Draw Day/Night ambient lighting layer & mountain mist
  public renderLighting(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.save();

    // Subtle drifting mountain mist (Sương Mù Thanh Mao Sơn)
    const mistDrift = Math.sin(this.elapsedTime * 0.25) * 40;
    const mistGrad = ctx.createRadialGradient(
      width * 0.35 + mistDrift,
      height * 0.3,
      20,
      width * 0.35 + mistDrift,
      height * 0.3,
      Math.max(width, height) * 0.55
    );
    mistGrad.addColorStop(0, 'rgba(180, 215, 198, 0.06)');
    mistGrad.addColorStop(1, 'rgba(180, 215, 198, 0)');
    ctx.fillStyle = mistGrad;
    ctx.fillRect(0, 0, width, height);

    // dayTime: 0.25 is morning, 0.5 is noon, 0.75 is dusk, 0/1 is midnight
    let darkAlpha = 0;
    let tintColor = 'rgba(0, 10, 28, ';

    if (this.dayTime < 0.2) {
      darkAlpha = 0.55;
    } else if (this.dayTime < 0.35) {
      const ratio = (this.dayTime - 0.2) / 0.15;
      darkAlpha = 0.55 * (1 - ratio);
      tintColor = 'rgba(40, 20, 10, ';
    } else if (this.dayTime < 0.65) {
      darkAlpha = 0;
    } else if (this.dayTime < 0.8) {
      const ratio = (this.dayTime - 0.65) / 0.15;
      darkAlpha = 0.45 * ratio;
      tintColor = 'rgba(30, 8, 35, ';
    } else {
      darkAlpha = 0.55;
    }

    if (darkAlpha > 0.01) {
      ctx.fillStyle = `${tintColor}${darkAlpha})`;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }

  public getTimeOfDayName(): { name: string; icon: string } {
    if (this.dayTime < 0.2 || this.dayTime >= 0.85) return { name: 'Thanh Mao Sơn • Đêm Thanh Vắng', icon: '🌙' };
    if (this.dayTime < 0.35) return { name: 'Thanh Mao Sơn • Rạng Đông Sương Mù', icon: '🌅' };
    if (this.dayTime < 0.65) return { name: 'Thanh Mao Sơn • Nhật Chiếu U Cốc', icon: '☀️' };
    return { name: 'Thanh Mao Sơn • Hoàng Hôn Tịch Dương', icon: '🌇' };
  }
}

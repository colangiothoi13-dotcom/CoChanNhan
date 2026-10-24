import { Cultivator } from '../entities/Cultivator';
import { closeModal, openModal } from './Modal';
import type { FieldSnapshot } from '../world/field-types';
import { guIcon } from './icons';

export class CultivatorModal {
  private modal: HTMLElement | null = null;
  private btnClose: HTMLElement | null = null;
  private btnOpen: HTMLElement | null = null;
  private apertureSea: HTMLElement | null = null;
  private statAtk: HTMLElement | null = null;
  private statDef: HTMLElement | null = null;
  private statSpd: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private rotationAngle: number = 0;
  private isDragging: boolean = false;
  private lastDragX: number = 0;

  constructor(private cultivator: Cultivator, private getField: () => FieldSnapshot | null = () => null) {
    this.modal = document.getElementById('modal-cultivator');
    this.btnClose = document.getElementById('btn-close-cultivator');
    this.btnOpen = document.getElementById('btn-open-cultivator');
    this.apertureSea = document.getElementById('aperture-sea');
    this.statAtk = document.getElementById('stat-atk');
    this.statDef = document.getElementById('stat-def');
    this.statSpd = document.getElementById('stat-spd');
    this.canvas = document.getElementById('char-preview-canvas') as HTMLCanvasElement | null;
    if (this.canvas) this.ctx = this.canvas.getContext('2d');

    this.bindEvents();
    this.bindRotation();
    this.bindTabs();
  }

  private bindEvents() {
    this.btnOpen?.addEventListener('click', () => this.open());
    this.btnClose?.addEventListener('click', () => this.close());
    this.modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.close());

    // Switch to Bag / Gu table button
    const btnOpenGu = document.getElementById('btn-open-gu-from-char');
    btnOpenGu?.addEventListener('click', () => {
      this.close();
      document.getElementById('btn-open-inventory')?.click();
    });

    // Open Auth / Gmail Cloud Save
    const btnOpenAuth = document.getElementById('btn-open-auth-from-char');
    btnOpenAuth?.addEventListener('click', () => {
      this.close();
      window.dispatchEvent(new CustomEvent('cotienlo:open-auth'));
    });
  }

  private bindTabs() {
    const tabs = this.modal?.querySelectorAll<HTMLButtonElement>('.char-tab');
    tabs?.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => {
          t.classList.remove('active');
          t.setAttribute('aria-pressed', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-pressed', 'true');
      });
    });
  }

  private bindRotation() {
    if (!this.canvas) return;

    const onStart = (clientX: number) => {
      this.isDragging = true;
      this.lastDragX = clientX;
    };

    const onMove = (clientX: number) => {
      if (!this.isDragging) return;
      const dx = clientX - this.lastDragX;
      this.lastDragX = clientX;
      this.rotationAngle += dx * 0.025;
      this.drawCharacterPreview();
    };

    const onEnd = () => {
      this.isDragging = false;
    };

    this.canvas.addEventListener('mousedown', (e) => onStart(e.clientX));
    window.addEventListener('mousemove', (e) => onMove(e.clientX));
    window.addEventListener('mouseup', onEnd);

    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) onStart(e.touches[0].clientX);
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) onMove(e.touches[0].clientX);
    }, { passive: true });
    window.addEventListener('touchend', onEnd);
  }

  public open() {
    this.render();
    openModal(this.modal, this.btnOpen);
    this.drawCharacterPreview();
  }

  public close() {
    closeModal(this.modal);
  }

  private drawCharacterPreview() {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2 + 30;
    const dir = Math.cos(this.rotationAngle) >= 0 ? 1 : -1;
    const facingFront = Math.sin(this.rotationAngle + Math.PI / 2) >= 0;

    ctx.save();
    ctx.translate(cx, cy);

    // 1. Ground Shadow
    ctx.beginPath();
    ctx.ellipse(0, 48, 42, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fill();

    // 2. Daoist Spirit Sword
    ctx.save();
    ctx.rotate(dir * 0.45);
    ctx.fillStyle = '#4a2810';
    ctx.fillRect(-4, -46, 8, 70);
    ctx.strokeStyle = '#d9b45a';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(-4, -46, 8, 70);
    // Hilt
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-8, -50, 16, 5);
    ctx.fillStyle = '#8e2a20';
    ctx.fillRect(-3, -62, 6, 12);
    ctx.restore();

    // 3. Black Stepping Boots
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.ellipse(-14, 44, 9, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(14, 44, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4. Dark Xianxia Daoist Robe (matching Image 03 from cotienlo.com)
    ctx.fillStyle = '#1e1b18';
    ctx.beginPath();
    ctx.moveTo(-24, -12);
    ctx.lineTo(24, -12);
    ctx.lineTo(30, 42);
    ctx.lineTo(-30, 42);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#8c6d42';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Blue sash / ribbon belt
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(-26, 4, 52, 8);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-6, 3, 12, 10);
    // Hanging tassels
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-4, 13, 3, 20);
    ctx.fillRect(1, 13, 3, 20);

    // V-neck crossover collar
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-14, -12);
    ctx.lineTo(0, 2);
    ctx.lineTo(14, -12);
    ctx.stroke();

    // 5. Face & Flowing Black Hair
    ctx.fillStyle = '#fce7d2';
    ctx.beginPath();
    ctx.arc(0, -26, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#44281d';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Long dark hair framing face
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, -30, 19, Math.PI * 0.9, Math.PI * 2.1);
    ctx.fill();
    // Long side hair locks hanging down shoulders
    ctx.fillRect(-18, -26, 6, 34);
    ctx.fillRect(12, -26, 6, 34);

    if (facingFront) {
      // Eyes
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(-6, -24, 2.5, 0, Math.PI * 2);
      ctx.arc(6, -24, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Conical Bamboo Hat (Nón Lá / Nón Chóp Tre - matching Feature 03 in cotienlo.com)
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.moveTo(0, -64);
    ctx.lineTo(44, -34);
    ctx.lineTo(-44, -34);
    ctx.closePath();
    ctx.fill();

    // Straw woven rings
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, -48, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -42, 28, 0, Math.PI * 2);
    ctx.stroke();

    // Black hat ribbon band
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-44, -36, 88, 3.5);

    ctx.restore();
  }

  public render() {
    const mpPercent = Math.max(0, Math.min(100, (this.cultivator.mp / Math.max(1, this.cultivator.maxMp)) * 100));
    if (this.apertureSea) {
      this.apertureSea.style.width = `${mpPercent}%`;
      if (this.cultivator.primevalLevel >= 2) {
        this.apertureSea.style.background = 'linear-gradient(90deg,#e06d53,#8c271e)';
      } else {
        this.apertureSea.style.background = 'linear-gradient(90deg,#48b899,#18493a)';
      }
    }

    const statRealm = document.getElementById('stat-realm');
    if (statRealm) statRealm.textContent = this.cultivator.displayRealm ?? this.cultivator.realm;

    const charRealmName = document.getElementById('char-realm-name');
    if (charRealmName) charRealmName.textContent = this.cultivator.displayRealm ?? this.cultivator.realm;

    const bonusAtk = this.cultivator.attackDamage - this.cultivator.baseAttack;
    const speed = this.cultivator.boarBuffDuration > 0 ? Math.round(this.cultivator.baseSpeed * 1.35) : this.cultivator.baseSpeed;

    if (this.statAtk) this.statAtk.textContent = `${this.cultivator.baseAttack} (+${bonusAtk})`;
    if (this.statDef) {
      this.statDef.textContent = `${this.cultivator.baseDefense} (+${this.cultivator.guDefense})${this.cultivator.shieldDuration > 0 ? ', giảm 55%' : ''}`;
      this.statDef.setAttribute('title', 'Giáp cảnh giới cộng giáp từ cổ; Đồng Giáp giảm 55% sát thương còn lại sau giáp.');
    }
    if (this.statSpd) this.statSpd.textContent = `${speed} px/s`;

    const charHpText = document.getElementById('char-hp-text');
    if (charHpText) charHpText.textContent = `Máu ${Math.round(this.cultivator.hp)} / ${this.cultivator.maxHp}`;
    const statCharHp = document.getElementById('stat-char-hp');
    if (statCharHp) statCharHp.textContent = `${Math.round(this.cultivator.hp)} + 0`;

    const charMpText = document.getElementById('char-mp-text');
    if (charMpText) charMpText.textContent = `Chân nguyên ${Math.round(this.cultivator.mp)} / ${this.cultivator.maxMp}`;
    const statCharMp = document.getElementById('stat-char-mp');
    if (statCharMp) statCharMp.textContent = `${Math.round(this.cultivator.mp)} + 0`;

    const statPower = document.getElementById('stat-power');
    if (statPower) {
      const power = 800 + (this.cultivator.primevalLevel * 60) + this.cultivator.permanentDefense * 4;
      statPower.textContent = `${power} (tham khảo)`;
      statPower.setAttribute('title', 'Chỉ số tham khảo từ cảnh giới và giáp; sát thương thực tế được tính riêng.');
    }

    const field = this.getField();
    if (field?.cultivation && field.cultivationStats) {
      const state = field.cultivation, stats = field.cultivationStats;
      this.modal?.querySelectorAll<HTMLElement>('.equip-name').forEach(element => { element.textContent = 'Chưa trang bị'; });
      this.modal?.querySelectorAll<HTMLElement>('.equip-stat').forEach(element => { element.textContent = 'Không có cộng thêm'; });
      const equipmentNote = this.modal?.querySelector<HTMLElement>('.equip-caption');
      if (equipmentNote) equipmentNote.textContent = 'Phòng thủ và tài nguyên hiện tại lấy từ trạng thái nhân vật trên máy chủ.';
      if (this.apertureSea && state.mortal) this.apertureSea.style.width = `${stats.energy.current / 100}%`;
      if (statPower) { statPower.textContent = 'Xem bộ Cổ và hoàn cảnh'; statPower.title = 'Tu vi, Cổ, độ thuần thục, thân/hồn và hoàn cảnh được tính riêng.'; }
      if (this.statAtk) this.statAtk.textContent = String(stats.physicalDamage);
      if (this.statDef) { this.statDef.textContent = String(stats.defense); this.statDef.title = 'Phòng thủ thân thể; tác dụng Cổ được máy chủ tính riêng.'; }
      if (this.statSpd) this.statSpd.textContent = `${stats.moveSpeed} đơn vị/s`;
      if (charMpText) charMpText.textContent = `${stats.energy.label} ${field.mp.toFixed(1)} / ${field.maxMp}${state.mortal ? '% khiếu' : ' viên'}`;
      const fill = this.modal?.querySelector<HTMLElement>('.tuvi-fill');
      const label = this.modal?.querySelector<HTMLElement>('.tuvi-track .char-bar-text');
      if (fill) fill.style.width = `${(state.mortal?.wallProgress ?? 0) / 100}%`;
      if (label) label.textContent = state.mortal ? `Rèn vách khiếu ${(state.mortal.wallProgress / 100).toFixed(1)}%` : `Đã qua ${state.immortal?.passedTribulations ?? 0} kiếp`;
      const hpFill = document.getElementById('char-hp-fill');
      if (hpFill) hpFill.style.width = `${Math.max(0, Math.min(100, field.hp / Math.max(1, field.maxHp) * 100))}%`;
      const sockets = document.getElementById('char-gu-sockets');
      if (sockets) {
        sockets.replaceChildren();
        for (const gu of state.guInstances.filter(gu => gu.alive && (gu.holderLifeId ?? gu.ownerLifeId) === state.lifeId)) {
          const socket = document.createElement('div'); socket.className = 'gu-socket active';
          socket.title = `${gu.typeId} · ${gu.controlled ? 'Đã luyện hóa' : 'Chưa luyện hóa'}`;
          socket.innerHTML = guIcon(gu.typeId, 28); sockets.appendChild(socket);
        }
        if (!sockets.children.length) sockets.textContent = 'Chưa có Cổ · nhận Cổ đầu đời ở học đường';
      }
      const faction = this.modal?.querySelector<HTMLElement>('.faction-row .text-green');
      if (faction) faction.textContent = 'Người tu luyện';
      const lore = this.modal?.querySelector<HTMLElement>('.faction-lore');
      if (lore) lore.textContent = `Tư chất ${state.aptitudeBps / 100}% toàn khiếu · chuyển Cổ không tự tăng theo tu vi.`;
      const note = this.modal?.querySelector<HTMLElement>('.stats-sub-note');
      if (note) note.textContent = `Thương thể ${state.body.woundBps / 100}% · thương hồn ${state.soul.woundBps / 100}% · hồn lực ${state.soul.strength}`;
      let reasons = this.modal?.querySelector<HTMLDetailsElement>('#char-combat-reasons');
      if (!reasons && this.modal) {
        reasons = document.createElement('details'); reasons.id = 'char-combat-reasons';
        const summary = document.createElement('summary'); summary.textContent = 'Giải thích lần dùng Cổ gần nhất';
        reasons.appendChild(summary); reasons.appendChild(document.createElement('p'));
        this.modal.querySelector('.combat-stats-section')?.appendChild(reasons);
      }
      const explanation = reasons?.querySelector('p');
      if (explanation) explanation.textContent = field.combatLog?.join(' ') || 'Chưa dùng Cổ trong cuộc đời này.';
    }

    this.drawCharacterPreview();
  }
}

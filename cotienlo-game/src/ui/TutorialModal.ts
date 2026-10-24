import { closeModal, openModal } from './Modal';

export class TutorialModal {
  private modal: HTMLElement | null = null;
  private btnClose: HTMLElement | null = null;
  private btnConfirm: HTMLElement | null = null;
  private btnOpen: HTMLElement | null = null;

  constructor() {
    this.modal = document.getElementById('modal-tutorial');
    this.btnClose = document.getElementById('btn-close-tutorial');
    this.btnConfirm = document.getElementById('btn-tutorial-confirm');
    this.btnOpen = document.getElementById('btn-open-tutorial');

    this.bindEvents();
    this.checkFirstTimeUser();
  }

  private bindEvents(): void {
    this.btnOpen?.addEventListener('click', () => this.open());
    this.btnClose?.addEventListener('click', () => this.close());
    this.btnConfirm?.addEventListener('click', () => {
      this.markTutorialSeen();
      this.close();
    });

    this.modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      this.markTutorialSeen();
      this.close();
    });

    // Keyboard shortcut (T) to open tutorial
    window.addEventListener('keydown', (e) => {
      if (e.key === 't' || e.key === 'T') {
        const focused = document.activeElement as HTMLElement | null;
        if (focused && ['INPUT', 'TEXTAREA'].includes(focused.tagName)) return;
        if (this.modal?.classList.contains('active')) {
          this.close();
        } else if (!document.querySelector('.game-modal.active')) {
          this.open();
        }
      }
    });
  }

  private checkFirstTimeUser(): void {
    try {
      const seen = localStorage.getItem('cotienlo_tutorial_seen');
      if (seen !== 'true' && this.modal) {
        // Auto open tutorial for new cultivators after initial greeting
        setTimeout(() => {
          try { if (localStorage.getItem('cotienlo_tutorial_seen') === 'true') return; }
          catch { return; }
          if (!document.querySelector('.game-modal.active')) {
            this.open();
          }
        }, 800);
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }

  public markTutorialSeen(): void {
    try {
      localStorage.setItem('cotienlo_tutorial_seen', 'true');
    } catch {
      // Ignore storage errors
    }
  }

  public open(): void {
    if (this.modal) {
      if (document.getElementById('game-container')?.dataset.gameMode === 'overworld') this.renderWorldGuide();
      openModal(this.modal, this.btnOpen);
    }
  }

  private renderWorldGuide(): void {
    const replace = (selector: string, html: string) => { const element = this.modal?.querySelector(selector); if (element) element.innerHTML = html; };
    replace('.card-sanctuary', '<div class="tutorial-card-header"><span class="tutorial-badge-num">1</span><h3>Khởi đầu trong khu dân cư</h3></div><p>Mỗi đời sinh ngẫu nhiên tại một khu an toàn trong Ngũ Vực, không có Cổ. Khu dân cư rộng có học đường, Cổ khố, tịnh thất luyện hóa, sân tu luyện, y xá và khách xá. Quái ở ngoài kết giới.</p>');
    replace('.card-dialogue', '<div class="tutorial-card-header"><span class="tutorial-badge-num">3</span><h3>Nhận Cổ rồi luyện hóa</h3></div><p>Đến gần giáo tập, bấm <kbd>F</kbd> hoặc nút tương tác. Chọn một Cổ đầu đời miễn phí, rồi luyện hóa (2 nguyên thạch, 5% toàn khiếu, 10 giây). Cổ chưa luyện hóa nằm trong túi và chưa dùng được. Mua thêm Cổ ở Cổ khố.</p><p>Tĩnh tọa rèn vách khiếu rồi thử đột phá. Nâng tu vi không tự tặng hoặc nâng chuyển Cổ.</p>');
    replace('.tutorial-skills-mini', '<div class="skill-mini-item"><strong>Đánh thường:</strong> Đòn cận chiến yếu khi chưa có Cổ.</div><div class="skill-mini-item"><strong>Ô 1–4:</strong> Chỉ dùng Cổ đã luyện hóa và đủ điều kiện. Phí hiện trên nút được tính theo toàn khiếu; tư chất 44% không phải biển chân nguyên 100%.</div><div class="skill-mini-item"><strong>Tu luyện và luyện hóa:</strong> Máy chủ tiếp tục tính thời gian khi đóng cửa sổ NPC. Rời game quá thời gian hoạt động sẽ tạm dừng nhân vật.</div>');
    replace('.card-systems ul', '<li><strong>Cài đặt:</strong> Lắp bộ chiêu và đổi các phím tùy tay.</li><li><strong>Túi đồ (B):</strong> Phân biệt Cổ sở hữu với Cổ có thể điều khiển.</li><li><strong>Nhân vật (C):</strong> Xem tu vi, khiếu huyệt và tài nguyên từ máy chủ.</li><li><strong>Ngũ Vực:</strong> Xem bản đồ rồi tự đi; chọn vùng không dịch chuyển nhân vật.</li><li><strong>Tái sinh:</strong> Khởi đầu lại ở nơi an toàn ngẫu nhiên, không giữ Cổ đời trước.</li>');
  }

  public close(): void {
    if (this.modal) {
      closeModal(this.modal);
    }
  }
}


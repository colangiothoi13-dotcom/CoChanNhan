import { QuestSystem } from '../systems/QuestSystem';
import { Cultivator } from '../entities/Cultivator';
import { closeModal, openModal } from './Modal';
import { Toast } from './Toast';

export class DialogueModal {
  private modal: HTMLElement | null = null;
  private btnClose: HTMLElement | null = null;
  private npcDialogue: HTMLElement | null = null;
  private dialogActions: HTMLElement | null = null;

  constructor(
    private quest: QuestSystem,
    private cultivator: Cultivator,
    private onQuestChange: () => void = () => {},
  ) {
    this.modal = document.getElementById('modal-dialogue');
    this.btnClose = document.getElementById('btn-close-dialogue');
    this.npcDialogue = document.getElementById('dialogue-text');
    this.dialogActions = document.getElementById('dialogue-actions');

    this.bindEvents();
  }

  private bindEvents(): void {
    this.btnClose?.addEventListener('click', () => this.close());
    this.modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.close());

    this.dialogActions?.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!target) return;
      const action = target.getAttribute('data-dialogue-action');

      if (action === 'claim' || action === 'breakthrough') {
        const result = this.quest.completeChapter(this.cultivator);
        Toast.show(result.message);
        if (result.success) {
          this.onQuestChange();
          this.render();
        }
      } else if (action === 'next') {
        const nextChapter = this.quest.chapter + 1;
        if (!this.quest.advanceToNextChapter()) return;
        Toast.show(`Tiếp nhận Chương ${nextChapter}: ${this.quest.currentChapter.title}!`);
        this.onQuestChange();
        this.render();
      } else if (action === 'tutorial') {
        this.close();
        document.getElementById('btn-open-tutorial')?.click();
      } else if (action === 'auth') {
        this.close();
        window.dispatchEvent(new CustomEvent('cotienlo:open-auth'));
      } else if (action === 'close') {
        this.close();
      }
    });
  }

  public open(): void {
    this.render();
    openModal(this.modal);
  }

  public close(): void {
    closeModal(this.modal);
  }

  public render(): void {
    const cur = this.quest.currentChapter;

    let message = '';
    let buttonsHtml = '';

    switch (cur.chapter) {
      case 1:
        if (!cur.isComplete) {
          message = `Chào con, Phương Nguyên! Trùng sinh một kiếp, tiên lộ gian nan. Khai khiếu đã định, muốn luyện thành đệ nhất Cổ trùng thì trước hết phải nuôi được nó. Khu vực quanh ta là Tông Môn Hộ Thần Trận, dị thú không thể xâm phạm và đứng đây sẽ giúp con liên tục hồi phục sinh lực. Hãy vào rừng trúc Thanh Mao diệt 3 Thanh Trúc Xà lấy U Quang Thạch, nếu bị thương cứ chạy về đây tịnh dưỡng, sau đó mở Lô Đỉnh để luyện hóa ra Cổ trùng đầu tiên!`;
          buttonsHtml = `<button type="button" class="btn-dialogue-action btn-gold" data-dialogue-action="close">Con lập tức đi làm ngay!</button><button type="button" class="btn-dialogue-action btn-secondary-action" data-dialogue-action="tutorial">📖 Xem Chỉ Dẫn Tân Thủ</button><button type="button" class="btn-dialogue-action btn-secondary-action" data-dialogue-action="auth">🔐 Lưu Chân Linh (Gmail)</button>`;
        } else if (!cur.rewardClaimed) {
          message = `Khá lắm Phương Nguyên! Con đã thuần phục được Cổ đầu tiên và trảm diệt dã xà, không hổ danh tâm tính 500 năm. Đây là 30 Nguyên thạch thưởng khích lệ, tu vi con cũng vừa tăng tiến lên Nhất Chuyển Trung Giai!`;
          buttonsHtml = `<button type="button" class="btn-dialogue-action btn-gold" data-dialogue-action="claim">Giao nộp &amp; Nhận thưởng (30 Nguyên thạch)</button>`;
        } else {
          message = `Khảo hạch học đường đã qua. Bây giờ bầy sói Điện Lang đang tràn xuống quấy nhiễu bờ suối Cổ Nguyệt, nơi cất giấu bí tàng của Hoa Tửu Hành Giả trăm năm trước. Con đã sẵn sàng tiếp nhận nhiệm vụ diệt sói chưa?`;
          buttonsHtml = `<button type="button" class="btn-dialogue-action btn-gold" data-dialogue-action="next">Tiếp nhận Chương 02: Dẹp trừ Lang họa →</button>`;
        }
        break;

      case 2:
        if (!cur.isComplete) {
          message = `Bầy sói Điện Lang di chuyển rất hung hãn. Hãy lần theo dấu vết Tửu Quán và vách đá suối nguồn, săn 2 con sói và thu thập thêm 2 cây Thảo Dược tươi để tìm kiếm manh mối Tửu Trùng của Hoa Tửu Hành Giả.`;
          buttonsHtml = `<button type="button" class="btn-dialogue-action btn-gold" data-dialogue-action="close">Tuân mệnh Gia Lão!</button>`;
        } else if (!cur.rewardClaimed) {
          message = `Xuất sắc! Bầy sói đã bị đẩy lùi, dược thảo con mang về vô cùng trân quý. Ta ban thưởng cho con 45 Nguyên thạch, tu vi chính thức đạt Nhất Chuyển Cao Giai!`;
          buttonsHtml = `<button type="button" class="btn-dialogue-action btn-gold" data-dialogue-action="claim">Giao nộp &amp; Nhận 45 Nguyên thạch</button>`;
        } else {
          message = `Bờ suối đã yên, nhưng sâu trong Mật Đạo Hầm Mỏ và vách đá Tuyết Sơn có hung thú Tam Chuyển Thiên Khảm Ngô Công và Hào Điện Lang Vương đang thức giấc! Con có dám nghênh chiến?`;
          buttonsHtml = `<button type="button" class="btn-dialogue-action btn-gold" data-dialogue-action="next">Tiếp nhận Chương 03: Khảo nghiệm Hùng Vương →</button>`;
        }
        break;

      case 3:
        if (!cur.isComplete) {
          message = `Thú Vương và Thiên Khảm Ngô Công cực kỳ hung tợn! Khi thấy dị thú tích tụ nộ khí và vòng tròn đỏ hiện dưới chân, con phải lập tức bấm [Space/Lướt] né ra ngoài. Khi đòn dậm trượt thì quái thú sẽ bị choáng, lúc đó dồn toàn lực Nguyệt Quang chém vào!`;
          buttonsHtml = `<button type="button" class="btn-dialogue-action btn-gold" data-dialogue-action="close">Con đã ghi nhớ yếu lĩnh né đòn!</button>`;
        } else if (!cur.rewardClaimed) {
          message = `Trảm sát được Thú Vương dị thú, đoạt lấy bảo vật mật đạo! Nhận lấy 60 Nguyên thạch và Cổ Nhị Chuyển này, cảnh giới của con đã bước vào Nhất Chuyển Đỉnh Phong!`;
          buttonsHtml = `<button type="button" class="btn-dialogue-action btn-gold" data-dialogue-action="claim">Giao nộp &amp; Nhận 60 Nguyên thạch + Cổ Nhị Chuyển</button>`;
        } else {
          message = `Chỉ còn một bước cuối cùng để thoát thai hoán cốt: Hãy dùng Lô Đỉnh hợp luyện ra Cổ Nhị Chuyển và gom đủ 50 Nguyên thạch để mở Khiếu Huyệt, đột phá Nhị Chuyển Sơ Giai, ngưng tụ Chân Nguyên Xích Thiết!`;
          buttonsHtml = `<button type="button" class="btn-dialogue-action btn-gold" data-dialogue-action="next">Tiếp nhận Chương 04: Đột phá Nhị Chuyển →</button>`;
        }
        break;

      case 4:
        if (!cur.isComplete) {
          message = `Đột phá cảnh giới Nhị Chuyển cần sở hữu ít nhất một Cổ Nhị Chuyển (Nguyệt Nhận Cổ hoặc Thiết Cốt Cổ) và 50 Nguyên thạch để xung kích bích chướng khiếu huyệt.`;
          buttonsHtml = `<button type="button" class="btn-dialogue-action btn-gold" data-dialogue-action="close">Con đi chuẩn bị ngay!</button>`;
        } else if (!cur.rewardClaimed) {
          message = `Đủ điều kiện rồi! Đột phá sẽ dùng 50 Nguyên thạch, chuyển sang Nhị Chuyển Sơ Giai và nhận thưởng 80 Nguyên thạch trong cùng một lần xác nhận.`;
          buttonsHtml = `<button type="button" class="btn-dialogue-action btn-gold" data-dialogue-action="breakthrough">Đột phá · Phí 50 · Thưởng 80 Nguyên thạch</button>`;
        } else {
          message = `Từ nay con đã là rường cột của sơn trại. Bản cáo thị săn bắt dị thú hàng ngày luôn mở cho con rèn luyện và tích lũy tài nguyên!`;
          buttonsHtml = `<button type="button" class="btn-dialogue-action btn-gold" data-dialogue-action="next">Mở Cáo thị Sơn Trại (Bounty Săn Quái) →</button>`;
        }
        break;

      default:
        if (!cur.isComplete) {
          message = `Đây là Cáo thị tuần tra thường nhật: diệt sạch 3 dị thú bất kỳ đang lởn vởn quanh trại để nhận thưởng 35 Nguyên thạch và thảo dược bồi bổ.`;
          buttonsHtml = `<button type="button" class="btn-dialogue-action btn-gold" data-dialogue-action="close">Tiếp nhận cáo thị!</button>`;
        } else if (!cur.rewardClaimed) {
          message = `Làm tốt lắm, an ninh sơn trại được bảo toàn nhờ có con. Nhận lấy 35 Nguyên thạch phần thưởng cáo thị!`;
          buttonsHtml = `<button type="button" class="btn-dialogue-action btn-gold" data-dialogue-action="claim">Nhận 35 Nguyên thạch</button>`;
        } else {
          message = `Muốn nhận thêm việc làm cáo thị mới không? Sơn trại luôn có nhiệm vụ cho Cổ Sư cần cù!`;
          buttonsHtml = `<button type="button" class="btn-dialogue-action btn-gold" data-dialogue-action="next">Tiếp nhận Cáo thị tiếp theo →</button>`;
        }
        break;
    }

    if (this.npcDialogue) this.npcDialogue.textContent = message;
    if (this.dialogActions) this.dialogActions.innerHTML = buttonsHtml;
  }
}

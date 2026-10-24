import { openModal, closeModal } from '../ui/Modal';
import { icon } from '../ui/icons';
import { createRulesDemo } from './index';
import { DEMO_IDS as ids, SIM_YEAR_TICKS, RANK_ENERGY_LABELS, SUBREALM_LABELS, TRIBULATION_LABELS, type RuleAction, type RulesSnapshot } from './types';
import './rules.css';

type Lesson = 'essence' | 'permission' | 'refinement' | 'ascension' | 'time' | 'tribulation';
const lessons: Record<Lesson, string> = {
  essence: 'Nguyên hải', permission: 'Mượn Cổ', refinement: 'Luyện Tiên Cổ',
  ascension: 'Tam khí', time: 'Tiên khiếu', tribulation: 'Tai kiếp',
};
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, text => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[text]!));
const number = (value: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);
const percent = (value: number) => number(value / 100) + '%';
const years = (value: number) => number(value / SIM_YEAR_TICKS);
const button = (id: string, label: string) => `<button type="button" id="${id}" data-rules-action="${id}">${label}</button>`;
const stat = (label: string, value: string, id = '') => `<div class="rules-stat"><span>${label}</span><strong${id ? ` id="${id}"` : ''}>${value}</strong></div>`;
const card = (title: string, content: string) => `<section class="rules-card"><h3>${title}</h3>${content}</section>`;

/** Interactive examples of the supplied specification; never reads or writes a player's save. */
export class RulesPanel {
  private lesson: Lesson = 'essence';
  private engines = new Map<Lesson, ReturnType<typeof createRulesDemo>>();
  private sequence = 0;
  private message = 'Chọn một thao tác để quan sát điều kiện, chi phí và kết quả.';
  private ok = true;
  private events: string[] = [];
  private card: HTMLElement;
  private controller = new AbortController();

  constructor(private root: HTMLElement) {
    root.innerHTML = `<div class="modal-backdrop" data-rules-action="close"></div><section class="modal-card rules-panel" role="dialog" aria-modal="true" aria-labelledby="rules-title" tabindex="-1"></section>`;
    this.card = root.querySelector<HTMLElement>('.modal-card')!;
    root.addEventListener('click', this.onClick, { signal: this.controller.signal });
    this.render();
  }

  open(): void {
    this.render();
    openModal(this.root, document.getElementById('btn-open-cultivator'));
  }

  destroy(): void { this.controller.abort(); closeModal(this.root); }

  private get engine(): ReturnType<typeof createRulesDemo> {
    let engine = this.engines.get(this.lesson);
    if (!engine) {
      engine = createRulesDemo({ aptitudeBps: 4400, ratio: this.lesson === 'tribulation' ? 10 : 1 });
      this.engines.set(this.lesson, engine);
    }
    return engine;
  }

  private onClick = (event: Event): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-rules-action],[data-rules-view]');
    if (!target || target.matches(':disabled')) return;
    const view = target.dataset.rulesView;
    if (view && Object.hasOwn(lessons, view)) {
      this.lesson = view as Lesson;
      this.message = 'Mỗi bài thử có trạng thái riêng. Các hệ số đều là thông số mô phỏng của game.';
      this.events = []; this.ok = true; this.render(); return;
    }
    const action = target.dataset.rulesAction;
    if (action === 'close') { closeModal(this.root); return; }
    if (action === 'reset') {
      this.engines.delete(this.lesson); this.events = []; this.ok = true;
      this.message = 'Đã bắt đầu lại bài thử. Nhân vật và tài sản đang chơi không thay đổi.';
      this.render(); return;
    }
    const state = this.engine.snapshot();
    try {
      if (action === 'rules-advance-three-hundred') {
        this.events = [];
        const targetTicks = state.outerTicks + 300 * SIM_YEAR_TICKS / state.apertures[ids.aperture].ratio;
        while (this.engine.snapshot().outerTicks < targetTicks) {
          const current = this.engine.snapshot();
          const result = this.engine.execute({ operationId: 'ui-' + ++this.sequence, expectedRevision: current.revision,
            action: { type: 'advance-time', outerTicks: Math.min(targetTicks, current.outerTicks + 100 * SIM_YEAR_TICKS) } });
          this.ok = result.outcome.ok;
          this.message = result.outcome.message;
          this.events.push(...result.events.map(event => event.message));
          if (!this.ok) break;
        }
        this.events = this.events.slice(-5);
        this.render(); return;
      }
      const command = this.action(action ?? '', state);
      if (!command) return;
      const result = this.engine.execute({ operationId: 'ui-' + ++this.sequence, expectedRevision: state.revision, action: command });
      this.ok = result.outcome.ok;
      this.message = result.outcome.message;
      this.events = result.events.map(event => event.message).slice(-5);
    } catch (error) {
      this.ok = false; this.message = error instanceof Error ? error.message : 'Thao tác không hợp lệ.';
    }
    const focus = target.id;
    this.render();
    if (focus) this.root.querySelector<HTMLElement>('#' + focus)?.focus({ preventScroll: true });
  };

  private action(id: string, state: RulesSnapshot): RuleAction | null {
    const actor = state.actors[ids.ascender];
    const job = Object.values(state.jobs).find(job => job.status === 'working');
    const pending = state.tribulations.find(trial => trial.status === 'pending');
    const aperture = state.apertures[ids.aperture];
    switch (id) {
      case 'rules-spend': return { type: 'spend-primeval', actorId: ids.mortal, costBps: 1000 };
      case 'rules-wine': return { type: 'refine-quality', actorId: ids.mortal, inputBps: 2000 };
      case 'rules-cultivate': return { type: 'cultivate', actorId: ids.mortal };
      case 'rules-breakthrough': return { type: 'breakthrough', actorId: ids.mortal };
      case 'rules-suppress': return { type: 'suppress-extreme', actorId: ids.mortal };
      case 'rules-rest': return { type: 'advance-time', outerTicks: state.outerTicks + 100 };
      case 'rules-grant': return { type: 'grant-use', actorId: ids.mortal, instanceId: ids.boarGu, granteeId: ids.borrower, handOver: true };
      case 'rules-revoke': return { type: 'revoke-use', actorId: ids.mortal, instanceId: ids.boarGu, granteeId: ids.borrower };
      case 'rules-borrow-use': return { type: 'use-gu', actorId: ids.borrower, instanceId: ids.boarGu };
      case 'rules-destroy-vital': return { type: 'destroy-gu', actorId: ids.mortal, instanceId: ids.moonGu };
      case 'rules-refine-a': return { type: 'start-refinement', actorId: ids.mortal, recipeId: ids.recipe6, inputIds: [ids.moonGu, ids.boarGu] };
      case 'rules-refine-b': return { type: 'start-refinement', actorId: ids.borrower, recipeId: ids.recipe7, inputIds: [ids.secondMoonGu, ids.secondBoarGu] };
      case 'rules-finish':
      case 'rules-finish-bad':
        if (!job) throw new Error('Chưa có mẻ luyện đang tiến hành.');
        return { type: 'finish-refinement', jobId: job.id, techniqueScore: id === 'rules-finish' ? 100 : 0 };
      case 'rules-shatter': return { type: 'ascend', actorId: ids.ascender, step: 'shatter' };
      case 'rules-absorb': {
        const human = actor.ascension?.humanQi ?? 100;
        return { type: 'ascend', actorId: ids.ascender, step: 'absorb', heavenQi: human / 2, earthQi: human / 2 };
      }
      case 'rules-absorb-risk': return { type: 'ascend', actorId: ids.ascender, step: 'absorb', heavenQi: 80, earthQi: 80 };
      case 'rules-release': return { type: 'ascend', actorId: ids.ascender, step: 'release', instanceId: ids.ascensionGu };
      case 'rules-advance-one': return { type: 'advance-time', outerTicks: state.outerTicks + SIM_YEAR_TICKS };
      case 'rules-place': return { type: 'set-aperture-placed', apertureId: ids.aperture, placed: !aperture.placed };
      case 'rules-enter': return { type: 'enter-aperture', actorId: ids.immortal, apertureId: ids.aperture };
      case 'rules-leave': return { type: 'leave-aperture', actorId: ids.immortal };
      case 'rules-water': return { type: 'supply-ecology', actorId: ids.immortal, apertureId: ids.aperture, water: 100 };
      case 'rules-defend':
      case 'rules-fail-tribulation':
        if (!pending) throw new Error('Chưa có tai kiếp đến hạn.');
        return { type: 'resolve-tribulation', actorId: ids.immortal, tribulationId: pending.id, defend: id === 'rules-defend' };
      default:
        if (/^rules-ratio-(1|10|20|30)$/.test(id)) return { type: 'change-ratio', apertureId: ids.aperture, ratio: Number(id.slice(12)) };
        return null;
    }
  }

  private essence(state: RulesSnapshot): string {
    const actor = state.actors[ids.mortal];
    const aperture = actor.mortal!;
    const realm = `${actor.rank} chuyển · ${actor.subrealm ? SUBREALM_LABELS[actor.subrealm] : 'Cổ Tiên'}`;
    return card('44% là dung lượng của toàn không khiếu', `
      <p>Mỗi lần dùng tiêu hao <strong>10 điểm phần trăm của toàn không khiếu</strong>. Bốn lần còn 4%; không tính lại thành 10% thanh riêng của nhân vật.</p>
      <div class="rules-stats">${stat('Tu vi', escape(realm))}${stat('Đang có', percent(aperture.amountBps), 'rules-amount')}${stat('Dung lượng', percent(aperture.capacityBps))}${stat('Năng lượng', escape(RANK_ENERGY_LABELS[actor.rank]))}</div>
      <div class="rules-buttons">${button('rules-spend', 'Dùng 10 điểm chân nguyên')}${button('rules-wine', 'Tửu Trùng · nâng phẩm chất')}${button('rules-rest', 'Nghỉ 0,1 năm mô phỏng')}${button('rules-cultivate', 'Tu luyện thành khiếu')}${button('rules-breakthrough', 'Thử đột phá')}</div>
      <p class="rules-note">Phẩm chất được lưu riêng: ${aperture.essence.map(bucket => `${percent(bucket.amountBps)} ở bậc ${bucket.quality}`).join(' · ') || 'Nguyên hải cạn'}. Tửu Trùng trong bài thử cần 20 điểm chân nguyên và 2 đá để tạo 10 điểm phẩm chất cao hơn; tu vi giữ nguyên. Chi phí luyện và tốc độ hồi phục là thông số đề xuất.</p>`);
  }

  private permission(state: RulesSnapshot): string {
    const gu = state.gu[ids.boarGu];
    const borrower = state.actors[ids.borrower];
    return card('Quyền sở hữu và quyền sử dụng', `
      <p>Giao Cổ và cấp quyền cho người mượn là hai điều kiện riêng. Thu hồi quyền không biến người mượn thành chủ và không tự dịch chuyển Cổ về túi chủ.</p>
      <div class="rules-stats">${stat('Chủ sở hữu', escape(state.actors[gu.ownerId]?.name ?? gu.ownerId))}${stat('Người đang giữ', escape(gu.holderId ? state.actors[gu.holderId]?.name ?? gu.holderId : 'Không có'))}${stat('Chân nguyên người mượn', percent(borrower.mortal?.amountBps ?? 0), 'rules-borrower-amount')}${stat('Liên kết bổn mạng', state.gu[ids.moonGu].alive ? 'Còn nguyên' : 'Đã bị hủy')}</div>
      <div class="rules-buttons">${button('rules-grant', 'Giao Cổ và cho mượn')}${button('rules-borrow-use', 'Người mượn thử dùng Cổ')}${button('rules-revoke', 'Chủ nhân thu hồi quyền')}${button('rules-destroy-vital', 'Thử hủy bổn mạng Cổ')}</div>
      <p class="rules-note">Bảo toàn bổn mạng khi hợp luyện thất bại không bảo vệ trước mọi cách hủy. Quan sát phản phệ và kiểm tra quyền sau khi thu hồi.</p>`);
  }

  private refinement(state: RulesSnapshot): string {
    const mirrors = Object.values(state.gu).filter(gu => gu.immortal && gu.typeId === ids.immortalType && gu.alive);
    const jobs = Object.values(state.jobs);
    return card('Một loại Tiên Cổ, một cá thể xuyên các chuyển', `
      <p>Hai người cùng luyện một loại Cổ ở chuyển 6 và 7. Giữ chỗ được kiểm tra trước khi tiêu hao; đổi chuyển không tạo ngoại lệ cho tính duy nhất.</p>
      <div class="rules-stats">${stat('Cá thể đang tồn tại', String(mirrors.length))}${stat('Mẻ đang luyện', String(jobs.filter(job => job.status === 'working').length))}</div>
      <div class="rules-buttons">${button('rules-refine-a', 'Người A bắt đầu luyện chuyển 6')}${button('rules-refine-b', 'Người B bắt đầu luyện chuyển 7')}${button('rules-finish', 'Hoàn tất đúng kỹ thuật')}${button('rules-finish-bad', 'Hoàn tất với thao tác sai')}</div>
      <p class="rules-note">Thất bại tự nhiên, thao tác sai và mục tiêu đã tồn tại có kết quả khác nhau. Xác suất, phí và vật liệu trong bài thử là thông số thiết kế.</p>
      <ul>${jobs.slice(-4).map(job => `<li>${escape(state.actors[job.actorId]?.name)} · ${job.outputRank} chuyển · ${escape({ working: 'Đang luyện', succeeded: 'Thành công', failed: 'Thất bại' }[job.status])}</li>`).join('')}</ul>`);
  }

  private ascension(state: RulesSnapshot): string {
    const actor = state.actors[ids.ascender];
    const owned = Object.values(state.gu).filter(gu => gu.alive && gu.immortal && gu.ownerId === actor.id).length;
    return card('Toái khiếu → Nạp khí → Phóng Cổ', `
      <p>Nhân vật ngũ chuyển đỉnh phong đã được chuẩn bị riêng cho bài thử. Hấp thu vượt khả năng cân bằng có thể kết thúc cuộc đời mô phỏng.</p>
      <div class="rules-stats">${stat('Tu vi', `${actor.rank} chuyển`, 'rules-ascender-rank')}${stat('Thọ nguyên', `${years(actor.lifespanTicks)} năm`, 'rules-ascender-life')}${stat('Trạng thái', !actor.alive ? 'Đã mất' : actor.ascension?.stage === 'balanced' ? 'Tam khí đã cân bằng' : actor.ascension ? 'Đã toái khiếu' : 'Đang chuẩn bị')}${stat('Tiên Cổ sở hữu', String(owned), 'rules-immortal-owned')}</div>
      <div class="rules-buttons">${button('rules-shatter', '1 · Toái khiếu')}${button('rules-absorb', '2 · Nạp khí cân bằng')}${button('rules-absorb-risk', 'Thử hấp thu quá mức')}${button('rules-release', '3 · Phóng Cổ')}</div>
      <p class="rules-note">Thăng tiên tạo tiên khiếu theo điều kiện đã thỏa; không tự tăng thọ nguyên và không bảo đảm được Tiên Cổ. Công thức cân bằng tam khí ở đây là đề xuất mô phỏng.</p>`);
  }

  private time(state: RulesSnapshot): string {
    const aperture = state.apertures[ids.aperture];
    const owner = state.actors[ids.immortal];
    const ecology = aperture.ecology;
    return card('Thời gian thay đổi theo từng khoảng', `
      <p>Một năm ngoài ở ×1, rồi một năm ngoài ở ×20, tạo 21 năm trong khiếu. Người đang ở ngoài chỉ già theo thời gian ngoài; vào khiếu mới chịu nhịp bên trong.</p>
      <div class="rules-stats">${stat('Năm ngoài', years(state.outerTicks))}${stat('Năm trong khiếu', years(aperture.innerTicks), 'rules-inner-years')}${stat('Tuổi chủ nhân', `${years(owner.ageTicks)} năm`)}${stat('Chủ nhân hiện ở', owner.location === 'outer' ? 'Bên ngoài' : 'Bên trong khiếu')}</div>
      <div class="rules-buttons">${[1, 10, 20, 30].map(ratio => `<button type="button" id="rules-ratio-${ratio}" data-rules-action="rules-ratio-${ratio}" aria-pressed="${aperture.ratio === ratio}">×${ratio}</button>`).join('')}${button('rules-advance-one', 'Qua 1 năm ngoài')}${button('rules-place', aperture.placed ? 'Thu khiếu lên' : 'Đặt khiếu xuống')}${button('rules-enter', 'Đi vào khiếu')}${button('rules-leave', 'Rời khiếu')}${button('rules-water', 'Bổ sung 100 nước')}</div>
      <div class="rules-stats">${stat('Nước', number(ecology.water))}${stat('Thức ăn', number(ecology.food))}${stat('Cây / sức chứa', `${number(ecology.plants)} / ${number(ecology.plantCapacity)}`)}${stat('Môi trường', percent(ecology.habitatBps))}</div>
      <p class="rules-note">×1, ×10, ×20, ×30 là hệ số game được đề xuất. Tăng tốc đồng thời tăng sinh trưởng, tiêu hao và lịch tai kiếp; thiếu nước/thức ăn không tự tạo tài nguyên.</p>`);
  }

  private tribulation(state: RulesSnapshot): string {
    const trials = state.tribulations.filter(trial => trial.apertureId === ids.aperture);
    const aperture = state.apertures[ids.aperture];
    return card('Giữ đủ các tai kiếp trùng mốc', `
      <p>Bài thử khởi đầu ở lục chuyển, tỷ lệ ×10. Qua 30 năm ngoài là 300 năm nội khiếu; chủ nhân ở ngoài vẫn còn sống để thử vượt kiếp. Lịch có 30 địa tai và 3 thiên kiếp; năm 100, 200, 300 vẫn giữ cả hai sự kiện.</p>
      <div class="rules-stats">${stat('Năm trong khiếu', years(state.apertures[ids.aperture].innerTicks))}${stat('Địa tai', String(trials.filter(trial => trial.kind === 'earth').length), 'rules-earth-count')}${stat('Thiên kiếp', String(trials.filter(trial => trial.kind === 'heaven').length), 'rules-heaven-count')}${stat('Đang chờ', String(trials.filter(trial => trial.status === 'pending').length))}</div>
      <div class="rules-stats">${stat('Thạch phòng vệ', number(state.actors[ids.immortal].stones))}${stat('Đạo ngân', number(aperture.daoMarks), 'rules-dao-marks')}${stat('Sinh cảnh', percent(aperture.ecology.habitatBps))}</div>
      <div class="rules-buttons">${button('rules-advance-three-hundred', 'Qua 300 năm nội khiếu (30 năm ngoài)')}${button('rules-defend', 'Chuẩn bị vượt kiếp đầu hàng đợi')}${button('rules-fail-tribulation', 'Thử thất bại tai kiếp đầu')}</div>
      <ol>${trials.filter(trial => trial.status === 'pending').slice(0, 8).map(trial => `<li>Năm ${trial.dueInnerYear}: ${TRIBULATION_LABELS[trial.kind]}</li>`).join('')}</ol>
      <p class="rules-note">Tai kiếp gây tổn hại môi trường; vượt kiếp có chi phí và lợi ích. Đây là mô hình lịch, không phải trận chiến tai kiếp nhiều người hay đặc tả đầy đủ điều kiện thành Tôn.</p>`);
  }

  private render(): void {
    const state = this.engine.snapshot();
    const scroll = this.card.querySelector<HTMLElement>('.rules-body')?.scrollTop ?? 0;
    this.card.innerHTML = `
      <header class="rules-header"><div><span class="rules-eyebrow">THƯ VIỆN TU LUYỆN</span><h2 id="rules-title">Phòng thử quy luật</h2></div><button type="button" data-rules-action="close" aria-label="Đóng phòng thử">${icon('close')}</button></header>
      <div class="rules-body"><p class="rules-notice">Dữ liệu mô phỏng riêng cho từng bài. Thao tác ở đây không thay đổi nhân vật, bản lưu hay tài sản Ngũ Vực. Các hệ số cân bằng là đề xuất thiết kế.</p>
      <nav class="rules-tabs" aria-label="Bài thử">${Object.entries(lessons).map(([id, label]) => `<button type="button" data-rules-view="${id}" aria-pressed="${id === this.lesson}">${label}</button>`).join('')}</nav>
      <div id="rules-result" class="rules-result ${this.ok ? '' : 'is-error'}" data-ok="${this.ok}" role="status" aria-live="polite">${escape(this.message)}</div>
      ${this[this.lesson](state)}
      ${this.events.length ? `<ul class="rules-events">${this.events.map(message => `<li>${escape(message)}</li>`).join('')}</ul>` : ''}
      <footer><button type="button" data-rules-action="reset">Bắt đầu lại bài thử</button><span>1000 nhịp mô phỏng = 1 năm; không phải giờ thực.</span></footer></div>`;
    const body = this.card.querySelector<HTMLElement>('.rules-body');
    if (body) body.scrollTop = scroll;
  }
}

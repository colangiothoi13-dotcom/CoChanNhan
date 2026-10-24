import { InventorySystem } from '../systems/InventorySystem';
import { closeModal, openModal } from './Modal';
import {
  WIKI_BAN_MENH,
  WIKI_BEASTS,
  WIKI_CO_DUYEN,
  WIKI_DUNGEONS,
  WIKI_FEATURE_GROUPS,
  WIKI_GU_LIST,
  WIKI_ITEMS,
  WIKI_LUU_PHAI_FILTERS,
  WIKI_RECIPES,
  WIKI_SAT_CHIEU,
  WIKI_ZONES,
  WikiGuEntry,
  WikiRefItem,
  renderAtlasSprite,
  searchWikiIndex,
} from '../data/wikiData';

export type WikiPageId =
  | 'tong-quan'
  | 'co'
  | 'van-co-luc'
  | 'co-phuong'
  | 'sat-chieu'
  | 'vat-pham'
  | 'thu'
  | 'ban-do'
  | 'cam-nang';

const CHUYEN_TITLES: Readonly<Record<number, string>> = {
  1: 'Nhất chuyển',
  2: 'Nhị chuyển',
  3: 'Tam chuyển',
  4: 'Tứ chuyển',
  5: 'Ngũ chuyển',
};

const APP_TO_WIKI_GU: Readonly<Record<string, string>> = {
  moonlight: 'gu_nguyet_quang',
  bronze: 'gu_dong_bi',
  boar: 'gu_bach_thi',
  heal: 'gu_tieu_sinh_co_thao',
  moonblade: 'gu_nguyet_mang',
  ironskin: 'gu_thiet_cot',
};

export class WikiModal {
  private modal: HTMLElement | null = null;
  private btnClose: HTMLElement | null = null;
  private btnOpen: HTMLElement | null = null;
  private contentRoot: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private searchResults: HTMLElement | null = null;
  private navButtons: NodeListOf<HTMLButtonElement> | null = null;
  private sidebarDetails: HTMLDetailsElement | null = null;

  private activePage: WikiPageId = 'tong-quan';
  private activeLpFilter = '';
  private selectedGuId: string | null = null;
  private selectedVclGuId: string = 'gu_song_khieu_hoa_than';
  private vclRankFilter: number = 2;
  private searchHighlightIdx = -1;

  constructor(
    private inventory: InventorySystem,
  ) {
    this.modal = document.getElementById('modal-wiki');
    this.btnClose = document.getElementById('btn-close-wiki');
    this.btnOpen = document.getElementById('btn-open-wiki');
    this.contentRoot = document.getElementById('wiki-main-content');
    this.searchInput = document.getElementById('wiki-tim') as HTMLInputElement | null;
    this.searchResults = document.getElementById('wiki-tim-kq');
    this.navButtons = this.modal?.querySelectorAll<HTMLButtonElement>('[data-wiki-tab]') ?? null;
    this.sidebarDetails = document.getElementById('wiki-ben') as HTMLDetailsElement | null;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.btnOpen?.addEventListener('click', () => this.open());
    this.btnClose?.addEventListener('click', () => this.close());
    this.modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.close());

    // Optional shortcuts from Inventory / Refine modals
    document.querySelectorAll<HTMLElement>('[data-open-wiki]').forEach((trigger) => {
      trigger.addEventListener('click', () => {
        const targetTab = (trigger.getAttribute('data-open-wiki') || 'tong-quan') as WikiPageId;
        this.open(targetTab);
      });
    });

    this.navButtons?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = (btn.getAttribute('data-wiki-tab') || 'tong-quan') as WikiPageId;
        this.selectedGuId = null;
        this.navigateTo(page);
      });
    });

    // Live search box (faithful to /wiki/wiki.js initTim)
    if (this.searchInput && this.searchResults) {
      this.searchInput.setAttribute('role', 'combobox');
      this.searchInput.setAttribute('aria-autocomplete', 'list');
      this.searchInput.setAttribute('aria-controls', this.searchResults.id);
      this.searchInput.setAttribute('aria-expanded', String(!this.searchResults.hidden));
      this.searchResults.setAttribute('aria-label', 'Kết quả tìm kiếm');
      this.searchInput.addEventListener('input', () => this.updateSearchDropdown());
      this.searchInput.addEventListener('focus', () => {
        if (this.searchInput && this.searchInput.value.trim()) {
          this.updateSearchDropdown();
        }
      });
      this.searchInput.addEventListener('keydown', (e) => {
        if (!this.searchResults || this.searchResults.hidden) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          this.hideSearchDropdown();
          return;
        }
        const items = this.searchResults.querySelectorAll<HTMLElement>('a[data-search-idx]');
        if (!items.length) return;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.setSearchHighlight((this.searchHighlightIdx + 1) % items.length, items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.setSearchHighlight(this.searchHighlightIdx < 0 ? items.length - 1 : (this.searchHighlightIdx - 1 + items.length) % items.length, items);
        } else if (e.key === 'Enter' && this.searchHighlightIdx >= 0 && items[this.searchHighlightIdx]) {
          e.preventDefault();
          items[this.searchHighlightIdx].click();

        }
      });
    }

    // Delegated clicks inside Wiki content & search results
    this.modal?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Hide search dropdown when clicking outside .wiki-tim
      if (this.searchResults && !this.searchResults.hidden && !target.closest('.wiki-tim')) {
        this.hideSearchDropdown();
      }

      const guLink = target.closest<HTMLElement>('[data-wiki-gu]');
      if (guLink) {
        e.preventDefault();
        const guId = guLink.getAttribute('data-wiki-gu');
        if (guId) {
          this.hideSearchDropdown();
          this.openGuDetail(guId);
        }
        return;
      }

      const navLink = target.closest<HTMLElement>('[data-wiki-goto]');
      if (navLink) {
        e.preventDefault();
        const page = (navLink.getAttribute('data-wiki-goto') || 'tong-quan') as WikiPageId;
        const targetId = navLink.getAttribute('data-wiki-target') || '';
        this.hideSearchDropdown();
        this.selectedGuId = page === 'co' && targetId.startsWith('gu_') ? targetId : null;
        this.navigateTo(page, targetId);
        return;
      }

      const filterBtn = target.closest<HTMLButtonElement>('[data-loc]');
      if (filterBtn) {
        this.activeLpFilter = filterBtn.getAttribute('data-loc') || '';
        this.renderPage();
        const replacement = [...(this.contentRoot?.querySelectorAll<HTMLButtonElement>('[data-loc]') ?? [])]
          .find((button) => button.getAttribute('data-loc') === this.activeLpFilter);
        replacement?.focus();
        return;
      }

      const backBtn = target.closest<HTMLButtonElement>('[data-wiki-back]');
      if (backBtn) {
        this.selectedGuId = null;
        this.renderPage();
        return;
      }

      const vclGu = target.closest<HTMLElement>('[data-vcl-gu]');
      if (vclGu) {
        e.preventDefault();
        const id = vclGu.getAttribute('data-vcl-gu');
        if (id) {
          this.selectedVclGuId = id;
          this.renderPage();
        }
        return;
      }

      const vclRank = target.closest<HTMLButtonElement>('[data-vcl-rank]');
      if (vclRank) {
        e.preventDefault();
        const rank = parseInt(vclRank.getAttribute('data-vcl-rank') || '2', 10);
        this.vclRankFilter = rank;
        this.renderPage();
        return;
      }
    });
  }

  private setSearchHighlight(idx: number, items: NodeListOf<HTMLElement>): void {
    this.searchHighlightIdx = idx;
    items.forEach((el, i) => {
      el.setAttribute('aria-selected', String(i === idx));
      if (i === idx) el.classList.add('chon');
      else el.classList.remove('chon');
    });
    if (items[idx]) {
      this.searchInput?.setAttribute('aria-activedescendant', items[idx].id);
      items[idx].scrollIntoView?.({ block: 'nearest' });
    }
  }

  private hideSearchDropdown(): void {
    if (!this.searchResults) return;
    this.searchResults.hidden = true;
    this.searchHighlightIdx = -1;
    this.searchInput?.setAttribute('aria-expanded', 'false');
    this.searchInput?.removeAttribute('aria-activedescendant');
  }

  private updateSearchDropdown(): void {
    if (!this.searchInput || !this.searchResults) return;
    const q = this.searchInput.value.trim();
    if (!q) {
      this.hideSearchDropdown();
      return;
    }
    const matches = searchWikiIndex(q, 12);
    this.searchHighlightIdx = -1;
    this.searchInput.setAttribute('aria-expanded', 'true');
    this.searchInput.removeAttribute('aria-activedescendant');
    if (!matches.length) {
      this.searchResults.innerHTML = `<li class="khong" role="presentation"><span role="status">Không thấy mục nào khớp.</span></li>`;
      this.searchResults.hidden = false;
      return;
    }
    this.searchResults.innerHTML = matches
      .map((m, idx) => {
        const sprite = renderAtlasSprite(m.targetId, 18) || '';
        const isGu = m.tab === 'co' && m.targetId.startsWith('gu_');
        const dataAttrs = isGu
          ? `data-wiki-gu="${m.targetId}"`
          : `data-wiki-goto="${m.tab}" data-wiki-target="${m.targetId}"`;
        return `<li role="presentation"><a id="wiki-search-result-${idx}" href="#${m.targetId}" data-search-idx="${idx}" ${dataAttrs} role="option" aria-selected="false" tabindex="-1"><span class="ten">${sprite}<span>${m.title}</span><span class="loai">${m.kind}</span></span>${
          m.sub ? `<span class="phu">${m.sub}</span>` : ''
        }</a></li>`;
      })
      .join('');
    this.searchResults.hidden = false;
  }

  public open(initialPage?: WikiPageId, guId?: string): void {
    if (initialPage) this.activePage = initialPage;
    if (guId) {
      this.activePage = 'co';
      this.selectedGuId = guId;
    }
    if (this.sidebarDetails) {
      this.sidebarDetails.open = window.innerWidth > 860;
    }
    this.syncNavState();
    this.renderPage();
    openModal(this.modal, this.btnOpen);
  }

  public close(): void {
    this.hideSearchDropdown();
    closeModal(this.modal);
  }

  public navigateTo(page: WikiPageId, scrollTargetId = ''): void {
    this.activePage = page;
    if (this.sidebarDetails && window.innerWidth <= 860) {
      this.sidebarDetails.open = false;
    }
    this.syncNavState();
    this.renderPage();
    if (scrollTargetId && this.contentRoot) {
      const targetEl = this.contentRoot.querySelector<HTMLElement>(`#wiki-anchor-${scrollTargetId}`);
      if (targetEl) {
        targetEl.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    }
  }

  public openGuDetail(guId: string): void {
    const resolvedId = APP_TO_WIKI_GU[guId] ?? guId;
    this.activePage = 'co';
    this.selectedGuId = resolvedId;
    this.syncNavState();
    this.renderPage();
  }

  private syncNavState(): void {
    this.navButtons?.forEach((btn) => {
      const active = btn.getAttribute('data-wiki-tab') === this.activePage;
      btn.setAttribute('aria-pressed', String(active));
      if (active) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    this.modal?.querySelectorAll<HTMLElement>('.wiki-ben a[data-wiki-goto]').forEach((link) => {
      const active = link.getAttribute('data-wiki-goto') === this.activePage;
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  private isWikiGuOwned(wikiGuId: string): boolean {
    const entry = WIKI_GU_LIST.find((g) => g.id === wikiGuId);
    if (entry?.appId && this.inventory.hasGu(entry.appId)) return true;
    return this.inventory.hasGu(wikiGuId);
  }

  private renderRefItem(item: WikiRefItem): string {
    const sprite = renderAtlasSprite(item.id, 20) || '';
    const isGu = item.id.startsWith('gu_');
    const attr = isGu ? `data-wiki-gu="${item.id}"` : `data-wiki-goto="vat-pham" data-wiki-target="${item.id}"`;
    const countSuffix = item.count > 1 ? ` <span class="wiki-qty">×${item.count}</span>` : '';
    return `<a class="mon" href="#${item.id}" ${attr}>${sprite}${item.name}</a>${countSuffix}`;
  }

  public renderPage(): void {
    if (!this.contentRoot) return;
    switch (this.activePage) {
      case 'tong-quan':
        this.contentRoot.innerHTML = this.renderTongQuan();
        break;
      case 'co':
        this.contentRoot.innerHTML = this.selectedGuId
          ? this.renderGuDetail(this.selectedGuId)
          : this.renderCoList();
        break;
      case 'van-co-luc':
        this.contentRoot.innerHTML = this.renderVanCoLuc();
        break;
      case 'co-phuong':
        this.contentRoot.innerHTML = this.renderCoPhuong();
        break;
      case 'sat-chieu':
        this.contentRoot.innerHTML = this.renderSatChieu();
        break;
      case 'vat-pham':
        this.contentRoot.innerHTML = this.renderVatPham();
        break;
      case 'thu':
        this.contentRoot.innerHTML = this.renderThu();
        break;
      case 'ban-do':
        this.contentRoot.innerHTML = this.renderBanDo();
        break;
      case 'cam-nang':
        this.contentRoot.innerHTML = this.renderCamNang();
        break;
    }
    const modalBody = this.modal?.querySelector<HTMLElement>('.modal-body');
    if (modalBody) modalBody.scrollTop = 0;
  }

  private renderTongQuan(): string {
    const ownedCount = this.inventory.ownedGuIds.length;
    const sampleSprites = [
      'gu_nguyet_quang',
      'gu_tuu_trung',
      'gu_dong_bi',
      'gu_bach_thi',
      'gu_tieu_sinh_co_thao',
      'gu_nguyet_mang',
      'gu_thiet_cot',
      'gu_kim_nguyet',
      'gu_huyet_nguyet',
      'gu_thanh_phong_luan',
    ]
      .map((id) => {
        const gu = WIKI_GU_LIST.find((g) => g.id === id);
        if (!gu) return '';
        return `<a class="mon wiki-featured-gu" href="#${gu.id}" data-wiki-gu="${gu.id}">${renderAtlasSprite(gu.id, 28) || ''}<span>${gu.name}</span></a>`;
      })
      .filter(Boolean)
      .join('');

    const featureGroupsHtml = WIKI_FEATURE_GROUPS.map(
      (fg) => `
      <section class="nhom-tn wiki-defer-section">
        <h3>${fg.group}</h3>
        <ul>
          ${fg.items
            .map(
              (item) => `
            <li>
              <a href="#cam-nang" data-wiki-goto="cam-nang">${item.title}</a><br>
              <small>${item.summary}</small>
            </li>`,
            )
            .join('')}
        </ul>
      </section>`,
    ).join('');

    return `
      <div class="wiki-article">
        <h1>Cẩm nang Cổ Tiên Lộ</h1>
        <p class="wiki-lead">Cẩm nang tra cứu trực tiếp từ dữ liệu <strong>cotienlo.com/wiki/</strong>: cách chơi, cách mạnh lên, 377 loài cổ trùng (Nhất → Ngũ chuyển), 70 cổ phương hợp luyện, 23 sát chiêu, 26 bộ Vạn Cổ Lục, 365 vật phẩm, 72 loài thú và 16 vùng bản đồ. Tiến độ Cổ Sư hiện tại: <strong>${ownedCount} cổ trùng trong túi</strong>.</p>

        <div class="wiki-featured-strip" aria-label="Cổ trùng tiêu biểu">
          ${sampleSprites}
        </div>

        <div class="luoi-the">
          <a class="the" href="#cam-nang" data-wiki-goto="cam-nang"><b>Bắt đầu chơi</b><span>Điều khiển máy tính &amp; điện thoại, lễ khai khiếu, những việc đầu tiên ở sơn trại.</span></a>
          <a class="the" href="#cam-nang" data-wiki-goto="cam-nang"><b>Cách mạnh lên</b><span>Trục dọc (cảnh giới) và trục ngang (cổ, lưu phái, hộ cụ, rèn thân, nghề, gia viên).</span></a>
          <a class="the" href="#co" data-wiki-goto="co"><b>Cổ trùng (${WIKI_GU_LIST.length} loài)</b><span>Đầy đủ Nhất → Ngũ chuyển theo 28 lưu phái, hình ảnh cổ trùng, thức ăn và cách nhận.</span></a>
          <a class="the" href="#van-co-luc" data-wiki-goto="van-co-luc"><b>Vạn Cổ Lục &amp; Bản mệnh</b><span>${WIKI_CO_DUYEN.length} bộ cổ duyên cộng chỉ số vĩnh viễn và ${WIKI_BAN_MENH.length} cổ bản mệnh cộng hưởng.</span></a>
          <a class="the" href="#co-phuong" data-wiki-goto="co-phuong"><b>Cổ phương (${WIKI_RECIPES.length} công thức)</b><span>Công thức hợp luyện cổ chính + nguyên liệu phụ, tỉ lệ gốc và thời gian.</span></a>
          <a class="the" href="#sat-chieu" data-wiki-goto="sat-chieu"><b>Sát chiêu (${WIKI_SAT_CHIEU.length} chiêu)</b><span>Kết hợp 2–3 cổ trùng thành sát chiêu uy lực theo lưu phái.</span></a>
          <a class="the" href="#vat-pham" data-wiki-goto="vat-pham"><b>Vật phẩm (${WIKI_ITEMS.length} món)</b><span>Vật liệu, thức ăn cổ, đồ tiêu hao, hộ cụ, thời trang và nguyên thạch.</span></a>
          <a class="the" href="#thu" data-wiki-goto="thu"><b>Thú (${WIKI_BEASTS.length} loài)</b><span>Thú thường, thú tinh anh, thú vương, nơi ở và vật phẩm rơi.</span></a>
          <a class="the" href="#ban-do" data-wiki-goto="ban-do"><b>Bản đồ &amp; Phó bản (${WIKI_ZONES.length} vùng)</b><span>16 vùng an toàn, cờ tự chọn, tranh chấp và 7 phó bản thú huyệt.</span></a>
        </div>

        <h2 id="tinh-nang">Tính năng theo nhóm</h2>
        <div class="luoi-nhom">
          ${featureGroupsHtml}
        </div>
      </div>
    `;
  }

  private renderCoList(): string {
    const filterButtons = WIKI_LUU_PHAI_FILTERS.map(
      (f) =>
        `<button type="button" class="wiki-loc-btn ${this.activeLpFilter === f.code ? 'chon' : ''}" data-loc="${f.code}">${f.label}</button>`,
    ).join('');

    const filtered = this.activeLpFilter
      ? WIKI_GU_LIST.filter((g) => g.lpCode === this.activeLpFilter)
      : WIKI_GU_LIST;

    const sectionsHtml = [1, 2, 3, 4, 5]
      .map((chuyen) => {
        const group = filtered.filter((g) => g.chuyen === chuyen);
        if (!group.length) return '';
        const rows = group
          .map((g) => {
            const sprite = renderAtlasSprite(g.id, 22) || '';
            const ownedBadge = this.isWikiGuOwned(g.id)
              ? `<span class="wiki-owned-pill">Đã sở hữu</span>`
              : '';
            return `<tr id="wiki-anchor-${g.id}" data-lp="${g.lpCode}">
              <td><a class="mon" href="#${g.id}" data-wiki-gu="${g.id}">${sprite}<span>${g.name}</span></a> ${ownedBadge}</td>
              <td>${g.lpName}</td>
              <td>${g.role}</td>
              <td><a class="mon" href="#${g.foodId}" data-wiki-goto="vat-pham" data-wiki-target="${g.foodId}">${renderAtlasSprite(g.foodId, 18) || ''}<span>${g.foodName}</span></a></td>
            </tr>`;
          })
          .join('');
        return `
          <section class="wiki-chuyen-section ${chuyen > 1 ? 'wiki-defer-section' : ''}">
            <h2 id="chuyen-${chuyen}">${CHUYEN_TITLES[chuyen]} (${group.length} loài)</h2>
            <div class="bang">
              <table>
                <thead><tr><th>Tên cổ trùng</th><th>Lưu phái</th><th>Vai trò</th><th>Thức ăn</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </section>
        `;
      })
      .join('');

    return `
      <div class="wiki-article">
        <h1>Cổ trùng (${filtered.length}/${WIKI_GU_LIST.length} loài)</h1>
        <p class="wiki-lead">Danh mục cổ trùng theo chuyển và lưu phái. Bấm vào tên cổ trùng để xem hình ảnh 64×64, chữ Hán, kỹ năng, thức ăn nuôi dưỡng, cổ phương hợp luyện và bộ cổ duyên.</p>
        <div class="loc" role="group" aria-label="Lọc theo lưu phái">
          ${filterButtons}
        </div>
        ${sectionsHtml || '<p class="empty-state">Không có cổ trùng nào thuộc lưu phái này.</p>'}
      </div>
    `;
  }

  private renderGuDetail(guId: string): string {
    const gu: WikiGuEntry | undefined =
      WIKI_GU_LIST.find((g) => g.id === guId || g.appId === guId) ?? WIKI_GU_LIST[0];
    const bigSprite = renderAtlasSprite(gu.id, 64, 'ic-to') || '';
    const owned = this.isWikiGuOwned(gu.id);

    const recipesAsResult = WIKI_RECIPES.filter((r) => r.result.id === gu.id);
    const recipesAsIngredient = WIKI_RECIPES.filter(
      (r) => r.primary.id === gu.id || r.secondary.some((s) => s.id === gu.id),
    );
    const coDuyenSets = WIKI_CO_DUYEN.filter((s) => s.members.some((m) => m.id === gu.id));
    const satChieuMatches = WIKI_SAT_CHIEU.filter((sc) => sc.components.some((c) => c.id === gu.id));
    const banMenhMatch = WIKI_BAN_MENH.find((bm) => bm.gu.id === gu.id);

    return `
      <div class="wiki-article">
        <p class="duong"><a href="#co" data-wiki-goto="co">Cổ trùng</a> › ${CHUYEN_TITLES[gu.chuyen] || `${gu.chuyen} chuyển`}</p>
        <div class="wiki-detail-toolbar">
          <button type="button" class="wiki-back-btn" data-wiki-back="co">← Danh sách Cổ trùng</button>
          ${owned ? '<span class="wiki-owned-pill">Đang sở hữu trong túi</span>' : ''}
        </div>

        <div class="dau-mon">
          ${bigSprite}
          <div>
            <h1>${gu.name} ${gu.han ? `<span class="han">${gu.han}</span>` : ''}</h1>
            <p class="wiki-sub-meta">${CHUYEN_TITLES[gu.chuyen]} · ${gu.lpName} · ${gu.role}</p>
          </div>
        </div>

        <div class="bang the-tom">
          <table>
            <tbody>
              <tr><th>Chuyển</th><td>${CHUYEN_TITLES[gu.chuyen]}</td></tr>
              <tr><th>Lưu phái</th><td>${gu.lpName}</td></tr>
              <tr><th>Vai</th><td>${gu.role}</td></tr>
              <tr><th>Cách dùng</th><td>${gu.activation}</td></tr>
              <tr><th>Chân nguyên</th><td>${gu.cn}</td></tr>
              <tr><th>Hồi chiêu</th><td>${gu.cooldown} giây</td></tr>
            </tbody>
          </table>
        </div>

        <h2>Kỹ năng</h2>
        <p>${gu.description || 'Vận chuyển chân nguyên thúc giục cổ trùng phát huy uy năng bản thể.'}</p>
        ${
          banMenhMatch
            ? `<p><b>Cộng hưởng Bản mệnh (${banMenhMatch.lpName}):</b> ${banMenhMatch.synergy}</p>`
            : ''
        }

        <h2>Nuôi cổ</h2>
        <p>Ăn <a class="mon" href="#${gu.foodId}" data-wiki-goto="vat-pham" data-wiki-target="${gu.foodId}">${renderAtlasSprite(gu.foodId, 20) || ''}${gu.foodName}</a> ×${gu.foodAmount} mỗi ${gu.foodHours} giờ (khoảng ${Math.round((24 / Math.max(gu.foodHours, 1)) * gu.foodAmount)} món / ngày).</p>

        <h2>Cách nhận &amp; Cổ phương</h2>
        <ul>
          ${gu.wildZone ? `<li><b>Bắt dã cổ:</b> Xuất hiện tại vùng <strong>${gu.wildZone}</strong>.</li>` : ''}
          ${
            recipesAsResult.length
              ? recipesAsResult
                  .map(
                    (r) =>
                      `<li><b>Hợp luyện ra cổ này:</b> Cổ chính ${this.renderRefItem(r.primary)} + Phụ ${r.secondary.map((s) => this.renderRefItem(s)).join(', ')} (${r.rate}, ${r.duration}).</li>`,
                  )
                  .join('')
              : '<li><b>Nguồn cơ bản:</b> Khai khiếu, kho gia tộc, Thương hội hoặc thưởng nhiệm vụ.</li>'
          }
          ${
            recipesAsIngredient.length
              ? recipesAsIngredient
                  .map(
                    (r) =>
                      `<li><b>Dùng để hợp luyện:</b> Luyện thành ${this.renderRefItem(r.result)} (tỉ lệ ${r.rate}).</li>`,
                  )
                  .join('')
              : ''
          }
        </ul>

        ${
          coDuyenSets.length
            ? `<h2>Bộ cổ duyên (Vạn Cổ Lục)</h2><ul>${coDuyenSets
                .map(
                  (s) =>
                    `<li><b>${s.name}:</b> ${s.members.map((m) => this.renderRefItem(m)).join(' · ')}</li>`,
                )
                .join('')}</ul>`
            : ''
        }

        ${
          satChieuMatches.length
            ? `<h2>Sát chiêu liên quan</h2><ul>${satChieuMatches
                .map(
                  (sc) =>
                    `<li><a href="#${sc.id}" data-wiki-goto="sat-chieu" data-wiki-target="${sc.id}"><b>${sc.name}</b></a> (${sc.lpName} · ${sc.tier}): ${sc.description}</li>`,
                )
                .join('')}</ul>`
            : ''
        }
      </div>
    `;
  }

  private renderVanCoLuc(): string {
    const defaultGuId = this.selectedVclGuId || 'gu_song_khieu_hoa_than';
    const selectedGu = WIKI_GU_LIST.find((g) => g.id === defaultGuId) || WIKI_GU_LIST[0];

    // Grid of Gu items for Rank 2 (matching Image 1 from cotienlo.com)
    const rankGuList = [
      { id: 'gu_bang_dao', name: 'Băng Dao cổ', stars: 2, glyph: '🗡️', defaultLp: 'Băng tuyết đạo' },
      { id: 'gu_cuu_diep_sinh_co_thao', name: 'Cửu Diệp Sinh Cơ Thảo', stars: 3, glyph: '🍀', defaultLp: 'Mộc đạo' },
      { id: 'gu_hac_tong', name: 'Hắc Tống cổ', stars: 2, glyph: '🦔', defaultLp: 'Biến hóa đạo' },
      { id: 'gu_nguyet_mang', name: 'Nguyệt Mang cổ', stars: 2, glyph: '🌙', defaultLp: 'Nguyệt đạo' },
      { id: 'gu_song_khieu_hoa_than', name: 'Song Khiếu Hỏa Lô cổ', stars: 2, glyph: '🏺', defaultLp: 'Viêm đạo' },
      { id: 'gu_nguyet_quang', name: 'Nguyệt Quang cổ', stars: 1, glyph: '✨', defaultLp: 'Nguyệt đạo' },
      { id: 'gu_bach_thi', name: 'Bạch Trư cổ', stars: 1, glyph: '🐗', defaultLp: 'Lực đạo' },
      { id: 'gu_dong_bi', name: 'Thanh Đồng Giáp', stars: 1, glyph: '🛡️', defaultLp: 'Biến hóa đạo' },
      { id: 'gu_tuu_trung', name: 'Tửu Trùng', stars: 1, glyph: '🍶', defaultLp: 'Tửu đạo' },
      { id: 'gu_thinh_nhi_thao', name: 'Thính Nhĩ Thảo', stars: 2, glyph: '👂', defaultLp: 'Thổ đạo' },
      { id: 'gu_thien_bong', name: 'Thiên Bồng cổ', stars: 3, glyph: '🐖', defaultLp: 'Biến hóa đạo' },
      { id: 'gu_thiet_cot', name: 'Thiết Cốt cổ', stars: 2, glyph: '🦴', defaultLp: 'Cốt đạo' },
    ];

    const cardsHtml = rankGuList.map((g) => {
      const isSelected = g.id === selectedGu.id || (g.name === selectedGu.name);
      const isOwned = this.inventory.hasGu(g.id.replace('gu_', '')) ||
        ['gu_song_khieu_hoa_than', 'gu_bang_dao', 'gu_cuu_diep_sinh_co_thao', 'gu_hac_tong', 'gu_nguyet_mang'].includes(g.id);
      const spriteHtml = renderAtlasSprite(g.id, 28) || `<span class="vcl-card-icon">${g.glyph}</span>`;
      const starsStr = '★'.repeat(g.stars);

      return `
        <div class="vcl-gu-card ${isSelected ? 'selected' : ''} ${isOwned ? 'discovered' : 'undiscovered'}" data-vcl-gu="${g.id}" role="button" tabindex="0" aria-label="${g.name}">
          <div class="vcl-card-sprite">${spriteHtml}</div>
          <div class="vcl-card-name">${g.name}</div>
          <div class="vcl-card-stars">${starsStr}</div>
        </div>
      `;
    }).join('');

    const heroSprite = renderAtlasSprite(selectedGu.id, 40) || '🏺';
    const guLore = selectedGu.description || 'Trang khí rồi là của mình, bản huy mãi cổ vẫn giữ.';
    const habitat = selectedGu.wildZone || 'Vách đá Thanh Mao Sơn / Suối Cổ Nguyệt';
    const rankTitle = CHUYEN_TITLES[selectedGu.chuyen] || 'Nhị chuyển';

    return `
      <div class="van-co-luc-tome">
        <!-- LEFT PAGE -->
        <div class="vcl-page vcl-page-left">
          <div class="vcl-book-header">
            <div>
              <h2 class="vcl-book-title">Vạn Cổ Lục</h2>
              <div class="vcl-book-meta">Đã biết 12 / 118 loài · cổ phổ 10 / 60</div>
            </div>
            <div class="vcl-book-meta">Nhị · trang 1 / 2</div>
          </div>

          <div class="vcl-book-tabs">
            <button type="button" class="vcl-tab-pill active">Vạn Cổ Lục</button>
            <button type="button" class="vcl-tab-pill">Thủ phổ</button>
          </div>

          <div class="vcl-rank-pills">
            <button type="button" class="vcl-rank-btn ${this.vclRankFilter === 1 ? 'active' : ''}" data-vcl-rank="1">Nhất</button>
            <button type="button" class="vcl-rank-btn ${this.vclRankFilter === 2 ? 'active' : ''}" data-vcl-rank="2">Nhị</button>
            <button type="button" class="vcl-rank-btn ${this.vclRankFilter === 3 ? 'active' : ''}" data-vcl-rank="3">Tam</button>
            <button type="button" class="vcl-rank-btn ${this.vclRankFilter === 4 ? 'active' : ''}" data-vcl-rank="4">Tứ</button>
            <button type="button" class="vcl-rank-btn ${this.vclRankFilter === 5 ? 'active' : ''}" data-vcl-rank="5">Ngũ</button>
          </div>

          <div class="vcl-discovery-grid">
            ${cardsHtml}
          </div>

          <div class="vcl-legend">
            <span>▣ Luyện hóa: có hình</span>
            <span>◉ Tận mắt: bóng đậm</span>
            <span>◎ Nghe danh: bóng nhạt</span>
            <span>— Chưa biết: ô trống</span>
          </div>
        </div>

        <!-- RIGHT PAGE -->
        <div class="vcl-page vcl-page-right">
          <div class="vcl-folio-card">
            <div class="vcl-folio-hero">
              <div class="vcl-folio-emblem">${heroSprite}</div>
              <div class="vcl-folio-heading">
                <h3>${selectedGu.name}</h3>
                <div class="vcl-folio-sub">${rankTitle} · ${selectedGu.role || 'Công'} · ${selectedGu.lpName || 'Viêm đạo'}</div>
              </div>
            </div>

            <div class="vcl-folio-quote">${guLore}</div>

            <div class="vcl-mastery-grid">
              <div class="vcl-mastery-box checked">
                <strong>1. Nghe danh</strong><br>
                <small>đọc sách, nghe kể, nhặt cổ phương ✓</small>
              </div>
              <div class="vcl-mastery-box checked">
                <strong>2. Tận mắt</strong><br>
                <small>thấy dã cổ, bị đánh bằng cổ đó ✓</small>
              </div>
              <div class="vcl-mastery-box checked">
                <strong>3. Luyện hóa</strong><br>
                <small>lần đầu - tính vào cổ phổ +20 điểm ✓</small>
              </div>
              <div class="vcl-mastery-box">
                <strong>4. Tinh thông</strong><br>
                <small>dùng trong trận, nuôi lâu (1-5 sao)</small>
              </div>
            </div>

            <div class="vcl-habitat-row">
              <div><b>Nơi sống:</b> ${habitat}</div>
              <div><b>Thời tiết:</b> Mọi thời tiết</div>
            </div>

            <div class="vcl-skills-box">
              <strong>Kỹ năng chi tiết:</strong><br>
              • Gây ${selectedGu.cn * 3 + 20} sát thương gốc.<br>
              • Hiệu ứng: Tấn công uy lực tầm xa 9 mét.<br>
              • Tiêu hao: ${selectedGu.cn || 25} Chân nguyên · Hồi chiêu: ${selectedGu.cooldown || 1} giây.
            </div>
          </div>

          <!-- Bottom Milestone Bar -->
          <div class="vcl-milestone-bar">
            <div class="vcl-milestone-header">
              <span>Điểm ghi chép <strong>180</strong> (còn 70 tới mốc 250)</span>
              <span>Cổ duyên: 2/5</span>
            </div>
            <div class="vcl-milestone-track">
              <div class="vcl-milestone-fill" style="width: 72%;"></div>
            </div>
            <div class="vcl-milestone-nodes">
              <span>100</span>
              <span>250 (+1% HP)</span>
              <span>500</span>
              <span>800</span>
              <span>1200</span>
              <span>1800</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderCoPhuong(): string {
    const rows = WIKI_RECIPES.map(
      (r) => `
      <tr id="wiki-anchor-${r.result.id}">
        <td>${this.renderRefItem(r.result)}</td>
        <td>${this.renderRefItem(r.primary)}</td>
        <td>${r.secondary.map((s) => this.renderRefItem(s)).join(', ')}</td>
        <td>${r.rate}</td>
        <td>${r.duration}</td>
      </tr>`,
    ).join('');

    return `
      <div class="wiki-article">
        <h1>Cổ phương (${WIKI_RECIPES.length} công thức hợp luyện)</h1>
        <p class="wiki-lead">Hợp luyện dùng một <strong>cổ chính</strong> (đã luyện hóa, không đang lắp, không phải bản mệnh) cùng các <strong>nguyên liệu phụ</strong> để luyện thành cổ chuyển cao hơn. Thất bại mất nguyên liệu phụ; cổ chính chỉ bị thương tạm thời.</p>

        <div class="wiki-callout">
          <b>Phối phương Lô Đỉnh đang mở nhanh trong bản Mobile:</b>
          <ul>
            <li>${this.renderRefItem({ id: 'gu_nguyet_mang', name: 'Nguyệt Mang cổ (Nguyệt Nhận Cổ)', count: 1 })} = ${this.renderRefItem({ id: 'gu_nguyet_quang', name: 'Nguyệt Quang cổ', count: 1 })} + ${this.renderRefItem({ id: 'gu_bach_thi', name: 'Bạch Thỉ cổ (Bạch Trư Cổ)', count: 1 })} · Tỉ lệ 85% · 10 Nguyên thạch</li>
            <li>${this.renderRefItem({ id: 'gu_thiet_cot', name: 'Thiết Cốt cổ', count: 1 })} = ${this.renderRefItem({ id: 'gu_dong_bi', name: 'Đồng Bì cổ (Thanh Đồng Giáp)', count: 1 })} + ${this.renderRefItem({ id: 'gu_bach_thi', name: 'Bạch Thỉ cổ (Bạch Trư Cổ)', count: 1 })} · Tỉ lệ 80% · 12 Nguyên thạch</li>
          </ul>
        </div>

        <div class="bang wiki-defer-section">
          <table>
            <thead><tr><th>Thành phẩm</th><th>Cổ chính</th><th>Nguyên liệu phụ</th><th>Tỉ lệ gốc (tối đa)</th><th>Thời gian</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  private renderSatChieu(): string {
    const cards = WIKI_SAT_CHIEU.map(
      (sc) => `
      <section class="sc" id="wiki-anchor-${sc.id}">
        <h3>${sc.name}</h3>
        <p>${sc.description}</p>
        <div class="bang the-tom">
          <table>
            <thead><tr><th>Cổ thành phần</th><th>Vai</th><th>Lưu phái</th><th>Chuyển</th><th>Hồi</th></tr></thead>
            <tbody>
              <tr>
                <td>${sc.components.map((c) => this.renderRefItem(c)).join(' ')}</td>
                <td>${sc.role}</td>
                <td>${sc.lpName}</td>
                <td>${sc.tier}</td>
                <td>${sc.cooldown}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>`,
    ).join('');

    return `
      <div class="wiki-article">
        <h1>Sát chiêu (${WIKI_SAT_CHIEU.length} chiêu)</h1>
        <p class="wiki-lead">Từ Nhị chuyển, kết hợp 2–3 cổ trùng đang lắp trong khiếu để thi triển Sát chiêu (phím <kbd>Q</kbd> / <kbd>E</kbd>). Sát chiêu không tốn chân nguyên nhưng đòi hỏi các cổ thành phần đã thuần thục.</p>
        ${cards}
      </div>
    `;
  }

  private renderVatPham(): string {
    const categories = [...new Set(WIKI_ITEMS.map((i) => i.category))];
    const sections = categories
      .map((cat, idx) => {
        const list = WIKI_ITEMS.filter((i) => i.category === cat);
        const itemsHtml = list
          .map(
            (it) =>
              `<li id="wiki-anchor-${it.id}"><a class="mon" href="#${it.id}" data-wiki-goto="vat-pham" data-wiki-target="${it.id}" title="${it.summary || it.name}">${renderAtlasSprite(it.id, 20) || ''}<span>${it.name}</span></a></li>`,
          )
          .join('');
        return `
          <section class="${idx > 0 ? 'wiki-defer-section' : ''}">
            <h2>${cat} (${list.length})</h2>
            <ul class="ds-mon">${itemsHtml}</ul>
          </section>
        `;
      })
      .join('');

    return `
      <div class="wiki-article">
        <h1>Vật phẩm (${WIKI_ITEMS.length} món)</h1>
        <p class="wiki-lead">Vật phẩm chia theo nhóm: Vật liệu hợp luyện, Thức ăn nuôi cổ, Đồ tiêu hao, Hộ cụ, Thời trang và Tiền tệ.</p>
        ${sections}
      </div>
    `;
  }

  private renderThu(): string {
    const rows = WIKI_BEASTS.map(
      (b) => `
      <tr id="wiki-anchor-${b.id}">
        <td><b>${b.name}</b></td>
        <td>${b.rank}</td>
        <td>${b.tier}</td>
        <td>${b.zones}</td>
      </tr>`,
    ).join('');

    return `
      <div class="wiki-article">
        <h1>Thú hoang &amp; Dị thú (${WIKI_BEASTS.length} loài)</h1>
        <p class="wiki-lead">Thú chia theo bậc: Thường, Tinh anh, Đầu đàn (Thú vương) và Boss phó bản. Hạ thú nhận nguyên thạch, vật liệu, thức ăn cổ và thuần thục cổ trùng.</p>
        <div class="bang">
          <table>
            <thead><tr><th>Tên thú</th><th>Cấp thú</th><th>Cảnh giới</th><th>Vùng xuất hiện</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  private renderBanDo(): string {
    const zoneRows = WIKI_ZONES.map(
      (z) => `
      <tr id="wiki-anchor-${z.id}">
        <td><b>${z.name}</b></td>
        <td>${z.realm}</td>
        <td>${z.flag}</td>
      </tr>`,
    ).join('');

    const dgRows = WIKI_DUNGEONS.map(
      (d) => `
      <tr id="wiki-anchor-${d.id}">
        <td><b>${d.name}</b></td>
        <td>${d.zone}</td>
        <td>${d.realm}</td>
        <td>${d.players}</td>
        <td>${d.boss}</td>
      </tr>`,
    ).join('');

    return `
      <div class="wiki-article">
        <h1>Bản đồ &amp; Phó bản</h1>
        <p class="wiki-lead">Các vùng mở và phó bản thú huyệt trong Cổ Tiên Lộ. Vùng An toàn không thể đồ sát; vùng Cờ tự chọn cho phép bật cờ chiến đấu; vùng Tranh chấp mở tự do.</p>
        <h2>Các vùng bản đồ (${WIKI_ZONES.length} vùng)</h2>
        <div class="bang">
          <table>
            <thead><tr><th>Tên vùng</th><th>Cảnh giới gợi ý</th><th>Loại vùng</th></tr></thead>
            <tbody>${zoneRows}</tbody>
          </table>
        </div>

        <h2>Phó bản thú huyệt (${WIKI_DUNGEONS.length} phó bản)</h2>
        <div class="bang wiki-defer-section">
          <table>
            <thead><tr><th>Phó bản</th><th>Cửa vào</th><th>Cảnh giới gợi ý</th><th>Số người</th><th>Boss</th></tr></thead>
            <tbody>${dgRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  private renderCamNang(): string {
    return `
      <div class="wiki-article">
        <h1>Bắt đầu chơi · Cách mạnh lên · Hỏi đáp</h1>
        <p class="wiki-lead">Tổng hợp hướng dẫn tân thủ, bảng phím điều khiển, lộ trình mạnh lên theo trục dọc / trục ngang và giải đáp thắc mắc thường gặp.</p>

        <h2>1. Điều khiển trong bản thử hiện tại</h2>
        <p>Trên máy tính, dùng <kbd>W A S D</kbd> hoặc phím mũi tên để di chuyển. Trên điện thoại, kéo cần điều khiển bên trái. Chiến đấu và các bảng chức năng dùng nút trên màn hình.</p>
        <div class="bang">
          <table>
            <thead><tr><th>Việc</th><th>Cách thực hiện trong bản thử</th></tr></thead>
            <tbody>
              <tr><td>Đánh thường</td><td>Bấm hoặc chạm nút Công kích ở góc phải dưới.</td></tr>
              <tr><td>Dùng cổ trùng</td><td>Bấm hoặc chạm nút kỹ năng cổ tương ứng cạnh Công kích.</td></tr>
              <tr><td>Lướt né đòn</td><td>Bấm hoặc chạm nút Lướt; thao tác này tốn thể lực.</td></tr>
              <tr><td>Túi đồ / Hợp luyện / Nhân vật / Wiki</td><td>Mở bằng các nút trên HUD; bấm tên nhân vật để xem chỉ số.</td></tr>
              <tr><td>Âm thanh</td><td>Bấm hoặc chạm nút loa trên HUD để bật hoặc tắt.</td></tr>
            </tbody>
          </table>
        </div>

        <h2>2. Tham khảo từ game gốc</h2>
        <p class="wiki-lead">Các mục bên dưới giới thiệu hệ thống và lộ trình của game gốc để tra cứu; nhiều tính năng chưa có trong bản thử hiện tại.</p>
        <ul>
          <li>Đi theo nhiệm vụ chính và tra sổ nhiệm vụ để biết bước tiếp theo.</li>
          <li>Luyện hóa con cổ mới, lắp vào ô cổ và chuẩn bị thức ăn trong kho.</li>
          <li>Tu luyện, hấp thu nguyên thạch để tăng tu vi và tiến lên cảnh giới mới.</li>
          <li>Mỗi ngày mở bảng Hôm nay xem năng động và việc ngày / việc tuần.</li>
        </ul>
        <h2>3. Cách mạnh lên (Trục dọc &amp; Trục ngang)</h2>
        <ul>
          <li><b>Trục dọc (Cảnh giới):</b> Hấp thu nguyên thạch tăng tu vi, gom nguyên liệu đột phá tiểu cảnh giới / đại cảnh giới và cộng điểm tiềm năng.</li>
          <li><b>Trục ngang (Cổ trùng):</b> Luyện hóa đủ ô cổ, giữ cổ luôn no, dùng nhiều để tăng thuần thục, hợp luyện lên Nhị / Tam / Tứ / Ngũ chuyển và mở Sát chiêu.</li>
          <li><b>Vạn Cổ Lục &amp; Cổ duyên:</b> Sưu tầm các bộ cổ trùng trong thẻ <a href="#van-co-luc" data-wiki-goto="van-co-luc">Vạn Cổ Lục</a> để nhận chỉ số vĩnh viễn.</li>
          <li><b>Hộ cụ, Rèn thân &amp; Gia viên:</b> Cường hóa hộ cụ, đánh cọc Thảo Nhân mỗi ngày và trồng dược thảo trong Gia viên để tự chủ thức ăn cổ.</li>
        </ul>

        <h2>4. Mẹo của người đi trước</h2>
        <ul class="meo">
          <li>Cổ đói không biết kêu; kho thức ăn cạn lâu thì cổ chết đói thành xác cổ tự phong (mang tới Cửu bà cứu).</li>
          <li>Bản mệnh cổ chết thì khiếu trọng thương — luôn ưu tiên nuôi bản mệnh cổ trước.</li>
          <li>Hợp luyện hỏng chỉ mất nguyên liệu phụ; cổ chính không chết nhưng bị thương phải nghỉ một thời gian.</li>
          <li>Vùng sáng đỏ dưới chân là đòn lớn của thú vương sắp giáng xuống — dùng Lướt để thoát ra ngay.</li>
        </ul>

        <h2>5. Hỏi đáp thường gặp</h2>
        <ul>
          <li><b>Đánh thú có lên tu vi trực tiếp không?</b> Không trực tiếp. Đánh thú rơi nguyên thạch và vật liệu; hấp thu nguyên thạch mới tăng tu vi.</li>
          <li><b>Làm sao có cổ mới?</b> Bắt dã cổ, đổi cống hiến ở kho tộc, mua ở Thương hội, đổ thạch, làm nhiệm vụ hoặc hợp luyện theo <a href="#co-phuong" data-wiki-goto="co-phuong">Cổ phương</a>.</li>
          <li><b>Ngã trong trận có mất đồ không?</b> Ở vùng an toàn chỉ trọng thương hồi sinh về doanh trại, không mất đồ.</li>
        </ul>
      </div>
    `;
  }
}

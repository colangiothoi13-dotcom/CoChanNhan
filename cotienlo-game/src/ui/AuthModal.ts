import { AuthClient } from '../systems/AuthClient';
import { parseCloudProgress, type CloudProgress } from '../systems/CloudProgress';
import { openModal, closeModal } from './Modal';
import { Toast } from './Toast';
interface Options {
  worldOnly?: boolean;
  onProgressLoaded?: (progress: CloudProgress) => void;
  onGetProgress?: () => CloudProgress;
  onConnectWorld?: () => Promise<void>;
  onDisconnectWorld?: () => void;
}
type Mode = 'register' | 'login' | 'password';
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** Login never imports a save or binds a world. Each write has its own explicit action. */
export class AuthModal {
  private modal: HTMLElement | null;
  private events = new AbortController();
  private cooldownTimer: ReturnType<typeof setInterval> | undefined;
  private cooldownUntil = 0;
  private busy = false;
  private disposed = false;
  private mode: Mode = 'register';
  private status = '';
  private statusError = false;
  private renderedPhase = '';
  constructor(private authClient: AuthClient, private options: Options = {}) {
    this.modal = document.getElementById('modal-auth');
    const signal = this.events.signal;
    document.getElementById('btn-close-auth')?.addEventListener('click', () => this.close(), { signal });
    this.modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.close(), { signal });
    this.modal?.addEventListener('click', event => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-auth-action]');
      if (!target || target.disabled)
        return;
      const action = target.getAttribute('data-auth-action');
      if (action)
        void this.act(action, target.getAttribute('data-target-mode'));
    }, { signal });
    this.modal?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.target as HTMLElement;
      void this.act(form.id === 'auth-endpoint-form' ? 'set-endpoint' : this.mode === 'password' ? 'password-login' : 'verify-otp');
    }, { signal });
    void this.restoreSession();
  }
  private async restoreSession(): Promise<void> {
    try {
      await this.authClient.checkSession();
    }
    catch (error) {
      this.status = error instanceof Error ? error.message : 'Chưa kết nối được máy chủ.';
      this.statusError = true;
    }
    if (!this.disposed)
      this.render();
  }
  open(trigger?: HTMLElement): void {
    if (this.disposed)
      return;
    this.render();
    openModal(this.modal, trigger);
  }
  close(): void { closeModal(this.modal); }
  private value(id: string): string { return this.modal?.querySelector<HTMLInputElement>('#' + id)?.value ?? ''; }
  private showStatus(message: string, error = false): void {
    this.status = message;
    this.statusError = error;
    const status = this.modal?.querySelector<HTMLElement>('#auth-status-msg');
    if (status) {
      status.textContent = message;
      status.className = error ? 'auth-msg-error' : 'auth-msg-success';
    }
  }
  private setBusy(value: boolean): void {
    this.busy = value;
    this.modal?.setAttribute('aria-busy', String(value));
    this.modal?.querySelectorAll<HTMLButtonElement>('button[data-auth-action]').forEach(button => {
      button.disabled = value || (button.getAttribute('data-auth-action') === 'send-otp' && this.remainingCooldown() > 0);
    });
  }
  private remainingCooldown(): number { return Math.max(0, Math.ceil((this.cooldownUntil - Date.now()) / 1000)); }
  private updateCooldown(): void {
    const seconds = this.remainingCooldown();
    const button = this.modal?.querySelector<HTMLButtonElement>('[data-auth-action="send-otp"]');
    if (button) {
      button.disabled = this.busy || seconds > 0;
      button.textContent = seconds > 0 ? `Gửi lại sau ${seconds}s` : 'Gửi mã OTP';
    }
    if (!seconds) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = undefined;
    }
  }
  private startCooldown(seconds: number): void {
    this.cooldownUntil = Date.now() + Math.max(0, seconds) * 1000;
    clearInterval(this.cooldownTimer);
    this.updateCooldown();
    if (this.remainingCooldown() > 0)
      this.cooldownTimer = setInterval(() => this.updateCooldown(), 1000);
  }
  private async act(action: string, targetMode?: string | null): Promise<void> {
    if (this.disposed || this.busy)
      return;
    if (action === 'switch-mode') {
      if (targetMode === 'register' || targetMode === 'login' || targetMode === 'password')
        this.mode = targetMode;
      this.status = '';
      this.render();
      return;
    }
    if (action === 'set-endpoint') {
      try {
        this.options.onDisconnectWorld?.();
        this.authClient.setEndpoint(this.value('auth-endpoint-input'));
        this.status = 'Đã đổi máy chủ. Đăng nhập tại máy chủ đã chọn.';
        this.render();
        await this.restoreSession();
      }
      catch (error) {
        this.showStatus(error instanceof Error ? error.message : 'Địa chỉ không hợp lệ.', true);
      }
      return;
    }
    if (action === 'logout') {
      this.options.onDisconnectWorld?.();
      const loggingOut = this.authClient.logout();
      this.status = 'Đã đăng xuất trên thiết bị.';
      this.render();
      await loggingOut;
      return;
    }
    if (action === 'send-otp' && this.remainingCooldown() > 0)
      return;
    const email = this.value(this.mode === 'password' ? 'auth-login-email' : 'auth-email-input').trim();
    const password = this.value(this.mode === 'password' ? 'auth-login-pass' : 'auth-password-input');
    const otp = this.value('auth-otp-input').trim();
    if (['send-otp', 'verify-otp', 'password-login'].includes(action) && !email) {
      this.showStatus('Vui lòng nhập địa chỉ Gmail.', true);
      return;
    }
    if (action === 'verify-otp' && !/^\d{6}$/.test(otp)) {
      this.showStatus('Mã OTP cần đủ 6 chữ số.', true);
      return;
    }
    if (action === 'password-login' && !password) {
      this.showStatus('Vui lòng nhập mật khẩu.', true);
      return;
    }
    this.setBusy(true);
    try {
      if (action === 'send-otp') {
        const result = await this.authClient.sendOtp(email, this.mode === 'login' ? 'login' : 'register');
        if (this.disposed)
          return;
        this.startCooldown(result.cooldownSec);
        this.showStatus(result.message);
      }
      else if (action === 'verify-otp' || action === 'password-login') {
        if (action === 'password-login')
          await this.authClient.loginWithPassword(email, password);
        else
          await this.authClient.verifyOtp(email, otp, { purpose: this.mode === 'login' ? 'login' : 'register', ...(this.mode === 'register' ? { name: this.value('auth-name-input').trim(), password } : {}) });
        if (this.disposed)
          return;
        this.status = 'Đăng nhập thành công. Bản luyện tập trên thiết bị được giữ nguyên.';
        this.render();
      }
      else if (action === 'save-cloud') {
        if (!this.options.onGetProgress)
          throw new Error('Không có bản luyện tập để lưu.');
        const progress = parseCloudProgress(this.options.onGetProgress());
        const result = await this.authClient.saveProgress(progress);
        if (this.disposed)
          return;
        this.status = result.message;
        this.render();
      }
      else if (action === 'load-cloud') {
        const progress = parseCloudProgress(await this.authClient.refreshProgress());
        if (this.disposed)
          return;
        if (!this.options.onProgressLoaded)
          throw new Error('Không có bộ phục hồi bản luyện tập.');
        this.options.onProgressLoaded(progress);
        this.showStatus('Đã phục hồi bản luyện tập. Bản trước đó đã được sao lưu trên thiết bị.');
        Toast.show(this.status);
      }
      else if (action === 'refresh-cloud') {
        await this.authClient.refreshProgress();
        if (this.disposed)
          return;
        this.status = 'Đã kiểm tra phiên bản mới. Chọn tải về hoặc lưu bản hiện tại.';
        this.render();
      }
      else if (action === 'connect-world') {
        if (!this.authClient.isAuthenticated())
          throw new Error('Vui lòng đăng nhập Gmail trước.');
        if (!this.options.onConnectWorld)
          throw new Error('Chưa có kết nối Ngũ Vực.');
        await this.options.onConnectWorld();
        if (this.disposed)
          return;
        this.showStatus('Đã liên kết nhân vật Ngũ Vực với Gmail này.');
      }
    }
    catch (error) {
      if (!this.disposed)
        this.showStatus(error instanceof Error ? error.message : 'Không hoàn tất được yêu cầu.', true);
    }
    finally {
      if (!this.disposed) {
        this.setBusy(false);
        this.updateCooldown();
      }
    }
  }
  render(): void {
    if (this.disposed)
      return;
    const body = this.modal?.querySelector('.modal-body');
    if (!body)
      return;
    const user = this.authClient.getUser();
    const loggedIn = this.authClient.isAuthenticated() && user;
    const phase = loggedIn ? user.id : this.mode;
    const endpoint = `<form id="auth-endpoint-form" class="auth-field"><label for="auth-endpoint-input">Máy chủ game</label><div class="auth-input-row"><input id="auth-endpoint-input" type="text" value="${escape(this.authClient.endpoint)}" placeholder="https://may-chu.example" autocomplete="url" required><button type="submit" class="btn-secondary-action" data-auth-action="set-endpoint">Kết nối</button></div></form>`;
    const status = `<p id="auth-status-msg" class="${this.statusError ? 'auth-msg-error' : 'auth-msg-success'}" role="status" aria-live="polite">${escape(this.status)}</p>`;
    const warning = this.authClient.warning ? `<p class="auth-msg-error">${escape(this.authClient.warning)}</p>` : '';
    if (loggedIn) {
      const raw = this.authClient.getLastProgress();
      const savedAt = raw && typeof raw === 'object' && 'savedAt' in raw && typeof raw.savedAt === 'number' ? raw.savedAt : null;
      const time = savedAt ? new Date(savedAt).toLocaleString('vi-VN') : 'Chưa có bản lưu phù hợp';
      body.innerHTML = `${endpoint}<div class="auth-card-logged"><div class="auth-user-badge"><div><h3 class="auth-user-name">${escape(user.name)}</h3><p class="auth-user-email">${escape(user.email)}</p></div><span class="auth-verified-badge">Gmail đã xác thực</span></div><div class="auth-cloud-status"><strong>Bản luyện tập trên máy chủ</strong><p>${escape(time)} · Phiên bản ${this.authClient.getProgressRevision()}</p><p>Đăng nhập giữ nguyên bản trên thiết bị. Tải về sẽ sao lưu bản hiện tại trước khi thay thế. Bản luyện tập không thay đổi tài sản Ngũ Vực.</p></div>${status}${warning}<div class="auth-actions-group"><button type="button" class="btn-primary-action" data-auth-action="save-cloud">Lưu bản luyện tập hiện tại lên máy chủ</button><button type="button" class="btn-secondary-action" data-auth-action="load-cloud">Tải bản luyện tập về thiết bị</button><button type="button" class="btn-secondary-action" data-auth-action="refresh-cloud">Kiểm tra bản lưu mới</button><p>Liên kết sẽ gắn nhân vật Ngũ Vực hiện tại tại máy chủ này với Gmail. Nhân vật đã thuộc Gmail khác không thể chuyển bằng thao tác này.</p><button type="button" class="btn-primary-action" data-auth-action="connect-world">Liên kết Ngũ Vực với Gmail</button><button type="button" class="btn-danger-action" data-auth-action="logout">Đăng xuất</button></div></div>`;
    }
    else if (this.mode === 'password') {
      body.innerHTML = `${endpoint}<form id="auth-login-form" class="auth-form"><p>Đăng nhập Gmail và mật khẩu đã tạo tại máy chủ này.</p><div class="auth-field"><label for="auth-login-email">Địa chỉ Gmail</label><input id="auth-login-email" type="email" autocomplete="email" maxlength="120" required></div><div class="auth-field"><label for="auth-login-pass">Mật khẩu</label><input id="auth-login-pass" type="password" autocomplete="current-password" maxlength="128" required></div>${status}${warning}<button class="btn-primary-action" type="submit" data-auth-action="password-login">Đăng nhập</button><button type="button" class="btn-text-link" data-auth-action="switch-mode" data-target-mode="login">Đăng nhập bằng OTP</button><button type="button" class="btn-text-link" data-auth-action="switch-mode" data-target-mode="register">Đăng ký Gmail mới</button></form>`;
    }
    else {
      const register = this.mode === 'register';
      body.innerHTML = `${endpoint}<form id="auth-otp-form" class="auth-form"><p>${register ? 'Đăng ký bằng mã xác nhận gửi tới Gmail của bạn.' : 'Nhận mã đăng nhập tại Gmail đã đăng ký.'} Máy chủ cần được cấu hình gửi thư thật.</p><div class="auth-field"><label for="auth-email-input">Địa chỉ Gmail</label><div class="auth-input-row"><input id="auth-email-input" type="email" maxlength="120" autocomplete="email" required><button type="button" class="btn-send-otp" data-auth-action="send-otp">Gửi mã OTP</button></div></div><div class="auth-field"><label for="auth-otp-input">Mã OTP 6 số</label><input id="auth-otp-input" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></div>${register ? '<div class="auth-field"><label for="auth-name-input">Tên Cổ Sư (tùy chọn)</label><input id="auth-name-input" type="text" maxlength="40" autocomplete="nickname"></div><div class="auth-field"><label for="auth-password-input">Mật khẩu (tùy chọn, 8–128 ký tự)</label><input id="auth-password-input" type="password" minlength="8" maxlength="128" autocomplete="new-password"></div>' : ''}${status}${warning}<button type="submit" class="btn-primary-action" data-auth-action="verify-otp">${register ? 'Xác nhận đăng ký' : 'Xác nhận đăng nhập'}</button><button type="button" class="btn-text-link" data-auth-action="switch-mode" data-target-mode="${register ? 'login' : 'register'}">${register ? 'Đã có Gmail? Đăng nhập bằng OTP' : 'Đăng ký Gmail mới'}</button><button type="button" class="btn-text-link" data-auth-action="switch-mode" data-target-mode="password">Đăng nhập bằng mật khẩu</button></form>`;
    }
    if (loggedIn && this.options.worldOnly) {
      body.innerHTML = `<details class="auth-advanced"><summary>Kết nối nâng cao</summary>${endpoint}</details><div class="auth-card-logged"><div class="auth-user-badge"><div><h3 class="auth-user-name">${escape(user.name)}</h3><p class="auth-user-email">${escape(user.email)}</p></div><span class="auth-verified-badge">Gmail đã xác thực</span></div><p>Nhân vật, nơi sinh và tài sản Ngũ Vực được lưu tự động trên máy chủ. Mỗi cuộc đời mới có thể sinh ở bất kỳ đại vực nào.</p>${status}${warning}<div class="auth-actions-group"><button type="button" class="btn-primary-action" data-auth-action="connect-world">Vào Ngũ Vực bằng tài khoản này</button><button type="button" class="btn-danger-action" data-auth-action="logout">Đăng xuất</button></div></div>`;
    }
    this.setBusy(this.busy);
    this.updateCooldown();
    if (phase !== this.renderedPhase) {
      body.scrollTop = 0;
      this.renderedPhase = phase;
    }
    if (this.modal?.classList.contains('active'))
      this.modal.querySelector<HTMLElement>('.modal-card')?.focus({ preventScroll: true });
  }
  destroy(): void {
    if (this.disposed)
      return;
    this.disposed = true;
    this.events.abort();
    clearInterval(this.cooldownTimer);
    this.close();
  }
}

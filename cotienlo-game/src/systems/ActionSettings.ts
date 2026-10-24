export const ACTIVE_SKILLS = ['moonlight', 'bronze', 'boar', 'heal', 'moonblade', 'moonbeam'] as const;
export type ActiveSkill = typeof ACTIVE_SKILLS[number];
export type SkillSlot = ActiveSkill | null;
export type SkillSlots = [SkillSlot, SkillSlot, SkillSlot, SkillSlot];

export const GAME_ACTIONS = [
  'slot1', 'slot2', 'slot3', 'slot4', 'attack', 'dash',
  'moveUp', 'moveDown', 'moveLeft', 'moveRight',
  'interact', 'inventory', 'refine', 'wiki', 'character', 'settings',
] as const;
export type GameAction = typeof GAME_ACTIONS[number];
export type KeyBindings = Record<GameAction, string>;
export const ACTION_LABELS: Readonly<Record<GameAction, string>> = {
  slot1: 'Kỹ năng ô 1', slot2: 'Kỹ năng ô 2', slot3: 'Kỹ năng ô 3', slot4: 'Kỹ năng ô 4',
  attack: 'Đánh thường', dash: 'Lướt né đòn',
  moveUp: 'Đi lên', moveDown: 'Đi xuống', moveLeft: 'Đi trái', moveRight: 'Đi phải',
  interact: 'Đàm đạo', inventory: 'Túi đồ', refine: 'Hợp luyện', wiki: 'Cẩm nang',
  character: 'Nhân vật', settings: 'Cài đặt điều khiển',
};
export const DEFAULT_BINDINGS: Readonly<KeyBindings> = Object.freeze({
  slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4',
  attack: 'KeyJ', dash: 'Space', moveUp: 'KeyW', moveDown: 'KeyS', moveLeft: 'KeyA', moveRight: 'KeyD',
  interact: 'KeyF', inventory: 'KeyB', refine: 'KeyH', wiki: 'KeyV', character: 'KeyC', settings: 'KeyO',
});
const DEFAULT_SLOTS: readonly SkillSlot[] = ['moonlight', 'bronze', 'boar', 'heal'];
const STORAGE_KEY = 'cotienlo_action_settings_v1';
type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;
export interface ActionSettingsSnapshot { version: 1; slots: SkillSlots; bindings: KeyBindings; }
export interface SettingsResult { ok: boolean; message: string; }
interface Options { storage?: SettingsStorage | null; }

function isActiveSkill(value: unknown): value is ActiveSkill {
  return typeof value === 'string' && (ACTIVE_SKILLS as readonly string[]).includes(value);
}
export function isBindableCode(code: string): boolean {
  return /^(?:Key[A-Z]|Digit[0-9]|Numpad[0-9]|Space|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(code);
}
export function formatKeyCode(code: string): string {
  const names: Record<string, string> = { Space: 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return names[code] ?? (/^Key[A-Z]$/.test(code) ? code.slice(3)
    : /^Digit[0-9]$/.test(code) ? code.slice(5) : /^Numpad[0-9]$/.test(code) ? 'Num ' + code.slice(6) : code);
}
function defaults(): ActionSettingsSnapshot {
  return { version: 1, slots: [...DEFAULT_SLOTS] as SkillSlots, bindings: { ...DEFAULT_BINDINGS } };
}
function parse(raw: string): ActionSettingsSnapshot {
  if (raw.length > 16384) throw new Error('Settings are too large');
  const value = JSON.parse(raw) as Partial<ActionSettingsSnapshot>;
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => !['version', 'slots', 'bindings'].includes(key)) ||
    value.version !== 1 || !Array.isArray(value.slots) || value.slots.length !== 4 ||
    value.slots.some(skill => skill !== null && !isActiveSkill(skill)) ||
    !value.bindings || typeof value.bindings !== 'object' || Array.isArray(value.bindings) ||
    Object.keys(value.bindings).length !== GAME_ACTIONS.length ||
    GAME_ACTIONS.some(action => typeof value.bindings![action] !== 'string' || !isBindableCode(value.bindings![action])) ||
    new Set(Object.values(value.bindings)).size !== GAME_ACTIONS.length) throw new Error('Invalid settings');
  return { version: 1, slots: [...value.slots] as SkillSlots, bindings: { ...value.bindings } };
}

/** Device preferences only; slots reference owned Gu and never create assets or independent cooldowns. */
export class ActionSettings {
  private current = defaults();
  private storage: SettingsStorage | null = null;
  private listeners = new Set<(snapshot: ActionSettingsSnapshot) => void>();
  private disposed = false;
  public warning: string | null = null;

  constructor(options: Options = {}) {
    if (options.storage !== undefined) this.storage = options.storage;
    else {
      try { this.storage = globalThis.localStorage ?? null; }
      catch { this.warning = 'Thiết bị chặn lưu cài đặt; thay đổi chỉ có hiệu lực trong phiên này.'; }
    }
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (raw) this.current = parse(raw);
    } catch {
      this.warning = 'Không đọc được cài đặt đã lưu. Đang dùng mặc định; dữ liệu cũ được giữ nguyên.';
    }
  }

  public get state(): ActionSettingsSnapshot {
    return { version: 1, slots: this.getSlots(), bindings: this.getBindings() };
  }
  public getSlots(): SkillSlots { return [...this.current.slots] as SkillSlots; }
  public getBindings(): KeyBindings { return { ...this.current.bindings }; }
  public getBinding(action: GameAction): string { return this.current.bindings[action]; }
  public actionForCode(code: string): GameAction | null {
    return GAME_ACTIONS.find(action => this.current.bindings[action] === code) ?? null;
  }

  public subscribe(listener: (snapshot: ActionSettingsSnapshot) => void): () => void {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  public assignSlot(index: number, skill: SkillSlot, ownedGuIds: readonly string[]): SettingsResult {
    if (this.disposed) return { ok: false, message: 'Cài đặt đã đóng.' };
    if (!Number.isInteger(index) || index < 0 || index >= 4 || (skill !== null && !isActiveSkill(skill))) {
      return { ok: false, message: 'Ô kỹ năng hoặc Cổ chủ động không hợp lệ.' };
    }
    if (skill !== null && !ownedGuIds.includes(skill)) return { ok: false, message: 'Chỉ lắp được Cổ chủ động đang sở hữu.' };
    const next = this.state;
    next.slots[index] = skill;
    return this.commit(next, 'Đã cập nhật ô kỹ năng.');
  }

  public resolveSlot(index: number, ownedGuIds: readonly string[]): ActiveSkill | null {
    if (!Number.isInteger(index) || index < 0 || index >= 4) return null;
    const skill = this.current.slots[index];
    if (skill === 'moonlight' && ownedGuIds.includes('moonblade')) return 'moonblade';
    return skill !== null && ownedGuIds.includes(skill) ? skill : null;
  }

  public rebind(action: GameAction, code: string): SettingsResult {
    if (this.disposed) return { ok: false, message: 'Cài đặt đã đóng.' };
    if (!(GAME_ACTIONS as readonly string[]).includes(action) || !isBindableCode(code)) {
      return { ok: false, message: 'Phím này dành cho trình duyệt hoặc điều hướng. Chọn chữ, số, Space hoặc mũi tên.' };
    }
    const conflict = GAME_ACTIONS.find(other => other !== action && this.current.bindings[other] === code);
    if (conflict) return { ok: false, message: `Phím ${formatKeyCode(code)} đang dùng cho “${ACTION_LABELS[conflict]}”. Hãy đổi phím đó trước.` };
    const next = this.state;
    next.bindings[action] = code;
    return this.commit(next, 'Đã đổi phím điều khiển.');
  }

  public resetDefaults(): SettingsResult {
    if (this.disposed) return { ok: false, message: 'Cài đặt đã đóng.' };
    return this.commit(defaults(), 'Đã khôi phục bốn ô kỹ năng và phím mặc định.');
  }

  private commit(next: ActionSettingsSnapshot, message: string): SettingsResult {
    this.current = next;
    try {
      if (!this.storage) throw new Error('Storage unavailable');
      const encoded = JSON.stringify(next);
      this.storage.setItem(STORAGE_KEY, encoded);
      if (this.storage.getItem(STORAGE_KEY) !== encoded) throw new Error('Settings not retained');
      this.warning = null;
    } catch {
      this.warning = 'Đã áp dụng trong phiên này nhưng không lưu được trên thiết bị.';
    }
    for (const listener of this.listeners) listener(this.state);
    return { ok: true, message: this.warning ? message + ' ' + this.warning : message };
  }

  public destroy(): void { this.disposed = true; this.listeners.clear(); }
}


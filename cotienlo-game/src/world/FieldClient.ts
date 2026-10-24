import { isFieldSnapshot, type FieldAction, type FieldInput, type FieldSnapshot } from './field-types';
import type { ResourceSnapshot } from '../../shared/resource-core.mjs';

interface Options { request: (input?: FieldInput) => Promise<unknown>; intervalMs?: number }

/** Motion has its own bounded stream. It cannot upload HP, money or a practice save. */
export class FieldClient {
  public snapshot: FieldSnapshot | null = null;
  public connected = false;
  public error: string | null = null;
  private lifeId: string | null = null;
  private seq = 0;
  private generation = 0;
  private move = { x: 0, y: 0 };
  private aimAngle = 0;
  private actions: { action: FieldAction; aimAngle: number }[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();
  private disposed = false;

  constructor(private options: Options) {}
  subscribe(listener: () => void): () => void { this.listeners.add(listener); listener(); return () => this.listeners.delete(listener); }
  private emit(): void { for (const listener of this.listeners) listener(); }
  private newerResources(incoming: ResourceSnapshot | undefined): ResourceSnapshot | undefined {
    const current = this.snapshot?.resources;
    if (!incoming || incoming.lifeId !== this.lifeId) return current;
    if (current && ((incoming.revision ?? 0) < (current.revision ?? 0) || incoming.clockMs < current.clockMs)) return current;
    return incoming;
  }
  /** Durable commands carry a fresh view immediately, independently of movement cadence. */
  acceptResources(resources: ResourceSnapshot): void {
    if (!this.snapshot || this.snapshot.lifeId !== resources.lifeId || this.disposed) return;
    const accepted = this.newerResources(resources);
    if (!accepted || accepted === this.snapshot.resources) return;
    this.snapshot = { ...this.snapshot, resources: accepted }; this.emit();
  }
  setInput(move: { x: number; y: number }, aimAngle: number): void {
    const x = Number.isFinite(move.x) ? move.x : 0, y = Number.isFinite(move.y) ? move.y : 0;
    const scale = Math.max(1, Math.hypot(x, y));
    this.move = { x: x / scale, y: y / scale };
    this.aimAngle = Number.isFinite(aimAngle) ? aimAngle : 0;
  }
  cast(action: FieldAction): boolean {
    if (!this.connected || this.snapshot?.dead || this.actions.length >= 8 || this.disposed) return false;
    this.actions.push({ action, aimAngle: this.aimAngle }); return true;
  }
  async start(lifeId: string): Promise<void> {
    if (this.disposed || (this.lifeId === lifeId && this.snapshot)) return;
    this.stop(); this.lifeId = lifeId;
    const generation = this.generation;
    try {
      const value = await this.options.request();
      if (generation !== this.generation || this.disposed) return;
      if (!isFieldSnapshot(value) || value.lifeId !== lifeId) throw new Error('Máy chủ chưa trả đúng cuộc đời. Hãy kết nối lại.');
      this.snapshot = value; this.seq = value.seq; this.connected = true; this.error = null;
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      this.connected = false; this.error = error instanceof Error ? error.message : 'Mất kết nối thế giới.';
    }
    this.emit(); this.schedule(generation);
  }
  private schedule(generation: number): void {
    if (generation !== this.generation || this.disposed || !this.lifeId || this.snapshot?.dead) return;
    this.timer = setTimeout(() => { void this.pump(generation); }, this.connected ? this.options.intervalMs ?? 100 : 1000);
  }
  private async pump(generation: number): Promise<void> {
    if (generation !== this.generation || !this.lifeId || this.disposed) return;
    const queued = this.actions.shift();
    const input: FieldInput = { lifeId: this.lifeId, seq: ++this.seq, move: { ...this.move }, aimAngle: queued?.aimAngle ?? this.aimAngle,
      ...(queued ? { action: queued.action } : {}), ...(this.snapshot?.resources ? { resourceClockMs: this.snapshot.resources.clockMs } : {}) };
    try {
      const value = await this.options.request(this.snapshot ? input : undefined);
      if (generation !== this.generation || this.disposed) return;
      if (!isFieldSnapshot(value) || value.lifeId !== this.lifeId) throw new Error('Cuộc đời đã thay đổi. Hãy mở bản đồ để kết nối lại.');
      const resources = this.newerResources(value.resources);
      this.snapshot = { ...value, ...(resources ? { resources } : {}) };
      this.seq = Math.max(this.seq, value.seq); this.connected = true; this.error = null;
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      this.connected = false; this.actions = []; this.move = { x: 0, y: 0 };
      this.error = error instanceof Error ? error.message : 'Mất kết nối thế giới. Đang thử lại…';
    }
    this.emit(); this.schedule(generation);
  }
  stop(): void {
    this.generation++; clearTimeout(this.timer); this.timer = undefined;
    this.lifeId = null; this.snapshot = null; this.connected = false; this.error = null;
    this.move = { x: 0, y: 0 }; this.actions = []; this.seq = 0;
    this.emit();
  }
  destroy(): void { if (this.disposed) return; this.stop(); this.disposed = true; this.listeners.clear(); }
}

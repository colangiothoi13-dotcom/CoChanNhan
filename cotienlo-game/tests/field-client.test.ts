import { afterEach, describe, expect, it, vi } from 'vitest';
import { FieldClient } from '../src/world/FieldClient';
import type { FieldInput, FieldSnapshot } from '../src/world/field-types';
import { createCultivationState } from '../shared/cultivation-core.mjs';
import { createResourceState, resourceSnapshot } from '../shared/resource-core.mjs';

const snapshot = (lifeId = 'life-a', seq = 0): FieldSnapshot => ({
  lifeId, seq, serverTime: 10, accountName: 'Tester', lifeNumber: 1, placeId: 'a', cause: null,
  x: 60000, y: 60000, facing: 0, hp: 100, mp: 100, stamina: 100, maxHp: 100, maxMp: 100, maxStamina: 100,
  stones: 20, dead: false, regionId: 'trung-chau', guIds: ['moonlight'],
  cooldowns: { attack: 0, moonlight: 0, bronze: 0, boar: 0, heal: 0, dash: 0 },
  buffs: { bronze: 0, boar: 0, heal: 0, dash: 0 }, monsters: [], projectiles: [], nearbyPlayers: [],
});
const clients: FieldClient[] = [];
afterEach(() => { clients.forEach(client => client.destroy()); clients.length = 0; vi.useRealTimers(); });

describe('independent authoritative field stream', () => {
  it('retains resources across lean motion responses and acknowledges only their server clock', async () => {
    vi.useFakeTimers();
    const resources = resourceSnapshot(createCultivationState({ lifeId: 'life-a' }), createResourceState({ lifeId: 'life-a', clockMs: 1000 }), 1000);
    const sent: FieldInput[] = [];
    const client = new FieldClient({ request: async input => {
      if (!input) return { ...snapshot(), resources };
      sent.push(input); return { ...snapshot('life-a', input.seq), hp: 73 };
    } }); clients.push(client);
    await client.start('life-a'); await vi.advanceTimersByTimeAsync(110);
    expect(sent[0].resourceClockMs).toBe(1000);
    expect(client.snapshot?.resources?.lifeId).toBe('life-a');
    expect(client.snapshot?.hp).toBe(73);
  });
  it('adopts durable command results and never rolls them back to an older resource revision', async () => {
    vi.useFakeTimers();
    const resources = { ...resourceSnapshot(createCultivationState({ lifeId: 'life-a' }), createResourceState({ lifeId: 'life-a', clockMs: 1000 }), 1000), revision: 1 };
    const client = new FieldClient({ request: async input => ({ ...snapshot('life-a', input?.seq ?? 0), resources }) }); clients.push(client);
    await client.start('life-a');
    client.acceptResources({ ...resources, revision: 2, notices: ['Đã quyết toán'] });
    await vi.advanceTimersByTimeAsync(110);
    expect(client.snapshot?.resources?.revision).toBe(2);
    expect(client.snapshot?.resources?.notices).toEqual(['Đã quyết toán']);
    client.acceptResources({ ...resources, lifeId: 'other-life', revision: 100 });
    expect(client.snapshot?.resources?.lifeId).toBe('life-a');
    await client.start('life-b');
    expect(client.snapshot?.resources).toBeUndefined();
  });
  it('starts from the persisted acknowledgement and sends normalized input without balances', async () => {
    vi.useFakeTimers();
    const sent: FieldInput[] = [];
    const request = vi.fn(async (input?: FieldInput) => { if (input) sent.push(input); return snapshot('life-a', input?.seq ?? 7); });
    const client = new FieldClient({ request }); clients.push(client);
    await client.start('life-a');
    client.setInput({ x: 1, y: 1 }, Math.PI); client.cast('moonlight');
    await vi.advanceTimersByTimeAsync(110);
    expect(sent[0]).toMatchObject({ lifeId: 'life-a', seq: 8, aimAngle: Math.PI, action: 'moonlight' });
    expect(sent[0].move.x).toBeCloseTo(Math.SQRT1_2);
    expect(sent[0].move.y).toBeCloseTo(Math.SQRT1_2);
    expect(Object.keys(sent[0]).sort()).toEqual(['action', 'aimAngle', 'lifeId', 'move', 'seq']);
    expect(client.snapshot?.stones).toBe(20);
  });
  it('ignores late snapshots from an old life and never reuses its action queue', async () => {
    let finish!: (value: FieldSnapshot) => void;
    const request = vi.fn(() => new Promise<FieldSnapshot>(resolve => { finish = resolve; }));
    const client = new FieldClient({ request }); clients.push(client);
    const old = client.start('life-a');
    client.stop(); finish(snapshot('life-a')); await old;
    expect(client.snapshot).toBe(null);
    expect(client.cast('attack')).toBe(false);
  });
  it('preserves the aim at release even when the pointer turns before the next packet', async () => {
    vi.useFakeTimers(); const sent: FieldInput[] = [];
    const client = new FieldClient({ request: async input => { if (input) sent.push(input); return snapshot('life-a', input?.seq ?? 0); } }); clients.push(client);
    await client.start('life-a');
    client.setInput({ x: 1, y: 0 }, Math.PI); client.cast('moonlight');
    client.setInput({ x: 0, y: 1 }, 0);
    await vi.advanceTimersByTimeAsync(110);
    expect(sent[0].aimAngle).toBe(Math.PI);
    expect(sent[0].move).toEqual({ x: 0, y: 1 });
  });
  it('bounds queued actions, handles disconnect and recovers without predicting money or HP', async () => {
    vi.useFakeTimers(); let fail = false;
    const client = new FieldClient({ request: async input => { if (fail) throw new Error('offline'); return snapshot('life-a', input?.seq ?? 0); } }); clients.push(client);
    await client.start('life-a');
    fail = true;
    await vi.advanceTimersByTimeAsync(110);
    expect(client.connected).toBe(false); expect(client.snapshot?.hp).toBe(100);
    expect(client.cast('attack')).toBe(false);
    fail = false; await vi.advanceTimersByTimeAsync(1100);
    expect(client.connected).toBe(true); expect(client.error).toBe(null);
    expect(client.snapshot?.stones).toBe(20);
  });
});

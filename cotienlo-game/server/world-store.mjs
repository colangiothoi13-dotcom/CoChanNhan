import { randomUUID, randomBytes, randomInt, createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFieldState, acceptFieldInput, advanceFieldWorld, createFieldRuntime, validateFieldRuntime, fieldView, validateFieldInput, validateFieldState, FIELD_GU_IDS } from './field-engine.mjs';
import { sampleSpawn, getSpawnPool, OVERWORLD_HUBS, getNearbyFacilities, getFacility, isInsideSanctuary } from '../shared/overworld-core.mjs';
import { createCultivationState, migrateCultivationState, validateCultivationState, deriveCultivationStats, ownedGuIds, usableGuIds, applyAcademyAction, advanceCultivation } from '../shared/cultivation-core.mjs';
import { initializeGuLifecycle } from '../shared/resource-core.mjs';
import { createResourceWorld, migrateWorldResources, initializeLifeResources, advanceResourceWorld, settleLifeResources, applyWorldResourceAction, resourceWorldView, archiveLifeResources, lootLifeResources, validateWorldResources, ResourceWorldError } from './resource-world.mjs';

const SKILLS = ['care', 'combat', 'survival', 'insight', 'refinement', 'diplomacy'];
const ECONOMY = new Set(['travel', 'work', 'rest', 'train']);
const ACTIONS = new Set([...ECONOMY, 'investigate', 'commit', 'choose', 'rebirth', 'loot', 'lesson', 'academy', 'resource']);
const TRIAL_MS = 300_000;
const OFFLINE_MS = 90_000;
const HEARTBEAT_GRACE_MS = 15_000;
const WORLD_DAY_MS = 21_600_000;
const DEFAULT_CONTENT = fileURLToPath(new URL('../shared/world-content.json', import.meta.url));
const { supplyCapacity: SUPPLY_CAPACITY } = JSON.parse(readFileSync(new URL('../shared/world-balance.json', import.meta.url), 'utf8'));
const clone = value => structuredClone(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(v => JSON.parse(canonical(v))) : Object.fromEntries(Object.keys(value).sort().map(k => [k, JSON.parse(canonical(value[k]))]))
  : value);
const publicChoice = ({ effect, ...choice }) => clone(choice);
const publicStage = stage => ({ id: stage.id, title: stage.title, text: stage.text, choices: stage.choices.map(publicChoice) });
const UNKNOWN_OWNER = 'Chưa xác định';
const publicWorldEvent = event => ({ ...event, text: event.text.includes(' đã hoàn thành ') ? 'Một khảo nghiệm truyền thừa đã khép lại.'
  : event.text.includes(' đã thu nhặt một di vật tại ') ? 'Một di vật đã đổi người trông giữ.'
  : /, đời thứ .* đã mất tại /.test(event.text) ? 'Thiên địa ghi nhận một cuộc đời đã khép lại.' : event.text });

export class WorldError extends Error {
  constructor(code, message, status = 400) { super(message); this.name = 'WorldError'; this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new WorldError(code, message, status); };
const requireThat = (condition, code, message, status) => { if (!condition) fail(code, message, status); };

/** Single-process authority. Economic/death changes are durable; motion is checkpointed. */
export class WorldStore {
  #state;
  #content;
  #now;
  #filePath;
  #places;
  #inheritances;
  #origins;
  #legends;
  #randomIndex;
  #fieldPlaceCache;
  #metrics = { ticks: 0, durableWrites: 0, checkpoints: 0, activePlayers: 0, monsters: 0, interestQueries: 0, monsterSteps: 0, projectileChecks: 0 };

  constructor({ filePath, now = Date.now, content, randomIndex = randomInt } = {}) {
    this.#now = now;
    this.#randomIndex = maximum => {
      const result = randomIndex(maximum);
      requireThat(Number.isInteger(result) && result >= 0 && result < maximum, 'INVALID_RANDOM', 'Không xác định được điểm xuất phát hợp lệ.', 500);
      return result;
    };
    this.#filePath = filePath ? resolve(filePath) : null;
    this.#content = clone(content ?? JSON.parse(readFileSync(DEFAULT_CONTENT, 'utf8')));
    this.#validateContent();
    this.#places = new Map(this.#content.places.map(p => [p.id, p]));
    this.#inheritances = new Map(this.#content.inheritances.map(p => [p.id, p]));
    this.#origins = new Map(this.#content.origins.map(p => [p.id, p]));
    this.#legends = new Map(this.#content.legends.map(p => [p.id, p]));
    const time = this.#time();
    if (this.#filePath && existsSync(this.#filePath)) {
      try {
        this.#state = JSON.parse(readFileSync(this.#filePath, 'utf8'));
        this.#upgradeStarterAccounting(this.#state);
        this.#upgradeRuntime(this.#state, time);
        this.#validateState(this.#state);
      }
      catch (error) { throw new Error(`World data is corrupt: ${error.message}`, { cause: error }); }
      const resumed = clone(this.#state);
      const downtime = Math.max(0, time - resumed.savedAt);
      for (const account of Object.values(resumed.accounts)) {
        if (account.life.field) { account.life.field.lastInputAt = time; account.life.field.move = { x: 0, y: 0 }; }
        this.#pauseCultivation(account.life, time);
        if (account.life.trial) {
          account.life.trial.deadlineAt += downtime;
          account.life.trial.lastSweepAt += downtime;
          account.lastHeartbeatAt += downtime;
        }
      }
      resumed.fieldRuntime.lastTickAt = time;
      resumed.resourceWorld.lastTickAt = time;
      this.#publish(resumed, time);
    } else {
      this.#state = {
        schemaVersion: 1, starterAccountingVersion: 1, savedAt: time,
        world: { id: randomUUID(), name: 'Cổ Tiên Lộ · Thế giới chung [TK]', createdAt: time, revision: 0 },
        accounts: {}, remains: [], events: [], fieldRuntime: createFieldRuntime(time),
        resourceWorld: createResourceWorld(time),
        inheritanceStates: Object.fromEntries(this.#content.inheritances.map(i => [i.id, { bonusRemaining: 10, reservedBy: null, completedBy: [] }])),
        immortals: [...new Set(this.#content.inheritances.map(i => i.uniqueGu).filter(Boolean))].map(typeId => ({
          typeId, name: typeId === 'hai-kinh' ? 'Hải Kính Tiên Cổ [TK]' : `${typeId} [TK]`,
          instanceId: randomUUID(), rank: 6, owner: `inheritance:${this.#content.inheritances.find(i => i.uniqueGu === typeId).id}`, status: 'reserved',
        })),
      };
    }
  }

  createSession(name) {
    requireThat(typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 40 && !/[\u0000-\u001f]/.test(name), 'INVALID_NAME', 'Tên cần có từ 1 đến 40 ký tự.');
    const token = randomBytes(32).toString('base64url');
    const time = this.#time();
    const next = clone(this.#state);
    this.#sweep(next, time);
    const account = { id: randomUUID(), name: name.trim(), tokenHash: hash(token), journal: [], pastLives: [], operations: {}, lastHeartbeatAt: time, lastEconomyAt: null };
    account.life = this.#newLife(account, this.#content.origins[this.#randomIndex(this.#content.origins.length)], 1, next, time);
    next.accounts[account.id] = account;
    this.#publish(next, time);
    return { token, snapshot: this.#view(account.id, time) };
  }

  snapshot(token) {
    const { accountId, time } = this.#access(token);
    return this.#view(accountId, time);
  }

  /** Only HTTP authentication may supply this ID; clients cannot upload authoritative state. */
  linkVerifiedAccount(userId, name, guestToken) {
    requireThat(typeof userId === 'string' && userId.length > 0 && userId.length <= 100, 'UNAUTHORIZED', 'Tài khoản xác minh không hợp lệ.', 401);
    requireThat(typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 40, 'INVALID_NAME', 'Tên cần có từ 1 đến 40 ký tự.');
    requireThat(guestToken === undefined || guestToken === null || typeof guestToken === 'string' && guestToken.length >= 30 && guestToken.length <= 200, 'INVALID_GUEST_TOKEN', 'Phiên khách không hợp lệ.');
    const time = this.#time();
    const next = clone(this.#state);
    this.#sweep(next, time);
    let account = Object.values(next.accounts).find(item => item.verifiedUserId === userId);
    if (account && guestToken !== undefined && guestToken !== null && hash(guestToken) !== account.tokenHash) {
      this.#accountId(guestToken);
      fail('WORLD_LINK_CONFLICT', 'Gmail này đã có nhân vật Ngũ Vực khác. Phiên khách hiện tại được giữ nguyên. Hãy mở cửa sổ trình duyệt riêng để vào nhân vật Gmail.', 409);
    }
    if (!account) {
      if (guestToken !== undefined && guestToken !== null) account = next.accounts[this.#accountId(guestToken)];
      else {
        account = { id: randomUUID(), name: name.trim(), tokenHash: hash(randomBytes(32)), journal: [], pastLives: [], operations: {}, lastHeartbeatAt: time, lastEconomyAt: null };
        account.life = this.#newLife(account, this.#content.origins[this.#randomIndex(this.#content.origins.length)], 1, next, time);
        next.accounts[account.id] = account;
      }
      account.verifiedUserId = userId;
    }
    account.lastHeartbeatAt = time;
    this.#publish(next, time);
    return this.#view(account.id, time);
  }

  snapshotForUser(userId) {
    const { accountId, time } = this.#accessAccount(this.#verifiedAccountId(userId));
    return this.#view(accountId, time);
  }

  executeForUser(userId, request) {
    return this.#execute(this.#accessAccount(this.#verifiedAccountId(userId)), request);
  }

  fieldSnapshot(token) { return this.#fieldSnapshot(this.#accountId(token)); }
  fieldSnapshotForUser(userId) { return this.#fieldSnapshot(this.#verifiedAccountId(userId)); }
  fieldInput(token, input) { return this.#fieldInput(this.#accountId(token), input); }
  fieldInputForUser(userId, input) { return this.#fieldInput(this.#verifiedAccountId(userId), input); }

  #ensureField(life, time) {
    if (life.field) return false;
    const regionId = this.#places.get(life.placeId)?.regionId;
    const spawn = getSpawnPool(['south', 'north', 'east', 'west', 'central'].includes(regionId) ? regionId : 'south')[0];
    life.field = createFieldState(spawn, time, ownedGuIds(life.cultivation));
    life.field.mp = deriveCultivationStats(life.cultivation).mp;
    return true;
  }
  #fieldDraft(accountId) {
    // Only this avatar and active trials can change during a field request. Other
    // players' encounter populations remain immutable and need not be copied at10Hz.
    const state = this.#state;
    const accounts = { ...state.accounts };
    for (const [id, account] of Object.entries(accounts)) {
      if (id === accountId || account.life.trial) accounts[id] = this.#fieldAccountDraft(account);
    }
    return { ...state, world: { ...state.world }, accounts,
      resourceWorld: { ...state.resourceWorld, listings: [...state.resourceWorld.listings], loans: state.resourceWorld.loans.map(loan => ({ ...loan })) },
      remains: [...state.remains], events: [...state.events],
      inheritanceStates: clone(state.inheritanceStates), immortals: clone(state.immortals) };
  }
  #fieldAccountDraft(account) {
    // Field simulation never edits historical entries or command receipts.
    // Copy their append-only arrays, not every prior life's journal at20Hz.
    return { ...account, life: clone(account.life), journal: [...account.journal], pastLives: [...account.pastLives] };
  }
  #fieldSnapshot(accountId) {
    const time = this.#time(); const next = this.#fieldDraft(accountId); const account = next.accounts[accountId];
    const swept = this.#sweep(next, time);
    const created = this.#ensureField(account.life, time);
    this.#wake(account, time);
    const firstEntry = !account.life.field.entered;
    if (firstEntry) this.#pauseCultivation(account.life, time);
    account.life.field.entered = true;
    account.lastHeartbeatAt = time;
    const resources = settleLifeResources(next, account.life);
    if (created || firstEntry || swept || resources.critical) this.#publish(next, time);
    else this.#state = next;
    return this.#fieldView(accountId, time);
  }
  #fieldInput(accountId, input) {
    const time = this.#time();
    validateFieldInput(input, this.#state.accounts[accountId].life.id);
    const next = this.#fieldDraft(accountId); const account = next.accounts[accountId];
    const wasDead = account.life.dead; const swept = this.#sweep(next, time);
    const created = this.#ensureField(account.life, time);
    this.#wake(account, time);
    const firstEntry = !account.life.field.entered; account.life.field.entered = true;
    if (firstEntry) this.#pauseCultivation(account.life, time);
    account.lastHeartbeatAt = time;
    let result = { critical: false, died: false };
    if (!account.life.dead) result = acceptFieldInput(account.life, input, time, () => this.#randomIndex(10000));
    initializeGuLifecycle(account.life.cultivation, next.resourceWorld.clockMs);
    const place = this.#fieldPlaces().find(item => item.regionId === account.life.field.regionId &&
      Math.hypot(item.x - account.life.field.x, item.y - account.life.field.y) <= 220);
    if (place) {
      account.life.placeId = place.id;
      if (!account.life.discovered.includes(place.id)) account.life.discovered.push(place.id);
    }
    if (result.died) this.#die(next, account, 'Bị dị thú hạ gục trong Ngũ Vực.', time);
    if (created || firstEntry || swept || result.critical || wasDead !== account.life.dead) this.#publish(next, time);
    // advanceField validates the changed avatar. Untouched accounts were already
    // validated; a critical mutation/checkpoint validates the entire durable state.
    else this.#state = next;
    const resourceChanged = input.resourceClockMs === undefined || Math.floor(input.resourceClockMs / 1000) !== Math.floor(next.resourceWorld.clockMs / 1000);
    return this.#fieldView(accountId, time, resourceChanged);
  }
  #fieldView(accountId, time, includeResources = true) {
    const account = this.#state.accounts[accountId];
    const active = Object.values(this.#state.accounts).filter(other => !other.life.dead && other.life.field?.entered && time - other.lastHeartbeatAt <= HEARTBEAT_GRACE_MS);
    const view = fieldView(account.life, time, this.#state.fieldRuntime, active.flatMap(other => other.life.field.projectiles));
    return { ...view, ...(includeResources ? { resources: resourceWorldView(this.#state, account) } : {}), runtime: this.runtimeMetrics(), accountName: account.name, usableGuIds: usableGuIds(account.life.cultivation), facilities: getNearbyFacilities(view.x, view.y, 1800), nearbyPlaces: this.#fieldPlaces().filter(place =>
      Math.hypot(place.x - view.x, place.y - view.y) <= 1800), nearbyPlayers: Object.values(this.#state.accounts)
      .filter(other => other.id !== accountId && !other.life.dead && other.life.field?.entered && time - other.lastHeartbeatAt <= 15_000 &&
        Math.hypot(other.life.field.x - view.x, other.life.field.y - view.y) <= 1600)
      .sort((a, b) => Math.hypot(a.life.field.x - view.x, a.life.field.y - view.y) - Math.hypot(b.life.field.x - view.x, b.life.field.y - view.y))
      .slice(0, 128)
      .map(other => ({ accountId: other.id, name: other.name, x: other.life.field.x, y: other.life.field.y, facing: other.life.field.facing })) };
  }
  #fieldPlaces() {
    if (this.#fieldPlaceCache) return this.#fieldPlaceCache;
    this.#fieldPlaceCache = [...this.#places.values()].flatMap(place => {
      const peers = [...this.#places.values()].filter(item => item.regionId === place.regionId);
      const index = peers.findIndex(item => item.id === place.id);
      const hub = OVERWORLD_HUBS.filter(item => item.regionId === place.regionId)[Math.floor(index / 2) % 3];
      if (!hub) return [];
      const offset = (index % 2) * 650;
      // The second POI sits toward the central road spine, never beyond a branch end.
      const point = hub.x === 60000
        ? { x: hub.x, y: hub.y + (hub.y <= 60000 ? 1 : -1) * offset }
        : { x: hub.x + (hub.x < 60000 ? 1 : -1) * offset, y: hub.y };
      return [{ id: place.id, name: place.name, regionId: place.regionId, ...point }];
    });
    return this.#fieldPlaceCache;
  }

  /** Service-owned clock checkpoint. Never counts as a player heartbeat. */
  checkpoint() {
    const time = this.#time();
    const next = clone(this.#state);
    this.#sweep(next, time);
    this.#publish(next, time);
    this.#metrics.checkpoints++;
  }

  /** Fixed service clock; running this never renews a disconnected player's lease. */
  tick() { return this.#tickAt(this.#time()); }
  runtimeMetrics() { return { ...this.#metrics, serverTime: this.#time(), lastTickAt: this.#state.fieldRuntime.lastTickAt }; }
  #tickAt(time) {
    const state = this.#state;
    if (time <= state.fieldRuntime.lastTickAt) return false;
    const accounts = { ...state.accounts }, active = [];
    for (const [id, account] of Object.entries(accounts)) {
      const running = !account.life.dead && !account.life.trial && account.life.field?.entered && time - account.lastHeartbeatAt <= HEARTBEAT_GRACE_MS;
      if (running || account.life.trial) accounts[id] = this.#fieldAccountDraft(account);
      if (running) active.push(accounts[id].life);
    }
    const next = { ...state, world: { ...state.world }, accounts,
      resourceWorld: { ...state.resourceWorld, listings: [...state.resourceWorld.listings], loans: state.resourceWorld.loans.map(loan => ({ ...loan })) },
      fieldRuntime: clone(state.fieldRuntime), remains: [...state.remains], events: [...state.events],
      inheritanceStates: clone(state.inheritanceStates), immortals: clone(state.immortals) };
    const swept = this.#sweep(next, time);
    const result = advanceFieldWorld(active, next.fieldRuntime, time);
    const resourceCritical = advanceResourceWorld(next, active.map(life => Object.values(accounts).find(account => account.life.id === life.id)), time, account => this.#fieldAccountDraft(account));
    for (const life of result.deaths) {
      const account = Object.values(accounts).find(item => item.life.id === life.id);
      this.#die(next, account, 'Bị dị thú hạ gục trong Ngũ Vực.', time);
    }
    for (const life of active) {
      const place = this.#fieldPlaces().find(item => item.regionId === life.field.regionId && Math.hypot(item.x - life.field.x, item.y - life.field.y) <= 220);
      if (place) { life.placeId = place.id; if (!life.discovered.includes(place.id)) life.discovered.push(place.id); }
    }
    if (swept || result.critical || result.deaths.length || resourceCritical) this.#publish(next, time);
    else this.#state = next;
    this.#metrics.ticks++;
    for (const key of ['activePlayers', 'monsters']) this.#metrics[key] = result.counters[key];
    for (const key of ['interestQueries', 'monsterSteps', 'projectileChecks']) this.#metrics[key] += result.counters[key];
    return result.changed;
  }

  execute(token, request) {
    return this.#execute(this.#access(token), request);
  }

  #execute({ accountId, time }, request) {
    requireThat(request && typeof request === 'object' && !Array.isArray(request), 'INVALID_COMMAND', 'Lệnh không hợp lệ.');
    const { operationId, lifeId, action } = request;
    requireThat(typeof operationId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(operationId), 'INVALID_OPERATION', 'Mã thao tác không hợp lệ.');
    requireThat(typeof lifeId === 'string' && action && typeof action === 'object' && !Array.isArray(action), 'INVALID_COMMAND', 'Thiếu đời hoặc hành động.');
    requireThat(ACTIONS.has(action.type) && action.payload && typeof action.payload === 'object' && !Array.isArray(action.payload), 'INVALID_COMMAND', 'Hành động không hợp lệ.');
    const payloadHash = hash(canonical({ lifeId, action }));
    const account = this.#state.accounts[accountId];
    if (Object.hasOwn(account.operations, operationId)) {
      requireThat(account.operations[operationId] === payloadHash, 'OPERATION_CONFLICT', 'Mã thao tác đã được dùng cho một lệnh khác.', 409);
      return this.#view(accountId, time);
    }
    requireThat(lifeId === account.life.id, 'STALE_LIFE', 'Đời này đã kết thúc hoặc thay đổi. Hãy tải lại.', 409);
    requireThat(!account.life.trial || action.type === 'choose', 'TRIAL_ACTIVE', 'Đã cam kết khảo nghiệm; chỉ có thể chọn bước tiếp theo.', 409);
    requireThat(!account.life.dead || action.type === 'rebirth', 'LIFE_DEAD', 'Đời này đã mất. Hãy chọn xuất thân để tái sinh.', 409);
    if (ECONOMY.has(action.type)) requireThat(account.lastEconomyAt === null || time - account.lastEconomyAt >= 1000, 'COOLDOWN', 'Hãy đợi một giây giữa các hành động sinh kế.', 429);
    const next = clone(this.#state);
    const actor = next.accounts[accountId];
    try { this.#act(next, actor, action, time); }
    catch (error) { if (error.name === 'CultivationError' || error.name === 'ResourceError' || error instanceof ResourceWorldError) throw new WorldError(error.code, error.message, error.status ?? 409); throw error; }
    Object.defineProperty(actor.operations, operationId, { value: payloadHash, enumerable: true, writable: true, configurable: true });
    if (ECONOMY.has(action.type)) actor.lastEconomyAt = time;
    this.#publish(next, time);
    return this.#view(accountId, time);
  }

  #time() { const time = this.#now(); requireThat(Number.isFinite(time), 'INVALID_CLOCK', 'Đồng hồ máy chủ không hợp lệ.', 500); return time; }
  #day(state, time) { return 1 + Math.max(0, Math.floor((time - state.world.createdAt) / WORLD_DAY_MS)); }
  #newLife(account, origin, number, state, time) {
    const pool = origin.spawnPlaceIds ?? [origin.placeId];
    let placeId = pool[this.#randomIndex(pool.length)];
    const spawn = sampleSpawn(() => this.#randomIndex(1_000_000) / 1_000_000);
    const place = this.#fieldPlaces().find(item => item.regionId === spawn.regionId && Math.hypot(item.x - spawn.x, item.y - spawn.y) <= 220);
    if (place) placeId = place.id;
    const lifeId = randomUUID();
    const cultivation = createCultivationState({ lifeId, now: time });
    const stats = deriveCultivationStats(cultivation);
    const field = createFieldState(spawn, time);
    field.mp = stats.mp;
    const life = { id: lifeId, number, name: account.name, originId: origin.id, placeId,
      hp: 100, energy: 100, supplies: 8, stones: 20, rank: 1,
      skills: Object.fromEntries(SKILLS.map(s => [s, s === origin.skill ? 1 : 0])),
      discovered: [placeId], investigated: [], learned: [], gu: [], dead: false, cause: null, trial: null,
      trained: [], lessons: [], bornDay: this.#day(state, time), starterStonesRemaining: 20, starterSuppliesRemaining: 8,
      cultivation, field };
    initializeLifeResources(life, state.resourceWorld.clockMs);
    return life;
  }
  #accountId(token) {
    requireThat(typeof token === 'string' && token.length >= 30 && token.length <= 200, 'UNAUTHORIZED', 'Phiên chơi không hợp lệ.', 401);
    const tokenHash = hash(token);
    const account = Object.values(this.#state.accounts).find(a => a.tokenHash === tokenHash);
    requireThat(account, 'UNAUTHORIZED', 'Phiên chơi không hợp lệ.', 401);
    requireThat(!account.verifiedUserId, 'UNAUTHORIZED', 'Thế giới này đã liên kết Gmail. Hãy đăng nhập tài khoản đã xác minh.', 401);
    return account.id;
  }
  #verifiedAccountId(userId) {
    const account = typeof userId === 'string' && Object.values(this.#state.accounts).find(item => item.verifiedUserId === userId);
    requireThat(account, 'UNAUTHORIZED', 'Hãy liên kết Ngũ Vực với tài khoản Gmail trước.', 401);
    return account.id;
  }
  #access(token) {
    return this.#accessAccount(this.#accountId(token));
  }
  #accessAccount(accountId) {
    const time = this.#time();
    const next = this.#fieldDraft(accountId);
    const swept = this.#sweep(next, time);
    this.#wake(next.accounts[accountId], time);
    next.accounts[accountId].lastHeartbeatAt = time;
    if (swept) this.#publish(next, time);
    else this.#state = next;
    return { accountId, time };
  }
  #pauseCultivation(life, time) {
    const profile = life.cultivation;
    if (!profile || time <= profile.lastAdvancedAt) return;
    const pause = time - profile.lastAdvancedAt;
    if (profile.activity?.completeAt !== undefined) profile.activity.completeAt += pause;
    if (profile.activity?.startedAt !== undefined) profile.activity.startedAt += pause;
    profile.lastAdvancedAt = time;
  }
  #wake(account, time) {
    if (time - account.lastHeartbeatAt <= HEARTBEAT_GRACE_MS) return;
    this.#pauseCultivation(account.life, time);
    if (account.life.resources?.taming) account.life.resources.taming = null;
    if (account.life.field) account.life.field.move = { x: 0, y: 0 };
  }
  #sweep(state, time) {
    let changed = false;
    for (const account of Object.values(state.accounts)) {
      const trial = account.life.trial;
      if (!trial) continue;
      const offlineElapsed = Math.max(0, time - Math.max(trial.lastSweepAt, account.lastHeartbeatAt + HEARTBEAT_GRACE_MS));
      const allowance = Math.min(trial.pauseRemainingMs, offlineElapsed);
      trial.deadlineAt += allowance;
      trial.pauseRemainingMs -= allowance;
      trial.lastSweepAt = time;
      if (time >= trial.deadlineAt) { this.#die(state, account, 'Hết thời hạn khảo nghiệm.', time); changed = true; }
    }
    return changed;
  }
  #journal(state, account, title, text, time) { account.journal.push({ id: randomUUID(), title, text, day: this.#day(state, time) }); }
  #event(state, text, time) { state.events.push({ id: randomUUID(), day: this.#day(state, time), text }); if (state.events.length > 200) state.events.shift(); }
  #spend(life, { energy = 0, supplies = 0, stones = 0 }) {
    requireThat(life.energy >= energy && life.supplies >= supplies && life.stones >= stones, 'INSUFFICIENT_RESOURCES', 'Chưa đủ thể lực, vật tư hoặc nguyên thạch.');
    life.energy -= energy; life.supplies -= supplies; life.stones -= stones;
    life.starterStonesRemaining = Math.max(0, life.starterStonesRemaining - stones);
    life.starterSuppliesRemaining = Math.max(0, life.starterSuppliesRemaining - supplies);
  }
  #act(state, account, { type, payload }, time) {
    const life = account.life;
    const place = this.#places.get(life.placeId);
    if (life.field?.entered && ['investigate', 'work', 'rest', 'train', 'commit', 'loot'].includes(type)) {
      const point = this.#fieldPlaces().find(item => item.id === life.placeId);
      requireThat(point && Math.hypot(point.x - life.field.x, point.y - life.field.y) <= 220,
        'FIELD_NEAR_PLACE', 'Hãy đến gần địa điểm trên bản đồ để tương tác.', 409);
    }
    switch (type) {
      case 'resource': {
        applyWorldResourceAction(state, account, payload, { time, randomIndex: this.#randomIndex });
        break;
      }
      case 'academy': {
        const allowedKeys = new Set(['facilityId', 'option', 'guId', 'heavenQi', 'earthQi']);
        requireThat(Object.keys(payload).every(key => allowedKeys.has(key)) && typeof payload.facilityId === 'string' && typeof payload.option === 'string',
          'INVALID_ACADEMY_ACTION', 'Thao tác học đường không hợp lệ.');
        const facility = getFacility(payload.facilityId);
        requireThat(facility && life.field?.entered && isInsideSanctuary(life.field.x, life.field.y) &&
          Math.hypot(facility.x - life.field.x, facility.y - life.field.y) <= 220,
        'FACILITY_REQUIRED', 'Hãy đến gần NPC trong khu an toàn để tương tác.', 409);
        const options = {
          academy: ['claim-gu', 'tame-gu', 'cultivate', 'stop-cultivating', 'breakthrough'],
          'gu-warehouse': ['claim-gu', 'buy-gu'], 'refining-hall': ['tame-gu'],
          training: ['cultivate', 'stop-cultivating', 'breakthrough', 'ascend-shatter', 'ascend-absorb', 'ascend-release', 'resolve-tribulation'],
          inn: ['rest'], clinic: ['rest'],
        };
        requireThat(options[facility.role]?.includes(payload.option), 'FACILITY_ACTION_REQUIRED', 'NPC này không hướng dẫn hoạt động đã chọn.', 409);
        requireThat(!life.resources.taming && !life.resources.research, 'ACTIVITY_BUSY', 'Hãy dừng hoặc hoàn tất hoạt động tài nguyên đang làm.');
        if (payload.option === 'rest') {
          const price = facility.role === 'clinic' ? 2 : 0;
          this.#spend(life, { stones: price });
          life.hp = deriveCultivationStats(life.cultivation).maxHp; life.energy = 100; life.field.stamina = deriveCultivationStats(life.cultivation).maxStamina;
          life.field.actionResult = { ok: true, code: 'RESTED' };
          break;
        }
        const before = life.stones;
        const previousGuIds = new Set(life.cultivation.guInstances.map(gu => gu.id));
        settleLifeResources(state, life);
        const progress = advanceCultivation(life.cultivation, time, { inSanctuary: true });
        const result = applyAcademyAction(life.cultivation, payload, { now: time, stones: life.stones, inSanctuary: true });
        initializeGuLifecycle(life.cultivation, state.resourceWorld.clockMs);
        if (payload.option === 'claim-gu') for (const gu of life.cultivation.guInstances) if (!previousGuIds.has(gu.id)) gu.starterGrantLifeId = life.id;
        life.stones = result.stones;
        life.starterStonesRemaining = Math.max(0, life.starterStonesRemaining - Math.max(0, before - life.stones));
        life.rank = life.cultivation.rank;
        life.field.guIds = ownedGuIds(life.cultivation); life.field.mp = deriveCultivationStats(life.cultivation).mp;
        life.hp = Math.min(life.hp, deriveCultivationStats(life.cultivation).maxHp);
        life.field.actionResult = { ok: !result.dead, code: result.code ?? progress.code ?? 'OK' };
        if (result.dead) this.#die(state, account, 'Thăng tiên thất bại: mất cân bằng tam khí.', time);
        break;
      }
      case 'travel': {
        requireThat(!life.field?.entered, 'FIELD_TRAVEL_REQUIRED', 'Hãy di chuyển trực tiếp trong Ngũ Vực; bản đồ không dịch chuyển nhân vật.', 409);
        const destination = this.#places.get(payload.placeId);
        requireThat(destination && place.neighbors.includes(destination.id) && ['road', 'trail'].includes(payload.route), 'INVALID_ROUTE', 'Chỉ có thể đi theo đường nối tới địa điểm kề bên.');
        const border = place.regionId !== destination.regionId;
        this.#spend(life, { supplies: (payload.route === 'road' ? 1 : 2) + (border ? 1 : 0), stones: (payload.route === 'road' ? 2 : 0) + (border ? 3 : 0) });
        if (payload.route === 'trail') life.hp = Math.max(0, life.hp - Math.max(0, 8 - 2 * life.skills.survival));
        life.placeId = destination.id;
        if (!life.discovered.includes(destination.id)) life.discovered.push(destination.id);
        if (life.hp === 0) this.#die(state, account, 'Gục ngã trên đường mòn.', time);
        break;
      }
      case 'investigate':
        if (!life.investigated.includes(place.id)) {
          life.investigated.push(place.id);
          this.#journal(state, account, `Khảo sát ${place.name}`, `${place.secret}\n${place.returnReason}`, time);
        }
        break;
      case 'work': this.#spend(life, { energy: 10 }); life.stones += 8; life.supplies = Math.min(SUPPLY_CAPACITY, life.supplies + 3); break;
      case 'rest': life.hp = life.cultivation ? deriveCultivationStats(life.cultivation).maxHp : 100; life.energy = 100; break;
      case 'train':
        requireThat(payload.skill === place.skill, 'INVALID_SKILL', 'Nơi này chỉ hướng dẫn kỹ năng tại chỗ.');
        requireThat(!life.trained.includes(place.id), 'ALREADY_TRAINED', 'Đã luyện tập tại đây trong đời này.', 409);
        requireThat(life.skills[place.skill] < 5, 'SKILL_MAXIMUM', 'Kỹ năng đã đạt giới hạn.');
        this.#spend(life, { energy: 15, stones: 2 });
        life.skills[place.skill]++; life.trained.push(place.id); break;
      case 'commit': {
        const inheritance = this.#inheritances.get(payload.inheritanceId);
        requireThat(inheritance && inheritance.placeId === life.placeId, 'INVALID_INHERITANCE', 'Truyền thừa không ở địa điểm hiện tại.');
        requireThat(payload.acceptDeath === true, 'DEATH_ACCEPTANCE_REQUIRED', 'Cần chấp nhận nguy cơ mất đời hiện tại.');
        requireThat(life.investigated.includes(place.id), 'INVESTIGATION_REQUIRED', 'Cần khảo sát địa điểm trước khi cam kết.');
        requireThat(!life.learned.includes(inheritance.id), 'ALREADY_LEARNED', 'Đã học truyền thừa này trong đời hiện tại.', 409);
        requireThat(life.rank >= inheritance.minRank, 'RANK_REQUIRED', 'Cảnh giới chưa đủ để cam kết.');
        requireThat(life.supplies >= 3 && life.energy >= 30, 'INSUFFICIENT_RESOURCES', 'Cần ít nhất 3 vật tư và 30 thể lực để cam kết.');
        if (inheritance.uniqueGu) {
          const immortal = state.immortals.find(g => g.typeId === inheritance.uniqueGu);
          requireThat(immortal.status === 'reserved' && immortal.owner === `inheritance:${inheritance.id}` && !state.inheritanceStates[inheritance.id].reservedBy, 'UNIQUE_UNAVAILABLE', 'Cá thể Tiên Cổ đã thuộc một hành trình khác.', 409);
          immortal.owner = life.id;
          state.inheritanceStates[inheritance.id].reservedBy = life.id;
        }
        this.#pauseCultivation(life, time);
        if (life.cultivation) life.cultivation.activity = null;
        life.trial = { inheritanceId: inheritance.id, stageIndex: 0, danger: 0, deadlineAt: time + TRIAL_MS, pauseRemainingMs: OFFLINE_MS, lastSweepAt: time };
        this.#journal(state, account, `Cam kết ${inheritance.name}`, inheritance.commitment, time); break;
      }
      case 'choose': {
        requireThat(life.trial, 'NO_TRIAL', 'Không có khảo nghiệm đang diễn ra.', 409);
        const trial = life.trial;
        const inheritance = this.#inheritances.get(trial.inheritanceId);
        const stage = inheritance.stages[trial.stageIndex];
        requireThat(stage.id === payload.stageId, 'STALE_STAGE', 'Bước khảo nghiệm đã thay đổi. Hãy tải lại.', 409);
        const choice = stage.choices.find(c => c.id === payload.choiceId);
        requireThat(choice, 'INVALID_CHOICE', 'Lựa chọn không hợp lệ.');
        requireThat(life.skills[inheritance.skill] >= (choice.requiredSkill ?? 0), 'SKILL_REQUIRED', 'Kỹ năng chưa đạt yêu cầu của lựa chọn này.');
        this.#spend(life, { energy: choice.energyCost, supplies: choice.supplyCost });
        trial.danger = Math.max(0, trial.danger + choice.effect.danger);
        life.hp = Math.max(0, Math.min(life.cultivation ? deriveCultivationStats(life.cultivation).maxHp : 100, life.hp + choice.effect.hp));
        if (trial.danger >= 3 || life.hp <= 0) this.#die(state, account, `${inheritance.name}: ${inheritance.failure || 'Lựa chọn quyết định đã thất bại.'}`, time);
        else if (++trial.stageIndex >= inheritance.stages.length) this.#succeed(state, account, inheritance, time);
        break;
      }
      case 'rebirth': {
        requireThat(life.dead, 'LIFE_ALIVE', 'Đời hiện tại vẫn còn sống.', 409);
        const origin = this.#origins.get(payload.originId);
        requireThat(origin, 'INVALID_ORIGIN', 'Xuất thân không hợp lệ.');
        account.life = this.#newLife(account, origin, life.number + 1, state, time);
        account.lastEconomyAt = null;
        this.#journal(state, account, `Đời thứ ${account.life.number}`, `Khởi hành từ ${origin.name}. Kiến thức được giữ lại; sức mạnh bắt đầu lại.`, time); break;
      }
      case 'loot': {
        const index = state.remains.findIndex(r => r.id === payload.remainsId && r.placeId === life.placeId);
        requireThat(index >= 0, 'REMAINS_UNAVAILABLE', 'Di vật không còn hoặc không ở nơi này.', 409);
        const remains = state.remains[index];
        const supplies = Math.min(Math.max(0, SUPPLY_CAPACITY - life.supplies), remains.supplies);
        requireThat(remains.stones > 0 || supplies > 0 || remains.gu.length > 0 || remains.guInstances?.length > 0 || Object.values(remains.resources ?? {}).some(quantity => quantity > 0) || remains.supplies === 0, 'BAG_FULL', 'Túi lương thực đã đầy. Phần còn lại được giữ nguyên tại di vật.', 409);
        life.stones += remains.stones; life.supplies += supplies; life.gu.push(...remains.gu);
        for (const instanceId of remains.gu) { const immortal = state.immortals.find(g => g.instanceId === instanceId); immortal.owner = life.id; immortal.status = 'held'; }
        remains.stones = 0;
        remains.supplies -= supplies;
        remains.gu = [];
        lootLifeResources(state, life, remains);
        if (remains.supplies === 0 && !remains.guInstances?.length && !Object.values(remains.resources ?? {}).some(quantity => quantity > 0)) state.remains.splice(index, 1);
        this.#event(state, 'Một di vật đã đổi người trông giữ.', time); break;
      }
      case 'lesson': {
        const legend = this.#legends.get(payload.legendId);
        const choice = legend?.choices.find(c => c.id === payload.choiceId);
        requireThat(legend && choice, 'INVALID_LESSON', 'Bài học hoặc lựa chọn không hợp lệ.');
        requireThat(!life.lessons.includes(legend.id), 'ALREADY_LEARNED', 'Đã diễn giải bài học này trong đời hiện tại.', 409);
        life.lessons.push(legend.id);
        if (choice.effect.correct) life.skills[choice.effect.skill] = Math.min(5, life.skills[choice.effect.skill] + 1);
        this.#journal(state, account, legend.title, `${choice.label} — ${choice.hint} ${choice.effect.correct ? 'Đã hiểu một bài học qua trải nghiệm.' : 'Một cách hiểu cần suy ngẫm thêm.'}`, time); break;
      }
    }
  }
  #succeed(state, account, inheritance, time) {
    const life = account.life;
    const record = state.inheritanceStates[inheritance.id];
    this.#pauseCultivation(life, time);
    life.learned.push(inheritance.id);
    life.skills[inheritance.skill] = Math.min(5, life.skills[inheritance.skill] + 1);
    // Knowledge rewards never bypass aperture breakthroughs or immortal ascension.
    life.stones += 10 + record.bonusRemaining; record.bonusRemaining = 0;
    record.completedBy.push(life.id); record.reservedBy = null;
    if (inheritance.uniqueGu) {
      const immortal = state.immortals.find(g => g.typeId === inheritance.uniqueGu);
      immortal.owner = life.id; immortal.status = 'held'; life.gu.push(immortal.instanceId);
    }
    life.trial = null;
    this.#journal(state, account, `Hoàn thành ${inheritance.name}`, `${inheritance.success}\n${inheritance.reward}`, time);
    this.#event(state, 'Một khảo nghiệm truyền thừa đã khép lại.', time);
  }
  #die(state, account, cause, time) {
    const life = account.life;
    if (life.dead) return;
    if (life.trial) {
      const inheritance = this.#inheritances.get(life.trial.inheritanceId);
      if (inheritance.uniqueGu) {
        const immortal = state.immortals.find(g => g.typeId === inheritance.uniqueGu);
        if (immortal.status === 'reserved' && immortal.owner === life.id) immortal.owner = `inheritance:${inheritance.id}`;
        state.inheritanceStates[inheritance.id].reservedBy = null;
      }
    }
    const remains = { id: randomUUID(), placeId: life.placeId, stones: life.stones - life.starterStonesRemaining, supplies: life.supplies - life.starterSuppliesRemaining, gu: [...life.gu] };
    archiveLifeResources(state, life, remains);
    state.remains.push(remains);
    for (const instanceId of remains.gu) { const immortal = state.immortals.find(g => g.instanceId === instanceId); immortal.owner = remains.id; immortal.status = 'held'; }
    account.pastLives.push({ id: life.id, number: life.number, originId: life.originId, cause, placeId: life.placeId, rank: life.rank, day: this.#day(state, time) });
    life.hp = 0; life.energy = 0; life.stones = 0; life.supplies = 0; life.gu = []; life.dead = true; life.cause = cause; life.trial = null;
    if (life.cultivation) { life.cultivation.alive = false; life.cultivation.activity = null; for (const gu of life.cultivation.guInstances) gu.alive = false; }
    if (life.field) { life.field.mp = 0; life.field.stamina = 0; life.field.guIds = []; life.field.move = { x: 0, y: 0 }; life.field.projectiles = []; for (const key of Object.keys(life.field.buffs)) life.field.buffs[key] = 0; }
    life.starterStonesRemaining = 0; life.starterSuppliesRemaining = 0;
    this.#journal(state, account, `Đời thứ ${life.number} đã kết thúc`, cause, time);
    this.#event(state, 'Thiên địa ghi nhận một cuộc đời đã khép lại.', time);
  }
  #view(accountId, time) {
    const state = this.#state;
    const account = state.accounts[accountId];
    const { bornDay, starterStonesRemaining, starterSuppliesRemaining, field, ...life } = account.life;
    const publicLife = clone(life);
    publicLife.resources = resourceWorldView(state, account);
    if (life.trial) {
      const { lastSweepAt, ...trial } = life.trial;
      publicLife.trial = { ...trial, stage: publicStage(this.#inheritances.get(trial.inheritanceId).stages[trial.stageIndex]) };
    }
    return clone({
      world: { id: state.world.id, name: state.world.name, day: this.#day(state, time), revision: state.world.revision },
      account: { id: account.id, name: account.name, journal: account.journal, pastLives: account.pastLives, verified: !!account.verifiedUserId }, life: publicLife,
      catalog: { regions: this.#content.regions, places: this.#content.places,
        inheritances: this.#content.inheritances.map(({ stages, ...i }) => i),
        legends: this.#content.legends.map(l => ({ ...l, choices: l.choices.map(publicChoice) })), origins: this.#content.origins },
      inheritanceStates: Object.fromEntries(Object.entries(state.inheritanceStates).map(([id, record]) => [id, {
        ...record, reservedBy: record.reservedBy && record.reservedBy !== life.id ? UNKNOWN_OWNER : record.reservedBy,
        completedBy: record.completedBy.map(owner => owner === life.id ? owner : UNKNOWN_OWNER),
      }])),
      immortals: state.immortals.map(immortal => ({ ...immortal, owner: immortal.owner === life.id ? immortal.owner : UNKNOWN_OWNER,
        instanceId: immortal.owner === life.id ? immortal.instanceId : '' })), events: state.events.map(publicWorldEvent),
      presence: Object.values(state.accounts).filter(a => !a.life.dead && time - a.lastHeartbeatAt <= 60_000).map(a => ({ name: a.name, placeId: a.life.placeId, lifeNumber: a.life.number })),
      remains: state.remains.map(({ guInstances, resources, gu, ...remains }) => ({ ...remains, gu: gu.map(() => UNKNOWN_OWNER),
        capturedGuCount: guInstances?.filter(gu => gu.alive).length ?? 0, resourceCount: Object.values(resources ?? {}).reduce((sum, quantity) => sum + quantity, 0) })), serverTime: time,
    });
  }
  #publish(next, time) {
    next.savedAt = time; next.world.revision++;
    this.#validateState(next);
    if (this.#filePath) {
      mkdirSync(dirname(this.#filePath), { recursive: true });
      const temporary = `${this.#filePath}.${randomUUID()}.tmp`;
      let descriptor;
      try {
        descriptor = openSync(temporary, 'wx', 0o600);
        writeFileSync(descriptor, JSON.stringify(next)); fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
        renameSync(temporary, this.#filePath);
      } catch (error) {
        if (descriptor !== undefined) closeSync(descriptor);
        rmSync(temporary, { force: true });
        throw error;
      }
    }
    this.#state = next;
    this.#metrics.durableWrites++;
  }
  #validateContent() {
    const c = this.#content;
    for (const key of ['regions', 'places', 'inheritances', 'legends', 'origins']) {
      if (!Array.isArray(c[key]) || !c[key].length || new Set(c[key].map(x => x.id)).size !== c[key].length) throw new Error(`Invalid world content: ${key}`);
    }
    for (const i of c.inheritances) {
      if (!Array.isArray(i.stages) || !i.stages.length || !c.places.some(p => p.id === i.placeId) || !SKILLS.includes(i.skill)) throw new Error(`Invalid inheritance: ${i.id}`);
      for (const stage of i.stages) for (const choice of stage.choices ?? []) {
        if (![choice.energyCost, choice.supplyCost, choice.effect?.danger, choice.effect?.hp, choice.effect?.skill].every(Number.isFinite) || choice.energyCost < 0 || choice.supplyCost < 0) throw new Error(`Invalid choice: ${choice.id}`);
        if (choice.requiredSkill !== undefined && (!Number.isInteger(choice.requiredSkill) || choice.requiredSkill < 0 || choice.requiredSkill > 5)) throw new Error(`Invalid skill requirement: ${choice.id}`);
      }
    }
    for (const origin of c.origins) {
      if (!c.places.some(p => p.id === origin.placeId) || !SKILLS.includes(origin.skill)) throw new Error(`Invalid origin: ${origin.id}`);
      if (origin.spawnPlaceIds !== undefined && (!Array.isArray(origin.spawnPlaceIds) || !origin.spawnPlaceIds.length || new Set(origin.spawnPlaceIds).size !== origin.spawnPlaceIds.length || origin.spawnPlaceIds.some(id => !c.places.some(p => p.id === id)))) throw new Error(`Invalid spawn pool: ${origin.id}`);
    }
    for (const legend of c.legends) for (const choice of legend.choices) if (typeof choice.effect?.correct !== 'boolean' || !SKILLS.includes(choice.effect.skill)) throw new Error(`Invalid lesson: ${legend.id}`);
  }
  #upgradeStarterAccounting(state) {
    if (state?.schemaVersion !== 1 || Object.hasOwn(state, 'starterAccountingVersion')) return;
    // Historical saves have no reliable grant provenance. Preserve their assets once;
    // every subsequent life receives explicit non-transferable starter accounting.
    for (const account of Object.values(state.accounts ?? {})) {
      const life = account?.life;
      if (!life || typeof life !== 'object' || Array.isArray(life)) continue;
      if (!Object.hasOwn(life, 'starterStonesRemaining')) life.starterStonesRemaining = 0;
      if (!Object.hasOwn(life, 'starterSuppliesRemaining')) life.starterSuppliesRemaining = 0;
    }
    state.starterAccountingVersion = 1;
  }
  #upgradeRuntime(state, time) {
    if (!state.fieldRuntime) state.fieldRuntime = createFieldRuntime(time);
    for (const account of Object.values(state.accounts ?? {})) {
      const life = account?.life;
      if (!life) continue;
      if (!life.cultivation) {
        life.cultivation = migrateCultivationState(undefined, {
          lifeId: life.id, rank: life.rank, guIds: life.field?.guIds ?? (life.dead ? [] : [...FIELD_GU_IDS]), now: time,
        });
        if (life.dead) {
          life.cultivation.alive = false;
          life.cultivation.activity = null;
          for (const gu of life.cultivation.guInstances) gu.alive = false;
        }
      }
      if (!life.field) continue;
      // Validate the saved body before reconciling resource/inventory caches.
      // Migration must never turn malformed persisted identity into a fresh body.
      validateFieldState(life.field);
      for (const [id, monster] of Object.entries(life.field.monsters ?? {})) {
        const previous = state.fieldRuntime.monsters[id];
        if (!previous || monster.hp < previous.hp || monster.respawnAt > previous.respawnAt) state.fieldRuntime.monsters[id] = clone(monster);
      }
      life.field.monsters = {};
      life.field.move ??= { x: 0, y: 0 };
      life.field.cooldowns.moonbeam ??= 0;
      life.field.mp = life.dead ? 0 : deriveCultivationStats(life.cultivation).mp;
      life.field.guIds = life.dead ? [] : ownedGuIds(life.cultivation);
    }
    migrateWorldResources(state, time);
  }
  #validateState(state) {
    const invalid = message => { throw new Error(`Invalid world state: ${message}`); };
    if (state.schemaVersion !== 1 || state.starterAccountingVersion !== 1 || !state.world?.id || !Number.isFinite(state.world.createdAt) || !Number.isFinite(state.savedAt) || !Number.isInteger(state.world.revision) || !state.accounts || Array.isArray(state.accounts) || !Array.isArray(state.remains) || !Array.isArray(state.immortals) || !Array.isArray(state.events)) invalid('schema');
    const lifeIds = new Set();
    validateFieldRuntime(state.fieldRuntime);
    validateWorldResources(state);
    const verifiedUsers = new Set();
    for (const [id, account] of Object.entries(state.accounts)) {
      if (account.verifiedUserId !== undefined) {
        if (typeof account.verifiedUserId !== 'string' || !account.verifiedUserId.length || account.verifiedUserId.length > 100 || verifiedUsers.has(account.verifiedUserId)) invalid('verified account binding');
        verifiedUsers.add(account.verifiedUserId);
      }
      const l = account.life;
      if (account.id !== id || !/^[a-f0-9]{64}$/.test(account.tokenHash) || !Array.isArray(account.journal) || !Array.isArray(account.pastLives) || !account.operations || typeof account.operations !== 'object' || Array.isArray(account.operations) || !Number.isFinite(account.lastHeartbeatAt) || !l?.id || lifeIds.has(l.id) || !this.#places.has(l.placeId) || !this.#origins.has(l.originId)) invalid('account');
      lifeIds.add(l.id);
      validateCultivationState(l.cultivation);
      if (l.cultivation.lifeId !== l.id) invalid('cultivation owner');
      if (l.dead === l.cultivation.alive || l.dead && l.cultivation.activity) invalid('cultivation life state');
      if (l.field) validateFieldState(l.field, l);
      const maximumHp = deriveCultivationStats(l.cultivation).maxHp;
      if (![l.hp, l.energy, l.supplies, l.stones, l.rank].every(Number.isFinite) || l.hp < 0 || l.hp > maximumHp || l.energy < 0 || l.energy > 100 || l.supplies < 0 || l.supplies > SUPPLY_CAPACITY || l.stones < 0 || !Number.isInteger(l.rank) || l.rank < 1 || l.rank > 9 || l.rank !== l.cultivation.rank || !SKILLS.every(s => Number.isInteger(l.skills?.[s]) && l.skills[s] >= 0 && l.skills[s] <= 5)) invalid('life resources');
      if (!Number.isInteger(l.starterStonesRemaining) || l.starterStonesRemaining < 0 || l.starterStonesRemaining > Math.min(20, l.stones) || !Number.isInteger(l.starterSuppliesRemaining) || l.starterSuppliesRemaining < 0 || l.starterSuppliesRemaining > Math.min(8, l.supplies)) invalid('starter grant accounting');
      for (const key of ['discovered', 'investigated', 'learned', 'gu', 'trained', 'lessons']) if (!Array.isArray(l[key])) invalid(`life ${key}`);
      if (l.dead && (l.trial || l.gu.length || l.stones || l.supplies || !account.pastLives.some(p => p.id === l.id))) invalid('dead life');
      if (l.trial) {
        const t = l.trial; const inheritance = this.#inheritances.get(t.inheritanceId);
        if (!inheritance?.stages[t.stageIndex] || ![t.deadlineAt, t.pauseRemainingMs, t.lastSweepAt, t.danger].every(Number.isFinite) || t.pauseRemainingMs < 0 || t.pauseRemainingMs > OFFLINE_MS || t.danger < 0 || t.danger >= 3) invalid('trial');
        if (inheritance.uniqueGu && state.inheritanceStates?.[inheritance.id]?.reservedBy !== l.id) invalid('missing active unique reservation');
      }
    }
    for (const i of this.#content.inheritances) {
      const record = state.inheritanceStates?.[i.id];
      if (!record || ![0, 10].includes(record.bonusRemaining) || !Array.isArray(record.completedBy)) invalid('inheritance record');
      if (record.reservedBy && !Object.values(state.accounts).some(a => a.life.id === record.reservedBy && !a.life.dead && a.life.trial?.inheritanceId === i.id)) invalid('reservation');
    }
    const types = new Set(); const instances = new Set();
    const expectedTypes = new Set(this.#content.inheritances.map(i => i.uniqueGu).filter(Boolean));
    if (state.immortals.length !== expectedTypes.size) invalid('missing immortal registry');
    for (const immortal of state.immortals) {
      if (!expectedTypes.has(immortal.typeId) || types.has(immortal.typeId) || instances.has(immortal.instanceId) || !['reserved', 'held', 'destroyed'].includes(immortal.status)) invalid('duplicate or invalid immortal');
      types.add(immortal.typeId); instances.add(immortal.instanceId);
      const holders = [...Object.values(state.accounts).filter(a => a.life.gu.includes(immortal.instanceId)).map(a => a.life.id), ...state.remains.filter(r => r.gu.includes(immortal.instanceId)).map(r => r.id)];
      if (immortal.status === 'held' && (holders.length !== 1 || holders[0] !== immortal.owner)) invalid('immortal custody');
      if (immortal.status !== 'held' && holders.length) invalid('unheld immortal custody');
      const inheritance = this.#content.inheritances.find(i => i.uniqueGu === immortal.typeId);
      const reservedBy = state.inheritanceStates[inheritance.id].reservedBy;
      if (immortal.status === 'reserved' && immortal.owner !== (reservedBy ?? `inheritance:${inheritance.id}`)) invalid('reserved immortal custody');
      if (immortal.status !== 'reserved' && reservedBy) invalid('reservation without reserved immortal');
    }
    for (const r of state.remains) if (!this.#places.has(r.placeId) || !Array.isArray(r.gu) || ![r.stones, r.supplies].every(n => Number.isFinite(n) && n >= 0)) invalid('remains');
    for (const a of Object.values(state.accounts)) for (const instanceId of a.life.gu) if (!instances.has(instanceId)) invalid('unknown immortal');
    for (const r of state.remains) for (const instanceId of r.gu) if (!instances.has(instanceId)) invalid('unknown remains immortal');
  }
}

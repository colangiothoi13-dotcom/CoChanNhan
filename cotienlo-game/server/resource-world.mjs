import { randomUUID } from 'node:crypto';
import { OVERWORLD_HUBS, getNearbyFacilities, getFacility, isInsideSanctuary, nearestHub } from '../shared/overworld-core.mjs';
import { ownedGuIds, deriveCultivationStats, GU_DEFINITIONS, CULTIVATION_BALANCE } from '../shared/cultivation-core.mjs';
import {
  createResourceState, migrateResourceState, validateResourceState, initializeGuLifecycle,
  advanceResources, applyResourceAction, resourceSnapshot, createCapturedGu,
  addResource, removeResource, destroyGuInstance, RESOURCE_DEFINITIONS, RESOURCE_BALANCE, GU_CARE_DEFINITIONS,
} from '../shared/resource-core.mjs';

/** All figures in this module are proposed game balance, not novel facts. */
export const RESOURCE_WORLD_BALANCE = Object.freeze({ interactionRadius: 220, viewRadius: 1800,
  harvestStock: 6, harvestAmount: 2, harvestRespawnMs: 60000, wildStock: 3, wildRespawnMs: 90000,
  maxNodes: 96, maxListings: 128, maxLoans: 256, actionCooldownMs: 350, workCooldownMs: 5000,
  workReward: 5, settlementMs: 1000, offlineBatch: 16, listingFeeBps: 200,
  treasureHeavenAccessMs: 180000, treasureHeavenServiceFee: 1 });
const clone = value => structuredClone(value);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
export class ResourceWorldError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}
const requireThat = (ok, code, message, status) => { if (!ok) throw new ResourceWorldError(code, message, status); };
const nodeTemplates = [
  { suffix: 'moon-orchid', name: 'Vườn Nguyệt Lan', kind: 'harvest', resourceId: 'moon-orchid-petal', x: 520, y: -70 },
  { suffix: 'herbs', name: 'Luống linh thảo', kind: 'harvest', resourceId: 'spirit-herb', x: -520, y: -70 },
  { suffix: 'ore', name: 'Vỉa khoáng lộ thiên', kind: 'harvest', resourceId: 'copper-ore', x: 720, y: 260 },
  { suffix: 'light-glade', name: 'Bãi thực hành tìm Cổ', kind: 'wild', guType: 'smalllight', x: 0, y: -720 },
  { suffix: 'forest-gu', name: 'Dấu vết Cổ ngoài rừng', kind: 'wild', guType: 'moonlight', x: 0, y: -2700 },
];
export const RESOURCE_NODES = Object.freeze(OVERWORLD_HUBS.flatMap(hub => nodeTemplates.map(template => Object.freeze({
  ...template, id: `${hub.id}:source:${template.suffix}`, hubId: hub.id, regionId: hub.regionId,
  x: hub.x + template.x, y: hub.y + template.y,
}))));
const nodeById = new Map(RESOURCE_NODES.map(node => [node.id, node]));
const globalOptions = new Set(['scout', 'harvest', 'bait', 'weaken', 'capture', 'work', 'transfer-gu', 'revoke-loan', 'return-loan', 'destroy-gu', 'open-treasure-heaven', 'create-listing', 'buy-listing', 'cancel-listing']);
const payloadKeys = new Set(['option', 'resourceId', 'quantity', 'instanceId', 'guId', 'recipeId', 'inputIds', 'cropId', 'farmId', 'mode', 'enabled', 'budget', 'priority', 'nodeId', 'targetId', 'targetAccountId', 'listingId', 'price', 'facilityId']);

export function createResourceWorld(time) {
  return { version: 1, clockMs: 0, lastTickAt: time, nextSettlementAt: 1000, settlementCursor: 0,
    nodes: {}, listings: [], loans: [], lastActions: {}, lastWork: {} };
}
export function migrateWorldResources(state, time) {
  state.resourceWorld ??= createResourceWorld(time);
  for (const account of Object.values(state.accounts)) {
    const life = account.life;
    life.resources = migrateResourceState(life.resources, { lifeId: life.id, clockMs: state.resourceWorld.clockMs });
    initializeGuLifecycle(life.cultivation, state.resourceWorld.clockMs);
  }
  for (const remains of state.remains) { remains.guInstances ??= []; remains.resources ??= {}; }
}
export function initializeLifeResources(life, clockMs) {
  life.resources = createResourceState({ lifeId: life.id, clockMs });
  initializeGuLifecycle(life.cultivation, clockMs);
}
function treasureAccess(life, clockMs) { return life.cultivation.rank >= 6 && (life.resources.treasureAccessUntilMs ?? 0) > clockMs; }
function requireTreasureAccess(life, clockMs) {
  requireThat(treasureAccess(life, clockMs), 'TREASURE_HEAVEN_ACCESS_REQUIRED', 'Cần dịch vụ kết nối Bảo Hoàng Thiên còn hiệu lực từ thương điếm.');
}
function uniqueAvailable(state, typeId, rank, existingInstanceId) {
  if (rank < 6) return true;
  if (state.immortals.some(gu => gu.typeId === typeId && gu.status !== 'destroyed' && gu.instanceId !== existingInstanceId)) return false;
  return ![...Object.values(state.accounts).flatMap(account => account.life.cultivation.guInstances),
    ...state.remains.flatMap(remains => remains.guInstances ?? [])]
    .some(gu => gu.alive && gu.rank >= 6 && gu.typeId === typeId && gu.id !== existingInstanceId);
}
export function settleLifeResources(state, life, { active = true } = {}) {
  if (life.dead) return { stones: life.stones, critical: false, code: 'LIFE_DEAD', events: [] };
  initializeGuLifecycle(life.cultivation, state.resourceWorld.clockMs);
  let cancelled = false;
  for (const job of life.resources.jobs.filter(job => job.status === 'running' && job.anchorFacilityId)) {
    const facility = getFacility(job.anchorFacilityId);
    if (!active || !facility || !life.field || distance(facility, life.field) > 220) {
      if (life.cultivation.alive) applyResourceAction(life.cultivation, life.resources, { option: 'cancel-refine', instanceId: job.id },
        { clockMs: state.resourceWorld.clockMs, stones: life.stones });
      cancelled = true;
    }
  }
  const before = life.stones;
  const result = advanceResources(life.cultivation, life.resources, state.resourceWorld.clockMs, {
    stones: life.stones, inSanctuary: active && !!life.field && isInsideSanctuary(life.field.x, life.field.y),
    isUniqueAvailable: (typeId, rank, existingId) => uniqueAvailable(state, typeId, rank, existingId),
  });
  life.stones = result.stones;
  const destroyed = new Set(life.cultivation.guInstances.filter(gu => !gu.alive).map(gu => gu.id));
  state.resourceWorld.listings = state.resourceWorld.listings.filter(listing => !destroyed.has(listing.instanceId));
  state.resourceWorld.loans = state.resourceWorld.loans.filter(loan => !destroyed.has(loan.instanceId));
  life.hp = Math.min(life.hp, deriveCultivationStats(life.cultivation).maxHp);
  life.starterStonesRemaining = Math.max(0, life.starterStonesRemaining - Math.max(0, before - life.stones));
  if (life.field) life.field.guIds = life.dead ? [] : ownedGuIds(life.cultivation);
  return { ...result, critical: result.critical || cancelled };
}
export function advanceResourceWorld(state, activeAccounts, time, copyAccount) {
  const world = { ...state.resourceWorld, lastTickAt: time };
  const elapsed = Math.max(0, time - state.resourceWorld.lastTickAt);
  if (activeAccounts.length) world.clockMs += elapsed;
  state.resourceWorld = world;
  if (!activeAccounts.length || world.clockMs < world.nextSettlementAt) return false;
  world.nextSettlementAt = world.clockMs + RESOURCE_WORLD_BALANCE.settlementMs;
  const accounts = Object.values(state.accounts);
  const ids = new Set(activeAccounts.map(account => account.id));
  for (let i = 0; i < Math.min(RESOURCE_WORLD_BALANCE.offlineBatch, accounts.length); i++) {
    ids.add(accounts[(world.settlementCursor + i) % accounts.length].id);
  }
  world.settlementCursor = accounts.length ? (world.settlementCursor + RESOURCE_WORLD_BALANCE.offlineBatch) % accounts.length : 0;
  let critical = false;
  for (const id of ids) {
    const account = state.accounts[id];
    if (account.life.dead) continue;
    if (!activeAccounts.some(active => active.id === id)) state.accounts[id] = copyAccount(account);
    const result = settleLifeResources(state, state.accounts[id].life, { active: activeAccounts.some(active => active.id === id) });
    critical = result.critical || critical;
  }
  return critical;
}
function nearestService(life, facilityId) {
  const candidates = facilityId ? [getFacility(facilityId)].filter(Boolean) : getNearbyFacilities(life.field.x, life.field.y, 220);
  return candidates.filter(facility => distance(facility, life.field) <= 220).sort((a, b) => distance(a, life.field) - distance(b, life.field))[0];
}
function requireService(life, facilityId, roles) {
  const facility = nearestService(life, facilityId);
  requireThat(facility && roles.includes(facility.role), 'FACILITY_REQUIRED', 'Hãy đến gần NPC phù hợp trong khu dân cư.');
  return facility;
}
function spend(life, amount) {
  requireThat(integer(amount, 0, Number.MAX_SAFE_INTEGER) && life.stones >= amount, 'INSUFFICIENT_STONES', 'Chưa đủ nguyên thạch.');
  life.stones -= amount; life.starterStonesRemaining = Math.max(0, life.starterStonesRemaining - amount);
}
function heldGu(life, id) {
  const gu = life.cultivation.guInstances.find(gu => gu.id === id && gu.alive && (gu.holderLifeId ?? gu.ownerLifeId) === life.id);
  requireThat(gu, 'GU_NOT_HELD', 'Bạn không giữ cá thể Cổ này.');
  return gu;
}
function availableGu(life, id) {
  const gu = heldGu(life, id);
  requireThat(!gu.lock && !gu.tamingByLifeId && life.resources.taming?.instanceId !== gu.id && life.cultivation.activity?.guInstanceId !== gu.id, 'GU_BUSY', 'Cổ đang tham gia hoạt động khác.');
  return gu;
}
function ensureNode(world, node) {
  const current = world.nodes[node.id];
  if (current && (current.readyAt === null || current.readyAt > world.clockMs)) return current;
  const generation = (current?.generation ?? 0) + 1;
  const value = { generation, stock: node.kind === 'harvest' ? RESOURCE_WORLD_BALANCE.harvestStock : RESOURCE_WORLD_BALANCE.wildStock,
    readyAt: null, targets: node.kind === 'wild' ? Array.from({ length: RESOURCE_WORLD_BALANCE.wildStock }, (_, index) => ({
      id: `${node.id}:generation:${generation}:${index}`, healthBps: 10000, resistanceBps: 8000, baitedUntil: 0, alive: true,
    })) : [] };
  world.nodes[node.id] = value; return value;
}
function markDepleted(world, node, current) {
  if (current.stock <= 0) current.readyAt = node.kind === 'harvest' && !RESOURCE_DEFINITIONS[node.resourceId].renewable
    ? Number.MAX_SAFE_INTEGER : world.clockMs + (node.kind === 'harvest' ? RESOURCE_WORLD_BALANCE.harvestRespawnMs : RESOURCE_WORLD_BALANCE.wildRespawnMs);
}
function actualNode(life, payload) {
  const node = nodeById.get(payload.nodeId);
  requireThat(node, 'RESOURCE_UNAVAILABLE', 'Nguồn tài nguyên không tồn tại.');
  requireThat(distance(life.field, node) <= RESOURCE_WORLD_BALANCE.interactionRadius, 'RESOURCE_TOO_FAR', 'Hãy đến gần điểm tài nguyên trên bản đồ.');
  return node;
}
function targetFrom(current, payload) {
  const target = current.targets.find(target => target.id === payload.targetId && target.alive);
  requireThat(target, 'TARGET_UNAVAILABLE', 'Cổ đã rời đi hoặc có người bắt trước.');
  return target;
}
function moveGu(from, to, gu) {
  requireThat(to.cultivation.guInstances.filter(gu => gu.alive).length < (CULTIVATION_BALANCE.maxAliveGu ?? 256), 'GU_CAPACITY', 'Người nhận không còn chỗ giữ thêm Cổ sống.');
  from.cultivation.guInstances = from.cultivation.guInstances.filter(item => item.id !== gu.id);
  gu.holderLifeId = to.id; gu.storage = 'bag';
  to.cultivation.guInstances.push(gu);
  if (from.field) from.field.guIds = ownedGuIds(from.cultivation);
  if (to.field) to.field.guIds = ownedGuIds(to.cultivation);
}
function knownNode(life, node) { return life.resources.discoveredNodes.includes(node.id); }

export function applyWorldResourceAction(state, account, payload, { time, randomIndex }) {
  requireThat(payload && typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).every(key => payloadKeys.has(key)) && typeof payload.option === 'string',
    'INVALID_RESOURCE_ACTION', 'Thao tác tài nguyên không hợp lệ.', 400);
  const life = account.life, world = state.resourceWorld;
  requireThat(life.field?.entered, 'FIELD_REQUIRED', 'Hãy nhập thế trước khi tương tác tài nguyên.');
  settleLifeResources(state, life);
  const clockMs = world.clockMs;
  if (globalOptions.has(payload.option)) {
    const previous = world.lastActions[life.id];
    requireThat(previous === undefined || clockMs - previous >= RESOURCE_WORLD_BALANCE.actionCooldownMs, 'RESOURCE_COOLDOWN', 'Hãy chờ một chút giữa các thao tác.');
    world.lastActions[life.id] = clockMs;
  }
  let code = 'RESOURCE_UPDATED';
  if (['scout', 'harvest', 'bait', 'weaken', 'capture'].includes(payload.option)) {
    const node = actualNode(life, payload);
    const current = ensureNode(world, node);
    if (payload.option === 'scout') {
      if (!knownNode(life, node)) life.resources.discoveredNodes.push(node.id);
      if (node.resourceId && !life.resources.knownResources.includes(node.resourceId)) life.resources.knownResources.push(node.resourceId);
      if (node.guType && !life.resources.knownGuTypes.includes(node.guType)) life.resources.knownGuTypes.push(node.guType);
      code = 'SOURCE_DISCOVERED';
    } else {
      requireThat(knownNode(life, node), 'SCOUT_REQUIRED', 'Khảo sát dấu vết trước khi tác động nguồn này.');
      requireThat(current.stock > 0 && current.readyAt === null, 'SOURCE_DEPLETED', 'Nguồn đã cạn, cần đợi hồi phục.');
      if (payload.option === 'harvest') {
        requireThat(node.kind === 'harvest', 'HARVEST_REQUIRED', 'Đây là nơi có Cổ sống, không phải nguyên liệu thu hái.');
        const quantity = Math.min(RESOURCE_WORLD_BALANCE.harvestAmount, current.stock);
        addResource(life.resources, node.resourceId, quantity); current.stock -= quantity;
        code = 'RESOURCE_HARVESTED';
      } else {
        requireThat(node.kind === 'wild', 'WILD_REQUIRED', 'Nguồn này không có Cổ hoang.');
        const target = targetFrom(current, payload);
        if (payload.option === 'bait') { removeResource(life.resources, 'bait', 1); target.baitedUntil = clockMs + 30000; code = 'TARGET_BAITED'; }
        if (payload.option === 'weaken') {
          requireThat(life.field.stamina >= 5, 'INSUFFICIENT_STAMINA', 'Cần thể lực để khống chế có kiểm soát.');
          life.field.stamina -= 5; target.healthBps = Math.max(0, target.healthBps - 1800);
          target.resistanceBps = Math.max(1000, target.resistanceBps - 1200);
          if (!target.healthBps) { target.alive = false; current.stock--; code = 'TARGET_KILLED'; }
          else code = 'TARGET_WEAKENED';
        }
        if (payload.option === 'capture') {
          removeResource(life.resources, 'capture-net', 1);
          const helpers = Object.values(state.accounts).filter(other => other.id !== account.id && !other.life.dead && other.life.field?.entered && distance(other.life.field, life.field) <= 220).length;
          const threshold = Math.min(9500, 1800 + (target.baitedUntil > clockMs ? 3000 : 0) + Math.floor((10000 - target.healthBps) / 2) + Math.min(1500, helpers * 750));
          const roll = randomIndex(10000);
          if (roll < threshold) {
            createCapturedGu(life.cultivation, node.guType, { clockMs, healthBps: target.healthBps, willBps: target.resistanceBps });
            target.alive = false; current.stock--; code = 'GU_CAPTURED_UNTAMED';
          } else if (roll >= 9000) { target.alive = false; current.stock--; code = 'TARGET_ESCAPED'; }
          else code = 'CAPTURE_FAILED';
          life.resources.notices.push(code === 'GU_CAPTURED_UNTAMED' ? 'Bắt sống thành công; Cổ vẫn cần luyện hóa và nuôi dưỡng.' : code === 'TARGET_ESCAPED' ? 'Cổ thoát khỏi lưới và bỏ trốn.' : 'Lưới không giữ được mục tiêu; trạng thái Cổ vẫn được giữ.');
          life.resources.notices = life.resources.notices.slice(-16);
        }
      }
      markDepleted(world, node, current);
    }
  } else if (payload.option === 'work') {
    requireService(life, payload.facilityId, ['academy', 'gu-warehouse', 'inn']);
    const previous = world.lastWork[life.id];
    requireThat(previous === undefined || clockMs - previous >= RESOURCE_WORLD_BALANCE.workCooldownMs, 'WORK_COOLDOWN', 'NPC cần năm giây trước khi giao việc tiếp.');
    world.lastWork[life.id] = clockMs; life.stones += RESOURCE_WORLD_BALANCE.workReward; addResource(life.resources, 'water', 1); code = 'WORK_COMPLETED';
  } else if (payload.option === 'transfer-gu') {
    const receiver = Object.hasOwn(state.accounts, payload.targetAccountId) ? state.accounts[payload.targetAccountId] : null;
    requireThat(receiver && receiver.id !== account.id && !receiver.life.dead && receiver.life.field?.entered && distance(receiver.life.field, life.field) <= 220, 'PLAYER_TOO_FAR', 'Người nhận cần đứng gần và còn sống.');
    settleLifeResources(state, receiver.life);
    const gu = availableGu(life, payload.instanceId);
    requireThat(!gu.vitalForLifeId || !Object.values(state.accounts).some(other => other.life.id === gu.vitalForLifeId && !other.life.dead), 'VITAL_GU_BOUND', 'Chuyển Cổ bản mệnh cần một cơ chế xử lý phản phệ riêng.');
    requireThat(!gu.starterGrantLifeId, 'STARTER_GU_BOUND', 'Cổ nhập môn miễn phí gắn với cuộc đời này; Cổ bắt, mua hoặc luyện chế có thể chuyển giao.');
    requireThat(!world.loans.some(loan => loan.instanceId === gu.id), 'LOAN_RETURN_REQUIRED', 'Cổ đang mượn cần trả thân Cổ, không thể đem tặng.');
    requireThat(payload.mode === 'gift' || payload.mode === 'loan', 'INVALID_TRANSFER', 'Chọn tặng hoặc cho mượn.');
    if (payload.mode === 'loan') {
      requireThat(gu.controlled && gu.controllerLifeId === life.id && world.loans.length < RESOURCE_WORLD_BALANCE.maxLoans, 'LOAN_UNAVAILABLE', 'Cần Cổ đã luyện hóa và còn chỗ theo dõi cho mượn.');
      gu.authorizedLifeIds = [receiver.life.id];
      world.loans.push({ instanceId: gu.id, controllerLifeId: life.id, holderLifeId: receiver.life.id, status: 'active' });
    } else {
      if (gu.controllerLifeId === life.id) { gu.controllerLifeId = receiver.life.id; gu.oldControllerLifeId = null; }
      gu.authorizedLifeIds = []; gu.ownerLifeId = receiver.life.id;
    }
    moveGu(life, receiver.life, gu); code = payload.mode === 'loan' ? 'GU_LOANED' : 'GU_GIFTED';
  } else if (payload.option === 'revoke-loan' || payload.option === 'return-loan') {
    const loan = world.loans.find(loan => loan.instanceId === payload.instanceId);
    requireThat(loan, 'LOAN_UNAVAILABLE', 'Không có khoản cho mượn tương ứng.');
    const holder = Object.values(state.accounts).find(other => other.life.id === loan.holderLifeId);
    const controller = Object.values(state.accounts).find(other => other.life.id === loan.controllerLifeId);
    const gu = holder?.life.cultivation.guInstances.find(gu => gu.id === loan.instanceId && gu.alive);
    requireThat(gu, 'GU_NOT_HELD', 'Cổ không còn ở người đang mượn.');
    if (payload.option === 'revoke-loan') {
      requireThat(loan.controllerLifeId === life.id, 'CONTROLLER_REQUIRED', 'Chỉ chủ luyện hóa được thu hồi quyền dùng.');
      gu.authorizedLifeIds = []; loan.status = 'revoked'; code = 'LOAN_PERMISSION_REVOKED';
    } else {
      requireThat(loan.holderLifeId === life.id && controller && !controller.life.dead && distance(controller.life.field, life.field) <= 220, 'PLAYER_TOO_FAR', 'Đến gần chủ luyện hóa để trả thân Cổ.');
      requireThat(!gu.lock, 'GU_BUSY', 'Cổ đang bận.'); gu.authorizedLifeIds = []; moveGu(life, controller.life, gu);
      world.loans = world.loans.filter(record => record !== loan); code = 'GU_RETURNED';
    }
  } else if (payload.option === 'destroy-gu') {
    requireThat(payload.mode === 'confirm', 'DESTRUCTION_CONFIRMATION_REQUIRED', 'Cần xác nhận rõ việc hủy Cổ vĩnh viễn.');
    const container = Object.values(state.accounts).find(other => other.life.cultivation.guInstances.some(gu => gu.id === payload.instanceId && gu.alive));
    const corpse = state.remains.find(remains => remains.guInstances?.some(gu => gu.id === payload.instanceId && gu.alive));
    const gu = container?.life.cultivation.guInstances.find(gu => gu.id === payload.instanceId && gu.alive) ?? corpse?.guInstances.find(gu => gu.id === payload.instanceId && gu.alive);
    const legacy = state.immortals.find(gu => gu.instanceId === payload.instanceId && gu.status === 'held' && gu.owner === life.id);
    requireThat(gu?.controlled && gu.controllerLifeId === life.id || legacy, 'CONTROLLER_REQUIRED', 'Chỉ chủ luyện hóa có thể ra lệnh này.');
    if (gu) {
      const holdingProfile = container?.life.cultivation ?? { ...life.cultivation, lifeId: corpse.id, guInstances: corpse.guInstances };
      const destruction = destroyGuInstance(holdingProfile, gu.id, { controllerLifeId: life.id });
      if (destruction.backlashLifeId === life.id) {
        life.cultivation.body.woundBps = Math.min(10000, life.cultivation.body.woundBps + 4000);
        life.cultivation.soul.woundBps = Math.min(10000, life.cultivation.soul.woundBps + 4000);
      }
      life.hp = Math.min(life.hp, deriveCultivationStats(life.cultivation).maxHp);
      if (container?.life.field) container.life.field.guIds = ownedGuIds(container.life.cultivation);
    } else { legacy.status = 'destroyed'; life.gu = life.gu.filter(id => id !== legacy.instanceId); }
    world.listings = world.listings.filter(listing => listing.instanceId !== payload.instanceId);
    world.loans = world.loans.filter(loan => loan.instanceId !== payload.instanceId);
    code = 'GU_DESTROYED_BY_CONTROLLER';
  } else if (payload.option === 'open-treasure-heaven') {
    const broker = requireService(life, payload.facilityId, ['academy', 'gu-warehouse']);
    requireThat(life.cultivation.rank >= 6, 'IMMORTAL_ACCESS_REQUIRED', 'Dịch vụ thương điếm Bảo Hoàng Thiên hiện dành cho Cổ Tiên.');
    removeResource(life.resources, 'immortal-stone', RESOURCE_WORLD_BALANCE.treasureHeavenServiceFee);
    life.resources.treasureAccessUntilMs = Math.max(clockMs, life.resources.treasureAccessUntilMs ?? 0) + RESOURCE_WORLD_BALANCE.treasureHeavenAccessMs;
    life.resources.treasureBrokerHubId = broker.hubId;
    life.resources.notices.push('Đã thuê thương điếm kết nối Bảo Hoàng Thiên. Đây là dịch vụ game có giới hạn thời gian, không cấp Thông Thiên Cổ cho nhân vật.');
    life.resources.notices = life.resources.notices.slice(-16); code = 'TREASURE_HEAVEN_CONNECTED';
  } else if (payload.option === 'create-listing') {
    requireThat(integer(payload.price, 1, 1000000) && world.listings.length < RESOURCE_WORLD_BALANCE.maxListings, 'INVALID_LISTING', 'Giá cần từ 1 đến 1.000.000 và chợ còn chỗ.');
    requireThat(payload.mode === undefined || payload.mode === 'local' || payload.mode === 'treasure-heaven', 'INVALID_MARKET_CHANNEL', 'Kênh giao dịch không hợp lệ.');
    const channel = payload.mode ?? 'local';
    if (channel === 'treasure-heaven') requireTreasureAccess(life, clockMs);
    const hubId = channel === 'treasure-heaven' ? life.resources.treasureBrokerHubId ?? life.field.hubId : requireService(life, payload.facilityId, ['academy', 'gu-warehouse']).hubId;
    const listing = { id: randomUUID(), sellerLifeId: life.id, sellerAccountId: account.id, sellerName: account.name,
      hubId, channel, currency: channel === 'treasure-heaven' ? 'immortal-stone' : 'primeval-stone', price: payload.price, fee: Math.max(1, Math.ceil(payload.price * RESOURCE_WORLD_BALANCE.listingFeeBps / 10000)) };
    if (payload.instanceId) {
      const gu = availableGu(life, payload.instanceId);
      requireThat(!gu.vitalForLifeId || !Object.values(state.accounts).some(other => other.life.id === gu.vitalForLifeId && !other.life.dead), 'VITAL_GU_BOUND', 'Không thể niêm yết Cổ bản mệnh của người còn sống.');
      requireThat(!gu.starterGrantLifeId && !world.loans.some(loan => loan.instanceId === gu.id), 'CONTROLLER_REQUIRED', 'Cổ nhập môn hoặc Cổ đang mượn không được đem bán.');
      gu.lock = { kind: 'listed', id: listing.id }; Object.assign(listing, { kind: 'gu', instanceId: gu.id, quantity: 1 });
    } else {
      requireThat(integer(payload.quantity, 1, 10000) && RESOURCE_DEFINITIONS[payload.resourceId], 'INVALID_LISTING', 'Số lượng hoặc loại hàng không hợp lệ.');
      removeResource(life.resources, payload.resourceId, payload.quantity);
      Object.assign(listing, { kind: 'resource', resourceId: payload.resourceId, quantity: payload.quantity });
    }
    world.listings.push(listing); code = 'LISTING_CREATED';
  } else if (payload.option === 'buy-listing' || payload.option === 'cancel-listing') {
    const listing = world.listings.find(listing => listing.id === payload.listingId);
    requireThat(listing, 'LISTING_UNAVAILABLE', 'Món hàng đã bán hoặc rút khỏi chợ.');
    const seller = state.accounts[listing.sellerAccountId];
    requireThat(seller && seller.life.id === listing.sellerLifeId && !seller.life.dead, 'LISTING_UNAVAILABLE', 'Người bán không còn cuộc đời đã niêm yết.');
    settleLifeResources(state, seller.life);
    if (listing.channel === 'treasure-heaven' && payload.option === 'buy-listing') requireTreasureAccess(life, clockMs);
    else {
      const facility = requireService(life, payload.facilityId, ['academy', 'gu-warehouse']);
      if (listing.channel !== 'treasure-heaven') requireThat(facility.hubId === listing.hubId, 'MARKET_TOO_FAR', 'Đến đúng chợ nơi hàng được gửi.');
    }
    const gu = listing.kind === 'gu' ? heldGu(seller.life, listing.instanceId) : null;
    if (payload.option === 'cancel-listing') requireThat(seller.id === account.id, 'CONTROLLER_REQUIRED', 'Chỉ người bán được rút hàng.');
    else {
      requireThat(seller.id !== account.id, 'OWN_LISTING', 'Không thể tự mua hàng của mình.');
      if (listing.channel === 'treasure-heaven') {
        removeResource(life.resources, 'immortal-stone', listing.price);
        if (listing.price > listing.fee) addResource(seller.life.resources, 'immortal-stone', listing.price - listing.fee);
      } else { spend(life, listing.price); seller.life.stones += listing.price - listing.fee; }
    }
    const destination = payload.option === 'cancel-listing' ? seller.life : life;
    if (gu) {
      gu.lock = null;
      if (destination !== seller.life) {
        if (gu.controllerLifeId === seller.life.id) { gu.controllerLifeId = life.id; gu.oldControllerLifeId = null; }
        gu.authorizedLifeIds = []; gu.ownerLifeId = life.id; moveGu(seller.life, life, gu);
      }
    } else addResource(destination.resources, listing.resourceId, listing.quantity);
    world.listings = world.listings.filter(item => item !== listing); code = payload.option === 'cancel-listing' ? 'LISTING_CANCELLED' : 'LISTING_BOUGHT';
  } else {
    const facilityRoles = { 'buy-resource': ['academy', 'gu-warehouse'], 'sell-resource': ['academy', 'gu-warehouse'],
      'buy-gu': ['academy', 'gu-warehouse'], research: ['academy', 'refining-hall'], 'start-refine': ['academy', 'refining-hall'], 'improve-farm': ['academy', 'training'] };
    const requiredRoles = payload.option === 'store-gu' && payload.mode !== 'bag' ? ['academy', 'gu-warehouse', 'refining-hall'] : facilityRoles[payload.option];
    const facility = requiredRoles ? requireService(life, payload.facilityId, requiredRoles) : nearestService(life, payload.facilityId);
    requireThat(!['tame', 'start-refine', 'research'].includes(payload.option) || !life.cultivation.activity,
      'ACTIVITY_BUSY', 'Hãy dừng hoạt động tu luyện hoặc luyện hóa đang làm trước.');
    const before = life.stones;
    if (payload.option === 'tame') {
      const loan = world.loans.find(loan => loan.instanceId === payload.instanceId);
      const controller = loan && Object.values(state.accounts).find(other => other.life.id === loan.controllerLifeId && !other.life.dead);
      requireThat(!loan || !controller, 'LOAN_RETURN_REQUIRED', 'Quyền cho mượn không cho phép chiếm quyền luyện hóa. Hãy trả Cổ hoặc xin chuyển giao.');
      if (loan) world.loans = world.loans.filter(item => item !== loan);
    }
    const sanctuary = isInsideSanctuary(life.field.x, life.field.y);
    const apertureEnvironment = !!life.cultivation.immortal && life.cultivation.immortal.habitatBps >= 5000;
    const result = applyResourceAction(life.cultivation, life.resources, payload, { clockMs, stones: life.stones,
      inSanctuary: sanctuary || payload.option === 'plant' && apertureEnvironment, facilityRole: facility?.role,
      availableEnvironments: sanctuary || apertureEnvironment ? ['moon-garden', 'star-meadow'] : [],
      randomRoll: randomIndex(10000), isUniqueAvailable: (typeId, rank, existingId) => uniqueAvailable(state, typeId, rank, existingId) });
    if (payload.option === 'start-refine') {
      const job = life.resources.jobs.findLast(job => job.status === 'running');
      if (job && facility) job.anchorFacilityId = facility.id;
    }
    life.stones = result.stones; life.starterStonesRemaining = Math.max(0, life.starterStonesRemaining - Math.max(0, before - result.stones)); code = result.code;
  }
  life.field.guIds = ownedGuIds(life.cultivation); life.field.mp = life.cultivation.mortal ? life.cultivation.mortal.amountBps / 100 : life.cultivation.immortal?.units ?? 0;
  life.field.actionResult = { ok: true, code };
  return code;
}

export function resourceWorldView(state, account) {
  const life = account.life, world = state.resourceWorld, clockMs = world.clockMs;
  const view = resourceSnapshot(life.cultivation, life.resources, clockMs);
  const point = life.field ?? nearestHub(60000, 100000);
  const nearbyNodes = RESOURCE_NODES.filter(node => distance(point, node) <= RESOURCE_WORLD_BALANCE.viewRadius).slice(0, 24).map(node => {
    const known = knownNode(life, node), current = world.nodes[node.id];
    const ready = current?.readyAt !== null && current?.readyAt <= clockMs;
    return { id: node.id, name: node.name, kind: node.kind, x: node.x, y: node.y, discovered: known,
      ...(known && node.resourceId ? { resourceId: node.resourceId } : {}),
      ...(known ? { stock: ready ? node.kind === 'wild' ? RESOURCE_WORLD_BALANCE.wildStock : RESOURCE_WORLD_BALANCE.harvestStock : current?.stock ?? (node.kind === 'wild' ? RESOURCE_WORLD_BALANCE.wildStock : RESOURCE_WORLD_BALANCE.harvestStock) } : {}),
      ...(current?.readyAt === Number.MAX_SAFE_INTEGER ? {} : { readyInMs: Math.max(0, (current?.readyAt ?? clockMs) - clockMs) }),
      description: known ? node.kind === 'wild' ? 'Cổ còn sống; cần giam giữ, luyện hóa và nuôi.' : RESOURCE_DEFINITIONS[node.resourceId].renewable ? 'Nguồn tái tạo theo đồng hồ thế giới.' : 'Vỉa khoáng hữu hạn; không tự tái tạo sau khi khai thác hết.' : 'Chỉ mới biết dấu vết. Đến gần để khảo sát.' };
  });
  const wildTargets = nearbyNodes.filter(node => node.kind === 'wild' && node.discovered).flatMap(node => {
    const source = nodeById.get(node.id), current = world.nodes[node.id];
    if (!current || current.readyAt !== null && current.readyAt > clockMs) return [];
    return current.targets.filter(target => target.alive).map(target => ({ id: target.id, nodeId: node.id,
      name: source.guType === 'smalllight' ? 'Tiểu Quang Cổ hoang' : 'Nguyệt Quang Cổ hoang', typeId: source.guType, rank: 1,
      x: node.x, y: node.y, healthBps: target.healthBps, resistanceBps: target.resistanceBps, baited: target.baitedUntil > clockMs }));
  });
  const market = world.listings.filter(listing => listing.channel !== 'treasure-heaven' || listing.sellerAccountId === account.id || treasureAccess(life, clockMs)).map(listing => {
    const seller = state.accounts[listing.sellerAccountId];
    const gu = listing.kind === 'gu' ? seller?.life.cultivation.guInstances.find(gu => gu.id === listing.instanceId && gu.alive) : null;
    if (listing.kind === 'gu' && !gu) return null;
    const guView = gu ? publicListingGu(gu) : undefined;
    return { id: listing.id, sellerName: listing.sellerName, kind: listing.kind, resourceId: listing.resourceId,
      quantity: listing.quantity, price: listing.price, fee: listing.fee, own: listing.sellerAccountId === account.id,
      hubId: listing.hubId, channel: listing.channel, currency: listing.currency ?? 'primeval-stone', ...(guView ? { gu: guView } : {}) };
  }).filter(Boolean);
  const players = Object.values(state.accounts).filter(other => other.id !== account.id && !other.life.dead && other.life.field?.entered && distance(other.life.field, point) <= 220)
    .slice(0, 32).map(other => ({ accountId: other.id, lifeId: other.life.id, name: other.name }));
  const loans = world.loans.filter(loan => loan.controllerLifeId === life.id || loan.holderLifeId === life.id).map(loan => ({ ...loan,
    borrowerName: Object.values(state.accounts).find(other => other.life.id === loan.holderLifeId)?.name ?? 'Người giữ Cổ', own: loan.controllerLifeId === life.id }));
  const marketAccess = { treasureHeavenUntilMs: life.resources.treasureAccessUntilMs ?? 0, active: treasureAccess(life, clockMs),
    serviceFee: RESOURCE_WORLD_BALANCE.treasureHeavenServiceFee, currency: 'immortal-stone' };
  return { ...view, revision: state.world.revision, nearbyNodes, wildTargets, market, players, loans, marketAccess };
}

function publicListingGu(gu) {
  const care = GU_CARE_DEFINITIONS[gu.typeId];
  return { id: gu.id, typeId: gu.typeId, name: GU_DEFINITIONS[gu.typeId].name, rank: gu.rank,
    holderLifeId: '', controllerLifeId: null, authorizedLifeIds: [], controlled: gu.controlled, usable: false,
    healthBps: gu.healthBps, vitalForLifeId: null, willBps: gu.willBps, tamingProgressBps: gu.tamingProgressBps,
    feeding: { foodId: care.foodId, amount: care.amount, remainingMs: gu.feeding.remainingMs, state: gu.feeding.state },
    storage: gu.storage, lock: gu.lock ? { ...gu.lock } : null, care: { ...care, substitutes: [...care.substitutes] } };
}

export function archiveLifeResources(state, life, remains) {
  settleLifeResources(state, life);
  const unused = {};
  for (const job of life.resources.jobs.filter(job => job.status === 'running')) {
    for (const [id, quantity] of Object.entries(job.reservedMaterials ?? {})) unused[id] = (unused[id] ?? 0) + quantity;
    job.reservedMaterials = {};
  }
  remains.stones = life.stones - life.starterStonesRemaining;
  remains.supplies = life.supplies - life.starterSuppliesRemaining;
  remains.guInstances = life.cultivation.guInstances.filter(gu => gu.alive && !gu.starterGrantLifeId);
  for (const gu of remains.guInstances) {
    gu.lock = null; gu.storage = 'bag'; gu.holderLifeId = remains.id; gu.oldControllerLifeId = gu.controllerLifeId;
    gu.tamingByLifeId = null;
    if (gu.controllerLifeId) { gu.willBps = Math.max(gu.willBps, 8000); gu.tamingProgressBps = 0; }
    const loan = state.resourceWorld.loans.find(loan => loan.instanceId === gu.id);
    if (loan) { loan.holderLifeId = remains.id; loan.status = 'revoked'; gu.authorizedLifeIds = []; }
  }
  remains.resources = clone(life.resources.items);
  for (const [id, quantity] of Object.entries(unused)) remains.resources[id] = (remains.resources[id] ?? 0) + quantity;
  for (const listing of state.resourceWorld.listings.filter(listing => listing.sellerLifeId === life.id)) {
    if (listing.kind === 'resource') remains.resources[listing.resourceId] = (remains.resources[listing.resourceId] ?? 0) + listing.quantity;
  }
  state.resourceWorld.listings = state.resourceWorld.listings.filter(listing => listing.sellerLifeId !== life.id);
  delete state.resourceWorld.lastActions[life.id]; delete state.resourceWorld.lastWork[life.id];
  life.cultivation.guInstances = []; life.resources.items = {}; life.resources.jobs = []; life.resources.farms = []; life.resources.taming = null; life.resources.research = null;
}
export function lootLifeResources(state, life, remains) {
  settleLifeResources(state, life);
  for (const [id, quantity] of Object.entries(remains.resources ?? {})) {
    const accepted = Math.min(quantity, RESOURCE_BALANCE.maxQuantity - (life.resources.items[id] ?? 0));
    if (accepted > 0) addResource(life.resources, id, accepted);
    remains.resources[id] = quantity - accepted;
  }
  const overflow = [];
  for (const gu of remains.guInstances ?? []) {
    if (gu.alive && life.cultivation.guInstances.filter(gu => gu.alive).length >= (CULTIVATION_BALANCE.maxAliveGu ?? 256)) { overflow.push(gu); continue; }
    gu.holderLifeId = life.id; gu.lock = null; gu.authorizedLifeIds = [];
    life.cultivation.guInstances.push(gu);
    const loan = state.resourceWorld.loans.find(loan => loan.instanceId === gu.id);
    if (loan) {
      loan.holderLifeId = life.id;
      if (loan.controllerLifeId === life.id) state.resourceWorld.loans = state.resourceWorld.loans.filter(item => item !== loan);
    }
  }
  remains.guInstances = overflow;
  settleLifeResources(state, life);
  if (life.field) life.field.guIds = ownedGuIds(life.cultivation);
}
export function validateWorldResources(state) {
  const world = state.resourceWorld;
  requireThat(world?.version === 1 && integer(world.clockMs, 0, Number.MAX_SAFE_INTEGER) && Number.isFinite(world.lastTickAt) && world.nodes && Object.keys(world.nodes).length <= RESOURCE_WORLD_BALANCE.maxNodes && Array.isArray(world.listings) && world.listings.length <= RESOURCE_WORLD_BALANCE.maxListings && Array.isArray(world.loans) && world.loans.length <= RESOURCE_WORLD_BALANCE.maxLoans,
    'INVALID_RESOURCE_WORLD', 'Dữ liệu tài nguyên thế giới không hợp lệ.', 500);
  const seen = new Set();
  const all = Object.values(state.accounts).flatMap(account => {
    validateResourceState(account.life.resources, account.life.cultivation);
    requireThat(account.life.resources.treasureAccessUntilMs === undefined || integer(account.life.resources.treasureAccessUntilMs, 0, Number.MAX_SAFE_INTEGER), 'INVALID_RESOURCE_WORLD', 'Hạn dịch vụ Bảo Hoàng Thiên không hợp lệ.', 500);
    requireThat(account.life.resources.treasureBrokerHubId === undefined || OVERWORLD_HUBS.some(hub => hub.id === account.life.resources.treasureBrokerHubId), 'INVALID_RESOURCE_WORLD', 'Thương điếm Bảo Hoàng Thiên không hợp lệ.', 500);
    for (const gu of account.life.cultivation.guInstances) requireThat(!gu.alive || (gu.holderLifeId ?? gu.ownerLifeId) === account.life.id,
      'INVALID_GU_HOLDER', 'Cá thể Cổ nằm ngoài người đang giữ.', 500);
    return account.life.cultivation.guInstances;
  }).concat(state.remains.flatMap(remains => remains.guInstances ?? []));
  for (const remains of state.remains) for (const gu of remains.guInstances ?? []) requireThat((gu.holderLifeId ?? gu.ownerLifeId) === remains.id,
    'INVALID_GU_HOLDER', 'Cá thể Cổ nằm ngoài di vật đang giữ.', 500);
  for (const gu of all) { requireThat(!seen.has(gu.id), 'DUPLICATE_GU_INSTANCE', 'Một cá thể Cổ xuất hiện ở nhiều nơi.', 500); seen.add(gu.id); }
  const immortalTypes = new Set(state.immortals.filter(gu => gu.status !== 'destroyed').map(gu => gu.typeId));
  for (const gu of all.filter(gu => gu.alive && gu.rank >= 6)) {
    requireThat(!immortalTypes.has(gu.typeId), 'DUPLICATE_IMMORTAL_TYPE', 'Một loại Tiên Cổ đã có cá thể ở chuyển khác.', 500); immortalTypes.add(gu.typeId);
  }
  for (const [id, node] of Object.entries(world.nodes)) {
    const definition = nodeById.get(id);
    requireThat(definition && integer(node.generation, 1, Number.MAX_SAFE_INTEGER) && integer(node.stock, 0, definition.kind === 'wild' ? RESOURCE_WORLD_BALANCE.wildStock : RESOURCE_WORLD_BALANCE.harvestStock) && (node.readyAt === null || integer(node.readyAt, 0, Number.MAX_SAFE_INTEGER)) && Array.isArray(node.targets) && node.targets.length <= RESOURCE_WORLD_BALANCE.wildStock,
      'INVALID_RESOURCE_WORLD', 'Nguồn tài nguyên đã lưu không hợp lệ.', 500);
    for (const target of node.targets) requireThat(typeof target.id === 'string' && target.id.startsWith(`${id}:generation:${node.generation}:`) && integer(target.healthBps, 0, 10000) && integer(target.resistanceBps, 0, 10000) && integer(target.baitedUntil, 0, Number.MAX_SAFE_INTEGER) && typeof target.alive === 'boolean', 'INVALID_RESOURCE_WORLD', 'Mục tiêu Cổ hoang không hợp lệ.', 500);
    requireThat(definition.kind !== 'wild' || node.stock === node.targets.filter(target => target.alive).length, 'INVALID_RESOURCE_WORLD', 'Số lượng Cổ hoang không khớp.', 500);
  }
  const listingIds = new Set(), listedGu = new Set();
  for (const listing of world.listings) {
    const seller = Object.hasOwn(state.accounts, listing.sellerAccountId) ? state.accounts[listing.sellerAccountId] : null;
    requireThat(typeof listing.id === 'string' && !listingIds.has(listing.id) && seller && !seller.life.dead && seller.life.id === listing.sellerLifeId && OVERWORLD_HUBS.some(hub => hub.id === listing.hubId) && integer(listing.price, 1, 1000000) && listing.fee === Math.max(1, Math.ceil(listing.price * RESOURCE_WORLD_BALANCE.listingFeeBps / 10000)) && ['gu', 'resource'].includes(listing.kind) && ['local', 'treasure-heaven'].includes(listing.channel) && (listing.currency ?? 'primeval-stone') === (listing.channel === 'treasure-heaven' ? 'immortal-stone' : 'primeval-stone'), 'INVALID_RESOURCE_WORLD', 'Phiếu chợ không hợp lệ.', 500);
    listingIds.add(listing.id);
    if (listing.kind === 'gu') {
      const gu = seller.life.cultivation.guInstances.find(gu => gu.id === listing.instanceId && gu.alive);
      requireThat(gu && gu.lock?.kind === 'listed' && gu.lock.id === listing.id && !listedGu.has(gu.id) && listing.quantity === 1, 'INVALID_RESOURCE_WORLD', 'Ký gửi cá thể Cổ không khớp.', 500); listedGu.add(gu.id);
    } else requireThat(Object.hasOwn(RESOURCE_DEFINITIONS, listing.resourceId) && integer(listing.quantity, 1, 10000), 'INVALID_RESOURCE_WORLD', 'Ký gửi tài nguyên không hợp lệ.', 500);
  }
  const loanIds = new Set();
  for (const loan of world.loans) {
    const gu = all.find(gu => gu.id === loan.instanceId && gu.alive);
    requireThat(typeof loan.instanceId === 'string' && !loanIds.has(loan.instanceId) && gu && gu.controllerLifeId === loan.controllerLifeId && gu.holderLifeId === loan.holderLifeId && ['active', 'revoked'].includes(loan.status), 'INVALID_RESOURCE_WORLD', 'Hồ sơ cho mượn không khớp cá thể Cổ.', 500);
    if (loan.status === 'active') requireThat(gu.authorizedLifeIds.includes(loan.holderLifeId), 'INVALID_RESOURCE_WORLD', 'Quyền dùng Cổ đang mượn không khớp.', 500);
    loanIds.add(loan.instanceId);
  }
}

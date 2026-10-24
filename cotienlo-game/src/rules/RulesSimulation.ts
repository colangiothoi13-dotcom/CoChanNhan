import {
  DEMO_IDS, PROPOSED_TIME_RATIOS, RANK_ENERGY_LABELS, SIM_YEAR_TICKS,
  type DemoOptions, type GuInstance, type RuleAction, type RuleCommand, type RuleEvent,
  type RuleOutcome, type RuleResult, type RulesActor, type RulesSnapshot,
} from './types';
import { addEssence, ageAndRecover, aptitudeLabel, integer, naturalQuality, requireRule, RuleViolation, spendPrimeval, SUBREALMS, syncEssence } from './cultivation';
import { makeAperture, settleAperture } from './aperture';

const recipes = {
  [DEMO_IDS.recipe6]: { rank: 6 as const, cost: 10 },
  [DEMO_IDS.recipe7]: { rank: 7 as const, cost: 15 },
};
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
};

function actor(state: RulesSnapshot, id: string): RulesActor {
  requireRule(Object.hasOwn(state.actors, id), 'UNKNOWN_ACTOR', 'Không tìm thấy nhân vật mô phỏng.');
  const value = state.actors[id]!;
  requireRule(value.alive, 'LIFE_ENDED', 'Đời mô phỏng này đã kết thúc; hãy khởi tạo bài thử mới.');
  return value;
}
function instance(state: RulesSnapshot, id: string): GuInstance {
  requireRule(Object.hasOwn(state.gu, id) && state.gu[id]!.alive, 'GU_UNAVAILABLE', 'Cá thể Cổ không tồn tại hoặc đã bị hủy.');
  return state.gu[id]!;
}
function pay(subject: RulesActor, stones: number): void {
  requireRule(subject.stones >= stones, 'INSUFFICIENT_STONES', 'Chưa đủ nguyên thạch mô phỏng.', 'resources');
  subject.stones -= stones;
}
function ownedAccessible(subject: RulesActor, gu: GuInstance): void {
  requireRule(gu.ownerId === subject.id, 'NOT_OWNER', 'Bạn không có quyền sở hữu cá thể này.', 'permission');
  requireRule(gu.location.kind === 'actor' && gu.holderId === subject.id, 'GU_INACCESSIBLE', 'Cổ không ở nơi người thực hiện có thể dùng trực tiếp.', 'permission');
}
function destroy(state: RulesSnapshot, gu: GuInstance): void {
  if (!gu.alive) return;
  gu.alive = false; gu.holderId = null; gu.location = { kind: 'destroyed', id: gu.id };
  const owner = state.actors[gu.ownerId];
  if (gu.vitalApertureId && owner?.alive) owner.hp = Math.max(0, owner.hp - 20);
  for (const grant of state.grants) if (grant.instanceId === gu.id) grant.revoked = true;
}
function endLife(state: RulesSnapshot, subject: RulesActor, cause: string, events: RuleEvent[]): void {
  if (!subject.alive) return;
  subject.alive = false; subject.hp = 0;
  for (const grant of state.grants) if (grant.granteeId === subject.id) grant.revoked = true;
  for (const job of Object.values(state.jobs)) {
    if (job.actorId !== subject.id || job.status !== 'working') continue;
    job.status = 'failed'; job.failure = 'technical';
    for (const id of job.inputIds) destroy(state, state.gu[id]!);
    if (state.reservations[DEMO_IDS.immortalType] === job.id) delete state.reservations[DEMO_IDS.immortalType];
  }
  for (const gu of Object.values(state.gu)) if (gu.alive && gu.location.kind === 'actor' && gu.holderId === subject.id) {
    gu.holderId = null; gu.location = { kind: 'remains', id: subject.id };
  }
  events.push({ type: 'life-ended', message: `${subject.name}: ${cause} Quyền dùng bị thu hồi; đây chỉ là đời mô phỏng.` });
}

/** Validation is also applied before importing fixtures and before every commit. */
export function validateRulesSnapshot(state: RulesSnapshot): void {
  requireRule(state.metadata?.mode === 'isolated-rules-lab' && state.metadata.version === 1, 'INVALID_STATE', 'Dữ liệu không thuộc phòng thử quy luật.');
  integer(state.revision, 0, Number.MAX_SAFE_INTEGER, 'Phiên bản'); integer(state.outerTicks, 0, Number.MAX_SAFE_INTEGER, 'Thời gian ngoài');
  for (const [id, subject] of Object.entries(state.actors)) {
    requireRule(id === subject.id, 'INVALID_STATE', 'Mã nhân vật không khớp.');
    integer(subject.rank, 1, 9, 'Chuyển'); aptitudeLabel(subject.aptitudeBps);
    integer(subject.ageTicks, 0, subject.lifespanTicks, 'Tuổi'); integer(subject.lifespanTicks, 1, Number.MAX_SAFE_INTEGER, 'Thọ nguyên');
    integer(subject.hp, 0, 100, 'Sinh lực'); integer(subject.stones, 0, Number.MAX_SAFE_INTEGER, 'Nguyên thạch');
    requireRule(subject.alive === (subject.hp > 0), 'INVALID_STATE', 'Trạng thái sống và sinh lực không khớp.');
    requireRule(subject.location === 'outer' || Object.hasOwn(state.apertures, subject.location), 'INVALID_STATE', 'Vị trí thân thể không hợp lệ.');
    if (subject.rank <= 5) {
      requireRule(subject.subrealm !== null && SUBREALMS.includes(subject.subrealm) && subject.mortal, 'INVALID_STATE', 'Phàm nhân cần tiểu cảnh giới và không khiếu riêng.');
      const ap = subject.mortal;
      requireRule(ap.capacityBps === subject.aptitudeBps, 'INVALID_STATE', 'Tư chất và dung lượng không khớp.');
      integer(ap.amountBps, 0, ap.capacityBps, 'Chân nguyên'); integer(ap.wallProgress, 0, 100, 'Tiến độ thành khiếu');
      requireRule(new Set(ap.essence.map(b => b.quality)).size === ap.essence.length, 'INVALID_STATE', 'Phần chân nguyên trùng phẩm chất.');
      for (const bucket of ap.essence) { integer(bucket.quality, 1, 20, 'Phẩm chất'); integer(bucket.amountBps, 1, 10000, 'Lượng chân nguyên'); }
      requireRule(ap.essence.reduce((n, b) => n + b.amountBps, 0) === ap.amountBps, 'INVALID_STATE', 'Tổng chân nguyên không khớp.');
      requireRule((ap.tenExtreme !== null) === (ap.capacityBps === 10000), 'INVALID_STATE', 'Thập Tuyệt thể không khớp dung lượng.');
      if (ap.tenExtreme) integer(ap.tenExtreme.pressure, 0, 10000, 'Áp lực');
    } else {
      requireRule(subject.subrealm === null && subject.mortal === null && subject.immortalEssence?.ownerId === id,
        'INVALID_STATE', 'Cổ Tiên không dùng tiểu cảnh giới phàm nhân và cần kho tiên nguyên riêng.');
    }
    if (subject.immortalEssence) integer(subject.immortalEssence.units, 0, Number.MAX_SAFE_INTEGER, 'Tiên nguyên');
  }
  const liveImmortals = new Set<string>();
  const vitalApertures = new Set<string>();
  for (const [id, gu] of Object.entries(state.gu)) {
    requireRule(gu.id === id && Object.hasOwn(state.actors, gu.ownerId) && Object.hasOwn(state.actors, gu.controllerId), 'INVALID_STATE', 'Chủ hoặc người luyện hóa Cổ không hợp lệ.');
    integer(gu.rank, 1, 9, 'Chuyển Cổ');
    if (gu.immortal && gu.alive) {
      requireRule(gu.rank >= 6 && !liveImmortals.has(gu.typeId), 'INVALID_STATE', 'Có nhiều cá thể Tiên Cổ cùng loại đang tồn tại.');
      liveImmortals.add(gu.typeId);
    }
    if (gu.alive && gu.vitalApertureId) {
      const owner = state.actors[gu.ownerId]!;
      requireRule(!vitalApertures.has(gu.vitalApertureId) && (owner.mortal?.id === gu.vitalApertureId || state.apertures[gu.vitalApertureId]?.ownerId === owner.id), 'INVALID_STATE', 'Một khiếu chỉ có một bổn mạng sống và phải khớp chủ.');
      vitalApertures.add(gu.vitalApertureId);
    }
    requireRule(gu.alive ? gu.location.kind !== 'destroyed' : gu.location.kind === 'destroyed' && gu.holderId === null, 'INVALID_STATE', 'Vị trí Cổ sống/hủy không khớp.');
    if (gu.alive && gu.location.kind === 'actor') requireRule(gu.holderId === gu.location.id && Object.hasOwn(state.actors, gu.location.id), 'INVALID_STATE', 'Người cầm Cổ không khớp vị trí.');
    if (gu.alive && gu.location.kind === 'aperture') requireRule(Object.hasOwn(state.apertures, gu.location.id) && gu.holderId === null, 'INVALID_STATE', 'Vị trí Cổ trong khiếu không hợp lệ.');
  }
  for (const [typeId, jobId] of Object.entries(state.reservations)) {
    requireRule(typeId === DEMO_IDS.immortalType && !liveImmortals.has(typeId) && state.jobs[jobId]?.status === 'working', 'INVALID_STATE', 'Giữ chỗ Tiên Cổ không hợp lệ.');
  }
  for (const job of Object.values(state.jobs)) if (job.status === 'working') {
    requireRule(state.reservations[DEMO_IDS.immortalType] === job.id && new Set(job.inputIds).size === job.inputIds.length, 'INVALID_STATE', 'Mẻ luyện thiếu chỗ giữ hoặc trùng đầu vào.');
    for (const id of job.inputIds) requireRule(state.gu[id]?.alive && state.gu[id]!.location.kind === 'refinement' && state.gu[id]!.location.id === job.id, 'INVALID_STATE', 'Cổ đầu vào chưa được khóa đúng mẻ.');
  }
  for (const aperture of Object.values(state.apertures)) {
    requireRule(Object.hasOwn(state.actors, aperture.ownerId), 'INVALID_STATE', 'Tiên khiếu thiếu chủ.');
    integer(aperture.innerTicks, 0, Number.MAX_SAFE_INTEGER, 'Thời gian nội khiếu'); integer(aperture.lastOuterTicks, 0, state.outerTicks, 'Mốc thời gian ngoài');
    requireRule([6, 7, 8, 9].includes(aperture.rank) && (PROPOSED_TIME_RATIOS as readonly number[]).includes(aperture.ratio), 'INVALID_STATE', 'Chuyển hoặc tỷ lệ khiếu không hợp lệ.');
    const eco = aperture.ecology;
    for (const value of [eco.water, eco.food, eco.plants, eco.plantCapacity, eco.growthPerYear, eco.foodDemandPerYear, eco.shortageYears]) integer(value, 0, Number.MAX_SAFE_INTEGER, 'Tài nguyên sinh thái');
    integer(eco.habitatBps, 0, 10000, 'Sinh cảnh'); requireRule(eco.plants <= eco.plantCapacity, 'INVALID_STATE', 'Vượt sức chứa sinh thái.');
  }
  requireRule(new Set(state.tribulations.map(t => t.id)).size === state.tribulations.length, 'INVALID_STATE', 'Tai kiếp bị ghi lặp.');
}

/** Synchronous, single-owner simulation: clone -> validate -> publish. No network or saves. */
export class RulesSimulation {
  private state: RulesSnapshot;
  private operations = new Map<string, { payload: string; outcome: RuleOutcome; events: RuleEvent[] }>();
  private roll: () => number;

  constructor(initial: RulesSnapshot, options: DemoOptions = {}) {
    validateRulesSnapshot(initial);
    this.state = structuredClone(initial);
    this.roll = options.naturalRollBps ?? (() => Math.floor(Math.random() * 10000));
  }
  snapshot(): RulesSnapshot { return structuredClone(this.state); }

  execute(command: RuleCommand): RuleResult {
    const events: RuleEvent[] = [];
    try {
      requireRule(command && typeof command.operationId === 'string' && /^[\w-]{1,100}$/.test(command.operationId), 'INVALID_OPERATION', 'Mã thao tác mô phỏng không hợp lệ.');
      requireRule(command.action && typeof command.action === 'object', 'INVALID_ACTION', 'Thiếu hành động mô phỏng.');
      const payload = canonical(command.action);
      const previous = this.operations.get(command.operationId);
      if (previous) {
        requireRule(previous.payload === payload, 'OPERATION_CONFLICT', 'Mã thao tác đã được dùng cho hành động khác.');
        return { snapshot: this.snapshot(), outcome: structuredClone(previous.outcome), events: structuredClone(previous.events) };
      }
      requireRule(command.expectedRevision === undefined || command.expectedRevision === this.state.revision, 'STALE_REVISION', 'Dữ liệu mô phỏng đã thay đổi; hãy dùng trạng thái mới.');
      const next = this.snapshot();
      const outcome = this.apply(next, command.action, events);
      next.revision++;
      validateRulesSnapshot(next);
      this.state = next;
      this.operations.set(command.operationId, { payload, outcome: structuredClone(outcome), events: structuredClone(events) });
      return { snapshot: this.snapshot(), outcome, events };
    } catch (error) {
      if (!(error instanceof RuleViolation)) throw error;
      return { snapshot: this.snapshot(), outcome: { ok: false, code: error.code, message: error.message, category: error.category }, events: [] };
    }
  }

  private apply(state: RulesSnapshot, action: RuleAction, events: RuleEvent[]): RuleOutcome {
    const ok = (message: string, extra: Partial<RuleOutcome> = {}): RuleOutcome => ({ ok: true, code: 'OK', message, ...extra });
    switch (action.type) {
      case 'spend-primeval': {
        spendPrimeval(actor(state, action.actorId), action.costBps, action.requiredQuality);
        return ok('Đã dùng chân nguyên theo dung lượng toàn không khiếu.');
      }
      case 'refine-quality': {
        const subject = actor(state, action.actorId); const ap = subject.mortal;
        requireRule(ap && ap.wall !== 'shattered', 'APERTURE_UNAVAILABLE', 'Không khiếu chưa thể tinh luyện chân nguyên.');
        const wine = Object.values(state.gu).find(g => g.alive && g.typeId === 'lab-wine' && g.ownerId === subject.id && g.controllerId === subject.id && g.location.kind === 'actor' && g.holderId === subject.id);
        requireRule(wine, 'WINE_GU_REQUIRED', 'Cần Tửu Trùng đã luyện hóa, thuộc sở hữu và đang mang theo.', 'permission');
        integer(action.inputBps, 2, 10000, 'Chân nguyên đầu vào');
        requireRule(action.inputBps % 2 === 0, 'INVALID_NUMBER', 'Bài thử dùng hai đơn vị đầu vào để tạo một đơn vị tinh luyện.');
        const quality = naturalQuality(subject); requireRule(quality < 20, 'QUALITY_LIMIT', 'Bài thử không nâng phẩm chất qua ngũ chuyển đỉnh phong.');
        const bucket = ap.essence.find(b => b.quality === quality);
        requireRule(bucket && bucket.amountBps >= action.inputBps, 'INSUFFICIENT_ESSENCE', 'Chưa đủ chân nguyên phẩm chất tự nhiên để tinh luyện.', 'resources');
        pay(subject, 2); bucket.amountBps -= action.inputBps; syncEssence(ap); addEssence(ap, quality + 1, action.inputBps / 2);
        return ok('Phẩm chất tăng một tiểu cảnh giới; tu vi và dung lượng không đổi. Hiệu suất 2:1 là đề xuất.');
      }
      case 'cultivate': {
        const subject = actor(state, action.actorId); const ap = subject.mortal;
        requireRule(ap && ap.wall === 'stable' && !subject.ascension, 'WALL_UNSTABLE', 'Cần thành khiếu ổn định để tu luyện.');
        requireRule(ap.wallProgress < 100, 'WALL_READY', 'Thành khiếu đã đủ tiến độ; có thể thử đột phá.');
        spendPrimeval(subject, 500); pay(subject, 2); ap.wallProgress = Math.min(100, ap.wallProgress + 25);
        return ok('Đã luyện thành khiếu: 500 đơn vị chân nguyên, 2 thạch, +25 tiến độ [ĐX].');
      }
      case 'breakthrough': {
        const subject = actor(state, action.actorId); const ap = subject.mortal;
        requireRule(ap && ap.wall === 'stable' && ap.wallProgress === 100 && subject.subrealm !== null, 'BREAKTHROUGH_NOT_READY', 'Cần thành khiếu ổn định với đủ 100 tiến độ.');
        requireRule(!(subject.rank === 5 && subject.subrealm === 'peak'), 'ASCENSION_REQUIRED', 'Ngũ chuyển đỉnh phong cần nghi thức thăng tiên, không tăng chuyển tự động.');
        pay(subject, 10);
        const index = SUBREALMS.indexOf(subject.subrealm);
        if (index < 3) subject.subrealm = SUBREALMS[index + 1]!;
        else { subject.rank = (subject.rank + 1) as RulesActor['rank']; subject.subrealm = 'initial'; }
        ap.wallProgress = 0;
        return ok('Đột phá thành công trong bài thử; không tự tăng dung lượng, tuổi thọ hoặc cấp đầy chân nguyên.');
      }
      case 'suppress-extreme': {
        const subject = actor(state, action.actorId); const extreme = subject.mortal?.tenExtreme;
        requireRule(extreme && !subject.ascension, 'NOT_EXTREME', 'Nhân vật này không ở trạng thái Thập Tuyệt có thể áp chế.');
        pay(subject, 10); extreme.pressure = Math.max(0, extreme.pressure - 2000); extreme.suppressedUntilAge = subject.ageTicks + 3 * SIM_YEAR_TICKS;
        subject.mortal!.wall = extreme.pressure >= 7000 ? 'strained' : 'stable';
        return ok('Đã tốn 10 thạch, giảm 2.000 áp lực và áp chế ba năm trải nghiệm [ĐX].');
      }
      case 'grant-use': {
        const owner = actor(state, action.actorId); const gu = instance(state, action.instanceId); const grantee = actor(state, action.granteeId);
        ownedAccessible(owner, gu);
        requireRule(gu.controllerId === owner.id, 'CONTROL_REQUIRED', 'Chủ chưa luyện hóa Cổ, chưa thể cấp quyền điều khiển.', 'permission');
        requireRule(owner.id !== action.granteeId, 'SELF_GRANT', 'Chủ nhân không cần tự cấp quyền.');
        requireRule(!action.handOver || owner.location === grantee.location, 'GU_INACCESSIBLE', 'Hai người cần ở cùng không gian để giao Cổ.', 'permission');
        const grant = state.grants.find(g => g.instanceId === gu.id && g.granteeId === action.granteeId);
        if (grant) grant.revoked = false;
        else state.grants.push({ instanceId: gu.id, ownerId: owner.id, granteeId: action.granteeId, revoked: false });
        if (action.handOver) { gu.holderId = action.granteeId; gu.location = { kind: 'actor', id: action.granteeId }; }
        return ok('Đã cấp quyền dùng; chủ sở hữu không đổi. Giao Cổ không tự chuyển quyền sở hữu.');
      }
      case 'revoke-use': {
        const owner = actor(state, action.actorId); const gu = instance(state, action.instanceId);
        requireRule(gu.ownerId === owner.id, 'NOT_OWNER', 'Chỉ chủ sở hữu được thu hồi quyền.', 'permission');
        const grant = state.grants.find(g => g.instanceId === gu.id && g.granteeId === action.granteeId && !g.revoked);
        requireRule(grant, 'GRANT_UNAVAILABLE', 'Không có quyền đang cấp cho người này.'); grant.revoked = true;
        return ok('Đã thu hồi quyền ngay; Cổ vẫn ở vị trí đang được giữ.');
      }
      case 'use-gu': {
        const subject = actor(state, action.actorId); const gu = instance(state, action.instanceId);
        const grant = state.grants.find(g => g.instanceId === gu.id && g.granteeId === subject.id && g.ownerId === gu.controllerId && !g.revoked);
        requireRule(gu.ownerId === subject.id || grant, 'USE_REVOKED', 'Không có quyền dùng hoặc quyền đã bị thu hồi.', 'permission');
        requireRule(gu.controllerId === subject.id || grant, 'CONTROL_REQUIRED', 'Sở hữu hoặc nhặt được Cổ chưa đồng nghĩa đã luyện hóa và điều khiển được.', 'permission');
        requireRule(gu.location.kind === 'actor' && gu.holderId === subject.id, 'GU_INACCESSIBLE', 'Cổ không ở nơi có thể kích hoạt trực tiếp.', 'permission');
        if (gu.immortal) {
          requireRule(subject.immortalEssence?.ownerId === subject.id && subject.immortalEssence.units >= 1 && subject.immortalEssence.kind === RANK_ENERGY_LABELS[gu.rank], 'IMMORTAL_ENERGY_REQUIRED', 'Cần một đơn vị tiên nguyên cá nhân đúng loại của Cổ.', 'resources');
          subject.immortalEssence.units--;
        } else spendPrimeval(subject, gu.controllerId === subject.id ? 1000 : 1250);
        return ok(gu.controllerId === subject.id ? 'Đã kích hoạt Cổ bằng năng lượng phù hợp.' : 'Đã dùng Cổ mượn; gánh điều khiển tăng 25% trong bài thử [ĐX].');
      }
      case 'destroy-gu': {
        const subject = actor(state, action.actorId); const gu = instance(state, action.instanceId); ownedAccessible(subject, gu);
        destroy(state, gu); if (subject.hp === 0) endLife(state, subject, 'Phản phệ bổn mạng.', events);
        return ok('Cá thể đã bị hủy; hủy bổn mạng có phản phệ. Chỉ việc hủy hợp lệ mới giải phóng loại Tiên Cổ.');
      }
      case 'start-refinement': {
        const subject = actor(state, action.actorId);
        requireRule(!subject.ascension, 'ACTOR_BUSY', 'Đang thăng tiên, chưa thể mở mẻ luyện khác.');
        requireRule(Object.hasOwn(recipes, action.recipeId), 'UNKNOWN_RECIPE', 'Phối phương này chưa có trong phòng thử.');
        const recipe = recipes[action.recipeId as keyof typeof recipes];
        requireRule(Array.isArray(action.inputIds) && action.inputIds.length === 2 && new Set(action.inputIds).size === 2, 'INVALID_INPUTS', 'Cần hai cá thể đầu vào khác nhau.');
        const inputs = action.inputIds.map(id => instance(state, id)); inputs.forEach(g => ownedAccessible(subject, g));
        requireRule(inputs.map(g => g.typeId).sort().join(',') === 'lab-boar,lab-moon', 'INVALID_INPUTS', 'Phối phương cần một Nguyệt Cổ và một Trư Cổ mô phỏng.');
        requireRule(!state.reservations[DEMO_IDS.immortalType] && !Object.values(state.gu).some(g => g.alive && g.immortal && g.typeId === DEMO_IDS.immortalType), 'UNIQUE_CONFLICT', 'Loại Tiên Cổ này đã tồn tại hoặc được giữ chỗ ở một chuyển khác.', 'unique');
        pay(subject, recipe.cost);
        const id = `job-${state.revision + 1}`;
        state.jobs[id] = { id, actorId: subject.id, recipeId: action.recipeId, inputIds: [...action.inputIds], outputRank: recipe.rank, status: 'working', failure: null };
        state.reservations[DEMO_IDS.immortalType] = id;
        for (const gu of inputs) { gu.holderId = null; gu.location = { kind: 'refinement', id }; }
        return ok('Đã khóa đầu vào, trừ phí cam kết và giữ chỗ loại Tiên Cổ xuyên chuyển [ĐX].', { jobId: id });
      }
      case 'finish-refinement': {
        requireRule(Object.hasOwn(state.jobs, action.jobId) && state.jobs[action.jobId]!.status === 'working', 'JOB_UNAVAILABLE', 'Mẻ luyện không còn đang thực hiện.');
        integer(action.techniqueScore, 0, 100, 'Điểm thao tác');
        const job = state.jobs[action.jobId]!; const subject = actor(state, job.actorId);
        requireRule(state.reservations[DEMO_IDS.immortalType] === job.id, 'UNIQUE_CONFLICT', 'Mẻ luyện không còn giữ chỗ hợp lệ.', 'unique');
        let failure: 'technical' | 'natural' | null = action.techniqueScore < 60 ? 'technical' : null;
        if (!failure) { const roll = this.roll(); integer(roll, 0, 9999, 'Lần rút kết quả tự nhiên'); if (roll >= 8000) failure = 'natural'; }
        for (const id of job.inputIds) {
          const gu = state.gu[id]!;
          if (failure === 'natural' && gu.vitalApertureId === subject.mortal?.id) {
            gu.holderId = subject.id; gu.location = { kind: 'actor', id: subject.id };
          } else {
            // Successful transformation consumes the vital input without destruction backlash.
            const vital = gu.vitalApertureId; if (!failure) gu.vitalApertureId = null;
            destroy(state, gu); if (!failure) gu.vitalApertureId = vital;
          }
        }
        delete state.reservations[DEMO_IDS.immortalType];
        job.status = failure ? 'failed' : 'succeeded'; job.failure = failure;
        if (subject.hp === 0) endLife(state, subject, 'Phản phệ khi luyện Cổ.', events);
        if (failure) return { ok: false, code: failure === 'natural' ? 'NATURAL_FAILURE' : 'TECHNICAL_FAILURE', category: failure,
          message: failure === 'natural' ? 'Mẻ luyện thất bại tự nhiên; chỉ bổn mạng được phối phương bảo toàn, phí đã chi không hoàn lại [ĐX].' : 'Sai thao tác: bảo toàn dành cho rủi ro tự nhiên không áp dụng; bổn mạng bị hủy gây phản phệ [ĐX].', jobId: job.id };
        const id = `${job.id}-output`;
        state.gu[id] = { id, typeId: DEMO_IDS.immortalType, name: 'Kính Cổ phòng thử [ĐX]', rank: job.outputRank, immortal: true, alive: true,
          ownerId: subject.id, holderId: subject.id, controllerId: subject.id, location: { kind: 'actor', id: subject.id }, vitalApertureId: null };
        return ok('Đã tạo đúng một cá thể; phối phương và tỷ lệ 80% chỉ là dữ liệu thử [ĐX].', { jobId: job.id, instanceId: id });
      }
      case 'ascend': {
        const subject = actor(state, action.actorId);
        requireRule(subject.rank === 5 && subject.subrealm === 'peak' && subject.mortal, 'ASCENSION_NOT_READY', 'Nghi thức cần ngũ chuyển đỉnh phong và không khiếu phàm nhân.');
        if (action.step === 'shatter') {
          requireRule(!subject.ascension && subject.mortal.wall === 'stable', 'ASCENSION_STAGE', 'Chỉ toái khiếu một lần từ thành khiếu ổn định.');
          requireRule(!Object.values(state.jobs).some(j => j.actorId === subject.id && j.status === 'working'), 'ACTOR_BUSY', 'Cần kết thúc mẻ luyện trước khi thăng tiên.');
          pay(subject, 30); subject.mortal.wall = 'shattered'; subject.mortal.essence = []; syncEssence(subject.mortal);
          subject.ascension = { stage: 'shattered', humanQi: 100, heavenQi: 0, earthQi: 0 };
          return ok('Đã toái khiếu, chi 30 thạch; đây là mốc cam kết của bài thử [ĐX].');
        }
        const ascension = subject.ascension;
        requireRule(ascension, 'ASCENSION_STAGE', 'Phải toái khiếu trước khi nạp khí hoặc phóng Cổ.');
        if (action.step === 'absorb') {
          requireRule(ascension.stage === 'shattered', 'ASCENSION_STAGE', 'Bước nạp khí đã được thực hiện.');
          integer(action.heavenQi ?? NaN, 1, 1000, 'Thiên khí'); integer(action.earthQi ?? NaN, 1, 1000, 'Địa khí');
          const heaven = action.heavenQi!; const earth = action.earthQi!;
          ascension.heavenQi = heaven; ascension.earthQi = earth;
          if (heaven + earth > ascension.humanQi || Math.abs(heaven - earth) > 10) {
            endLife(state, subject, 'Tam khí mất cân bằng, thiên địa đồng hóa.', events);
            return { ok: false, code: 'QI_OVERLOAD', category: 'technical', message: 'Mất cân bằng hoặc vượt nhân khí: thân thể mô phỏng đã chết [ĐX].' };
          }
          ascension.stage = 'balanced'; return ok('Tam khí đã cân bằng theo sức chứa nhân khí mô phỏng.');
        }
        requireRule(action.step === 'release' && ascension.stage === 'balanced', 'ASCENSION_STAGE', 'Phải hoàn tất nạp khí cân bằng trước khi phóng Cổ.');
        const gu = instance(state, action.instanceId ?? ''); ownedAccessible(subject, gu);
        requireRule(!gu.immortal, 'ASCENSION_GU', 'Bài thử phóng một Cổ phàm sẵn có, không tự cấp Tiên Cổ.');
        const grade = subject.aptitudeBps === 10000 ? 'special' : ascension.heavenQi + ascension.earthQi >= 90 ? 'upper' : 'middle';
        const ratio = grade === 'special' ? 30 : grade === 'upper' ? 20 : 10;
        const id = `aperture-${subject.id}`;
        state.apertures[id] = makeAperture(id, subject.id, state.outerTicks, ratio, grade); state.apertures[id]!.placed = false;
        const wasVital = gu.vitalApertureId === subject.mortal.id;
        subject.rank = 6; subject.subrealm = null; subject.mortal = null; subject.ascension = null;
        subject.immortalEssence = { ownerId: subject.id, kind: RANK_ENERGY_LABELS[6], units: 0 };
        gu.holderId = null; gu.location = { kind: 'aperture', id }; if (wasVital) gu.vitalApertureId = id;
        return ok('Đã hình thành phúc địa. Cổ phóng vẫn là Cổ phàm; thọ nguyên không tăng, tiên nguyên bắt đầu từ 0.', { apertureId: id });
      }
      case 'advance-time': {
        integer(action.outerTicks, 1, Number.MAX_SAFE_INTEGER, 'Mốc thời gian ngoài');
        const deltaOuterTicks = action.outerTicks - state.outerTicks;
        integer(deltaOuterTicks, 1, 100 * SIM_YEAR_TICKS, 'Khoảng thời gian ngoài');
        state.outerTicks = action.outerTicks;
        const deltas = new Map<string, number>();
        for (const aperture of Object.values(state.apertures)) deltas.set(aperture.id, settleAperture(state, aperture, deltaOuterTicks, events));
        for (const subject of Object.values(state.actors)) {
          const delta = subject.location === 'outer' ? deltaOuterTicks : deltas.get(subject.location)!;
          const cause = ageAndRecover(subject, delta); if (cause) endLife(state, subject, cause, events);
        }
        return ok('Đã tăng thời gian mô phỏng: nội khiếu, tuổi theo vị trí, sinh thái và tai kiếp được quyết toán.');
      }
      case 'change-ratio': {
        requireRule(Object.hasOwn(state.apertures, action.apertureId), 'UNKNOWN_APERTURE', 'Không tìm thấy tiên khiếu.');
        requireRule((PROPOSED_TIME_RATIOS as readonly number[]).includes(action.ratio), 'INVALID_RATIO', 'Chỉ thử các tỷ lệ đề xuất ×1, ×10, ×20, ×30.');
        const ap = state.apertures[action.apertureId]!; const owner = actor(state, ap.ownerId);
        requireRule(ap.ratio !== action.ratio, 'RATIO_UNCHANGED', 'Tỷ lệ này đang được sử dụng.');
        pay(owner, 5); ap.ratio = action.ratio;
        return ok('Đã chi 5 thạch đổi tỷ lệ từ mốc hiện tại; không đổi lịch sử hoặc xóa mốc kiếp [ĐX].');
      }
      case 'set-aperture-placed': {
        const ap = state.apertures[action.apertureId]; requireRule(ap, 'UNKNOWN_APERTURE', 'Không tìm thấy tiên khiếu.'); actor(state, ap.ownerId);
        requireRule(typeof action.placed === 'boolean', 'INVALID_PLACEMENT', 'Cần trạng thái đặt khiếu hợp lệ.');
        requireRule(action.placed || !Object.values(state.actors).some(a => a.alive && a.location === ap.id), 'APERTURE_OCCUPIED', 'Có người trong khiếu; không thể thu khiếu theo luật bài thử.');
        ap.placed = action.placed; return ok(action.placed ? 'Đã đặt khiếu; cổng có thể dùng.' : 'Đã thu khiếu; không thể tự đi vào khi cổng chưa được đặt.');
      }
      case 'enter-aperture': {
        const subject = actor(state, action.actorId); const ap = state.apertures[action.apertureId];
        requireRule(ap?.placed && subject.location === 'outer', 'GATE_UNAVAILABLE', 'Cần ở ngoài và có cổng tiên khiếu đang được đặt.');
        subject.location = ap.id; return ok('Đã vào tiên khiếu; tuổi thân thể từ nay theo thời gian tại đây.');
      }
      case 'leave-aperture': {
        const subject = actor(state, action.actorId); requireRule(subject.location !== 'outer' && state.apertures[subject.location]?.placed, 'GATE_UNAVAILABLE', 'Không ở trong tiên khiếu có cổng mở.');
        subject.location = 'outer'; return ok('Đã ra ngoài; tuổi tiếp tục theo thời gian ngoài.');
      }
      case 'supply-ecology': {
        const subject = actor(state, action.actorId); const ap = state.apertures[action.apertureId];
        requireRule(ap && ap.ownerId === subject.id, 'NOT_OWNER', 'Chỉ chủ khiếu được cấp vật tư trong bài thử.', 'permission');
        integer(action.water, 1, 1000, 'Lượng nước'); pay(subject, action.water); ap.ecology.water += action.water;
        return ok('Đã đổi thạch thành nước theo tỷ lệ thử 1:1 [ĐX]; thiếu môi trường vẫn không tăng trưởng miễn phí.');
      }
      case 'resolve-tribulation': {
        const subject = actor(state, action.actorId); const due = state.tribulations.find(t => t.id === action.tribulationId);
        requireRule(due?.status === 'pending', 'TRIBULATION_UNAVAILABLE', 'Tai kiếp không có hoặc đã được xử lý.');
        const ap = state.apertures[due.apertureId]!;
        requireRule(ap.ownerId === subject.id, 'NOT_OWNER', 'Chủ khiếu mới quyết định phòng vệ trong bài thử.', 'permission');
        if (action.defend) { pay(subject, 5); due.status = 'passed'; ap.daoMarks += due.kind === 'earth' ? 10 : due.kind === 'heaven' ? 30 : 50; }
        else { due.status = 'failed'; ap.ecology.habitatBps = Math.max(0, ap.ecology.habitatBps - due.habitatDamageBps); }
        events.push({ type: 'tribulation-resolved', message: action.defend ? 'Đã vượt kiếp trong mô phỏng tài nguyên; không phải giao chiến mạng.' : 'Phòng vệ thất bại, sinh cảnh chịu thêm tổn thất mô phỏng.' });
        return ok(action.defend ? 'Chi 5 thạch phòng vệ; đạo ngân chỉ nhận một lần [ĐX].' : 'Đã ghi thất bại; không có đạo ngân thưởng.');
      }
      default: throw new RuleViolation('UNKNOWN_ACTION', 'Hành động chưa được hỗ trợ trong phòng thử.');
    }
  }
}

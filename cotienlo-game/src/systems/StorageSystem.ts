import { Cultivator } from '../entities/Cultivator';
import { GuSystem } from './GuSystem';
import { InventorySystem, ITEM_DEFINITIONS } from './InventorySystem';
import type { QuestProgress } from './QuestSystem';
import { Remains, type SavedRemains } from '../entities/Remains';
import { isPastLifeRecord, parsePastLifeRecord, type PastLifeRecord } from './SoulChronicle';

export const SAVE_KEY = 'cotienlo_save_v1';

const REALMS: readonly Cultivator['realm'][] = [
  'Nhất Chuyển Sơ Giai', 'Nhất Chuyển Trung Giai', 'Nhất Chuyển Cao Giai',
  'Nhất Chuyển Đỉnh Phong', 'Nhị Chuyển Sơ Giai',
];

export type LocalOrigin = 'clan' | 'hunter' | 'scholar';
export interface SavedLocalLife {
  lifeNumber: number;
  origin: LocalOrigin;
  death: PastLifeRecord | null;
  timeSurvivedSeconds: number;
  monstersSlain: number;
  remains: SavedRemains[];
}
export type SavedQuestProgress = QuestProgress & { localLife?: SavedLocalLife };

/** Complete current-version save required for cross-device transfer. */
export interface LocalSaveSnapshot extends Required<QuestProgress> {
  version: 4;
  realm: Cultivator['realm'];
  hp: number;
  mp: number;
  stamina: number;
  x: number;
  y: number;
  stones: number;
  ownedGuIds: string[];
  items: { id: string; count: number }[];
  guHunger: Record<string, number>;
  localLife: SavedLocalLife;
  savedAt: number;
}

function readLocalLife(value: unknown): SavedLocalLife | undefined {
  if (!isRecord(value) || !isCount(value.lifeNumber) || value.lifeNumber < 1 ||
    !['clan', 'hunter', 'scholar'].includes(value.origin as string) ||
    (value.death !== null && (!isPastLifeRecord(value.death) || value.death.lifeNumber !== value.lifeNumber)) ||
    !Number.isFinite(value.timeSurvivedSeconds) || (value.timeSurvivedSeconds as number) < 0 ||
    !isCount(value.monstersSlain) || !Array.isArray(value.remains)) return undefined;
  return {
    lifeNumber: value.lifeNumber, origin: value.origin as LocalOrigin, death: value.death as PastLifeRecord | null,
    timeSurvivedSeconds: value.timeSurvivedSeconds as number, monstersSlain: value.monstersSlain,
    remains: value.remains.flatMap(raw => { const remains = Remains.restore(raw); return remains ? [remains.snapshot()] : []; }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function boundedResource(value: unknown, maximum: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(maximum, value)) : fallback;
}

/** Cloud saves are intentionally stricter than historical device saves. */
export function parseLocalSaveSnapshot(value: unknown): LocalSaveSnapshot {
  const invalid = (): never => { throw new Error('Bản lưu luyện tập thiếu dữ liệu hoặc không hợp lệ.'); };
  if (!isRecord(value) || value.version !== 4 || !REALMS.includes(value.realm as Cultivator['realm']) ||
    !isCount(value.stones) || !isCount(value.savedAt) || !Array.isArray(value.ownedGuIds) ||
    !Array.isArray(value.items) || !isRecord(value.guHunger)) return invalid();
  const counts = ['questCount', 'chapter', 'wolfKills', 'bearKills', 'herbsCollected'] as const;
  const fields = ['version', 'realm', 'hp', 'mp', 'stamina', 'x', 'y', 'stones', 'ownedGuIds', 'items', 'guHunger',
    ...counts, 'hasRefinedGu', 'questRewardClaimed', 'chapterRewardClaimed', 'localLife', 'savedAt'];
  if (Object.keys(value).some(key => !fields.includes(key))) return invalid();
  if (counts.some(key => !isCount(value[key])) || (value.chapter as number) < 1 ||
    ['hasRefinedGu', 'questRewardClaimed', 'chapterRewardClaimed'].some(key => typeof value[key] !== 'boolean')) return invalid();

  const localLife = readLocalLife(value.localLife);
  if (!localLife || !isRecord(value.localLife) || !Array.isArray(value.localLife.remains) ||
    localLife.remains.length !== value.localLife.remains.length ||
    Object.keys(value.localLife).some(key => !['lifeNumber', 'origin', 'death', 'timeSurvivedSeconds', 'monstersSlain', 'remains'].includes(key)) ||
    value.localLife.remains.some(remains => !isRecord(remains) || Object.keys(remains).some(key =>
      !['x', 'y', 'lifeNumber', 'primevalStones', 'durability'].includes(key)))) return invalid();
  if (localLife.death) localLife.death = parsePastLifeRecord(value.localLife.death);
  const baseline = new Cultivator();
  baseline.advanceRealm(value.realm as Cultivator['realm']);
  StorageSystem.applyOrigin(baseline, localLife.origin);
  const bounded = (resource: unknown, max: number): boolean => typeof resource === 'number' && Number.isFinite(resource) && resource >= 0 && resource <= max;
  if (!bounded(value.hp, baseline.maxHp) || !bounded(value.mp, baseline.maxMp) || !bounded(value.stamina, baseline.maxStamina) ||
    !bounded(value.x, 2338) || (value.x as number) < 62 || !bounded(value.y, 2338) || (value.y as number) < 62 ||
    (localLife.death !== null && value.hp !== 0)) return invalid();

  const guIds = new GuSystem().getAllGu().map(gu => gu.id);
  if (value.ownedGuIds.some(id => typeof id !== 'string' || !guIds.includes(id)) ||
    new Set(value.ownedGuIds).size !== value.ownedGuIds.length ||
    Object.keys(value.guHunger).length !== guIds.length || guIds.some(id => !bounded((value.guHunger as Record<string, unknown>)[id], 100))) return invalid();
  const itemIds = new Set<string>();
  for (const item of value.items) {
    if (!isRecord(item) || Object.keys(item).some(key => !['id', 'count'].includes(key)) ||
      typeof item.id !== 'string' || !ITEM_DEFINITIONS.some(definition => definition.id === item.id) ||
      !isCount(item.count) || item.count === 0 || itemIds.has(item.id)) return invalid();
    itemIds.add(item.id);
  }
  return JSON.parse(JSON.stringify({ ...value, localLife })) as LocalSaveSnapshot;
}

function serializeGame(
  cultivator: Cultivator, inventory: InventorySystem, quest: number | QuestProgress,
  guSystem?: GuSystem, localLife?: SavedLocalLife,
): Record<string, unknown> {
  const progress = typeof quest === 'number' ? { questCount: quest } : quest;
  const guCatalog = guSystem ?? new GuSystem();
  const items = [...inventory.items.values()];
  if (![cultivator.hp, cultivator.mp, cultivator.stamina, cultivator.x, cultivator.y].every(Number.isFinite) ||
    !isCount(inventory.primevalStones) || !isCount(progress.questCount) ||
    items.some(item => !isCount(item.count) || item.count === 0) ||
    inventory.ownedGuIds.some(id => typeof id !== 'string' || !guCatalog.getGu(id)) ||
    (guSystem && guSystem.getAllGu().some(gu => !Number.isFinite(gu.hunger))) ||
    (localLife && !readLocalLife(localLife))) throw new Error('Không thể tạo bản lưu từ dữ liệu luyện tập không hợp lệ.');
  return {
    version: 4, realm: cultivator.realm, hp: cultivator.hp, mp: cultivator.mp, stamina: cultivator.stamina,
    x: cultivator.x, y: cultivator.y, stones: inventory.primevalStones,
    ownedGuIds: [...new Set(inventory.ownedGuIds)], items: items.map(({ id, count }) => ({ id, count })),
    guHunger: guSystem ? Object.fromEntries(guSystem.getAllGu().map(gu => [gu.id, gu.hunger])) : undefined,
    questCount: progress.questCount,
    hasRefinedGu: progress.hasRefinedGu ?? (inventory.hasGu('moonblade') || inventory.hasGu('ironskin')),
    questRewardClaimed: progress.questRewardClaimed === true,
    ...(progress.chapter !== undefined ? { chapter: progress.chapter } : {}),
    ...(progress.wolfKills !== undefined ? { wolfKills: progress.wolfKills } : {}),
    ...(progress.bearKills !== undefined ? { bearKills: progress.bearKills } : {}),
    ...(progress.herbsCollected !== undefined ? { herbsCollected: progress.herbsCollected } : {}),
    ...(progress.chapterRewardClaimed !== undefined ? { chapterRewardClaimed: progress.chapterRewardClaimed } : {}),
    ...(localLife ? { localLife } : {}), savedAt: Date.now(),
  };
}

export class StorageSystem {
  public static captureGame(
    cultivator: Cultivator, inventory: InventorySystem, quest: Required<QuestProgress>,
    guSystem: GuSystem, localLife: SavedLocalLife,
  ): LocalSaveSnapshot {
    return parseLocalSaveSnapshot(serializeGame(cultivator, inventory, quest, guSystem, localLife));
  }

  public static restoreGame(
    snapshot: unknown, cultivator: Cultivator, inventory: InventorySystem, guSystem: GuSystem,
  ): SavedQuestProgress {
    const data = parseLocalSaveSnapshot(snapshot);
    // Panels retain these systems, so replace their state without replacing the systems.
    Object.assign(cultivator, new Cultivator());
    const progress = this.applyStoredGame(data as unknown as Record<string, unknown>, cultivator, inventory, guSystem);
    return { ...progress, hasRefinedGu: data.hasRefinedGu };
  }

  public static applyOrigin(cultivator: Cultivator, origin: LocalOrigin): void {
    const baseline = new Cultivator();
    baseline.advanceRealm(cultivator.realm);
    cultivator.baseSpeed = origin === 'hunter' ? 175 : baseline.baseSpeed;
    cultivator.originMpBonus = origin === 'scholar' ? 20 : 0;
    cultivator.maxMp = baseline.maxMp + cultivator.originMpBonus;
    cultivator.originTitle = origin === 'hunter' ? 'Thợ săn dã sơn'
      : origin === 'scholar' ? 'Thư sinh ngộ đạo' : 'Đệ tử chi thứ Cổ Nguyệt';
  }

  public static saveGame(
    cultivator: Cultivator,
    inventory: InventorySystem,
    quest: number | QuestProgress,
    guSystem?: GuSystem,
    localLife?: SavedLocalLife,
  ): boolean {
    try {
      const data = serializeGame(cultivator, inventory, quest, guSystem, localLife);
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  public static loadGame(
    cultivator: Cultivator,
    inventory: InventorySystem,
    guSystem?: GuSystem,
  ): SavedQuestProgress {
    const emptyQuest = { questCount: 0, hasRefinedGu: false, questRewardClaimed: false };
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return emptyQuest;
      const data: unknown = JSON.parse(raw);
      if (!isRecord(data)) return emptyQuest;
      return this.applyStoredGame(data, cultivator, inventory, guSystem);
    } catch {
      return emptyQuest;
    }
  }

  private static applyStoredGame(
    data: Record<string, unknown>, cultivator: Cultivator, inventory: InventorySystem, guSystem?: GuSystem,
  ): SavedQuestProgress {
    if (REALMS.includes(data.realm as Cultivator['realm'])) {
      cultivator.advanceRealm(data.realm as Cultivator['realm']);
    }
    const localLife = readLocalLife(data.localLife);
    if (localLife) StorageSystem.applyOrigin(cultivator, localLife.origin);
    cultivator.hp = boundedResource(data.hp, cultivator.maxHp, cultivator.hp);
    if (localLife?.death) cultivator.hp = 0;
    cultivator.mp = boundedResource(data.mp, cultivator.maxMp, cultivator.mp);
    cultivator.stamina = boundedResource(data.stamina, cultivator.maxStamina, cultivator.stamina);
    if (typeof data.x === 'number' && Number.isFinite(data.x)) cultivator.x = Math.max(62, Math.min(2338, data.x));
    if (typeof data.y === 'number' && Number.isFinite(data.y)) cultivator.y = Math.max(62, Math.min(2338, data.y));
    if (isCount(data.stones)) inventory.primevalStones = data.stones;

    const guCatalog = guSystem ?? new GuSystem();
    if (Array.isArray(data.ownedGuIds)) {
      inventory.ownedGuIds = [...new Set(data.ownedGuIds.filter(
        (id): id is string => typeof id === 'string' && !!guCatalog.getGu(id),
      ))];
    }
    if (Array.isArray(data.items)) {
      inventory.items.clear();
      for (const item of data.items) {
        if (!isRecord(item) || !isCount(item.count) || item.count === 0) continue;
        const definition = ITEM_DEFINITIONS.find(({ id }) => id === item.id);
        if (definition && !inventory.items.has(definition.id)) {
          inventory.addItem({ ...definition, count: item.count });
        }
      }
    }
    if (guSystem && isRecord(data.guHunger)) {
      for (const gu of guSystem.getAllGu()) {
        gu.hunger = boundedResource(data.guHunger[gu.id], 100, gu.hunger);
      }
    }

    const loaded: SavedQuestProgress = {
      questCount: isCount(data.questCount) ? data.questCount : 0,
      hasRefinedGu: data.hasRefinedGu === true || inventory.hasGu('moonblade') || inventory.hasGu('ironskin'),
      questRewardClaimed: data.questRewardClaimed === true,
    };
    if (isCount(data.chapter)) loaded.chapter = data.chapter;
    if (isCount(data.wolfKills)) loaded.wolfKills = data.wolfKills;
    if (isCount(data.bearKills)) loaded.bearKills = data.bearKills;
    if (isCount(data.herbsCollected)) loaded.herbsCollected = data.herbsCollected;
    if (typeof data.chapterRewardClaimed === 'boolean') loaded.chapterRewardClaimed = data.chapterRewardClaimed;
    if (localLife) loaded.localLife = localLife;
    return loaded;
  }
}

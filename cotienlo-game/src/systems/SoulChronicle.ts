export interface PastLifeRecord {
  lifeNumber: number;
  causeOfDeath: string;
  deathX: number;
  deathY: number;
  realmReached: string;
  monstersSlain: number;
  timeSurvivedSeconds: number;
  primevalStonesLeft: number;
  timestamp: number;
}

export interface AccountChronicle {
  totalLives: number;
  unlockedGuRecipes: string[];
  discoveredSecretLore: string[];
  pastLives: PastLifeRecord[];
}

export const CHRONICLE_KEY = 'cotienlo_soul_chronicle_v1';

export function isPastLifeRecord(value: unknown): value is PastLifeRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as PastLifeRecord;
  return Number.isSafeInteger(record.lifeNumber) && record.lifeNumber >= 1 &&
    typeof record.causeOfDeath === 'string' && typeof record.realmReached === 'string' &&
    [record.deathX, record.deathY, record.timestamp].every(Number.isFinite) &&
    [record.monstersSlain, record.primevalStonesLeft].every(n => Number.isSafeInteger(n) && n >= 0) &&
    Number.isFinite(record.timeSurvivedSeconds) && record.timeSurvivedSeconds >= 0;
}

export function parsePastLifeRecord(value: unknown): PastLifeRecord {
  const keys = ['lifeNumber', 'causeOfDeath', 'deathX', 'deathY', 'realmReached',
    'monstersSlain', 'timeSurvivedSeconds', 'primevalStonesLeft', 'timestamp'];
  if (!isPastLifeRecord(value) || Object.keys(value).some(key => !keys.includes(key)) || value.timestamp < 0) {
    throw new Error('Dữ liệu tiền kiếp không hợp lệ.');
  }
  return { ...value };
}

export function parseAccountChronicle(value: unknown): AccountChronicle {
  const invalid = (): never => { throw new Error('Nhật ký tài khoản thiếu dữ liệu hoặc không hợp lệ.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const data = value as AccountChronicle;
  const strings = (items: unknown): items is string[] => Array.isArray(items) &&
    items.every(item => typeof item === 'string' && item.length > 0) && new Set(items).size === items.length;
  if (Object.keys(data).some(key => !['totalLives', 'unlockedGuRecipes', 'discoveredSecretLore', 'pastLives'].includes(key)) ||
    !Number.isSafeInteger(data.totalLives) || data.totalLives < 1 ||
    !strings(data.unlockedGuRecipes) || !strings(data.discoveredSecretLore) ||
    !Array.isArray(data.pastLives) || data.pastLives.length > 10 ||
    data.pastLives.some(record => !isPastLifeRecord(record) || record.lifeNumber >= data.totalLives || record.timestamp < 0) ||
    new Set(data.pastLives.map(record => record.lifeNumber)).size !== data.pastLives.length) return invalid();
  return {
    totalLives: data.totalLives, unlockedGuRecipes: [...data.unlockedGuRecipes],
    discoveredSecretLore: [...data.discoveredSecretLore], pastLives: data.pastLives.map(parsePastLifeRecord),
  };
}

export class SoulChronicle {
  public static exportSnapshot(): AccountChronicle {
    return parseAccountChronicle(this.load());
  }

  public static replaceSnapshot(value: AccountChronicle): void {
    const encoded = JSON.stringify(parseAccountChronicle(value));
    try {
      localStorage.setItem(CHRONICLE_KEY, encoded);
      if (localStorage.getItem(CHRONICLE_KEY) !== encoded) throw new Error('write not retained');
    } catch {
      throw new Error('Không thể lưu nhật ký tài khoản trên thiết bị.');
    }
  }

  public static load(): AccountChronicle {
    try {
      const raw = localStorage.getItem(CHRONICLE_KEY);
      if (!raw) {
        return {
          totalLives: 1,
          unlockedGuRecipes: ['moonblade', 'ironskin'],
          discoveredSecretLore: ['Hoa Tửu Hành Giả trăm năm di tàng'],
          pastLives: [],
        };
      }
      const parsed = JSON.parse(raw);
      return {
        totalLives: Number.isSafeInteger(parsed.totalLives) && parsed.totalLives >= 1 ? parsed.totalLives : 1,
        unlockedGuRecipes: Array.isArray(parsed.unlockedGuRecipes) ? parsed.unlockedGuRecipes.filter((id: unknown) => typeof id === 'string') : ['moonblade', 'ironskin'],
        discoveredSecretLore: Array.isArray(parsed.discoveredSecretLore) ? parsed.discoveredSecretLore.filter((text: unknown) => typeof text === 'string') : [],
        pastLives: Array.isArray(parsed.pastLives) ? parsed.pastLives.filter(isPastLifeRecord).slice(0, 10) : [],
      };
    } catch {
      return {
        totalLives: 1,
        unlockedGuRecipes: ['moonblade', 'ironskin'],
        discoveredSecretLore: [],
        pastLives: [],
      };
    }
  }

  public static recordDeath(record: PastLifeRecord): void {
    if (!isPastLifeRecord(record)) return;
    const data = this.load();
    // The monotonic life number also deduplicates records older than the retained journal.
    if (record.lifeNumber < data.totalLives || data.pastLives.some(life => life.lifeNumber === record.lifeNumber)) return;
    data.totalLives = record.lifeNumber + 1;
    data.pastLives.unshift({ ...record });
    if (data.pastLives.length > 10) {
      data.pastLives.pop();
    }
    try {
      localStorage.setItem(CHRONICLE_KEY, JSON.stringify(data));
    } catch {
      // Ignore storage errors
    }
  }

  public static unlockRecipe(recipeId: string): void {
    const data = this.load();
    if (!data.unlockedGuRecipes.includes(recipeId)) {
      data.unlockedGuRecipes.push(recipeId);
      try {
        localStorage.setItem(CHRONICLE_KEY, JSON.stringify(data));
      } catch {
        // Ignore
      }
    }
  }
}


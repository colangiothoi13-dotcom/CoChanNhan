import { parseLocalSaveSnapshot, type LocalSaveSnapshot } from './StorageSystem';
import { parseAccountChronicle, type AccountChronicle } from './SoulChronicle';

export interface CloudProgress {
  schemaVersion: 1;
  localSave: LocalSaveSnapshot;
  soulChronicle: AccountChronicle;
  /** The server may attach its last-write timestamp. Revision remains response metadata. */
  savedAt?: number;
}

export interface ProgressBackupScope {
  endpoint: string;
  accountId: string;
}

type BackupStorage = Pick<Storage, 'getItem' | 'setItem'>;
const MAX_BYTES = 60 * 1024;
let backupSequence = 0;

function assertSize(value: unknown): void {
  let encoded: string | undefined;
  try { encoded = JSON.stringify(value); }
  catch { throw new Error('Bản lưu đám mây không hợp lệ.'); }
  if (encoded === undefined) throw new Error('Bản lưu đám mây không hợp lệ.');
  if (new TextEncoder().encode(encoded).length > MAX_BYTES) throw new Error('Bản lưu vượt quá giới hạn 60 KB.');
}

export function parseCloudProgress(value: unknown): CloudProgress {
  assertSize(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Bản lưu đám mây thiếu dữ liệu hoặc không hợp lệ.');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !['schemaVersion', 'localSave', 'soulChronicle', 'savedAt'].includes(key)) ||
    data.schemaVersion !== 1 || (data.savedAt !== undefined &&
    (!Number.isSafeInteger(data.savedAt) || (data.savedAt as number) < 0))) throw new Error('Phiên bản bản lưu đám mây không được hỗ trợ.');
  return {
    schemaVersion: 1, localSave: parseLocalSaveSnapshot(data.localSave),
    soulChronicle: parseAccountChronicle(data.soulChronicle),
    ...(data.savedAt !== undefined ? { savedAt: data.savedAt as number } : {}),
  };
}

export function createCloudProgress(localSave: LocalSaveSnapshot, soulChronicle: AccountChronicle): CloudProgress {
  return parseCloudProgress({ schemaVersion: 1, localSave, soulChronicle });
}

/** A failed or unverified backup must block the caller's subsequent import. */
export function backupCurrentProgress(storage: BackupStorage, scope: ProgressBackupScope, progress: CloudProgress): string {
  if (!scope.endpoint || !scope.accountId) throw new Error('Thiếu máy chủ hoặc tài khoản để sao lưu tiến trình.');
  const encoded = JSON.stringify(parseCloudProgress(progress));
  const key = `cotienlo_cloud_backup_v1:${encodeURIComponent(scope.endpoint)}:${encodeURIComponent(scope.accountId)}:${Date.now()}:${++backupSequence}`;
  try {
    // Never overwrite a previous recovery point, even after a page reload in the same millisecond.
    if (storage.getItem(key) !== null) throw new Error('backup collision');
    storage.setItem(key, encoded);
    if (storage.getItem(key) !== encoded) throw new Error('backup not retained');
  } catch {
    throw new Error('Không thể tạo bản sao lưu trên thiết bị. Tiến trình hiện tại được giữ nguyên.');
  }
  return key;
}

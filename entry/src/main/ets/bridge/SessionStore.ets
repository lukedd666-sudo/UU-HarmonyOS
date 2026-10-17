import { asset } from '@kit.AssetStoreKit';
import { util } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';

export interface StoredSession {
  token: string;
  userId: string;
  clientId: string;
  deviceId: string;
  uuid: string;
}

export interface SessionResult { session: StoredSession | null; }
const ALIAS = 'uu-rea-login-session-v1';
let queue: Promise<void> = Promise.resolve();

function aliasQuery(): asset.AssetMap {
  const query: asset.AssetMap = new Map();
  query.set(asset.Tag.ALIAS, new util.TextEncoder().encodeInto(ALIAS));
  return query;
}

function validate(data: string): StoredSession {
  if (typeof data !== 'string' || data.length > 1024) throw new Error('SESSION_FORMAT');
  const value = JSON.parse(data) as StoredSession;
  if (value === null || typeof value !== 'object' || Object.keys(value).length !== 5) throw new Error('SESSION_FORMAT');
  const fields: string[] = [value.token, value.userId, value.clientId, value.deviceId, value.uuid];
  for (const field of fields) {
    if (typeof field !== 'string' || field.length === 0 || /[\x00-\x20\x7f]/.test(field)) throw new Error('SESSION_FORMAT');
  }
  return value;
}

/** Serialize secure storage operations across Web page generations. No file fallback. */
export function sessionOperation(op: string, data: string, current: () => boolean): Promise<SessionResult> {
  const operation = queue.then(async (): Promise<SessionResult> => {
    if (!current()) throw new Error('SESSION_CANCELLED');
    let bytes: Uint8Array = new Uint8Array(0);
    try {
      const query = aliasQuery();
      if (op === 'session.clear') {
        try { await asset.remove(query); }
        catch (error) { if ((error as BusinessError).code !== 24000002) throw error as Error; }
        return { session: null };
      }
      if (op === 'session.save') {
        const session = validate(data);
        bytes = new util.TextEncoder().encodeInto(JSON.stringify(session));
        if (bytes.length > 1024) throw new Error('SESSION_FORMAT');
        query.set(asset.Tag.SECRET, bytes);
        query.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_UNLOCKED);
        query.set(asset.Tag.SYNC_TYPE, asset.SyncType.NEVER);
        query.set(asset.Tag.CONFLICT_RESOLUTION, asset.ConflictResolution.OVERWRITE);
        // IS_PERSISTENT means retain after uninstall. Ordinary restart/update needs no such permission.
        await asset.add(query);
        return { session: null };
      }
      query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
      let items: Array<asset.AssetMap>;
      try { items = await asset.query(query); }
      catch (error) {
        if ((error as BusinessError).code === 24000002) return { session: null };
        throw error as Error;
      }
      if (items.length !== 1) throw new Error('SESSION_FORMAT');
      bytes = items[0].get(asset.Tag.SECRET) as Uint8Array;
      if (!(bytes instanceof Uint8Array) || bytes.length > 1024) throw new Error('SESSION_FORMAT');
      return { session: validate(new util.TextDecoder().decodeToString(bytes)) };
    } catch (_) {
      throw new Error(op === 'session.save' ? 'SESSION_SAVE_FAILED' : op === 'session.clear' ? 'SESSION_CLEAR_FAILED' : 'SESSION_LOAD_FAILED');
    } finally {
      bytes.fill(0);
    }
  });
  queue = operation.then(() => {}, () => {});
  return operation;
}

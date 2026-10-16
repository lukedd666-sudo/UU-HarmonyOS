import { huks } from '@kit.UniversalKeystoreKit';
import { util } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';

/** Only the app-private platform HUKS alias can sign protocol messages. */
export const SIGNING_ALIAS = 'uu-rea-protocol-signing-material';
const IMPORT_CHECK_ALIAS = SIGNING_ALIAS + '-import-check';
let materialImportInProgress: boolean = false;

async function keyExists(alias: string): Promise<boolean> {
  try {
    return await huks.isKeyItemExist(alias, { properties: [] });
  } catch (error) {
    // Current SDK reports an absent alias by rejection, rather than false.
    if ((error as BusinessError).code === 12000011) {
      return false;
    }
    throw error as Error;
  }
}

export async function signProtocolMessage(message: string): Promise<string> {
  if (typeof message !== 'string' || message.length > 65536) {
    throw new Error('SIGNING_INPUT_INVALID');
  }
  let exists: boolean;
  try {
    exists = await huks.isKeyItemExist(SIGNING_ALIAS, { properties: [] });
  } catch (error) {
    // Distinguish absence from a keystore/API failure. Never replace missing material.
    if ((error as BusinessError).code === 12000011) {
      throw new Error('MATERIAL_MISSING');
    }
    throw new Error('KEYSTORE_UNAVAILABLE');
  }
  if (!exists) {
    throw new Error('MATERIAL_MISSING');
  }
  const properties: huks.HuksParam[] = [
    { tag: huks.HuksTag.HUKS_TAG_ALGORITHM, value: huks.HuksKeyAlg.HUKS_ALG_HMAC },
    { tag: huks.HuksTag.HUKS_TAG_PURPOSE, value: huks.HuksKeyPurpose.HUKS_KEY_PURPOSE_MAC },
    { tag: huks.HuksTag.HUKS_TAG_DIGEST, value: huks.HuksKeyDigest.HUKS_DIGEST_SHA256 }
  ];
  let handle: number = -1;
  try {
    const session = await huks.initSession(SIGNING_ALIAS, { properties: properties });
    handle = session.handle;
    const bytes = new util.TextEncoder().encodeInto(message);
    // HUKS implementations limit update chunks; keep each chunk at 4 KiB.
    for (let offset = 0; offset < bytes.length; offset += 4096) {
      await huks.updateSession(handle, { properties: properties, inData: bytes.slice(offset, offset + 4096) });
    }
    const result = await huks.finishSession(handle, { properties: properties, inData: new Uint8Array(0) });
    handle = -1;
    if (result.outData === undefined || result.outData.length !== 32) {
      throw new Error('SIGNING_RESULT_INVALID');
    }
    let hex = '';
    for (const byte of result.outData) {
      hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
  } catch (error) {
    if ((error as BusinessError).code === 12000011) {
      throw new Error('MATERIAL_MISSING');
    }
    throw new Error('SIGNING_FAILED');
  } finally {
    if (handle !== -1) {
      try {
        await huks.abortSession(handle, { properties: properties });
      } catch (_) {}
    }
  }
}

/** Import only user-supplied material; never generate or export UU protocol keys. */
export async function importProtocolMaterial(material: string): Promise<void> {
  if (typeof material !== 'string' || material.length > 64) {
    throw new Error('MATERIAL_INPUT_INVALID');
  }
  const bytes = new util.TextEncoder().encodeInto(material);
  material = '';
  if (bytes.length < 8 || bytes.length > 64) {
    bytes.fill(0);
    throw new Error('MATERIAL_INPUT_INVALID');
  }
  // SHA-256 HMAC first zero-pads keys up to its 64-byte block size. Importing
  // that same block preserves HMAC(K, message) without exposing a key on disk.
  const padded = new Uint8Array(64);
  padded.set(bytes);
  bytes.fill(0);
  if (materialImportInProgress) {
    padded.fill(0);
    throw new Error('MATERIAL_IMPORT_IN_PROGRESS');
  }
  materialImportInProgress = true;
  const properties: huks.HuksParam[] = [
    { tag: huks.HuksTag.HUKS_TAG_ALGORITHM, value: huks.HuksKeyAlg.HUKS_ALG_HMAC },
    { tag: huks.HuksTag.HUKS_TAG_PURPOSE, value: huks.HuksKeyPurpose.HUKS_KEY_PURPOSE_MAC },
    { tag: huks.HuksTag.HUKS_TAG_DIGEST, value: huks.HuksKeyDigest.HUKS_DIGEST_SHA256 },
    // The SDK has no HMAC-specific size enum. HuksParam accepts numeric bits;
    // 512 is the padded SHA-256 block length, not an AES algorithm selection.
    { tag: huks.HuksTag.HUKS_TAG_KEY_SIZE, value: 512 }
  ];
  let primaryDeleted: boolean = false;
  let stagingPresent: boolean = false;
  try {
    // All input validation above completes before any existing key can change.
    // The trusted UI labels this explicit action as saving/replacing material.
    const replacing = await keyExists(SIGNING_ALIAS);
    if (await keyExists(IMPORT_CHECK_ALIAS)) {
      // Recover a staging key left by a process interruption, without exporting it.
      await huks.deleteKeyItem(IMPORT_CHECK_ALIAS, { properties: [] });
    }
    if (replacing) {
      // API 20+ rejects import to an occupied alias (12000017). Prove that this
      // platform accepts the new material before removing the current key.
      await huks.importKeyItem(IMPORT_CHECK_ALIAS, { properties: properties, inData: padded });
      stagingPresent = true;
      await huks.deleteKeyItem(IMPORT_CHECK_ALIAS, { properties: [] });
      stagingPresent = false;
      await huks.deleteKeyItem(SIGNING_ALIAS, { properties: [] });
      primaryDeleted = true;
    }
    await huks.importKeyItem(SIGNING_ALIAS, { properties: properties, inData: padded });
    if (!await keyExists(SIGNING_ALIAS)) {
      throw new Error('MATERIAL_IMPORT_FAILED');
    }
  } catch (error) {
    // HUKS has no atomic alias replacement. A failure after deleting the old
    // fixed alias needs a fresh explicit import; never imply the old key remains.
    if (primaryDeleted) {
      throw new Error('MATERIAL_REPLACE_FAILED');
    }
    const code = (error as BusinessError).code;
    if (code === 801 || code === 12000001 || code === -4) {
      throw new Error('MATERIAL_IMPORT_UNSUPPORTED');
    }
    throw new Error('MATERIAL_IMPORT_FAILED');
  } finally {
    padded.fill(0);
    if (stagingPresent) {
      try {
        await huks.deleteKeyItem(IMPORT_CHECK_ALIAS, { properties: [] });
      } catch (_) {}
    }
    materialImportInProgress = false;
  }
}

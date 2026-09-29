/**
 * Capsule at-rest encryption.
 *
 * Real encryption with no native prebuild required:
 *  - A random 256-bit master key is generated on first launch and stored in the
 *    device secure enclave via expo-secure-store (iOS Keychain / Android Keystore),
 *    WHEN_UNLOCKED_THIS_DEVICE_ONLY — never leaves the device, never synced to iCloud.
 *  - Two subkeys are derived from the master (HKDF-style via HMAC-SHA256): one for
 *    AES, one for the MAC.
 *  - Payloads are AES-256-CBC encrypted then authenticated with HMAC-SHA256
 *    (encrypt-then-MAC). Format: "c1:" + base64(iv) "." base64(mac) "." base64(ct).
 *  - Encryption is MANDATORY (this app is unreleased — there is no legacy plaintext
 *    to migrate). decryptString() therefore requires a valid "c1:" envelope and
 *    throws on anything else, so a stripped prefix can't bypass authentication.
 *    The DB read layer isolates a failed row so one bad record can't break the load.
 *
 * Text notes are encrypted in the DB layer; image/audio files are encrypted on disk
 * and decrypted to a short-lived cache file only when displayed/exported.
 *
 * NOTE: crypto-js is pure-JS. For large media this runs on the JS thread; fine for
 * MVP-sized captures. A future milestone can swap in native crypto for speed.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';
import CryptoJS from 'crypto-js';

const KEY_ID = 'capsule.master.v1';
const PREFIX = 'c1:';
const TEMP_DIR = `${FileSystem.cacheDirectory ?? ''}capsule_dec/`;

// Memoized as a single promise so concurrent first-callers share one key
// derivation (and one SecureStore write) — avoids a race that could otherwise
// generate two different master keys and make freshly-encrypted data unreadable.
let keysPromise: Promise<{ enc: CryptoJS.lib.WordArray; mac: CryptoJS.lib.WordArray }> | null = null;

/** Cryptographically secure random WordArray via Expo's RNG (not CryptoJS's PRNG). */
async function secureRandomWords(nBytes: number): Promise<CryptoJS.lib.WordArray> {
  const bytes = await Crypto.getRandomBytesAsync(nBytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return CryptoJS.enc.Hex.parse(hex);
}

// SecureStore is unavailable on web; fall back to localStorage there.
// Web is the interactive DEMO surface only — the real security guarantee is on device.
async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  }
  return SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try { globalThis.localStorage?.setItem(key, value); } catch { /* demo best-effort */ }
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function getMasterHex(): Promise<string> {
  let hex = await secureGet(KEY_ID);
  if (!hex) {
    const bytes = await Crypto.getRandomBytesAsync(32); // 256-bit master
    hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    await secureSet(KEY_ID, hex);
  }
  return hex;
}

async function deriveKeys(): Promise<{ enc: CryptoJS.lib.WordArray; mac: CryptoJS.lib.WordArray }> {
  const master = CryptoJS.enc.Hex.parse(await getMasterHex());
  return {
    enc: CryptoJS.HmacSHA256('capsule-enc', master), // 256-bit subkey
    mac: CryptoJS.HmacSHA256('capsule-mac', master), // 256-bit subkey
  };
}

function getKeys(): Promise<{ enc: CryptoJS.lib.WordArray; mac: CryptoJS.lib.WordArray }> {
  if (!keysPromise) keysPromise = deriveKeys();
  return keysPromise;
}

function constantTimeEqual(a: CryptoJS.lib.WordArray, b: CryptoJS.lib.WordArray): boolean {
  const ah = CryptoJS.enc.Hex.stringify(a);
  const bh = CryptoJS.enc.Hex.stringify(b);
  if (ah.length !== bh.length) return false;
  let r = 0;
  for (let i = 0; i < ah.length; i++) r |= ah.charCodeAt(i) ^ bh.charCodeAt(i);
  return r === 0;
}

/** Encrypt a UTF-8 string. Returns a self-describing "c1:" payload. */
export async function encryptString(plain: string): Promise<string> {
  const { enc, mac } = await getKeys();
  const iv = await secureRandomWords(16);
  const ct = CryptoJS.AES.encrypt(plain, enc, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).ciphertext;
  const macTag = CryptoJS.HmacSHA256(iv.clone().concat(ct.clone()), mac);
  return (
    PREFIX +
    [
      CryptoJS.enc.Base64.stringify(iv),
      CryptoJS.enc.Base64.stringify(macTag),
      CryptoJS.enc.Base64.stringify(ct),
    ].join('.')
  );
}

/** Decrypt a "c1:" payload. Non-prefixed input is treated as legacy plaintext. */
export async function decryptString(payload: string): Promise<string> {
  if (!payload) return payload;
  // Encryption is mandatory: everything written by this app is a "c1:" envelope.
  // Anything else is corruption/tampering (or disposable pre-encryption dev data
  // on this unreleased app) — throw rather than silently accept it as plaintext,
  // so a stripped prefix can't bypass authentication. The DB read layer isolates
  // a failed row so one bad record can't break the whole review load.
  if (!payload.startsWith(PREFIX)) throw new Error('capsule: not an encrypted record');
  const parts = payload.slice(PREFIX.length).split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error('capsule: malformed ciphertext');
  }
  const [ivB64, macB64, ctB64] = parts;
  const { enc, mac } = await getKeys();
  const iv = CryptoJS.enc.Base64.parse(ivB64);
  const ct = CryptoJS.enc.Base64.parse(ctB64);
  const expected = CryptoJS.enc.Base64.parse(macB64);
  const actual = CryptoJS.HmacSHA256(iv.clone().concat(ct.clone()), mac);
  if (!constantTimeEqual(actual, expected)) throw new Error('capsule: authentication failed');
  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext: ct }),
    enc,
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
  );
  return decrypted.toString(CryptoJS.enc.Utf8);
}

/** True if the payload/path looks like a Capsule-encrypted artifact. */
export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && (value.startsWith(PREFIX) || value.endsWith('.enc'));
}

/**
 * Encrypt a file in place: reads bytes, writes "<path>.enc" containing the encrypted
 * base64, deletes the plaintext original. Returns the new .enc path.
 */
export async function encryptFileInPlace(path: string): Promise<string> {
  const b64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
  const encoded = await encryptString(b64);
  const encPath = `${path}.enc`;
  await FileSystem.writeAsStringAsync(encPath, encoded, { encoding: FileSystem.EncodingType.UTF8 });
  await FileSystem.deleteAsync(path, { idempotent: true });
  return encPath;
}

/**
 * Decrypt an encrypted file to a short-lived cache file for display/export.
 * Returns the plaintext temp URI. Call clearDecryptedCache() when re-locking.
 */
export async function decryptFileToTemp(encPath: string): Promise<string> {
  const encoded = await FileSystem.readAsStringAsync(encPath, { encoding: FileSystem.EncodingType.UTF8 });
  const b64 = await decryptString(encoded);
  await FileSystem.makeDirectoryAsync(TEMP_DIR, { intermediates: true });
  // Prefix with a hash of the full source path so same-basename files from
  // different directories don't collide in the cache.
  const digest = CryptoJS.SHA256(encPath).toString(CryptoJS.enc.Hex).slice(0, 8);
  const base = (encPath.split('/').pop() || 'file').replace(/\.enc$/, '');
  const tmp = `${TEMP_DIR}${digest}_${base}`;
  await FileSystem.writeAsStringAsync(tmp, b64, { encoding: FileSystem.EncodingType.Base64 });
  return tmp;
}

/** Remove all decrypted temp files (call on lock). */
export async function clearDecryptedCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(TEMP_DIR, { idempotent: true });
  } catch {
    /* best-effort */
  }
}

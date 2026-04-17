/**
 * src/dualregev/index.js
 *
 * Public API for the Dual Regev module.
 * Import everything your app needs from here — not from the inner files.
 *
 * ── Quick usage ─────────────────────────────────────────────────────────────
 *
 * // 1. Generate keys (first login — downloads username_dr_keys.json)
 * import { drGenerateAndSave } from 'src/dualregev';
 * await drGenerateAndSave(username, 16); // 16 = dev, 64 = prod
 *
 * // 2. Load keys from file (page reload)
 * import { drLoadFromFile } from 'src/dualregev';
 * await drLoadFromFile(file); // File object from <input type="file">
 *
 * // 3. Upload public key to server (after key gen or file load)
 * import { getDRPublicKeyForUpload } from 'src/dualregev';
 * const pubkey = { dualregev: getDRPublicKeyForUpload() };
 * await fetch('/keys/upsert', { method:'POST', body: JSON.stringify({ pubkey }) });
 *
 * // 4. Encrypt a message
 * import { drEncrypt, drParseFriendPubkey } from 'src/dualregev';
 * const friendApk = drParseFriendPubkey(serverPubkey.dualregev);
 * const body = await drEncrypt(friendApk, publicMsg, secretMsg); // secretMsg optional
 *
 * // 5. Decrypt a received message
 * import { drDecryptPublic, drDecryptSecret, getDRSession } from 'src/dualregev';
 * const { ask, apk, tk } = getDRSession();
 * const publicText = await drDecryptPublic(apk, ask, body);
 * const secretText = await drDecryptSecret(apk, tk, body); // null if public-only
 *
 * // 6. Clear keys on logout
 * import { clearDRSession } from 'src/dualregev';
 * clearDRSession();
 */

// ── Session ──────────────────────────────────────────────────────────────────
export { getDRSession, clearDRSession, setDRSession } from './dualRegevCrypto.js';

// ── Key generation and file management ──────────────────────────────────────
export { drGenerateAndSave, drLoadFromFile } from './dualRegevCrypto.js';

// ── Server upload / fetch helpers ────────────────────────────────────────────
export { getDRPublicKeyForUpload, drParseFriendPubkey } from './dualRegevCrypto.js';

// ── Encryption / decryption ──────────────────────────────────────────────────
export { drEncrypt, drDecryptPublic, drDecryptSecret } from './dualRegevCrypto.js';

// ── Serialization (needed if you store/restore keys manually) ────────────────
export {
  drSerializeKeys,
  drDeserializeKeys,
  drSerializePublicKey,
  drDeserializePublicKey,
} from './dualRegevCrypto.js';

// ── Parameters (for advanced use / debugging) ────────────────────────────────
export { drGenParams, drAGen } from './dualRegevCrypto.js';
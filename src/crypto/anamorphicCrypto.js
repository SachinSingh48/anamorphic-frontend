/**
 * anamorphicCrypto.js
 *
 * Keys are NEVER stored in localStorage or any browser storage.
 * They exist in two places only:
 *   1. A JSON file downloaded to the user's device (username_keys.json)
 *   2. In-memory (_sessionKeys) for the duration of the browser session
 *
 * On tab close / refresh, _sessionKeys is cleared automatically.
 */

import {
  powMod,
  modInverse,
  randomBigIntInRange,
  generatePrime,
  randomBytes,
  sha256,
  jsonSafe,
  jsonRestore,
} from './cryptoUtils.js';


// ═══════════════════════════════════════════════════════════════════════════
// In-memory session storage — never persisted anywhere
// ═══════════════════════════════════════════════════════════════════════════

let _sessionKeys = null; // { aSK, dkey } — gone when tab closes

export function getSessionKeys() { return _sessionKeys; }
export function clearSessionKeys() { _sessionKeys = null; }


// ═══════════════════════════════════════════════════════════════════════════
// ElGamal PKE  (base_pke.py)
// ═══════════════════════════════════════════════════════════════════════════

class ElGamalPKE {

  async KeyGen(lambdaBits) {
    const p = await generatePrime(lambdaBits);
    const g = 2n;
    const x = randomBigIntInRange(2n, p - 2n);
    const h = powMod(g, x, p);
    return { PK: { p, g, h }, SK: { x, p } };
  }

  intToText(n) {
    n = BigInt(n);
    if (n === 0n) return '';
    let hex = n.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++)
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return '[Decryption Error]';
    }
  }

  async Encrypt(PK, message, randomness = null) {
    const { p, g, h } = PK;
    if (typeof message === 'string') {
      const messageBytes = new TextEncoder().encode(message);
      const maxBytes = Math.floor((Number(p.toString(2).length) - 8) / 8);
      if (messageBytes.length > maxBytes)
        return this._encryptHybrid(PK, messageBytes, randomness);
      let messageInt = 0n;
      for (const b of messageBytes) messageInt = (messageInt << 8n) | BigInt(b);
      return this._elGamalCore(p, g, h, messageInt, randomness);
    }
    return this._elGamalCore(p, g, h, BigInt(message) % p, randomness);
  }

  _elGamalCore(p, g, h, messageInt, randomness) {
    const y  = randomness !== null ? BigInt(randomness) : randomBigIntInRange(2n, p - 2n);
    const c1 = powMod(g, y, p);
    const s  = powMod(h, y, p);
    const c2 = (messageInt * s) % p;
    return { c1, c2, y_used: y, is_hybrid: false };
  }

  async _encryptHybrid(PK, messageBytes, randomness = null) {
    const { p, g, h } = PK;
    const symKeyBytes = randomBytes(32);
    const y  = randomness !== null ? BigInt(randomness) : randomBigIntInRange(2n, p - 2n);
    const c1 = powMod(g, y, p);
    const s  = powMod(h, y, p);
    let keyInt = 0n;
    for (const b of symKeyBytes) keyInt = (keyInt << 8n) | BigInt(b);
    keyInt = keyInt % p;
    const c2 = (keyInt * s) % p;
    const cryptoKey = await crypto.subtle.importKey(
      'raw', symKeyBytes, { name: 'AES-GCM' }, false, ['encrypt']
    );
    const iv        = randomBytes(12);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, messageBytes);
    const full      = new Uint8Array(encrypted);
    return { c1, c2, y_used: y, is_hybrid: true, iv, ciphertext: full.slice(0, full.length - 16), tag: full.slice(full.length - 16) };
  }

  Decrypt(SK, ciphertext) {
    const x    = BigInt(SK.x);
    const p    = BigInt(SK.p);
    const s    = powMod(BigInt(ciphertext.c1), x, p);
    const sInv = modInverse(s, p);
    return (BigInt(ciphertext.c2) * sInv) % p;
  }

  async DecryptHybrid(SK, ciphertext) {
    if (!ciphertext.is_hybrid) throw new Error('Not hybrid-encrypted');
    const x      = BigInt(SK.x);
    const p      = BigInt(SK.p);
    const s      = powMod(BigInt(ciphertext.c1), x, p);
    const sInv   = modInverse(s, p);
    const keyInt = (BigInt(ciphertext.c2) * sInv) % p;
    const keyHex = keyInt.toString(16).padStart(64, '0');
    const symKey = new Uint8Array(32);
    for (let i = 0; i < 32; i++)
      symKey[i] = parseInt(keyHex.slice(i * 2, i * 2 + 2), 16);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', symKey, { name: 'AES-GCM' }, false, ['decrypt']
    );
    const { iv, ciphertext: encMsg, tag } = ciphertext;
    const full = new Uint8Array(encMsg.length + tag.length);
    full.set(encMsg); full.set(tag, encMsg.length);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, full);
    return new Uint8Array(decrypted);
  }

  async decryptAndDecode(SK, ciphertext) {
    if (ciphertext.is_hybrid) {
      const bytes = await this.DecryptHybrid(SK, ciphertext);
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }
    return this.intToText(this.Decrypt(SK, ciphertext));
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// NIZK Mock  (nizk_mock.py)
// ═══════════════════════════════════════════════════════════════════════════

class NIZKMock {
  async SimulatorS0(lambdaBits) {
    const simulatedSigma = randomBytes(lambdaBits / 8);
    const auxInfo = await sha256('SIMULATION_SECRET_TOKEN' + String(lambdaBits));
    return { simulatedSigma, auxInfo };
  }

  async SimulatorS1(instance, auxInfo) {
    const auxStr = auxInfo instanceof Uint8Array
      ? Array.from(auxInfo).map(b => b.toString(16).padStart(2, '0')).join('')
      : String(auxInfo);
    return sha256(JSON.stringify(instance) + auxStr + 'SIMULATED_PROVED');
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// Anamorphic Encryption  (receiver_am.py)
// ═══════════════════════════════════════════════════════════════════════════

const pke  = new ElGamalPKE();
const nizk = new NIZKMock();

export async function AnamorphicKeyGen(lambdaBits = 2048) {
  console.log(`[crypto] Generating keypair 1/2 (${lambdaBits}-bit)...`);
  const { PK: pk0, SK: sk0 } = await pke.KeyGen(lambdaBits);
  console.log(`[crypto] Generating keypair 2/2 (${lambdaBits}-bit)...`);
  const { PK: pk1, SK: sk1 } = await pke.KeyGen(lambdaBits);
  const { simulatedSigma, auxInfo: aux } = await nizk.SimulatorS0(lambdaBits);
  return { aSK: sk0, dkey: { pk0, pk1, sk1, aux } };
}

export async function AnamorphicEncrypt(friendPublicKey, m0, m1) {
  const { pk0, pk1, aux } = friendPublicKey;
  const ct0 = await pke.Encrypt(pk0, m0);
  const ct1 = await pke.Encrypt(pk1, m1);
  const nizkInstance = {
    pk0: { p: pk0.p.toString(), g: pk0.g.toString(), h: pk0.h.toString() },
    ct0: { c1: ct0.c1.toString(), c2: ct0.c2.toString() },
    pk1: { p: pk1.p.toString(), g: pk1.g.toString(), h: pk1.h.toString() },
    ct1: { c1: ct1.c1.toString(), c2: ct1.c2.toString() },
  };
  const pi = await nizk.SimulatorS1(nizkInstance, aux);
  return { ct0, ct1, pi };
}

export async function NormalDecrypt(aSK, anamorphicCiphertext) {
  return pke.decryptAndDecode(aSK, anamorphicCiphertext.ct0);
}

export async function DoubleDecrypt(dkey, anamorphicCiphertext) {
  return pke.decryptAndDecode(dkey.sk1, anamorphicCiphertext.ct1);
}


// ═══════════════════════════════════════════════════════════════════════════
// Key file — download & upload  (no localStorage at all)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate new keys → store in memory → auto-download username_keys.json.
 * Called on first login (server has no key for this user yet).
 */
export async function generateAndDownloadKeys(username, lambdaBits = 2048) {
  const { aSK, dkey } = await AnamorphicKeyGen(lambdaBits);
  _sessionKeys = { aSK, dkey };

  const fileContent = JSON.stringify({
    username,
    created_at: new Date().toISOString(),
    aSK:  jsonSafe(aSK),
    dkey: jsonSafe(dkey),
  }, null, 2);

  const blob = new Blob([fileContent], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${username}_keys.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log(`[crypto] Keys generated and downloaded as ${username}_keys.json`);
  return { aSK, dkey };
}

/**
 * Load keys from a File object picked by the user.
 * Stores them in _sessionKeys (memory only).
 */
export async function loadKeysFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed   = JSON.parse(e.target.result);
        const restored = {
          aSK:  jsonRestore(parsed.aSK),
          dkey: jsonRestore(parsed.dkey),
        };
        if (!restored.aSK?.x || !restored.dkey?.pk0)
          throw new Error('Invalid key file structure');
        _sessionKeys = restored;
        console.log('[crypto] Keys loaded from file into session memory ✓');
        resolve(restored);
      } catch (err) {
        reject(new Error('Invalid key file: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Returns full dkey for uploading to /keys/upsert.
 */
export function getPublicKeyForUpload() {
  if (!_sessionKeys) return null;
  const { dkey } = _sessionKeys;
  return jsonSafe({ pk0: dkey.pk0, pk1: dkey.pk1, sk1: dkey.sk1, aux: dkey.aux });
}
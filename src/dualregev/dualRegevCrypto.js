/**
 * src/dualregev/dualRegevCrypto.js
 *
 * Dual Regev Anamorphic Encryption — complete self-contained implementation.
 * JS port of the Go implementation (anamorphicLWE/DualRegev package).
 *
 * Paper: "Fully Asymmetric Anamorphic Homomorphic Encryption from LWE"
 *        Deo & Libert (2025), Section 4, pp. 19-24.
 *
 * ── Key structure (mirrors Go) ──────────────────────────────────────────────
 *   ask = E  — Normal secret key.  Decrypts PUBLIC channel.  Reveal under coercion.
 *   tk  = R  — Trapdoor.           Decrypts SECRET channel.  Never reveal.
 *   apk      — { params, A, U }.   Public key.               Safe to upload to server.
 *
 * ── Performance ────────────────────────────────────────────────────────────
 *   All matrix arithmetic uses plain Number (not BigInt).
 *   Safe because max inner product = m × (q-1)²
 *     ≤ 2048 × 32767² ≈ 2.2 × 10¹² << Number.MAX_SAFE_INTEGER (9 × 10¹⁵).
 *
 * ── Lambda guidance (n = lambda) ───────────────────────────────────────────
 *   16 → dev / testing   (~1s keygen,  ~220 KB key file)
 *   32 → balanced        (~4s keygen,  ~800 KB key file)
 *   64 → production      (~15s keygen, ~3 MB key file)
 *
 * ── Session storage ────────────────────────────────────────────────────────
 *   Keys live in _session (module-level variable).
 *   Cleared automatically when the tab closes — never written to localStorage.
 */

import {
  sha256,
  aesEncrypt,
  aesDecrypt,
  encodeMatrix,
  decodeMatrix,
} from './utils.js';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1 — In-memory session store
// ═══════════════════════════════════════════════════════════════════════════

let _session = null; // { ask, apk, tk } — gone when tab closes

export const getDRSession   = ()     => _session;
export const clearDRSession = ()     => { _session = null; };
export const setDRSession   = (keys) => { _session = keys; };

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2 — Parameters   (mirrors Go gen_parameters)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate scheme parameters for the given security dimension.
 * All values are plain Number — no BigInt needed.
 */
export function drGenParams(lambda = 16) {
  const q     = 32768;                   // 2^15 — ciphertext modulus
  const p     = 5;                       //        — plaintext modulus
  const k     = 15;                      // log2(q)
  const n     = lambda;
  const mBar  = n * k + 2 * lambda;     // e.g. n=16 → mBar=272
  const m     = mBar + n * k;           // e.g. n=16 → m=512
  const delta = Math.floor(q / p);      // 6553
  return { q, p, k, n, mBar, m, delta };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3 — Matrix primitives   (all arithmetic in Number mod q)
// ═══════════════════════════════════════════════════════════════════════════

/** Allocate a rows×cols matrix of Int32Array rows (for fast arithmetic) */
function zeros(rows, cols) {
  return Array.from({ length: rows }, () => new Int32Array(cols));
}

/**
 * Fill a Uint32Array with cryptographically random values.
 * Chunks requests into 65536-byte (16384 uint32) blocks to stay within
 * the browser's getRandomValues limit of 65536 bytes per call.
 */
function secureRandomUint32(buf) {
  const MAX = 16384; // 65536 bytes / 4 bytes per uint32
  for (let offset = 0; offset < buf.length; offset += MAX)
    crypto.getRandomValues(buf.subarray(offset, Math.min(offset + MAX, buf.length)));
  return buf;
}

/**
 * Sample a uniform random matrix in Z_q^{rows×cols}.
 * Uses crypto.getRandomValues — cryptographically secure.
 */
function sampleUniform(rows, cols, q) {
  const buf = secureRandomUint32(new Uint32Array(rows * cols));
  const M   = zeros(rows, cols);
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      M[i][j] = buf[i * cols + j] % q;
  return M;
}

/**
 * Sample a discrete Gaussian error matrix with std-dev sigma, stored mod q.
 * Uses Box-Muller transform with crypto.getRandomValues.
 * Mirrors Go's SampleError(rows, cols, stdDev, q).
 */
function sampleError(rows, cols, sigma, q) {
  const n      = rows * cols;
  const pairs  = Math.ceil(n / 2);
  const u1buf  = secureRandomUint32(new Uint32Array(pairs));
  const u2buf  = secureRandomUint32(new Uint32Array(pairs));

  const samples = new Int32Array(n);
  let   idx     = 0;
  for (let i = 0; i < pairs && idx < n; i++) {
    // (0, 1] to avoid log(0)
    const u1  = (u1buf[i] + 1) / 4294967297;
    const u2  = u2buf[i]       / 4294967296;
    const mag = sigma * Math.sqrt(-2 * Math.log(u1));
    if (idx < n) samples[idx++] = Math.round(mag * Math.cos(2 * Math.PI * u2));
    if (idx < n) samples[idx++] = Math.round(mag * Math.sin(2 * Math.PI * u2));
  }

  const M = zeros(rows, cols);
  let   si = 0;
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      M[i][j] = ((samples[si++] % q) + q) % q;
  return M;
}

/**
 * Matrix multiply A(r×k) × B(k×c) mod q.
 * Inner loop uses Number — safe for q=32768, k≤2048.
 */
function matMul(A, B, q) {
  const r = A.length, kk = B.length, c = B[0].length;
  const C = zeros(r, c);
  for (let i = 0; i < r; i++) {
    const Ai = A[i], Ci = C[i];
    for (let l = 0; l < kk; l++) {
      const a = Ai[l];
      if (!a) continue;         // skip zero — common in error matrices
      const Bl = B[l];
      for (let j = 0; j < c; j++) Ci[j] = (Ci[j] + a * Bl[j]) % q;
    }
  }
  return C;
}

/** Transpose a matrix */
function transpose(A) {
  const r = A.length, c = A[0].length;
  const T = zeros(c, r);
  for (let i = 0; i < r; i++)
    for (let j = 0; j < c; j++) T[j][i] = A[i][j];
  return T;
}

/** Element-wise add mod q */
function matAdd(A, B, q) {
  return A.map((row, i) => row.map((v, j) => (v + B[i][j]) % q));
}

/** Horizontal concatenation: [A | B] */
function horzConcat(A, B) {
  const ca = A[0].length, cb = B[0].length;
  const C  = zeros(A.length, ca + cb);
  for (let i = 0; i < A.length; i++) {
    C[i].set(A[i]);
    C[i].set(B[i], ca);
  }
  return C;
}

/**
 * Gadget matrix G = I_n ⊗ [1, 2, 4, ..., 2^(k-1)] mod q.
 * Shape: n × (n*k). Mirrors Go's GadgetMatrixParallel.
 */
function gadgetMatrix(n, k, q) {
  const G = zeros(n, n * k);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < k; j++)
      G[i][i * k + j] = (1 << j) % q;
  return G;
}

/**
 * Multiply matrix A (r×c) by a flat vector vec (length c) → flat result (length r).
 * Faster than matMul for column vectors.
 */
function mulVec(A, vec, q) {
  return A.map(row => {
    let s = 0;
    for (let j = 0; j < vec.length; j++) s += row[j] * vec[j];
    return ((s % q) + q) % q;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4 — Core LWE operations   (mirrors Go main.go in DualRegev package)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * AGen — anamorphic key generation with trapdoor.
 * Matches Go AGen(lam).
 *
 * Construction:
 *   A_bar ~ Uniform(n × mBar)
 *   R     ~ Error(mBar × n*k, σ=1)       ← trapdoor (tk)
 *   G     = I_n ⊗ [1,2,...,2^(k-1)]     ← gadget matrix (n × n*k)
 *   A     = [A_bar | A_bar·R + G]        ← public matrix (n × m)
 *   E     ~ Error(m × n, σ=1)            ← secret key (ask)
 *   U     = A·E  mod q                   ← (n × n)
 */
export function drAGen(lambda = 16) {
  const par = drGenParams(lambda);
  const { q, n, k, m, mBar } = par;

  const R      = sampleError(mBar, n * k, 1.0, q);   // trapdoor
  const A_bar  = sampleUniform(n, mBar, q);
  const G      = gadgetMatrix(n, k, q);
  const right  = matAdd(matMul(A_bar, R, q), G, q);   // A_bar·R + G
  const A      = horzConcat(A_bar, right);             // n × m
  const E      = sampleError(m, n, 1.0, q);            // secret key
  const U      = matMul(A, E, q);                      // n × n

  return {
    ask: E,
    apk: { params: par, A, U },
    tk:  R,
  };
}

/**
 * Standard Enc — encrypt a message vector mu_vec ∈ Z_p^n.
 * Used for public-only messages (no secret channel).
 * Matches Go Enc(pk, mu).
 */
function _encCore(apk, mu_vec) {
  const { params, A, U } = apk;
  const { q, n, m, delta } = params;

  const s      = sampleUniform(n, 1, q);
  const e0     = sampleError(m, 1, 1.0, q);
  const e1     = sampleError(n, 1, 1.0, q);
  const sflat  = Array.from({ length: n }, (_, i) => s[i][0]);
  const mu_q   = mu_vec.map(v => (v * delta) % q);

  // c0 = A^T · s + e0   (m×1)
  const c0 = mulVec(transpose(A), sflat, q)
              .map((v, i) => (v + e0[i][0]) % q);

  // c1 = U^T · s + e1 + Δ·μ   (n×1)
  const c1 = mulVec(transpose(U), sflat, q)
              .map((v, i) => (v + e1[i][0] + mu_q[i]) % q);

  return { c0, c1 };
}

/**
 * AEnc — anamorphic encryption of (mu_vec, mu_bar_vec) ∈ (Z_p^n)².
 * Embeds mu_bar into the RANDOMNESS: s_hat = s + Δ·μ̄.
 * Matches Go AEnc(apk, mu, mu_bar).
 *
 * CRITICAL: s sampled from Error(σ=0.5), NOT uniform.
 *   This keeps s_hat small so ADec can recover μ̄ via gadget inversion.
 *   Changing σ here breaks decryption.
 */
function _aEncCore(apk, mu_vec, mu_bar_vec) {
  const { params, A, U } = apk;
  const { q, n, m, delta } = params;

  // s small (σ=0.5) — must match Go AEnc's SampleError(n, 1, 0.5, q)
  const s         = sampleError(n, 1, 0.5, q);
  const e0        = sampleError(m, 1, 1.0, q);
  const e1        = sampleError(n, 1, 1.0, q);
  const sflat     = Array.from({ length: n }, (_, i) => s[i][0]);
  const mu_q      = mu_vec.map(v     => (v * delta) % q);
  const mu_bar_q  = mu_bar_vec.map(v => (v * delta) % q);

  // s_hat = s + Δ·μ̄   (covert message embedded in randomness)
  const s_hat = sflat.map((v, i) => (v + mu_bar_q[i]) % q);

  // c0 = A^T · s_hat + e0
  const c0 = mulVec(transpose(A), s_hat, q)
              .map((v, i) => (v + e0[i][0]) % q);

  // c1 = U^T · s_hat + e1 + Δ·μ
  const c1 = mulVec(transpose(U), s_hat, q)
              .map((v, i) => (v + e1[i][0] + mu_q[i]) % q);

  return { c0, c1 };
}

/**
 * Dec — standard decryption. Recovers mu_vec using ask (E).
 * Matches Go Dec(par, sk, ct).
 */
function _decCore(apk, ask, ct) {
  const { params } = apk;
  const { q, p, delta } = params;
  const Ec0 = mulVec(transpose(ask), ct.c0, q);
  return ct.c1.map((v, i) => {
    const diff     = ((v - Ec0[i]) % q + q) % q;
    const centered = diff > q / 2 ? diff - q : diff; // center in (-q/2, q/2]
    return (((Math.round(centered / delta)) % p) + p) % p;
  });
}

/**
 * ADec — anamorphic decryption. Recovers mu_bar_vec using trapdoor tk (R).
 * Matches Go ADec(apk, tk, ask, act).
 *
 * Algorithm (from gadget matrix structure):
 *   c0 = [A_bar^T·s_hat + e0_bar | R^T·A_bar^T·s_hat + G^T·s_hat + e0_G]
 *   c0_diff = c0_G - R^T·c0_bar  ≈  G^T·s_hat   (errors cancel)
 *   G = I_n ⊗ [1,2,...,2^(k-1)], so G^T·s_hat block i = [s_hat[i], 2·s_hat[i], ...]
 *   Entry i*k (j=0 coefficient): c0_diff[i*k] ≈ s_hat[i]
 *   Recover: μ̄[i] = round(center(s_hat[i]) / Δ) mod p
 *
 * Error bound: ||R^T·e0_bar||_∞ ≈ √mBar ≈ 16  <<  Δ/2 = 3276  (λ=16)
 *   → rounding always correct at this security level.
 */
function _aDecCore(apk, tk, ct) {
  const { params }               = apk;
  const { q, p, k, n, mBar, delta } = params;
  const R = tk;

  // Split c0 into A_bar part and gadget part
  const c0_bar  = ct.c0.slice(0, mBar);      // length mBar
  const c0_G    = ct.c0.slice(mBar);         // length n*k

  // c0_diff = c0_G - R^T · c0_bar  ≈  G^T · s_hat
  const RT       = transpose(R);             // (n*k) × mBar
  const Rtc0bar  = mulVec(RT, c0_bar, q);
  const c0_diff  = c0_G.map((v, i) => ((v - Rtc0bar[i]) % q + q) % q);

  // Extract s_hat[i] from first entry (j=0) of each k-block, then decode μ̄[i]
  return Array.from({ length: n }, (_, i) => {
    const raw      = c0_diff[i * k];
    const centered = raw > q / 2 ? raw - q : raw;
    return (((Math.round(centered / delta)) % p) + p) % p;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5 — Hybrid encryption (DR seed → AES-256-GCM message)
//
// DR message space is Z_p^n (small integers).
// We sample a random seed vector, derive an AES key from it via SHA-256,
// and use AES-GCM to encrypt the actual string.
// This lets us encrypt messages of any length while keeping the LWE part small.
// ═══════════════════════════════════════════════════════════════════════════

/** Sample a random message vector in Z_p^n */
function sampleMsgVec(n, p) {
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  return Array.from(buf, v => v % p);
}

/**
 * Derive a 32-byte AES key from a Z_p^n vector.
 * Consistent encoding: vector → Uint8Array → SHA-256 → AES key.
 */
async function vecToAESKeyBytes(vec) {
  return sha256(new Uint8Array(vec)); // returns Uint8Array(32)
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6 — Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Encrypt (publicMsg, secretMsg?) under a friend's apk.
 *
 * With secret (full anamorphic):
 *   mu      ~ Z_p^n → K_pub = SHA-256(mu)    → AES-GCM(K_pub, publicMsg)
 *   mu_bar  ~ Z_p^n → K_sec = SHA-256(mu_bar) → AES-GCM(K_sec, secretMsg)
 *   DR ciphertext = AEnc(apk, mu, mu_bar) — both seeds in one LWE ciphertext.
 *
 * Public-only (secretMsg = null):
 *   mu ~ Z_p^n → K_pub = SHA-256(mu) → AES-GCM(K_pub, publicMsg)
 *   DR ciphertext = Enc(apk, mu)
 *
 * @param {object}      apk       — { params, A, U } (from server or own keys)
 * @param {string}      publicMsg
 * @param {string|null} secretMsg — null → public-only (still encrypted)
 * @returns {object} body — ready to JSON.stringify and send over WebSocket
 */
export async function drEncrypt(apk, publicMsg, secretMsg = null) {
  const { p, n } = apk.params;

  const mu       = sampleMsgVec(n, p);
  const kPubBytes = await vecToAESKeyBytes(mu);

  if (secretMsg !== null) {
    const mu_bar    = sampleMsgVec(n, p);
    const drCt      = _aEncCore(apk, mu, mu_bar);
    const kSecBytes = await vecToAESKeyBytes(mu_bar);

    return {
      scheme:     'dualregev',
      c0:         Array.from(drCt.c0),   // plain numbers — JSON-safe natively
      c1:         Array.from(drCt.c1),
      enc_public: await aesEncrypt(kPubBytes, publicMsg),
      enc_secret: await aesEncrypt(kSecBytes, secretMsg),
    };
  }

  const drCt = _encCore(apk, mu);
  return {
    scheme:     'dualregev',
    c0:         Array.from(drCt.c0),
    c1:         Array.from(drCt.c1),
    enc_public: await aesEncrypt(kPubBytes, publicMsg),
  };
}

/**
 * Decrypt the PUBLIC channel using ask (E — normal secret key).
 * Safe to perform under coercion.
 *
 * @param {object} apk  — { params, A, U }
 * @param {object} ask  — E matrix (m × n Int32Array[][])
 * @param {object} body — message body from drEncrypt
 * @returns {Promise<string>} decrypted public message
 */
export async function drDecryptPublic(apk, ask, body) {
  const mu        = _decCore(apk, ask, body);
  const kPubBytes = await vecToAESKeyBytes(mu);
  return aesDecrypt(kPubBytes, body.enc_public);
}

/**
 * Decrypt the SECRET channel using tk (R — trapdoor).
 * Returns null if no secret message present (public-only message).
 * Never call under coercion.
 *
 * @param {object} apk  — { params, A, U }
 * @param {object} tk   — R matrix (mBar × n*k Int32Array[][])
 * @param {object} body — message body from drEncrypt
 * @returns {Promise<string|null>} decrypted secret message or null
 */
export async function drDecryptSecret(apk, tk, body) {
  if (!body.enc_secret) return null;
  const mu_bar    = _aDecCore(apk, tk, body);
  const kSecBytes = await vecToAESKeyBytes(mu_bar);
  return aesDecrypt(kSecBytes, body.enc_secret);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7 — Key management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a new anamorphic Dual Regev keypair.
 * Stores in session memory AND triggers browser download of key file.
 *
 * @param {string} username — included in key file metadata
 * @param {number} lambda   — 16 dev / 32 balanced / 64 prod
 * @returns {{ ask, apk, tk }}
 */
export async function drGenerateAndSave(username, lambda = 16) {
  console.log(`[DualRegev] Generating keys (λ=${lambda}, n=${lambda}, m=${lambda * 32})...`);
  const t0   = performance.now();
  const keys = drAGen(lambda);
  console.log(`[DualRegev] AGen complete in ${((performance.now() - t0) / 1000).toFixed(2)}s`);

  setDRSession(keys);
  _downloadKeyFile(username, lambda, keys);
  return keys;
}

/**
 * Load keys from a File object chosen by the user.
 * Validates structure, stores in session memory.
 * Throws a descriptive Error if the file is invalid.
 *
 * @param {File} file — the username_dr_keys.json file
 * @returns {{ ask, apk, tk }}
 */
export async function drLoadFromFile(file) {
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error('Key file is not valid JSON');
  }

  if (!raw.ask || !raw.apk || !raw.tk)
    throw new Error('Key file is missing required DR fields (ask, apk, tk)');

  const keys = drDeserializeKeys(raw);

  // Sanity check — verify params look correct
  if (!keys.apk?.params?.q || !keys.apk?.params?.n)
    throw new Error('Key file has invalid DR parameters');

  setDRSession(keys);
  console.log('[DualRegev] Keys loaded from file ✓');
  return keys;
}

// ── Public-key upload/fetch helpers ────────────────────────────────────────

/**
 * Returns the public key (apk only — ask and tk stay private) serialized
 * for uploading to POST /keys/upsert.
 *
 * Usage:
 *   const pubkey = { dualregev: getDRPublicKeyForUpload() };
 *   await fetch('/keys/upsert', { body: JSON.stringify({ pubkey }) });
 */
export function getDRPublicKeyForUpload() {
  if (!_session) return null;
  return drSerializePublicKey(_session.apk);
}

/**
 * Deserialize a friend's public key received from GET /keys/get/:username.
 * Returns a usable apk object for drEncrypt.
 *
 * Usage:
 *   const data = await fetch('/keys/get/username').then(r => r.json());
 *   const friendApk = drParseFriendPubkey(data.pubkey.dualregev);
 */
export function drParseFriendPubkey(raw) {
  if (!raw) throw new Error('No Dual Regev public key provided');
  return drDeserializePublicKey(raw);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8 — Serialization / deserialization
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Serialize the full key set { ask, apk, tk } to a plain JSON-safe object.
 * Uses compact 2-bytes-per-cell binary encoding for matrices (10× smaller than JSON).
 */
export function drSerializeKeys({ ask, apk, tk }) {
  return {
    ask: encodeMatrix(ask),
    tk:  encodeMatrix(tk),
    apk: {
      params: { ...apk.params },   // all Number — natively JSON-safe
      A:      encodeMatrix(apk.A),
      U:      encodeMatrix(apk.U),
    },
  };
}

/**
 * Restore a full key set from a serialized (JSON-parsed) object.
 */
export function drDeserializeKeys(raw) {
  return {
    ask: decodeMatrix(raw.ask),
    tk:  decodeMatrix(raw.tk),
    apk: {
      params: { ...raw.apk.params },
      A:      decodeMatrix(raw.apk.A),
      U:      decodeMatrix(raw.apk.U),
    },
  };
}

/**
 * Serialize only the PUBLIC part of apk.
 * This is what goes to the server — ask and tk never leave the device.
 */
export function drSerializePublicKey(apk) {
  return {
    params: { ...apk.params },
    A:      encodeMatrix(apk.A),
    U:      encodeMatrix(apk.U),
  };
}

/**
 * Restore a public key from a serialized (JSON-parsed) object.
 */
export function drDeserializePublicKey(raw) {
  return {
    params: { ...raw.params },
    A:      decodeMatrix(raw.A),
    U:      decodeMatrix(raw.U),
  };
}

// ─── Internal: key-file download ──────────────────────────────────────────

function _downloadKeyFile(username, lambda, keys) {
  const content = JSON.stringify({
    username,
    scheme:     'dualregev',
    created_at: new Date().toISOString(),
    lambda,
    ...drSerializeKeys(keys),
  }, null, 2);

  const blob = new Blob([content], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `${username}_dr_keys.json`,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log(`[DualRegev] Key file downloaded: ${username}_dr_keys.json`);
}
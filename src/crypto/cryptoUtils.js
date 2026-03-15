/**
 * cryptoUtils.js
 *
 * Math primitives and serialization helpers needed for ElGamal.
 * All random operations use window.crypto — cryptographically secure.
 * BigInt is used throughout for large-number arithmetic.
 */

// ─── Math ──────────────────────────────────────────────────────────────────

/**
 * Modular exponentiation: base^exp mod mod
 * Equivalent to Python's built-in pow(base, exp, mod)
 */
export function powMod(base, exp, mod) {
  base = BigInt(base);
  exp  = BigInt(exp);
  mod  = BigInt(mod);
  if (mod === 1n) return 0n;
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

/**
 * Modular multiplicative inverse: a^-1 mod m
 * Equivalent to PyCryptodome's number.inverse(a, m)
 * Uses the extended Euclidean algorithm.
 */
export function modInverse(a, m) {
  a = ((BigInt(a) % BigInt(m)) + BigInt(m)) % BigInt(m);
  m = BigInt(m);
  let [old_r, r] = [a, m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  if (old_r !== 1n) throw new Error('Modular inverse does not exist');
  return ((old_s % m) + m) % m;
}

/**
 * Cryptographically random BigInt in [min, max] inclusive.
 * Uses rejection sampling to avoid bias.
 */
export function randomBigIntInRange(min, max) {
  min = BigInt(min);
  max = BigInt(max);
  const range = max - min + 1n;
  const bits  = BigInt(range.toString(2).length);
  const bytes = Number((bits + 7n) / 8n);
  const mask  = (1n << bits) - 1n;
  while (true) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    let val = 0n;
    for (const b of arr) val = (val << 8n) | BigInt(b);
    val &= mask;
    if (val < range) return min + val;
    // retry on rare bias (< 50% chance per iteration)
  }
}

/**
 * Miller-Rabin primality test.
 * 20 rounds gives a false-positive probability of at most 4^-20 ≈ 10^-12.
 */
function millerRabin(n, rounds = 20) {
  if (n < 2n) return false;
  if (n === 2n || n === 3n) return true;
  if (n % 2n === 0n) return false;

  // write n-1 as 2^r * d
  let d = n - 1n;
  let r = 0n;
  while (d % 2n === 0n) { d /= 2n; r++; }

  outer: for (let i = 0; i < rounds; i++) {
    const a = randomBigIntInRange(2n, n - 2n);
    let x = powMod(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let j = 0n; j < r - 1n; j++) {
      x = powMod(x, 2n, n);
      if (x === n - 1n) continue outer;
    }
    return false;
  }
  return true;
}

/**
 * Generate a random prime of exactly `bits` bits.
 * Equivalent to PyCryptodome's number.getPrime(bits).
 * ⚠ 2048-bit key generation takes ~2–5 seconds in the browser.
 *   Use 512 bits during development, 2048 in production.
 */
export async function generatePrime(bits) {
  const byteLen = Math.ceil(bits / 8);
  while (true) {
    const arr = new Uint8Array(byteLen);
    crypto.getRandomValues(arr);
    arr[0]           |= 0x80; // set top bit → correct bit length
    arr[byteLen - 1] |= 0x01; // set bottom bit → odd number
    let p = 0n;
    for (const b of arr) p = (p << 8n) | BigInt(b);
    if (millerRabin(p)) return p;
  }
}

// ─── Hashing ───────────────────────────────────────────────────────────────

/**
 * SHA-256 hash. Returns Uint8Array (32 bytes).
 * Equivalent to Python's hashlib.sha256(data).digest()
 */
export async function sha256(data) {
  let bytes;
  if (typeof data === 'string')       bytes = new TextEncoder().encode(data);
  else if (data instanceof Uint8Array) bytes = data;
  else                                 bytes = new TextEncoder().encode(String(data));
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(buf);
}

// ─── Random bytes ──────────────────────────────────────────────────────────

/**
 * Cryptographically random byte array of given length.
 * Equivalent to PyCryptodome's get_random_bytes(length).
 */
export function randomBytes(length) {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return arr;
}

// ─── Serialization ─────────────────────────────────────────────────────────
//
// JSON cannot represent BigInt or Uint8Array natively.
// jsonSafe()    → converts them to tagged plain objects safe for JSON.stringify
// jsonRestore() → converts them back after JSON.parse
//
// BigInt   → { __bigint__: "hexstring" }
// Uint8Array → { __bytes__: "base64string" }

function uint8ToBase64(arr) {
  // Iterate instead of spread to avoid call-stack limits on large arrays
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

function base64ToUint8(b64) {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

export function jsonSafe(obj) {
  if (typeof obj === 'bigint')         return { __bigint__: obj.toString(16) };
  if (obj instanceof Uint8Array)       return { __bytes__: uint8ToBase64(obj) };
  if (Array.isArray(obj))              return obj.map(jsonSafe);
  if (obj !== null && typeof obj === 'object')
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, jsonSafe(v)]));
  return obj;
}

export function jsonRestore(obj) {
  if (Array.isArray(obj)) return obj.map(jsonRestore);
  if (obj !== null && typeof obj === 'object') {
    if ('__bigint__' in obj) return BigInt('0x' + obj.__bigint__);
    if ('__bytes__'  in obj) return base64ToUint8(obj.__bytes__);
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, jsonRestore(v)]));
  }
  return obj;
}
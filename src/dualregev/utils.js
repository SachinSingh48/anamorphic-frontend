/**
 * src/dualregev/utils.js
 *
 * Standalone utilities for the Dual Regev module.
 * No imports from src/crypto/ — this folder is fully self-contained.
 */

// ─── SHA-256 ───────────────────────────────────────────────────────────────

/**
 * SHA-256 hash using the browser's built-in Web Crypto API.
 * Returns Uint8Array (32 bytes).
 */
export async function sha256(data) {
  let bytes;
  if (typeof data === 'string')        bytes = new TextEncoder().encode(data);
  else if (data instanceof Uint8Array) bytes = data;
  else                                 bytes = new TextEncoder().encode(String(data));
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(buf);
}

// ─── AES-256-GCM ──────────────────────────────────────────────────────────

/**
 * Import a 32-byte key for AES-GCM.
 * @param {Uint8Array} keyBytes — 32 bytes
 * @param {'encrypt'|'decrypt'} usage
 */
async function importAESKey(keyBytes, usage) {
  return crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, [usage],
  );
}

/**
 * AES-256-GCM encrypt a string.
 * Returns base64( iv[12] || ciphertext+tag ).
 */
export async function aesEncrypt(keyBytes, plaintext) {
  const iv  = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await importAESKey(keyBytes, 'encrypt');
  const enc = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const out = new Uint8Array(12 + enc.byteLength);
  out.set(iv);
  out.set(new Uint8Array(enc), 12);
  return _toBase64(out);
}

/**
 * AES-256-GCM decrypt a base64 string.
 * Expects base64( iv[12] || ciphertext+tag ).
 */
export async function aesDecrypt(keyBytes, b64) {
  const buf = _fromBase64(b64);
  const key = await importAESKey(keyBytes, 'decrypt');
  const dec = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: buf.slice(0, 12) },
    key,
    buf.slice(12),
  );
  return new TextDecoder().decode(dec);
}

// ─── Base64 helpers ────────────────────────────────────────────────────────

function _toBase64(arr) {
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin);
}

function _fromBase64(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// ─── Compact matrix serialization (2 bytes / cell, little-endian) ─────────
//
// All DR matrix entries are in [0, q-1] = [0, 32767] → fit in 15 bits → 2 bytes.
// For n=16: A(16×512)+U(16×16)+E(512×16)+R(272×240) ≈ 162 KB
// vs ~1.6 MB with JSON string representation.  ~10× smaller.

/**
 * Encode an Int32Array[][] matrix to a compact base64 string.
 */
export function encodeMatrix(M) {
  const rows = M.length, cols = M[0].length;
  const buf  = new Uint8Array(4 + rows * cols * 2);
  buf[0] = rows & 0xFF;        buf[1] = (rows >> 8) & 0xFF;
  buf[2] = cols & 0xFF;        buf[3] = (cols >> 8) & 0xFF;
  let idx = 4;
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      buf[idx++] = M[i][j] & 0xFF;
      buf[idx++] = (M[i][j] >> 8) & 0xFF;
    }
  return _toBase64(buf);
}

/**
 * Decode a compact base64 string back to an Int32Array[][] matrix.
 */
export function decodeMatrix(b64) {
  const buf  = _fromBase64(b64);
  const rows = buf[0] | (buf[1] << 8);
  const cols = buf[2] | (buf[3] << 8);
  const M    = Array.from({ length: rows }, () => new Int32Array(cols));
  let   idx  = 4;
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      M[i][j] = buf[idx] | (buf[idx + 1] << 8);
      idx += 2;
    }
  return M;
}

// Password hasher seam (ADR-0009): Node's built-in `crypto.scrypt` (no native build, keeps
// ADR-0001's zero-build stack) sits behind this small hash/verify interface so the algorithm
// can be swapped later (e.g. argon2) without touching call sites (auth-service, seed
// scripts).
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const ALGO_TAG = 'scrypt';
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

// Fixed dummy salt/key used only when there is no stored hash to compare against, so
// `verify()` always performs a scrypt derivation of comparable cost either way (Ledger #14:
// "identical response + timing for both" wrong-password and unknown-email cases).
const DUMMY_SALT = Buffer.alloc(SALT_BYTES, 0);
const DUMMY_KEY = Buffer.alloc(KEY_LENGTH, 0);

/**
 * @param {string} password plaintext password
 * @returns {Promise<string>} an encoded string: `scrypt:<salt-base64>:<key-base64>`
 */
async function hash(password) {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await scryptAsync(String(password), salt, KEY_LENGTH);
  return `${ALGO_TAG}:${salt.toString('base64')}:${derivedKey.toString('base64')}`;
}

/**
 * @param {string} password plaintext password supplied at sign-in
 * @param {string|null|undefined} storedHash the encoded hash from `members.password_hash`
 *   (may be null for OAuth-only members, or absent entirely for an unknown email — Ledger #19).
 * @returns {Promise<boolean>}
 */
async function verify(password, storedHash) {
  let salt = DUMMY_SALT;
  let expectedKey = DUMMY_KEY;
  let comparable = false;

  if (storedHash) {
    const parts = String(storedHash).split(':');
    if (parts.length === 3 && parts[0] === ALGO_TAG) {
      salt = Buffer.from(parts[1], 'base64');
      expectedKey = Buffer.from(parts[2], 'base64');
      comparable = true;
    }
  }

  const derivedKey = await scryptAsync(String(password), salt, expectedKey.length);
  const matches = derivedKey.length === expectedKey.length && timingSafeEqual(derivedKey, expectedKey);
  return comparable && matches;
}

export default { hash, verify };

// Opaque, random session bearer token (ADR-0009, Ledger #29). Session cookies MUST carry a
// random token, never the sequential `sessions.id` bigint identity column, so a guessed or
// enumerated id can never be replayed as a session.
import { randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32; // 256 bits, well over ADR-0009's ">=128 bits" floor.

export function generateSessionToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

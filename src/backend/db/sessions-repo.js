// `sessions` repository (ADR-0004, ADR-0009). `token` (added by the
// add-token-to-sessions-table migration, Ledger #29) is the opaque bearer credential the
// session cookie carries — the sequential `id` is never used as the cookie value.
import pool from './pool.js';

export async function insertSession({ memberId, token, expiresAt }, client = pool) {
  const result = await client.query(
    'INSERT INTO sessions (member_id, token, expires_at) VALUES ($1, $2, $3) RETURNING id, member_id, token, created_at, expires_at',
    [memberId, token, expiresAt]
  );
  return result.rows[0];
}

// Only a non-expired session resolves (ADR-0009: "expires_at > now() UTC ... expired/absent
// -> treated as unauthenticated").
export async function findActiveSessionByToken(token, client = pool) {
  if (!token) return null;
  const result = await client.query(
    'SELECT id, member_id, created_at, expires_at FROM sessions WHERE token = $1 AND expires_at > now()',
    [token]
  );
  return result.rows[0] || null;
}

export default { insertSession, findActiveSessionByToken };

// `links` repository (ADR-0004: repositories are the only callers of the pg Pool). All
// queries are parameterized SQL — no string interpolation of user input.
import pool from './pool.js';

// Postgres unique-violation code (ADR-0010): a colliding `code` bounces back to the caller so
// T015's create flow can retry with a fresh candidate instead of pre-checking (TOCTOU-safe).
export const UNIQUE_VIOLATION = '23505';

/**
 * Inserts a new link row. Throws the raw `pg` error (with `.code === UNIQUE_VIOLATION` on a
 * `code` collision) so the caller (T015) can decide whether to retry; this repository never
 * catches or reinterprets DB errors itself (ADR-0004 keeps the repo thin).
 * @param {{ memberId: number|string, code: string, longUrl: string }} params
 * @param {import('pg').PoolClient|import('pg').Pool} [client]
 */
export async function insertLink({ memberId, code, longUrl }, client = pool) {
  const result = await client.query(
    'INSERT INTO links (member_id, code, long_url) VALUES ($1, $2, $3) ' +
      'RETURNING id, member_id, code, long_url, created_at',
    [memberId, code, longUrl]
  );
  return result.rows[0];
}

/**
 * Looks up an ACTIVE (non-soft-deleted) link by its short code (T018, AC-9/AC-11/AC-23,
 * ADR-0012). The `deleted_at IS NULL` filter is centralized here so no caller can
 * accidentally surface a soft-deleted link — a missing or soft-deleted code both resolve to
 * `null`, which callers map to the same 404 (no existence disclosure, ADR-0008).
 * @param {string} code
 * @param {import('pg').PoolClient|import('pg').Pool} [client]
 * @returns {Promise<{id, member_id, code, long_url, created_at}|null>}
 */
export async function findActiveByCode(code, client = pool) {
  const result = await client.query(
    'SELECT id, member_id, code, long_url, created_at FROM links WHERE code = $1 AND deleted_at IS NULL',
    [code]
  );
  return result.rows[0] || null;
}

/**
 * Lists an ACTIVE (non-soft-deleted) member's own links, newest-first, with each link's
 * total click count aggregated from `click_events` (T021/T022, AC-17, AC-18, AC-21, AC-23,
 * AC-3, AC-14, ADR-0011, ADR-0012). Scoped strictly by `member_id` so a caller can never see
 * another member's links or counts (AC-3) — there is no code/id-based lookup here for a
 * caller to guess against.
 *
 * A `LEFT JOIN` (not an inner join) means a link with zero click_events still returns a row
 * with `click_count = 0` (AC-21), never being dropped or returning null.
 *
 * `limit` is passed as `pageSize + 1` by the caller (T023) so the service can detect
 * `has_next` without a second COUNT query.
 * @param {{ memberId: number|string, limit: number, offset: number }} params
 * @param {import('pg').PoolClient|import('pg').Pool} [client]
 * @returns {Promise<Array<{id, code, long_url, created_at, click_count: number}>>}
 */
export async function findActiveByMemberIdPaginated({ memberId, limit, offset }, client = pool) {
  const result = await client.query(
    'SELECT l.id, l.code, l.long_url, l.created_at, COUNT(ce.id)::int AS click_count ' +
      'FROM links l LEFT JOIN click_events ce ON ce.link_id = l.id ' +
      'WHERE l.member_id = $1 AND l.deleted_at IS NULL ' +
      'GROUP BY l.id ' +
      'ORDER BY l.created_at DESC ' +
      'LIMIT $2 OFFSET $3',
    [memberId, limit, offset]
  );
  return result.rows;
}

export default { insertLink, findActiveByCode, findActiveByMemberIdPaginated, UNIQUE_VIOLATION };

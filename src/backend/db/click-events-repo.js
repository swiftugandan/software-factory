// `click_events` repository (ADR-0004: repositories are the only callers of the pg Pool;
// ADR-0011: append-only, one row per successful redirect — no counter column). All queries
// are parameterized SQL.
import pool from './pool.js';

/**
 * Inserts one click-event row for `linkId`. `created_at` defaults to `now()` (timestamptz
 * UTC, T008) — one row per call, never a read-increment-write (AC-13, AC-14, WF-3).
 * @param {{ linkId: number|string }} params
 * @param {import('pg').PoolClient|import('pg').Pool} [client]
 */
export async function insertClickEvent({ linkId }, client = pool) {
  const result = await client.query(
    'INSERT INTO click_events (link_id) VALUES ($1) RETURNING id, link_id, created_at',
    [linkId]
  );
  return result.rows[0];
}

export default { insertClickEvent };

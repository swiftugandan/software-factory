// `members` repository (ADR-0004: repositories are the only callers of the pg Pool). All
// queries are parameterized SQL — no string interpolation of user input.
import pool from './pool.js';

export async function findByEmail(email, client = pool) {
  if (!email) return null;
  const result = await client.query(
    'SELECT id, email, password_hash, created_at FROM members WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
}

export async function findById(id, client = pool) {
  if (!id) return null;
  const result = await client.query(
    'SELECT id, email, password_hash, created_at FROM members WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function insertMember({ email, passwordHash = null }, client = pool) {
  const result = await client.query(
    'INSERT INTO members (email, password_hash) VALUES ($1, $2) RETURNING id, email, password_hash, created_at',
    [email, passwordHash]
  );
  return result.rows[0];
}

export default { findByEmail, findById, insertMember };

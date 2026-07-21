// Integration tests for T010 `POST /auth/sign-in` (AC-2, Ledger #14) against real Postgres
// (ADR-0007). Each test creates and cleans up its own member/session rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import createApp from '../../src/backend/http/app.js';
import pool from '../../src/backend/db/pool.js';
import passwordHasher from '../../src/backend/lib/password-hasher.js';
import { SESSION_COOKIE_NAME } from '../../src/backend/services/session-service.js';

async function createTestMember(email, password) {
  const passwordHash = await passwordHasher.hash(password);
  const result = await pool.query(
    'INSERT INTO members (email, password_hash) VALUES ($1, $2) RETURNING id',
    [email, passwordHash]
  );
  return result.rows[0].id;
}

async function cleanupMember(memberId) {
  await pool.query('DELETE FROM sessions WHERE member_id = $1', [memberId]);
  await pool.query('DELETE FROM members WHERE id = $1', [memberId]);
}

async function sessionCount(memberId) {
  const result = await pool.query('SELECT count(*)::int AS n FROM sessions WHERE member_id = $1', [memberId]);
  return result.rows[0].n;
}

test('POST /auth/sign-in (AC-2): correct email/password issues a session cookie and creates a sessions row', async () => {
  const email = `sign-in-ok-${Date.now()}@example.com`;
  const password = 'correct horse battery staple';
  const memberId = await createTestMember(email, password);
  const app = createApp();

  try {
    const response = await request(app).post('/auth/sign-in').send({ email, password });

    assert.equal(response.status, 200);
    assert.equal(response.body.member.email, email);

    const setCookieHeader = response.headers['set-cookie'] || [];
    const sessionCookie = setCookieHeader.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    assert.ok(sessionCookie, 'expected a session cookie to be set');
    assert.match(sessionCookie, /HttpOnly/i);

    // Ledger #29: the cookie value must be a random opaque token, not the sequential member id.
    const cookieValue = sessionCookie.split(';')[0].split('=')[1];
    assert.notEqual(cookieValue, String(memberId));
    assert.ok(cookieValue.length >= 40);

    assert.equal(await sessionCount(memberId), 1);
  } finally {
    await cleanupMember(memberId);
  }
});

test('POST /auth/sign-in (AC-2, Ledger #14): wrong password returns a generic 401 error and creates no session', async () => {
  const email = `sign-in-wrong-pw-${Date.now()}@example.com`;
  const memberId = await createTestMember(email, 'the-real-password');
  const app = createApp();

  try {
    const response = await request(app).post('/auth/sign-in').send({ email, password: 'not-the-password' });

    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'unauthenticated');
    assert.equal(response.body.error.message, 'invalid email or password');
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(await sessionCount(memberId), 0);
  } finally {
    await cleanupMember(memberId);
  }
});

test('POST /auth/sign-in (AC-2, Ledger #14): unknown email returns the identical generic error (no account enumeration)', async () => {
  const app = createApp();

  const response = await request(app)
    .post('/auth/sign-in')
    .send({ email: `does-not-exist-${Date.now()}@example.com`, password: 'whatever' });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: { code: 'unauthenticated', message: 'invalid email or password' } });
  assert.equal(response.headers['set-cookie'], undefined);
});

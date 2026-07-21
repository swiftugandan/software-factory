// Integration test for T012 (AC-1): requests without a valid session to an auth-required
// endpoint get HTTP 401 and the protected handler never runs (no create/read of link data).
// A minimal protected route stands in for the link-creation/link-list endpoints, which are
// built in later tasks (T013+); it exercises the real requireAuth + resolveCurrentMember +
// error-handler stack against real Postgres (ADR-0007), the same stack later routers reuse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

import resolveCurrentMember from '../../src/backend/http/middleware/resolve-current-member.js';
import requireAuth from '../../src/backend/http/middleware/require-auth.js';
import errorHandler from '../../src/backend/http/error-handler.js';
import { issueSession, SESSION_COOKIE_NAME } from '../../src/backend/services/session-service.js';
import pool from '../../src/backend/db/pool.js';

function buildProtectedApp(sideEffect) {
  const app = express();
  app.use(resolveCurrentMember());
  app.get('/protected-links', requireAuth, (req, res) => {
    sideEffect.handlerCalled = true;
    res.status(200).json({ links: [], memberId: req.member.id });
  });
  app.use(errorHandler);
  return app;
}

async function createTestMember(email) {
  const result = await pool.query(
    'INSERT INTO members (email, password_hash) VALUES ($1, NULL) RETURNING id',
    [email]
  );
  return result.rows[0].id;
}

async function cleanupMember(memberId) {
  await pool.query('DELETE FROM sessions WHERE member_id = $1', [memberId]);
  await pool.query('DELETE FROM members WHERE id = $1', [memberId]);
}

test('requireAuth integration (AC-1): a request with no session cookie gets 401 and never reaches the handler', async () => {
  const sideEffect = { handlerCalled: false };
  const app = buildProtectedApp(sideEffect);

  const response = await request(app).get('/protected-links');

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'unauthenticated');
  assert.equal(sideEffect.handlerCalled, false);
});

test('requireAuth integration (AC-1): an expired session is treated as unauthenticated (401, handler not invoked)', async () => {
  const email = `require-auth-expired-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const token = 'expired-token-for-test';
  await pool.query(
    "INSERT INTO sessions (member_id, token, expires_at) VALUES ($1, $2, now() - interval '1 hour')",
    [memberId, token]
  );

  const sideEffect = { handlerCalled: false };
  const app = buildProtectedApp(sideEffect);

  try {
    const response = await request(app).get('/protected-links').set('Cookie', `${SESSION_COOKIE_NAME}=${token}`);

    assert.equal(response.status, 401);
    assert.equal(sideEffect.handlerCalled, false);
  } finally {
    await cleanupMember(memberId);
  }
});

test('requireAuth integration (AC-2): a request with a valid session cookie reaches the handler, scoped to that member', async () => {
  const email = `require-auth-valid-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);

  const sideEffect = { handlerCalled: false };
  const app = buildProtectedApp(sideEffect);

  // Issue a session the same way T009's session-service does, against a throwaway response.
  let issuedToken;
  const fakeRes = { cookie: (name, value) => { issuedToken = value; } };
  await issueSession(fakeRes, memberId);

  try {
    const response = await request(app)
      .get('/protected-links')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${issuedToken}`);

    assert.equal(response.status, 200);
    assert.equal(sideEffect.handlerCalled, true);
    assert.equal(response.body.memberId, memberId);
  } finally {
    await cleanupMember(memberId);
  }
});

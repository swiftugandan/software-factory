// Integration tests for T015/T016 `POST /links` (AC-4, AC-6, AC-7, AC-8) against real Postgres
// (ADR-0007). Each test creates and cleans up its own member/session/link rows; tests run
// serially (`--test-concurrency=1`, package.json) so cleanup between tests is safe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import createApp from '../../src/backend/http/app.js';
import { createLinksService } from '../../src/backend/services/links-service.js';
import pool from '../../src/backend/db/pool.js';
import { issueSession, SESSION_COOKIE_NAME } from '../../src/backend/services/session-service.js';
import appConfig from '../../config/app.js';

async function createTestMember(email) {
  const result = await pool.query('INSERT INTO members (email, password_hash) VALUES ($1, NULL) RETURNING id', [
    email,
  ]);
  return result.rows[0].id;
}

async function issueTestSession(memberId) {
  let token;
  const fakeRes = { cookie: (name, value) => { token = value; } };
  await issueSession(fakeRes, memberId);
  return token;
}

async function cleanupMember(memberId) {
  await pool.query('DELETE FROM links WHERE member_id = $1', [memberId]);
  await pool.query('DELETE FROM sessions WHERE member_id = $1', [memberId]);
  await pool.query('DELETE FROM members WHERE id = $1', [memberId]);
}

async function linksForMember(memberId) {
  const result = await pool.query('SELECT id, code, long_url, created_at FROM links WHERE member_id = $1', [
    memberId,
  ]);
  return result.rows;
}

test('POST /links (AC-4): creates a 7-character base62 code and persists it for the member', async () => {
  const email = `links-create-ac4-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();

  try {
    const response = await request(app)
      .post('/links')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`)
      .send({ longUrl: 'https://example.com/ac4' });

    assert.equal(response.status, 201);
    assert.match(response.body.code, /^[0-9A-Za-z]{7}$/);

    const rows = await linksForMember(memberId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].code, response.body.code);
  } finally {
    await cleanupMember(memberId);
  }
});

test('POST /links (AC-8, AC-22): 201 body has code, short_url, long_url, and a UTC ISO created_at', async () => {
  const email = `links-create-ac8-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();
  const submittedUrl = 'https://example.com/ac8?x=1';

  try {
    const response = await request(app)
      .post('/links')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`)
      .send({ longUrl: submittedUrl });

    assert.equal(response.status, 201);
    assert.equal(response.body.long_url, submittedUrl);
    assert.equal(response.body.short_url, `${appConfig.shortLinkBaseUrl}/${response.body.code}`);
    assert.match(response.body.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const rows = await linksForMember(memberId);
    assert.equal(new Date(rows[0].created_at).toISOString(), response.body.created_at);
  } finally {
    await cleanupMember(memberId);
  }
});

test('POST /links (AC-7): submitting the same long URL twice yields two distinct links', async () => {
  const email = `links-create-ac7-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();
  const sameUrl = 'https://example.com/ac7-repeat';

  try {
    const first = await request(app)
      .post('/links')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`)
      .send({ longUrl: sameUrl });
    const second = await request(app)
      .post('/links')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`)
      .send({ longUrl: sameUrl });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.notEqual(first.body.code, second.body.code);

    const rows = await linksForMember(memberId);
    assert.equal(rows.length, 2);
  } finally {
    await cleanupMember(memberId);
  }
});

test('POST /links (AC-6): a colliding candidate code is retried until a unique code is stored', async () => {
  const email = `links-create-ac6-retry-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const collidingCode = 'AAAAAAA';

  // Seed an existing row occupying the code the stub generator will offer first (AC-6:
  // "given a generated candidate code that collides with an existing code").
  await pool.query(
    'INSERT INTO links (member_id, code, long_url) VALUES ($1, $2, $3)',
    [memberId, collidingCode, 'https://example.com/seed']
  );

  let calls = 0;
  const stubGenerateCode = () => {
    calls += 1;
    return calls === 1 ? collidingCode : 'BCDEFGH';
  };
  const linksService = createLinksService({ generateCode: stubGenerateCode });
  const app = createApp({ linksService });

  try {
    const response = await request(app)
      .post('/links')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`)
      .send({ longUrl: 'https://example.com/ac6-retry' });

    assert.equal(response.status, 201);
    assert.equal(response.body.code, 'BCDEFGH');
    assert.ok(calls >= 2, 'expected the generator to be called again after the collision');

    const rows = await linksForMember(memberId);
    // The seeded row plus exactly one successfully-inserted row: the colliding attempt never
    // persisted (unique constraint, T007, is the source of truth — no partial row on 23505).
    assert.equal(rows.length, 2);
  } finally {
    await cleanupMember(memberId);
  }
});

test('POST /links (AC-6, Ledger #12): exhausting the retry budget returns 503 and persists no row', async () => {
  const email = `links-create-ac6-exhausted-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const collidingCode = 'ZZZZZZZ';

  await pool.query(
    'INSERT INTO links (member_id, code, long_url) VALUES ($1, $2, $3)',
    [memberId, collidingCode, 'https://example.com/seed-exhausted']
  );

  const linksService = createLinksService({
    generateCode: () => collidingCode,
    linkGenerationConfig: { retryMax: 3 },
  });
  const app = createApp({ linksService });

  try {
    const response = await request(app)
      .post('/links')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`)
      .send({ longUrl: 'https://example.com/ac6-exhausted' });

    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'retry_exhausted');

    const rows = await linksForMember(memberId);
    // Only the seeded row remains; the exhausted create persisted nothing.
    assert.equal(rows.length, 1);
  } finally {
    await cleanupMember(memberId);
  }
});

test('POST /links (AC-5): an invalid URL returns 422 and creates no link', async () => {
  const email = `links-create-ac5-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();

  try {
    const response = await request(app)
      .post('/links')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`)
      .send({ longUrl: 'not-an-absolute-url' });

    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'validation_error');

    const rows = await linksForMember(memberId);
    assert.equal(rows.length, 0);
  } finally {
    await cleanupMember(memberId);
  }
});

test('POST /links (AC-1): an unauthenticated request gets 401 and creates no link', async () => {
  const app = createApp();

  const response = await request(app).post('/links').send({ longUrl: 'https://example.com/no-auth' });

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'unauthenticated');
});

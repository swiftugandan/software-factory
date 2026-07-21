// Integration tests for T021-T023 `GET /links` (AC-17, AC-18, AC-19, AC-20, AC-21, AC-23,
// AC-3, AC-14) against real Postgres (ADR-0004, ADR-0007). Each test creates and cleans up
// its own member/session/link/click rows; tests run serially (`--test-concurrency=1`,
// package.json) so cleanup between tests is safe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import createApp from '../../src/backend/http/app.js';
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

/**
 * Inserts a link with an explicit `created_at` so ordering (AC-18) and pagination (AC-19)
 * can be asserted deterministically instead of depending on `now()` ties.
 */
async function createTestLink({ memberId, code, longUrl, createdAt, deleted = false }) {
  const result = await pool.query(
    'INSERT INTO links (member_id, code, long_url, created_at, deleted_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [memberId, code, longUrl, createdAt || new Date(), deleted ? new Date() : null]
  );
  return result.rows[0].id;
}

async function insertClickEvents(linkId, count) {
  for (let i = 0; i < count; i += 1) {
    await pool.query('INSERT INTO click_events (link_id) VALUES ($1)', [linkId]);
  }
}

function codeFor(prefix, n) {
  // 7-char base62-shaped codes, unique per test run.
  return `${prefix}${String(n).padStart(6 - prefix.length, '0')}`;
}

async function cleanupMember(memberId) {
  await pool.query('DELETE FROM click_events WHERE link_id IN (SELECT id FROM links WHERE member_id = $1)', [
    memberId,
  ]);
  await pool.query('DELETE FROM links WHERE member_id = $1', [memberId]);
  await pool.query('DELETE FROM sessions WHERE member_id = $1', [memberId]);
  await pool.query('DELETE FROM members WHERE id = $1', [memberId]);
}

test('GET /links (AC-17, AC-21, AC-14): returns the requester\'s own links with fields and aggregated click counts', async () => {
  const email = `links-list-ac17-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();

  const zeroClickLinkId = await createTestLink({
    memberId,
    code: codeFor('A17', 1),
    longUrl: 'https://example.com/ac17-zero',
  });
  const threeClickLinkId = await createTestLink({
    memberId,
    code: codeFor('A17', 2),
    longUrl: 'https://example.com/ac17-three',
  });
  await insertClickEvents(threeClickLinkId, 3);

  try {
    const response = await request(app).get('/links').set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.links.length, 2);

    const zeroClickBody = response.body.links.find((l) => l.code === codeFor('A17', 1));
    const threeClickBody = response.body.links.find((l) => l.code === codeFor('A17', 2));

    // AC-17: short code, short_url, long_url, created_at all present and correct.
    assert.equal(zeroClickBody.short_url, `${appConfig.shortLinkBaseUrl}/${codeFor('A17', 1)}`);
    assert.equal(zeroClickBody.long_url, 'https://example.com/ac17-zero');
    assert.match(zeroClickBody.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // AC-21: zero clicks renders as the number 0, never null.
    assert.equal(zeroClickBody.click_count, 0);
    assert.notEqual(zeroClickBody.click_count, null);

    // AC-14: a link's total equals the number of click_events rows recorded for it.
    assert.equal(threeClickBody.click_count, 3);
    void zeroClickLinkId;
  } finally {
    await cleanupMember(memberId);
  }
});

test('GET /links (AC-18): results are ordered by created_at descending (newest first)', async () => {
  const email = `links-list-ac18-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();

  const base = Date.now();
  await createTestLink({
    memberId,
    code: codeFor('A18', 1),
    longUrl: 'https://example.com/ac18-oldest',
    createdAt: new Date(base - 20000),
  });
  await createTestLink({
    memberId,
    code: codeFor('A18', 2),
    longUrl: 'https://example.com/ac18-middle',
    createdAt: new Date(base - 10000),
  });
  await createTestLink({
    memberId,
    code: codeFor('A18', 3),
    longUrl: 'https://example.com/ac18-newest',
    createdAt: new Date(base),
  });

  try {
    const response = await request(app).get('/links').set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`);

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.links.map((l) => l.code),
      [codeFor('A18', 3), codeFor('A18', 2), codeFor('A18', 1)]
    );
  } finally {
    await cleanupMember(memberId);
  }
});

test('GET /links (AC-19): paginates at 25/page — page 1 has 25 with has_next true, page 2 has the remaining 1', async () => {
  const email = `links-list-ac19-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();

  const base = Date.now();
  const total = 26;
  for (let i = 0; i < total; i += 1) {
    await createTestLink({
      memberId,
      code: codeFor('A19', i),
      longUrl: `https://example.com/ac19-${i}`,
      // Descending creation order so link 0 is newest (first page-1 entry).
      createdAt: new Date(base - i * 1000),
    });
  }

  try {
    const page1 = await request(app).get('/links?page=1').set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`);
    assert.equal(page1.status, 200);
    assert.equal(page1.body.links.length, 25);
    assert.equal(page1.body.page, 1);
    assert.equal(page1.body.page_size, 25);
    assert.equal(page1.body.has_next, true);

    const page2 = await request(app).get('/links?page=2').set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`);
    assert.equal(page2.status, 200);
    assert.equal(page2.body.links.length, 1);
    assert.equal(page2.body.page, 2);
    assert.equal(page2.body.page_size, 25);
    assert.equal(page2.body.has_next, false);
  } finally {
    await cleanupMember(memberId);
  }
});

test('GET /links (AC-20): a member with no links gets 200 and an empty links array', async () => {
  const email = `links-list-ac20-empty-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();

  try {
    const response = await request(app).get('/links').set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.links, []);
    assert.equal(response.body.page, 1);
    assert.equal(response.body.has_next, false);
  } finally {
    await cleanupMember(memberId);
  }
});

test('GET /links (AC-20): a page beyond the last gets 200 and an empty links array', async () => {
  const email = `links-list-ac20-outofrange-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();

  await createTestLink({ memberId, code: codeFor('A20', 1), longUrl: 'https://example.com/ac20-only' });

  try {
    const response = await request(app)
      .get('/links?page=99')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.links, []);
    assert.equal(response.body.page, 99);
  } finally {
    await cleanupMember(memberId);
  }
});

test('GET /links (AC-19, Ledger #13): a malformed page param normalizes to page 1', async () => {
  const email = `links-list-ac19-malformed-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();

  await createTestLink({ memberId, code: codeFor('A19M', 1), longUrl: 'https://example.com/ac19-malformed' });

  try {
    const response = await request(app)
      .get('/links?page=-3')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.page, 1);
    assert.equal(response.body.links.length, 1);
  } finally {
    await cleanupMember(memberId);
  }
});

test('GET /links (AC-3): a member never sees another member\'s links or counts', async () => {
  const emailA = `links-list-ac3-a-${Date.now()}@example.com`;
  const emailB = `links-list-ac3-b-${Date.now()}@example.com`;
  const memberIdA = await createTestMember(emailA);
  const memberIdB = await createTestMember(emailB);
  const cookieA = await issueTestSession(memberIdA);
  const app = createApp();

  await createTestLink({ memberId: memberIdA, code: codeFor('A3A', 1), longUrl: 'https://example.com/ac3-a' });
  const linkBId = await createTestLink({
    memberId: memberIdB,
    code: codeFor('A3B', 1),
    longUrl: 'https://example.com/ac3-b',
  });
  await insertClickEvents(linkBId, 5);

  try {
    const response = await request(app).get('/links').set('Cookie', `${SESSION_COOKIE_NAME}=${cookieA}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.links.length, 1);
    assert.equal(response.body.links[0].code, codeFor('A3A', 1));
    assert.ok(
      !response.body.links.some((l) => l.code === codeFor('A3B', 1)),
      'member A\'s list must never contain member B\'s link'
    );
  } finally {
    await cleanupMember(memberIdA);
    await cleanupMember(memberIdB);
  }
});

test('GET /links (AC-1): an unauthenticated request gets 401 and discloses no link data', async () => {
  const app = createApp();

  const response = await request(app).get('/links');

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'unauthenticated');
});

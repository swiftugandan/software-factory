// Integration tests for T027/T028 `GET /app/links` (AC-17, AC-18, AC-19, AC-20, AC-21) against
// real Postgres (ADR-0007). Each test creates and cleans up its own member/session/link/click
// rows; tests run serially (`--test-concurrency=1`, package.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import createApp from '../../src/backend/http/app.js';
import pool from '../../src/backend/db/pool.js';
import { issueSession, SESSION_COOKIE_NAME } from '../../src/backend/services/session-service.js';

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

async function createTestLink({ memberId, code, longUrl, createdAt }) {
  const result = await pool.query(
    'INSERT INTO links (member_id, code, long_url, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
    [memberId, code, longUrl, createdAt || new Date()]
  );
  return result.rows[0].id;
}

async function insertClickEvents(linkId, count) {
  for (let i = 0; i < count; i += 1) {
    await pool.query('INSERT INTO click_events (link_id) VALUES ($1)', [linkId]);
  }
}

function codeFor(prefix, n) {
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

test('GET /app/links (AC-17, AC-21): renders each link\'s code, short_url, long_url, created_at, and click_count (zero as 0, never blank)', async () => {
  const email = `pages-links-list-ac17-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();

  await createTestLink({ memberId, code: codeFor('PL17', 1), longUrl: 'https://example.com/pl17-zero' });
  const threeClickLinkId = await createTestLink({
    memberId,
    code: codeFor('PL17', 2),
    longUrl: 'https://example.com/pl17-three',
  });
  await insertClickEvents(threeClickLinkId, 3);

  try {
    const response = await request(app).get('/app/links').set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`);

    assert.equal(response.status, 200);
    assert.match(response.text, /data-testid="links-table"/);
    assert.match(response.text, new RegExp(`data-code="${codeFor('PL17', 1)}"[\\s\\S]*?data-testid="link-click-count">0<`));
    assert.match(response.text, new RegExp(`data-code="${codeFor('PL17', 2)}"[\\s\\S]*?data-testid="link-click-count">3<`));
    assert.ok(response.text.includes('https://example.com/pl17-zero'));
  } finally {
    await cleanupMember(memberId);
  }
});

test('GET /app/links (AC-20): explicit empty-state message when the member has no links', async () => {
  const email = `pages-links-list-ac20-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();

  try {
    const response = await request(app).get('/app/links').set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`);

    assert.equal(response.status, 200);
    assert.match(response.text, /data-testid="links-empty-state"/);
    assert.doesNotMatch(response.text, /data-testid="links-table"/);
  } finally {
    await cleanupMember(memberId);
  }
});

test('GET /app/links (AC-18): renders links newest-first', async () => {
  const email = `pages-links-list-ac18-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();
  const base = Date.now();

  await createTestLink({
    memberId,
    code: codeFor('PL18', 1),
    longUrl: 'https://example.com/pl18-oldest',
    createdAt: new Date(base - 20000),
  });
  await createTestLink({
    memberId,
    code: codeFor('PL18', 2),
    longUrl: 'https://example.com/pl18-newest',
    createdAt: new Date(base),
  });

  try {
    const response = await request(app).get('/app/links').set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`);

    assert.equal(response.status, 200);
    const newestIndex = response.text.indexOf(codeFor('PL18', 2));
    const oldestIndex = response.text.indexOf(codeFor('PL18', 1));
    assert.ok(newestIndex !== -1 && oldestIndex !== -1);
    assert.ok(newestIndex < oldestIndex, 'newest link must render before the oldest link');
  } finally {
    await cleanupMember(memberId);
  }
});

test('GET /app/links (AC-19, T028): shows a next-page control wired to page=2 when more than 25 links exist, at 25/page', async () => {
  const email = `pages-links-list-ac19-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();
  const base = Date.now();

  for (let i = 0; i < 26; i += 1) {
    await createTestLink({
      memberId,
      code: codeFor('PL19', i),
      longUrl: `https://example.com/pl19-${i}`,
      createdAt: new Date(base - i * 1000),
    });
  }

  try {
    const page1 = await request(app).get('/app/links').set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`);

    assert.equal(page1.status, 200);
    assert.equal((page1.text.match(/data-testid="link-row"/g) || []).length, 25);
    assert.match(page1.text, /data-testid="pagination-next" href="\/app\/links\?page=2"/);
    assert.doesNotMatch(page1.text, /data-testid="pagination-prev"/);

    const page2 = await request(app)
      .get('/app/links?page=2')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`);

    assert.equal(page2.status, 200);
    assert.equal((page2.text.match(/data-testid="link-row"/g) || []).length, 1);
    assert.doesNotMatch(page2.text, /data-testid="pagination-next"/);
    assert.match(page2.text, /data-testid="pagination-prev" href="\/app\/links\?page=1"/);
  } finally {
    await cleanupMember(memberId);
  }
});

test('GET /app/links (AC-1): an unauthenticated request never renders link data (redirected to sign-in first)', async () => {
  const app = createApp();

  const response = await request(app).get('/app/links');

  assert.equal(response.status, 302);
  assert.match(response.headers.location, /^\/app\/sign-in\?next=/);
});

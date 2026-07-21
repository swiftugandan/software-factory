// Integration tests for T026 `GET/POST /app/links/new` (AC-4, AC-5, AC-8) against real
// Postgres (ADR-0007). Each test creates and cleans up its own member/session/link rows.
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

async function cleanupMember(memberId) {
  await pool.query('DELETE FROM links WHERE member_id = $1', [memberId]);
  await pool.query('DELETE FROM sessions WHERE member_id = $1', [memberId]);
  await pool.query('DELETE FROM members WHERE id = $1', [memberId]);
}

async function linksForMember(memberId) {
  const result = await pool.query('SELECT id, code, long_url FROM links WHERE member_id = $1', [memberId]);
  return result.rows;
}

test('GET /app/links/new (AC-4): an authenticated member sees the create-link form', async () => {
  const email = `pages-links-new-form-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();

  try {
    const response = await request(app)
      .get('/app/links/new')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`);

    assert.equal(response.status, 200);
    assert.match(response.text, /data-testid="create-link-form"/);
    assert.match(response.text, /name="longUrl"/);
  } finally {
    await cleanupMember(memberId);
  }
});

test('POST /app/links/new (AC-4, AC-8): a valid URL creates a link and renders code, short_url, long_url, and created_at', async () => {
  const email = `pages-links-new-ac8-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();
  const submittedUrl = 'https://example.com/pages-ac8?x=1';

  try {
    const response = await request(app)
      .post('/app/links/new')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`)
      .type('form')
      .send({ longUrl: submittedUrl });

    assert.equal(response.status, 201);
    assert.match(response.text, /data-testid="create-link-result"/);
    assert.match(response.text, /data-testid="result-code">([0-9A-Za-z]{7})</);
    assert.ok(response.text.includes(`data-testid="result-long-url">${submittedUrl}<`));
    assert.match(response.text, /data-testid="result-created-at">\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z</);

    const codeMatch = response.text.match(/data-testid="result-code">([0-9A-Za-z]{7})</);
    const code = codeMatch[1];
    assert.ok(response.text.includes(`>${appConfig.shortLinkBaseUrl}/${code}<`));

    const rows = await linksForMember(memberId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].code, code);
  } finally {
    await cleanupMember(memberId);
  }
});

test('POST /app/links/new (AC-5): an invalid URL renders the 422 validation message inline and creates no link', async () => {
  const email = `pages-links-new-ac5-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();

  try {
    const response = await request(app)
      .post('/app/links/new')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`)
      .type('form')
      .send({ longUrl: 'not-an-absolute-url' });

    assert.equal(response.status, 422);
    assert.match(response.text, /data-testid="create-link-error"/);
    assert.match(response.text, /longUrl must be an absolute http\(s\) URL/);
    assert.doesNotMatch(response.text, /data-testid="create-link-result"/);

    const rows = await linksForMember(memberId);
    assert.equal(rows.length, 0);
  } finally {
    await cleanupMember(memberId);
  }
});

test('POST /app/links/new (security: XSS): a long URL containing markup is escaped, never rendered as live HTML', async () => {
  const email = `pages-links-new-xss-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const cookieValue = await issueTestSession(memberId);
  const app = createApp();
  // Still a valid absolute http(s) URL (AC-5 accepts it); the payload rides in the path.
  const maliciousUrl = 'https://example.com/<script>alert(1)</script>';

  try {
    const response = await request(app)
      .post('/app/links/new')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${cookieValue}`)
      .type('form')
      .send({ longUrl: maliciousUrl });

    assert.equal(response.status, 201);
    assert.doesNotMatch(response.text, /<script>alert\(1\)<\/script>/);
    assert.match(response.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  } finally {
    await cleanupMember(memberId);
  }
});

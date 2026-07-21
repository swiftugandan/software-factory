// Integration tests for T024 `GET/POST /app/sign-in` (AC-2, Ledger #14, Ledger #16) against
// real Postgres (ADR-0007). Server-rendered EJS pages (ADR-0003). Each test creates and cleans
// up its own member/session rows.
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

test('GET /app/sign-in (AC-2): renders an email/password form and an OAuth (Google) button', async () => {
  const app = createApp();

  const response = await request(app).get('/app/sign-in');

  assert.equal(response.status, 200);
  assert.match(response.text, /data-testid="sign-in-form"/);
  assert.match(response.text, /name="email"/);
  assert.match(response.text, /name="password"/);
  assert.match(response.text, /<a href="\/auth\/oauth\/google" data-testid="oauth-google-button"/);
});

test('POST /app/sign-in (AC-2): correct credentials sign the member in and redirect to the link list by default', async () => {
  const email = `pages-sign-in-ok-${Date.now()}@example.com`;
  const password = 'correct horse battery staple';
  const memberId = await createTestMember(email, password);
  const app = createApp();

  try {
    const response = await request(app).post('/app/sign-in').type('form').send({ email, password });

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, '/app/links');

    const setCookieHeader = response.headers['set-cookie'] || [];
    assert.ok(setCookieHeader.some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`)));
    assert.equal(await sessionCount(memberId), 1);
  } finally {
    await cleanupMember(memberId);
  }
});

test('POST /app/sign-in (AC-2, Ledger #16): a validated in-app return-to (next) is honored on success', async () => {
  const email = `pages-sign-in-next-${Date.now()}@example.com`;
  const password = 'correct horse battery staple';
  const memberId = await createTestMember(email, password);
  const app = createApp();

  try {
    const response = await request(app)
      .post('/app/sign-in')
      .type('form')
      .send({ email, password, next: '/app/links/new' });

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, '/app/links/new');
  } finally {
    await cleanupMember(memberId);
  }
});

test('POST /app/sign-in (AC-2, Ledger #16): an external return-to is rejected (no open redirect) and falls back to the link list', async () => {
  const email = `pages-sign-in-badnext-${Date.now()}@example.com`;
  const password = 'correct horse battery staple';
  const memberId = await createTestMember(email, password);
  const app = createApp();

  try {
    const response = await request(app)
      .post('/app/sign-in')
      .type('form')
      .send({ email, password, next: 'https://evil.example.com/phish' });

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, '/app/links');
  } finally {
    await cleanupMember(memberId);
  }
});

test('POST /app/sign-in (AC-2, Ledger #14): wrong password re-renders sign-in with the API\'s generic error and creates no session', async () => {
  const email = `pages-sign-in-wrongpw-${Date.now()}@example.com`;
  const memberId = await createTestMember(email, 'the-real-password');
  const app = createApp();

  try {
    const response = await request(app)
      .post('/app/sign-in')
      .type('form')
      .send({ email, password: 'not-the-password' });

    assert.equal(response.status, 401);
    assert.match(response.text, /data-testid="sign-in-error"/);
    assert.match(response.text, /invalid email or password/);
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(await sessionCount(memberId), 0);
  } finally {
    await cleanupMember(memberId);
  }
});

test('POST /app/sign-in (AC-2, Ledger #14): unknown email gets the identical generic error (no account enumeration)', async () => {
  const app = createApp();

  const response = await request(app)
    .post('/app/sign-in')
    .type('form')
    .send({ email: `pages-sign-in-unknown-${Date.now()}@example.com`, password: 'whatever' });

  assert.equal(response.status, 401);
  assert.match(response.text, /invalid email or password/);
  assert.equal(response.headers['set-cookie'], undefined);
});

test('GET /app/sign-in (AC-2): an already-authenticated member is redirected straight to the link list', async () => {
  const email = `pages-sign-in-already-${Date.now()}@example.com`;
  const password = 'correct horse battery staple';
  const memberId = await createTestMember(email, password);
  const agent = request.agent(createApp());

  try {
    await agent.post('/app/sign-in').type('form').send({ email, password });

    const response = await agent.get('/app/sign-in');

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, '/app/links');
  } finally {
    await cleanupMember(memberId);
  }
});

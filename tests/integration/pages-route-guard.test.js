// Integration tests for T025 (AC-1): unauthenticated visits to member-only pages redirect to
// sign-in, preserving the requested page as a validated in-app-only return-to param. Against
// real Postgres (ADR-0007) via the full app stack; each test cleans up its own rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import createApp from '../../src/backend/http/app.js';
import pool from '../../src/backend/db/pool.js';
import passwordHasher from '../../src/backend/lib/password-hasher.js';

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

test('GET /app/links (AC-1): an unauthenticated visit redirects to sign-in with the requested page as return-to, and reads no link data', async () => {
  const app = createApp();

  const response = await request(app).get('/app/links?page=2');

  assert.equal(response.status, 302);
  assert.equal(response.headers.location, `/app/sign-in?next=${encodeURIComponent('/app/links?page=2')}`);
});

test('GET /app/links/new (AC-1): an unauthenticated visit redirects to sign-in with the create-link page as return-to', async () => {
  const app = createApp();

  const response = await request(app).get('/app/links/new');

  assert.equal(response.status, 302);
  assert.equal(response.headers.location, `/app/sign-in?next=${encodeURIComponent('/app/links/new')}`);
});

test('POST /app/links/new (AC-1): an unauthenticated form submit redirects to sign-in and creates no link', async () => {
  const app = createApp();

  const response = await request(app)
    .post('/app/links/new')
    .type('form')
    .send({ longUrl: 'https://example.com/should-not-be-created' });

  assert.equal(response.status, 302);
  assert.match(response.headers.location, /^\/app\/sign-in\?next=/);

  const rows = await pool.query('SELECT id FROM links WHERE long_url = $1', [
    'https://example.com/should-not-be-created',
  ]);
  assert.equal(rows.rows.length, 0);
});

test('Route guard (AC-1, AC-2, Ledger #16): sign-in after being bounced from a member-only page lands the member back on that page', async () => {
  const email = `route-guard-return-to-${Date.now()}@example.com`;
  const password = 'correct horse battery staple';
  const memberId = await createTestMember(email, password);
  const agent = request.agent(createApp());

  try {
    const guardResponse = await agent.get('/app/links/new');
    assert.equal(guardResponse.status, 302);
    const signInUrl = guardResponse.headers.location;
    assert.match(signInUrl, /^\/app\/sign-in\?next=/);

    const nextParam = new URLSearchParams(signInUrl.split('?')[1]).get('next');
    assert.equal(nextParam, '/app/links/new');

    const signInPage = await agent.get(signInUrl);
    // The return-to survives as the sign-in form's hidden field.
    assert.match(signInPage.text, /name="next" value="\/app\/links\/new"/);

    const signInResponse = await agent.post('/app/sign-in').type('form').send({ email, password, next: nextParam });
    assert.equal(signInResponse.status, 302);
    assert.equal(signInResponse.headers.location, '/app/links/new');

    const finalResponse = await agent.get('/app/links/new');
    assert.equal(finalResponse.status, 200);
  } finally {
    await cleanupMember(memberId);
  }
});

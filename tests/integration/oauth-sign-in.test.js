// Integration tests for T011 OAuth sign-in (AC-2, Ledger #14/#18/#19) against real Postgres
// (ADR-0007). The Google provider's HTTP calls are stubbed via a fake client injected through
// createOauthService's `clients` seam (ADR-0009) -- no real network call is ever made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import createApp from '../../src/backend/http/app.js';
import { createOauthService } from '../../src/backend/services/oauth-service.js';
import pool from '../../src/backend/db/pool.js';
import { SESSION_COOKIE_NAME } from '../../src/backend/services/session-service.js';

function fakeGoogleClient({ subject, email, fail = false } = {}) {
  return {
    getAuthorizeUrl(state) {
      return `https://accounts.google.com/o/oauth2/v2/auth?state=${state}&fake=1`;
    },
    async exchangeCode(code) {
      if (fail || !code) throw new Error('fake exchange failure');
      return { access_token: `fake-access-token-for-${code}` };
    },
    async fetchUserInfo() {
      if (fail) throw new Error('fake userinfo failure');
      return { sub: subject, email };
    },
  };
}

async function cleanupByEmail(email) {
  const memberResult = await pool.query('SELECT id FROM members WHERE email = $1', [email]);
  const memberId = memberResult.rows[0] && memberResult.rows[0].id;
  if (!memberId) return;
  await pool.query('DELETE FROM sessions WHERE member_id = $1', [memberId]);
  await pool.query('DELETE FROM oauth_identities WHERE member_id = $1', [memberId]);
  await pool.query('DELETE FROM members WHERE id = $1', [memberId]);
}

test('GET /auth/oauth/google (AC-2): redirects to the (fake) provider authorize URL, never a real network call', async () => {
  const oauthService = createOauthService({ clients: { google: fakeGoogleClient({}) } });
  const app = createApp({ oauthService });

  const response = await request(app).get('/auth/oauth/google');

  assert.equal(response.status, 302);
  assert.match(response.headers.location, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
});

test('GET /auth/oauth/google/callback (AC-2, Ledger #19): auto-provisions a new member + oauth_identities row and issues a session on first login', async () => {
  const email = `oauth-new-${Date.now()}@example.com`;
  const subject = `google-subject-${Date.now()}`;
  const oauthService = createOauthService({ clients: { google: fakeGoogleClient({ subject, email }) } });
  const app = createApp({ oauthService });

  try {
    const response = await request(app).get('/auth/oauth/google/callback').query({ code: 'fake-code' });

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, '/app/links');

    const setCookieHeader = response.headers['set-cookie'] || [];
    assert.ok(setCookieHeader.some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`)));

    const memberResult = await pool.query('SELECT id FROM members WHERE email = $1', [email]);
    assert.equal(memberResult.rows.length, 1);

    const identityResult = await pool.query(
      'SELECT * FROM oauth_identities WHERE provider = $1 AND provider_subject = $2',
      ['google', subject]
    );
    assert.equal(identityResult.rows.length, 1);
    assert.equal(identityResult.rows[0].member_id, memberResult.rows[0].id);
  } finally {
    await cleanupByEmail(email);
  }
});

test('GET /auth/oauth/google/callback (AC-2): a second login with the same provider subject reuses the existing member (no duplicate provisioning)', async () => {
  const email = `oauth-repeat-${Date.now()}@example.com`;
  const subject = `google-subject-repeat-${Date.now()}`;
  const oauthService = createOauthService({ clients: { google: fakeGoogleClient({ subject, email }) } });
  const app = createApp({ oauthService });

  try {
    await request(app).get('/auth/oauth/google/callback').query({ code: 'fake-code-1' });
    await request(app).get('/auth/oauth/google/callback').query({ code: 'fake-code-2' });

    const memberResult = await pool.query('SELECT id FROM members WHERE email = $1', [email]);
    assert.equal(memberResult.rows.length, 1);

    const identityResult = await pool.query(
      'SELECT * FROM oauth_identities WHERE provider = $1 AND provider_subject = $2',
      ['google', subject]
    );
    assert.equal(identityResult.rows.length, 1);
  } finally {
    await cleanupByEmail(email);
  }
});

test('GET /auth/oauth/google/callback (AC-2, Ledger #14): user cancellation (error param) returns the generic failure with no partial session/account', async () => {
  const oauthService = createOauthService({ clients: { google: fakeGoogleClient({}) } });
  const app = createApp({ oauthService });

  const response = await request(app)
    .get('/auth/oauth/google/callback')
    .query({ error: 'access_denied' });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: { code: 'unauthenticated', message: 'sign-in was not completed' } });
  assert.equal(response.headers['set-cookie'], undefined);
});

test('GET /auth/oauth/google/callback (AC-2, Ledger #14): a provider exchange failure returns the generic error and creates no member/session', async () => {
  const oauthService = createOauthService({ clients: { google: fakeGoogleClient({ fail: true }) } });
  const app = createApp({ oauthService });

  const response = await request(app).get('/auth/oauth/google/callback').query({ code: 'fake-code' });

  assert.equal(response.status, 401);
  assert.equal(response.body.error.message, 'sign-in was not completed');
  assert.equal(response.headers['set-cookie'], undefined);
});

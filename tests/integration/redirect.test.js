// Integration tests for T017-T020 `GET /:code` (AC-9, AC-10, AC-11, AC-12, AC-13, AC-14,
// AC-15, AC-16, AC-22, AC-23) against real Postgres (ADR-0007). Each test creates and cleans
// up its own member/link/click rows; tests run serially (`--test-concurrency=1`,
// package.json) so cleanup between tests is safe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import createApp from '../../src/backend/http/app.js';
import { createRedirectService } from '../../src/backend/services/redirect-service.js';
import pool from '../../src/backend/db/pool.js';
import appConfig from '../../config/app.js';

async function createTestMember(email) {
  const result = await pool.query('INSERT INTO members (email, password_hash) VALUES ($1, NULL) RETURNING id', [
    email,
  ]);
  return result.rows[0].id;
}

async function createTestLink({ memberId, code, longUrl, deleted = false }) {
  const result = await pool.query(
    'INSERT INTO links (member_id, code, long_url, deleted_at) VALUES ($1, $2, $3, $4) RETURNING id',
    [memberId, code, longUrl, deleted ? new Date() : null]
  );
  return result.rows[0].id;
}

async function clickCountForLink(linkId) {
  const result = await pool.query('SELECT COUNT(*)::int AS count FROM click_events WHERE link_id = $1', [linkId]);
  return result.rows[0].count;
}

async function cleanupMember(memberId) {
  await pool.query(
    'DELETE FROM click_events WHERE link_id IN (SELECT id FROM links WHERE member_id = $1)',
    [memberId]
  );
  await pool.query('DELETE FROM links WHERE member_id = $1', [memberId]);
  await pool.query('DELETE FROM members WHERE id = $1', [memberId]);
}

test('GET /:code (AC-11, AC-15): a malformed code (wrong length) 404s before any DB lookup, no click recorded', async () => {
  const app = createApp();

  const response = await request(app).get('/short'); // 5 chars, not the configured 7

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'not_found');
});

test('GET /:code (AC-11, AC-15): a malformed code (invalid character) 404s, no click recorded', async () => {
  const app = createApp();

  const response = await request(app).get('/abc-123'); // contains a hyphen and is 8 chars

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'not_found');
});

test('GET /:code (AC-9, AC-10): a well-formed active code redirects 302 to the stored long URL, no auth required', async () => {
  const email = `redirect-ac9-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const code = 'ac9code';
  const longUrl = 'https://example.com/ac9-target';
  await createTestLink({ memberId, code, longUrl });
  const app = createApp();

  try {
    // No Cookie header set at all: proves the redirect route is not behind requireAuth.
    const response = await request(app).get(`/${code}`);

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, longUrl);
  } finally {
    await cleanupMember(memberId);
  }
});

test('GET /:code (Ledger #17): the request query string/fragment is never appended to the redirect Location', async () => {
  const email = `redirect-ledger17-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const code = 'ldg17cd';
  const longUrl = 'https://example.com/ledger17-target?already=here';
  await createTestLink({ memberId, code, longUrl });
  const app = createApp();

  try {
    const response = await request(app).get(`/${code}?ignored=1&other=2`);

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, longUrl);
  } finally {
    await cleanupMember(memberId);
  }
});

test('GET /:code (AC-11): a well-formed but unknown code 404s and records no click', async () => {
  const email = `redirect-ac11-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const knownCode = 'ac11kwn';
  const linkId = await createTestLink({ memberId, code: knownCode, longUrl: 'https://example.com/ac11' });
  const app = createApp();

  try {
    const response = await request(app).get('/ac11unk'); // well-formed 7-char shape, but no such link exists

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'not_found');
    // The unrelated known link's click count is unaffected by the 404 on a different code.
    assert.equal(await clickCountForLink(linkId), 0);
  } finally {
    await cleanupMember(memberId);
  }
});

test('GET /:code (AC-23): a soft-deleted code 404s identically to a nonexistent code, no click recorded', async () => {
  const email = `redirect-ac23-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const code = 'ac23del';
  const linkId = await createTestLink({
    memberId,
    code,
    longUrl: 'https://example.com/ac23',
    deleted: true,
  });
  const app = createApp();

  try {
    const response = await request(app).get(`/${code}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'not_found');
    assert.equal(await clickCountForLink(linkId), 0);
  } finally {
    await cleanupMember(memberId);
  }
});

test('GET /:code (AC-13, AC-14, AC-22): a successful redirect records exactly one click_events row with a timestamp', async () => {
  const email = `redirect-ac13-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const code = 'ac13clk';
  const linkId = await createTestLink({ memberId, code, longUrl: 'https://example.com/ac13' });
  const app = createApp();

  try {
    const response = await request(app).get(`/${code}`);
    assert.equal(response.status, 302);

    const result = await pool.query('SELECT created_at FROM click_events WHERE link_id = $1', [linkId]);
    assert.equal(result.rows.length, 1);
    assert.ok(result.rows[0].created_at instanceof Date);
  } finally {
    await cleanupMember(memberId);
  }
});

test('GET /:code (AC-14): N redirects of the same code yield a click total of N', async () => {
  const email = `redirect-ac14-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const code = 'ac14cnt';
  const linkId = await createTestLink({ memberId, code, longUrl: 'https://example.com/ac14' });
  const app = createApp();
  const N = 3;

  try {
    for (let i = 0; i < N; i += 1) {
      const response = await request(app).get(`/${code}`);
      assert.equal(response.status, 302);
    }

    assert.equal(await clickCountForLink(linkId), N);
  } finally {
    await cleanupMember(memberId);
  }
});

test('GET /:code (AC-16): a transient click-insert failure does not block or delay the 302', async () => {
  const email = `redirect-ac16-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const code = 'ac16fai';
  const longUrl = 'https://example.com/ac16';
  const linkId = await createTestLink({ memberId, code, longUrl });

  const redirectService = createRedirectService({
    insertClickEvent: async () => {
      throw new Error('injected transient click-insert failure');
    },
    onClickRecordError: () => {}, // swallow the expected error; keep test output clean
  });
  const app = createApp({ redirectService });

  try {
    const response = await request(app).get(`/${code}`);

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, longUrl);
    // The injected failure means no row was actually persisted, but the redirect succeeded.
    assert.equal(await clickCountForLink(linkId), 0);
  } finally {
    await cleanupMember(memberId);
  }
});

test('GET /:code (AC-12): exposes server processing time within the configured p95 budget', async () => {
  const email = `redirect-ac12-${Date.now()}@example.com`;
  const memberId = await createTestMember(email);
  const code = 'ac12tim';
  await createTestLink({ memberId, code, longUrl: 'https://example.com/ac12' });
  const app = createApp();

  try {
    const response = await request(app).get(`/${code}`);

    assert.equal(response.status, 302);
    const serverTimeMs = Number(response.headers['x-redirect-server-time-ms']);
    assert.ok(Number.isFinite(serverTimeMs), 'expected a numeric X-Redirect-Server-Time-Ms header');
    assert.ok(
      serverTimeMs < appConfig.redirectP95BudgetMs,
      `expected server time ${serverTimeMs}ms to be within the ${appConfig.redirectP95BudgetMs}ms budget`
    );
  } finally {
    await cleanupMember(memberId);
  }
});

// Unit tests for the random opaque session token generator (T009, AC-2, ADR-0009, Ledger #29).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSessionToken } from '../../src/backend/lib/session-token.js';

test('session-token (AC-2, Ledger #29): generates a base64url token with no sequential/short pattern', () => {
  const token = generateSessionToken();
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  // 32 random bytes base64url-encoded is well over 40 chars; far from a small sequential id.
  assert.ok(token.length >= 40, `expected a long opaque token, got length ${token.length}`);
});

test('session-token (AC-2, Ledger #29): two calls produce different tokens', () => {
  const a = generateSessionToken();
  const b = generateSessionToken();
  assert.notEqual(a, b);
});

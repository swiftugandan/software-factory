// Unit tests for T024/T025 (AC-1, AC-2, Ledger #16): the return-to sanitizer is the sole seam
// that decides whether a post-sign-in redirect target is trusted. Pure function, no DB/HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeReturnTo } from '../../src/backend/lib/return-to.js';

test('return-to (AC-1, AC-2, Ledger #16): accepts a plain in-app relative path', () => {
  assert.equal(sanitizeReturnTo('/app/links/new'), '/app/links/new');
});

test('return-to (AC-1, AC-2, Ledger #16): accepts an in-app path carrying a query string', () => {
  assert.equal(sanitizeReturnTo('/app/links?page=2'), '/app/links?page=2');
});

test('return-to (Ledger #16): rejects a missing/empty/non-string value', () => {
  assert.equal(sanitizeReturnTo(undefined), null);
  assert.equal(sanitizeReturnTo(null), null);
  assert.equal(sanitizeReturnTo(''), null);
  assert.equal(sanitizeReturnTo('   '), null);
});

test('return-to (Ledger #16): rejects an absolute external URL (open-redirect attempt)', () => {
  assert.equal(sanitizeReturnTo('https://evil.example.com/phish'), null);
  assert.equal(sanitizeReturnTo('http://evil.example.com'), null);
});

test('return-to (Ledger #16): rejects a protocol-relative URL (open-redirect attempt)', () => {
  assert.equal(sanitizeReturnTo('//evil.example.com/phish'), null);
});

test('return-to (Ledger #16): rejects a backslash-based bypass', () => {
  assert.equal(sanitizeReturnTo('/\\evil.example.com'), null);
  assert.equal(sanitizeReturnTo('/app\\@evil.example.com'), null);
});

test('return-to (Ledger #16): rejects a scheme-carrying value that is not a bare relative path', () => {
  assert.equal(sanitizeReturnTo('javascript:alert(1)'), null);
});

test('return-to (Ledger #16): rejects a value not starting with a single leading slash', () => {
  assert.equal(sanitizeReturnTo('app/links'), null);
  assert.equal(sanitizeReturnTo('evil.example.com/app/links'), null);
});

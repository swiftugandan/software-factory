// Unit tests for T013 (AC-5): reject empty, non-absolute, non-http(s)-scheme, or
// >2048-character URLs with a ValidationError (mapped to HTTP 422 by the centralized error
// handler, ADR-0008). Pure function — no DB/network involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLongUrl } from '../../src/backend/lib/url-validator.js';
import { ValidationError } from '../../src/backend/lib/errors.js';

test('url-validator (AC-5): accepts a well-formed absolute http URL', () => {
  const result = validateLongUrl('http://example.com/page');
  assert.equal(result, 'http://example.com/page');
});

test('url-validator (AC-5): accepts a well-formed absolute https URL', () => {
  const result = validateLongUrl('https://example.com/page?q=1');
  assert.equal(result, 'https://example.com/page?q=1');
});

test('url-validator (AC-5): rejects an empty string with a ValidationError', () => {
  assert.throws(() => validateLongUrl(''), ValidationError);
});

test('url-validator (AC-5): rejects a whitespace-only string with a ValidationError', () => {
  assert.throws(() => validateLongUrl('   '), ValidationError);
});

test('url-validator (AC-5): rejects a missing value (undefined) with a ValidationError', () => {
  assert.throws(() => validateLongUrl(undefined), ValidationError);
});

test('url-validator (AC-5): rejects a non-absolute (relative) URL with a ValidationError', () => {
  assert.throws(() => validateLongUrl('/just/a/path'), ValidationError);
});

test('url-validator (AC-5): rejects a non-http(s) scheme (e.g. ftp) with a ValidationError', () => {
  assert.throws(() => validateLongUrl('ftp://example.com/file'), ValidationError);
});

test('url-validator (AC-5): rejects a javascript: scheme with a ValidationError', () => {
  assert.throws(() => validateLongUrl('javascript:alert(1)'), ValidationError);
});

test('url-validator (AC-5): rejects a URL longer than 2048 characters with a ValidationError', () => {
  const longUrl = `https://example.com/${'a'.repeat(2048)}`;
  assert.ok(longUrl.length > 2048);
  assert.throws(() => validateLongUrl(longUrl), ValidationError);
});

test('url-validator (AC-5): accepts a URL at exactly the 2048-character boundary', () => {
  const prefix = 'https://example.com/';
  const padding = 'a'.repeat(2048 - prefix.length);
  const boundaryUrl = `${prefix}${padding}`;
  assert.equal(boundaryUrl.length, 2048);
  assert.equal(validateLongUrl(boundaryUrl), boundaryUrl);
});

// Unit tests for the centralized error handler's status/body mapping (ADR-0008), exercised
// directly on for the auth-related error types used by T010/T011/T012 (AC-1, AC-2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import errorHandler from '../../src/backend/http/error-handler.js';
import { UnauthenticatedError, ValidationError } from '../../src/backend/lib/errors.js';

function fakeRes() {
  return {
    statusCode: undefined,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('error-handler (AC-1, AC-2): maps UnauthenticatedError to 401 with the uniform error shape', () => {
  const res = fakeRes();
  errorHandler(new UnauthenticatedError('invalid email or password'), {}, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: { code: 'unauthenticated', message: 'invalid email or password' } });
});

test('error-handler: maps an unmapped error to 500 with a generic body (no internal detail leaked)', () => {
  const res = fakeRes();
  errorHandler(new Error('some internal detail'), {}, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error.code, 'internal_error');
  assert.doesNotMatch(res.body.error.message, /internal detail/);
});

test('error-handler: ValidationError includes a fields array when present', () => {
  const res = fakeRes();
  errorHandler(new ValidationError('bad input', ['url']), {}, res, () => {});
  assert.equal(res.statusCode, 422);
  assert.deepEqual(res.body.error.fields, ['url']);
});

// Unit test for the requireAuth middleware in isolation (T012, AC-1), no HTTP/DB involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import requireAuth from '../../src/backend/http/middleware/require-auth.js';
import { UnauthenticatedError } from '../../src/backend/lib/errors.js';

test('requireAuth (AC-1): calls next(UnauthenticatedError) and never invokes the handler when req.member is absent', () => {
  const req = { member: null };
  let handlerCalled = false;
  let errPassed;
  const next = (err) => {
    errPassed = err;
  };

  requireAuth(req, {}, next);
  if (!errPassed) handlerCalled = true; // would only happen if next() was called with no error

  assert.ok(errPassed instanceof UnauthenticatedError);
  assert.equal(handlerCalled, false);
});

test('requireAuth (AC-2): calls next() with no error when req.member is set', () => {
  const req = { member: { id: 1, email: 'member@example.com' } };
  let errPassed = 'not-called';
  const next = (err) => {
    errPassed = err;
  };

  requireAuth(req, {}, next);

  assert.equal(errPassed, undefined);
});

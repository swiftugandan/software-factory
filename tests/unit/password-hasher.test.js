// Unit tests for the scrypt passwordHasher seam (T009, AC-2, ADR-0009).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import passwordHasher from '../../src/backend/lib/password-hasher.js';

test('password-hasher (AC-2): verify() succeeds for the correct password against its own hash', async () => {
  const stored = await passwordHasher.hash('correct horse battery staple');
  const ok = await passwordHasher.verify('correct horse battery staple', stored);
  assert.equal(ok, true);
});

test('password-hasher (AC-2): verify() fails for a wrong password', async () => {
  const stored = await passwordHasher.hash('correct horse battery staple');
  const ok = await passwordHasher.verify('wrong password', stored);
  assert.equal(ok, false);
});

test('password-hasher (AC-2): hash() salts each call so two hashes of the same password differ', async () => {
  const a = await passwordHasher.hash('same-password');
  const b = await passwordHasher.hash('same-password');
  assert.notEqual(a, b);
});

test('password-hasher (AC-2, Ledger #14): verify() returns false (never throws) for a null stored hash (unknown/OAuth-only member)', async () => {
  const ok = await passwordHasher.verify('anything', null);
  assert.equal(ok, false);
});

test('password-hasher (AC-2, Ledger #14): verify() returns false for a malformed stored hash', async () => {
  const ok = await passwordHasher.verify('anything', 'not-a-valid-hash');
  assert.equal(ok, false);
});

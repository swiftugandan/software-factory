// Unit tests for T017 (AC-11, AC-15): the reusable malformed-code predicate that the
// redirect service uses to short-circuit BEFORE any DB lookup. Pure function — no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidCodeShape } from '../../src/backend/lib/code-shape.js';

const config = { codeLength: 7, alphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' };

test('code-shape (AC-11, AC-15): accepts a well-formed 7-character base62 code', () => {
  assert.equal(isValidCodeShape('aB3xY9z', config), true);
});

test('code-shape (AC-11, AC-15): rejects a code shorter than the configured length', () => {
  assert.equal(isValidCodeShape('aB3xY9', config), false);
});

test('code-shape (AC-11, AC-15): rejects a code longer than the configured length', () => {
  assert.equal(isValidCodeShape('aB3xY9zz', config), false);
});

test('code-shape (AC-11, AC-15): rejects a code containing a character outside the alphabet', () => {
  assert.equal(isValidCodeShape('aB3x-9z', config), false);
});

test('code-shape (AC-11, AC-15): rejects a code containing a path separator', () => {
  assert.equal(isValidCodeShape('aB3x/9z', config), false);
});

test('code-shape (AC-11, AC-15): rejects a non-string value', () => {
  assert.equal(isValidCodeShape(1234567, config), false);
  assert.equal(isValidCodeShape(undefined, config), false);
  assert.equal(isValidCodeShape(null, config), false);
});

test('code-shape (AC-11, AC-15): uses config/link-generation.js by default (7-char base62)', async () => {
  const { default: linkGenerationConfig } = await import('../../config/link-generation.js');
  assert.equal(isValidCodeShape('a'.repeat(linkGenerationConfig.codeLength)), true);
  assert.equal(isValidCodeShape('!'.repeat(linkGenerationConfig.codeLength)), false);
});

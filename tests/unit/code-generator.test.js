// Unit tests for T014 (AC-4): 7-char base62 [0-9A-Za-z] codes, generated behind the
// config/link-generation.js seam (ADR-0010). RNG is injected so the alphabet-mapping logic is
// asserted deterministically, independent of `crypto.randomInt`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCode } from '../../src/backend/lib/code-generator.js';
import linkGenerationConfig from '../../config/link-generation.js';

test('code-generator (AC-4): default config produces a 7-character base62 code', () => {
  const code = generateCode();
  assert.equal(code.length, 7);
  assert.match(code, /^[0-9A-Za-z]{7}$/);
});

test('code-generator (AC-4): every character is drawn from the configured base62 alphabet', () => {
  const code = generateCode();
  for (const char of code) {
    assert.ok(linkGenerationConfig.alphabet.includes(char), `unexpected character "${char}" not in alphabet`);
  }
});

test('code-generator (AC-4): with an injected RNG, picks alphabet[0] deterministically for every position', () => {
  const config = { codeLength: 7, alphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' };
  const code = generateCode(config, () => 0);
  assert.equal(code, '0000000');
});

test('code-generator (AC-4): with an injected RNG, walks the alphabet index deterministically', () => {
  const config = { codeLength: 3, alphabet: 'abc' };
  let call = 0;
  const code = generateCode(config, () => {
    const value = call % 3;
    call += 1;
    return value;
  });
  assert.equal(code, 'abc');
});

test('code-generator (AC-4): honors a configured length other than 7', () => {
  const config = { codeLength: 4, alphabet: '01' };
  const code = generateCode(config, () => 1);
  assert.equal(code.length, 4);
  assert.equal(code, '1111');
});

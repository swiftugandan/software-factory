// Unit tests for T023's page-param normalization (AC-19, Ledger #13). No DB/network
// involved — pure function exercised directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizePage, PAGE_SIZE } from '../../src/backend/services/links-service.js';

test('normalizePage (AC-19, Ledger #13): missing page param normalizes to 1', () => {
  assert.equal(normalizePage(undefined), 1);
});

test('normalizePage (AC-19, Ledger #13): non-numeric page normalizes to 1', () => {
  assert.equal(normalizePage('abc'), 1);
});

test('normalizePage (AC-19, Ledger #13): negative page normalizes to 1', () => {
  assert.equal(normalizePage('-1'), 1);
});

test('normalizePage (AC-19, Ledger #13): zero page normalizes to 1', () => {
  assert.equal(normalizePage('0'), 1);
});

test('normalizePage (AC-19, Ledger #13): decimal page normalizes to 1', () => {
  assert.equal(normalizePage('1.5'), 1);
});

test('normalizePage (AC-19, Ledger #13): empty-string page normalizes to 1', () => {
  assert.equal(normalizePage(''), 1);
});

test('normalizePage (AC-19): a well-formed positive integer page is preserved', () => {
  assert.equal(normalizePage('2'), 2);
  assert.equal(normalizePage('25'), 25);
});

test('PAGE_SIZE (AC-19): the fixed page size is 25 per ADR-0008 line 31', () => {
  assert.equal(PAGE_SIZE, 25);
});

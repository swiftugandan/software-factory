// Unit tests for the short-code generation config seam (T002, ADR-0010, Ledger #1/#12).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const configUrl = pathToFileURL(path.join(repoRoot, 'config/link-generation.js')).href;

function loadWithEnv(overrides) {
  const env = {
    ...process.env,
    DATABASE_URL: 'postgresql://root@/tinylink_test?host=/var/run/postgresql',
    SHORT_LINK_BASE_URL: 'http://localhost:3000',
    SESSION_SECRET: 'test-only-secret',
    ...overrides,
  };
  const script = `import(${JSON.stringify(configUrl)})
    .then((m) => { process.stdout.write(JSON.stringify(m.default)); })
    .catch((e) => { process.stderr.write(e.message); process.exitCode = 1; });`;
  const stdout = execFileSync(process.execPath, ['-e', script], { cwd: repoRoot, env, encoding: 'utf8' });
  return JSON.parse(stdout);
}

test('config/link-generation.js: default shape is a 7-char base62 alphabet (AC-4, Ledger #1)', () => {
  const config = loadWithEnv({});
  assert.equal(config.codeLength, 7);
  assert.match(config.alphabet, /^[0-9A-Za-z]+$/);
  assert.equal(new Set(config.alphabet.split('')).size, config.alphabet.length);
});

test('config/link-generation.js: retryMax follows CODE_RETRY_MAX (AC-6, Ledger #12)', () => {
  const config = loadWithEnv({ CODE_RETRY_MAX: '5' });
  assert.equal(config.retryMax, 5);
});

// Unit tests for the OAuth provider registry seam (T002, ADR-0009, Ledger #18).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const configUrl = pathToFileURL(path.join(repoRoot, 'config/auth-providers.js')).href;

function run(script, overrides) {
  const env = {
    ...process.env,
    DATABASE_URL: 'postgresql://root@/tinylink_test?host=/var/run/postgresql',
    SHORT_LINK_BASE_URL: 'http://localhost:3000',
    SESSION_SECRET: 'test-only-secret',
    ...overrides,
  };
  return execFileSync(process.execPath, ['-e', script], { cwd: repoRoot, env, encoding: 'utf8' });
}

test('config/auth-providers.js: google is registered but disabled without credentials (Ledger #18)', () => {
  const script = `import(${JSON.stringify(configUrl)})
    .then((m) => { process.stdout.write(JSON.stringify({ hasGoogle: Boolean(m.getProvider('google')), enabled: m.getProvider('google').enabled, listed: m.listProviders().length })); });`;
  const stdout = run(script, {});
  const result = JSON.parse(stdout);
  assert.equal(result.hasGoogle, true);
  assert.equal(result.enabled, false);
  assert.equal(result.listed, 0);
});

test('config/auth-providers.js: google becomes enabled once all three credentials are set (Ledger #18)', () => {
  const script = `import(${JSON.stringify(configUrl)})
    .then((m) => { process.stdout.write(JSON.stringify({ enabled: m.getProvider('google').enabled, listed: m.listProviders().map((p) => p.key) })); });`;
  const stdout = run(script, {
    OAUTH_GOOGLE_CLIENT_ID: 'id',
    OAUTH_GOOGLE_CLIENT_SECRET: 'secret',
    OAUTH_GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/oauth/google/callback',
  });
  const result = JSON.parse(stdout);
  assert.equal(result.enabled, true);
  assert.deepEqual(result.listed, ['google']);
});

test('config/auth-providers.js: an unregistered provider key returns undefined', () => {
  const script = `import(${JSON.stringify(configUrl)})
    .then((m) => { process.stdout.write(JSON.stringify(m.getProvider('does-not-exist') === undefined)); });`;
  const stdout = run(script, {});
  assert.equal(stdout, 'true');
});

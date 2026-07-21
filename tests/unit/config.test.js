// Unit tests for config/app.js's fail-fast env validation (T002, ADR-0013).
// Each case spawns a fresh `node` process so the ESM module (which validates at import time
// and freezes a singleton) is re-evaluated per case instead of reusing Node's module cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const configUrl = pathToFileURL(path.join(repoRoot, 'config/app.js')).href;

const REQUIRED_KEYS = ['DATABASE_URL', 'SHORT_LINK_BASE_URL', 'SESSION_SECRET'];

// config/app.js begins with `import 'dotenv/config'`, which would otherwise load a real
// root .env (present so the Stop hook's bare `npm test` and mutation probe can run the
// integration suite) and repopulate the required keys these tests delete. Point
// DOTENV_CONFIG_PATH at a file that doesn't exist so dotenv loads nothing, keeping every
// child process's env deterministic regardless of whether a root .env exists.
const NONEXISTENT_DOTENV_PATH = path.join(repoRoot, '.env.__test-nonexistent__');

function runInChildProcess(overrides) {
  const env = { ...process.env };
  for (const key of REQUIRED_KEYS) delete env[key];
  env.DOTENV_CONFIG_PATH = NONEXISTENT_DOTENV_PATH;
  Object.assign(env, overrides);

  const script = `import(${JSON.stringify(configUrl)})
    .then((m) => { process.stdout.write(JSON.stringify(m.default)); })
    .catch((e) => { process.stderr.write(e.message); process.exitCode = 1; });`;

  try {
    const stdout = execFileSync(process.execPath, ['-e', script], {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
    });
    return { ok: true, stdout };
  } catch (err) {
    return { ok: false, stderr: String(err.stderr || '') };
  }
}

test('config/app.js: fails fast with a clear message when required env vars are missing (ADR-0013)', () => {
  const result = runInChildProcess({});
  assert.equal(result.ok, false);
  for (const key of REQUIRED_KEYS) {
    assert.match(result.stderr, new RegExp(key));
  }
});

test('config/app.js: loads a frozen config object when required env vars are present (AC-8, AC-6, AC-12)', () => {
  const result = runInChildProcess({
    DATABASE_URL: 'postgresql://root@/tinylink_test?host=/var/run/postgresql',
    SHORT_LINK_BASE_URL: 'http://localhost:3000',
    SESSION_SECRET: 'test-only-secret',
  });
  assert.equal(result.ok, true);
  const config = JSON.parse(result.stdout);
  assert.equal(config.shortLinkBaseUrl, 'http://localhost:3000');
  // Ledger #12 default retry cap and AC-12's config-backed latency budget default.
  assert.equal(config.codeRetryMax, 10);
  assert.equal(config.redirectP95BudgetMs, 100);
});

test('config/app.js: CODE_RETRY_MAX and REDIRECT_P95_BUDGET_MS are overridable via env (Ledger #12, AC-12)', () => {
  const result = runInChildProcess({
    DATABASE_URL: 'postgresql://root@/tinylink_test?host=/var/run/postgresql',
    SHORT_LINK_BASE_URL: 'http://localhost:3000',
    SESSION_SECRET: 'test-only-secret',
    CODE_RETRY_MAX: '3',
    REDIRECT_P95_BUDGET_MS: '250',
    PORT: '8080',
  });
  assert.equal(result.ok, true);
  const config = JSON.parse(result.stdout);
  assert.equal(config.codeRetryMax, 3);
  assert.equal(config.redirectP95BudgetMs, 250);
  assert.equal(config.port, 8080);
});

test('config/app.js: rejects a non-integer CODE_RETRY_MAX with a clear message', () => {
  const result = runInChildProcess({
    DATABASE_URL: 'postgresql://root@/tinylink_test?host=/var/run/postgresql',
    SHORT_LINK_BASE_URL: 'http://localhost:3000',
    SESSION_SECRET: 'test-only-secret',
    CODE_RETRY_MAX: 'not-a-number',
  });
  assert.equal(result.ok, false);
  assert.match(result.stderr, /CODE_RETRY_MAX/);
  assert.match(result.stderr, /integer/);
});

test('config/app.js: treats an empty-string required var the same as missing (fails fast)', () => {
  const env = { ...process.env };
  for (const key of REQUIRED_KEYS) delete env[key];
  env.DOTENV_CONFIG_PATH = NONEXISTENT_DOTENV_PATH;
  Object.assign(env, {
    DATABASE_URL: 'postgresql://root@/tinylink_test?host=/var/run/postgresql',
    SHORT_LINK_BASE_URL: '',
    SESSION_SECRET: 'test-only-secret',
  });
  const script = `import(${JSON.stringify(configUrl)})
    .then(() => { process.stdout.write('loaded'); })
    .catch((e) => { process.stderr.write(e.message); process.exitCode = 1; });`;
  assert.throws(() => {
    execFileSync(process.execPath, ['-e', script], { cwd: repoRoot, env, encoding: 'utf8' });
  });
});

test('config/app.js: OAuth provider credentials are optional and undefined when unset (Ledger #18)', () => {
  const result = runInChildProcess({
    DATABASE_URL: 'postgresql://root@/tinylink_test?host=/var/run/postgresql',
    SHORT_LINK_BASE_URL: 'http://localhost:3000',
    SESSION_SECRET: 'test-only-secret',
  });
  assert.equal(result.ok, true);
  const config = JSON.parse(result.stdout);
  assert.equal(config.oauth.google.clientId, undefined);
});

test('config/app.js: reads Google OAuth credentials from env when present (Ledger #18)', () => {
  const result = runInChildProcess({
    DATABASE_URL: 'postgresql://root@/tinylink_test?host=/var/run/postgresql',
    SHORT_LINK_BASE_URL: 'http://localhost:3000',
    SESSION_SECRET: 'test-only-secret',
    OAUTH_GOOGLE_CLIENT_ID: 'test-client-id',
    OAUTH_GOOGLE_CLIENT_SECRET: 'test-client-secret',
    OAUTH_GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/oauth/google/callback',
  });
  assert.equal(result.ok, true);
  const config = JSON.parse(result.stdout);
  assert.equal(config.oauth.google.clientId, 'test-client-id');
});

// Loads and validates process.env into a single frozen config object (ADR-0013, T002).
// Application code MUST import this module and never read process.env directly, so every
// hardcoded-secret and missing-required-var failure has one place to look.
//
// Dev/local values come from a gitignored `.env` file loaded via `dotenv` (ADR-0013); CI and
// production supply real environment variables, so `dotenv/config` is a no-op there when no
// `.env` file is present.
import 'dotenv/config';

const NODE_ENV = process.env.NODE_ENV || 'development';
const isTest = NODE_ENV === 'test';

// Required in every environment: no secret or connection string is ever hardcoded (ADR-0013).
const REQUIRED_KEYS = ['DATABASE_URL', 'SHORT_LINK_BASE_URL', 'SESSION_SECRET'];

function readEnv(key, { required = false, fallback } = {}) {
  const raw = process.env[key];
  if (raw === undefined || raw === '') {
    if (required) {
      // Fail fast with a clear message rather than surfacing a confusing runtime error later.
      throw new Error(
        `config/app.js: missing required environment variable "${key}". ` +
          'Copy config/.env.example to .env and set it (see ADR-0013).'
      );
    }
    return fallback;
  }
  return raw;
}

function readIntEnv(key, { required = false, fallback } = {}) {
  const raw = readEnv(key, { required, fallback: fallback === undefined ? undefined : String(fallback) });
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`config/app.js: environment variable "${key}" must be an integer, got "${raw}".`);
  }
  return parsed;
}

function validateRequired() {
  // Skip DATABASE_URL/SESSION_SECRET enforcement only in-process unit tests that never touch
  // this module; integration tests and every real environment must set them explicitly.
  const missing = REQUIRED_KEYS.filter((key) => {
    const raw = process.env[key];
    return raw === undefined || raw === '';
  });
  if (missing.length > 0) {
    throw new Error(
      `config/app.js: missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy config/.env.example to .env and set them (see ADR-0013).'
    );
  }
}

validateRequired();

// AC-8/Ledger #15: fully-qualified short URL host, environment-configurable, never hardcoded.
const SHORT_LINK_BASE_URL = readEnv('SHORT_LINK_BASE_URL', { required: true }).replace(/\/+$/, '');

// AC-6/Ledger #12: collision-retry cap for short-code generation (ADR-0010).
const CODE_RETRY_MAX = readIntEnv('CODE_RETRY_MAX', { required: false, fallback: 10 });

// AC-12: redirect p95 server-time latency budget, threshold behind config, not hardcoded.
const REDIRECT_P95_BUDGET_MS = readIntEnv('REDIRECT_P95_BUDGET_MS', { required: false, fallback: 100 });

const config = {
  nodeEnv: NODE_ENV,
  isTest,
  port: readIntEnv('PORT', { required: false, fallback: 3000 }),

  // ADR-0004: pg Pool DSN. Socket peer-auth locally (e.g. postgresql:///tinylink); real
  // credentials only via env in CI/prod.
  databaseUrl: readEnv('DATABASE_URL', { required: true }),

  shortLinkBaseUrl: SHORT_LINK_BASE_URL,
  codeRetryMax: CODE_RETRY_MAX,
  redirectP95BudgetMs: REDIRECT_P95_BUDGET_MS,

  // ADR-0009: signs/derives session-id handling. Never logged, never returned in a response.
  sessionSecret: readEnv('SESSION_SECRET', { required: true }),

  // Ledger #18 / ADR-0009: Google OAuth credentials, required only when Google auth is
  // enabled by config/auth-providers.js — validated there, not here, so this module stays
  // provider-agnostic.
  oauth: {
    google: {
      clientId: readEnv('OAUTH_GOOGLE_CLIENT_ID', { required: false }),
      clientSecret: readEnv('OAUTH_GOOGLE_CLIENT_SECRET', { required: false }),
      redirectUri: readEnv('OAUTH_GOOGLE_REDIRECT_URI', { required: false }),
    },
  },
};

export default Object.freeze(config);

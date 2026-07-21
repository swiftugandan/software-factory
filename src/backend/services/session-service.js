// Session helper (T009, AC-2, ADR-0009). Issues a `sessions` row keyed by a random opaque
// token (never the sequential id — Ledger #29) and sets the session cookie on the response.
import { insertSession } from '../db/sessions-repo.js';
import { generateSessionToken } from '../lib/session-token.js';
import appConfig from '../../../config/app.js';

export const SESSION_COOKIE_NAME = 'tinylink_session';

// Gap (logged to docs/assumptions.md, owner build-backend): neither the PRD nor ADR-0009
// states a session lifetime. A fixed 30-day expiry from issuance is a common, conservative
// default for a low-sensitivity link-management tool; cheap/reversible — a config knob can
// replace this constant with no schema change (`sessions.expires_at` already exists).
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Gap (logged to docs/assumptions.md, owner build-backend): ADR-0009 fixes
// `HttpOnly; Secure; SameSite=Lax; Path=/` on the session cookie, but a `Secure` cookie is
// never sent back by a browser (or supertest's cookie jar) over plain HTTP, which is how this
// app runs locally/in CI/tests (ADR-0007). `secure` is therefore true only in production;
// `HttpOnly`/`SameSite=Lax`/`Path=/` stay fixed as ADR-0009 requires.
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: appConfig.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

/**
 * Inserts a session row for `memberId` with a fresh random token and sets the session
 * cookie on `res`. Returns the issued token (mainly useful to tests).
 * @param {import('express').Response} res
 * @param {number|string} memberId
 */
export async function issueSession(res, memberId) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await insertSession({ memberId, token, expiresAt });
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return token;
}

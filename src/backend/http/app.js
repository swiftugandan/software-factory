// Express app factory (ADR-0002, ADR-0006). Builds the app but never listens — so tests can
// import/mount it with supertest with no open port (ADR-0007) — and mounts routers +
// middleware in the fixed order ADR-0002 decides: body parsing -> cookie/session resolver
// (ADR-0009) -> route handlers -> centralized error handler (ADR-0008), mounted last.
//
// Later build-backend tasks (T013+) extend this factory with the links/redirect routers;
// `app.locals.requireAuth` exposes T012's auth-required middleware so those routers reuse the
// same instance rather than re-deciding auth.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import resolveCurrentMember from './middleware/resolve-current-member.js';
import requireAuth from './middleware/require-auth.js';
import createAuthRouter from './routers/auth-router.js';
import createLinksRouter from './routers/links-router.js';
import createPagesRouter from './routers/pages-router.js';
import createRedirectRouter from './routers/redirect-router.js';
import errorHandler from './error-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ADR-0003/ADR-0006: EJS templates in src/frontend/views, static assets in
// src/frontend/public — from src/backend/http/, that is two levels up then into frontend/.
const VIEWS_DIR = path.join(__dirname, '../../frontend/views');
const PUBLIC_DIR = path.join(__dirname, '../../frontend/public');

/**
 * @param {object} [overrides] dependency-injection seam for tests (ADR-0009: OAuth/DB clients
 *   are injected so tests never hit a real network).
 * @param {object} [overrides.authService]
 * @param {object} [overrides.oauthService]
 * @param {object} [overrides.linksService] T015 DI seam (e.g. a stub generator to exercise the
 *   AC-6 collision-retry path deterministically without real collisions).
 * @param {object} [overrides.redirectService] T017-T020 DI seam (e.g. a failing click
 *   recorder to exercise the AC-16 best-effort path deterministically).
 * @param {Function} [overrides.findActiveSessionByToken]
 * @param {Function} [overrides.findMemberById]
 */
export default function createApp({
  authService,
  oauthService,
  linksService,
  redirectService,
  findActiveSessionByToken,
  findMemberById,
} = {}) {
  const app = express();
  app.disable('x-powered-by');

  // T024-T028 (ADR-0003): server-rendered EJS pages, same Express process as the JSON API.
  app.set('view engine', 'ejs');
  app.set('views', VIEWS_DIR);
  // Mounted under /assets (not root) so static files can never be shadowed by, or shadow,
  // the public GET /:code redirect namespace (ADR-0002/ADR-0008).
  app.use('/assets', express.static(PUBLIC_DIR));

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use(resolveCurrentMember({ findActiveSessionByToken, findMemberById }));

  app.use(createAuthRouter({ authService, oauthService }));
  app.use(createLinksRouter({ linksService, requireAuth }));
  // T024-T028: HTML pages live under explicit /app/* paths so they can never collide with the
  // JSON API (/links, /auth/*) or be shadowed by, or shadow, the public /:code redirect.
  app.use(createPagesRouter({ authService, linksService }));
  // T017-T020 (ADR-0002, ADR-0008): registered LAST among routes, and never behind
  // requireAuth, so the public redirect can't shadow /auth/*, /links, or /app/* and stays
  // auth-free.
  app.use(createRedirectRouter({ redirectService }));

  app.locals.requireAuth = requireAuth;

  app.use(errorHandler);

  return app;
}

// Server-rendered UI pages (ADR-0003, T024-T028). Distinct `/app/*` paths, not `/links` or
// `/auth/*`, so the HTML dashboard/forms can never collide with the JSON API (ADR-0008) or be
// shadowed by the public `GET /:code` redirect (registered last in app.js, ADR-0002). Gap
// logged to docs/assumptions.md (owner build-frontend): disambiguation approach and why
// distinct paths were chosen over content-negotiation.
//
// Pages call the same service layer the JSON API routers use (ADR-0003's "thin page routes"
// option) rather than making an internal HTTP round-trip to `/auth/sign-in` or `/links`, so
// there is exactly one source of truth for the business logic and no risk of the page and API
// contracts drifting.
import { Router } from 'express';
import { createAuthService } from '../../services/auth-service.js';
import { createLinksService } from '../../services/links-service.js';
import requireAuthPageDefault from '../middleware/require-auth-page.js';
import { sanitizeReturnTo } from '../../lib/return-to.js';
import { ValidationError, RetryExhaustedError, UnauthenticatedError } from '../../lib/errors.js';
import appConfig from '../../../../config/app.js';

const DEFAULT_LANDING = '/app/links';

/**
 * Builds the fully-qualified short URL the same way the JSON API does (T016, Ledger #15) — a
 * small local copy rather than importing links-router.js, so this page-only router has no
 * dependency on the JSON router module.
 * @param {string} code
 */
function buildShortUrl(code) {
  return `${appConfig.shortLinkBaseUrl}/${code}`;
}

function serializeLink(link) {
  return {
    code: link.code,
    short_url: buildShortUrl(link.code),
    long_url: link.long_url,
    created_at: new Date(link.created_at).toISOString(),
  };
}

export default function createPagesRouter({
  authService,
  linksService,
  requireAuthPage = requireAuthPageDefault,
} = {}) {
  const resolvedAuthService = authService || createAuthService();
  const resolvedLinksService = linksService || createLinksService();
  const router = Router();

  // T024 (AC-2): sign-in page.
  router.get('/app/sign-in', (req, res) => {
    const next = sanitizeReturnTo(req.query.next);

    // Least-surprise UX (WF-1 "already-authenticated member re-visits sign-in"): redirect
    // straight through rather than re-prompting.
    if (req.member) {
      res.redirect(next || DEFAULT_LANDING);
      return;
    }

    res.render('sign-in', { error: null, email: '', next: next || '' });
  });

  // T024 (AC-2, Ledger #14, Ledger #16): email/password sign-in form submit.
  router.post('/app/sign-in', async (req, res, next) => {
    const { email, password } = req.body || {};
    const returnTo = sanitizeReturnTo(req.body && req.body.next);

    try {
      await resolvedAuthService.signInWithPassword({ email, password, res });
      res.redirect(returnTo || DEFAULT_LANDING);
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        // Same generic message the JSON API returns (ADR-0008/Ledger #14) — no account
        // enumeration, no session created.
        res.status(401).render('sign-in', {
          error: err.message,
          email: email || '',
          next: returnTo || '',
        });
        return;
      }
      next(err);
    }
  });

  // T025/T026 (AC-1, AC-4, AC-5): create-link page.
  router.get('/app/links/new', requireAuthPage, (req, res) => {
    res.render('links-new', { error: null, longUrl: '', result: null });
  });

  router.post('/app/links/new', requireAuthPage, async (req, res, next) => {
    const { longUrl } = req.body || {};

    try {
      const link = await resolvedLinksService.create({ memberId: req.member.id, longUrl });
      // T026 (AC-8): renders the short code, short_url, long_url, and created_at from the
      // create response.
      res.status(201).render('links-new', { error: null, longUrl: '', result: serializeLink(link) });
    } catch (err) {
      if (err instanceof ValidationError) {
        // T026 (AC-5): the 422 validation message renders inline; no link is created.
        res.status(422).render('links-new', { error: err.message, longUrl: longUrl || '', result: null });
        return;
      }
      if (err instanceof RetryExhaustedError) {
        res.status(503).render('links-new', {
          error: 'could not create your link right now, please try again',
          longUrl: longUrl || '',
          result: null,
        });
        return;
      }
      next(err);
    }
  });

  // T025/T027/T028 (AC-1, AC-17, AC-18, AC-19, AC-20, AC-21): link list/dashboard page.
  router.get('/app/links', requireAuthPage, async (req, res, next) => {
    try {
      const { links, page, hasNext } = await resolvedLinksService.list({
        memberId: req.member.id,
        page: req.query.page,
      });

      res.render('links-index', {
        links: links.map((link) => ({
          ...serializeLink(link),
          // AC-21: zero clicks renders as the number 0, never blank/null.
          click_count: Number(link.click_count),
        })),
        page,
        hasNext,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// Public redirect endpoint (T017-T020, ADR-0008 fixed route: `GET /:code` -> 302). Registered
// app-level in app.js AFTER the `/auth/*` and `/links` routers (ADR-0002) so this route can
// never shadow them — `:code` (path-to-regexp) only ever matches a single non-slash path
// segment, so multi-segment paths like `/auth/sign-in` or `/auth/oauth/:provider/callback`
// never reach here, and this route carries NO auth middleware (AC-10: the redirect is
// public).
import { Router } from 'express';
import { createRedirectService as createRedirectServiceDefault } from '../../services/redirect-service.js';
import { startTimer } from '../../lib/server-timing.js';

export default function createRedirectRouter({ redirectService } = {}) {
  const resolvedRedirectService = redirectService || createRedirectServiceDefault();
  const router = Router();

  router.get('/:code', async (req, res, next) => {
    const elapsedMs = startTimer();
    try {
      const { longUrl } = await resolvedRedirectService.resolve(req.params.code);
      // T020 (AC-12): server-time instrumentation exposed via a response header so it can be
      // measured/asserted against config.redirectP95BudgetMs without external load tooling.
      res.setHeader('X-Redirect-Server-Time-Ms', elapsedMs().toFixed(3));
      // T018 (AC-9): 302 with Location set to the stored long URL, unchanged (Ledger #17) —
      // res.redirect never appends this request's query string/fragment.
      res.redirect(302, longUrl);
    } catch (err) {
      res.setHeader('X-Redirect-Server-Time-Ms', elapsedMs().toFixed(3));
      next(err);
    }
  });

  return router;
}

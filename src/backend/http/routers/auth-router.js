// Auth endpoints (ADR-0008 fixed routes): `POST /auth/sign-in` (T010) and
// `GET /auth/oauth/:provider` + `GET /auth/oauth/:provider/callback` (T011).
import { Router } from 'express';
import { createAuthService } from '../../services/auth-service.js';
import { createOauthService } from '../../services/oauth-service.js';

export default function createAuthRouter({ authService, oauthService } = {}) {
  const resolvedAuthService = authService || createAuthService();
  const resolvedOauthService = oauthService || createOauthService();
  const router = Router();

  router.post('/auth/sign-in', async (req, res, next) => {
    try {
      const { email, password } = req.body || {};
      const member = await resolvedAuthService.signInWithPassword({ email, password, res });
      res.status(200).json({ member: { id: member.id, email: member.email } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/auth/oauth/:provider', (req, res, next) => {
    try {
      const authorizeUrl = resolvedOauthService.getAuthorizeUrl(req.params.provider);
      res.redirect(authorizeUrl);
    } catch (err) {
      next(err);
    }
  });

  router.get('/auth/oauth/:provider/callback', async (req, res, next) => {
    try {
      await resolvedOauthService.handleCallback(
        req.params.provider,
        { code: req.query.code, error: req.query.error },
        res
      );
      // Ledger #16 default landing spot: the HTML dashboard page (T024/T027), not the JSON
      // GET /links API. A validated in-app return-to threaded through the OAuth roundtrip
      // itself remains out of scope (see docs/assumptions.md).
      res.redirect('/app/links');
    } catch (err) {
      next(err);
    }
  });

  return router;
}

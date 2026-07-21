// Auth-required middleware (T012, AC-1). Requests to link-creation/link-list endpoints
// without a valid session get HTTP 401 `unauthenticated` (via the centralized error handler,
// ADR-0008) and the wrapped handler never runs, so no create/read of link data occurs.
// `GET /:code` is exempt (AC-10) by simply not being wired to this middleware.
import { UnauthenticatedError } from '../../lib/errors.js';

export default function requireAuth(req, res, next) {
  if (!req.member) {
    next(new UnauthenticatedError());
    return;
  }
  next();
}

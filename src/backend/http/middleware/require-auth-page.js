// Route guard for member-only HTML pages (T025, AC-1). Unlike the JSON `requireAuth`
// middleware (T012, 401), an unauthenticated visit to a member-only page redirects to the
// sign-in page, preserving the originally requested page as a validated in-app-only
// return-to query param (Ledger #16) so a successful sign-in lands the member back where they
// asked to go. No create/read of link data occurs before this guard runs (mounted before the
// page handler, same ordering guarantee as ADR-0002's requireAuth).
import { sanitizeReturnTo } from '../../lib/return-to.js';

export default function requireAuthPage(req, res, next) {
  if (!req.member) {
    // `req.originalUrl` is always a same-origin relative path already, but it is still run
    // through the shared sanitizer for one consistent validation seam (defense in depth).
    const target = sanitizeReturnTo(req.originalUrl) || '/app/links';
    res.redirect(`/app/sign-in?next=${encodeURIComponent(target)}`);
    return;
  }
  next();
}

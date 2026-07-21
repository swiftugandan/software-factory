// Session-resolver middleware (T009, AC-2, ADR-0009). Reads the session cookie, looks up a
// non-expired session, and attaches `req.member` (or leaves it `null`). Expired/absent
// sessions are treated as unauthenticated, never an error. Mounted before route handlers,
// after body parsing (ADR-0002 fixed middleware order).
import { findActiveSessionByToken as findActiveSessionByTokenDefault } from '../../db/sessions-repo.js';
import { findById as findMemberByIdDefault } from '../../db/members-repo.js';
import { parseCookieHeader } from '../../lib/cookies.js';
import { SESSION_COOKIE_NAME } from '../../services/session-service.js';

export default function resolveCurrentMember({
  findActiveSessionByToken = findActiveSessionByTokenDefault,
  findMemberById = findMemberByIdDefault,
} = {}) {
  return async function resolveCurrentMemberMiddleware(req, res, next) {
    req.member = null;

    const cookies = parseCookieHeader(req.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];

    if (!token) {
      next();
      return;
    }

    try {
      const session = await findActiveSessionByToken(token);
      if (session) {
        const member = await findMemberById(session.member_id);
        if (member) req.member = member;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

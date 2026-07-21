// Links endpoints (ADR-0008 fixed routes). `POST /links` — create (T015, AC-4/AC-6/AC-7),
// require auth (T012); response shape is T016 (AC-8, AC-22). `GET /links` — list (T021-T023,
// AC-17..AC-21, AC-23, AC-3, AC-14), also auth-required (T012).
import { Router } from 'express';
import { createLinksService } from '../../services/links-service.js';
import requireAuthDefault from '../middleware/require-auth.js';
import appConfig from '../../../../config/app.js';

/**
 * Builds the fully-qualified short URL from the config seam (ADR-0013, Ledger #15) — codes
 * are host-independent (ADR-0010), so the base host is applied only at response time.
 * @param {string} code
 */
function buildShortUrl(code) {
  return `${appConfig.shortLinkBaseUrl}/${code}`;
}

export default function createLinksRouter({ linksService, requireAuth = requireAuthDefault } = {}) {
  const resolvedLinksService = linksService || createLinksService();
  const router = Router();

  router.post('/links', requireAuth, async (req, res, next) => {
    try {
      const { longUrl } = req.body || {};
      const link = await resolvedLinksService.create({ memberId: req.member.id, longUrl });

      // T016 (AC-8, AC-22): 201 with code, short_url, long_url, created_at (UTC ISO),
      // per ADR-0008 line 30 (snake_case success bodies).
      res.status(201).json({
        code: link.code,
        short_url: buildShortUrl(link.code),
        long_url: link.long_url,
        created_at: new Date(link.created_at).toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/links', requireAuth, async (req, res, next) => {
    try {
      // T021 (AC-3, AC-17, AC-23): scoped strictly to the authenticated member — never a
      // param a client can override — so this can never disclose another member's links.
      const { links, page, pageSize, hasNext } = await resolvedLinksService.list({
        memberId: req.member.id,
        page: req.query.page,
      });

      // T021 (AC-8-consistent shape, AC-21): snake_case list body per ADR-0008 line 31
      // `{ links, page, page_size, has_next }`; each link mirrors the create response shape
      // plus `click_count` (AC-21: zero renders as the number 0, never null).
      res.status(200).json({
        links: links.map((link) => ({
          code: link.code,
          short_url: buildShortUrl(link.code),
          long_url: link.long_url,
          created_at: new Date(link.created_at).toISOString(),
          click_count: Number(link.click_count),
        })),
        page,
        page_size: pageSize,
        has_next: hasNext,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// Redirect resolution service (T017-T019, AC-9, AC-10, AC-11, AC-13, AC-15, AC-16, AC-22,
// AC-23; ADR-0008, ADR-0011, ADR-0012). Resolves a short code to its stored long URL and
// records a best-effort click, without ever conditioning the redirect on click persistence.
import { isValidCodeShape as isValidCodeShapeDefault } from '../lib/code-shape.js';
import { findActiveByCode as findActiveByCodeDefault } from '../db/links-repo.js';
import { insertClickEvent as insertClickEventDefault } from '../db/click-events-repo.js';
import { NotFoundError } from '../lib/errors.js';

/**
 * @param {object} [overrides] DI seam for tests (e.g. a failing `insertClickEvent` to
 *   exercise AC-16 deterministically).
 * @param {(code: unknown) => boolean} [overrides.isValidCodeShape]
 * @param {Function} [overrides.findActiveByCode]
 * @param {Function} [overrides.insertClickEvent]
 * @param {(err: Error) => void} [overrides.onClickRecordError] swallowed-error hook (logging
 *   seam); never rethrown, so it can never turn into a blocked/delayed redirect.
 */
export function createRedirectService({
  isValidCodeShape = isValidCodeShapeDefault,
  findActiveByCode = findActiveByCodeDefault,
  insertClickEvent = insertClickEventDefault,
  onClickRecordError = (err) => {
    console.error('redirect-service: click recording failed (AC-16: redirect still served)', err);
  },
} = {}) {
  return {
    /**
     * @param {unknown} code
     * @returns {Promise<{ longUrl: string }>}
     */
    async resolve(code) {
      // T017 (AC-11, AC-15): malformed codes short-circuit BEFORE any DB lookup or click.
      if (!isValidCodeShape(code)) {
        throw new NotFoundError();
      }

      // T018 (AC-9, AC-11, AC-23, ADR-0012): only an active (non-soft-deleted) link
      // resolves; a missing or soft-deleted code both 404 identically (no click recorded).
      const link = await findActiveByCode(code);
      if (!link) {
        throw new NotFoundError();
      }

      // T019 (AC-13, AC-16, AC-22, ADR-0011): best-effort synchronous insert — a transient
      // failure is caught/logged here and never propagates, so it can never block or delay
      // the 302 the caller is about to send (availability over accuracy).
      try {
        await insertClickEvent({ linkId: link.id });
      } catch (err) {
        onClickRecordError(err);
      }

      // Ledger #17: the caller redirects to this value UNCHANGED — no request query
      // string/fragment is ever appended or forwarded.
      return { longUrl: link.long_url };
    },
  };
}

export default createRedirectService;

// Create-a-short-link service (T015, AC-4, AC-6, AC-7, ADR-0010). Validates the long URL
// (T013), generates a candidate code (T014) and inserts it (links-repo), retrying on a
// unique-violation (`23505`) up to the configured `retryMax` (Ledger #12) — the DB unique
// constraint (T007) is the source of truth for uniqueness, never an application-level
// pre-check (TOCTOU-safe, ADR-0010). Exhausting the budget throws `RetryExhaustedError`
// (-> 503, ADR-0008) with no row persisted. Each call is one independent insert, so repeated
// submissions of the same long URL each yield their own distinct link (AC-7).
import { validateLongUrl as validateLongUrlDefault } from '../lib/url-validator.js';
import { generateCode as generateCodeDefault } from '../lib/code-generator.js';
import {
  insertLink as insertLinkDefault,
  findActiveByMemberIdPaginated as findActiveByMemberIdPaginatedDefault,
  UNIQUE_VIOLATION,
} from '../db/links-repo.js';
import linkGenerationConfigDefault from '../../../config/link-generation.js';
import { RetryExhaustedError } from '../lib/errors.js';

// T023 (AC-19, ADR-0008 line 31): page size is fixed at 25 by the API contract, not an
// environment-tunable value, so it is a plain constant rather than a config/ seam.
export const PAGE_SIZE = 25;

/**
 * Normalizes the `?page=` query param (T023, AC-19, Ledger #13). Only a strictly-positive
 * integer string (`/^[1-9]\d*$/`) is accepted; anything else — missing, non-numeric,
 * negative, zero, decimal, or otherwise malformed — normalizes to page 1 rather than
 * erroring, so a bad page param degrades gracefully instead of 400ing (narrowest reading
 * consistent with AC-20's "out-of-range page still 200s" behavior).
 * @param {unknown} rawPage
 * @returns {number}
 */
export function normalizePage(rawPage) {
  if (typeof rawPage !== 'string' || !/^[1-9]\d*$/.test(rawPage)) {
    return 1;
  }
  return Number.parseInt(rawPage, 10);
}

export function createLinksService({
  validateLongUrl = validateLongUrlDefault,
  generateCode = generateCodeDefault,
  insertLink = insertLinkDefault,
  findActiveByMemberIdPaginated = findActiveByMemberIdPaginatedDefault,
  linkGenerationConfig = linkGenerationConfigDefault,
} = {}) {
  return {
    /**
     * @param {{ memberId: number|string, longUrl: string }} params
     * @returns {Promise<{ id, member_id, code, long_url, created_at }>}
     */
    async create({ memberId, longUrl }) {
      const validatedUrl = validateLongUrl(longUrl);

      // Gap (logged to docs/assumptions.md, owner build-backend): ADR-0010/Ledger #12 cap
      // "retries" at CODE_RETRY_MAX without pinning whether that counts total insert attempts
      // or attempts after the first. Treating it as the total insert-attempt budget is the
      // narrower reading (fewer DB round-trips before 503) and keeps the single `retryMax`
      // config knob (config/link-generation.js) as the one place to flip it.
      const maxAttempts = linkGenerationConfig.retryMax;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const code = generateCode();
        try {
          // Sequential retry-on-collision is intentional (ADR-0010): each attempt must see the
          // outcome of the previous insert before generating the next candidate.
          return await insertLink({ memberId, code, longUrl: validatedUrl });
        } catch (err) {
          if (!(err && err.code === UNIQUE_VIOLATION)) {
            throw err;
          }
          // Collision: loop again with a freshly generated candidate (AC-6).
        }
      }

      throw new RetryExhaustedError();
    },

    /**
     * T021-T023 (AC-17, AC-18, AC-19, AC-20, AC-21, AC-23, AC-3, AC-14): lists the
     * requester's own active links, newest-first, 25/page, each with an aggregated click
     * count. Fetches `PAGE_SIZE + 1` rows so `has_next` is derivable without a second COUNT
     * query, then trims back to `PAGE_SIZE` before returning (AC-19).
     * @param {{ memberId: number|string, page: unknown }} params
     * @returns {Promise<{ links: Array, page: number, pageSize: number, hasNext: boolean }>}
     */
    async list({ memberId, page }) {
      const normalizedPage = normalizePage(page);
      const offset = (normalizedPage - 1) * PAGE_SIZE;

      const rows = await findActiveByMemberIdPaginated({
        memberId,
        limit: PAGE_SIZE + 1,
        offset,
      });

      const hasNext = rows.length > PAGE_SIZE;
      const links = hasNext ? rows.slice(0, PAGE_SIZE) : rows;

      return { links, page: normalizedPage, pageSize: PAGE_SIZE, hasNext };
    },
  };
}

export default createLinksService;

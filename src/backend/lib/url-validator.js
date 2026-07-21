// URL validator (T013, AC-5). Pure function: reject empty, non-absolute, non-http(s)-scheme,
// or >2048-character URLs. Callers (the create-link handler, T015) map the returned
// ValidationError to HTTP 422 via the centralized error handler (ADR-0008); this module never
// touches the DB, so validation runs before any row is created.
import { ValidationError } from './errors.js';

// Matches the `long_url varchar(2048)` column width (T007) so a validator pass guarantees the
// value fits the schema.
const MAX_LENGTH = 2048;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Validates a candidate long URL per AC-5. Returns the trimmed URL string on success or throws
 * a `ValidationError` (-> 422, ADR-0008) on any failure.
 * @param {unknown} value
 * @returns {string}
 */
export function validateLongUrl(value) {
  const fields = ['longUrl'];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError('longUrl is required', fields);
  }

  const trimmed = value.trim();

  if (trimmed.length > MAX_LENGTH) {
    throw new ValidationError(`longUrl must be at most ${MAX_LENGTH} characters`, fields);
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    // Not a valid absolute URL (e.g. a bare path/relative reference).
    throw new ValidationError('longUrl must be an absolute http(s) URL', fields);
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new ValidationError('longUrl must use the http or https scheme', fields);
  }

  return trimmed;
}

export default { validateLongUrl };

// Centralized error-mapping middleware (ADR-0008). Handlers/services throw typed domain
// errors; this is the single place that maps them to a status + the uniform
// `{ error: { code, message } }` body. Unmapped errors -> 500, generic body, no internal
// detail leaked. Mounted last (ADR-0002 fixed middleware order).
import { ValidationError, NotFoundError, UnauthenticatedError, RetryExhaustedError } from '../lib/errors.js';

const MAPPINGS = [
  { type: ValidationError, status: 422, code: 'validation_error' },
  { type: NotFoundError, status: 404, code: 'not_found' },
  { type: UnauthenticatedError, status: 401, code: 'unauthenticated' },
  { type: RetryExhaustedError, status: 503, code: 'retry_exhausted' },
];

// `next` is required (unused) so Express recognizes this as 4-arity error-handling middleware.
export default function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const mapping = MAPPINGS.find((entry) => err instanceof entry.type);

  if (mapping) {
    const body = { error: { code: mapping.code, message: err.message } };
    if (err instanceof ValidationError && err.fields && err.fields.length > 0) {
      body.error.fields = err.fields;
    }
    res.status(mapping.status).json(body);
    return;
  }

  // Unmapped errors are logged server-side only; no-console is disabled in eslint.config.js.
  console.error(err);
  res.status(500).json({ error: { code: 'internal_error', message: 'internal server error' } });
}

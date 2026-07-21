// Return-to sanitizer (T024/T025, AC-1, AC-2, Ledger #16). The only thing a return-to value is
// ever used for is a same-origin `res.redirect()` on the server; this validates it is an
// in-app-only relative path so a crafted `?next=` query param can never send a member to an
// external host after signing in (open-redirect prevention). Never accept a scheme, a
// protocol-relative URL (`//host/...`), or a backslash-based bypass.
const ABSOLUTE_SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

/**
 * @param {unknown} raw candidate return-to value (query string or form field)
 * @returns {string|null} the validated in-app relative path, or null if invalid/absent
 */
export function sanitizeReturnTo(raw) {
  if (typeof raw !== 'string') return null;

  const value = raw.trim();
  if (value.length === 0) return null;

  // Must be a same-origin relative path: starts with exactly one '/'.
  if (!value.startsWith('/')) return null;
  // Protocol-relative ("//evil.com") and backslash tricks ("/\evil.com", browsers normalize
  // backslashes to forward slashes) both resolve to a different origin — reject both.
  if (value.startsWith('//') || value.startsWith('/\\') || value.includes('\\')) return null;
  // Defense in depth: reject anything that still looks like it carries a URL scheme.
  if (ABSOLUTE_SCHEME_RE.test(value)) return null;

  return value;
}

export default { sanitizeReturnTo };

// Minimal request-cookie reader. Express 5 does not parse `Cookie` request headers itself,
// and this app deliberately adds no `cookie-parser` dependency (ADR-0001: keep the stack
// lean/no-build; `res.cookie()` for *setting* cookies already works via Express's existing
// `cookie` dependency, so only *reading* needs this handful of lines). See docs/assumptions.md
// for the logged gap/decision.
export function parseCookieHeader(header) {
  const cookies = {};
  if (!header || typeof header !== 'string') return cookies;

  for (const part of header.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex).trim();
    const rawValue = part.slice(eqIndex + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
  }

  return cookies;
}

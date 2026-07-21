// Reusable code-shape predicate (T017, AC-11, AC-15, ADR-0010). Pure, DB-free: a candidate
// code is well-formed only if it is exactly `codeLength` characters, all drawn from
// `alphabet` — both read from `config/link-generation.js` (T014's generation seam), so the
// redirect route's shape check can never drift from the generator's own shape. Callers
// (the redirect service/router, T018) must run this BEFORE any DB lookup so a malformed
// code never reaches the database and never records a click.
import linkGenerationConfigDefault from '../../../config/link-generation.js';

/**
 * @param {unknown} code
 * @param {{ codeLength: number, alphabet: string }} [config]
 * @returns {boolean}
 */
export function isValidCodeShape(code, config = linkGenerationConfigDefault) {
  if (typeof code !== 'string' || code.length !== config.codeLength) {
    return false;
  }
  for (let i = 0; i < code.length; i += 1) {
    if (!config.alphabet.includes(code[i])) {
      return false;
    }
  }
  return true;
}

export default { isValidCodeShape };

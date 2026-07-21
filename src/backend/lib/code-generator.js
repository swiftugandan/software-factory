// Short-code generator (T014, AC-4, ADR-0010). Reads shape (length/alphabet) from the
// `config/link-generation.js` seam rather than hardcoding literals, so the code format is
// reversible in one place. Uses `crypto.randomInt` for uniform, unbiased alphabet sampling
// (ADR-0010: no modulo bias).
import { randomInt } from 'node:crypto';
import linkGenerationConfig from '../../../config/link-generation.js';

/**
 * Generates a single candidate code using the given config (defaults to
 * `config/link-generation.js`). Injectable for unit tests that want a deterministic RNG.
 * @param {{ codeLength: number, alphabet: string }} [config]
 * @param {(max: number) => number} [randomIntFn] injection seam for tests: returns an integer
 *   in [0, max).
 * @returns {string}
 */
export function generateCode(config = linkGenerationConfig, randomIntFn = (max) => randomInt(max)) {
  const { codeLength, alphabet } = config;
  let code = '';
  for (let i = 0; i < codeLength; i += 1) {
    code += alphabet[randomIntFn(alphabet.length)];
  }
  return code;
}

export default { generateCode };

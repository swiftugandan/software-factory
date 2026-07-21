// Short-code generation seam (ADR-0010, Ledger #1/#12). Alphabet/length/retry-cap are
// config values, not literals, so the code shape can change without touching call sites or
// existing stored codes (codes are host-independent, ADR-0010).
import appConfig from './app.js';

// AC-4: 7-character base62 code, [0-9A-Za-z].
const CODE_LENGTH = 7;
const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const linkGenerationConfig = {
  codeLength: CODE_LENGTH,
  alphabet: BASE62_ALPHABET,
  // AC-6/Ledger #12: retry-on-collision cap; default 10, overridable via CODE_RETRY_MAX.
  retryMax: appConfig.codeRetryMax,
};

export default Object.freeze(linkGenerationConfig);

// Server-time instrumentation seam (T020, AC-12, ADR-0002). Pure/DB-free: a route handler
// starts a timer on entry and reads the elapsed milliseconds right before responding, so the
// redirect path's server-time can be measured/asserted against `config.redirectP95BudgetMs`
// (config/app.js) without external load tooling — callers surface it however they need to
// (e.g. a response header, as the redirect router does).
import { hrtime } from 'node:process';

/**
 * @returns {() => number} call the returned function to read elapsed milliseconds since
 *   `startTimer()` was called.
 */
export function startTimer() {
  const startedAt = hrtime.bigint();
  return function elapsedMs() {
    return Number(hrtime.bigint() - startedAt) / 1e6;
  };
}

export default { startTimer };

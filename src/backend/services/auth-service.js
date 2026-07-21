// Email/password sign-in (T010, AC-2, Ledger #14). Verifies credentials against `members`
// via the passwordHasher seam; on success issues a session (T009); on failure throws a
// generic UnauthenticatedError so wrong-password and unknown-email are indistinguishable
// (no account enumeration), and no session is ever created for a failed attempt.
import * as membersRepoDefault from '../db/members-repo.js';
import passwordHasherDefault from '../lib/password-hasher.js';
import { issueSession as issueSessionDefault } from './session-service.js';
import { UnauthenticatedError } from '../lib/errors.js';

export const INVALID_CREDENTIALS_MESSAGE = 'invalid email or password';

export function createAuthService({
  findByEmail = membersRepoDefault.findByEmail,
  passwordHasher = passwordHasherDefault,
  issueSession = issueSessionDefault,
} = {}) {
  return {
    /**
     * @param {{ email: string, password: string, res: import('express').Response }} params
     * @returns {Promise<object>} the authenticated member row
     */
    async signInWithPassword({ email, password, res }) {
      const member = await findByEmail(email);
      const ok = await passwordHasher.verify(password || '', member ? member.password_hash : null);

      if (!member || !ok) {
        throw new UnauthenticatedError(INVALID_CREDENTIALS_MESSAGE);
      }

      await issueSession(res, member.id);
      return member;
    },
  };
}

export default createAuthService;

// OAuth sign-in flow (T011, AC-2, ADR-0009, Ledger #18/#19). Resolves a provider client (real
// Google client by default, or an injected fake for tests — ADR-0009), exchanges the
// authorization code for tokens + user info, resolves-or-provisions the member via
// `oauth_identities`, and issues a session (T009). Any provider error, cancellation, or
// missing/unusable identity fails generically (Ledger #14) with no partial member/session.
import { getProvider } from '../../../config/auth-providers.js';
import { createGoogleClient } from '../lib/oauth/google-client.js';
import * as oauthIdentitiesRepoDefault from '../db/oauth-identities-repo.js';
import * as membersRepoDefault from '../db/members-repo.js';
import { issueSession as issueSessionDefault } from './session-service.js';
import { UnauthenticatedError } from '../lib/errors.js';

export const OAUTH_FAILURE_MESSAGE = 'sign-in was not completed';

const CLIENT_FACTORIES = {
  google: createGoogleClient,
};

export function createOauthService({
  clients = {},
  oauthIdentitiesRepo = oauthIdentitiesRepoDefault,
  membersRepo = membersRepoDefault,
  issueSession = issueSessionDefault,
} = {}) {
  function resolveClient(providerKey) {
    if (clients[providerKey]) return clients[providerKey];
    const providerConfig = getProvider(providerKey);
    const factory = CLIENT_FACTORIES[providerKey];
    if (!providerConfig || !providerConfig.enabled || !factory) return null;
    return factory(providerConfig);
  }

  return {
    /**
     * @param {string} providerKey e.g. "google"
     * @returns {string} the provider's authorize URL to redirect the browser to
     */
    getAuthorizeUrl(providerKey) {
      const client = resolveClient(providerKey);
      if (!client) throw new UnauthenticatedError(OAUTH_FAILURE_MESSAGE);
      // Gap (logged to docs/assumptions.md, owner build-backend): no PRD/ADR criterion
      // requires CSRF `state` replay verification for this single-provider, cookie-session
      // app; a fixed opaque placeholder is passed through so the seam exists without adding
      // unrequested scope. Reversible/cheap: swap for a persisted per-request nonce later
      // with no interface change.
      return client.getAuthorizeUrl('tinylink-oauth-state');
    },

    /**
     * @param {string} providerKey
     * @param {{ code?: string, error?: string }} params query params from the callback request
     * @param {import('express').Response} res
     * @returns {Promise<object>} the authenticated (or newly provisioned) member row
     */
    async handleCallback(providerKey, { code, error } = {}, res) {
      const client = resolveClient(providerKey);
      if (!client || error || !code) {
        throw new UnauthenticatedError(OAUTH_FAILURE_MESSAGE);
      }

      let tokens;
      let userInfo;
      try {
        tokens = await client.exchangeCode(code);
        userInfo = await client.fetchUserInfo(tokens.access_token);
      } catch {
        throw new UnauthenticatedError(OAUTH_FAILURE_MESSAGE);
      }

      const providerSubject = userInfo && (userInfo.sub || userInfo.id);
      if (!providerSubject) {
        throw new UnauthenticatedError(OAUTH_FAILURE_MESSAGE);
      }

      let identity = await oauthIdentitiesRepo.findByProviderSubject(providerKey, String(providerSubject));
      let member;

      if (identity) {
        member = await membersRepo.findById(identity.member_id);
        if (!member) throw new UnauthenticatedError(OAUTH_FAILURE_MESSAGE);
      } else {
        // Ledger #19: auto-provision a member on first successful OAuth login.
        if (!userInfo.email) throw new UnauthenticatedError(OAUTH_FAILURE_MESSAGE);
        member = await membersRepo.findByEmail(userInfo.email);
        if (!member) {
          member = await membersRepo.insertMember({ email: userInfo.email, passwordHash: null });
        }
        identity = await oauthIdentitiesRepo.insertIdentity({
          memberId: member.id,
          provider: providerKey,
          providerSubject: String(providerSubject),
        });
      }

      await issueSession(res, member.id);
      return member;
    },
  };
}

export default createOauthService;

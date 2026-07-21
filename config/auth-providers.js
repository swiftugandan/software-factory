// OAuth provider registry seam (ADR-0009, Ledger #18). Maps a provider key to its
// configuration; the actual OIDC/OAuth2 strategy implementation is injected by the OAuth
// sign-in flow (T011) so integration tests can supply a fake provider and never hit a real
// network. Adding a provider is a registry entry here, not a schema or workflow change.
import appConfig from './app.js';

const providers = {
  google: {
    key: 'google',
    displayName: 'Google',
    clientId: appConfig.oauth.google.clientId,
    clientSecret: appConfig.oauth.google.clientSecret,
    redirectUri: appConfig.oauth.google.redirectUri,
    // Enabled only when all three credentials are present; keeps this module safe to import
    // (no side effects, ADR-0006) even when OAuth env vars are unset (e.g. in unit tests).
    get enabled() {
      return Boolean(this.clientId && this.clientSecret && this.redirectUri);
    },
  },
};

// Ledger #18: Google is the only registered provider this release. The registry shape is
// provider-agnostic so future providers slot in without touching call sites.
export function getProvider(key) {
  return providers[key];
}

export function listProviders() {
  return Object.values(providers).filter((provider) => provider.enabled);
}

export default Object.freeze(providers);

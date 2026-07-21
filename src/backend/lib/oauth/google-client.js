// Google OAuth2/OIDC HTTP client (ADR-0009). All network calls to Google live behind this
// tiny interface (`getAuthorizeUrl`, `exchangeCode`, `fetchUserInfo`) so the OAuth service —
// and its tests — can inject a fake implementation and never hit Google's real network
// ("integration tests supply a fake provider", ADR-0009).
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export function createGoogleClient(providerConfig, { fetchImpl = fetch } = {}) {
  return {
    getAuthorizeUrl(state) {
      const url = new URL(AUTHORIZE_URL);
      url.searchParams.set('client_id', providerConfig.clientId);
      url.searchParams.set('redirect_uri', providerConfig.redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'openid email profile');
      url.searchParams.set('state', state);
      return url.toString();
    },

    async exchangeCode(code) {
      const response = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: providerConfig.clientId,
          client_secret: providerConfig.clientSecret,
          redirect_uri: providerConfig.redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      });
      if (!response.ok) {
        throw new Error(`google token exchange failed with status ${response.status}`);
      }
      return response.json();
    },

    async fetchUserInfo(accessToken) {
      const response = await fetchImpl(USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error(`google userinfo fetch failed with status ${response.status}`);
      }
      return response.json();
    },
  };
}

export default createGoogleClient;

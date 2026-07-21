// `oauth_identities` repository (ADR-0004, ADR-0009, Ledger #18/#19). Provider-agnostic:
// `provider` + `provider_subject` identify the external account; auto-provisioning writes
// happen through `insertIdentity` on first successful login for a given provider account.
import pool from './pool.js';

export async function findByProviderSubject(provider, providerSubject, client = pool) {
  if (!provider || !providerSubject) return null;
  const result = await client.query(
    'SELECT id, member_id, provider, provider_subject, created_at FROM oauth_identities WHERE provider = $1 AND provider_subject = $2',
    [provider, providerSubject]
  );
  return result.rows[0] || null;
}

export async function insertIdentity({ memberId, provider, providerSubject }, client = pool) {
  const result = await client.query(
    'INSERT INTO oauth_identities (member_id, provider, provider_subject) VALUES ($1, $2, $3) RETURNING id, member_id, provider, provider_subject, created_at',
    [memberId, provider, providerSubject]
  );
  return result.rows[0];
}

export default { findByProviderSubject, insertIdentity };

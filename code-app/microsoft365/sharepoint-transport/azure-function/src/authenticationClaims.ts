import type { ServerIdentityContext } from '../../contract/types.js';

interface EasyAuthClaim { readonly typ?: unknown; readonly val?: unknown }
interface EasyAuthPrincipal { readonly auth_typ?: unknown; readonly claims?: unknown }

export function verifiedEasyAuthIdentity(headers: Readonly<Record<string, string | undefined>>, connectorIdentity?: string): ServerIdentityContext {
  const encoded = headers['x-ms-client-principal'];
  const principalId = headers['x-ms-client-principal-id'];
  if (!encoded || !principalId) throw new Error('AUTHENTICATED_IDENTITY_REQUIRED');
  let parsed: EasyAuthPrincipal;
  try { parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as EasyAuthPrincipal; }
  catch { throw new Error('AUTHENTICATED_IDENTITY_MALFORMED'); }
  if (typeof parsed.auth_typ !== 'string' || !parsed.auth_typ || !Array.isArray(parsed.claims)) throw new Error('AUTHENTICATED_IDENTITY_MALFORMED');
  const claims: Record<string, string> = {};
  for (const claim of parsed.claims as EasyAuthClaim[]) {
    if (typeof claim.typ !== 'string' || typeof claim.val !== 'string' || !claim.typ || !claim.val) continue;
    if (claims[claim.typ] && claims[claim.typ] !== claim.val) throw new Error('AUTHENTICATED_IDENTITY_AMBIGUOUS');
    claims[claim.typ] = claim.val;
  }
  const oid = claims.oid ?? claims['http://schemas.microsoft.com/identity/claims/objectidentifier'];
  if (!oid || oid.toLowerCase() !== principalId.toLowerCase()) throw new Error('AUTHENTICATED_IDENTITY_AMBIGUOUS');
  return Object.freeze({ claims: Object.freeze(claims), connectorIdentity });
}

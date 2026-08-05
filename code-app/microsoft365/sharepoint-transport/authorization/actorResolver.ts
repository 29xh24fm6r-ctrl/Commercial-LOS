import { createHash } from 'node:crypto';
import type { NormalizedActorIdentity, ServerIdentityContext } from '../contract/types.js';

export interface SystemUserIdentityLookup {
  findEnabledByEntraObjectId(objectId: string): Promise<{ readonly systemUserId: string; readonly upn?: string } | undefined>;
}

export interface AuthenticatedActorResolver {
  resolve(context: ServerIdentityContext): Promise<NormalizedActorIdentity>;
}

function oneClaim(claims: ServerIdentityContext['claims'], ...names: string[]): string | undefined {
  for (const name of names) {
    const value = claims[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export class EntraClaimsActorResolver implements AuthenticatedActorResolver {
  constructor(private readonly users: SystemUserIdentityLookup, private readonly expectedTenantId: string) {}

  async resolve(context: ServerIdentityContext): Promise<NormalizedActorIdentity> {
    const tenantId = oneClaim(context.claims, 'tid', 'http://schemas.microsoft.com/identity/claims/tenantid');
    const objectId = oneClaim(context.claims, 'oid', 'http://schemas.microsoft.com/identity/claims/objectidentifier');
    if (!tenantId || tenantId.toLowerCase() !== this.expectedTenantId.toLowerCase() || !objectId) throw new Error('ACTOR_RESOLUTION_FAILED');
    const user = await this.users.findEnabledByEntraObjectId(objectId);
    if (!user?.systemUserId) throw new Error('ACTOR_RESOLUTION_FAILED');
    const identityHash = createHash('sha256').update(`${tenantId.toLowerCase()}|${objectId.toLowerCase()}|${user.systemUserId.toLowerCase()}`).digest('hex');
    return Object.freeze({ tenantId, objectId, systemUserId: user.systemUserId, upn: user.upn, identityHash });
  }
}

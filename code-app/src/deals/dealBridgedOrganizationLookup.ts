/**
 * final-seven-workstreams Workstream 2 — resolves the CRM organization (if any) a given deal's
 * client is bridged to, starting from only a `dealId`. This is the two-hop version of the
 * single-hop `clientRelationshipId -> organizationId` lookup two other modules already perform
 * inline (`src/deals/dealCrmSiblingDeals.ts`'s `resolveOrganizationId` closure and
 * `src/crm/dealIndustryProjection.ts`'s `readClientOrganizationId` closure) — this module does NOT
 * refactor those (out of scope for this pass; they already have their own tests and callers that
 * already hold a `clientRelationshipId`), it exists for callers that start from a bare `dealId` and
 * need only the organization id, without pulling in unrelated NAICS/industry-projection work.
 */

export type DealBridgedOrganizationResult =
  | { readonly status: 'ready'; readonly organizationId: string }
  | { readonly status: 'no-client-link' }
  | { readonly status: 'no-org-link' }
  | { readonly status: 'unavailable'; readonly error: string };

export interface DealBridgedOrganizationLookupDeps {
  readonly readDealClientId: (dealId: string) => Promise<{ readonly success: boolean; readonly clientRelationshipId?: string; readonly error?: string }>;
  readonly readOrganizationIdForClient: (clientRelationshipId: string) => Promise<{ readonly success: boolean; readonly organizationId?: string; readonly error?: string }>;
}

export async function resolveDealBridgedOrganizationId(
  dealId: string,
  deps: DealBridgedOrganizationLookupDeps,
): Promise<DealBridgedOrganizationResult> {
  const trimmedDealId = dealId.trim();
  if (trimmedDealId.length === 0) return { status: 'unavailable', error: 'No deal id supplied.' };

  const dealResult = await deps.readDealClientId(trimmedDealId);
  if (!dealResult.success) {
    return { status: 'unavailable', error: dealResult.error ?? 'Deal lookup failed.' };
  }
  const clientRelationshipId = (dealResult.clientRelationshipId ?? '').trim();
  if (clientRelationshipId.length === 0) return { status: 'no-client-link' };

  const orgResult = await deps.readOrganizationIdForClient(clientRelationshipId);
  if (!orgResult.success) {
    return { status: 'unavailable', error: orgResult.error ?? 'Client relationship lookup failed.' };
  }
  const organizationId = (orgResult.organizationId ?? '').trim();
  if (organizationId.length === 0) return { status: 'no-org-link' };

  return { status: 'ready', organizationId };
}

export function buildLiveDealBridgedOrganizationLookupDeps(): DealBridgedOrganizationLookupDeps {
  return {
    readDealClientId: async (dealId) => {
      try {
        const { Cr664_loandealsService } = await import('../generated/services/Cr664_loandealsService');
        const r = await Cr664_loandealsService.get(dealId, { select: ['_cr664_client_value'] });
        return {
          success: r.success,
          clientRelationshipId: (r.data as { _cr664_client_value?: string } | undefined)?._cr664_client_value,
          error: r.error?.message ?? undefined,
        };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    readOrganizationIdForClient: async (clientRelationshipId) => {
      try {
        const { Cr664_clientrelationshipsService } = await import('../generated/services/Cr664_clientrelationshipsService');
        const r = await Cr664_clientrelationshipsService.get(clientRelationshipId, {
          select: ['_cr664_organization_value'],
        });
        return {
          success: r.success,
          organizationId: (r.data as { _cr664_organization_value?: string } | undefined)?._cr664_organization_value,
          error: r.error?.message ?? undefined,
        };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

export function resolveLiveDealBridgedOrganizationId(dealId: string): Promise<DealBridgedOrganizationResult> {
  return resolveDealBridgedOrganizationId(dealId, buildLiveDealBridgedOrganizationLookupDeps());
}

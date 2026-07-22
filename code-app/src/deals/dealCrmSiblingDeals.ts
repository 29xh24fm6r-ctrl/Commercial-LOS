/**
 * Remediation 2026-07-22 (Workstream D) — authoritative, ID-based sibling deals for the Deal
 * Workspace's Relationship section.
 *
 * Root cause fixed: the Deal Workspace's prior sibling-deal view (relationshipMemory.ts /
 * RelationshipContext.tsx) grouped deals by a NORMALIZED CLIENT-NAME STRING and scoped the result
 * to only the current banker's own visible pipeline — so "Acme, LLC" vs "Acme LLC" were treated as
 * different clients, and a sibling deal owned by a different banker never appeared, even though the
 * CRM Hub (crmLinkedDeals.ts) already resolves the SAME company's linked deals correctly via real
 * relationship keys, org-wide.
 *
 * This module reuses that exact same authoritative, id-based CRM Hub query (never re-implements
 * name matching) so the Deal Workspace and the CRM Hub always agree on which deals belong to the
 * same client. It does not replace relationshipMemory.ts's banker-work-queue attention aggregates
 * (open tasks/documents/etc. for the banker's own deals) — that is a distinct, still-useful feature;
 * this module answers a different, narrower question: "which OTHER deals does this exact CRM client
 * carry, anywhere in the org, and what is the total relationship exposure including this deal."
 */

import { loadLinkedDealsForOrganization, type LinkedDeal, type LinkedDealsResult } from '../crm/workspace/crmLinkedDeals';

export interface DealCrmSiblingDealsDeps {
  /** Resolve the CRM organization id linked to a client relationship (or none). */
  readonly resolveOrganizationId: (
    clientRelationshipId: string,
  ) => Promise<{ success: boolean; organizationId?: string; error?: string }>;
  /** Load the deals linked to a CRM organization — reuses the CRM Hub's own authoritative loader. */
  readonly loadLinkedDeals: (organizationId: string) => Promise<LinkedDealsResult>;
}

export type DealCrmSiblingDealsResult =
  | { readonly status: 'no-client-link' }
  | { readonly status: 'no-org-link' }
  | { readonly status: 'unavailable'; readonly reason: string }
  | {
      readonly status: 'ready';
      /** Other deals for this exact CRM client, current deal excluded. Real relationship-key match. */
      readonly siblingDeals: readonly LinkedDeal[];
      /**
       * Sum of every parseable amount across sibling deals PLUS the current deal's own amount (when
       * parseable) — the current deal is excluded from `siblingDeals` (never double-counted as a
       * "sibling" of itself) but IS included in the total relationship exposure, since that number
       * describes the whole relationship, not just the other deals.
       */
      readonly totalRelationshipExposure: number;
      /** True when at least one deal (sibling or current) had an unparseable/missing amount. */
      readonly exposureIncomplete: boolean;
    };

/**
 * Resolve the authoritative sibling-deal list + aggregate exposure for a deal's linked CRM client.
 * Pure over injected deps; fails closed to an honest status, never fabricates a sibling or a total.
 */
export async function loadDealCrmSiblingDeals(
  currentDealId: string,
  currentDealAmount: number | undefined,
  clientRelationshipId: string | undefined,
  deps: DealCrmSiblingDealsDeps,
): Promise<DealCrmSiblingDealsResult> {
  const clientId = (clientRelationshipId ?? '').trim();
  if (clientId.length === 0) return { status: 'no-client-link' };

  let orgRes: { success: boolean; organizationId?: string; error?: string };
  try {
    orgRes = await deps.resolveOrganizationId(clientId);
  } catch (err: unknown) {
    return { status: 'unavailable', reason: err instanceof Error ? err.message : String(err) };
  }
  if (!orgRes.success) return { status: 'unavailable', reason: orgRes.error ?? 'organization read failed' };
  const organizationId = (orgRes.organizationId ?? '').trim();
  if (organizationId.length === 0) return { status: 'no-org-link' };

  let linkedRes: LinkedDealsResult;
  try {
    linkedRes = await deps.loadLinkedDeals(organizationId);
  } catch (err: unknown) {
    return { status: 'unavailable', reason: err instanceof Error ? err.message : String(err) };
  }
  if (linkedRes.status !== 'ready') return { status: 'unavailable', reason: linkedRes.reason };

  const siblingDeals = linkedRes.deals.filter((d) => d.id !== currentDealId);

  let total = 0;
  let incomplete = false;
  const currentHasAmount = typeof currentDealAmount === 'number' && Number.isFinite(currentDealAmount);
  if (currentHasAmount) total += currentDealAmount!;
  else incomplete = true;
  for (const d of siblingDeals) {
    if (typeof d.amountValue === 'number' && Number.isFinite(d.amountValue)) {
      total += d.amountValue;
    } else {
      incomplete = true;
    }
  }

  return {
    status: 'ready',
    siblingDeals,
    totalRelationshipExposure: total,
    exposureIncomplete: incomplete,
  };
}

// ---------------------------------------------------------------------------
// Live dependency factory (dynamic imports keep the SDK out of the static graph)
// ---------------------------------------------------------------------------

export function buildLiveDealCrmSiblingDealsDeps(): DealCrmSiblingDealsDeps {
  return {
    resolveOrganizationId: async (clientRelationshipId) => {
      try {
        const { Cr664_clientrelationshipsService } = await import(
          '../generated/services/Cr664_clientrelationshipsService'
        );
        const r = await Cr664_clientrelationshipsService.get(clientRelationshipId, {
          select: ['_cr664_organization_value'],
        });
        return {
          success: r.success,
          organizationId: (r.data as { _cr664_organization_value?: string } | undefined)
            ?._cr664_organization_value,
          error: r.error?.message ?? undefined,
        };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    loadLinkedDeals: loadLinkedDealsForOrganization,
  };
}

export function loadLiveDealCrmSiblingDeals(
  currentDealId: string,
  currentDealAmount: number | undefined,
  clientRelationshipId: string | undefined,
): Promise<DealCrmSiblingDealsResult> {
  return loadDealCrmSiblingDeals(
    currentDealId,
    currentDealAmount,
    clientRelationshipId,
    buildLiveDealCrmSiblingDealsDeps(),
  );
}

/**
 * F4 — linked deals for a CRM company (read-only).
 *
 * Deals are NOT part of the workspace load (loadCrmWorkspaceData), so this is a
 * genuinely new, RECORD-SCOPED read: the loan deals whose Client lookup
 * (_cr664_client_value) points at the open organization. Fail-closed and
 * SDK-free in the static graph (guarded dynamic import), so the drawer can import
 * it without pulling the data client. Read-only for v1 — it surfaces linked
 * deals; it does not link new ones (that would be a deal-side Client write).
 */

import { formatCurrency } from '../../shared/formatters';

export interface LinkedDeal {
  readonly id: string;
  readonly name: string;
  readonly stage?: string;
  readonly status?: string;
  readonly amount?: string;
}

export type LinkedDealsResult =
  | { readonly status: 'ready'; readonly deals: readonly LinkedDeal[] }
  | { readonly status: 'unavailable'; readonly reason: string };

/** Injectable loader so the drawer + tests stay decoupled from the SDK. */
export type LinkedDealsLoader = (organizationId: string) => Promise<LinkedDealsResult>;

interface RawLoanDeal {
  readonly cr664_loandealid: string;
  readonly cr664_dealname?: string;
  readonly cr664_amount?: number;
  readonly cr664_stagereferencename?: string;
  readonly cr664_statusreferencename?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

/** Map a raw loan-deal row to the read-only linked-deal shape. Pure; exported for tests. */
export function mapLinkedDeal(d: RawLoanDeal): LinkedDeal {
  return {
    id: d.cr664_loandealid,
    name: str(d.cr664_dealname) ?? 'Deal',
    stage: str(d.cr664_stagereferencename),
    status: str(d.cr664_statusreferencename),
    amount:
      typeof d.cr664_amount === 'number' && Number.isFinite(d.cr664_amount)
        ? formatCurrency(d.cr664_amount)
        : undefined,
  };
}

const GUID = /^[0-9a-fA-F-]{36}$/;

/**
 * Live loader: the deals whose Client lookup is this organization. The org id is
 * a Dataverse GUID (validated — also blocks OData-filter injection). Fails closed
 * to 'unavailable' when the service is absent or the read fails.
 */
export const loadLinkedDealsForOrganization: LinkedDealsLoader = async (organizationId) => {
  const orgId = organizationId.trim();
  if (orgId.length === 0) return { status: 'ready', deals: [] };
  if (!GUID.test(orgId)) return { status: 'ready', deals: [] };
  try {
    const { Cr664_loandealsService } = await import('../../generated/services/Cr664_loandealsService');
    const res = await Cr664_loandealsService.getAll({
      select: ['cr664_loandealid', 'cr664_dealname', 'cr664_amount'],
      // Admin → Loan Removal (dealRemovalWrite.ts) deactivates a removed deal;
      // exclude it here so a withdrawn deal doesn't linger in the CRM widget.
      filter: `_cr664_client_value eq ${orgId} and statecode eq 0`,
      top: 100,
    });
    if (res.success !== true) {
      return { status: 'unavailable', reason: 'Linked deals could not be loaded.' };
    }
    return { status: 'ready', deals: (res.data ?? []).map((d) => mapLinkedDeal(d as RawLoanDeal)) };
  } catch {
    return { status: 'unavailable', reason: 'Linked deals are not available for this record yet.' };
  }
};

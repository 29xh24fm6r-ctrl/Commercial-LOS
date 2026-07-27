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
import { isTestOrSmokeDeal } from '../../shared/deals/testDealClassification';

export interface LinkedDeal {
  readonly id: string;
  readonly name: string;
  readonly stage?: string;
  readonly status?: string;
  readonly amount?: string;
  /**
   * Remediation 2026-07-22 (Workstream D) — the raw numeric amount, alongside the formatted
   * display string above. Needed so a consumer (e.g. total relationship exposure) can aggregate
   * without re-parsing a locale-formatted currency string.
   */
  readonly amountValue?: number;
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
  /** Governed test/smoke classification (falls back to name-pattern matching when absent). */
  readonly cr664_istestrecord?: boolean;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

/** Map a raw loan-deal row to the read-only linked-deal shape. Pure; exported for tests. */
export function mapLinkedDeal(d: RawLoanDeal): LinkedDeal {
  const hasAmount = typeof d.cr664_amount === 'number' && Number.isFinite(d.cr664_amount);
  return {
    id: d.cr664_loandealid,
    name: str(d.cr664_dealname) ?? 'Deal',
    stage: str(d.cr664_stagereferencename),
    status: str(d.cr664_statusreferencename),
    amount: hasAmount ? formatCurrency(d.cr664_amount!) : undefined,
    amountValue: hasAmount ? d.cr664_amount : undefined,
  };
}

const GUID = /^[0-9a-fA-F-]{36}$/;

interface RawClientRelationship {
  readonly cr664_clientrelationshipid: string;
}

/**
 * Live loader: the deals linked to this CRM company.
 *
 * DEFECT 6 root cause: a loan deal's `cr664_Client` lookup targets a
 * cr664_CLIENTRELATIONSHIP, NOT the CRM organization. The old query filtered deals by
 * `_cr664_client_value eq <organizationId>`, comparing a clientrelationship id to an organization id
 * — which never matched, so a company with real linked deals showed "No deals are linked".
 *
 * Fix: resolve the org's bridged client relationship(s) FIRST, via the governed reverse link the
 * bridge stamps (`cr664_Organization` → `_cr664_organization_value`), then load the deals whose
 * Client lookup points at any of those client relationships. Purely id-based — similar company names
 * can never cause a false match. Fails closed to 'unavailable'.
 */
export const loadLinkedDealsForOrganization: LinkedDealsLoader = async (organizationId) => {
  const orgId = organizationId.trim();
  if (orgId.length === 0) return { status: 'ready', deals: [] };
  if (!GUID.test(orgId)) return { status: 'ready', deals: [] };
  try {
    // Step 1 — the client relationship(s) bridged to this organization.
    const { Cr664_clientrelationshipsService } = await import(
      '../../generated/services/Cr664_clientrelationshipsService'
    );
    const rel = await Cr664_clientrelationshipsService.getAll({
      select: ['cr664_clientrelationshipid'],
      filter: `_cr664_organization_value eq ${orgId} and statecode eq 0`,
      top: 50,
    });
    if (rel.success !== true) {
      return { status: 'unavailable', reason: 'Linked deals could not be loaded.' };
    }
    const clientIds = (rel.data ?? [])
      .map((r) => (r as unknown as RawClientRelationship).cr664_clientrelationshipid)
      .filter((id): id is string => typeof id === 'string' && GUID.test(id.trim()));

    // Step 2 — deals whose Client is any bridged relationship for this org. Also include a direct
    // org-id match defensively (a legacy/direct link), unioned by deal id. All id-based, GUID-guarded
    // (also blocks OData-filter injection).
    const targetIds = [...new Set([...clientIds, orgId])];
    const clientFilter = targetIds.map((id) => `_cr664_client_value eq ${id}`).join(' or ');
    const { Cr664_loandealsService } = await import('../../generated/services/Cr664_loandealsService');
    const res = await Cr664_loandealsService.getAll({
      select: ['cr664_loandealid', 'cr664_dealname', 'cr664_amount', 'cr664_istestrecord'],
      // Admin → Loan Removal (dealRemovalWrite.ts) deactivates a removed deal;
      // exclude it here so a withdrawn deal doesn't linger in the CRM widget.
      filter: `(${clientFilter}) and statecode eq 0`,
      top: 100,
    });
    if (res.success !== true) {
      return { status: 'unavailable', reason: 'Linked deals could not be loaded.' };
    }
    const seen = new Set<string>();
    const deals: LinkedDeal[] = [];
    for (const raw of res.data ?? []) {
      const d = raw as RawLoanDeal;
      // Factory mission PR A — this widget is a genuine relationship-history view (intentionally
      // NOT filtered to ACTIVE_DEAL_ODATA_PREDICATE's "active, non-terminal" scope; a banker
      // legitimately wants to see a closed/funded deal in a client's history, not just open ones).
      // It previously had ZERO test/smoke exclusion, so a disposable test deal linked to a real CRM
      // company polluted that company's relationship history. Uses the same governed field +
      // name-pattern fallback every other deal surface uses.
      if (isTestOrSmokeDeal({ name: d.cr664_dealname, isTestRecord: d.cr664_istestrecord })) continue;
      const mapped = mapLinkedDeal(d);
      if (seen.has(mapped.id)) continue;
      seen.add(mapped.id);
      deals.push(mapped);
    }
    return { status: 'ready', deals };
  } catch {
    return { status: 'unavailable', reason: 'Linked deals are not available for this record yet.' };
  }
};

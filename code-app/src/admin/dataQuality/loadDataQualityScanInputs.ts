/**
 * Final LOS Completion arc — Workstream O: live data gathering for the
 * data-quality detection sweep. Read-only. Each loader follows an already-
 * proven pattern elsewhere in this codebase rather than inventing a new
 * query shape:
 *   - deals: the same unfiltered `Cr664_loandealsService.getAll({ filter:
 *     ACTIVE_DEAL_ODATA_PREDICATE })` call already used by
 *     src/executive/operationalFallbackQueries.ts, with the same
 *     isTestOrSmokeDealName exclusion Workstream N applied everywhere else.
 *   - entitlements: reuses the EXISTING listAdminEntitlementRows() from
 *     src/admin/adminAccessGrantLookup.ts — no new entitlement query.
 *   - organizations / boarded-loan links: small dedicated reads mirroring
 *     the same getAll+top shape crmWorkspaceData.ts and boardedLoansList.ts
 *     already use, kept separate from those files so this sweep never risks
 *     the shared select/mapping those live surfaces depend on.
 *
 * Partial-failure tolerant: one domain failing to load does not block the
 * others — the sweep just runs detection over whatever loaded, and the
 * panel reports which domains were skipped.
 */

import { ACTIVE_DEAL_ODATA_PREDICATE } from '../../shared/deals/dealVisibilityScopes';
import { isTestOrSmokeDealName } from '../../shared/deals/testDealClassification';
import { listAdminEntitlementRows } from '../adminAccessGrantLookup';
import type { ExistingOrganizationSignal } from '../../crm/write/crmDuplicateDetection';
import type {
  DealScanRow,
  EntitlementScanRow,
  BoardedLoanLinkRow,
  DataQualityScanInputs,
} from './dataQualityFlagCandidates';

const ORG_ROW_CAP = 200;
const BOARDED_LOAN_ROW_CAP = 500;

export interface DataQualityScanLoadResult {
  readonly inputs: DataQualityScanInputs;
  /** Domains that failed to load, with the reason -- never silently dropped. */
  readonly failedDomains: readonly { readonly domain: string; readonly message: string }[];
}

async function loadScanDeals(): Promise<{
  rows: readonly DealScanRow[];
  error?: string;
}> {
  try {
    const { Cr664_loandealsService } = await import('../../generated/services/Cr664_loandealsService');
    const result = await Cr664_loandealsService.getAll({
      filter: ACTIVE_DEAL_ODATA_PREDICATE,
    });
    if (!result.success) {
      return { rows: [], error: result.error?.message ?? 'Failed to load deals' };
    }
    const rows: DealScanRow[] = (result.data ?? [])
      .filter((d) => !isTestOrSmokeDealName(d.cr664_dealname))
      .map((d) => ({
        dealId: d.cr664_loandealid,
        dealName: d.cr664_dealname,
        clientName: d.cr664_clientname,
        amount: d.cr664_amount,
        stage: d.cr664_stagereferencename,
      }));
    return { rows };
  } catch (err: unknown) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

async function loadScanOrganizations(): Promise<{
  rows: readonly ExistingOrganizationSignal[];
  error?: string;
}> {
  try {
    const { Cr664_crmorganizationsService } = await import(
      '../../generated/services/Cr664_crmorganizationsService'
    );
    const result = await Cr664_crmorganizationsService.getAll({ top: ORG_ROW_CAP });
    if (!result.success) {
      return { rows: [], error: result.error?.message ?? 'Failed to load CRM organizations' };
    }
    const rows: ExistingOrganizationSignal[] = (result.data ?? []).map((o) => ({
      organizationId: o.cr664_crmorganizationid,
      name: o.cr664_name,
      legalName: o.cr664_legalname,
      website: o.cr664_website,
    }));
    return { rows };
  } catch (err: unknown) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

async function loadScanBoardedLoanLinks(): Promise<{
  rows: readonly BoardedLoanLinkRow[];
  error?: string;
}> {
  try {
    const { Cr664_portfolioboardedloansService } = await import(
      '../../generated/services/Cr664_portfolioboardedloansService'
    );
    const result = await Cr664_portfolioboardedloansService.getAll({
      filter: 'statecode eq 0',
      top: BOARDED_LOAN_ROW_CAP,
    });
    if (!result.success) {
      return { rows: [], error: result.error?.message ?? 'Failed to load boarded loans' };
    }
    const rows: BoardedLoanLinkRow[] = (result.data ?? []).map((b) => ({
      portfolioBoardedLoanId: b.cr664_portfolioboardedloanid,
      originatedLoanDealId: b._cr664_originatedloandeal_value,
      assignedServicingOwnerId: b._cr664_assignedservicingowner_value,
      active: b.statecode === 0,
    }));
    return { rows };
  } catch (err: unknown) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

async function loadScanEntitlements(): Promise<{
  rows: readonly EntitlementScanRow[];
  error?: string;
}> {
  const result = await listAdminEntitlementRows();
  if (!result.success) {
    return { rows: [], error: result.error ?? 'Failed to load workspace entitlements' };
  }
  const rows: EntitlementScanRow[] = (result.rows ?? []).map((r) => ({
    id: r.id,
    entitlementName: r.entitlementName,
    accessLevelKind: r.accessLevelKind,
    active: r.active,
  }));
  return { rows };
}

export async function loadDataQualityScanInputs(): Promise<DataQualityScanLoadResult> {
  const [deals, organizations, boardedLoans, entitlements] = await Promise.all([
    loadScanDeals(),
    loadScanOrganizations(),
    loadScanBoardedLoanLinks(),
    loadScanEntitlements(),
  ]);

  const failedDomains: { domain: string; message: string }[] = [];
  if (deals.error) failedDomains.push({ domain: 'deals', message: deals.error });
  if (organizations.error) failedDomains.push({ domain: 'organizations', message: organizations.error });
  if (boardedLoans.error) failedDomains.push({ domain: 'boarded loans', message: boardedLoans.error });
  if (entitlements.error) failedDomains.push({ domain: 'entitlements', message: entitlements.error });

  return {
    inputs: {
      deals: deals.rows,
      organizations: organizations.rows,
      boardedLoans: boardedLoans.rows,
      entitlements: entitlements.rows,
    },
    failedDomains,
  };
}

/**
 * Final LOS Completion arc — Workstream O: governed duplicate/data-quality
 * detection rules.
 *
 * `cr664_dataqualityflags` already exists and is already wired
 * (src/admin/DataQualityFlags.tsx, dataQualityActions.ts,
 * AdminDataProvider.tsx) with six flag types (StaleSnapshot, OrphanRecord,
 * BrokenReference, MissingOwner, InvalidValue, ASSIGNMENT_MISMATCH), but none
 * of these six categories were covered by any detection rule:
 *   - duplicate borrower/company (+ near-duplicate names)
 *   - duplicate deals (+ suspicious active deals implicated in a cluster)
 *   - zero-amount active deals
 *   - duplicate workspace entitlements
 *   - inconsistent boarding linkage
 *
 * This module is the pure detection layer only — no IO, no service import.
 * It reuses existing, already-proven detectors rather than re-deriving them:
 *   - findDuplicateOrganizationClusters (src/crm/write/crmDuplicateDetection.ts)
 *   - evaluateBoardingHandoff (src/workflow/boardingHandoffReadiness.ts)
 *   - normalizeBusinessName (src/shared/text/normalizeBusinessName.ts)
 * and adds two new pure clustering rules that follow the exact same
 * "retroactive full-scan clustering" shape as findDuplicateOrganizationClusters
 * (deals, entitlements), since no equivalent existed for those record kinds.
 *
 * Policy convention (disclosed, not fabricated): `cr664_flagtype` on
 * cr664_dataqualityflags is a REQUIRED Dataverse choice column with only the
 * six existing values above — none of which name a "duplicate" concept. Per
 * this arc's established "reuse an existing enum value + carry the precise
 * category in free text" convention (used for cr664_relatedentitytype on
 * cr664_auditevents, and for cr664_eventsubtype on cr664_dealtimelineevents
 * in Workstream K), every candidate here maps to an EXISTING flag-type value
 * rather than requiring an operator-side choice-column schema change:
 *   - inconsistent-boarding-linkage -> BrokenReference (an honest semantic
 *     fit: the deal<->boarded-loan reference is inconsistent/broken).
 *   - every duplicate-* category -> InvalidValue (the closest existing
 *     generic fit: the record's value is not valid because it duplicates
 *     another). The precise category and match evidence live in
 *     flagName/flagDescription, which the admin panel and the DQ flags list
 *     already render in full.
 */

import {
  findDuplicateOrganizationClusters,
  type ExistingOrganizationSignal,
} from '../../crm/write/crmDuplicateDetection';
import { normalizeBusinessName } from '../../shared/text/normalizeBusinessName';
import {
  evaluateBoardingHandoff,
  type BoardingHandoffEvidence,
} from '../../workflow/boardingHandoffReadiness';
import type { DataQualityFlagRow } from '../adminDiagnosticsQueries';
import {
  classifyDealRecord,
  isTestOrSmokeDeal,
} from '../../shared/deals/testDealClassification';

export type DataQualityFlagCategory =
  | 'duplicate-organization'
  | 'duplicate-deal'
  | 'suspicious-active-deal'
  | 'zero-amount-deal'
  | 'duplicate-entitlement'
  | 'inconsistent-boarding-linkage'
  | 'duplicate-boarding-link'
  | 'incomplete-boarded-loan'
  | 'controlled-classification-conflict';

export interface DataQualityFlagCandidate {
  readonly category: DataQualityFlagCategory;
  readonly flagName: string;
  readonly flagDescription: string;
  readonly sourceTable: string;
  readonly sourceRecordId: string;
}

// ---------------------------------------------------------------------------
// Duplicate borrower/company + near-duplicate names
// ---------------------------------------------------------------------------

/** One flag candidate per duplicate-organization cluster, anchored on its first member. */
export function detectDuplicateOrganizationFlags(
  organizations: readonly ExistingOrganizationSignal[],
): readonly DataQualityFlagCandidate[] {
  const clusters = findDuplicateOrganizationClusters(organizations, {
    detectionEnabledOverride: true,
  });
  return clusters.map((cluster) => ({
    category: 'duplicate-organization',
    flagName: `Possible duplicate companies (matched on ${cluster.matchType})`,
    flagDescription:
      `${cluster.organizationIds.length} CRM organization records share the same normalized ` +
      `${cluster.matchType} ("${cluster.matchKey}"): ${cluster.organizationIds.join(', ')}. ` +
      `Review for merge/consolidation; this flag never merges or deletes automatically.`,
    sourceTable: 'cr664_crmorganizations',
    sourceRecordId: cluster.organizationIds[0]!,
  }));
}

// ---------------------------------------------------------------------------
// Duplicate deals + suspicious active deals + zero-amount deals
// ---------------------------------------------------------------------------

export interface DealScanRow {
  readonly dealId: string;
  readonly dealName?: string;
  readonly clientName?: string;
  readonly amount?: number;
  readonly stage?: string;
  readonly isTestRecord?: boolean | null;
}

export function detectControlledClassificationConflictFlags(
  deals: readonly DealScanRow[],
): readonly DataQualityFlagCandidate[] {
  return deals
    .filter(
      (deal) =>
        classifyDealRecord({
          name: deal.dealName,
          isTestRecord: deal.isTestRecord,
        }).kind === 'classification-conflict',
    )
    .map((deal) => ({
      category: 'controlled-classification-conflict' as const,
      flagName: 'Controlled-record classification conflict',
      flagDescription:
        `Deal "${deal.dealName ?? deal.dealId}" has cr664_istestrecord=false but its ` +
        'governed name identifies a controlled test/smoke record. It is quarantined from ' +
        'operational totals until an approved record-level correction is applied.',
      sourceTable: 'cr664_loandeal',
      sourceRecordId: deal.dealId,
    }));
}

export interface DuplicateDealCluster {
  readonly matchType: 'dealName' | 'clientName';
  readonly matchKey: string;
  readonly dealIds: readonly string[];
}

/**
 * Retroactive full-scan clustering across ALL currently-active deals, mirroring
 * findDuplicateOrganizationClusters's shape exactly (same normalization, same
 * "each record surfaces in exactly one, strongest cluster" rule). Read-only —
 * never merges, deletes, or otherwise mutates a record.
 */
export function findDuplicateDealClusters(
  deals: readonly DealScanRow[],
): readonly DuplicateDealCluster[] {
  const clusters: DuplicateDealCluster[] = [];
  const claimed = new Set<string>();

  function groupBy(
    matchType: DuplicateDealCluster['matchType'],
    keyFor: (d: DealScanRow) => string,
  ): void {
    const byKey = new Map<string, string[]>();
    for (const d of deals) {
      const key = keyFor(d);
      if (key.length === 0) continue;
      const bucket = byKey.get(key) ?? [];
      bucket.push(d.dealId);
      byKey.set(key, bucket);
    }
    for (const [key, ids] of byKey) {
      const unclaimed = ids.filter((id) => !claimed.has(id));
      if (unclaimed.length < 2) continue;
      for (const id of unclaimed) claimed.add(id);
      clusters.push({ matchType, matchKey: key, dealIds: unclaimed });
    }
  }

  groupBy('dealName', (d) => normalizeBusinessName(d.dealName));
  groupBy('clientName', (d) => normalizeBusinessName(d.clientName));

  return clusters;
}

/**
 * Duplicate-deal + suspicious-active-deal candidates. Every cluster member is
 * an active (non-terminal) deal by construction — the caller only ever passes
 * in deals already filtered to ACTIVE_DEAL_ODATA_PREDICATE — so "suspicious
 * active deal" (a ledger-defined, not schema-defined, category) is modeled
 * here as: an active deal that is a member of a duplicate-deal cluster. This
 * disclosed policy choice avoids inventing a second, unrelated notion of
 * "suspicious" with no evidentiary basis.
 */
export function detectDuplicateDealFlags(
  deals: readonly DealScanRow[],
): readonly DataQualityFlagCandidate[] {
  const clusters = findDuplicateDealClusters(deals);
  const candidates: DataQualityFlagCandidate[] = [];
  for (const cluster of clusters) {
    candidates.push({
      category: 'duplicate-deal',
      flagName: `Possible duplicate deals (matched on ${cluster.matchType})`,
      flagDescription:
        `${cluster.dealIds.length} active deal records share the same normalized ` +
        `${cluster.matchType} ("${cluster.matchKey}"): ${cluster.dealIds.join(', ')}. ` +
        `Review for merge/consolidation; this flag never merges or deletes automatically.`,
      sourceTable: 'cr664_loandeal',
      sourceRecordId: cluster.dealIds[0]!,
    });
    candidates.push({
      category: 'suspicious-active-deal',
      flagName: 'Active deal implicated in a duplicate-deal cluster',
      flagDescription:
        `This active deal shares a normalized ${cluster.matchType} match with ` +
        `${cluster.dealIds.length - 1} other active deal(s) (${cluster.dealIds.join(', ')}) ` +
        `and remains open — worth a closer look before it advances further.`,
      sourceTable: 'cr664_loandeal',
      sourceRecordId: cluster.dealIds[0]!,
    });
  }
  return candidates;
}

/** Active deals with no amount recorded, or an amount of exactly zero. */
export function detectZeroAmountDealFlags(
  deals: readonly DealScanRow[],
): readonly DataQualityFlagCandidate[] {
  return deals
    .filter((d) => d.amount === undefined || d.amount === null || d.amount === 0)
    .map((d) => ({
      category: 'zero-amount-deal' as const,
      flagName: 'Active deal with no recorded amount',
      flagDescription:
        `Deal "${d.dealName ?? d.dealId}" (stage: ${d.stage ?? '(no stage)'}) is active but its ` +
        `amount is ${d.amount === undefined || d.amount === null ? 'not recorded' : 'zero'}.`,
      sourceTable: 'cr664_loandeal',
      sourceRecordId: d.dealId,
    }));
}

// ---------------------------------------------------------------------------
// Duplicate workspace entitlements
// ---------------------------------------------------------------------------

export interface EntitlementScanRow {
  readonly id: string;
  readonly entitlementName: string;
  readonly accessLevelKind: string;
  readonly active: boolean;
}

/**
 * `cr664_workspaceentitlementses` carries identity entirely in its NAME (the
 * "{upn} - Admin {level} Access" convention — see
 * src/admin/adminAccessGrantWrite.ts's buildEntitlementName and
 * src/admin/adminAccessGrantLookup.ts's header comment). Parses that same
 * convention back out rather than depending on the Workspace/user lookups
 * that are documented as not reliably selectable live.
 */
export function parseAdminEntitlementIdentity(
  entitlementName: string,
): { readonly upn: string; readonly level: string } | undefined {
  const match = /^(.+?)\s-\sAdmin\s(.+?)\sAccess$/i.exec(entitlementName.trim());
  if (!match) return undefined;
  const upn = match[1]!.trim().toLowerCase();
  const level = match[2]!.trim().toLowerCase();
  if (upn.length === 0 || level.length === 0) return undefined;
  return { upn, level };
}

/** Two or more ACTIVE entitlement rows resolving to the same upn + access level. */
export function detectDuplicateEntitlementFlags(
  entitlements: readonly EntitlementScanRow[],
): readonly DataQualityFlagCandidate[] {
  const byIdentity = new Map<string, string[]>();
  for (const e of entitlements) {
    if (!e.active) continue;
    const identity = parseAdminEntitlementIdentity(e.entitlementName);
    if (!identity) continue;
    const key = `${identity.upn}|${identity.level}`;
    const bucket = byIdentity.get(key) ?? [];
    bucket.push(e.id);
    byIdentity.set(key, bucket);
  }
  const candidates: DataQualityFlagCandidate[] = [];
  for (const [key, ids] of byIdentity) {
    if (ids.length < 2) continue;
    const [upn, level] = key.split('|');
    candidates.push({
      category: 'duplicate-entitlement',
      flagName: `Duplicate active admin entitlement (${level} access)`,
      flagDescription:
        `${ids.length} active workspace-entitlement records grant "${level}" access to the same ` +
        `user (${upn}): ${ids.join(', ')}. Review before revoking either — this flag never ` +
        `revokes automatically.`,
      sourceTable: 'cr664_workspaceentitlementses',
      sourceRecordId: ids[0]!,
    });
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Inconsistent boarding linkage
// ---------------------------------------------------------------------------

export interface BoardingLinkageDealRow {
  readonly dealId: string;
  readonly dealName?: string;
  readonly stage?: string;
}

export interface BoardedLoanLinkRow {
  readonly portfolioBoardedLoanId: string;
  readonly originatedLoanDealId: string | undefined;
  readonly assignedServicingOwnerId: string | undefined;
  readonly active: boolean;
  readonly loanNumber?: string;
  readonly borrowerLegalName?: string;
  readonly loanStatus?: string;
  readonly currentOutstandingPrincipal?: number;
  readonly currentRiskRating?: string;
  readonly maturityDate?: string;
  readonly originalCommitmentAmount?: number;
  readonly bookingDate?: string;
}

export function detectDuplicateBoardingLinkFlags(
  boardedLoans: readonly BoardedLoanLinkRow[],
): readonly DataQualityFlagCandidate[] {
  const byDeal = new Map<string, string[]>();
  for (const loan of boardedLoans) {
    if (!loan.active || !loan.originatedLoanDealId) continue;
    const ids = byDeal.get(loan.originatedLoanDealId) ?? [];
    ids.push(loan.portfolioBoardedLoanId);
    byDeal.set(loan.originatedLoanDealId, ids);
  }
  return [...byDeal.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([dealId, ids]) => ({
      category: 'duplicate-boarding-link' as const,
      flagName: 'Multiple active boarded loans reference one originated deal',
      flagDescription:
        `${ids.length} active boarded-loan records reference deal ${dealId}: ${ids.join(', ')}. ` +
        'Do not create another boarding record; review and deactivate only through an approved disposition.',
      sourceTable: 'cr664_portfolioboardedloans',
      sourceRecordId: ids[0]!,
    }));
}

const BOARDED_COMPLETENESS_FIELDS: ReadonlyArray<{
  key: keyof BoardedLoanLinkRow;
  label: string;
}> = [
  { key: 'originatedLoanDealId', label: 'originated deal' },
  { key: 'assignedServicingOwnerId', label: 'servicing owner' },
  { key: 'loanNumber', label: 'loan number' },
  { key: 'borrowerLegalName', label: 'borrower legal name' },
  { key: 'loanStatus', label: 'loan status' },
  { key: 'currentOutstandingPrincipal', label: 'outstanding principal' },
  { key: 'currentRiskRating', label: 'risk rating' },
  { key: 'maturityDate', label: 'maturity date' },
  { key: 'originalCommitmentAmount', label: 'original commitment' },
  { key: 'bookingDate', label: 'booking date' },
];

function missingBoardedValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0);
}

export function detectIncompleteBoardedLoanFlags(
  boardedLoans: readonly BoardedLoanLinkRow[],
): readonly DataQualityFlagCandidate[] {
  return boardedLoans
    .filter((loan) => loan.active)
    .map((loan) => ({
      loan,
      missing: BOARDED_COMPLETENESS_FIELDS
        .filter((field) => missingBoardedValue(loan[field.key]))
        .map((field) => field.label),
    }))
    .filter(({ missing }) => missing.length > 0)
    .map(({ loan, missing }) => ({
      category: 'incomplete-boarded-loan' as const,
      flagName: 'Active boarded loan is incomplete',
      flagDescription:
        `Boarded-loan record ${loan.portfolioBoardedLoanId} is missing: ${missing.join(', ')}. ` +
        'Repair only from an authoritative source; do not synthesize Unknown or Unmapped values.',
      sourceTable: 'cr664_portfolioboardedloans',
      sourceRecordId: loan.portfolioBoardedLoanId,
    }));
}

/**
 * Wraps evaluateBoardingHandoff (src/workflow/boardingHandoffReadiness.ts)
 * across every deal in the scan, surfacing exactly its two anomaly verdicts —
 * missing-handoff and premature-handoff — as flag candidates. Does not
 * re-derive the reconciliation logic; only wires it into the sweep.
 */
export function detectInconsistentBoardingLinkageFlags(
  deals: readonly BoardingLinkageDealRow[],
  boardedLoans: readonly BoardedLoanLinkRow[],
): readonly DataQualityFlagCandidate[] {
  const byDealId = new Map<string, BoardedLoanLinkRow>();
  for (const b of boardedLoans) {
    if (!b.originatedLoanDealId) continue;
    // First active match wins; multiple active links to the same deal is its
    // own anomaly and out of scope for this rule (it would already surface
    // via the duplicate-deal-style clustering if ever needed).
    if (!byDealId.has(b.originatedLoanDealId) || b.active) {
      byDealId.set(b.originatedLoanDealId, b);
    }
  }

  const candidates: DataQualityFlagCandidate[] = [];
  for (const d of deals) {
    const link = byDealId.get(d.dealId);
    const evidence: BoardingHandoffEvidence | null = link
      ? {
          portfolioBoardedLoanId: link.portfolioBoardedLoanId,
          active: link.active,
          assignedServicingOwnerId: link.assignedServicingOwnerId,
        }
      : null;
    const readiness = evaluateBoardingHandoff(d.stage, evidence);
    if (readiness.verdict !== 'missing-handoff' && readiness.verdict !== 'premature-handoff') continue;
    candidates.push({
      category: 'inconsistent-boarding-linkage',
      flagName:
        readiness.verdict === 'missing-handoff'
          ? 'Deal claims BOARDED with no active boarding handoff record'
          : 'Active boarding handoff record on a deal not at BOARDED',
      flagDescription: `Deal "${d.dealName ?? d.dealId}": ${readiness.blockers.join(' ')}`,
      sourceTable: 'cr664_loandeal',
      sourceRecordId: d.dealId,
    });
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Composition + idempotency
// ---------------------------------------------------------------------------

export interface DataQualityScanInputs {
  readonly organizations: readonly ExistingOrganizationSignal[];
  readonly deals: readonly DealScanRow[];
  readonly entitlements: readonly EntitlementScanRow[];
  readonly boardedLoans: readonly BoardedLoanLinkRow[];
}

/** Runs every detection rule and returns the combined candidate list, unfiltered. */
export function buildDataQualityFlagCandidates(
  input: DataQualityScanInputs,
): readonly DataQualityFlagCandidate[] {
  const operationalDeals = input.deals.filter(
    (deal) =>
      !isTestOrSmokeDeal({
        name: deal.dealName,
        isTestRecord: deal.isTestRecord,
      }),
  );
  return [
    ...detectDuplicateOrganizationFlags(input.organizations),
    ...detectControlledClassificationConflictFlags(input.deals),
    ...detectDuplicateDealFlags(operationalDeals),
    ...detectZeroAmountDealFlags(operationalDeals),
    ...detectDuplicateEntitlementFlags(input.entitlements),
    ...detectInconsistentBoardingLinkageFlags(
      operationalDeals,
      input.boardedLoans,
    ),
    ...detectDuplicateBoardingLinkFlags(input.boardedLoans),
    ...detectIncompleteBoardedLoanFlags(input.boardedLoans),
  ];
}

/**
 * Idempotency: never propose a candidate that already has a matching OPEN
 * flag (same source table + source record id + category — the category is
 * encoded via flagName since flagType itself is shared/generic; see the
 * policy-convention note above). Without this, re-running the sweep would
 * create a fresh duplicate flag every time instead of recognizing the
 * open one already on file.
 */
export function excludeAlreadyFlagged(
  candidates: readonly DataQualityFlagCandidate[],
  openFlags: readonly DataQualityFlagRow[],
): readonly DataQualityFlagCandidate[] {
  const openKeys = new Set(
    openFlags.map((f) => `${f.sourceTable ?? ''}|${f.sourceRecordId ?? ''}|${f.flagName ?? ''}`),
  );
  return candidates.filter(
    (c) => !openKeys.has(`${c.sourceTable}|${c.sourceRecordId}|${c.flagName}`),
  );
}

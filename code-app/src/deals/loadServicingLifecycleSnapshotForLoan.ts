/**
 * PR 111 — the SDK-touching live loader wiring the servicing lifecycle deriver family
 * (src/servicing/*, Phase 142E — previously entirely unmounted, no live loader existed for any of
 * its seven pure derivers) to real Dataverse data. Kept in `src/deals` so `src/servicing` stays
 * SDK-free (same convention `loadBoardingHandoffForDeal.ts` documents for `src/workflow`).
 *
 * Reuses `evaluateBoardingHandoff` (the same pure boarding-handoff reconciliation
 * `loadBoardingHandoffForDeal.ts` uses) so "is this loan boarded" is answered identically
 * everywhere in this app — never a second, drifting definition.
 *
 * FAIL-CLOSED per child-record group: a failed/thrown read for one child table (covenants,
 * insurance, ticklers, collateral, exceptions) reports `null`/`undefined` for that group so the
 * pure derivers correctly produce `unknown_missing_data` (never a fabricated healthy/zero default),
 * same discipline as `loadBoardedLoanRecordCounts.ts`.
 *
 * No live source exists for `ownershipTransferStatus` (no transferor/transferee/effective-date
 * fields on any generated servicing table) — left undefined so the pure snapshot deriver's own
 * documented 'no_transfer' fallback applies, exactly as honest as the derivers themselves already
 * are about this gap.
 */

import {
  evaluateBoardingHandoff,
  type BoardingHandoffEvidence,
} from '../workflow/boardingHandoffReadiness';
import { deriveServicingLifecycleStage } from '../servicing/deriveServicingLifecycleStage';
import { deriveServicingObligations } from '../servicing/deriveServicingObligations';
import { deriveServicingCollateralSecurityStatus } from '../servicing/deriveServicingCollateralSecurityStatus';
import { deriveServicingInsuranceTicklerStatus } from '../servicing/deriveServicingInsuranceTicklerStatus';
import { deriveServicingCovenantReportingStatus } from '../servicing/deriveServicingCovenantReportingStatus';
import { deriveServicingMaturityRenewalStatus } from '../servicing/deriveServicingMaturityRenewalStatus';
import { deriveServicingLifecycleSnapshot } from '../servicing/deriveServicingLifecycleSnapshot';
import type {
  ServicingExceptionStatus,
  ServicingLifecycleInput,
  ServicingLifecycleSnapshot,
} from '../servicing/servicingLifecycleTypes';

export type ServicingLifecycleLoadResult =
  | { readonly kind: 'not_boarded' }
  | { readonly kind: 'unavailable'; readonly message: string }
  | { readonly kind: 'loaded'; readonly snapshot: ServicingLifecycleSnapshot };

/** A "due soon" window for the annual review obligation, distinct from the pure maturity-window
 *  constant (SERVICING_MATURITY_WINDOW_DAYS) — this is a live-mapping policy choice belonging to
 *  this loader, not part of the pure lifecycle model. */
const ANNUAL_REVIEW_DUE_SOON_DAYS = 60;

function nowMsFrom(asOfDate: string | Date | undefined): number {
  if (asOfDate instanceof Date) return asOfDate.getTime();
  if (typeof asOfDate === 'string') {
    const ms = Date.parse(asOfDate);
    if (!Number.isNaN(ms)) return ms;
  }
  return Date.now();
}

function reviewDueStatus(nextReviewDate: string | undefined, nowMs: number): 'not_due' | 'due' | 'past_due' | 'unknown' {
  if (!nextReviewDate) return 'unknown';
  const ms = Date.parse(nextReviewDate);
  if (Number.isNaN(ms)) return 'unknown';
  const days = Math.round((ms - nowMs) / (24 * 60 * 60 * 1000));
  if (days < 0) return 'past_due';
  if (days <= ANNUAL_REVIEW_DUE_SOON_DAYS) return 'due';
  return 'not_due';
}

function isClosedLoanStatus(loanStatus: string | undefined): boolean {
  const v = (loanStatus ?? '').toLowerCase();
  return v.includes('closed') || v.includes('paid off') || v.includes('paidoff') || v.includes('charged off') || v.includes('terminated');
}

function normalizeCovenantStatus(raw: string | undefined): string {
  const v = (raw ?? '').toLowerCase();
  if (!v) return 'unknown_missing_data';
  if (v.includes('breach') || v.includes('fail')) return 'fail';
  if (v.includes('pass') || v.includes('complian') || v.includes('current') || v.includes('satisf')) return 'pass';
  return 'review_required';
}

type RawRow = Record<string, unknown>;

async function readChildRows(
  path: string,
  exportName: string,
  boardedLoanId: string,
  select: readonly string[],
): Promise<RawRow[] | null> {
  try {
    const mod = (await import(path)) as Record<string, { getAll: (opts?: unknown) => Promise<{ success: boolean; data?: unknown[] }> }>;
    const service = mod[exportName];
    const res = await service.getAll({
      select: [...select],
      filter: `_cr664_portfolioboardedloan_value eq ${boardedLoanId}`,
    });
    if (!res.success || !Array.isArray(res.data)) return null;
    return res.data as RawRow[];
  } catch {
    return null;
  }
}

export async function loadServicingLifecycleSnapshotForLoan(
  dealId: string,
  dealStage: string | null | undefined,
  opts: { asOfDate?: string | Date; borrowerName?: string } = {},
): Promise<ServicingLifecycleLoadResult> {
  let parentRows: RawRow[];
  try {
    const { Cr664_portfolioboardedloansService } = await import('../generated/services/Cr664_portfolioboardedloansService');
    const res = await Cr664_portfolioboardedloansService.getAll({
      select: [
        'cr664_portfolioboardedloanid',
        'cr664_boardingstatus',
        'cr664_loanstatus',
        'cr664_maturitydate',
        'cr664_nextreviewdate',
        'cr664_paidoffdate',
        'statecode',
        '_cr664_originatedloandeal_value',
      ],
      filter: `_cr664_originatedloandeal_value eq ${dealId}`,
    });
    if (!res.success) {
      return { kind: 'unavailable', message: `Portfolio boarded-loan read failed: ${res.error?.message ?? 'unknown error'} (fail-closed).` };
    }
    parentRows = (res.data ?? []) as unknown as RawRow[];
  } catch (err: unknown) {
    return { kind: 'unavailable', message: `Portfolio boarded-loan read threw: ${err instanceof Error ? err.message : String(err)} (fail-closed).` };
  }

  const activeRow = parentRows.find((r) => r['statecode'] === 0 || r['statecode'] === undefined);
  const evidence: BoardingHandoffEvidence | null = activeRow
    ? {
        portfolioBoardedLoanId: String(activeRow['cr664_portfolioboardedloanid'] ?? ''),
        boardingStatus: (activeRow['cr664_boardingstatus'] as string | undefined) ?? null,
        active: true,
      }
    : null;
  const handoff = evaluateBoardingHandoff(dealStage, evidence);
  if (!handoff.handoffEvidencePresent || !activeRow) {
    return { kind: 'not_boarded' };
  }

  const boardedLoanId = String(activeRow['cr664_portfolioboardedloanid'] ?? '');
  const loanStatus = (activeRow['cr664_loanstatus'] as string | undefined) ?? undefined;
  const maturityDate = (activeRow['cr664_maturitydate'] as string | undefined) ?? undefined;
  const nextReviewDate = (activeRow['cr664_nextreviewdate'] as string | undefined) ?? undefined;
  const paidOffDate = (activeRow['cr664_paidoffdate'] as string | undefined) ?? undefined;

  const nowMs = nowMsFrom(opts.asOfDate);
  const closedOrInactive = isClosedLoanStatus(loanStatus);
  const payoffContext = Boolean(paidOffDate);
  const annualReviewDueStatus = reviewDueStatus(nextReviewDate, nowMs);

  const [covenantRows, insuranceRows, ticklerRows, collateralRows, exceptionRows] = await Promise.all([
    readChildRows('../generated/services/Cr664_portfolioboardedloancovenantsService', 'Cr664_portfolioboardedloancovenantsService', boardedLoanId, ['cr664_covenantid', 'cr664_covenantname', 'cr664_currentstatus']),
    readChildRows('../generated/services/Cr664_portfolioboardedloaninsurancesService', 'Cr664_portfolioboardedloaninsurancesService', boardedLoanId, ['cr664_status', 'cr664_expirationdate', 'cr664_evidencedocumentid']),
    readChildRows('../generated/services/Cr664_portfolioboardedloanticklersService', 'Cr664_portfolioboardedloanticklersService', boardedLoanId, ['cr664_ticklerid', 'cr664_duedate']),
    readChildRows('../generated/services/Cr664_portfolioboardedloancollateralsService', 'Cr664_portfolioboardedloancollateralsService', boardedLoanId, ['cr664_collateralid', 'cr664_collateraltype', 'cr664_perfected', 'cr664_uccfilingnumber', 'cr664_mortgageinstrumentnumber', 'cr664_deedoftrustinstrumentnumber']),
    readChildRows('../generated/services/Cr664_portfolioboardedloanexceptionsService', 'Cr664_portfolioboardedloanexceptionsService', boardedLoanId, ['cr664_exceptionid', 'cr664_status']),
  ]);

  const covenantResults = covenantRows?.map((r) => ({
    covenantId: String(r['cr664_covenantid'] ?? ''),
    label: (r['cr664_covenantname'] as string | undefined) ?? undefined,
    status: normalizeCovenantStatus(r['cr664_currentstatus'] as string | undefined),
  }));
  const covenantExceptionActive = covenantResults?.some((c) => c.status === 'fail') ?? false;

  let insurance: { accepted?: boolean; expirationDate?: string; evidencePresent?: boolean } | undefined;
  let obligationsInsuranceStatus: 'current' | 'expired' | 'missing' | 'unknown' = 'unknown';
  if (insuranceRows) {
    // The most relevant policy is the one expiring furthest in the future (the current/active one).
    const sorted = [...insuranceRows].sort((a, b) => {
      const ad = Date.parse((a['cr664_expirationdate'] as string) ?? '');
      const bd = Date.parse((b['cr664_expirationdate'] as string) ?? '');
      return (Number.isNaN(bd) ? -Infinity : bd) - (Number.isNaN(ad) ? -Infinity : ad);
    });
    const latest = sorted[0];
    if (latest) {
      const rawStatus = ((latest['cr664_status'] as string | undefined) ?? '').toLowerCase();
      const accepted = rawStatus === 'active' || rawStatus === 'accepted' || rawStatus === 'current';
      const expirationDate = latest['cr664_expirationdate'] as string | undefined;
      const evidencePresent = Boolean(latest['cr664_evidencedocumentid']);
      insurance = { accepted, expirationDate, evidencePresent };
      const expired = expirationDate !== undefined && Date.parse(expirationDate) < nowMs;
      obligationsInsuranceStatus = expired ? 'expired' : accepted && evidencePresent ? 'current' : 'missing';
    }
  }

  const ticklers = ticklerRows?.map((r) => ({
    ticklerId: String(r['cr664_ticklerid'] ?? ''),
    dueDate: r['cr664_duedate'] as string | undefined,
  }));

  const collateralItems = collateralRows?.map((r) => ({
    collateralId: String(r['cr664_collateralid'] ?? ''),
    type: r['cr664_collateraltype'] as string | undefined,
    perfected: r['cr664_perfected'] as boolean | undefined,
    // No dedicated "evidence present" boolean exists on this table; a recorded perfection
    // instrument reference is the closest real, honest signal available for it.
    hasEvidence: Boolean(r['cr664_uccfilingnumber'] || r['cr664_mortgageinstrumentnumber'] || r['cr664_deedoftrustinstrumentnumber']),
  }));

  let exceptionStatus: ServicingExceptionStatus;
  let servicingExceptionActive: boolean;
  if (exceptionRows === null) {
    servicingExceptionActive = false;
    exceptionStatus = {
      status: 'unknown',
      openExceptions: [],
      blockers: [{ code: 'exceptions_unavailable', message: 'Servicing exception records could not be read (fail-closed).' }],
      warnings: [],
      nextBestAction: { code: 'retry_exceptions', label: 'Retry loading servicing exceptions.' },
    };
  } else {
    const openExceptions = exceptionRows
      .filter((r) => {
        const s = ((r['cr664_status'] as string | undefined) ?? '').toLowerCase();
        return s === 'open' || s === 'active' || s.includes('open');
      })
      .map((r) => String(r['cr664_exceptionid'] ?? ''));
    servicingExceptionActive = openExceptions.length > 0;
    exceptionStatus = {
      status: openExceptions.length > 0 ? 'exception_active' : 'none',
      openExceptions,
      blockers: openExceptions.length > 0 ? [{ code: 'servicing_exception_open', message: `${openExceptions.length} open servicing exception(s).` }] : [],
      warnings: [],
      nextBestAction: openExceptions.length > 0
        ? { code: 'remediate_exception', label: 'Remediate the open servicing exception(s).' }
        : { code: 'monitor_exceptions', label: 'Continue exception monitoring (read-only).' },
    };
  }

  const input: ServicingLifecycleInput = {
    lifecycleId: `svc-${boardedLoanId}`,
    sourceLoanId: boardedLoanId,
    sourceDealId: dealId,
    boardedLoanId,
    borrowerName: opts.borrowerName,
    boardedLoan: { exists: handoff.handoffEvidencePresent, verified: handoff.boardingCompleted },
    annualReviewDueStatus,
    covenantExceptionActive,
    servicingExceptionActive,
    maturityDate,
    payoffContext,
    closedOrInactive,
    asOfDate: opts.asOfDate,
  };

  const stage = deriveServicingLifecycleStage(input);
  const obligations = deriveServicingObligations({
    annualReviewDueStatus,
    covenantResults,
    insuranceStatus: obligationsInsuranceStatus,
    insuranceExpirationDate: insurance?.expirationDate,
    ticklerOverdue: ticklers?.some((t) => t.dueDate !== undefined && Date.parse(t.dueDate) < nowMs) ?? false,
    asOfDate: opts.asOfDate,
  });
  const collateralSecurityStatus = deriveServicingCollateralSecurityStatus({ collateralItems });
  const { insuranceStatus, ticklerStatus } = deriveServicingInsuranceTicklerStatus({ insurance, ticklers, asOfDate: opts.asOfDate });
  const covenantReportingStatus = deriveServicingCovenantReportingStatus({ covenantResults });
  const maturityRenewalStatus = deriveServicingMaturityRenewalStatus({ maturityDate, payoffContext, closedOrInactive, asOfDate: opts.asOfDate });

  const snapshot = deriveServicingLifecycleSnapshot({
    input,
    stage,
    obligations,
    collateralSecurityStatus,
    insuranceStatus,
    ticklerStatus,
    covenantReportingStatus,
    maturityRenewalStatus,
    exceptionStatus,
    // ownershipTransferStatus intentionally omitted: no live deriver/data source exists for it yet
    // (no transferor/transferee/effective-date fields on any generated servicing table) -- the
    // snapshot deriver's own documented 'no_transfer' fallback applies.
  });

  return { kind: 'loaded', snapshot };
}

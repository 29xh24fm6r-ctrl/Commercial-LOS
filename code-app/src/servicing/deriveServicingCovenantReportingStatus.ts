/**
 * Phase 142E — Servicing COVENANT / REPORTING status deriver.
 *
 * PURE, READ-ONLY. A failed covenant is an exception (finding); an unknown
 * covenant is review_required; missing reporting docs are missing_evidence. A
 * borrower request blocked by contact/authorization surfaces a blocker but
 * triggers NO outreach. No waiver / approval / final credit decision.
 */

import type {
  ServicingCovenantReportingStatus,
  ServicingCovenantReportingStatusValue,
  ServicingLifecycleBlocker,
  ServicingLifecycleWarning,
} from './servicingLifecycleTypes';

export interface DeriveServicingCovenantReportingInput {
  covenantResults?: readonly { covenantId: string; status: string }[];
  reportingDocsMissing?: boolean;
  borrowerRequestBlocked?: boolean;
  borrowerRequestBlockReason?: string;
}

export function deriveServicingCovenantReportingStatus(
  input: DeriveServicingCovenantReportingInput,
): ServicingCovenantReportingStatus {
  const blockers: ServicingLifecycleBlocker[] = [];
  const warnings: ServicingLifecycleWarning[] = [];

  const results = input.covenantResults;
  const failingCovenants = (results ?? []).filter((c) => c.status === 'fail').map((c) => c.covenantId);
  const unknownCovenants = (results ?? []).filter((c) => c.status.startsWith('unknown_') || c.status === 'review_required').map((c) => c.covenantId);

  if (input.borrowerRequestBlocked) {
    blockers.push({ code: 'borrower_request_blocked', message: `Borrower request is blocked${input.borrowerRequestBlockReason ? ` (${input.borrowerRequestBlockReason})` : ''}; no outreach is sent.` });
  }

  let status: ServicingCovenantReportingStatusValue;
  if (results === undefined) {
    status = 'unknown_missing_data';
  } else if (failingCovenants.length > 0) {
    status = 'exception_active';
    warnings.push({ code: 'covenant_failure', message: `${failingCovenants.length} covenant failure finding(s) require review.` });
  } else if (unknownCovenants.length > 0) {
    status = 'review_required';
  } else if (input.reportingDocsMissing) {
    status = 'missing_evidence';
    blockers.push({ code: 'reporting_docs_missing', message: 'Required reporting documents are missing.' });
  } else {
    status = 'healthy';
  }

  return {
    status, failingCovenants, unknownCovenants, blockers, warnings,
    nextBestAction: status === 'healthy'
      ? { code: 'monitor_covenants', label: 'Continue covenant / reporting monitoring (read-only).' }
      : status === 'exception_active'
        ? { code: 'review_covenant_findings', label: 'Review the covenant failure findings (no waiver).' }
        : { code: 'resolve_reporting', label: 'Resolve unknown covenants / missing reporting evidence.' },
  };
}

/**
 * Phase 142E — Servicing INSURANCE / TICKLER status deriver.
 *
 * PURE, READ-ONLY. Expired/missing insurance creates a blocker; overdue ticklers
 * create attention_required; accepted unexpired insurance can satisfy. It
 * generates no borrower requests, creates no tasks, and updates no ticklers.
 */

import type {
  ServicingInsuranceStatus,
  ServicingTicklerStatus,
  ServicingInsuranceStatusValue,
  ServicingTicklerStatusValue,
  ServicingLifecycleBlocker,
} from './servicingLifecycleTypes';

function nowMs(asOf?: string | Date): number {
  if (asOf instanceof Date) return asOf.getTime();
  if (typeof asOf === 'string') { const ms = Date.parse(asOf); if (!Number.isNaN(ms)) return ms; }
  return Date.now();
}

export interface DeriveServicingInsuranceTicklerInput {
  insurance?: { accepted?: boolean; expirationDate?: string; evidencePresent?: boolean };
  ticklers?: readonly { ticklerId: string; dueDate?: string }[];
  asOfDate?: string | Date;
}

export interface ServicingInsuranceTicklerResult {
  insuranceStatus: ServicingInsuranceStatus;
  ticklerStatus: ServicingTicklerStatus;
}

export function deriveServicingInsuranceTicklerStatus(
  input: DeriveServicingInsuranceTicklerInput,
): ServicingInsuranceTicklerResult {
  const now = nowMs(input.asOfDate);

  // --- Insurance ---------------------------------------------------------
  const iBlockers: ServicingLifecycleBlocker[] = [];
  const ins = input.insurance;
  let insStatus: ServicingInsuranceStatusValue;
  const missingEvidence: string[] = [];
  if (ins === undefined) {
    insStatus = 'unknown_missing_data';
  } else if (ins.expirationDate && Date.parse(ins.expirationDate) < now) {
    insStatus = 'expired';
    iBlockers.push({ code: 'insurance_expired', message: 'Insurance certificate is expired.' });
  } else if (ins.evidencePresent !== true || ins.accepted !== true) {
    insStatus = 'missing_evidence';
    missingEvidence.push('insurance_evidence');
    iBlockers.push({ code: 'insurance_missing', message: 'Accepted insurance evidence is missing.' });
  } else if (!ins.expirationDate) {
    insStatus = 'review_required';
  } else {
    insStatus = 'complete';
  }
  const insuranceStatus: ServicingInsuranceStatus = {
    status: insStatus, missingEvidence, blockers: iBlockers, warnings: [],
    nextBestAction: insStatus === 'complete' ? { code: 'monitor_insurance', label: 'Continue insurance monitoring (read-only).' } : { code: 'collect_insurance', label: 'Collect / verify accepted insurance evidence.' },
  };

  // --- Ticklers ----------------------------------------------------------
  let ticStatus: ServicingTicklerStatusValue;
  const overdueTicklers: string[] = [];
  if (input.ticklers === undefined) {
    ticStatus = 'unknown_missing_data';
  } else {
    for (const t of input.ticklers) {
      if (t.dueDate && Date.parse(t.dueDate) < now) overdueTicklers.push(t.ticklerId);
    }
    ticStatus = input.ticklers.length === 0 ? 'current' : overdueTicklers.length > 0 ? 'attention_required' : 'current';
  }
  const ticklerStatus: ServicingTicklerStatus = {
    status: ticStatus, overdueTicklers, blockers: [],
    warnings: overdueTicklers.length > 0 ? [{ code: 'tickler_overdue', message: `${overdueTicklers.length} tickler(s) overdue.` }] : [],
    nextBestAction: overdueTicklers.length > 0 ? { code: 'review_ticklers', label: 'Review the overdue ticklers (no tickler is updated).' } : { code: 'monitor_ticklers', label: 'Continue tickler monitoring (read-only).' },
  };

  return { insuranceStatus, ticklerStatus };
}

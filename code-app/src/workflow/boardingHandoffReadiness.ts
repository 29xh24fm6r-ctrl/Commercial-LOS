/**
 * WFLOW-H — connect boarding-handoff readiness to REAL portfolio evidence.
 *
 * A deal's stage string reading "BOARDED" is a CLAIM, not proof. The honest signal
 * that the closing→servicing handoff actually happened is an ACTIVE
 * `cr664_portfolioboardedloans` record whose `cr664_OriginatedLoanDeal` points back
 * at the deal. Trusting the stage string alone lets a deal report "boarded" with no
 * servicing record behind it — an invisible, dangerous gap at the most important
 * handoff in the loan lifecycle.
 *
 * This module reconciles the two. `boardingCompleted` — the fact feeding the BOARDED
 * exit gate — is true ONLY when the deal claims BOARDED AND a real, active portfolio
 * boarded-loan handoff record exists. A stage-says-boarded / no-record mismatch is a
 * `missing-handoff` blocker; a record-without-boarded-stage is a `premature-handoff`
 * anomaly. FAIL-CLOSED: a failed read is never assumed-boarded.
 */

import { recognizeCanonicalStage } from './stageOrderingContract';

export interface BoardingHandoffEvidence {
  /** The cr664_portfolioboardedloans record id linked to the deal. */
  readonly portfolioBoardedLoanId: string;
  /** cr664_boardingstatus, if recorded (informational). */
  readonly boardingStatus?: string | null;
  /** True when the record is state Active (statecode 0). Inactive records don't count. */
  readonly active: boolean;
  /**
   * Final LOS Completion arc (Workstream H) — cr664_AssignedServicingOwner's lookup id
   * (`_cr664_assignedservicingowner_value`), when set. Undefined means the field is genuinely
   * blank on the record, never fabricated as assigned.
   */
  readonly assignedServicingOwnerId?: string;
}

export type BoardingHandoffVerdict =
  /** Deal claims BOARDED AND an active portfolio handoff record exists — real handoff. */
  | 'boarded'
  /** Deal claims BOARDED but NO active portfolio handoff record — claim without evidence. */
  | 'missing-handoff'
  /** An active portfolio record exists but the deal is NOT at BOARDED — premature/anomalous. */
  | 'premature-handoff'
  /** Neither — the deal has not reached boarding. */
  | 'not-boarded';

export interface BoardingHandoffReadiness {
  readonly dealStage: string;
  readonly dealClaimsBoarded: boolean;
  readonly handoffEvidencePresent: boolean;
  readonly verdict: BoardingHandoffVerdict;
  /** The honest BOARDED exit-gate fact: BOTH the stage AND real evidence — never stage-only. */
  readonly boardingCompleted: boolean;
  /**
   * Final LOS Completion arc (Workstream H) — BOARDED:servicing_owner. True only when a real
   * boarded-loan handoff record exists (same `handoffEvidencePresent` gate as `boardingCompleted`)
   * AND its `cr664_AssignedServicingOwner` lookup is set. A boarded record with no assigned owner
   * fails closed as unmet — never fabricated as assigned.
   */
  readonly servicingOwnerAssigned: boolean;
  readonly blockers: readonly string[];
}

/**
 * Pure boarding-handoff reconciliation. `evidence` is the active portfolio boarded-loan
 * record linked to the deal, or null when none exists.
 */
export function evaluateBoardingHandoff(
  dealStage: string | null | undefined,
  evidence: BoardingHandoffEvidence | null,
): BoardingHandoffReadiness {
  const stage = (dealStage ?? '').trim();
  const dealClaimsBoarded = recognizeCanonicalStage(stage)?.code === 'BOARDED';
  const handoffEvidencePresent = evidence !== null && evidence.active === true;

  let verdict: BoardingHandoffVerdict;
  const blockers: string[] = [];
  if (dealClaimsBoarded && handoffEvidencePresent) {
    verdict = 'boarded';
  } else if (dealClaimsBoarded && !handoffEvidencePresent) {
    verdict = 'missing-handoff';
    blockers.push(
      'Deal stage is BOARDED but no active cr664_portfolioboardedloans handoff record exists for this deal; ' +
        'the closing→servicing handoff is unproven (fail-closed).',
    );
  } else if (!dealClaimsBoarded && handoffEvidencePresent) {
    verdict = 'premature-handoff';
    blockers.push(
      `An active portfolio boarded-loan record exists but the deal stage is "${stage || '(none)'}", not BOARDED; ` +
        'the boarding record and the deal stage disagree.',
    );
  } else {
    verdict = 'not-boarded';
  }
  if (handoffEvidencePresent && !evidence?.assignedServicingOwnerId) {
    blockers.push('No servicing owner is assigned. An authorized operator must use Admin → Assign Servicing Owner.');
  }

  return {
    dealStage: stage,
    dealClaimsBoarded,
    handoffEvidencePresent,
    verdict,
    // Stop deal.stage-string-only: completion requires the stage AND real evidence.
    boardingCompleted: dealClaimsBoarded && handoffEvidencePresent,
    servicingOwnerAssigned: handoffEvidencePresent && Boolean(evidence?.assignedServicingOwnerId),
    blockers,
  };
}

/**
 * The fail-closed readiness a live loader returns when the portfolio read itself failed
 * (never assumed-boarded). Kept here so the pure module owns the shape; the SDK-touching
 * loader lives in `src/deals/loadBoardingHandoffForDeal.ts` (workflow stays SDK-free).
 */
export function unavailableBoardingHandoff(
  dealStage: string | null | undefined,
  reason: string,
): BoardingHandoffReadiness {
  const stage = (dealStage ?? '').trim();
  return {
    dealStage: stage,
    dealClaimsBoarded: recognizeCanonicalStage(stage)?.code === 'BOARDED',
    handoffEvidencePresent: false,
    verdict: 'missing-handoff',
    boardingCompleted: false,
    servicingOwnerAssigned: false,
    blockers: [reason],
  };
}

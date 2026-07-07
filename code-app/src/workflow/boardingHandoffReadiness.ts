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

  return {
    dealStage: stage,
    dealClaimsBoarded,
    handoffEvidencePresent,
    verdict,
    // Stop deal.stage-string-only: completion requires the stage AND real evidence.
    boardingCompleted: dealClaimsBoarded && handoffEvidencePresent,
    blockers,
  };
}

/**
 * Live boarding-handoff proof: read the active portfolio boarded-loan record linked to
 * the deal (via cr664_OriginatedLoanDeal) and reconcile it against the deal stage.
 * SDK-only via a guarded dynamic import. FAIL-CLOSED: a failed read reports a blocker
 * and `boardingCompleted:false` (never assumed-boarded).
 */
export async function loadBoardingHandoffForDeal(
  dealId: string,
  dealStage: string | null | undefined,
): Promise<BoardingHandoffReadiness> {
  try {
    const { Cr664_portfolioboardedloansService } = await import(
      '../generated/services/Cr664_portfolioboardedloansService'
    );
    const res = await Cr664_portfolioboardedloansService.getAll({
      select: ['cr664_portfolioboardedloanid', 'cr664_boardingstatus', 'statecode', '_cr664_originatedloandeal_value'],
      filter: `_cr664_originatedloandeal_value eq ${dealId}`,
    });
    if (!res.success) {
      const stage = (dealStage ?? '').trim();
      return {
        dealStage: stage,
        dealClaimsBoarded: recognizeCanonicalStage(stage)?.code === 'BOARDED',
        handoffEvidencePresent: false,
        verdict: 'missing-handoff',
        boardingCompleted: false,
        blockers: [`Portfolio boarded-loan read failed: ${res.error?.message ?? 'unknown error'} (fail-closed).`],
      };
    }
    const rows = (res.data ?? []) as unknown as Array<Record<string, unknown>>;
    const activeRow = rows.find((r) => r['statecode'] === 0 || r['statecode'] === undefined);
    const evidence: BoardingHandoffEvidence | null = activeRow
      ? {
          portfolioBoardedLoanId: String(activeRow['cr664_portfolioboardedloanid'] ?? ''),
          boardingStatus: (activeRow['cr664_boardingstatus'] as string | undefined) ?? null,
          active: true,
        }
      : null;
    return evaluateBoardingHandoff(dealStage, evidence);
  } catch (err: unknown) {
    const stage = (dealStage ?? '').trim();
    return {
      dealStage: stage,
      dealClaimsBoarded: recognizeCanonicalStage(stage)?.code === 'BOARDED',
      handoffEvidencePresent: false,
      verdict: 'missing-handoff',
      boardingCompleted: false,
      blockers: [`Portfolio boarded-loan read threw: ${err instanceof Error ? err.message : String(err)} (fail-closed).`],
    };
  }
}

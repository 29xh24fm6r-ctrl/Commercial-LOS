import type { BoardingHandoffReadiness } from './boardingHandoffReadiness';

/**
 * Phase 258 — per-deal portfolio boarding status (read-only derivation).
 *
 * Factory Arc Phase 9: the phase vocabulary matches the per-deal boarding
 * states a banker/manager should see instead of a global boarding-persistence
 * gate — Not ready / Ready / Boarded / Requires completion / Failed. There is
 * deliberately no "In progress" phase here: no Dataverse-persisted signal
 * exists for "a boarding write is currently underway" (the write path's
 * outcome is reported once, synchronously, to the caller and nothing tracks
 * an in-flight attempt after the fact — see existingLoanEntryAdapter.ts).
 * Adding one would mean inventing a status this derivation cannot honestly
 * observe.
 *
 * Honest, schema-free projection of where a deal sits relative to portfolio
 * boarding: a loan boards into the portfolio once it funds, so a deal in/after
 * a funding/closing stage is "ready", everything earlier is "not-ready". No
 * fabricated boarded-loan link — this reflects the deal's own stage only.
 *
 * WFLOW-H: this stage-string signal is only honest BEFORE the deal reaches
 * BOARDED. Once a deal's stage string itself claims BOARDED, that claim is
 * not proof (see boardingHandoffReadiness.ts) — callers MUST switch to
 * `deriveBoardedHandoffStatus` fed by the real `evaluateBoardingHandoff`
 * result instead of trusting this function's stage-string match.
 */

export type PortfolioBoardingPhase = 'ready' | 'not-ready' | 'boarded' | 'requires-completion' | 'failed';

export interface PortfolioBoardingStatus {
  readonly phase: PortfolioBoardingPhase;
  readonly label: string;
  readonly note: string;
}

const ELIGIBLE_STAGE_PATTERN = /\b(fund|funded|funding|closed|closing|booked|booking|servic)/i;

export function derivePortfolioBoardingStatus(stage: string | undefined): PortfolioBoardingStatus {
  const eligible = typeof stage === 'string' && ELIGIBLE_STAGE_PATTERN.test(stage);
  if (eligible) {
    return {
      phase: 'ready',
      label: 'Ready for portfolio boarding',
      note: 'This loan can be boarded into the portfolio. Board and service it from the Portfolio workspace.',
    };
  }
  return {
    phase: 'not-ready',
    label: 'Not ready for boarding',
    note: 'Portfolio boarding becomes available once the loan funds. Continue the loan workflow to advance the deal.',
  };
}

/**
 * WFLOW-H — the honest status once the deal's stage string claims BOARDED.
 * Never trusts the stage string alone: `handoff` comes from
 * `evaluateBoardingHandoff`/`loadBoardingHandoffForDeal`, which reconciles the
 * claim against a real, active `cr664_portfolioboardedloans` record.
 *
 * Factory Arc Phase 9: the two non-"boarded" verdicts get distinct, honest
 * labels rather than being collapsed into one "unverified" bucket —
 * `missing-handoff` (the deal claims Boarded but no handoff record exists
 * yet) reads as "Requires completion"; `premature-handoff` (a handoff record
 * exists but the deal stage disagrees) is a genuine inconsistency and reads
 * as "Failed".
 */
export function deriveBoardedHandoffStatus(handoff: BoardingHandoffReadiness): PortfolioBoardingStatus {
  if (handoff.verdict === 'boarded') {
    return {
      phase: 'boarded',
      label: 'Boarded',
      note: 'This loan is boarded — an active portfolio record confirms the closing-to-servicing handoff. Manage it from the Portfolio workspace.',
    };
  }
  if (handoff.verdict === 'premature-handoff') {
    return {
      phase: 'failed',
      label: 'Boarding failed',
      note:
        handoff.blockers[0] ??
        'A portfolio boarded-loan record exists but this deal is not at the Boarded stage. The boarding record and the deal stage disagree — review this loan in the Portfolio workspace.',
    };
  }
  return {
    phase: 'requires-completion',
    label: 'Requires completion',
    note:
      handoff.blockers[0] ??
      'This deal claims Boarded, but no active portfolio boarded-loan record was found for it. Complete the handoff in the Portfolio workspace before treating this loan as boarded.',
  };
}

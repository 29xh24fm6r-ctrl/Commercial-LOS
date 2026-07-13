import type { BoardingHandoffReadiness } from './boardingHandoffReadiness';

/**
 * Phase 258 — per-deal portfolio boarding status (read-only derivation).
 *
 * Honest, schema-free projection of where a deal sits relative to portfolio
 * boarding: a loan boards into the portfolio once it funds, so a deal in/after
 * a funding/closing stage is "eligible", everything earlier is "pending". No
 * fabricated boarded-loan link — this reflects the deal's own stage only.
 *
 * WFLOW-H: this stage-string signal is only honest BEFORE the deal reaches
 * BOARDED. Once a deal's stage string itself claims BOARDED, that claim is
 * not proof (see boardingHandoffReadiness.ts) — callers MUST switch to
 * `deriveBoardedHandoffStatus` fed by the real `evaluateBoardingHandoff`
 * result instead of trusting this function's stage-string match.
 */

export type PortfolioBoardingPhase = 'eligible' | 'pending' | 'boarded' | 'unverified-handoff';

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
      phase: 'eligible',
      label: 'Ready for portfolio boarding',
      note: 'This loan can be boarded into the portfolio. Board and service it from the Portfolio workspace.',
    };
  }
  return {
    phase: 'pending',
    label: 'Boards after funding',
    note: 'Portfolio boarding becomes available once the loan funds. Continue the loan workflow to advance the deal.',
  };
}

/**
 * WFLOW-H — the honest status once the deal's stage string claims BOARDED.
 * Never trusts the stage string alone: `handoff` comes from
 * `evaluateBoardingHandoff`/`loadBoardingHandoffForDeal`, which reconciles the
 * claim against a real, active `cr664_portfolioboardedloans` record.
 */
export function deriveBoardedHandoffStatus(handoff: BoardingHandoffReadiness): PortfolioBoardingStatus {
  if (handoff.verdict === 'boarded') {
    return {
      phase: 'boarded',
      label: 'Boarded',
      note: 'This loan is boarded — an active portfolio record confirms the closing-to-servicing handoff. Manage it from the Portfolio workspace.',
    };
  }
  return {
    phase: 'unverified-handoff',
    label: 'Boarding unverified',
    note:
      handoff.blockers[0] ??
      'This deal claims Boarded, but no active portfolio boarded-loan record was found for it. Verify the handoff in the Portfolio workspace before treating this loan as boarded.',
  };
}

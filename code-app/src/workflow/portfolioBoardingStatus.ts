/**
 * Phase 258 — per-deal portfolio boarding status (read-only derivation).
 *
 * Honest, schema-free projection of where a deal sits relative to portfolio
 * boarding: a loan boards into the portfolio once it funds, so a deal in/after
 * a funding/closing stage is "eligible", everything earlier is "pending". No
 * fabricated boarded-loan link — this reflects the deal's own stage only.
 */

export type PortfolioBoardingPhase = 'eligible' | 'pending';

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

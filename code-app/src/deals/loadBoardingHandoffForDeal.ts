/**
 * WFLOW-H (live) — the SDK-touching loader for the pure boarding-handoff proof.
 *
 * Kept in `src/deals` so `src/workflow` stays SDK-free. Reads the ACTIVE portfolio
 * boarded-loan record linked to the deal (via cr664_OriginatedLoanDeal) through a
 * guarded dynamic import and reconciles it against the deal stage with the pure
 * `evaluateBoardingHandoff`. FAIL-CLOSED: a failed/thrown read reports a blocker and
 * `boardingCompleted:false` (never assumed-boarded).
 */

import {
  evaluateBoardingHandoff,
  unavailableBoardingHandoff,
  type BoardingHandoffEvidence,
  type BoardingHandoffReadiness,
} from '../workflow/boardingHandoffReadiness';

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
      return unavailableBoardingHandoff(dealStage, `Portfolio boarded-loan read failed: ${res.error?.message ?? 'unknown error'} (fail-closed).`);
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
    return unavailableBoardingHandoff(dealStage, `Portfolio boarded-loan read threw: ${err instanceof Error ? err.message : String(err)} (fail-closed).`);
  }
}

/**
 * WFLOW-F (live) — the SDK-touching loader for the pure stage-seed readiness proof.
 *
 * Kept in `src/deals` (with the other live-deps builders) so `src/workflow` stays
 * SDK-free. Reads the seeded `cr664_dealstagereferences` rows via a guarded dynamic
 * import and hands them to the pure `evaluateStageSeedReadiness`. FAIL-CLOSED: a
 * failed/thrown read is `ready:false` with an explicit reason (never assumed-good).
 */

import {
  evaluateStageSeedReadiness,
  unavailableStageSeedReadiness,
  type StageSeedReadiness,
} from '../workflow/stageSeedReadiness';
import type { StageReferenceRow } from '../workflow/stageOrderingContract';

export async function loadStageSeedReadiness(): Promise<StageSeedReadiness> {
  try {
    const { Cr664_dealstagereferencesService } = await import(
      '../generated/services/Cr664_dealstagereferencesService'
    );
    const res = await Cr664_dealstagereferencesService.getAll({
      select: ['cr664_code', 'cr664_name', 'cr664_sequence', 'cr664_activeflag'],
    });
    if (!res.success) {
      return unavailableStageSeedReadiness(`stage reference read failed: ${res.error?.message ?? 'unknown error'}`);
    }
    return evaluateStageSeedReadiness((res.data ?? []) as StageReferenceRow[]);
  } catch (err: unknown) {
    return unavailableStageSeedReadiness(`stage reference read threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

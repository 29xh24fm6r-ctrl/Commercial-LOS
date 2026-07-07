/**
 * WFLOW-F — deterministic stage-seed readiness proof.
 *
 * The live governed transitions (advance/return/decline/withdraw) all resolve the
 * deal's stage against the seeded `cr664_dealstagereferences` rows. Before a team
 * can rely on those transitions, the seed itself must be PROVEN: exactly the seven
 * canonical stages, each active, each carrying its ratified `cr664_sequence`
 * (INTAKE=10 … BOARDED=70), no duplicates, no gaps, correctly ordered.
 *
 * This module produces that proof deterministically. It layers on the structural
 * `resolveStageOrdering` (missing/duplicate/inactive/no-sequence checks) and adds the
 * EXACT nominal-sequence check (a stage seeded with the wrong sequence — e.g.
 * UNDERWRITING at 60 — is a real "unordered" seed defect the structural pass alone
 * would accept). FAIL-CLOSED: any defect yields `ready:false` with explicit reasons
 * and NO fabricated ordering. The evidence is a stable fingerprint suitable for the
 * machine-proven smoke record (WFLOW-I).
 */

import {
  CANONICAL_STAGES,
  CANONICAL_STAGE_CODES,
  resolveStageOrdering,
  type StageReferenceRow,
  type CanonicalStageCode,
} from './stageOrderingContract';

/** The ratified nominal seed: canonical code → its required cr664_sequence. */
export const NOMINAL_STAGE_SEQUENCE: Readonly<Record<CanonicalStageCode, number>> = Object.freeze(
  Object.fromEntries(CANONICAL_STAGES.map((s) => [s.code, s.sequence])) as Record<CanonicalStageCode, number>,
);

export interface ObservedStageSeedRow {
  readonly code: string;
  readonly name: string;
  readonly sequence: number | null;
  readonly active: boolean;
}

export interface StageSeedReadiness {
  /** True only when the seed is EXACTLY the seven canonical stages at their nominal sequences. */
  readonly ready: boolean;
  /** Explicit, de-duplicated defect reasons; empty iff `ready`. */
  readonly reasons: readonly string[];
  /** The ratified expectation (code:sequence), ascending — for side-by-side evidence. */
  readonly expected: readonly { readonly code: CanonicalStageCode; readonly sequence: number }[];
  /** What was actually observed in the seed, sorted by sequence then code. */
  readonly observed: readonly ObservedStageSeedRow[];
  /**
   * A stable, order-independent fingerprint of the ACTIVE canonical seed
   * (`CODE:sequence` joined by `|`, ascending). Deterministic — safe to record as
   * machine proof. Empty string when nothing resolvable.
   */
  readonly fingerprint: string;
}

/**
 * Pure seed-readiness evaluation. Deterministic for a given row set.
 */
export function evaluateStageSeedReadiness(rows: readonly StageReferenceRow[]): StageSeedReadiness {
  const reasons: string[] = [];

  const observed: ObservedStageSeedRow[] = rows
    .map((r) => ({
      code: (r.cr664_code ?? '').trim(),
      name: (r.cr664_name ?? '').trim(),
      sequence: typeof r.cr664_sequence === 'number' ? r.cr664_sequence : null,
      active: r.cr664_activeflag !== false,
    }))
    .sort((a, b) => (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER) || a.code.localeCompare(b.code));

  // Structural pass (missing / duplicate / inactive / no-sequence / shared-sequence /
  // unexpected code). Reuses the single fail-closed ordering authority.
  const ordering = resolveStageOrdering(rows);
  if (ordering.status !== 'ready') {
    reasons.push(...ordering.reasons);
  }

  // EXACT nominal-sequence pass: every canonical code must be present, active, and
  // carry precisely its ratified sequence. This is the check that catches a
  // structurally-valid-but-misordered seed.
  const activeCanonical = new Map<CanonicalStageCode, number | null>();
  for (const row of observed) {
    if (!row.active) continue;
    if ((CANONICAL_STAGE_CODES as readonly string[]).includes(row.code)) {
      const code = row.code as CanonicalStageCode;
      // Duplicates are already reported by the structural pass; keep the first here.
      if (!activeCanonical.has(code)) activeCanonical.set(code, row.sequence);
    }
  }
  for (const code of CANONICAL_STAGE_CODES) {
    if (!activeCanonical.has(code)) continue; // missing already reported structurally
    const seq = activeCanonical.get(code) ?? null;
    const expected = NOMINAL_STAGE_SEQUENCE[code];
    if (seq !== expected) {
      reasons.push(`stage ${code} sequence ${seq ?? '(none)'} does not match the ratified ${expected}`);
    }
  }

  const fingerprint = [...activeCanonical.entries()]
    .filter(([, seq]) => typeof seq === 'number')
    .sort((a, b) => (a[1] as number) - (b[1] as number))
    .map(([code, seq]) => `${code}:${seq}`)
    .join('|');

  const dedupedReasons = [...new Set(reasons)];
  return {
    ready: dedupedReasons.length === 0,
    reasons: dedupedReasons,
    expected: CANONICAL_STAGES.map((s) => ({ code: s.code, sequence: s.sequence })),
    observed,
    fingerprint,
  };
}

/** The fingerprint a fully-correct seed must produce (INTAKE:10|…|BOARDED:70). */
export const EXPECTED_STAGE_SEED_FINGERPRINT: string = CANONICAL_STAGES
  .slice()
  .sort((a, b) => a.sequence - b.sequence)
  .map((s) => `${s.code}:${s.sequence}`)
  .join('|');

/**
 * Live seed-readiness proof: reads the seeded `cr664_dealstagereferences` rows and
 * evaluates them. SDK-only via a guarded dynamic import. Fail-closed: a failed read
 * is `ready:false` with an explicit reason (never assumed-good).
 */
export async function loadStageSeedReadiness(): Promise<StageSeedReadiness> {
  try {
    const { Cr664_dealstagereferencesService } = await import(
      '../generated/services/Cr664_dealstagereferencesService'
    );
    const res = await Cr664_dealstagereferencesService.getAll({
      select: ['cr664_code', 'cr664_name', 'cr664_sequence', 'cr664_activeflag'],
    });
    if (!res.success) {
      return {
        ready: false,
        reasons: [`stage reference read failed: ${res.error?.message ?? 'unknown error'}`],
        expected: CANONICAL_STAGES.map((s) => ({ code: s.code, sequence: s.sequence })),
        observed: [],
        fingerprint: '',
      };
    }
    return evaluateStageSeedReadiness((res.data ?? []) as StageReferenceRow[]);
  } catch (err: unknown) {
    return {
      ready: false,
      reasons: [`stage reference read threw: ${err instanceof Error ? err.message : String(err)}`],
      expected: CANONICAL_STAGES.map((s) => ({ code: s.code, sequence: s.sequence })),
      observed: [],
      fingerprint: '',
    };
  }
}

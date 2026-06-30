/**
 * Stage progression write availability — pure shared governance utility.
 *
 * Stage Advancement spec (current): the stage-reference data source and the deterministic
 * ordering CONTRACT now both exist in the repo (`Cr664_dealstagereferencesService` is generated;
 * `src/workflow/stageOrderingContract.ts` resolves order from `cr664_sequence`). What remains is a
 * DATA fact, owned by the maker: the seven stage rows must be seeded with unique `cr664_sequence`
 * values (and the SDK regenerated to expose the field). See `docs/STAGE_SCHEMA_SETUP.md`.
 *
 * Availability is therefore data-driven and FAIL-CLOSED: `available` is true ONLY when a complete,
 * conflict-free ordered set resolves. Surfaces that have loaded the stage-reference rows derive it
 * from the ordering result (`deriveStageProgressionAvailability` / `deriveStageProgressionDiagnostics`).
 * The legacy no-arg `stageProgressionAvailability()` / `stageProgressionDiagnostics()` represent the
 * "rows not loaded in this context" state — honestly unavailable until the environment is seeded —
 * and remain the single source of truth for the banker banner + admin diagnostics card.
 */

import type { StageOrderingResult } from '../../workflow/stageOrderingContract';

export interface StageProgressionAvailability {
  available: boolean;
  /** Banker-facing one-line summary surfaced in the deal-workspace banner. */
  banner: string;
  /** Engineer-facing detail surfaced beneath the banner. */
  detail: string;
}

export type DiagnosticState = 'present' | 'missing' | 'unknown';
export type DiagnosticSeverity = 'clear' | 'at-risk' | 'blocked';

export interface StageProgressionCheck {
  id: string;
  label: string;
  state: DiagnosticState;
  severity: DiagnosticSeverity;
  detail: string;
}

export interface StageProgressionDiagnostics {
  available: boolean;
  overallSeverity: DiagnosticSeverity;
  checks: readonly StageProgressionCheck[];
  remediation: readonly string[];
  affectedFeatures: readonly string[];
}

const NOT_SEEDED_BANNER = 'Advance Stage is not yet available on this workspace.';

const NOT_SEEDED_DETAIL =
  'The stage-reference table and the deterministic ordering contract are both in place, but the ' +
  'stage rows are not yet seeded with a unique cr664_sequence ordering in this environment (and the ' +
  'typed SDK must be regenerated to expose the field). Stage advancement stays read-only until a ' +
  'complete, conflict-free ordered set is seeded. See docs/STAGE_SCHEMA_SETUP.md.';

const READY_BANNER = 'Advance Stage is available — the stage ordering is seeded and deterministic.';

/** Stable "rows were not loaded in this calling context" ordering result. */
const ROWS_NOT_LOADED: StageOrderingResult = {
  status: 'unavailable',
  reasons: ['Stage-reference rows are not loaded in this context; awaiting maker seed + SDK regen.'],
};

/**
 * Derive write-availability from a resolved stage ordering. `available` is true ONLY for a ready
 * (complete, conflict-free) ordering.
 */
export function deriveStageProgressionAvailability(
  ordering: StageOrderingResult,
): StageProgressionAvailability {
  if (ordering.status === 'ready') {
    return { available: true, banner: READY_BANNER, detail: 'The seven canonical stages resolve in a unique, ascending sequence order.' };
  }
  return {
    available: false,
    banner: NOT_SEEDED_BANNER,
    detail: `${NOT_SEEDED_DETAIL} (${ordering.reasons.join('; ')})`,
  };
}

/**
 * Legacy no-arg form — the schema/governance surfaces that have not loaded the stage rows.
 * Honestly unavailable until the environment is seeded.
 */
export function stageProgressionAvailability(): StageProgressionAvailability {
  return deriveStageProgressionAvailability(ROWS_NOT_LOADED);
}

const REMEDIATION_READY: readonly string[] = [
  'Stage ordering is seeded and resolves deterministically — no action required.',
];

function remediationNotSeeded(): readonly string[] {
  return [
    'Add cr664_sequence (Whole Number) to cr664_dealstagereferences in make.powerapps.com (docs/STAGE_SCHEMA_SETUP.md).',
    'Seed the seven ordered stage rows + status rows: node scripts/seed-stage-references.mjs --commit.',
    'Regenerate the typed SDK (pac code add-data-source / regenerate-powerapps-sdk.ps1) so cr664_sequence appears on the generated model.',
    'Confirm with node scripts/seed-stage-references.mjs --verify, then re-run the build and test suite.',
    'Availability flips to available automatically once resolveStageOrdering() returns a ready set.',
  ];
}

/**
 * Derive the admin diagnostics shape from a resolved stage ordering.
 */
export function deriveStageProgressionDiagnostics(
  ordering: StageOrderingResult,
): StageProgressionDiagnostics {
  const ready = ordering.status === 'ready';
  const orderingDetail = ready
    ? 'resolveStageOrdering() returns a complete, conflict-free ordered set; advancement is available.'
    : `resolveStageOrdering() is not yet resolvable in this environment: ${ordering.reasons.join('; ')}. Advance Stage stays read-only until the rows are seeded.`;

  const checks: StageProgressionCheck[] = [
    {
      id: 'stage-reference-data-source',
      label: 'Stage reference data source',
      state: 'present',
      severity: 'clear',
      detail:
        'Cr664_dealstagereferencesService and Cr664_dealstatusreferencesService are generated and registered as Power Apps data sources; stage/status rows are enumerable via the typed client.',
    },
    {
      id: 'stage-ordering-contract',
      label: 'Stage ordering contract',
      state: 'present',
      severity: 'clear',
      detail:
        'src/workflow/stageOrderingContract.ts resolves next/prior/terminal deterministically from cr664_sequence, returning an explicit unavailable result on any ambiguity rather than guessing. No order is hardcoded.',
    },
    {
      id: 'stage-ordering-resolved',
      label: 'Stage ordering resolved (seeded data)',
      state: ready ? 'present' : 'missing',
      severity: ready ? 'clear' : 'blocked',
      detail: orderingDetail,
    },
  ];

  const overallSeverity: DiagnosticSeverity = checks.some((c) => c.severity === 'blocked')
    ? 'blocked'
    : checks.some((c) => c.severity === 'at-risk')
      ? 'at-risk'
      : 'clear';

  return {
    available: ready,
    overallSeverity,
    checks,
    affectedFeatures: ['Deal Stage Progression (Advance Stage)'],
    remediation: ready ? REMEDIATION_READY : remediationNotSeeded(),
  };
}

/**
 * Legacy no-arg form for the admin StageGovernanceDiagnostics card.
 */
export function stageProgressionDiagnostics(): StageProgressionDiagnostics {
  return deriveStageProgressionDiagnostics(ROWS_NOT_LOADED);
}

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

import type { StageOrderingResult, StageTransitionGraph } from '../../workflow/stageOrderingContract';
import type { StatusReferenceResult } from '../../workflow/statusReferenceContract';
import {
  capabilityAvailable,
  capabilityUnavailable,
  type CapabilityAvailability,
  type CapabilityBlockingReason,
} from './capabilityAvailability';

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

/**
 * Factory Arc Phase 6 — the "stage-advancement" CapabilityAvailability,
 * composing the three independent facts DealStageProgressionCard.tsx already
 * checks: a resolved actor (audit-identity), the AUTO_STAGE_ADVANCE_ENABLED
 * deployment gate (permission — same bucket as the other deployment-level
 * flags in new-deal-create), and this schema/ordering readiness (connection —
 * a live backend dependency, the stage-reference rows, must be seeded).
 *
 * Deliberately excludes per-stage business/workflow policy
 * (evaluateStageTransitionPolicy, credit-approval authority) — those answer
 * "can THIS deal advance right now," a deal-state question belonging to
 * dealBlockerModel.ts / stageTransitionPolicy.ts / creditApprovalAuthority.ts,
 * not "is the stage-advancement action itself live for ANY deal right now."
 * Conflating the two would misrepresent a normal per-deal workflow block as a
 * system capability outage.
 */
export function deriveStageAdvancementAvailability(
  hasActor: boolean,
  autoStageAdvanceEnabled: boolean,
  schemaAvailability: StageProgressionAvailability,
  checkedAt: string,
): CapabilityAvailability {
  const reasons: CapabilityBlockingReason[] = [];
  if (!hasActor) {
    reasons.push({ kind: 'audit-identity', detail: 'No resolved actor identity is available for this banker context.' });
  }
  if (!autoStageAdvanceEnabled) {
    reasons.push({ kind: 'permission', detail: 'Stage advancement is not enabled for your role/workspace.' });
  }
  if (!schemaAvailability.available) {
    reasons.push({ kind: 'connection', detail: schemaAvailability.banner });
  }
  if (reasons.length === 0) return capabilityAvailable('stage-advancement', checkedAt);
  return capabilityUnavailable('stage-advancement', reasons, checkedAt);
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
 * Legacy no-arg form for the banker banner / backward-compat surfaces.
 */
export function stageProgressionDiagnostics(): StageProgressionDiagnostics {
  return deriveStageProgressionDiagnostics(ROWS_NOT_LOADED);
}

// ---------------------------------------------------------------------------
// Phase 5 — rich, LIVE-DATA-DRIVEN stage governance diagnostics.
//
// The admin card previously rendered the no-arg (always-blocked) form, so it
// could never reflect a seeded environment. This shape is derived from the
// ACTUAL stage + status reference rows: it shows the exact rows found, their
// sequence + active state, the status-reference set, and the resolved transition
// graph — and flips to READY only when the ordering resolves, the statuses are
// seeded, and the transition graph is valid.
// ---------------------------------------------------------------------------

/** One stage-reference row as surfaced in the diagnostics table. */
export interface StageRowView {
  readonly code: string;
  readonly name: string;
  readonly sequence: number | null;
  readonly active: boolean;
  /** True when the code is one of the canonical stage codes. */
  readonly canonical: boolean;
}

/** One status-reference row as surfaced in the diagnostics table. */
export interface StatusRowView {
  readonly code: string;
  readonly name: string;
  readonly active: boolean;
  readonly canonical: boolean;
}

export interface StageGovernanceDiagnostics extends StageProgressionDiagnostics {
  /** The exact stage-reference rows found (sorted by sequence then code). */
  readonly stageRows: readonly StageRowView[];
  /** The exact status-reference rows found. */
  readonly statusRows: readonly StatusRowView[];
  /** The resolved transition path (canonical codes), or [] when not resolvable. */
  readonly transitionPath: readonly string[];
}

export interface StageGovernanceDiagnosticsInput {
  readonly stageOrdering: StageOrderingResult;
  readonly statusResult: StatusReferenceResult;
  readonly stageRows: readonly StageRowView[];
  readonly statusRows: readonly StatusRowView[];
  /** Present only when the ordering resolved (else the graph cannot be built). */
  readonly transitionGraph: StageTransitionGraph | null;
  /**
   * When true, a read/environment failure prevented loading rows — the card
   * shows the honest "not loaded / not seeded" state rather than a false empty.
   */
  readonly loadFailedReason?: string;
  /**
   * ACTIVE non-canonical / legacy-test reference rows present alongside the
   * canonical set (e.g. PHASE121_STAGE / PHASE121_STATUS). The `stageOrdering` /
   * `statusResult` passed here are resolved IGNORING these, so a complete
   * canonical set is not blocked by leftover legacy rows — they surface as an
   * at-risk hygiene WARNING (run the deactivation script), never a CRITICAL block.
   */
  readonly legacyActiveStageCodes?: readonly string[];
  readonly legacyActiveStatusCodes?: readonly string[];
}

function severityRollup(checks: readonly StageProgressionCheck[]): DiagnosticSeverity {
  return checks.some((c) => c.severity === 'blocked')
    ? 'blocked'
    : checks.some((c) => c.severity === 'at-risk')
      ? 'at-risk'
      : 'clear';
}

function remediationGovernance(
  stageReady: boolean,
  statusReady: boolean,
  graphValid: boolean,
  hasLegacy: boolean,
): readonly string[] {
  if (stageReady && statusReady && graphValid && !hasLegacy) return REMEDIATION_READY;
  const steps: string[] = [];
  if (!stageReady || !statusReady || !graphValid) {
    steps.push(
      'Add cr664_sequence (Whole Number) to cr664_dealstagereferences in make.powerapps.com (docs/STAGE_SCHEMA_SETUP.md).',
      'Seed the seven ordered stage rows AND the five disposition status rows: node scripts/seed-stage-references.mjs --commit.',
      'Regenerate the typed SDK (pac code add-data-source / regenerate-powerapps-sdk.ps1) so cr664_sequence appears on the generated model.',
      'Confirm with node scripts/seed-stage-references.mjs --verify, then re-run the build and test suite.',
    );
  }
  if (hasLegacy) {
    steps.push(
      'Deactivate leftover legacy/test reference rows (e.g. PHASE121_STAGE / PHASE121_STATUS): node scripts/deactivate-legacy-stage-status-references.mjs --commit (dry-run first, then --verify).',
    );
  }
  steps.push(
    'Diagnostics flip to READY once the canonical ordering + five statuses + transition graph are valid AND no active legacy/test rows remain.',
  );
  return steps;
}

/**
 * Derive the rich admin diagnostics from LIVE stage + status reference data.
 */
export function deriveStageGovernanceDiagnostics(
  input: StageGovernanceDiagnosticsInput,
): StageGovernanceDiagnostics {
  const stageReady = input.stageOrdering.status === 'ready';
  const statusReady = input.statusResult.status === 'ready';
  const graphValid = input.transitionGraph?.valid === true;
  const orderedRows = [...input.stageRows].sort((a, b) => {
    const sa = a.sequence ?? Number.MAX_SAFE_INTEGER;
    const sb = b.sequence ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.code.localeCompare(b.code);
  });
  const transitionPath = input.transitionGraph?.path ?? [];

  const orderingDetail = input.loadFailedReason
    ? `Stage-reference rows could not be loaded in this environment: ${input.loadFailedReason}. Advance Stage stays read-only until the rows are seeded and readable.`
    : stageReady
      ? `resolveStageOrdering() returns a complete, conflict-free ordered set (${transitionPath.join(' → ')}); advancement ordering is available.`
      : `resolveStageOrdering() is not yet resolvable: ${(input.stageOrdering as { reasons: readonly string[] }).reasons.join('; ')}. Advance Stage stays read-only until the rows are seeded.`;

  const statusDetail = input.loadFailedReason
    ? 'Status-reference rows could not be loaded in this environment.'
    : statusReady
      ? `The five canonical disposition statuses are seeded and active (${input.statusResult.statuses.map((s) => s.code).join(', ')}).`
      : `Status references are not complete: ${(input.statusResult as { reasons: readonly string[] }).reasons.join('; ')}.`;

  const graphDetail = !stageReady
    ? 'Awaiting a resolvable stage ordering before the transition graph can be validated.'
    : graphValid
      ? `The transition graph is a single valid chain: ${transitionPath.join(' → ')}. Only adjacent single-step advances are legal; skips are rejected by the transition engine.`
      : `The transition graph did not validate: ${(input.transitionGraph?.issues ?? []).join('; ')}.`;

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
      state: stageReady ? 'present' : 'missing',
      severity: stageReady ? 'clear' : 'blocked',
      detail: orderingDetail,
    },
    {
      id: 'status-references-seeded',
      label: 'Status references seeded',
      state: statusReady ? 'present' : 'missing',
      severity: statusReady ? 'clear' : 'blocked',
      detail: statusDetail,
    },
    {
      id: 'transition-graph-valid',
      label: 'Transition graph valid',
      state: graphValid ? 'present' : 'missing',
      severity: graphValid ? 'clear' : 'blocked',
      detail: graphDetail,
    },
  ];

  // Reference hygiene: leftover ACTIVE legacy/test rows do NOT block a complete
  // canonical set — they are an at-risk WARNING with a one-command cleanup, not a
  // CRITICAL failure. (Inactive legacy rows are already ignored by the resolvers.)
  const legacyStages = input.legacyActiveStageCodes ?? [];
  const legacyStatuses = input.legacyActiveStatusCodes ?? [];
  const legacyLabels = [
    ...legacyStages.map((c) => `stage ${c}`),
    ...legacyStatuses.map((c) => `status ${c}`),
  ];
  const hasLegacy = legacyLabels.length > 0;
  if (!input.loadFailedReason) {
    checks.push({
      id: 'reference-hygiene',
      label: 'Reference hygiene (no active legacy/test rows)',
      state: hasLegacy ? 'missing' : 'present',
      severity: hasLegacy ? 'at-risk' : 'clear',
      detail: hasLegacy
        ? `The canonical set is otherwise complete, but active non-canonical / legacy-test rows remain and should be deactivated: ${legacyLabels.join(', ')}. This is a WARNING, not a hard failure — run scripts/deactivate-legacy-stage-status-references.mjs --commit. Governed advancement stays strict (blocks on active non-canonical rows) until they are deactivated.`
        : 'No active non-canonical / legacy-test reference rows; the stage + status sets are clean.',
    });
  }

  // Ready requires the canonical set complete AND a clean set (no active legacy).
  const available = stageReady && statusReady && graphValid && !hasLegacy;
  return {
    available,
    overallSeverity: severityRollup(checks),
    checks,
    affectedFeatures: ['Deal Stage Progression (Advance / Return / Decline / Withdraw)'],
    remediation: remediationGovernance(stageReady, statusReady, graphValid, hasLegacy),
    stageRows: orderedRows,
    statusRows: input.statusRows,
    transitionPath,
  };
}

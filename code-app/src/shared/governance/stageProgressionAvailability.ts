/**
 * Stage progression write availability — pure shared governance utility.
 *
 * Phase 28 ground truth: the Dataverse schema does NOT yet expose a
 * deterministic next-stage ordering. The Phase 28 brief explicitly
 * required this be shipped as a blocked implementation rather than
 * hardcoding a stage order. See the schema audit in the diagnostics
 * shape below.
 *
 * Phase 29 (current): this module also exposes a structured diagnostic
 * shape so the Admin Workspace can surface the same gate as governed
 * configuration visibility, NOT just as a banker-facing banner. Admin
 * imports only this pure module — no deal-workspace component/provider
 * is reached into, preserving sealed-role-module discipline.
 *
 * To flip the gate to available in a future phase, ALL of the
 * following must be true:
 *   1. A stage-reference service exists in src/generated/services/
 *      (typically Cr664_dealstagereferencesService or similar).
 *   2. The corresponding model exposes an explicit ordering field
 *      (e.g. cr664_sequence, cr664_order, or an enum with a known
 *      ordinal contract).
 *   3. The stage-progression action follows the Phase 21/22/25
 *      coordination pattern (update + audit + timeline + correlation
 *      id + governance-partial outcome).
 *
 * Until then this file is the single source of truth — flipping it
 * later is a tiny, traceable change with no scattered toggles.
 */

export interface StageProgressionAvailability {
  available: boolean;
  /** Banker-facing one-line summary surfaced in the deal-workspace banner. */
  banner: string;
  /** Engineer-facing detail surfaced beneath the banner, suitable for
   *  inclusion in a JIRA / schema-design conversation. */
  detail: string;
}

export type DiagnosticState = 'present' | 'missing' | 'unknown';
export type DiagnosticSeverity = 'clear' | 'at-risk' | 'blocked';

export interface StageProgressionCheck {
  id: string;
  /** Short label shown in the diagnostics card. */
  label: string;
  state: DiagnosticState;
  severity: DiagnosticSeverity;
  /** Banker / admin-readable explanation of the current state. */
  detail: string;
}

export interface StageProgressionDiagnostics {
  /** Mirror of stageProgressionAvailability().available. */
  available: boolean;
  /** Overall severity rollup across the individual checks. */
  overallSeverity: DiagnosticSeverity;
  /** Read-only check rows for the admin diagnostics card. */
  checks: readonly StageProgressionCheck[];
  /** Step-by-step remediation. Stable, ordered, no fix buttons. */
  remediation: readonly string[];
  /** Feature(s) currently blocked by this gap, surfaced verbatim in
   *  the admin card so the impact is obvious without cross-referencing. */
  affectedFeatures: readonly string[];
}

const SCHEMA_LIMITATION_BANNER =
  'Advance Stage is not yet available on this workspace.';

const SCHEMA_LIMITATION_DETAIL =
  'The Dataverse schema does not currently expose a deterministic next-stage ordering (no Cr664_stagereferences service in the generated SDK, no sequence/order field on the loan deal record). A stage-progression write is intentionally not shipped until a typed stage-reference table with an ordering contract is available. See src/shared/governance/stageProgressionAvailability.ts for the future-extension contract.';

/**
 * Returns the current write-availability state for Advance Stage.
 * Pure; no I/O. The function deliberately does not consume runtime
 * data — write availability is a SCHEMA-LEVEL property, not a
 * per-deal property. Per-deal eligibility lives in the deal module's
 * deriveStageProgressionEligibility (Phase 27).
 */
export function stageProgressionAvailability(): StageProgressionAvailability {
  return {
    available: false,
    banner: SCHEMA_LIMITATION_BANNER,
    detail: SCHEMA_LIMITATION_DETAIL,
  };
}

/**
 * Returns the structured diagnostic shape used by the admin
 * StageGovernanceDiagnostics card. Pure; no I/O. Mirrors the
 * conclusions of stageProgressionAvailability() but breaks them out
 * into individual checks the admin can scan.
 */
export function stageProgressionDiagnostics(): StageProgressionDiagnostics {
  const checks: StageProgressionCheck[] = [
    {
      id: 'stage-reference-data-source',
      label: 'Stage reference data source',
      state: 'missing',
      severity: 'blocked',
      detail:
        'No Cr664_stagereferences service is present in src/generated/services/. The stage reference entity is not registered as a Power Apps data source, so available stages are not enumerable via the typed client.',
    },
    {
      id: 'stage-ordering-contract',
      label: 'Stage ordering contract',
      state: 'missing',
      severity: 'blocked',
      detail:
        'No sequence / order field is exposed on cr664_loandeal, cr664_systemsettings, or cr664_kpithresholdconfigurations. Without a deterministic ordinal, "what stage comes next" is not resolvable without inventing an order.',
    },
    {
      id: 'stage-progression-write-availability',
      label: 'Stage progression write availability',
      state: 'missing',
      severity: 'at-risk',
      detail:
        'Advance Stage is intentionally not shipped while the two checks above remain unmet. Banker workspace shows a corresponding read-only banner; no Advance Stage / Move Stage / Promote control is rendered anywhere.',
    },
  ];

  // 'blocked' beats 'at-risk' beats 'clear'.
  const overallSeverity: DiagnosticSeverity = checks.some(
    (c) => c.severity === 'blocked',
  )
    ? 'blocked'
    : checks.some((c) => c.severity === 'at-risk')
      ? 'at-risk'
      : 'clear';

  return {
    available: false,
    overallSeverity,
    checks,
    affectedFeatures: ['Deal Stage Progression (Advance Stage)'],
    remediation: [
      'Add the stage-reference table / entity as a Power Apps data source via `pac code add-data-source` (or equivalent).',
      'Re-generate the SDK so a Cr664_stagereferences service and model appear in src/generated/.',
      'Confirm an ordering / sequence field on the stage reference model (cr664_sequence, cr664_order, or a documented enum ordinal).',
      'Re-run npm run build and the test suite; flip stageProgressionAvailability() to available: true.',
      'Then implement advanceStage(input) following the Phase 21/22/25 coordination pattern (update + audit + timeline + correlation id + governance-partial outcome).',
    ],
  };
}

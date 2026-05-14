/**
 * Phase 41: canonical stage catalog.
 *
 * Single authoritative source for:
 *   - stage identity (StageId)
 *   - lifecycle grouping (preflight / pipeline / underwriting / closing /
 *                          postClosing / terminal)
 *   - canonical ordinal ordering
 *   - terminal-stage semantics
 *   - legal forward-transition metadata (governance only — no progression
 *                                          is wired)
 *
 * Discipline (per the Phase 41 brief):
 *   - The catalog is frozen / read-only / deterministic / human-auditable.
 *   - This module does NOT enable stage progression. canTransitionStage()
 *     is a governance predicate; it returns whether a transition WOULD be
 *     legal under the catalog, but performs no write, no workflow trigger,
 *     no Dataverse mutation. The Phase 28 schema gap remains the blocker.
 *   - getLifecycleGroupByName() preserves the Phase-27 memo-gating regex
 *     behavior exactly. It is documented as a soft NAME classifier that
 *     coexists with the hard ID-based catalog — needed because the live
 *     Dataverse data does not yet expose stable stage ids.
 *   - No silent fallback ORDERING. Lookups for unknown stage ids return
 *     undefined. Name-classification fallback is explicit and documented;
 *     it never invents an ordinal.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StageId =
  | 'origination'
  | 'screening'
  | 'application'
  | 'pricing'
  | 'underwriting'
  | 'committee'
  | 'documentation'
  | 'closing'
  | 'funded'
  | 'closed-won'
  | 'closed-lost'
  | 'cancelled';

export type LifecycleGroup =
  | 'preflight'
  | 'pipeline'
  | 'underwriting'
  | 'closing'
  | 'postClosing'
  | 'terminal';

export interface StageDefinition {
  id: StageId;
  label: string;
  ordinal: number;
  lifecycleGroup: LifecycleGroup;
  isTerminal: boolean;
  /** Stages this stage is legally allowed to advance to under the canonical
   *  contract. Read-only governance metadata — the catalog never WRITES a
   *  transition; the Phase 28 schema gap keeps progression intentionally
   *  blocked. */
  allowedForwardTransitions: readonly StageId[];
}

// ---------------------------------------------------------------------------
// The catalog
//
// Ordering rule: entries appear ordinal-ascending. Ordinals are spaced so
// future insertions don't renumber callers (we have not yet shipped any
// in-app consumer that depends on a specific numeric value — the spacing
// is just defensive auditability).
// ---------------------------------------------------------------------------

export const STAGE_CATALOG: readonly StageDefinition[] = Object.freeze([
  {
    id: 'origination',
    label: 'Origination',
    ordinal: 10,
    lifecycleGroup: 'preflight',
    isTerminal: false,
    allowedForwardTransitions: ['screening'],
  },
  {
    id: 'screening',
    label: 'Screening',
    ordinal: 20,
    lifecycleGroup: 'preflight',
    isTerminal: false,
    allowedForwardTransitions: ['application'],
  },
  {
    id: 'application',
    label: 'Application',
    ordinal: 30,
    lifecycleGroup: 'pipeline',
    isTerminal: false,
    allowedForwardTransitions: ['pricing'],
  },
  {
    id: 'pricing',
    label: 'Pricing',
    ordinal: 40,
    lifecycleGroup: 'pipeline',
    isTerminal: false,
    allowedForwardTransitions: ['underwriting'],
  },
  {
    id: 'underwriting',
    label: 'Underwriting',
    ordinal: 50,
    lifecycleGroup: 'underwriting',
    isTerminal: false,
    allowedForwardTransitions: ['committee'],
  },
  {
    id: 'committee',
    label: 'Committee',
    ordinal: 60,
    lifecycleGroup: 'underwriting',
    isTerminal: false,
    allowedForwardTransitions: ['documentation'],
  },
  {
    id: 'documentation',
    label: 'Documentation',
    ordinal: 70,
    lifecycleGroup: 'closing',
    isTerminal: false,
    allowedForwardTransitions: ['closing'],
  },
  {
    id: 'closing',
    label: 'Closing',
    ordinal: 80,
    lifecycleGroup: 'closing',
    isTerminal: false,
    allowedForwardTransitions: ['funded'],
  },
  {
    id: 'funded',
    label: 'Funded',
    ordinal: 90,
    lifecycleGroup: 'postClosing',
    isTerminal: false,
    allowedForwardTransitions: ['closed-won'],
  },
  {
    id: 'closed-won',
    label: 'Closed — Won',
    ordinal: 1000,
    lifecycleGroup: 'terminal',
    isTerminal: true,
    allowedForwardTransitions: [],
  },
  {
    id: 'closed-lost',
    label: 'Closed — Lost',
    ordinal: 1010,
    lifecycleGroup: 'terminal',
    isTerminal: true,
    allowedForwardTransitions: [],
  },
  {
    id: 'cancelled',
    label: 'Cancelled',
    ordinal: 1020,
    lifecycleGroup: 'terminal',
    isTerminal: true,
    allowedForwardTransitions: [],
  },
] as const);

const STAGES_BY_ID: ReadonlyMap<StageId, StageDefinition> = new Map(
  STAGE_CATALOG.map((s) => [s.id, s]),
);

// ---------------------------------------------------------------------------
// Selectors (hard contract — operate on StageId)
// ---------------------------------------------------------------------------

export function getStageById(stageId: string | undefined): StageDefinition | undefined {
  if (!stageId) return undefined;
  return STAGES_BY_ID.get(stageId as StageId);
}

export function getOrderedStages(): readonly StageDefinition[] {
  return STAGE_CATALOG;
}

/**
 * Returns the single canonical next stage for a given stage, or undefined
 * if the stage is terminal / unknown / has no forward transition. Multiple
 * allowed transitions are NOT represented here — use canTransitionStage()
 * to test specific from/to pairs.
 *
 * The current catalog has exactly one happy-path forward transition per
 * non-terminal stage. This function returns that single next stage as the
 * canonical next pointer.
 */
export function getNextStage(stageId: string | undefined): StageDefinition | undefined {
  const stage = getStageById(stageId);
  if (!stage) return undefined;
  if (stage.allowedForwardTransitions.length === 0) return undefined;
  const next = stage.allowedForwardTransitions[0];
  return next ? getStageById(next) : undefined;
}

export function isTerminalStage(stageId: string | undefined): boolean {
  const stage = getStageById(stageId);
  return stage?.isTerminal ?? false;
}

/**
 * Governance predicate: would the transition from→to be legal under the
 * canonical catalog? This is METADATA ONLY. It performs no write, no
 * workflow trigger, no Dataverse mutation. Phase 28's schema gap keeps
 * the actual Advance Stage write blocked regardless of this function's
 * return value.
 */
export function canTransitionStage(
  fromStageId: string | undefined,
  toStageId: string | undefined,
): boolean {
  if (!fromStageId || !toStageId) return false;
  if (fromStageId === toStageId) return false; // self-transition forbidden
  const from = getStageById(fromStageId);
  if (!from) return false;
  return from.allowedForwardTransitions.includes(toStageId as StageId);
}

export function getLifecycleGroup(stageId: string | undefined): LifecycleGroup | undefined {
  return getStageById(stageId)?.lifecycleGroup;
}

// ---------------------------------------------------------------------------
// Soft NAME classifier (preserves Phase-27 memo-gating regex behavior)
//
// Live Dataverse data exposes cr664_stagereferencename as a free-text-ish
// field. There is no stable stage id today (Phase 28 schema gap). Consumers
// that need to classify an arbitrary stage NAME into a lifecycle group use
// the helper below. The regex set per group is intentionally narrow — it
// captures EXACTLY the patterns the existing in-app callers already used,
// so this Phase-41 refactor does not change runtime behavior.
//
// To add a new pattern, edit the catalog AND the patterns list together
// and update the tests. The catalog itself remains canonical for stages
// with known StageIds.
// ---------------------------------------------------------------------------

const LIFECYCLE_NAME_PATTERNS: Readonly<Record<LifecycleGroup, readonly RegExp[]>> =
  Object.freeze({
    preflight: [/originat/i, /screen/i],
    pipeline: [/applicat/i, /pricing/i],
    // The two patterns below match Phase 27's MEMO_GATING_STAGE_PATTERNS
    // exactly. Do not narrow or widen without a paired behavior-change
    // commit and updated tests.
    underwriting: [/underwrit/i, /committee/i],
    closing: [/documenta/i, /closing/i],
    postClosing: [/funded/i, /booked/i],
    terminal: [/closed[\s-]*(won|lost)/i, /cancel/i],
  });

/**
 * Soft classifier: maps an arbitrary stage-name string to a lifecycle group.
 *   1. Exact case-insensitive match against catalog id or label → canonical
 *      group.
 *   2. Fallback: keyword/pattern match against the documented regex set per
 *      group (the patterns in LIFECYCLE_NAME_PATTERNS).
 *   3. Returns undefined if nothing matches. Callers must handle undefined
 *      explicitly — no silent default.
 */
export function getLifecycleGroupByName(
  stageName: string | undefined,
): LifecycleGroup | undefined {
  if (!stageName) return undefined;
  const normalized = stageName.trim().toLowerCase();
  if (normalized.length === 0) return undefined;

  // 1. Exact match against canonical id or label.
  for (const stage of STAGE_CATALOG) {
    if (stage.id === normalized || stage.label.toLowerCase() === normalized) {
      return stage.lifecycleGroup;
    }
  }

  // 2. Pattern fallback. Each group's patterns are checked in order; the
  //    first group with a matching pattern wins. Group iteration order is
  //    the LIFECYCLE_NAME_PATTERNS object key order, which matches the
  //    canonical lifecycle progression.
  for (const [group, patterns] of Object.entries(LIFECYCLE_NAME_PATTERNS) as [
    LifecycleGroup,
    readonly RegExp[],
  ][]) {
    for (const pattern of patterns) {
      if (pattern.test(stageName)) return group;
    }
  }
  return undefined;
}

/**
 * Phase-27 memo-gating helper. Returns true when the supplied stage name
 * is in the 'underwriting' lifecycle group — i.e. a stage that gates
 * forward progression on a credit memo. Exists as a NAMED helper because
 * the original Phase-27 code was a small regex block and this is what
 * consumers actually want to ask.
 */
export function stageNameGatesMemo(stageName: string | undefined): boolean {
  return getLifecycleGroupByName(stageName) === 'underwriting';
}

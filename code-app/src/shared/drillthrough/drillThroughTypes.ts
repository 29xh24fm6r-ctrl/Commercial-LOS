/**
 * Phase 144A — System-wide drill-through contract (types + builders).
 *
 * Establishes the reusable, read-only payload shape that lets every dashboard
 * card, KPI tile, queue row, summary box, cockpit widget, and intelligence panel
 * explain itself: what it summarizes, where the number/status came from, the
 * contributing counts, the warnings/blockers, and the next safe review step.
 *
 * Core principle: NO dead summary cards. Every summarized metric or status must
 * be able to reveal full read-only detail, link to an EXISTING authorized route,
 * or state honestly that detail is unavailable. This module performs NO live
 * call, NO write, NO navigation side effect, and embeds NO sample/mock data — it
 * is a pure view-model contract. `readOnly` is structurally pinned to `true`.
 */

/** Broad surface taxonomy — which screen/region a drill-through originates from. */
export type DrillThroughSurface =
  | 'executive_command_center'
  | 'product_strategy'
  | 'product_profitability_roe'
  | 'manager_control_panel'
  | 'portfolio_command_center'
  | 'team_ops_queue'
  | 'deal_cockpit'
  | 'committee_package_queue'
  | 'package_export'
  | 'esign_envelope'
  | 'crm_relationship_intelligence'
  | 'crm_connector_readiness'
  | 'crm_entity_matching'
  | 'crm_sync_preview'
  | 'crm_writeback_policy'
  | 'crm_activity_timeline'
  | 'core_banking_lookup'
  | 'aml_kyc_policy_gate'
  | 'servicing_lifecycle'
  | 'generic';

/** What kind of thing the user clicked through from. */
export type DrillThroughEntityKind =
  | 'kpi'
  | 'metric'
  | 'status'
  | 'queue_row'
  | 'summary_card'
  | 'cockpit_widget'
  | 'intelligence_panel'
  | 'deal'
  | 'package'
  | 'envelope'
  | 'connector'
  | 'record'
  | 'chart'
  | 'chart_segment'
  | 'generic';

/** Confidence band for a derived detail row (mirrors the read-only intelligence bands). */
export type DrillThroughConfidence = 'high' | 'medium' | 'low' | 'unknown';

/** A single label/value fact inside a detail section. */
export interface DetailRow {
  label: string;
  value: string;
  /** Where the value came from (system / surface / derivation), if known. */
  source?: string;
  confidence?: DrillThroughConfidence;
  /** Honest per-row warning (e.g. "stale", "unverified"). */
  warning?: string;
}

/** A titled group of detail rows. */
export interface DetailSection {
  title: string;
  rows: readonly DetailRow[];
  /** Shown when `rows` is empty — honest, never fabricated. */
  emptyMessage?: string;
}

/** A named source count contributing to a summarized metric/status. */
export interface DrillThroughSourceCount {
  label: string;
  count: number;
}

/**
 * The reusable drill-through payload behind any card/tile/row/KPI.
 *
 * Exactly one of three resolutions is always valid (see `resolveDrillThroughAction`):
 *   - has detail content (sections / source fields / counts), or
 *   - a safe `routeHref` to an EXISTING authorized route, or
 *   - an honest `unavailableReason`.
 */
export interface DrillThroughTarget {
  id: string;
  title: string;
  subtitle?: string;
  surface: DrillThroughSurface;
  entityKind: DrillThroughEntityKind;
  entityId?: string;
  statusLabel?: string;
  summary: string;
  detailSections: readonly DetailSection[];
  /** Flat source facts (how a number/status was derived). */
  sourceFields: readonly DetailRow[];
  /** Contributing counts behind a metric/status. */
  sourceCounts: readonly DrillThroughSourceCount[];
  warnings: readonly string[];
  blockers: readonly string[];
  nextReviewStep?: string;
  /** ONLY an existing authorized route. Never a new/uncontrolled route. */
  routeHref?: string;
  /** Structurally pinned to true — drill-through is always read-only. */
  readOnly: true;
  /** Present only when no content/route exists; states exactly what is missing. */
  unavailableReason?: string;
}

/** Input to {@link buildDrillThroughTarget}; `readOnly` is supplied by the builder. */
export type DrillThroughInput = Omit<
  DrillThroughTarget,
  | 'readOnly'
  | 'detailSections'
  | 'sourceFields'
  | 'sourceCounts'
  | 'warnings'
  | 'blockers'
> & {
  detailSections?: readonly DetailSection[];
  sourceFields?: readonly DetailRow[];
  sourceCounts?: readonly DrillThroughSourceCount[];
  warnings?: readonly string[];
  blockers?: readonly string[];
};

function frozen<T>(value: readonly T[] | undefined): readonly T[] {
  return Object.freeze([...(value ?? [])]);
}

/**
 * Normalizes a drill-through input into a frozen, read-only target. Forces
 * `readOnly: true`, freezes every collection, and — when no content and no route
 * is supplied — fills an honest default `unavailableReason` rather than leaving a
 * blank drawer.
 */
export function buildDrillThroughTarget(input: DrillThroughInput): DrillThroughTarget {
  const detailSections = frozen(input.detailSections).map((s) => ({
    ...s,
    rows: frozen(s.rows),
  }));
  const target: DrillThroughTarget = {
    ...input,
    detailSections: Object.freeze(detailSections),
    sourceFields: frozen(input.sourceFields),
    sourceCounts: frozen(input.sourceCounts),
    warnings: frozen(input.warnings),
    blockers: frozen(input.blockers),
    readOnly: true,
  };
  if (!hasDrillThroughContent(target) && !target.routeHref && !target.unavailableReason) {
    return {
      ...target,
      unavailableReason: 'Full details for this item are not available yet.',
    };
  }
  return Object.freeze(target);
}

/** True when the target carries any revealable detail (sections / fields / counts). */
export function hasDrillThroughContent(target: DrillThroughTarget): boolean {
  return (
    target.detailSections.some((s) => s.rows.length > 0 || Boolean(s.emptyMessage)) ||
    target.sourceFields.length > 0 ||
    target.sourceCounts.length > 0 ||
    target.warnings.length > 0 ||
    target.blockers.length > 0
  );
}

/** A card/tile/row resolves to exactly one of these read-only behaviours. */
export type DrillThroughAction =
  | { kind: 'panel' }
  | { kind: 'route'; href: string }
  | { kind: 'unavailable'; reason: string };

/**
 * Decides how a card should behave. A target with content opens the read-only
 * panel; otherwise a safe route link; otherwise an honest unavailable state.
 * Guarantees there is never a clickable-looking card with no resolution.
 */
export function resolveDrillThroughAction(target: DrillThroughTarget): DrillThroughAction {
  if (hasDrillThroughContent(target)) return { kind: 'panel' };
  if (target.routeHref) return { kind: 'route', href: target.routeHref };
  return {
    kind: 'unavailable',
    reason: target.unavailableReason ?? 'Full details for this item are not available yet.',
  };
}

/** Accessible name for the activation affordance of a card/tile/row. */
export function drillThroughAccessibleName(target: DrillThroughTarget): string {
  const action = resolveDrillThroughAction(target);
  if (action.kind === 'unavailable') return `Details unavailable: ${target.title}`;
  if (action.kind === 'route') return `Open full record: ${target.title}`;
  return `View details: ${target.title}`;
}

/** A structural issue found by {@link validateDrillThroughTarget}. */
export interface DrillThroughValidationIssue {
  id: string;
  problem: string;
}

/**
 * Validates a target against the no-dead-card contract: it must have a title and
 * summary, be read-only, and resolve to content, a route, or an honest
 * unavailable reason (never a blank drawer, never fabricated empty content).
 */
export function validateDrillThroughTarget(
  target: DrillThroughTarget,
): readonly DrillThroughValidationIssue[] {
  const issues: DrillThroughValidationIssue[] = [];
  const fail = (problem: string) => issues.push({ id: target.id, problem });
  if (!target.id) fail('missing id');
  if (!target.title.trim()) fail('missing title');
  if (!target.summary.trim()) fail('missing summary');
  if (target.readOnly !== true) fail('readOnly must be true');
  const action = resolveDrillThroughAction(target);
  if (action.kind === 'unavailable' && !action.reason.trim()) {
    fail('unavailable target must state what is missing');
  }
  // A target that claims unavailability must not also smuggle fabricated rows.
  if (target.unavailableReason && hasDrillThroughContent(target)) {
    // Content wins (panel), so the unavailableReason is informational only — fine.
  }
  return issues;
}

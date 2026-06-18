/**
 * Phase 188I -- pure readiness view-model for a FUTURE controlled UI generate
 * action (planned for 188J). This phase enables NOTHING.
 *
 * It answers, as data, the exact safety contract a future banker-UI generate
 * button must satisfy before it may become enabled: what actor identity, deal
 * identity, and approved-name source are required; which preflight checks must
 * pass; how adapter result statuses map to UI states; what audit facts must be
 * logged; what remains forbidden; and what rollback switch exists.
 *
 * It performs NO IO, imports NO adapter / live deps / borrower-comms module, and
 * triggers NO action. `canGenerate` is ALWAYS false in 188I -- even when the
 * model reports `ready_for_future_enablement`, that is an advisory readiness
 * verdict only, gated behind two disabled flags (DOCUMENT_CHECKLIST_GENERATION_
 * ENABLED + DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED) that 188I keeps false.
 */

/** Suggested 188I readiness status model. */
export type DocumentChecklistUiEnableReadinessStatus =
  | 'disabled_by_default'
  | 'missing_actor_identity'
  | 'missing_deal_id'
  | 'missing_approved_names'
  | 'unsafe_graph'
  | 'already_generated'
  | 'ready_for_future_enablement';

/** Adapter outcome kinds (from newDealChecklistGenerationAdapter) -> UI state. */
export type DocumentChecklistAdapterStatus =
  | 'disabled'
  | 'dependency_not_ready'
  | 'unauthorized'
  | 'skipped_no_template'
  | 'skipped_duplicate_detected'
  | 'failed'
  | 'partial_success'
  | 'audit_failed_partial'
  | 'success';

export interface DocumentChecklistUiEnableReadiness {
  /** The would-be readiness verdict (see status model). */
  readonly status: DocumentChecklistUiEnableReadinessStatus;
  /** HARD invariant in 188I: the UI may never trigger generation. */
  readonly canGenerate: false;
  /** Reflects the disabled UI-action gate (188I keeps it false). */
  readonly uiEnabledNow: false;
  /** Reflects the disabled runtime generation gate (188I keeps it false). */
  readonly runtimeGenerationEnabled: false;
  /**
   * True only when status === 'ready_for_future_enablement'. Advisory ONLY: it
   * still does not (and may not) make `canGenerate` true in 188I.
   */
  readonly futureEnableConditionMet: boolean;
  /** Human-readable blockers for the current would-be readiness verdict. */
  readonly blockers: readonly string[];
  /** De-duplicated approved names considered for the preview. */
  readonly approvedNames: readonly string[];
  /** Approved names already present on the deal (informational; never re-created). */
  readonly alreadyPresentNames: readonly string[];
  /** Approved names that a future enabled action WOULD create. */
  readonly wouldCreateNames: readonly string[];
  /** The exact preconditions a future 188J UI enablement must satisfy. */
  readonly futureEnablementPreconditions: readonly string[];
  /** Q6: adapter result status -> banker UI state mapping. */
  readonly uiStateByAdapterStatus: Readonly<Record<DocumentChecklistAdapterStatus, string>>;
  /** Q8: audit facts that must be displayed/logged on a future generation. */
  readonly requiredAuditFacts: readonly string[];
  /** Q9: what remains forbidden even after a future UI enablement. */
  readonly forbiddenAfterEnablement: readonly string[];
  /** Q10: the rollback/disable switch. */
  readonly rollbackSwitch: string;
  /** Q2: required actor identity contract. */
  readonly requiredActorIdentity: string;
  /** Q3: required deal identity contract. */
  readonly requiredDealIdentity: string;
  /** Q4: the only allowed approved-names source. */
  readonly approvedNamesSource: string;
  /** Q7: how the UI refreshes existing checklist rows after a future generation. */
  readonly postGenerationRefresh: string;
}

export interface DocumentChecklistUiEnableReadinessInput {
  /** Banker actor identity (display/eval only; never used to write here). */
  readonly actorIdentity?: { readonly email?: string; readonly coreUserId?: string } | null;
  /** Exact open-deal id (the only deal identity a future live action accepts). */
  readonly dealId?: string | null;
  /** Operator-approved pilot checklist names (static config). */
  readonly approvedChecklistNames?: readonly string[];
  /** Existing checklist rows already loaded for the deal (idempotency preview). */
  readonly existingChecklistRows?: readonly ({ readonly name?: string } | string)[];
  /** Result of a prior 188B readiness graph inspection; must be true to proceed. */
  readonly graphReadinessSafe?: boolean;
  /**
   * Pure analysis switch -- NOT a runtime gate. When false (default), the model
   * reports the resting `disabled_by_default` posture. When true, it evaluates
   * the hypothetical 188J preconditions to report what WOULD be required. It
   * enables nothing; `canGenerate` stays false regardless of this value.
   */
  readonly evaluateFutureReadiness?: boolean;
}

const REQUIRED_ACTOR_IDENTITY =
  'An authenticated banker whose email resolves fail-closed to a /cr664_users(<CoreUser>) bind for cr664_ChangedBy; never /systemusers, never an unresolved actor.';

const REQUIRED_DEAL_IDENTITY =
  'The exact open-deal id (cr664_loandeals GUID). A future live action accepts an exact id only -- no --deal-name lookup, no fuzzy match.';

const APPROVED_NAMES_SOURCE =
  'DOCUMENT_CHECKLIST_PILOT_APPROVED_NAMES -- operator-curated static config. Never borrower-supplied, never invented at runtime.';

const POST_GENERATION_REFRESH =
  'After a future successful generation the UI re-reads existing checklist rows via the deal/document data path (read-only) and re-derives already-present vs would-create; it never assumes success without a refresh and never caches a fabricated row.';

/** Q1 + Q5: the exact conditions that would allow a future 188J UI enable. */
const FUTURE_ENABLEMENT_PRECONDITIONS: readonly string[] = Object.freeze([
  'DOCUMENT_CHECKLIST_GENERATION_ENABLED flipped true by operator certification (runtime gate).',
  'DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED flipped true by operator certification (UI action gate).',
  'Authenticated banker actor resolvable to a /cr664_users(<CoreUser>) bind (never /systemusers).',
  'Exact deal id present from the open deal context.',
  'Approved checklist names sourced from static operator config (never borrower-supplied or runtime-invented).',
  'Readiness graph inspection (188B) reports safe -- no unsafe lookups/targets.',
  'At least one approved name not already present (else already_generated -- informational, no action).',
]);

/** Q6: adapter result status -> banker UI state. */
const UI_STATE_BY_ADAPTER_STATUS: Readonly<Record<DocumentChecklistAdapterStatus, string>> =
  Object.freeze({
    disabled: 'action_hidden_or_disabled',
    dependency_not_ready: 'blocked_dependency_not_ready',
    unauthorized: 'blocked_unauthorized',
    skipped_no_template: 'blocked_no_approved_names',
    skipped_duplicate_detected: 'informational_already_generated',
    failed: 'error_no_rows_created',
    partial_success: 'error_partial_review_required',
    audit_failed_partial: 'error_audit_failed_review_required',
    success: 'success_refresh_checklist',
  });

/** Q8: audit facts a future generation must display/log. */
const REQUIRED_AUDIT_FACTS: readonly string[] = Object.freeze([
  'cr664_ChangedBy bound to /cr664_users(<CoreUser>) (never /systemusers).',
  'Correlation id (audit-only; never written to a checklist row).',
  'Created document names.',
  'Skipped (already-present) document names.',
  'The deal id the rows bind to.',
  'Event name "Document Checklist Generated" with the SUCCEEDED outcome.',
]);

/** Q9: invariants that stay forbidden even after a future UI enablement. */
const FORBIDDEN_AFTER_ENABLEMENT: readonly string[] = Object.freeze([
  'No borrower email / SMS / Outlook / handoff.',
  'No document request send flow.',
  'No New Deal auto-run.',
  'No cr664_documenttype usage.',
  'No checklist row field beyond cr664_documentname + cr664_Deal@odata.bind.',
  'No correlation id written to a checklist row (audit-only).',
  'No stage/status/portfolio/CRM mutation.',
]);

/** Q10: the rollback/disable switch. */
const ROLLBACK_SWITCH =
  'Set DOCUMENT_CHECKLIST_GENERATION_ENABLED=false (runtime gate) and DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED=false (UI action gate). Both fail closed independently -- either false disables generation, canGenerate returns false immediately, and the button reverts to the permanently-disabled 188D posture.';

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function rowName(row: { readonly name?: string } | string): string {
  return typeof row === 'string' ? row : row?.name ?? '';
}

function dedupeApproved(names: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  return (names ?? [])
    .map((n) => (n ?? '').trim())
    .filter((n) => n.length > 0)
    .filter((n) => {
      const key = normalize(n);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function deriveStatus(
  input: DocumentChecklistUiEnableReadinessInput,
  approvedNames: readonly string[],
  wouldCreateNames: readonly string[],
): DocumentChecklistUiEnableReadinessStatus {
  // Default call (no future-readiness probe) -> the resting, certified posture.
  if (input.evaluateFutureReadiness !== true) return 'disabled_by_default';

  const actor = input.actorIdentity;
  const hasActor = Boolean(
    actor && ((actor.email ?? '').trim().length > 0 || (actor.coreUserId ?? '').trim().length > 0),
  );
  if (!hasActor) return 'missing_actor_identity';
  if (!(input.dealId ?? '').trim()) return 'missing_deal_id';
  if (approvedNames.length === 0) return 'missing_approved_names';
  if (input.graphReadinessSafe !== true) return 'unsafe_graph';
  if (wouldCreateNames.length === 0) return 'already_generated';
  return 'ready_for_future_enablement';
}

function deriveBlockers(status: DocumentChecklistUiEnableReadinessStatus): readonly string[] {
  switch (status) {
    case 'disabled_by_default':
      return [
        'Document checklist generation is disabled by default; the UI generate action remains permanently disabled in this phase.',
      ];
    case 'missing_actor_identity':
      return ['No actor identity that resolves to a /cr664_users(<CoreUser>) bind.'];
    case 'missing_deal_id':
      return ['No exact deal id from the open deal context.'];
    case 'missing_approved_names':
      return ['No operator-approved checklist names configured.'];
    case 'unsafe_graph':
      return ['Readiness graph inspection has not reported safe.'];
    case 'already_generated':
      return []; // informational only -- not a blocker.
    case 'ready_for_future_enablement':
      return []; // would be ready IF the two gates were flipped -- they are not.
    default:
      return [];
  }
}

/**
 * Build the 188I UI-enable readiness view-model. Pure, IO-free, action-free.
 * `canGenerate` is hard-coded false; the two enablement gates are reported as
 * false; nothing here flips a gate or invokes the adapter.
 */
export function buildDocumentChecklistUiEnableReadiness(
  input: DocumentChecklistUiEnableReadinessInput,
): DocumentChecklistUiEnableReadiness {
  const approvedNames = dedupeApproved(input.approvedChecklistNames);
  const existing = new Set(
    (input.existingChecklistRows ?? []).map(rowName).map(normalize).filter((n) => n.length > 0),
  );
  const alreadyPresentNames = approvedNames.filter((n) => existing.has(normalize(n)));
  const wouldCreateNames = approvedNames.filter((n) => !existing.has(normalize(n)));

  const status = deriveStatus(input, approvedNames, wouldCreateNames);

  return {
    status,
    // 188I invariant: the UI may NEVER trigger generation. Never derive true.
    canGenerate: false,
    uiEnabledNow: false,
    runtimeGenerationEnabled: false,
    futureEnableConditionMet: status === 'ready_for_future_enablement',
    blockers: deriveBlockers(status),
    approvedNames,
    alreadyPresentNames,
    wouldCreateNames,
    futureEnablementPreconditions: FUTURE_ENABLEMENT_PRECONDITIONS,
    uiStateByAdapterStatus: UI_STATE_BY_ADAPTER_STATUS,
    requiredAuditFacts: REQUIRED_AUDIT_FACTS,
    forbiddenAfterEnablement: FORBIDDEN_AFTER_ENABLEMENT,
    rollbackSwitch: ROLLBACK_SWITCH,
    requiredActorIdentity: REQUIRED_ACTOR_IDENTITY,
    requiredDealIdentity: REQUIRED_DEAL_IDENTITY,
    approvedNamesSource: APPROVED_NAMES_SOURCE,
    postGenerationRefresh: POST_GENERATION_REFRESH,
  };
}

/**
 * Phase 188J -- controlled banker-UI checklist generation ACTION wrapper
 * (fail-closed by default).
 *
 * This is the first UI-to-adapter bridge for the document checklist generate
 * action. It is a PURE, dependency-injected seam: it performs NO IO of its own,
 * imports NO live Dataverse deps, NO borrower-comms module, and NO generator
 * adapter directly. The generation adapter and the read-only refresh are
 * INJECTED, so the bridge is fully provable in unit tests without a live write.
 *
 * Posture: fail-closed. The wrapper refuses (and never invokes the injected
 * adapter) unless every preflight passes -- both UI/action gates true, a
 * 188J-ready readiness verdict, an actor that resolves to a
 * `/cr664_users(<CoreUser>)` bind (never `/systemusers`), an exact deal id, and a
 * non-empty approved-name list. Only after preflight passes does it call the
 * injected adapter exactly once, map the adapter status to a UI state, and run a
 * read-only refresh after a success / already-generated outcome.
 *
 * It NEVER builds a checklist row (the injected adapter owns the allow-listed
 * `cr664_documentname` + `cr664_Deal@odata.bind` payload), NEVER writes a
 * correlation id to a row (audit-only echo), NEVER mutates stage / status /
 * portfolio / CRM, and NEVER triggers a New Deal auto-run.
 */

import { isCoreUserBind } from '../shared/governance/auditActorBind';
import type {
  DocumentChecklistOutcome,
  DocumentChecklistOutcomeKind,
} from './dealOriginationOutcomes';
import type {
  DocumentChecklistUiEnableReadiness,
  DocumentChecklistAdapterStatus,
} from './documentChecklistUiEnableReadiness';

/** The two explicit UI/action gates the wrapper requires (both must be true). */
export interface DocumentChecklistUiActionGateConfig {
  /** DOCUMENT_CHECKLIST_PILOT_UI_ENABLED -- the panel/preview UI gate. */
  readonly pilotUiEnabled: boolean;
  /** DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED -- the clickable action gate. */
  readonly uiGenerateActionEnabled: boolean;
}

/** Banker actor identity for the controlled action (eval + audit only). */
export interface DocumentChecklistUiActor {
  /** Actor email -- used ONLY to resolve the audit cr664_ChangedBy bind. */
  readonly email?: string;
  /** Pre-resolved `/cr664_users(<CoreUser>)` bind; never `/systemusers`. */
  readonly changedByBind?: string;
}

/**
 * The exact request handed to the INJECTED adapter. Carries the exact deal id +
 * approved names only (plus the audit-only actor + correlation id). The adapter
 * owns the allow-listed row payload; this request never names a row field.
 */
export interface DocumentChecklistUiGenerationAdapterRequest {
  readonly dealId: string;
  readonly approvedNames: readonly string[];
  readonly actorEmail?: string;
  readonly actorChangedByBind?: string;
  /** Audit-only correlation id; never written to a checklist row. */
  readonly correlationId: string;
}

/** The injected generation adapter. Returns the canonical checklist outcome. */
export type DocumentChecklistUiGenerationAdapter = (
  request: DocumentChecklistUiGenerationAdapterRequest,
) => Promise<DocumentChecklistOutcome>;

/** The injected READ-ONLY refresh (re-reads existing rows; never writes). */
export type DocumentChecklistUiReadOnlyRefresh = (
  dealId: string,
) => Promise<{ readonly ok: boolean; readonly names?: readonly string[]; readonly error?: string }>;

/** Inputs to the controlled action wrapper (all dependencies injected). */
export interface DocumentChecklistUiGenerationActionInput {
  /** The 188I readiness verdict computed for this deal (advisory authority). */
  readonly readiness: DocumentChecklistUiEnableReadiness;
  /** Both UI/action gates -- both must be true or the wrapper refuses. */
  readonly gates: DocumentChecklistUiActionGateConfig;
  /** Banker actor identity (bind must target cr664_users; never systemusers). */
  readonly actor?: DocumentChecklistUiActor | null;
  /** The exact open-deal id (no fuzzy / name lookup). */
  readonly dealId?: string | null;
  /** Operator-approved static checklist names. */
  readonly approvedNames?: readonly string[];
  /** The INJECTED generation adapter (no live import in this module). */
  readonly generateChecklist: DocumentChecklistUiGenerationAdapter;
  /** The INJECTED read-only refresh, run after success / already-generated. */
  readonly refreshChecklist: DocumentChecklistUiReadOnlyRefresh;
  /** Explicit audit-only correlation id (takes precedence over the factory). */
  readonly correlationId?: string;
  /** Audit-only correlation id factory (used when no explicit id is supplied). */
  readonly newCorrelationId?: () => string;
}

/** Coarse category for the banker UI to branch on. */
export type DocumentChecklistUiGenerationCategory =
  | 'refused'
  | 'blocked'
  | 'informational'
  | 'error'
  | 'success';

/** The structured result the banker UI renders. */
export interface DocumentChecklistUiGenerationResult {
  /** True iff the injected adapter was actually invoked. */
  readonly invokedAdapter: boolean;
  /** Coarse category for UI branching. */
  readonly category: DocumentChecklistUiGenerationCategory;
  /** The UI state token (refusal token, or readiness adapter-status mapping). */
  readonly uiState: string;
  /** The underlying adapter outcome kind, or 'preflight_refused'. */
  readonly outcomeKind: DocumentChecklistOutcomeKind | 'preflight_refused';
  /** True iff a read-only refresh ran (success / already-generated only). */
  readonly refreshed: boolean;
  /** Existing names from the read-only refresh (when it ran). */
  readonly refreshedNames?: readonly string[];
  /** Audit-only correlation id echo; never a checklist row field. */
  readonly correlationId?: string;
  /** Human-readable reason(s) for the result. */
  readonly reasons: readonly string[];
}

/** Preflight refusal tokens (adapter is NEVER invoked for these). */
export type DocumentChecklistUiGenerationRefusal =
  | 'refused_gate_disabled'
  | 'refused_not_ready'
  | 'refused_missing_actor'
  | 'refused_unsafe_actor_bind'
  | 'refused_missing_deal_id'
  | 'refused_missing_approved_names';

function dedupeNonEmpty(names: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  return (names ?? [])
    .map((n) => (n ?? '').trim())
    .filter((n) => n.length > 0)
    .filter((n) => {
      const key = n.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function refusal(
  token: DocumentChecklistUiGenerationRefusal,
  reason: string,
): DocumentChecklistUiGenerationResult {
  return {
    invokedAdapter: false,
    category: 'refused',
    uiState: token,
    outcomeKind: 'preflight_refused',
    refreshed: false,
    reasons: [reason],
  };
}

/** Map an adapter outcome kind to a coarse UI category. */
function categoryForAdapterKind(
  kind: DocumentChecklistOutcomeKind,
): DocumentChecklistUiGenerationCategory {
  switch (kind) {
    case 'success':
      return 'success';
    case 'skipped_duplicate_detected':
      return 'informational';
    case 'disabled':
    case 'dependency_not_ready':
    case 'unauthorized':
    case 'skipped_no_template':
      return 'blocked';
    case 'failed':
    case 'partial_success':
    case 'audit_failed_partial':
    default:
      return 'error';
  }
}

/**
 * The controlled banker-UI checklist generation bridge. Pure given its injected
 * deps. Fail-closed: it returns a refusal (without invoking the adapter) unless
 * every preflight passes, then invokes the injected adapter exactly once, maps
 * the adapter status to a UI state via the 188I readiness mapping, and runs a
 * read-only refresh after a success / already-generated outcome.
 */
export async function runDocumentChecklistUiGenerationAction(
  input: DocumentChecklistUiGenerationActionInput,
): Promise<DocumentChecklistUiGenerationResult> {
  // 1. Both UI/action gates must be true (either false fails closed).
  if (input.gates.pilotUiEnabled !== true || input.gates.uiGenerateActionEnabled !== true) {
    return refusal(
      'refused_gate_disabled',
      'Both DOCUMENT_CHECKLIST_PILOT_UI_ENABLED and DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED must be true; the action is disabled by default.',
    );
  }

  // 2. The readiness verdict must be 188J-ready (ready_for_future_enablement) or
  //    already_generated (informational short-circuit, no write needed).
  const status = input.readiness.status;
  if (status !== 'ready_for_future_enablement' && status !== 'already_generated') {
    return refusal(
      'refused_not_ready',
      `Readiness status is "${status}"; the controlled action requires a 188J-ready readiness verdict.`,
    );
  }

  // 3. Actor must be present.
  const actorEmail = (input.actor?.email ?? '').trim();
  const actorBind = (input.actor?.changedByBind ?? '').trim();
  if (actorEmail.length === 0 && actorBind.length === 0) {
    return refusal('refused_missing_actor', 'No banker actor identity supplied.');
  }

  // 4. If an actor bind is supplied it MUST target cr664_users (never systemusers).
  if (actorBind.length > 0 && !isCoreUserBind(actorBind)) {
    return refusal(
      'refused_unsafe_actor_bind',
      'Actor bind must target /cr664_users(<CoreUser>); a /systemusers (or other) bind is refused.',
    );
  }

  // 5. Exact deal id required.
  const dealId = (input.dealId ?? '').trim();
  if (dealId.length === 0) {
    return refusal('refused_missing_deal_id', 'No exact deal id supplied.');
  }

  // 6. Non-empty approved names required.
  const approvedNames = dedupeNonEmpty(input.approvedNames);
  if (approvedNames.length === 0) {
    return refusal('refused_missing_approved_names', 'No approved checklist names supplied.');
  }

  const correlationId =
    (input.correlationId ?? '').trim() ||
    (input.newCorrelationId ? input.newCorrelationId() : 'dc-ui-no-correlation');

  // already_generated -> nothing to create; informational + read-only refresh.
  if (status === 'already_generated') {
    const refreshed = await input.refreshChecklist(dealId);
    return {
      invokedAdapter: false,
      category: 'informational',
      uiState: input.readiness.uiStateByAdapterStatus.skipped_duplicate_detected,
      outcomeKind: 'skipped_duplicate_detected',
      refreshed: refreshed.ok,
      refreshedNames: refreshed.names,
      correlationId,
      reasons: ['All approved checklist names are already present on the deal; nothing to generate.'],
    };
  }

  // Preflight passed -> invoke the injected adapter EXACTLY once.
  const outcome = await input.generateChecklist({
    dealId,
    approvedNames,
    actorEmail: actorEmail.length > 0 ? actorEmail : undefined,
    actorChangedByBind: actorBind.length > 0 ? actorBind : undefined,
    correlationId,
  });

  const kind = outcome.kind as DocumentChecklistOutcomeKind;
  const uiState =
    input.readiness.uiStateByAdapterStatus[kind as DocumentChecklistAdapterStatus] ?? kind;
  const category = categoryForAdapterKind(kind);

  // Read-only refresh ONLY after a clean success or an already-generated skip.
  let refreshed = false;
  let refreshedNames: readonly string[] | undefined;
  if (kind === 'success' || kind === 'skipped_duplicate_detected') {
    const r = await input.refreshChecklist(dealId);
    refreshed = r.ok;
    refreshedNames = r.names;
  }

  return {
    invokedAdapter: true,
    category,
    uiState,
    outcomeKind: kind,
    refreshed,
    refreshedNames,
    // Echo the adapter's audit-only correlation id when present, else our own.
    correlationId: outcome.correlationId ?? correlationId,
    reasons: [outcome.detail ?? `Adapter returned "${kind}".`],
  };
}

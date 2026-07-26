/**
 * Phase 171-180 -- Deal origination operating arc: typed outcomes.
 *
 * Pure type module (no IO, no imports). Defines the top-level orchestrator
 * outcome, the generic downstream-module outcome, each domain's own typed
 * outcome union (guardrail: every downstream automation has its own typed
 * outcome union), and the complete shared result shape the orchestrator
 * returns so no partial failure is ever hidden.
 */

// ---------------------------------------------------------------------------
// Top-level orchestrator outcome
// ---------------------------------------------------------------------------

export type DealOriginationTopOutcomeKind =
  | 'success_created_only'
  | 'success_created_with_automation'
  | 'disabled'
  | 'validation_error'
  | 'unauthorized'
  | 'client_required'
  | 'resolver_not_ready'
  | 'create_failed'
  | 'link_readback_mismatch'
  | 'audit_failed_partial'
  | 'created_with_downstream_partial_failure'
  | 'downstream_blocked_by_policy'
  | 'downstream_disabled'
  | 'environment_not_allowed'
  | 'config_invalid';

// ---------------------------------------------------------------------------
// Generic downstream module outcome
// ---------------------------------------------------------------------------

export type DownstreamModuleOutcomeKind =
  | 'skipped_disabled'
  | 'skipped_not_applicable'
  | 'skipped_dependency_not_ready'
  | 'skipped_unauthorized'
  | 'success'
  | 'failed'
  | 'failed_partial'
  | 'blocked_by_policy';

/** Generic per-module outcome wrapper. */
export interface ModuleOutcome<K extends string> {
  readonly module: string;
  readonly kind: K;
  readonly detail?: string;
  readonly correlationId?: string;
}

/** True when a downstream module outcome represents a non-fatal skip. */
export function isSkippedKind(kind: string): boolean {
  return kind.startsWith('skipped_') || kind === 'disabled' || kind === 'not_checked';
}

/** True when a downstream module outcome represents an actual failure. */
export function isFailureKind(kind: string): boolean {
  return kind === 'failed' || kind === 'failed_partial' || kind === 'audit_failed_partial';
}

// ---------------------------------------------------------------------------
// Per-domain outcome unions (each its own type)
// ---------------------------------------------------------------------------

export type CrmAutomationOutcomeKind =
  | 'disabled'
  | 'skipped_not_applicable'
  | 'unauthorized'
  | 'dependency_not_ready'
  | 'validation_error'
  | 'success'
  | 'failed'
  | 'audit_failed_partial';
export type CrmAutomationOutcome = ModuleOutcome<CrmAutomationOutcomeKind>;

export type BorrowerInviteOutcomeKind =
  | 'disabled'
  | 'skipped_missing_borrower_contact'
  | 'skipped_no_borrower_profile'
  | 'unauthorized'
  | 'dependency_not_ready'
  | 'prepared_not_sent'
  | 'sent'
  | 'failed'
  | 'audit_failed_partial';
export type BorrowerInviteOutcome = ModuleOutcome<BorrowerInviteOutcomeKind>;

export type AutoStageAdvanceOutcomeKind =
  | 'disabled'
  | 'skipped_not_ready'
  | 'skipped_policy_blocked'
  | 'skipped_stage_mismatch'
  | 'unauthorized'
  | 'resolver_not_ready'
  | 'success'
  | 'failed'
  | 'audit_failed_partial';
export type AutoStageAdvanceOutcome = ModuleOutcome<AutoStageAdvanceOutcomeKind>;

export type TaskGenerationOutcomeKind =
  | 'disabled'
  | 'skipped_no_template'
  | 'skipped_duplicate_detected'
  | 'unauthorized'
  | 'dependency_not_ready'
  | 'success'
  | 'failed'
  | 'partial_success'
  | 'audit_failed_partial';
export type TaskGenerationOutcome = ModuleOutcome<TaskGenerationOutcomeKind>;

export type DocumentChecklistOutcomeKind =
  | 'disabled'
  | 'skipped_no_template'
  | 'skipped_duplicate_detected'
  | 'unauthorized'
  | 'dependency_not_ready'
  | 'success'
  | 'partial_success'
  | 'failed'
  | 'audit_failed_partial';
export type DocumentChecklistOutcome = ModuleOutcome<DocumentChecklistOutcomeKind>;

export type PortfolioSideEffectsOutcomeKind =
  | 'disabled'
  | 'skipped_not_needed'
  | 'skipped_no_portfolio_mapping'
  | 'unauthorized'
  | 'dependency_not_ready'
  | 'success'
  | 'failed'
  | 'audit_failed_partial';
export type PortfolioSideEffectsOutcome = ModuleOutcome<PortfolioSideEffectsOutcomeKind>;

export type BorrowerMessagingOutcomeKind =
  | 'disabled'
  | 'skipped_missing_contact'
  | 'skipped_transport_disabled'
  | 'skipped_template_missing'
  | 'unauthorized'
  | 'dependency_not_ready'
  | 'prepared_not_sent'
  | 'sent'
  | 'failed'
  | 'audit_failed_partial';
export type BorrowerMessagingOutcome = ModuleOutcome<BorrowerMessagingOutcomeKind>;

export type DuplicateOutcomeKind =
  | 'not_checked'
  | 'no_duplicate_found'
  | 'possible_duplicate_found'
  | 'exact_duplicate_found'
  | 'merge_prepared_not_applied'
  | 'merge_blocked_by_policy'
  | 'merge_disabled'
  | 'failed';
export type DuplicateOutcome = ModuleOutcome<DuplicateOutcomeKind> & {
  /** Non-destructive candidate review list (never applied). */
  readonly candidates?: readonly string[];
};

// ---------------------------------------------------------------------------
// Create + audit outcomes (reuse the governed adapter's shapes loosely)
// ---------------------------------------------------------------------------

export type CreateStepOutcomeKind =
  | 'skipped'
  | 'success'
  | 'failed';
export interface CreateStepOutcome {
  readonly kind: CreateStepOutcomeKind;
  readonly dealId?: string;
  readonly error?: string;
}

export type AuditStepOutcomeKind = 'skipped' | 'success' | 'failed';
export interface AuditStepOutcome {
  readonly kind: AuditStepOutcomeKind;
  readonly auditEventId?: string;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Complete shared result
// ---------------------------------------------------------------------------

export interface DealOriginationResult {
  readonly kind: DealOriginationTopOutcomeKind;
  readonly correlationId: string;
  readonly createdDealId?: string;
  /**
   * PR A remediation — the banker-entered deal name, carried through so the UI can show a human
   * label alongside (never instead of, for support purposes) the raw Dataverse id. Genuinely known
   * at submit time (never fabricated); undefined only for outcomes reached before the form's
   * dealName was read (e.g. a disabled-environment short-circuit).
   */
  readonly dealName?: string;
  readonly actorSystemUserId?: string;
  readonly stageLabel?: string;
  readonly statusLabel?: string;
  readonly createOutcome: CreateStepOutcome;
  readonly auditOutcome: AuditStepOutcome;
  readonly crmOutcome: CrmAutomationOutcome;
  readonly borrowerInviteOutcome: BorrowerInviteOutcome;
  readonly stageAdvanceOutcome: AutoStageAdvanceOutcome;
  readonly taskGenerationOutcome: TaskGenerationOutcome;
  readonly documentChecklistOutcome: DocumentChecklistOutcome;
  readonly portfolioOutcome: PortfolioSideEffectsOutcome;
  readonly borrowerMessagingOutcome: BorrowerMessagingOutcome;
  readonly duplicateOutcome: DuplicateOutcome;
  readonly userFacingMessage: string;
  readonly operatorNotes: readonly string[];
}

/** Build a uniform "disabled" module outcome. */
export function disabledModule<K extends string>(module: string, kind: K): ModuleOutcome<K> {
  return { module, kind, detail: `${module} is disabled by default.` };
}

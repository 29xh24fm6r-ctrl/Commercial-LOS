import type { CanonicalStageCode } from './stageOrderingContract';

/**
 * ARC Phase 1 — Canonical requirement types for the full commercial LOS workflow.
 *
 * These types define requirements as FIRST-CLASS workflow objects (registry) and the shape the
 * evaluation engine returns. They are the shared vocabulary the whole workflow uses to decide what
 * is required vs recommended, what blocks, what is tracked, who owns it, and where it is resolved.
 *
 * Pure types — no runtime, no IO. See docs/LOS_FULL_WORKFLOW_ACTIVATION_ARC.md.
 */

/** The lifecycle scope a requirement gates. Forward = a stage's exit; non-forward = a governed action. */
export type RequirementScope = CanonicalStageCode | 'RETURN' | 'DECLINE' | 'WITHDRAW';

/** What kind of thing the requirement is. */
export type RequirementCategory =
  | 'field'
  | 'document'
  | 'task'
  | 'credit'
  | 'approval'
  | 'closing'
  | 'funding'
  | 'boarding'
  | 'servicing'
  | 'monitoring'
  | 'exception'
  | 'adverse_action';

/**
 * Blocking requirements HOLD the transition; recommended requirements are advisory (visible,
 * non-blocking); optional requirements are informational only.
 */
export type RequirementSeverity = 'blocking' | 'recommended' | 'optional';

/**
 * For document requirements: the minimum typed document status that satisfies the requirement.
 * `received` = a received OR reviewed document; `reviewed` = a reviewed document only (an
 * uploaded/received-but-unreviewed document does NOT satisfy). The current schema
 * (cr664_documentchecklist) has no accepted/rejected/waived state, so those are not representable
 * and such requirements fail closed as unavailable rather than being faked as met.
 */
export type DocumentReviewLevel = 'received' | 'reviewed';

/** The UI surface where a user resolves the requirement. */
export type ResolverSurface =
  | 'Deal Profile'
  | 'Documents'
  | 'Tasks'
  | 'Credit Memo'
  | 'Approval'
  | 'Commitment'
  | 'Documentation'
  | 'Closing'
  | 'Funding'
  | 'Boarding'
  | 'Portfolio'
  | 'Covenants'
  | 'Exceptions'
  | 'Watchlist';

/** The role that normally resolves the requirement. */
export type ResponsibleRole =
  | 'banker'
  | 'underwriter'
  | 'credit_officer'
  | 'approver'
  | 'closer'
  | 'loan_ops'
  | 'portfolio_manager'
  | 'admin';

/** What kind of record/fact backs the requirement (how it becomes tracked). */
export type BackingType =
  | 'deal_field'
  | 'document_requirement'
  | 'task_status'
  | 'memo_status'
  | 'approval_record'
  | 'risk_rating_record'
  | 'condition_record'
  | 'closing_record'
  | 'funding_record'
  | 'boarded_loan_record'
  | 'covenant_record'
  | 'exception_record'
  | 'review_record';

/** A first-class requirement in the registry. */
export interface CanonicalRequirement {
  readonly id: string;
  /** The stage exit (or non-forward action) this requirement gates. */
  readonly scope: RequirementScope;
  readonly label: string;
  readonly description: string;
  readonly category: RequirementCategory;
  readonly severity: RequirementSeverity;
  readonly resolverSurface: ResolverSurface;
  readonly responsibleRole: ResponsibleRole;
  readonly backingType: BackingType;
  /**
   * True when the capability that backs this requirement is actually wired (a real record/field/status
   * the engine can evaluate). False = the fact is NOT yet tracked — the engine fails closed (untracked
   * blocking) and states exactly what capability is missing. Flipped true by that fact's major ARC PR.
   */
  readonly tracked: boolean;
  /** The source table/entity when tracked (documentation; not used for evaluation). */
  readonly sourceEntity?: string;
  /**
   * For a document requirement: the minimum typed status that satisfies it (default `received`).
   * Ignored for non-document requirements.
   */
  readonly documentReviewLevel?: DocumentReviewLevel;
  /**
   * How the fact is matched to the requirement. `typed` = matched by a real typed key/status;
   * `inferred` = matched by name (a temporary adapter — the current document/task schema carries no
   * business-type key, so matching is by name while status is typed). Surfaced so the UI/certification
   * can tell true typed proof from an inferred match.
   */
  readonly matchMode: 'typed' | 'inferred';
  /** Banker-facing copy for the requirement line. */
  readonly uiCopy: string;
  /** Policy-safe reason shown when this requirement blocks. */
  readonly blockerReason: string;
}

/** The engine's per-requirement verdict. */
export type RequirementStatus = 'met' | 'unmet' | 'untracked' | 'unavailable';

/** Optional evidence attached to a met/unmet verdict (record lineage for audit-safe display). */
export interface RequirementEvidence {
  readonly recordId?: string;
  readonly entity?: string;
  readonly status?: string;
  readonly timestamp?: string;
  readonly reviewedBy?: string;
}

/** An evaluated requirement — the registry object plus the engine's verdict for a given deal. */
export interface EvaluatedRequirement {
  readonly id: string;
  readonly scope: RequirementScope;
  readonly label: string;
  /** Banker-facing requirement line (from the registry). */
  readonly uiCopy: string;
  readonly category: RequirementCategory;
  readonly severity: RequirementSeverity;
  readonly status: RequirementStatus;
  readonly whereToResolve: ResolverSurface;
  readonly responsibleRole: ResponsibleRole;
  readonly backingType: BackingType;
  readonly tracked: boolean;
  /** True when this requirement, in its current status, prevents the transition. */
  readonly canBlockTransition: boolean;
  /** Policy-safe reason (empty when met). */
  readonly reason: string;
  readonly evidence?: RequirementEvidence;
}

/** The engine's readiness verdict for a stage's exit. */
export interface StageExitReadiness {
  readonly scope: RequirementScope;
  readonly status: 'ready' | 'blocked';
  readonly requirements: readonly EvaluatedRequirement[];
  /** Blocking requirements not met (these hold the transition). */
  readonly blocking: readonly EvaluatedRequirement[];
  /** Recommended requirements not met (visible, do not block). */
  readonly recommended: readonly EvaluatedRequirement[];
  /** Blocking requirements whose backing capability is not yet tracked (fail-closed). */
  readonly untracked: readonly EvaluatedRequirement[];
}

/** The engine's readiness verdict for a specific transition. */
export interface TransitionReadiness {
  readonly from: RequirementScope;
  readonly kind: 'advance' | 'return' | 'decline' | 'withdraw';
  readonly to?: CanonicalStageCode;
  readonly status: 'ready' | 'blocked' | 'preview-only';
  readonly exit: StageExitReadiness;
  /** Why the transition is not ready (empty when ready). */
  readonly reason: string;
}

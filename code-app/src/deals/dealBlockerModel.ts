import {
  deriveStageExitReadiness,
  type WorkflowRequirementFacts,
} from '../workflow/loanWorkflowRequirementEngine';
import type {
  EvaluatedRequirement,
  RequirementCategory,
  ResolverSurface,
} from '../workflow/loanWorkflowRequirementTypes';
import { recognizeCanonicalStage, type CanonicalStageCode } from '../workflow/stageOrderingContract';

/**
 * The ONE authoritative deal blocker model.
 *
 * Before this, four surfaces counted "blockers" differently — the Metric Deck tile counted only
 * overdue tasks + outstanding documents (and read 0 while mandatory profile fields / documents
 * prohibited advancement), the attention console used its own operational rules, and the advance
 * guard used the stage-exit requirement engine. This module makes the stage-exit requirement engine
 * (`deriveStageExitReadiness`) the single source every surface consumes, so a HARD blocker is
 * represented consistently on the Stage Map, the summary tiles, the attention console, and the
 * advance guard — and each hard blocker carries a DIRECT remediation route to the operator action
 * that resolves it.
 *
 * Severity tiers, made explicit:
 *   - `hard`             → a tracked blocking requirement not met. HOLDS stage advancement.
 *   - `recommended`      → advisory, does NOT hold advancement.
 *   - `pending-upstream` → a blocking requirement whose backing capability is not yet tracked
 *                          (fail-closed). Not resolvable by the banker at this stage; surfaced
 *                          honestly ("pending upstream completion"), never counted as a hard blocker
 *                          the banker can clear.
 */

export type DealBlockerSeverity = 'hard' | 'recommended' | 'pending-upstream';

/** A direct route to the operator action that resolves a blocker. */
export type RemediationRoute =
  | { kind: 'edit-profile'; field: string }
  | { kind: 'add-document'; documentName: string }
  | { kind: 'link-client' }
  | { kind: 'open-deal-section'; selector: string; label: string }
  | { kind: 'open-route'; href: string; label: string }
  | { kind: 'none'; reason: string };

export interface DealBlockerItem {
  readonly id: string;
  readonly severity: DealBlockerSeverity;
  readonly category: RequirementCategory;
  readonly label: string;
  readonly detail: string;
  readonly resolverSurface: ResolverSurface;
  readonly remediation: RemediationRoute;
}

export interface DealBlockerModel {
  readonly stageCode: CanonicalStageCode;
  /** Tracked blocking requirements not met — these HOLD advancement. */
  readonly hardBlockers: readonly DealBlockerItem[];
  /** Advisory items — visible, non-blocking. */
  readonly recommended: readonly DealBlockerItem[];
  /** Blocking requirements whose capability is not yet tracked (pending upstream). */
  readonly pendingUpstream: readonly DealBlockerItem[];
  /** Labels of the missing required documents (hard) — seeds the Add-required-document picker. */
  readonly missingRequiredDocuments: readonly string[];
  /** Labels of the missing required fields (hard). */
  readonly missingRequiredFields: readonly string[];
  /** The single count every "Blockers" surface shows. */
  readonly hardBlockerCount: number;
  /** True only when no hard blocker holds the transition. */
  readonly canAdvance: boolean;
}

/** True when a field requirement is the CRM client link (resolved by linking, not the profile form). */
function isClientField(r: EvaluatedRequirement): boolean {
  return r.category === 'field' && (/client/i.test(r.label) || /:field:client/i.test(r.id));
}

/** Map an evaluated requirement to the operator action that resolves it. Exported so the Stage Map
 *  renders the SAME remediation route the model exposes to the tiles. */
export function remediationForRequirement(r: EvaluatedRequirement): RemediationRoute {
  const exactDestination: Readonly<Record<string, RemediationRoute>> = {
    'UNDERWRITING:risk_rating': {
      kind: 'open-deal-section',
      selector: '[data-deal-card="risk-rating"]',
      label: 'Open Risk Rating',
    },
    'UNDERWRITING:uw_recommendation': {
      kind: 'open-deal-section',
      selector: '[data-deal-card="risk-rating"]',
      label: 'Open Underwriting Recommendation',
    },
    'CREDIT_APPROVAL:memo_finalized': {
      kind: 'open-deal-section',
      selector: '[data-deal-card="credit-memo"]',
      label: 'Open Credit Memo',
    },
    'CLOSING_FUNDING:executed_docs': {
      kind: 'open-deal-section',
      selector: '[data-deal-card="executed-document-attestation"]',
      label: 'Open Executed Documents',
    },
    'CLOSING_FUNDING:booking_qc': {
      kind: 'open-deal-section',
      selector: '[data-deal-card="booking-qc"]',
      label: 'Open Booking QC',
    },
    'BOARDED:servicing_owner': {
      kind: 'open-route',
      href: '/admin#assign-servicing-owner',
      label: 'Open Admin assignment',
    },
  };
  const exact = exactDestination[r.id];
  if (exact) return exact;

  switch (r.category) {
    case 'field':
      return isClientField(r) ? { kind: 'link-client' } : { kind: 'edit-profile', field: r.label };
    case 'document':
      return { kind: 'add-document', documentName: r.label };
    case 'task':
      return { kind: 'open-deal-section', selector: '[data-deal-card="tasks"]', label: 'Open Tasks' };
    case 'credit':
      return { kind: 'open-deal-section', selector: '[data-deal-card="credit-memo"]', label: 'Open Credit Memo' };
    case 'approval':
      return { kind: 'open-deal-section', selector: '[data-deal-card="credit-approval-decision"]', label: 'Open Approval Decision' };
    case 'closing':
      if (r.whereToResolve === 'Commitment') {
        return { kind: 'open-deal-section', selector: '[data-deal-card="commitment"]', label: 'Open Commitment' };
      }
      if (r.whereToResolve === 'Documentation') {
        return { kind: 'open-deal-section', selector: '[data-deal-card="condition-verification"]', label: 'Open Condition Verification' };
      }
      return { kind: 'open-deal-section', selector: '[data-deal-card="closing-booking-readiness"]', label: 'Open Closing Readiness' };
    case 'funding':
      return { kind: 'open-deal-section', selector: '[data-deal-card="funding-authorization"]', label: 'Open Funding Authorization' };
    case 'boarding':
      return { kind: 'open-deal-section', selector: '[data-deal-card="portfolio-boarding-status"]', label: 'Open Portfolio Boarding' };
    case 'monitoring':
      return { kind: 'open-route', href: '/portfolio', label: 'Open Portfolio Monitoring' };
    case 'adverse_action':
      return { kind: 'open-deal-section', selector: '[data-deal-card="adverse-action"]', label: 'Open Adverse Action' };
    default:
      return { kind: 'none', reason: r.reason || 'No resolving action is available.' };
  }
}

function toItem(severity: DealBlockerSeverity): (r: EvaluatedRequirement) => DealBlockerItem {
  return (r) => ({
    id: r.id,
    severity,
    category: r.category,
    label: r.label,
    detail: r.reason || r.uiCopy,
    resolverSurface: r.whereToResolve,
    remediation: severity === 'pending-upstream' ? { kind: 'none', reason: r.reason } : remediationForRequirement(r),
  });
}

/**
 * Derive the authoritative blocker model for a stage's exit from the requirement engine.
 * `facts` is the same fact set the advance guard uses (deal + tasks + documents + creditMemo),
 * so every surface that renders this model agrees with the advance button.
 */
export function deriveDealBlockerModel(stageCode: CanonicalStageCode, facts: WorkflowRequirementFacts): DealBlockerModel {
  const readiness = deriveStageExitReadiness(stageCode, facts);
  const hardBlockers = readiness.blocking.map(toItem('hard'));
  const recommended = readiness.recommended.map(toItem('recommended'));
  const pendingUpstream = readiness.untracked.map(toItem('pending-upstream'));
  return {
    stageCode,
    hardBlockers,
    recommended,
    pendingUpstream,
    missingRequiredDocuments: readiness.blocking.filter((r) => r.category === 'document').map((r) => r.label),
    missingRequiredFields: readiness.blocking.filter((r) => r.category === 'field').map((r) => r.label),
    hardBlockerCount: hardBlockers.length,
    canAdvance: hardBlockers.length === 0,
  };
}

/**
 * Convenience: derive the model from a deal's stored stage NAME (as the cockpit surfaces have it),
 * returning `undefined` when the stage is not a recognized canonical stage (a custom/legacy stage
 * has no engine contract — callers then fall back to their prior behavior rather than fabricate).
 */
export function deriveDealBlockerModelForStage(
  storedStage: string | undefined,
  facts: WorkflowRequirementFacts,
): DealBlockerModel | undefined {
  const recognized = recognizeCanonicalStage(storedStage);
  if (!recognized) return undefined;
  return deriveDealBlockerModel(recognized.code, facts);
}

/**
 * ARC Phase 3 — Underwriting deep-fact models + policies (risk rating, underwriting recommendation).
 *
 * PURE decision logic, no IO. These are the fail-closed policies the requirement engine evaluates for
 * the Underwriting → Credit Approval gate. IMPORTANT (honesty): the current Dataverse schema has NO
 * deal-scoped risk-rating or underwriting-recommendation record (see docs/LOS_WORKFLOW_TRUTH_MATRIX.md
 * — the `cr664_RiskLevelReference` lookup has no generated reference table and is not read into the
 * deal). So these facts remain `tracked: false` in the registry (surfaced as "future"), and these
 * models are NOT yet live-enforced — they are tested and ready, and flip live the moment a real record
 * source lands (a maker adds the schema + a loader supplies the fact). No value is fabricated here.
 */

export interface DeepFactReadiness {
  readonly met: boolean;
  /** Policy-safe reason when not met (empty when met). */
  readonly reason: string;
}

// ── Risk rating ────────────────────────────────────────────────────────────

export type RiskRatingStatus = 'draft' | 'assigned' | 'reviewed' | 'approved';

export interface RiskRatingRecord {
  readonly dealId: string;
  readonly ratingValue: string;
  readonly ratingScale: string;
  readonly rationale?: string;
  readonly assignedBy?: string;
  readonly assignedAtIso?: string;
  readonly reviewedBy?: string;
  readonly reviewedAtIso?: string;
  readonly status: RiskRatingStatus;
  readonly correlationId?: string;
}

/** The minimum risk-rating status that satisfies the gate (institution policy). */
export interface RiskRatingPolicy {
  readonly minStatus: 'assigned' | 'reviewed' | 'approved';
}
export const DEFAULT_RISK_RATING_POLICY: RiskRatingPolicy = Object.freeze({ minStatus: 'assigned' });

const RISK_STATUS_ORDER: Record<RiskRatingStatus, number> = { draft: 0, assigned: 1, reviewed: 2, approved: 3 };

/**
 * Fail-closed risk-rating readiness. Missing rating → not met. A DRAFT never satisfies. A rating with a
 * value satisfies only when its status meets the configured minimum (default `assigned`).
 */
export function evaluateRiskRatingReadiness(
  record: RiskRatingRecord | undefined,
  policy: RiskRatingPolicy = DEFAULT_RISK_RATING_POLICY,
): DeepFactReadiness {
  if (!record) return { met: false, reason: 'No risk rating has been assigned to this deal.' };
  if (record.ratingValue.trim().length === 0) return { met: false, reason: 'Risk rating has no value.' };
  if (RISK_STATUS_ORDER[record.status] < RISK_STATUS_ORDER[policy.minStatus]) {
    return { met: false, reason: `Risk rating is "${record.status}"; a ${policy.minStatus} rating is required.` };
  }
  return { met: true, reason: '' };
}

// ── Underwriting recommendation ──────────────────────────────────────────────

export type UnderwritingRecommendationDecision =
  | 'approve'
  | 'approve_with_conditions'
  | 'decline'
  | 'return_for_more_information';

export type UnderwritingRecommendationStatus = 'draft' | 'recorded' | 'reviewed';

export interface UnderwritingRecommendationRecord {
  readonly dealId: string;
  readonly decision: UnderwritingRecommendationDecision;
  readonly rationale?: string;
  readonly underwriterActor?: string;
  readonly recordedAtIso?: string;
  readonly status: UnderwritingRecommendationStatus;
}

export interface UnderwritingRecommendationReadiness extends DeepFactReadiness {
  /**
   * True when the recommendation is DECLINE or RETURN — these must NOT allow a normal Credit Approval
   * advance; they route to the (not-yet-live) Decline/Return governed paths. Surfaced so the UI shows a
   * future non-forward path rather than silently allowing a forward move.
   */
  readonly requiresNonForwardPath: boolean;
  readonly decision?: UnderwritingRecommendationDecision;
}

/**
 * Fail-closed underwriting-recommendation readiness. Missing → not met. A DRAFT never satisfies. A
 * DECLINE or RETURN outcome never satisfies a normal advance (it requires the non-forward path).
 * Only a recorded supportable / supportable-with-conditions outcome satisfies the forward Credit Approval gate.
 */
export function evaluateUnderwritingRecommendationReadiness(
  record: UnderwritingRecommendationRecord | undefined,
): UnderwritingRecommendationReadiness {
  if (!record) return { met: false, reason: 'No underwriting recommendation has been recorded.', requiresNonForwardPath: false };
  if (record.status === 'draft') {
    return { met: false, reason: 'Underwriting recommendation is a draft; a recorded recommendation is required.', requiresNonForwardPath: false, decision: record.decision };
  }
  if (record.decision === 'decline') {
    return { met: false, reason: 'Underwriting outcome is not supportable for normal Credit Approval advance - route via the Decline path.', requiresNonForwardPath: true, decision: 'decline' };
  }
  if (record.decision === 'return_for_more_information') {
    return { met: false, reason: 'Underwriting recommends RETURN for more information — route via the Return path.', requiresNonForwardPath: true, decision: 'return_for_more_information' };
  }
  return { met: true, reason: '', requiresNonForwardPath: false, decision: record.decision };
}

// ── Factory Arc Phase 5 — persisted form-state serialization ────────────────
//
// The banker-entered rating/recommendation fields, persisted as JSON into
// cr664_riskratinginputs / cr664_underwritingrecommendationinputs (Memo columns, see
// scripts/schema-migrations/pr106-risk-rating/columns.mjs). This does NOT flip either fact's
// `tracked: false` registry status -- that stays a separate, explicitly-reviewed decision (see
// this file's header comment). Persisting the record is a prerequisite for that future decision,
// not the decision itself.

const RISK_RATING_STATUSES: readonly RiskRatingStatus[] = ['draft', 'assigned', 'reviewed', 'approved'];
const RECOMMENDATION_STATUSES: readonly UnderwritingRecommendationStatus[] = ['draft', 'recorded', 'reviewed'];
const RECOMMENDATION_DECISIONS: readonly UnderwritingRecommendationDecision[] = [
  'approve',
  'approve_with_conditions',
  'decline',
  'return_for_more_information',
];

export interface RiskRatingFormState {
  readonly ratingValue: string;
  readonly ratingScale: string;
  readonly rationale: string;
  readonly status: RiskRatingStatus;
}

export const EMPTY_RISK_RATING_FORM_STATE: RiskRatingFormState = {
  ratingValue: '',
  ratingScale: '',
  rationale: '',
  status: 'draft',
};

export function serializeRiskRatingFormState(state: RiskRatingFormState): string {
  return JSON.stringify(state);
}

/** Fail-closed parse: missing, corrupt, or wrong-shaped JSON returns the empty (draft) state. */
export function parseRiskRatingFormState(json: string | undefined): RiskRatingFormState {
  if (!json || json.trim().length === 0) return EMPTY_RISK_RATING_FORM_STATE;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return EMPTY_RISK_RATING_FORM_STATE;
    const p = parsed as Partial<RiskRatingFormState>;
    return {
      ratingValue: typeof p.ratingValue === 'string' ? p.ratingValue : '',
      ratingScale: typeof p.ratingScale === 'string' ? p.ratingScale : '',
      rationale: typeof p.rationale === 'string' ? p.rationale : '',
      status: RISK_RATING_STATUSES.includes(p.status as RiskRatingStatus) ? (p.status as RiskRatingStatus) : 'draft',
    };
  } catch {
    return EMPTY_RISK_RATING_FORM_STATE;
  }
}

export interface UnderwritingRecommendationFormState {
  readonly decision: UnderwritingRecommendationDecision;
  readonly rationale: string;
  readonly status: UnderwritingRecommendationStatus;
}

export const EMPTY_UNDERWRITING_RECOMMENDATION_FORM_STATE: UnderwritingRecommendationFormState = {
  decision: 'approve',
  rationale: '',
  status: 'draft',
};

export function serializeUnderwritingRecommendationFormState(state: UnderwritingRecommendationFormState): string {
  return JSON.stringify(state);
}

/** Fail-closed parse: missing, corrupt, or wrong-shaped JSON returns the empty (draft/approve) state. */
export function parseUnderwritingRecommendationFormState(json: string | undefined): UnderwritingRecommendationFormState {
  if (!json || json.trim().length === 0) return EMPTY_UNDERWRITING_RECOMMENDATION_FORM_STATE;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return EMPTY_UNDERWRITING_RECOMMENDATION_FORM_STATE;
    const p = parsed as Partial<UnderwritingRecommendationFormState>;
    return {
      decision: RECOMMENDATION_DECISIONS.includes(p.decision as UnderwritingRecommendationDecision)
        ? (p.decision as UnderwritingRecommendationDecision)
        : 'approve',
      rationale: typeof p.rationale === 'string' ? p.rationale : '',
      status: RECOMMENDATION_STATUSES.includes(p.status as UnderwritingRecommendationStatus)
        ? (p.status as UnderwritingRecommendationStatus)
        : 'draft',
    };
  } catch {
    return EMPTY_UNDERWRITING_RECOMMENDATION_FORM_STATE;
  }
}

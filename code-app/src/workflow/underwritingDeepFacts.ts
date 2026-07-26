/**
 * ARC Phase 3 — Underwriting deep-fact models + policies (risk rating, underwriting recommendation).
 *
 * PURE decision logic, no IO. These are the fail-closed policies the requirement engine evaluates for
 * the Underwriting → Credit Approval gate.
 *
 * Production Remediation Factory Arc Phase 6 (N-14/N-15) flipped both facts live: Factory Arc Phase 5
 * already wired real, deal-scoped persistence (`cr664_riskratinginputs` /
 * `cr664_underwritingrecommendationinputs`, read via `deriveRiskRatingRecordFromDeal` /
 * `deriveUnderwritingRecommendationRecordFromDeal` below), and this phase closed the readiness-policy
 * gap N-14 found (rating=final + blank rationale used to satisfy the gate) by requiring rationale,
 * the assigning/recording actor, a timestamp, and an exact match on the deal being evaluated — not
 * just a value and a status. `loanWorkflowRequirementRegistry.ts` now authors both requirements
 * `tracked: true` (see `CLOSING_FUNDING:funds_disbursed` for the established pattern this follows).
 * No value is fabricated: an absent, malformed, or legacy (pre-Phase-6) record parses to blank
 * fields and fails these checks rather than silently satisfying them.
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
 * Fail-closed risk-rating readiness (N-14/N-15 remediation, Factory Arc Phase 6). Missing rating →
 * not met. A DRAFT never satisfies — it may be incomplete by design. Once status reaches the
 * configured minimum (default `assigned`), the rating must be DURABLE, not merely a value + a
 * status: a valid scale, a rationale, the assigning actor, an assignment timestamp, and a match on
 * the exact deal being evaluated are all required. Blank rationale — the literal N-14 defect — is
 * one case of this broader "final must be complete" rule, not a special case.
 */
export function evaluateRiskRatingReadiness(
  record: RiskRatingRecord | undefined,
  expectedDealId: string,
  policy: RiskRatingPolicy = DEFAULT_RISK_RATING_POLICY,
): DeepFactReadiness {
  if (!record) return { met: false, reason: 'No risk rating has been assigned to this deal.' };
  if (record.ratingValue.trim().length === 0) return { met: false, reason: 'Risk rating has no value.' };
  if (RISK_STATUS_ORDER[record.status] < RISK_STATUS_ORDER[policy.minStatus]) {
    return { met: false, reason: `Risk rating is "${record.status}"; a ${policy.minStatus} rating is required.` };
  }
  if (!record.ratingScale || record.ratingScale.trim().length === 0) {
    return { met: false, reason: 'Risk rating has no rating scale recorded.' };
  }
  if (!record.rationale || record.rationale.trim().length === 0) {
    return { met: false, reason: 'Risk rating has no rationale recorded.' };
  }
  if (!record.assignedBy || record.assignedBy.trim().length === 0) {
    return { met: false, reason: 'Risk rating has no recorded assigning actor.' };
  }
  if (!record.assignedAtIso || record.assignedAtIso.trim().length === 0) {
    return { met: false, reason: 'Risk rating has no recorded assignment timestamp.' };
  }
  if (record.dealId !== expectedDealId) {
    return { met: false, reason: 'Risk rating record does not match this deal.' };
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
 * Fail-closed underwriting-recommendation readiness (N-14/N-15 remediation, Factory Arc Phase 6).
 * Missing → not met. A DRAFT never satisfies. A DECLINE or RETURN outcome never satisfies a normal
 * advance (it requires the non-forward path). A recorded APPROVE / APPROVE_WITH_CONDITIONS outcome
 * satisfies the forward gate only when it is durable: rationale, the recording underwriter, a
 * recorded timestamp, and a match on the exact deal being evaluated are all required — the same
 * "final must be complete" rule N-14 established for risk rating.
 */
export function evaluateUnderwritingRecommendationReadiness(
  record: UnderwritingRecommendationRecord | undefined,
  expectedDealId: string,
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
  if (!record.rationale || record.rationale.trim().length === 0) {
    return { met: false, reason: 'Underwriting recommendation has no rationale recorded.', requiresNonForwardPath: false, decision: record.decision };
  }
  if (!record.underwriterActor || record.underwriterActor.trim().length === 0) {
    return { met: false, reason: 'Underwriting recommendation has no recorded underwriter.', requiresNonForwardPath: false, decision: record.decision };
  }
  if (!record.recordedAtIso || record.recordedAtIso.trim().length === 0) {
    return { met: false, reason: 'Underwriting recommendation has no recorded timestamp.', requiresNonForwardPath: false, decision: record.decision };
  }
  if (record.dealId !== expectedDealId) {
    return { met: false, reason: 'Underwriting recommendation record does not match this deal.', requiresNonForwardPath: false, decision: record.decision };
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
  /**
   * N-14/N-15 remediation (Factory Arc Phase 6) — durable "exact deal linkage, actor identity,
   * timestamp" fields the finding requires for a final/assigned rating to count as met. Stamped by
   * the save path itself (never banker-editable), so a legacy record persisted before this phase
   * parses these as '' and correctly fails the new checks rather than fabricating them.
   */
  readonly dealId: string;
  readonly assignedBy: string;
  readonly assignedAtIso: string;
}

export const EMPTY_RISK_RATING_FORM_STATE: RiskRatingFormState = {
  ratingValue: '',
  ratingScale: '',
  rationale: '',
  status: 'draft',
  dealId: '',
  assignedBy: '',
  assignedAtIso: '',
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
      dealId: typeof p.dealId === 'string' ? p.dealId : '',
      assignedBy: typeof p.assignedBy === 'string' ? p.assignedBy : '',
      assignedAtIso: typeof p.assignedAtIso === 'string' ? p.assignedAtIso : '',
    };
  } catch {
    return EMPTY_RISK_RATING_FORM_STATE;
  }
}

/**
 * N-15 remediation — the loader that supplies `WorkflowRequirementFacts.riskRating` from the deal's
 * own persisted record. Returns `undefined` when no rating value has ever been entered (never
 * fabricated as an empty-but-present record); a malformed/legacy blob parses to blank fields, which
 * correctly fails `evaluateRiskRatingReadiness`'s checks rather than satisfying them.
 */
export function deriveRiskRatingRecordFromDeal(deal: { readonly riskRatingInputsJson?: string }): RiskRatingRecord | undefined {
  const form = parseRiskRatingFormState(deal.riskRatingInputsJson);
  if (form.ratingValue.trim().length === 0) return undefined;
  return {
    dealId: form.dealId,
    ratingValue: form.ratingValue,
    ratingScale: form.ratingScale,
    rationale: form.rationale,
    assignedBy: form.assignedBy,
    assignedAtIso: form.assignedAtIso,
    status: form.status,
  };
}

export interface UnderwritingRecommendationFormState {
  readonly decision: UnderwritingRecommendationDecision;
  readonly rationale: string;
  readonly status: UnderwritingRecommendationStatus;
  /**
   * N-14/N-15 remediation (Factory Arc Phase 6) — durable "exact deal linkage, actor identity,
   * timestamp" fields the finding requires for a final recommendation to count as met. Stamped by
   * the save path itself (never banker-editable), so a legacy record persisted before this phase
   * parses these as '' and correctly fails the new checks rather than fabricating them.
   */
  readonly dealId: string;
  readonly underwriterActor: string;
  readonly recordedAtIso: string;
}

export const EMPTY_UNDERWRITING_RECOMMENDATION_FORM_STATE: UnderwritingRecommendationFormState = {
  decision: 'approve',
  rationale: '',
  status: 'draft',
  dealId: '',
  underwriterActor: '',
  recordedAtIso: '',
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
      dealId: typeof p.dealId === 'string' ? p.dealId : '',
      underwriterActor: typeof p.underwriterActor === 'string' ? p.underwriterActor : '',
      recordedAtIso: typeof p.recordedAtIso === 'string' ? p.recordedAtIso : '',
    };
  } catch {
    return EMPTY_UNDERWRITING_RECOMMENDATION_FORM_STATE;
  }
}

/**
 * N-15 remediation — the loader that supplies `WorkflowRequirementFacts.underwritingRecommendation`
 * from the deal's own persisted record. Returns `undefined` when no recommendation has ever been
 * recorded (never fabricated as an empty-but-present record); a malformed/legacy blob parses to
 * blank fields, which correctly fails `evaluateUnderwritingRecommendationReadiness`'s checks rather
 * than satisfying them.
 */
export function deriveUnderwritingRecommendationRecordFromDeal(deal: {
  readonly underwritingRecommendationInputsJson?: string;
}): UnderwritingRecommendationRecord | undefined {
  const form = parseUnderwritingRecommendationFormState(deal.underwritingRecommendationInputsJson);
  // dealId is stamped only by the save path (never banker-editable) — its absence means nothing
  // has ever actually been saved for this deal, as distinct from a saved-but-still-draft record.
  if (form.dealId.trim().length === 0) return undefined;
  return {
    dealId: form.dealId,
    decision: form.decision,
    rationale: form.rationale,
    underwriterActor: form.underwriterActor,
    recordedAtIso: form.recordedAtIso,
    status: form.status,
  };
}

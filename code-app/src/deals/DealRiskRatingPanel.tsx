import { useMemo, useState } from 'react';
import {
  evaluateRiskRatingReadiness,
  evaluateUnderwritingRecommendationReadiness,
  parseRiskRatingFormState,
  parseUnderwritingRecommendationFormState,
  serializeRiskRatingFormState,
  serializeUnderwritingRecommendationFormState,
  type RiskRatingRecord,
  type RiskRatingStatus,
  type UnderwritingRecommendationRecord,
  type UnderwritingRecommendationDecision,
  type UnderwritingRecommendationStatus,
} from '../workflow/underwritingDeepFacts';
import { updateDealProfile, type UpdateDealProfileOutcome, type VerifiedProfilePatch } from './write/updateDealProfile';
import { buildLiveUpdateDealProfileDeps } from './write/buildLiveUpdateDealProfileDeps';
import type { DealDetail } from './dealQueries';
import { Card } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { WidgetHeader } from '../shared/cockpitPrimitives';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

/**
 * PR 106 -- Risk Rating + Underwriting Recommendation capture. This panel lets an underwriter
 * actually assign a rating and record a recommendation.
 *
 * Factory Arc Phase 5 wired real persistence: each record serializes to its own PR106-provisioned
 * Memo/JSON column (cr664_riskratinginputs / cr664_underwritingrecommendationinputs) through the
 * same governed updateDealProfile.ts pipeline as the other deal-profile fields (see that file's
 * header comment for why the raw-column-name technique is safe without waiting on the
 * operator-gated SDK regeneration).
 *
 * Production Remediation Factory Arc Phase 6 (N-14/N-15) flipped the Underwriting exit gate's
 * `UNDERWRITING:risk_rating` / `UNDERWRITING:uw_recommendation` requirements `tracked: true` — the
 * readiness line below is no longer a preview of a future decision, it is what the real gate says
 * right now. The save handlers stamp `dealId`/actor/timestamp fresh on every save (never
 * banker-editable) so a final rating or recommendation is durable and cannot silently satisfy the
 * gate on a stale or blank rationale (see underwritingDeepFacts.ts's readiness functions).
 */

const RATING_STATUSES: readonly RiskRatingStatus[] = ['draft', 'assigned', 'reviewed', 'approved'];
const RECOMMENDATION_STATUSES: readonly UnderwritingRecommendationStatus[] = ['draft', 'recorded', 'reviewed'];
const DECISIONS: readonly UnderwritingRecommendationDecision[] = ['approve', 'approve_with_conditions', 'decline', 'return_for_more_information'];

function decisionLabel(d: UnderwritingRecommendationDecision): string {
  switch (d) {
    case 'approve':
      return 'Approve';
    case 'approve_with_conditions':
      return 'Approve with conditions';
    case 'decline':
      return 'Decline';
    case 'return_for_more_information':
      return 'Return for more information';
  }
}

export interface DealRiskRatingPanelProps {
  readonly deal: DealDetail;
  readonly ratedBy?: string;
  readonly authorized: boolean;
  readonly actorEmail: string | undefined;
  readonly actorSystemUserId: string | undefined;
  /** Factory mission PR B — notifies a DealDataProvider-aware wrapper with the readback-verified
   *  patch so the cockpit's in-context deal updates immediately, without a full browser reload.
   *  See DealRiskRatingPanelConnected.tsx for the precedent (DealFundingAuthorizationPanelConnected.tsx). */
  readonly onSaved?: (verified: VerifiedProfilePatch) => void;
}

export function DealRiskRatingPanel({ deal, ratedBy, authorized, actorEmail, actorSystemUserId, onSaved }: DealRiskRatingPanelProps) {
  const dealId = deal.id;
  const savedRating = useMemo(() => parseRiskRatingFormState(deal.riskRatingInputsJson), [deal.riskRatingInputsJson]);
  const savedRecommendation = useMemo(
    () => parseUnderwritingRecommendationFormState(deal.underwritingRecommendationInputsJson),
    [deal.underwritingRecommendationInputsJson],
  );

  const [ratingValue, setRatingValue] = useState(savedRating.ratingValue);
  const [ratingScale, setRatingScale] = useState(savedRating.ratingScale);
  const [ratingRationale, setRatingRationale] = useState(savedRating.rationale);
  const [ratingStatus, setRatingStatus] = useState<RiskRatingStatus>(savedRating.status);
  const [ratingSave, setRatingSave] = useState<
    { kind: 'idle' } | { kind: 'saving' } | { kind: 'done'; outcome: UpdateDealProfileOutcome }
  >({ kind: 'idle' });

  const [decision, setDecision] = useState<UnderwritingRecommendationDecision>(savedRecommendation.decision);
  const [recommendationRationale, setRecommendationRationale] = useState(savedRecommendation.rationale);
  const [recommendationStatus, setRecommendationStatus] = useState<UnderwritingRecommendationStatus>(savedRecommendation.status);
  const [recommendationSave, setRecommendationSave] = useState<
    { kind: 'idle' } | { kind: 'saving' } | { kind: 'done'; outcome: UpdateDealProfileOutcome }
  >({ kind: 'idle' });

  const ratingRecord: RiskRatingRecord | undefined = useMemo(() => {
    if (ratingValue.trim().length === 0) return undefined;
    return {
      dealId,
      ratingValue: ratingValue.trim(),
      ratingScale: ratingScale.trim() || 'Internal scale',
      rationale: ratingRationale.trim() || undefined,
      assignedBy: ratedBy || actorEmail,
      // N-14/N-15 remediation — the preview shows what saving RIGHT NOW would record (the actual
      // save stamps its own timestamp fresh; see onSaveRating below), consistent with how assignedBy
      // already previews the live actor rather than a previously-saved one.
      assignedAtIso: new Date().toISOString(),
      status: ratingStatus,
    };
  }, [dealId, ratingValue, ratingScale, ratingRationale, ratingStatus, ratedBy, actorEmail]);

  const recommendationRecord: UnderwritingRecommendationRecord | undefined = useMemo(() => {
    if (recommendationRationale.trim().length === 0 && recommendationStatus === 'draft') return undefined;
    return {
      dealId,
      decision,
      rationale: recommendationRationale.trim() || undefined,
      underwriterActor: ratedBy || actorEmail,
      recordedAtIso: new Date().toISOString(),
      status: recommendationStatus,
    };
  }, [dealId, decision, recommendationRationale, recommendationStatus, ratedBy, actorEmail]);

  const ratingReadiness = evaluateRiskRatingReadiness(ratingRecord, dealId);
  const recommendationReadiness = evaluateUnderwritingRecommendationReadiness(recommendationRecord, dealId);

  const ratingSaving = ratingSave.kind === 'saving';
  const recommendationSaving = recommendationSave.kind === 'saving';

  async function onSaveRating() {
    if (!authorized || !actorSystemUserId || ratingSaving) return;
    setRatingSave({ kind: 'saving' });
    const json = serializeRiskRatingFormState({
      ratingValue: ratingValue.trim(),
      ratingScale: ratingScale.trim(),
      rationale: ratingRationale.trim(),
      status: ratingStatus,
      dealId,
      assignedBy: ratedBy || actorEmail || '',
      assignedAtIso: new Date().toISOString(),
    });
    try {
      const result = await updateDealProfile(
        { dealId, actorEmail, actorSystemUserId, authorized: true, patch: { riskRatingInputs: json } },
        buildLiveUpdateDealProfileDeps(),
      );
      setRatingSave({ kind: 'done', outcome: result });
      if (result.kind === 'updated') onSaved?.(result.verified);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setRatingSave({ kind: 'done', outcome: { kind: 'write-failed', error: message, correlationId: '' } });
    }
  }

  async function onSaveRecommendation() {
    if (!authorized || !actorSystemUserId || recommendationSaving) return;
    setRecommendationSave({ kind: 'saving' });
    const json = serializeUnderwritingRecommendationFormState({
      decision,
      rationale: recommendationRationale.trim(),
      status: recommendationStatus,
      dealId,
      underwriterActor: ratedBy || actorEmail || '',
      recordedAtIso: new Date().toISOString(),
    });
    try {
      const result = await updateDealProfile(
        { dealId, actorEmail, actorSystemUserId, authorized: true, patch: { underwritingRecommendationInputs: json } },
        buildLiveUpdateDealProfileDeps(),
      );
      setRecommendationSave({ kind: 'done', outcome: result });
      if (result.kind === 'updated') onSaved?.(result.verified);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setRecommendationSave({ kind: 'done', outcome: { kind: 'write-failed', error: message, correlationId: '' } });
    }
  }

  return (
    <Card>
      <WidgetHeader title="Risk Rating & Underwriting Recommendation" subtitle="Assign a rating and record a recommendation before Credit Approval" />
      {authorized ? (
        <p style={styles.localOnlyNote} role="note" data-risk-rating-save-note>
          Click Save to record the rating or recommendation on the deal. The line below each section
          reflects what the Underwriting exit gate requires right now — a final rating or
          recommendation needs a rationale, and blank rationale will not satisfy it.
        </p>
      ) : (
        <p style={styles.localOnlyNote} role="note" data-risk-rating-local-only-note>
          No Dataverse identity is available for your sign-in, so this cannot be saved to the deal —
          entries reset on reload.
        </p>
      )}

      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>Risk rating</legend>
        <div style={styles.grid}>
          <label style={styles.field}>
            <span style={styles.label}>Rating value</span>
            <input style={styles.input} value={ratingValue} data-risk-rating-field="value" onChange={(e) => setRatingValue(e.target.value)} placeholder="e.g. BB, 5, Pass" />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>Rating scale</span>
            <input style={styles.input} value={ratingScale} data-risk-rating-field="scale" onChange={(e) => setRatingScale(e.target.value)} placeholder="e.g. Internal 1-10" />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>Status</span>
            <select style={styles.input} value={ratingStatus} data-risk-rating-field="status" onChange={(e) => setRatingStatus(e.target.value as RiskRatingStatus)}>
              {RATING_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <label style={styles.field}>
          <span style={styles.label}>Rationale</span>
          <textarea style={styles.textarea} value={ratingRationale} data-risk-rating-field="rationale" onChange={(e) => setRatingRationale(e.target.value)} rows={2} />
        </label>
        <ReadinessLine met={ratingReadiness.met} reason={ratingReadiness.reason} testId="rating-readiness" />
        <div style={styles.saveRow}>
          <button
            type="button"
            style={authorized && !ratingSaving ? styles.saveBtn : styles.saveBtnDisabled}
            disabled={!authorized || ratingSaving}
            onClick={onSaveRating}
            data-risk-rating-save="rating"
          >
            {ratingSaving ? 'Saving…' : 'Save Risk Rating'}
          </button>
          {ratingSave.kind === 'done' && <SaveOutcomeNote outcome={ratingSave.outcome} testId="rating" />}
        </div>
      </fieldset>

      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>Underwriting recommendation</legend>
        <div style={styles.grid}>
          <label style={styles.field}>
            <span style={styles.label}>Decision</span>
            <select style={styles.input} value={decision} data-risk-rating-field="decision" onChange={(e) => setDecision(e.target.value as UnderwritingRecommendationDecision)}>
              {DECISIONS.map((d) => (
                <option key={d} value={d}>{decisionLabel(d)}</option>
              ))}
            </select>
          </label>
          <label style={styles.field}>
            <span style={styles.label}>Status</span>
            <select style={styles.input} value={recommendationStatus} data-risk-rating-field="recommendation-status" onChange={(e) => setRecommendationStatus(e.target.value as UnderwritingRecommendationStatus)}>
              {RECOMMENDATION_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <label style={styles.field}>
          <span style={styles.label}>Rationale</span>
          <textarea style={styles.textarea} value={recommendationRationale} data-risk-rating-field="recommendation-rationale" onChange={(e) => setRecommendationRationale(e.target.value)} rows={2} />
        </label>
        <ReadinessLine
          met={recommendationReadiness.met}
          reason={recommendationReadiness.reason}
          testId="recommendation-readiness"
          nonForward={recommendationReadiness.requiresNonForwardPath}
        />
        <div style={styles.saveRow}>
          <button
            type="button"
            style={authorized && !recommendationSaving ? styles.saveBtn : styles.saveBtnDisabled}
            disabled={!authorized || recommendationSaving}
            onClick={onSaveRecommendation}
            data-risk-rating-save="recommendation"
          >
            {recommendationSaving ? 'Saving…' : 'Save Recommendation'}
          </button>
          {recommendationSave.kind === 'done' && <SaveOutcomeNote outcome={recommendationSave.outcome} testId="recommendation" />}
        </div>
      </fieldset>
    </Card>
  );
}

function SaveOutcomeNote({ outcome, testId }: { outcome: UpdateDealProfileOutcome; testId: string }) {
  if (outcome.kind === 'updated') {
    return (
      <span style={styles.saveOk} role="status" data-risk-rating-save-outcome={`${testId}:updated`}>
        Saved.
      </span>
    );
  }
  const reason =
    'reason' in outcome && typeof outcome.reason === 'string'
      ? outcome.reason
      : 'error' in outcome && typeof outcome.error === 'string'
        ? outcome.error
        : 'This could not be saved. Nothing was changed.';
  return (
    <span style={styles.saveError} role="alert" data-risk-rating-save-outcome={`${testId}:${outcome.kind}`}>
      {reason}
    </span>
  );
}

function ReadinessLine({ met, reason, testId, nonForward }: { met: boolean; reason: string; testId: string; nonForward?: boolean }) {
  const tone: SeverityKey = met ? 'clear' : nonForward ? 'blocked' : 'atRisk';
  return (
    <div style={styles.readinessLine} data-risk-rating-readiness={testId}>
      <Badge variant={tone} appearance="outline">{met ? 'Would satisfy the gate' : 'Would NOT satisfy the gate'}</Badge>
      {!met && reason && <span style={styles.readinessReason}>{reason}</span>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  localOnlyNote: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    background: palette.surfaceAlt,
    border: `1px dashed ${palette.borderStrong}`,
    padding: `${spacing.xs} ${spacing.md}`,
    borderRadius: radius.sm,
    lineHeight: typography.lineHeight.snug,
  },
  fieldset: { border: `1px solid ${palette.divider}`, borderRadius: radius.sm, padding: spacing.md, margin: 0, display: 'flex', flexDirection: 'column', gap: spacing.sm },
  legend: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.textMuted, padding: `0 ${spacing.xs}` },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: spacing.sm },
  field: { display: 'flex', flexDirection: 'column', gap: 2 },
  label: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold },
  input: { padding: `${spacing.xxs} ${spacing.sm}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: typography.family },
  textarea: { padding: `${spacing.xxs} ${spacing.sm}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: typography.family, resize: 'vertical' },
  readinessLine: { display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  readinessReason: { fontSize: typography.size.sm, color: palette.textMuted },
  saveRow: { display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  saveBtn: { background: palette.primary, color: palette.textInverse, border: 'none', borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, cursor: 'pointer' },
  saveBtnDisabled: { background: palette.borderStrong, color: palette.textInverse, border: 'none', borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, cursor: 'not-allowed' },
  saveOk: { fontSize: typography.size.sm, color: palette.clear, fontWeight: typography.weight.semibold },
  saveError: { fontSize: typography.size.sm, color: palette.atRiskFg },
};

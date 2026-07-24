import { useMemo, useState } from 'react';
import {
  evaluateRiskRatingReadiness,
  evaluateUnderwritingRecommendationReadiness,
  type RiskRatingRecord,
  type RiskRatingStatus,
  type UnderwritingRecommendationRecord,
  type UnderwritingRecommendationDecision,
  type UnderwritingRecommendationStatus,
} from '../workflow/underwritingDeepFacts';
import { Card } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { WidgetHeader } from '../shared/cockpitPrimitives';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

/**
 * PR 106 -- Risk Rating + Underwriting Recommendation capture. The pure
 * readiness policies (workflow/underwritingDeepFacts.ts, ARC Phase 3) were
 * fully built and tested but never had a UI to actually produce a
 * RiskRatingRecord / UnderwritingRecommendationRecord -- that doc's own
 * comment says these facts stay `tracked: false` (never enforced) "until a
 * maker adds the schema + a loader supplies the fact." This panel lets an
 * underwriter actually assign a rating and record a recommendation.
 *
 * Deliberately LOCAL-ONLY, same convention as GlobalCashFlowPanel: no
 * Dataverse column exists yet for either record, so entries reset on
 * reload and the CREDIT_APPROVAL gate stays `tracked: false` (this panel
 * does NOT flip that registry entry -- doing so would fabricate durable
 * enforcement backed only by session state). The readiness preview below
 * shows what the gate WOULD say once a real record source lands.
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

export function DealRiskRatingPanel({ dealId, ratedBy }: { dealId: string; ratedBy?: string }) {
  const [ratingValue, setRatingValue] = useState('');
  const [ratingScale, setRatingScale] = useState('');
  const [ratingRationale, setRatingRationale] = useState('');
  const [ratingStatus, setRatingStatus] = useState<RiskRatingStatus>('draft');

  const [decision, setDecision] = useState<UnderwritingRecommendationDecision>('approve');
  const [recommendationRationale, setRecommendationRationale] = useState('');
  const [recommendationStatus, setRecommendationStatus] = useState<UnderwritingRecommendationStatus>('draft');

  const ratingRecord: RiskRatingRecord | undefined = useMemo(() => {
    if (ratingValue.trim().length === 0) return undefined;
    return {
      dealId,
      ratingValue: ratingValue.trim(),
      ratingScale: ratingScale.trim() || 'Internal scale',
      rationale: ratingRationale.trim() || undefined,
      assignedBy: ratedBy,
      status: ratingStatus,
    };
  }, [dealId, ratingValue, ratingScale, ratingRationale, ratingStatus, ratedBy]);

  const recommendationRecord: UnderwritingRecommendationRecord | undefined = useMemo(() => {
    if (recommendationRationale.trim().length === 0 && recommendationStatus === 'draft') return undefined;
    return {
      dealId,
      decision,
      rationale: recommendationRationale.trim() || undefined,
      underwriterActor: ratedBy,
      status: recommendationStatus,
    };
  }, [dealId, decision, recommendationRationale, recommendationStatus, ratedBy]);

  const ratingReadiness = evaluateRiskRatingReadiness(ratingRecord);
  const recommendationReadiness = evaluateUnderwritingRecommendationReadiness(recommendationRecord);

  return (
    <Card>
      <WidgetHeader title="Risk Rating & Underwriting Recommendation" subtitle="Assign a rating and record a recommendation before Credit Approval" />
      <p style={styles.localOnlyNote} role="note" data-risk-rating-local-only-note>
        Not yet saved to the deal — entries reset on reload. This does not change the CREDIT_APPROVAL
        gate's enforcement (still schema-pending); it previews what the gate would say once a real
        record source lands.
      </p>

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
      </fieldset>
    </Card>
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
};

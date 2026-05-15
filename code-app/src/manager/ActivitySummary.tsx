import { useMemo } from 'react';
import { useManagerData, type AsyncResult } from './ManagerDataProvider';
import type { TeamDeal } from './managerQueries';
import {
  STAGE_AGING_AT_RISK_DAYS,
  summarizePipelineMix,
  summarizeStageAging,
  type PipelineMixSummary,
  type StageAgingSummary,
} from '../shared/analytics/derivedAnalytics';
import { Card, CardHeader } from '../shared/Card';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 71: manager-side Activity Summary.
 *
 * Surfaces deterministic, source-field-backed metrics derived from
 * the team's active deal pipeline:
 *   - stage-aging stats (average / median / max days in current
 *     stage; count of deals at or past the 30-day at-risk threshold);
 *   - pipeline mix indicators (distinct stages, distinct bankers,
 *     unassigned deals, top-banker pipeline / deal-count share);
 *   - honest counts of missing-field deals (no stage-entry date,
 *     no assigned banker, no stage value) so the manager sees the
 *     coverage gap rather than a silent omission.
 *
 * Not a performance score, not a ranking, not predictive. Pure
 * derivation from the same TeamPipeline data the other manager
 * cards already consume; no new query is issued.
 */

export function ManagerActivitySummary() {
  const { teamPipeline } = useManagerData();
  return (
    <Card>
      <CardHeader
        title="Team Activity Summary"
        subtitle="Stage aging + pipeline mix — derived from current records."
      />
      <Body teamPipeline={teamPipeline} />
    </Card>
  );
}

function Body({ teamPipeline }: { teamPipeline: AsyncResult<TeamDeal[]> }) {
  const now = useMemo(() => new Date(), []);
  const summary = useMemo<{
    stage: StageAgingSummary;
    mix: PipelineMixSummary;
  } | null>(() => {
    if (teamPipeline.kind !== 'ready') return null;
    return {
      stage: summarizeStageAging(teamPipeline.data, now),
      mix: summarizePipelineMix(teamPipeline.data),
    };
  }, [teamPipeline, now]);

  if (teamPipeline.kind === 'loading')
    return <p style={styles.muted}>Loading activity summary…</p>;
  if (teamPipeline.kind === 'failed')
    return (
      <ErrorBlock
        title="Could not load activity summary"
        detail={teamPipeline.message}
      />
    );
  if (!summary) return null;
  if (teamPipeline.data.length === 0) {
    return (
      <p style={styles.muted}>
        No active deals on the team yet. Activity summary will populate when
        the team has open deals.
      </p>
    );
  }

  return (
    <div style={styles.section}>
      <div style={styles.subHeading}>Stage aging</div>
      <div style={styles.grid}>
        <Stat
          label="Avg days in stage"
          value={summary.stage.averageDaysInStage.toString()}
          numeric
        />
        <Stat
          label="Median days"
          value={summary.stage.medianDaysInStage.toString()}
          numeric
        />
        <Stat
          label="Longest in stage"
          value={summary.stage.maxDaysInStage.toString()}
          numeric
        />
        <Stat
          label={`At or past ${STAGE_AGING_AT_RISK_DAYS} days`}
          value={summary.stage.atRiskCount.toString()}
          emphasis={summary.stage.atRiskCount > 0 ? 'atRisk' : undefined}
          numeric
        />
      </div>
      {summary.stage.missingStageEntryDateCount > 0 && (
        <p style={styles.gapHint}>
          {summary.stage.missingStageEntryDateCount} deal
          {summary.stage.missingStageEntryDateCount === 1 ? '' : 's'} excluded
          from stage-aging math — no stage-entry date on record. Stats above
          are estimated from available fields.
        </p>
      )}

      <div style={styles.subHeading}>Pipeline mix</div>
      <div style={styles.grid}>
        <Stat
          label="Distinct stages"
          value={summary.mix.distinctStages.toString()}
          numeric
        />
        <Stat
          label="Active bankers"
          value={summary.mix.distinctBankers.toString()}
          numeric
        />
        <Stat
          label="Top banker — pipeline $ share"
          value={`${summary.mix.topBankerPipelineSharePct}%`}
        />
        <Stat
          label="Top banker — deal count share"
          value={`${summary.mix.topBankerDealCountSharePct}%`}
        />
      </div>
      {(summary.mix.unassignedDealCount > 0 ||
        summary.mix.missingStageCount > 0) && (
        <p style={styles.gapHint}>
          {summary.mix.unassignedDealCount > 0 && (
            <>
              {summary.mix.unassignedDealCount} deal
              {summary.mix.unassignedDealCount === 1 ? '' : 's'} have no
              assigned banker on the team record.{' '}
            </>
          )}
          {summary.mix.missingStageCount > 0 && (
            <>
              {summary.mix.missingStageCount} deal
              {summary.mix.missingStageCount === 1 ? '' : 's'} have no stage
              value on the record.{' '}
            </>
          )}
          Pipeline-mix metrics above are estimated from available fields and
          may not capture every team deal.
        </p>
      )}

      <p style={styles.disclaimer}>
        Derived from current records. This is an activity summary, not a
        performance evaluation. No ranking, no predictive claim, no automated
        decisioning.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  numeric,
  emphasis,
}: {
  label: string;
  value: string;
  numeric?: boolean;
  emphasis?: 'atRisk';
}) {
  const valueColor = emphasis === 'atRisk' ? palette.atRiskFg : palette.text;
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div
        style={{
          ...styles.statValue,
          color: valueColor,
          fontVariantNumeric: numeric ? 'tabular-nums' : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ErrorBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={styles.errorBox} role="alert">
      <div style={styles.errorTitle}>{title}</div>
      <div style={styles.errorDetail}>{detail}</div>
      <div style={styles.errorHint}>Refresh to retry.</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: spacing.md },
  subHeading: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: spacing.sm,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
  },
  statLabel: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    fontWeight: typography.weight.semibold,
  },
  statValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
  },
  gapHint: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    fontStyle: 'italic',
    lineHeight: typography.lineHeight.snug,
  },
  disclaimer: {
    margin: 0,
    paddingTop: spacing.xs,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
    borderTop: `1px dashed ${palette.divider}`,
  },
  muted: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    fontStyle: 'italic',
  },
  errorBox: {
    background: palette.blockedBg,
    border: `1px solid ${palette.blockedBg}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  errorTitle: {
    color: palette.blockedFg,
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.md,
  },
  errorDetail: { color: palette.text, fontSize: typography.size.sm },
  errorHint: {
    color: palette.textMuted,
    fontSize: typography.size.xs,
    fontStyle: 'italic',
  },
};

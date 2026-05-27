import { useMemo } from 'react';
import { useDealData } from './DealDataProvider';
import {
  deriveBlockers,
  type BlockerSignal,
  type BlockerSeverity,
  type BlockerStatus,
} from './blockerRules';
import { deriveCreditMemoFreshness } from './creditMemoFreshness';
import { deriveDealCockpitMetrics } from './dealCockpitMetrics';
import { Card, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { SeverityGlyph } from '../shared/SeverityGlyph';
import { WidgetHeader } from '../shared/cockpitPrimitives';
import { AlertIcon, ChecklistIcon } from '../shared/cockpitIcons';
import { palette, radius, severityPalette, spacing, typography, type SeverityKey } from '../shared/theme';

/**
 * Phase 125E — Attention Console (recomposed).
 *
 * The Attention Console is the cockpit's primary operating panel:
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ ┌──┐ Attention Console               [ POTENTIAL BLOCKER ] │
 *   │ │⚠ │ Severity-bucketed signals — derived from records.    │
 *   │ └──┘                                                       │
 *   │ ┌───────────┐ ┌───────────┐ ┌───────────┐                  │
 *   │ │  0        │ │  1        │ │  3        │                  │
 *   │ │ BLOCKED   │ │ AT-RISK   │ │ CLEAR     │                  │
 *   │ └───────────┘ └───────────┘ └───────────┘                  │
 *   │                                                            │
 *   │ ┌──┐ Missing data — 3 of 13 fields                         │
 *   │ │▤ │ [ Loan amount ] [ Target close ] [ Banker ]           │
 *   │ └──┘                                                       │
 *   │                                                            │
 *   │ ╭─── ⚠ Credit memo may be stale ───────────────────────╮   │
 *   │ │ Re-derive memo before the next stage review.        │   │
 *   │ ╰─────────────────────────────────────────────────────╯   │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Honest absence rules unchanged: zero counts still render as
 * muted tiles so the meter stays a fixed instrument. No fabricated
 * blockers, no AI prediction, no approval-odds claim.
 */
export function DealBlockers() {
  const { deal, tasks, documents, creditMemo, activity } = useDealData();
  const tasksData = tasks.kind === 'ready' ? tasks.data : undefined;
  const documentsData = documents.kind === 'ready' ? documents.data : undefined;
  const memoData = creditMemo.kind === 'ready' ? creditMemo.data : undefined;
  const activityData = activity.kind === 'ready' ? activity.data : undefined;
  const blockersResult = deriveBlockers(deal, tasksData, documentsData);
  const memoSignals: BlockerSignal[] = [];
  if (creditMemo.kind === 'ready') {
    const freshness = deriveCreditMemoFreshness({
      deal,
      tasks: tasksData,
      documents: documentsData,
      creditMemo: memoData,
      activity: activityData,
      blockers: blockersResult,
    });
    if (freshness.kind === 'at-risk' || freshness.kind === 'blocked') {
      memoSignals.push({
        id: 'credit-memo-freshness',
        severity: freshness.kind === 'blocked' ? 'blocked' : 'at-risk',
        label: 'Credit memo may be stale',
        detail: `${freshness.ctaText} ${freshness.reasons
          .map((r) => r.label)
          .join(' ')}`.trim(),
      });
    }
  }
  const combinedStatus: BlockerStatus = memoSignals.some(
    (s) => s.severity === 'blocked',
  )
    ? 'blocked'
    : blockersResult.status === 'blocked'
      ? 'blocked'
      : memoSignals.length > 0 || blockersResult.status === 'at-risk'
        ? 'at-risk'
        : 'clear';
  const signals = [...blockersResult.signals, ...memoSignals];
  const closedDealNote = blockersResult.closedDealNote;
  const status = combinedStatus;
  const statusKey = statusToSeverity(status);
  const accent = severityPalette[statusKey].bar;

  const blockedCount = signals.filter((s) => s.severity === 'blocked').length;
  const atRiskCount = signals.filter((s) => s.severity === 'at-risk').length;
  const clearCount = signals.filter((s) => s.severity === 'info').length + (status === 'clear' ? 1 : 0);

  // Pull missing-field labels from the same deriveDealCockpitMetrics
  // the deck uses so the Attention Console + the deck always agree.
  const now = useMemo(() => new Date(), []);
  const metrics = useMemo(
    () =>
      deriveDealCockpitMetrics(
        {
          deal,
          tasks: tasksData,
          documents: documentsData,
          creditMemo: memoData,
          activity: activityData,
        },
        now,
      ),
    [deal, tasksData, documentsData, memoData, activityData, now],
  );

  return (
    <Card accentColor={accent}>
      <WidgetHeader
        title="Attention Console"
        subtitle="Severity-bucketed signals — derived from authorized records."
        icon={<AlertIcon />}
        iconTone={statusKey}
        trailing={<Badge variant={statusKey}>{statusLabel(status)}</Badge>}
      />

      <div style={styles.bigMeter} role="group" aria-label="Severity counts">
        <BigSeverityTile severity="blocked" label="Blocked" count={blockedCount} />
        <BigSeverityTile severity="atRisk" label="At-risk" count={atRiskCount} />
        <BigSeverityTile severity="clear" label="Clear" count={clearCount} />
      </div>

      {metrics.missingFieldLabels.length > 0 && (
        <div style={styles.missingDataBlock} aria-label="Missing data checklist">
          <div style={styles.missingDataHead}>
            <span style={styles.missingDataIcon} aria-hidden="true">
              <ChecklistIcon />
            </span>
            <span style={styles.missingDataLabel}>
              Missing data — {metrics.missingFieldLabels.length} of {metrics.totalFieldCount} fields
            </span>
          </div>
          <MissingFieldGroups labels={metrics.missingFieldLabels} />
        </div>
      )}

      {status === 'clear' && (
        <p style={styles.cleanMessage}>
          {closedDealNote ??
            'No blockers detected from authorized records.'}
        </p>
      )}

      {signals.length > 0 && (
        <ul style={styles.list}>
          {signals.map((s) => (
            <SignalRow key={s.id} signal={s} />
          ))}
        </ul>
      )}

      <CardFooter>
        <span>Derived from authorized deal, task, document, and credit-memo records.</span>
      </CardFooter>
    </Card>
  );
}

function BigSeverityTile({
  severity,
  label,
  count,
}: {
  severity: SeverityKey;
  label: string;
  count: number;
}) {
  const p = severityPalette[severity];
  const isZero = count === 0;
  return (
    <div
      data-severity-meter-tile={severity}
      data-big-severity-tile={severity}
      style={{
        ...styles.bigTile,
        background: isZero ? palette.surfaceAlt : p.bg,
        color: isZero ? palette.textSubtle : p.fg,
        borderColor: isZero ? palette.divider : p.bar,
      }}
      aria-label={`${label}: ${count}`}
    >
      <span style={styles.bigTileCount}>{count}</span>
      <span style={styles.bigTileLabel}>{label}</span>
    </div>
  );
}

function SignalRow({ signal }: { signal: BlockerSignal }) {
  const sev = severityToKey(signal.severity);
  const p = severityPalette[sev];
  return (
    <li
      style={{
        ...styles.signal,
        borderLeft: `4px solid ${p.bar}`,
        background: p.bg,
      }}
    >
      <SeverityGlyph severity={sev} />
      <div style={styles.signalBody}>
        <div style={{ ...styles.signalLabel, color: p.fg }}>{signal.label}</div>
        <div style={styles.signalDetail}>{signal.detail}</div>
      </div>
    </li>
  );
}

/**
 * Phase 125G — group missing-field labels by category so the
 * Attention Console reads as a checklist of well-known buckets
 * (Economics / Parties / Timing / Stage & status / Structure)
 * instead of one wide single-line chip run.
 *
 * The category mapping is intentional and stable. Every label
 * here matches a label in PROFILE_COMPLETENESS_FIELDS (see
 * `src/deals/dealCockpitMetrics.ts`); a future phase that adds
 * a new tracked field should also add it to one of these
 * groups so the chips don't fall into the "Other" fallback.
 */
const MISSING_FIELD_GROUPS: ReadonlyArray<{
  id: string;
  label: string;
  fields: ReadonlyArray<string>;
}> = [
  { id: 'economics', label: 'Economics', fields: ['Loan amount', 'Pricing type'] },
  { id: 'parties', label: 'Parties', fields: ['Client', 'Banker'] },
  { id: 'timing', label: 'Timing', fields: ['Target close'] },
  { id: 'stage-status', label: 'Stage & status', fields: ['Stage', 'Status'] },
  {
    id: 'structure',
    label: 'Structure',
    fields: [
      'Product type',
      'Loan structure',
      'Customer type',
      'Industry',
      'Guarantor structure',
      'Collateral',
    ],
  },
];

function MissingFieldGroups({ labels }: { labels: ReadonlyArray<string> }) {
  const remaining = new Set(labels);
  const groups = MISSING_FIELD_GROUPS.map((g) => {
    const matched = g.fields.filter((f) => remaining.has(f));
    for (const f of matched) remaining.delete(f);
    return { ...g, matched };
  }).filter((g) => g.matched.length > 0);
  const other = Array.from(remaining);
  return (
    <div style={styles.missingGroupStack} data-missing-field-groups="phase-125g">
      {groups.map((g) => (
        <div
          key={g.id}
          style={styles.missingGroup}
          data-missing-field-group={g.id}
        >
          <div style={styles.missingGroupLabel}>{g.label}</div>
          <div style={styles.missingChipRow}>
            {g.matched.map((label) => (
              <span key={label} style={styles.missingChip}>
                {label}
              </span>
            ))}
          </div>
        </div>
      ))}
      {other.length > 0 && (
        <div style={styles.missingGroup} data-missing-field-group="other">
          <div style={styles.missingGroupLabel}>Other</div>
          <div style={styles.missingChipRow}>
            {other.map((label) => (
              <span key={label} style={styles.missingChip}>
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function statusToSeverity(s: BlockerStatus): SeverityKey {
  if (s === 'blocked') return 'blocked';
  if (s === 'at-risk') return 'atRisk';
  return 'clear';
}

function severityToKey(s: BlockerSeverity): SeverityKey {
  if (s === 'blocked') return 'blocked';
  if (s === 'at-risk') return 'atRisk';
  return 'info';
}

function statusLabel(s: BlockerStatus): string {
  if (s === 'blocked') return 'Potential blocker';
  if (s === 'at-risk') return 'At risk';
  return 'Clear';
}

const styles: Record<string, React.CSSProperties> = {
  cleanMessage: {
    margin: 0,
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.clearBg,
    color: palette.clearFg,
    fontSize: typography.size.base,
    border: `1px solid ${palette.clear}`,
    borderRadius: radius.sm,
    fontWeight: typography.weight.medium,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  signal: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'flex-start',
    padding: `${spacing.sm} ${spacing.md}`,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
  },
  signalBody: { display: 'flex', flexDirection: 'column', gap: 2 },
  signalLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
  },
  signalDetail: {
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },

  // Phase 125E — big severity meter tiles (the centerpiece of the
  // Attention Console). Three tiles always render. Each tile is
  // ~88px tall with a display-scale count value.
  bigMeter: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))',
    gap: spacing.sm,
  },
  bigTile: {
    border: '1px solid',
    borderRadius: radius.md,
    padding: `${spacing.md} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    minHeight: 96,
    minWidth: 0,
  },
  bigTileCount: {
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    fontVariantNumeric: 'tabular-nums' as const,
    lineHeight: 1,
  },
  bigTileLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase' as const,
    letterSpacing: typography.letterSpacing.label,
    fontWeight: typography.weight.bold,
    marginTop: 'auto',
  },

  // Missing-data checklist (chip strip) — Phase 125E shows the
  // banker exactly which deal-summary fields still need to be
  // filled, surfaced as chips so it reads as a fast checklist.
  missingDataBlock: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.atRiskBg,
    border: `1px solid ${palette.atRisk}`,
    borderLeft: `4px solid ${palette.atRisk}`,
    borderRadius: radius.sm,
  },
  missingDataHead: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
  },
  missingDataIcon: {
    color: palette.atRiskFg,
    display: 'inline-flex',
    alignItems: 'center',
  },
  missingDataLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    color: palette.atRiskFg,
    textTransform: 'uppercase' as const,
    letterSpacing: typography.letterSpacing.label,
  },
  missingGroupStack: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
  },
  missingGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    paddingTop: 4,
    paddingBottom: 4,
    borderTop: `1px dashed ${palette.atRisk}`,
  },
  missingGroupLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase' as const,
    letterSpacing: typography.letterSpacing.label,
    color: palette.atRiskFg,
    fontWeight: typography.weight.bold,
  },
  missingChipRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
  },
  missingChip: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: `2px ${spacing.sm}`,
    background: palette.surface,
    color: palette.atRiskFg,
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.pill,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
};

import { useDealData } from './DealDataProvider';
import {
  deriveBlockers,
  type BlockerSignal,
  type BlockerSeverity,
  type BlockerStatus,
} from './blockerRules';
import { deriveCreditMemoFreshness } from './creditMemoFreshness';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { SeverityGlyph } from '../shared/SeverityGlyph';
import { GlassPanel, SeverityMeter } from '../shared/cockpitPrimitives';
import { palette, radius, severityPalette, spacing, typography, type SeverityKey } from '../shared/theme';

/**
 * Read-only blocker card. Consumes the deal data provider so signals
 * can fold in task and document state without issuing duplicate
 * queries. Deal-only signals still render immediately; task/document
 * signals appear once those child queries resolve.
 *
 * Phase 26: a credit-memo freshness signal is folded in when the
 * derived freshness state is at-risk or blocked. The signal is
 * derived-only — DealBlockers never updates any memo's status.
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
  // Promote overall severity if the memo freshness signal is more
  // severe than the existing blocker status.
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

  // Phase 125D — severity-bucket counts for the AttentionConsole
  // meter strip. Honest: zero counts still render (so the meter
  // consistently shows three tiles) — only the tonal styling and
  // the count value change.
  const blockedCount = signals.filter((s) => s.severity === 'blocked').length;
  const atRiskCount = signals.filter((s) => s.severity === 'at-risk').length;
  const clearCount = status === 'clear' ? 1 : 0;

  return (
    <Card accentColor={accent}>
      <CardHeader
        title="Attention Console"
        subtitle="Severity-bucketed signals from authorized records — never AI."
        trailing={<Badge variant={statusKey}>{statusLabel(status)}</Badge>}
      />

      {/* Phase 125D — severity meter strip. Always 3 tiles
          (blocked / at-risk / clear) so the console reads as
          a fixed instrument bar. */}
      <SeverityMeter
        buckets={[
          { severity: 'blocked', count: blockedCount, label: 'Blocked' },
          { severity: 'atRisk', count: atRiskCount, label: 'At-risk' },
          { severity: 'clear', count: clearCount, label: 'Clear' },
        ]}
      />

      {status === 'clear' && (
        <GlassPanel>
          <p style={styles.cleanMessage}>
            {closedDealNote ??
              'No blockers detected from authorized deal, task, or document records.'}
          </p>
        </GlassPanel>
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
        <span>Approval and alert checks will be added later.</span>
      </CardFooter>
    </Card>
  );
}

function SignalRow({ signal }: { signal: BlockerSignal }) {
  const sev = severityToKey(signal.severity);
  const p = severityPalette[sev];
  return (
    <li
      style={{
        ...styles.signal,
        borderLeft: `3px solid ${p.bar}`,
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
    color: palette.textMuted,
    fontSize: typography.size.base,
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
    background: palette.surfaceAlt,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
  },
  signalBody: { display: 'flex', flexDirection: 'column', gap: 2 },
  signalLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
  },
  signalDetail: {
    fontSize: typography.size.md,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
  },
};

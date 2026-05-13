import { useMemo } from 'react';
import { useManagerData, type AsyncResult } from './ManagerDataProvider';
import type { TeamDeal } from './managerQueries';
import { dealTeamSeverity, type DealSeverity } from './teamSignals';
import { Card, CardHeader } from '../shared/Card';
import { Badge, StatusDot } from '../shared/Badge';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

interface FlaggedDeal {
  deal: TeamDeal;
  severity: DealSeverity;
  reason: string;
}

export function AtRiskBlockedDeals() {
  const { teamPipeline } = useManagerData();
  return (
    <Card>
      <CardHeader
        title="At-Risk / Blocked Deals"
        subtitle="Derived from target close date and stage entry date."
      />
      <Body teamPipeline={teamPipeline} />
    </Card>
  );
}

function Body({ teamPipeline }: { teamPipeline: AsyncResult<TeamDeal[]> }) {
  const flagged = useMemo<FlaggedDeal[]>(() => {
    if (teamPipeline.kind !== 'ready') return [];
    return teamPipeline.data
      .map((d) => {
        const sig = dealTeamSeverity(d);
        return { deal: d, severity: sig.severity, reason: sig.reason };
      })
      .filter((f): f is FlaggedDeal => f.severity !== 'clear')
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  }, [teamPipeline]);

  if (teamPipeline.kind === 'loading') return <p style={styles.muted}>Loading…</p>;
  if (teamPipeline.kind === 'failed')
    return <ErrorBlock title="Could not evaluate team risk" detail={teamPipeline.message} />;

  if (flagged.length === 0) {
    return (
      <p style={styles.muted}>
        No deals are at risk or blocked on the current deal-field signals.
      </p>
    );
  }

  return (
    <ul style={styles.list}>
      {flagged.map((f) => (
        <li key={f.deal.id} style={styles.row}>
          <StatusDot variant={severityKey(f.severity)} />
          <div style={styles.rowBody}>
            <div style={styles.rowHeader}>
              <span style={styles.title}>{f.deal.name}</span>
              <Badge variant={severityKey(f.severity)}>{severityLabel(f.severity)}</Badge>
            </div>
            <div style={styles.reason}>{f.reason}</div>
            <div style={styles.meta}>
              <Meta label="Client" value={f.deal.clientName} />
              <Meta label="Banker" value={f.deal.assignedBankerName} />
              <Meta label="Stage" value={f.deal.stage} />
              <Meta label="Target close" value={formatDate(f.deal.targetCloseDate)} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function severityRank(s: DealSeverity): number {
  if (s === 'blocked') return 0;
  if (s === 'atRisk') return 1;
  return 2;
}

function severityKey(s: DealSeverity): SeverityKey {
  if (s === 'blocked') return 'blocked';
  if (s === 'atRisk') return 'atRisk';
  return 'clear';
}

function severityLabel(s: DealSeverity): string {
  if (s === 'blocked') return 'Potential blocker';
  if (s === 'atRisk') return 'At risk';
  return 'Clear';
}

function Meta({ label, value }: { label: string; value: string | undefined }) {
  return (
    <span style={styles.metaItem}>
      <span style={styles.metaLabel}>{label}</span>
      <span style={styles.metaValue}>{value ?? '—'}</span>
    </span>
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

function formatDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const styles: Record<string, React.CSSProperties> = {
  muted: { margin: 0, color: palette.textMuted, fontSize: typography.size.md, fontStyle: 'italic' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.sm },
  row: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'flex-start',
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
  },
  rowBody: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 },
  rowHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  title: { fontSize: typography.size.base, fontWeight: typography.weight.semibold, color: palette.text },
  reason: { fontSize: typography.size.md, color: palette.textMuted },
  meta: {
    display: 'flex',
    gap: spacing.md,
    flexWrap: 'wrap',
    fontSize: typography.size.sm,
    color: palette.textMuted,
  },
  metaItem: { whiteSpace: 'nowrap', display: 'inline-flex', gap: 4 },
  metaLabel: { color: palette.textSubtle },
  metaValue: { color: palette.text },
  errorBox: {
    background: palette.blockedBg,
    border: `1px solid ${palette.blockedBg}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  errorTitle: { color: palette.blockedFg, fontWeight: typography.weight.semibold, fontSize: typography.size.md },
  errorDetail: { color: palette.text, fontSize: typography.size.sm },
  errorHint: { color: palette.textMuted, fontSize: typography.size.xs, fontStyle: 'italic' },
};

import { useMemo } from 'react';
import { useTeamData, type AsyncResult } from './TeamDataProvider';
import { dealSeverity, type TeamDealRow } from './teamQueries';
import { Card, CardHeader } from '../shared/Card';
import { teamStyles, formatCurrency } from './teamCardChrome';
import { palette } from '../shared/theme';

interface Summary {
  total: number;
  blocked: number;
  atRisk: number;
  clear: number;
  totalAmount: number;
  closingThisMonth: number;
  pastTargetClose: number;
}

export function TeamPipelineSummary() {
  const { deals } = useTeamData();
  return (
    <Card>
      <CardHeader title="Team Pipeline Summary" />
      <Body deals={deals} />
    </Card>
  );
}

function Body({ deals }: { deals: AsyncResult<TeamDealRow[]> }) {
  const summary = useMemo<Summary | null>(() => {
    if (deals.kind !== 'ready') return null;
    return summarize(deals.data);
  }, [deals]);

  if (deals.kind === 'loading') return <p style={teamStyles.muted}>Loading team pipeline…</p>;
  if (deals.kind === 'failed')
    return <ErrorBlock title="Could not load team pipeline" detail={deals.message} />;
  if (!summary) return null;
  if (summary.total === 0)
    return <p style={teamStyles.muted}>No active deals on the team yet.</p>;

  return (
    <div style={teamStyles.grid}>
      <Stat label="Active deals" value={summary.total.toString()} />
      <Stat label="Total amount" value={formatCurrency(summary.totalAmount)} />
      <Stat label="Closing this month" value={summary.closingThisMonth.toString()} />
      <Stat
        label="Past target close"
        value={summary.pastTargetClose.toString()}
        color={summary.pastTargetClose > 0 ? palette.atRiskFg : undefined}
      />
      <Stat
        label="At risk"
        value={summary.atRisk.toString()}
        color={summary.atRisk > 0 ? palette.atRiskFg : undefined}
      />
      <Stat
        label="Blocked"
        value={summary.blocked.toString()}
        color={summary.blocked > 0 ? palette.blockedFg : undefined}
      />
    </div>
  );
}

function summarize(deals: TeamDealRow[], now: Date = new Date()): Summary {
  let blocked = 0;
  let atRisk = 0;
  let clear = 0;
  let totalAmount = 0;
  let closingThisMonth = 0;
  let pastTargetClose = 0;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  for (const d of deals) {
    if (d.amount != null) totalAmount += d.amount;
    if (d.targetCloseDate) {
      const t = new Date(d.targetCloseDate).getTime();
      if (!Number.isNaN(t)) {
        if (t >= monthStart && t < monthEnd) closingThisMonth++;
        if (t < now.getTime()) pastTargetClose++;
      }
    }
    const sev = dealSeverity(d, now);
    if (sev === 'blocked') blocked++;
    else if (sev === 'atRisk') atRisk++;
    else clear++;
  }
  return {
    total: deals.length,
    blocked,
    atRisk,
    clear,
    totalAmount,
    closingThisMonth,
    pastTargetClose,
  };
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={teamStyles.stat}>
      <div style={teamStyles.statLabel}>{label}</div>
      <div style={{ ...teamStyles.statValue, color: color ?? palette.text }}>{value}</div>
    </div>
  );
}

function ErrorBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={teamStyles.errorBox} role="alert">
      <div style={teamStyles.errorTitle}>{title}</div>
      <div style={teamStyles.errorDetail}>{detail}</div>
      <div style={teamStyles.errorHint}>Refresh to retry.</div>
    </div>
  );
}

import { useMemo } from 'react';
import { useManagerData, type AsyncResult } from './ManagerDataProvider';
import type { TeamDeal, TeamBanker } from './managerQueries';
import { dealTeamSeverity } from './teamSignals';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

interface BankerWorkload {
  bankerId: string;
  bankerName: string;
  roleType: string | undefined;
  active: boolean;
  totalDeals: number;
  totalAmount: number;
  flaggedDeals: number;
}

const UNASSIGNED_ID = '__unassigned__';

export function BankerWorkloadSummary() {
  const { teamPipeline, teamBankers } = useManagerData();
  return (
    <Card>
      <CardHeader title="Banker Workload Summary" />
      <Body teamPipeline={teamPipeline} teamBankers={teamBankers} />
    </Card>
  );
}

function Body({
  teamPipeline,
  teamBankers,
}: {
  teamPipeline: AsyncResult<TeamDeal[]>;
  teamBankers: AsyncResult<TeamBanker[]>;
}) {
  const rows = useMemo<BankerWorkload[]>(() => {
    if (teamPipeline.kind !== 'ready' || teamBankers.kind !== 'ready') return [];
    return buildWorkload(teamPipeline.data, teamBankers.data);
  }, [teamPipeline, teamBankers]);

  if (teamPipeline.kind === 'loading' || teamBankers.kind === 'loading') {
    return <p style={styles.muted}>Loading workload…</p>;
  }
  if (teamPipeline.kind === 'failed' || teamBankers.kind === 'failed') {
    const message =
      teamPipeline.kind === 'failed'
        ? teamPipeline.message
        : teamBankers.kind === 'failed'
          ? teamBankers.message
          : '';
    return <ErrorBlock title="Could not load workload" detail={message} />;
  }
  if (rows.length === 0) {
    return <p style={styles.muted}>No bankers on the team yet.</p>;
  }

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th className="cc-th">Banker</th>
            <th className="cc-th">Role</th>
            <th className="cc-th" style={{ textAlign: 'right' }}>Deals</th>
            <th className="cc-th" style={{ textAlign: 'right' }}>Pipeline $</th>
            <th className="cc-th" style={{ textAlign: 'right' }}>Flagged</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.bankerId}>
              <td className="cc-td">
                <span style={r.active ? styles.bankerName : styles.bankerNameInactive}>
                  {r.bankerName}
                </span>
                {!r.active && (
                  <span style={styles.inactiveTag}> · inactive</span>
                )}
              </td>
              <td className="cc-td" style={{ color: palette.textMuted }}>
                {r.roleType ?? '—'}
              </td>
              <td className="cc-td cc-td-num">{r.totalDeals}</td>
              <td className="cc-td cc-td-num">{formatCurrency(r.totalAmount)}</td>
              <td className="cc-td cc-td-num">
                {r.flaggedDeals > 0 ? (
                  <Badge variant="atRisk">{r.flaggedDeals}</Badge>
                ) : (
                  <span style={{ color: palette.textSubtle }}>0</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildWorkload(deals: TeamDeal[], bankers: TeamBanker[]): BankerWorkload[] {
  const acc = new Map<string, BankerWorkload>();
  for (const b of bankers) {
    acc.set(b.id, {
      bankerId: b.id,
      bankerName: b.fullName,
      roleType: b.roleType,
      active: b.active,
      totalDeals: 0,
      totalAmount: 0,
      flaggedDeals: 0,
    });
  }

  for (const d of deals) {
    const id = d.assignedBankerId ?? UNASSIGNED_ID;
    let row = acc.get(id);
    if (!row) {
      // Deal assigned to a banker not in the team list (cross-team
      // assignment, inactive, or list-truncated). Surface it under
      // their name rather than dropping silently.
      row = {
        bankerId: id,
        bankerName: d.assignedBankerName ?? 'Unassigned',
        roleType: undefined,
        active: false,
        totalDeals: 0,
        totalAmount: 0,
        flaggedDeals: 0,
      };
      acc.set(id, row);
    }
    row.totalDeals++;
    row.totalAmount += d.amount ?? 0;
    const sig = dealTeamSeverity(d);
    if (sig.severity !== 'clear') row.flaggedDeals++;
  }

  return [...acc.values()].sort((a, b) => b.totalDeals - a.totalDeals);
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

function formatCurrency(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

const styles: Record<string, React.CSSProperties> = {
  muted: { margin: 0, color: palette.textMuted, fontSize: typography.size.md, fontStyle: 'italic' },
  tableWrap: {
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    overflow: 'auto',
    background: palette.surface,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  bankerName: { fontWeight: typography.weight.medium, color: palette.text },
  bankerNameInactive: { fontWeight: typography.weight.medium, color: palette.textMuted },
  inactiveTag: { color: palette.textSubtle, fontSize: typography.size.sm },
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

import { useNavigate } from 'react-router-dom';
import { useTeamData, type AsyncResult } from './TeamDataProvider';
import { dealSeverity, type TeamDealRow } from './teamQueries';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { teamStyles, formatCurrency, formatDate } from './teamCardChrome';
import { palette, typography, type SeverityKey } from '../shared/theme';

export function SharedActiveDeals() {
  const { deals } = useTeamData();
  return (
    <Card>
      <CardHeader title="Shared Active Deals" subtitle={subtitleFor(deals)} />
      <Body deals={deals} />
    </Card>
  );
}

function subtitleFor(deals: AsyncResult<TeamDealRow[]>): string | undefined {
  if (deals.kind !== 'ready') return undefined;
  const n = deals.data.length;
  if (n === 0) return undefined;
  return `${n} active deal${n === 1 ? '' : 's'} across the team`;
}

function Body({ deals }: { deals: AsyncResult<TeamDealRow[]> }) {
  const navigate = useNavigate();
  if (deals.kind === 'loading') return <p style={teamStyles.muted}>Loading active deals…</p>;
  if (deals.kind === 'failed')
    return <ErrorBlock title="Could not load active deals" detail={deals.message} />;
  if (deals.data.length === 0)
    return <p style={teamStyles.muted}>No active deals on the team yet.</p>;

  return (
    <div style={teamStyles.tableWrap}>
      <table style={teamStyles.table}>
        <thead>
          <tr>
            <th className="cc-th">Deal</th>
            <th className="cc-th">Client</th>
            <th className="cc-th">Banker</th>
            <th className="cc-th">Stage</th>
            <th className="cc-th" style={{ textAlign: 'right' }}>Amount</th>
            <th className="cc-th">Target close</th>
            <th className="cc-th">Severity</th>
          </tr>
        </thead>
        <tbody>
          {deals.data.map((d) => {
            const sev = dealSeverity(d);
            return (
              <tr
                key={d.id}
                className="cc-row-hover"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/deals/${d.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/deals/${d.id}`);
                  }
                }}
                tabIndex={0}
                role="link"
                aria-label={`Open deal ${d.name}`}
              >
                <td className="cc-td">
                  <span style={styles.dealName}>{d.name}</span>
                </td>
                <td className="cc-td">{d.clientName ?? '—'}</td>
                <td className="cc-td" style={{ color: palette.textMuted }}>
                  {d.assignedBankerName ?? '—'}
                </td>
                <td className="cc-td">
                  {d.stage ? <Badge variant="neutral">{d.stage}</Badge> : '—'}
                </td>
                <td className="cc-td cc-td-num">{formatCurrency(d.amount ?? 0)}</td>
                <td className="cc-td">{formatDate(d.targetCloseDate) ?? '—'}</td>
                <td className="cc-td">
                  {sev === 'clear' ? (
                    <span style={{ color: palette.textSubtle }}>—</span>
                  ) : (
                    <Badge variant={severityKey(sev)}>{severityLabel(sev)}</Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function severityKey(s: 'blocked' | 'atRisk' | 'clear'): SeverityKey {
  if (s === 'blocked') return 'blocked';
  if (s === 'atRisk') return 'atRisk';
  return 'clear';
}

function severityLabel(s: 'blocked' | 'atRisk' | 'clear'): string {
  if (s === 'blocked') return 'Blocked';
  if (s === 'atRisk') return 'At risk';
  return 'Clear';
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

const styles: Record<string, React.CSSProperties> = {
  dealName: { fontWeight: typography.weight.semibold, color: palette.text },
};

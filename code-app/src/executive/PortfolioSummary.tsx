import { useMemo } from 'react';
import { useExecutiveData, type AsyncResult } from './ExecutiveDataProvider';
import type { ProfitabilitySnapshotRow, RefreshStatusRow } from './snapshotQueries';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { execStyles, formatCurrency, formatDate } from './execCardChrome';

interface PortfolioAggregate {
  asOfDate: string;
  rowCount: number;
  totalLoanBalance: number;
  totalDeposits: number;
  totalLoanRevenue: number;
  totalRelationshipRevenue: number;
  feeIncomeYtd: number;
  staleCount: number;
}

export function PortfolioSummary() {
  const { snapshotProfitability, snapshotRefreshStatus } = useExecutiveData();
  return (
    <Card>
      <CardHeader
        title="Portfolio Summary"
        subtitle="Official profitability snapshot, aggregated across relationships."
        trailing={<RefreshBadge refreshStatus={snapshotRefreshStatus} />}
      />
      <Body
        snapshotProfitability={snapshotProfitability}
        refreshStatus={snapshotRefreshStatus}
      />
    </Card>
  );
}

function Body({
  snapshotProfitability,
  refreshStatus,
}: {
  snapshotProfitability: AsyncResult<ProfitabilitySnapshotRow[]>;
  refreshStatus: AsyncResult<RefreshStatusRow | null>;
}) {
  const aggregate = useMemo<PortfolioAggregate | null>(() => {
    if (snapshotProfitability.kind !== 'ready') return null;
    return aggregateLatestSnapshot(snapshotProfitability.data);
  }, [snapshotProfitability]);

  if (snapshotProfitability.kind === 'loading')
    return <p style={execStyles.muted}>Loading portfolio snapshot…</p>;
  if (snapshotProfitability.kind === 'failed')
    return <ErrorBlock title="Could not load portfolio snapshot" detail={snapshotProfitability.message} />;
  if (!aggregate) {
    return (
      <p style={execStyles.muted}>
        No Official profitability snapshot is available yet. Ask an admin when the next
        refresh runs.
      </p>
    );
  }

  const asOfLabel = formatDate(aggregate.asOfDate) ?? aggregate.asOfDate;
  const refreshFreshness =
    refreshStatus.kind === 'ready' && refreshStatus.data
      ? formatDate(refreshStatus.data.lastRefreshDate)
      : undefined;

  return (
    <>
      <p style={execStyles.asOfLine}>
        As of {asOfLabel} · {aggregate.rowCount} relationship snapshot
        {aggregate.rowCount === 1 ? '' : 's'}
        {refreshFreshness ? ` · last refreshed ${refreshFreshness}` : ''}
      </p>
      <div style={execStyles.grid}>
        <Stat label="Total loan balance" value={formatCurrency(aggregate.totalLoanBalance)} />
        <Stat label="Total deposits" value={formatCurrency(aggregate.totalDeposits)} />
        <Stat label="Loan revenue" value={formatCurrency(aggregate.totalLoanRevenue)} />
        <Stat label="Relationship revenue" value={formatCurrency(aggregate.totalRelationshipRevenue)} />
        <Stat label="Fee income YTD" value={formatCurrency(aggregate.feeIncomeYtd)} />
      </div>
      <CardFooter>
        <span>
          Sourced from cr664_ProfitabilitySnapshot1 (Official state only).
        </span>
        {aggregate.staleCount > 0 && (
          <span>
            {aggregate.staleCount} relationship snapshot
            {aggregate.staleCount === 1 ? '' : 's'} flagged stale.
          </span>
        )}
      </CardFooter>
    </>
  );
}

function aggregateLatestSnapshot(
  rows: ProfitabilitySnapshotRow[],
): PortfolioAggregate | null {
  if (rows.length === 0) return null;
  // Server returned rows ordered by cr664_asofdate desc; the first row's
  // as-of date is the latest published period. Aggregate all rows that
  // share it.
  const latestDate = rows[0]!.asOfDate;
  const sameDate = rows.filter((r) => r.asOfDate === latestDate);
  let totalLoanBalance = 0;
  let totalDeposits = 0;
  let totalLoanRevenue = 0;
  let totalRelationshipRevenue = 0;
  let feeIncomeYtd = 0;
  let staleCount = 0;
  for (const r of sameDate) {
    totalLoanBalance += r.totalLoanBalance;
    totalDeposits += r.totalDeposits;
    totalLoanRevenue += r.totalLoanRevenue ?? 0;
    totalRelationshipRevenue += r.totalRelationshipRevenue ?? 0;
    feeIncomeYtd += r.feeIncomeYtd ?? 0;
    if (r.staleDataFlag) staleCount++;
  }
  return {
    asOfDate: latestDate,
    rowCount: sameDate.length,
    totalLoanBalance,
    totalDeposits,
    totalLoanRevenue,
    totalRelationshipRevenue,
    feeIncomeYtd,
    staleCount,
  };
}

function RefreshBadge({
  refreshStatus,
}: {
  refreshStatus: AsyncResult<RefreshStatusRow | null>;
}) {
  if (refreshStatus.kind !== 'ready' || !refreshStatus.data) return null;
  const stale = refreshStatus.data.staleDataFlag;
  return (
    <Badge variant={stale ? 'atRisk' : 'clear'}>
      {stale ? 'Data may be stale' : refreshStatus.data.refreshStatusName}
    </Badge>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={execStyles.stat}>
      <div style={execStyles.statLabel}>{label}</div>
      <div style={execStyles.statValue}>{value}</div>
    </div>
  );
}

function ErrorBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={execStyles.errorBox} role="alert">
      <div style={execStyles.errorTitle}>{title}</div>
      <div style={execStyles.errorDetail}>{detail}</div>
      <div style={execStyles.errorHint}>Refresh to retry.</div>
    </div>
  );
}

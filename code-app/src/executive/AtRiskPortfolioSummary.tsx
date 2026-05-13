import { useMemo } from 'react';
import { useExecutiveData, type AsyncResult } from './ExecutiveDataProvider';
import type { DealReadinessSnapshotRow, ReadinessBandKey } from './snapshotQueries';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { execStyles, formatDate } from './execCardChrome';
import { palette, type SeverityKey } from '../shared/theme';

interface ReadinessRollup {
  latestSnapshotAt: string | undefined;
  perBand: Record<ReadinessBandKey, number>;
  totalDeals: number;
  totalMissingDocs: number;
  totalOpenBlockers: number;
  totalPendingApprovals: number;
}

export function AtRiskPortfolioSummary() {
  const { snapshotReadiness } = useExecutiveData();
  return (
    <Card>
      <CardHeader
        title="At-Risk Portfolio Summary"
        subtitle="Latest deal-readiness snapshot per deal, rolled up by band."
      />
      <Body snapshotReadiness={snapshotReadiness} />
    </Card>
  );
}

function Body({
  snapshotReadiness,
}: {
  snapshotReadiness: AsyncResult<DealReadinessSnapshotRow[]>;
}) {
  const rollup = useMemo<ReadinessRollup | null>(() => {
    if (snapshotReadiness.kind !== 'ready') return null;
    return buildRollup(snapshotReadiness.data);
  }, [snapshotReadiness]);

  if (snapshotReadiness.kind === 'loading')
    return <p style={execStyles.muted}>Loading deal readiness snapshot…</p>;
  if (snapshotReadiness.kind === 'failed')
    return (
      <ErrorBlock title="Could not load readiness snapshot" detail={snapshotReadiness.message} />
    );
  if (!rollup || rollup.totalDeals === 0) {
    return (
      <p style={execStyles.muted}>
        No deal-readiness snapshots are available yet.
      </p>
    );
  }

  return (
    <>
      <p style={execStyles.asOfLine}>
        Latest snapshot {formatDate(rollup.latestSnapshotAt)} · {rollup.totalDeals} deal
        {rollup.totalDeals === 1 ? '' : 's'}
      </p>
      <div style={execStyles.grid}>
        <BandStat label="High readiness" count={rollup.perBand.High} variant="clear" />
        <BandStat label="Medium" count={rollup.perBand.Medium} variant="neutral" />
        <BandStat label="Low" count={rollup.perBand.Low} variant="atRisk" />
        <BandStat label="Blocked" count={rollup.perBand.Blocked} variant="blocked" />
      </div>
      <div style={execStyles.grid}>
        <DiagStat label="Missing docs (total)" value={rollup.totalMissingDocs} />
        <DiagStat label="Open blockers (total)" value={rollup.totalOpenBlockers} />
        <DiagStat label="Pending approvals (total)" value={rollup.totalPendingApprovals} />
      </div>
      <CardFooter>
        <span>Sourced from cr664_DealReadinessSnapshot, latest per deal.</span>
      </CardFooter>
    </>
  );
}

function buildRollup(rows: DealReadinessSnapshotRow[]): ReadinessRollup {
  // Rows arrive ordered by cr664_snapshotat desc. The first time we
  // see a given deal id is therefore its latest snapshot — that's the
  // one we count.
  const seen = new Set<string>();
  const latest: DealReadinessSnapshotRow[] = [];
  for (const r of rows) {
    const key = r.dealId ?? r.id;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(r);
  }

  const perBand: Record<ReadinessBandKey, number> = {
    High: 0,
    Medium: 0,
    Low: 0,
    Blocked: 0,
  };
  let totalMissingDocs = 0;
  let totalOpenBlockers = 0;
  let totalPendingApprovals = 0;
  let latestSnapshotAt: string | undefined = latest[0]?.snapshotAt;

  for (const r of latest) {
    if (r.readinessBand) perBand[r.readinessBand]++;
    totalMissingDocs += r.missingDocsCount;
    totalOpenBlockers += r.openBlockersCount;
    totalPendingApprovals += r.pendingApprovalsCount;
  }

  return {
    latestSnapshotAt,
    perBand,
    totalDeals: latest.length,
    totalMissingDocs,
    totalOpenBlockers,
    totalPendingApprovals,
  };
}

function BandStat({
  label,
  count,
  variant,
}: {
  label: string;
  count: number;
  variant: SeverityKey;
}) {
  const valueColor =
    variant === 'blocked'
      ? palette.blockedFg
      : variant === 'atRisk'
        ? palette.atRiskFg
        : variant === 'clear'
          ? palette.clearFg
          : palette.text;
  return (
    <div style={execStyles.stat}>
      <div style={execStyles.statLabel}>
        <Badge variant={variant} appearance="outline">{label}</Badge>
      </div>
      <div style={{ ...execStyles.statValue, color: valueColor }}>{count}</div>
    </div>
  );
}

function DiagStat({ label, value }: { label: string; value: number }) {
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

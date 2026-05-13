import { useAdminData, type AsyncResult } from './AdminDataProvider';
import type { RefreshStatusSummary } from './adminDiagnosticsQueries';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { adminStyles, formatDateTime } from './adminCardChrome';
import { palette } from '../shared/theme';

export function RefreshStatus() {
  const { refreshStatus } = useAdminData();
  return (
    <Card>
      <CardHeader title="Snapshot / Profitability Refresh Status" />
      <Body data={refreshStatus} />
    </Card>
  );
}

function Body({ data }: { data: AsyncResult<RefreshStatusSummary | null> }) {
  if (data.kind === 'loading') return <p style={adminStyles.muted}>Loading refresh status…</p>;
  if (data.kind === 'failed')
    return <ErrorBlock title="Could not load refresh status" detail={data.message} />;
  if (!data.data) {
    return (
      <p style={adminStyles.notWired}>
        No cr664_ProfitabilityRefreshStatus record is published yet. When admin
        configures snapshot cadence, this card will show last refresh, schedule,
        and stale-data flags.
      </p>
    );
  }

  const r = data.data;
  return (
    <>
      <div style={adminStyles.grid}>
        <Stat
          label="Status"
          value={
            r.staleDataFlag ? (
              <Badge variant="atRisk">Stale</Badge>
            ) : (
              <Badge variant="clear">{r.refreshStatusName}</Badge>
            )
          }
        />
        <Stat label="Last refresh" value={formatDateTime(r.lastRefreshDate) ?? '—'} />
        <Stat label="Next scheduled" value={formatDateTime(r.nextScheduledRefresh) ?? '—'} />
        <Stat label="Cadence" value={r.refreshCadence ?? '—'} />
        <Stat label="Stale threshold" value={`${r.staleThresholdHours}h`} />
      </div>
      <CardFooter>
        <span>Sourced from cr664_ProfitabilityRefreshStatus, latest record.</span>
      </CardFooter>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={adminStyles.stat}>
      <div style={adminStyles.statLabel}>{label}</div>
      <div style={{ ...adminStyles.statValue, color: palette.text, fontSize: '1.05rem' }}>
        {value}
      </div>
    </div>
  );
}

function ErrorBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={adminStyles.errorBox} role="alert">
      <div style={adminStyles.errorTitle}>{title}</div>
      <div style={adminStyles.errorDetail}>{detail}</div>
      <div style={adminStyles.errorHint}>Refresh to retry.</div>
    </div>
  );
}

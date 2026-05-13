import { useAdminData, type AsyncResult } from './AdminDataProvider';
import type { ConfigurationSnapshot } from './adminDiagnosticsQueries';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { adminStyles, formatDate } from './adminCardChrome';
import { palette, spacing, typography } from '../shared/theme';

const PREVIEW_LIMIT = 6;

export function ConfigurationOverview() {
  const { configuration } = useAdminData();
  return (
    <Card>
      <CardHeader title="Configuration Overview" />
      <Body data={configuration} />
    </Card>
  );
}

function Body({ data }: { data: AsyncResult<ConfigurationSnapshot> }) {
  if (data.kind === 'loading') return <p style={adminStyles.muted}>Loading configuration…</p>;
  if (data.kind === 'failed')
    return <ErrorBlock title="Could not load configuration" detail={data.message} />;

  const { systemSettings, activeKpiThresholds } = data.data;
  if (systemSettings.length === 0 && activeKpiThresholds.length === 0) {
    return (
      <p style={adminStyles.notWired}>
        No cr664_SystemSetting or active cr664_KPIThresholdConfiguration records yet.
        These tables drive system-wide defaults and KPI bands; admin will populate
        them as the platform is configured.
      </p>
    );
  }

  return (
    <>
      <div style={adminStyles.grid}>
        <Stat label="System settings" value={systemSettings.length.toString()} />
        <Stat label="Active KPI thresholds" value={activeKpiThresholds.length.toString()} />
      </div>

      {activeKpiThresholds.length > 0 && (
        <div style={styles.subBlock}>
          <h4 style={styles.subHeading}>Active KPI thresholds (top {PREVIEW_LIMIT})</h4>
          <ul style={adminStyles.list}>
            {activeKpiThresholds.slice(0, PREVIEW_LIMIT).map((t) => (
              <li key={t.id} style={adminStyles.row}>
                <div style={adminStyles.rowHead}>
                  <span style={adminStyles.rowTitle}>{t.name ?? t.code ?? '(unnamed)'}</span>
                  <Badge variant="clear" appearance="outline">Active</Badge>
                </div>
                <div style={adminStyles.rowMeta}>
                  {t.code && (
                    <span>
                      <span style={adminStyles.metaLabel}>Code:</span> {t.code}
                    </span>
                  )}
                  {t.effectiveDate && (
                    <span>
                      <span style={adminStyles.metaLabel}>Effective:</span>{' '}
                      {formatDate(t.effectiveDate) ?? '—'}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {systemSettings.length > 0 && (
        <div style={styles.subBlock}>
          <h4 style={styles.subHeading}>System settings (top {PREVIEW_LIMIT})</h4>
          <ul style={adminStyles.list}>
            {systemSettings.slice(0, PREVIEW_LIMIT).map((s) => (
              <li key={s.id} style={adminStyles.row}>
                <div style={adminStyles.rowHead}>
                  <span style={adminStyles.rowTitle}>
                    {s.settingName ?? '(unnamed setting)'}
                  </span>
                </div>
                {s.kpiBaselineDate && (
                  <div style={adminStyles.rowMeta}>
                    <span>
                      <span style={adminStyles.metaLabel}>KPI baseline:</span>{' '}
                      {formatDate(s.kpiBaselineDate) ?? '—'}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <CardFooter>
        <span>Sourced from cr664_SystemSetting and cr664_KPIThresholdConfiguration.</span>
        <span>Edits to configuration land in a later phase (writes deferred).</span>
      </CardFooter>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={adminStyles.stat}>
      <div style={adminStyles.statLabel}>{label}</div>
      <div style={{ ...adminStyles.statValue, color: palette.text }}>{value}</div>
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

const styles: Record<string, React.CSSProperties> = {
  subBlock: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  subHeading: {
    margin: 0,
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
};

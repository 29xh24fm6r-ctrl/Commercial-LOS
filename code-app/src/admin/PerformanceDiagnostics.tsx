import { useState } from 'react';
import {
  getPerfSnapshot,
  resetPerfRegistry,
  setPerfEnabled,
  type PerfSnapshot,
} from '../shared/observability/perfRegistry';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { adminStyles } from './adminCardChrome';
import {
  palette,
  radius,
  spacing,
  typography,
  type SeverityKey,
} from '../shared/theme';

/**
 * Phase 31: read-only Performance Diagnostics card.
 *
 * Renders the in-memory perfRegistry snapshot — query timings,
 * provider load durations, refresh trigger counts, and recent
 * failure samples. Local-only; no external telemetry. The "Refresh
 * snapshot" button is a pure UI re-read of the in-memory registry,
 * not a Dataverse refresh.
 *
 * The card includes a small Pause/Resume / Clear control row so an
 * operator can stop collection (no business behavior changes — the
 * registry switches to no-op mode) or clear the buffer to start a
 * fresh observation window.
 */
export function PerformanceDiagnostics() {
  const [snapshot, setSnapshot] = useState<PerfSnapshot>(() => getPerfSnapshot());

  function reread() {
    setSnapshot(getPerfSnapshot());
  }

  function clearBuffer() {
    resetPerfRegistry();
    setSnapshot(getPerfSnapshot());
  }

  function togglePerf() {
    setPerfEnabled(!snapshot.enabled);
    setSnapshot(getPerfSnapshot());
  }

  return (
    <Card>
      <CardHeader
        title="Performance Diagnostics"
        subtitle="In-memory observability across providers, queries, refreshes, and failures. Local-only — nothing is sent off-platform."
        trailing={
          <Badge variant={snapshot.enabled ? 'clear' : 'neutral'}>
            {snapshot.enabled ? 'Recording' : 'Paused'}
          </Badge>
        }
      />

      <div style={adminStyles.grid}>
        <Stat label="Queries completed" value={snapshot.totals.queriesCompleted} />
        <Stat
          label="Queries failed"
          value={snapshot.totals.queriesFailed}
          accent={snapshot.totals.queriesFailed > 0 ? 'atRisk' : 'clear'}
        />
        <Stat label="Provider loads" value={snapshot.totals.providerLoads} />
        <Stat label="Refreshes" value={snapshot.totals.refreshes} />
        <Stat
          label="Write-triggered refreshes"
          value={snapshot.totals.writeTriggeredRefreshes}
        />
        <Stat
          label="Events recorded"
          value={snapshot.totalEvents}
          sub={`ring ${snapshot.ringSize}/${snapshot.ringCapacity}`}
        />
      </div>

      <SubBlock label="Slowest recent queries">
        {snapshot.slowestRecent.length === 0 ? (
          <p style={adminStyles.muted}>No completed queries observed yet.</p>
        ) : (
          <ul style={adminStyles.list}>
            {snapshot.slowestRecent.slice(0, 10).map((q) => (
              <li key={`${q.group}-${q.label}-${q.at}`} style={adminStyles.row}>
                <div style={adminStyles.rowHead}>
                  <span style={adminStyles.rowTitle}>
                    {q.group} · {q.label}
                  </span>
                  <span style={styles.duration}>{q.durationMs.toFixed(1)} ms</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SubBlock>

      <SubBlock label="Provider load averages">
        {snapshot.providerAverages.length === 0 ? (
          <p style={adminStyles.muted}>No provider loads observed yet.</p>
        ) : (
          <ul style={adminStyles.list}>
            {snapshot.providerAverages.map((p) => (
              <li key={p.provider} style={adminStyles.row}>
                <div style={adminStyles.rowHead}>
                  <span style={adminStyles.rowTitle}>{p.provider}</span>
                  <span style={styles.duration}>
                    avg {p.avgMs.toFixed(1)} ms · n={p.n}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SubBlock>

      <SubBlock label="Refresh trigger counts">
        {snapshot.refreshCounts.length === 0 ? (
          <p style={adminStyles.muted}>No refresh triggers observed yet.</p>
        ) : (
          <ul style={adminStyles.list}>
            {snapshot.refreshCounts.map((r) => (
              <li key={r.key} style={adminStyles.row}>
                <div style={adminStyles.rowHead}>
                  <span style={adminStyles.rowTitle}>{r.key}</span>
                  <Badge
                    variant={r.key.startsWith('after-') ? 'info' : 'neutral'}
                    appearance="outline"
                  >
                    {r.key.startsWith('after-') ? 'Write-triggered' : 'Manual'}
                  </Badge>
                  <span style={styles.duration}>{r.count}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SubBlock>

      {snapshot.failureSamples.length > 0 && (
        <SubBlock label="Recent query failures">
          <ul style={adminStyles.list}>
            {snapshot.failureSamples.slice(0, 10).map((f, i) => (
              <li key={`${f.group}-${f.label}-${i}`} style={adminStyles.row}>
                <div style={adminStyles.rowHead}>
                  <span style={adminStyles.rowTitle}>
                    {f.group} · {f.label}
                  </span>
                  <Badge variant="atRisk" appearance="outline">
                    Failed
                  </Badge>
                </div>
                <p style={styles.failureDetail}>{f.error}</p>
              </li>
            ))}
          </ul>
        </SubBlock>
      )}

      <div style={styles.controls}>
        <button type="button" onClick={reread} style={styles.controlBtn}>
          Refresh snapshot
        </button>
        <button type="button" onClick={togglePerf} style={styles.controlBtnSecondary}>
          {snapshot.enabled ? 'Pause recording' : 'Resume recording'}
        </button>
        <button type="button" onClick={clearBuffer} style={styles.controlBtnSecondary}>
          Clear buffer
        </button>
      </div>

      <CardFooter>
        <span>
          Local in-memory diagnostics only — no external telemetry, no analytics,
          no Dataverse writes.
        </span>
        <span>
          Pause / Clear are UI controls. Pausing flips the registry to no-op mode
          so wrapped calls remain pure passthroughs.
        </span>
      </CardFooter>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub?: string;
  accent?: SeverityKey;
}) {
  const color =
    accent === 'atRisk'
      ? palette.atRiskFg
      : accent === 'blocked'
        ? palette.blockedFg
        : palette.text;
  return (
    <div style={adminStyles.stat}>
      <span style={adminStyles.statLabel}>{label}</span>
      <span style={{ ...adminStyles.statValue, color }}>{value}</span>
      {sub && <span style={styles.statSub}>{sub}</span>}
    </div>
  );
}

function SubBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.subBlock}>
      <h4 style={styles.subHeading}>{label}</h4>
      {children}
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
  statSub: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontVariantNumeric: 'tabular-nums',
  },
  duration: {
    fontFamily: typography.mono,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    fontVariantNumeric: 'tabular-nums',
  },
  failureDetail: {
    margin: 0,
    paddingTop: 4,
    fontSize: typography.size.sm,
    color: palette.text,
    fontFamily: typography.mono,
    background: palette.surface,
    padding: `${spacing.xxs} ${spacing.xs}`,
    borderRadius: radius.sm,
    wordBreak: 'break-word',
  },
  controls: {
    display: 'flex',
    gap: spacing.xs,
    flexWrap: 'wrap',
    paddingTop: spacing.xs,
  },
  controlBtn: {
    background: palette.primary,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  controlBtnSecondary: {
    background: palette.surface,
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
};

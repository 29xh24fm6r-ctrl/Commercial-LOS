import { useEffect, useState } from 'react';
import {
  type DiagnosticSeverity,
  type DiagnosticState,
  type StageProgressionCheck,
  type StageGovernanceDiagnostics as StageGovernanceDiagnosticsData,
} from '../shared/governance/stageProgressionAvailability';
import { loadStageGovernanceDiagnostics } from './stageGovernanceDiagnosticsLoader';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge, StatusDot } from '../shared/Badge';
import { adminStyles } from './adminCardChrome';
import {
  palette,
  radius,
  severityPalette,
  spacing,
  typography,
  type SeverityKey,
} from '../shared/theme';

/**
 * Stage Governance Diagnostics — Phase 5 (live, data-driven).
 *
 * Previously this card rendered the no-arg (always-blocked) diagnostics, so it
 * reported CRITICAL forever and never showed the real state. It now loads the
 * live stage + status reference rows, runs the deterministic contracts, and
 * shows the EXACT rows found (code / sequence / active), the disposition status
 * set, and the resolved transition graph — flipping to READY automatically once
 * the ordering resolves, the five statuses are active, and the graph validates.
 *
 * Still read-only: no actions, no writes, no fake "fix" button, no stage
 * advancement performed. It reports schema/governance readiness; arming the
 * Advance Stage gate remains a separate, operator-owned step.
 */
export function StageGovernanceDiagnostics() {
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'ready'; diagnostics: StageGovernanceDiagnosticsData }
  >({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    loadStageGovernanceDiagnostics()
      .then((d) => {
        if (alive) setState({ kind: 'ready', diagnostics: d });
      })
      .catch(() => {
        // The loader is fail-closed and never rejects; this is belt-and-braces.
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state.kind === 'loading') {
    return (
      <Card>
        <CardHeader
          title="Stage Governance Diagnostics"
          subtitle="Schema-level governance checks driving the Advance Stage gate."
          trailing={<Badge variant="clear">Checking…</Badge>}
        />
        <p style={styles.rowDetail} data-stage-governance-loading>
          Loading the live stage + status reference state…
        </p>
      </Card>
    );
  }

  const diagnostics = state.diagnostics;
  const sev = severityToKey(diagnostics.overallSeverity);

  return (
    <Card>
      <CardHeader
        title="Stage Governance Diagnostics"
        subtitle="Live stage/status reference checks driving the Advance Stage gate."
        trailing={
          <Badge variant={sev} data-stage-governance-overall>
            {overallLabel(diagnostics.overallSeverity, diagnostics.available)}
          </Badge>
        }
      />
      <ul style={adminStyles.list} aria-label="Stage governance checks">
        {diagnostics.checks.map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}
      </ul>

      {/* Exact stage-reference rows found (code / sequence / active). */}
      <div style={styles.tableBox} data-stage-governance-stage-rows>
        <div style={styles.tableHeading}>Stage reference rows ({diagnostics.stageRows.length})</div>
        {diagnostics.stageRows.length === 0 ? (
          <p style={styles.emptyNote}>No stage-reference rows are readable in this environment yet.</p>
        ) : (
          <ul style={styles.rowsList}>
            {diagnostics.stageRows.map((r) => (
              <li key={r.code} style={styles.rowLine} data-stage-row={r.code}>
                <span style={styles.rowCode}>{r.code}</span>
                <span style={styles.rowSeq}>seq {r.sequence ?? '—'}</span>
                <span style={r.active ? styles.activeTag : styles.inactiveTag}>
                  {r.active ? 'Active' : 'Inactive'}
                </span>
                {!r.canonical && <span style={styles.warnTag}>non-canonical</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Disposition status set. */}
      <div style={styles.tableBox} data-stage-governance-status-rows>
        <div style={styles.tableHeading}>Disposition status rows ({diagnostics.statusRows.length})</div>
        {diagnostics.statusRows.length === 0 ? (
          <p style={styles.emptyNote}>No status-reference rows are readable in this environment yet.</p>
        ) : (
          <div style={styles.statusChips}>
            {diagnostics.statusRows.map((r) => (
              <span
                key={r.code}
                style={r.active ? styles.statusChip : styles.statusChipInactive}
                data-status-row={r.code}
              >
                {r.code}
                {!r.active ? ' (inactive)' : ''}
                {!r.canonical ? ' ⚠' : ''}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Resolved transition graph. */}
      {diagnostics.transitionPath.length > 0 && (
        <div style={styles.pathBox} data-stage-governance-path>
          <div style={styles.tableHeading}>Transition graph</div>
          <div style={styles.pathLine}>{diagnostics.transitionPath.join(' → ')}</div>
        </div>
      )}

      <div style={styles.affectedBox}>
        <div style={styles.affectedHeading}>Affected feature</div>
        <ul style={styles.affectedList}>
          {diagnostics.affectedFeatures.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>

      <div style={styles.remediationBox}>
        <div style={styles.remediationHeading}>Required remediation</div>
        <ol style={styles.remediationList}>
          {diagnostics.remediation.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <p style={styles.remediationFootnote}>
          Read-only diagnostic. No fix is performed by this card; seeding + SDK
          regeneration happen via the maker/schema path, and arming the Advance
          Stage gate is a separate operator step.
        </p>
      </div>

      <CardFooter>
        <span>Derived from the live stage/status reference rows. Data-driven schema signal.</span>
        <span>Read-only — no Dataverse writes, no overrides, no stage progression performed.</span>
      </CardFooter>
    </Card>
  );
}

function CheckRow({ check }: { check: StageProgressionCheck }) {
  const sev = severityToKey(check.severity);
  const p = severityPalette[sev];
  return (
    <li style={adminStyles.row}>
      <div style={adminStyles.rowHead}>
        <span style={adminStyles.rowTitle}>
          <StatusDot variant={sev} /> {check.label}
        </span>
        <Badge variant={sev} appearance="outline">
          {stateLabel(check.state)}
        </Badge>
      </div>
      <p style={{ ...styles.rowDetail, color: p.fg === palette.clearFg ? palette.text : p.fg }}>
        {check.detail}
      </p>
    </li>
  );
}

function severityToKey(s: DiagnosticSeverity): SeverityKey {
  if (s === 'blocked') return 'blocked';
  if (s === 'at-risk') return 'atRisk';
  return 'clear';
}

function stateLabel(s: DiagnosticState): string {
  if (s === 'present') return 'Present';
  if (s === 'missing') return 'Missing';
  return 'Unknown';
}

function overallLabel(s: DiagnosticSeverity, available: boolean): string {
  if (available) return 'Ready — available';
  if (s === 'blocked') return 'Critical — not yet available';
  if (s === 'at-risk') return 'Needs review — not yet available';
  return 'Not yet available';
}

const styles: Record<string, React.CSSProperties> = {
  rowDetail: {
    margin: 0,
    paddingTop: 4,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  tableBox: {
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    background: palette.surfaceAlt,
    padding: `${spacing.xs} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  tableHeading: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  emptyNote: { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' },
  rowsList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  rowLine: { display: 'flex', alignItems: 'center', gap: spacing.sm, fontSize: typography.size.sm },
  rowCode: { fontFamily: 'monospace', fontWeight: typography.weight.semibold, color: palette.text, minWidth: 150 },
  rowSeq: { color: palette.textMuted, fontVariantNumeric: 'tabular-nums' },
  activeTag: { color: palette.clear, fontSize: typography.size.xs, fontWeight: typography.weight.semibold },
  inactiveTag: { color: palette.textSubtle, fontSize: typography.size.xs, fontStyle: 'italic' },
  warnTag: { color: palette.atRiskFg, fontSize: typography.size.xs, fontWeight: typography.weight.semibold },
  statusChips: { display: 'flex', flexWrap: 'wrap', gap: spacing.xs },
  statusChip: {
    fontFamily: 'monospace',
    fontSize: typography.size.xs,
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.pill,
    padding: `0 ${spacing.xs}`,
    color: palette.text,
  },
  statusChipInactive: {
    fontFamily: 'monospace',
    fontSize: typography.size.xs,
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.pill,
    padding: `0 ${spacing.xs}`,
    color: palette.textSubtle,
    fontStyle: 'italic',
  },
  pathBox: {
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  pathLine: { fontFamily: 'monospace', fontSize: typography.size.sm, color: palette.text },
  affectedBox: {
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    background: palette.surfaceAlt,
    padding: `${spacing.xs} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  affectedHeading: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  affectedList: {
    margin: 0,
    paddingLeft: spacing.md,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  remediationBox: {
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: spacing.md,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  remediationHeading: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  remediationList: {
    margin: 0,
    paddingLeft: spacing.lg,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  remediationFootnote: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontStyle: 'italic',
  },
};

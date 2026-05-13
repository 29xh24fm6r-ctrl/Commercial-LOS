import {
  stageProgressionDiagnostics,
  type DiagnosticSeverity,
  type DiagnosticState,
  type StageProgressionCheck,
} from '../shared/governance/stageProgressionAvailability';
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
 * Phase 29: read-only governance diagnostics card surfacing the
 * Phase 28 stage-progression schema gap inside the Admin Workspace.
 *
 * Sealed-module discipline: this card imports ONLY the pure governance
 * utility from src/shared/governance/ — never a Deal Workspace
 * component or provider. The data is schema-level, not deal-level,
 * so it does not need DealDataProvider.
 *
 * No actions, no writes, no fake "fix" button. The card renders the
 * structured diagnostic shape verbatim plus a numbered remediation
 * list so an engineer or admin can act on it directly.
 */
export function StageGovernanceDiagnostics() {
  const diagnostics = stageProgressionDiagnostics();
  const sev = severityToKey(diagnostics.overallSeverity);

  return (
    <Card>
      <CardHeader
        title="Stage Governance Diagnostics"
        subtitle="Schema-level governance checks driving the Advance Stage gate."
        trailing={
          <Badge variant={sev}>{overallLabel(diagnostics.overallSeverity, diagnostics.available)}</Badge>
        }
      />
      <ul style={adminStyles.list} aria-label="Stage governance checks">
        {diagnostics.checks.map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}
      </ul>

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
          Read-only diagnostic. No fix is performed by this card; remediation must
          happen via the SDK regeneration / schema design path.
        </p>
      </div>

      <CardFooter>
        <span>
          Derived from the generated SDK surface area. Pure schema-level signal.
        </span>
        <span>
          Read-only — no Dataverse writes, no overrides, no stage progression performed.
        </span>
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
  if (available) return 'Available';
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

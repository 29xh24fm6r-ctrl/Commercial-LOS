import { type CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';
import {
  deriveOgbCrmWorkflowActivation,
  type GateState,
} from './ogbCrmWorkflowActivationModel';

/**
 * Phase 202 — OGB CRM / Lending Workflow activation status (READ-ONLY).
 *
 * Admin-only, read-only projection of `deriveOgbCrmWorkflowActivation()`. Shows
 * the internal OGB CRM + lending workflow activation status and the gated write
 * categories. Performs NO action: no create / write / apply / enable / sync /
 * send, no gate flip, no SDK call. Rendered inside the already admin-gated
 * AdminWorkspace (no new route, no entitlement widening).
 */

const GATE_SEVERITY: Record<GateState, SeverityKey> = {
  enabled: 'clear',
  gated: 'atRisk',
};

export function OgbCrmWorkflowActivationPanel() {
  const a = deriveOgbCrmWorkflowActivation();
  return (
    <section style={styles.wrap} aria-label="OGB CRM and Lending Workflow activation" data-ogb-crm-workflow-activation>
      <header style={styles.head}>
        <h2 style={styles.title}>OGB CRM &amp; Lending Workflow Activation</h2>
        <div style={styles.badges}>
          <Badge variant={a.internalCrmActive ? 'clear' : 'atRisk'}>
            {a.internalCrmActive ? 'OGB CRM active' : 'OGB CRM inactive'}
          </Badge>
          <Badge variant={a.internalWorkflowActive ? 'clear' : 'atRisk'}>
            {a.internalWorkflowActive ? 'Internal lending workflow active' : 'Workflow inactive'}
          </Badge>
        </div>
        <p style={styles.summary}>
          OGB-native internal CRM and lending workflow read surfaces are active (read-only). Unsafe write
          categories remain gated / fail-closed. This panel flips no gate.
        </p>
      </header>

      <ul style={styles.rows}>
        {a.rows.map((r) => (
          <li key={r.label} style={styles.row}>
            <span style={styles.rowLabel}>{r.label}</span>
            <span style={styles.rowValue}>{r.value}</span>
          </li>
        ))}
      </ul>

      <div style={styles.gates}>
        <span style={styles.gatesLabel}>Gated categories</span>
        <div style={styles.gateBadges}>
          <Badge variant={GATE_SEVERITY[a.writebackStatus]}>Writeback {a.writebackStatus}</Badge>
          <Badge variant={GATE_SEVERITY[a.checklistGenerationStatus]}>Checklist generation {a.checklistGenerationStatus}</Badge>
          <Badge variant={GATE_SEVERITY[a.borrowerCommunicationStatus]}>Borrower comms {a.borrowerCommunicationStatus}</Badge>
          <Badge variant={a.pilotCreateStatus === 'enabled' ? 'clear' : 'atRisk'}>
            Pilot create {a.pilotCreateStatus === 'enabled' ? 'enabled (pilot-only)' : 'gated'}
          </Badge>
        </div>
      </div>

      {a.remainingBlockers.length > 0 && (
        <div style={styles.blockers}>
          <span style={styles.gatesLabel}>Remaining gated / blockers</span>
          <ul style={styles.blockerList}>
            {a.remainingBlockers.map((b, i) => (
              <li key={i} style={styles.blockerItem}>{b}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    background: palette.surface,
    border: `1px solid ${palette.panelBorder ?? palette.border}`,
    borderRadius: radius.md,
    padding: `${spacing.lg} ${spacing.xl}`,
  },
  head: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  title: { margin: 0, fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  badges: { display: 'flex', gap: spacing.sm, flexWrap: 'wrap' },
  summary: { margin: 0, fontSize: typography.size.sm, color: palette.textMuted, lineHeight: typography.lineHeight.snug },
  rows: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: `${spacing.xs} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider ?? palette.border}`,
    borderRadius: radius.sm,
  },
  rowLabel: { fontSize: typography.size.sm, color: palette.textMuted, fontWeight: typography.weight.semibold },
  rowValue: { fontSize: typography.size.sm, color: palette.text, textAlign: 'right' },
  gates: { display: 'flex', flexDirection: 'column', gap: 4 },
  gatesLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  gateBadges: { display: 'flex', gap: spacing.xs, flexWrap: 'wrap' },
  blockers: { display: 'flex', flexDirection: 'column', gap: 4 },
  blockerList: { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 },
  blockerItem: { fontSize: typography.size.sm, color: palette.text, lineHeight: typography.lineHeight.snug },
};

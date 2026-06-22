import { type CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import { deriveV1ActivationReadiness } from '../shared/readiness/v1ActivationReadinessModel';

/**
 * Phase 203 — V1 Activation Readiness panel (READ-ONLY).
 *
 * Admin-only read-only projection of `deriveV1ActivationReadiness()`. It states
 * the final V1 release posture (CONDITIONAL_GO), the active OGB-native surfaces,
 * the pilot-enabled capability, and the gated unsafe write categories. It
 * performs NO action: no buttons, no mutating links, no form inputs, no
 * connector calls, no write adapters, no live persistence, no gate flip.
 */

export function V1ActivationReadinessPanel() {
  const r = deriveV1ActivationReadiness();
  return (
    <section style={styles.wrap} aria-label="V1 Activation Readiness" data-v1-activation-readiness>
      <header style={styles.head}>
        <h2 style={styles.title}>V1 Activation Readiness</h2>
        <Badge variant="atRisk">{r.overallPosture}</Badge>
        <p style={styles.summary}>
          Deterministic V1 release posture derived from existing gate constants and models. Read-only;
          this panel flips no gate and performs no action.
        </p>
      </header>

      <Section title="A. Active product surfaces">
        <Row label="OGB CRM" value={r.ogbCrmStatus} good={r.ogbCrmStatus === 'ACTIVE'} />
        <Row label="Internal lending workflow" value={r.internalLendingWorkflowStatus} good={r.internalLendingWorkflowStatus === 'ACTIVE'} />
        <Row label="Relationship intelligence" value="ACTIVE" good />
        <Row label="Banker / manager / executive read surfaces" value="ACTIVE" good />
      </Section>

      <Section title="B. Pilot-enabled capability">
        <Row label="New Deal create pilot" value={r.newDealCreatePilot} good={r.newDealCreatePilot === 'ENABLED'} />
        <Row label="Pilot-only write path" value="CONTROLLED" good />
      </Section>

      <Section title="C. Gated unsafe write categories">
        <Row label="CRM writeback" value={r.crmWriteback} good={r.crmWriteback === 'GATED'} />
        <Row label="Borrower communications" value={r.borrowerCommunications} good={r.borrowerCommunications === 'GATED'} />
        <Row label="Checklist generation" value={r.checklistGeneration} good={r.checklistGeneration === 'GATED'} />
        <Row label="Broad workflow writes" value={r.broadWorkflowWrites} good={r.broadWorkflowWrites === 'GATED'} />
      </Section>

      <Section title="D. Release safety posture">
        <Row label="External connectors" value={r.externalConnectors} good />
        <Row label="Fake / sample-data dependency" value={r.fakeSampleDataDependency} good />
        <Row label="Schema / migration dependency" value={r.schemaMigrationDependency} good />
        <Row label="Route / permission widening" value={r.permissionRouteExpansion} good />
        <Row label="Readiness posture" value="DETERMINISTIC" good />
      </Section>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionLabel}>{title}</div>
      <ul style={styles.rows}>{children}</ul>
    </div>
  );
}

function Row({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <li style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <Badge variant={good ? 'clear' : 'atRisk'}>{value}</Badge>
    </li>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    background: palette.surface,
    border: `1px solid ${palette.panelBorder ?? palette.border}`,
    borderRadius: radius.md,
    padding: `${spacing.lg} ${spacing.xl}`,
  },
  head: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  title: { margin: 0, fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  summary: { margin: 0, fontSize: typography.size.sm, color: palette.textMuted, lineHeight: typography.lineHeight.snug },
  section: { display: 'flex', flexDirection: 'column', gap: 4 },
  sectionLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  rows: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    padding: `${spacing.xs} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider ?? palette.border}`,
    borderRadius: radius.sm,
  },
  rowLabel: { fontSize: typography.size.sm, color: palette.text },
};

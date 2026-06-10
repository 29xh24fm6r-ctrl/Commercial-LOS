import { type CSSProperties, type ReactNode } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { ServicingLifecycleProjection } from './servicingLifecycleMapper';

interface Props {
  projection?: ServicingLifecycleProjection;
}

/**
 * Phase 142R — Servicing lifecycle read-only mapper panel.
 *
 * Shows a servicing lifecycle projection derived from available LOS/Dataverse
 * fields only. It is a MAPPER ONLY: there is NO board-loan / sync-to-core /
 * generate-schedule / create-servicing-record / mark-current / mark-delinquent /
 * send-statement / notify-borrower / approve / deny / vote affordance, NO form,
 * NO mutation control, NO fetch, NO sample data, and NO fake servicing-record
 * display. No loan is boarded and no external system is changed.
 */
export function ServicingLifecycleMapperPanel({ projection }: Props) {
  if (!projection) {
    return (
      <Card>
        <CardHeader title="Servicing Lifecycle Read-only Mapper" subtitle="Mapper only — read-only projection" />
        <div style={emptyStyle}>Servicing lifecycle data is unavailable. Nothing is shown until authorized deal data is provided.</div>
        <CardFooter>
          <span>Read-only mapper — no boarding, core sync, schedule generation, or external change occurs here.</span>
        </CardFooter>
      </Card>
    );
  }

  const p = projection;
  return (
    <Card>
      <CardHeader title="Servicing Lifecycle Read-only Mapper" subtitle="Mapper only — read-only projection" />

      <div style={pillRowStyle}>
        <span style={pillStyle}>Read-only projection</span>
      </div>

      <div style={bannerStyle}>
        Servicing lifecycle data is projected from available LOS/Dataverse fields only. No loan is boarded, no payment schedule is generated, no core banking sync occurs, and no external system is changed.
      </div>

      <dl style={metaStyle}>
        <Row label="Deal" value={p.dealName} />
        <Row label="Client" value={p.clientName} />
        <Row label="Borrower" value={p.borrowerLabel} />
        <Row label="Banker" value={p.bankerName} />
        <Row label="Projection status" value={p.servicingProjectionLabel} />
        <Row label="Boarding readiness" value={p.boardingReadiness.replace(/_/g, ' ')} />
        <Row label="Servicing reference present" value={String(p.servicingReferencePresent)} />
      </dl>

      <Section title="Loan snapshot">
        <dl style={metaStyle}>
          <Row label="Product type" value={p.loanSnapshot.productType} />
          <Row label="Loan structure" value={p.loanSnapshot.loanStructure} />
          <Row label="Pricing type" value={p.loanSnapshot.pricingType} />
          <Row label="Amount" value={p.loanSnapshot.amountLabel} />
          <Row label="Maturity" value={p.loanSnapshot.maturityLabel} />
          <Row label="Amortization" value={p.loanSnapshot.amortizationLabel} />
        </dl>
      </Section>

      {p.lifecycleMilestones.length > 0 && (
        <Section title="Lifecycle milestones (present in source)">
          <ul style={ulStyle}>
            {p.lifecycleMilestones.map((m) => (
              <li key={m.key} style={itemStyle}>{m.label}</li>
            ))}
          </ul>
        </Section>
      )}

      {p.missingServicingFields.length > 0 && (
        <Section title="Missing boarding-review fields">
          <ul style={ulStyle}>
            {p.missingServicingFields.map((f) => (
              <li key={f} style={warnItemStyle}>{f}</li>
            ))}
          </ul>
        </Section>
      )}

      {p.warnings.length > 0 && (
        <Section title="Warnings">
          <ul style={ulStyle}>
            {p.warnings.map((w) => (
              <li key={w} style={warnItemStyle}>{w}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Next read-only review step">
        <span style={itemStyle}>{p.nextReadOnlyReviewStep}</span>
      </Section>

      <div style={safetyStyle}>
        Read-only: {String(p.readOnly)} · Live servicing sync: {String(p.liveServicingSyncPerformed)} · Core banking sync: {String(p.coreBankingSyncPerformed)} · Boarding performed: {String(p.loanBoarded)} · Schedule generation performed: {String(p.paymentScheduleGenerated)} · External system changed: {String(p.externalSystemChanged)}
      </div>

      <CardFooter>
        <span>Read-only mapper — a projection for human review only; no loan boarding, servicing, or decisioning occurs, and no external system is changed.</span>
      </CardFooter>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <dt style={dtStyle}>{label}</dt>
      <dd style={ddStyle}>{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={sectionStyle}>
      <span style={sectionTitleStyle}>{title}</span>
      {children}
    </div>
  );
}

const pillRowStyle: CSSProperties = { display: 'flex', gap: spacing.xs };
const pillStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted, background: palette.neutralBg, padding: `2px ${spacing.xs}`, borderRadius: 999, fontWeight: typography.weight.semibold };
const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4 };
const safetyStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, marginTop: spacing.sm };
const emptyStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic', padding: spacing.sm };
const metaStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 200, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const warnItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg };

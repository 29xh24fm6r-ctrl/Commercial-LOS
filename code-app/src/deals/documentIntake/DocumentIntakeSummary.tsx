import type { CSSProperties } from 'react';
import type { UnderwritingIntakeReadiness } from './documentIntakeReadiness';
import { palette, radius, spacing, typography } from '../../shared/theme';

export function DocumentIntakeSummary({ companyLegalName, dealNumber, readiness }: { readonly companyLegalName?: string; readonly dealNumber?: string; readonly readiness: UnderwritingIntakeReadiness }) {
  return <section style={styles.card} aria-label="Underwriting intake summary" data-document-intake-summary>
    <div><p style={styles.eyebrow}>Underwriting Intake</p><h3 style={styles.title}>{companyLegalName || 'Borrower legal name unavailable'}</h3><p style={styles.meta}>Deal {dealNumber || 'number unavailable'}</p></div>
    <div style={styles.metrics}>
      <Metric label="Received" value={`${readiness.received} of ${readiness.totalApplicable}`} />
      <Metric label="Pending review" value={String(readiness.pendingReview)} />
      <Metric label="Outstanding" value={String(readiness.outstanding)} />
      <Metric label="Exceptions" value={String(readiness.approvedExceptions)} />
    </div>
    <div role="status" style={readiness.status.startsWith('READY') ? styles.ready : styles.status}>{readiness.status.replaceAll('_', ' ')}</div>
  </section>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div><strong style={styles.value}>{value}</strong><span style={styles.label}>{label}</span></div>; }
const styles: Record<string, CSSProperties> = {
  card: { display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 2fr auto', gap: spacing.lg, alignItems: 'center', padding: spacing.lg, background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: radius.md },
  eyebrow: { margin: 0, color: palette.primary, fontSize: typography.size.xs, fontWeight: typography.weight.bold, textTransform: 'uppercase' }, title: { margin: `${spacing.xxs} 0`, color: palette.text, fontSize: typography.size.lg }, meta: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(80px, 1fr))', gap: spacing.md }, value: { display: 'block', color: palette.text, fontSize: typography.size.lg }, label: { color: palette.textMuted, fontSize: typography.size.xs },
  status: { padding: `${spacing.xs} ${spacing.sm}`, color: palette.atRiskFg, background: palette.atRiskBg, borderRadius: radius.sm, fontSize: typography.size.xs, fontWeight: typography.weight.bold }, ready: { padding: `${spacing.xs} ${spacing.sm}`, color: palette.clearFg, background: palette.clearBg, borderRadius: radius.sm, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
};

import { useDealData } from './DealDataProvider';
import type { DealDetail } from './dealQueries';
import { Card, CardHeader } from '../shared/Card';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 125D — Deal Summary as grouped metric sections.
 *
 * The Phase 80 single-grid table was replaced with three
 * tonal "deck sections":
 *
 *   Identity (cobalt accent)  — product / loan structure /
 *                                customer / industry
 *   Pricing (teal accent)     — pricing type · spread index +
 *                                margin (combined fact)
 *   Structure (violet accent) — guarantor structure +
 *                                collateral narrative + created
 *
 * Each section reads as a labeled cockpit module. Missing values
 * still render as italic "Not provided" inside the cell — Phase
 * 125B/C/D's honest-absence rule. No derived AI text; no
 * fabricated narrative; no predictive overlay.
 *
 * Hook surface unchanged from Phase 80 (single `useDealData()`).
 */
export function DealSummary() {
  const { deal } = useDealData();
  return (
    <Card>
      <CardHeader title="Deal Summary" />

      <SummarySection
        title="Identity"
        accent={palette.cobalt}
        items={[
          { label: 'Product type', value: deal.productType },
          { label: 'Loan structure', value: deal.loanStructure },
          { label: 'Customer type', value: deal.customerType },
          { label: 'Industry', value: deal.industry },
        ]}
      />

      <SummarySection
        title="Pricing"
        accent={palette.teal}
        items={[
          { label: 'Pricing type', value: deal.pricingType },
          { label: 'Spread', value: formatSpread(deal) },
        ]}
      />

      <SummarySection
        title="Structure"
        accent={palette.violet}
        items={[
          { label: 'Guarantor structure', value: deal.guarantorStructure },
          { label: 'Created', value: formatDate(deal.createdOn) },
        ]}
      />

      <div style={styles.longField}>
        <div style={styles.dt}>Collateral</div>
        {deal.collateralSummary ? (
          <p style={styles.collateralText}>{deal.collateralSummary}</p>
        ) : (
          <p style={styles.notProvided}>Not provided</p>
        )}
      </div>
    </Card>
  );
}

interface SectionItem {
  label: string;
  value: string | undefined;
}

function SummarySection({
  title,
  accent,
  items,
}: {
  title: string;
  accent: string;
  items: SectionItem[];
}) {
  return (
    <section
      data-summary-section={title.toLowerCase()}
      style={{
        ...styles.section,
        borderLeft: `3px solid ${accent}`,
      }}
      aria-label={`${title} summary`}
    >
      <div style={styles.sectionTitle}>{title}</div>
      <dl style={styles.grid}>
        {items.map((it) => (
          <Fact key={it.label} label={it.label} value={it.value} />
        ))}
      </dl>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div style={styles.fact}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={value ? styles.dd : styles.ddMissing}>{value ?? 'Not provided'}</dd>
    </div>
  );
}

function formatSpread(deal: DealDetail): string | undefined {
  const parts: string[] = [];
  if (deal.spreadIndex) parts.push(deal.spreadIndex);
  if (deal.spreadMargin != null && Number.isFinite(deal.spreadMargin)) {
    const sign = deal.spreadMargin >= 0 ? '+' : '';
    parts.push(`${sign}${deal.spreadMargin}%`);
  }
  return parts.length ? parts.join(' ') : undefined;
}

function formatDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textMuted,
    fontWeight: typography.weight.bold,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: `${spacing.xs} ${spacing.lg}`,
    margin: 0,
  },
  fact: { display: 'flex', flexDirection: 'column', gap: 2 },
  dt: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  dd: { margin: 0, fontSize: typography.size.base, color: palette.text },
  ddMissing: {
    margin: 0,
    fontSize: typography.size.base,
    color: palette.textSubtle,
    fontStyle: 'italic',
  },
  longField: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    borderTop: `1px solid ${palette.divider}`,
    paddingTop: spacing.sm,
  },
  collateralText: {
    margin: 0,
    fontSize: typography.size.base,
    color: palette.text,
    whiteSpace: 'pre-wrap',
    lineHeight: typography.lineHeight.normal,
  },
  notProvided: {
    margin: 0,
    fontSize: typography.size.base,
    color: palette.textSubtle,
    fontStyle: 'italic',
  },
};

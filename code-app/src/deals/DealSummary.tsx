import { useDealData } from './DealDataProvider';
import type { DealDetail } from './dealQueries';
import { Card } from '../shared/Card';
import { WidgetHeader } from '../shared/cockpitPrimitives';
import { MemoIcon } from '../shared/cockpitIcons';
import { palette, spacing, typography } from '../shared/theme';

/**
 * Phase 125E — Deal Summary as a compact details card.
 *
 * The Phase 125D three-section summary was still dominating the
 * page; Phase 125E demotes it to a tight key/value table that
 * lives lower in the cockpit, after the Attention Console, Stage
 * Map, Action Console, and Workstream Panel. The summary is a
 * reference table now — not the page's main attraction.
 *
 *   ┌───────────────────────────────────────────────┐
 *   │ ┌──┐ Deal Summary                             │
 *   │ │📋│ Schema-actual fields from the loan deal │
 *   │ └──┘                                          │
 *   │  Product type        Loan structure           │
 *   │  RLOC                Senior Secured           │
 *   │  Customer type       Industry                 │
 *   │  C&I                 Manufacturing            │
 *   │  Guarantor           Pricing                  │
 *   │  Two PG              Float SOFR +275          │
 *   │  Created             Collateral               │
 *   │  Jan 15 2026         A/R, inventory…          │
 *   └───────────────────────────────────────────────┘
 *
 * Missing values stay italic "Not provided" — Phase 125B/C/D/E
 * honest-absence rule.
 */
export function DealSummary() {
  const { deal } = useDealData();
  return (
    <Card>
      <WidgetHeader
        title="Deal Summary"
        subtitle="Schema-actual fields from the cr664_loandeal record."
        icon={<MemoIcon />}
        iconTone="neutral"
      />
      <dl style={styles.grid}>
        <Fact label="Product type" value={deal.productType} />
        <Fact label="Loan structure" value={deal.loanStructure} />
        <Fact label="Customer type" value={deal.customerType} />
        <Fact label="Industry" value={deal.industry} />
        <Fact label="Guarantor structure" value={deal.guarantorStructure} />
        <Fact label="Pricing" value={formatPricing(deal)} />
        <Fact label="Created" value={formatDate(deal.createdOn)} />
        <Fact label="Stage entered" value={formatDate(deal.stageEntryDate)} />
      </dl>
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

function Fact({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div style={styles.fact}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={value ? styles.dd : styles.ddMissing}>{value ?? 'Not provided'}</dd>
    </div>
  );
}

function formatPricing(deal: DealDetail): string | undefined {
  const segments: string[] = [];
  if (deal.pricingType) segments.push(deal.pricingType);
  const rateParts: string[] = [];
  if (deal.spreadIndex) rateParts.push(deal.spreadIndex);
  if (deal.spreadMargin != null) {
    const sign = deal.spreadMargin >= 0 ? '+' : '';
    rateParts.push(`${sign}${deal.spreadMargin}%`);
  }
  if (rateParts.length) segments.push(rateParts.join(' '));
  return segments.length ? segments.join(' · ') : undefined;
}

function formatDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: `${spacing.sm} ${spacing.lg}`,
    margin: 0,
  },
  fact: { display: 'flex', flexDirection: 'column', gap: 2 },
  dt: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.bold,
  },
  dd: {
    margin: 0,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
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
  longLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase' as const,
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.bold,
  },
};

void styles.longLabel;

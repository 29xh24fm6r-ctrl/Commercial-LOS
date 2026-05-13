import { useDealData } from './DealDataProvider';
import type { DealDetail } from './dealQueries';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';

/**
 * Read-only deal summary. Uses fields already on the authorized
 * cr664_loandeal record loaded by loadDealForBanker — no extra fetches,
 * no edit affordances. Fields that don't exist on the schema (e.g. a
 * dedicated "use of proceeds" column) are intentionally not rendered;
 * fields that exist but are unset on this deal render as "Not provided".
 */
export function DealSummary() {
  const { deal } = useDealData();
  return (
    <Card>
      <CardHeader title="Deal Summary" />

      <dl style={styles.grid}>
        <Fact label="Product type" value={deal.productType} />
        <Fact label="Loan structure" value={deal.loanStructure} />
        <Fact label="Customer type" value={deal.customerType} />
        <Fact label="Industry" value={deal.industry} />
        <Fact label="Guarantor structure" value={deal.guarantorStructure} />
        <Fact label="Pricing" value={formatPricing(deal)} />
        <Fact label="Created" value={formatDate(deal.createdOn)} />
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

  return segments.length ? segments.join(' — ') : undefined;
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: `${spacing.sm} ${spacing.xl}`,
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

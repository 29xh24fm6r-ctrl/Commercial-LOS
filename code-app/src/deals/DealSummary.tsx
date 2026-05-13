import { useDealData } from './DealDataProvider';
import type { DealDetail } from './dealQueries';

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
    <section style={styles.card} aria-labelledby="deal-summary-heading">
      <h3 id="deal-summary-heading" style={styles.heading}>
        Deal Summary
      </h3>

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
  card: {
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: 6,
    padding: '1.25rem 1.5rem',
    marginBottom: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  heading: { margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#222' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '0.85rem 1.5rem',
    margin: 0,
  },
  fact: { display: 'flex', flexDirection: 'column', gap: '0.15rem' },
  dt: {
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#777',
  },
  dd: { margin: 0, fontSize: '0.95rem', color: '#1a1a1a' },
  ddMissing: { margin: 0, fontSize: '0.95rem', color: '#999', fontStyle: 'italic' },
  longField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
    borderTop: '1px solid #f0f0f0',
    paddingTop: '1rem',
  },
  collateralText: {
    margin: 0,
    fontSize: '0.95rem',
    color: '#1a1a1a',
    whiteSpace: 'pre-wrap',
    lineHeight: 1.45,
  },
  notProvided: { margin: 0, fontSize: '0.95rem', color: '#999', fontStyle: 'italic' },
};

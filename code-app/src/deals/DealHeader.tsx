import type { DealDetail } from './dealQueries';

interface DealHeaderProps {
  deal: DealDetail;
}

export function DealHeader({ deal }: DealHeaderProps) {
  return (
    <header style={styles.header} aria-label="Deal header">
      <div style={styles.titleRow}>
        <h1 style={styles.name}>{deal.name}</h1>
        {deal.amount != null && <div style={styles.amount}>{formatCurrency(deal.amount)}</div>}
      </div>
      <dl style={styles.facts}>
        <Fact label="Client" value={deal.clientName} />
        <Fact label="Stage" value={deal.stage} />
        <Fact label="Status" value={deal.status} />
        <Fact label="Assigned banker" value={deal.bankerName} />
        <Fact label="Target close" value={formatDate(deal.targetCloseDate)} />
      </dl>
    </header>
  );
}

function Fact({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div style={styles.fact}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={styles.dd}>{value ?? '—'}</dd>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: 6,
    padding: '1.25rem 1.5rem',
    marginBottom: '1.5rem',
  },
  titleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '1rem',
    flexWrap: 'wrap',
    marginBottom: '0.75rem',
  },
  name: { margin: 0, fontSize: '1.35rem', fontWeight: 600 },
  amount: { fontSize: '1.15rem', fontWeight: 600, color: '#1a1a1a' },
  facts: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '0.75rem 1.5rem',
    margin: 0,
  },
  fact: { display: 'flex', flexDirection: 'column', gap: '0.15rem' },
  dt: { fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#777' },
  dd: { margin: 0, fontSize: '0.95rem', color: '#1a1a1a' },
};

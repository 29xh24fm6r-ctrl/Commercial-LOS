import { useDealData } from './DealDataProvider';
import { Badge } from '../shared/Badge';
import { palette, spacing, typography } from '../shared/theme';

export function DealHeader() {
  const { deal } = useDealData();
  return (
    <header style={styles.header} aria-label="Deal header">
      <div style={styles.eyebrowRow}>
        <span style={styles.eyebrow}>Deal</span>
        {deal.stage && <Badge variant="neutral">{deal.stage}</Badge>}
        {deal.status && (
          <Badge variant="neutral" appearance="outline">
            {deal.status}
          </Badge>
        )}
      </div>
      <div style={styles.titleRow}>
        <h1 style={styles.name}>{deal.name}</h1>
        {deal.amount != null && (
          <div style={styles.amountBlock}>
            <div style={styles.amountLabel}>Loan amount</div>
            <div style={styles.amount}>{formatCurrency(deal.amount)}</div>
          </div>
        )}
      </div>
      <dl style={styles.facts}>
        <Fact label="Client" value={deal.clientName} />
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
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: 8,
    padding: `${spacing.xl} ${spacing.xxl}`,
    marginBottom: spacing.lg,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    boxShadow: '0 1px 2px rgba(20, 26, 42, 0.04)',
  },
  eyebrowRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  eyebrow: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.primary,
    fontWeight: typography.weight.semibold,
  },
  titleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.lg,
    flexWrap: 'wrap',
  },
  name: {
    margin: 0,
    fontSize: typography.size.hero,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    letterSpacing: typography.letterSpacing.hero,
    lineHeight: typography.lineHeight.tight,
  },
  amountBlock: {
    textAlign: 'right',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  amountLabel: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  amount: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: typography.letterSpacing.heading,
  },
  facts: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: `${spacing.sm} ${spacing.xl}`,
    margin: 0,
    paddingTop: spacing.sm,
    borderTop: `1px solid ${palette.divider}`,
  },
  fact: { display: 'flex', flexDirection: 'column', gap: 2 },
  dt: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  dd: {
    margin: 0,
    fontSize: typography.size.base,
    color: palette.text,
  },
};

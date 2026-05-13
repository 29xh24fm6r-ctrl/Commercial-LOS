import { useDealData } from './DealDataProvider';
import {
  deriveBlockers,
  type BlockerSignal,
  type BlockerSeverity,
  type BlockerStatus,
} from './blockerRules';

/**
 * Read-only blocker card. Consumes the deal data provider so signals
 * can fold in task and document state without issuing duplicate
 * queries. Deal-only signals still render immediately; task/document
 * signals appear once those child queries resolve.
 */
export function DealBlockers() {
  const { deal, tasks, documents } = useDealData();
  const tasksData = tasks.kind === 'ready' ? tasks.data : undefined;
  const documentsData = documents.kind === 'ready' ? documents.data : undefined;
  const { status, signals, closedDealNote } = deriveBlockers(deal, tasksData, documentsData);
  const palette = STATUS_PALETTE[status];

  return (
    <section
      style={{ ...styles.card, borderTop: `3px solid ${palette.bar}` }}
      aria-labelledby="deal-blockers-heading"
    >
      <header style={styles.header}>
        <h3 id="deal-blockers-heading" style={styles.heading}>
          Deal Blockers
        </h3>
        <span
          style={{
            ...styles.badge,
            background: palette.badgeBg,
            color: palette.badgeFg,
          }}
        >
          {palette.label}
        </span>
      </header>

      {status === 'clear' && (
        <p style={styles.cleanMessage}>
          {closedDealNote ?? 'No blockers detected from authorized deal, task, or document records.'}
        </p>
      )}

      {signals.length > 0 && (
        <ul style={styles.list}>
          {signals.map((s) => (
            <SignalRow key={s.id} signal={s} />
          ))}
        </ul>
      )}

      <footer style={styles.footer}>
        <p style={styles.footerLine}>
          Derived from authorized deal, task, and document records.
        </p>
        <p style={styles.footerLine}>
          Memo, approval, and alert checks will be added later.
        </p>
      </footer>
    </section>
  );
}

function SignalRow({ signal }: { signal: BlockerSignal }) {
  const palette = SEVERITY_PALETTE[signal.severity];
  return (
    <li style={styles.signal}>
      <span
        aria-hidden="true"
        style={{ ...styles.dot, background: palette.dot }}
      />
      <div style={styles.signalBody}>
        <div style={{ ...styles.signalLabel, color: palette.label }}>{signal.label}</div>
        <div style={styles.signalDetail}>{signal.detail}</div>
      </div>
    </li>
  );
}

const STATUS_PALETTE: Record<
  BlockerStatus,
  { label: string; bar: string; badgeBg: string; badgeFg: string }
> = {
  blocked: {
    label: 'Potential blocker',
    bar: '#b00020',
    badgeBg: '#fde7eb',
    badgeFg: '#7a0014',
  },
  'at-risk': {
    label: 'At risk',
    bar: '#a86400',
    badgeBg: '#fff4d6',
    badgeFg: '#6a3f00',
  },
  clear: {
    label: 'Clear',
    bar: '#1e7e34',
    badgeBg: '#e7f4ea',
    badgeFg: '#155724',
  },
};

const SEVERITY_PALETTE: Record<BlockerSeverity, { dot: string; label: string }> = {
  blocked: { dot: '#b00020', label: '#7a0014' },
  'at-risk': { dot: '#a86400', label: '#6a3f00' },
  info: { dot: '#5a6a85', label: '#34405a' },
};

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: 6,
    padding: '1.25rem 1.5rem',
    marginBottom: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
  },
  heading: { margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#222' },
  badge: {
    padding: '0.2rem 0.6rem',
    borderRadius: 999,
    fontSize: '0.78rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  cleanMessage: { margin: 0, color: '#555', fontSize: '0.95rem' },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  signal: { display: 'flex', gap: '0.75rem', alignItems: 'flex-start' },
  dot: {
    flexShrink: 0,
    width: 10,
    height: 10,
    borderRadius: '50%',
    marginTop: 6,
  },
  signalBody: { display: 'flex', flexDirection: 'column', gap: '0.15rem' },
  signalLabel: { fontSize: '0.95rem', fontWeight: 600 },
  signalDetail: { fontSize: '0.9rem', color: '#444' },
  footer: {
    borderTop: '1px solid #f0f0f0',
    paddingTop: '0.65rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
  },
  footerLine: { margin: 0, fontSize: '0.8rem', color: '#888', fontStyle: 'italic' },
};

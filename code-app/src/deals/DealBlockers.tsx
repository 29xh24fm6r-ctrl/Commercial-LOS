import { useDealData } from './DealDataProvider';
import {
  deriveBlockers,
  type BlockerSignal,
  type BlockerSeverity,
  type BlockerStatus,
} from './blockerRules';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge, StatusDot } from '../shared/Badge';
import { palette, severityPalette, spacing, typography, type SeverityKey } from '../shared/theme';

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
  const statusKey = statusToSeverity(status);
  const accent = severityPalette[statusKey].bar;

  return (
    <Card accentColor={accent}>
      <CardHeader
        title="Deal Blockers"
        trailing={<Badge variant={statusKey}>{statusLabel(status)}</Badge>}
      />

      {status === 'clear' && (
        <p style={styles.cleanMessage}>
          {closedDealNote ??
            'No blockers detected from authorized deal, task, or document records.'}
        </p>
      )}

      {signals.length > 0 && (
        <ul style={styles.list}>
          {signals.map((s) => (
            <SignalRow key={s.id} signal={s} />
          ))}
        </ul>
      )}

      <CardFooter>
        <span>Derived from authorized deal, task, and document records.</span>
        <span>Memo, approval, and alert checks will be added later.</span>
      </CardFooter>
    </Card>
  );
}

function SignalRow({ signal }: { signal: BlockerSignal }) {
  const sev = severityToKey(signal.severity);
  const p = severityPalette[sev];
  return (
    <li style={styles.signal}>
      <StatusDot variant={sev} />
      <div style={styles.signalBody}>
        <div style={{ ...styles.signalLabel, color: p.fg }}>{signal.label}</div>
        <div style={styles.signalDetail}>{signal.detail}</div>
      </div>
    </li>
  );
}

function statusToSeverity(s: BlockerStatus): SeverityKey {
  if (s === 'blocked') return 'blocked';
  if (s === 'at-risk') return 'atRisk';
  return 'clear';
}

function severityToKey(s: BlockerSeverity): SeverityKey {
  if (s === 'blocked') return 'blocked';
  if (s === 'at-risk') return 'atRisk';
  return 'info';
}

function statusLabel(s: BlockerStatus): string {
  if (s === 'blocked') return 'Potential blocker';
  if (s === 'at-risk') return 'At risk';
  return 'Clear';
}

const styles: Record<string, React.CSSProperties> = {
  cleanMessage: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.base,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  signal: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'flex-start',
    paddingTop: 6,
  },
  signalBody: { display: 'flex', flexDirection: 'column', gap: 2 },
  signalLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
  },
  signalDetail: {
    fontSize: typography.size.md,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
  },
};

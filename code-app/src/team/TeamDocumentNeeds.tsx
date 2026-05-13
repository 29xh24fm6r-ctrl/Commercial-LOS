import { useMemo } from 'react';
import { useTeamData, type AsyncResult } from './TeamDataProvider';
import { isPastDue, type TeamDocumentRow } from './teamQueries';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { teamStyles, formatDate } from './teamCardChrome';
import { palette, spacing, typography } from '../shared/theme';

interface DocRollup {
  totals: { outstanding: number; received: number; reviewed: number; overdue: number };
  overduePreview: TeamDocumentRow[];
}

const OVERDUE_PREVIEW_LIMIT = 6;

export function TeamDocumentNeeds() {
  const { documents } = useTeamData();
  return (
    <Card>
      <CardHeader title="Team Document Needs" />
      <Body documents={documents} />
    </Card>
  );
}

function Body({ documents }: { documents: AsyncResult<TeamDocumentRow[]> }) {
  const rollup = useMemo<DocRollup | null>(() => {
    if (documents.kind !== 'ready') return null;
    return summarize(documents.data);
  }, [documents]);

  if (documents.kind === 'loading') return <p style={teamStyles.muted}>Loading document needs…</p>;
  if (documents.kind === 'failed')
    return <ErrorBlock title="Could not load document needs" detail={documents.message} />;
  if (!rollup) return null;
  const total = rollup.totals.outstanding + rollup.totals.received + rollup.totals.reviewed;
  if (total === 0)
    return <p style={teamStyles.muted}>No active document items on the team yet.</p>;

  return (
    <>
      <div style={teamStyles.grid}>
        <Stat
          label="Outstanding"
          value={rollup.totals.outstanding.toString()}
          color={rollup.totals.outstanding > 0 ? palette.text : undefined}
        />
        <Stat
          label="Overdue"
          value={rollup.totals.overdue.toString()}
          color={rollup.totals.overdue > 0 ? palette.atRiskFg : undefined}
        />
        <Stat label="Received" value={rollup.totals.received.toString()} />
        <Stat label="Reviewed" value={rollup.totals.reviewed.toString()} />
      </div>
      {rollup.overduePreview.length > 0 && (
        <div style={styles.previewBlock}>
          <h4 style={styles.previewHeading}>Most overdue</h4>
          <ul style={teamStyles.list}>
            {rollup.overduePreview.map((d) => (
              <li key={d.id} style={teamStyles.row}>
                <div style={styles.rowHead}>
                  <span style={styles.docName}>{d.name}</span>
                  <Badge variant="atRisk">Due {formatDate(d.dueDate) ?? '—'}</Badge>
                </div>
                {d.dealName && (
                  <div style={styles.dealHint}>
                    <span style={styles.metaLabel}>Deal:</span> {d.dealName}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <CardFooter>
        <span>Aggregated across all active documents on team deals.</span>
      </CardFooter>
    </>
  );
}

function summarize(docs: TeamDocumentRow[], now: Date = new Date()): DocRollup {
  let outstanding = 0;
  let received = 0;
  let reviewed = 0;
  let overdue = 0;
  const overdueList: TeamDocumentRow[] = [];
  for (const d of docs) {
    if (d.status === 'outstanding') {
      outstanding++;
      if (isPastDue(d.dueDate, now)) {
        overdue++;
        overdueList.push(d);
      }
    } else if (d.status === 'received') received++;
    else if (d.status === 'reviewed') reviewed++;
  }
  overdueList.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });
  return {
    totals: { outstanding, received, reviewed, overdue },
    overduePreview: overdueList.slice(0, OVERDUE_PREVIEW_LIMIT),
  };
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={teamStyles.stat}>
      <div style={teamStyles.statLabel}>{label}</div>
      <div style={{ ...teamStyles.statValue, color: color ?? palette.text }}>{value}</div>
    </div>
  );
}

function ErrorBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={teamStyles.errorBox} role="alert">
      <div style={teamStyles.errorTitle}>{title}</div>
      <div style={teamStyles.errorDetail}>{detail}</div>
      <div style={teamStyles.errorHint}>Refresh to retry.</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  previewBlock: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  previewHeading: {
    margin: 0,
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  rowHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  docName: { fontSize: typography.size.base, fontWeight: typography.weight.medium, color: palette.text },
  dealHint: { fontSize: typography.size.sm, color: palette.textMuted, marginTop: 2 },
  metaLabel: { color: palette.textSubtle },
};

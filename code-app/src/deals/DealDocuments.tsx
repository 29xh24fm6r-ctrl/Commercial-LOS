import { useDealData, type AsyncResult } from './DealDataProvider';
import type {
  DealDocument,
  DealDocumentsResult,
  DocumentStatus,
} from './dealDocumentQueries';
import { Card, CardHeader } from '../shared/Card';
import { Badge, StatusDot } from '../shared/Badge';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

export function DealDocuments() {
  const { documents } = useDealData();
  return (
    <Card>
      <CardHeader title="Documents" subtitle={subtitleFor(documents)} />
      <Body documents={documents} />
    </Card>
  );
}

function subtitleFor(documents: AsyncResult<DealDocumentsResult>): string | undefined {
  if (documents.kind !== 'ready') return undefined;
  const { outstanding, received, reviewed } = documents.data;
  const total = outstanding.length + received.length + reviewed.length;
  if (total === 0) return undefined;
  return `${outstanding.length} outstanding · ${received.length} received · ${reviewed.length} reviewed`;
}

function Body({ documents }: { documents: AsyncResult<DealDocumentsResult> }) {
  if (documents.kind === 'loading') return <p style={styles.muted}>Loading documents…</p>;
  if (documents.kind === 'failed')
    return <ErrorBlock title="Could not load documents" detail={documents.message} />;

  const { outstanding, received, reviewed } = documents.data;
  const total = outstanding.length + received.length + reviewed.length;
  if (total === 0) return <p style={styles.muted}>No documents on this deal yet.</p>;

  return (
    <div style={styles.lists}>
      <Group
        groupLabel="Outstanding"
        documents={outstanding}
        emptyHint="No outstanding documents."
        status="outstanding"
      />
      <Group
        groupLabel="Received"
        documents={received}
        emptyHint="None received yet."
        status="received"
      />
      <Group
        groupLabel="Reviewed"
        documents={reviewed}
        emptyHint="No reviewed documents yet."
        status="reviewed"
      />
    </div>
  );
}

function Group({
  groupLabel,
  documents,
  emptyHint,
  status,
}: {
  groupLabel: string;
  documents: DealDocument[];
  emptyHint: string;
  status: DocumentStatus;
}) {
  return (
    <div style={styles.group}>
      <div style={styles.groupHeaderRow}>
        <h4 style={styles.groupHeading}>{groupLabel}</h4>
        <Badge variant="neutral">{documents.length}</Badge>
      </div>
      {documents.length === 0 ? (
        <p style={styles.muted}>{emptyHint}</p>
      ) : (
        <ul style={styles.list}>
          {documents.map((d) => (
            <DocumentRow key={d.id} doc={d} status={status} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DocumentRow({ doc, status }: { doc: DealDocument; status: DocumentStatus }) {
  const overdue = status === 'outstanding' && isOverdue(doc.dueDate);
  const sev: SeverityKey =
    status === 'reviewed'
      ? 'clear'
      : status === 'received'
        ? 'info'
        : overdue
          ? 'atRisk'
          : 'neutral';

  return (
    <li style={styles.row}>
      <StatusDot variant={sev} />
      <div style={styles.rowBody}>
        <div style={styles.title}>{doc.name}</div>
        <div style={styles.meta}>
          {status === 'outstanding' && (
            <>
              <Meta label="Due" value={formatDate(doc.dueDate)} emphasize={overdue} />
              <Meta label="Requested" value={formatDate(doc.requestDate)} />
            </>
          )}
          {status === 'received' && (
            <>
              <Meta label="Received" value={formatDate(doc.receivedDate)} />
              {doc.uploaded && <Meta label="Source" value="Uploaded" />}
            </>
          )}
          {status === 'reviewed' && (
            <>
              <Meta label="Reviewer" value={doc.reviewer} />
              <Meta label="Received" value={formatDate(doc.receivedDate)} />
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function Meta({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string | undefined;
  emphasize?: boolean;
}) {
  return (
    <span style={styles.metaItem}>
      <span style={styles.metaLabel}>{label}</span>
      <span style={emphasize ? styles.metaValueEmphasis : styles.metaValue}>
        {value ?? '—'}
      </span>
    </span>
  );
}

function ErrorBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={styles.errorBox} role="alert">
      <div style={styles.errorTitle}>{title}</div>
      <div style={styles.errorDetail}>{detail}</div>
      <div style={styles.errorHint}>Refresh to retry.</div>
    </div>
  );
}

function isOverdue(iso: string | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

function formatDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const styles: Record<string, React.CSSProperties> = {
  muted: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.md,
    fontStyle: 'italic',
  },
  lists: { display: 'flex', flexDirection: 'column', gap: spacing.md },
  group: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  groupHeaderRow: { display: 'flex', alignItems: 'center', gap: spacing.xs },
  groupHeading: {
    margin: 0,
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  row: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'flex-start',
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
  },
  rowBody: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 },
  title: { fontSize: typography.size.base, fontWeight: typography.weight.medium, color: palette.text },
  meta: {
    display: 'flex',
    gap: spacing.md,
    flexWrap: 'wrap',
    fontSize: typography.size.sm,
    color: palette.textMuted,
  },
  metaItem: { whiteSpace: 'nowrap', display: 'inline-flex', gap: 4 },
  metaLabel: { color: palette.textSubtle },
  metaValue: { color: palette.text },
  metaValueEmphasis: { color: palette.atRiskFg, fontWeight: typography.weight.semibold },
  errorBox: {
    background: palette.blockedBg,
    border: `1px solid ${palette.blockedBg}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  errorTitle: {
    color: palette.blockedFg,
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.md,
  },
  errorDetail: { color: palette.text, fontSize: typography.size.sm },
  errorHint: { color: palette.textMuted, fontSize: typography.size.xs, fontStyle: 'italic' },
};

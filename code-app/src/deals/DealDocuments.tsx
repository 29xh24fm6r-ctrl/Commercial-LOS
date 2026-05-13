import { useEffect, useState } from 'react';
import {
  loadDealDocuments,
  type DealDocument,
  type DealDocumentsResult,
  type DocumentStatus,
} from './dealDocumentQueries';

interface DealDocumentsProps {
  /** Authorized deal id from BankerDealWorkspace. This component only
   *  mounts after loadDealForBanker resolves to 'ready'. */
  dealId: string;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; result: DealDocumentsResult }
  | { kind: 'failed'; message: string };

/**
 * Read-only document checklist scoped to the current deal. No upload,
 * request, review, approve, or delete actions in this phase. Query
 * fires only on mount after the parent has authorized the deal.
 */
export function DealDocuments({ dealId }: DealDocumentsProps) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadDealDocuments(dealId)
      .then((result) => {
        if (!cancelled) setState({ kind: 'ready', result });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'failed', message });
      });
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  return (
    <section style={styles.card} aria-labelledby="deal-documents-heading">
      <h3 id="deal-documents-heading" style={styles.heading}>
        Documents
      </h3>
      <Body state={state} />
    </section>
  );
}

function Body({ state }: { state: State }) {
  if (state.kind === 'loading') {
    return <p style={styles.muted}>Loading documents…</p>;
  }
  if (state.kind === 'failed') {
    return (
      <div style={styles.errorBox} role="alert">
        <div style={styles.errorTitle}>Could not load documents</div>
        <div style={styles.errorDetail}>{state.message}</div>
        <div style={styles.errorHint}>Refresh to retry.</div>
      </div>
    );
  }

  const { outstanding, received, reviewed } = state.result;
  const total = outstanding.length + received.length + reviewed.length;

  if (total === 0) {
    return <p style={styles.muted}>No documents on this deal yet.</p>;
  }

  return (
    <div style={styles.lists}>
      <Group
        groupLabel={`Outstanding (${outstanding.length})`}
        documents={outstanding}
        emptyHint="No outstanding documents."
        status="outstanding"
      />
      <Group
        groupLabel={`Received (${received.length})`}
        documents={received}
        emptyHint="None received yet."
        status="received"
      />
      <Group
        groupLabel={`Reviewed (${reviewed.length})`}
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
      <h4 style={styles.groupHeading}>{groupLabel}</h4>
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
  const dotColor =
    status === 'reviewed'
      ? '#1e7e34'
      : status === 'received'
        ? '#4a5fc1'
        : overdue
          ? '#a86400'
          : '#5a6a85';

  return (
    <li style={styles.row}>
      <span aria-hidden="true" style={{ ...styles.statusDot, background: dotColor }} />
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
      <span style={styles.metaLabel}>{label}:</span>{' '}
      <span style={emphasize ? styles.metaValueEmphasis : styles.metaValue}>
        {value ?? '—'}
      </span>
    </span>
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
  heading: { margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#222' },
  muted: { margin: 0, color: '#888', fontSize: '0.9rem', fontStyle: 'italic' },
  lists: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  group: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  groupHeading: {
    margin: 0,
    fontSize: '0.78rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#666',
  },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  row: {
    display: 'flex',
    gap: '0.65rem',
    alignItems: 'flex-start',
    padding: '0.6rem 0.7rem',
    background: '#fafafa',
    border: '1px solid #ececec',
    borderRadius: 4,
  },
  statusDot: { flexShrink: 0, width: 10, height: 10, borderRadius: '50%', marginTop: 6 },
  rowBody: { display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1, minWidth: 0 },
  title: { fontSize: '0.92rem', fontWeight: 500, color: '#1a1a1a' },
  meta: { display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.82rem', color: '#666' },
  metaItem: { whiteSpace: 'nowrap' },
  metaLabel: { color: '#888' },
  metaValue: { color: '#444' },
  metaValueEmphasis: { color: '#a86400', fontWeight: 600 },
  errorBox: {
    background: '#fef6f6',
    border: '1px solid #f3d3d3',
    borderRadius: 4,
    padding: '0.65rem 0.85rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
  },
  errorTitle: { color: '#7a0014', fontWeight: 600, fontSize: '0.9rem' },
  errorDetail: { color: '#444', fontSize: '0.85rem' },
  errorHint: { color: '#888', fontSize: '0.8rem', fontStyle: 'italic' },
};

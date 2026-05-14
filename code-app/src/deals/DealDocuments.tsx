import { useState } from 'react';
import { useDealData, type AsyncResult } from './DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import type {
  DealDocument,
  DealDocumentsResult,
  DocumentStatus,
} from './dealDocumentQueries';
import {
  markDocumentReceived,
  markDocumentReviewed,
  requestDocument,
  type MarkDocumentReceivedOutcome,
  type MarkDocumentReviewedOutcome,
  type RequestDocumentOutcome,
} from './documentActions';
import { ReceiveDocumentModal } from './ReceiveDocumentModal';
import { RequestDocumentModal } from './RequestDocumentModal';
import { ReviewDocumentModal } from './ReviewDocumentModal';
import { Card, CardHeader } from '../shared/Card';
import { Badge, StatusDot } from '../shared/Badge';
import {
  PENDING_REVIEW_AT_RISK_DAYS,
  isReceivedDocumentPendingReview,
} from '../shared/workQueue/primitives';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

interface DealDocumentsProps {
  /** Phase 36: read-only manager path — no Request button, no
   *  modal, no writeDisabledReason banner. Defaults to false. */
  readOnly?: boolean;
}

export function DealDocuments({ readOnly = false }: DealDocumentsProps = {}) {
  const { deal, documents, refresh } = useDealData();
  const banker = useOptionalBanker();
  const [pendingRequestDoc, setPendingRequestDoc] = useState<DealDocument | null>(
    null,
  );
  const [pendingReceiveDoc, setPendingReceiveDoc] = useState<DealDocument | null>(
    null,
  );
  const [pendingReviewDoc, setPendingReviewDoc] = useState<DealDocument | null>(
    null,
  );

  async function handleRequestConfirm(note: string): Promise<RequestDocumentOutcome> {
    if (!pendingRequestDoc || !banker?.systemUserId) {
      return { kind: 'unknown', message: 'Cannot submit: missing document or system user id.' };
    }
    const outcome = await requestDocument({
      documentId: pendingRequestDoc.id,
      documentName: pendingRequestDoc.name,
      // dealId is the ALREADY-AUTHORIZED deal id from DealDataProvider —
      // never trusted from the route param directly.
      dealId: deal.id,
      priorRequestDate: pendingRequestDoc.requestDate,
      systemUserId: banker.systemUserId,
      requestNote: note,
    });
    refresh('after-document-request');
    return outcome;
  }

  async function handleReceiveConfirm(
    note: string,
  ): Promise<MarkDocumentReceivedOutcome> {
    if (!pendingReceiveDoc || !banker?.systemUserId) {
      return { kind: 'unknown', message: 'Cannot submit: missing document or system user id.' };
    }
    const outcome = await markDocumentReceived({
      documentId: pendingReceiveDoc.id,
      documentName: pendingReceiveDoc.name,
      dealId: deal.id,
      systemUserId: banker.systemUserId,
      receiveNote: note,
    });
    refresh('after-document-receive');
    return outcome;
  }

  async function handleReviewConfirm(
    note: string,
  ): Promise<MarkDocumentReviewedOutcome> {
    if (!pendingReviewDoc || !banker?.systemUserId) {
      return { kind: 'unknown', message: 'Cannot submit: missing document or system user id.' };
    }
    const outcome = await markDocumentReviewed({
      documentId: pendingReviewDoc.id,
      documentName: pendingReviewDoc.name,
      dealId: deal.id,
      systemUserId: banker.systemUserId,
      reviewerName: banker.fullName,
      reviewNote: note,
    });
    refresh('after-document-review');
    return outcome;
  }

  const canWrite = !readOnly && !!banker?.systemUserId;

  return (
    <>
      <Card>
        <CardHeader title="Documents" subtitle={subtitleFor(documents)} />
        {!readOnly && banker?.writeDisabledReason && (
          <p style={styles.writeDisabledBanner} role="status">
            <strong>Request disabled:</strong> {banker.writeDisabledReason}
          </p>
        )}
        <Body
          documents={documents}
          canWrite={canWrite}
          onRequest={(doc) => setPendingRequestDoc(doc)}
          onReceive={(doc) => setPendingReceiveDoc(doc)}
          onReview={(doc) => setPendingReviewDoc(doc)}
        />
      </Card>
      {!readOnly && pendingRequestDoc && (
        <RequestDocumentModal
          doc={pendingRequestDoc}
          onConfirm={handleRequestConfirm}
          onClose={() => setPendingRequestDoc(null)}
        />
      )}
      {!readOnly && pendingReceiveDoc && (
        <ReceiveDocumentModal
          doc={pendingReceiveDoc}
          onConfirm={handleReceiveConfirm}
          onClose={() => setPendingReceiveDoc(null)}
        />
      )}
      {!readOnly && pendingReviewDoc && banker?.fullName && (
        <ReviewDocumentModal
          doc={pendingReviewDoc}
          reviewerName={banker.fullName}
          onConfirm={handleReviewConfirm}
          onClose={() => setPendingReviewDoc(null)}
        />
      )}
    </>
  );
}

function subtitleFor(documents: AsyncResult<DealDocumentsResult>): string | undefined {
  if (documents.kind !== 'ready') return undefined;
  const { outstanding, received, reviewed } = documents.data;
  const total = outstanding.length + received.length + reviewed.length;
  if (total === 0) return undefined;
  // Phase 54: count of received documents that have sat unreviewed
  // past the at-risk threshold. Displayed only when non-zero so the
  // subtitle stays calm under normal load.
  const nowMs = Date.now();
  const pendingReviewCount = received.filter((d) =>
    isReceivedDocumentPendingReview({
      receivedDate: d.receivedDate,
      reviewer: d.reviewer,
      nowMs,
    }),
  ).length;
  const base = `${outstanding.length} outstanding · ${received.length} received · ${reviewed.length} reviewed`;
  return pendingReviewCount > 0
    ? `${base} · ${pendingReviewCount} may require review`
    : base;
}

function Body({
  documents,
  canWrite,
  onRequest,
  onReceive,
  onReview,
}: {
  documents: AsyncResult<DealDocumentsResult>;
  canWrite: boolean;
  onRequest: (doc: DealDocument) => void;
  onReceive: (doc: DealDocument) => void;
  onReview: (doc: DealDocument) => void;
}) {
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
        canWrite={canWrite}
        onRequest={onRequest}
        onReceive={onReceive}
        onReview={onReview}
      />
      <Group
        groupLabel="Received"
        documents={received}
        emptyHint="None received yet."
        status="received"
        canWrite={canWrite}
        onRequest={onRequest}
        onReceive={onReceive}
        onReview={onReview}
      />
      <Group
        groupLabel="Reviewed"
        documents={reviewed}
        emptyHint="No reviewed documents yet."
        status="reviewed"
        canWrite={false}
        onRequest={onRequest}
        onReceive={onReceive}
        onReview={onReview}
      />
    </div>
  );
}

function Group({
  groupLabel,
  documents,
  emptyHint,
  status,
  canWrite,
  onRequest,
  onReceive,
  onReview,
}: {
  groupLabel: string;
  documents: DealDocument[];
  emptyHint: string;
  status: DocumentStatus;
  canWrite: boolean;
  onRequest: (doc: DealDocument) => void;
  onReceive: (doc: DealDocument) => void;
  onReview: (doc: DealDocument) => void;
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
            <DocumentRow
              key={d.id}
              doc={d}
              status={status}
              canWrite={canWrite}
              onRequest={onRequest}
              onReceive={onReceive}
              onReview={onReview}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function DocumentRow({
  doc,
  status,
  canWrite,
  onRequest,
  onReceive,
  onReview,
}: {
  doc: DealDocument;
  status: DocumentStatus;
  canWrite: boolean;
  onRequest: (doc: DealDocument) => void;
  onReceive: (doc: DealDocument) => void;
  onReview: (doc: DealDocument) => void;
}) {
  const overdue = status === 'outstanding' && isOverdue(doc.dueDate);
  const sev: SeverityKey =
    status === 'reviewed'
      ? 'clear'
      : status === 'received'
        ? 'info'
        : overdue
          ? 'atRisk'
          : 'neutral';
  // Phase 22: Request action shows on outstanding rows only. canWrite
  // is the gate; the Group already restricts it to the Outstanding
  // group so received/reviewed rows can never show the button.
  // Phase 51: Mark-received button shows on the same outstanding rows.
  // Phase 55: Mark-reviewed button shows on received rows.
  const showRequest = canWrite && status === 'outstanding';
  const showReceive = canWrite && status === 'outstanding';
  const showReview = canWrite && status === 'received';

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
              {isReceivedDocumentPendingReview({
                receivedDate: doc.receivedDate,
                reviewer: doc.reviewer,
                nowMs: Date.now(),
              }) && (
                <Badge
                  variant="atRisk"
                  appearance="outline"
                  // Phase 57: shortened the visible text to "Pending
                  // review"; the threshold detail moves to the
                  // title/aria-label for screen readers + tooltip.
                  title={`Received ${PENDING_REVIEW_AT_RISK_DAYS}+ days ago and not yet reviewed.`}
                >
                  Pending review
                </Badge>
              )}
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
      {(showRequest || showReceive || showReview) && (
        <div style={styles.rowActions}>
          {showRequest && (
            <button
              type="button"
              onClick={() => onRequest(doc)}
              style={styles.requestButton}
              aria-label={`Request document ${doc.name}`}
            >
              {doc.requestDate ? 'Re-request' : 'Request'}
            </button>
          )}
          {showReceive && (
            <button
              type="button"
              onClick={() => onReceive(doc)}
              style={styles.receiveButton}
              aria-label={`Mark document ${doc.name} received`}
            >
              Mark received
            </button>
          )}
          {showReview && (
            <button
              type="button"
              onClick={() => onReview(doc)}
              style={styles.reviewButton}
              aria-label={`Mark document ${doc.name} reviewed`}
            >
              Mark reviewed
            </button>
          )}
        </div>
      )}
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
  writeDisabledBanner: {
    margin: 0,
    padding: `${spacing.xs} ${spacing.md}`,
    background: palette.atRiskBg,
    color: palette.atRiskFg,
    fontSize: typography.size.sm,
    border: `1px solid ${palette.atRiskBg}`,
    borderRadius: radius.sm,
    lineHeight: typography.lineHeight.snug,
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
  rowActions: {
    // Phase 57: switched from column to row + wrap. On wide rows
    // (Request + Mark received on outstanding) the two buttons sit
    // side-by-side; on narrow rows they wrap. Saves vertical space
    // and keeps the row body compact.
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
    flexShrink: 0,
    alignSelf: 'center',
    justifyContent: 'flex-end',
  },
  requestButton: {
    background: palette.primary,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
  },
  receiveButton: {
    background: palette.surface,
    color: palette.primary,
    border: `1px solid ${palette.primary}`,
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
  },
  reviewButton: {
    background: palette.surface,
    color: palette.primary,
    border: `1px solid ${palette.primary}`,
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
  },
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

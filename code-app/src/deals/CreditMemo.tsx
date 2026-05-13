import { useDealData, type AsyncResult } from './DealDataProvider';
import type {
  CreditMemoData,
  CreditMemoSummary,
  CreditMemoSectionItem,
  CreditMemoStatusKey,
  CreditMemoReviewStatusKey,
} from './creditMemoQueries';

/**
 * Read-only credit memo card. Shows existing cr664_CreditMemo1 records
 * (latest first) and cr664_CreditMemoDraftSection drafts for the
 * current deal. No generation, edit, or export actions — those are
 * later phases. Consumes the deal data provider; no fetch of its own.
 */
export function CreditMemo() {
  const { creditMemo } = useDealData();
  return (
    <section style={styles.card} aria-labelledby="credit-memo-heading">
      <h3 id="credit-memo-heading" style={styles.heading}>
        Credit Memo
      </h3>
      <Body creditMemo={creditMemo} />
    </section>
  );
}

function Body({ creditMemo }: { creditMemo: AsyncResult<CreditMemoData> }) {
  if (creditMemo.kind === 'loading') {
    return <p style={styles.muted}>Loading credit memo…</p>;
  }
  if (creditMemo.kind === 'failed') {
    return (
      <div style={styles.errorBox} role="alert">
        <div style={styles.errorTitle}>Could not load credit memo</div>
        <div style={styles.errorDetail}>{creditMemo.message}</div>
        <div style={styles.errorHint}>Refresh to retry.</div>
      </div>
    );
  }

  const { memos, sections } = creditMemo.data;

  if (memos.length === 0 && sections.length === 0) {
    return <p style={styles.muted}>No credit memo exists yet.</p>;
  }

  return (
    <div style={styles.body}>
      {memos.length > 0 && (
        <div style={styles.group}>
          <h4 style={styles.groupHeading}>Memos ({memos.length})</h4>
          <ul style={styles.list}>
            {memos.map((m) => (
              <MemoRow key={m.id} memo={m} />
            ))}
          </ul>
        </div>
      )}
      {sections.length > 0 && (
        <div style={styles.group}>
          <h4 style={styles.groupHeading}>Section drafts ({sections.length})</h4>
          <ul style={styles.list}>
            {sections.map((s) => (
              <SectionRow key={s.id} section={s} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MemoRow({ memo }: { memo: CreditMemoSummary }) {
  const palette = MEMO_STATUS_PALETTE[memo.statusKey ?? 'draft'];
  return (
    <li style={styles.row}>
      <div style={styles.rowHeader}>
        <div style={styles.rowTitleBlock}>
          <div style={styles.rowTitle}>{memo.name}</div>
          <div style={styles.rowSubtitle}>
            <span>{memo.memoType}</span>
            <span style={styles.dotSep}>·</span>
            <span>v{memo.version}</span>
            <span style={styles.dotSep}>·</span>
            <span>Generated {formatDate(memo.generatedAt) ?? '—'}</span>
          </div>
        </div>
        <div style={styles.badgeRow}>
          {memo.status && (
            <span
              style={{
                ...styles.badge,
                background: palette.bg,
                color: palette.fg,
              }}
            >
              {memo.status}
            </span>
          )}
          {memo.borrowerSafe && (
            <span style={styles.borrowerSafeBadge}>Borrower-safe</span>
          )}
        </div>
      </div>
      {memo.textPreview && <p style={styles.preview}>{memo.textPreview}</p>}
    </li>
  );
}

function SectionRow({ section }: { section: CreditMemoSectionItem }) {
  const palette = REVIEW_STATUS_PALETTE[section.reviewStatusKey ?? 'Pending'];
  return (
    <li style={styles.row}>
      <div style={styles.rowHeader}>
        <div style={styles.rowTitleBlock}>
          <div style={styles.rowTitle}>{section.sectionLabel}</div>
          <div style={styles.rowSubtitle}>
            <span style={styles.metaLabel}>Key:</span> {section.sectionKey}
            <span style={styles.dotSep}>·</span>
            <span>
              Last generated {formatDate(section.lastGeneratedAt) ?? '—'}
            </span>
          </div>
        </div>
        {section.reviewStatus && (
          <div style={styles.badgeRow}>
            <span
              style={{
                ...styles.badge,
                background: palette.bg,
                color: palette.fg,
              }}
            >
              {section.reviewStatus}
            </span>
          </div>
        )}
      </div>
      {section.textPreview && <p style={styles.preview}>{section.textPreview}</p>}
    </li>
  );
}

const MEMO_STATUS_PALETTE: Record<CreditMemoStatusKey, { bg: string; fg: string }> = {
  draft: { bg: '#eef0f4', fg: '#404655' },
  final: { bg: '#e7f4ea', fg: '#155724' },
  stale: { bg: '#fff4d6', fg: '#6a3f00' },
};

const REVIEW_STATUS_PALETTE: Record<CreditMemoReviewStatusKey, { bg: string; fg: string }> = {
  Pending: { bg: '#eef0f4', fg: '#404655' },
  Reviewed: { bg: '#e7f4ea', fg: '#155724' },
  NeedsChanges: { bg: '#fff4d6', fg: '#6a3f00' },
};

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
  body: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  group: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  groupHeading: {
    margin: 0,
    fontSize: '0.78rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#666',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  row: {
    padding: '0.7rem 0.85rem',
    background: '#fafafa',
    border: '1px solid #ececec',
    borderRadius: 4,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.45rem',
  },
  rowHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '0.75rem',
  },
  rowTitleBlock: { display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1, minWidth: 0 },
  rowTitle: { fontSize: '0.95rem', fontWeight: 600, color: '#1a1a1a' },
  rowSubtitle: {
    fontSize: '0.82rem',
    color: '#666',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.25rem',
    alignItems: 'center',
  },
  dotSep: { color: '#bbb' },
  metaLabel: { color: '#888' },
  badgeRow: { display: 'flex', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap' },
  badge: {
    padding: '0.15rem 0.55rem',
    borderRadius: 999,
    fontSize: '0.72rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  borrowerSafeBadge: {
    padding: '0.15rem 0.55rem',
    borderRadius: 999,
    fontSize: '0.72rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    background: '#eef3ff',
    color: '#3949ab',
  },
  preview: {
    margin: 0,
    fontSize: '0.88rem',
    color: '#444',
    lineHeight: 1.45,
    whiteSpace: 'pre-wrap',
  },
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

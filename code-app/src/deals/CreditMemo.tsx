import { useCallback, useState } from 'react';
import { useDealData, type AsyncResult } from './DealDataProvider';
import { useBanker } from '../banker/BankerContext';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import type {
  CreditMemoData,
  CreditMemoSummary,
  CreditMemoSectionItem,
  CreditMemoStatusKey,
  CreditMemoReviewStatusKey,
} from './creditMemoQueries';
import { CreditMemoDraftModal } from './CreditMemoDraftModal';
import {
  saveCreditMemoDraft,
  type SaveCreditMemoDraftOutcome,
  type SaveCreditMemoDraftSection,
} from './creditMemoActions';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

export function CreditMemo() {
  const { deal, tasks, documents, creditMemo, refresh } = useDealData();
  const banker = useBanker();
  const bootstrap = useBootstrap();
  const [showDraft, setShowDraft] = useState(false);

  // Phase 24 + 25: Generate Draft Preview is always available. The
  // governed Save Draft handler is wired only when banker writes are
  // currently allowed (Dataverse systemuser resolved). When writes
  // are blocked, the modal stays in Phase-24 local-preview mode.
  const tasksData = tasks.kind === 'ready' ? tasks.data : undefined;
  const documentsData = documents.kind === 'ready' ? documents.data : undefined;
  const memosData = creditMemo.kind === 'ready' ? creditMemo.data : undefined;
  const canWrite = !!banker.systemUserId;

  const handleSave = useCallback(
    async (args: {
      memoBody: string;
      saveNote: string;
      sections: SaveCreditMemoDraftSection[];
    }): Promise<SaveCreditMemoDraftOutcome> => {
      if (!banker.systemUserId) {
        return {
          kind: 'unknown',
          message: 'Cannot save: no Dataverse systemuser resolved for the current banker.',
        };
      }
      // Next version stamp = max existing version + 1, or 1 if none.
      const nextVersion =
        (memosData?.memos.reduce((max, m) => Math.max(max, m.version ?? 0), 0) ?? 0) + 1;
      const memoName = `${deal.name} — Draft v${nextVersion}`;
      const outcome = await saveCreditMemoDraft({
        // dealId is the AUTHORIZED deal id from DealDataProvider —
        // never trust the route param.
        dealId: deal.id,
        dealName: deal.name,
        workspaceId: bootstrap.workspaceId,
        systemUserId: banker.systemUserId,
        memoName,
        memoType: 'Banker draft',
        memoBody: args.memoBody,
        saveNote: args.saveNote,
        sections: args.sections,
        version: nextVersion,
      });
      refresh('after-credit-memo-draft-saved');
      return outcome;
    },
    [banker.systemUserId, bootstrap.workspaceId, deal.id, deal.name, memosData, refresh],
  );

  return (
    <>
      <Card>
        <CardHeader
          title="Credit Memo"
          subtitle={subtitleFor(creditMemo)}
          trailing={
            <button
              type="button"
              onClick={() => setShowDraft(true)}
              style={styles.draftButton}
              aria-label="Generate credit memo draft preview"
            >
              Generate Draft Preview
            </button>
          }
        />
        {banker.writeDisabledReason && (
          <p style={styles.writeDisabledBanner} role="status">
            <strong>Save disabled:</strong> {banker.writeDisabledReason} Generation and
            copy remain available; Save Draft requires a resolvable Dataverse user.
          </p>
        )}
        <Body creditMemo={creditMemo} />
      </Card>
      {showDraft && (
        <CreditMemoDraftModal
          deal={deal}
          tasks={tasksData}
          documents={documentsData}
          existingMemos={memosData}
          onClose={() => setShowDraft(false)}
          onSave={canWrite ? handleSave : undefined}
        />
      )}
    </>
  );
}

function subtitleFor(creditMemo: AsyncResult<CreditMemoData>): string | undefined {
  if (creditMemo.kind !== 'ready') return undefined;
  const { memos, sections } = creditMemo.data;
  if (memos.length === 0 && sections.length === 0) return undefined;
  const parts: string[] = [];
  if (memos.length) parts.push(`${memos.length} memo${memos.length === 1 ? '' : 's'}`);
  if (sections.length)
    parts.push(`${sections.length} section draft${sections.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function Body({ creditMemo }: { creditMemo: AsyncResult<CreditMemoData> }) {
  if (creditMemo.kind === 'loading')
    return <p style={styles.muted}>Loading credit memo…</p>;
  if (creditMemo.kind === 'failed')
    return <ErrorBlock title="Could not load credit memo" detail={creditMemo.message} />;

  const { memos, sections } = creditMemo.data;
  if (memos.length === 0 && sections.length === 0) {
    return <p style={styles.muted}>No credit memo exists yet.</p>;
  }

  return (
    <div style={styles.body}>
      {memos.length > 0 && (
        <div style={styles.group}>
          <div style={styles.groupHeaderRow}>
            <h4 style={styles.groupHeading}>Memos</h4>
            <Badge variant="neutral">{memos.length}</Badge>
          </div>
          <ul style={styles.list}>
            {memos.map((m) => (
              <MemoRow key={m.id} memo={m} />
            ))}
          </ul>
        </div>
      )}
      {sections.length > 0 && (
        <div style={styles.group}>
          <div style={styles.groupHeaderRow}>
            <h4 style={styles.groupHeading}>Section drafts</h4>
            <Badge variant="neutral">{sections.length}</Badge>
          </div>
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
            <Badge variant={memoStatusToSeverity(memo.statusKey)}>{memo.status}</Badge>
          )}
          {memo.borrowerSafe && (
            <Badge variant="info" appearance="outline">
              Borrower-safe
            </Badge>
          )}
        </div>
      </div>
      {memo.textPreview && <p style={styles.preview}>{memo.textPreview}</p>}
    </li>
  );
}

function SectionRow({ section }: { section: CreditMemoSectionItem }) {
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
            <Badge variant={reviewStatusToSeverity(section.reviewStatusKey)}>
              {section.reviewStatus}
            </Badge>
          </div>
        )}
      </div>
      {section.textPreview && <p style={styles.preview}>{section.textPreview}</p>}
    </li>
  );
}

function memoStatusToSeverity(key: CreditMemoStatusKey | undefined): SeverityKey {
  if (key === 'final') return 'clear';
  if (key === 'stale') return 'atRisk';
  return 'neutral';
}

function reviewStatusToSeverity(key: CreditMemoReviewStatusKey | undefined): SeverityKey {
  if (key === 'Reviewed') return 'clear';
  if (key === 'NeedsChanges') return 'atRisk';
  return 'neutral';
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
  body: { display: 'flex', flexDirection: 'column', gap: spacing.md },
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
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  rowHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  rowTitleBlock: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 },
  rowTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  rowSubtitle: {
    fontSize: typography.size.sm,
    color: palette.textMuted,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    alignItems: 'center',
  },
  dotSep: { color: palette.textSubtle },
  metaLabel: { color: palette.textSubtle },
  badgeRow: { display: 'flex', gap: spacing.xxs, flexShrink: 0, flexWrap: 'wrap' },
  preview: {
    margin: 0,
    fontSize: typography.size.md,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.normal,
    whiteSpace: 'pre-wrap',
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
  draftButton: {
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
};

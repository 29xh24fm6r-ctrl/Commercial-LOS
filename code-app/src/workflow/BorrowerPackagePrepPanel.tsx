import { useDealData } from '../deals/DealDataProvider';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import { buildBorrowerPackageDraft } from './borrowerPackagePrep';
import { deriveLoanWorkflowState } from './deriveLoanWorkflowState';

export function BorrowerPackagePrepPanel() {
  const { deal, tasks, documents, creditMemo } = useDealData();
  const workflow = deriveLoanWorkflowState({
    deal,
    tasks: tasks.kind === 'ready' ? tasks.data : undefined,
    documents: documents.kind === 'ready' ? documents.data : undefined,
    creditMemo: creditMemo.kind === 'ready' ? creditMemo.data : undefined,
    tasksUnavailable: tasks.kind !== 'ready',
    documentsUnavailable: documents.kind !== 'ready',
    creditMemoUnavailable: creditMemo.kind !== 'ready',
  });
  const draft = buildBorrowerPackageDraft({
    borrowerName: deal.clientName,
    workflow,
  });

  return (
    <Card>
      <CardHeader
        title="Borrower Package Prep"
        subtitle="Review-only package text. No email, SMS, Outlook, or external send is rendered."
        trailing={<Badge variant={draft.status === 'ready_to_review' ? 'atRisk' : 'clear'}>{draft.status.replace(/_/g, ' ')}</Badge>}
      />
      <div style={styles.output} aria-label="Prepared borrower package text">
        <div style={styles.subject}>{draft.subject}</div>
        <pre style={styles.body}>{draft.body}</pre>
      </div>
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  output: {
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    background: palette.surfaceAlt,
    padding: spacing.md,
  },
  subject: {
    fontWeight: typography.weight.semibold,
    marginBottom: spacing.sm,
    color: palette.text,
  },
  body: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    fontFamily: typography.family,
    fontSize: typography.size.sm,
    color: palette.textMuted,
  },
};

import { useMemo } from 'react';
import { useDealData } from '../deals/DealDataProvider';
import { Badge } from '../shared/Badge';
import { Card, CardFooter, CardHeader } from '../shared/Card';
import { palette, severityPalette, spacing, typography } from '../shared/theme';
import { deriveLoanWorkflowState } from './deriveLoanWorkflowState';
import { GenerateWorkflowChecklistButton } from './GenerateWorkflowChecklistButton';
import { GenerateWorkflowTasksButton } from './GenerateWorkflowTasksButton';
import { AdvanceWorkflowStageButton } from './AdvanceWorkflowStageButton';

export function LoanWorkflowCommandCenter() {
  const { deal, tasks, documents, creditMemo } = useDealData();
  const workflow = useMemo(
    () =>
      deriveLoanWorkflowState({
        deal,
        tasks: tasks.kind === 'ready' ? tasks.data : undefined,
        documents: documents.kind === 'ready' ? documents.data : undefined,
        creditMemo: creditMemo.kind === 'ready' ? creditMemo.data : undefined,
        tasksUnavailable: tasks.kind !== 'ready',
        documentsUnavailable: documents.kind !== 'ready',
        creditMemoUnavailable: creditMemo.kind !== 'ready',
      }),
    [deal, tasks, documents, creditMemo],
  );
  const tone = workflow.readiness.status === 'blocked'
    ? 'blocked'
    : workflow.readiness.status === 'at-risk'
      ? 'atRisk'
      : 'clear';

  return (
    <Card accentColor={severityPalette[tone].bar}>
      <CardHeader
        title="Loan Workflow Command Center"
        subtitle="Original OGB workflow spine derived from authorized deal evidence."
        trailing={<Badge variant={tone}>{workflow.readiness.status}</Badge>}
      />
      <div style={styles.grid}>
        <section style={styles.panel}>
          <h4 style={styles.heading}>Current stage</h4>
          <p style={styles.value}>{workflow.currentStage.label}</p>
          {workflow.currentStageSource === 'defaulted' && (
            <p style={styles.muted}>Live stage was unavailable or unmapped, so intake is shown as the safe default.</p>
          )}
        </section>
        <section style={styles.panel}>
          <h4 style={styles.heading}>Next permitted stage</h4>
          <p style={styles.value}>
            {workflow.nextPermittedStages.map((stage) => stage.label).join(', ') || 'None configured'}
          </p>
        </section>
        <section style={styles.panel}>
          <h4 style={styles.heading}>Credit readiness</h4>
          <p style={styles.value}>{workflow.readiness.creditBlockers.length === 0 ? 'No blockers projected' : `${workflow.readiness.creditBlockers.length} blocker(s)`}</p>
        </section>
        <section style={styles.panel}>
          <h4 style={styles.heading}>Closing readiness</h4>
          <p style={styles.value}>{workflow.readiness.closingBlockers.length === 0 ? 'No blockers projected' : `${workflow.readiness.closingBlockers.length} blocker(s)`}</p>
        </section>
      </div>
      <Section title="Blockers" items={workflow.readiness.blockers.map((item) => item.label)} empty="No blockers projected from loaded evidence." />
      <Section title="Missing fields" items={workflow.readiness.missingFields.map((item) => item.label)} empty="No required fields missing for this stage." />
      <Section title="Required documents" items={workflow.readiness.missingDocuments.map((item) => item.label)} empty="No required documents missing for this stage." />
      <Section title="Required tasks" items={workflow.readiness.missingTasks.map((item) => item.label)} empty="No required tasks missing for this stage." />
      <div style={styles.actions} aria-label="Workflow explicit actions">
        <GenerateWorkflowChecklistButton workflow={workflow} dealId={deal.id} />
        <GenerateWorkflowTasksButton workflow={workflow} />
        <AdvanceWorkflowStageButton workflow={workflow} />
      </div>
      <div style={styles.nextAction}>
        <strong>Next best safe action:</strong> {workflow.nextBestSafeAction}
      </div>
      <CardFooter>
        <span>Read/write controls fail closed unless governed dependencies are explicitly wired.</span>
        <span>No borrower send or external platform call is performed by this command center.</span>
      </CardFooter>
    </Card>
  );
}

function Section({ title, items, empty }: { title: string; items: readonly string[]; empty: string }) {
  return (
    <section>
      <h4 style={styles.heading}>{title}</h4>
      {items.length > 0 ? (
        <ul style={styles.list}>{items.map((item) => <li key={item}>{item}</li>)}</ul>
      ) : (
        <p style={styles.muted}>{empty}</p>
      )}
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: spacing.md,
  },
  panel: {
    border: `1px solid ${palette.border}`,
    background: palette.surfaceAlt,
    padding: spacing.md,
    borderRadius: 6,
  },
  heading: {
    margin: `0 0 ${spacing.xs}`,
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
  },
  value: { margin: 0, color: palette.text, fontWeight: typography.weight.semibold },
  muted: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm },
  list: { margin: 0, paddingLeft: spacing.lg, color: palette.textMuted },
  actions: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: spacing.md,
  },
  nextAction: {
    color: palette.text,
    background: palette.infoBg,
    padding: spacing.md,
    borderRadius: 6,
  },
};

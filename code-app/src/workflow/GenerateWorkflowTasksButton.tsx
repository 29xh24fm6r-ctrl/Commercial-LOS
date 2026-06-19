import { useState } from 'react';
import { useOptionalBanker } from '../banker/BankerContext';
import { useDealData } from '../deals/DealDataProvider';
import { generateWorkflowTasks, type WorkflowGenerationOutcome } from './workflowGenerationActions';
import { getLoanWorkflowTemplate } from './loanWorkflowTemplates';
import type { LoanWorkflowState } from './loanWorkflowTypes';
import { palette, radius, spacing, typography } from '../shared/theme';

export function GenerateWorkflowTasksButton({ workflow }: { workflow: LoanWorkflowState }) {
  const banker = useOptionalBanker();
  const { tasks, refresh } = useDealData();
  const [outcome, setOutcome] = useState<WorkflowGenerationOutcome | null>(null);
  const existingNames = tasks.kind === 'ready'
    ? [...tasks.data.open, ...tasks.data.completed].map((task) => task.title)
    : [];

  async function handleClick() {
    const result = await generateWorkflowTasks({
      authorized: !!banker?.systemUserId,
      template: getLoanWorkflowTemplate(workflow.currentStage.id),
      existingNames,
    });
    setOutcome(result);
    if (result.kind === 'success') refresh('tasks');
  }

  return (
    <div style={styles.wrap}>
      <button type="button" onClick={handleClick} style={styles.button}>
        Generate tasks
      </button>
      {outcome && <span role="status" style={styles.status}>{outcome.detail}</span>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  button: {
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    background: palette.surface,
    color: palette.text,
    padding: `${spacing.xs} ${spacing.sm}`,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
  },
  status: { color: palette.textMuted, fontSize: typography.size.sm },
};

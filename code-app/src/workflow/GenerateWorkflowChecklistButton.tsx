import type { WorkflowChecklistGenerationDeps } from './workflowGenerationActions';
import type { LoanWorkflowState } from './loanWorkflowTypes';
import { palette, spacing, typography } from '../shared/theme';

const AUTOMATIC_NOTICE =
  'Document requirements are synchronized automatically from the governed workflow template.';

export interface GenerateWorkflowChecklistButtonProps {
  readonly workflow: LoanWorkflowState;
  readonly dealId: string;
  /**
   * Retained temporarily for source compatibility with older call sites. Manual
   * checklist generation is retired and this dependency is never invoked.
   */
  readonly deps?: WorkflowChecklistGenerationDeps;
}

/**
 * Compatibility component for the retired manual-generation action.
 *
 * Checklist rows are maintained by the governed lifecycle synchronizer. Keeping
 * this component non-interactive prevents operators from creating a second,
 * divergent population from the same workflow template.
 */
export function GenerateWorkflowChecklistButton(_props: GenerateWorkflowChecklistButtonProps) {
  return (
    <div style={styles.wrap}>
      <span role="status" style={styles.status} data-checklist-generation-automatic>
        {AUTOMATIC_NOTICE}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  status: { color: palette.textMuted, fontSize: typography.size.sm },
};

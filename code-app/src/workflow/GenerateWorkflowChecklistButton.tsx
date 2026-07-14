import { useState } from 'react';
import { useOptionalBanker } from '../banker/BankerContext';
import { useDealData } from '../deals/DealDataProvider';
import {
  generateWorkflowChecklist,
  type WorkflowChecklistGenerationDeps,
  type WorkflowGenerationOutcome,
} from './workflowGenerationActions';
import { getLoanWorkflowTemplate } from './loanWorkflowTemplates';
import type { LoanWorkflowState } from './loanWorkflowTypes';
import { createChecklistWriteDependency } from './checklistWriteDependency';
import { buildLiveChecklistRowTransport, buildLiveChecklistAuditSink } from '../deals/checklistLiveWriteDeps';
import { newCorrelationId } from '../shared/governance/correlationId';
import { palette, radius, spacing, typography } from '../shared/theme';

export interface GenerateWorkflowChecklistButtonProps {
  readonly workflow: LoanWorkflowState;
  readonly dealId: string;
  /** Test-only override; production defaults to the live write dependency. */
  readonly deps?: WorkflowChecklistGenerationDeps;
}

export function GenerateWorkflowChecklistButton({ workflow, dealId, deps }: GenerateWorkflowChecklistButtonProps) {
  const banker = useOptionalBanker();
  const { documents, refresh } = useDealData();
  const [outcome, setOutcome] = useState<WorkflowGenerationOutcome | null>(null);
  const existingNames = documents.kind === 'ready'
    ? [...documents.data.outstanding, ...documents.data.received, ...documents.data.reviewed].map((doc) => doc.name)
    : [];

  async function handleClick() {
    const authorized = !!banker?.systemUserId;
    const resolvedDeps =
      deps ??
      createChecklistWriteDependency({
        authorized,
        dealId,
        correlationId: newCorrelationId('checklist'),
        transport: buildLiveChecklistRowTransport(),
        auditSink: buildLiveChecklistAuditSink(banker?.email),
      });
    const result = await generateWorkflowChecklist({
      authorized,
      template: getLoanWorkflowTemplate(workflow.currentStage.id),
      existingNames,
      deps: resolvedDeps,
    });
    setOutcome(result);
    if (result.kind === 'success') refresh('documents');
  }

  return (
    <div style={styles.wrap}>
      <button type="button" onClick={handleClick} style={styles.button}>
        Generate checklist
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

import { describe, expect, it } from 'vitest';
import { getLoanWorkflowTemplate } from './loanWorkflowTemplates';
import { generateWorkflowChecklist, generateWorkflowTasks } from './workflowGenerationActions';

describe('workflow generation actions', () => {
  it('fails closed for checklist generation when no governed dependency is wired', async () => {
    const result = await generateWorkflowChecklist({
      authorized: true,
      template: getLoanWorkflowTemplate('INTAKE'),
      existingNames: [],
    });
    expect(result.kind).toBe('dependency_not_ready');
  });

  it('skips duplicate checklist rows idempotently', async () => {
    const template = getLoanWorkflowTemplate('INTAKE');
    const result = await generateWorkflowChecklist({
      authorized: true,
      template,
      existingNames: template.checklistDocumentNames,
    });
    expect(result.kind).toBe('skipped_duplicate_detected');
  });

  it('blocks unauthorized task generation', async () => {
    const result = await generateWorkflowTasks({
      authorized: false,
      template: getLoanWorkflowTemplate('UNDERWRITING'),
      existingNames: [],
    });
    expect(result.kind).toBe('unauthorized');
  });
});

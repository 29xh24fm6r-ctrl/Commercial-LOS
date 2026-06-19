import { describe, expect, it } from 'vitest';
import { LOAN_WORKFLOW_STAGES } from './loanWorkflowStages';

describe('loan workflow stage catalog', () => {
  it('defines every OGB commercial lifecycle stage with rules', () => {
    expect(LOAN_WORKFLOW_STAGES.map((stage) => stage.id)).toEqual([
      'opportunity_intake',
      'qualification',
      'application',
      'document_collection',
      'underwriting',
      'credit_memo',
      'credit_review',
      'approval',
      'closing',
      'booking',
      'post_close_monitoring',
    ]);

    for (const stage of LOAN_WORKFLOW_STAGES) {
      expect(stage.label).toBeTruthy();
      expect(stage.entryCriteria.length).toBeGreaterThan(0);
      expect(stage.exitCriteria.length).toBeGreaterThan(0);
      expect(stage.blockerRules.length).toBeGreaterThan(0);
      if (stage.id !== 'post_close_monitoring') {
        expect(stage.allowedNextStages.length).toBeGreaterThan(0);
      }
    }
  });
});

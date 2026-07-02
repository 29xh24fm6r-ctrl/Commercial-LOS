import { describe, expect, it } from 'vitest';
import { LOAN_WORKFLOW_STAGES } from './loanWorkflowStages';

describe('loan workflow stage catalog', () => {
  it('defines every OGB commercial lifecycle stage with rules', () => {
    // Reconciled to the ONE canonical vocabulary (the ratified seven).
    expect(LOAN_WORKFLOW_STAGES.map((stage) => stage.id)).toEqual([
      'INTAKE',
      'UNDERWRITING',
      'CREDIT_APPROVAL',
      'COMMITMENT',
      'DOCUMENTATION',
      'CLOSING_FUNDING',
      'BOARDED',
    ]);

    for (const stage of LOAN_WORKFLOW_STAGES) {
      expect(stage.label).toBeTruthy();
      expect(stage.entryCriteria.length).toBeGreaterThan(0);
      expect(stage.exitCriteria.length).toBeGreaterThan(0);
      expect(stage.blockerRules.length).toBeGreaterThan(0);
      // BOARDED is terminal (servicing); every prior stage advances.
      if (stage.id !== 'BOARDED') {
        expect(stage.allowedNextStages.length).toBeGreaterThan(0);
      }
    }
  });
});

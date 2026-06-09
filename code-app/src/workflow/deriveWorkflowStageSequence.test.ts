import { describe, it, expect } from 'vitest';
import { deriveWorkflowStageSequence, buildRouteStages } from './deriveWorkflowStageSequence';
import type { WorkflowRoutingInput } from './workflowRoutingConfigTypes';

/**
 * Phase 142C — stage sequence pins.
 */

const STD = buildRouteStages(['intake', 'borrower_documents', 'spreading', 'underwriting', 'manager_review']);
const AR = buildRouteStages(['borrower_documents', 'spreading', 'covenant_testing', 'package_preparation', 'manager_review']);

function seq(stages: ReturnType<typeof buildRouteStages>, input: WorkflowRoutingInput, currentStageKey?: string) {
  return deriveWorkflowStageSequence({ stages, input, currentStageKey });
}

describe('Phase 142C — stage sequence', () => {
  it('derives stages for a standard route', () => {
    const r = seq(STD, { documentReadiness: 'complete' }, 'intake');
    expect(r.stages.map((s) => s.stageKey)).toContain('underwriting');
    expect(r.currentStage).toBe('intake');
    expect(r.nextStage).toBe('borrower_documents');
  });

  it('derives annual review stages', () => {
    const r = seq(AR, { documentReadiness: 'complete', covenantStatus: 'in_compliance' });
    expect(r.stages.map((s) => s.stageKey)).toContain('covenant_testing');
  });

  it('blocks covenant testing when financials are missing', () => {
    const r = seq(AR, { documentReadiness: 'missing' });
    expect(r.blockedStages).toContain('covenant_testing');
    expect(r.blockedStages).toContain('spreading');
  });

  it('blocks package prep when evidence is missing', () => {
    const r = seq(AR, { documentReadiness: 'complete', packageReadiness: 'blocked' });
    expect(r.blockedStages).toContain('package_preparation');
  });

  it('does not auto-complete an approval stage', () => {
    const r = seq(AR, { documentReadiness: 'complete', covenantStatus: 'in_compliance' });
    expect(r.completedStages).not.toContain('manager_review');
    // Non-approval evidence-backed stages can be candidate-completed.
    expect(r.completedStages).toContain('spreading');
  });

  it('does not mutate the current stage (currentStage echoes input only)', () => {
    const r = seq(STD, { documentReadiness: 'complete' }, 'manager_review');
    expect(r.currentStage).toBe('manager_review');
    expect(JSON.stringify(r)).not.toMatch(/updateStage|setStage|mutate/i);
  });
});

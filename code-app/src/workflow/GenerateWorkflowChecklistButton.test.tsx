// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LoanWorkflowState } from './loanWorkflowTypes';
import { GenerateWorkflowChecklistButton } from './GenerateWorkflowChecklistButton';

function workflow(): LoanWorkflowState {
  return {
    currentStage: { id: 'UNDERWRITING', label: 'Underwriting' },
  } as unknown as LoanWorkflowState;
}

describe('GenerateWorkflowChecklistButton', () => {
  it('reports that governed document requirements synchronize automatically', () => {
    render(<GenerateWorkflowChecklistButton workflow={workflow()} dealId="deal-1" />);

    expect(screen.queryByRole('button', { name: 'Generate checklist' })).toBeNull();
    const notice = screen.getByRole('status');
    expect(notice.textContent).toMatch(/synchronized automatically/i);
    expect(notice.textContent).toMatch(/governed workflow template/i);
  });

  it('never invokes the retired manual write dependency', () => {
    const createMissingRows = vi.fn().mockResolvedValue({
      kind: 'success',
      detail: '2 checklist row(s) created.',
    });

    render(
      <GenerateWorkflowChecklistButton
        workflow={workflow()}
        dealId="deal-1"
        deps={{ createMissingRows }}
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(createMissingRows).not.toHaveBeenCalled();
  });
});

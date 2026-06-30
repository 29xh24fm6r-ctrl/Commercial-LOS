// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StageWorkflowControl } from './StageWorkflowControl';
import { resolveStageOrdering, CANONICAL_STAGE_CODES, type StageReferenceRow } from './stageOrderingContract';
import type { StageGateFacts } from './stageGateContract';

const ORDERING = (() => {
  const seq: Record<string, number> = { INTAKE: 10, UNDERWRITING: 20, CREDIT_APPROVAL: 30, COMMITMENT: 40, DOCUMENTATION: 50, CLOSING_FUNDING: 60, BOARDED: 70 };
  const rows: StageReferenceRow[] = CANONICAL_STAGE_CODES.map((c) => ({ cr664_code: c, cr664_name: c, cr664_sequence: seq[c], cr664_activeflag: true }));
  return resolveStageOrdering(rows);
})();

const INTAKE_MET: StageGateFacts = {
  borrowerPresent: true, loanAmountPresent: true, productTypePresent: true,
  assignedBankerPresent: true, intakeChecklistGenerated: true,
};

function btn(name: RegExp) {
  return screen.getByRole('button', { name });
}

describe('StageWorkflowControl — disabled-safe rendering', () => {
  it('unseeded ordering → read-only availability banner, no actions', () => {
    const { container } = render(
      <StageWorkflowControl
        ordering={{ status: 'unavailable', reasons: ['missing stage BOARDED'] }}
        currentStatus="OPEN"
        gateFacts={{}}
        authorized
      />,
    );
    expect(container.querySelector('[data-stage-unavailable]')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/not yet available/i)).toBeInTheDocument();
  });

  it('gate unsatisfied → Advance disabled, outstanding requirement shown', () => {
    const { container } = render(
      <StageWorkflowControl ordering={ORDERING} currentStage="INTAKE" currentStatus="OPEN"
        gateFacts={{ ...INTAKE_MET, intakeChecklistGenerated: false }} authorized liveEnabled />,
    );
    expect(btn(/Advance stage/i)).toBeDisabled();
    const req = container.querySelector('[data-gate-requirement="intake.checklist"]');
    expect(req?.getAttribute('data-met')).toBe('false');
    expect(screen.getByText(/Initial document checklist generated/i)).toBeInTheDocument();
  });

  it('gate satisfied + authorized + live → Advance enabled, shows current + next stage', () => {
    const { container } = render(
      <StageWorkflowControl ordering={ORDERING} currentStage="INTAKE" currentStatus="OPEN" gateFacts={INTAKE_MET} authorized liveEnabled />,
    );
    expect(btn(/Advance stage/i)).toBeEnabled();
    expect(container.querySelector('[data-current-stage]')?.textContent).toMatch(/sequence 10/);
    expect(container.querySelector('[data-next-stage]')?.textContent).toMatch(/UNDERWRITING/);
  });

  it('unauthorized → all actions disabled + a read-only note', () => {
    const { container } = render(
      <StageWorkflowControl ordering={ORDERING} currentStage="INTAKE" currentStatus="OPEN" gateFacts={INTAKE_MET} authorized={false} liveEnabled />,
    );
    expect(container.querySelector('[data-not-authorized]')).not.toBeNull();
    for (const name of [/Advance stage/i, /Return to earlier/i, /Decline/i, /Withdraw/i]) {
      expect(btn(name)).toBeDisabled();
    }
  });
});

describe('StageWorkflowControl — governed actions', () => {
  it('default (not live) previews the advance and writes nothing', () => {
    const onTransition = vi.fn();
    render(
      <StageWorkflowControl ordering={ORDERING} currentStage="INTAKE" currentStatus="OPEN" gateFacts={INTAKE_MET} authorized onTransition={onTransition} />,
    );
    fireEvent.click(btn(/Advance stage/i));
    expect(onTransition).not.toHaveBeenCalled();
    expect(screen.getByText(/not enabled in this environment/i)).toBeInTheDocument();
  });

  it('live + authorized advance invokes the governed transition with the ADVANCE request', () => {
    const onTransition = vi.fn();
    render(
      <StageWorkflowControl ordering={ORDERING} currentStage="INTAKE" currentStatus="OPEN" gateFacts={INTAKE_MET} authorized liveEnabled onTransition={onTransition} />,
    );
    fireEvent.click(btn(/Advance stage/i));
    expect(onTransition).toHaveBeenCalledTimes(1);
    expect(onTransition.mock.calls[0][0]).toMatchObject({ kind: 'ADVANCE', currentStage: 'INTAKE' });
  });

  it('decline requires a reason then submits a structured DECLINE (live)', () => {
    const onTransition = vi.fn();
    render(
      <StageWorkflowControl ordering={ORDERING} currentStage="UNDERWRITING" currentStatus="OPEN" gateFacts={{}} authorized liveEnabled onTransition={onTransition} />,
    );
    fireEvent.click(btn(/^Decline$/i));
    // confirm is disabled until a reason is typed
    expect(btn(/Confirm decline/i)).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Structured decline reason/i), { target: { value: 'DSCR_TOO_LOW' } });
    fireEvent.click(btn(/Confirm decline/i));
    expect(onTransition).toHaveBeenCalledTimes(1);
    expect(onTransition.mock.calls[0][0]).toMatchObject({ kind: 'DECLINE', declineReason: { code: 'DSCR_TOO_LOW' } });
  });

  it('terminal status → no exit gate, no enabled actions', () => {
    const { container } = render(
      <StageWorkflowControl ordering={ORDERING} currentStage="UNDERWRITING" currentStatus="DECLINED" gateFacts={{}} authorized liveEnabled />,
    );
    expect(container.querySelector('[data-exit-gate]')).toBeNull();
    for (const name of [/Advance stage/i, /Decline/i, /Withdraw/i]) {
      expect(btn(name)).toBeDisabled();
    }
  });
});

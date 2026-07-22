// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DealGovernedTransitionPanel } from './DealGovernedTransitionPanel';

const applyVerifiedDealPatch = vi.fn();
const refresh = vi.fn();
let dealState: { id: string; stage: string | undefined; status: string | undefined };

vi.mock('./DealDataProvider', () => ({
  useDealData: () => ({ deal: dealState, refresh, applyVerifiedDealPatch }),
}));

let bankerState: { systemUserId: string | undefined; email: string; writeDisabledReason: string | undefined };
vi.mock('../banker/BankerContext', () => ({
  useOptionalBanker: () => bankerState,
}));

const loadStageOrdering = vi.fn();
vi.mock('./stageProgressionAvailabilityLoader', () => ({
  loadStageOrdering: () => loadStageOrdering(),
}));

const executeCanonicalStageTransition = vi.fn();
vi.mock('../workflow/canonicalStageTransition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../workflow/canonicalStageTransition')>();
  return { ...actual, executeCanonicalStageTransition: (...args: unknown[]) => executeCanonicalStageTransition(...args) };
});

vi.mock('./buildLiveCanonicalTransitionDeps', () => ({
  buildLiveCanonicalTransitionDeps: () => ({ transport: {}, auditSink: {}, timelineSink: {} }),
}));

const READY_ORDERING = {
  status: 'ready' as const,
  stages: [],
  nextStage: () => undefined,
  priorStages: (code: string) => (code === 'CREDIT_APPROVAL' ? [{ code: 'UNDERWRITING', name: 'Underwriting', sequence: 20 }] : []),
  isTerminal: () => false,
  stageBySequence: () => undefined,
  stageByCode: (code: string) => ({ code, name: code, sequence: 30 }),
};

beforeEach(() => {
  applyVerifiedDealPatch.mockReset();
  refresh.mockReset();
  loadStageOrdering.mockReset();
  executeCanonicalStageTransition.mockReset();
  dealState = { id: 'deal-1', stage: 'Credit Approval', status: 'Open' };
  bankerState = { systemUserId: 'su-1', email: 'banker@ogb.example', writeDisabledReason: undefined };
});

describe('DealGovernedTransitionPanel', () => {
  it('renders nothing while ordering is loading', () => {
    loadStageOrdering.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<DealGovernedTransitionPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('mounts StageWorkflowControl with showAdvance=false once ordering resolves (Return is available)', async () => {
    loadStageOrdering.mockResolvedValue(READY_ORDERING);
    render(<DealGovernedTransitionPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Return to earlier/i })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Advance stage/i })).toBeNull();
  });

  it('fails closed with an honest message when the deal status cannot be recognized (never defaults to OPEN)', async () => {
    loadStageOrdering.mockResolvedValue(READY_ORDERING);
    dealState = { id: 'deal-1', stage: 'Credit Approval', status: 'Some Legacy Status' };
    render(<DealGovernedTransitionPanel />);
    await waitFor(() => expect(screen.getByText(/does not match a recognized governed disposition/i)).toBeInTheDocument());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a successful transition patches the deal (stage + status) and refreshes activity — never silently no-ops', async () => {
    loadStageOrdering.mockResolvedValue(READY_ORDERING);
    executeCanonicalStageTransition.mockResolvedValue({
      kind: 'transitioned', transition: 'RETURN', from: 'CREDIT_APPROVAL', to: 'UNDERWRITING', status: 'OPEN', adverseActionPending: false,
    });
    render(<DealGovernedTransitionPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Return to earlier/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Return to earlier/i }));
    fireEvent.change(screen.getByLabelText(/Return target stage/i), { target: { value: 'UNDERWRITING' } });
    fireEvent.change(screen.getByLabelText(/Reason for return/i), { target: { value: 'need updated financials' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm return/i }));
    await waitFor(() => expect(applyVerifiedDealPatch).toHaveBeenCalledWith(expect.objectContaining({ status: 'Open' })));
    expect(refresh).toHaveBeenCalledWith('activity');
  });

  it('an unresolved actor is reported as unauthorized, never silently allowed through', async () => {
    loadStageOrdering.mockResolvedValue(READY_ORDERING);
    bankerState = { systemUserId: undefined, email: '', writeDisabledReason: 'Your banker profile could not be resolved.' };
    render(<DealGovernedTransitionPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Return to earlier/i })).toBeDisabled());
    expect(executeCanonicalStageTransition).not.toHaveBeenCalled();
  });
});

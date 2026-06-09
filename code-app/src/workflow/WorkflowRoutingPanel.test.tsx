// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkflowRoutingPanel } from './WorkflowRoutingPanel';
import { deriveConfigurableWorkflowRoute } from './deriveConfigurableWorkflowRoute';
import { deriveWorkflowRoutingReadiness } from './deriveWorkflowRoutingReadiness';
import type { WorkflowRoutingInput } from './workflowRoutingConfigTypes';

function renderPanel(input: WorkflowRoutingInput) {
  const route = deriveConfigurableWorkflowRoute({ input });
  const readiness = deriveWorkflowRoutingReadiness({ route, input });
  return render(<WorkflowRoutingPanel route={route} readiness={readiness} />);
}

describe('Phase 142C — workflow routing panel', () => {
  it('renders the route result and stage sequence', () => {
    renderPanel({ productType: 'sba_7a', amount: 200000 });
    expect(screen.getAllByText('SBA 7(a) — standard').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Stages')).toBeInTheDocument();
  });

  it('renders the credit committee requirement', () => {
    renderPanel({ productType: 'small_business', amount: 9000000, documentReadiness: 'complete', covenantStatus: 'in_compliance', packageReadiness: 'review_ready' });
    expect(screen.getByText(/Committee materials/i)).toBeInTheDocument();
    expect(screen.getByText(/Voting: disabled/i)).toBeInTheDocument();
  });

  it('renders blockers', () => {
    renderPanel({ annualReviewDueStatus: 'due', documentReadiness: 'missing', covenantStatus: 'in_compliance' });
    expect(screen.getAllByText(/blocked|missing/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the read-only safety banner', () => {
    renderPanel({ productType: 'sba_7a', amount: 200000 });
    expect(screen.getByText(/Read-only decision support/i)).toBeInTheDocument();
  });

  it('has no approve / decline / submit / vote / waive / task / stage / send buttons', () => {
    const { container } = renderPanel({ productType: 'small_business', amount: 9000000 });
    expect(container.querySelectorAll('button').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['approve credit', 'decline credit', 'submit to committee', 'record vote', 'waive covenant', 'create task', 'update stage', 'send borrower']) {
      expect(text).not.toContain(w);
    }
  });
});

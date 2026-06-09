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

describe('Phase 142D — routing panel template alignment', () => {
  function panel(alignment?: Parameters<typeof WorkflowRoutingPanel>[0]['templateAlignment']) {
    const route = deriveConfigurableWorkflowRoute({ input: { productType: 'sba_7a', amount: 200000 } });
    return render(<WorkflowRoutingPanel route={route} templateAlignment={alignment} />);
  }

  it('renders without template alignment (optional prop)', () => {
    const { container } = panel();
    expect(container.textContent ?? '').not.toContain('Template alignment (142D)');
  });

  it('renders the template alignment when provided', () => {
    panel({ primaryTemplate: 'sba_7a_standard_template', companionTemplates: ['fdic_exam_prep_template'], packageEvidenceRequirements: ['annual_review_credit_memo'], caveats: ['guidance only'] });
    expect(screen.getByText(/Template alignment \(142D\)/)).toBeInTheDocument();
    expect(screen.getByText(/sba_7a_standard_template/)).toBeInTheDocument();
  });

  it('the alignment adds no apply-template button', () => {
    const { container } = panel({ primaryTemplate: 'sba_7a_standard_template' });
    expect(container.querySelectorAll('button').length).toBe(0);
    expect((container.textContent ?? '').toLowerCase()).not.toContain('apply template');
  });
});

describe('Phase 142E — routing panel servicing lifecycle summary', () => {
  function panel(servicing?: Parameters<typeof WorkflowRoutingPanel>[0]['servicing']) {
    const route = deriveConfigurableWorkflowRoute({ input: { productType: 'sba_7a', amount: 200000 } });
    return render(<WorkflowRoutingPanel route={route} servicing={servicing} />);
  }

  it('renders without servicing data (optional prop)', () => {
    const { container } = panel();
    expect(container.textContent ?? '').not.toContain('Servicing lifecycle (142E)');
  });

  it('renders the servicing summary when provided', () => {
    panel({ lifecycleStage: 'booked_active', lifecycleHealth: 'healthy' });
    expect(screen.getByText(/Servicing lifecycle \(142E\)/)).toBeInTheDocument();
    expect(screen.getByText(/booked_active/)).toBeInTheDocument();
  });

  it('the servicing summary adds no mutation controls', () => {
    const { container } = panel({ lifecycleStage: 'booked_active' });
    expect(container.querySelectorAll('button').length).toBe(0);
  });
});

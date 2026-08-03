// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreditIntelligenceWorkbench } from './CreditIntelligenceWorkbench';

describe('CreditIntelligenceWorkbench', () => {
  it('shows all capabilities but enables only explicitly configured tools', () => {
    render(<CreditIntelligenceWorkbench enabledTools={['research_party']} runTool={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Research borrower/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Relationship intelligence/ })).toBeDisabled();
    expect(screen.getAllByText('Not configured')).toHaveLength(5);
  });

  it('runs an enabled tool and renders durable source provenance', async () => {
    const runTool = vi.fn(async () => ({
      status: 'complete' as const,
      correlationId: 'corr-1',
      tool: 'research_party' as const,
      facts: [],
      evidence: [{ evidenceId: 'ev-1', sourceId: 'dataverse-los', sourceKind: 'dataverse' as const, title: 'Deal', locator: 'dv:deal', retrievedAt: '2026-07-31T00:00:00Z', contentHash: 'sha256:abc', permissionBasis: 'row access', freshness: 'current' as const }],
      contradictions: [],
      proposals: [],
      warnings: [],
      evaluationHash: 'sha256:result',
      auditEventIds: ['audit-start', 'audit-complete'],
    }));
    render(<CreditIntelligenceWorkbench enabledTools={['research_party']} runTool={runTool} />);
    fireEvent.click(screen.getByRole('button', { name: /Research borrower/ }));
    await waitFor(() => expect(screen.getByText(/Evaluation hash: sha256:result/)).toBeInTheDocument());
    expect(runTool).toHaveBeenCalledWith('research_party');
    expect(screen.getByText(/dataverse-los/)).toBeInTheDocument();
  });

  it('renders a fail-closed result without implying work was completed', async () => {
    render(<CreditIntelligenceWorkbench enabledTools={['policy_intelligence']} runTool={async () => ({
      status: 'blocked', correlationId: 'c', tool: 'policy_intelligence', code: 'AUDIT_UNAVAILABLE', safeMessage: 'Audit unavailable.', auditEventIds: [],
    })} />);
    fireEvent.click(screen.getByRole('button', { name: /Analyze policy/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Blocked: AUDIT_UNAVAILABLE');
  });
});

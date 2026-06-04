// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CopilotAssistPanel } from './CopilotAssistPanel';
import {
  createMockConnector,
  createCopilotConnector,
  resolveCopilotConnectorStatus,
  _setCopilotConnectorForTest,
  _resetCopilotConnectorForTest,
  type CopilotProposedAction,
} from './copilotConnector';
import type { CopilotDealContext } from './copilotAssistantAdapter';

/**
 * SPEC-COPILOT-LIVE-CONNECTOR — panel mode pill + disclaimer + proposals.
 */

const DEAL_CTX: CopilotDealContext = {
  dealName: 'Test Deal',
  clientName: 'Test Client',
  stage: 'Underwriting',
  status: 'Active',
  amount: 1_000_000,
  taskCount: 4,
  openTaskCount: 2,
  documentCount: 6,
  outstandingDocumentCount: 1,
  blockerCount: 0,
  blockerSummaries: [],
};

const PROPOSALS: CopilotProposedAction[] = [
  {
    action_id: 'open-committee-evidence',
    action_type: 'open_screen',
    label: 'Open Committee Evidence panel',
    rationale: 'Inspect committee evidence tasks.',
    requires_confirmation: true,
    payload: { anchor: '#committee-evidence' },
  },
  {
    action_id: 'suggest-evidence-sos_registry',
    action_type: 'suggest_evidence',
    label: 'Collect SOS / business registry evidence',
    rationale: 'Required for committee.',
    requires_confirmation: true,
    payload: { category: 'sos_registry' },
  },
];

afterEach(() => {
  _resetCopilotConnectorForTest();
});

describe('SPEC-COPILOT — panel status pill', () => {
  it('default (not_configured) shows the "Not configured" pill and the read-only disclaimer', () => {
    _resetCopilotConnectorForTest();
    render(
      <CopilotAssistPanel surface="deal" dealContext={DEAL_CTX} defaultExpanded />,
    );
    expect(screen.getByText('Not configured')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Copilot can summarize and suggest\. It cannot write or submit changes\./,
      ),
    ).toBeInTheDocument();
  });

  it('proposal_only (mock) shows the "Proposal only" pill', () => {
    _setCopilotConnectorForTest(createMockConnector('proposal_only'));
    render(<CopilotAssistPanel surface="deal" dealContext={DEAL_CTX} defaultExpanded />);
    expect(screen.getByText('Proposal only')).toBeInTheDocument();
    expect(screen.getByLabelText('Copilot proposal only')).toBeInTheDocument();
  });

  it('live_read_only (mock) shows the "Live read-only" pill', () => {
    _setCopilotConnectorForTest(createMockConnector('live_read_only'));
    render(<CopilotAssistPanel surface="deal" dealContext={DEAL_CTX} defaultExpanded />);
    expect(screen.getByText('Live read-only')).toBeInTheDocument();
  });

  it('disabled connector renders safely with a "Disabled" pill', () => {
    _setCopilotConnectorForTest(
      createCopilotConnector(resolveCopilotConnectorStatus({ mode: 'disabled' })),
    );
    render(<CopilotAssistPanel surface="deal" dealContext={DEAL_CTX} defaultExpanded />);
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    // Still shows the read-only disclaimer; never crashes.
    expect(
      screen.getByText(/It cannot write or submit changes/),
    ).toBeInTheDocument();
  });
});

describe('SPEC-COPILOT — panel proposed actions', () => {
  it('renders proposals as confirmation-required cards in proposal_only mode', () => {
    _setCopilotConnectorForTest(createMockConnector('proposal_only'));
    render(
      <CopilotAssistPanel
        surface="deal"
        dealContext={DEAL_CTX}
        proposedActions={PROPOSALS}
        defaultExpanded
      />,
    );
    expect(screen.getByText('Open Committee Evidence panel')).toBeInTheDocument();
    expect(
      screen.getByText('Collect SOS / business registry evidence'),
    ).toBeInTheDocument();
    // Each proposal is explicitly confirmation-required.
    expect(screen.getAllByText('Requires confirmation').length).toBe(
      PROPOSALS.length,
    );
  });

  it('open_screen proposal renders as an in-page anchor (safe navigation, no write)', () => {
    _setCopilotConnectorForTest(createMockConnector('proposal_only'));
    render(
      <CopilotAssistPanel
        surface="deal"
        dealContext={DEAL_CTX}
        proposedActions={PROPOSALS}
        defaultExpanded
      />,
    );
    const link = screen.getByText('Open Committee Evidence panel');
    expect(link.getAttribute('href')).toBe('#committee-evidence');
  });

  it('does NOT render proposals in the default not_configured posture (inert)', () => {
    _resetCopilotConnectorForTest();
    render(
      <CopilotAssistPanel
        surface="deal"
        dealContext={DEAL_CTX}
        proposedActions={PROPOSALS}
        defaultExpanded
      />,
    );
    expect(
      screen.queryByText('Open Committee Evidence panel'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Collect SOS / business registry evidence'),
    ).not.toBeInTheDocument();
  });
});

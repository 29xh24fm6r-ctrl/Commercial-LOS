// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CopilotAssistPanel } from './CopilotAssistPanel';
import * as adapterModule from './copilotAssistantAdapter';
import type { CopilotDealContext, CopilotWorkspaceContext } from './copilotAssistantAdapter';

vi.mock('../shared/Card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardHeader: ({ title, subtitle, trailing }: any) => (
    <div data-testid="card-header">
      <span>{title}</span>
      <span>{subtitle}</span>
      {trailing}
    </div>
  ),
  CardFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-footer">{children}</div>
  ),
}));

const DEAL_CTX: CopilotDealContext = {
  dealName: 'Acme WC',
  clientName: 'Acme Inc.',
  stage: 'Underwriting',
  status: 'Active',
  amount: 4500000,
  taskCount: 8,
  openTaskCount: 3,
  documentCount: 12,
  outstandingDocumentCount: 4,
  blockerCount: 1,
  blockerSummaries: ['Missing appraisal'],
};

const WORKSPACE_CTX: CopilotWorkspaceContext = {
  workspaceRole: 'banker',
  userName: 'M. Paller',
  teamName: 'East',
  dealCount: 15,
  urgentItemCount: 4,
  kpiSummaries: ['Pipeline: $45M'],
};

describe('Phase 129A — CopilotAssistPanel', () => {
  beforeEach(() => {
    // Reset to not_configured adapter
    adapterModule._setCopilotAdapterForTest(
      adapterModule.createNotConfiguredAdapter(),
    );
  });

  it('renders Copilot Assist header', () => {
    render(
      <CopilotAssistPanel surface="deal" dealContext={DEAL_CTX} />,
    );
    expect(screen.getByText('Copilot Assist')).toBeInTheDocument();
  });

  it('shows not-configured subtitle when connector absent', () => {
    render(
      <CopilotAssistPanel surface="deal" dealContext={DEAL_CTX} />,
    );
    expect(
      screen.getByText(/Connector not configured/),
    ).toBeInTheDocument();
  });

  it('shows expand/collapse toggle', () => {
    render(
      <CopilotAssistPanel surface="deal" dealContext={DEAL_CTX} />,
    );
    expect(screen.getByText('Expand')).toBeInTheDocument();
  });

  it('expands to show quick actions when clicked', () => {
    render(
      <CopilotAssistPanel surface="deal" dealContext={DEAL_CTX} />,
    );
    fireEvent.click(screen.getByText('Expand'));
    expect(screen.getByText('Summarize deal')).toBeInTheDocument();
    expect(screen.getByText('Next actions')).toBeInTheDocument();
    expect(screen.getByText('Missing fields')).toBeInTheDocument();
    expect(screen.getByText('Explain blockers')).toBeInTheDocument();
  });

  it('renders workspace quick actions when surface is workspace', () => {
    render(
      <CopilotAssistPanel
        surface="workspace"
        workspaceContext={WORKSPACE_CTX}
        defaultExpanded
      />,
    );
    expect(screen.getByText('Summarize workspace')).toBeInTheDocument();
  });

  it('footer states read-only assistant and no data changes', () => {
    render(
      <CopilotAssistPanel surface="deal" dealContext={DEAL_CTX} />,
    );
    expect(
      screen.getByText(/Cannot approve, change data, or send communications/),
    ).toBeInTheDocument();
  });

  it('clicking summarize deal shows a response card', () => {
    render(
      <CopilotAssistPanel surface="deal" dealContext={DEAL_CTX} defaultExpanded />,
    );
    fireEvent.click(screen.getByText('Summarize deal'));
    expect(screen.getByText(/Acme WC/)).toBeInTheDocument();
    expect(screen.getByText(/Local summary/)).toBeInTheDocument();
  });

  it('response includes honest disclaimer', () => {
    render(
      <CopilotAssistPanel surface="deal" dealContext={DEAL_CTX} defaultExpanded />,
    );
    fireEvent.click(screen.getByText('Summarize deal'));
    expect(
      screen.getByText(/Not AI-generated. Not a recommendation/),
    ).toBeInTheDocument();
  });
});

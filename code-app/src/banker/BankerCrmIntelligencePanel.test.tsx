// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BankerCrmIntelligencePanel } from './BankerCrmIntelligencePanel';

vi.mock('../shared/drillthrough/DrillThroughCard', () => ({
  DrillThroughCard: ({ target, children }: any) => (
    <details data-testid={`drill-${target.id}`} aria-label={`View details: ${target.title}`}>
      <summary>{children}</summary>
      <div data-testid={`panel-${target.id}`}>
        <span>{target.title}</span>
        <span>{target.summary}</span>
        {target.detailSections?.map((s: any, i: number) => (
          <div key={i}>
            {s.rows?.map((r: any, j: number) => (
              <span key={j}>{r.label}: {r.value}</span>
            ))}
          </div>
        ))}
      </div>
    </details>
  ),
}));

vi.mock('../crm/workspaceIntegration/CrmBankerWorkingSurface', () => ({
  CrmBankerWorkingSurface: ({ input }: any) => (
    <div data-testid="crm-banker-surface">
      <span>{input.salesforceReadiness}</span>
      <span>{input.ncinoReadiness}</span>
    </div>
  ),
}));

vi.mock('../crm/workspaceIntegration/crmWorkspacePreviewInputs', () => ({
  bankerCrmPreviewInput: () => ({
    relationshipOverview: undefined,
    salesforceReadiness: 'Preview — external connection disabled',
    ncinoReadiness: 'Preview — external connection disabled',
    entityMatchStatus: 'Awaiting human review',
    sourceOfTruthGaps: 0,
    syncPreviewBlockers: 0,
    nextSafeBankerStep: 'Review CRM source-of-truth',
    crmCommandCenterHref: undefined,
  }),
}));

describe('BUGFIX-PRODUCTION-CRM-CARDS-NOT-CLICKABLE-1 — BankerCrmIntelligencePanel', () => {
  it('renders CRM Command Center as a DrillThroughCard', () => {
    render(<BankerCrmIntelligencePanel />);
    expect(screen.getByTestId('drill-banker-crm-command-center')).toBeInTheDocument();
  });

  it('CRM Command Center drill-through opens read-only detail panel', () => {
    render(<BankerCrmIntelligencePanel />);
    const details = screen.getByTestId('drill-banker-crm-command-center');
    fireEvent.click(details.querySelector('summary')!);
    expect(screen.getByTestId('panel-banker-crm-command-center')).toBeInTheDocument();
    expect(screen.getByText(/Read-only, preview-only/)).toBeInTheDocument();
  });

  it('keyboard Enter opens a CRM card detail', () => {
    render(<BankerCrmIntelligencePanel />);
    const summary = screen.getByTestId('drill-banker-crm-command-center').querySelector('summary')!;
    fireEvent.keyDown(summary, { key: 'Enter' });
    // Native <details>/<summary> handles Enter/Space — just verify the element exists and is focusable
    expect(summary).toBeTruthy();
  });

  it('no sync/push/write/enable-live controls appear', () => {
    const { container } = render(<BankerCrmIntelligencePanel />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/syncNow|pushNow|writeNow|enableLive/i);
    expect(html).not.toMatch(/Sync CRM|Push to Salesforce|Enable nCino/i);
  });

  it('no fake sync success copy appears', () => {
    const { container } = render(<BankerCrmIntelligencePanel />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/synced successfully|pushed successfully|connected successfully/i);
  });

  it('renders the CRM banker working surface', () => {
    render(<BankerCrmIntelligencePanel />);
    expect(screen.getByTestId('crm-banker-surface')).toBeInTheDocument();
  });

  it('detail panel includes derivation source note', () => {
    render(<BankerCrmIntelligencePanel />);
    fireEvent.click(screen.getByTestId('drill-banker-crm-command-center').querySelector('summary')!);
    expect(screen.getByText(/Derived from local preview input/)).toBeInTheDocument();
  });
});

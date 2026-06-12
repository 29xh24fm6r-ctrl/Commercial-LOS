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

describe('Phase 157 — BankerCrmIntelligencePanel premium cockpit', () => {
  it('renders CRM Command Center as a DrillThroughCard', () => {
    render(<BankerCrmIntelligencePanel />);
    expect(screen.getByTestId('drill-banker-crm-command-center')).toBeInTheDocument();
  });

  it('renders Read-only and Preview-only badges', () => {
    render(<BankerCrmIntelligencePanel />);
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(screen.getByText('Preview-only')).toBeInTheDocument();
  });

  it('hero contains in-card View details action', () => {
    render(<BankerCrmIntelligencePanel />);
    const hero = screen.getByTestId('drill-banker-crm-command-center');
    const actions = hero.querySelectorAll('[data-crm-action="view-details"]');
    expect(actions.length).toBeGreaterThanOrEqual(1);
  });

  it('hero uses full-width layout marker', () => {
    render(<BankerCrmIntelligencePanel />);
    const hero = screen.getByTestId('drill-banker-crm-command-center');
    expect(hero.querySelector('[data-crm-hero="full-width"]')).toBeTruthy();
  });

  it('CRM Command Center drill-through opens read-only detail panel', () => {
    render(<BankerCrmIntelligencePanel />);
    fireEvent.click(screen.getByTestId('drill-banker-crm-command-center').querySelector('summary')!);
    expect(screen.getByTestId('panel-banker-crm-command-center')).toBeInTheDocument();
    expect(screen.getByText(/Read-only, preview-only/)).toBeInTheDocument();
  });

  it('renders CRM Readiness lane', () => {
    render(<BankerCrmIntelligencePanel />);
    expect(screen.getByTestId('drill-banker-crm-lane-crm-readiness')).toBeInTheDocument();
    expect(screen.getAllByText(/CRM Readiness/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders Lending Workflow Readiness lane', () => {
    render(<BankerCrmIntelligencePanel />);
    expect(screen.getByTestId('drill-banker-crm-lane-lending-readiness')).toBeInTheDocument();
    expect(screen.getAllByText(/Lending Workflow Readiness/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders relationship intelligence summary', () => {
    render(<BankerCrmIntelligencePanel />);
    expect(screen.getByTestId('drill-banker-crm-relationship-summary')).toBeInTheDocument();
    expect(screen.getAllByText(/Relationship Intelligence Summary/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders the six CRM intelligence cards', () => {
    render(<BankerCrmIntelligencePanel />);
    expect(screen.getByTestId('crm-banker-surface')).toBeInTheDocument();
  });

  it('every card has drill-through (View details)', () => {
    render(<BankerCrmIntelligencePanel />);
    const details = screen.getByTestId('drill-banker-crm-command-center');
    expect(details.tagName.toLowerCase()).toBe('details');
  });

  it('no third-party vendor/product names appear', () => {
    const { container } = render(<BankerCrmIntelligencePanel />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/\bSalesforce\b/i);
    expect(html).not.toMatch(/\bnCino\b/i);
  });

  it('no sync/push/write/enable-live controls appear', () => {
    const { container } = render(<BankerCrmIntelligencePanel />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/syncNow|pushNow|writeNow|enableLive/i);
  });

  it('no fake sync success copy appears', () => {
    const { container } = render(<BankerCrmIntelligencePanel />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/synced successfully|pushed successfully|connected successfully/i);
  });

  it('detail panel includes derivation source note', () => {
    render(<BankerCrmIntelligencePanel />);
    fireEvent.click(screen.getByTestId('drill-banker-crm-command-center').querySelector('summary')!);
    expect(screen.getByText(/Derived from local preview input/)).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CrmBankerWorkingSurface, type CrmBankerSurfaceInput } from './CrmBankerWorkingSurface';

vi.mock('../../shared/Card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardHeader: ({ title, subtitle }: any) => <div data-testid="card-header"><span>{title}</span>{subtitle && <span>{subtitle}</span>}</div>,
  CardFooter: ({ children }: any) => <div data-testid="card-footer">{children}</div>,
}));

// Use real DrillThroughCard since it's native <details>/<summary>
vi.mock('../../shared/drillthrough/DrillThroughCard', () => ({
  DrillThroughCard: ({ target, children }: any) => (
    <details data-testid={`drill-${target.id}`} aria-label={`View details: ${target.title}`}>
      <summary>{children}</summary>
      <div data-testid={`panel-${target.id}`}>
        <span>{target.title}</span>
        {target.detailSections?.map((s: any, i: number) => (
          <div key={i} data-testid={`section-${target.id}`}>
            {s.rows?.map((r: any, j: number) => (
              <div key={j}><span>{r.label}</span><span>{r.value}</span></div>
            ))}
          </div>
        ))}
      </div>
    </details>
  ),
}));

const INPUT: CrmBankerSurfaceInput = {
  relationshipOverview: undefined,
  salesforceReadiness: 'CRM is active — relationship records are available',
  ncinoReadiness: 'Loan workflow is active',
  entityMatchStatus: 'Awaiting human review',
  sourceOfTruthGaps: 2,
  syncPreviewBlockers: 1,
  nextSafeBankerStep: 'Review relationship records and matching',
  crmCommandCenterHref: undefined,
};

describe('Phase 150 — CRM Command Center interaction wiring', () => {
  it('all six CRM intelligence cards are clickable details elements', () => {
    render(<CrmBankerWorkingSurface input={INPUT} />);
    expect(screen.getByTestId('drill-banker-crm-relationship')).toBeInTheDocument();
    expect(screen.getByTestId('drill-banker-crm-salesforce')).toBeInTheDocument();
    expect(screen.getByTestId('drill-banker-crm-ncino')).toBeInTheDocument();
    expect(screen.getByTestId('drill-banker-crm-match-status')).toBeInTheDocument();
    expect(screen.getByTestId('drill-banker-crm-sot-gaps')).toBeInTheDocument();
    expect(screen.getByTestId('drill-banker-crm-sync-blocked')).toBeInTheDocument();
  });

  it('clicking Relationship opens details with relationship status and ownership', () => {
    render(<CrmBankerWorkingSurface input={INPUT} />);
    const el = screen.getByTestId('drill-banker-crm-relationship');
    fireEvent.click(el.querySelector('summary')!);
    const panel = screen.getByTestId('panel-banker-crm-relationship');
    expect(panel.textContent).toContain('Relationship context from your authorized workspace data');
    expect(panel.textContent).toContain('Relationship ownership');
    expect(panel.textContent).toContain('Next step');
  });

  it('clicking CRM opens details showing the CRM is active and records are available', () => {
    render(<CrmBankerWorkingSurface input={INPUT} />);
    fireEvent.click(screen.getByTestId('drill-banker-crm-salesforce').querySelector('summary')!);
    const panel = screen.getByTestId('panel-banker-crm-salesforce');
    expect(panel.textContent).toContain('Active. Relationship records from your authorized workspace.');
    expect(panel.textContent).toContain('Relationship records are available');
    expect(panel.textContent).not.toMatch(/writeback gated/i);
  });

  it('clicking Loan Workflow opens details showing the loan workflow is active', () => {
    render(<CrmBankerWorkingSurface input={INPUT} />);
    fireEvent.click(screen.getByTestId('drill-banker-crm-ncino').querySelector('summary')!);
    const panel = screen.getByTestId('panel-banker-crm-ncino');
    expect(panel.textContent).toContain('Active. Loan workflow readiness from your authorized workspace.');
    expect(panel.textContent).toContain('Open a deal to manage its loan workflow.');
  });

  it('clicking Match Status opens details explaining human review requirement', () => {
    render(<CrmBankerWorkingSurface input={INPUT} />);
    fireEvent.click(screen.getByTestId('drill-banker-crm-match-status').querySelector('summary')!);
    const panel = screen.getByTestId('panel-banker-crm-match-status');
    expect(panel.textContent).toContain('Awaiting human review');
    expect(panel.textContent).toContain('No automatic link');
  });

  it('clicking Ownership Gaps opens details listing ownership gaps', () => {
    render(<CrmBankerWorkingSurface input={INPUT} />);
    fireEvent.click(screen.getByTestId('drill-banker-crm-sot-gaps').querySelector('summary')!);
    const panel = screen.getByTestId('panel-banker-crm-sot-gaps');
    expect(panel.textContent).toContain('Ownership gaps');
    expect(panel.textContent).toContain('ownership is unresolved');
  });

  it('clicking Needs Review opens details explaining the review reason', () => {
    render(<CrmBankerWorkingSurface input={INPUT} />);
    fireEvent.click(screen.getByTestId('drill-banker-crm-sync-blocked').querySelector('summary')!);
    const panel = screen.getByTestId('panel-banker-crm-sync-blocked');
    expect(panel.textContent).toContain('match needs confirmation');
    expect(panel.textContent).toContain('need a human review');
  });

  it('footer shows the CRM is active with records available', () => {
    render(<CrmBankerWorkingSurface input={INPUT} />);
    expect(screen.getByText(/CRM is active\. Relationship records are available\./)).toBeInTheDocument();
  });

  it('no write/sync/connect buttons exist', () => {
    const { container } = render(<CrmBankerWorkingSurface input={INPUT} />);
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toContain('sync now');
    expect(html).not.toContain('push now');
    expect(html).not.toContain('write now');
    expect(html).not.toContain('connect live');
    expect(html).not.toContain('enable live');
    expect(html).not.toContain('update crm');
  });

  it('no vendor/product names appear in rendered output', () => {
    const { container } = render(<CrmBankerWorkingSurface input={INPUT} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/\bSalesforce\b/);
    expect(html).not.toMatch(/\bnCino\b/);
    expect(html).not.toMatch(/\bHubSpot\b/);
  });

  it('no fetch/Graph/external SDK calls in source', () => {
    // Static source check — the component module should not import fetch or SDK
    const src = require('fs').readFileSync(require('path').resolve(__dirname, './CrmBankerWorkingSurface.tsx'), 'utf8');
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/\baxios\b/);
    expect(src).not.toMatch(/microsoft.*graph/i);
  });
});

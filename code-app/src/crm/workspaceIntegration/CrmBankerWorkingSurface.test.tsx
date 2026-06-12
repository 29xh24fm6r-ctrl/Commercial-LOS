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
  salesforceReadiness: 'Preview — external connection disabled',
  ncinoReadiness: 'Preview — external connection disabled',
  entityMatchStatus: 'Awaiting human review',
  sourceOfTruthGaps: 2,
  syncPreviewBlockers: 1,
  nextSafeBankerStep: 'Review CRM source-of-truth',
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

  it('clicking Relationship opens details with relationship status and source-of-truth', () => {
    render(<CrmBankerWorkingSurface input={INPUT} />);
    const el = screen.getByTestId('drill-banker-crm-relationship');
    fireEvent.click(el.querySelector('summary')!);
    const panel = screen.getByTestId('panel-banker-crm-relationship');
    expect(panel.textContent).toContain('Relationship context derived from authorized banker workspace data');
    expect(panel.textContent).toContain('Source-of-truth posture');
    expect(panel.textContent).toContain('Next safe step');
  });

  it('clicking CRM opens details explaining external connection disabled', () => {
    render(<CrmBankerWorkingSurface input={INPUT} />);
    fireEvent.click(screen.getByTestId('drill-banker-crm-salesforce').querySelector('summary')!);
    const panel = screen.getByTestId('panel-banker-crm-salesforce');
    expect(panel.textContent).toContain('Disabled. No live connection to any external CRM platform.');
    expect(panel.textContent).toContain('Preview-only');
    expect(panel.textContent).toContain('What would be required');
  });

  it('clicking Lending Workflow opens details explaining sync disabled', () => {
    render(<CrmBankerWorkingSurface input={INPUT} />);
    fireEvent.click(screen.getByTestId('drill-banker-crm-ncino').querySelector('summary')!);
    const panel = screen.getByTestId('panel-banker-crm-ncino');
    expect(panel.textContent).toContain('Disabled. No live sync to any external lending workflow platform.');
    expect(panel.textContent).toContain('Why disabled');
  });

  it('clicking Match Status opens details explaining human review requirement', () => {
    render(<CrmBankerWorkingSurface input={INPUT} />);
    fireEvent.click(screen.getByTestId('drill-banker-crm-match-status').querySelector('summary')!);
    const panel = screen.getByTestId('panel-banker-crm-match-status');
    expect(panel.textContent).toContain('Awaiting human review');
    expect(panel.textContent).toContain('No auto-link');
  });

  it('clicking SoT Gaps opens details listing source-of-truth gaps', () => {
    render(<CrmBankerWorkingSurface input={INPUT} />);
    fireEvent.click(screen.getByTestId('drill-banker-crm-sot-gaps').querySelector('summary')!);
    const panel = screen.getByTestId('panel-banker-crm-sot-gaps');
    expect(panel.textContent).toContain('Source-of-truth gaps');
    expect(panel.textContent).toContain('ownership is unresolved');
  });

  it('clicking Sync Blocked opens details explaining blocking reason', () => {
    render(<CrmBankerWorkingSurface input={INPUT} />);
    fireEvent.click(screen.getByTestId('drill-banker-crm-sync-blocked').querySelector('summary')!);
    const panel = screen.getByTestId('panel-banker-crm-sync-blocked');
    expect(panel.textContent).toContain('Writeback policy gate not ready');
    expect(panel.textContent).toContain('conflict requires human review');
  });

  it('read-only / preview-only badges remain in footer', () => {
    render(<CrmBankerWorkingSurface input={INPUT} />);
    expect(screen.getByText(/Preview-only CRM intelligence/)).toBeInTheDocument();
    expect(screen.getByText(/Live writes disabled/)).toBeInTheDocument();
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

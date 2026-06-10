// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DrillThroughPanel } from './DrillThroughPanel';
import { buildDrillThroughTarget } from './drillThroughTypes';

const CONTENT = buildDrillThroughTarget({
  id: 'exposure',
  title: 'Total committed exposure',
  surface: 'portfolio_command_center',
  entityKind: 'kpi',
  statusLabel: 'Within appetite',
  summary: 'Aggregate committed exposure across the active book.',
  sourceCounts: [
    { label: 'Active deals', count: 42 },
    { label: 'Blocked', count: 3 },
  ],
  sourceFields: [
    { label: 'Derivation', value: 'Sum of committed amounts', source: 'portfolio model', confidence: 'high' },
  ],
  detailSections: [
    { title: 'Top concentrations', rows: [{ label: 'CRE', value: '38%', warning: 'near limit' }] },
    { title: 'Empty section', rows: [], emptyMessage: 'No items in this section.' },
  ],
  warnings: ['One concentration is near its limit.'],
  blockers: ['One deal is blocked on missing collateral.'],
  nextReviewStep: 'Review the near-limit concentration with the portfolio manager.',
});

describe('Phase 144A — DrillThroughPanel content', () => {
  it('renders heading, read-only badge, summary, counts, derivation, warnings, blockers, next step', () => {
    render(<DrillThroughPanel target={CONTENT} />);
    expect(screen.getByRole('heading', { name: 'Total committed exposure' })).toBeTruthy();
    expect(screen.getByText('Read-only')).toBeTruthy();
    expect(screen.getByText(/Aggregate committed exposure/)).toBeTruthy();
    expect(screen.getByText('Active deals')).toBeTruthy();
    expect(screen.getByText('How this was derived')).toBeTruthy();
    expect(screen.getByText('Warnings')).toBeTruthy();
    expect(screen.getByText('Blockers')).toBeTruthy();
    expect(screen.getByText(/Next safe review step:/)).toBeTruthy();
  });

  it('renders an empty-section message rather than fabricating rows', () => {
    render(<DrillThroughPanel target={CONTENT} />);
    expect(screen.getByText('No items in this section.')).toBeTruthy();
  });

  it('contains no buttons, forms, or inputs (read-only)', () => {
    const { container } = render(<DrillThroughPanel target={CONTENT} />);
    expect(container.querySelectorAll('button, form, input').length).toBe(0);
  });
});

describe('Phase 144A — DrillThroughPanel route + unavailable', () => {
  it('renders a safe route link when the target is route-only', () => {
    const routed = buildDrillThroughTarget({
      id: 'deal', title: 'Deal ABC', surface: 'deal_cockpit', entityKind: 'deal',
      summary: 'Open the full deal cockpit.', routeHref: '/deals/abc',
    });
    render(<DrillThroughPanel target={routed} />);
    const link = screen.getByText('Open full record') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/deals/abc');
  });

  it('renders an honest unavailable state stating what is missing', () => {
    const gone = buildDrillThroughTarget({
      id: 'gone', title: 'Bureau detail', surface: 'aml_kyc_policy_gate', entityKind: 'status',
      summary: 'Bureau detail is gated.', unavailableReason: 'Bureau pull is disabled; no detail is available.',
    });
    render(<DrillThroughPanel target={gone} />);
    expect(screen.getByText('Bureau pull is disabled; no detail is available.')).toBeTruthy();
  });
});

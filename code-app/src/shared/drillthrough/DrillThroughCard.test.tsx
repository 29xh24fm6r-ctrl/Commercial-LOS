// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DrillThroughCard, useDrillThroughPanel } from './DrillThroughCard';
import { buildDrillThroughTarget } from './drillThroughTypes';

const TARGET = buildDrillThroughTarget({
  id: 'blocked-kpi',
  title: 'Blocked deals',
  surface: 'manager_control_panel',
  entityKind: 'kpi',
  statusLabel: '3 blocked',
  summary: 'Three deals are blocked on missing evidence.',
  sourceCounts: [{ label: 'Blocked', count: 3 }],
  nextReviewStep: 'Review the three blocked deals with the team lead.',
});

describe('Phase 144A — DrillThroughCard disclosure', () => {
  it('renders a native details/summary disclosure (keyboard reachable, no JS click handler)', () => {
    const { container } = render(<DrillThroughCard target={TARGET} />);
    expect(container.querySelector('details')).toBeTruthy();
    expect(container.querySelector('summary')).toBeTruthy();
  });

  it('summary has an accessible name describing what opens', () => {
    const { container } = render(<DrillThroughCard target={TARGET} />);
    const summary = container.querySelector('summary')!;
    expect(summary.getAttribute('aria-label')).toMatch(/view details: blocked deals/i);
  });

  it('reveals the read-only detail panel content inside a labelled region', () => {
    const { container } = render(<DrillThroughCard target={TARGET} />);
    const region = container.querySelector('[role="region"]')!;
    expect(region).toBeTruthy();
    expect(region.getAttribute('aria-labelledby')).toBe('drillthrough-blocked-kpi-heading');
    expect(screen.getByRole('heading', { name: 'Blocked deals' })).toBeTruthy();
  });

  it('exposes no write/action controls — no buttons, forms, or inputs', () => {
    const { container } = render(<DrillThroughCard target={TARGET} />);
    expect(container.querySelectorAll('button, form, input').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['sync now', 'push now', 'apply now', 'approve', 'deny', 'vote', 'save', 'submit']) {
      expect(text).not.toContain(w);
    }
  });

  it('route-only target shows an "Open record" hint and a safe link', () => {
    const routed = buildDrillThroughTarget({
      id: 'deal-1', title: 'Deal ABC', surface: 'deal_cockpit', entityKind: 'deal',
      summary: 'Open the deal cockpit.', routeHref: '/deals/abc',
    });
    render(<DrillThroughCard target={routed} />);
    const link = screen.getByText('Open full record') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/deals/abc');
  });

  it('unavailable target shows an honest "Details unavailable" hint', () => {
    const gone = buildDrillThroughTarget({
      id: 'gap', title: 'Pending metric', surface: 'generic', entityKind: 'metric',
      summary: 'Nothing behind this yet.',
    });
    const { container } = render(<DrillThroughCard target={gone} />);
    expect((container.textContent ?? '')).toMatch(/details unavailable/i);
  });
});

describe('Phase 144A — useDrillThroughPanel derivation helper', () => {
  it('returns the resolved action, accessible name, and stable ids', () => {
    function Probe() {
      const dp = useDrillThroughPanel(TARGET);
      return (
        <div data-testid="probe" data-kind={dp.action.kind} data-region={dp.regionId} data-name={dp.accessibleName} data-ro={String(dp.readOnly)} />
      );
    }
    render(<Probe />);
    const el = screen.getByTestId('probe');
    expect(el.getAttribute('data-kind')).toBe('panel');
    expect(el.getAttribute('data-region')).toBe('drillthrough-blocked-kpi');
    expect(el.getAttribute('data-name')).toMatch(/view details/i);
    expect(el.getAttribute('data-ro')).toBe('true');
  });
});

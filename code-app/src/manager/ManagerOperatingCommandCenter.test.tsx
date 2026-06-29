// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ManagerOperatingCommandCenter } from './ManagerOperatingCommandCenter';

describe('Phase 233 — Manager Operating Command Center', () => {
  it('renders a team CRM + LOS supervision cockpit', () => {
    render(<ManagerOperatingCommandCenter />);

    expect(
      screen.getByRole('region', { name: /Manager Operating Command Center/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('CRM + LOS active')).toBeInTheDocument();
    expect(screen.getByText(/Team CRM \+ LOS supervision cockpit/i)).toBeInTheDocument();
  });

  it('shows all major manager supervision domains', () => {
    render(<ManagerOperatingCommandCenter />);
    const region = screen.getByRole('region', { name: /Manager Operating Command Center/i });

    for (const label of [
      'Pipeline supervision',
      'Banker workload balance',
      'CRM relationship coverage',
      'Workflow bottlenecks',
      'New Deal intake gate posture',
      'Document checklist readiness',
      'CRM writeback gate',
      'Borrower communication gate',
      'Portfolio boarding gate',
    ]) {
      expect(within(region).getByText(label)).toBeInTheDocument();
    }
  });

  it('points managers to existing supervision anchors', () => {
    render(<ManagerOperatingCommandCenter />);
    const anchors = screen.getByRole('region', { name: /Supervision anchors/i });

    expect(within(anchors).getByText('manager-workflow-launch-readiness')).toBeInTheDocument();
    expect(within(anchors).getByText('crm-manager-working-surface')).toBeInTheDocument();
  });

  it('exposes no buttons, forms, inputs, or write controls', () => {
    const { container } = render(<ManagerOperatingCommandCenter />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('form').length).toBe(0);
    expect(container.querySelectorAll('input,textarea,select').length).toBe(0);
  });

  // Completion Phase C — manager dashboard label honesty: a gated live-write domain must never
  // render the word "enabled". The manager layer reads the flag (first gate) but cannot see the
  // authority's certification, so it shows "gated" (off) / "armed — pending certification" (on).
  describe('Completion Phase C — live-write card label honesty', () => {
    function card(container: HTMLElement, id: string): HTMLElement {
      const el = container.querySelector<HTMLElement>(`[data-operating-domain="${id}"]`);
      expect(el, `card ${id}`).not.toBeNull();
      return el!;
    }

    it.each([
      ['document-readiness', 'Generation gated'],
      ['crm-writeback', 'Writeback gated'],
      ['borrower-communication', 'Send gated'],
      ['portfolio-boarding', 'Boarding persistence gated'],
    ])('%s reads gated and never "enabled" at the safe default', (id, gatedLabel) => {
      const { container } = render(<ManagerOperatingCommandCenter />);
      const el = card(container, id);
      const value = el.querySelector('[data-domain-value]');
      expect(value?.textContent).toBe(gatedLabel);
      expect(value?.textContent).not.toMatch(/\benabled\b/i); // value never over-asserts
      expect(within(el).getByText('gated')).toBeInTheDocument(); // status badge
    });
  });
});

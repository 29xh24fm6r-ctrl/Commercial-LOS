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
      'New Deal intake',
      'Document checklist readiness',
      'CRM writeback gate',
      'Borrower communication',
      'Portfolio boarding',
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
    ])('%s reads gated and never "enabled" at the safe default', (id, gatedLabel) => {
      const { container } = render(<ManagerOperatingCommandCenter />);
      const el = card(container, id);
      const value = el.querySelector('[data-domain-value]');
      expect(value?.textContent).toBe(gatedLabel);
      expect(value?.textContent).not.toMatch(/\benabled\b/i); // value never over-asserts
      expect(within(el).getByText('gated')).toBeInTheDocument(); // status badge
    });
  });

  // Factory Arc Phase 9 — the certified self-service boarding pipeline correctly
  // stays gated (matching the launch-coherence authority), but its value text no
  // longer implies zero boarding capability exists — it names the two write paths
  // that already work today outside that certification gate.
  it('portfolio-boarding reads gated for the certified pipeline, but names the live manual/auto-board paths', () => {
    const { container } = render(<ManagerOperatingCommandCenter />);
    const el = container.querySelector<HTMLElement>('[data-operating-domain="portfolio-boarding"]');
    expect(el).not.toBeNull();
    const value = el!.querySelector('[data-domain-value]');
    expect(value?.textContent).toMatch(/gated/i);
    expect(value?.textContent).toMatch(/manual board \+ auto-board already live/i);
    expect(within(el!).getByText('gated')).toBeInTheDocument(); // status badge
    expect(within(el!).getAllByText(/Board existing loan/).length).toBeGreaterThan(0);
  });

  // Factory Arc Phase 10 — the certified automated borrower-send pipeline
  // correctly stays gated (matching the launch-coherence authority), but its
  // value text no longer implies zero borrower-communication capability
  // exists — it names the live drafting/copy/handoff paths that already
  // work today outside that certification gate.
  it('borrower-communication reads gated for the certified pipeline, but names the live drafting/copy/handoff paths', () => {
    const { container } = render(<ManagerOperatingCommandCenter />);
    const el = container.querySelector<HTMLElement>('[data-operating-domain="borrower-communication"]');
    expect(el).not.toBeNull();
    const value = el!.querySelector('[data-domain-value]');
    expect(value?.textContent).toMatch(/gated/i);
    expect(value?.textContent).toMatch(/already live/i);
    expect(within(el!).getByText('gated')).toBeInTheDocument(); // status badge
    expect(within(el!).getAllByText(/draft/i).length).toBeGreaterThan(0);
  });

  // Factory Arc Phase 11 — new-deal-intake is the one domain that reads
  // "operational" honestly today (the real pilot switch, BANKER_CREATE_PILOT_ENABLED,
  // is on), unlike the other live-write domains above which correctly stay
  // gated. Its badge must never render the raw "gated" token.
  it('new-deal-intake reads operational, "Create enabled", and never a "gated" badge', () => {
    const { container } = render(<ManagerOperatingCommandCenter />);
    const el = container.querySelector<HTMLElement>('[data-operating-domain="new-deal-intake"]');
    expect(el).not.toBeNull();
    const value = el!.querySelector('[data-domain-value]');
    expect(value?.textContent).toBe('Create enabled');
    expect(within(el!).getByText('operational')).toBeInTheDocument();
    expect(within(el!).queryByText('gated')).toBeNull();
  });
});

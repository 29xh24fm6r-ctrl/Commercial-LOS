// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagerData } from './ManagerDataProvider';

vi.mock('./ManagerDataProvider', () => ({
  useManagerData: vi.fn(),
}));

import { useManagerData } from './ManagerDataProvider';
import { ManagerOperatingCommandCenter } from './ManagerOperatingCommandCenter';

const useManagerDataMock = vi.mocked(useManagerData);

// Factory Arc Phase 14 — ManagerOperatingCommandCenter now reads useManagerData()
// (teamPipeline/teamBankers) to show real live counts on two domains, mirroring
// the established mocking convention every other useManagerData()-consuming
// manager card test already uses (see ManagerAutopilotRollup.test.tsx). Default
// to the loading state so pre-existing assertions about the STATIC domains
// (label/badge/anchors/etc.) are unaffected by whether live data resolved.
function loadingManagerData(): ManagerData {
  return {
    teamPipeline: { kind: 'loading' },
    teamBankers: { kind: 'loading' },
    teamTasks: { kind: 'loading' },
    teamDocuments: { kind: 'loading' },
    teamMemos: { kind: 'loading' },
    teamMemoSections: { kind: 'loading' },
  };
}

describe('Phase 233 — Manager Operating Command Center', () => {
  beforeEach(() => {
    useManagerDataMock.mockReturnValue(loadingManagerData());
  });

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

  it('points managers to existing supervision anchors, shown as friendly names (not raw anchor ids)', () => {
    render(<ManagerOperatingCommandCenter />);
    const anchors = screen.getByRole('region', { name: /Supervision anchors/i });

    // Factory Arc Phase 15 — the raw kebab-case anchor ids used to render
    // verbatim; the visible list now shows a friendly display name for each.
    expect(within(anchors).getByText('Manager Workflow Launch Readiness panel')).toBeInTheDocument();
    expect(within(anchors).getByText('CRM manager working surface')).toBeInTheDocument();
    expect(within(anchors).queryByText('manager-workflow-launch-readiness')).toBeNull();
    expect(within(anchors).queryByText('crm-manager-working-surface')).toBeNull();
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
      expect(within(el).getByText('Pending certification')).toBeInTheDocument(); // status badge (friendly label, not the raw "gated" token)
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
    expect(within(el!).getByText('Pending certification')).toBeInTheDocument(); // status badge (friendly label, not the raw "gated" token)
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
    expect(within(el!).getByText('Pending certification')).toBeInTheDocument(); // status badge (friendly label, not the raw "gated" token)
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
    expect(within(el!).getByText('Live')).toBeInTheDocument(); // status badge (friendly label, not the raw "operational" token)
    expect(within(el!).queryByText('Pending certification')).toBeNull();
  });

  // Factory Arc Phase 14 — pipeline-supervision and banker-workload show real
  // team-scoped counts once ManagerDataProvider's teamPipeline/teamBankers
  // resolve, instead of the static, uninformative "Active" placeholder.
  it('shows real live counts once team data resolves', () => {
    useManagerDataMock.mockReturnValue({
      ...loadingManagerData(),
      teamPipeline: {
        kind: 'ready',
        data: [
          { id: 'd1', name: 'Deal 1', clientName: 'A', stage: 'Underwriting', status: 'Active', amount: 100, targetCloseDate: undefined, stageEntryDate: undefined, modifiedOn: undefined, assignedBankerId: 'b1', assignedBankerName: 'B', collateralSummary: undefined, productType: undefined, loanStructure: undefined, pricingType: undefined },
        ],
      },
      teamBankers: {
        kind: 'ready',
        data: [{ id: 'b1', fullName: 'B', email: undefined, roleType: undefined, active: true }],
      },
    });
    const { container } = render(<ManagerOperatingCommandCenter />);
    const pipeline = container.querySelector('[data-operating-domain="pipeline-supervision"] [data-domain-value]');
    const workload = container.querySelector('[data-operating-domain="banker-workload"] [data-domain-value]');
    expect(pipeline?.textContent).toMatch(/1 active deal/);
    expect(workload?.textContent).toMatch(/1 active banker/);
  });

  it('falls back to the plain "Active" label while team data is still loading (no fabricated count)', () => {
    const { container } = render(<ManagerOperatingCommandCenter />);
    const pipeline = container.querySelector('[data-operating-domain="pipeline-supervision"] [data-domain-value]');
    const workload = container.querySelector('[data-operating-domain="banker-workload"] [data-domain-value]');
    expect(pipeline?.textContent).toBe('Active');
    expect(workload?.textContent).toBe('Active');
  });
});

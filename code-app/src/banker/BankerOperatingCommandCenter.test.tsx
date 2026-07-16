// @vitest-environment jsdom
import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BankerOperatingCommandCenter } from './BankerOperatingCommandCenter';
import type { BankerPersonalActivity } from '../shared/analytics/bankerPersonalActivity';
import type { PipelineDeal } from './dealQueries';

function kpis(over: Partial<BankerPersonalActivity> = {}): BankerPersonalActivity {
  return {
    activeDeals: 0, totalAmount: 0, dealsMissingAmount: 0,
    closingSoonCount: 0, pastTargetCloseCount: 0, stageAtRiskCount: 0, missingStageEntryDateCount: 0,
    openTaskCount: 0, overdueTaskCount: 0,
    outstandingDocumentCount: 0, pendingReviewDocumentCount: 0,
    draftMemoCount: 0, inUnderwritingCount: 0, staleActivityCount: 0, urgentItemCount: 0,
    ...over,
  };
}

function deal(over: Partial<PipelineDeal> = {}): PipelineDeal {
  return {
    id: 'd', name: 'Deal', clientName: undefined, stage: 'Intake', status: 'Open',
    amount: 0, targetCloseDate: undefined, lastActivityOn: undefined, stageEntryDate: undefined,
    isClosed: false, ...over,
  } as PipelineDeal;
}

const region = () => screen.getByRole('region', { name: /Banker Operating Command Center/i });

describe('Banker Operating Command Center — action cockpit', () => {
  it('leads with the banker’s work, not subsystem status paragraphs', () => {
    render(<BankerOperatingCommandCenter kpis={kpis({ urgentItemCount: 1 })} />);
    expect(region()).toBeInTheDocument();
    expect(within(region()).getByRole('heading', { name: /What needs you/i })).toBeInTheDocument();
    // The old governance posture paragraph is gone from the lead.
    expect(screen.queryByText(/relationship context are available/i)).not.toBeInTheDocument();
  });

  it('renders real priority work as actionable rows that navigate to the right tab', () => {
    const onSelectTab = vi.fn();
    render(
      <BankerOperatingCommandCenter
        kpis={kpis({ urgentItemCount: 1, outstandingDocumentCount: 2 })}
        onSelectTab={onSelectTab}
      />,
    );
    const urgent = screen.getByRole('button', { name: /urgent item/i });
    expect(urgent).toHaveAttribute('data-work-tone', 'urgent'); // the one Seal-Red accent
    fireEvent.click(urgent);
    expect(onSelectTab).toHaveBeenCalledWith('my-alerts');

    fireEvent.click(screen.getByRole('button', { name: /need due diligence/i }));
    expect(onSelectTab).toHaveBeenCalledWith('due-diligence');
  });

  it('shows an honest "you’re clear" empty state when nothing needs attention', () => {
    render(<BankerOperatingCommandCenter kpis={kpis()} />);
    expect(screen.getByText(/you’re clear/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /urgent/i })).not.toBeInTheDocument();
  });

  it('shows pipeline-at-a-glance from real deals (honest single bucket when unseeded)', () => {
    render(
      <BankerOperatingCommandCenter
        kpis={kpis()}
        deals={[deal({ id: '1' }), deal({ id: '2' }), deal({ id: '3' })]}
      />,
    );
    const pipeline = screen.getByRole('region', { name: /Pipeline at a glance/i });
    expect(within(pipeline).getByText(/active deals/i)).toBeInTheDocument();
    const intake = pipeline.querySelector('[data-stage-group="Intake"]'); // honest stage bucket
    expect(intake).not.toBeNull();
    expect(intake!.textContent).toMatch(/Intake/);
    expect(intake!.textContent).toMatch(/3/); // all three deals at the one real stage
  });

  it('pipeline speaks the canonical stage vocabulary (stored codes display as ratified names)', () => {
    // Fuses the stage-reconciliation intent into the redesign: a deal stored at the CODE "INTAKE"
    // and one at "CREDIT_APPROVAL" render as their ratified canonical display names, never raw codes.
    render(
      <BankerOperatingCommandCenter
        kpis={kpis()}
        deals={[deal({ id: '1', stage: 'INTAKE' }), deal({ id: '2', stage: 'CREDIT_APPROVAL' })]}
      />,
    );
    const pipeline = screen.getByRole('region', { name: /Pipeline at a glance/i });
    expect(pipeline.querySelector('[data-stage-group="Intake"]')).not.toBeNull();
    expect(pipeline.querySelector('[data-stage-group="Credit Approval"]')).not.toBeNull();
    expect(pipeline.textContent).not.toMatch(/INTAKE|CREDIT_APPROVAL/); // codes never shown raw
  });

  // Factory Arc Phase 3: the old global gate/certification pill strip is retired outright, not
  // demoted — it answered a release-governance question ("which feature flags are true"), not an
  // operational one. It's replaced by live Portfolio & Workflow Health tiles derived from this
  // banker's own kpis, each a real navigable count, never an invented/global label.
  describe('Portfolio & Workflow Health (replaces the retired System status strip)', () => {
    const health = () => screen.getByRole('region', { name: /Portfolio and workflow health/i });

    function tile(label: string): HTMLElement {
      const el = health().querySelector<HTMLElement>(`[data-health-tile="${label}"]`);
      expect(el, `health tile ${label}`).not.toBeNull();
      return el!;
    }

    it('renders a live count for every health metric sourced from kpis', () => {
      render(
        <BankerOperatingCommandCenter
          kpis={kpis({
            activeDeals: 4,
            totalAmount: 1_200_000,
            outstandingDocumentCount: 3,
            pendingReviewDocumentCount: 2,
            overdueTaskCount: 1,
            draftMemoCount: 5,
            closingSoonCount: 6,
            staleActivityCount: 7,
          })}
        />,
      );
      expect(tile('Active deals').textContent).toMatch(/4/);
      expect(tile('Active deals').textContent).toMatch(/\$1\.2M/);
      expect(tile('Documents outstanding').textContent).toMatch(/3/);
      expect(tile('Documents awaiting review').textContent).toMatch(/2/);
      expect(tile('Tasks overdue').textContent).toMatch(/1/);
      expect(tile('Credit memos in draft').textContent).toMatch(/5/);
      expect(tile('Closing in 14 days').textContent).toMatch(/6/);
      expect(tile('Stale 14+ days').textContent).toMatch(/7/);
    });

    it('never shows global gate/certification language', () => {
      render(<BankerOperatingCommandCenter kpis={kpis()} />);
      expect(screen.queryByText(/gated/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/certification|certified/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/DRY_RUN|LIVE\b/)).not.toBeInTheDocument();
      expect(screen.queryByText(/\bpilot\b/i)).not.toBeInTheDocument();
      expect(health().querySelector('[data-operating-domain]')).toBeNull();
    });

    it('clicking a tile navigates to the right tab', () => {
      const onSelectTab = vi.fn();
      render(
        <BankerOperatingCommandCenter
          kpis={kpis({ outstandingDocumentCount: 1, overdueTaskCount: 1, activeDeals: 1 })}
          onSelectTab={onSelectTab}
        />,
      );
      fireEvent.click(tile('Active deals'));
      expect(onSelectTab).toHaveBeenCalledWith('active-deals');
      fireEvent.click(tile('Documents outstanding'));
      expect(onSelectTab).toHaveBeenCalledWith('due-diligence');
      fireEvent.click(tile('Tasks overdue'));
      expect(onSelectTab).toHaveBeenCalledWith('tasks');
    });

    it('shows a loading state instead of stale or zeroed tiles', () => {
      render(<BankerOperatingCommandCenter kpis={null} loading />);
      expect(within(health()).getByText(/Loading portfolio health/i)).toBeInTheDocument();
      expect(health().querySelector('[data-health-tile]')).toBeNull();
    });

    it('shows an honest, local error state when the health query fails', () => {
      render(<BankerOperatingCommandCenter kpis={null} healthError="network timeout" />);
      const alert = within(health()).getByRole('alert');
      expect(alert.textContent).toMatch(/Could not load portfolio health/i);
      expect(alert.textContent).toMatch(/network timeout/i);
      expect(health().querySelector('[data-health-tile]')).toBeNull();
    });

    it('shows an honest unavailable state when kpis are absent without an error', () => {
      render(<BankerOperatingCommandCenter kpis={null} />);
      expect(within(health()).getByText(/Portfolio health is unavailable right now/i)).toBeInTheDocument();
    });
  });

  it('introduces no write primitive (navigation only)', () => {
    const src = readFileSync(resolve(__dirname, 'BankerOperatingCommandCenter.tsx'), 'utf8');
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
  });
});

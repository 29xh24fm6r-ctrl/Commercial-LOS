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

  // The governance truth is DEMOTED, not deleted: every gated/Read-only fact from the old cards
  // survives in the System status strip, and a gated live-write domain still never reads "enabled".
  describe('governance honesty preserved (demoted to the status strip)', () => {
    function pill(id: string): HTMLElement {
      const el = region().querySelector<HTMLElement>(`[data-operating-domain="${id}"]`);
      expect(el, `status pill ${id}`).not.toBeNull();
      return el!;
    }

    it('exposes every domain from the old cards as a status pill', () => {
      render(<BankerOperatingCommandCenter kpis={kpis()} />);
      for (const id of [
        'crm', 'loan-workflow', 'daily-actions', 'new-deal', 'document-readiness',
        'borrower-communications', 'crm-writeback', 'portfolio-handoff', 'email-mode',
      ]) {
        expect(pill(id)).toBeTruthy();
      }
    });

    it.each([
      ['borrower-communications', 'Send gated'],
      ['document-readiness', 'Generation gated'],
      ['portfolio-handoff', 'Boarding persistence gated'],
      ['new-deal', 'Create gated'],
    ])('%s reads gated and never "enabled"', (id, gatedValue) => {
      render(<BankerOperatingCommandCenter kpis={kpis()} />);
      const value = pill(id).querySelector('[data-domain-value]');
      expect(value?.textContent).toBe(gatedValue);
      expect(value?.textContent).not.toMatch(/\benabled\b/i);
    });

    it('carries the full governance detail in a tooltip (discoverable, not headline)', () => {
      render(<BankerOperatingCommandCenter kpis={kpis()} />);
      expect(pill('borrower-communications').getAttribute('title')).toMatch(/fail-closed|gated/i);
    });

    it('surfaces the email transport mode (DRY_RUN) honestly', () => {
      render(<BankerOperatingCommandCenter kpis={kpis()} />);
      expect(within(pill('email-mode')).getByText(/DRY_RUN|LIVE/)).toBeInTheDocument();
    });
  });

  it('introduces no write primitive (navigation only)', () => {
    const src = readFileSync(resolve(__dirname, 'BankerOperatingCommandCenter.tsx'), 'utf8');
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Phase 130A — DealCopilotAssist (deal cockpit Copilot connector).
 *
 * Pins:
 *   - renders the CopilotAssistPanel with the not-configured posture;
 *   - the deal-context builder receives ONLY the data already loaded by
 *     DealDataProvider + the shared intelligence VM (no new query);
 *   - the local summary reflects that authorized context (deal name,
 *     client, blocker label) and never claims AI;
 *   - no write affordance (no Send / Complete / Request buttons).
 */

const { useDealDataMock, useOptionalDealIntelligenceMock } = vi.hoisted(() => ({
  useDealDataMock: vi.fn(),
  useOptionalDealIntelligenceMock: vi.fn(),
}));

vi.mock('../deals/DealDataProvider', () => ({
  useDealData: useDealDataMock,
}));
vi.mock('../shared/dealIntelligenceContext', () => ({
  useOptionalDealIntelligence: useOptionalDealIntelligenceMock,
}));

import { DealCopilotAssist } from './DealCopilotAssist';
import * as adapterModule from './copilotAssistantAdapter';
import type { DealDetail } from '../deals/dealQueries';
import type { DealTasksResult } from '../deals/dealTaskQueries';
import type { DealDocumentsResult } from '../deals/dealDocumentQueries';
import type { DealIntelligenceViewModel } from '../shared/dealIntelligenceViewModel';

const DEAL = {
  id: 'deal-guid-1111-2222-3333-444455556666',
  name: 'Riverside Mfg WC',
  clientName: 'Riverside Mfg',
  stage: 'Underwriting',
  status: 'Active',
  amount: 4_500_000,
} as unknown as DealDetail;

const TASKS = {
  open: [
    { id: 't1', title: 'Collect PFS', completed: false },
    { id: 't2', title: 'Order appraisal', completed: false },
  ],
  completed: [{ id: 't3', title: 'Intake call', completed: true }],
} as unknown as DealTasksResult;

const DOCS = {
  outstanding: [{ id: 'd1', name: 'Tax returns', status: 'outstanding' }],
  received: [{ id: 'd2', name: 'Bank statements', status: 'received' }],
  reviewed: [],
} as unknown as DealDocumentsResult;

const VM = {
  blockerStatus: 'at-risk',
  blockerSignals: [
    { id: 'b1', severity: 'at-risk', label: 'Missing appraisal', detail: '' },
  ],
} as unknown as DealIntelligenceViewModel;

function setReady() {
  useDealDataMock.mockReturnValue({
    deal: DEAL,
    tasks: { kind: 'ready', data: TASKS },
    documents: { kind: 'ready', data: DOCS },
    creditMemo: { kind: 'loading' },
    activity: { kind: 'loading' },
    refresh: vi.fn(),
  });
  useOptionalDealIntelligenceMock.mockReturnValue(VM);
}

beforeEach(() => {
  useDealDataMock.mockReset();
  useOptionalDealIntelligenceMock.mockReset();
  adapterModule._setCopilotAdapterForTest(
    adapterModule.createNotConfiguredAdapter(),
  );
  setReady();
});

describe('Phase 130A — DealCopilotAssist', () => {
  it('renders the Copilot Assist panel', () => {
    render(<DealCopilotAssist />);
    expect(screen.getByText('Copilot Assist')).toBeInTheDocument();
  });

  it('opens expanded by default on the deal cockpit (quick actions visible without a click)', () => {
    render(<DealCopilotAssist />);
    // Expanded → the toggle offers Collapse and the quick actions show.
    expect(screen.getByText('Collapse')).toBeInTheDocument();
    expect(screen.getByText('Summarize deal')).toBeInTheDocument();
    expect(screen.getByText('Explain blockers')).toBeInTheDocument();
  });

  it('shows a visible "Not configured" status pill', () => {
    render(<DealCopilotAssist />);
    expect(screen.getByText('Not configured')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Copilot connector not configured'),
    ).toBeInTheDocument();
  });

  it('clearly states the connector is not configured', () => {
    render(<DealCopilotAssist />);
    expect(
      screen.getByText(/Copilot connector not configured/i),
    ).toBeInTheDocument();
  });

  it('states the assistant is read-only and cannot change data or send communications', () => {
    render(<DealCopilotAssist />);
    expect(
      screen.getByText(
        /Read-only assistant\. Cannot approve, change data, or send communications/i,
      ),
    ).toBeInTheDocument();
  });

  it('summarizes the deal from already-loaded authorized context (no AI claim)', () => {
    render(<DealCopilotAssist />);
    fireEvent.click(screen.getByText('Summarize deal'));
    expect(screen.getByText(/Riverside Mfg WC/)).toBeInTheDocument();
    expect(screen.getByText(/Riverside Mfg/)).toBeInTheDocument();
    // open task count (2) + outstanding doc count (1) come from the
    // already-loaded provider data via buildDealCopilotContext.
    expect(screen.getByText(/2 open of 3 total/)).toBeInTheDocument();
    expect(screen.getByText(/1 outstanding of 2 total/)).toBeInTheDocument();
    expect(
      screen.getByText(/Not AI-generated\. Not a recommendation/),
    ).toBeInTheDocument();
  });

  it('explains blockers using the shared intelligence VM blocker labels', () => {
    render(<DealCopilotAssist />);
    fireEvent.click(screen.getByText('Explain blockers'));
    expect(screen.getByText(/Missing appraisal/)).toBeInTheDocument();
  });

  it('introduces NO write affordance (no Send / Complete / Request buttons)', () => {
    render(<DealCopilotAssist />);
    const buttons = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    for (const label of buttons) {
      expect(label).not.toMatch(/send/i);
      expect(label).not.toMatch(/complete/i);
      expect(label).not.toMatch(/request document/i);
      expect(label).not.toMatch(/approve/i);
    }
  });

  it('does not leak a raw GUID into the rendered summary', () => {
    render(<DealCopilotAssist />);
    fireEvent.click(screen.getByText('Summarize deal'));
    // The deal record id is a GUID; the builder must never surface it.
    expect(
      screen.queryByText(/deal-guid-1111-2222-3333-444455556666/),
    ).not.toBeInTheDocument();
  });
});

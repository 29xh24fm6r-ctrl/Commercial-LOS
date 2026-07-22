// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CreditMemoData } from '../deals/creditMemoQueries';
import type { DealDocumentsResult } from '../deals/dealDocumentQueries';
import type { DealTasksResult } from '../deals/dealTaskQueries';
import type { DealData } from '../deals/DealDataProvider';
import type { LoanWorkflowState } from './loanWorkflowTypes';
import type { BankerIdentity } from '../banker/BankerContext';

vi.mock('../deals/DealDataProvider', () => ({
  useDealData: vi.fn(),
}));
vi.mock('../banker/BankerContext', () => ({
  useOptionalBanker: vi.fn(),
}));
vi.mock('../deals/checklistLiveWriteDeps', () => ({
  buildLiveChecklistRowTransport: vi.fn(() => ({ createChecklistRow: vi.fn() })),
  buildLiveChecklistAuditSink: vi.fn(() => ({ write: vi.fn() })),
}));

import { useDealData } from '../deals/DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import { buildLiveChecklistRowTransport, buildLiveChecklistAuditSink } from '../deals/checklistLiveWriteDeps';
import { GenerateWorkflowChecklistButton } from './GenerateWorkflowChecklistButton';

const useDealDataMock = vi.mocked(useDealData);
const useOptionalBankerMock = vi.mocked(useOptionalBanker);
const rowTransportFactoryMock = vi.mocked(buildLiveChecklistRowTransport);
const auditSinkFactoryMock = vi.mocked(buildLiveChecklistAuditSink);

function dealData(): DealData {
  return {
    deal: {
      id: 'deal-1',
      name: 'Acme Expansion',
      clientName: 'Acme',
      stage: 'Underwriting',
      status: 'Active',
      amount: 2_000_000,
      bankerName: 'Banker',
      targetCloseDate: '2026-08-31',
      productType: 'Term Loan',
      loanStructure: 'Senior secured',
      customerType: 'C&I',
      industry: 'Manufacturing',
      guarantorStructure: 'Corporate',
      pricingType: 'Floating',
      spreadIndex: 'SOFR',
      spreadMargin: 250,
      collateralSummary: 'Equipment',
      createdOn: '2026-01-01',
      stageEntryDate: '2026-06-01',
      isClosed: false,
    },
    tasks: { kind: 'ready', data: { open: [], completed: [] } satisfies DealTasksResult },
    documents: {
      kind: 'ready',
      data: { outstanding: [], received: [], reviewed: [] } satisfies DealDocumentsResult,
    },
    creditMemo: { kind: 'ready', data: { memos: [], sections: [] } satisfies CreditMemoData },
    activity: { kind: 'ready', data: [] },
    refresh: vi.fn(),
  };
}

function banker(overrides: Partial<BankerIdentity> = {}): BankerIdentity {
  return {
    bankerId: 'b-1',
    fullName: 'Matt Paller',
    email: 'mpaller@oldglorybank.com',
    systemUserId: 'su-1',
    writeDisabledReason: undefined,
    ...overrides,
  } as BankerIdentity;
}

function workflow(): LoanWorkflowState {
  return {
    currentStage: { id: 'UNDERWRITING', label: 'Underwriting' },
  } as unknown as LoanWorkflowState;
}

beforeEach(() => {
  useDealDataMock.mockReset();
  useOptionalBankerMock.mockReset();
  rowTransportFactoryMock.mockClear();
  auditSinkFactoryMock.mockClear();
});

describe('GenerateWorkflowChecklistButton', () => {
  it('Remediation 2026-07-22 (Workstream G) — with no deps override (live gate off), shows an honest disabled notice instead of a dead active button, and never leaks the internal flag name', () => {
    useDealDataMock.mockReturnValue(dealData());
    useOptionalBankerMock.mockReturnValue(banker());
    render(<GenerateWorkflowChecklistButton workflow={workflow()} dealId="deal-1" />);

    expect(screen.queryByRole('button', { name: 'Generate checklist' })).toBeNull();
    const notice = screen.getByRole('status');
    expect(notice.textContent).not.toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED/);
    expect(notice.textContent).toMatch(/not yet enabled/i);
    // Never builds the live write dependency for a button that can't succeed.
    expect(rowTransportFactoryMock).not.toHaveBeenCalled();
    expect(auditSinkFactoryMock).not.toHaveBeenCalled();
  });

  it('uses an injected deps override instead of building live deps (test seam)', async () => {
    useDealDataMock.mockReturnValue(dealData());
    useOptionalBankerMock.mockReturnValue(banker());
    const createMissingRows = vi.fn().mockResolvedValue({ kind: 'success', detail: '2 checklist row(s) created.' });
    render(
      <GenerateWorkflowChecklistButton
        workflow={workflow()}
        dealId="deal-1"
        deps={{ createMissingRows }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Generate checklist' }));

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(screen.getByRole('status').textContent).toBe('2 checklist row(s) created.');
    expect(createMissingRows).toHaveBeenCalled();
    expect(rowTransportFactoryMock).not.toHaveBeenCalled();
    expect(auditSinkFactoryMock).not.toHaveBeenCalled();
  });

  it('is unauthorized when no banker context is present', async () => {
    useDealDataMock.mockReturnValue(dealData());
    useOptionalBankerMock.mockReturnValue(null);
    const createMissingRows = vi.fn();
    render(
      <GenerateWorkflowChecklistButton workflow={workflow()} dealId="deal-1" deps={{ createMissingRows }} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Generate checklist' }));

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(screen.getByRole('status').textContent).toMatch(/not authorized/i);
    expect(createMissingRows).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DealData } from './DealDataProvider';
import type { BankerIdentity } from '../banker/BankerContext';
import type { DealDocumentsResult } from './dealDocumentQueries';
import type { DealTasksResult } from './dealTaskQueries';
import type { CreditMemoData } from './creditMemoQueries';

/**
 * Regression coverage for the DocumentChecklistPilotPanel live-wiring fix:
 * DealDocuments.tsx used to mount the panel with no onGenerate/
 * generateActionEnabled at all, so the "Generate checklist" control stayed
 * disabled forever regardless of DOCUMENT_CHECKLIST_GENERATION_ENABLED /
 * DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED. DealDocuments now injects a
 * real governed callback (backed by checklistWriteDependency +
 * checklistLiveWriteDeps) and ANDs both gates at the call site. This proves
 * the button only renders enabled on the live deal workspace when BOTH gates
 * are true; either gate false keeps it disabled, exactly like the shipped
 * default (both false).
 */

const flagState = vi.hoisted(() => ({ ui: false, runtime: false }));

vi.mock('./documentChecklistPilotConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./documentChecklistPilotConfig')>();
  return {
    ...actual,
    get DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED() {
      return flagState.ui;
    },
  };
});

vi.mock('./dealOriginationFeatureFlags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dealOriginationFeatureFlags')>();
  return {
    ...actual,
    get DOCUMENT_CHECKLIST_GENERATION_ENABLED() {
      return flagState.runtime;
    },
  };
});

// Full replacement (no importOriginal): the real DealDataProvider/BankerContext
// modules transitively pull in the generated Dataverse SDK for live loading,
// which this render-only test never needs and which is unavailable in the
// test environment. DealDocuments.tsx only consumes the named hook from each.
vi.mock('./DealDataProvider', () => ({ useDealData: vi.fn() }));
vi.mock('../banker/BankerContext', () => ({ useOptionalBanker: vi.fn() }));
// DealDocuments.tsx statically imports these sibling action modules for its
// OTHER document actions (request/receive/review/task); each of them, in
// turn, statically imports a generated Dataverse service. None of that is
// exercised by this gate-matrix test (no button in those flows is clicked),
// so they are stubbed out purely to keep the SDK out of the static import
// graph, matching this codebase's established dynamic-import convention.
vi.mock('./documentActions', () => ({
  markDocumentReceived: vi.fn(),
  markDocumentReviewed: vi.fn(),
  requestDocument: vi.fn(),
}));
vi.mock('./sendDocumentRequestEmail', () => ({ sendDocumentRequestEmail: vi.fn() }));
vi.mock('./prepareDocumentRequestHandoff', () => ({ prepareDocumentRequestHandoff: vi.fn() }));
vi.mock('./dealTaskActions', () => ({ createDocumentReviewTask: vi.fn() }));

import { useDealData } from './DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import { DealDocuments } from './DealDocuments';

const useDealDataMock = vi.mocked(useDealData);
const useOptionalBankerMock = vi.mocked(useOptionalBanker);

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

function banker(): BankerIdentity {
  return {
    bankerId: 'b-1',
    fullName: 'Matt Paller',
    email: 'mpaller@oldglorybank.com',
    systemUserId: 'su-1',
    writeDisabledReason: undefined,
  } as BankerIdentity;
}

describe('DealDocuments — checklist generation gate matrix (live wiring regression)', () => {
  beforeEach(() => {
    useDealDataMock.mockReturnValue(dealData());
    useOptionalBankerMock.mockReturnValue(banker());
    flagState.ui = false;
    flagState.runtime = false;
  });

  it('both gates true + live dependencies present -> the live deal workspace renders an enabled Generate checklist control', () => {
    flagState.ui = true;
    flagState.runtime = true;
    render(<DealDocuments />);
    expect(screen.getByRole('button', { name: 'Generate checklist' })).not.toBeDisabled();
  });

  it('UI action gate false, runtime gate true -> stays disabled', () => {
    flagState.ui = false;
    flagState.runtime = true;
    render(<DealDocuments />);
    expect(screen.getByRole('button', { name: /generate checklist/i })).toBeDisabled();
  });

  it('UI action gate true, runtime gate false -> stays disabled', () => {
    flagState.ui = true;
    flagState.runtime = false;
    render(<DealDocuments />);
    expect(screen.getByRole('button', { name: /generate checklist/i })).toBeDisabled();
  });

  it('both gates false (the shipped default) -> stays disabled', () => {
    render(<DealDocuments />);
    expect(screen.getByRole('button', { name: /generate checklist/i })).toBeDisabled();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { BankerWorkQueueData, WorkQueueDocumentRow } from './workQueueQueries';

/**
 * Phase 120 — BankerDueDiligenceView tests.
 *
 * Pins:
 *   - Tab renders for an entitled banker.
 *   - Honest empty/unavailable state when no docs are loaded.
 *   - No governed-write button (no Request / Receive / Review action
 *     surfaced on this tab — those live on MyWorkQueue + DealDocuments).
 *   - Rows render from real document rows when present.
 *   - No Phase 110 forbidden vocabulary in DOM.
 *   - Static source contains no Office365OutlookService import,
 *     no SendEmailV2 callsite, no sendXEmail import, no markDocument*
 *     governed-write action import.
 */

vi.mock('./workQueueQueries', () => ({
  loadBankerWorkQueueData: vi.fn(),
}));

vi.mock('./BankerContext', () => ({
  useBanker: () => ({
    bankerId: 'banker-1',
    fullName: 'Matt Paller',
    email: 'mpaller@oldglorybank.com',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
  }),
}));

import { loadBankerWorkQueueData } from './workQueueQueries';
import { BankerDueDiligenceView } from './BankerDueDiligenceView';

const loadMock = vi.mocked(loadBankerWorkQueueData);

function emptyData(): BankerWorkQueueData {
  return {
    deals: [],
    tasks: [],
    outstandingDocuments: [],
    pendingReviewDocuments: [],
    memos: [],
    memoSections: [],
  };
}

function doc(overrides: Partial<WorkQueueDocumentRow>): WorkQueueDocumentRow {
  return {
    id: 'doc',
    dealId: 'd1',
    name: 'Sample Document',
    dueDate: undefined,
    requestDate: undefined,
    receivedDate: undefined,
    reviewer: undefined,
    uploaded: false,
    modifiedOn: undefined,
    ...overrides,
  };
}

function renderView() {
  return render(
    <MemoryRouter>
      <BankerDueDiligenceView />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  loadMock.mockReset();
});

describe('Phase 120 — BankerDueDiligenceView component', () => {
  it('renders the honest empty-state when no documents exist (no fabricated rows)', async () => {
    loadMock.mockResolvedValue(emptyData());
    renderView();

    await waitFor(() => {
      expect(
        screen.getByText(/Due diligence — documents across your active deals/i),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(/No outstanding or pending-review documents/i),
    ).toBeInTheDocument();
  });

  it('renders Outstanding + Pending review sections when real docs are loaded', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'Northwind WC',
        clientName: 'Northwind',
        stage: 'Underwriting',
        status: 'Active',
        amount: 1_000_000,
        targetCloseDate: undefined,
        lastActivityOn: undefined,
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    data.outstandingDocuments = [doc({ id: 'd-o', name: 'PFS' })];
    data.pendingReviewDocuments = [
      doc({ id: 'd-r', name: 'Tax Returns', receivedDate: '2026-05-15T00:00:00Z' }),
    ];
    loadMock.mockResolvedValue(data);
    renderView();

    await waitFor(() => {
      expect(screen.getByText('PFS')).toBeInTheDocument();
    });

    const outstanding = screen.getByRole('region', { name: /Outstanding documents/i });
    const pending = screen.getByRole('region', { name: /Pending-review documents/i });

    expect(within(outstanding).getByText('PFS')).toBeInTheDocument();
    expect(within(outstanding).getByText(/1 document/i)).toBeInTheDocument();

    expect(within(pending).getByText('Tax Returns')).toBeInTheDocument();
    expect(within(pending).getByText(/1 document/i)).toBeInTheDocument();
  });

  it('does NOT render any governed-write action button (Request / Mark Received / Mark Reviewed all absent)', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'Northwind WC',
        clientName: 'Northwind',
        stage: 'Underwriting',
        status: 'Active',
        amount: 1_000_000,
        targetCloseDate: undefined,
        lastActivityOn: undefined,
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    data.outstandingDocuments = [doc({ id: 'd-o', name: 'PFS' })];
    loadMock.mockResolvedValue(data);
    renderView();

    await waitFor(() => {
      expect(screen.getByText('PFS')).toBeInTheDocument();
    });

    // No write-action buttons surfaced on this tab.
    expect(screen.queryByRole('button', { name: /Request/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mark received/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mark reviewed/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Create review task/i })).toBeNull();
  });

  it('renders honest error-state when the loader rejects', async () => {
    loadMock.mockRejectedValue(new Error('Dataverse timed out'));
    renderView();

    await waitFor(() => {
      expect(
        screen.getByText(/Could not load due-diligence documents/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Dataverse timed out/i)).toBeInTheDocument();
  });

  it('rendered DOM does NOT contain forbidden communication-lane vocabulary', async () => {
    loadMock.mockResolvedValue(emptyData());
    renderView();

    await waitFor(() => {
      expect(
        screen.getByText(/Due diligence — documents across your active deals/i),
      ).toBeInTheDocument();
    });

    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bdelivered\b/i);
    expect(text).not.toMatch(/\bemail\s+(sent|delivered)\b/i);
    expect(text).not.toMatch(/\bborrower\s+(?:was|has\s+been)\s+notified\b/i);
  });
});

describe('Phase 120 — BankerDueDiligenceView.tsx static-source pins', () => {
  const SRC = readFileSync(
    resolve(__dirname, 'BankerDueDiligenceView.tsx'),
    'utf8',
  );

  it('does NOT import Office365OutlookService directly', () => {
    expect(SRC).not.toMatch(/from\s+['"][^'"]*Office365OutlookService['"]/);
  });

  it('does NOT call SendEmailV2', () => {
    expect(SRC).not.toMatch(/SendEmailV2\s*\(/);
  });

  it('does NOT import any sendXEmail action', () => {
    expect(SRC).not.toMatch(/from\s+['"][^'"]*sendDocumentRequestEmail['"]/);
    expect(SRC).not.toMatch(/from\s+['"][^'"]*sendBorrowerUpdateEmail['"]/);
  });

  it('does NOT import any markDocument* governed-write action (read-only tab)', () => {
    expect(SRC).not.toMatch(/from\s+['"][^'"]*markDocumentReceived['"]/);
    expect(SRC).not.toMatch(/from\s+['"][^'"]*markDocumentReviewed['"]/);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { BankerWorkQueueData } from './workQueueQueries';

/**
 * Phase 120 — BankerActivityFeed tests.
 *
 * Pins:
 *   - Activity tab renders for an entitled banker (rendering does
 *     not throw inside <BankerProvider>).
 *   - Honest empty/unavailable copy when no real activity exists in
 *     the loaded work-queue data (no fabricated rows).
 *   - Honest empty when the load itself errors.
 *   - Real-data rows derive from modifiedon timestamps already on
 *     deals / tasks / documents / memos — no fabrication.
 *   - Sort is descending by timestamp; cap is 20 rows.
 *   - No Phase-110 forbidden communication vocabulary in the DOM.
 *   - Static source contains no Office365OutlookService import,
 *     no SendEmailV2 callsite, no sendXEmail action import.
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
import { BankerActivityFeed, deriveActivityRows } from './BankerActivityFeed';

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

function renderFeed() {
  return render(
    <MemoryRouter>
      <BankerActivityFeed />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  loadMock.mockReset();
});

describe('Phase 120 — BankerActivityFeed component', () => {
  it('renders the honest empty-state when the loader returns no activity (no fabricated rows)', async () => {
    loadMock.mockResolvedValue(emptyData());
    renderFeed();

    await waitFor(() => {
      expect(
        screen.getByText(/Recent updates across your active deals/i),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(/No recent updates on your active deals/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Deal$/)).toBeNull(); // no Deal-kind badge
    expect(screen.queryByText(/^Task$/)).toBeNull();
  });

  it('renders an honest error-state when the loader rejects (no fabricated rows on failure)', async () => {
    loadMock.mockRejectedValue(new Error('Dataverse query timed out'));
    renderFeed();

    await waitFor(() => {
      expect(
        screen.getByText(/Could not load recent updates/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Dataverse query timed out/i)).toBeInTheDocument();
  });

  it('renders an honest disclaimer that this is NOT the per-deal Activity Timeline', async () => {
    loadMock.mockResolvedValue(emptyData());
    renderFeed();

    await waitFor(() => {
      expect(
        screen.getByText(/Not the per-deal Activity Timeline/i),
      ).toBeInTheDocument();
    });
  });

  it('rendered DOM does NOT contain forbidden communication-lane vocabulary', async () => {
    loadMock.mockResolvedValue(emptyData());
    renderFeed();

    await waitFor(() => {
      expect(
        screen.getByText(/Recent updates across your active deals/i),
      ).toBeInTheDocument();
    });

    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bdelivered\b/i);
    expect(text).not.toMatch(/\bemail\s+(sent|delivered)\b/i);
    expect(text).not.toMatch(/\bborrower\s+(?:was|has\s+been)\s+notified\b/i);
  });
});

describe('Phase 120 — deriveActivityRows (pure derivation)', () => {
  function withDeals(): BankerWorkQueueData {
    return {
      deals: [
        {
          id: 'd1',
          name: 'Northwind WC',
          clientName: 'Northwind',
          stage: 'Underwriting',
          status: 'Active',
          amount: 1_000_000,
          targetCloseDate: undefined,
          lastActivityOn: '2026-05-20T10:00:00Z',
          stageEntryDate: undefined,
          isClosed: false,
          collateralSummary: undefined,
        },
      ],
      tasks: [
        {
          id: 't1',
          dealId: 'd1',
          title: 'Confirm PFS',
          dueDate: undefined,
          modifiedOn: '2026-05-22T10:00:00Z',
          completed: false,
        },
      ],
      outstandingDocuments: [
        {
          id: 'doc1',
          dealId: 'd1',
          name: 'Tax Returns',
          dueDate: undefined,
          requestDate: undefined,
          receivedDate: undefined,
          reviewer: undefined,
          uploaded: false,
          modifiedOn: '2026-05-18T10:00:00Z',
        },
      ],
      pendingReviewDocuments: [],
      memos: [],
      memoSections: [],
    };
  }

  it('emits one row per entity with a modifiedon, sorted descending by timestamp', () => {
    const rows = deriveActivityRows(withDeals());
    expect(rows.map((r) => r.kind)).toEqual(['Task', 'Deal', 'Document']);
  });

  it('skips entities with no modifiedon (no fabricated timestamps)', () => {
    const data = withDeals();
    data.deals[0].lastActivityOn = undefined;
    const rows = deriveActivityRows(data);
    // Deal row dropped; task + doc remain.
    expect(rows.find((r) => r.kind === 'Deal')).toBeUndefined();
    expect(rows.length).toBe(2);
  });

  it('skips entities with unparseable modifiedon (no fabricated timestamps)', () => {
    const data = withDeals();
    data.tasks[0].modifiedOn = 'not-an-iso';
    const rows = deriveActivityRows(data);
    expect(rows.find((r) => r.kind === 'Task')).toBeUndefined();
  });

  it('caps the result at 20 rows', () => {
    const data = emptyData();
    for (let i = 0; i < 30; i++) {
      data.tasks.push({
        id: `t${i}`,
        dealId: 'd1',
        title: `Task ${i}`,
        dueDate: undefined,
        modifiedOn: new Date(Date.now() - i * 60_000).toISOString(),
        completed: false,
      });
    }
    const rows = deriveActivityRows(data);
    expect(rows.length).toBe(20);
  });
});

describe('Phase 120 — BankerActivityFeed.tsx static-source pins', () => {
  const SRC = readFileSync(
    resolve(__dirname, 'BankerActivityFeed.tsx'),
    'utf8',
  );

  it('does NOT import Office365OutlookService directly (Phase 110 lock invariant)', () => {
    expect(SRC).not.toMatch(/from\s+['"][^'"]*Office365OutlookService['"]/);
  });

  it('does NOT call SendEmailV2 (Phase 110 single-callsite invariant)', () => {
    expect(SRC).not.toMatch(/SendEmailV2\s*\(/);
  });

  it('does NOT import any sendXEmail action', () => {
    expect(SRC).not.toMatch(/from\s+['"][^'"]*sendDocumentRequestEmail['"]/);
    expect(SRC).not.toMatch(/from\s+['"][^'"]*sendBorrowerUpdateEmail['"]/);
  });
});

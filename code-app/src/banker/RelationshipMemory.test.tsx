// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BankerWorkQueueData } from './workQueueQueries';

/**
 * Phase 76 — RelationshipMemory card rendering tests.
 *
 * Pins:
 *   - loading + failed (role=alert) + empty (no deals) states;
 *   - populated rendering: client header, active-deal count, total
 *     pipeline, last-activity, nearest-upcoming-close, open-asks
 *     line, attention badges, deal pills;
 *   - missing-client branch renders "(no borrower name on record)";
 *   - multi-deal client groups + sort order is reflected in DOM;
 *   - clicking a deal pill navigates;
 *   - conservative disclaimer renders verbatim phrases;
 *   - rendered DOM does NOT contain forbidden-vocabulary tokens
 *     (AI-generated / relationship score / risk score / predictive /
 *     guaranteed / approved / rejected / householding / complete
 *     relationship profile).
 *
 * SDK + role-side query loader are mocked at the module boundary;
 * the derivation primitive is exercised in
 * relationshipMemory.test.ts. This file verifies the card's
 * wiring + rendered invariants.
 */

vi.mock('./workQueueQueries', () => ({
  loadBankerWorkQueueData: vi.fn(),
}));

vi.mock('./BankerContext', () => ({
  useBanker: vi.fn(),
}));

const navigateSpy = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateSpy,
}));

import { loadBankerWorkQueueData } from './workQueueQueries';
import { useBanker } from './BankerContext';
import { RelationshipMemory } from './RelationshipMemory';

const loadMock = vi.mocked(loadBankerWorkQueueData);
const useBankerMock = vi.mocked(useBanker);

const NOW = new Date('2026-05-15T12:00:00Z');

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
function isoDaysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

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

beforeEach(() => {
  vi.clearAllMocks();
  useBankerMock.mockReturnValue({
    bankerId: 'banker-1',
    fullName: 'M. Paller',
    email: 'm@bank.test',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
  });
});

describe('RelationshipMemory — Phase 76', () => {
  it('renders the loading state initially', () => {
    loadMock.mockReturnValue(new Promise(() => {}));
    render(<RelationshipMemory />);
    expect(
      screen.getByRole('heading', { name: /relationship memory/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Loading client snapshot/i)).toBeInTheDocument();
  });

  it('renders the failed state via role="alert"', async () => {
    loadMock.mockRejectedValue(new Error('service unavailable'));
    render(<RelationshipMemory />);
    await waitFor(() =>
      expect(
        screen.getByText(/Could not load relationship memory/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders the empty state when the banker has no active deals', async () => {
    loadMock.mockResolvedValue(emptyData());
    render(<RelationshipMemory />);
    await screen.findByText(/No active deals assigned to you/i);
    expect(
      screen.getByText(/this snapshot will populate by client name/i),
    ).toBeInTheDocument();
  });

  it('renders a single-client snapshot with all the standard rows + pills', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'Acme RLOC',
        clientName: 'Acme Manufacturing',
        stage: 'Underwriting',
        status: 'Active',
        amount: 3_000_000,
        targetCloseDate: isoDaysFromNow(8),
        lastActivityOn: isoDaysAgo(2),
        stageEntryDate: isoDaysAgo(10),
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    data.tasks = [
      { id: 't1', dealId: 'd1', title: 'A', dueDate: isoDaysAgo(2), modifiedOn: undefined, completed: false },
      { id: 't2', dealId: 'd1', title: 'B', dueDate: undefined, modifiedOn: undefined, completed: false },
    ];
    data.outstandingDocuments = [
      { id: 'doc1', dealId: 'd1', name: 'PFS', dueDate: undefined, requestDate: undefined, receivedDate: undefined, reviewer: undefined, uploaded: false, modifiedOn: undefined },
    ];
    data.pendingReviewDocuments = [
      { id: 'doc2', dealId: 'd1', name: 'Tax', dueDate: undefined, requestDate: undefined, receivedDate: isoDaysAgo(10), reviewer: undefined, uploaded: false, modifiedOn: undefined },
    ];
    data.memos = [
      { id: 'm1', dealId: 'd1', name: 'X', statusKey: 'draft', generatedAt: '2026-04-01', modifiedOn: undefined, textPreview: undefined },
    ];
    loadMock.mockResolvedValue(data);

    render(<RelationshipMemory />);
    await screen.findByText('Acme Manufacturing');

    expect(screen.getByText(/1 active deal\b/i)).toBeInTheDocument();
    expect(screen.getByText(/Pipeline \$3,000,000/i)).toBeInTheDocument();

    // Open document requests + open tasks line.
    expect(screen.getByText(/Open document requests:/i)).toBeInTheDocument();
    expect(screen.getByText(/Open tasks:/i)).toBeInTheDocument();
    expect(screen.getByText(/1 overdue/i)).toBeInTheDocument();

    // Attention badges (pending-review past threshold, closing soon,
    // draft memo).
    expect(screen.getByText(/1 may require review/i)).toBeInTheDocument();
    expect(screen.getByText(/1 closing soon/i)).toBeInTheDocument();
    expect(screen.getByText(/1 draft memo/i)).toBeInTheDocument();

    // Deal pill renders + is a button.
    const pill = screen.getByRole('button', { name: /Open deal Acme RLOC/i });
    expect(pill).toBeInTheDocument();
    expect(pill.textContent).toMatch(/Underwriting/);
  });

  it('renders the missing-client placeholder when a deal carries no clientName', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'Orphan Deal',
        clientName: undefined,
        stage: 'Application',
        status: 'Active',
        amount: 100_000,
        targetCloseDate: undefined,
        lastActivityOn: undefined,
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    loadMock.mockResolvedValue(data);
    render(<RelationshipMemory />);
    await screen.findByText(/\(no borrower name on record\)/i);
  });

  it('groups two deals under the same normalized client name', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'Acme Term',
        clientName: 'Acme, LLC',
        stage: 'Closing',
        status: 'Active',
        amount: 1_000_000,
        targetCloseDate: isoDaysFromNow(3),
        lastActivityOn: isoDaysAgo(1),
        stageEntryDate: isoDaysAgo(5),
        isClosed: false,
        collateralSummary: undefined,
      },
      {
        id: 'd2',
        name: 'Acme RLOC',
        clientName: '  acme,    llc ',
        stage: 'Underwriting',
        status: 'Active',
        amount: 500_000,
        targetCloseDate: undefined,
        lastActivityOn: isoDaysAgo(7),
        stageEntryDate: isoDaysAgo(40),
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    loadMock.mockResolvedValue(data);
    render(<RelationshipMemory />);
    await screen.findByText('Acme, LLC');
    // Only one client header should appear (grouped).
    expect(screen.getAllByText('Acme, LLC').length).toBe(1);
    expect(screen.getByText(/2 active deals\b/i)).toBeInTheDocument();
    // Both deal pills present.
    expect(
      screen.getByRole('button', { name: /Open deal Acme Term/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Open deal Acme RLOC/i }),
    ).toBeInTheDocument();
  });

  it('clicking a deal pill navigates to the deal workspace', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'Click Me',
        clientName: 'Beta',
        stage: 'Underwriting',
        status: 'Active',
        amount: 100_000,
        targetCloseDate: undefined,
        lastActivityOn: isoDaysAgo(1),
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    loadMock.mockResolvedValue(data);
    render(<RelationshipMemory />);
    const pill = await screen.findByRole('button', {
      name: /Open deal Click Me/i,
    });
    const user = userEvent.setup();
    await user.click(pill);
    expect(navigateSpy).toHaveBeenCalledWith('/deals/d1');
  });

  it('renders the conservative disclaimer + forbidden-vocab scan passes', async () => {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'Plain',
        clientName: 'Plain Co',
        stage: 'Underwriting',
        status: 'Active',
        amount: 100_000,
        targetCloseDate: undefined,
        lastActivityOn: isoDaysAgo(1),
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    loadMock.mockResolvedValue(data);
    const { container } = render(<RelationshipMemory />);
    await screen.findByText('Plain Co');

    // Both the subtitle and the disclaimer say "derived from visible
    // records" / "client-name grouped" — use getAllByText.
    expect(
      screen.getAllByText(/derived from visible records/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/client-name grouped/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(/not a verified relationship graph/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a household linkage/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a relationship score/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No predictive claim/i),
    ).toBeInTheDocument();

    const text = container.textContent ?? '';
    // Forbidden-as-positive-claim vocabulary scan.
    expect(text).not.toMatch(/\bAI[ -]?generated\b/i);
    expect(text).not.toMatch(/\brisk\s+score\b/i);
    expect(text).not.toMatch(/\bguaranteed\b/i);
    expect(text).not.toMatch(/\bapproved\b/i);
    expect(text).not.toMatch(/\brejected\b/i);
    expect(text).not.toMatch(/\bhouseholding\b/i);
    expect(text).not.toMatch(/\bcomplete\s+relationship\s+profile\b/i);
    expect(text).not.toMatch(/\bofficial\s+householding\b/i);
    // "relationship score" must not appear as a positive claim. The
    // disclaimer's "not a relationship score" passes this because the
    // negation phrase matches "not a relationship score" — assert
    // there's no other positive use ("relationship score: 87",
    // "relationship score of X" etc.).
    expect(text).not.toMatch(/relationship\s+score:\s*\d/i);
    expect(text).not.toMatch(/relationship\s+score\s+of\s+/i);
  });

  it('sorts attention-bearing clients ahead of calm clients in the DOM', async () => {
    const data = emptyData();
    data.deals = [
      // Calm client, recent activity.
      {
        id: 'd-calm',
        name: 'Quiet Deal',
        clientName: 'Calm Co',
        stage: 'Application',
        status: 'Active',
        amount: 100_000,
        targetCloseDate: undefined,
        lastActivityOn: isoDaysAgo(1),
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
      // Loud client (overdue task).
      {
        id: 'd-loud',
        name: 'Loud Deal',
        clientName: 'Loud Inc',
        stage: 'Closing',
        status: 'Active',
        amount: 100_000,
        targetCloseDate: undefined,
        lastActivityOn: isoDaysAgo(10),
        stageEntryDate: undefined,
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    data.tasks = [{ id: 't-loud', dealId: 'd-loud', title: 'overdue', dueDate: isoDaysAgo(2), modifiedOn: undefined, completed: false }];
    loadMock.mockResolvedValue(data);
    render(<RelationshipMemory />);

    await screen.findByText('Loud Inc');
    const list = screen.getByRole('list', { name: /relationship memory clients/i });
    const rows = within(list).getAllByRole('listitem');
    // The first listitem in the relationship list is the loud client.
    // (The nested deal lists also produce listitems — filter to the
    // ones whose first text child matches a client name.)
    const clientFirstRow = rows.find((r) =>
      r.textContent?.startsWith('Loud Inc'),
    );
    expect(clientFirstRow).toBeDefined();
    const allClientHeaders = rows
      .map((r) => r.querySelector('span'))
      .map((el) => el?.textContent)
      .filter(Boolean);
    expect(allClientHeaders[0]).toMatch(/Loud Inc/);
  });
});

describe('RelationshipMemory — Phase 100 Copy Teams summary', () => {
  function dataWithAcme(): BankerWorkQueueData {
    const data = emptyData();
    data.deals = [
      {
        id: 'd1',
        name: 'Acme RLOC',
        clientName: 'Acme Manufacturing',
        stage: 'Underwriting',
        status: 'Active',
        amount: 3_000_000,
        targetCloseDate: isoDaysFromNow(8),
        lastActivityOn: isoDaysAgo(2),
        stageEntryDate: isoDaysAgo(10),
        isClosed: false,
        collateralSummary: undefined,
      },
    ];
    data.tasks = [
      {
        id: 't1',
        dealId: 'd1',
        title: 'Send Q2 financials',
        dueDate: isoDaysAgo(2),
        modifiedOn: undefined,
        completed: false,
      },
    ];
    data.outstandingDocuments = [
      {
        id: 'doc1',
        dealId: 'd1',
        name: 'PFS',
        dueDate: undefined,
        requestDate: undefined,
        receivedDate: undefined,
        reviewer: undefined,
        uploaded: false,
        modifiedOn: undefined,
      },
    ];
    return data;
  }

  it('renders a "Copy Teams summary" button per relationship row in the populated state', async () => {
    loadMock.mockResolvedValue(dataWithAcme());
    render(<RelationshipMemory />);
    await screen.findByText('Acme Manufacturing');
    const btn = screen.getByRole('button', {
      name: /Copy Teams summary for Acme Manufacturing/i,
    });
    expect(btn).toBeEnabled();
    expect(btn.textContent).toContain('Copy Teams summary');
  });

  it('does NOT render the Copy button in the empty / loading / failed states', async () => {
    // Empty
    loadMock.mockResolvedValue(emptyData());
    const { unmount } = render(<RelationshipMemory />);
    await screen.findByText(/No active deals assigned to you/i);
    expect(
      screen.queryByRole('button', { name: /Copy Teams summary for/i }),
    ).toBeNull();
    unmount();

    // Loading
    loadMock.mockReturnValue(new Promise(() => {}));
    const { unmount: unmount2 } = render(<RelationshipMemory />);
    expect(
      screen.queryByRole('button', { name: /Copy Teams summary for/i }),
    ).toBeNull();
    unmount2();

    // Failed
    loadMock.mockRejectedValue(new Error('boom'));
    render(<RelationshipMemory />);
    await screen.findByText(/Could not load relationship memory/i);
    expect(
      screen.queryByRole('button', { name: /Copy Teams summary for/i }),
    ).toBeNull();
  });

  it('clicking Copy Teams summary writes the formatted snapshot to the clipboard', async () => {
    loadMock.mockResolvedValue(dataWithAcme());
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<RelationshipMemory />);
    await user.click(
      await screen.findByRole('button', {
        name: /Copy Teams summary for Acme Manufacturing/i,
      }),
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const written = writeText.mock.calls[0]![0] as string;
    expect(written).toMatch(
      /^Relationship snapshot — Acme Manufacturing — \d{4}-\d{2}-\d{2}\nClient-name grouped\.\n/,
    );
    expect(written).toContain('1 active deal · Pipeline $3,000,000');
    expect(written).toContain('- Acme RLOC — Underwriting');
    expect(written).toContain(
      'Local copy only. Not posted to Teams. Paste into Teams. ' +
        'You send the message manually.',
    );
    expect(written).toContain(
      'Not a relationship graph, not a household linkage, ' +
        'not a relationship score.',
    );
  });

  it('shows "Copied to clipboard. Paste into Teams." status after a successful copy', async () => {
    loadMock.mockResolvedValue(dataWithAcme());
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    render(<RelationshipMemory />);
    await user.click(
      await screen.findByRole('button', {
        name: /Copy Teams summary for Acme Manufacturing/i,
      }),
    );
    const status = await screen.findByText(
      /Copied to clipboard\. Paste into Teams\./i,
    );
    expect(status.closest('[role="status"]')).not.toBeNull();
  });

  it('shows "Clipboard unavailable. Select and copy manually." alert when clipboard is missing', async () => {
    loadMock.mockResolvedValue(dataWithAcme());
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    render(<RelationshipMemory />);
    await user.click(
      await screen.findByRole('button', {
        name: /Copy Teams summary for Acme Manufacturing/i,
      }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(
      /Clipboard unavailable\. Select and copy manually\./i,
    );
  });

  it('clicking Copy does NOT open the Phase 78 relationship-note draft modal', async () => {
    loadMock.mockResolvedValue(dataWithAcme());
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    render(<RelationshipMemory />);
    await user.click(
      await screen.findByRole('button', {
        name: /Copy Teams summary for Acme Manufacturing/i,
      }),
    );
    // The draft modal is rendered with role="dialog". After clicking
    // the Copy button (which is NOT the Draft button) the modal MUST
    // NOT appear — Phase 78 draft state is untouched.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clicking Copy does NOT mutate any local-only ledger localStorage slot', async () => {
    loadMock.mockResolvedValue(dataWithAcme());
    // Pre-seed the Phase 83 + Phase 90 + Phase 91 slots so we can
    // assert the copy click leaves them byte-identical.
    localStorage.setItem(
      'cc:autopilotSuggestionLedger:v1',
      JSON.stringify({ pinned: 'value' }),
    );
    localStorage.setItem(
      'cc:catchUpItemLedger:v1',
      JSON.stringify({ pinned: 'value' }),
    );
    localStorage.setItem(
      'cc:lastVisit:catchUp:banker:banker-1',
      String(Date.now() - 100_000),
    );
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<RelationshipMemory />);
    const beforeAutopilot = localStorage.getItem(
      'cc:autopilotSuggestionLedger:v1',
    );
    const beforeCatchUp = localStorage.getItem('cc:catchUpItemLedger:v1');
    const beforeLastSeen = localStorage.getItem(
      'cc:lastVisit:catchUp:banker:banker-1',
    );
    await user.click(
      await screen.findByRole('button', {
        name: /Copy Teams summary for Acme Manufacturing/i,
      }),
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(
      localStorage.getItem('cc:autopilotSuggestionLedger:v1'),
    ).toBe(beforeAutopilot);
    expect(localStorage.getItem('cc:catchUpItemLedger:v1')).toBe(
      beforeCatchUp,
    );
    expect(
      localStorage.getItem('cc:lastVisit:catchUp:banker:banker-1'),
    ).toBe(beforeLastSeen);
  });

  it('the rendered DOM never claims sent / posted / delivered / notified / synced / Teams integrated / Graph connected', async () => {
    loadMock.mockResolvedValue(dataWithAcme());
    render(<RelationshipMemory />);
    await screen.findByText('Acme Manufacturing');
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bsent\b/i);
    expect(text).not.toMatch(/\bposted\b/i);
    expect(text).not.toMatch(/\bdelivered\b/i);
    expect(text).not.toMatch(/\bnotified\b/i);
    expect(text).not.toMatch(/\bsynced\b/i);
    expect(text).not.toMatch(/Teams\s+integrated/i);
    expect(text).not.toMatch(/Graph\s+connected/i);
  });

  it('renders the Phase 101 Outlook handoff buttons per row alongside the Teams copy button', async () => {
    loadMock.mockResolvedValue(dataWithAcme());
    render(<RelationshipMemory />);
    await screen.findByText('Acme Manufacturing');
    expect(
      screen.getByRole('button', {
        name: /Copy Teams summary for Acme Manufacturing/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Open in Outlook for Acme Manufacturing relationship snapshot/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Copy email for Acme Manufacturing relationship snapshot/i,
      }),
    ).toBeInTheDocument();
  });

  it('clicking Open in Outlook sets window.location.href to a mailto URL with the Phase 101 relationship-snapshot subject', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' },
      writable: true,
    });
    loadMock.mockResolvedValue(dataWithAcme());
    const user = userEvent.setup();
    render(<RelationshipMemory />);
    await user.click(
      await screen.findByRole('button', {
        name: /Open in Outlook for Acme Manufacturing relationship snapshot/i,
      }),
    );
    expect(window.location.href).toMatch(/^mailto:\?/);
    expect(window.location.href).toContain(
      'subject=Relationship%20snapshot%20%E2%80%94%20Acme%20Manufacturing',
    );
  });

  it('Outlook handoff click does NOT open the Phase 78 relationship-note draft modal', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' },
      writable: true,
    });
    loadMock.mockResolvedValue(dataWithAcme());
    const user = userEvent.setup();
    render(<RelationshipMemory />);
    await user.click(
      await screen.findByRole('button', {
        name: /Open in Outlook for Acme Manufacturing relationship snapshot/i,
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the copied output never claims household / verified / full relationship profile / AI-generated / relationship score', async () => {
    loadMock.mockResolvedValue(dataWithAcme());
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<RelationshipMemory />);
    await user.click(
      await screen.findByRole('button', {
        name: /Copy Teams summary for Acme Manufacturing/i,
      }),
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    const text = writeText.mock.calls[0]![0] as string;
    // Strip the negation-laden disclaimer before checking positive
    // claims.
    const body = text.replace(/— Local copy only\.[^]*$/, '');
    expect(body).not.toMatch(/\bhousehold\b/i);
    expect(body).not.toMatch(/\bverified\b/i);
    expect(body).not.toMatch(/full\s+relationship\s+profile/i);
    expect(body).not.toMatch(/relationship\s+score/i);
    expect(body).not.toMatch(/AI[- ]?generated/i);
    expect(body).not.toMatch(/\bCopilot\b/i);
    expect(body).not.toMatch(/official\s+relationship\s+graph/i);
  });
});

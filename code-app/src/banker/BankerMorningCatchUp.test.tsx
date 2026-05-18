// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BankerWorkQueueData } from './workQueueQueries';

/**
 * Phase 89 — BankerMorningCatchUp card tests.
 *
 * Pins:
 *   - card header + verbatim subtitle ("Derived from your current
 *     records. Nothing happens automatically.");
 *   - loading + failed (role=alert) + no-items empty states;
 *   - populated state renders priority badge + deal-name button +
 *     reason + source meta;
 *   - clicking the deal-name navigates;
 *   - empty + populated disclaimers include verbatim
 *     "Not AI-generated." and "your current records";
 *   - missing-assigned-banker NEVER fires on the banker card (the
 *     banker IS the assigned banker on their own deals);
 *   - rendered DOM never contains forbidden vocabulary.
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
import { BankerMorningCatchUp } from './BankerMorningCatchUp';

const loadMock = vi.mocked(loadBankerWorkQueueData);
const useBankerMock = vi.mocked(useBanker);

const NOW = new Date();
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}

function emptyData(): BankerWorkQueueData {
  return {
    deals: [],
    tasks: [],
    outstandingDocuments: [],
    pendingReviewDocuments: [],
    memos: [],
  };
}

function dataWith(over: Partial<BankerWorkQueueData> = {}): BankerWorkQueueData {
  return {
    ...emptyData(),
    ...over,
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

describe('BankerMorningCatchUp — Phase 89', () => {
  it('renders the card header + verbatim subtitle', () => {
    loadMock.mockReturnValue(new Promise(() => {}));
    render(<BankerMorningCatchUp />);
    expect(
      screen.getByRole('heading', { name: /morning catch-up/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Derived from your current records\. Nothing happens automatically\./i,
      ),
    ).toBeInTheDocument();
  });

  it('renders the loading state initially', () => {
    loadMock.mockReturnValue(new Promise(() => {}));
    render(<BankerMorningCatchUp />);
    expect(screen.getByText(/Loading catch-up/i)).toBeInTheDocument();
  });

  it('renders the failed state via role="alert" when the loader rejects', async () => {
    loadMock.mockRejectedValue(new Error('service unavailable'));
    render(<BankerMorningCatchUp />);
    await waitFor(() =>
      expect(
        screen.getByText(/Could not load catch-up/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
  });

  it('renders the empty-state copy + "Not AI-generated" disclaimer when no items fire', async () => {
    loadMock.mockResolvedValue(emptyData());
    render(<BankerMorningCatchUp />);
    await waitFor(() =>
      expect(
        screen.getByText(/No catch-up items from current records\./i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Not AI-generated\./i)).toBeInTheDocument();
  });

  it('empty-state copy never says "all clear" / "no risk" / "real-time"', async () => {
    loadMock.mockResolvedValue(emptyData());
    render(<BankerMorningCatchUp />);
    await waitFor(() =>
      expect(
        screen.getByText(/No catch-up items from current records/i),
      ).toBeInTheDocument(),
    );
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/\ball\s+clear\b/i);
    expect(body).not.toMatch(/\bno\s+risk\b/i);
    expect(body).not.toMatch(/\bpipeline\s+healthy\b/i);
    expect(body).not.toMatch(/\beverything\s+is\s+fine\b/i);
    expect(body).not.toMatch(/\breal[- ]?time\b/i);
  });

  it('renders an overdue-task item as a high-priority row with the deal name + source meta', async () => {
    loadMock.mockResolvedValue(
      dataWith({
        deals: [
          {
            id: 'd-1',
            name: 'Hot Deal',
            clientName: 'Hot Co',
            stage: 'Underwriting',
            status: 'Active',
            amount: 1_000_000,
            targetCloseDate: isoDaysFromNow(60),
            lastActivityOn: isoDaysAgo(1),
            stageEntryDate: isoDaysAgo(5),
            isClosed: false,
          },
        ],
        tasks: [
          {
            id: 't1',
            dealId: 'd-1',
            title: 'Send Q2 financials',
            dueDate: isoDaysAgo(2),
            modifiedOn: undefined,
            completed: false,
          },
        ],
      }),
    );
    render(<BankerMorningCatchUp />);
    await waitFor(() =>
      expect(
        screen.getByRole('list', {
          name: /Banker morning catch-up items/i,
        }),
      ).toBeInTheDocument(),
    );
    const list = screen.getByRole('list', {
      name: /Banker morning catch-up items/i,
    });
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBe(1);
    expect(items[0]!.textContent).toContain('Hot Deal');
    expect(items[0]!.textContent).toContain('Overdue task');
    expect(items[0]!.textContent).toContain('task'); // source label
    expect(
      within(items[0]!).getByLabelText(/High priority/i),
    ).toBeInTheDocument();
  });

  it('renders multiple items per deal when multiple kinds fire', async () => {
    loadMock.mockResolvedValue(
      dataWith({
        deals: [
          {
            id: 'd-1',
            name: 'Multi Deal',
            clientName: 'Multi Co',
            stage: 'Underwriting',
            status: 'Active',
            amount: 1_000_000,
            targetCloseDate: isoDaysFromNow(60),
            lastActivityOn: isoDaysAgo(1),
            stageEntryDate: isoDaysAgo(45), // stage-aging
            isClosed: false,
          },
        ],
        tasks: [
          {
            id: 't1',
            dealId: 'd-1',
            title: 'Send Q2 financials',
            dueDate: isoDaysAgo(2),
            modifiedOn: undefined,
            completed: false,
          },
        ],
        memos: [
          {
            id: 'm1',
            dealId: 'd-1',
            name: 'Draft memo',
            statusKey: 'draft',
            generatedAt: isoDaysAgo(2),
            modifiedOn: undefined,
          },
        ],
      }),
    );
    render(<BankerMorningCatchUp />);
    await waitFor(() =>
      expect(
        screen.getByRole('list', {
          name: /Banker morning catch-up items/i,
        }),
      ).toBeInTheDocument(),
    );
    const list = screen.getByRole('list', {
      name: /Banker morning catch-up items/i,
    });
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBe(3);
  });

  it('clicking a deal-name navigates to /deals/<id>', async () => {
    loadMock.mockResolvedValue(
      dataWith({
        deals: [
          {
            id: 'd-target',
            name: 'Target Deal',
            clientName: undefined,
            stage: 'Underwriting',
            status: 'Active',
            amount: undefined,
            targetCloseDate: isoDaysFromNow(60),
            lastActivityOn: isoDaysAgo(1),
            stageEntryDate: isoDaysAgo(5),
            isClosed: false,
          },
        ],
        tasks: [
          {
            id: 't1',
            dealId: 'd-target',
            title: 'X',
            dueDate: isoDaysAgo(2),
            modifiedOn: undefined,
            completed: false,
          },
        ],
      }),
    );
    render(<BankerMorningCatchUp />);
    const user = userEvent.setup();
    const button = await screen.findByRole('button', {
      name: /Open deal Target Deal/i,
    });
    await user.click(button);
    expect(navigateSpy).toHaveBeenCalledWith('/deals/d-target');
  });

  it("does NOT fire missing-assigned-banker on the banker workspace (the banker IS the assigned banker)", async () => {
    // A deal that would otherwise trigger every data-quality item if
    // the banker name weren't stamped — but the adapter ALWAYS
    // stamps fullName, so missing-assigned-banker stays silent.
    loadMock.mockResolvedValue(
      dataWith({
        deals: [
          {
            id: 'd-1',
            name: 'Deal A',
            clientName: undefined,
            stage: 'Underwriting',
            status: 'Active',
            amount: undefined,
            targetCloseDate: isoDaysFromNow(60),
            lastActivityOn: isoDaysAgo(1),
            stageEntryDate: isoDaysAgo(45), // surfaces stage-aging so card is populated
            isClosed: false,
          },
        ],
      }),
    );
    render(<BankerMorningCatchUp />);
    await waitFor(() =>
      expect(
        screen.getByRole('list', { name: /Banker morning catch-up items/i }),
      ).toBeInTheDocument(),
    );
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/No assigned banker/i);
  });

  it("surfaces missing-stage data-quality items when a banker deal has no stage", async () => {
    loadMock.mockResolvedValue(
      dataWith({
        deals: [
          {
            id: 'd-1',
            name: 'Deal A',
            clientName: undefined,
            stage: undefined,
            status: 'Active',
            amount: undefined,
            targetCloseDate: isoDaysFromNow(60),
            lastActivityOn: isoDaysAgo(1),
            stageEntryDate: isoDaysAgo(5),
            isClosed: false,
          },
        ],
      }),
    );
    render(<BankerMorningCatchUp />);
    await waitFor(() =>
      expect(screen.getByText(/Stage not set/i)).toBeInTheDocument(),
    );
  });

  it("populated-state disclaimer renders 'Not AI-generated.' verbatim", async () => {
    loadMock.mockResolvedValue(
      dataWith({
        deals: [
          {
            id: 'd-1',
            name: 'D',
            clientName: undefined,
            stage: 'Underwriting',
            status: 'Active',
            amount: undefined,
            targetCloseDate: isoDaysFromNow(60),
            lastActivityOn: isoDaysAgo(1),
            stageEntryDate: isoDaysAgo(45),
            isClosed: false,
          },
        ],
      }),
    );
    render(<BankerMorningCatchUp />);
    await waitFor(() =>
      expect(screen.getByText(/Not AI-generated\./i)).toBeInTheDocument(),
    );
  });

  it('rendered DOM never contains forbidden vocabulary as a positive claim', async () => {
    loadMock.mockResolvedValue(
      dataWith({
        deals: [
          {
            id: 'd-1',
            name: 'D',
            clientName: undefined,
            stage: 'Underwriting',
            status: 'Active',
            amount: undefined,
            targetCloseDate: isoDaysFromNow(60),
            lastActivityOn: isoDaysAgo(1),
            stageEntryDate: isoDaysAgo(45),
            isClosed: false,
          },
        ],
      }),
    );
    const { container } = render(<BankerMorningCatchUp />);
    await waitFor(() =>
      expect(
        screen.getByRole('list', { name: /Banker morning catch-up items/i }),
      ).toBeInTheDocument(),
    );
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bAI[ -]?detected\b/i);
    expect(text).not.toMatch(/\bsystem\s+decided\b/i);
    expect(text).not.toMatch(/\bcritical\s+breach\b/i);
    expect(text).not.toMatch(/\bguaranteed\b/i);
    expect(text).not.toMatch(/\bnoncompliant\b/i);
    expect(text).not.toMatch(/\bofficial\s+alert\b/i);
    expect(text).not.toMatch(/\breal[- ]?time\b/i);
    expect(text).not.toMatch(/\bautopilot\s+executed\b/i);
    expect(text).not.toMatch(/\bdecisioned\b/i);
    expect(text).not.toMatch(
      /\b(executes|runs|completes|approves|decides)\s+automatically\b/i,
    );
    expect(text).not.toMatch(/\b(is|was|has been|will be)\s+failed\b/i);
  });
});

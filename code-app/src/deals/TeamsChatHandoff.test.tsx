// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealData } from './DealDataProvider';
import type { DealDetail } from './dealQueries';
import type { BankerIdentity } from '../banker/BankerContext';

/**
 * Phase 86 — TeamsChatHandoff card tests.
 *
 * Pins:
 *   - Card header + verbatim subtitle render;
 *   - Enabled state: button labelled "Open Teams chat"; click opens
 *     the well-known Microsoft Teams deep link via window.open with
 *     _blank + noopener + noreferrer (no message is ever sent by the
 *     app);
 *   - URL includes users=<banker email>, topic=<deal name>,
 *     message=Re: <deal name>;
 *   - Disabled state when no banker context is mounted (no UPN
 *     available);
 *   - Disabled-state copy contains the exact verbatim "Teams chat
 *     handoff unavailable because no user email is available."
 *   - Probe diagnostic badge reflects the Teams SDK probe result;
 *   - Honest disclaimers render verbatim and the DOM never contains
 *     forbidden sent / delivered / synced / posted / notified /
 *     "meeting created" / "calendar updated" / "Teams integrated" /
 *     "Graph connected" vocabulary.
 *
 * The Teams SDK + DealDataProvider + BankerContext are mocked at the
 * module boundary so we exercise the wiring + rendered invariants
 * without touching real SDK calls.
 */

vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));

vi.mock('../banker/BankerContext', () => ({
  useOptionalBanker: vi.fn(),
}));

vi.mock('../shared/teams/teamsEnvironment', async () => {
  const actual = await vi.importActual<
    typeof import('../shared/teams/teamsEnvironment')
  >('../shared/teams/teamsEnvironment');
  return {
    ...actual,
    initializeTeamsContext: vi.fn(),
  };
});

import { useDealData } from './DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import { initializeTeamsContext } from '../shared/teams/teamsEnvironment';
import { TeamsChatHandoff } from './TeamsChatHandoff';

const useDealDataMock = vi.mocked(useDealData);
const useOptionalBankerMock = vi.mocked(useOptionalBanker);
const initializeTeamsContextMock = vi.mocked(initializeTeamsContext);

function deal(o: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'd-1',
    name: 'Acme RLOC',
    clientName: 'Acme Manufacturing',
    stage: 'Underwriting',
    status: 'Active',
    amount: 4_000_000,
    bankerName: 'M. Paller',
    targetCloseDate: undefined,
    productType: undefined,
    loanStructure: undefined,
    customerType: undefined,
    industry: undefined,
    guarantorStructure: undefined,
    pricingType: undefined,
    spreadIndex: undefined,
    spreadMargin: undefined,
    collateralSummary: undefined,
    createdOn: undefined,
    stageEntryDate: undefined,
    isClosed: false,
    ...o,
  };
}

function dealData(over: Partial<DealData> = {}): DealData {
  return {
    deal: deal(),
    tasks: { kind: 'loading' },
    documents: { kind: 'loading' },
    creditMemo: { kind: 'loading' },
    activity: { kind: 'loading' },
    refresh: () => undefined,
    ...over,
  };
}

function bankerIdentity(over: Partial<BankerIdentity> = {}): BankerIdentity {
  return {
    bankerId: 'b-1',
    fullName: 'M. Paller',
    email: 'mpaller@bank.example',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
    ...over,
  };
}

// Mock window.open with vi.fn() and reset between tests. vi.spyOn's
// generic typing for the Window 'open' overload is awkward in TS 6, so
// we hold the spy as a generic vi.fn cast.
let windowOpenSpy: ReturnType<typeof vi.fn>;
let originalWindowOpen: typeof window.open;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: SDK probe says "not in Teams" (most realistic for unit
  // tests). Resolves with kind: 'unavailable' so the muted diagnostic
  // badge renders.
  initializeTeamsContextMock.mockResolvedValue({
    kind: 'unavailable',
    reason: 'not-running-in-teams',
  });
  originalWindowOpen = window.open;
  windowOpenSpy = vi.fn(() => null);
  window.open = windowOpenSpy as unknown as typeof window.open;
});

afterEach(() => {
  window.open = originalWindowOpen;
});

describe('TeamsChatHandoff — Phase 86', () => {
  it('renders the card header + verbatim subtitle', () => {
    useDealDataMock.mockReturnValue(dealData());
    useOptionalBankerMock.mockReturnValue(bankerIdentity());
    render(<TeamsChatHandoff />);
    expect(
      screen.getByRole('heading', { name: /Open Teams chat/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Handoff to your Microsoft Teams client\. The app does not post to, read from, or sync with Teams\./i,
      ),
    ).toBeInTheDocument();
  });

  it('renders the enabled state when a banker email is available', () => {
    useDealDataMock.mockReturnValue(dealData());
    useOptionalBankerMock.mockReturnValue(bankerIdentity());
    render(<TeamsChatHandoff />);
    expect(
      screen.getByRole('button', { name: /Open Teams chat about Acme RLOC/i }),
    ).toBeInTheDocument();
    // Disabled-state copy must NOT appear when the email is present.
    expect(
      screen.queryByText(/Teams chat handoff unavailable/i),
    ).toBeNull();
  });

  it('opens the Microsoft Teams deep link with users + topic + message on click', async () => {
    useDealDataMock.mockReturnValue(dealData({ deal: deal({ name: 'Hot Deal' }) }));
    useOptionalBankerMock.mockReturnValue(
      bankerIdentity({ email: 'banker@bank.example' }),
    );
    const user = userEvent.setup();
    render(<TeamsChatHandoff />);
    await user.click(
      screen.getByRole('button', { name: /Open Teams chat about Hot Deal/i }),
    );
    expect(windowOpenSpy).toHaveBeenCalledTimes(1);
    const [url, target, features] = windowOpenSpy.mock.calls[0]!;
    expect(target).toBe('_blank');
    expect(features).toBe('noopener,noreferrer');
    const parsed = new URL(url as string);
    expect(parsed.origin + parsed.pathname).toBe(
      'https://teams.microsoft.com/l/chat/0/0',
    );
    expect(parsed.searchParams.get('users')).toBe('banker@bank.example');
    expect(parsed.searchParams.get('topic')).toBe('Hot Deal');
    expect(parsed.searchParams.get('message')).toBe('Re: Hot Deal');
  });

  it('renders the disabled state with the verbatim copy when no banker context is available', () => {
    useDealDataMock.mockReturnValue(dealData());
    useOptionalBankerMock.mockReturnValue(null);
    render(<TeamsChatHandoff />);
    expect(
      screen.getByText(
        /Teams chat handoff unavailable because no user email is available\./i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open Teams chat/i })).toBeNull();
  });

  it('renders the disabled state when the banker email is empty / whitespace', () => {
    useDealDataMock.mockReturnValue(dealData());
    useOptionalBankerMock.mockReturnValue(bankerIdentity({ email: '   ' }));
    render(<TeamsChatHandoff />);
    expect(
      screen.getByText(/Teams chat handoff unavailable/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open Teams chat/i })).toBeNull();
  });

  it('renders the disabled state when the banker email fails the email-shape check', () => {
    useDealDataMock.mockReturnValue(dealData());
    useOptionalBankerMock.mockReturnValue(
      bankerIdentity({ email: 'not-an-email' }),
    );
    render(<TeamsChatHandoff />);
    expect(
      screen.getByText(/Teams chat handoff unavailable/i),
    ).toBeInTheDocument();
  });

  it('renders the conservative disclaimer in the enabled state', () => {
    useDealDataMock.mockReturnValue(dealData());
    useOptionalBankerMock.mockReturnValue(bankerIdentity());
    render(<TeamsChatHandoff />);
    const body = document.body.textContent ?? '';
    expect(body).toMatch(/Local handoff only\./i);
    expect(body).toMatch(/No Dataverse write\./i);
    expect(body).toMatch(/No audit row\./i);
    expect(body).toMatch(/No timeline event\./i);
    expect(body).toMatch(/No calendar update\./i);
    expect(body).toMatch(/No meeting created\./i);
    expect(body).toMatch(/No Teams notification raised\./i);
    expect(body).toMatch(/No Graph call\./i);
    expect(body).toMatch(/You send the message/i);
  });

  it('shows the "running inside Teams" diagnostic badge when the SDK probe reports available', async () => {
    initializeTeamsContextMock.mockResolvedValue({
      kind: 'available',
      context: {
        hostName: 'teams',
        hostClientType: 'web',
        appLocale: undefined,
        tenantId: undefined,
      },
    });
    useDealDataMock.mockReturnValue(dealData());
    useOptionalBankerMock.mockReturnValue(bankerIdentity());
    render(<TeamsChatHandoff />);
    expect(
      await screen.findByText(/Detected: running inside Teams/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Not running inside Teams/i),
    ).toBeNull();
  });

  it('shows the muted "not running inside Teams" diagnostic badge when the SDK probe reports unavailable', async () => {
    initializeTeamsContextMock.mockResolvedValue({
      kind: 'unavailable',
      reason: 'not-running-in-teams',
    });
    useDealDataMock.mockReturnValue(dealData());
    useOptionalBankerMock.mockReturnValue(bankerIdentity());
    render(<TeamsChatHandoff />);
    expect(
      await screen.findByText(
        /Not running inside Teams · the link opens Teams web/i,
      ),
    ).toBeInTheDocument();
  });

  it('survives gracefully when the SDK probe returns a rejected Promise — never crashes the card', async () => {
    initializeTeamsContextMock.mockRejectedValue(new Error('probe boom'));
    useDealDataMock.mockReturnValue(dealData());
    useOptionalBankerMock.mockReturnValue(bankerIdentity());
    render(<TeamsChatHandoff />);
    // Even without a successful probe, the enabled state still
    // renders because the deep link only depends on the email + deal
    // name — the SDK probe is informational. The card's .catch()
    // handler must swallow the rejection so React's error overlay
    // never fires.
    expect(
      screen.getByRole('button', { name: /Open Teams chat/i }),
    ).toBeInTheDocument();
  });

  it('rendered DOM never contains forbidden sent / delivered / synced / posted / notified vocabulary as a positive claim', () => {
    useDealDataMock.mockReturnValue(dealData());
    useOptionalBankerMock.mockReturnValue(bankerIdentity());
    const { container } = render(<TeamsChatHandoff />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\b(message|email)\s+(was|has been|is)\s+sent\b/i);
    expect(text).not.toMatch(/\b(was|has been|is)\s+delivered\b/i);
    expect(text).not.toMatch(/\b(was|has been|is)\s+synced\b/i);
    expect(text).not.toMatch(/\b(was|has been|is)\s+posted\b/i);
    expect(text).not.toMatch(/\b(was|has been|is)\s+notified\b/i);
    // "meeting created" / "calendar updated" must not appear as
    // positive claims. The disclaimer says "No meeting created. No
    // calendar update." — the negation is explicitly allowed; a bare
    // affirmative is not.
    expect(text).not.toMatch(/\bmeeting\s+was\s+created\b/i);
    expect(text).not.toMatch(/\bcalendar\s+was\s+updated\b/i);
    expect(text).not.toMatch(/\bTeams\s+integrated\b/i);
    expect(text).not.toMatch(/\bGraph\s+connected\b/i);
    expect(text).not.toMatch(/\bautomatically\s+(executed|delivered|sent)\b/i);
  });
});

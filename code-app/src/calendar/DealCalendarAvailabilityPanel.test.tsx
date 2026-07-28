// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { useDealDataMock, useBankerMock } = vi.hoisted(() => ({
  useDealDataMock: vi.fn(),
  useBankerMock: vi.fn(),
}));

vi.mock('../deals/DealDataProvider', () => ({ useDealData: useDealDataMock }));
vi.mock('../banker/BankerContext', () => ({ useBanker: useBankerMock }));

import { DealCalendarAvailabilityPanel } from './DealCalendarAvailabilityPanel';
import {
  createFixtureBankerCalendarReadAdapter,
  resetBankerCalendarReadAdapterForTest,
  setBankerCalendarReadAdapterForTest,
} from './outlookCalendarReadAdapter';
import { deriveAvailabilityWindows } from './bankerAvailability';
import { resolveOutlookCalendarReadMode } from './outlookCalendarFeatureFlags';

beforeEach(() => {
  useDealDataMock.mockReturnValue({
    deal: {
      id: 'deal-123',
      dealName: 'Riverside Mfg Working Capital',
    },
  });
  useBankerMock.mockReturnValue({
    banker: { email: 'banker@oldglorybank.com' },
  });
});

afterEach(() => {
  resetBankerCalendarReadAdapterForTest();
});

describe('M365-2 calendar read feature gate', () => {
  it('defaults disabled and only allows live_read_only', () => {
    expect(resolveOutlookCalendarReadMode({})).toBe('disabled');
    expect(resolveOutlookCalendarReadMode({ VITE_OUTLOOK_CALENDAR_READ_MODE: 'disabled' })).toBe('disabled');
    expect(resolveOutlookCalendarReadMode({ VITE_OUTLOOK_CALENDAR_READ_MODE: 'live_read_only' })).toBe('live_read_only');
    expect(resolveOutlookCalendarReadMode({ VITE_OUTLOOK_CALENDAR_READ_MODE: 'LIVE' })).toBe('disabled');
  });
});

describe('M365-2 banker availability model', () => {
  it('detects conflicts and business-hour boundaries without fabricating availability', () => {
    const windows = [
      { start: '2026-07-29T14:00:00Z', end: '2026-07-29T15:00:00Z', timezone: 'UTC' },
      { start: '2026-07-29T06:00:00Z', end: '2026-07-29T07:00:00Z', timezone: 'UTC' },
      { start: '2026-07-29T16:00:00Z', end: '2026-07-29T17:00:00Z', timezone: 'UTC' },
    ];
    const availability = deriveAvailabilityWindows(windows, [
      {
        id: 'evt-1',
        subject: 'Credit review',
        start: '2026-07-29T14:30:00Z',
        end: '2026-07-29T15:30:00Z',
        timezone: 'UTC',
      },
    ]);
    expect(availability.map((w) => w.status)).toEqual([
      'conflict',
      'outside_business_hours',
      'available',
    ]);
    expect(availability[0].conflictSubjects).toEqual(['Credit review']);
  });
});

describe('M365-2 DealCalendarAvailabilityPanel', () => {
  it('renders disabled/not-configured state honestly by default', async () => {
    render(<DealCalendarAvailabilityPanel />);
    expect(await screen.findByText(/Outlook calendar read mode is disabled/i)).toBeInTheDocument();
    expect(screen.getByText('WRITE_DISABLED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prepare meeting proposal' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Schedule meeting/i })).not.toBeInTheDocument();
  });

  it('renders upcoming meetings, attendee/location details, and availability from an injected read adapter', async () => {
    setBankerCalendarReadAdapterForTest(
      createFixtureBankerCalendarReadAdapter([
        {
          id: 'evt-1',
          subject: 'Riverside underwriting call',
          start: '2026-07-29T14:30:00Z',
          end: '2026-07-29T15:30:00Z',
          timezone: 'UTC',
          organizer: 'banker@oldglorybank.com',
          attendees: ['borrower@example.com', 'credit@oldglorybank.com'],
          location: 'Teams pending',
          dealId: 'deal-123',
          dealName: 'Riverside Mfg Working Capital',
        },
      ]),
    );

    render(<DealCalendarAvailabilityPanel />);

    expect(await screen.findByText('Riverside underwriting call')).toBeInTheDocument();
    expect(screen.getByText(/Organizer: banker@oldglorybank.com/i)).toBeInTheDocument();
    expect(screen.getByText(/borrower@example.com; credit@oldglorybank.com/i)).toBeInTheDocument();
    expect(screen.getByText(/Related to Riverside Mfg Working Capital/i)).toBeInTheDocument();
    expect(screen.getByText('READ_ONLY_READY')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Conflicts: Riverside underwriting call/i)).toBeInTheDocument());
  });
});

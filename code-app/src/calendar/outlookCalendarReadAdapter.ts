import { getOutlookCalendarReadMode, type OutlookCalendarReadMode } from './outlookCalendarFeatureFlags';
import type { AvailabilityWindow, BankerCalendarEvent, CalendarTimeRange } from './bankerAvailability';
import { deriveAvailabilityWindows } from './bankerAvailability';

export type CalendarReadStateKind =
  | 'disabled'
  | 'not_configured'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'blocked'
  | 'error';

export interface BankerCalendarReadState {
  kind: CalendarReadStateKind;
  mode: OutlookCalendarReadMode;
  events: BankerCalendarEvent[];
  availability: AvailabilityWindow[];
  message?: string;
}

export interface BankerCalendarReadRequest {
  bankerEmail?: string;
  dealId?: string;
  dealName?: string;
  timezone: string;
  candidateWindows: CalendarTimeRange[];
}

export interface BankerCalendarReadAdapter {
  load(request: BankerCalendarReadRequest): Promise<BankerCalendarReadState>;
}

export function createDisabledBankerCalendarReadAdapter(
  mode = getOutlookCalendarReadMode(),
): BankerCalendarReadAdapter {
  return {
    async load(_request) {
      if (mode !== 'live_read_only') {
        return {
          kind: 'disabled',
          mode,
          events: [],
          availability: [],
          message:
            'Outlook calendar read mode is disabled. Set VITE_OUTLOOK_CALENDAR_READ_MODE=live_read_only only after runtime binding is verified.',
        };
      }
      return {
        kind: 'not_configured',
        mode,
        events: [],
        availability: [],
        message:
          'Outlook calendar read mode is live_read_only, but no approved live read adapter is configured in this client.',
      };
    },
  };
}

export function createFixtureBankerCalendarReadAdapter(
  events: BankerCalendarEvent[],
  mode: OutlookCalendarReadMode = 'live_read_only',
): BankerCalendarReadAdapter {
  return {
    async load(request) {
      const scoped = request.dealId
        ? events.filter((event) => !event.dealId || event.dealId === request.dealId)
        : events;
      return {
        kind: scoped.length > 0 ? 'ready' : 'empty',
        mode,
        events: scoped,
        availability: deriveAvailabilityWindows(request.candidateWindows, scoped),
        message: scoped.length > 0 ? undefined : 'No upcoming meetings returned by the calendar adapter.',
      };
    },
  };
}

let bankerCalendarReadAdapter: BankerCalendarReadAdapter = createDisabledBankerCalendarReadAdapter();

export function getBankerCalendarReadAdapter(): BankerCalendarReadAdapter {
  return bankerCalendarReadAdapter;
}

export function setBankerCalendarReadAdapterForTest(adapter: BankerCalendarReadAdapter) {
  bankerCalendarReadAdapter = adapter;
}

export function resetBankerCalendarReadAdapterForTest() {
  bankerCalendarReadAdapter = createDisabledBankerCalendarReadAdapter();
}

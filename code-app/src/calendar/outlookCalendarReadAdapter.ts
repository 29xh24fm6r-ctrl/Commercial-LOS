import { getOutlookCalendarReadMode, type OutlookCalendarReadMode } from './outlookCalendarFeatureFlags';
import type { AvailabilityWindow, BankerCalendarEvent, CalendarTimeRange } from './bankerAvailability';
import { deriveAvailabilityWindows, normalizeCalendarEvent } from './bankerAvailability';

export type CalendarReadStateKind =
  | 'disabled'
  | 'not_configured'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'blocked'
  | 'unauthorized'
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
  calendarId?: string;
  top?: number;
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

interface OutlookCalendarReadOperations {
  CalendarGetTables(): Promise<{ success?: boolean; data?: { value?: Array<{ Name?: string; DisplayName?: string }> }; error?: { message?: string } }>;
  GetEventsCalendarViewV3(calendarId: string, startDateTimeUtc: string, endDateTimeUtc: string, filter?: string, orderby?: string, top?: number, skip?: number, search?: string): Promise<{ success?: boolean; data?: { value?: object[] }; error?: { message?: string } }>;
}

function selectSignedInUserCalendar(tables: Array<{ Name?: string; DisplayName?: string }>, requestedCalendarId?: string): string | undefined {
  if (requestedCalendarId && tables.some((table) => table.Name === requestedCalendarId)) return requestedCalendarId;
  return tables.find((table) => /^calendar$/i.test(table.DisplayName ?? '') || /^calendar$/i.test(table.Name ?? ''))?.Name
    ?? tables[0]?.Name;
}

function spanForRequest(request: BankerCalendarReadRequest): { start: string; end: string } | undefined {
  const ranges = request.candidateWindows
    .flatMap((range) => [new Date(range.start).getTime(), new Date(range.end).getTime()])
    .filter((time) => !Number.isNaN(time));
  if (ranges.length === 0) return undefined;
  return {
    start: new Date(Math.min(...ranges) - 24 * 60 * 60 * 1000).toISOString(),
    end: new Date(Math.max(...ranges) + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function createLiveOutlookCalendarReadAdapter(
  operationsProvider: () => Promise<OutlookCalendarReadOperations>,
  mode: OutlookCalendarReadMode = getOutlookCalendarReadMode(),
): BankerCalendarReadAdapter {
  return {
    async load(request) {
      if (mode !== 'live_read_only') return createDisabledBankerCalendarReadAdapter(mode).load(request);
      if (!request.bankerEmail) {
        return {
          kind: 'unauthorized',
          mode,
          events: [],
          availability: [],
          message: 'Signed-in banker email is required before reading Outlook Calendar.',
        };
      }
      const span = spanForRequest(request);
      if (!span) {
        return {
          kind: 'blocked',
          mode,
          events: [],
          availability: [],
          message: 'At least one valid candidate time window is required.',
        };
      }
      try {
        const operations = await operationsProvider();
        const calendars = await operations.CalendarGetTables();
        if (calendars.success === false) {
          return {
            kind: 'blocked',
            mode,
            events: [],
            availability: [],
            message: calendars.error?.message ?? 'Calendar metadata read was not accepted.',
          };
        }
        const calendarId = selectSignedInUserCalendar(calendars.data?.value ?? [], request.calendarId);
        if (!calendarId) {
          return {
            kind: 'empty',
            mode,
            events: [],
            availability: deriveAvailabilityWindows(request.candidateWindows, []),
            message: 'No signed-in-user calendar was returned by the Outlook connector.',
          };
        }
        const result = await operations.GetEventsCalendarViewV3(
          calendarId,
          span.start,
          span.end,
          undefined,
          'start/dateTime',
          request.top ?? 10,
        );
        if (result.success === false) {
          return {
            kind: 'blocked',
            mode,
            events: [],
            availability: [],
            message: result.error?.message ?? 'Calendar event read was not accepted.',
          };
        }
        const events = (result.data?.value ?? [])
          .map((event) => normalizeCalendarEvent(event as Record<string, unknown>, calendarId))
          .filter((event): event is BankerCalendarEvent => Boolean(event));
        return {
          kind: events.length > 0 ? 'ready' : 'empty',
          mode,
          events,
          availability: deriveAvailabilityWindows(request.candidateWindows, events),
          message: events.length > 0 ? 'Read-only signed-in-user calendar events returned.' : 'No upcoming meetings returned by the Outlook connector.',
        };
      } catch (error) {
        return {
          kind: 'error',
          mode,
          events: [],
          availability: [],
          message: error instanceof Error ? error.message : 'Calendar read failed.',
        };
      }
    },
  };
}

export function createGeneratedOffice365OutlookCalendarReadAdapter(
  mode: OutlookCalendarReadMode = getOutlookCalendarReadMode(),
): BankerCalendarReadAdapter {
  return createLiveOutlookCalendarReadAdapter(async () => {
    const { Office365OutlookService } = await import('../generated/services/Office365OutlookService');
    return Office365OutlookService;
  }, mode);
}

let bankerCalendarReadAdapter: BankerCalendarReadAdapter | undefined;

export function getBankerCalendarReadAdapter(): BankerCalendarReadAdapter {
  if (bankerCalendarReadAdapter) return bankerCalendarReadAdapter;
  const mode = getOutlookCalendarReadMode();
  return mode === 'live_read_only'
    ? createGeneratedOffice365OutlookCalendarReadAdapter(mode)
    : createDisabledBankerCalendarReadAdapter(mode);
}

export function setBankerCalendarReadAdapterForTest(adapter: BankerCalendarReadAdapter) {
  bankerCalendarReadAdapter = adapter;
}

export function resetBankerCalendarReadAdapterForTest() {
  bankerCalendarReadAdapter = undefined;
}

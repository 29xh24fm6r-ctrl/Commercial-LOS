export interface CalendarTimeRange {
  start: string;
  end: string;
  timezone: string;
}

export interface BankerCalendarEvent extends CalendarTimeRange {
  id: string;
  subject: string;
  organizer?: string;
  attendees?: string[];
  location?: string;
  onlineMeeting?: boolean;
  dealId?: string;
  dealName?: string;
}

export interface AvailabilityWindow extends CalendarTimeRange {
  status: 'available' | 'conflict' | 'outside_business_hours';
  conflictSubjects: string[];
}

export function normalizeIsoRange(input: CalendarTimeRange): CalendarTimeRange | undefined {
  const start = new Date(input.start);
  const end = new Date(input.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return undefined;
  if (start >= end) return undefined;
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    timezone: input.timezone || 'UTC',
  };
}

export function eventConflictsWithRange(event: BankerCalendarEvent, range: CalendarTimeRange): boolean {
  const normalized = normalizeIsoRange(range);
  const eventRange = normalizeIsoRange(event);
  if (!normalized || !eventRange) return false;
  const start = new Date(normalized.start).getTime();
  const end = new Date(normalized.end).getTime();
  const eventStart = new Date(eventRange.start).getTime();
  const eventEnd = new Date(eventRange.end).getTime();
  return eventStart < end && eventEnd > start;
}

export function isWithinBusinessHours(range: CalendarTimeRange, businessStartHour = 8, businessEndHour = 18): boolean {
  const normalized = normalizeIsoRange(range);
  if (!normalized) return false;
  const start = new Date(normalized.start);
  const end = new Date(normalized.end);
  return start.getUTCHours() >= businessStartHour && end.getUTCHours() <= businessEndHour;
}

export function deriveAvailabilityWindows(
  candidateWindows: CalendarTimeRange[],
  events: BankerCalendarEvent[],
): AvailabilityWindow[] {
  return candidateWindows.map((candidate) => {
    const normalized = normalizeIsoRange(candidate);
    if (!normalized) {
      return {
        ...candidate,
        status: 'conflict',
        conflictSubjects: ['Invalid time window'],
      };
    }
    if (!isWithinBusinessHours(normalized)) {
      return {
        ...normalized,
        status: 'outside_business_hours',
        conflictSubjects: [],
      };
    }
    const conflicts = events.filter((event) => eventConflictsWithRange(event, normalized));
    return {
      ...normalized,
      status: conflicts.length > 0 ? 'conflict' : 'available',
      conflictSubjects: conflicts.map((event) => event.subject),
    };
  });
}

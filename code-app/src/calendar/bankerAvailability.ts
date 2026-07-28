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
  isAllDay?: boolean;
  showAs?: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' | 'unknown';
  sourceCalendarId?: string;
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

export function normalizeAttendeeList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(normalizeAttendeeList);
  if (typeof value === 'string') {
    return value
      .split(/[;,]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const address = record.address ?? record.Address ?? record.emailAddress ?? record.EmailAddress;
    if (typeof address === 'string') return [address.trim()].filter(Boolean);
    if (address && typeof address === 'object') {
      const nested = address as Record<string, unknown>;
      const nestedAddress = nested.address ?? nested.Address;
      if (typeof nestedAddress === 'string') return [nestedAddress.trim()].filter(Boolean);
    }
  }
  return [];
}

export function normalizeShowAs(value: unknown): BankerCalendarEvent['showAs'] {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'free') return 'free';
  if (normalized === 'tentative') return 'tentative';
  if (normalized === 'busy') return 'busy';
  if (normalized === 'oof') return 'oof';
  if (normalized === 'workingelsewhere' || normalized === 'working elsewhere') return 'workingElsewhere';
  return 'unknown';
}

export function normalizeCalendarEvent(raw: Record<string, unknown>, sourceCalendarId?: string): BankerCalendarEvent | undefined {
  const id = raw.id ?? raw.Id ?? raw.iCalUId ?? raw.ICalUId;
  const subject = raw.subject ?? raw.Subject;
  const start = raw.startWithTimeZone ?? raw.StartWithTimeZone ?? raw.start ?? raw.Start;
  const end = raw.endWithTimeZone ?? raw.EndWithTimeZone ?? raw.end ?? raw.End;
  if (typeof id !== 'string' || typeof subject !== 'string' || typeof start !== 'string' || typeof end !== 'string') {
    return undefined;
  }
  const normalizedRange = normalizeIsoRange({
    start,
    end,
    timezone: String(raw.timeZone ?? raw.TimeZone ?? 'UTC'),
  });
  if (!normalizedRange) return undefined;
  const organizer = raw.organizer ?? raw.Organizer;
  return {
    id,
    subject,
    ...normalizedRange,
    organizer: typeof organizer === 'string' ? organizer : undefined,
    attendees: [
      ...normalizeAttendeeList(raw.requiredAttendees ?? raw.RequiredAttendees),
      ...normalizeAttendeeList(raw.optionalAttendees ?? raw.OptionalAttendees),
      ...normalizeAttendeeList(raw.Attendees ?? raw.attendees),
    ],
    location: typeof (raw.location ?? raw.Location) === 'string' ? String(raw.location ?? raw.Location) : undefined,
    onlineMeeting: Boolean(raw.onlineMeeting ?? raw.OnlineMeeting),
    isAllDay: Boolean(raw.isAllDay ?? raw.IsAllDay),
    showAs: normalizeShowAs(raw.showAs ?? raw.ShowAs),
    sourceCalendarId,
  };
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
    const conflicts = events.filter((event) => event.showAs !== 'free' && eventConflictsWithRange(event, normalized));
    return {
      ...normalized,
      status: conflicts.length > 0 ? 'conflict' : 'available',
      conflictSubjects: conflicts.map((event) => event.subject),
    };
  });
}

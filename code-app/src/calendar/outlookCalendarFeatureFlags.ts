export type OutlookCalendarReadMode = 'disabled' | 'live_read_only';

export const OUTLOOK_CALENDAR_READ_MODES: readonly OutlookCalendarReadMode[] = [
  'disabled',
  'live_read_only',
];

export function resolveOutlookCalendarReadMode(
  env: Record<string, string | undefined> = {},
): OutlookCalendarReadMode {
  const raw = (env.VITE_OUTLOOK_CALENDAR_READ_MODE ?? '').trim();
  return raw === 'live_read_only' ? 'live_read_only' : 'disabled';
}

export function getOutlookCalendarReadMode(): OutlookCalendarReadMode {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return resolveOutlookCalendarReadMode(env);
}

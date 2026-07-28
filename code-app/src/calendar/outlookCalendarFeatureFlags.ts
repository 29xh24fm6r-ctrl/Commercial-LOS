import {
  parseOutlookCalendarReadMode,
  getM365ActivationConfig,
  type OutlookCalendarReadMode,
} from '../microsoft365/m365ActivationConfig';

export type { OutlookCalendarReadMode };

export const OUTLOOK_CALENDAR_READ_MODES: readonly OutlookCalendarReadMode[] = [
  'disabled',
  'live_read_only',
];

export function resolveOutlookCalendarReadMode(
  env: Record<string, string | undefined> = {},
): OutlookCalendarReadMode {
  return parseOutlookCalendarReadMode(env.VITE_OUTLOOK_CALENDAR_READ_MODE);
}

export function getOutlookCalendarReadMode(): OutlookCalendarReadMode {
  return getM365ActivationConfig().outlookCalendarReadMode;
}

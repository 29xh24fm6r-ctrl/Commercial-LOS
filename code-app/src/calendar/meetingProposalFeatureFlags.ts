export interface MeetingWriteFeatureGates {
  outlookCalendarWriteEnabled: boolean;
  teamsMeetingCreationEnabled: boolean;
}

export function resolveMeetingWriteFeatureGates(
  env: Record<string, string | undefined> = {},
): MeetingWriteFeatureGates {
  return {
    outlookCalendarWriteEnabled: env.VITE_OUTLOOK_CALENDAR_WRITE_ENABLED === 'true',
    teamsMeetingCreationEnabled: env.VITE_TEAMS_MEETING_CREATION_ENABLED === 'true',
  };
}

export function getMeetingWriteFeatureGates(): MeetingWriteFeatureGates {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return resolveMeetingWriteFeatureGates(env);
}

import { resolveM365ActivationConfig, getM365ActivationConfig } from '../microsoft365/m365ActivationConfig';

export interface MeetingWriteFeatureGates {
  outlookCalendarWriteEnabled: boolean;
  teamsMeetingCreationEnabled: boolean;
}

export function resolveMeetingWriteFeatureGates(
  env: Record<string, string | undefined> = {},
): MeetingWriteFeatureGates {
  const config = resolveM365ActivationConfig(env);
  return {
    outlookCalendarWriteEnabled: config.outlookCalendarWriteEnabled,
    teamsMeetingCreationEnabled: config.teamsMeetingCreationEnabled,
  };
}

export function getMeetingWriteFeatureGates(): MeetingWriteFeatureGates {
  const config = getM365ActivationConfig();
  return {
    outlookCalendarWriteEnabled: config.outlookCalendarWriteEnabled,
    teamsMeetingCreationEnabled: config.teamsMeetingCreationEnabled,
  };
}

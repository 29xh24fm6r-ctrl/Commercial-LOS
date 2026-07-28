export type OutlookCalendarReadMode = 'disabled' | 'live_read_only';
export type BooleanGate = boolean;

export interface M365ActivationConfig {
  outlookCalendarReadMode: OutlookCalendarReadMode;
  outlookCalendarWriteEnabled: BooleanGate;
  teamsMeetingCreationEnabled: BooleanGate;
  teamsChannelPostEnabled: BooleanGate;
  teamsChannelPostTransportAlias: string;
  teamsMeetingTransportAlias: string;
  policyVersion: string;
}

export const M365_ACTIVATION_POLICY_VERSION = 'm365-calendar-teams-activation-2026-07-28';
export const DEFAULT_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS = 'dataverse-custom-api-teams-channel-post';
export const DEFAULT_TEAMS_MEETING_TRANSPORT_ALIAS = 'outlook-calendar-or-server-boundary-teams-meeting';

export function parseOutlookCalendarReadMode(value: string | undefined): OutlookCalendarReadMode {
  return value?.trim() === 'live_read_only' ? 'live_read_only' : 'disabled';
}

export function parseStrictBooleanGate(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function parseAlias(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized && /^[a-z0-9][a-z0-9-]{2,80}$/i.test(normalized) ? normalized : fallback;
}

export function resolveM365ActivationConfig(
  env: Record<string, string | undefined> = {},
): M365ActivationConfig {
  return {
    outlookCalendarReadMode: parseOutlookCalendarReadMode(env.VITE_OUTLOOK_CALENDAR_READ_MODE),
    outlookCalendarWriteEnabled: parseStrictBooleanGate(env.VITE_OUTLOOK_CALENDAR_WRITE_ENABLED),
    teamsMeetingCreationEnabled: parseStrictBooleanGate(env.VITE_TEAMS_MEETING_CREATION_ENABLED),
    teamsChannelPostEnabled: parseStrictBooleanGate(env.VITE_TEAMS_CHANNEL_POST_ENABLED),
    teamsChannelPostTransportAlias: parseAlias(
      env.VITE_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS,
      DEFAULT_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS,
    ),
    teamsMeetingTransportAlias: parseAlias(
      env.VITE_TEAMS_MEETING_TRANSPORT_ALIAS,
      DEFAULT_TEAMS_MEETING_TRANSPORT_ALIAS,
    ),
    policyVersion: parseAlias(env.VITE_M365_ACTIVATION_POLICY_VERSION, M365_ACTIVATION_POLICY_VERSION),
  };
}

export function getM365ActivationConfig(): M365ActivationConfig {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return resolveM365ActivationConfig(env);
}

export interface M365ConfigMatrixRow {
  variable: string;
  allowedValues: string;
  defaultValue: string;
  productionValue: string;
  prerequisites: string;
  effect: string;
  rollbackValue: string;
}

export const M365_CONFIG_MATRIX: readonly M365ConfigMatrixRow[] = [
  {
    variable: 'VITE_OUTLOOK_CALENDAR_READ_MODE',
    allowedValues: 'disabled | live_read_only',
    defaultValue: 'disabled',
    productionValue: 'disabled until controlled activation',
    prerequisites: 'Office 365 Outlook connector runtime binding; signed-in banker; read-only evidence lane.',
    effect: 'Allows read-only signed-in-user calendar diagnostics and availability derivation.',
    rollbackValue: 'disabled',
  },
  {
    variable: 'VITE_OUTLOOK_CALENDAR_WRITE_ENABLED',
    allowedValues: 'true | false',
    defaultValue: 'false',
    productionValue: 'false until internal test write certification',
    prerequisites: 'Calendar read PASS; approved internal recipients; duplicate/reconciliation evidence.',
    effect: 'Allows the governed adapter boundary to submit calendar event create requests.',
    rollbackValue: 'false',
  },
  {
    variable: 'VITE_TEAMS_MEETING_CREATION_ENABLED',
    allowedValues: 'true | false',
    defaultValue: 'false',
    productionValue: 'false until Teams join URL certification',
    prerequisites: 'Calendar write PASS; supported Teams meeting boundary provisioned; join URL evidence.',
    effect: 'Requests Teams meeting creation only through the approved meeting boundary.',
    rollbackValue: 'false',
  },
  {
    variable: 'VITE_TEAMS_CHANNEL_POST_ENABLED',
    allowedValues: 'true | false',
    defaultValue: 'false',
    productionValue: 'false until one approved internal test channel is certified',
    prerequisites: 'Server-side transport provisioned; approved target registry; audit/reconciliation evidence.',
    effect: 'Allows confirmed post requests to leave the browser for the server-side Teams posting boundary.',
    rollbackValue: 'false',
  },
  {
    variable: 'VITE_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS',
    allowedValues: 'safe alias: letters, digits, dash',
    defaultValue: DEFAULT_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS,
    productionValue: DEFAULT_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS,
    prerequisites: 'Provisioned server-side transport matching the alias.',
    effect: 'Names the approved server-side Teams post transport without exposing connection IDs.',
    rollbackValue: DEFAULT_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS,
  },
  {
    variable: 'VITE_TEAMS_MEETING_TRANSPORT_ALIAS',
    allowedValues: 'safe alias: letters, digits, dash',
    defaultValue: DEFAULT_TEAMS_MEETING_TRANSPORT_ALIAS,
    productionValue: DEFAULT_TEAMS_MEETING_TRANSPORT_ALIAS,
    prerequisites: 'Generated Outlook connector support or approved server-side meeting transport.',
    effect: 'Names the approved Teams meeting creation boundary without exposing connection IDs.',
    rollbackValue: DEFAULT_TEAMS_MEETING_TRANSPORT_ALIAS,
  },
  {
    variable: 'VITE_M365_ACTIVATION_POLICY_VERSION',
    allowedValues: 'safe alias: letters, digits, dash',
    defaultValue: M365_ACTIVATION_POLICY_VERSION,
    productionValue: M365_ACTIVATION_POLICY_VERSION,
    prerequisites: 'Operator evidence uses the same policy version.',
    effect: 'Stamps proposals, diagnostics, transport requests, and evidence.',
    rollbackValue: M365_ACTIVATION_POLICY_VERSION,
  },
];

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
  parser: string;
  allowedValues: string;
  defaultValue: string;
  productionValue: string;
  activationValue: string;
  prerequisites: string;
  owningCapability: string;
  effect: string;
  rollbackValue: string;
}

export const M365_CONFIG_MATRIX: readonly M365ConfigMatrixRow[] = [
  {
    variable: 'VITE_EMAIL_MODE',
    parser: 'src/deals/emailDelivery/emailMode.ts::readEmailModeFromEnv',
    allowedValues: 'DRY_RUN | HANDOFF | LIVE',
    defaultValue: 'DRY_RUN',
    productionValue: 'LIVE for already-certified internal diagnostic send only',
    activationValue: 'LIVE',
    prerequisites: 'Office 365 Outlook connector runtime binding; internal diagnostic send certification evidence.',
    owningCapability: 'Outlook email internal diagnostic send',
    effect: 'Allows governed Outlook email adapter to call SendEmailV2 for explicitly initiated approved email sends.',
    rollbackValue: 'DRY_RUN',
  },
  {
    variable: 'VITE_OUTLOOK_CALENDAR_READ_MODE',
    parser: 'src/microsoft365/m365ActivationConfig.ts::parseOutlookCalendarReadMode',
    allowedValues: 'disabled | live_read_only',
    defaultValue: 'disabled',
    productionValue: 'disabled until controlled activation',
    activationValue: 'live_read_only',
    prerequisites: 'Office 365 Outlook connector runtime binding; signed-in banker; read-only evidence lane.',
    owningCapability: 'Outlook Calendar read-only and availability',
    effect: 'Allows read-only signed-in-user calendar diagnostics and availability derivation.',
    rollbackValue: 'disabled',
  },
  {
    variable: 'VITE_OUTLOOK_CALENDAR_WRITE_ENABLED',
    parser: 'src/microsoft365/m365ActivationConfig.ts::parseStrictBooleanGate',
    allowedValues: 'true | false',
    defaultValue: 'false',
    productionValue: 'false until internal test write certification',
    activationValue: 'true',
    prerequisites: 'Calendar read PASS; approved internal recipients; duplicate/reconciliation evidence.',
    owningCapability: 'Outlook Calendar governed event creation',
    effect: 'Allows the governed adapter boundary to submit calendar event create requests.',
    rollbackValue: 'false',
  },
  {
    variable: 'VITE_TEAMS_MEETING_CREATION_ENABLED',
    parser: 'src/microsoft365/m365ActivationConfig.ts::parseStrictBooleanGate',
    allowedValues: 'true | false',
    defaultValue: 'false',
    productionValue: 'false until Teams join URL certification',
    activationValue: 'true',
    prerequisites: 'Calendar write PASS; supported Teams meeting boundary provisioned; join URL evidence.',
    owningCapability: 'Teams meeting creation boundary',
    effect: 'Requests Teams meeting creation only through the approved meeting boundary.',
    rollbackValue: 'false',
  },
  {
    variable: 'VITE_TEAMS_CHANNEL_POST_ENABLED',
    parser: 'src/microsoft365/m365ActivationConfig.ts::parseStrictBooleanGate',
    allowedValues: 'true | false',
    defaultValue: 'false',
    productionValue: 'false until one approved internal test channel is certified',
    activationValue: 'true',
    prerequisites: 'Server-side transport provisioned; approved target registry; audit/reconciliation evidence.',
    owningCapability: 'Teams channel posting boundary',
    effect: 'Allows confirmed post requests to leave the browser for the server-side Teams posting boundary.',
    rollbackValue: 'false',
  },
  {
    variable: 'VITE_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS',
    parser: 'src/microsoft365/m365ActivationConfig.ts::parseAlias',
    allowedValues: 'safe alias: letters, digits, dash',
    defaultValue: DEFAULT_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS,
    productionValue: DEFAULT_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS,
    activationValue: DEFAULT_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS,
    prerequisites: 'Provisioned server-side transport matching the alias.',
    owningCapability: 'Teams channel posting transport selection',
    effect: 'Names the approved server-side Teams post transport without exposing connection IDs.',
    rollbackValue: DEFAULT_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS,
  },
  {
    variable: 'VITE_TEAMS_MEETING_TRANSPORT_ALIAS',
    parser: 'src/microsoft365/m365ActivationConfig.ts::parseAlias',
    allowedValues: 'safe alias: letters, digits, dash',
    defaultValue: DEFAULT_TEAMS_MEETING_TRANSPORT_ALIAS,
    productionValue: DEFAULT_TEAMS_MEETING_TRANSPORT_ALIAS,
    activationValue: DEFAULT_TEAMS_MEETING_TRANSPORT_ALIAS,
    prerequisites: 'Generated Outlook connector support or approved server-side meeting transport.',
    owningCapability: 'Teams meeting transport selection',
    effect: 'Names the approved Teams meeting creation boundary without exposing connection IDs.',
    rollbackValue: DEFAULT_TEAMS_MEETING_TRANSPORT_ALIAS,
  },
  {
    variable: 'VITE_M365_ACTIVATION_POLICY_VERSION',
    parser: 'src/microsoft365/m365ActivationConfig.ts::parseAlias',
    allowedValues: 'safe alias: letters, digits, dash',
    defaultValue: M365_ACTIVATION_POLICY_VERSION,
    productionValue: M365_ACTIVATION_POLICY_VERSION,
    activationValue: M365_ACTIVATION_POLICY_VERSION,
    prerequisites: 'Operator evidence uses the same policy version.',
    owningCapability: 'Microsoft 365 activation evidence policy',
    effect: 'Stamps proposals, diagnostics, transport requests, and evidence.',
    rollbackValue: M365_ACTIVATION_POLICY_VERSION,
  },
];

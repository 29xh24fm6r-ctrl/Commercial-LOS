# Microsoft 365 Calendar + Teams activation configuration matrix - 2026-07-28

This is the canonical repository-side configuration matrix for the post-merge Microsoft 365 Calendar + Teams activation program. All values are client-visible Vite flags unless noted; no secrets, connection IDs, tenant object IDs, raw team IDs, or channel IDs belong here.

The code source of truth is `M365_CONFIG_MATRIX` in `src/microsoft365/m365ActivationConfig.ts`, plus `src/deals/emailDelivery/emailMode.ts` for the already-certified Outlook email mode.

| Variable | Exact parser | Allowed values | Current production value | Activation value | Rollback value | Owning capability |
| --- | --- | --- | --- | --- | --- | --- |
| `VITE_EMAIL_MODE` | `src/deals/emailDelivery/emailMode.ts::readEmailModeFromEnv` | `DRY_RUN`, `HANDOFF`, `LIVE` | `LIVE` for already-certified internal diagnostic send only | `LIVE` | `DRY_RUN` | Outlook email internal diagnostic send |
| `VITE_OUTLOOK_CALENDAR_READ_MODE` | `src/microsoft365/m365ActivationConfig.ts::parseOutlookCalendarReadMode` | `disabled`, `live_read_only` | `disabled` until controlled activation | `live_read_only` | `disabled` | Outlook Calendar read-only and availability |
| `VITE_OUTLOOK_CALENDAR_WRITE_ENABLED` | `src/microsoft365/m365ActivationConfig.ts::parseStrictBooleanGate` | `true`, `false` | `false` until internal test write certification | `true` | `false` | Outlook Calendar governed event creation |
| `VITE_TEAMS_MEETING_CREATION_ENABLED` | `src/microsoft365/m365ActivationConfig.ts::parseStrictBooleanGate` | `true`, `false` | `false` until Teams join URL certification | `true` | `false` | Teams meeting creation boundary |
| `VITE_TEAMS_CHANNEL_POST_ENABLED` | `src/microsoft365/m365ActivationConfig.ts::parseStrictBooleanGate` | `true`, `false` | `false` until one approved internal test channel is certified | `true` | `false` | Teams channel posting boundary |
| `VITE_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS` | `src/microsoft365/m365ActivationConfig.ts::parseAlias` | Safe alias: letters, digits, dash | `dataverse-custom-api-teams-channel-post` | `dataverse-custom-api-teams-channel-post` | `dataverse-custom-api-teams-channel-post` | Teams channel posting transport selection |
| `VITE_TEAMS_MEETING_TRANSPORT_ALIAS` | `src/microsoft365/m365ActivationConfig.ts::parseAlias` | Safe alias: letters, digits, dash | `outlook-calendar-or-server-boundary-teams-meeting` | `outlook-calendar-or-server-boundary-teams-meeting` | `outlook-calendar-or-server-boundary-teams-meeting` | Teams meeting transport selection |
| `VITE_M365_ACTIVATION_POLICY_VERSION` | `src/microsoft365/m365ActivationConfig.ts::parseAlias` | Safe alias: letters, digits, dash | `m365-calendar-teams-activation-2026-07-28` | `m365-calendar-teams-activation-2026-07-28` | `m365-calendar-teams-activation-2026-07-28` | Microsoft 365 activation evidence policy |

## Parser rules

- Missing values fail closed.
- Malformed read mode values resolve to `disabled`.
- `VITE_EMAIL_MODE` accepts only `LIVE` and `HANDOFF` as non-default modes; missing or malformed values resolve to `DRY_RUN`.
- Boolean write gates are enabled only by the exact case-insensitive string `true`.
- Transport aliases are labels only, not connection details.
- Production currently keeps every new Microsoft 365 write gate disabled.
- Changing any Vite value requires rebuilding the bundle and then an operator `pac code push` before the app can observe the change.

## Related checks

- `scripts/activation/verify-outlook-connector.ps1`
- `scripts/activation/verify-outlook-calendar-connector.ps1`
- `scripts/activation/verify-microsoft365-integration.ps1`
- `scripts/activation/verify-teams-channel-posting-boundary.ps1`
- `scripts/activation/run-m365-calendar-teams-production-certification.ps1`

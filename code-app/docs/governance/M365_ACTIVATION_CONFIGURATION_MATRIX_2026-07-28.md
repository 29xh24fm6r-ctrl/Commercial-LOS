# Microsoft 365 Calendar + Teams activation configuration matrix - 2026-07-28

This is the canonical repository-side configuration matrix for the post-merge Microsoft 365 Calendar + Teams activation program. All values are client-visible Vite flags unless noted; no secrets, connection IDs, tenant object IDs, raw team IDs, or channel IDs belong here.

| Variable | Allowed values | Default | Current production value | Required prerequisites | Effect | Rollback value |
| --- | --- | --- | --- | --- | --- | --- |
| `VITE_OUTLOOK_CALENDAR_READ_MODE` | `disabled`, `live_read_only` | `disabled` | `disabled` until controlled activation | Office 365 Outlook connector runtime binding; signed-in banker; read-only evidence lane | Allows read-only signed-in-user calendar diagnostics and availability derivation | `disabled` |
| `VITE_OUTLOOK_CALENDAR_WRITE_ENABLED` | `true`, `false` | `false` | `false` until internal test write certification | Calendar read PASS; approved internal recipients; duplicate/reconciliation evidence | Allows the governed adapter boundary to submit calendar event create requests | `false` |
| `VITE_TEAMS_MEETING_CREATION_ENABLED` | `true`, `false` | `false` | `false` until Teams join URL certification | Calendar write PASS; supported Teams meeting boundary provisioned; join URL evidence | Requests Teams meeting creation only through the approved meeting boundary | `false` |
| `VITE_TEAMS_CHANNEL_POST_ENABLED` | `true`, `false` | `false` | `false` until one approved internal test channel is certified | Server-side transport provisioned; approved target registry; audit/reconciliation evidence | Allows confirmed post requests to leave the browser for the server-side Teams posting boundary | `false` |
| `VITE_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS` | Safe alias: letters, digits, dash | `dataverse-custom-api-teams-channel-post` | `dataverse-custom-api-teams-channel-post` | Provisioned server-side transport matching the alias | Names the approved server-side Teams post transport without exposing connection IDs | `dataverse-custom-api-teams-channel-post` |
| `VITE_TEAMS_MEETING_TRANSPORT_ALIAS` | Safe alias: letters, digits, dash | `outlook-calendar-or-server-boundary-teams-meeting` | `outlook-calendar-or-server-boundary-teams-meeting` | Generated Outlook connector support or approved server-side meeting transport | Names the approved Teams meeting creation boundary without exposing connection IDs | `outlook-calendar-or-server-boundary-teams-meeting` |
| `VITE_M365_ACTIVATION_POLICY_VERSION` | Safe alias: letters, digits, dash | `m365-calendar-teams-activation-2026-07-28` | `m365-calendar-teams-activation-2026-07-28` | Operator evidence uses the same policy version | Stamps proposals, diagnostics, transport requests, and evidence | `m365-calendar-teams-activation-2026-07-28` |

## Parser rules

- Missing values fail closed.
- Malformed read mode values resolve to `disabled`.
- Boolean write gates are enabled only by the exact case-insensitive string `true`.
- Transport aliases are labels only, not connection details.
- Production currently keeps every new Microsoft 365 write gate disabled.

## Related checks

- `scripts/activation/verify-outlook-connector.ps1`
- `scripts/activation/verify-outlook-calendar-connector.ps1`
- `scripts/activation/verify-microsoft365-integration.ps1`
- `scripts/activation/verify-teams-channel-posting-boundary.ps1`
- `scripts/activation/run-m365-calendar-teams-production-certification.ps1`

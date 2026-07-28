# Teams channel posting security model

Teams channel posting is not a browser integration. It must use an approved server-side boundary and must remain `NOT_CONFIGURED` until tenant resources, target aliases, policy, and audit are certified.

## Approved boundary

Preferred: Dataverse Custom API plus server-side handler, matching the repository's governed custom API pattern.

Allowed alternatives after architecture approval:

- Power Automate flow
- Azure Function
- approved custom connector

The browser must never call Microsoft Graph, Teams APIs, webhook URLs, Azure Functions, Power Automate HTTP endpoints, or arbitrary network transports directly.

## Feature gate

```text
VITE_TEAMS_CHANNEL_POST_ENABLED=false
```

Default is false. Missing, misspelled, or any value other than `true` is false.

## Target governance

Banker UI may select only governed aliases. It must not expose or accept raw team IDs or raw channel IDs.

Each target requires:

- approved team/channel alias;
- display name;
- active/inactive state;
- environment;
- policy version.

## Content classification

Allowed safe preview fields:

- deal name;
- stage;
- assigned banker;
- blockers;
- next action;
- LOS deep link;
- timestamp.

Forbidden content:

- tax IDs;
- account numbers;
- confidential document contents;
- access tokens;
- raw team/channel IDs.

## Outcome vocabulary

- `NOT_CONFIGURED`
- `WRITE_DISABLED`
- `LIVE_ACCEPTED`
- `LIVE_CONFIRMED`
- `BLOCKED`
- `UNKNOWN`

The UI may not claim a post succeeded unless the server-side response proves it. Accepted is not confirmed.

## Audit

Every confirmed request must write/verify a Dataverse audit event containing actor, deal, target alias, content hash, safe preview, transport outcome, returned message ID if present, correlation ID, and timestamp.

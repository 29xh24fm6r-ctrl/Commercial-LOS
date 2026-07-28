# M365-A6 Teams Channel Posting Transport

Date: 2026-07-28

## Decision

Teams channel posting is now wired as a deployable, governed transport package, but no Teams channel post is sent by this repository lane.

The app prepares only a safe preview with:

- an approved target alias;
- a redacted message body;
- a content hash;
- a correlation ID;
- an idempotency key.

The live post boundary remains server-side through the Dataverse custom API contract `cr664_TeamsChannelPost` or an approved Power Automate child flow. Browser code must not call Microsoft Graph, incoming webhooks, raw team IDs, or raw channel IDs.

## Assets

- `microsoft365/teams/dataverse-custom-api-teams-channel-post.json`
- `microsoft365/teams/channel-post-target-registry.json`
- `scripts/activation/verify-teams-channel-posting-transport.ps1`
- `src/teamsChannelPosting/teamsChannelPostAdapter.ts`
- `src/teamsChannelPosting/TeamsChannelPostPanel.tsx`

## Activation state

`credit-ops-test-channel` is present in the registry but inactive by default. Operator activation must provide the real tenant-side target binding, approve the Dataverse custom API or child flow, and set the production gate only after evidence is captured.

## Required operator evidence

1. Verify the target alias maps to one internal test Teams channel.
2. Confirm the server-side custom API enforces approved operator authorization.
3. Confirm duplicate `idempotencyKey` submissions do not create duplicate posts.
4. Confirm blocked/redacted fields are not posted.
5. Run `scripts/activation/verify-teams-channel-posting-transport.ps1`.

## Rollback

Set `VITE_TEAMS_CHANNEL_POST_ENABLED=false`, deactivate all target aliases in the tenant-side registry, and disable the Dataverse custom API or child flow connection. The UI will continue to show proposal-only previews and will not claim success.

# M365 Calendar + Teams Production Activation Runbook

Date: 2026-07-28

This is the single operator runbook for Microsoft 365 Calendar and Teams activation. Codex prepared the wiring, contracts, verification harnesses, and evidence templates. Operators perform the live tenant actions.

## PREDEPLOYMENT

1. Confirm the branch/PR is reviewed and approved.
2. Confirm `.env.production` uses only canonical application configuration names:
   - `VITE_EMAIL_MODE=LIVE` is already certified for the internal Outlook diagnostic send path only.
   - `VITE_OUTLOOK_CALENDAR_READ_MODE=disabled`
   - `VITE_OUTLOOK_CALENDAR_WRITE_ENABLED=false`
   - `VITE_TEAMS_MEETING_CREATION_ENABLED=false`
   - `VITE_TEAMS_CHANNEL_POST_ENABLED=false`
   - `VITE_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS=dataverse-custom-api-teams-channel-post`
   - `VITE_TEAMS_MEETING_TRANSPORT_ALIAS=outlook-calendar-or-server-boundary-teams-meeting`
3. Run read-only certification:
   `powershell -File scripts/activation/run-m365-calendar-teams-production-certification.ps1`
4. Confirm every repository verifier is `PASS` or the lane is held as `UNKNOWN`; fix any `BLOCKED` lane before deployment.
5. Confirm no evidence template is pre-filled with PASS.
6. Remember that changing `.env.production` changes build-time Vite values. The operator must rebuild and run `pac code push` before the deployed app can observe any changed value.

## DEPLOYMENT

Operator-only deployment command:

```powershell
pac code push
```

Codex must not run this command.

## Controlled activation order

Only one lane is activated and certified at a time. If a lane fails, roll it back before continuing to the next lane.

### 0. Outlook email internal diagnostic send

- Gate/config: `VITE_EMAIL_MODE=LIVE`
- Current status: already certified by `docs/operator-evidence/OUTLOOK_LIVE_SEND_CERTIFICATION_2026-07-28.md`
- Scope: internal diagnostic send only
- Not claimed: borrower delivery, read receipt, shared mailbox behavior, external-recipient deliverability, or broad borrower messaging certification
- Rollback: rebuild with `VITE_EMAIL_MODE=DRY_RUN`, then operator runs `pac code push`
- Pass/fail: PASS comes from the existing canonical certification document; do not repeat the live send unless that evidence is invalidated

### 1. Outlook Calendar read-only

- Gate/config: `VITE_OUTLOOK_CALENDAR_READ_MODE=live_read_only`
- UI path: Banker Workspace → selected deal → Calendar availability/read diagnostic
- Test input: signed-in internal banker with real Outlook calendar events
- Accepted result: read-only events load; free/all-day/non-blocking entries do not create false conflicts
- Downstream confirmation: availability panel uses the same retrieved events
- Evidence file: `docs/operator-evidence/m365-calendar-teams/calendar-runtime.md`
- Rollback: rebuild with `VITE_OUTLOOK_CALENDAR_READ_MODE=disabled`, then operator runs `pac code push`
- Pass/fail: PASS only when runtime binding and read-only retrieval are proven

### 2. Outlook availability

- Gate/config: `VITE_OUTLOOK_CALENDAR_READ_MODE=live_read_only`
- UI path: Banker Workspace → selected deal → availability panel
- Test input: banker calendar with one busy conflict and one free event
- Accepted result: busy conflict is shown; free event is ignored; timezone is correct
- Downstream confirmation: proposed meeting slots avoid busy windows
- Evidence file: `docs/operator-evidence/m365-calendar-teams/availability.md`
- Rollback: disable calendar read gate
- Pass/fail: PASS only when real calendar data drives the panel

### 3. Outlook Calendar write for internal test users

- Gate/config: `VITE_OUTLOOK_CALENDAR_WRITE_ENABLED=true`
- UI path: Banker Workspace → meeting proposal workflow/admin event creation diagnostic
- Test input: one internal organizer and approved internal test attendees
- Accepted result: real Outlook event is created, duplicate idempotency key is blocked, external recipients are rejected
- Downstream confirmation: organizer calendar and attendee inbox show the same event
- Evidence file: `docs/operator-evidence/m365-calendar-teams/outlook-event-creation.md`
- Rollback: rebuild with `VITE_OUTLOOK_CALENDAR_WRITE_ENABLED=false`, then operator runs `pac code push`
- Pass/fail: PASS only with durable event ID and audit evidence

### 4. Teams meeting creation

- Gate/config: `VITE_TEAMS_MEETING_CREATION_ENABLED=true`
- UI path: meeting proposal workflow using approved server-side Teams meeting boundary
- Test input: internal test attendees and approved meeting subject/body
- Accepted result: server-side boundary returns a real Teams join URL; the app never fabricates a URL
- Downstream confirmation: attendees can open/join the meeting
- Evidence file: `docs/operator-evidence/m365-calendar-teams/teams-meeting.md`
- Rollback: rebuild with `VITE_TEAMS_MEETING_CREATION_ENABLED=false`, then operator runs `pac code push`; disable the server boundary if it was provisioned
- Pass/fail: PASS only with a real join URL and no invented fallback

### 5. Teams app installation for test users

- Gate/config: Teams Admin Center scoped test-user assignment
- UI path: Microsoft Teams → Apps → Old Glory Bank Commercial Lending LOS
- Test input: package from `scripts/microsoft365/build-teams-package.ps1`
- Accepted result: Teams accepts the package; assigned test users can open the personal tab
- Downstream confirmation: tab loads the Power Apps Commercial LOS URL in Teams
- Evidence file: `docs/operator-evidence/m365-calendar-teams/teams-app.md`
- Rollback: remove test-user assignment or uninstall uploaded package
- Pass/fail: PASS only when scoped users can install/open

### 6. Teams channel posting to one approved internal test channel

- Gate/config: `VITE_TEAMS_CHANNEL_POST_ENABLED=true`, `VITE_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS=dataverse-custom-api-teams-channel-post`, and active tenant-side target alias `credit-ops-test-channel`
- UI path: Banker Workspace → Teams channel post
- Test input: one safe preview for an internal test deal
- Accepted result: one post reaches the approved internal test channel; unauthorized aliases and duplicate idempotency keys are rejected
- Downstream confirmation: Dataverse audit event links returned message ID, content hash, and correlation ID
- Evidence file: `docs/operator-evidence/m365-calendar-teams/teams-channel-post.md`
- Rollback: rebuild with `VITE_TEAMS_CHANNEL_POST_ENABLED=false`, then operator runs `pac code push`; deactivate the target alias/server flow
- Pass/fail: PASS only with safe content, audit, authorization, and idempotency proof

## Final decision

Run:

```powershell
powershell -File scripts/activation/run-m365-calendar-teams-production-certification.ps1
```

Proceed only when the script emits:

```text
OVERALL=GO
```

Any `BLOCKED` lane is `NO_GO`. Any `UNKNOWN` lane requires more operator evidence before launch.

# M365-A4 Teams meeting creation boundary - 2026-07-28

## Decision

The generated Office 365 Outlook connector exposes calendar create/update/read operations, including `V4CalendarPostItem`, but the generated model does not expose a reliable Teams join URL field. Because the LOS must never fabricate a Teams meeting URL, production Teams meeting creation remains fail-closed until a supported server-side boundary is provisioned and certified.

## Supported repository boundary

Use `microsoft365/teams/teams-meeting-boundary-contract.json` as the implementation contract for one of these supported tenant-side patterns:

1. Dataverse Custom API backed by an approved server-side handler.
2. Power Automate action using Microsoft Graph/Outlook online meeting support.
3. Approved custom connector wrapping the same Microsoft-supported action.

The browser may submit only a governed proposal with correlation and idempotency metadata. The browser must not call Microsoft Graph directly.

## Certification evidence

Evidence must prove:

- a real event ID was returned;
- a real `https://teams.microsoft.com/l/meetup-join/` URL was returned by Microsoft;
- organizer can open the URL;
- attendee can join the meeting;
- event appears on organizer calendar;
- attendee invitation arrived;
- Dataverse audit/timeline record was written with the masked returned identifiers.

Until all evidence is present, Teams meeting lane verdict remains `UNKNOWN` or `BLOCKED`, never `PASS`.

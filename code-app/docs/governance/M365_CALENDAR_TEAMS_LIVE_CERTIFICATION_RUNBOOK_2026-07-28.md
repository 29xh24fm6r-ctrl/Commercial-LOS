# M365 Calendar + Teams live certification runbook - 2026-07-28

This runbook defines operator-run live certification procedures. It does not execute them.

## Lane A - Calendar runtime

Evidence required:

- `office365` runtime binding present.
- calendar read operation present.
- read-only event retrieval confirmed from the signed-in banker calendar.

## Lane B - Availability

Evidence required:

- real banker calendar returned;
- conflict detection confirmed;
- timezone confirmed.

## Lane C - Outlook event creation

Evidence required:

- internal test attendees only;
- event appears on organizer calendar;
- attendee invitation received;
- returned event ID recorded safely;
- duplicate prevention confirmed.

## Lane D - Teams meeting

Evidence required:

- real join URL returned;
- URL opens;
- attendee can join;
- no invented URL;
- cancellation/update behavior verified if supported.

## Lane E - Teams app

Evidence required:

- package accepted by Teams Admin Center;
- assigned test user can install/open;
- personal tab authenticates;
- deep links work.

## Lane F - Teams channel posting

Evidence required:

- approved internal test channel only;
- preview confirmed before post;
- exact safe content received;
- returned message ID recorded;
- Dataverse audit event confirmed;
- unauthorized target rejected.

## Evidence storage

Use:

```text
docs/operator-evidence/m365-calendar-teams/
```

Do not record full connection IDs, access tokens, webhook URLs, raw team/channel IDs, mailbox credentials, or tenant secrets.

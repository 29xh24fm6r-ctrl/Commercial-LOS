# M365 Calendar + Teams Production Certification Register

Date: 2026-07-28

This register is intentionally not pre-populated with PASS. Operators must update each linked evidence template only after the live tenant step is performed and independently verified.

| Lane | Evidence file | Required proof |
| --- | --- | --- |
| OUTLOOK_EMAIL | `outlook-email.md` | Internal test email can be sent through the approved Office 365 Outlook connector and audited. |
| OUTLOOK_CALENDAR_READ | `calendar-runtime.md` | Runtime binding and read-only calendar retrieval are confirmed for the signed-in banker. |
| OUTLOOK_AVAILABILITY | `availability.md` | Real busy/free calendar data drives the availability panel with timezone correctness. |
| OUTLOOK_CALENDAR_WRITE | `outlook-event-creation.md` | Governed internal-only meeting creation returns a durable event ID and blocks duplicates. |
| TEAMS_MEETING | `teams-meeting.md` | Server-side meeting creation returns a real Teams join URL; no URL is invented. |
| TEAMS_APP | `teams-app.md` | Tenant accepts the Teams package and scoped test users can open the personal tab. |
| TEAMS_CHANNEL_POST | `teams-channel-post.md` | Approved internal test channel receives one safe post with idempotency and audit proof. |

Final `GO` requires all seven lane evidence files to record `PASS`.

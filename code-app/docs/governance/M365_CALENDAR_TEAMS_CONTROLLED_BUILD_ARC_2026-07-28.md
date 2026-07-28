# Microsoft 365 Calendar + Teams controlled build arc — 2026-07-28

This document governs the six-phase Microsoft 365 Calendar + Teams build arc for the Commercial Lending LOS. The arc is intentionally bank-grade: read before write, proposal before execution, server-side boundary before Teams posting, and live certification only after operator evidence.

## Status vocabulary

- `NOT_CONFIGURED` — required configuration is absent.
- `CONFIGURED` — source configuration exists, but runtime proof may still be missing.
- `RUNTIME_BOUND` — generated Power Apps runtime manifest binds the required connector/data source.
- `READ_ONLY_READY` — read-only operations and gates are ready.
- `WRITE_DISABLED` — write path exists only behind disabled gates.
- `WRITE_READY` — write path has passed non-live verification and awaits operator certification.
- `LIVE_ACCEPTED` — connector/server accepted the request.
- `LIVE_CONFIRMED` — the real downstream artifact was separately confirmed.
- `BLOCKED` — a required prerequisite is missing or unsafe.
- `UNKNOWN` — evidence is absent/inconclusive.

`LIVE_ACCEPTED` must never be collapsed into `LIVE_CONFIRMED`.

## Global safety posture

- No browser-direct Microsoft Graph, Outlook REST, Teams API, Azure Function, Power Automate HTTP, or arbitrary `fetch`/`XMLHttpRequest` transport.
- All writes default disabled and fail closed.
- All writes require explicit human confirmation, structured outcomes, audit evidence, and reconciliation of `accepted` versus `confirmed`.
- Operator-only actions include connector registration, Teams package upload, tenant assignment, feature-gate activation, live smokes, and production deployment.
- Rollback posture is feature-gate first: disable the relevant gate, remove tenant assignment/package if needed, and preserve audit/evidence.

## Phase plan and gates

| Phase | Scope | Feature gates | GO criteria | NO-GO criteria |
| --- | --- | --- | --- | --- |
| M365-1 | Calendar connector inventory + runtime verifier | none | verifier reports calendar config/runtime/read/write truthfully | missing service/config/runtime binding or invented operation |
| M365-2 | Read-only banker calendar + availability | `VITE_OUTLOOK_CALENDAR_READ_MODE=disabled|live_read_only` | read UI fails closed and uses only approved read adapter | fabricated availability or write affordance |
| M365-3 | Proposal-first Outlook/Teams meeting creation | `VITE_OUTLOOK_CALENDAR_WRITE_ENABLED=false`, `VITE_TEAMS_MEETING_CREATION_ENABLED=false` | disabled-by-default write contract + tests | direct Graph/fetch, fake Teams URL, no audit |
| M365-4 | Teams app package readiness | none | package validates locally; no upload | oversized/wrong icons, missing domains, upload attempt |
| M365-5 | Server-side Teams channel posting boundary | `VITE_TEAMS_CHANNEL_POST_ENABLED=false` | fail-closed boundary, governed target aliases, no direct Graph | free-form channel IDs, browser post, success without proof |
| M365-6 | Live certification framework | none | runbooks/templates/verifier separate every capability verdict | pre-populated PASS or live claim without operator evidence |

## Dependencies

1. PR #160 Microsoft 365 integration package.
2. PR #161 Microsoft Copilot integration packet.
3. PR #162 Outlook runtime-binding hardening.
4. Office 365 Outlook generated SDK and `office365` runtime binding.
5. Teams tenant packaging/assignment approval for Phase M365-4.
6. Approved server-side Teams posting boundary for Phase M365-5.

## Evidence requirements

Evidence must be stored under `docs/operator-evidence/` or the phase-specific governance docs. Do not record full connection IDs, access tokens, secrets, Graph bearer tokens, mailbox credentials, webhook URLs, or generated `.power` files.

## Final GO/NO-GO

Overall GO requires every in-scope lane to be `PASS` in the final live certification verdict:

- `OUTLOOK_EMAIL`
- `OUTLOOK_CALENDAR_READ`
- `OUTLOOK_CALENDAR_WRITE`
- `TEAMS_MEETING`
- `TEAMS_APP`
- `TEAMS_CHANNEL_POST`

Any `BLOCKED` or `UNKNOWN` lane prevents overall GO.

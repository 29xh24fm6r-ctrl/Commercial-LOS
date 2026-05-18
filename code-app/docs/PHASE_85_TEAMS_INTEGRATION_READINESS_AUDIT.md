# Phase 85 — Microsoft Teams Integration Readiness Audit

**Phase posture:** `docs / audit only`. No production code changed. No new tests. No schema work. No connector imports. No Teams UI routes. No new write surface. No inventory drift in this commit (a later phase would touch `platformInventory.ts` if Phase 86 implements an actual surface).

**Question this phase answers:** what is the smallest honest Microsoft Teams integration slice that can be implemented with current permissions, schema, generated services, and no-admin constraints — without faking notifications, without claiming Teams integration the app does not have, and without requiring tenant-admin connector registration or Graph secrets?

The short answer:

- **No real Teams integration is possible today** without (a) admin-side connector registration, (b) a Teams app manifest installation, or (c) Graph credentials. The same upstream `connector` blocker that pins `NOT_WIRED.outlook-connector-live-send` (Phase 61/62) extends to every Teams/Graph/Calendar surface.
- **One small handoff-style slice IS feasible** in-repo without admin: a Phase-63-style "open Teams chat with the assigned banker" deep link from the Deal Workspace. This is a no-integration handoff (the app does not post to or read from Teams) and must be labelled honestly.
- **Calendar sync, presence, push notifications, channel posting, meeting create, and Teams activity-feed writes remain Lane E** — blocked on tenant + connector + Graph permissions, the same way they were classified in `MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` §1.7 / §1.8 / §1.9 / §1.6 before this audit.

The recommended Phase 86 (see §6) is to **implement that single no-admin Teams chat handoff slice** with the same discipline Phase 63 used for Outlook email handoff: deep-link only, banker initiates, no claim of integration, no audit row, no timeline event.

Related canonical sources:

- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — `NOT_WIRED`, `LOCAL_ONLY_FLOWS`
- [src/deals/emailDelivery/outlookEmailAdapters.ts](../src/deals/emailDelivery/outlookEmailAdapters.ts) — the existing Phase 61 / 62 connector-not-registered pattern that all Teams-side work would mirror
- [src/deals/emailDelivery/emailHandoff.ts](../src/deals/emailDelivery/emailHandoff.ts) — the existing Phase 63 no-admin handoff pattern
- [docs/PHASE_61_OUTLOOK_EMAIL_DELIVERY.md](PHASE_61_OUTLOOK_EMAIL_DELIVERY.md) / [docs/PHASE_62_OUTLOOK_LIVE_SEND.md](PHASE_62_OUTLOOK_LIVE_SEND.md) / [docs/PHASE_63_EMAIL_HANDOFF_FALLBACK.md](PHASE_63_EMAIL_HANDOFF_FALLBACK.md) — prior art for the connector / LIVE-stub / HANDOFF pattern
- [docs/PHASE_64_BORROWER_PORTAL_AUDIT.md](PHASE_64_BORROWER_PORTAL_AUDIT.md) — prior art for an audit-only phase
- [src/generated/models/Cr664_dealtimelineeventsModel.ts](../src/generated/models/Cr664_dealtimelineeventsModel.ts) — `MeetingLogged` timeline event type exists in the option-set; the URL field does not

---

## 1. Current platform reality (audited)

### 1.1 Package dependencies — Teams / Graph / Calendar / Outlook surface

`package.json` `dependencies`:

```
@microsoft/power-apps      ^1.1.3
react                      ^19.2.6
react-dom                  ^19.2.6
react-router-dom           ^7.15.0
```

That is the full runtime list. No Teams / Graph / Outlook package is installed:

- ❌ `@microsoft/teams-js` — not installed. Teams host context (`microsoftTeams.app.initialize()`, `getContext()`, deep-link API) is not available.
- ❌ `@microsoft/microsoft-graph-client` — not installed. Direct Graph calls cannot be made even if a token were available.
- ❌ `@azure/msal-browser` — not installed. The app has no path to acquire a Graph access token client-side; auth flows entirely through the Power Apps SDK against Dataverse.
- ❌ `@microsoft/microsoft-graph-types` — not installed. No Graph TypeScript types.
- ❌ Any Office 365 / Outlook / Calendar / Presence package.

Installing any of these would be a Phase 86+ decision and would land alongside a corresponding connector + admin consent chain (see §3 blockers).

### 1.2 `@microsoft/power-apps` SDK surface

`node_modules/@microsoft/power-apps/dist/index.d.ts`:

```ts
import * as app from './app/index';
import * as data from './data/index';
import * as telemetry from './telemetry/index';
export { app, data, telemetry };
```

`app/index.d.ts`:

```ts
export type { IConfig, IContext } from './App.Types';
export { setConfig } from './Config';
export { getContext } from './ContextProvider';
```

`app/App.Types.d.ts` — full context shape exposed by the SDK:

```ts
export interface IContext {
  app: IAppContext;
  host: IHostContext;
  user: IUserContext;
}
export interface IUserContext {
  fullName?: string;
  objectId?: string;
  tenantId?: string;
  userPrincipalName?: string;
}
export interface IAppContext {
  appId: string;
  appSettings: object;
  environmentId: string;
  queryParams: Record<string, string>;
}
export interface IHostContext {
  sessionId: string;
}
```

Key audit results:

- **No Teams host detection.** `IHostContext` is `{ sessionId }` only. There is no `host.kind`, no `host.embeddedIn`, no `host.frameContext`, no Teams identifier. The SDK does not tell the app it is running inside Teams.
- **No Teams API surface.** `app.*` exposes `setConfig` + `getContext` only. No Teams notification API, no calendar API, no Graph proxy, no deep-link helper.
- **`data.*` is Dataverse-only.** Same surface that drives every existing `Cr664_*Service` call.
- **`telemetry.*` is logger-only.** Not a notification surface.

What the SDK does provide, that is reusable for Phase 86:

- `user.userPrincipalName` — the signed-in banker's UPN. This is the value needed to construct a Teams chat deep-link (`?users=<UPN>`). Phase 86 can read it without inventing new auth.
- `user.fullName`, `user.objectId`, `user.tenantId` — additional identity surface usable for honest "share to Teams" copy.

### 1.3 Generated services (`src/generated/services/`)

22 typed services, all `Cr664_*` Dataverse entities (loan deals, borrowers, tasks, document checklists, credit memo + sections, timeline events, users, profiles, entitlements, teams, workspaces, audit events, alert queue, system settings, KPI threshold configs, profitability snapshots, deal-readiness snapshots, performance metrics, profitability refresh statuses, data quality flags, systemusers).

Absent (negative audit results):

- ❌ No `Office365EmailService` / `Office365MailService` — same gap Phase 61 already pins as `NOT_WIRED.outlook-connector-live-send` (`blockerKind: 'connector'`).
- ❌ No `Office365CalendarService` / `Office365UsersService` — calendar / Graph user lookup not wired.
- ❌ No `MicrosoftTeamsService` / `TeamsService` — Teams connector not registered.
- ❌ No `GraphService` / `MicrosoftGraphService` — no Graph proxy.
- ❌ No `PowerAutomateService` — no Power Automate connector registered.
- ❌ No `NotificationService` / `cr664_notifications*` — there is no Dataverse entity for storing notification preferences or notification rows. Notification persistence has no schema slot today.

`Cr664_teamsService` exists but refers to the **internal lending team** entity (`cr664_teams` = workspace teams of bankers, with `cr664_teamname` + `cr664_description`). It is unrelated to Microsoft Teams.

### 1.4 App shell + runtime environment

- `src/main.tsx` — `createRoot(...).render(<StrictMode><App /></StrictMode>)`. No Teams initializer.
- `src/App.tsx` — `BrowserRouter` mounting five role workspaces + `/deals/:dealId`. No Teams-context provider, no Teams-host gate, no Teams deep-link handler.
- `index.html` — minimal Vite-default `<html>` + `<div id="root">`. No `<script src="...teams-js...">`, no Teams app manifest reference, no SDK preload.
- No Teams app manifest (`manifest.json`) in repo. Teams app installation requires (a) a manifest, (b) admin upload to Teams Admin Center or sideload via Teams Developer Portal.
- Runtime environment: standard browser, served by Power Apps' Code App host. The app sees only what `@microsoft/power-apps` exposes.

### 1.5 Schema acknowledgement of meetings (but no fields to drive them)

`Cr664_dealtimelineeventscr664_eventtype` (option-set on the timeline event entity) includes:

```
788190003: 'MeetingLogged'
```

This value is defined in the schema but is **never emitted** by any current write surface (`grep -r "MeetingLogged" src/` returns no production-code emitter). The schema acknowledges that "meeting" is a logged-event shape; it does not provide:

- A meeting-link column on `cr664_loandeals` (no `cr664_teamsmeetinglink`, no `cr664_onlinemeetingurl`, no `cr664_joinurl`).
- A separate `cr664_meetings` entity.
- Meeting attendees / agenda / outcome fields on the timeline event (the event has only `cr664_summary` (string), `cr664_payloadjson` (string), `cr664_relatedentityid` (string), `cr664_relatedentitytype` (string)).

So a meeting-link display surface today would have **nothing to display**. Adding a meeting-link column on `cr664_loandeals` and regenerating the SDK is a schema-side ask, not an in-repo phase.

### 1.6 Existing prior-art for connector-blocked surfaces

Phase 61 / 62 / 63 establish the established discipline for any Office 365 / Graph / Teams capability the connector layer does not yet support:

1. **DRY_RUN / LIVE adapter port** (`src/deals/emailDelivery/outlookEmailPort.ts`). Typed interface; the action layer never imports a connector service directly.
2. **LIVE stub returns `permanent-failure`** with a clear reason (`outlookEmailAdapters.ts:38–42`): `"Office 365 Outlook connector is not yet registered for this Code App. LIVE mode is wired end-to-end (audit + timeline + outcome union); the missing piece is the connector registration + SDK regeneration."`
3. **HANDOFF fallback** (Phase 63) — `mailto:` + clipboard copy, banker-initiated, no integration claim.
4. **Inventoried as `NOT_WIRED.<id>`** with `blockerKind: 'connector'` in `platformInventory.ts`.

This is the exact pattern Phase 86 (if it implements anything) MUST mirror for any Teams surface.

### 1.7 What "Teams" actually means in the codebase today

Two-word audit (mapped to false-positive risk):

- `Cr664_teams` / `Cr664_teamsService` — **internal lending team entity.** Unrelated to Microsoft Teams. Renaming for clarity is out of scope.
- `src/team/*` workspace — the **team workspace** role (manager/team/banker triad). Unrelated to Microsoft Teams. Phase 84 just shipped the Team Autopilot Rollup here; it is not a Teams integration.
- `SharedClosingCalendar.tsx` — deterministic **per-deal bucketing by target close month**, rendered as a calendar-style card. Not a calendar integration; no Graph/Outlook tie.

So the phrase "Teams" in source today means the internal lending team. No file in the repo uses Microsoft Teams.

---

## 2. Capability matrix

Each row is one Teams/Vibe capability classified against current reality. Status legend:

- **feasible now** — implementable without connector / admin / schema work; safe in-repo.
- **feasible as no-admin fallback** — implementable in-repo with a handoff-style pattern (deep-link, copy-to-clipboard, host-aware shell hint), no integration claim.
- **connector/admin-blocked** — needs a Power Platform connector registration AND/OR Graph permission grant by tenant admin.
- **schema-blocked** — needs a Dataverse column or table that doesn't exist; SDK has nothing to target.
- **tenant-policy-blocked** — needs admin policy approval (e.g. Teams app sideload allowed).
- **not started** — nothing built; classification reflects upstream dependency.
- **explicitly unsafe to fake** — would require fabricating UI that implies behavior the app cannot perform (e.g. "Notification sent to your Teams" without actually sending).

| # | Capability | Status | Why |
|---|---|---|---|
| 2.1 | Teams embedded host awareness (`isInsideTeams()`) | **connector/admin-blocked** (no SDK installed) + **not started** | `@microsoft/teams-js` not in `package.json`; `@microsoft/power-apps` SDK's `IHostContext` exposes only `sessionId`. A heuristic (`window.parent !== window` + tenant-id check) is possible but is unreliable — Power Apps hosts the app inside its own iframe regardless. **Honest classification: not feasible to tell.** |
| 2.2 | Teams deep-link to 1:1 chat with assigned banker | **feasible as no-admin fallback** | Construct `https://teams.microsoft.com/l/chat/0/0?users=<UPN>` from `cr664_users.cr664_email` (already loaded for the assigned banker). No connector, no SDK, no audit. Banker clicks; their Teams client opens. Honest label: "Opens your Teams client. The app does not post to or read from Teams." |
| 2.3 | Teams deep-link to a channel / team post | **schema-blocked** + **tenant-policy-blocked** | Requires (a) a Teams team-id + channel-id column on `cr664_loandeals` (does not exist), (b) the deal-to-channel mapping convention (a governance decision), (c) confidence that the channel exists for the banker (no path to verify without Graph). |
| 2.4 | Teams meeting link display on a deal | **schema-blocked** | `cr664_loandeals` has no meeting-link column. `MeetingLogged` timeline event type exists but has no URL field; `cr664_summary` and `cr664_payloadjson` are free-text. Surfacing a "Teams meeting link" today would have nothing to surface. |
| 2.5 | Calendar sync (read banker's calendar; surface upcoming deal events) | **connector/admin-blocked** | Requires Office 365 Outlook connector registration OR Graph `Calendars.Read` (admin consent). Phase 61's `NOT_WIRED.outlook-connector-live-send` (`blockerKind: 'connector'`) pins the same gap for email. Same upstream action unblocks both. |
| 2.6 | Meeting create / update / cancel | **connector/admin-blocked** + **explicitly unsafe to fake** | Requires Graph `OnlineMeetings.ReadWrite` (admin consent + delegated permission grant). The schema offers no slot to persist a created meeting. A fake "Create Teams meeting" button that does not actually create one would mislead the banker. |
| 2.7 | Push notifications to user's Teams activity feed | **connector/admin-blocked** + **explicitly unsafe to fake** | Requires Graph `TeamsActivity.Send` (Teams app registration + admin consent). Without it, the only honest option is in-app notification cards labelled "in-app only, not pushed to Teams." |
| 2.8 | Local-only in-app notification panel of deal signals | **feasible now** | Reuse the Phase 80 / 82 / 84 autopilot derivations as a centralized "what changed since you last looked" panel. Local-only, honestly labelled "Not sent to Teams." This is **already partly built** (Autopilot Lite is the closest thing to a notification panel today). |
| 2.9 | Channel / chat posting from the app | **connector/admin-blocked** | Requires Graph `ChannelMessage.Send` / `Chat.ReadWrite` (admin consent). Without it, only the Phase-63-style "Copy text → banker pastes into Teams" handoff is honest. |
| 2.10 | Teams presence display ("banker is online") | **connector/admin-blocked** | Requires Graph `Presence.Read.All` (admin consent). Without it, the app cannot read presence. Faking it (e.g. inferring from `modifiedOn`) would mislead. |
| 2.11 | Outlook calendar integration (read / write) | **connector/admin-blocked** | Same connector as 1.6. Already inventoried at `NOT_WIRED.outlook-connector-live-send`. |
| 2.12 | Graph-backed user lookup (find a person by name / UPN) | **connector/admin-blocked** | Requires Graph `User.Read.All` or `People.Read` (admin consent). Without it, the app must lean on its own `Cr664_usersService` (which is what the current bootstrap already does). |
| 2.13 | Role-scoped notification preferences (per-user opt-in to which signal types ping) | **schema-blocked** | No `cr664_notificationpreferences*` entity / columns exist. Without schema, preferences can only live in `localStorage`, which means they don't follow the user across devices — same trade-off the Phase 83 ledger accepted. |
| 2.14 | Teams app manifest (install card in Teams Admin Center) | **tenant-policy-blocked** + **connector/admin-blocked** | Requires a `manifest.json` + admin sideload. Out of scope without admin involvement. Code App can be hosted in Teams via the Teams Sideloading flow, but that is an admin path, not an in-repo phase. |
| 2.15 | Teams-aware shell banner | **feasible as no-admin fallback** with reservations | A `window.parent !== window` heuristic is unreliable inside Power Apps (always nested in an iframe). A query-param hint (e.g. `?host=teams`) IS feasible but requires the URL to be set externally. Low leverage relative to the no-admin chat deep-link (2.2). |
| 2.16 | Copy-to-Teams handoff (Phase-23-style) | **feasible now** | Generate a markdown summary of the deal (name, client, stage, target close, top next-best-action) the banker pastes into their own Teams chat. Same LOCAL_ONLY discipline as the borrower-update draft. Honest label: "Local draft. Not sent. Paste into your Teams chat." |
| 2.17 | Teams + Voice / meeting capture | **connector/admin-blocked** + **schema-blocked** + **Lane F (AI)** | Requires Graph meeting transcripts + AI summarization. Far beyond no-admin scope. Already in §1.30 of the Vibe coverage map (voice-assist, deferred). |

Summary counts:

- **feasible now:** 2 rows (2.8 in-app notification panel reuses existing autopilot derivations; 2.16 copy-to-Teams handoff).
- **feasible as no-admin fallback:** 2 rows (2.2 Teams chat deep-link; 2.15 host-banner — but 2.15 is low-leverage and partly unreliable).
- **connector/admin-blocked:** 8 rows (2.5, 2.6, 2.7, 2.9, 2.10, 2.11, 2.12, 2.14).
- **schema-blocked:** 3 rows (2.3, 2.4, 2.13).
- **explicitly unsafe to fake:** 2 rows (2.6 fake meeting create, 2.7 fake push notification).
- **not started + uncovered SDK:** 1 row (2.1 Teams host awareness).

---

## 3. Explicit blocker list

The connector / admin / schema dependencies that, until resolved, hold the broader Teams/Vibe slice of the app at "Not started":

1. **Microsoft Teams Power Platform connector is not registered for this Code App.** No `MicrosoftTeams*Service` exists in `src/generated/services/`. Until a tenant admin registers the connector AND the SDK regenerates, the app cannot make a typed connector call to Teams.
2. **No `@microsoft/teams-js` package installed.** `package.json` does not declare it; the app has no host-side Teams initializer. Even with `teams-js` installed, real Teams host detection requires the app to be sideloaded into Teams.
3. **No `@microsoft/microsoft-graph-client` package installed.** Direct Graph calls are not possible from the client.
4. **No Microsoft Graph admin consent grant.** Every meaningful Teams capability (presence, notifications, calendar, online-meeting create, channel post, user lookup) requires admin-consented Graph permissions. Code-App-style apps do not by default carry Graph delegated permissions.
5. **No Office 365 Outlook connector registered** — already pinned at `NOT_WIRED.outlook-connector-live-send` (`blockerKind: 'connector'`). The same connector is the gateway for calendar sync (1.8), so registering it would simultaneously unblock email send + calendar surfaces.
6. **No Teams app manifest in the repo.** Sideloading the Code App into Teams as a Teams app requires a manifest + admin upload to Teams Admin Center.
7. **No meeting-link column on `cr664_loandeals`.** Schema gap. The `MeetingLogged` timeline event type exists, but no field exists to display "the Teams join URL for this deal's next meeting".
8. **No notification persistence schema.** No `cr664_notifications*` entity. Cross-device notification preferences cannot be stored.
9. **No deal-to-channel mapping schema.** A "every deal has a Teams channel" pattern needs a `cr664_teamschannelid` column (or a separate mapping table). Neither exists.
10. **No path to acquire a Graph access token client-side.** The app authenticates against Dataverse via the Power Apps SDK; there is no MSAL-browser integration to acquire a Graph bearer token. Adding one is a governance + admin decision, not an in-repo phase.

---

## 4. Smallest honest Teams slice

After eliminating every "would require admin / connector / schema / Graph / secret / unsafe-to-fake" candidate, two truly no-admin, no-claim-of-integration moves remain:

**Candidate A — Teams chat deep-link handoff (recommended).**

A Deal Workspace card surfaces a "Chat with assigned banker in Teams" button. Click constructs the well-known Teams deep-link URL:

```
https://teams.microsoft.com/l/chat/0/0?users=<assigned-banker-UPN>&topic=<deal-name>
```

and opens it in a new tab. The deep-link is a stable, publicly-documented Microsoft URL pattern; it does not require admin consent, connector registration, Graph permission, or a Teams app installation. The banker's Teams client (web or desktop) opens, pre-fills the chat target, and the banker decides what to send.

Discipline (mirroring Phase 63 HANDOFF):

- Banker-initiated only; no automatic open.
- Honest label: "Opens your Teams client. The app does not post to, read from, or sync with Teams."
- No Dataverse write, no audit row, no timeline event (the app cannot verify the chat was opened, much less sent).
- The assigned banker's UPN comes from `Cr664_usersService.cr664_email` — already loaded by the bootstrap chain.
- New `LOCAL_ONLY_FLOWS.teams-chat-handoff` entry inventoried in `platformInventory.ts` with the same disclaimers Phase 63's email handoff carries.

Why this is the recommended slice:

- Closes the half of Vibe §1.7 ("thread-in-deal pattern") that does not require admin.
- Reuses the Phase-63 pattern verbatim — same kind of LOCAL_ONLY handoff already shipped for Outlook.
- Surfaces real banker value (one-click to a Teams chat with the deal's banker) without claiming anything the app cannot do.
- Adds < 200 LOC to the codebase; one Deal Workspace card + one helper + tests.
- Zero risk of misleading copy if labelled "Opens your Teams client" instead of "Sends a Teams message".

**Candidate B — Copy-to-Teams deal summary (fallback).**

A modal that generates a markdown summary of the deal (name, client, stage, target close, top next-best-action) the banker can paste into any Teams chat / channel. Same shape as the Phase 23 borrower update draft. Phase 23 prior art:

- Local-only; never persisted.
- Copy to clipboard via `navigator.clipboard.writeText`.
- Verbatim footer: "Local draft. Not saved to the system. Paste into the appropriate destination."

Why this is the runner-up:

- Useful, but lower leverage than Candidate A (most bankers will hit "open chat", not "copy summary").
- Already partly served by other LOCAL_ONLY flows (relationship-note-draft, borrower-update-draft, borrower-safe-status-packet).

Phase 86 could ship A only, B only, or A + B. A is the minimum honest Teams move; B is a sibling extension. Recommend starting with **A**.

**Candidates explicitly NOT in scope** (would fail the no-admin / no-fake test):

- ❌ Teams push notifications — connector + admin + Graph required.
- ❌ Calendar sync — connector + admin + Graph required.
- ❌ Meeting create / link display — schema + Graph required.
- ❌ Presence — Graph + admin required.
- ❌ Teams app sideload / Teams-hosted iframe — admin policy required.

---

## 5. Coverage map updates

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` is being updated in this commit to reflect what Phase 85 audited. The changes are entirely descriptive — they record what the audit found, not a new capability.

- §1.7 (Microsoft Teams integration) — current state revised from "Not started" to "Not started; Phase 85 audited the upstream dependencies and identified a single no-admin chat-deep-link handoff as the only feasible in-repo slice." Blocker list and safe-next-step entries refer to this doc.
- §1.8 (Teams calendar sync) — current state unchanged ("Not started"); the audit reaffirms calendar is connector + admin + Graph blocked.
- §1.9 (Teams notifications) — current state revised to add: "Phase 85 reaffirmed: in-app notification panels are feasible (and partly served by Phase 80/82/84 autopilot); push to Teams remains connector + admin + Graph blocked. Faking 'Notification sent to Teams' is explicitly forbidden."
- Lane E ("Needs Teams integration") — annotated to point at PHASE_85 as the audit; the Lane E shopping list (Teams app registration, Graph permissions, calendar sync, notifications, etc.) is unchanged.

No capability is marked as "operational" or "feasible now" beyond what was already classified. No status is upgraded by the audit alone; status only changes when Phase 86 ships.

---

## 6. Recommended Phase 86

**Recommended: Phase 86 — Teams chat handoff (no-admin LOCAL_ONLY).**

Implement Candidate A from §4. Single Deal Workspace card with a "Chat with assigned banker in Teams" button that opens the well-known Teams deep-link in a new tab. Mirrors the Phase 63 Outlook handoff pattern verbatim:

- New `LOCAL_ONLY_FLOWS.teams-chat-handoff` entry with explicit disclaimer.
- Pure helper that builds the URL from the deal's assigned-banker UPN.
- Banker-initiated only; no audit, no timeline, no write.
- Honest copy: "Opens your Teams client. The app does not post to, read from, or sync with Teams."
- Tests pin URL format, missing-UPN graceful fallback, and forbidden vocab in rendered DOM (no "sent", "delivered", "synced").
- Vibe coverage map §1.7 advances from "Not started" to "Partial (handoff-only)" — same advancement Phase 63 made for §1.6.

Alternative Phase 86 paths (and why they are not the recommendation):

- **Defer Teams entirely until upstream Lane B + Lane E lands.** Safe, honest, but leaves a meaningful no-admin move on the table. Pick this if the next phase brief prefers to spend a phase elsewhere (e.g. Phase 86 → manager-scoped child-data loader, or schema-side work).
- **Phase 86 implements both A + B (chat handoff + copy-to-Teams summary).** Higher leverage; ~2x the surface area; same risk profile. Acceptable but starts heavier than the minimum honest slice. Could be Phase 86 + Phase 87.
- **Add a schema field for Teams meeting links first.** Out of scope without admin / schema action. Should be a separate brief if the team wants the meeting-link surface.

**Recommendation: Phase 86 — implement Candidate A only**. It is the smallest implementation that advances §1.7 honestly, reuses an established pattern (Phase 63), needs no admin, and has zero risk of overclaim.

---

## 7. Acceptance criteria — Phase 85

- ✅ Teams capability matrix exists (§2; 17 rows classified).
- ✅ Blockers explicit (§3; 10 numbered upstream dependencies).
- ✅ Smallest honest Teams slice identified (§4 Candidate A: Teams chat deep-link handoff).
- ✅ No false Teams claims anywhere in the doc; "feasible" rows clearly distinguished from "feasible as no-admin fallback" rows.
- ✅ No production behavior changed in this commit (docs only; coverage-map descriptive updates only).
- ✅ Vibe coverage map updated honestly (§1.7 / §1.9 prose revised to reference this audit; Lane E unchanged).

---

## 8. Files created / modified (this phase)

**Created:**

- `docs/PHASE_85_TEAMS_INTEGRATION_READINESS_AUDIT.md` — this document.

**Modified:**

- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.7 current-state + safe-next-step revised; §1.9 current-state annotated; Lane E pointer added. No new lane, no row reclassification.

**Not modified (by deliberate posture):**

- No production source file.
- No test file.
- No connector import (none exist to import).
- No schema change.
- No `platformInventory.ts` row.

---

## 9. AAR

- **Files created:** `docs/PHASE_85_TEAMS_INTEGRATION_READINESS_AUDIT.md` (this doc).
- **Files modified:** `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` (§1.7 + §1.9 + Lane E pointer).
- **Teams capabilities audited:** 17 rows in §2 capability matrix.
- **Blockers identified:** 10 numbered upstream dependencies in §3 (connector, SDK, Graph admin consent, Outlook connector, Teams manifest, meeting-link column, notification entity, deal-to-channel mapping, Graph token acquisition path).
- **Feasible no-admin slice identified:** Candidate A — Teams chat deep-link handoff (mirroring Phase 63 Outlook handoff pattern). Candidate B (copy-to-Teams summary) is a sibling fallback.
- **Recommended Phase 86:** Implement Candidate A as a single Deal Workspace card with `LOCAL_ONLY_FLOWS.teams-chat-handoff` inventory entry and verbatim disclaimer "Opens your Teams client. The app does not post to, read from, or sync with Teams."
- **Confirmation no production behavior changed:** No production source modified; no test added; no schema change; no connector import; no inventory drift. Vibe coverage map prose updates are descriptive only (no row reclassified to operational).

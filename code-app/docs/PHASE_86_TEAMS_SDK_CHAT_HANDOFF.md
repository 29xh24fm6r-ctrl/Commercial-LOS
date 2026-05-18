# Phase 86 — Teams SDK Foundation + Chat Handoff

## Goal

Install the Microsoft Teams JavaScript SDK (`@microsoft/teams-js`) and ship the **smallest honest Teams-adjacent feature** Phase 85 identified: a no-admin Teams chat handoff deep link from the Banker Deal Workspace.

The SDK install creates a foundation for future Teams host detection without claiming any Teams integration the app doesn't have. The chat handoff is a Phase-63-style deep-link affordance — the banker clicks a button and **their own** Teams client opens with a new-chat composer pre-tagged with the deal as the topic. The app does not post to Teams, read from Teams, sync with Teams, or send anything on the banker's behalf.

No Graph. No calendar. No notifications. No meeting create. No channel post. No app manifest. No Dataverse write. No audit row. No timeline event.

## Why this phase

Phase 85 audited the Teams capability matrix end-to-end and identified exactly one feasible no-admin slice: the chat deep-link handoff. Every other Teams capability (push notifications, calendar sync, meeting create, presence, channel posting, Graph user lookup) remains connector- / admin- / schema-blocked, and several would be **unsafe to fake**.

Phase 86 implements that one slice with the same discipline Phase 63 used for Outlook email handoff:

- Banker-initiated; the app never auto-opens.
- No claim of integration — the disclaimer says "The app does not post to, read from, or sync with Teams" verbatim.
- LOCAL_ONLY_FLOWS inventoried; no GOVERNED_WRITES entry.
- Tests pin the URL shape, the disabled fallback, and the rendered-DOM forbidden vocabulary.

## What the Teams SDK is used for (in this phase)

Exactly one purpose: a best-effort, never-throw probe to ask the host "are we running inside Microsoft Teams?". The result is **diagnostic only** — surfaced as an italicized info badge on the handoff card ("Detected: running inside Teams" vs "Not running inside Teams · the link opens Teams web"). The deep-link handoff works identically regardless of the probe result.

What the SDK is **not** used for in this phase:

- ❌ Not used to acquire any access token, ID token, or Graph credential.
- ❌ Not used to call Graph, Calendar, Outlook, Presence, Teams Activity, Channel-Send, or any other Microsoft API.
- ❌ Not used to read or write a Teams chat / channel / meeting.
- ❌ Not used to register a Teams app or perform any tenant-side action.
- ❌ Not used to read user mail, calendar events, or organizational data.

Source-level discipline pinned in `src/shared/teams/teamsEnvironment.test.ts`:

- No import of `@microsoft/microsoft-graph-client`, `@azure/msal-browser`, `@microsoft/microsoft-graph-types`, or any Office365 / Calendar / Graph module.
- No import from a role module (banker / manager / team / deals / executive / admin).
- No `getAuthToken`, `access_token`, `client_secret`, or `oauth` vocabulary.
- No affirmative "is/was/has been/will be sent / delivered / synced / posted / notified" claims; no "meeting created", "calendar updated", "Teams integrated", "Graph connected" claims.

## What the chat handoff does

`src/deals/TeamsChatHandoff.tsx` is a Banker-Deal-Workspace card with:

- **Title:** "Open Teams chat"
- **Subtitle:** "Handoff to your Microsoft Teams client. The app does not post to, read from, or sync with Teams."
- **Body (enabled state):** A primary button labelled "Open Teams chat" plus a probe-result badge. Clicking the button calls:

```ts
window.open(deepLink, '_blank', 'noopener,noreferrer');
```

where `deepLink` is constructed by the pure helper:

```
https://teams.microsoft.com/l/chat/0/0
  ?users=<signed-in banker email>
  &topic=<deal name>
  &message=Re: <deal name>
```

The banker's **own** Teams client opens (web, desktop, or mobile). The recipient and message can be edited before the banker hits send. **The app never sends a message.**

- **Body (disabled state):** When the signed-in banker context isn't available (or the email field is empty or malformed), the card renders the verbatim copy: **"Teams chat handoff unavailable because no user email is available."**

- **Conservative disclaimer (always rendered in the enabled state):**

> "Local handoff only. No Dataverse write. No audit row. No timeline event. No calendar update. No meeting created. No Teams notification raised. No Graph call. The recipient and message can be edited inside your Teams client before you send."

## What the chat handoff does NOT do

- ❌ Does not send a message. The app has no Graph credential and never POSTs to a Teams API.
- ❌ Does not create or modify a calendar event.
- ❌ Does not create an online meeting.
- ❌ Does not raise a Teams activity-feed notification.
- ❌ Does not write to Dataverse.
- ❌ Does not emit an audit row.
- ❌ Does not emit a timeline event.
- ❌ Does not change any deal status, document status, task status, memo status, or stage.
- ❌ Does not log the chat content anywhere — the app never sees it. Whatever the banker types is between the banker and Teams.
- ❌ Does not claim Teams integration. The disclaimer is explicit.

## UPN source

The only `users=` value passed to the deep link comes from `useOptionalBanker().email`, the signed-in banker's verified email from the Phase 4 bootstrap chain:

1. `getContext()` from `@microsoft/power-apps/app` → Entra UPN.
2. `Cr664_usersService.getAll({ filter: \`cr664_email eq '<upn>'\` })` matches the UPN to a `cr664_users` row.
3. `BankerIdentity.email` carries `cr664_email` forward into React context.

This is the same identity chain every shipped governed write already trusts. The handoff card uses `useOptionalBanker()` (not `useBanker()`) so it renders the disabled state gracefully when the banker context isn't mounted (e.g. inside the Manager / Team deal-route branches that don't mount the banker provider).

The UPN is **never** inferred from:

- borrower name
- client name
- guarantor name
- any free-text field

If the email fails the conservative email-shape check (`isLikelyValidEmail` — same shape Phase 61's Outlook adapter uses), the disabled state renders instead of an invalid deep link.

## Placement

`src/deals/BankerDealWorkspace.tsx`:

The card mounts at the bottom of the Banker Deal Workspace, immediately below `<BorrowerCommunication />`, inside a `data-deal-card="teams-chat-handoff"` wrapper that matches the existing autopilot-scroll-target pattern.

Final Banker Deal Workspace card order:

```
DealHeader
DealBlockers
DealStageProgressionCard
DealSummary
DealAutopilotPanel
RelationshipContext
DealTasks
DealDocuments
CreditMemo
ActivityTimeline
BorrowerCommunication
TeamsChatHandoff  ← Phase 86
```

The Manager Deal Workspace and Team Deal Workspace are **not** modified — the Phase 86 card lives in `BankerDealWorkspace.tsx` only. Phase 4 / 36 / 37 isolation between the three deal-workspace branches is preserved.

## No-admin rationale

Every other Teams Vibe capability would require admin involvement:

| Capability | Why it needs admin |
|---|---|
| Teams notifications (push to activity feed) | Graph `TeamsActivity.Send` + Teams app registration + admin consent |
| Calendar sync | Office 365 Outlook connector registration OR Graph `Calendars.ReadWrite` admin consent |
| Online meeting create | Graph `OnlineMeetings.ReadWrite` admin consent + delegated permissions |
| Channel / chat post | Graph `ChannelMessage.Send` / `Chat.ReadWrite` admin consent |
| Presence | Graph `Presence.Read.All` admin consent |
| Graph user lookup | Graph `User.Read.All` admin consent |
| Teams app sideload | Teams Admin Center upload by tenant admin |

The chat deep link is a Microsoft-documented public URL pattern. Opening it requires **only** that the user already has a Teams account in their tenant — which is true of every internal user this Code App ships to. No admin action, no Graph permission grant, no connector registration, no secret material.

## Blockers still remaining (from Phase 85, unchanged)

Phase 86 advances exactly one of the 17 Phase 85 capability-matrix rows (row 2.2). Every other row stays as Phase 85 classified it:

1. **Microsoft Teams Power Platform connector not registered.** No `MicrosoftTeams*Service` in `src/generated/services/`. Push-to-Teams, channel posting, and Graph-backed Teams reads remain blocked.
2. **No `@microsoft/microsoft-graph-client` package.** Direct Graph calls not possible.
3. **No `@azure/msal-browser` package.** No path to acquire a Graph access token client-side.
4. **No Microsoft Graph admin consent grant.** Every Graph capability (presence, calendar, notifications, online-meeting, channel-post, user-lookup) blocked.
5. **No Office 365 Outlook connector registered.** Calendar sync (1.8) and the email-LIVE path (1.6) remain blocked.
6. **No Teams app manifest in the repo.** Sideloading to Teams Admin Center not in scope.
7. **No meeting-link column on `cr664_loandeals`.** Meeting-link display surface has nothing to display.
8. **No notification persistence schema.** No `cr664_notifications*` entity.
9. **No deal-to-channel mapping schema.** No `cr664_teamschannelid` column.
10. **No client-side Graph token acquisition path.** Out-of-scope without admin action.

The full Lane-E unblock checklist still lives at the foot of `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`. Phase 86 does not change Lane E.

## Future upgrade path

When the upstream admin / connector / schema work lands, the following phases become feasible (none of them are in scope today):

1. **Teams app manifest.** Add `manifest.json` to the repo so the Code App can be sideloaded into Teams as a Teams app (Teams Admin Center upload). Enables in-Teams host detection + tabs.
2. **Graph admin consent.** Tenant admin grants `User.Read.All`, `Presence.Read.All`, etc. Phase 86's `teamsEnvironment.ts` would gain a separate Graph adapter (matching the Phase 61 Outlook adapter pattern: typed port + DRY_RUN/LIVE adapter pair + connector-not-registered stub).
3. **Teams notifications.** Once Graph `TeamsActivity.Send` is consented, autopilot signals can fire to a banker's Teams activity feed. Requires schema for per-user notification preferences (no current entity for this).
4. **Calendar sync.** Once Outlook connector registers, the Phase 61 LIVE adapter swap unblocks email AND the calendar-half of §1.8. Reading and writing deal-milestone events becomes feasible.
5. **Meeting links.** Add a `cr664_teamsmeetinglink` (or generic `cr664_onlinemeetingurl`) column on `cr664_loandeals`, regenerate the SDK, then surface the field. The `MeetingLogged` timeline event type already exists in the option-set — no enum change needed.
6. **Channel posting.** Once Graph `ChannelMessage.Send` is consented and a deal-to-channel mapping schema exists, send-on-behalf-of from a governed write becomes feasible (same shape as Phase 61's email-send governed write).

Each of these is a separate brief. Phase 86 is the minimum honest move.

## Files created

- `src/shared/teams/teamsEnvironment.ts` — `initializeTeamsContext` (best-effort SDK probe, memoized, never-throw) + `buildTeamsChatDeepLink` (pure URL builder) + `getTeamsContextSafely` (sync accessor for the memoized result) + `__resetTeamsEnvironmentForTests`.
- `src/shared/teams/teamsEnvironment.test.ts` — 29 tests covering the pure URL builder, the SDK probe (success / initialize-rejects / getContext-rejects / partial-context), memoization + concurrent-call sharing + sync accessor, and module-hygiene source-text guards (no Graph / MSAL / Calendar / OAuth vocabulary; no role imports; no affirmative send/delivered/synced/posted/notified vocabulary).
- `src/deals/TeamsChatHandoff.tsx` — Banker-only Deal Workspace card. Uses `useOptionalBanker()` + `useDealData()` + the pure deep-link builder; opens `window.open(url, '_blank', 'noopener,noreferrer')` on click.
- `src/deals/TeamsChatHandoff.test.tsx` — 11 card-rendering tests covering header + subtitle, enabled state, deep-link shape on click (asserts well-known host, users, topic, message), disabled state with verbatim "Teams chat handoff unavailable" copy (no banker, empty email, malformed email), conservative disclaimer rendering, probe-badge variants (available / unavailable / promise-rejects), and rendered-DOM forbidden-vocab scan.
- `docs/PHASE_86_TEAMS_SDK_CHAT_HANDOFF.md` — this document.

## Files modified

- `package.json` — added `@microsoft/teams-js@^2.53.0` to `dependencies`. No other dependency added; explicitly NOT installing `@microsoft/microsoft-graph-client`, `@azure/msal-browser`, or any Graph/Calendar library.
- `src/deals/BankerDealWorkspace.tsx` — imports `TeamsChatHandoff` and mounts it inside `<DealDataProvider>` directly below `<BorrowerCommunication />`. No other workspace touched.
- `src/shared/governance/platformInventory.ts` — adds the `teams-chat-handoff` entry to `LOCAL_ONLY_FLOWS` with verbatim disclaimers (no Dataverse write, no audit, no timeline, no calendar sync, no notification delivery, no meeting created, no Graph call, no access-token acquisition, UPN never inferred from borrower, the app never sends a message).
- `src/shared/governance/platformInventory.test.ts` — pins (a) `teams-chat-handoff` is in `LOCAL_ONLY_FLOWS`, (b) the disclaimer set, (c) the Phase 86 doc exists on disk, (d) `teams-chat-handoff` is NOT in `GOVERNED_WRITES`.
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.7 advanced from "Not started" to "Partial — Phase 86 ships the no-admin chat handoff; full integration still blocked"; §1.9 acknowledges in-app notification panels are partly served by autopilot but push-to-Teams remains blocked; Lane E unchanged.

## Conservative copy used

The card uses the brief-mandated tokens:

- "Open Teams chat" (button label)
- "handoff" (subtitle + body)
- "opens Teams" (subtitle + body)
- "You send the message" (body, with `<strong>` emphasis)

The card avoids the forbidden tokens (statically asserted in `TeamsChatHandoff.test.tsx`):

- ❌ never says "sent" as a positive claim about the chat
- ❌ never says "delivered"
- ❌ never says "synced"
- ❌ never says "posted"
- ❌ never says "notified"
- ❌ never says "meeting was created"
- ❌ never says "calendar was updated"
- ❌ never says "Teams integrated"
- ❌ never says "Graph connected"

The only "sent" reference in the card is the user-facing sentence "You send the message" — describing what the **banker** does, not what the **app** does — and the disclaimer's "the app does not post to, read from, or sync with Teams" (a negation). Both are honest.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` §1.7 (Microsoft Teams integration) advances from "Not started" to "Partial — Phase 86 ships a no-admin chat handoff." Phase 85's recommended Candidate A is now shipped. The remaining Lane-E capabilities (calendar sync, notifications, presence, channel posting, meeting create, Graph user lookup, Teams app sideload) remain blocked.

§1.9 (Teams notifications) gains a one-sentence reaffirmation: in-app notification panels remain partly served by the Phase 80 / 82 / 84 autopilot rollups; push-to-Teams remains blocked and is explicitly forbidden to fake.

## Tests added / updated

- 29 derivation tests in `src/shared/teams/teamsEnvironment.test.ts`.
- 11 card-rendering tests in `src/deals/TeamsChatHandoff.test.tsx`.
- 3 inventory-pin assertions added to `src/shared/governance/platformInventory.test.ts` (membership in LOCAL_ONLY_FLOWS, full disclaimer-set pin, Phase 86 doc existence, NOT in GOVERNED_WRITES).

No existing test was changed substantively. Existing 1452 tests continue to pass.

## Confirmation: no Graph / auth / calendar / notification / send / write added

- ✅ No new write surface. No `GOVERNED_WRITES` entry. `teams-chat-handoff` is NOT in `GOVERNED_WRITES` (test asserts this).
- ✅ No Graph call anywhere in the new module.
- ✅ No `@microsoft/microsoft-graph-client`, `@azure/msal-browser`, or Graph-types package added (test asserts this against `package.json` indirectly via the source-import scan).
- ✅ No access-token acquisition, no OAuth flow, no client secret.
- ✅ No calendar API call, no online-meeting create, no Outlook connector call.
- ✅ No notification API call. No Teams activity-feed write.
- ✅ No Dataverse write. The card never calls a `Cr664_*Service`.
- ✅ No audit row, no timeline event.
- ✅ No app manifest, no tenant-side action.
- ✅ The card never claims "Teams integrated", "Graph connected", "synced", or any equivalent overclaim — statically asserted in both source-text and rendered-DOM tests.

## Recommended next phase

From the coverage map after Phase 86, the in-repo Teams slice is exhausted (Phase 85 Candidate A is shipped; Candidate B copy-to-Teams summary is the runner-up). Natural next moves:

1. **Phase 87 candidate — Copy-to-Teams deal summary (Phase 85 Candidate B).** Generate a markdown summary the banker can paste into any Teams chat / channel. Same LOCAL_ONLY shape; sibling to the Phase-23 borrower-update draft and the Phase-66 status packet. Useful but lower leverage than the chat deep-link.
2. **Phase 87 candidate — Manager-scoped child-data loader.** Broadens the Phase 81 manager rollup signal coverage to match the banker / team rollups' 7/8. Internal depth work; no Teams content.
3. **Phase 87 candidate — Outlook calendar handoff (mailto:-style + ics file).** Banker-initiated handoff that opens the user's calendar client with a pre-filled deal-milestone event. No connector, no Graph, no Dataverse write. Mirrors Phase 63's mailto pattern for calendar.
4. **Phase 87 candidate — Defer further Teams work until Lane B (Outlook connector) and Lane E (Teams app manifest + Graph consent) land.** Safe and honest; spends the next phase on a different Vibe gap.

**Recommendation: Phase 87 candidate 2 (manager-scoped child-data loader).** It is the most leverage-per-LOC move on the board now that the Teams chat slice has landed. The autopilot triad gains its second-most-symmetric upgrade (manager rollup catches up to banker / team coverage). Candidate 1 (copy-to-Teams summary) is the strongest Teams runner-up if the team prefers another Teams move.

## Acceptance criteria — Phase 86

- ✅ `@microsoft/teams-js` installed (`package.json` `dependencies`).
- ✅ App builds cleanly (`tsc -b && vite build`).
- ✅ Banker can open a Teams chat handoff when a verified UPN is available.
- ✅ No app-side message send occurs (statically asserted in card and source-text tests).
- ✅ No Graph / auth / calendar / notification behavior added.
- ✅ No Dataverse write.
- ✅ `LOCAL_ONLY_FLOWS.teams-chat-handoff` inventoried.
- ✅ Vibe coverage map updated.
- ✅ All tests pass.

# Phase 98 — Morning Catch-Up Teams Handoff

## Goal

Apply the no-admin Phase 86 / 96 / 97 Teams handoff pattern to the
activity-intelligence lane: a banker / manager can copy a plain-text
summary of their Morning Catch-Up feed into Microsoft Teams (any
chat or channel). The app does not post to Teams, send anything,
sync with Teams, raise a Teams notification, call Graph, or write
to Dataverse. Copying the summary explicitly does NOT mutate the
Phase 90 last-seen marker, the Phase 91 dismiss / snooze ledger, or
the Phase 94 mark-all-seen state.

## Why this phase

Phases 88–91 + 94 built the deterministic catch-up feed
(observation-style "what happened / what needs attention"), the
local last-seen marker overlay, the per-item dismiss / snooze
ledger, and the manual "Mark all seen" affordance. Phases 86 / 96 /
97 built the no-admin Teams handoff vocabulary (deep-link chat,
copy-to-Teams deal summary, relationship context line). Phase 98
stitches the two lanes: copy the catch-up feed itself into Teams
without crossing any of the upstream blockers Phase 85 documented.

This is exactly the no-admin slice §1.18's "Safe next step"
predicted and the natural follow-on to the Phase 97
recommendation:

> "the catch-up Teams handoff is the cleanest next Lane A slice —
> same pattern, different surface, immediate user value."

## Relationship to prior phases

| Phase | Surface | What it shipped | Phase 98 reuse |
|---|---|---|---|
| 86 | Banker Deal Workspace | `<TeamsChatHandoff />` deep-link | Vocabulary + UI posture pattern |
| 88 | Manager Workspace | `deriveManagerMorningCatchUp` + `<ManagerMorningCatchUp />` | Source feed |
| 89 | Banker Command Center | `deriveBankerMorningCatchUp` + `<BankerMorningCatchUp />` | Source feed |
| 90 | Both catch-up cards | Local-only last-seen marker overlay | Read-only context for the summary's "since last visit" line; **never mutated** |
| 91 | Both catch-up cards | Per-item dismiss / snooze ledger | Filtering already applied to `visibleItems`; **never mutated** |
| 94 | Both catch-up cards | "Mark all seen" button | Sibling action; **never invoked** |
| 96 | Banker Deal Workspace | `<TeamsDealSummaryHandoff />` | Same pure-formatter + clipboard-write pattern |
| 97 | Banker Deal Workspace | Relationship-context line in 96 summary | Same vocabulary discipline |

Phase 98 adds:

- **New pure formatter** —
  `src/shared/activity/catchUpTeamsSummary.ts`. Turns a Banker /
  Manager surface label + visible item count + Phase 90
  since-last-visit context + an item list into a plain-text Teams
  paste. Pure function; no SDK import; no Graph; no role-module
  import.
- **Inline `<CatchUpTeamsCopyButton />`** on both
  `<BankerMorningCatchUp />` and `<ManagerMorningCatchUp />`. Renders
  only in the populated state; on click, writes the formatted
  summary to `navigator.clipboard.writeText` and surfaces a
  `role="status"` / `role="alert"` tag.

## Summary fields included

```
Banker morning catch-up — YYYY-MM-DD   (or "Manager morning catch-up — …")

N visible items.
[ since-last-visit line, conditional — see below ]

Top items:
- [HIGH] DealName — Title: Reason
- [MEDIUM] DealName — Title: Reason
- [LOW] DealName — Title: Reason (Banker: ownerName)    ← manager surface only
…

— Local copy only. Not posted to Teams. Paste into Teams. You send
  the message manually. Derived from current records; copying does
  not mark items seen, dismissed, or snoozed.
```

- **Surface label** — `"Banker morning catch-up"` /
  `"Manager morning catch-up"`.
- **Generated date** — YYYY-MM-DD UTC, derived from the caller's
  `generatedAt` (matches Phase 96's date format).
- **Visible-item count** — already filtered for snoozed entries by
  the card; singular / plural copy.
- **Since-last-visit context** — conditional on the Phase 90
  marker scope being available:
  - `lastSeen: undefined` (unscoped) → line omitted entirely
  - `firstVisit: true` → `"First visit on this browser."`
  - `newCount === 0` → `"No new items since your last visit on this browser."`
  - `newCount === 1` → `"1 new item since your last visit on this browser."`
  - `newCount >= 2` → `"N new items since your last visit on this browser."`
- **Top items** — capped at
  `CATCH_UP_TEAMS_SUMMARY_MAX_ITEMS` = 8 (matches the Phase 88/89
  primitive's `TOP_N_CATCH_UP_ITEMS`). Each row is
  `- [PRIORITY] DealName — Title: Reason`. The formatter degrades
  gracefully when title or reason is blank (renders whichever is
  present).
- **Manager-surface ownership suffix** — `(Banker: <ownerName>)`
  appended on rows when `ownerName` is present. The banker surface
  ignores `ownerName` (the signed-in banker is the implicit owner
  of every row).
- **Verbatim disclaimer** — pinned by the source-hygiene test.

## Excluded fields

The formatter never emits, and the test suite pins:

- UUID v4 / GUID-shaped identifiers.
- `cr664_*` Dataverse logical names.
- `_value` lookup suffixes.
- `audit_id` / `event_id` / `timeline_event` / `correlation_id`
  markers.
- `Bearer`, `Authorization:`, `access_token`, `refresh_token`,
  `client_secret`, `Graph`, `MSAL`.
- Full credit memo body text (the catch-up primitive itself never
  echoes memo bodies — Phase 95 only passes the integer findings
  count through the chain).
- Approval / denial / decisioning / risk-score / performance-score
  language: `approved`, `denied`, `rejected`, `credit decision`,
  `risk score`, `performance score`.
- `AI-generated`, `Copilot`.
- Forbidden positive Teams claims: `sent`, `posted`, `delivered`,
  `notified`, `synced`, `Teams integrated`, `Graph connected`,
  `notification raised`.

The negation `"Not posted to Teams"` inside the verbatim
disclaimer is permitted (and pinned positively).

## Local-only Teams handoff posture

Phase 98 inherits the Phase 86 / 96 / 97 posture unchanged:

- The Teams SDK (`@microsoft/teams-js`) is NOT loaded by this flow.
  Only the Phase 86 chat-handoff card touches it, and only for the
  diagnostic probe.
- No Microsoft Graph client. No MSAL. No token acquisition. No
  external API call of any kind.
- The Web API used is `navigator.clipboard.writeText`. Failure
  paths surface a conservative `role="alert"` with
  `"Clipboard unavailable. Select and copy manually."`
- The banker / manager pastes into Teams in their own client.
- The card never claims a message was "sent", "posted",
  "delivered", "notified", "synced", "Teams integrated", or
  "Graph connected" as a positive claim.

## Why this is NOT Teams posting / notification / sync

- **Not posting.** No Graph endpoint, no Teams webhook, no chat
  bot. The string lives on the clipboard until the user pastes it.
- **Not a notification.** No Teams activity-feed entry is enqueued
  or raised. The Phase 91 dismiss / snooze ledger is also a local
  rendering surface; neither this phase nor Phase 91 creates an
  official acknowledged / unread state.
- **Not sync.** Nothing persists across devices. The Phase 90
  marker is per-browser; the Phase 91 ledger is per-browser; the
  Phase 98 clipboard write is per-click. Three independent local
  surfaces; no cross-device coordination.
- **Not delivery.** The app does not know whether the user pastes
  what was copied, whether they edit it, or whether they send.

## Local-ledger preservation (the most important non-behavior)

Phase 98 explicitly does NOT mutate:

1. **Phase 90 last-seen marker** — `localStorage[cc:lastVisit:catchUp:<scope>]`
   is read-only from the copy click's perspective. The button does
   not call `useCatchUpLastSeen().markAllSeen()` and does not write
   the marker directly. Two `localStorage` snapshot tests pin this.
2. **Phase 91 dismiss / snooze ledger** —
   `localStorage[cc:catchUpItemLedger:v1]` is byte-identical before
   and after the copy click. A pre-existing dismissed item stays
   dismissed (its Restore affordance remains); a pre-existing
   snoozed item stays snoozed (its `snoozeUntil` is unchanged).
3. **Phase 94 mark-all-seen action** — the "Mark all seen" button
   is a sibling action; the copy button does NOT invoke it and the
   marker is NOT bumped to `now` on copy.

The catch-up card also continues to function unchanged in the
empty / loading / failed states — the copy button only renders in
the populated state.

## Future upgrade path

When the Lane E upstream blockers clear, Phase 98 can be extended
without rewriting:

1. **Graph channel posting.** Replace the clipboard write with a
   `POST /teams/{team-id}/channels/{channel-id}/messages` for a
   pre-mapped "morning catch-up" channel. Requires Teams app
   registration + `ChannelMessage.Send` Graph scope + admin
   consent. A new `GOVERNED_WRITES` entry
   (`catch-up-channel-message-send`) would coordinate audit +
   timeline.
2. **Teams activity-feed notifications.** Push the catch-up summary
   as a Teams activity notification via
   `POST /users/{user-id}/teamwork/sendActivityNotification`.
   Requires `TeamsActivity.Send` Graph scope + admin consent.
3. **Manager → banker targeted message.** A manager viewing the
   filtered manager catch-up (Phase 92 banker filter) could send a
   selected sub-feed directly to the focused banker's Teams chat.
   Requires the manager's Graph scope to write a 1:1 chat as the
   manager identity — separate consent.
4. **Catch-up digest cards.** Render the Phase 98 plain-text
   summary as an Adaptive Card payload (Teams renders it as a
   richer card when posted via 1.). The adaptive-card schema is
   text-only client-side; no Graph for the renderer, only for the
   post.
5. **AI-assisted Teams briefs.** Lane F. A Copilot pass could
   produce a richer summary while the deterministic plain-text
   block remains the floor and the source-of-truth.

None of those are needed for Phase 98 to be useful today.

## Files created / modified

```
src/shared/activity/catchUpTeamsSummary.ts                (new)
src/shared/activity/catchUpTeamsSummary.test.ts           (new)
src/banker/BankerMorningCatchUp.tsx                       (modified — wire Copy Teams summary button)
src/banker/BankerMorningCatchUp.test.tsx                  (modified — Phase 98 UI + ledger non-mutation tests)
src/manager/ManagerMorningCatchUp.tsx                     (modified — wire Copy Teams summary button)
src/manager/ManagerMorningCatchUp.test.tsx                (modified — Phase 98 UI + ledger non-mutation tests)
src/shared/governance/platformInventory.ts                (modified — new LOCAL_ONLY_FLOWS entry)
src/shared/governance/platformInventory.test.ts           (modified — pin new entry + doc-exists check)
docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md                (modified — advance §1.7, §1.18, §1.1, §1.22)
docs/PHASE_98_CATCH_UP_TEAMS_SUMMARY_HANDOFF.md           (new — this file)
```

## Confirmations

- No new writes. `GOVERNED_WRITES.length` unchanged.
- No new entry in `NOT_WIRED` or `DELIBERATELY_BLOCKED`.
- New entry in `LOCAL_ONLY_FLOWS`: `catch-up-teams-summary-handoff`.
- No new schema columns, tables, or option-set values.
- No new SDK install. No new connector.
- No Graph / MSAL / token-acquisition code introduced.
- No Teams API call. No channel post. No notification raised.
- No AI / Copilot / model invocation.
- Phase 90 last-seen marker untouched by the copy click.
- Phase 91 dismiss / snooze ledger untouched by the copy click.
- Phase 94 mark-all-seen action not invoked by the copy click.
- All tests pass.

# Phase 99 — Activity Timeline Teams Handoff

## Goal

Add a local-only "Copy Teams summary" button to the per-deal
Activity Timeline card on the Banker Deal Workspace so a banker can
share a concise "what changed on this deal" digest with a colleague
in Microsoft Teams without leaving the workspace. The app never
posts, sends, syncs, notifies, or calls Graph. Copying the digest
also does NOT mutate the Phase 72 last-visit marker — activity is
not marked seen by clicking the button.

## Why this phase

Phases 86 / 96 / 97 / 98 shipped the no-admin Teams handoff pattern
across the Banker Deal Workspace (deep-link chat + per-deal summary
+ relationship context) and the morning catch-up cards (manager +
banker). Phase 99 closes the last open Banker Deal Workspace surface
in that family: the per-deal Activity Timeline. The result is a
complete no-admin Teams handoff vocabulary across the primary banker
surfaces:

- deal chat handoff           ← Phase 86 (`<TeamsChatHandoff />`)
- deal summary handoff        ← Phase 96 (`<TeamsDealSummaryHandoff />`) + Phase 97 relationship line
- command-center catch-up     ← Phase 98 (`<BankerMorningCatchUp />`)
- manager catch-up handoff    ← Phase 98 (`<ManagerMorningCatchUp />`)
- **deal activity digest**    ← **Phase 99 (this phase)**

## Relationship to prior phases

| Phase | Surface | What it shipped | Phase 99 reuse |
|---|---|---|---|
| 72 | Banker Deal Workspace `<ActivityTimeline />` | Local-only per-deal last-visit marker + "N new since your last visit" overlay | Read-only context for the digest's since-last-visit line; **never mutated** |
| 86 | Banker Deal Workspace | `<TeamsChatHandoff />` deep-link | Vocabulary + UI posture pattern |
| 96 | Banker Deal Workspace | `<TeamsDealSummaryHandoff />` (deal-summary digest) | Same pure-formatter + clipboard-write pattern |
| 97 | Banker Deal Workspace | Relationship-context line in 96 summary | Same vocabulary discipline |
| 98 | Banker + Manager Workspaces | `<CatchUpTeamsCopyButton />` on morning-catch-up cards | Same inline-component pattern; non-mutation of local-ledger discipline |

Phase 99 adds:

- **New pure formatter** —
  `src/deals/activityTimelineTeamsSummary.ts`. Turns a deal name +
  total event count + Phase 72 since-last-visit context + a list of
  pre-mapped item rows into a plain-text Teams paste. Pure function;
  no SDK import; no Graph; no role-module import.
- **Inline `<ActivityTimelineTeamsCopyButton />`** on
  `<ActivityTimeline />`. Renders only when the activity slot is
  `kind: 'ready'` AND `events.length > 0`. On click, writes the
  formatted digest to `navigator.clipboard.writeText` and surfaces a
  `role="status"` / `role="alert"` tag.

## Summary fields included

```
Acme Working Capital — activity digest — YYYY-MM-DD

N timeline events.
[ since-last-visit line, conditional — see below ]

Recent activity:
- 2026-05-18 14:30 UTC · Task completed: Q2 financials received — Borrower confirmed delivery. (Task · by M. Paller) · new
- 2026-05-17 09:15 UTC · Note logged: Borrower update prepared (Note · by M. Paller)
- 2026-05-16 10:00 UTC · Document uploaded: PFS received — Uploaded by borrower; pending review. (Document · by System)
…

— Local copy only. Not posted to Teams. Paste into Teams. You send
  the message manually. Derived from current records; copying does
  not mark activity seen or change deal status.
```

- **Deal name** — `deal.name` (trimmed). Falls back to the generic
  `"Activity digest"` heading when blank.
- **Generated date** — YYYY-MM-DD UTC, derived from the caller's
  `generatedAt` (matches Phase 96 / 97 / 98 date format).
- **Total timeline-event count** — `events.length` from the deal
  workspace's `useDealData().activity.data`. Singular / plural
  copy.
- **Since-last-visit context** — conditional on the Phase 72 hook
  having initialized:
  - `lastSeen: undefined` (marker not yet initialized) → line
    omitted entirely
  - `firstVisit: true` (no prior marker on this browser) →
    `"First visit on this browser."`
  - `newCount === 0` →
    `"No new activity since your last visit on this browser."`
  - `newCount === 1` →
    `"1 new activity item since your last visit on this browser."`
  - `newCount >= 2` →
    `"N new activity items since your last visit on this browser."`
- **Recent activity** — capped at
  `ACTIVITY_TIMELINE_TEAMS_SUMMARY_MAX_ITEMS` = 8. Each row is:
  - `- <YYYY-MM-DD HH:mm UTC>` (deterministic UTC stamp)
  - ` · <Event type[/SubType]>: <Title>` — falls back gracefully
    when title / type is blank
  - ` — <summary>` when present
  - ` (<sourceLabel> · by <actor>)` — source label is the
    banker-friendly entity label (Task / Document / Credit memo /
    etc.), already mapped from `cr664_relatedentitytype` by the
    `<ActivityTimelineTeamsCopyButton />` component via the
    existing `friendlyEntityLabel` helper before the row reaches
    the formatter; actor is `"System"` for system-generated
    events, the banker name otherwise, with `"Unknown user"` as the
    final fallback
  - ` · new` when the event is newer than the Phase 72 marker
- **Verbatim disclaimer** — pinned by the source-hygiene test.

## Excluded fields

The formatter never emits, and the test suite pins:

- UUID v4 / GUID-shaped identifiers (the raw
  `cr664_dealtimelineeventid` is never echoed).
- `cr664_*` Dataverse logical names — the source label is mapped
  to a banker-friendly string in the component before reaching the
  formatter.
- `_value` lookup suffixes.
- `audit_id`, `event_id`, `timeline_event_id`, `correlation_id`
  payload markers.
- `Bearer`, `Authorization:`, `access_token`, `refresh_token`,
  `client_secret`, `Graph`, `MSAL`.
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

Phase 99 inherits the Phase 86 / 96 / 97 / 98 posture unchanged:

- The Teams SDK (`@microsoft/teams-js`) is NOT loaded by this flow.
  Only the Phase 86 chat-handoff card touches it, and only for the
  diagnostic probe.
- No Microsoft Graph client. No MSAL. No token acquisition. No
  external API call of any kind.
- The Web API used is `navigator.clipboard.writeText`. Failure
  paths surface a conservative `role="alert"` with
  `"Clipboard unavailable. Select timeline text and copy manually."`
- The banker pastes into Teams in their own client.
- The card never claims a message was "sent", "posted",
  "delivered", "notified", "synced", "Teams integrated", or
  "Graph connected" as a positive claim.

## Why this is NOT Teams posting / notification / sync

- **Not posting.** No Graph endpoint, no Teams webhook, no chat
  bot. The string lives on the clipboard until the user pastes it.
- **Not a notification.** No Teams activity-feed entry is enqueued
  or raised. The Phase 72 last-visit marker is also a local
  rendering surface; neither this phase nor Phase 72 creates an
  official read / unread state in Dataverse.
- **Not sync.** Nothing persists across devices. The Phase 72
  marker is per-browser, per-deal; the Phase 99 clipboard write is
  per-click. Two independent local surfaces; no cross-device
  coordination.
- **Not delivery.** The app does not know whether the banker pastes
  what was copied, whether they edit it, or whether they send.

## Why this does NOT mark activity seen

The Phase 72 last-visit marker has its own owner and its own
schedule:

1. `useLastVisit(deal.id)` is mounted on `<ActivityTimeline />`
   itself. It snapshots the prior marker on first render and
   schedules a settled-write of a fresh marker after a short delay
   (matches the Phase 72 behavior shipped long before Phase 99).
2. The Phase 99 copy button does NOT receive the
   `useLastVisit` setter and does NOT write the marker
   `localStorage` slot directly. The button's `handleCopy()`
   function calls `navigator.clipboard.writeText` and updates
   local component state for the status tag — nothing else.
3. A localStorage byte-snapshot test in
   `ActivityTimeline.test.tsx` pre-seeds the marker, captures the
   value AFTER the Phase 72 hook's initial effects but BEFORE the
   click, and asserts the value is identical AFTER the click. Any
   drift would prove the copy click had written to the marker —
   the test would fail.

This matters because:

- The banker may copy the digest and choose NOT to send it. The
  "new" badges should still appear on subsequent visits to remind
  the banker they have unreviewed activity.
- A manager pasting an in-progress catch-up into Teams should not
  silently clear their own catch-up state.
- The Phase 72 marker is the only "read" signal on this surface;
  if Phase 99 mutated it, the banker would have NO way to track
  what they had actually reviewed vs. merely shared.

The button's inline disclaimer states this verbatim:
`"Copying does not mark activity seen or change deal status."`

## Future upgrade path

When the Lane E upstream blockers clear, Phase 99 can be extended
without rewriting:

1. **Graph channel posting.** Replace the clipboard write with a
   `POST /teams/{team-id}/channels/{channel-id}/messages` to a
   deal-mapped channel. Requires Teams app registration +
   `ChannelMessage.Send` Graph scope + admin consent + a
   deal-to-channel mapping table. A new `GOVERNED_WRITES` entry
   (`activity-channel-message-send`) would coordinate audit +
   timeline.
2. **Teams activity cards.** Render the Phase 99 plain-text digest
   as an Adaptive Card payload so the post displays as a richer
   timeline card in Teams. The adaptive-card schema is text-only
   client-side; only the post needs Graph.
3. **Meeting recap.** Once Phase 8 Teams calendar work lands,
   trigger an Adaptive Card recap into the meeting chat at the
   meeting end — same formatter, scheduled emission.
4. **AI-generated activity summaries.** Lane F. A Copilot pass
   could produce a natural-language summary while the
   deterministic plain-text block remains the floor and the
   source-of-truth integers / labels.
5. **Persisted read markers.** Replace the per-browser Phase 72
   marker with a server-side per-user read state when the schema
   lands; Phase 99's "copying does not mark activity seen" rule
   still holds — only the "Mark as reviewed" affordance the future
   phase ships would write the read state.

None of those are needed for Phase 99 to be useful today.

## Files created / modified

```
src/deals/activityTimelineTeamsSummary.ts                 (new)
src/deals/activityTimelineTeamsSummary.test.ts            (new)
src/deals/ActivityTimeline.tsx                            (modified — wire inline Copy Teams summary button)
src/deals/ActivityTimeline.test.tsx                       (modified — Phase 99 UI + last-visit non-mutation tests)
src/shared/governance/platformInventory.ts                (modified — new LOCAL_ONLY_FLOWS entry)
src/shared/governance/platformInventory.test.ts           (modified — pin new entry + doc-exists check)
docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md                (modified — advance §1.7, §1.18, §1.2)
docs/PHASE_99_ACTIVITY_TIMELINE_TEAMS_HANDOFF.md          (new — this file)
```

## Confirmations

- No new writes. `GOVERNED_WRITES.length` unchanged.
- No new entry in `NOT_WIRED` or `DELIBERATELY_BLOCKED`.
- New entry in `LOCAL_ONLY_FLOWS`:
  `activity-timeline-teams-summary-handoff`.
- No new schema columns, tables, or option-set values.
- No new SDK install. No new connector.
- No Graph / MSAL / token-acquisition code introduced.
- No Teams API call. No channel post. No notification raised.
- No AI / Copilot / model invocation.
- The Phase 72 per-deal last-visit marker is owned by
  `useLastVisit(deal.id)` and is NOT mutated by the copy click.
- Activity is NOT marked seen by copying; the deal state is
  unchanged.
- All tests pass.

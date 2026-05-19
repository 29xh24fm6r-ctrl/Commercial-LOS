# Phase 100 — Relationship Memory Teams Handoff

## Goal

Add a local-only "Copy Teams summary" button to each row of the
Phase 76 Relationship Memory Lite card on the Banker Command Center
so a banker can share a per-client relationship snapshot with a
colleague in Microsoft Teams. The app never posts, sends, syncs,
notifies, calls Graph, or writes to Dataverse. Copying the snapshot
also does NOT save a relationship note, mutate any local ledger,
imply a verified borrower/entity graph, or infer householding.

This closes the symmetric counterpart to Phases 96/97 — Phase 96/97
shipped Teams handoff for the deal-summary lane (with cross-deal
relationship context as one line); Phase 100 ships Teams handoff
for the relationship-memory lane itself (with one full snapshot per
client). Together they cover both directions of the
deal ↔ relationship axis from the Banker Command Center.

## Why this phase

Phases 76–78 built Relationship Memory Lite (client-name-grouped
snapshot + cross-deal context card on the deal workspace + local-
only "Draft relationship note" modal). Phases 86 / 96 / 97 / 98 / 99
built the no-admin Teams handoff vocabulary across every primary
banker surface except Relationship Memory itself. Phase 100 closes
that gap: the Banker Command Center now carries the Teams handoff
on both its activity-intelligence lane (Phase 98 catch-up) AND its
relationship-memory lane (Phase 100).

## Relationship to prior phases

| Phase | Surface | What it shipped | Phase 100 reuse |
|---|---|---|---|
| 76 | Banker Command Center `<RelationshipMemory />` | `deriveRelationshipMemory` (client-name grouping + per-client aggregate) | Source aggregate — `RelationshipMemoryEntry` is the formatter's input |
| 77 | Banker Deal Workspace `<RelationshipContext />` | `deriveCrossDealContext` (sibling primitive) | Vocabulary alignment ("Client-name grouped", "may not include all related borrowers") |
| 78 | Both relationship cards | `<RelationshipNoteDraftModal />` (LOCAL_ONLY note draft) | **Not invoked** — copy click does NOT open the modal |
| 86 | Banker Deal Workspace | `<TeamsChatHandoff />` deep-link | Vocabulary + UI posture pattern |
| 96 | Banker Deal Workspace | `<TeamsDealSummaryHandoff />` (deal-summary digest) | Same pure-formatter + clipboard-write pattern |
| 97 | Banker Deal Workspace | Relationship-context line in 96 summary | Sibling — Phase 97 surfaces one line; Phase 100 surfaces a full per-client snapshot |
| 98 | Banker Command Center / Manager Workspace | `<CatchUpTeamsCopyButton />` on morning-catch-up cards | Same inline-component pattern; non-mutation discipline |
| 99 | Banker Deal Workspace | `<ActivityTimelineTeamsCopyButton />` on activity timeline | Same non-mutation discipline |

Phase 100 adds:

- **New pure formatter** —
  `src/shared/relationship/relationshipMemoryTeamsSummary.ts`. Turns
  one `RelationshipMemoryEntry` + a `generatedAt` into a plain-text
  relationship snapshot. Pure function; no SDK import; no Graph; no
  role-module import. Reuses the Phase 76 `RelationshipDealSnapshot`
  + `RelationshipMemoryEntry` shapes verbatim — no new derivation
  logic.
- **Inline `<RelationshipMemoryTeamsCopyButton />`** in
  `<RelationshipMemory />`. Renders inside each ClientRow next to
  the existing "Draft relationship note" button. On click, writes
  the formatted snapshot to `navigator.clipboard.writeText` and
  surfaces a `role="status"` / `role="alert"` tag.

## Summary fields included

```
Relationship snapshot — Acme Manufacturing, LLC — YYYY-MM-DD
Client-name grouped.

3 active deals · Pipeline $5,500,000

Last activity: 1 day ago.
Nearest upcoming close: in 12 days (2026-09-15).

Asks:
- 2 open document requests
- 3 open tasks (1 overdue)

Attention:
- 1 document may require review
- 1 closing soon
- 1 stage attention
- 1 draft memo

Active deals:
- Acme Working Capital — Underwriting
- Acme Equipment Loan — Closing
- Acme Bridge — Application

— Local copy only. Not posted to Teams. Paste into Teams. You send
  the message manually. Derived from visible records; client-name
  grouped — may not include all related borrowers. Not a
  relationship graph, not a household linkage, not a relationship
  score.
```

- **Client display name** — `entry.clientNameDisplay` (trimmed) or
  the verbatim `"(no borrower name on record)"` placeholder when
  `entry.isClientNameMissing` is true (or when display is
  whitespace-only, defensive).
- **Generated date** — YYYY-MM-DD UTC. Matches Phase 96 / 97 / 98 /
  99 date format.
- **Verbatim grouping marker** — `"Client-name grouped."` printed
  on every snapshot so the limitation is visible the moment the
  banker pastes.
- **Top-line counts** —
  `N active deal(s) · Pipeline $X,XXX,XXX (Y missing $)` — the
  pipeline segment is omitted when `totalAmount === 0`; the
  `(Y missing $)` parenthetical only appears when
  `dealsMissingAmount > 0`.
- **Timeline anchors** — `"Last activity: …"` and
  `"Nearest upcoming close: …"` lines; each omitted when its ISO
  is undefined.
- **Asks block** — conditional. Two bullet rows
  (`open document requests`, `open tasks` with optional `(N overdue)`
  parenthetical); whole block omitted when both counts are zero.
- **Attention block** — conditional. Up to four bullet rows
  (`may require review`, `closing soon`, `stage attention`,
  `draft memo`); whole block omitted when all four counts are zero.
- **Active deals list** — capped at
  `RELATIONSHIP_MEMORY_TEAMS_SUMMARY_MAX_DEALS` = 8. Each row is
  `- dealName — stage` (stage segment omitted when blank;
  `(unnamed deal)` placeholder when `dealName` is blank). A
  `- … and N more` overflow line surfaces when the entry carries
  more deals than the cap.
- **Verbatim disclaimer** — pinned by source-hygiene + output
  tests. Carries every limitation marker the Phase 76/77 cards
  already disclaim.

## Excluded fields

The formatter never emits, and the test suite pins:

- UUID v4 / GUID-shaped identifiers (the raw `dealId` from each
  snapshot is never echoed).
- `cr664_*` Dataverse logical names.
- `_value` lookup suffixes.
- `audit_id`, `event_id`, `timeline_event`, `correlation_id`
  payload markers.
- Memo body text (the formatter has no memo-text input at all).
- `Bearer`, `Authorization:`, `access_token`, `refresh_token`,
  `client_secret`, `Graph`, `MSAL`.
- Approval / denial / decisioning / risk-score / performance-score
  language: `approved`, `denied`, `rejected`, `credit decision`,
  `risk score`, `performance score`.
- Relationship-graph / householding / AI claims: `household`,
  `verified`, `complete history`, `full relationship profile`,
  `relationship score`, `official relationship graph`,
  `AI-generated`, `Copilot`.
- Forbidden positive Teams claims: `sent`, `posted`, `delivered`,
  `notified`, `synced`, `Teams integrated`, `Graph connected`,
  `notification raised`.

The negation `"Not posted to Teams"` inside the verbatim
disclaimer is permitted (and pinned positively).

## Local-only Teams handoff posture

Phase 100 inherits the Phase 86 / 96 / 97 / 98 / 99 posture
unchanged:

- The Teams SDK (`@microsoft/teams-js`) is NOT loaded by this flow.
  Only the Phase 86 chat-handoff card touches it, and only for the
  diagnostic probe.
- No Microsoft Graph client. No MSAL. No token acquisition. No
  external API call of any kind.
- The Web API used is `navigator.clipboard.writeText`. Failure
  paths surface a conservative `role="alert"` with
  `"Clipboard unavailable. Select and copy manually."`
- The banker pastes into Teams in their own client.
- The card never claims a message was "sent", "posted",
  "delivered", "notified", "synced", "Teams integrated", or
  "Graph connected" as a positive claim.

## Why this is NOT Teams posting / notification / sync

- **Not posting.** No Graph endpoint, no Teams webhook, no chat
  bot. The string lives on the clipboard until the user pastes it.
- **Not a notification.** No Teams activity-feed entry is enqueued
  or raised. The Relationship Memory card has no read / unread
  state at all; copying a snapshot does not create one.
- **Not sync.** Nothing persists across devices. The clipboard
  write is per-click and never crosses an org boundary.
- **Not delivery.** The app does not know whether the banker
  pastes what was copied, whether they edit it, or whether they
  send.

## Why this is NOT a relationship graph / householding / AI brief

This is the most important pin for the relationship-memory lane:

- **Not a relationship graph.** The Phase 76 derivation groups by
  normalized client name only (`cr664_clientname` text). There is
  no `cr664_borrower` foreign key today; no edges; no transitive
  borrower relationships. The Phase 100 snapshot inherits every
  one of those limitations and surfaces them verbatim
  (`"Client-name grouped."` + `"may not include all related
  borrowers"` + `"Not a relationship graph"`).
- **Not householding.** No household table, no inferred household
  membership, no per-household aggregate. Two deals naming the
  borrower differently (`"Acme, LLC"` vs `"Acme LLC"`) appear as
  separate snapshots; that limitation is honest and pinned by the
  Phase 76 doc.
- **Not a relationship score.** The aggregate carries integers and
  ISO timestamps. Nothing scores, ranks, or qualifies the
  relationship. No "warm" / "cold" / "high-priority" label is
  assigned.
- **Not an AI brief.** `buildRelationshipMemoryTeamsSummary` is a
  small set of `if (count > 0)` branches and string concatenation.
  No model, no Copilot, no embedding, no semantic enrichment.

The disclaimer line is verbatim in every rendered snapshot:
`"Not a relationship graph, not a household linkage, not a
relationship score."`

## Why this does NOT save relationship notes

The Phase 78 `<RelationshipNoteDraftModal />` is a separate, local-
only banker note-drafting surface owned by the parent `Ready`
component (its `draftFor` slot). The Phase 100 copy button does
NOT:

- Open the Phase 78 modal (a UI test pins `screen.queryByRole(
  'dialog')` returns `null` after a copy click).
- Call any Phase 78 helper.
- Write any banker note text to localStorage or to Dataverse.

The copy click flows through `navigator.clipboard.writeText` only.
A separate localStorage byte-snapshot test pins that the Phase 83
Autopilot suggestion ledger (`cc:autopilotSuggestionLedger:v1`),
the Phase 90 last-seen markers (`cc:lastVisit:catchUp:*`), and the
Phase 91 dismiss / snooze ledger (`cc:catchUpItemLedger:v1`) are
byte-identical before and after the copy click.

## Future upgrade path

When the Lane E + Lane G upstream blockers clear, Phase 100 can be
extended without rewriting:

1. **Graph channel posting.** Replace the clipboard write with a
   `POST /teams/{team-id}/channels/{channel-id}/messages` to a
   relationship-team channel. Requires Teams app registration +
   `ChannelMessage.Send` Graph scope + admin consent + a
   client-to-channel mapping table. A new `GOVERNED_WRITES` entry
   (`relationship-channel-message-send`) would coordinate audit +
   timeline.
2. **Teams cards.** Render the Phase 100 plain-text snapshot as an
   Adaptive Card payload so the post displays as a relationship
   card. The schema is text-only client-side; only the post needs
   Graph.
3. **Persistent relationship notes.** Once the schema lands a
   `cr664_relationshipnote` entity (or extends `cr664_borrowers`
   with a notes column), upgrade the Phase 78 local draft surface
   to a governed write. Phase 100's "copying does not save
   relationship notes" rule still holds — the Save action is a
   separate, explicit user click on a separate surface.
4. **Relationship graph entity.** A `cr664_borrower` FK + a
   `cr664_relationshipgraph` table would let the Phase 76
   derivation grow from client-name-grouped to verified-entity-
   grouped. Phase 100's snapshot would then drop the
   "client-name grouped" limitation marker and gain a verified-
   entity-id reference — still no AI, still no household.
5. **AI-assisted relationship brief.** Lane F. A Copilot pass
   could produce a richer narrative summary while the deterministic
   plain-text snapshot remains the floor and the source-of-truth
   integers / labels.
6. **Outlook / Teams activity ingestion.** Once Lane E connectors
   land, the Phase 76 aggregate could pick up communication
   recency (last call, last meeting, last email) and surface those
   in the snapshot. No formatter change required — just additional
   fields on `RelationshipMemoryEntry`.

None of those are needed for Phase 100 to be useful today.

## Files created / modified

```
src/shared/relationship/relationshipMemoryTeamsSummary.ts          (new)
src/shared/relationship/relationshipMemoryTeamsSummary.test.ts     (new)
src/banker/RelationshipMemory.tsx                                  (modified — wire inline Copy Teams summary button per row)
src/banker/RelationshipMemory.test.tsx                             (modified — Phase 100 UI + non-mutation tests)
src/shared/governance/platformInventory.ts                         (modified — new LOCAL_ONLY_FLOWS entry)
src/shared/governance/platformInventory.test.ts                    (modified — pin new entry + doc-exists check + no-new-GOVERNED guard)
docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md                         (modified — advance §1.7, §1.16, §1.1)
docs/PHASE_100_RELATIONSHIP_MEMORY_TEAMS_HANDOFF.md                (new — this file)
```

## Confirmations

- No new writes. `GOVERNED_WRITES.length` unchanged.
- No new entry in `NOT_WIRED` or `DELIBERATELY_BLOCKED`.
- New entry in `LOCAL_ONLY_FLOWS`:
  `relationship-memory-teams-summary-handoff`.
- No new schema columns, tables, or option-set values.
- No new SDK install. No new connector.
- No Graph / MSAL / token-acquisition code introduced.
- No Teams API call. No channel post. No notification raised.
- No AI / Copilot / model invocation.
- No new derivation logic — Phase 76 primitive is reused
  unchanged.
- The Phase 78 relationship-note draft state is NOT mutated by
  the copy click.
- The Phase 83 / 90 / 91 ledgers are NOT mutated by the copy
  click (localStorage byte-snapshot test).
- Copying does NOT imply a relationship graph, householding, or
  an AI-generated brief.
- All tests pass.

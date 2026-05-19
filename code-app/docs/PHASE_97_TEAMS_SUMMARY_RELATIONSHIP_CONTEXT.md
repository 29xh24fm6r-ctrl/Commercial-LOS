# Phase 97 — Relationship Context Note in Teams Deal Summary

## Goal

Populate the Phase 96 Teams deal-summary handoff's optional
`relationshipContextNote` slot with a banker-safe one-line note
derived from the existing Phase 76/77 client-name-grouped
relationship primitive. No new derivation, no new schema, no new
writes, no Graph, no Teams API send. Phase 97 is a wiring +
one-line-formatter slice; the Phase 76/77 deterministic primitive
(`deriveCrossDealContext`) does the heavy lifting unchanged.

## Why this phase

Phase 96 shipped the Teams deal-summary handoff with an explicitly
optional `relationshipContextNote` slot and left it `undefined` for
the initial release ("a future phase could thread a short one-line
note in via DealDataProvider"). Phase 76 + Phase 77 already derive
the cross-deal client-name-grouped context that the
`<RelationshipContext />` card uses on the same Deal Workspace.
Phase 97 connects the two: when the banker has other visible deals
in the same client-name group, the Teams summary picks up a short
plain-text line carrying the count + asks + nearest close. When
there's no useful content, the line is omitted entirely (preferred
posture per the Phase 97 brief).

## Relationship to Phases 76 / 77 / 96

| | Phase 76 | Phase 77 | Phase 96 | Phase 97 |
|---|---|---|---|---|
| Surface | Banker Command Center `<RelationshipMemory />` card | Banker Deal Workspace `<RelationshipContext />` card | Banker Deal Workspace `<TeamsDealSummaryHandoff />` card | Same card as Phase 96 — extends its `relationshipContextNote` slot |
| Primitive | `deriveRelationshipMemory` | `deriveCrossDealContext` (filter + reuse `deriveRelationshipMemory`) | Phase 80 `deriveNextBestActions` + Phase 73 consistency check | **Reuses** `deriveCrossDealContext` from Phase 77 |
| Adds derivation logic? | Yes (original) | Yes (filter) | No (Phase 80/73 already shipped) | **No** — only a one-line formatter for the existing aggregate |
| New loader? | No — uses banker work queue | No | No (uses DealDataProvider) | Yes — `loadBankerWorkQueueData(bankerId)` (same loader Phase 77 uses) |
| Writes / audit | None | None | None | None |
| Graph / MSAL | None | None | None | None |

Phase 97 imports `CrossDealContextResult` + `deriveCrossDealContext`
from `src/shared/relationship/relationshipMemory.ts` and adds a
sibling pure file `relationshipContextNote.ts` whose only job is to
turn a `CrossDealContextResult` into a `string | undefined` for the
Phase 96 formatter slot. The relationship derivation source lives
in one place — Phase 76/77 — and Phase 97 stays downstream.

## Fields included in the relationship note

The note is one line of plain text composed of up to four short
sentences. Each sentence is conditionally included based on what
the Phase 76/77 aggregate carries:

1. **Count + display name + grouping marker** — always present when
   the line renders.
   `"N other visible deal(s) for <client-name> (client-name grouped)."`
   When the matched group has no borrower name on record (rare,
   honest fallback) the display swaps to the verbatim placeholder
   `"(no borrower name on record)"` rather than printing a bare
   colon.
2. **Aggregate asks** — conditional; the whole sentence is dropped
   when every count is zero.
   `"Across those deals: <X open tasks> (Y overdue), <Z outstanding documents>, <W documents pending review>, <V draft memos>."`
   Each piece is included only when its count is > 0; the
   commas + Oxford "and" join keeps the sentence readable. The
   overdue parenthetical only appears when `overdueTaskCount > 0`.
3. **Nearest upcoming close** — conditional; rendered as
   `"Nearest upcoming close YYYY-MM-DD."` (UTC). Omitted when no
   future close exists across the other visible deals OR when the
   ISO timestamp is unparseable.
4. **Verbatim limitation marker** — always present when the line
   renders.
   `"From visible records; may not include all related borrowers."`

When the input result is `'no-client-name'` or `'no-other-deals'`,
the formatter returns `undefined` and the Phase 96 summary omits
the `Relationship:` line entirely. Brief preference: keep the
Teams paste short; don't add a "No other visible deals" sentence
when there's nothing to say.

## Grouping limitations (carried verbatim from Phase 76)

- **Client-name grouped only.** The deal schema has no
  `cr664_borrower` foreign key today; grouping uses normalized
  `cr664_clientname` (trim + collapse whitespace + lowercase). Two
  deals naming the same borrower differently
  (`"Acme, LLC"` vs `"Acme LLC"`) appear as separate groups.
- **Banker-visible only.** The aggregate is filtered by what
  `loadBankerWorkQueueData(bankerId)` returns. Deals outside the
  banker's authorized pipeline never reach the formatter.
- **Self-excluded.** `deriveCrossDealContext` filters the CURRENT
  deal out of the input before recomputing the aggregate — the
  count + asks + nearest close describe ONLY the other visible
  deals.
- **No household / verified-entity linkage.** The note carries
  `"client-name grouped"` + `"may not include all related
  borrowers"` so a banker reading it knows the boundary.

## Why this is not a graph / AI / full relationship profile

- **Not a graph.** The aggregate is one-level grouping by string
  match on a single text column. No edges, no entity-resolution,
  no transitive borrower relationships.
- **Not AI.** `buildRelationshipContextNote` is six branches and a
  comma-join. No model, no Copilot, no embedding.
- **Not a full profile.** The note carries four small facts (count,
  asks, nearest close, limitation). Real "relationship profile"
  surfaces would carry contact history, household members,
  exposure aggregates, payment history, prior-relationship notes,
  and so on — none of which the schema supports.
- **Not a score.** The note carries integers and a date; nothing
  scores or ranks the relationship.

The source-hygiene test for `relationshipContextNote.ts` pins a
list of forbidden positive claims: `household`, `verified`,
`complete history`, `full relationship profile`, `relationship
score`, `risk score`, `all borrower exposure`, `AI-generated`,
`Copilot`, `relationship graph`, `credit decision`, `guaranteed`.

## Why Teams remains handoff-only

Phase 97 changes nothing about Phase 96's Teams handoff posture:

- The card still uses `navigator.clipboard.writeText` only.
- No Graph client is constructed.
- No MSAL or token acquisition path is introduced.
- No Teams API endpoint is contacted.
- No notification, calendar event, or meeting is created.
- The banker still pastes into Teams in their own client.

The only behavior change is that the copied text now MAY include a
one-line relationship-context block when other visible deals share
the client-name group. The disclaimer block at the bottom of the
card is unchanged.

## Graceful degradation

The relationship-line wiring is purely additive. When any of these
conditions hold, the rest of the summary still renders unchanged
and the relationship line is simply omitted:

- No `BankerProvider` mounted (`useOptionalBanker()` returns
  `undefined`). The pipeline loader is not called at all.
- `loadBankerWorkQueueData(bankerId)` rejects. The component
  records the failure internally as `kind: 'failed'` but does NOT
  surface an alert — the brief explicitly calls for the rest of
  the summary to remain the useful product.
- The pipeline returns no other deals on the client-name group.
- The current deal has no client name on record.

A failed banker-pipeline load **never** blocks the Copy button or
hides the summary preview. The Teams-handoff posture is the
priority.

## Future upgrade path

When Lane G schema work lands (a real `cr664_borrower` FK on the
deal), Phase 97 can be extended without rewriting:

1. **Verified borrower linkage.** Swap the normalized-client-name
   grouping inside Phase 76's `deriveRelationshipMemory` for the
   FK-based one. The Phase 97 formatter does not change — it just
   reads better limitation markers (`borrower-id linked` instead
   of `client-name grouped`).
2. **Aggregate exposure.** Once the schema carries committed/outstanding
   amounts at the relationship level, the formatter could include
   a `Total committed: $X` line — still deterministic, still no AI.
3. **Cross-borrower household.** When a household table lands the
   note could optionally fold in "Household: <N> related
   borrowers, M deals across them." Still no Graph, still no AI.
4. **Phase-86-style Teams send (Lane E).** If Graph + admin consent
   eventually allow a real channel post, the formatter output is
   already Teams-paste-shaped — the post call would replace
   `navigator.clipboard.writeText` with a Graph POST, and a new
   GOVERNED_WRITES entry would coordinate the audit + timeline.
5. **AI-assisted relationship brief (Lane F).** A Copilot pass
   could produce a richer summary while the deterministic note
   remains the floor and the source-of-truth integers.

None of those are needed for Phase 97 to be useful today.

## Files created / modified

```
src/shared/relationship/relationshipContextNote.ts             (new)
src/shared/relationship/relationshipContextNote.test.ts        (new)
src/deals/TeamsDealSummaryHandoff.tsx                          (modified — load banker pipeline + thread relationship note)
src/deals/TeamsDealSummaryHandoff.test.tsx                     (modified — Phase 97 wiring tests)
src/shared/governance/platformInventory.ts                     (modified — extend the Phase 96 LOCAL_ONLY_FLOWS entry)
src/shared/governance/platformInventory.test.ts                (modified — pin the Phase 97 note + doc-exists check + no-new-GOVERNED guard)
docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md                     (modified — advance §1.7 + §1.16)
docs/PHASE_97_TEAMS_SUMMARY_RELATIONSHIP_CONTEXT.md            (new — this file)
```

## Confirmations

- No new writes. `GOVERNED_WRITES.length` unchanged.
- No new entry in `NOT_WIRED`, `DELIBERATELY_BLOCKED`, or
  `LOCAL_ONLY_FLOWS` (the existing `teams-deal-summary-handoff`
  entry is extended in place).
- No new schema columns, tables, or option-set values.
- No new SDK install. No new connector.
- No Graph / MSAL / token-acquisition code introduced.
- No Teams API call. No channel post. No notification raised.
- No AI / Copilot / model invocation.
- No new derivation logic — Phase 76/77 primitives are reused
  unchanged.
- The Banker Deal Workspace scope is unchanged; the new banker-
  pipeline load uses the same `loadBankerWorkQueueData(bankerId)`
  loader Phase 77 already uses on the same page.
- All tests pass.

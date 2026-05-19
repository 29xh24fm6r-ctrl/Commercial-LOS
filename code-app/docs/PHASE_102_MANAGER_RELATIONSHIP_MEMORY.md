# Phase 102 — Manager Workspace Relationship Memory Parity

## Goal

Add a manager-facing, read-only `<ManagerRelationshipMemory />` card
on the Manager Workspace that surfaces the same Phase 76 client-name-
grouped relationship snapshot the banker workspace already carries —
but scoped to the manager's team pipeline so a manager can see
borrower / client exposure across every banker on the team in one
place.

No new derivation logic. No new schema. No new write. No copy-to-
Teams or Outlook handoff button on this surface (the Phase 100 / 101
handoff surfaces are banker-only by design; the manager view is for
cross-banker awareness, not client solicitation).

## Why this phase

Phase 76 shipped Relationship Memory Lite as a banker-only card on
the Banker Command Center. The Vibe scope expects the same
relationship-aware view on the manager side, scoped to the team's
deals so the manager can:

- spot clients with multiple in-flight deals across different
  bankers,
- triage attention (overdue tasks, pending review, closing soon,
  stage attention) at the client level rather than the per-deal
  level, and
- narrow the view to one banker via the Phase 92 banker filter for
  a focused 1:1 review.

The brief is explicit that this phase is **not** another handoff
variant — it's a real workspace capability that materially advances
the relationship-memory + manager-command-center Vibe scope without
extending the local-only sibling pattern.

## Scope

- Manager Workspace only.
- Read-only deterministic derivation; reuses Phase 76
  `deriveRelationshipMemory` unchanged.
- No new writes. No audit row. No timeline event. No governed
  write.
- No new schema columns, tables, or option-set values.
- No new SDK install. No new connector.
- No Teams / Outlook handoff buttons on this surface (deliberate —
  see "Why no handoff" below).
- No AI, no Copilot, no model invocation.
- No relationship-graph claim; no householding; no verified-entity
  linkage; no relationship score.
- No Draft relationship note button (Phase 78 is banker-only).

## Reused primitives

| Primitive | Source | Phase 102 use |
|---|---|---|
| `deriveRelationshipMemory(input, now)` | Phase 76 (`src/shared/relationship/relationshipMemory.ts`) | Unchanged. Phase 102 only reshapes the manager-authorized data into the same `RelationshipMemoryInput` shape the Phase 76 derivation already accepts. |
| `RelationshipMemoryEntry` / `RelationshipDealSnapshot` | Phase 76 | Output shape, rendered verbatim. |
| `useManagerData()` | Phase 87 (`src/manager/ManagerDataProvider.tsx`) | Reads `teamPipeline`, `teamTasks`, `teamDocuments`, `teamMemos`. |
| `useManagerBankerFilter()` | Phase 92 (`src/manager/ManagerBankerFilter.tsx`) | Narrows the deal universe before derivation; same `matchesDeal` predicate the autopilot rollup + morning catch-up cards use. |

The card does **not** introduce new loaders. Every row it renders
was already in the manager's authorized scope via
`loadManagerTeamPipeline` + `loadManagerTeamTasks` + `loadManager
TeamDocuments` + `loadManagerTeamMemos`.

## Surface behavior

| State | Render |
|---|---|
| Loading (any of the four child slots non-ready) | `"Loading client snapshot…"` |
| Failed (any slot's `kind === 'failed'`) | `role="alert"` block with the slot's error message |
| Empty (no team deals) | `"No clients with active deals on the team from current records."` + disclaimer |
| Filter-empty (Phase 92 filter excludes every deal) | Filter-aware empty copy: `"No clients with active deals for <Banker> from current records."` / `"No clients with unassigned active deals from current records."` |
| Populated | Scan line + top-N client rows + per-row disclaimer |

A `selectionLabel` chip on the card header surfaces the active
Phase 92 banker filter ("Focused on: <Banker>" / "Focused on:
Unassigned") — same pattern the manager autopilot rollup uses.

### Per-client row

Each row carries:

- **Client header** — display name (or `(no borrower name on
  record)` placeholder when missing) + active-deal count +
  optional `Pipeline $X,XXX,XXX` segment with `(N missing $)`
  parenthetical when some deals lack amount.
- **Timeline anchors** — `Last activity: <today / 1 day ago / N
  days ago>` + `Nearest upcoming close: <today / tomorrow / in N
  days>`. Both lines omitted gracefully when the underlying ISO is
  missing.
- **Asks** — `Open document requests: <N>` + `Open tasks: <N>` with
  optional `(N overdue)` parenthetical when overdue tasks exist.
- **Attention badges** — pending-review-docs / closing-soon /
  stage-aging / draft-memo badges; each renders only when its
  count is > 0.
- **Active deals** — up to 5 deal pills with stage label;
  `… and N more deals not shown.` line when the entry has more.
  Each pill is a button that navigates to `/deals/<id>`.

### Caps

- **Top-N clients** — 10. The derivation already sorts by
  attention; only the top 10 client groups render. An overflow
  line surfaces `… and N more clients not shown. Narrow the
  banker filter to see a focused subset.` when truncated.
- **Per-row deals** — 5. Same overflow pattern at the deal level.

## Grouping limitations (carried verbatim from Phase 76)

- **Client-name grouped only.** The deal schema has no
  `cr664_borrower` foreign key today; grouping uses normalized
  `cr664_clientname` (trim + collapse whitespace + lowercase). Two
  deals naming the same borrower differently
  (`"Acme, LLC"` vs `"Acme LLC"`) appear as separate entries — a
  test explicitly pins this.
- **Manager-visible only.** The aggregate is filtered by what
  `useManagerData()` returns — every row already inside the
  manager's team scope.
- **Phase 92 filter applies BOTH to deals AND to children.** When
  the manager narrows to one banker, the catch-up / autopilot /
  relationship-memory views all reflect the same focused set. The
  derivation operates on a coherent subset (no orphan task /
  document / memo rows feeding aggregates for hidden deals).
- **Not a relationship graph.** No edges, no entity-resolution, no
  transitive borrower relationships.
- **Not householding.** No household table, no inferred household
  membership.
- **Not a relationship score.** Integers + ISO timestamps; nothing
  scores, ranks, or qualifies the relationship.

The verbatim disclaimer renders on every populated state:

> Derived from manager-visible records. Client-name grouped, so
> two deals naming the borrower differently ("Acme, LLC" vs "Acme
> LLC") appear as separate entries. This is a relationship
> snapshot, not a verified relationship graph, not a household
> linkage, not a relationship score. Manager visibility is scoped
> to the manager's team pipeline; deals outside that scope are not
> evaluated and not surfaced here. Open the relevant deal to act.
> No AI or automated decisions.

## Why no Teams / Outlook handoff on this surface

The Phase 100 / 101 handoffs are banker-only by design. The manager
view of relationship memory is for **cross-banker awareness** — the
manager isn't typically the one reaching out to the borrower. Adding
copy-to-Teams or Open-in-Outlook buttons here would invite the
manager to take an action that's properly owned by the assigned
banker on each deal.

If a manager wants to discuss a specific client with the assigned
banker, the Phase 86 `<TeamsChatHandoff />` (per-deal, on the deal
workspace) or the Phase 98 manager-catch-up Teams handoff is the
right surface. Phase 102 deliberately keeps the manager
relationship-memory card read-only.

This is also a direct application of the post-Phase-101 product
discipline: build only what materially advances the Vibe scope; do
not keep adding sibling handoff variants just because the pattern
exists.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- **§1.16 Relationship memory** — second workspace consumer of the
  Phase 76 primitive. The banker side ships at the per-deal +
  per-client granularity (Phase 76 + Phase 77); the manager side
  ships at the per-client granularity scoped to the team.
- **§1.22 Manager Workspace** — adds Relationship Memory parity
  alongside the existing autopilot rollup + morning catch-up +
  team pipeline summary + closing forecast + activity summary +
  banker workload summary stack.

## Files created / modified

```
src/manager/ManagerRelationshipMemory.tsx                       (new)
src/manager/ManagerRelationshipMemory.test.tsx                  (new)
src/workspaces/ManagerWorkspace.tsx                             (modified — mount the new card after the autopilot rollup)
docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md                      (modified — advance §1.16 + §1.22)
docs/PHASE_102_MANAGER_RELATIONSHIP_MEMORY.md                   (new — this file)
```

## Confirmations

- No new writes. `GOVERNED_WRITES.length` unchanged.
- No new entry in `NOT_WIRED`, `DELIBERATELY_BLOCKED`, or
  `LOCAL_ONLY_FLOWS` — Phase 102 introduces no new clipboard
  surface, no new mailto launcher, no new local-only flow.
- No new schema columns, tables, or option-set values.
- No new SDK install. No new connector.
- No Graph / MSAL / token-acquisition code introduced.
- No Teams API call. No channel post. No notification raised.
- No AI / Copilot / model invocation.
- No relationship-graph / householding / verified-entity claim.
- No new derivation logic — Phase 76 primitive reused unchanged.
- Phase 92 banker filter integrated symmetrically with the
  manager autopilot rollup + morning catch-up cards.
- All tests pass.

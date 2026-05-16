# Phase 77 — Deal Workspace Cross-Deal Relationship Context

## Goal

Add a deal-level relationship context card to the Banker Deal Workspace that surfaces other already-authorized deals for the same client name. Reuses the Phase 76 `deriveRelationshipMemory` derivation through a thin `deriveCrossDealContext` helper that excludes the current deal from the aggregates. No new schema, no new write surface, no AI, no relationship graph.

## Why this phase

Phase 76 brought deterministic relationship memory to the Banker Command Center. The Vibe scope also expects relationship context **inside** the banker's workflow on a specific deal — "while working on Acme RLOC, the banker should see Acme's other open business". Phase 77 closes that surface using the same derivation, the same source fields, and the same conservative copy discipline.

## Scope

- Read-only relationship context only.
- Banker Deal Workspace only (banker-side).
- Deterministic derivation only (reuses Phase 76 + a thin filter helper).
- No new write surface.
- No new `LOCAL_ONLY_FLOWS` entry.
- No schema work.
- No AI.
- No relationship graph entity.
- No external integrations (Teams / Outlook / portal).
- Manager / team / executive Deal Workspaces — **deliberately not changed**. The component returns `null` when no `BankerContext` is present, so even if it were mounted from a non-banker workspace by accident, it would render nothing.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- §1.2 (Deal Workspace) — current-state updated to note the new banker-only `<RelationshipContext />` card and its placement between DealSummary and DealTasks.
- §1.16 (Relationship memory) — current-state advanced from "Partially operational (advanced by Phase 76)" to "Partially operational (advanced by Phase 76 + Phase 77)". The in-repo derivation slice now lives on both the Banker Command Center (cross-client roll-up) and the Banker Deal Workspace (single-client cross-deal context).

## Fields surfaced

For the current deal's client name, the card shows three possible states:

### `no-client-name`

When `deal.clientName` is `undefined` or blank:

- Subtitle: "No borrower name on record for this deal."
- Body explains that client-name grouping is the limit and no other deals can be grouped.
- Conservative disclaimer reproduced.

### `no-other-deals`

When the current deal is the only deal in its client group:

- Subtitle: `No other visible deals for <client name>.`
- Body: "No other visible deals for this client from current records. Client-name grouped, so a sibling deal naming the borrower differently ('Acme, LLC' vs 'Acme LLC') would not appear here."
- Conservative disclaimer reproduced.

### `has-other-deals`

When one or more sibling deals exist for the same normalized client name:

- Subtitle: `N other visible deal(s) for <client name> — derived from visible records.`
- Timeline row: latest activity (across the other deals) + nearest upcoming close (across the other deals).
- Open-asks row: outstanding documents count + open tasks count (with overdue subset highlighted).
- Attention badges (only when count > 0): may require review, closing soon, stage attention, draft memos. Each carries a long-form `aria-label`.
- Deal pill list: each sibling deal renders as a clickable button (`aria-label="Open related deal <name>"`) that navigates to `/deals/<dealId>`. The current deal is **not** included in the list.
- Conservative disclaimer: "Derived from visible records. Client-name grouped — sibling deals naming the borrower differently ('Acme, LLC' vs 'Acme LLC') appear as separate entries and are NOT shown here. May not include all related borrowers. Not a verified relationship graph, not a household linkage, not a relationship score. No predictive claim."

## Source fields used

Every field consumed is identical to Phase 76 — no new Dataverse column is read and no new query shape is introduced. The card calls the existing `loadBankerWorkQueueData(bankerId)` loader (the same one MyWorkQueue + PersonalActivitySummary + RelationshipMemory consume) and passes the result through `deriveCrossDealContext(input, currentDealId, currentClientName, now)`.

Reused fields:

- From the deal (`PipelineDeal` / `cr664_loandeals`): `id`, `name`, `clientName`, `stage`, `amount`, `targetCloseDate`, `lastActivityOn`, `stageEntryDate`.
- From the task (`WorkQueueTaskRow` / `cr664_dealtask1`): `dealId`, `dueDate`.
- From the document (`WorkQueueDocumentRow` / `cr664_documentchecklist`): `dealId`, `receivedDate`.
- From the memo (`WorkQueueMemoRow` / `cr664_creditmemo1`): `dealId`, `statusKey`.

The current deal's `id` + `clientName` come from `useDealData()` (already authorized via Phase 4's `loadDealForBanker`).

## Derivation reuse

Phase 77 adds one new exported function and one new result type to the Phase 76 module:

```
deriveCrossDealContext(input, currentDealId, currentClientName, now)
  → 'no-client-name' | 'no-other-deals' | 'has-other-deals'
```

Implementation (10 effective lines): normalize the current client name; early-return `no-client-name` if missing; filter the current deal out of `input.deals`; re-run `deriveRelationshipMemory` on the filtered input; look up the matching client entry; classify into `no-other-deals` vs `has-other-deals`.

Re-running the existing derivation (rather than post-hoc patching an entry's aggregates) keeps the helper trivial and ensures the cross-deal aggregates stay consistent with the Phase 76 single-client aggregates — same thresholds, same gap accounting, same sort order, same module hygiene.

## Grouping limitations

Same as Phase 76 — the schema has no `cr664_borrower` foreign key on deal:

- Two deals naming the borrower as `Acme, LLC` and `Acme LLC` (different punctuation) will not collapse into the same entry, even though they likely represent the same borrower. The card renders the limitation verbatim in the disclaimer ("Client-name grouped — sibling deals naming the borrower differently ('Acme, LLC' vs 'Acme LLC') appear as separate entries and are NOT shown here.").
- No verified borrower entity id; no household linkage; no cross-borrower deduplication.

## Permission boundary

The card is **banker-only** by construction:

- `useOptionalBanker()` returns `undefined` outside `BankerProvider`. The component checks `bankerId` and returns `null` immediately if it is not present, so even if the card were mounted from `ManagerDealWorkspace` or `TeamDealWorkspace` it would render nothing. The Phase 4 Banker → Deal Workspace path is the only place the card actually renders.
- The card consumes `loadBankerWorkQueueData(bankerId)` — the same banker-scoped two-step loader used by Phase 32 (MyWorkQueue), Phase 75 (PersonalActivitySummary), and Phase 76 (RelationshipMemory). No new query shape is introduced; no permission widening occurs.
- Sibling deals that surface in the card are exactly the deals the banker is already authorized to see via `loadBankerPipeline(bankerId)`. The card never reveals a deal outside the banker's pipeline.
- The deal-pill navigation calls `navigate('/deals/<dealId>')`. The destination workspace runs its own `loadDealForBanker(dealId, bankerId)` access check; if (hypothetically) the navigation went to a deal not in the banker's pipeline, the destination workspace's existing access-denied path would render. No bypass.

The role-boundary test in `RelationshipContext.test.tsx` explicitly asserts that the component returns `null` and does NOT call the loader when `useOptionalBanker()` returns `undefined`.

## Why this is not AI / graph / householding

- **Not AI.** No model invocation, no Copilot connector, no LLM, no embedding lookup. The derivation is a pure function over the existing data. Module-hygiene tests in `relationshipMemory.test.ts` forbid the AI vocabulary in the source.
- **Not a relationship graph.** The output is a flat per-client list. No edges, no relationship-type vocabulary, no "borrower A controls entity B" semantics. The card is a roll-up by name, not by entity.
- **Not householding.** Two deals naming the same borrower differently are NOT collapsed; the disclaimer states this explicitly. There is no household linkage and no claim of one.
- **Not a relationship score.** The card produces counts, currency totals, and timeline anchors. No weighted formula, no rank, no comparative position. The rendered-DOM test in `RelationshipContext.test.tsx` asserts "relationship score" never appears as a positive claim and that "risk score" / "guaranteed" / "approved" / "rejected" / "AI-generated" / "complete borrower history" / "full relationship profile" / "official householding" never appear at all.
- **Not predictive.** Every value describes the current state of records the system holds. No forecast, no extrapolation. The disclaimer says so verbatim.

## Future upgrade path

The Phase 76 doc enumerated the upgrade path (verified borrower entity id → relationship graph table → Outlook/Teams activity ingestion → AI briefs → cross-deal banker notes → contact-level interaction history). Phase 77 adds two surface-specific extensions to that list:

1. **Manager / team Deal Workspace extension.** Each role's data provider already loads a deal list (`ManagerDataProvider.teamPipeline`, `TeamDataProvider.deals`). A future phase could render an equivalent card on those workspaces using their already-authorized data — strictly read-only, with the same role-boundary discipline.
2. **Persistent banker notes per client.** Layered on top of Phase 76 / 77: a Phase-23-style LOCAL_ONLY clipboard surface that lets the banker draft notes for their own system, OR a future governed write to a new `cr664_borrowernote` entity once the schema lands.

## Files created

- `src/deals/RelationshipContext.tsx` — banker-only Deal Workspace card.
- `src/deals/RelationshipContext.test.tsx` — 8 rendered-card tests (role boundary, loading, failed, no-client-name, no-other-deals, has-other-deals with aggregate-exclusion verification, deal-pill navigation, conservative disclaimer + forbidden-vocabulary scan).
- `docs/PHASE_77_DEAL_RELATIONSHIP_CONTEXT.md` — this document.

## Files modified

- `src/shared/relationship/relationshipMemory.ts` — added `CrossDealContextResult` type + `deriveCrossDealContext` function (the only public surface change to the Phase 76 module).
- `src/shared/relationship/relationshipMemory.test.ts` — added a Phase 77 describe block with 7 additional derivation tests pinning the cross-deal helper (no-client-name, no-other-deals, has-other-deals with current-deal exclusion, aggregate-leak prevention, case+whitespace normalization, no-match fallback, blank-string fallback).
- `src/deals/BankerDealWorkspace.tsx` — mounts `<RelationshipContext />` between `<DealSummary />` and `<DealTasks />`.
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.2 + §1.16 advanced.

## Tests added / updated

- 7 new derivation tests in `src/shared/relationship/relationshipMemory.test.ts` (under `Phase 77 — deriveCrossDealContext` describe):
  - returns `no-client-name` when current deal has no `clientName`;
  - returns `no-client-name` when `clientName` is whitespace-only;
  - returns `no-other-deals` when only the current deal exists for this client;
  - returns `has-other-deals` with the current deal excluded from `entry.deals`;
  - recomputes aggregates so the current deal's overdue tasks / outstanding docs / draft memos / closing-soon / stage-at-risk counts do NOT leak into the cross-deal aggregates;
  - normalizes the current client name so case + whitespace variants resolve to the same group;
  - returns `no-other-deals` when no sibling matches the current client name.
- 8 new card-rendering tests in `src/deals/RelationshipContext.test.tsx`:
  - role boundary: returns `null` + does NOT call the loader when no `BankerContext`;
  - loading state with banker present;
  - failed state via `role="alert"`;
  - no-client-name fallback when the deal has no `clientName`;
  - no-other-deals fallback when only the current deal exists for the client;
  - has-other-deals rendering: aggregates exclude the current deal (no closing-soon / stage-attention / draft-memo badges leak from the current deal; sibling-only pill renders, current-deal pill is absent);
  - clicking a deal pill calls `navigate('/deals/<id>')`;
  - conservative disclaimer renders + rendered DOM avoids `AI-generated` / `risk score` / `guaranteed` / `approved` / `rejected` / `complete borrower history` / `full relationship profile` / `official householding` / positive uses of `relationship score`.

No existing test was changed. Phase 76 hygiene tests continue to enforce the source-level vocabulary discipline on the extended module.

## Confirmation: no writes / schema / AI / graph / score added

- **No new write surface.** No `GOVERNED_WRITES` entry was added.
- **No new `LOCAL_ONLY_FLOWS` entry.** The card is pure render of already-loaded data.
- **No schema change.** Every field consumed already existed.
- **No AI.** Pure deterministic function; the module-hygiene test continues to forbid the AI / model vocabulary.
- **No relationship score / risk score.** Output is counts + currency totals + ISO timestamps; rendered-DOM test asserts the rendered text never makes a positive scoring claim.
- **No relationship graph.** Output is a flat per-client view filtered to one client; no edges, no relationship-type vocabulary.
- **No permission widening.** The card consumes the same banker-scoped loader Phase 32 introduced. Sibling deals are exactly the deals the banker is already authorized to see. Deal-pill navigation goes through the standard Phase 4 access-check path.

## Test + build counts (at acceptance)

- Full suite: **1266 / 1266 tests passing** (Phase 76 baseline 1251 + Phase 77's 7 derivation + 8 card = 15 new).
- `tsc -b && vite build`: clean.

## Recommended next phase

From the coverage map and the standing Lane-A momentum:

- **Dark theme tokens** — closes the largest remaining a11y gap (Phase 74 §1.28 named dark theme as the next a11y step). Pure UI / token-system phase, no schema, no writes, no new derivation.
- **Persistent banker notes capture (LOCAL_ONLY)** — Phase-23-style clipboard surface layered on top of the Phase 76 / 77 client-keyed view. The banker drafts and copies notes for their own system; no Dataverse write. Stop-gap toward a future governed-write persistent-notes phase.
- **Manager / team Deal Workspace cross-deal context** — Phase 77 sibling on the manager and team deal workspaces using their existing already-authorized deal lists. Each role's provider already carries the data; the work is the role-specific card + a role-boundary test pass.

Of the three, **dark theme tokens** is the lowest-risk and closes the most concrete a11y gap; **persistent banker notes capture** has the highest immediate banker value because it adds a new banker capability (rather than re-skinning existing ones) without requiring schema; **manager/team cross-deal context** extends Phase 77 across more roles but adds the least new capability.

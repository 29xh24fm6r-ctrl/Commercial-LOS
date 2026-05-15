# Phase 76 — Relationship Memory Lite

## Goal

Add a deterministic, banker-facing relationship-memory surface to the Banker Command Center. Group the banker's active deals by client name, surface per-client attention totals (open asks, overdue tasks, pending review, closing soon, stage attention, draft memos), and provide direct deal navigation. No AI. No graph. No predictive scoring. No new write surface. No new schema.

## Why this phase

The Microsoft Vibe scope expects relationship memory: borrower history, open asks, recent communications/activity, prior deal context, and preparation support for bankers. Building AI relationship intelligence or a cross-entity graph requires schema (`cr664_borrower` foreign key on deal; notes/preferences/contact-history columns on borrower; relationship graph table) and integrations (Teams/Outlook activity ingestion) the app does not yet have. Phase 76 ships the **deterministic** slice that uses only existing visible records — the banker now sees one place per client showing what they would otherwise have to assemble by walking each deal individually.

## Scope

- Banker-facing read-only relationship context only.
- Deterministic derivation only.
- No new write surface (no `GOVERNED_WRITES` entry).
- No new `LOCAL_ONLY_FLOWS` entry (the card is pure read-only render of already-loaded data).
- No schema work.
- No AI.
- No external integration (Teams / Outlook / portal).
- No relationship graph entity.
- No predictive scoring.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- §1.16 (Relationship memory) — current-state advanced from "Not started" to "Partially operational (advanced by Phase 76)". Phase 76 closed the in-repo derivation slice; remaining work (persistent notes, verified borrower entity id, contact-history ingestion, AI briefs) is enumerated in the row's Gap / Safe next step / Schema sections.
- §1.1 (Banker Command Center) — current-state note updated to reflect the additional card and to set the next safe step (dark theme tokens, OR persistent banker-notes capture).

## Relationship fields implemented

Each entry produced by `deriveRelationshipMemory` carries the following derived counts and timeline anchors:

### Identity / grouping

- `clientNameDisplay` — display string (trimmed; first non-empty form seen in the group).
- `clientNameKey` — normalized grouping key (trim + collapse whitespace + lowercase). Internal; not rendered.
- `isClientNameMissing` — true when no deal in the group carried a non-empty `clientName`; the UI swaps in "(no borrower name on record)".

### Per-client deal context

- `deals: RelationshipDealSnapshot[]` — per-deal snapshots (id / name / stage / target close / amount / last activity), sorted by nearest upcoming close first (missing target-close last), then by name.
- `activeDealCount` — `deals.length`.
- `totalAmount` — sum of amount across the client's deals.
- `dealsMissingAmount` — honest count of deals with no parseable amount.

### Attention totals (aggregated across the client's deals)

- `openTaskCount` — open tasks across the client's deals.
- `overdueTaskCount` — subset whose `dueDate` is in the past.
- `outstandingDocumentCount` — documents the bank has asked for that the borrower has not yet delivered.
- `pendingReviewDocumentCount` — received documents past `PENDING_REVIEW_AT_RISK_DAYS = 7` without a reviewer.
- `draftMemoCount` — credit memos in `'draft'` status.
- `closingSoonCount` — deals whose target close is within `CLOSING_SOON_DAYS = 14` days from now.
- `stageAtRiskCount` — deals at or past `STAGE_AGING_AT_RISK_DAYS = 30` days in current stage.

### Timeline anchors

- `mostRecentActivityIso` — max(`lastActivityOn`) across the client's deals (`cr664_loandeals.modifiedon`).
- `nearestUpcomingCloseIso` — min(`targetCloseDate`) where the date is `>= now`. Past target-close dates are ignored for this anchor; they are counted separately by `pastTargetCloseCount` in the Phase 75 PersonalActivitySummary.

## Source fields used

Every field consumed by the derivation already exists on the row shapes the work queue loader produces. No new query is added.

- From the deal (`PipelineDeal` / `cr664_loandeals`):
  - `clientName` — `cr664_clientname`
  - `name` — `cr664_dealname`
  - `stage` — `cr664_stagereferencename`
  - `amount` — `cr664_amount`
  - `targetCloseDate` — `cr664_targetclosedate`
  - `lastActivityOn` — `modifiedon`
  - `stageEntryDate` — `cr664_stageentrydate`
- From the task (`WorkQueueTaskRow` / `cr664_dealtask1`):
  - `dueDate` — `cr664_duedate`
- From the document (`WorkQueueDocumentRow` / `cr664_documentchecklist`):
  - `receivedDate` — `cr664_receiveddate`
- From the memo (`WorkQueueMemoRow` / `cr664_creditmemo1`):
  - `statusKey` — derived from `cr664_status` via the existing memo-status map.

## Grouping logic

Deals are grouped by **normalized client name**:

```
normalize(name) =
  if name == null → MISSING_CLIENT_NAME_KEY
  else trim(name) → collapse-internal-whitespace → lowercase
  if empty after normalization → MISSING_CLIENT_NAME_KEY
```

Two deals naming the borrower as `Acme, LLC` and `  acme,    LLC ` will collapse to the same entry. Two deals naming the borrower as `Acme, LLC` and `Acme LLC` (different punctuation) will be treated as **separate entries**.

This is the limit of "client-name grouped" — the schema has no `cr664_borrower` foreign key on the deal and no verified borrower entity id surfaced by the existing queries. The UI disclaimer states this explicitly:

> "Derived from visible records. Client-name grouped, so two deals naming the borrower differently ('Acme, LLC' vs 'Acme LLC') appear as separate entries. This is a relationship snapshot, not a verified relationship graph, not a household linkage, not a relationship score. No predictive claim. Open the relevant deal to act."

The entry-sort order is also deterministic and source-only:

```
1) attention ordering (overdue tasks * 8 + pending-review * 6 + closing-soon * 4 +
   stage-at-risk * 3 + outstanding-docs * 1), desc
2) most-recent activity, desc
3) missing-name client goes last on tie
4) display name asc
```

The attention-ordering coefficient set is a deterministic sort tie-break — **not** a score and not rendered to the banker. It never leaves the derivation module.

## Limitations (honest)

- **Client-name grouped, not borrower-id grouped.** Two deals naming the same borrower differently appear as separate entries. The schema has no `cr664_borrower` foreign key on deal today; resolving this requires schema work (Lane A or Lane B).
- **No persistent banker notes.** The card is a derivation snapshot. There is no place for the banker to record "what we discussed last call" or "borrower prefers Tuesday morning" — those need either a new entity or a Phase-23-style LOCAL_ONLY clipboard surface. Phase 76 does not introduce one.
- **No conversation/contact history.** Outlook / Teams contact ingestion is Lane E. The most-recent-activity anchor is the deal `modifiedon` only — it surfaces "something on this deal changed" granularity, not "we last spoke to the borrower on date X".
- **No cross-borrower deduplication or household linkage.** Even after a future borrower-entity-id phase, household linkage ("borrower A controls entity B which guarantees deal C") is its own data model.
- **No AI-assisted briefs.** Lane F is not engaged. The card is a count + pill list, not a prose summary.
- **No relationship graph table.** A real graph (`relationship_edge` with edge type / direction / verified-by / effective-date) does not exist. Adding it is a future phase.
- **Snapshot only.** The card is point-in-time. No "what changed since yesterday", no sparkline, no "borrower interaction frequency trend".
- **The data fetch is duplicated.** Like Phase 75, the card calls `loadBankerWorkQueueData` independently; the banker workspace now issues that loader three times (MyWorkQueue + PersonalActivitySummary + RelationshipMemory). A `BankerDataProvider` analogous to `ManagerDataProvider` / `TeamDataProvider` is a future cleanup.

## Why this is not AI relationship intelligence

- **No model is invoked.** The derivation is a pure function over input arrays — no LLM call, no Copilot connector, no embedding lookup, no semantic similarity match.
- **No prose summary is generated.** The card renders counts, pills, and one short disclaimer string. There is no synthesized narrative ("Acme has been quiet for two weeks — consider a check-in") because that would be a prediction; the card is descriptive only.
- **No "next-best-action" surfaced.** The attention ordering is a sort tie-break, not a recommendation. The banker is told to "open the relevant deal to act" — the card does not say "you should call Acme".
- **Source-text static test forbids the vocabulary.** `relationshipMemory.test.ts` asserts the module source never contains: `AI` / `AI-generated` / `relationship score` / `risk score` / `performance rating` / `predictive` / `guaranteed` / `approved` / `rejected` / `relationship graph` / `householding` / `complete relationship profile`.

## Why this is not a full relationship graph

- **No edges are computed.** The data model is a flat list of per-client entries. There is no notion of "client A relates to client B" or "borrower X is also the guarantor on deal Y."
- **No verified borrower entity.** Grouping is by text. Two deals naming `Acme, LLC` and `Acme LLC` are distinct rows — a graph would resolve them via a verified entity id.
- **No relationship-type vocabulary.** There is no concept of "primary borrower" vs "secondary borrower" vs "guarantor" vs "household member". The deal record carries `cr664_clientname` as a free-text field; that is the depth of identity Phase 76 consumes.
- **No persistence.** Anything the banker observes here is recomputed on each load from current records — there is no relationship-edge table to write or query.

## Future upgrade path

The Phase 76 derivation is a stepping stone. The Vibe-expected relationship-memory capability requires the following additions (each a separate future phase):

1. **Verified borrower entity id.** Add `cr664_borrower` foreign key on deal, OR introduce a borrower-id column on `cr664_loandeals` populated by admin. The Phase 76 derivation can then group by `borrowerId` with `clientNameKey` retained as a fallback.
2. **Relationship graph table.** A `relationship_edge` entity (borrower-borrower, borrower-deal, borrower-contact) with `relationshipType` + `verifiedBy` + `effectiveDate` columns. Enables household linkage and "borrower X guarantees deal Y".
3. **Outlook / Teams activity ingestion.** Lane E connector phase. Surfaces last-call / last-email / last-meeting per borrower, not just `cr664_loandeals.modifiedon`.
4. **AI-assisted relationship briefs.** Lane F connector phase. The card would gain an optional "prep brief" that summarizes recent activity in prose; gated behind explicit banker opt-in + a "Copilot brief — review before use" warning.
5. **Cross-deal borrower history.** Persistent banker notes per borrower (new entity `cr664_borrowernote` + governed write). Banker can record "borrower mentioned new entity" or "prefers Tuesday morning" — accrues across deals.
6. **Contact-level interaction history.** A `cr664_contact` entity + connector ingestion (Outlook contacts, Teams chat history) — visible to bankers as "what I know about person Y at borrower X".

## Files created

- `src/shared/relationship/relationshipMemory.ts` — pure derivation primitive (`deriveRelationshipMemory` + `RelationshipMemoryEntry` + `RelationshipMemoryInput` + `MISSING_CLIENT_NAME_KEY` constant).
- `src/shared/relationship/relationshipMemory.test.ts` — 15 derivation + grouping + sort + module-hygiene tests.
- `src/banker/RelationshipMemory.tsx` — banker-side card component.
- `src/banker/RelationshipMemory.test.tsx` — 9 rendered-card tests (loading / failed / empty / single-client / missing-client / grouping / deal-pill-navigation / disclaimer + forbidden-vocab scan / attention sort).
- `docs/PHASE_76_RELATIONSHIP_MEMORY_LITE.md` — this document.

## Files modified

- `src/workspaces/BankerWorkspace.tsx` — mounts `<RelationshipMemory />` in the workspace main between `<MyWorkQueue />` and `<PersonalPipeline />`. Final card order on the banker workspace: Personal Activity Summary → My Work Queue → Relationship Memory → Personal Pipeline.
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.16 advanced from "Not started" to "Partially operational (advanced by Phase 76)"; §1.1 current-state note updated.

## Role surfaces updated

- **Banker:** new `<RelationshipMemory />` card on the command center.
- **Manager:** unchanged.
- **Team:** unchanged.
- **Executive:** unchanged (snapshot-only boundary preserved).
- **Admin:** unchanged.

The Phase 48 isolation guard (`src/shared/governance/dataProviderIsolation.test.ts`) continues to enforce that `src/shared/relationship/` does not import from any role directory. The derivation accepts its input as a structural type (`RelationshipMemoryInput`); the banker workspace passes `BankerWorkQueueData` which satisfies that shape via structural typing.

## Tests added

- 15 derivation tests in `src/shared/relationship/relationshipMemory.test.ts`:
  - empty input → empty array;
  - grouping by normalized client name (case + whitespace insensitive);
  - missing-client fallback (`isClientNameMissing` + `MISSING_CLIENT_NAME_KEY`);
  - display-name picked from first non-empty `clientName` in the group;
  - attention totals (open + overdue tasks, outstanding + pending-review docs, draft memos, closing-soon, stage-at-risk);
  - totalAmount / dealsMissingAmount with NaN handling;
  - most-recent-activity anchor (max across deals);
  - nearest-upcoming-close anchor (min of future target-close dates; past dates ignored);
  - anchors `undefined` when no parseable values exist;
  - per-entry deal-snapshot sort: nearest upcoming close first, missing target-close last, then by name;
  - entry sort order: attention rank desc → most-recent-activity desc → missing-name last → display name asc;
  - module hygiene: no SDK import, no role-dir imports, no AI / score / predictive / approved / householding / "complete relationship profile" / "relationship graph" vocabulary in source.

- 9 card-rendering tests in `src/banker/RelationshipMemory.test.tsx`:
  - loading state;
  - failed state via `role="alert"`;
  - empty state (no active deals);
  - populated single-client snapshot (header counts + pipeline + open-asks line + attention badges + deal pill);
  - missing-client branch renders "(no borrower name on record)";
  - two deals collapse under same normalized client name;
  - clicking a deal pill calls `navigate('/deals/<dealId>')`;
  - conservative disclaimer renders verbatim phrases; rendered DOM does not contain `AI-generated` / `risk score` / `guaranteed` / `approved` / `rejected` / `householding` / `complete relationship profile` / positive uses of `relationship score`;
  - attention-bearing client renders ahead of calm client in the DOM list.

## Confirmation: no writes / schema / AI / score / graph added

- **No new write surface.** No `GOVERNED_WRITES` entry was added.
- **No new `LOCAL_ONLY_FLOWS` entry.** The card is a pure render of already-loaded data; nothing is persisted, nothing is logged.
- **No schema change.** Every field consumed already existed.
- **No AI.** Pure deterministic function. The module-hygiene test forbids the AI / Copilot vocabulary in the source.
- **No relationship score / risk score.** The attention-ordering helper is a sort tie-break that never leaves the module. The rendered DOM never contains "relationship score" or "risk score" as a positive claim.
- **No relationship graph.** Output is a flat per-client list. No edges, no relationship-type vocabulary, no household linkage.

## Test + build counts (at acceptance)

- Full suite: **1251 / 1251 tests passing** (Phase 75 baseline 1227 + Phase 76's 15 derivation + 9 card = 24 new).
- `tsc -b && vite build`: clean.

## Recommended next phase

From the coverage map (still-Partially-operational or Not-wired rows with low-risk in-repo slices):

- **Dark theme tokens** — closes the largest remaining a11y gap (Phase 74 §1.28 named dark theme as the next a11y step). Pure UI phase, no schema, no writes.
- **Persistent banker notes capture (LOCAL_ONLY)** — a Phase-23-style clipboard surface layered on top of the Phase 76 client-keyed view. Banker drafts and copies notes for their own system; no Dataverse write. Stop-gap toward the persistent-notes future phase.
- **Per-deal `Cross-deal context` mini-card** — a Phase 76 sibling that renders inside the Deal Workspace and points to the borrower's other active deals (without leaving the deal). Pure derivation; reuses `deriveRelationshipMemory` filtered to one borrower.

Of the three, **dark theme tokens** is the lowest-risk and closes the most concrete a11y gap. The **per-deal cross-deal context** card has the highest immediate banker value and reuses Phase 76 directly.

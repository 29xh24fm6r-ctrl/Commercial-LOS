# Release Notes — Phases 52 through 55

**Current state as of Phase 55**

- 750 tests passing across 45 test files
- `npm run build` clean
- Bundle ~651 kB minified / ~159 kB gzipped
- **Not production-ready.** The Release Readiness Gate still rolls up to **"Not ready to promote — blockers open"** for the same reason as the Phase 40/51 baselines (Stage Governance schema gap, see [STAGE_PROGRESSION_ENABLEMENT_MAP.md](STAGE_PROGRESSION_ENABLEMENT_MAP.md)). What changed since Phase 51: the document lifecycle is now closed end-to-end in-app (request → mark received → mark reviewed), and one new conservative review-aging signal was added.

Companion docs:
- [RELEASE_NOTES_PHASES_1_40.md](RELEASE_NOTES_PHASES_1_40.md) — historical record up to Phase 40
- [RELEASE_NOTES_PHASES_41_51.md](RELEASE_NOTES_PHASES_41_51.md) — historical record for Phases 41–51 (governance-hardening sequence + first operational expansion since Phase 25)
- [STABILIZATION_CHECKLIST.md](STABILIZATION_CHECKLIST.md) — current pre-promotion checklist
- [CANONICAL_SOURCES.md](CANONICAL_SOURCES.md) — ownership table
- [ENGINEERING_OPERATING_RULES.md](ENGINEERING_OPERATING_RULES.md) — standing rules
- [PHASE_EXECUTION_TEMPLATE.md](PHASE_EXECUTION_TEMPLATE.md) — phase brief + AAR format

---

## Per-phase summary

### Phase 52 — Release Notes + Stabilization Refresh

Pure docs-only checkpoint after the Phases 41–50 governance-hardening
sequence and Phase 51's first operational expansion since Phase 25.

- Created [RELEASE_NOTES_PHASES_41_51.md](RELEASE_NOTES_PHASES_41_51.md)
  with the full per-phase narrative for 41–51, the governance
  architecture matrix, and the first detailed "Current Operational
  State by Role" table.
- Refreshed [STABILIZATION_CHECKLIST.md](STABILIZATION_CHECKLIST.md):
  Phase 40 → Phase 51, test count 347 → 675, file count 33 → 43,
  governed-write count 6 → 7, document workflow rewording, schema
  gap precision (`No File column on cr664_DocumentChecklist`).
- Repositioned [RELEASE_NOTES_PHASES_1_40.md](RELEASE_NOTES_PHASES_1_40.md)
  with a "historical record" banner pointing forward.
- Updated the file-header comment on
  [platformInventory.ts](../src/shared/governance/platformInventory.ts)
  to reflect the Phase 41/43/51 extensions and the Phase 46–50
  regression consumers.

No production code changes. No new write surface. Bundle unchanged.

### Phase 53 — Command Center Document-Receive Integration

Surfaced the Phase 51 mark-received action where bankers actually
start their day — My Work Queue overdue-document rows now expose
an inline **Mark received** button.

- Added an inline action button per overdue-document row in
  [MyWorkQueue.tsx](../src/banker/MyWorkQueue.tsx); click opens
  the existing `ReceiveDocumentModal` directly (no navigation
  required). Stop-propagation guards click + keydown so the row's
  navigation handler does not also fire.
- Extracted a `reload()` callback in MyWorkQueue. Successful
  receive (and governance-partial) triggers a queue reload; the
  resolved row drops out via the existing outstanding filter.
  `receive-failed` and `unknown` do NOT reload (queue state is
  still correct).
- Extended [WorkQueueDocumentRow](../src/banker/workQueueQueries.ts)
  with `requestDate` so the Command Center modal can render
  "Last requested" honestly.
- Extended [WorkQueueItem](../src/banker/workQueue.ts) with optional
  `documentMetadata`; populated only on overdue-document items.
  Presence of the field is the discriminator for "render the
  receive button."

No new governed write. Zero changes to `GOVERNED_WRITES` /
inventory / role boundaries. Manager / team / executive / admin
behavior unchanged.

### Phase 54 — Stale Document Review Signal

A conservative, advisory-only banker reminder: documents that
were marked received but still lack a reviewer past 7 calendar
days now surface as a **pending-review-document** work-queue row
plus a per-row badge in the Deal Workspace Documents card.

- New shared predicate
  [`isReceivedDocumentPendingReview`](../src/shared/workQueue/primitives.ts)
  + `PENDING_REVIEW_AT_RISK_DAYS = 7` constant. Pure derivation
  off `cr664_receiveddate` and `cr664_reviewer`. Signal clears
  automatically when a reviewer is populated.
- Refactored
  [`loadOutstandingDocumentsForDeals`](../src/banker/workQueueQueries.ts)
  into `loadDocumentsAwaitingActionForDeals`. Single Dataverse
  round-trip; splits client-side into `outstandingDocuments` and
  `pendingReviewDocuments`.
- Added `'pending-review-document'` type to `WorkQueueItemType`
  + at-risk-severity derivation in
  [workQueue.ts](../src/banker/workQueue.ts).
- [DealDocuments.tsx](../src/deals/DealDocuments.tsx) gained a
  per-row **"Pending review for 7+ days"** outline badge on
  received-status rows past the threshold, plus a subtitle suffix
  *"· N may require review"* (hidden when zero).

Conservative wording throughout: *"Pending review"*,
*"may require review"*. Never *"overdue review"* / *"approval pending"*
/ *"review failed"*. The 7-day threshold is a banker reminder
cadence, not a regulatory or approval boundary.

At Phase 54 the signal was advisory-only — the schema's
`cr664_reviewer` field had no in-app write path, so bankers had
to edit Dataverse directly to clear it. Phase 55 closed that gap.

### Phase 55 — Governed Document Mark-Reviewed Write

The **eighth** governed write. Closes the minimal document
lifecycle (outstanding → received → reviewed) entirely in-app.
Phase 54's pending-review signal now clears interactively.

- New action
  [`markDocumentReviewed`](../src/deals/documentActions.ts)
  alongside the existing `requestDocument` and
  `markDocumentReceived`. Writes only `cr664_reviewer`
  (banker's display name); preserves received / upload / request
  state. Outcome union `success | review-failed | governance-partial
  | unknown` mirrors Phase 47 exactly. Correlation prefix `'rv'`.
- New [ReviewDocumentModal.tsx](../src/deals/ReviewDocumentModal.tsx).
  Required review note. Explicit "does not approve, accept, or
  validate" disclaimer in the helper line. No file picker
  (same schema gap as Phase 51).
- [DealDocuments.tsx](../src/deals/DealDocuments.tsx) — received
  rows now show a **Mark reviewed** button (banker-only). Received
  group's `canWrite` gate flipped from hard-false to `canWrite` so
  the action can render.
- [MyWorkQueue.tsx](../src/banker/MyWorkQueue.tsx) — pending-review-document
  rows now show a **Mark reviewed** button (banker-only). Same
  reload pattern as Phase 53.
- [DealDataProvider.tsx](../src/deals/DealDataProvider.tsx) — new
  `'after-document-review'` refresh key.
- [platformInventory.ts](../src/shared/governance/platformInventory.ts)
  — `GOVERNED_WRITES` extended with `deal-document-review`
  (Phase 55, banker, emitsAudit + emitsTimeline). Total: 7 → 8.
- 5 governance inventory tests extended.
- Phase 50's "distinct event-type values" invariant relaxed to
  "distinct OR domain-prefixed subtype" — honest evolution since
  `NoteLogged` is now legitimately shared by credit-memo-save and
  deal-document-review, both disambiguated by domain subtype
  (`creditmemo:draft-saved|...` vs `documentchecklist:reviewed|...`).

Audit event: `'DocumentChecklist Reviewed'`, Lifecycle / StatusChange / LoanDeal, fieldname `cr664_reviewer`, beforestate `'Received'`, afterstate `'Reviewed'`. Timeline event: `NoteLogged` with `documentchecklist:reviewed|correlation:<id>` subtype.

Manager / team workspaces remain read-only — no Mark reviewed
button renders. Phase 44 read-only sweep continues to pass.

---

## Current operational document lifecycle (closed in-app)

```
Outstanding ──Request──▶ Outstanding (with requestDate)
                             │
                       (borrower delivers
                        externally)
                             │
                             ▼
                       Mark received  ──▶  Received
                                              │
                                       (banker reads,
                                        no schema event)
                                              │
                                              ▼
                                       Mark reviewed  ──▶  Reviewed
```

| Transition       | Phase | Surfaces                                                                     |
| ---------------- | ----- | ---------------------------------------------------------------------------- |
| Request          | 22    | Deal Workspace → Documents (outstanding rows)                                |
| Mark received    | 51    | Deal Workspace → Documents (outstanding rows)                                |
| Mark received    | 53    | + Banker My Work Queue (overdue-document rows, inline)                       |
| Pending-review   | 54    | Per-row badge + subtitle count on Documents card; new queue row type         |
| Mark reviewed    | 55    | Deal Workspace → Documents (received rows) + My Work Queue (pending-review rows, inline) |

The borrower-side delivery channel (email, file share, etc.) is
still out of band — there is no borrower portal, no binary
upload, no OCR. The lifecycle covers what bankers do INSIDE the
LOS once a document arrives.

---

## Current governed-write inventory (8 entries)

| # | Id | Phase | Domain | Audit | Timeline |
| --- | --- | --- | --- | --- | --- |
| 1 | `data-quality-flag-resolve` | 18 | admin | ✓ | — |
| 2 | `alert-resolve` | 19 | admin | ✓ | — |
| 3 | `alert-dismiss` | 19 | admin | ✓ | — |
| 4 | `deal-task-complete` | 21 | banker (deal-domain) | ✓ | ✓ |
| 5 | `deal-document-request` | 22 | banker (deal-domain) | ✓ | ✓ |
| 6 | `credit-memo-draft-save` | 25 | banker (deal-domain) | ✓ | ✓ |
| 7 | `deal-document-receive` | 51 | banker (deal-domain) | ✓ | ✓ |
| 8 | `deal-document-review` | **55** | banker (deal-domain) | ✓ | ✓ |

---

## Current `NOT_WIRED` inventory (8 entries, unchanged)

Per [platformInventory.ts](../src/shared/governance/platformInventory.ts):
1. `email-delivery` (borrower email)
2. `document-upload` (binary file upload — schema column gap)
3. `ai-generation`
4. `test-coverage-build-verification`
5. `stage-reference-data-source`
6. `stage-ordering-contract`
7. `executive-deal-drillthrough`
8. `admin-deal-drillthrough`

---

## Current `DELIBERATELY_BLOCKED` inventory (1 entry, unchanged)

| Id | Phase | Reason | Enablement map |
| --- | --- | --- | --- |
| `stage-progression-advance` | 28 | Schema does not expose a deterministic next-stage ordering. | [STAGE_PROGRESSION_ENABLEMENT_MAP.md](STAGE_PROGRESSION_ENABLEMENT_MAP.md) |

---

## Current operational state by role

### Banker
**Read** (full deal workspace):
- DealHeader / Summary / Blockers / Tasks / Documents / Credit Memo / Activity Timeline / Borrower Communication
- Banker Command Center: My Work Queue (with inline receive + review actions), Personal Pipeline

**Write** (banker-only governed surfaces):
1. **Complete task** (Phase 21) — Deal Workspace → Tasks
2. **Request document** (Phase 22) — Deal Workspace → Documents
3. **Mark document received** (Phase 51) — Deal Workspace → Documents AND Command Center
4. **Mark document reviewed** (Phase 55) — Deal Workspace → Documents AND Command Center *(new)*
5. **Save credit memo draft** (Phase 25) — Deal Workspace → Credit Memo

**Advisory signals** (no write):
- Pending-review-document on My Work Queue and Documents card (Phase 54)
- Stage progression eligibility panel (Phase 27, read-only)
- Memo freshness signal (Phase 26, "may be stale")

**Local-only flows** (no Dataverse write):
- Borrower update draft → Copy to clipboard (Phase 23)
- Credit memo preview (Phase 24, separate from the Phase 25 governed save)

### Manager and team
**Read** (role-scoped, unchanged):
- Manager (Phase 14, 33, 36): team pipeline, banker workload, closing forecast, at-risk deals, team work queue, deal drill-through **read-only**
- Team (Phase 16, 34, 37): shared pipeline, bottlenecks, document needs, task load, closing calendar, shared work queue, deal drill-through **read-only**

**Write**: **none**. Phases 53/55 added two new button-bearing surfaces (Command Center inline actions, received-row Mark reviewed) on banker-only paths. Manager and team views render the same deal cards with `readOnly={true}` — no Complete / Request / Mark received / Mark reviewed / Save buttons render.

### Executive
**Read** (snapshot-only, unchanged):
- Portfolio Summary, At-Risk Portfolio Summary, Banker Production Rollup, Pipeline by Stage *(transitional)*, Monthly Closing Forecast *(transitional)*

**Write**: **none**. Deal drill-through: **denied** (DealRoute). Snapshot-only is by design (Phase 15).

### Admin
**Read** (unchanged): System Health Summary, Data Quality Flags, Audit Anomalies, Alert Backlog, Refresh Status, Configuration Overview, Stage Governance Diagnostics, Release Readiness Gate, Performance Diagnostics

**Write** (unchanged): Data Quality Flag resolve (Phase 18), Alert resolve/dismiss (Phase 19)

---

## What's operational today (the inside-the-LOS workflow)

- ✅ Request document
- ✅ Mark received
- ✅ Mark reviewed
- ✅ Queue surfacing of overdue and pending-review documents
- ✅ Stale-review advisory signal (Phase 54)
- ✅ Conservative copy + audit + timeline coverage on every write

## What's still NOT_WIRED

- ❌ Binary file upload (no File column on `cr664_DocumentChecklist`)
- ❌ Borrower upload portal (no external client surface)
- ❌ OCR / AI / document intelligence
- ❌ SharePoint sync
- ❌ Teams / Outlook attachment sync
- ❌ Email delivery (borrower-side)
- ❌ Stage progression (schema gap)
- ❌ Executive / admin deal drill-through (denied by design)

---

## Current schema blockers (unchanged from Phase 51)

1. **`Cr664_stagereferences` not registered as a Power Apps data source.** Blocks Phase 28 Advance Stage write.
2. **No sequence/ordering field** on the loan deal record. Same blocker.
3. **No `StageAdvanced` enum value** on `cr664_DealTimelineEvent.cr664_eventtype`.
4. **No File column on `cr664_DocumentChecklist`.** Blocks true binary upload.
5. **No borrower email entity / draft entity** in the generated schema.
6. **No snapshot entities for `PipelineByStage` and `MonthlyClosingForecast`.**

New schema candidate (not blocking; would sharpen Phase 54):
7. **No `cr664_revieweddate` column.** The Phase 55 reviewer write
   stamps `cr664_reviewer` but the schema has no timestamp anchor for
   the review event. Adding the column would let the Phase 54 signal
   anchor on review elapsed time instead of receipt elapsed time, and
   would enable "reviewed N days ago" dashboards. Phase 55 does not
   assume this column — the action writes `cr664_reviewer` only — so
   adding the column later is a small additive write change.

---

## Test count progression

| Milestone | Total tests | Delta from prior |
| --- | --- | --- |
| Phase 51 (deal-document-receive) | 675 | — |
| Phase 52 (release notes + checklist refresh) | 675 | 0 (docs-only) |
| Phase 53 (Command Center receive integration) | 685 | +10 |
| Phase 54 (stale-review signal) | 703 | +18 |
| Phase 55 (deal-document-review) | **750** | +47 |

Bundle progression: ~622 kB (Phase 51 pre-deal-document-receive) →
634 (Phase 51) → 636 (Phase 53) → 637 (Phase 54) → **651** (Phase 55).
The growth since Phase 51 is the second governed-write modal + the
inline action buttons on two new surfaces.

---

## Production-readiness posture (unchanged at the gate level)

**Honest summary:** the platform is still **NOT production-ready**
for any workflow that depends on:
- Stage progression (deliberately blocked)
- Binary document upload (schema-blocked)
- Borrower email delivery (not wired)
- AI-driven anything (not wired)
- Cross-team manager visibility (out of scope by design)

The platform **IS** ready in the operational-discipline sense for
the **eight** shipped governed writes. The full document lifecycle
inside the LOS is now closed end-to-end with audit + timeline
coverage on every transition.

The Release Readiness Gate continues to report the overall rollup
as **"Not ready to promote — blockers open"** because of the
stage-progression schema gap. Phases 52–55 did not change that
posture; they added one shipped capability (Phase 55) and one
advisory signal (Phase 54) under the existing blockers.

See [STABILIZATION_CHECKLIST.md](STABILIZATION_CHECKLIST.md) for the
current pre-promotion checklist.

# Operational Handoff Brief — Commercial Lending Code App

**As of Phase 59 (the end of the current stabilization / productization arc).**

This document is the single-page handoff for stakeholders, the
schema team, and any engineer picking up the work. It summarizes
what's operational, what's not, what to demo, and what would have
to land upstream to unlock the next significant capability.

Detail lives in the canonical docs — this brief points at them.

| Need | Doc |
| --- | --- |
| Per-phase narrative (latest)         | [RELEASE_NOTES_PHASES_52_55.md](RELEASE_NOTES_PHASES_52_55.md)        |
| Live pre-promotion checklist         | [STABILIZATION_CHECKLIST.md](STABILIZATION_CHECKLIST.md)              |
| Stitched workflow + test map         | [PHASE_59_BANKER_JOURNEY.md](PHASE_59_BANKER_JOURNEY.md)              |
| Canonical ownership of every concern | [CANONICAL_SOURCES.md](CANONICAL_SOURCES.md)                          |
| Document upload schema blocker       | [PHASE_51_DOCUMENT_UPLOAD_SCOPE.md](PHASE_51_DOCUMENT_UPLOAD_SCOPE.md) |
| Stage progression unblock checklist  | [STAGE_PROGRESSION_ENABLEMENT_MAP.md](STAGE_PROGRESSION_ENABLEMENT_MAP.md) |

---

## TL;DR

The Commercial Lending Code App is **operationally usable for the
banker daily workflow** (request → receive → review documents,
complete tasks, save credit-memo drafts, full audit + timeline
visibility). It is **NOT production-ready** today because of three
known upstream blockers (binary document upload, stage progression,
borrower email delivery) that require Dataverse schema work outside
the app.

- **784 tests passing**, 46 test files, build clean
- **8 governed writes**, all with end-to-end audit + timeline
  emission and regression-pinned discipline
- **One stitched banker journey** verified by 34 static-source
  stitching assertions ([Phase 59](PHASE_59_BANKER_JOURNEY.md))
- **3 schema-side asks** would each unlock significant new capability

---

## Banker journey demo script

A live demo takes ~10 minutes on a deal that already has at least
one outstanding document and one open task. The exact step-by-step
checklist with assertions lives in
[PHASE_59_BANKER_JOURNEY.md §Manual smoke-test checklist](PHASE_59_BANKER_JOURNEY.md);
this section is the talking-points version.

1. **Open `/banker`.** Banker Command Center loads. Point to My
   Work Queue: scoped to the banker's assigned deals only, never
   "all data."
2. **Scan the queue.** Show an `overdue-document` row with the
   inline **Mark received** button. Show a `pending-review-document`
   row (if available) with **Mark reviewed** inline. Both Phase 53
   and Phase 55 surfaces are reachable without leaving the queue.
3. **Open a deal** from a row. Show the full deal workspace —
   header, summary, blockers, stage-progression panel (read-only),
   tasks, documents, credit memo, activity timeline, borrower
   communication. All nine cards mount under one `DealDataProvider`.
4. **Request a document.** Documents card → outstanding row →
   **Request** → modal opens → type a request note → submit. The
   request date stamps in-place. **Show the new event appear in the
   Activity Timeline live** — this is the audit/timeline coordination
   in action.
5. **Mark received.** Same row → **Mark received** → note → submit.
   Row flips Outstanding → Received in-place. Timeline shows a
   `DocumentUploaded` event.
6. **Mark reviewed.** Received row → **Mark reviewed** → note →
   submit. Row flips Received → Reviewed. Timeline shows a
   `NoteLogged` event with subtype `documentchecklist:reviewed`. The
   Phase 54 *Pending review* badge (if it was showing) clears
   automatically.
7. **Complete a task.** Tasks card → open row → **Complete** →
   note → submit. Row moves to Recently completed. Timeline shows
   `TaskCompleted`.
8. **Save a memo draft.** Credit Memo card → **Generate Draft
   Preview** → step through → **Save Draft** → note → submit.
   New memo + section drafts appear. Timeline shows `NoteLogged`
   with subtype `creditmemo:draft-saved`.
9. **Close on the Activity Timeline.** All five just-emitted events
   appear newest-first with banker name, banker-friendly source
   labels ("Document", "Task", "Credit memo" — never raw schema
   identifiers), and the banker's note as summary. This is the
   audit trail; every governed write has been captured.

The whole flow is **banker-only by construction** — manager and
team workspaces render the same cards in read-only mode (no
buttons), executive and admin are denied at the route layer.

---

## What's operationally live (capabilities)

| Capability                                | Phase | Surfaces                              |
| ----------------------------------------- | ----- | ------------------------------------- |
| Data quality flag resolve                 | 18    | Admin Workspace                       |
| Alert resolve / dismiss                   | 19    | Admin Workspace                       |
| Complete task                             | 21    | Deal Workspace → Tasks                |
| Request document                          | 22    | Deal Workspace → Documents            |
| Mark document received                    | 51    | Deal Workspace + My Work Queue inline |
| Mark document reviewed                    | 55    | Deal Workspace + My Work Queue inline |
| Save credit memo draft                    | 25    | Deal Workspace → Credit Memo          |
| Borrower update draft → Copy to clipboard | 23    | Deal Workspace (local-only)           |
| Credit memo preview (deterministic)       | 24    | Deal Workspace (local-only)           |
| My Work Queue (overdue + pending-review)  | 32/53/54 | Banker Command Center              |
| Pending-review stale signal (advisory)    | 54    | Documents card + My Work Queue        |
| Manager / Team read-only deal access      | 36/37 | Respective workspaces                 |
| Executive snapshot dashboard              | 15    | Executive Workspace                   |
| Admin diagnostics + Release Readiness Gate| 17/30 | Admin Workspace                       |

Every governed write follows the same coordination shape:
discriminated outcome union, single correlation id, audit emission,
timeline emission (deal-domain), conservative governance-partial
copy on partial failure. Discipline is regression-pinned by the
Phase 46–50 inventory sweeps; the banker journey itself is
regression-pinned by Phase 59.

---

## Current governed writes (8 entries)

| # | Id                          | Phase | Domain               | Audit | Timeline |
| - | --------------------------- | ----- | -------------------- | ----- | -------- |
| 1 | `data-quality-flag-resolve` | 18    | admin                | ✓     | —        |
| 2 | `alert-resolve`             | 19    | admin                | ✓     | —        |
| 3 | `alert-dismiss`             | 19    | admin                | ✓     | —        |
| 4 | `deal-task-complete`        | 21    | banker (deal-domain) | ✓     | ✓        |
| 5 | `deal-document-request`     | 22    | banker (deal-domain) | ✓     | ✓        |
| 6 | `credit-memo-draft-save`    | 25    | banker (deal-domain) | ✓     | ✓        |
| 7 | `deal-document-receive`     | 51    | banker (deal-domain) | ✓     | ✓        |
| 8 | `deal-document-review`      | 55    | banker (deal-domain) | ✓     | ✓        |

Source of truth: `GOVERNED_WRITES` in
[src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts).

---

## Known NOT_WIRED capabilities

These are deliberately out of scope and surface honestly in the app
(Release Readiness Gate marks each row "Not Wired"; the
`NOT_WIRED` inventory carries the reason):

| Capability                            | Why                                                              |
| ------------------------------------- | ---------------------------------------------------------------- |
| Binary document upload                | No File column on `cr664_DocumentChecklist` (see schema blockers) |
| Borrower email delivery               | No Outlook/Graph integration; no borrower-email entity in schema  |
| Borrower upload portal                | No external client surface; out of scope                          |
| AI / OCR / document intelligence      | No model calls in app; Phase 24 generator is deterministic        |
| SharePoint / Teams / Outlook sync     | No external system integration                                    |
| Executive `/deals/:id` drill-through  | Snapshot-only by design (Phase 15)                                |
| Admin `/deals/:id` drill-through      | Separate governance decision required                             |
| Test / build verification in-app      | By design — verified out-of-band before promotion                 |
| Cross-team manager visibility         | Manager scoped to single team via `_cr664_team_value`             |

One additional capability is **DELIBERATELY_BLOCKED**:

| Capability                | Phase | Blocker                                                                 |
| ------------------------- | ----- | ----------------------------------------------------------------------- |
| Stage progression (Advance Stage write) | 28 | Schema does not expose a deterministic next-stage ordering; see [STAGE_PROGRESSION_ENABLEMENT_MAP.md](STAGE_PROGRESSION_ENABLEMENT_MAP.md) |

---

## Schema blockers

The app cannot solve these — they are upstream Power Apps /
Dataverse changes. Each is currently a "not yet" answer with a
clear unblock path.

### Blocking
1. **`Cr664_stagereferences` not registered as a Power Apps data source.** Blocks the Phase 28 Advance Stage write. Phase 43 enablement map sequences the full unblock.
2. **No sequence / ordering field** on the loan deal record or system settings. Same blocker.
3. **No `StageAdvanced` enum value** on `cr664_DealTimelineEvent.cr664_eventtype`. Required for the future Advance Stage timeline emission.
4. **No File column on `cr664_DocumentChecklist`.** Blocks true binary document upload. Phase 51 ships the metadata-only Mark-received path; binary requires this column.
5. **No borrower email entity / draft entity** in the generated schema. Phase 23 stays local-only until this lands.
6. **No snapshot entities for `PipelineByStage` and `MonthlyClosingForecast`.** Two executive cards remain on the transitional operational-fallback adapter.

### Non-blocking (would sharpen existing capability)
7. **No `cr664_revieweddate` column** on `cr664_DocumentChecklist`. Phase 55 stamps `cr664_reviewer` only; adding a timestamp would let the Phase 54 pending-review signal anchor on review time and enable a "reviewed N days ago" cadence.

---

## Manual smoke-test checklist (pre-promotion)

The Phase 46–50 governance regression sweeps + the Phase 59
stitching tests guarantee structural integrity at build time. The
following runtime checks should be the last gate before any
operational deployment.

Pre-flight:
- [ ] `npm run build` clean
- [ ] `npm test -- --run` — full suite green (currently **784/784**, **46 test files**)
- [ ] Banker test account has at least one assigned active deal
      with at least one outstanding document AND one open task

Live journey (full detail in
[PHASE_59_BANKER_JOURNEY.md](PHASE_59_BANKER_JOURNEY.md)):
- [ ] Banker Command Center loads at `/banker`, work queue shows
- [ ] Inline **Mark received** appears on overdue-document rows
- [ ] Inline **Mark reviewed** appears on pending-review-document rows
- [ ] Deal workspace mounts all 9 cards
- [ ] Request → Mark received → Mark reviewed sequence works
      on one document; each transition reflects immediately in
      the row AND in the Activity Timeline
- [ ] Complete task sequence works; appears in timeline
- [ ] Save credit memo draft sequence works; appears in timeline
- [ ] Manager / Team workspaces render documents WITHOUT
      Request / Mark received / Mark reviewed / Save buttons
- [ ] Executive and Admin `/deals/<id>` URLs are denied
- [ ] Admin Workspace → Release Readiness Gate shows the expected
      Blocked (Stage Governance) and Not Wired (test/build,
      transitional executive cards) rows

If any item above behaves unexpectedly, **do not promote**.

---

## Promotion caveats

The Release Readiness Gate today rolls up to **"Not ready to
promote — blockers open"** for one reason: the stage-progression
schema gap is still open. This is honest and expected. The gate's
specific signals:

| Category                                  | Today's state               |
| ----------------------------------------- | --------------------------- |
| Workspace isolation                       | Ready                       |
| Permission-before-query                   | Ready                       |
| Executive snapshot safety                 | Needs Review (transitional fallback features still in place) |
| Admin diagnostics health                  | Ready                       |
| Governed write coverage                   | Ready (8/8 disciplined)     |
| Stage progression readiness               | **Blocked** (schema gap)    |
| Data quality / alert backlog              | Ready                       |
| Test coverage / build verification        | Not Wired (by design)       |

The gate's overall verdict will remain "Not ready to promote" until
either the stage-progression schema work lands (Phase 43 sequence)
or stakeholders accept Advance Stage as deliberately out of scope.

---

## Recommended next schema asks (prioritized)

If the schema team has bandwidth, these three additions would each
unlock significant new capability with the app-side downstream work
already ready and tested.

### Priority 1 — File column on `cr664_DocumentChecklist`
- **Unlocks:** true binary document upload (currently the most-cited
  "almost works" gap; bankers can mark received but cannot upload
  through the app)
- **App-side ready:** the `@microsoft/power-apps` SDK has
  `uploadFileToRecord` ready; Phase 51 modal can grow a file picker
- **Unblock work:** add a File column (e.g. `cr664_filedocument`),
  regenerate the SDK, add a new `deal-document-upload` governed
  write in `documentActions.ts` following the Phase 51 pattern.
  Full breakdown in
  [PHASE_51_DOCUMENT_UPLOAD_SCOPE.md §7](PHASE_51_DOCUMENT_UPLOAD_SCOPE.md).

### Priority 2 — Stage progression schema (3 columns / values)
- **Unlocks:** Advance Stage governed write (currently
  DELIBERATELY_BLOCKED)
- **App-side ready:** Phase 41 stage catalog + Phase 43 enablement
  map; the entire app-side sequence is documented and ready to
  implement on top of the schema
- **Unblock work:** register `Cr664_stagereferences` as a Power Apps
  data source, add a sequence / ordering field on the deal record,
  add a `StageAdvanced` enum value on
  `cr664_DealTimelineEvent.cr664_eventtype`. Phase 43 sequences
  these as Phases A through H. Full breakdown in
  [STAGE_PROGRESSION_ENABLEMENT_MAP.md](STAGE_PROGRESSION_ENABLEMENT_MAP.md).

### Priority 3 — `cr664_revieweddate` column on `cr664_DocumentChecklist`
- **Unlocks:** sharper Phase 54 pending-review signal; "reviewed
  N days ago" cadence; honest review-elapsed-time dashboards
- **App-side ready:** Phase 55 `markDocumentReviewed` action would
  write both `cr664_reviewer` and `cr664_revieweddate` in the same
  governed update — a single-line change once the column exists
- **Unblock work:** add the DateTime column, regenerate the SDK.
  Lowest-effort upstream change of the three.

---

## What this brief is NOT

- **Not a feature roadmap.** Feature work resumes only when an
  upstream blocker lifts (schema work) or stakeholders adjust scope.
- **Not a marketing document.** The honest-blockers framing is
  deliberate — the Release Readiness Gate is the source of truth
  for what's actually shippable.
- **Not a complete history.** Per-phase narratives live in the
  three release-notes documents (1–40, 41–51, 52–55).

---

## Closing the arc

After Phase 59 the stabilization / productization arc is complete:

- Governance discipline pinned end-to-end across 8 governed writes
  (Phases 46–50 + Phase 59 stitching)
- Document lifecycle closed entirely in-app
  (Phases 51 / 53 / 54 / 55)
- Banker daily workflow proven coherent
  (Phase 59 + this brief)
- Honest production-readiness posture documented at every layer

Future phases should be either (a) schema-driven (Priority 1–3
above) or (b) explicitly stakeholder-requested feature work. Further
hardening for its own sake will not move the platform forward — the
guardrails are in place.

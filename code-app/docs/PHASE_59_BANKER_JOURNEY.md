# Phase 59 — Banker Journey Operational Readiness

Status: **Journey is structurally sound.** Every step in the daily
banker workflow is wired, authorized, and refresh-stitched. The
[bankerJourneyStitching.test.ts](../src/shared/governance/bankerJourneyStitching.test.ts)
sweep (34 tests) pins the wiring as a regression invariant; this
doc is the human-readable companion + manual smoke-test checklist.

No code changes in this phase. No new features, no new writes, no
schema work. Just verification — the platform actually works as a
coherent banker tool, not just as separate components.

---

## The journey

The daily banker path, end-to-end:

```
open banker workspace            ─┐
review work queue                 │  Banker Command Center
                                  ─┘
open deal                        ─┐
request document                  │
mark received                     │  Deal Workspace
mark reviewed                     │
complete task                     │
save memo draft                   │
                                  ─┘
confirm timeline / audit events   ─── Activity Timeline (in deal)
```

Five governed deal-domain writes drive the lifecycle transitions
(Phases 21, 22, 25, 51, 55). Two of them (Mark received, Mark
reviewed) are reachable from BOTH the Deal Workspace AND the Banker
Command Center work queue, so the banker doesn't have to navigate
into the deal for every action.

---

## Step-by-step trace

| # | Step                          | Entry point                                    | Authorization                                  | Action                          | Refresh key                              | Audit event                       | Timeline event                                                  |
| - | ----------------------------- | ---------------------------------------------- | ---------------------------------------------- | ------------------------------- | ---------------------------------------- | --------------------------------- | --------------------------------------------------------------- |
| 1 | Open banker workspace         | `BankerWorkspace.tsx`                          | `BankerProvider` resolves Banker + systemuser  | —                               | —                                        | —                                 | —                                                               |
| 2 | Review work queue             | `MyWorkQueue.tsx`                              | banker-scoped via `loadBankerPipeline` two-step| (inline receive / review)       | `reload()` after success / partial       | —                                 | —                                                               |
| 3 | Open deal                     | `DealRoute.tsx` → banker case                  | `loadDealForBanker(dealId, bankerId)`          | —                               | —                                        | —                                 | —                                                               |
| 4 | Request document              | `DealDocuments.tsx` → `RequestDocumentModal`   | `systemUserId` gate                            | `requestDocument(...)` (Ph 22)  | `'after-document-request'`               | `DocumentChecklist Requested`     | `DocumentRequested` (788190009), subtype `correlation:<id>`     |
| 5 | Mark received                 | `DealDocuments.tsx` OR `MyWorkQueue.tsx` → `ReceiveDocumentModal` | `systemUserId` gate            | `markDocumentReceived(...)` (Ph 51) | `'after-document-receive'` (or queue reload) | `DocumentChecklist Received`   | `DocumentUploaded` (788190010), subtype `correlation:<id>`      |
| 6 | Mark reviewed                 | `DealDocuments.tsx` OR `MyWorkQueue.tsx` → `ReviewDocumentModal` | `systemUserId` + `fullName`    | `markDocumentReviewed(...)` (Ph 55)| `'after-document-review'` (or queue reload) | `DocumentChecklist Reviewed`    | `NoteLogged` (788190002), subtype `documentchecklist:reviewed\|correlation:<id>` |
| 7 | Complete task                 | `DealTasks.tsx` → `CompleteTaskModal`          | `systemUserId` gate                            | `completeTask(...)` (Ph 21)     | `'after-task-complete'`                  | `DealTask Completed`              | `TaskCompleted` (788190005), subtype `correlation:<id>`         |
| 8 | Save memo draft               | `CreditMemo.tsx` → `CreditMemoDraftModal`      | `systemUserId` gate                            | `saveCreditMemoDraft(...)` (Ph 25) | `'after-credit-memo-draft-saved'`     | `CreditMemoDraft Saved`           | `NoteLogged` (788190002), subtype `creditmemo:draft-saved\|correlation:<id>` |
| 9 | Confirm timeline / audit      | `ActivityTimeline.tsx` (consumes `activity`)   | DealDataProvider scope                         | —                               | refreshed by steps 4–8                   | (renders steps 4–8 audit trail)   | (renders steps 4–8 timeline events newest-first)                |

---

## Stitching invariants pinned by the test

[`bankerJourneyStitching.test.ts`](../src/shared/governance/bankerJourneyStitching.test.ts)
asserts 34 invariants across six categories:

1. **BankerDealWorkspace mounts every operational card** — DealHeader,
   DealSummary, DealBlockers, DealStageProgressionCard, DealTasks,
   DealDocuments, CreditMemo, ActivityTimeline, BorrowerCommunication.
   Each is imported and used in JSX. The workspace wraps them in
   `<DealDataProvider>` and authorizes via `loadDealForBanker` before
   any child mounts.

2. **DealDataProvider exposes a refresh key per governed deal-domain
   write** — all five `'after-X'` keys are in the `DealDataKey` union
   AND have a case in the `refresh()` switch. The `reloadActivity()`
   call count in the switch is ≥5, so every governed write's audit /
   timeline emission is reflected in the ActivityTimeline immediately
   after the action resolves.

3. **Every operational write surface mounts its modal and wires the
   right action** — five (parent file, modal, action) tuples:
   - `DealTasks.tsx` ↔ `CompleteTaskModal` ↔ `completeTask`
   - `DealDocuments.tsx` ↔ `RequestDocumentModal` ↔ `requestDocument`
   - `DealDocuments.tsx` ↔ `ReceiveDocumentModal` ↔ `markDocumentReceived`
   - `DealDocuments.tsx` ↔ `ReviewDocumentModal` ↔ `markDocumentReviewed`
   - `CreditMemo.tsx` ↔ `CreditMemoDraftModal` ↔ `saveCreditMemoDraft`

4. **MyWorkQueue surfaces both Phase 53 (receive) and Phase 55 (review)
   inline actions** — both modals + both actions are imported and
   mounted; the receive button is gated on `systemUserId`; the row
   logic handles both `'overdue-document'` and `'pending-review-document'`
   types.

5. **DealRoute banker case mounts `BankerProvider` + `BankerDealWorkspace`** —
   both imports are present; both JSX tokens appear in the file.
   Structural wrapping is also covered by `DealRoute.test.tsx`
   (Phase 38).

6. **ActivityTimeline consumes `activity` via `useDealData()`** — the
   link between writes (step 4–8) and the audit-visible event
   surface (step 9). Without this, refreshed activity would never
   reach the UI.

---

## Test coverage map

Existing tests that exercise each step:

| Step | Test file(s)                                                                                                                        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `loadDealForBanker.test.ts` (auth); `DealRoute.test.tsx` (banker case mount)                                                        |
| 2    | `MyWorkQueue.test.tsx` (queue rendering, inline action dispatch, reload behavior); `workQueue.test.ts` (derivation)                 |
| 3    | `DealRoute.test.tsx` (dispatch matrix); `loadDealForBanker.test.ts` (assigned-banker match)                                         |
| 4    | `documentActions.test.ts` (`requestDocument` action contract); `RequestDocumentModal.test.tsx` (modal flow)                          |
| 5    | `documentActions.test.ts` (`markDocumentReceived`); `ReceiveDocumentModal.test.tsx`; `MyWorkQueue.test.tsx` (Phase 53 integration)   |
| 6    | `documentActions.test.ts` (`markDocumentReviewed`); `ReviewDocumentModal.test.tsx`; `MyWorkQueue.test.tsx` (Phase 55 integration)    |
| 7    | `dealTaskActions.test.ts`; `CompleteTaskModal.test.tsx`                                                                              |
| 8    | `creditMemoActions.test.ts`; `CreditMemoDraftModal.test.tsx`; `creditMemoDraft.test.ts` (generator); `creditMemoFreshness.test.ts`  |
| 9    | The Phase 49 + 50 inventory sweeps verify every governed write emits the expected audit + timeline payload.                          |

Plus the stitching layer added by this phase:
[`bankerJourneyStitching.test.ts`](../src/shared/governance/bankerJourneyStitching.test.ts).

---

## Stitching gaps

**None found.** The Phase 59 audit specifically checked:

- Does `'after-document-review'` reload the activity timeline so the
  `NoteLogged|documentchecklist:reviewed` event appears immediately?
  → **Yes.** `case 'after-document-review'` in DealDataProvider's
  switch calls both `reloadDocuments()` and `reloadActivity()`.

- Does `'after-document-receive'` reload documents AND activity, so
  the row flips Outstanding → Received AND the
  `DocumentUploaded` event appears?
  → **Yes.** Same dispatch pattern.

- Does `'after-credit-memo-draft-saved'` reload creditMemo AND
  activity?
  → **Yes.** The freshness badge also re-derives.

- Are there silently stale cards — cards that consume data but
  never refresh on a write?
  → **None.** DealBlockers, DealStageProgressionCard, and
  BorrowerCommunication all consume their dependencies through
  `useDealData()` and re-derive on every refresh.

---

## Manual smoke-test checklist

The static stitching test guarantees the wiring is correct. A dev
should run this checklist on a live dev server before any
operational promotion to verify the journey **actually feels right**
in the browser. This is the runtime complement to the static test.

Pre-flight:
- [ ] `npm run build` clean
- [ ] `npm test -- --run` — full suite green (currently 784 / 784)
- [ ] App connects to Dataverse; the banker has at least one
      assigned active deal with one outstanding document and one
      open task

The journey:

1. **Open banker workspace** (`/banker`)
   - [ ] Loading state appears briefly, then BankerWorkspace renders
   - [ ] MyWorkQueue card shows; subtitle reads "Scoped to your active deals."
   - [ ] If the banker has urgent items, work-queue rows appear; overdue documents show **Mark received** inline; pending-review documents show **Mark reviewed** inline

2. **Review the queue**
   - [ ] Each row shows: severity dot, title, severity badge, type chip, reason, deal name, date
   - [ ] Footer mentions "Mark received / Mark reviewed inline"

3. **Open a deal** (click a queue row OR navigate to `/deals/<id>`)
   - [ ] Loading state appears, then BankerDealWorkspace renders
   - [ ] DealHeader, DealSummary, DealBlockers, DealStageProgressionCard, DealTasks, DealDocuments, CreditMemo, ActivityTimeline, BorrowerCommunication all appear
   - [ ] If the banker lacks systemuserid, the "Complete disabled" / "Request disabled" / "Save disabled" banners appear on the respective cards (this is the read-only fallback path)

4. **Request document** (Documents card → outstanding row → **Request**)
   - [ ] Modal opens with the document name + Outstanding badge
   - [ ] Type a request note → **Record request** button enables
   - [ ] Submit → success outcome panel reads "Document request stamped; audit and timeline events recorded."
   - [ ] Close modal → Documents card subtitle count updates; row's Requested date is now today
   - [ ] ActivityTimeline shows a new event: title = doc name, badge = `DocumentRequested`

5. **Mark received** (Documents card → outstanding row → **Mark received**)
   - [ ] Modal opens with the document name + Outstanding badge
   - [ ] Helper line says "Metadata-only … no binary upload occurs in this phase."
   - [ ] Type a receipt note → **Mark received** enables
   - [ ] Submit → success outcome panel reads "Document marked received; audit and timeline events recorded."
   - [ ] Close modal → row moves from Outstanding to Received in-place
   - [ ] ActivityTimeline shows a new event: badge = `DocumentUploaded`
   - [ ] Subtitle count updates

6. **(Wait 7 days OR manually advance the receivedDate)** to surface the pending-review signal
   - [ ] Received row's badge area shows **Pending review** (outline, at-risk variant). Hover shows the threshold tooltip
   - [ ] Documents card subtitle suffix shows "· 1 may require review"
   - [ ] MyWorkQueue (after refresh) shows a `pending-review-document` row with **Mark reviewed** inline

7. **Mark reviewed** (Documents card → received row → **Mark reviewed**, OR MyWorkQueue inline)
   - [ ] Modal opens with the document name + Received badge + reviewer name (the banker's display name) in the summary
   - [ ] Helper line includes "does not approve, accept, or validate the contents"
   - [ ] Type a review note → **Mark reviewed** enables
   - [ ] Submit → success outcome panel reads "Document reviewed; audit and timeline events recorded."
   - [ ] Close modal → row moves Received → Reviewed in-place; Pending review badge disappears
   - [ ] ActivityTimeline shows a new event: badge = `NoteLogged`, subtype chip = `documentchecklist:reviewed|correlation:<id>`

8. **Complete task** (Tasks card → open row → **Complete**)
   - [ ] Modal opens with the task title + due date
   - [ ] Type a completion note → **Complete task** enables
   - [ ] Submit → success outcome panel; row moves Open → Recently completed
   - [ ] ActivityTimeline shows a new event: badge = `TaskCompleted`

9. **Save memo draft** (Credit Memo card → **Generate Draft Preview**)
   - [ ] Modal opens with generated sections
   - [ ] Step through to Save Draft; type a save note → **Save credit memo draft** enables
   - [ ] Submit → success outcome panel reads "Memo draft saved (memo + N section draft(s)); audit and timeline events recorded."
   - [ ] Close modal → Credit Memo card shows the new memo + section drafts; freshness badge re-derives
   - [ ] ActivityTimeline shows a new event: badge = `NoteLogged`, subtype chip = `creditmemo:draft-saved|correlation:<id>`

10. **Confirm timeline + audit emissions are coherent** (ActivityTimeline card)
    - [ ] All five new events (request, receive, review, task complete, memo save) appear newest-first
    - [ ] Each event row has: severity dot, title, type badge (with eventTypeKey on hover), summary (the banker's note), When (relative + absolute), By (banker's name; "System" appears italic for system-generated events), Source (Document / Task / Credit memo / etc., banker-friendly label)

If any of those steps surfaces an unexpected behavior, **do not
promote**. The stitching test will fail loud at build time if a
structural wiring issue is introduced; the manual checklist is the
last-mile gut-check.

---

## What this phase did NOT introduce

- No new functionality
- No new writes (`GOVERNED_WRITES` still 8 entries)
- No new permissions
- No schema work
- No `NOT_WIRED` / `DELIBERATELY_BLOCKED` changes
- No copy changes
- No new shared primitives or modals
- No dependencies

Just a new stitching test + this audit doc. The journey was already
sound; Phase 59 captured that as a regression-pinned invariant so
future feature work cannot silently break the daily banker
workflow without a loud test failure.

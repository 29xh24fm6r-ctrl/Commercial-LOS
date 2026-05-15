# Phase 70 — Stale Pending-Review Escalation

**Phase posture.** `governed write`. Adds the 11th
`GOVERNED_WRITES` entry (`deal-document-review-task-create`) — a
banker-initiated, human-confirmed governed write that creates a
self-assigned follow-up review task from the Phase 54
pending-review signal. No portal, no upload, no email send, no
AI, no Teams, no automation, no schema work.

**Vibe capability mapped (per Phase 69 coverage map).**
Closes the Lane A "Stale Pending-Review Escalation" slot of
capability §1.17 ("Deal autopilot — derivation-only slice") AND
extends capability §1.3 ("Document workflow"). Converts an
existing read-only signal into a tracked, banker-actioned
artifact without touching the upstream blockers for portal /
upload / AI / Teams.

Related canonical sources:
- [src/deals/dealTaskActions.ts](../src/deals/dealTaskActions.ts) — `createDocumentReviewTask` (new) + the existing Phase 21 `completeTask`
- [src/deals/CreateDocumentReviewTaskModal.tsx](../src/deals/CreateDocumentReviewTaskModal.tsx) — confirmation UI
- [src/deals/DealDocuments.tsx](../src/deals/DealDocuments.tsx) — pending-review row trigger
- [src/banker/MyWorkQueue.tsx](../src/banker/MyWorkQueue.tsx) — work-queue row trigger
- [src/shared/workQueue/primitives.ts](../src/shared/workQueue/primitives.ts) — `isReceivedDocumentPendingReview` (Phase 54 signal source)
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — `GOVERNED_WRITES.deal-document-review-task-create`
- [PHASE_54_STALE_REVIEW_SIGNAL.md](RELEASE_NOTES_PHASES_41_51.md) and [PHASE_55_DOCUMENT_REVIEW.md](RELEASE_NOTES_PHASES_41_51.md) — adjacent context (the Phase 54 signal this phase actions, and the Phase 55 mark-reviewed write this phase complements)
- [MICROSOFT_VIBE_CAPABILITY_COVERAGE.md](MICROSOFT_VIBE_CAPABILITY_COVERAGE.md) — Phase 69 coverage map this phase advances

---

## 1. Trigger / signal source

The Phase 54 predicate `isReceivedDocumentPendingReview` returns
true for documents that are:

- received (`cr664_receiveddate` set), AND
- not yet reviewed (`cr664_reviewer` empty), AND
- past `PENDING_REVIEW_AT_RISK_DAYS` (7 calendar days).

That signal already surfaces in two banker-visible places:

1. **Deal Workspace Documents card** — received rows render a
   "Pending review" badge.
2. **My Work Queue (banker)** — receives a
   `pending-review-document` row type. Phase 55 already gave that
   row a "Mark reviewed" action.

Phase 70 adds a SIBLING action to both surfaces: "Create review
task". The two actions are complementary, not redundant — see §3.

## 2. Action behavior

When a banker clicks "Create review task" on a pending-review row,
the `CreateDocumentReviewTaskModal` opens with:

- the document's name + received date prominently displayed,
- the proposed task title shown verbatim
  (`Follow up on document review: <document name>`),
- the assignee identified as the banker (self-assigned — see §4),
- a **required follow-up note** field (mirrors the Phase 22 / 51 /
  55 modal pattern; the note is the banker's stated reason for
  deferring the review),
- a **duplicate-task hint** (best-effort; see §6).

On confirm, `createDocumentReviewTask` runs:

1. **Create the task** on `cr664_dealtask1s` with:
   - `cr664_taskname` = `"Follow up on document review: <document name>"`,
   - `cr664_completed` = `false`,
   - `cr664_AssignedTo@odata.bind` = `/systemusers(<bankerId>)` (the
     schema requires this field; self-assign is the only honest
     value at Phase 70),
   - `cr664_Deal@odata.bind` = `/cr664_loandeals(<dealId>)`.
2. **Emit an audit row** (`cr664_AuditEvent`):
   - `cr664_auditeventname` = `"DealTask Created"`,
   - `cr664_eventtype` = `AssignmentChange` (788190002),
   - `cr664_relatedentitytype` = `'cr664_documentchecklist'`,
   - `cr664_relatedentityid` = the document id,
   - `cr664_LoanDeal@odata.bind` = the deal,
   - `cr664_notes` = `"Follow-up review task created for document <name>. Assigned to <bankerName or self>. Note: <follow-up note>"`,
   - `cr664_beforestate` = `"No follow-up review task"`,
   - `cr664_afterstate` = `"Follow-up review task created"`.
3. **Emit a timeline row** (`cr664_DealTimelineEvent`):
   - `cr664_eventtype` = `TaskCreated` (788190004),
   - `cr664_eventsubtype` = `correlation:<correlationId>` (bare —
     TaskCreated is unique to this write in the timeline schema),
   - `cr664_summary` = `"Follow-up review task created for "<name>". Note: <follow-up note>"`,
   - `cr664_visibilityscope` = `BankerAndManager`.

The outcome union is the Phase 47 canonical four-branch shape:

```
type CreateDocumentReviewTaskOutcome =
  | { kind: 'success'; taskId: string }
  | { kind: 'task-create-failed'; taskError: string }
  | {
      kind: 'governance-partial';
      taskId: string;
      auditError: string | undefined;
      timelineError: string | undefined;
    }
  | { kind: 'unknown'; message: string };
```

Correlation prefix: `'rt'` (review-task).
Source-screen process strings:
- `DealWorkspace/DealDocuments/create-review-task` for both
  surfaces. (The audit row carries this label regardless of
  whether the banker clicked from the Deal Workspace or the work
  queue. The two surfaces share the same action; the audit
  fidelity of the entry point would require a separate
  surface-identifier column that does not exist in the audit
  schema.)

## 3. UI behavior

### Deal Workspace Documents card

On any received row carrying the Phase 54 pending-review badge,
the `Create review task` button renders **alongside** the existing
Phase 55 `Mark reviewed` button. The pair gives the banker a
binary choice on the row:

- **Mark reviewed** — Phase 55 governed write; stamps
  `cr664_reviewer`; clears the pending-review signal.
- **Create review task** — Phase 70 governed write; creates a
  self-assigned task; the document row is unchanged; the
  pending-review signal STAYS until Mark reviewed eventually
  fires.

The two actions are deliberately not mutually exclusive. A banker
may create a review task today (to schedule the review on Friday)
and Mark reviewed on Friday once the review is done.

### My Work Queue (banker)

Same pair on the `pending-review-document` row type. Clicking
either button stops row click-propagation so the row doesn't
navigate to the deal. The `Mark reviewed` and `Create review
task` buttons sit side-by-side in the row's action area.

### Read-only surfaces (manager / team)

Neither button renders. `Mark reviewed` was already banker-only
via `canWrite` (Phase 36); `Create review task` uses the same
gate (`canWrite && pendingReview`). Manager + team workspaces
mount the cards with `readOnly={true}`, which suppresses every
write surface on those cards by construction.

### After success

- Deal Workspace → `refresh('after-document-review-task-create')`
  reloads `tasks` (so the new task appears in the open-tasks list)
  and `activity` (so the TaskCreated timeline event surfaces).
  The document checklist row is unchanged.
- My Work Queue → the queue reloads. The pending-review row does
  NOT drop out (Phase 70 does not stamp `cr664_reviewer` — that
  would be a Phase 55 action). The reload is purely a state-
  coherence step.

## 4. Schema limitations (documented honestly)

`cr664_dealtask1s` has **no document foreign key**. The schema
column list is `taskname / completed / duedate / producttype /
AssignedTo / Deal / state + name fields`. There is no
`cr664_DocumentChecklist@odata.bind`-style column on the task
entity.

Phase 70 carries the document linkage in three places, none of
which is a true foreign key:

1. The task title (banker-readable: `"Follow up on document
   review: <doc name>"`).
2. The audit row's `cr664_relatedentitytype` +
   `cr664_relatedentityid` (recorded as `cr664_documentchecklist`
   + the document id).
3. The timeline row's `cr664_relatedentitytype` +
   `cr664_relatedentityid` (same).

This means:

- **Task cleanup after Mark reviewed** does not happen
  automatically. If a banker creates a review task and then later
  Marks Reviewed, the open task stays open until the banker
  explicitly completes it via the Phase 21 complete-task action.
  That's banker-judgment territory: maybe the task tracked a
  broader review than just stamping `cr664_reviewer`. The Phase
  70 brief explicitly forbids automation; we honor that.
- **Cross-task duplicate detection** is title-substring only (see
  §6).
- **Future schema work** (if Lane G or an adjacent phase adds a
  `cr664_RelatedDocument@odata.bind` column on `cr664_dealtask1s`)
  would let Phase 70 carry a proper foreign key. That would
  enable automatic task cleanup on Mark reviewed and tighter
  duplicate detection. Until then, the title + audit/timeline
  related-entity fields are the linkage.

## 5. Self-assign only (Phase 70 scope)

`cr664_dealtask1s.cr664_AssignedTo@odata.bind` is REQUIRED by
schema. The Phase 70 modal does NOT expose an assignee picker —
the banker creating the task is also the assignee. Rationale:

- The signal is local to the banker's own work queue. Reassigning
  to a different banker would imply a routing decision that
  needs a separate governance shape (per-deal banker assignment
  rules; team-level escalation policy; etc.).
- "Self-assign" is the smallest honest motion that closes the
  Phase 54 signal into a tracked action without inventing
  routing.

A future phase that wants to enable banker-to-banker reassignment
would add an assignee picker AND a separate
`deal-document-review-task-reassign` governed write. Phase 70
intentionally stops short.

## 6. Duplicate-task behavior

Best-effort title-substring match against the deal's open tasks.

- **In the Deal Workspace** — `DealDataProvider` already loads
  `tasks.open`. The modal receives this list as `openTasks` and
  iterates: if any open task's title (lower-cased) contains the
  document's name (lower-cased), the modal renders a soft hint
  pointing at the matching task. The banker may proceed anyway.
- **In the My Work Queue surface** — the queue does NOT carry
  per-deal open-tasks data, so the modal receives `openTasks=[]`
  and the hint never surfaces. The Phase 70 brief explicitly
  authorized this limitation ("If duplicate detection is not
  feasible: document limitation; keep copy clear").

The hint copy is intentionally soft ("An open task **may** already
cover this document") because the heuristic produces both false
positives (a task named "Personal Financial Statement — sent to
manager" matches but isn't a review task) and false negatives (a
task named "PFS follow-up review" does NOT match the substring
"Personal Financial Statement"). Hard deduplication is not
achievable until a schema-side document foreign key lands.

## 7. Audit / timeline behavior

Phases 46–50 disciplines apply automatically; Phase 70's
inventory mappings extend each sweep with a row for
`deal-document-review-task-create`:

- **Phase 46 correlation id**: prefix `'rt'`; generated exactly
  once per action invocation; stamped on the audit row and
  embedded in the timeline row's subtype as `correlation:<id>`.
- **Phase 47 outcome union**: four canonical branches; same
  shape as the rest of the deal-domain writes; `success` carries
  the new `taskId`; `governance-partial` carries `taskId +
  auditError + timelineError`; `task-create-failed` carries the
  primary-failure reason; `unknown` carries `message`.
- **Phase 49 audit payload**: every required field present.
  Event name `"DealTask Created"`; field name
  `cr664_taskname`; before/after states populated honestly;
  notes carry the document name + banker name + follow-up note.
  `cr664_LoanDeal@odata.bind` present (deal-domain write).
- **Phase 50 timeline payload**: every required field present.
  Event type `TaskCreated` (788190004); subtype is bare
  `correlation:<id>`; summary action-oriented (no "review failed"
  / "escalation" / "compliance" / "approved" / "accepted" /
  "cleared" wording — pinned by tests).

## 8. Role boundaries

| Role | Can see pending-review signal | Can create review task |
|---|---|---|
| Banker | Yes (Deal Workspace + MyWorkQueue) | Yes |
| Manager | Yes (Deal Workspace, read-only) | No (manager view is `readOnly=true`) |
| Team | Yes (Deal Workspace, read-only) | No (team view is `readOnly=true`) |
| Executive | N/A (no deal drillthrough) | N/A |
| Admin | N/A (no deal drillthrough) | N/A |

The manager and team workspaces are at `Phase 36 / 37` read-only
posture — Phase 70 preserves this exactly. The same `readOnly`
prop that suppresses Phase 22 Request / Phase 51 Mark received /
Phase 55 Mark reviewed also suppresses the Phase 70 Create
review task button.

## 9. What this phase does NOT automate

Per the brief's explicit constraint ("no automation without
banker confirmation; human-initiated only"), Phase 70 does NOT:

- Auto-create review tasks when a document crosses the
  pending-review threshold.
- Auto-assign to anyone other than the banker who clicked the
  button.
- Auto-route to a different banker / manager / team.
- Auto-escalate based on severity, due date, or any other
  signal.
- Auto-complete the new task when Mark reviewed later fires.
- Auto-bypass duplicate detection.
- Send any email, push notification, Teams message, or alert.
- Touch the credit memo, the borrower record, or any
  governance metadata outside the audit + timeline pair.

Every motion in Phase 70 requires an explicit banker click
followed by a banker-typed follow-up note.

## 10. Phase 70 AAR

**Files created**
- [src/deals/CreateDocumentReviewTaskModal.tsx](../src/deals/CreateDocumentReviewTaskModal.tsx) — local confirmation modal.
- [src/deals/CreateDocumentReviewTaskModal.test.tsx](../src/deals/CreateDocumentReviewTaskModal.test.tsx) — 10 UI assertions.
- [docs/PHASE_70_STALE_REVIEW_ESCALATION.md](PHASE_70_STALE_REVIEW_ESCALATION.md) — this document.

**Files modified**
- [src/deals/dealTaskActions.ts](../src/deals/dealTaskActions.ts) — added `createDocumentReviewTask` (with Phase 46/47/49/50-disciplined audit + timeline emission).
- [src/deals/dealTaskActions.test.ts](../src/deals/dealTaskActions.test.ts) — added 14 Phase 70 assertions (happy path, input validation, task-create-failed, governance-partial, correlation discipline).
- [src/deals/DealDocuments.tsx](../src/deals/DealDocuments.tsx) — added the Create-review-task trigger on received pending-review rows; threaded `onCreateReviewTask` through Body → Group → DocumentRow; mounts `CreateDocumentReviewTaskModal`; uses the new `after-document-review-task-create` refresh key.
- [src/deals/DealDataProvider.tsx](../src/deals/DealDataProvider.tsx) — added the `after-document-review-task-create` refresh key.
- [src/banker/MyWorkQueue.tsx](../src/banker/MyWorkQueue.tsx) — added the Create-review-task trigger on pending-review-document rows; threaded `onCreateReviewTask` through Row; mounts `CreateDocumentReviewTaskModal` with `openTasks=[]` (queue surface doesn't load per-deal task data).
- [src/banker/MyWorkQueue.test.tsx](../src/banker/MyWorkQueue.test.tsx) — extended module mocks for `dealTaskActions` + `CreateDocumentReviewTaskModal`.
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — added `GOVERNED_WRITES.deal-document-review-task-create` (Phase 70).
- [src/shared/governance/platformInventory.test.ts](../src/shared/governance/platformInventory.test.ts) — updated the count assertion to 11; updated the Phase 67 GOVERNED_WRITES count assertion; added a Phase 70 anchor describe block.
- [src/shared/governance/correlationIdDiscipline.test.ts](../src/shared/governance/correlationIdDiscipline.test.ts) — added Phase 70 mapping (`'rt'` prefix; `dealTaskActions.ts` file).
- [src/shared/governance/outcomeUnionDiscipline.test.ts](../src/shared/governance/outcomeUnionDiscipline.test.ts) — added Phase 70 mapping (`CreateDocumentReviewTaskOutcome` / `task-create-failed`).
- [src/shared/governance/auditPayloadDiscipline.test.ts](../src/shared/governance/auditPayloadDiscipline.test.ts) — added Phase 70 mapping (`DealTask Created` / deal-domain).
- [src/shared/governance/timelinePayloadDiscipline.test.ts](../src/shared/governance/timelinePayloadDiscipline.test.ts) — added Phase 70 mapping (`TIMELINE_EVENT_TYPE_TASK_CREATED` / 788190004 / bare subtype).
- [src/admin/ReleaseReadinessGate.test.tsx](../src/admin/ReleaseReadinessGate.test.tsx) — updated the Phase 68 count assertion from 10 → 11.
- [src/deals/readOnlyDealCards.test.tsx](../src/deals/readOnlyDealCards.test.tsx), [src/deals/bankerWriteSurfaceAvailable.test.tsx](../src/deals/bankerWriteSurfaceAvailable.test.tsx), [src/deals/preAuthChildQueryGuard.test.tsx](../src/deals/preAuthChildQueryGuard.test.tsx) — extended the transitive-mock surface to include `createDocumentReviewTask` + `CreateDocumentReviewTaskModal`.

**Vibe capability advanced**
- §1.17 Deal autopilot — derivation-only slice (the Phase 54 signal now has a tracked-action outcome).
- §1.3 Document workflow — banker can now defer-and-track a review without leaving the pending-review state.

**Governed-write registration status**
- 10 → 11. `deal-document-review-task-create` ships as the 11th `GOVERNED_WRITES` entry.

**UI surfaces updated**
- Deal Workspace Documents card — received pending-review rows now show a `Create review task` button alongside the existing `Mark reviewed` button (banker-only).
- My Work Queue (banker) — `pending-review-document` rows now show a `Create review task` button alongside the existing `Mark reviewed` button.
- Manager / Team workspaces — unchanged (readOnly suppresses both write buttons).

**Schema limitations**
- `cr664_dealtask1s` has no document foreign key. Document linkage carried via task title + audit/timeline `cr664_relatedentitytype` + `cr664_relatedentityid`.
- Task cleanup after Mark reviewed is not automatic. The banker explicitly completes the open task via the Phase 21 `completeTask` flow.
- Self-assign only; no banker-to-banker reassignment.

**Duplicate-task behavior**
- Deal Workspace: best-effort title-substring match against `openTasks` from `useDealData()`. Hint is advisory; banker may proceed.
- My Work Queue: hint not surfaced (queue doesn't carry per-deal task data).

**Tests added/updated**
- 14 action contract tests (`dealTaskActions.test.ts`).
- 10 modal UI tests (`CreateDocumentReviewTaskModal.test.tsx`).
- 4 inventory-driven sweep mappings extended (correlationId / outcomeUnion / auditPayload / timelinePayload).
- 2 platformInventory.test.ts assertions added.
- 1 ReleaseReadinessGate.test.tsx count assertion updated.
- 3 transitive-mock test files extended with the new module mocks.
- 1 MyWorkQueue.test.tsx module mock extended.

**Confirmations**
- No automation without banker action. Every task creation requires a banker click + a banker-typed follow-up note.
- No portal added.
- No upload added.
- No email send added.
- No AI added.
- No Teams integration added.
- No schema work (no new columns, no SDK regeneration).
- No stage progression changes.
- Manager + Team workspaces remain read-only.
- `GOVERNED_WRITES` count increased from 10 to 11 (the Phase 70 brief authorized this specifically).
- All Phase 46/47/49/50 inventory-driven discipline sweeps pass with the new write mapped.
- Phase 65 borrower-portal structural sweep still green (no new path matches forbidden patterns).
- Phase 68 Capability Inventory render updates correctly to show 11 governed writes.

**Test / build counts**
- 1038 → 1085 tests passing (+47 Phase 70 assertions: 14 action + 10 modal + 4 inventory sweeps + 2 inventory anchors + 17 spread across the other mapping / count / mock updates).
- Build clean.

**Recommended next phase**
- **Phase 71 — Per-banker / per-team derived analytics** (Lane A item #2 from the Phase 69 coverage map). Closes capability §1.19 (Performance scoring) + §1.22 (Manager workspace analytics) without schema or admin work; pure derivation from `cr664_loandeals` rows. Next-largest Vibe-coverage delta per unit of in-repo work.
- Alternative: **Phase 71 — Activity-since-last-visit (rule-based)** if leadership prefers the activity-intelligence slice first.

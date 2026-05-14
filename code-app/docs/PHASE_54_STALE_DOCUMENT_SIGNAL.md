# Phase 54 — Stale Document Review Signal

Status: **Advisory only.** A conservative banker-facing reminder that a
document marked received has sat unreviewed past a threshold. No new
write. No new entity. No workflow automation. No approval semantics.

Related canonical sources:
- [src/shared/workQueue/primitives.ts](../src/shared/workQueue/primitives.ts) — `PENDING_REVIEW_AT_RISK_DAYS`, `isReceivedDocumentPendingReview`
- [src/banker/workQueueQueries.ts](../src/banker/workQueueQueries.ts) — loader (now splits into outstanding + pendingReview)
- [src/banker/workQueue.ts](../src/banker/workQueue.ts) — `pending-review-document` derivation
- [src/banker/MyWorkQueue.tsx](../src/banker/MyWorkQueue.tsx) — surfacing
- [src/deals/DealDocuments.tsx](../src/deals/DealDocuments.tsx) — per-row tag + subtitle count

---

## 1. The signal

A document checklist row qualifies for the **pending-review** signal
when **all three** of the following hold:

1. `cr664_receiveddate` is set (the row is in the "received" status
   per the Phase-51 deriveStatus rules — either marked received by
   the banker via Phase 51's modal, or arrived via upstream upload
   with `cr664_uploadstatus = true`).
2. `cr664_reviewer` is empty or whitespace-only.
3. The elapsed time since `cr664_receiveddate` is **at least
   `PENDING_REVIEW_AT_RISK_DAYS` (= 7) calendar days**.

The signal clears the moment a banker writes `cr664_reviewer` (the
only field the schema offers as evidence that a review actually
happened).

Severity: **at-risk** — the same tier as stale-stage and
memo-review reminders. Below `overdue` (used for documents past
their request due date), above `upcoming`.

---

## 2. Banker surfaces

| Surface                               | What appears                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **My Work Queue** (banker dashboard)  | A new row of type `pending-review-document` with the badge **Pending review** and the reason *"Received N day(s) ago … may require review."* |
| **Deal Workspace → Documents card**   | Each received row past the threshold renders a small outline badge **"Pending review for 7+ days"** next to the Received date. |
| **Documents card subtitle**           | When ≥1 received row is pending review, the existing counts line appends *"· N may require review"*. Hidden when zero.        |

The signal does **not** appear on:
- Manager / team / executive / admin work queues — those have their
  own derivation rules and remain read-only for receive-state
  semantics
- The banker's `PersonalPipeline` card — pipeline-level summary;
  document-row signals are scoped to the work queue
- Any external system

---

## 3. Conservative wording rationale

The platform has standing conservative-copy rules (Phase 45). The
Phase 54 signal complies with them:

| Allowed wording                          | Forbidden wording                                |
| ---------------------------------------- | ------------------------------------------------ |
| *"Pending review"*                       | *"Overdue review"* — implies a missed deadline    |
| *"May require review"*                   | *"Approval pending"* — Buddy does no approval   |
| *"Pending review for 7+ days"*           | *"Review failed"* — there is no formal failure  |
| *"Banker reminder"* (in this doc)        | *"Stale upload"* — schema has no upload anyway  |
| *"Advisory only"*                        | *"Compliance violation"* — out of scope         |

The receipts that anchor the signal (`cr664_receiveddate`) are
*timestamps*, not *deadlines*. There is no agreed window for review
documented anywhere in the schema or the LOS workflow. The 7-day
threshold is a banker reminder cadence, not a regulatory or
approval boundary.

The reason text in the work queue is intentionally factual:
*"Received N day(s) ago on '<deal>' — may require review."* Bankers
can act, or not act, on their own judgment. The signal does not
escalate; it does not page anyone; it does not write back to
Dataverse.

---

## 4. Distinction between received vs reviewed

| State            | Schema condition                                                | Status               | UI signal              |
| ---------------- | --------------------------------------------------------------- | -------------------- | ---------------------- |
| Outstanding      | no `cr664_receiveddate`, no `cr664_reviewer`, not uploaded      | `outstanding`         | overdue-document (if past due) |
| Received         | `cr664_receiveddate` set OR `cr664_uploadstatus = true`, no `cr664_reviewer` | `received`            | pending-review-document (if past threshold) |
| Reviewed         | `cr664_reviewer` non-empty                                      | `reviewed`            | no signal              |

The Phase 51 `markDocumentReceived` write transitions Outstanding →
Received. There is **no Phase 54 write** to transition Received →
Reviewed. The schema's `cr664_reviewer` field is the only marker
of review, and Phase 54 introduces no UI / action to populate it.
A future phase could add a Mark-reviewed governed write — see §6.

---

## 5. Current limitations

- **No `cr664_revieweddate` column.** The schema records only WHO
  reviewed (`cr664_reviewer`), not WHEN. The signal anchors on
  `cr664_receiveddate` because that's the only available
  elapsed-time reference. If a banker reviews early in the window
  but doesn't update `cr664_reviewer` until day 8, the signal
  fires anyway — the schema doesn't carry enough information to
  distinguish.
- **No way to clear without writing `cr664_reviewer`.** The
  banker's only way to silence the signal today is to populate
  the reviewer field — which currently has no in-app write path.
  The banker can populate it via Power Apps / Dataverse directly.
  This is the most acute follow-up gap (see §6).
- **Single threshold.** The 7-day window is fixed in shared
  primitives. Different deal types or document types might
  warrant different windows; we don't model that.
- **No business-day awareness.** 7 *calendar* days, not business
  days. Same convention as Phase 32's other thresholds.
- **No bulk review.** The signal is per-row; no aggregate action.
- **Refresh is per-banker.** The signal recomputes when the
  banker's MyWorkQueue reloads (Phase 53 reload, or
  page-refresh). Other bankers' or managers' queries don't push
  updates.

---

## 6. Future schema improvements

The signal is honest about what it can derive from current state.
Two upstream improvements would make it sharper:

1. **Add `cr664_revieweddate` (DateTime) to `cr664_DocumentChecklist`.**
   Anchor the signal on review-or-current-state elapsed time
   instead of receipt time. Would also enable a "reviewed N days
   ago" cadence and a true Mark-reviewed write.
2. **Add a `Mark reviewed` governed write.** Inside the app,
   alongside the Phase 51 Mark-received write. Sets both
   `cr664_reviewer` and `cr664_revieweddate`. Follows the
   established three-write coordination pattern (update + audit +
   timeline). Phase 51 left the in-app review path explicitly
   out of scope; closing it would complete the document
   lifecycle (outstanding → received → reviewed) entirely
   in-app.

Neither requires changes to the receive flow — the signal model
keeps working even if Mark-reviewed never ships.

---

## 7. What did NOT change

- `GOVERNED_WRITES` is unchanged. Still 7 entries.
- No new audit event, no new timeline event.
- No new permission boundary. Manager / team / executive / admin
  workspaces are untouched.
- No new entity. No schema change.
- No automated escalation, no borrower notification, no AI review
  logic.
- The Phase 51 mark-received flow is unchanged. The receive button
  on outstanding documents (Deal Workspace and Command Center)
  works exactly as before.
- The Phase 46–50 inventory-driven regression sweeps continue to
  pass — Phase 54 did not add a governed write; the inventory
  is identical.

# Phase 55 — Governed Document Mark-Reviewed Write

Status: **Operational.** The minimal document lifecycle
(outstanding → received → reviewed) is now closed entirely in-app.
The Phase 54 pending-review signal clears automatically the moment
a banker stamps the reviewer.

Related canonical sources:
- [src/deals/documentActions.ts](../src/deals/documentActions.ts) — `markDocumentReviewed`
- [src/deals/ReviewDocumentModal.tsx](../src/deals/ReviewDocumentModal.tsx)
- [src/deals/DealDocuments.tsx](../src/deals/DealDocuments.tsx) — Mark reviewed button on received rows
- [src/banker/MyWorkQueue.tsx](../src/banker/MyWorkQueue.tsx) — Mark reviewed button on pending-review-document rows
- [src/deals/DealDataProvider.tsx](../src/deals/DealDataProvider.tsx) — `'after-document-review'` refresh key
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — `GOVERNED_WRITES.deal-document-review`

---

## 1. Workflow lifecycle (closed)

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

Phase 22 shipped Request. Phase 51 shipped Mark received. Phase 53
surfaced Mark received in the Command Center. Phase 54 added the
pending-review signal for received-but-unreviewed documents. Phase
55 closes the lifecycle with Mark reviewed — the final transition
the current schema supports.

---

## 2. What the write changes

A single Dataverse field on a single row:

| Field                | Before        | After                       |
| -------------------- | ------------- | --------------------------- |
| `cr664_reviewer`     | empty / null  | banker's full name (text)   |

The action does NOT touch:
- `cr664_receiveddate` — preserved
- `cr664_uploadstatus` — preserved (still untouched since Phase 51)
- `cr664_requestdate` — preserved
- any other column on the row

The status transition is derived. The existing `deriveStatus`
helper in `dealDocumentQueries.ts` flips the row Received →
Reviewed off `cr664_reviewer` presence alone. No status enum, no
state machine column — just one text field.

Phase 54's `isReceivedDocumentPendingReview` predicate keys off
the same field; the pending-review signal clears the moment the
write completes.

---

## 3. What the write does NOT mean

- **It is NOT approval.** The modal copy explicitly says "This
  records that you reviewed the document — it does not approve,
  accept, or validate the contents."
- **It is NOT a content judgment.** The note flows verbatim to
  the audit trail and timeline summary; the action makes no claim
  about what the document contains.
- **It is NOT underwriting.** Underwriting is a separate domain.
- **It is NOT decisioning.** There is no decision recorded.
- **It is NOT a compliance check.** No compliance state column
  exists in the schema; the write makes no compliance claim.
- **It is NOT a binary upload.** Same schema gap as Phase 51 —
  no File column. The review captures the banker's identity, not
  any file content.

---

## 4. Audit and timeline behavior

Identical to the Phase 22 / 51 contract pinned by Phases 46–50.

### Audit event (`cr664_AuditEvent`)

| Field                                | Value                                              |
| ------------------------------------ | -------------------------------------------------- |
| `cr664_auditeventname`               | `'DocumentChecklist Reviewed'`                     |
| `cr664_eventcategory`                | `Lifecycle` (788190002)                            |
| `cr664_eventtype`                    | `StatusChange` (788190001)                         |
| `cr664_entitytype`                   | `LoanDeal` (788190000)                             |
| `cr664_entityid`                     | document checklist id                              |
| `cr664_outcomestatus`                | `Succeeded` (788190000) / `Failed` (788190001)     |
| `cr664_correlationid`                | new uuid per attempt (prefix `'rv'` in fallback)   |
| `cr664_fieldname`                    | `'cr664_reviewer'`                                 |
| `cr664_oldvalue` / `cr664_newvalue`  | `''` / banker's display name                       |
| `cr664_beforestate`                  | `'Received'`                                       |
| `cr664_afterstate`                   | `'Reviewed'`                                       |
| `cr664_notes`                        | banker's review note (verbatim)                    |
| `cr664_LoanDeal@odata.bind`          | `/cr664_loandeals(${dealId})`                      |
| `cr664_ChangedBy@odata.bind`         | `/systemusers(${systemUserId})`                    |
| `cr664_ActorUser@odata.bind`         | `/systemusers(${systemUserId})`                    |
| `cr664_sourcescreensourceprocess`    | `'DealWorkspace/DealDocuments/review'`             |

### Timeline event (`cr664_DealTimelineEvent`)

| Field                                | Value                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `cr664_eventtype`                    | `NoteLogged` (788190002)                                                    |
| `cr664_title`                        | document name                                                               |
| `cr664_summary`                      | banker's review note (verbatim)                                             |
| `cr664_visibilityscope`              | `BankerAndManager` (788190000)                                              |
| `cr664_eventsubtype`                 | `` `documentchecklist:reviewed|correlation:${correlationId}` ``             |
| `cr664_Deal@odata.bind`              | `/cr664_loandeals(${dealId})`                                               |
| `cr664_EventBy@odata.bind`           | `/systemusers(${systemUserId})`                                             |

Note on the `NoteLogged` enum value: the option set has no
dedicated `DocumentReviewed`. We share `NoteLogged` (the same
generic bucket credit-memo save uses) and disambiguate via the
domain-prefixed `cr664_eventsubtype`. The Phase 50 timeline
discipline test allows this — same event-type value across two
writes is permitted when both carry a domain-prefixed subtype.

### Outcome union (Phase 47 contract)

```ts
type MarkDocumentReviewedOutcome =
  | { kind: 'success' }
  | { kind: 'review-failed'; docError: string }
  | { kind: 'governance-partial'; auditError: string | undefined; timelineError: string | undefined }
  | { kind: 'unknown'; message: string };
```

---

## 5. Role boundaries

| Role      | Mark reviewed available?                                  |
| --------- | --------------------------------------------------------- |
| Banker    | **Yes** — Deal Workspace Documents card (received rows) AND My Work Queue (pending-review-document rows). Both surfaces share the same governed action. |
| Manager   | No — workspace remains read-only (Phase 36 / 44).         |
| Team      | No — workspace remains read-only (Phase 37 / 44).         |
| Executive | No — deal route denies; snapshot-only (Phase 15).         |
| Admin     | No — deal route denies (Phase 17).                        |

The action requires `systemUserId` to be present (per the
standard banker write convention). If absent, the button does not
render — same gate Phase 51 and Phase 53 use.

Manager and team workspaces continue to render the received row
in read-only mode (no button). The Phase 44 read-only sweep
covers this at the import-graph level — manager and team modules
do not import `markDocumentReviewed` or `ReviewDocumentModal`.

---

## 6. Remaining binary-upload blocker (unchanged)

Phase 55 does NOT touch the binary upload gap. The schema still has
no File column on `cr664_DocumentChecklist`; `NOT_WIRED.document-upload`
remains. The Phase 51 scope doc continues to describe the precise
schema work required:
[PHASE_51_DOCUMENT_UPLOAD_SCOPE.md](PHASE_51_DOCUMENT_UPLOAD_SCOPE.md).

---

## 7. Future schema improvement: `cr664_revieweddate`

The Phase 54 scope doc identified the natural next schema addition:
a `cr664_revieweddate` (DateTime) column on
`cr664_DocumentChecklist`. It would let us:

- Show "Reviewed N days ago" instead of just "Reviewer: M. Paller"
- Build review-cadence dashboards
- Distinguish stale review activity from never-reviewed
- Anchor any future stale-review-flag derivation on the actual
  review timestamp instead of receipt timestamp

Phase 55 does NOT introduce or assume this column. The action sets
only `cr664_reviewer`. When the schema team adds `cr664_revieweddate`,
the action would write both fields in the same governed update —
no other code change required.

---

## 8. Governed-write inventory change

| Layer                             | Phase 54 → Phase 55                        |
| --------------------------------- | ------------------------------------------ |
| `GOVERNED_WRITES.length`          | 7 → **8**                                  |
| `NOT_WIRED.document-upload`       | unchanged (binary upload still blocked)    |
| `DELIBERATELY_BLOCKED`            | unchanged (1 entry: stage progression)     |
| `LOCAL_ONLY_FLOWS`                | unchanged (2 entries)                      |
| Phase 46 correlation discipline   | extended (new prefix `'rv'`)               |
| Phase 47 outcome union discipline | extended (new `MarkDocumentReviewedOutcome`) |
| Phase 49 audit payload discipline | extended (new event name)                  |
| Phase 50 timeline payload discipline | extended; "distinct event types" invariant relaxed to "distinct OR domain-prefixed subtype" |

The Phase 50 invariant change is the only governance evolution. The
relaxation is honest: the option set is finite, and `NoteLogged` is
the right shared bucket for write-types the schema doesn't model
as dedicated enums. Domain prefixes (`creditmemo:draft-saved|...`
and `documentchecklist:reviewed|...`) keep the timeline disambiguated.

---

## 9. UI surfaces

### Deal Workspace → Documents card

- Outstanding rows: **Request** + **Mark received** buttons (Phase 22 + 51)
- Received rows: **Mark reviewed** button (new in Phase 55). The
  Phase 54 "Pending review for 7+ days" badge continues to render
  for stale rows.
- Reviewed rows: no action buttons (terminal state).

Subtitle continues to show counts: `N outstanding · M received · K
reviewed` (and the Phase 54 "· N may require review" suffix when
relevant).

### Banker Command Center → My Work Queue

- `overdue-document` rows: **Mark received** button (Phase 53)
- `pending-review-document` rows: **Mark reviewed** button (new)

Both inline actions share the same reload mechanism — successful
write triggers a queue refetch; the resolved row drops out because
the loader's filter (no reviewer + no receivedDate for outstanding;
no reviewer for pending-review) no longer matches.

---

## 10. Tests added

- 9 action tests in [documentActions.test.ts](../src/deals/documentActions.test.ts)
- 8 modal tests in [ReviewDocumentModal.test.tsx](../src/deals/ReviewDocumentModal.test.tsx)
- 7 queue integration tests in [MyWorkQueue.test.tsx](../src/banker/MyWorkQueue.test.tsx)
- Inventory updates across 5 governance discipline tests
  (platformInventory, correlationId, outcomeUnion, auditPayload,
  timelinePayload)
- Phase 50 "distinct event types" invariant relaxed to
  "distinct-or-domain-prefixed-subtype" — same regression-pinning
  strength, but consistent with the new shared-NoteLogged pattern.

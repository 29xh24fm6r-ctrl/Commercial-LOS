# Phase 51 — Document Upload Scope (honest)

Status: **Metadata-only governed write shipped. Binary file upload is still NOT wired.**

This document is the honest record of what Phase 51 does and does not
deliver, the exact schema blocker for true binary upload, and the
minimum upstream work required to unblock it.

Related canonical sources:
- `GOVERNED_WRITES.deal-document-receive` in [platformInventory.ts](../src/shared/governance/platformInventory.ts)
- `NOT_WIRED.document-upload` (still blocked) in [platformInventory.ts](../src/shared/governance/platformInventory.ts)
- [src/deals/documentActions.ts](../src/deals/documentActions.ts) — `markDocumentReceived(...)`
- [src/deals/ReceiveDocumentModal.tsx](../src/deals/ReceiveDocumentModal.tsx)

---

## 1. What is operational now

A new governed write — **`deal-document-receive`** — ships in Phase 51.
It is the smallest production-useful slice of the document workflow.

### Banker experience

On the Deal Workspace's **Documents** card, every outstanding-status
row now shows two action buttons (banker only):

| Button         | Phase  | What it does                                                   |
| -------------- | ------ | -------------------------------------------------------------- |
| Request        | 22     | Stamps `cr664_requestdate` on the checklist row.               |
| Mark received  | **51** | Stamps `cr664_receiveddate` on the checklist row.              |

Clicking **Mark received** opens the `ReceiveDocumentModal`:

- Required: **Receipt note** — the banker's free-text record of how
  the document arrived (e.g. "emailed by borrower," "hand-delivered").
- No file picker. No filename field. No "drag and drop." The schema
  has nowhere to put binary content, so the modal does not pretend it
  can accept one.

On confirm, the action runs the same three-write coordination as
every other governed write:

1. `Cr664_documentchecklistsService.update(documentId, { cr664_receiveddate: nowIso })`
2. `Cr664_auditeventsService.create({ ..., cr664_auditeventname: 'DocumentChecklist Received', cr664_afterstate: 'Received', ... })`
3. `Cr664_dealtimelineeventsService.create({ ..., cr664_eventtype: DocumentUploaded (788190010), ... })` — using the closest available schema enum value. The summary is the banker's note; the title is the document name.

The row flips from **Outstanding** to **Received** in-place after
the action resolves (existing `deriveStatus` selector in
`dealDocumentQueries.ts` keys off `cr664_receiveddate`).

### Inventory state after Phase 51

- **`GOVERNED_WRITES`**: now has **7 entries** (was 6). The new
  entry is `deal-document-receive` (introducedInPhase: 51, emitsAudit:
  true, emitsTimeline: true).
- **`NOT_WIRED.document-upload`**: still present. Its reason now
  cites the exact schema-column gap that blocks true binary upload
  (see §3).

---

## 2. What is still NOT wired

The Phase 51 governed write does NOT do any of the following. They
remain explicit non-goals:

- **Binary file upload.** No bytes leave the browser. The action
  does not call `client.uploadFileToRecord(...)`. The
  `cr664_uploadstatus` boolean flag is deliberately **not set** by
  this action — that flag is reserved for a future phase that wires
  real in-app upload.
- **OCR / AI extraction.** No document-intelligence processing.
- **Borrower upload portal.** Borrowers still deliver documents out
  of band (email, file share, hand-delivery). The "Receipt note"
  field is where the banker records that out-of-band channel.
- **SharePoint / Teams / Outlook sync.** No external system
  integration.
- **Email automation.** No "received" confirmation email to the
  borrower. (Phase 23 is still local-only borrower-update copy.)
- **Versioning.** The schema has no version column; re-receiving an
  updated copy is not modeled.
- **Multi-file drag-and-drop.** Not applicable while binary upload
  is blocked.
- **Stage advancement coupling.** Marking a document received does
  not advance the deal stage (stage progression is still
  `DELIBERATELY_BLOCKED.stage-progression-advance` — see
  [STAGE_PROGRESSION_ENABLEMENT_MAP.md](STAGE_PROGRESSION_ENABLEMENT_MAP.md)).

---

## 3. The exact schema blocker for true binary upload

True binary upload requires a Dataverse **File** (or Image) column on
`cr664_documentchecklist`. The schema does not currently expose one.

Verified during the Phase 51 feasibility audit:

| Dependency                                       | Status                              |
| ------------------------------------------------ | ----------------------------------- |
| `@microsoft/power-apps` SDK supports binary upload | **Available** — `client.uploadFileToRecord(tableName, recordId, columnName, fileName, data)` accepts `Blob \| Uint8Array \| ArrayBuffer \| string`. |
| `Cr664_documentchecklistsService` exposes binary methods | **N/A** — the generated service exposes `create / update / delete / get / getAll` only. Binary upload is on the underlying client object, not on the per-entity service. |
| `cr664_documentchecklist` has a File column      | **Missing** — no `cr664_fileattachment`, `cr664_attachedfile`, or similar File/Image column on the table. The columns present are: `cr664_documentname`, `cr664_documenttype` (enum), `cr664_duedate`, `cr664_requestdate`, `cr664_receiveddate`, `cr664_uploadstatus` (bool), `cr664_reviewer`, plus standard Dataverse metadata fields. |

The SDK has the gun; the schema has nowhere to point it.

---

## 4. Upload lifecycle (current honest model)

```
Outstanding ──Request──▶ Outstanding (with requestDate)
                             │
                       (borrower delivers
                        externally — email,
                        file share, etc.)
                             │
                             ▼
                       Mark received  ──▶  Received
                                              │
                                       (Phase 44 review path)
                                              │
                                              ▼
                                          Reviewed
```

- The **Mark received** transition is the new Phase 51 governed
  write.
- The transition does NOT carry a binary file. The cr664_uploadstatus
  flag stays at its current value (typically false). The "Source:
  Uploaded" UI badge that renders when cr664_uploadstatus is true
  remains an honest signal: it indicates the document arrived via
  an upload channel upstream of this app, NOT via this app's Mark
  received button.

---

## 5. Audit and timeline behavior

Identical contract to Phase 22's `requestDocument` (the Phase 49/50
discipline tests cover both):

### Audit event (`cr664_AuditEvent`)

| Field                              | Value                                            |
| ---------------------------------- | ------------------------------------------------ |
| `cr664_auditeventname`             | `'DocumentChecklist Received'`                   |
| `cr664_eventcategory`              | `Lifecycle` (788190002)                          |
| `cr664_eventtype`                  | `StatusChange` (788190001)                       |
| `cr664_entitytype`                 | `LoanDeal` (788190000)                           |
| `cr664_entityid`                   | document checklist id                            |
| `cr664_outcomestatus`              | `Succeeded` (788190000) / `Failed` (788190001)   |
| `cr664_correlationid`              | new uuid per attempt (prefix `'rd'` in fallback) |
| `cr664_fieldname`                  | `'cr664_receiveddate'`                           |
| `cr664_beforestate`                | `'Outstanding'`                                  |
| `cr664_afterstate`                 | `'Received'`                                     |
| `cr664_notes`                      | banker's receipt note (verbatim)                 |
| `cr664_LoanDeal@odata.bind`        | `/cr664_loandeals(${dealId})`                    |
| `cr664_ChangedBy@odata.bind`       | `/systemusers(${systemUserId})`                  |
| `cr664_ActorUser@odata.bind`       | `/systemusers(${systemUserId})`                  |
| `cr664_sourcescreensourceprocess`  | `'DealWorkspace/DealDocuments/receive'`          |

### Timeline event (`cr664_DealTimelineEvent`)

| Field                              | Value                                            |
| ---------------------------------- | ------------------------------------------------ |
| `cr664_eventtype`                  | `DocumentUploaded` (788190010)                   |
| `cr664_title`                      | document name                                    |
| `cr664_summary`                    | banker's receipt note (verbatim)                 |
| `cr664_visibilityscope`            | `BankerAndManager` (788190000)                   |
| `cr664_eventsubtype`               | `` `correlation:${correlationId}` ``             |
| `cr664_Deal@odata.bind`            | `/cr664_loandeals(${dealId})`                    |
| `cr664_EventBy@odata.bind`         | `/systemusers(${systemUserId})`                  |

Note on the `DocumentUploaded` enum value: the option set has
neither `DocumentReceived` nor `DocumentMarkedReceived`. The closest
available value is `DocumentUploaded`, which we use with the
understanding that "the document was uploaded — somewhere upstream
of this app — and the banker is recording its arrival here."
Adding a more precise enum value is a small schema follow-up.

### Outcome union (Phase 47 contract)

```ts
type MarkDocumentReceivedOutcome =
  | { kind: 'success' }
  | { kind: 'receive-failed'; docError: string }
  | { kind: 'governance-partial'; auditError: string | undefined; timelineError: string | undefined }
  | { kind: 'unknown'; message: string };
```

---

## 6. Known limitations

- **No idempotency check.** If a document is already received,
  the action will re-stamp `cr664_receiveddate` and emit a new pair
  of audit + timeline rows. The UI button only shows on Outstanding
  rows, so this is reachable only by a stale page; the action does
  not guard against it. A future phase can add a server-side check
  if needed.
- **No banker-typed filename.** The schema has no place to store
  one. Adding one to the UI would imply a capability that does not
  exist.
- **`cr664_uploadstatus` is left untouched.** Setting it would
  conflate "marked received in this app" with "uploaded into this
  app." Until binary upload ships, "Source: Uploaded" continues to
  reflect upstream upload events only.
- **No bulk receive.** One document at a time.
- **No reversal.** No "un-receive" action; if marked in error,
  manual Dataverse correction is required.

---

## 7. Exact next operational dependency

To unlock true binary upload (a future Phase **53 or later**), the
following must land — in order:

1. **Schema:** add a Dataverse **File** column to `cr664_documentchecklist`.
   Suggested name `cr664_filedocument`. Configure max file size and
   accepted content types upstream in Power Apps.
2. **Regenerate the SDK:** the new column must appear in
   `src/generated/models/Cr664_documentchecklistsModel.ts`. The
   service does not need a new method; the underlying client's
   `uploadFileToRecord` targets the column by name.
3. **New action:** add `uploadDocumentFile(input)` to
   `documentActions.ts` (or split into a new module). Contract:
   `success | upload-failed | governance-partial | unknown`. The
   action calls `client.uploadFileToRecord('cr664_documentchecklists', documentId, 'cr664_filedocument', filename, blob)`,
   then sets `cr664_uploadstatus = true` and `cr664_receiveddate = now`
   in the same record update.
4. **Inventory:** `GOVERNED_WRITES` gains a new `deal-document-upload`
   entry. `NOT_WIRED.document-upload` is removed.
5. **UI:** the ReceiveDocumentModal grows a file picker. The
   "Mark received without file" path remains for borrowers who
   delivered hardcopy or external upload.
6. **Tests:** action + modal + inventory tests follow the
   Phase 46/47/49/50 discipline patterns.

Until step 1 lands, no further app-side work is productive.

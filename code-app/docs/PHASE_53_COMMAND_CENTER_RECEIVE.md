# Phase 53 — Command Center Document-Receive Integration

Status: **Operational.** Overdue document rows in the banker
Command Center's My Work Queue now expose an inline "Mark received"
action that reuses the Phase 51 governed write.

This is a read-layer + existing-write integration. No new governed
write. No schema work. No new outcome contract.

Related canonical sources:
- [src/banker/MyWorkQueue.tsx](../src/banker/MyWorkQueue.tsx) — the queue surface
- [src/banker/workQueueQueries.ts](../src/banker/workQueueQueries.ts) — data layer (extended with `requestDate`)
- [src/banker/workQueue.ts](../src/banker/workQueue.ts) — derivation (extended with `documentMetadata` on overdue-document items)
- [src/deals/documentActions.ts](../src/deals/documentActions.ts) — Phase 51 `markDocumentReceived` (reused, unchanged)
- [src/deals/ReceiveDocumentModal.tsx](../src/deals/ReceiveDocumentModal.tsx) — Phase 51 modal (reused, unchanged)
- [PHASE_51_DOCUMENT_UPLOAD_SCOPE.md](PHASE_51_DOCUMENT_UPLOAD_SCOPE.md) — schema blocker + binary-upload non-goal still apply

---

## 1. New workflow entry points

### My Work Queue overdue-document rows

Before Phase 53: the banker scans My Work Queue, sees an overdue
document row, clicks → routes to the Deal Workspace → clicks
"Mark received" there.

After Phase 53: the row exposes the same action inline. One click
opens the modal directly; success refreshes the queue and the row
drops out.

The change is additive. The row remains keyboard-navigable and
click-to-open-deal still works — `stopPropagation` on the button
click prevents the row's navigation handler from also firing.

### Surfaces explicitly NOT integrated in this phase

- **Personal Pipeline.** The banker's all-deals pipeline card
  shows deal-level summaries; it does not surface individual
  document rows. Adding a document-count badge per deal is a
  discovery aid, not an action surface, and was deferred per the
  Phase 53 audit recommendation.
- **Manager / team work queues.** Out of scope by role (Phases 44
  / 48 enforce read-only role boundaries; the receive action is
  banker-only).

---

## 2. Banker workflow impact

| Before Phase 53                                                  | After Phase 53                                                              |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| See overdue doc in queue                                         | See overdue doc in queue                                                    |
| Click row → navigate to Deal Workspace                           | Click **Mark received** inline → modal opens                                |
| Click Mark received in DealDocuments card                        | Type receipt note → submit                                                  |
| Type receipt note → submit                                       | Modal closes → queue refreshes → row gone                                   |
| Modal closes → DealDocuments card refreshes                      | (still navigable to Deal Workspace via row-body click for non-receive work) |

The DealDocuments entry point (Phase 51) is unchanged and still
the right place when the banker is already inside a deal. The
Command Center entry point is the new fast path for triage.

---

## 3. Implementation details

### Data layer

`WorkQueueDocumentRow` gained one field:

```ts
export interface WorkQueueDocumentRow {
  ...
  /** Phase 53: surfaced for the Command Center mark-received modal so
   *  the row displays "Last requested" accurately. */
  requestDate: string | undefined;
  ...
}
```

The loader (`loadOutstandingDocumentsForDeals`) now maps
`cr664_requestdate` into the row. No filter change — the
outstanding-document filter still requires `cr664_receiveddate` to
be absent.

### Derivation

`WorkQueueItem` gained one optional field:

```ts
export interface WorkQueueDocumentMetadata {
  documentId: string;
  documentName: string;
  dueDate: string | undefined;
  requestDate: string | undefined;
}

export interface WorkQueueItem {
  ...
  documentMetadata?: WorkQueueDocumentMetadata;
}
```

`documentOverdueItem` populates it; every other item type leaves
it `undefined`. The work-queue row uses presence as the discriminator
for "should the receive button render?"

### MyWorkQueue.tsx

- `reload()` extracted from the existing initial-load `useEffect`
  and made callable; the modal's success path calls it.
- `pendingReceive` state carries `{ dealId, meta }` so the modal
  knows which deal to record against. `dealId` comes from the
  item's `dealId` field (which is already the
  already-authorized id from `loadBankerPipeline`, not a
  route-param-trusted value).
- `handleReceiveConfirm` mirrors the DealDocuments handler exactly
  except for the deal-id source (item.dealId vs. context.deal.id)
  and the post-success refresh target (queue reload vs.
  DealDataProvider.refresh).
- `toDealDocumentShape` adapts `WorkQueueDocumentMetadata` to the
  modal's `DealDocument` prop. The modal renders only `name`,
  `dueDate`, and `requestDate`; the other `DealDocument` fields
  get outstanding-status defaults.

### What's reused unchanged

- The `ReceiveDocumentModal` component
- The `markDocumentReceived` action and its outcome union
- The shared `newCorrelationId('rd')` helper (Phase 46)
- The shared `AUDIT_OUTCOME_SUCCEEDED` / `AUDIT_OUTCOME_FAILED`
  enums (Phase 49)
- The shared `TIMELINE_VISIBILITY_BANKER_AND_MANAGER` constant
  (Phase 50)
- The full Phase 49 + 50 audit and timeline payload contracts
- The Phase 47 outcome union shape (success / receive-failed /
  governance-partial / unknown)

There is **no duplicate receive implementation**. The Phase 51
inventory entry `deal-document-receive` continues to be the
single canonical write; the Phase 46–50 governance regression
tests still cover it as the single mapping.

---

## 4. Refresh behavior

The queue reloads on these outcomes:
- `success` — the row drops out because the underlying
  `cr664_receiveddate IS NULL` filter no longer matches
- `governance-partial` — same as success at the document layer
  (the primary write persisted); the modal continues to show the
  governance-partial state so the banker captures the audit /
  timeline error message

The queue does **not** reload on:
- `receive-failed` — the primary write did not persist; the queue
  state is still correct
- `unknown` — defensive fallback; the queue state cannot have
  changed if the action did not complete

The modal stays open after the action resolves so the banker can
read the outcome panel. Closing the modal does not trigger an
extra reload — the reload already fired on the action's resolution.

---

## 5. Role-boundary behavior

| Role      | Outstanding-doc row in their queue?                | "Mark received" inline action?     |
| --------- | -------------------------------------------------- | ---------------------------------- |
| Banker    | Yes (My Work Queue, Phase 32)                      | **Yes** (Phase 53; banker-only)    |
| Manager   | Yes (Team Work Queue, Phase 33; read-only)         | No — no write surface in queue     |
| Team      | Yes (Shared Work Queue, Phase 34; read-only)       | No — no write surface in queue     |
| Executive | No — snapshot-only; no work queue                  | n/a                                |
| Admin     | No — admin diagnostics surfaces only               | n/a                                |

Banker-only by construction:
- `MyWorkQueue` lives under `src/banker/` (Phase 48 import-graph
  isolation prevents other roles from importing it)
- The component requires `useBanker()` which is only available
  inside a `BankerProvider`
- The button additionally requires `systemUserId` (the
  Dataverse-resolved value); if absent — e.g. local dev mock — the
  button does not render
- Manager and team work queues are separate components that do
  not import `markDocumentReceived` or `ReceiveDocumentModal`
  (Phase 44 read-only sweep continues to enforce this at the
  static-source level)

---

## 6. Known limitations

- **Only overdue documents.** My Work Queue's derivation surfaces
  outstanding documents only when they're past due. Non-overdue
  outstanding requests don't appear in the queue and therefore
  don't have the inline action. The Deal Workspace's
  `DealDocuments` card remains the place to mark non-overdue
  requests received.
- **Queue reload is full re-fetch.** No optimistic update — the
  row disappears after the next round-trip to Dataverse, not
  immediately. Acceptable given the queue's existing load pattern
  and the absence of a stale window between write and read.
- **No bulk receive.** One document at a time, one modal at a time.
- **No filename / no file upload.** Same as Phase 51 — schema
  has no File column. See [PHASE_51_DOCUMENT_UPLOAD_SCOPE.md](PHASE_51_DOCUMENT_UPLOAD_SCOPE.md).
- **`writeDisabledReason` is not surfaced in the queue.** Phase 32
  kept the queue free of in-line banners; the Deal Workspace is
  where that signal renders. The receive button uses
  `systemUserId` presence as its gate, matching the
  `DealDocuments.canWrite` convention.
- **Two reloads in flight.** If the banker submits, gets a
  governance-partial outcome, then immediately submits a second
  doc, the first reload may overlap with the second initial state.
  The reload's `cancelled` flag handles this correctly — only the
  latest set fires its `setState`.

---

## 7. Still NOT wired

Unchanged from Phase 51:

- Binary file upload (schema-blocked; no File column on
  `cr664_DocumentChecklist`)
- Borrower upload portal
- OCR / AI extraction / document intelligence
- SharePoint / Teams / Outlook sync
- Email automation
- Versioning, multi-file drag-drop, stage advancement coupling

Phase 53 surfaces what Phase 51 already shipped. It does not
expand the underlying capability.

# Phase 104 — Outlook Connector LIVE Send Swap (document-request email)

**Status:** **Connector swap executed.** The Office 365 Outlook
connector is registered for this Code App; the generated SDK exposes
[`Office365OutlookService`](../src/generated/services/Office365OutlookService.ts);
the Phase 61 `liveAdapter.send` stub now calls
`Office365OutlookService.SendEmailV2` for the document-request email
flow only. DRY_RUN behavior is unchanged. No new write surface; no
new UI; no governed write added. The Phase 62 stub-pin regression
test was deleted in the same change.

Related canonical sources:
- [PHASE_61_OUTLOOK_EMAIL_DELIVERY.md](PHASE_61_OUTLOOK_EMAIL_DELIVERY.md) — original email-delivery design (DRY_RUN/LIVE adapter discipline, audit + timeline coordination, conservative copy, masked recipient on timeline).
- [PHASE_62_OUTLOOK_LIVE_SEND.md](PHASE_62_OUTLOOK_LIVE_SEND.md) — the verification + unblock plan whose §2 swap is executed in this phase.
- [src/deals/emailDelivery/outlookEmailAdapters.ts](../src/deals/emailDelivery/outlookEmailAdapters.ts) — the modified file.
- [src/deals/emailDelivery/outlookEmailPort.ts](../src/deals/emailDelivery/outlookEmailPort.ts) — the stable port contract (unchanged).
- [src/deals/sendDocumentRequestEmail.ts](../src/deals/sendDocumentRequestEmail.ts) — the only governed write that consumes the adapter (unchanged).
- [src/generated/services/Office365OutlookService.ts](../src/generated/services/Office365OutlookService.ts) — the typed connector service produced by SDK regeneration.
- [src/generated/models/Office365OutlookModel.ts](../src/generated/models/Office365OutlookModel.ts) — `ClientSendHtmlMessage` and related types.
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — `NOT_WIRED.outlook-connector-live-send` removed; `NOT_WIRED.email-delivery` (borrower-update) unchanged.

---

## 1. Scope (and what this phase is NOT)

**In scope** — document-request email LIVE path only:
- Replace the body of `liveAdapter.send` in
  [outlookEmailAdapters.ts](../src/deals/emailDelivery/outlookEmailAdapters.ts)
  with a typed `Office365OutlookService.SendEmailV2` call.
- Map `IOperationResult<void>` to the existing `OutlookSendResult`
  union (`accepted` / `invalid-recipient` / `transient-failure` /
  `permanent-failure`).
- Delete the Phase 62 stub-pin test
  ([outlookLiveStubPin.test.ts](../src/shared/governance/outlookLiveStubPin.test.ts)
  — removed in this commit), per its in-file self-documenting note.
- Remove `NOT_WIRED.outlook-connector-live-send` from
  `platformInventory.ts`. Update the two cross-references in the
  borrower-portal and Phase 101 summary-handoff notes to point at
  `NOT_WIRED.email-delivery` (the remaining honestly-blocked surface).
- Replace the Phase 61 baseline `liveAdapter` test block in
  [outlookEmailAdapters.test.ts](../src/deals/emailDelivery/outlookEmailAdapters.test.ts)
  with mock-based SendEmailV2 success/failure tests.

**Explicitly NOT in scope:**
- No new UI. RequestDocumentModal, DealDocuments, DealRoute, etc. are
  unchanged.
- No new governed write. `GOVERNED_WRITES.deal-document-request-email`
  (Phase 61) is unchanged.
- No borrower-update email path. The borrower-update flow (Phase 23)
  remains local-only Copy-to-clipboard;
  `NOT_WIRED.email-delivery` is preserved.
- No catch-up / activity / relationship summary send. Phase 101 and
  its three siblings remain copy-to-clipboard handoffs that do not
  call `SendEmailV2` regardless of `EMAIL_MODE`.
- No Teams / Graph integration. No calendar work. No inbound email.
  No subscriptions. No shared mailbox / `From` override. No
  attachments. No Cc / Bcc.
- No AI. No schema work. No new audit-event or timeline-event types.
- No claim of delivery. The action layer continues to say "Outlook
  accepted" — meaning the connector acknowledged the request for
  handoff, not that the borrower received the message.

---

## 2. The swap

### Before — Phase 61 stub

`liveAdapter.send` validated the recipient locally, then returned a
permanent-failure with the verbatim string:

> "Office 365 Outlook connector is not yet registered for this Code
> App. LIVE mode is wired end-to-end (audit + timeline + outcome
> union); the missing piece is the connector registration + SDK
> regeneration. See docs/PHASE_61_OUTLOOK_EMAIL_DELIVERY.md for the
> unblock checklist."

### After — Phase 104 LIVE call

`liveAdapter.send` still runs the local
[`isLikelyValidEmail`](../src/deals/emailDelivery/outlookEmailAdapters.ts)
pre-flight check, then constructs a typed
[`ClientSendHtmlMessage`](../src/generated/models/Office365OutlookModel.ts)
and calls `Office365OutlookService.SendEmailV2(message)`. Only four
fields are populated:

```ts
const message: ClientSendHtmlMessage = {
  To: input.recipient,
  Subject: input.subject,
  Body: input.body,
  Importance: 'Normal',
};
```

`Attachments`, `Cc`, `Bcc`, `From`, `ReplyTo`, and `Sensitivity` are
left unset. That is asserted by a dedicated test in
[outlookEmailAdapters.test.ts](../src/deals/emailDelivery/outlookEmailAdapters.test.ts).

### Outcome classification

`SendEmailV2` returns `Promise<IOperationResult<void>>`. The adapter
maps it as follows:

| `IOperationResult` shape                                       | `OutlookSendResult.kind`             |
| -------------------------------------------------------------- | ------------------------------------ |
| `{ success: true }`                                            | `accepted` (providerMessageId `undefined`) |
| `{ success: false, error: { status: 408 \| 429 \| 5xx } }`     | `transient-failure`                  |
| `{ success: false, error: { status: other 4xx } }`             | `permanent-failure`                  |
| `{ success: false, error: { status: undefined } }`             | `transient-failure` (network drop)   |
| thrown / non-`IOperationResult` rejection                      | `transient-failure`                  |

A thrown rejection cannot escape the adapter — the `try`/`catch`
collapses it into a `transient-failure` carrying the error message
verbatim. Conservative bias: when the runtime fails to produce a
structured outcome, treat it as transient so the banker can retry.

Why "transient" defaults the no-status / thrown cases:
- `IOperationResult` with `error.status === undefined` typically
  means the runtime did not receive a structured HTTP response (DNS,
  network, abort). Retry is the safer instruction.
- A thrown rejection means the SDK itself did not finish processing;
  the connector may or may not have received the request. Retry, do
  not silently swallow.

The existing `sendDocumentRequestEmail` action already understands
all four outcome kinds and translates `transient-failure` /
`permanent-failure` into its `send-failed` branch with `transient:
boolean`. No change needed in the action layer.

### Conservative copy preserved

The Phase 45 copy guard remains green. The adapter never says "sent"
or "delivered". The action's timeline summary still reads "Outlook
accepted document request to <masked>." in LIVE mode and "Document
request prepared for <masked>. Mode: DRY_RUN; nothing left the
client." in DRY_RUN mode. The Phase 23 borrower-update Copy-only
flow is untouched.

---

## 3. Tests

### Deleted

- [src/shared/governance/outlookLiveStubPin.test.ts](../src/shared/governance/outlookLiveStubPin.test.ts)
  — the Phase 62 regression pin. Its in-file note explicitly
  instructed: "When the connector lands upstream and the typed swap
  completes (see docs/PHASE_62_OUTLOOK_LIVE_SEND.md §2), DELETE this
  entire test file in the same commit." Done.

### Rewritten

- [src/deals/emailDelivery/outlookEmailAdapters.test.ts](../src/deals/emailDelivery/outlookEmailAdapters.test.ts)
  — the `liveAdapter` describe block was replaced. It now uses
  `vi.mock` at the module boundary to stub
  `Office365OutlookService.SendEmailV2` (the Phase 39 boundary-mocking
  rule). New assertions:
  - LIVE adapter calls `SendEmailV2` exactly once with the typed
    `ClientSendHtmlMessage` payload — `To` / `Subject` / `Body` /
    `Importance: 'Normal'` only.
  - LIVE adapter does NOT pass `Attachments` / `Cc` / `Bcc` / `From`
    / `ReplyTo` / `Sensitivity`.
  - Success → `accepted` with `providerMessageId: undefined`.
  - 5xx / 429 / 408 → `transient-failure`.
  - 403 / 400 → `permanent-failure`.
  - No status → `transient-failure`.
  - Thrown rejection → `transient-failure` (no thrown error escapes).
  - The pre-flight invalid-recipient check still short-circuits BEFORE
    `SendEmailV2` is invoked.
  - The DRY_RUN adapter remains untouched — verified by a positive
    "does not call `SendEmailV2`" assertion.
  - Only `SendEmailV2` is invoked — no Graph, calendar, subscription,
    or shared-mailbox method is reached for.

### Updated assertions

- [src/shared/governance/platformInventory.test.ts](../src/shared/governance/platformInventory.test.ts)
  — the Phase-68 specific-blockerKind anchor flips from "expect
  `outlook-connector-live-send`.blockerKind === 'connector'" to
  "expect `outlook-connector-live-send` to be undefined." The
  Phase 101 LOCAL_ONLY_FLOWS note assertion now matches "Does NOT
  use the Outlook connector" + "Phase 104 connector swap" +
  "NOT_WIRED.email-delivery" instead of the old
  "outlook-connector-live-send" reference.
- [src/admin/ReleaseReadinessGate.test.tsx](../src/admin/ReleaseReadinessGate.test.tsx)
  — the "surfaces outlook-connector-live-send as a connector-blocker"
  test was inverted to "no longer surfaces outlook-connector-live-send
  — Phase 104 swap removed it from NOT_WIRED."

### Unchanged

- `OutlookEmailPort` contract.
- `OutlookSendResult` union shape.
- `sendDocumentRequestEmail` outcome union.
- `recipientMasking`.
- `RequestDocumentModal`, `DealDocuments`, `DealDataProvider`.
- Audit-event / timeline-event payload shapes.
- Phase 46 / 47 / 49 / 50 discipline sweeps (correlation id prefix
  `'oe'`, four-branch outcome union, audit `'DocumentRequest Outlook
  Send'`, timeline `EmailLogged` 788190001).
- `EMAIL_MODE` discipline. `VITE_EMAIL_MODE` defaults to DRY_RUN.

---

## 4. Governance & inventory

- `GOVERNED_WRITES.deal-document-request-email` — unchanged (Phase
  61). One governed write. One audit event. One timeline event. One
  correlation id. The discriminated outcome union and partial-write
  coordination logic are unchanged.
- `NOT_WIRED.outlook-connector-live-send` — **removed.** The
  upstream connector blocker is no longer accurate.
- `NOT_WIRED.email-delivery` — **preserved.** Borrower-update email
  remains local-only Copy-to-clipboard; no `BorrowerUpdateSent`
  timeline event is emitted. The Phase 104 connector swap is scoped
  to document-request email and does not touch this path.
- `NOT_WIRED.borrower-portal` (Phase 64/65 compound deferral) — text
  updated to acknowledge the Phase 104 swap on the document-request
  path, while still pinning that automated borrower-notification
  email delivery (the borrower-update flow) is blocked by
  `NOT_WIRED.email-delivery`.
- `LOCAL_ONLY_FLOWS.outlook-summary-handoff` (Phase 101) — text
  updated. Catch-up / activity / relationship summary handoffs remain
  copy-to-clipboard. They do not call `SendEmailV2`, regardless of
  `EMAIL_MODE`. The note explicitly references
  `NOT_WIRED.email-delivery` so the honesty marker still points at a
  real remaining gap.

No new `NOT_WIRED`, `LOCAL_ONLY_FLOWS`, or `DELIBERATELY_BLOCKED`
entries. No change to `GOVERNED_WRITES`. The Phase 103 product
checkpoint counts (governed writes: 11, LOCAL_ONLY_FLOWS: 15,
NOT_WIRED: 10, DELIBERATELY_BLOCKED: 1) become **(GOVERNED_WRITES:
11, LOCAL_ONLY_FLOWS: 15, NOT_WIRED: 9, DELIBERATELY_BLOCKED: 1).**

---

## 5. Promotion guardrail

Operators may now flip `VITE_EMAIL_MODE=LIVE` in production. When
they do:
- The `RequestDocumentModal` mode badge will read **Mode: LIVE**.
- `liveAdapter.send` will call `Office365OutlookService.SendEmailV2`
  with the banker's verbatim recipient, subject, and body.
- The audit row captures the FULL recipient and the verbatim banker-
  supplied subject (audit-row is the privileged ledger).
- The timeline row uses the MASKED recipient (banker + manager
  visibility scope).
- On 408 / 429 / 5xx / no-status / thrown-rejection responses, the
  banker sees the `send-failed (transient)` outcome with a retry
  affordance. On other 4xx responses, the banker sees the
  `send-failed (permanent)` outcome without retry.

DRY_RUN remains the default. No environment change ships with this
phase; the mode flip is a separate operational decision.

---

## 6. Scope discipline

This phase did NOT extend the email surface. The same conservative
posture from Phase 102 / 103 holds:
- One governed write (document-request email).
- No second send pathway (borrower-update, catch-up, activity,
  relationship summary all remain copy-to-clipboard).
- No claim of delivery. The action layer says "Outlook accepted";
  the banker sees a "send request accepted" affordance, not "email
  sent" or "email delivered". The Phase 45 conservative-copy guard
  enforces this.
- No new schema, no new connector beyond the one that was
  registered upstream, no new role surface, no new policy.

The next operational candidate would be either (a) wiring the
borrower-update email path through the same adapter — a separate
governance decision because borrower-update is recipient-facing in
a different way than a document request — or (b) leaving the
remaining copy-to-clipboard surfaces deliberately scope-frozen as
the Phase 103 checkpoint recommends. Either is a future phase.

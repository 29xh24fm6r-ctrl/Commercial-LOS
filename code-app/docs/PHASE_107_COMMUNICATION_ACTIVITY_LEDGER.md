# Phase 107 — Banker Communication Activity Ledger Consolidation

**Status:** **Shipped.** No production code change. Two new test
files prove that the two completed Outlook-backed banker
communication writes (Phase 104 document-request email, Phase 105
borrower-update email) produce consistent, operator-readable
activity evidence under the existing `<BorrowerCommunication />`
card on the Deal Workspace.

The card was originally built for Phase 23 to render
`EmailLogged` / `CallLogged` / `BorrowerUpdateSent` timeline rows.
Phase 107 confirms it now does so consistently for both governed
writes — with distinct titles, distinct event-type badges, masked
recipient, "Outlook accepted" wording, and zero claim of delivery.

Phase 107 deliberately does NOT:
- add a new governed write,
- add a new Outlook connector import,
- add a new `SendEmailV2` call,
- expand the email payload,
- introduce automation / inbound mail / portal messaging /
  delivery tracking,
- modify the Phase 101 summary handoffs.

Related canonical sources:
- [PHASE_104_OUTLOOK_LIVE_SEND.md](PHASE_104_OUTLOOK_LIVE_SEND.md)
- [PHASE_105_BORROWER_UPDATE_LIVE_SEND.md](PHASE_105_BORROWER_UPDATE_LIVE_SEND.md)
- [PHASE_106_EMAIL_MODE_RELEASE_READINESS.md](PHASE_106_EMAIL_MODE_RELEASE_READINESS.md)
- [src/shared/governance/communicationActivityLedger.test.ts](../src/shared/governance/communicationActivityLedger.test.ts) — 49 governance-evidence assertions.
- [src/deals/borrowerCommunicationActivity.test.tsx](../src/deals/borrowerCommunicationActivity.test.tsx) — 12 narrow UI rendering assertions.
- [src/deals/BorrowerCommunication.tsx](../src/deals/BorrowerCommunication.tsx) — the existing card under test (unchanged).
- [src/deals/sendDocumentRequestEmail.ts](../src/deals/sendDocumentRequestEmail.ts)
- [src/deals/sendBorrowerUpdateEmail.ts](../src/deals/sendBorrowerUpdateEmail.ts)
- [src/deals/activityQueries.ts](../src/deals/activityQueries.ts)

---

## 1. The two communication writes — evidence shape

| Field | Document-request email (Phase 104) | Borrower-update email (Phase 105) |
| --- | --- | --- |
| `GOVERNED_WRITES` id | `deal-document-request-email` | `deal-borrower-update-email` |
| Action file | `src/deals/sendDocumentRequestEmail.ts` | `src/deals/sendBorrowerUpdateEmail.ts` |
| Audit event name | `'DocumentRequest Outlook Send'` | `'BorrowerUpdate Outlook Send'` |
| Correlation id prefix | `'oe'` | `'bue'` |
| Timeline event-type enum | `EmailLogged` (788190001) | `BorrowerUpdateSent` (788190014) |
| Row title (`cr664_title`) | `Document request: <documentName>` | `Borrower update` |
| LIVE summary wording | `Outlook accepted document request to <masked>.` | `Outlook accepted borrower update to <masked>.` |
| DRY_RUN summary wording | `Document request prepared for <masked>. Mode: DRY_RUN; nothing left the client.` | `Borrower update prepared for <masked>. Mode: DRY_RUN; nothing left the client.` |
| Full recipient location | Audit row only (`cr664_notes`) | Audit row only (`cr664_notes`) |
| Timeline visibility | BankerAndManager | BankerAndManager |

Both writes share the same governance shape:

1. One audit row (`cr664_AuditEvent`) carrying:
   - `cr664_auditeventname` (distinct per write)
   - `cr664_correlationid` (distinct prefix per write)
   - `cr664_eventcategory` Lifecycle (788190002)
   - `cr664_eventtype` StatusChange (788190001)
   - `cr664_outcomestatus` Succeeded / Failed
   - `cr664_notes` containing the verbatim banker-supplied subject
     + the FULL recipient address
   - `cr664_LoanDeal@odata.bind` for the deal link
2. One timeline row (`cr664_DealTimelineEvent`) carrying:
   - `cr664_eventtype` (distinct per write)
   - `cr664_title` (operator-readable label)
   - `cr664_summary` (banker-readable summary with MASKED recipient
     + "Outlook accepted" wording in LIVE mode)
   - `cr664_eventsubtype` embedding `correlation:<id>` so the row
     can be paired with its audit twin
3. Both rows stamped with the same `correlationId` so the audit
   ledger and the timeline ledger can be joined.

---

## 2. Where the operator sees the evidence

The existing `<BorrowerCommunication />` card on the Banker Deal
Workspace renders the timeline subset matching:

```ts
const BORROWER_COMM_TYPES = new Set<TimelineEventTypeKey>([
  'EmailLogged',
  'CallLogged',
  'BorrowerUpdateSent',
]);
```

So both `EmailLogged` (Phase 104 document-request) and
`BorrowerUpdateSent` (Phase 105 borrower-update) rows surface
side-by-side, newest-first, on the same card.

For each row the card renders:
- a status dot,
- the row `title` (e.g. "Document request: Personal Financial
  Statement" or "Borrower update"),
- the event-type badge (`EmailLogged` / `BorrowerUpdateSent`),
- the row `summary` (which carries the masked recipient + the
  "Outlook accepted" wording in LIVE mode, or the
  `Mode: DRY_RUN; nothing left the client.` form in DRY_RUN),
- the relative-time stamp + actor.

The card does NOT render the full recipient (the audit row is the
privileged ledger). The card does NOT claim delivery — the literal
words "delivered" / "email sent" / "email delivered" never appear
in the rendered DOM. Phase 107's UI test
([borrowerCommunicationActivity.test.tsx](../src/deals/borrowerCommunicationActivity.test.tsx))
pins both.

A second, more general activity surface — `<ActivityTimeline />` —
shows the full timeline including these rows. It uses the same data
shape from `loadDealActivity`, so the same masked-recipient + no-
delivery-claim guarantees apply transitively. The Phase 107 narrow
rendering test pins the `<BorrowerCommunication />` surface
explicitly because that is the operator-readable communication
ledger; `<ActivityTimeline />` is the general activity stream.

---

## 3. What the regression-pins guarantee

### `src/shared/governance/communicationActivityLedger.test.ts`
(49 assertions; static-source + inventory; comments stripped before
scanning so doc prose can describe the wording it is forbidding).

**Block 1 — inventory shape consistency (4 assertions)**
- Both `GOVERNED_WRITES` ids ship with `emitsAudit: true` and
  `emitsTimeline: true`.
- Both ids appear together (no half-built pair).

**Block 2 — audit-ledger evidence is distinct per write
(6 assertions)**
- Each action stamps the expected `cr664_auditeventname`.
- Each action uses the expected `newCorrelationId('<prefix>')`.
- Audit event names are pairwise distinct.
- Correlation prefixes are pairwise distinct.

**Block 3 — timeline event-type enums are distinct and semantically
correct (7 assertions)**
- Each action sets `cr664_eventtype` to the expected numeric value
  via a `TIMELINE_EVENT_TYPE_*` constant binding.
- Timeline event-type values are pairwise distinct.
- The borrower-update action does NOT bind any
  `TIMELINE_EVENT_TYPE_*` constant to `EmailLogged` (788190001)
  — the schema designer reserved `BorrowerUpdateSent` (788190014)
  for this exact moment, and the Phase 23 source header explicitly
  said so. Note: the literal `788190001` legitimately appears as
  the `AUDIT_EVENT_TYPE_STATUS_CHANGE` audit-event option-set
  value, which is an independent enum that happens to share the
  numeric. The assertion narrows on timeline-event-type bindings
  only.
- The document-request action does NOT use 788190014.
- The `activityQueries.ts` event-type map carries both numeric →
  string mappings so the ledger renders the distinct keys.

**Block 4 — recipient privacy preserved (6 assertions)**
- Each action's audit payload embeds the full recipient in
  `cr664_notes` (literal `${opts.input.recipient}` interpolation).
- Each action's timeline payload uses `${opts.maskedRecipient}` in
  the summary.
- Each action computes `maskedRecipient = maskRecipient(recipient)`
  before timeline emission and imports the masker from the
  canonical module.

**Block 5 — wording discipline (4 assertions)**
- Document-request action contains "Outlook accepted document
  request" wording in code.
- Borrower-update action contains "Outlook accepted borrower
  update" wording in code.
- Neither action contains `delivered` / `email was sent` /
  `email has been sent` / `borrower was notified` in code.

**Block 6 — operator-readable row title (2 assertions)**
- Each action sets `cr664_title` to a string beginning with the
  expected fragment ("Document request" / "Borrower update").

**Block 7 — no new send behavior (22 assertions)**
- Neither action references automation patterns (`setInterval` /
  `setTimeout` invoking the send function, `new CronJob`,
  `schedule.scheduleJob`).
- Neither action references inbound-mail subscription patterns
  (`OnNewEmail`, `MailboxSubscription`, `SubscribeEmailUpdate`,
  `subscribeWebhook`).
- Neither action references portal messaging surfaces
  (`borrowerPortal`, `magicLink`, `invitationToken`,
  `borrowerInvite`, `borrowerAuth`).
- Neither action references delivery tracking
  (`deliveryReceipt`, `readReceipt`, `trackDelivery`,
  `messageDelivered`).
- Neither action references calendar / shared-mailbox / Graph
  generic / `Attachments:` / `Cc:` / `Bcc:` payload fields.

### `src/deals/borrowerCommunicationActivity.test.tsx`
(12 narrow rendering assertions; jsdom; mocks at module boundary).

- Both rows render under `<BorrowerCommunication />` with distinct
  titles ("Document request: ..." vs "Borrower update") and
  distinct event-type badges ("EmailLogged" vs "BorrowerUpdateSent").
- Both summaries render with the masked recipient (`b***@e***.com`)
  visible to the banker.
- The full recipient (`borrower@example.com`) does NOT appear
  anywhere in the rendered DOM.
- The literal "Outlook accepted document request" phrase appears
  on the document-request row in LIVE mode.
- The literal "Outlook accepted borrower update" phrase appears on
  the borrower-update row in LIVE mode.
- The words `delivered` / `email sent` / `email delivered` /
  `sent an email` / `borrower was notified` do NOT appear in the
  rendered DOM.
- Document-request row carries only the `EmailLogged` badge (no
  cross-contamination with `BorrowerUpdateSent`).
- Borrower-update row carries only the `BorrowerUpdateSent` badge.
- DRY_RUN-mode summaries render verbatim, including
  "Mode: DRY_RUN; nothing left the client." — operators see the
  honest mode label.

---

## 4. Operator-readable contract (for the release reviewer)

The contract this phase locks in:

1. **Two governed writes exist.** Both carry audit + timeline +
   correlation id. Distinguishable per ledger query by either the
   `cr664_auditeventname` field (audit) or the `cr664_eventtype`
   numeric (timeline).
2. **Two rendered rows exist.** Both surface in
   `<BorrowerCommunication />` on the Banker Deal Workspace, with
   distinct titles and badges.
3. **Privacy.** Full recipient lives ONLY on the audit row's notes
   field. Every other surface — timeline summary, rendered DOM,
   ledger join key — uses the masked form.
4. **No claim of delivery.** "Outlook accepted" is the only
   accepted positive claim. Forbidden phrases (`delivered`,
   `email sent`, `email delivered`, `borrower notified`) are
   absent from action code and rendered DOM.
5. **No behavior expansion.** Phase 107 ships zero new send
   behavior. The static-source pin in Block 7 of
   `communicationActivityLedger.test.ts` enforces this at CI.

If any of those slips, the relevant test in this phase fails
loudly with a message that names which surface drifted.

---

## 5. Known consistency note — **closed by Phase 108**

> **Closed.** This section originally documented a UX gap:
> `DealDataProvider` had no `'after-borrower-update-email'`
> refresh key, and `DraftBorrowerUpdateModal` did not call
> `refresh()` after Send, so the newly-emitted `BorrowerUpdateSent`
> timeline row was not immediately visible on
> `<BorrowerCommunication />`. **[Phase 108](PHASE_108_BORROWER_UPDATE_REFRESH.md)
> closed the gap** by adding the refresh key + wrapping
> `sendBorrowerUpdateEmail` in `BorrowerCommunication.tsx` with a
> parent-side wrapper that calls `refresh('after-borrower-update-email')`
> after the action returns. Mirrors the Phase 104 document-request
> wiring exactly.

The original gap description is preserved below for historical
context.

---

**Original gap (pre-Phase-108):** `DealDataProvider` exposes a
`refresh()` mechanism with named keys. Phase 104 added
`'after-document-request-email'` so the card re-loads after a
document-request send completes. **Phase 105 did not add a
parallel `'after-borrower-update-email'` key**, and the
`DraftBorrowerUpdateModal` did not call `refresh()` after Send.
The newly-emitted `BorrowerUpdateSent` timeline row was therefore
not immediately visible on the `<BorrowerCommunication />` card
without a manual page refresh.

This was a small UX gap, not a correctness gap — the row was
correctly written to Dataverse on Send; only its immediate
visibility lagged. Phase 107 chose not to close it because the
brief explicitly scoped Phase 107 to evidence, not behavior. The
follow-on Phase 108 did the small behavior change once the
evidence layer was solid.

---

## 6. Verification

- 49 / 49 assertions in
  `src/shared/governance/communicationActivityLedger.test.ts`.
- 12 / 12 assertions in
  `src/deals/borrowerCommunicationActivity.test.tsx`.
- Full suite still green; bundle unchanged (zero production code
  change).

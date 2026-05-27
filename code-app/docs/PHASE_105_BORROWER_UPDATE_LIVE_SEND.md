# Phase 105 — Borrower-Update Email LIVE Send Swap (narrow scope)

**Status:** **Shipped.** The borrower-update flow now has a typed LIVE
send path through `Office365OutlookService.SendEmailV2`, mirroring
Phase 104 exactly. The Phase 23 Copy-to-clipboard path is preserved
unchanged as an offline fallback. The new governed write is
`GOVERNED_WRITES.deal-borrower-update-email` (12th entry). The
`NOT_WIRED.email-delivery` governance row was retired in the same
change — borrower-update was its only blocker.

Related canonical sources:
- [PHASE_23](../docs/STABILIZATION_CHECKLIST.md) (Phase 23 was documented inside the stabilization checklist) — original Copy-to-clipboard borrower-update flow.
- [PHASE_61_OUTLOOK_EMAIL_DELIVERY.md](PHASE_61_OUTLOOK_EMAIL_DELIVERY.md) — DRY_RUN/LIVE adapter discipline, masked-recipient pattern, conservative copy rules.
- [PHASE_104_OUTLOOK_LIVE_SEND.md](PHASE_104_OUTLOOK_LIVE_SEND.md) — the canonical reference for the typed `SendEmailV2` swap. Phase 105 reuses it.
- [src/deals/sendBorrowerUpdateEmail.ts](../src/deals/sendBorrowerUpdateEmail.ts) — new governed-write action.
- [src/deals/DraftBorrowerUpdateModal.tsx](../src/deals/DraftBorrowerUpdateModal.tsx) — extended with recipient field, DRY_RUN/LIVE mode badge, Send button, outcome panel. Copy path preserved.
- [src/deals/BorrowerCommunication.tsx](../src/deals/BorrowerCommunication.tsx) — passes the new props through (`dealId`, `systemUserId`, `writeDisabledReason`, `onSendEmail`).
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — new `GOVERNED_WRITES.deal-borrower-update-email` entry; `NOT_WIRED.email-delivery` removed; `LOCAL_ONLY_FLOWS.borrower-update-draft` note rewritten to describe both paths.

---

## 1. Scope

**In scope:**
- New governed write `deal-borrower-update-email` paralleling Phase 61
  / Phase 104's `deal-document-request-email`. One audit row + one
  timeline row + one correlation id per attempt.
- LIVE adapter call is `Office365OutlookService.SendEmailV2(message)`
  with the minimal `ClientSendHtmlMessage`:
  ```ts
  { To: recipient, Subject: subject, Body: body, Importance: 'Normal' }
  ```
  No attachments, Cc, Bcc, From (shared mailbox), ReplyTo, or
  Sensitivity. Pinned by a dedicated `Object.keys(...)` test.
- Outcome mapping mirrors Phase 104 exactly:
  - success → `accepted`
  - 408 / 429 / 5xx / no-status / thrown rejection → `transient-failure`
  - other 4xx → `permanent-failure`
- DraftBorrowerUpdateModal gains a recipient text field, a
  DRY_RUN/LIVE mode badge, a Send button (visible only when
  `onSendEmail` is provided by the parent), and an outcome panel
  covering success / send-failed / governance-partial / unknown.
- `NOT_WIRED.email-delivery` removed. The Phase 64 borrower-portal
  compound NOT_WIRED entry was rewritten to keep blocker (6) honest:
  Phase 104 + Phase 105 wired the SEND paths, but there is still no
  automated borrower-notification path (no scheduled trigger, no
  event-driven push, no inbound-mail sync).
- Discipline sweeps (Phase 46 / 47 / 49 / 50) extended via inventory
  mapping. The new write satisfies every existing invariant
  automatically.

**Explicitly NOT in scope:**
- No document-request email changes (Phase 61 / 104 unchanged).
- No catch-up / activity / relationship summary send. Phase 101
  remains copy-to-clipboard regardless of `EMAIL_MODE`.
- No shared mailbox, no Cc/Bcc, no attachments, no Graph generic, no
  calendar, no inbound mail, no subscriptions.
- No automated trigger. The send is fully banker-initiated.
- No claim of delivery — the action says **"Outlook accepted"**, never
  "delivered" / "sent".

---

## 2. Action layer

[`src/deals/sendBorrowerUpdateEmail.ts`](../src/deals/sendBorrowerUpdateEmail.ts)
is a direct parallel to `sendDocumentRequestEmail.ts`:

| Phase 61 (document-request)                        | Phase 105 (borrower-update)                        |
| -------------------------------------------------- | -------------------------------------------------- |
| Audit event name `'DocumentRequest Outlook Send'`  | Audit event name `'BorrowerUpdate Outlook Send'`   |
| Timeline event type `EmailLogged` (788190001)      | Timeline event type `BorrowerUpdateSent` (788190014) |
| Correlation prefix `'oe'`                          | Correlation prefix `'bue'`                         |
| Outcome `SendDocumentRequestEmailOutcome`          | Outcome `SendBorrowerUpdateEmailOutcome`           |
| Primary failed kind `'send-failed'`                | Primary failed kind `'send-failed'`                |
| Failure pattern `'governance-partial'`             | Failure pattern `'governance-partial'`             |
| `successCarriesIds: true` (mode + maskedRecipient) | `successCarriesIds: true` (mode + maskedRecipient) |

The timeline event type choice is deliberate. The Phase 23 borrower
update generator's header
([src/deals/borrowerUpdateDraft.ts](../src/deals/borrowerUpdateDraft.ts))
explicitly anticipates Phase 105:

> "DealTimelineEvent's eventtype enum has BorrowerUpdateSent (788190014)
> but NO BorrowerUpdateDrafted value. Per the phase-23 guardrail we
> MUST NOT emit BorrowerUpdateSent unless the message was actually
> sent — and we explicitly do not send anything here."

Phase 105 IS that moment. The schema designer reserved 788190014 for
exactly this event, so the action emits 788190014 rather than reusing
Phase 61's `EmailLogged` (788190001). The audit row carries the
verbatim banker-supplied subject + the full recipient + the chosen
template + the banker note — the audit row is the privileged ledger.
The timeline row carries the masked recipient and uses the
conservative "Outlook accepted borrower update to b\*\*\*@example.com"
phrasing in LIVE mode (or "Borrower update prepared for ... Mode:
DRY_RUN; nothing left the client." in DRY_RUN).

The action requires four banker-supplied fields and the dealId +
systemUserId: `dealId`, `systemUserId`, `recipient`, `subject`,
`body`, `bankerNote`, `template`. The banker note is REQUIRED (the
audit row would be uninformative without it; the existing Phase 23
modal already enforced this for Copy).

---

## 3. UI changes (DraftBorrowerUpdateModal)

The modal grew the following surface:

- **Recipient field** (optional for Copy, required for Send). The
  banker types the borrower's email address — `cr664_borrowers` has no
  email column, so we never infer a recipient. The field is empty by
  default.
- **Mode badge** (top-right, mirrors the Phase 61
  `RequestDocumentModal` shape). Shows the current `EMAIL_MODE` so
  the banker cannot mistake DRY_RUN for a real send.
- **Mode banner** (under the title). Explains in plain language what
  Send will and will not do at the current mode.
- **Send button** (alongside Copy). Renders only when the parent
  supplies an `onSendEmail` callback (`BorrowerCommunication.tsx`
  always does). Disabled when:
  - banker note empty,
  - subject empty,
  - body empty,
  - recipient missing/invalid,
  - `systemUserId` undefined (banker write-disabled state — the
    `writeDisabledReason` is surfaced next to the button),
  - safety check flagged prohibited terms (preserved from Phase 23),
  - a Send is in flight (the button label switches to "Sending…").
- **Outcome panel** — success / transient-failure (retryable) /
  permanent-failure (do-not-retry) / governance-partial (CRITICAL —
  Outlook accepted but audit/timeline failed; do not retry).
- **Copy path unchanged** — recipient is optional for Copy, the
  clipboard payload still starts with `Subject: ...`, no Dataverse
  write is emitted by Copy alone. Phase 23 contract preserved.

`BorrowerCommunication.tsx` now passes `dealId`, `systemUserId`,
`writeDisabledReason`, and `onSendEmail: sendBorrowerUpdateEmail` down
into the modal.

---

## 4. Governance & inventory

### Added
- `GOVERNED_WRITES.deal-borrower-update-email` (phase 105, audit ✓,
  timeline ✓). Count: 11 → **12**.
- Phase 46 mapping: `'deal-borrower-update-email' → { file:
  src/deals/sendBorrowerUpdateEmail.ts, prefix: 'bue' }`.
- Phase 47 mapping: `typeName: 'SendBorrowerUpdateEmailOutcome',
  primaryFailedKind: 'send-failed', failurePattern:
  'governance-partial', successCarriesIds: true`.
- Phase 49 mapping: `eventName: 'BorrowerUpdate Outlook Send',
  linksToDeal: true`.
- Phase 50 mapping: `eventTypeConst:
  'TIMELINE_EVENT_TYPE_BORROWER_UPDATE_SENT', eventTypeValue:
  788190014, subtypeHasDomainPrefix: false`.

### Removed
- `NOT_WIRED.email-delivery` — borrower-update was the only blocker,
  and Phase 105 retired it. The governance row no longer reflects
  reality.

### Updated
- `LOCAL_ONLY_FLOWS.borrower-update-draft` label and note rewritten.
  Label flipped from "Borrower update draft" to "Borrower update
  draft (Copy fallback)". Note explains that Copy is still local-
  only (no Dataverse write) and is the operational fallback when
  EMAIL_MODE is DRY_RUN or the banker chooses Copy over Send.
- `NOT_WIRED.borrower-portal` compound entry blocker (6) rewritten.
  Honest about Phase 104 + Phase 105 wiring the LIVE send paths,
  while pinning that the platform still does NOT automate borrower
  notifications (no scheduled trigger, no event-driven push, no
  inbound-mail sync).
- `LOCAL_ONLY_FLOWS.outlook-summary-handoff` note (Phase 101) updated
  to acknowledge both Phase 104 and Phase 105 swaps; the catch-up /
  activity / relationship summary surfaces remain copy-to-clipboard
  by design.

### Unchanged
- `OutlookEmailPort` contract.
- `OutlookSendResult` union.
- `liveAdapter` / `dryRunAdapter` implementations.
- `recipientMasking`, `EMAIL_MODE`, `isLikelyValidEmail`.
- `sendDocumentRequestEmail` (Phase 61) and its outcome union.
- `prepareDocumentRequestHandoff` (Phase 63).
- All Phase 101 summary handoffs.
- All `DELIBERATELY_BLOCKED` entries.

---

## 5. Promotion guardrail

When the operator flips `VITE_EMAIL_MODE=LIVE`:
- The `DraftBorrowerUpdateModal` mode badge reads **Mode: LIVE**.
- Clicking Send calls `Office365OutlookService.SendEmailV2`.
- The audit row records the FULL recipient + template + banker note
  + verbatim banker-supplied subject + correlation id.
- The timeline row uses the MASKED recipient and the
  `BorrowerUpdateSent` (788190014) event type. Phase 23's "no
  `BorrowerUpdateSent` ever emitted" guardrail no longer applies —
  Phase 105 is the moment the schema designer's reserved enum value
  is honestly used.
- On 408 / 429 / 5xx / no-status / thrown rejection the banker sees a
  transient-failure outcome with retry guidance.
- On other 4xx responses the banker sees a permanent-failure outcome
  with do-not-retry guidance.
- On audit/timeline failure after a successful send, the banker sees
  the CRITICAL governance-partial outcome: "the message may already
  be on its way — do not retry."

DRY_RUN remains the default. No environment change ships with this
phase; the mode flip is a separate operational decision.

---

## 6. Scope discipline

Phase 105 is a narrow extension of the same Phase 104 pattern. No new
write surface beyond the borrower-update email itself. No expansion
of `ClientSendHtmlMessage` beyond `To / Subject / Body / Importance`.
The Phase 101 four copy-to-clipboard summaries remain unchanged —
they were deliberately left as Lane-A handoffs, not a stepping stone
toward LIVE sends.

The next natural Phase-106 candidate is **NOT** another Outlook send
expansion. The Phase 103 product checkpoint already flagged that
sibling handoff variants should not be added just because the
pattern exists. Reasonable Phase-106 candidates instead:
- A no-schema Lane-A enrichment (e.g. an admin diagnostic surfacing
  recent borrower-update sends from the audit ledger).
- A governance hardening (e.g. a per-flow rate-limit or duplicate-
  recipient guard for Send).
- A Lane-D / Lane-C upstream-driven phase if either lands.

What Phase 105 explicitly does NOT motivate:
- Automated borrower notifications (still blocked — see
  `NOT_WIRED.borrower-portal` blocker (6)).
- Inbound email logging.
- Borrower portal route.
- Outlook calendar integration.

---

## 7. Verification

- Action unit tests: `src/deals/sendBorrowerUpdateEmail.test.ts` (22
  tests). Pins success / send-failed transient / send-failed
  permanent / invalid-recipient / governance-partial (every variant)
  / unknown / adapter-throw / pre-flight guardrails / correlation-id
  discipline / audit-event-name / timeline-event-type-788190014 /
  masked-vs-full recipient placement / "Outlook accepted" wording.
- Modal tests: `src/deals/DraftBorrowerUpdateModal.test.tsx` (18
  tests). Pins Send button rendering, gating, payload shape (no
  attachments/Cc/Bcc/From/ReplyTo/Sensitivity), outcome rendering,
  in-flight "Sending…" state, write-disabled state, and the
  preserved Copy contract.
- Inventory tests: `src/shared/governance/platformInventory.test.ts`
  (83 tests). Pins the new GOVERNED_WRITES entry, the removed
  NOT_WIRED.email-delivery, the updated count (12), the rewritten
  borrower-portal compound blocker (6).
- Discipline sweeps (Phase 46/47/49/50) all green automatically via
  the inventory mappings.
- Release Readiness Gate test: `src/admin/ReleaseReadinessGate.test.tsx`
  (21 tests). Updated count assertion (11 → 12).
- Full suite: 2242 / 2242 passing across 104 test files.
- `npm run build`: clean.

# Phase 63 — No-Admin Email Handoff Fallback

**Status:** Shipped, gated behind `VITE_EMAIL_MODE=HANDOFF`. The Code
App does **not** send email in this phase. The handoff path lets a
banker prepare a borrower-safe email composition and send it from
their own Outlook client. The audit + timeline rows record the FACT
of the handoff; they do NOT claim a send occurred.

Phase 63 ships entirely on the customer's existing Microsoft 365
license. No connector registration, no tenant-admin permission, no
Power Platform environment change, no Graph API call, no secrets in
the client. The mode is selected at build time and surfaced verbatim
in the modal so a banker can see at a glance which mode they are
operating in.

Related canonical sources:
- [src/deals/emailDelivery/emailHandoff.ts](../src/deals/emailDelivery/emailHandoff.ts) — pure `buildMailtoUrl` + `buildHandoffClipboardText` helpers
- [src/deals/prepareDocumentRequestHandoff.ts](../src/deals/prepareDocumentRequestHandoff.ts) — the Phase 63 governed write
- [src/deals/RequestDocumentModal.tsx](../src/deals/RequestDocumentModal.tsx) — HANDOFF UI rendering and orchestration
- [src/deals/DealDocuments.tsx](../src/deals/DealDocuments.tsx) — wiring of `onPrepareHandoff`
- [src/deals/DealDataProvider.tsx](../src/deals/DealDataProvider.tsx) — `after-document-request-handoff` refresh key
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — `GOVERNED_WRITES.deal-document-request-handoff` (10th entry, Phase 63)
- [PHASE_61_OUTLOOK_EMAIL_DELIVERY.md](PHASE_61_OUTLOOK_EMAIL_DELIVERY.md) — the connector-backed send path (DRY_RUN / LIVE)
- [PHASE_62_OUTLOOK_LIVE_SEND.md](PHASE_62_OUTLOOK_LIVE_SEND.md) — verification of the connector blocker

---

## 1. Why this phase exists

Phase 61 wired a connector-backed Outlook send. Phase 62 verified
that the Office 365 Outlook connector is **not** registered for this
Code App and laid out a 5-step unblock plan. While the schema team
works that plan, the operational handoff path lets bankers continue
sending document-request emails — using their own Outlook client —
**without** waiting on tenant-admin work.

The handoff path is intentionally smaller than the connector path:
the app does not send, does not log delivery, does not retry. It
prepares borrower-safe content, hands it to the banker's local mail
client, and records that the banker performed the handoff. That is
all.

The three concrete things Phase 63 ships:

1. A new build-time mode `HANDOFF` alongside `DRY_RUN` and `LIVE`.
2. A new governed write `deal-document-request-handoff` (audit +
   timeline pair).
3. A modal section with "Open in Outlook" (mailto link) and "Copy
   email" (clipboard fallback) buttons that the banker uses to
   actually deliver the message from Outlook.

---

## 2. The three EmailMode values

| Mode | What it does | What it does NOT do |
|---|---|---|
| `DRY_RUN` | Validates inputs locally; the Phase 61 governed send action records audit + timeline rows as if a real send happened (the audit row records `Mode: DRY_RUN` honestly). | Network call. No real email leaves the client. |
| `LIVE` | Calls the Office 365 Outlook connector through the typed SDK. Today the LIVE adapter is a permanent-failure stub because the connector is unregistered (see [PHASE_62](PHASE_62_OUTLOOK_LIVE_SEND.md)). | Anything until the connector is registered. |
| `HANDOFF` (Phase 63) | Renders mailto + clipboard surfaces; banker sends from their own Outlook client; the action records that a handoff was prepared. | Send email. Touch the connector. Talk to Graph. Retry. |

The mode is read ONCE at module load from `import.meta.env.VITE_EMAIL_MODE`
in [src/deals/emailDelivery/emailMode.ts](../src/deals/emailDelivery/emailMode.ts).
A missing / misspelled env value resolves to `DRY_RUN` — the
conservative default. Any value other than `LIVE` / `HANDOFF`
(case-insensitive) becomes `DRY_RUN`.

---

## 3. What the banker sees

When `VITE_EMAIL_MODE=HANDOFF`:

- The Request Document modal shows the **Mode: HANDOFF** badge.
- The "Send email through Outlook" toggle is **not** rendered (it is
  a DRY_RUN/LIVE control; HANDOFF replaces it).
- A new "Borrower email — Outlook handoff" section shows:
  - Send-to field (full recipient address).
  - Subject field (defaults to "Document request: <doc name>").
  - Two action buttons: **Open in Outlook** (mailto link) and **Copy
    email** (clipboard fallback).
  - A helper line explaining that the app does not send.
- After the banker chooses a method, the primary button label
  changes from "Record request" to "Record request & handoff".
- On click, the app sequences:
  1. `requestDocument` (Phase 22) — stamps `cr664_requestdate`,
     emits its own audit + timeline.
  2. `prepareDocumentRequestHandoff` (Phase 63, this phase) — emits
     a NEW audit + timeline pair recording the handoff method.
- The outcome panel shows two cards: the Phase 22 request outcome,
  and the Phase 63 handoff outcome. The handoff card shows the
  **masked** recipient; the full address lives only on the audit
  row.

When the request itself fails (`doc-failed`), the handoff is NOT
recorded. Recording a handoff for an unrecorded request would be
dishonest.

---

## 4. The governed write contract

`deal-document-request-handoff` is the 10th entry in
`GOVERNED_WRITES`. It conforms to every Phase 46–50 discipline
sweep:

- **Phase 46 correlation-id discipline.** Prefix `'oh'` (outlook
  handoff). The audit row stamps `cr664_correlationid:
  ${correlationId}`. The timeline row embeds
  `correlation:${correlationId}` in `cr664_eventsubtype` (with the
  domain prefix `documentrequest:outlook-handoff-prepared|`).
- **Phase 47 outcome union discipline.** Four canonical branches:
  `success | handoff-failed | governance-partial | unknown`. Same
  shape as the Phase 61 send action.
- **Phase 49 audit payload discipline.** All 10 required fields
  present. Event name `'DocumentRequest Outlook Handoff'`. Field
  name `outlook_handoff_prepared`. The full recipient address goes
  into `cr664_notes` (privileged ledger only).
- **Phase 50 timeline payload discipline.** All 11 required fields.
  `cr664_eventtype = TIMELINE_EVENT_TYPE_NOTE_LOGGED` (788190002),
  which is shared with `deal-document-review` and
  `credit-memo-draft-save` — disambiguated by the domain-prefixed
  subtype (`subtypeHasDomainPrefix: true`).

The 5th regression sweep ([platformInventory.test.ts](../src/shared/governance/platformInventory.test.ts))
pins that the inventory now contains **ten** governed writes
(previously nine).

---

## 5. What the audit + timeline rows say

The wording is intentionally conservative. Phase 45's
`conservativeCopyGuard` rule pins the boundary: no surface may claim
"email sent" or "email delivered" — the app didn't send, and saying
otherwise would be dishonest.

**Audit row** (`cr664_AuditEvent`, privileged ledger):
- `cr664_auditeventname`: `'DocumentRequest Outlook Handoff'`
- `cr664_fieldname`: `'outlook_handoff_prepared'`
- `cr664_beforestate`: `'Outlook handoff not yet prepared'`
- `cr664_afterstate`: `'Outlook handoff prepared (mailto)'` OR
  `'Outlook handoff prepared (clipboard)'`
- `cr664_notes`: `Mode: HANDOFF. Method: mailto. Recipient:
  borrower@example.com. Subject: Document request: PFS.`

**Timeline row** (`cr664_DealTimelineEvent`, banker + manager
visible):
- `cr664_title`: `Document request handoff: <doc name>`
- `cr664_summary`: `Document request handoff prepared for
  b***@e***.com (mailto link opened). The banker sends from Outlook;
  the app did not send.`
- `cr664_eventsubtype`: `documentrequest:outlook-handoff-prepared|correlation:<id>`

Note the masked recipient on the timeline. The full address lives
only in `cr664_notes` on the audit row.

---

## 6. Tests that pin the contract

| File | What it pins |
|---|---|
| [src/deals/emailDelivery/emailMode.test.ts](../src/deals/emailDelivery/emailMode.test.ts) | EMAIL_MODE defaults to DRY_RUN; is one of the three enum members. |
| [src/deals/emailDelivery/emailHandoff.test.ts](../src/deals/emailDelivery/emailHandoff.test.ts) | `buildMailtoUrl` encoding correctness (RFC 6068 round-trip, newlines `%0A`, special chars `?&=#`); `buildHandoffClipboardText` format and the "no sent/delivered wording" rule. |
| [src/deals/prepareDocumentRequestHandoff.test.ts](../src/deals/prepareDocumentRequestHandoff.test.ts) | Action contract — happy path, handoff-failed pre-flight branches (invalid recipient, empty subject/body), governance-partial branches (audit fail, timeline fail, both fail), audit + timeline correlation-id pairing, audit `cr664_notes` carries full recipient, timeline `cr664_summary` carries masked recipient + no "sent" wording, action source contains no Office365 / Graph / Outlook adapter imports. |
| [src/deals/RequestDocumentModal.handoff.test.tsx](../src/deals/RequestDocumentModal.handoff.test.tsx) | Modal UI in HANDOFF mode — Mode badge, mailto URL is RFC 6068, clipboard receives the four-section composition, the "Send email through Outlook" toggle is suppressed even when `onSendEmail` is provided, the outcome panel uses the masked recipient and never the unmasked address, handoff is suppressed when the request fails, handoff-failed and governance-partial outcome rendering. |
| [src/shared/governance/correlationIdDiscipline.test.ts](../src/shared/governance/correlationIdDiscipline.test.ts) | Mapping extension — `deal-document-request-handoff` → `prepareDocumentRequestHandoff.ts` with prefix `'oh'`; all the Phase 46 invariants apply. |
| [src/shared/governance/outcomeUnionDiscipline.test.ts](../src/shared/governance/outcomeUnionDiscipline.test.ts) | Mapping extension — `PrepareDocumentRequestHandoffOutcome` with `handoff-failed` as the primary-failed kind; `RequestDocumentModal.tsx` imports the new outcome type. |
| [src/shared/governance/auditPayloadDiscipline.test.ts](../src/shared/governance/auditPayloadDiscipline.test.ts) | Mapping extension — event name `'DocumentRequest Outlook Handoff'`, deal-domain (linksToDeal=true). |
| [src/shared/governance/timelinePayloadDiscipline.test.ts](../src/shared/governance/timelinePayloadDiscipline.test.ts) | Mapping extension — `TIMELINE_EVENT_TYPE_NOTE_LOGGED` = 788190002 with `subtypeHasDomainPrefix: true`. |
| [src/shared/governance/platformInventory.test.ts](../src/shared/governance/platformInventory.test.ts) | Inventory contains exactly ten governed-write ids (Phase 63 added one). |

---

## 7. What this phase does NOT do

By design:

- **No Power Automate.** No flow is triggered; the audit + timeline
  writes go directly to Dataverse via the typed SDK, same as every
  other governed write.
- **No Graph API.** The mailto: scheme is OS-level; the clipboard is
  browser-level. Neither touches Graph.
- **No connector dependency.** The Phase 61 LIVE-send stub is
  untouched. `prepareDocumentRequestHandoff.ts` does not import
  `outlookEmailAdapters`, `Office365EmailService`, or anything in
  `src/generated/services/` beyond the audit + timeline service
  modules every governed write uses.
- **No borrower portal / no inbound sync.** The customer's borrower
  email arrives in the banker's normal Outlook inbox. The Code App
  does not see it.
- **No AI drafting.** The body is whatever the banker types in the
  Request Note field — verbatim into the mailto URL and the
  clipboard text.
- **No retry / no automation.** A `handoff-failed` outcome is final;
  the banker fixes the input and tries again from the modal.
- **No fake "sent" claim.** The audit + timeline + outcome surfaces
  all use "handoff prepared" wording. The
  `conservativeCopyGuard` Phase 45 rule pins this at the static-source
  level.

---

## 8. Promotion guidance

`HANDOFF` is the recommended operational mode while the Office 365
Outlook connector remains unregistered. Set
`VITE_EMAIL_MODE=HANDOFF` in the production build target. The modal
will read **Mode: HANDOFF** and the audit + timeline rows will
reflect the handoff method honestly.

When the connector lands (Phase 62 §2 swap), the team can:
1. Flip `VITE_EMAIL_MODE=LIVE` and the modal reverts to the Phase 61
   connector-backed send.
2. Choose to keep HANDOFF mode in production indefinitely if the
   handoff path remains the customer's operational preference —
   nothing prevents both paths from coexisting at the codebase
   level. Future bankers can switch by rebuilding with the other
   mode.

The Phase 63 deliverables (helpers, action, modal UI, doc, tests)
do not need to be removed when the connector lands. They are an
independent governed write that records a real, audit-worthy event
(a banker prepared a handoff). Keeping them around preserves the
fallback path in case the connector is later removed.

---

## 9. Build / test snapshot at Phase 63

- Tests: passing (Phase 63 added several new test files; full
  count moves up).
- `npm run build`: clean.
- No production bundle increase from new test files.
- The Phase 62 outlookLiveStubPin regression continues to pass — the
  LIVE adapter is still honestly stubbed; nothing about Phase 63
  flipped LIVE on.

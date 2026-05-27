# Phase 106 — Outlook LIVE Email Mode Release Readiness

**Status:** **Shipped.** No production code change. One new
regression-pin test file
([src/shared/governance/emailLiveReleaseReadiness.test.ts](../src/shared/governance/emailLiveReleaseReadiness.test.ts))
and one new DOM-level test added to
[src/admin/ReleaseReadinessGate.test.tsx](../src/admin/ReleaseReadinessGate.test.tsx)
prove at CI time that flipping `VITE_EMAIL_MODE=LIVE` is operator-
safe for exactly two banker-triggered governed writes:

- `GOVERNED_WRITES.deal-document-request-email` (Phase 61 / 104)
- `GOVERNED_WRITES.deal-borrower-update-email` (Phase 105)

Nothing else changes. Behavior, payload shape, copy discipline,
Phase 101 summary handoffs, automation posture, inbound mail
posture, portal posture, calendar posture — all unchanged.

Related canonical sources:
- [PHASE_104_OUTLOOK_LIVE_SEND.md](PHASE_104_OUTLOOK_LIVE_SEND.md) — first LIVE swap (document-request).
- [PHASE_105_BORROWER_UPDATE_LIVE_SEND.md](PHASE_105_BORROWER_UPDATE_LIVE_SEND.md) — second LIVE swap (borrower-update).
- [src/deals/emailDelivery/outlookEmailAdapters.ts](../src/deals/emailDelivery/outlookEmailAdapters.ts) — the LIVE adapter (single connector callsite).
- [src/deals/sendDocumentRequestEmail.ts](../src/deals/sendDocumentRequestEmail.ts) — first governed-write action.
- [src/deals/sendBorrowerUpdateEmail.ts](../src/deals/sendBorrowerUpdateEmail.ts) — second governed-write action.
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — `GOVERNED_WRITES` + `NOT_WIRED` data.
- [src/shared/governance/emailLiveReleaseReadiness.test.ts](../src/shared/governance/emailLiveReleaseReadiness.test.ts) — the new regression-pin file (41 assertions across six invariants).

---

## 1. Operator-facing email-mode matrix

The operator flips one environment variable: `VITE_EMAIL_MODE`. The
table below is exhaustive — these are the only paths that change
between modes.

### `VITE_EMAIL_MODE=DRY_RUN` (default)

| Surface                                | Path                            | Network call? | Audit row? | Timeline row? |
| -------------------------------------- | ------------------------------- | ------------- | ---------- | ------------- |
| Document-request email                 | Simulated `accepted`            | No            | Yes        | Yes (`EmailLogged` 788190001) |
| Borrower-update email                  | Simulated `accepted`            | No            | Yes        | Yes (`BorrowerUpdateSent` 788190014) |
| Phase 101 catch-up summary handoff     | Copy-to-clipboard               | No            | No         | No            |
| Phase 101 activity summary handoff     | Copy-to-clipboard               | No            | No         | No            |
| Phase 101 relationship summary handoff | Copy-to-clipboard               | No            | No         | No            |
| Borrower-update DRAFT (Phase 23 Copy)  | Copy-to-clipboard               | No            | No         | No            |
| Document-request handoff (Phase 63)    | `mailto:` + clipboard           | No            | Yes        | Yes (handoff governed write) |

### `VITE_EMAIL_MODE=LIVE`

| Surface                                | Path                                            | Network call? | Audit row? | Timeline row? |
| -------------------------------------- | ----------------------------------------------- | ------------- | ---------- | ------------- |
| Document-request email                 | `Office365OutlookService.SendEmailV2`           | Yes           | Yes        | Yes (`EmailLogged` 788190001) |
| Borrower-update email                  | `Office365OutlookService.SendEmailV2`           | Yes           | Yes        | Yes (`BorrowerUpdateSent` 788190014) |
| Phase 101 catch-up summary handoff     | Copy-to-clipboard (unchanged)                   | No            | No         | No            |
| Phase 101 activity summary handoff     | Copy-to-clipboard (unchanged)                   | No            | No         | No            |
| Phase 101 relationship summary handoff | Copy-to-clipboard (unchanged)                   | No            | No         | No            |
| Borrower-update DRAFT (Phase 23 Copy)  | Copy-to-clipboard (unchanged)                   | No            | No         | No            |
| Document-request handoff (Phase 63)    | `mailto:` + clipboard (unchanged)               | No            | Yes        | Yes (handoff governed write) |

### Always unchanged, regardless of mode

- **Phase 101 catch-up summary handoff** — copy-to-clipboard. Pinned
  by `src/banker/BankerMorningCatchUp.tsx` and
  `src/manager/ManagerMorningCatchUp.tsx`. The summary surfaces
  carry no import of `Office365OutlookService` and no call to
  `SendEmailV2`; static-source assertions in Phase 106 enforce this.
- **Phase 101 activity summary handoff** — copy-to-clipboard. Same
  static-source pin via `src/deals/ActivityTimeline.tsx`.
- **Phase 101 relationship summary handoff** — copy-to-clipboard.
  Same static-source pin via `src/banker/RelationshipMemory.tsx`.
- **No automation.** Every send is banker-initiated. There is no
  `setInterval`, `setTimeout`, `CronJob`, scheduled trigger, or
  event-driven push that calls `sendDocumentRequestEmail` or
  `sendBorrowerUpdateEmail`. Static-source assertion pins this.
- **No inbound mail.** Production source contains no
  `OnNewEmail` / `MailboxSubscription` / `SubscribeEmailUpdate` /
  `subscribeWebhook` reference. The app never reads a borrower's
  reply; replies arrive in the banker's own Outlook inbox and are
  not synced.
- **No portal messaging.** Production source contains no import of
  `borrowerPortal` / `magicLink` / `invitationToken` /
  `borrowerInvite` / `borrowerAuth`. `NOT_WIRED.borrower-portal`
  remains the compound block.
- **No delivery guarantee.** The action layer says
  **"Outlook accepted"**. It never says "delivered", "sent",
  "received", or any synonym implying borrower delivery
  confirmation. The Phase 45 conservative-copy guard is still
  green.

---

## 2. Required wording

The single phrase that governs every banker-facing surface and
every audit/timeline summary in LIVE mode:

> **"Outlook accepted"** — meaning the connector accepted the send
> request for handoff. It is **not** a borrower delivery
> confirmation.

What this rules out:
- "Email sent."
- "Email delivered."
- "Borrower notified."
- "Sent to borrower."
- "Delivered to borrower."
- "Outlook synced."

What is allowed:
- "Outlook accepted document request to b\*\*\*@example.com." (Phase 61 timeline summary, LIVE mode.)
- "Outlook accepted borrower update to b\*\*\*@example.com." (Phase 105 timeline summary, LIVE mode.)
- "Document request prepared for b\*\*\*@example.com. Mode: DRY_RUN; nothing left the client." (DRY_RUN timeline summary.)
- "Borrower update prepared for b\*\*\*@example.com. Mode: DRY_RUN; nothing left the client." (DRY_RUN timeline summary.)

Phase 106 static-source assertion in
`emailLiveReleaseReadiness.test.ts` enforces:
1. Each action file's code (comments stripped) contains an
   "Outlook accepted" phrase.
2. Each action file's code (comments stripped) does NOT contain
   the bare word `delivered`.
3. Each action file's code (comments stripped) does NOT contain
   `email was sent` / `email has been sent` / `email was delivered`
   / `email has been delivered`.

---

## 3. The six pinned invariants

The single new test file
[`emailLiveReleaseReadiness.test.ts`](../src/shared/governance/emailLiveReleaseReadiness.test.ts)
organizes 41 assertions into six describe blocks. If any block
fails, the failure name tells the operator which invariant slipped.

**Invariant 1 — `NOT_WIRED.email-delivery` is absent.**
- `NOT_WIRED` contains no entry with id `email-delivery`,
  `outlook-connector-live-send`, `outlook-send`,
  `borrower-update-email`, or `document-request-email`.
- No `NOT_WIRED.reason` text claims "outlook connector is not
  registered" or "outlook LIVE is missing".

**Invariant 2 — `ReleaseReadinessGate` doesn't surface
`email-delivery`.**
- No `NOT_WIRED` label contains "Borrower update email delivery"
  or "outlook ... email delivery".
- The borrower-portal compound entry's reason text explicitly
  acknowledges Phase 104 + Phase 105 swaps and pins that
  automation / inbound / portal remain the gaps.
- A DOM-level assertion in `ReleaseReadinessGate.test.tsx`
  confirms the rendered Capability Inventory has no
  "Borrower update email delivery" / "email-delivery" row.

**Invariant 3 — Outlook LIVE send is bounded to two governed
writes.**
- `GOVERNED_WRITES` contains both expected ids.
- `GOVERNED_WRITES` contains no other id ending in `-email`.
- Exactly one production file imports `Office365OutlookService`
  (`outlookEmailAdapters.ts`).
- Exactly one production file calls
  `Office365OutlookService.SendEmailV2` in CODE
  (`outlookEmailAdapters.ts`).
- No production file calls any `Office365OutlookService` method
  other than `SendEmailV2`.
- `getEmailAdapter()` is consumed by exactly the two action files
  (`sendDocumentRequestEmail.ts` + `sendBorrowerUpdateEmail.ts`).

**Invariant 4 — Phase 101 summary handoffs remain copy-to-
clipboard regardless of `EMAIL_MODE`.**
- The two Phase 101 helper files
  (`src/shared/email/summaryOutlookHandoff.ts` +
  `src/shared/email/SummaryOutlookHandoffButtons.tsx`) and the
  four consumer files
  (`src/banker/BankerMorningCatchUp.tsx`,
  `src/manager/ManagerMorningCatchUp.tsx`,
  `src/deals/ActivityTimeline.tsx`,
  `src/banker/RelationshipMemory.tsx`) each:
  - do NOT import `Office365OutlookService`,
  - do NOT reference `Office365OutlookService.SendEmailV2`,
  - do NOT call `getEmailAdapter()` or import `liveAdapter`.
- `LOCAL_ONLY_FLOWS.outlook-summary-handoff` still says
  "copy-to-clipboard" and "regardless of EMAIL_MODE".

**Invariant 5 — borrower portal / automation / inbound /
subscriptions remain honestly blocked.**
- `NOT_WIRED.borrower-portal` is still present with
  `blockerKind: 'compound'`.
- The borrower-portal reason explicitly says "no automation",
  "no scheduled trigger", "no event-driven push", and "no
  inbound-mail sync".
- No production source contains scheduler / cron / new-email-
  subscription patterns (`setInterval`/`setTimeout` calling the
  send actions; `new CronJob`; `schedule.scheduleJob`;
  `OnNewEmail`; `MailboxSubscription`;
  `SubscribeEmailUpdate`; `subscribeWebhook`).
- No production source imports a borrower-portal route /
  magic-link / invitation / borrower-auth module.

**Invariant 6 — no email payload expansion.**
- The LIVE adapter sets exactly four `ClientSendHtmlMessage`
  fields: `To`, `Subject`, `Body`, `Importance`.
- The LIVE adapter source contains NO key for `Attachments`,
  `Cc`, `Bcc`, `From`, `ReplyTo`, or `Sensitivity` in code.
- The LIVE adapter source contains no shared-mailbox / Graph /
  calendar / inbound vocabulary in code (`sharedMailbox`,
  `SendEmailFromShared`, `microsoftGraph`, `GraphClient`,
  `CalendarEvent`, `GetEmails`, `OnNewEmail`, `GetMailTips`,
  `SubscribeMailbox`).
- Each governed-write action passes ONLY
  `{ recipient, subject: input.subject, body: input.body,
  correlationId }` to the adapter's `send()`.
- Neither action sets `Attachments` / `Cc` / `Bcc` / `ReplyTo` /
  `Sensitivity` anywhere in its code.
- Each action's code contains "Outlook accepted"-flavored
  wording AND does NOT contain `delivered` in code, and does NOT
  claim `email was sent` / `email has been sent` /
  `email was delivered` / `email has been delivered`.

---

## 4. Operator promotion checklist

Before flipping `VITE_EMAIL_MODE=LIVE` in production:

1. Run `npm run build`. Must complete clean.
2. Run `npm test -- --run`. Must complete with **zero failures**.
   In particular, the
   `src/shared/governance/emailLiveReleaseReadiness.test.ts` file
   should report 41 / 41 passing.
3. Confirm the Phase 45 conservative-copy guard
   (`src/shared/governance/conservativeCopyGuard.test.ts`) reports
   zero hits for the `email-delivery-claim` rule.
4. Open the Admin Workspace and confirm the Release Readiness
   Gate Capability Inventory does NOT carry any "Borrower update
   email delivery (Outlook/Graph)" or "Outlook LIVE send" row.
5. Confirm the borrower-portal `NOT_WIRED` row is still present
   (LIVE email mode does NOT imply a borrower portal exists).
6. Confirm the operator understands the matrix in §1 above and the
   wording in §2: LIVE means **"Outlook accepted"**, not delivery
   confirmation. Bankers must continue using the banker note field
   to record context — the audit row is the privileged ledger.
7. **(Added in Phase 109.)** Open the
   **Outlook LIVE Email Diagnostics** card on the Admin Workspace
   and confirm:
   - The mode badge reflects the deployment's actual `EMAIL_MODE`.
   - Document-request and borrower-update LIVE paths both show
     "Code-available".
   - Phase 101 summary handoffs show "Copy-to-clipboard".
   - The "Outlook accepted is connector acceptance, not borrower
     delivery confirmation" warning renders verbatim.
   Then type a non-borrower test recipient (your own inbox or a
   diagnostic mailbox) and click **Run smoke test**. Confirm:
   - The outcome panel reads "Connector accepted the smoke
     message" with `Mode: LIVE`.
   - The test inbox actually received the OGB LOS Outlook smoke
     test message. Acceptance is not delivery confirmation — read
     the inbox.
   See [PHASE_109_EMAIL_LIVE_SMOKE_TEST.md](PHASE_109_EMAIL_LIVE_SMOKE_TEST.md)
   for the full operator workflow.

If any of those steps surfaces an unexpected signal, **do not flip
the mode**. Investigate root cause; either the inventory has
drifted, the conservative-copy discipline has slipped, the LIVE
adapter has been expanded beyond `SendEmailV2(To, Subject, Body,
Importance)`, OR the smoke test exposed a connector / permission /
delivery-policy issue in the deployed environment — all are
release-readiness regressions for LIVE mode and should be
resolved before promotion.

---

## 5. What Phase 106 does NOT do

- Does **not** add a new governed write.
- Does **not** modify the LIVE adapter, the two action files, or
  the modal layer (`RequestDocumentModal`,
  `DraftBorrowerUpdateModal`).
- Does **not** extend `ClientSendHtmlMessage` payload fields.
- Does **not** wire automation, inbound mail, calendar, or
  subscriptions.
- Does **not** claim borrower delivery — "Outlook accepted" wording
  is preserved exactly as Phase 104 / Phase 105 shipped it.
- Does **not** add a UI surface. The operator-facing matrix lives
  in this doc; the in-app surface that consumes it is the existing
  Release Readiness Gate (which automatically reflects the
  inventory).

The deliverable is the regression-pin test file + this doc + a
small DOM-level assertion in the existing gate test + a one-line
acknowledgment in the capability coverage map. Everything else is
already in place from Phase 104 and Phase 105.

---

## 6. Verification

- 41 / 41 assertions pass in
  `src/shared/governance/emailLiveReleaseReadiness.test.ts`.
- 22 / 22 assertions pass in
  `src/admin/ReleaseReadinessGate.test.tsx` (the 22nd is the
  Phase 106 DOM-level pin added in this phase).
- Full suite: **2284 / 2284 passing across 105 test files**.
- `npm run build`: clean.

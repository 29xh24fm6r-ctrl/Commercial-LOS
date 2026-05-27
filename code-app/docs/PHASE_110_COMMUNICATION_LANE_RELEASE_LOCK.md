# Phase 110 — Communication Lane Final Release Lock

**Status:** **Locked.** The banker-triggered Outlook communication
lane (Phases 104–109) is release-locked at CI time. One new test
file (`src/shared/governance/communicationLaneReleaseLock.test.ts`,
134 assertions across 9 invariant blocks) consolidates the
boundary evidence into a single failure-loud file. One small
production reword in `DraftBorrowerUpdateModal.tsx` closed the
last "delivered" false-positive (a JSX negation became a
recipient-agnostic phrasing).

Phase 110 is a verification + documentation phase. No new send
behavior, no new governed write, no new connector call, no new
SendEmailV2 callsite, no payload expansion.

Related canonical sources:
- [PHASE_104_OUTLOOK_LIVE_SEND.md](PHASE_104_OUTLOOK_LIVE_SEND.md) — document-request email LIVE swap
- [PHASE_105_BORROWER_UPDATE_LIVE_SEND.md](PHASE_105_BORROWER_UPDATE_LIVE_SEND.md) — borrower-update email LIVE swap
- [PHASE_106_EMAIL_MODE_RELEASE_READINESS.md](PHASE_106_EMAIL_MODE_RELEASE_READINESS.md) — operator switch boundary pin
- [PHASE_107_COMMUNICATION_ACTIVITY_LEDGER.md](PHASE_107_COMMUNICATION_ACTIVITY_LEDGER.md) — activity-evidence consistency pin
- [PHASE_108_BORROWER_UPDATE_REFRESH.md](PHASE_108_BORROWER_UPDATE_REFRESH.md) — post-send activity refresh
- [PHASE_109_EMAIL_LIVE_SMOKE_TEST.md](PHASE_109_EMAIL_LIVE_SMOKE_TEST.md) — operator smoke-test harness
- [src/shared/governance/communicationLaneReleaseLock.test.ts](../src/shared/governance/communicationLaneReleaseLock.test.ts) — the consolidated lock test file

---

## 1. Completed scope (the slice that is now release-locked)

| Surface | Phase | Behavior at LIVE | Behavior at DRY_RUN |
| --- | --- | --- | --- |
| Document-request email send | 104 | `Office365OutlookService.SendEmailV2` via the typed adapter | Local "accepted" synthesis; no network call |
| Borrower-update email send | 105 | Same adapter, same connector method, same minimal payload | Local "accepted" synthesis; no network call |
| `<BorrowerCommunication />` activity ledger | 107 | Renders the new `EmailLogged` / `BorrowerUpdateSent` rows | Same — DRY_RUN rows render with "nothing left the client" wording |
| Post-send activity refresh | 108 | `refresh('after-borrower-update-email')` fires after the action; row appears immediately | Same |
| Admin Email LIVE Diagnostics smoke test | 109 | Operator-triggered helper exercises the same adapter; reports "Connector accepted" / failure | Operator-triggered helper exercises the same adapter locally; reports DRY_RUN acceptance |
| Operator `VITE_EMAIL_MODE=LIVE` checklist | 106 (+109 step 7) | Operator runs through 7-step checklist before promotion | n/a |

All six surfaces share:
- one connector boundary (one production import + one
  `SendEmailV2` callsite in `outlookEmailAdapters.ts`),
- one minimal `ClientSendHtmlMessage` shape (`To` / `Subject` /
  `Body` / `Importance: 'Normal'`),
- one outcome vocabulary (`accepted` / `transient-failure` /
  `permanent-failure` / `invalid-recipient` / `unknown`),
- one wording rule ("Outlook accepted", never "delivered").

---

## 2. Operator release checklist

Before flipping `VITE_EMAIL_MODE=LIVE` in any environment with
real borrower data:

1. **`npm run build`** completes clean.
2. **`npm test -- --run`** reports zero failures. In particular:
   - `src/shared/governance/emailLiveReleaseReadiness.test.ts`
     (Phase 106 pins) — green.
   - `src/shared/governance/communicationActivityLedger.test.ts`
     (Phase 107 pins) — green.
   - `src/deals/borrowerUpdateRefresh.test.tsx`
     (Phase 108 pins) — green.
   - `src/admin/emailLiveSmokeTest.test.ts` +
     `src/admin/EmailLiveDiagnostics.test.tsx`
     (Phase 109 pins) — green.
   - **`src/shared/governance/communicationLaneReleaseLock.test.ts`
     (Phase 110 lock) — green.** If this file fails, do not
     promote — a boundary has drifted.
3. **Phase 45 conservative-copy guard**
   (`src/shared/governance/conservativeCopyGuard.test.ts`) reports
   zero hits.
4. **Admin Workspace inventory check.** Open the Release Readiness
   Gate Capability Inventory. Confirm:
   - No "Borrower update email delivery" row.
   - No "Outlook connector LIVE send" row.
   - Borrower-portal `NOT_WIRED` row still present (LIVE email
     does NOT imply a portal exists).
5. **Outlook LIVE Email Diagnostics card.** Confirm:
   - Mode badge reflects the deployment's actual `EMAIL_MODE`.
   - Document-request and borrower-update LIVE paths show
     "Code-available".
   - Phase 101 summary handoffs show "Copy-to-clipboard".
   - The "Outlook accepted is connector acceptance, not borrower
     delivery confirmation" warning renders verbatim.
6. **Smoke test.** Type a non-borrower test recipient (your own
   inbox or a diagnostic mailbox), click Run smoke test, confirm
   the outcome panel reads "Connector accepted the smoke message"
   with `Mode: LIVE`, then read the test inbox to verify the
   message actually arrived.
7. **Operator-readable language audit.** Confirm operators
   understand the wording rules in §4 below.

If any step surfaces an unexpected signal, **do not promote**.

---

## 3. Smoke-test workflow (one-page)

```
Admin Workspace
└── Outlook LIVE Email Diagnostics card
    ├── Mode badge ............................. DRY_RUN | LIVE
    ├── Document-request LIVE path ............. Code-available
    ├── Borrower-update LIVE path ............... Code-available
    ├── Phase 101 summary handoffs ............. Copy-to-clipboard
    ├── Warning ................................. "Outlook accepted is connector
    │                                              acceptance, not borrower
    │                                              delivery confirmation."
    └── Operator-triggered smoke test
        ├── Test recipient email ............... [empty by default — operator types]
        ├── Run smoke test ..................... [disabled until recipient typed]
        └── Outcome panel (after click)
            ├── Connector accepted .............. Mode: LIVE → check inbox
            ├── Invalid input ................... Fix recipient and retry
            ├── Transient failure ............... Retry
            ├── Permanent failure ............... Do not retry; investigate
            └── Unknown error ................... Raw error message
```

The smoke test:
- runs ONLY on operator click,
- sends a hardcoded `"OGB LOS Outlook smoke test"` subject + a
  diagnostic body that identifies itself as such,
- emits NO Dataverse / audit / timeline row,
- reuses `getEmailAdapter()` (no second `SendEmailV2` callsite),
- never mentions a borrower or deal in the body.

---

## 4. Honest-language rules

The communication lane uses precisely this vocabulary:

| Surface | LIVE | DRY_RUN |
| --- | --- | --- |
| Action outcome (audit `cr664_afterstate`) | `Outlook send accepted` / `Outlook accepted borrower update` | Same |
| Timeline summary (`cr664_summary`) | `Outlook accepted document request to <masked>.` / `Outlook accepted borrower update to <masked>.` | `Document request prepared for <masked>. Mode: DRY_RUN; nothing left the client.` / `Borrower update prepared for <masked>. Mode: DRY_RUN; nothing left the client.` |
| Modal success outcome | `Outlook accepted document request to <masked>` / `Outlook accepted borrower update to <masked>` | `DRY_RUN: borrower update prepared for <masked>` |
| Smoke-test success outcome | `Connector accepted the smoke message` (mode shown next to it) | Same |
| Mode banner (modal) | "The app reports *Outlook accepted* — meaning the connector took the request for handoff. Acceptance is not proof that the recipient received the message." | "DRY_RUN. Send is wired end-to-end ... but the adapter synthesizes acceptance locally — nothing leaves the client." |
| Diagnostics card warning | "Outlook accepted is connector acceptance, not borrower delivery confirmation." | Same |

**Allowed phrases:**
- "Outlook accepted"
- "Connector accepted"
- "acceptance is not delivery confirmation"
- "not proof that the recipient received the message"
- "nothing left the client" (DRY_RUN-specific)

**Forbidden phrases (CI-enforced across the communication lane):**
- `delivered` (the verb, in any form)
- `email delivered`
- `email was sent` / `email has been sent`
- `sent successfully`
- `borrower was notified` / `borrower has been notified`

**Narrow false-positive handling (documented):**
- The bare word `delivery` is allowed. It only appears in the
  communication lane as part of the honest negation phrase
  "not borrower delivery confirmation" / "not a delivery
  confirmation". The Phase 110 pin forbids `delivered`, not
  `delivery`.
- The Phase 110 pin runs against CODE only — JSDoc and inline
  comments are stripped via the same helper Phase 106 + 107 use.
  Doc comments that describe what is forbidden (e.g. "the modal
  must never claim 'delivered'") legitimately appear in source
  files; stripping comments prevents those from tripping the pin.
- The enum literals `EmailLogged` and `BorrowerUpdateSent`
  contain the substring "Sent" but are not banker-facing
  wording. Phase 110's forbidden patterns are precise phrases
  (`email was sent`, `sent successfully`, etc.), not the bare
  word "sent", so these enum names are not affected.

---

## 5. Out-of-scope at release (CI-enforced)

The Phase 110 lock file forbids these surfaces from appearing
anywhere in production source. Each is enforced by Block 6 of the
test file with a precise regex pattern, scoped to all `.ts` /
`.tsx` files under `src/` excluding `src/generated/` and
`*.test.*`.

| Out-of-scope surface | Pattern enforced |
| --- | --- |
| Shared mailbox | `sharedMailbox` / `SendEmailFromShared(?:Mailbox)?` |
| Graph generic client | `microsoftGraph` / `GraphClient` / `MicrosoftGraphClient` |
| Calendar send / event create / meeting create | `CalendarEvent` / `CalendarEvents` / `CreateMeeting` / `OnlineMeeting` |
| Inbound mail sync | `OnNewEmail` / `MailboxSubscription` / `GetEmails(?:V\d+)?` / `GetMailTips` |
| Subscription / webhook / event push | `SubscribeMailbox` / `SubscribeEmailUpdate` / `subscribeWebhook` / `registerWebhook` |
| Scheduled / automated email send (CronJob / scheduler import) | `new CronJob` / `schedule.scheduleJob` |
| Scheduled / automated email send (timer invoking the action functions) | `setInterval(send…)` / `setTimeout(send…)` |
| Delivery / read tracking | `deliveryReceipt` / `readReceipt` / `trackDelivery` / `messageDelivered` / `messageRead` |

Each is forbidden at CI time. If a future change reintroduces any
of these, Phase 110 Block 6 fails with the specific pattern name
in the error message.

---

## 6. Future work candidates (explicitly NOT shipped)

Phase 110 is a release LOCK, not a roadmap. The following are
documented as future-phase candidates only — none are wired,
none have a governed write, none have a pin file. Each requires
its own brief, its own governance review, and its own release
discipline before any in-repo motion.

| Candidate | What it would unlock | Required upstream | In-repo follow-up |
| --- | --- | --- | --- |
| Borrower portal messaging | Two-way thread; borrower-readable inbox; status updates | External-user auth (Lane D compound) + secure-message schema + invitation/magic-link table | New Code App (workspace-isolation invariant); not this repo |
| Inbound email sync | `EmailLogged` rows from connector callbacks; borrower replies appear on the deal timeline | Power Automate or callback pattern; governance review for incoming-mail visibility scope | New governed write for inbound; new connector method; Lane B + Lane E hybrid |
| Automated reminders | Event-driven or scheduled borrower nudges for outstanding documents / pending review / stale stage | Governance review for "the app independently sending borrower mail" + a scheduler | New governed write per trigger; new audit shape for "system-initiated send" |
| Delivery / read tracking | Operators see whether a recipient opened / received the message | Connector callback for delivery receipts + governance review for tracking-pixel discipline | New schema column on email-send timeline row; new outcome enum value |
| Shared mailbox support | Send-from a team mailbox instead of the banker's UPN | Tenant config + connector permission grant + governance review for "who is the audit `ChangedBy`" | New `SendEmailV2` parameter (`From`); Phase 110 currently forbids this field |
| Phase 101 email delivery | Catch-up / activity / relationship summaries sent through `SendEmailV2` instead of copy-to-clipboard | Governance review for "summary surfaces don't have a typed governed write today" | Four new governed writes (one per summary surface) or a single generic "summary email send" with a strict source-classification field |

Each future-phase candidate should be evaluated against the
question: *what new governance, schema, or admin work does this
require, and is the operational benefit worth it?* Phase 110's
purpose is to make sure the existing lane is solid enough that
adding any of these is a clear additive change, not a remediation.

---

## 7. What Phase 110 does NOT do

- **No new behavior.** The only production source change is a
  one-line reword in `DraftBorrowerUpdateModal.tsx`: the LIVE-mode
  banner's "...not *delivered*" phrasing became "Acceptance is not
  proof that the recipient received the message." Same meaning,
  cleaner vocabulary, and it closes the last `\bdelivered\b`
  false-positive in the communication lane.
- **No new governed write.** GOVERNED_WRITES count remains 12.
- **No new connector call.** Single import; single SendEmailV2
  callsite; three `getEmailAdapter()` consumers (two actions +
  smoke helper).
- **No new email UI.** No new modal; no new card; no new admin
  surface. The Phase 109 diagnostics card is the only operator-
  facing email-mode UI, and Phase 110 did not modify it.
- **No payload expansion.** Phase 110 broadens the existing pin
  across all communication-lane files; nothing was added to any
  payload.
- **No Dataverse mutation changes.** Audit + timeline payloads are
  byte-identical to Phase 107.
- **No Phase 101 handoff changes.** All four summary surfaces
  remain copy-to-clipboard; Phase 110 Block 8 re-asserts this.
- **No automation, no inbound, no portal, no calendar, no shared
  mailbox, no Graph generic, no subscription, no delivery
  tracking.** All forbidden at CI time by Block 6.

---

## 8. Verification

- 134 / 134 assertions in
  `src/shared/governance/communicationLaneReleaseLock.test.ts`
  (Phase 110 lock).
- 41 / 41 assertions in
  `src/shared/governance/emailLiveReleaseReadiness.test.ts`
  (Phase 106 pins still green).
- 49 / 49 assertions in
  `src/shared/governance/communicationActivityLedger.test.ts`
  (Phase 107 pins still green).
- 13 / 13 assertions in `src/deals/borrowerUpdateRefresh.test.tsx`
  (Phase 108 pins still green).
- 15 / 15 assertions in `src/admin/emailLiveSmokeTest.test.ts`
  (Phase 109 helper pins still green).
- 16 / 16 assertions in `src/admin/EmailLiveDiagnostics.test.tsx`
  (Phase 109 card pins still green).
- 18 / 18 assertions in
  `src/deals/DraftBorrowerUpdateModal.test.tsx` (modal banner
  reword preserved every existing pin).
- Full suite: green across all test files.
- `npm run build`: clean.

The Phase 104–110 communication lane is feature-complete and
release-locked for banker-triggered Outlook send.

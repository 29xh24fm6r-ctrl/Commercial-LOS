# Phase 109 — Outlook LIVE Email Operator Smoke-Test Harness

**Status:** **Shipped.** Adds an operator/admin-facing diagnostic
card (`<EmailLiveDiagnostics />`) on the Admin Workspace that
reports the current email-mode posture and provides an OPTIONAL
explicit operator-triggered smoke send. The smoke send reuses the
existing Phase-104 adapter — no new `SendEmailV2` callsite, no new
governed write, no new connector import. Operators can prove the
LIVE Outlook path is usable in the deployed environment before
bankers rely on document-request or borrower-update sends.

Three new files; two existing files touched (small wiring change
in `AdminWorkspace.tsx` + a one-line expansion of the Phase 106
caller-set pin to include the new helper).

Related canonical sources:
- [PHASE_104_OUTLOOK_LIVE_SEND.md](PHASE_104_OUTLOOK_LIVE_SEND.md)
- [PHASE_105_BORROWER_UPDATE_LIVE_SEND.md](PHASE_105_BORROWER_UPDATE_LIVE_SEND.md)
- [PHASE_106_EMAIL_MODE_RELEASE_READINESS.md](PHASE_106_EMAIL_MODE_RELEASE_READINESS.md) — operator checklist updated in this phase.
- [PHASE_107_COMMUNICATION_ACTIVITY_LEDGER.md](PHASE_107_COMMUNICATION_ACTIVITY_LEDGER.md)
- [PHASE_108_BORROWER_UPDATE_REFRESH.md](PHASE_108_BORROWER_UPDATE_REFRESH.md)
- [src/admin/emailLiveSmokeTest.ts](../src/admin/emailLiveSmokeTest.ts) — pure helper.
- [src/admin/EmailLiveDiagnostics.tsx](../src/admin/EmailLiveDiagnostics.tsx) — admin card.
- [src/admin/emailLiveSmokeTest.test.ts](../src/admin/emailLiveSmokeTest.test.ts) — 15 helper unit tests.
- [src/admin/EmailLiveDiagnostics.test.tsx](../src/admin/EmailLiveDiagnostics.test.tsx) — 16 card UI tests.
- [src/workspaces/AdminWorkspace.tsx](../src/workspaces/AdminWorkspace.tsx) — new card mounted after Stage Governance Diagnostics, before Performance Diagnostics.

---

## 1. The diagnostic card — what it shows

`<EmailLiveDiagnostics />` is a sibling card to the Release
Readiness Gate / Configuration Overview / Stage Governance
Diagnostics / Performance Diagnostics surfaces on the Admin
Workspace. It renders four blocks:

### Block 1 — Current email mode
A mode badge in the card header reads `Mode: DRY_RUN` or
`Mode: LIVE`. Tinted to make LIVE visually distinct.

### Block 2 — Code-availability of the governed send paths
Three rows, each with a status badge and a one-line operator-
readable detail:

| Surface | Status | Detail |
| --- | --- | --- |
| Document-request email LIVE path | Code-available | Wired by Phase 104 through the typed Outlook send adapter. LIVE-mode sends emit one audit row + one EmailLogged timeline row per attempt. |
| Borrower-update email LIVE path | Code-available | Wired by Phase 105 through the same typed Outlook send adapter as document-request. LIVE-mode sends emit one audit row + one BorrowerUpdateSent timeline row per attempt. |
| Phase 101 summary handoffs | Copy-to-clipboard | Catch-up, activity, and relationship summary handoffs are copy-to-clipboard regardless of EMAIL_MODE. They do not call SendEmailV2; flipping LIVE does not change their behavior. |

### Block 3 — The "Outlook accepted" warning
A standing note rendered above the smoke-test form:

> **"Outlook accepted" is connector acceptance, not borrower
> delivery confirmation.** A successful smoke test means the
> connector took the request for handoff. It does NOT prove the
> test recipient received the message. Read the actual test inbox
> to verify receipt.

### Block 4 — Operator-triggered smoke test (optional)
A form with one input (test recipient email) and one button (Run
smoke test). Both default to inert state:
- Recipient field is empty by default.
- Run button is disabled until the operator types a recipient.

When the operator clicks Run, the card calls
`runEmailLiveSmokeTest({ recipient })`. The button label switches
to "Running smoke test…" until the helper resolves; the outcome
panel renders the result.

---

## 2. The smoke-test helper — what it does

`src/admin/emailLiveSmokeTest.ts` exports a pure async function:

```ts
runEmailLiveSmokeTest(
  input: { recipient: string },
  deps?: { adapter?: OutlookEmailPort },
): Promise<EmailLiveSmokeTestOutcome>
```

Behavior:
1. Trims the recipient. If empty → returns `kind: 'invalid-input'`
   with a "type a recipient" reason. Adapter is not invoked.
2. Runs the existing `isLikelyValidEmail` shape check. If
   malformed → returns `kind: 'invalid-input'`. Adapter is not
   invoked.
3. Otherwise: resolves the adapter (injected, or
   `getEmailAdapter()` for production), and calls `adapter.send()`
   with the hardcoded smoke message:
   ```ts
   {
     recipient,
     subject: 'OGB LOS Outlook smoke test',
     body: '<<hardcoded smoke disclaimer>>',
     correlationId: `phase-109-smoke-${Date.now().toString(36)}`,
   }
   ```
4. Maps the adapter's `OutlookSendResult` to a smoke-specific
   outcome union:
   - adapter `accepted` → `{ kind: 'accepted', mode }`
   - adapter `invalid-recipient` → `{ kind: 'invalid-input', reason }`
   - adapter `transient-failure` → `{ kind: 'transient-failure', reason, mode }`
   - adapter `permanent-failure` → `{ kind: 'permanent-failure', reason, mode }`
   - thrown rejection → `{ kind: 'unknown', message }`

The hardcoded subject and body are exported as
`EMAIL_LIVE_SMOKE_TEST_SUBJECT` and `EMAIL_LIVE_SMOKE_TEST_BODY`
so tests can pin them exactly.

The smoke body is:

> This is an operator-triggered smoke test from the Old Glory
> Bank Loan Origination System (Code App). It exercises the
> Outlook connector send path with no Dataverse, audit, or
> workflow context.
>
> If you received this message in error, please discard it. No
> follow-up action is required.
>
> — OGB LOS Admin Diagnostics

Carefully chosen so:
- A recipient who receives the message understands it's a
  diagnostic.
- The body does not contain `borrower` or `deal` vocabulary in a
  way that could be misread as banker-to-borrower communication.
- The body does not claim delivery / send / notification.

---

## 3. Adapter reuse — no second `SendEmailV2` call site

The helper imports `getEmailAdapter` from
`src/deals/emailDelivery/outlookEmailAdapters.ts` — the same
function the two Phase 104/105 governed-write actions consume.
The helper does NOT import `Office365OutlookService` directly.

Phase 106 invariants this preserves:
- **"Exactly one production source file imports
  `Office365OutlookService`"** — still
  `outlookEmailAdapters.ts`. Phase 109 helper imports
  `getEmailAdapter`, not the connector.
- **"Exactly one production source file calls
  `Office365OutlookService.SendEmailV2` in CODE"** — still
  `outlookEmailAdapters.ts`. Phase 109 helper calls
  `adapter.send()`.
- **"No production source file calls any
  `Office365OutlookService` method OTHER than `SendEmailV2`"** —
  still holds; Phase 109 helper calls no `Office365OutlookService`
  method at all.

Phase 106 invariant Phase 109 changes:
- **`getEmailAdapter()` caller set: was [
  `sendDocumentRequestEmail.ts`, `sendBorrowerUpdateEmail.ts` ],
  now includes `src/admin/emailLiveSmokeTest.ts`.** The
  expansion is justified in the test's comment and pinned in the
  updated assertion. The smoke helper is not a governed write; it
  reuses the adapter to avoid introducing a second `SendEmailV2`
  callsite.

All four Phase 101 handoff invariants (Block 4 of Phase 106) are
unchanged — the summary surfaces still do not import the
connector or call `getEmailAdapter()`.

---

## 4. What the smoke test deliberately does NOT do

The brief's out-of-scope list is enforced by code structure and
test assertions:

| Out-of-scope item | How it's enforced |
| --- | --- |
| Automation | The helper has no `setInterval` / `setTimeout` / `CronJob`. The card renders no auto-run UI. |
| Scheduled send | No scheduler import. No persistent state. |
| Inbound mail | No `OnNewEmail` / `MailboxSubscription` / `SubscribeEmailUpdate`. |
| Borrower portal | No `borrowerPortal` / `magicLink` / `invitationToken` import. |
| Delivery / read tracking | Outcome panel explicitly says "acceptance is not delivery confirmation". |
| Shared mailbox | Helper sets no `From` field on the payload. |
| Graph generic | No `GraphClient` / `microsoftGraph` import. |
| Calendar | No `CalendarEvent` reference. |
| Subscriptions | No subscription method call. |
| Phase 101 email delivery | The four Phase 101 surfaces are unchanged. |
| New banker-facing send path | The card lives on the Admin Workspace only; no banker workspace touches it. |
| New governed write | No `GOVERNED_WRITES` entry added. |
| New audit row | The helper does not import `Cr664_auditeventsService`. |
| New timeline row | The helper does not import `Cr664_dealtimelineeventsService`. |
| New payload field | The helper passes `{ recipient, subject, body, correlationId }` to the adapter — exactly the existing `OutlookEmailInput` shape. No `Attachments` / `Cc` / `Bcc` / `From` / `ReplyTo` / `Sensitivity` anywhere. |

---

## 5. Test coverage

### `src/admin/emailLiveSmokeTest.test.ts` (15 helper tests)

- **Pre-flight validation (4 tests).** Empty / whitespace-only /
  malformed recipient → returns `invalid-input`, adapter is not
  invoked. Well-formed recipient → adapter is invoked exactly
  once.
- **Adapter call shape (4 tests).** Helper passes EXACTLY
  `recipient` / `subject` / `body` / `correlationId` to the
  adapter (no payload expansion). Subject is the hardcoded
  `OGB LOS Outlook smoke test` string. Body matches the
  hardcoded smoke disclaimer (mentions "smoke test", "Old
  Glory Bank", "OGB LOS Admin Diagnostics"; does NOT contain
  `borrower` / `deal`). Correlation id begins with
  `phase-109-smoke-`.
- **Outcome classification (6 tests).** adapter `accepted` →
  `accepted` with the adapter mode; LIVE mode flows through;
  `transient-failure` / `permanent-failure` carry their reason
  + mode; `invalid-recipient` folds to `invalid-input`; thrown
  rejection → `unknown` with the error message.
- **Conservative-copy discipline (1 test).** Subject + body
  contain no `delivered` / `email sent` / `borrower notified`.

### `src/admin/EmailLiveDiagnostics.test.tsx` (16 card tests)

- **Renders posture + warning without running anything (6 tests).**
  Helper is NOT invoked on render. Mode badge shows current
  `EMAIL_MODE`. Both governed-write rows render. Phase 101 row
  pins copy-to-clipboard regardless of mode. The "Outlook
  accepted is connector acceptance, not borrower delivery
  confirmation" warning is present verbatim. The
  "Operator-only · explicit" badge is present.
- **Smoke test is operator-triggered only (4 tests).** Run
  button disabled until the operator types a recipient. Clicking
  a disabled Run does nothing. Valid click invokes the helper
  exactly once with the typed recipient. Button label switches to
  "Running smoke test…" during the in-flight period.
- **Outcome rendering uses honest acceptance language (6 tests).**
  `accepted` → "Connector accepted the smoke message" — no
  `delivered` anywhere in DOM. `invalid-input` / `transient-failure`
  / `permanent-failure` / `unknown` each render with appropriate
  copy. A final assertion confirms the rendered DOM never
  contains `delivered` / `email sent` / `borrower was notified`
  regardless of outcome.

### Updated Phase 106 pin

`src/shared/governance/emailLiveReleaseReadiness.test.ts` — the
`getEmailAdapter()` caller-set assertion was expanded from two
files (the governed-write actions) to three (adding the new
smoke helper). All other Phase 106 pins are unchanged and
still green.

---

## 6. Operator workflow

A release reviewer / admin who wants to verify LIVE mode is
usable in the deployed environment:

1. Sign into the Admin Workspace.
2. Scroll to the **Outlook LIVE Email Diagnostics** card.
3. Read the mode badge. If it says `Mode: DRY_RUN`, that's the
   default — no LIVE send will leave the client. The smoke test
   in DRY_RUN exercises the adapter pipeline locally; the
   accepted outcome will say "Mode: DRY_RUN" so the operator
   knows nothing actually reached Outlook.
4. To exercise the LIVE connector path: the deployment must have
   `VITE_EMAIL_MODE=LIVE` set, and the operator must explicitly
   type a non-borrower test recipient (their own inbox or a
   diagnostic mailbox) and click "Run smoke test".
5. Read the outcome panel:
   - `Connector accepted` → check the test inbox to verify the
     message arrived. Acceptance is not delivery confirmation.
   - `Invalid input` → fix the recipient and retry.
   - `Transient failure` → retry; the connector or network
     hiccupped.
   - `Permanent failure` → investigate; likely a permission /
     mailbox / payload validation issue.
   - `Unknown error` → the adapter threw; the message carries
     the raw error text.
6. If accepted AND the test inbox received the message → LIVE
   mode is usable for the deployed environment. The Phase 104
   document-request path and the Phase 105 borrower-update path
   will use the same adapter the smoke test just exercised.
7. If accepted but the inbox didn't receive → investigate at the
   transport layer (connector permissions, recipient filters,
   delivery policy). The app cannot help further from here.

---

## 7. Verification

- 15 / 15 assertions in `emailLiveSmokeTest.test.ts`.
- 16 / 16 assertions in `EmailLiveDiagnostics.test.tsx`.
- 41 / 41 assertions in `emailLiveReleaseReadiness.test.ts`
  (Phase 106 pins, with the one expanded caller-set assertion).
- Full suite still green.
- `npm run build`: clean. Bundle delta is the new helper + card
  (small).

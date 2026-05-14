# Phase 62 — Outlook Connector LIVE Send (verification + unblock plan)

**Status:** **NOT unblocked yet.** Office 365 Outlook connector is still
not registered for this Code App. LIVE `sendDocumentRequestEmail`
continues to return a permanent-failure with the "connector not
registered" reason. DRY_RUN remains the operational default and is
unchanged.

This phase is the **honest verification** that the Phase 61
scaffolding holds and that the upstream blocker is precisely
identified. No production code changes; one regression-pin test
added so an accidental half-implementation cannot land silently.

Related canonical sources:
- [PHASE_61_OUTLOOK_EMAIL_DELIVERY.md](PHASE_61_OUTLOOK_EMAIL_DELIVERY.md) — the full email-delivery design
- [src/deals/emailDelivery/outlookEmailAdapters.ts](../src/deals/emailDelivery/outlookEmailAdapters.ts) — `liveAdapter` with the swap-comment block
- [src/deals/sendDocumentRequestEmail.ts](../src/deals/sendDocumentRequestEmail.ts) — the governed write that consumes the adapter
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — `GOVERNED_WRITES.deal-document-request-email` + `NOT_WIRED.outlook-connector-live-send`

---

## 1. What I verified

### Connector registration: **not present**

Search of `src/generated/services/` for any file matching
`Office365*`, `*Email*`, `*Graph*`, or `*Outlook*` returned **zero
matches**. The Office 365 Outlook connector has not been registered
in the Power Platform environment, and the SDK has not been
regenerated.

This matches the Phase 61 doc's expectation: the
`outlook-connector-live-send` NOT_WIRED entry remains accurate.

### LIVE adapter posture: still honestly stubbed

[`liveAdapter.send`](../src/deals/emailDelivery/outlookEmailAdapters.ts)
contains the same Phase 61 stub:

- Pre-flight `isLikelyValidEmail` check → returns `invalid-recipient`
  if the address is obviously malformed
- Otherwise → returns `permanent-failure` with the
  `LIVE_CONNECTOR_NOT_REGISTERED` reason string

The reason text is precise:

> "Office 365 Outlook connector is not yet registered for this Code
> App. LIVE mode is wired end-to-end (audit + timeline + outcome
> union); the missing piece is the connector registration + SDK
> regeneration. See docs/PHASE_61_OUTLOOK_EMAIL_DELIVERY.md for the
> unblock checklist."

The swap code (commented) is preserved inline in the adapter for
the eventual one-file change.

### Governance discipline: still aligned

All five inventory-driven discipline sweeps continue to pass with
`deal-document-request-email` mapped:

- Phase 46 correlation-id discipline — prefix `'oe'`
- Phase 47 outcome union discipline — four canonical branches
  (`success | send-failed | governance-partial | unknown`)
- Phase 49 audit payload discipline — event name
  `'DocumentRequest Outlook Send'`
- Phase 50 timeline payload discipline — `EmailLogged` event type
  (788190001), correlation embedding
- Phase 48 isolation — the email scaffolding lives entirely under
  `src/deals/emailDelivery/`; no cross-role imports

### DRY_RUN behavior: unchanged

The DRY_RUN adapter validates inputs locally and returns
`{ kind: 'accepted', providerMessageId: undefined }` without
touching the network. The modal continues to render the **Mode:
DRY_RUN** badge so bankers see exactly what mode they're operating
in.

### Build / tests: clean

- 784 → 794 tests passing (the 10 new tests are the Phase 62
  regression-pin tests; see §3 below)
- `npm run build` clean
- No production code changed; bundle delta is from the new test
  file only (which does not enter the production bundle)

---

## 2. The exact unblock plan

Once the Outlook connector lands upstream, the swap is a
**single-file change** in [`outlookEmailAdapters.ts`](../src/deals/emailDelivery/outlookEmailAdapters.ts).

### Step 1 — Power Platform environment (upstream, outside this repo)
- Register the Office 365 Outlook connector for the Code App.
  This is done in the Power Platform environment, not by editing
  the repo.
- Verify the connector appears in the Code App's data-source
  list.

### Step 2 — Regenerate the SDK (upstream)
- Run the SDK regeneration command (`pac modelbuilder build` or
  the equivalent active command for this project).
- Verify `src/generated/services/Office365EmailService.ts` (or
  the actual generated name) appears in the typed SDK output.
- Note the exact exported method name. Likely candidates:
  `sendEmailV2`, `SendEmailV2`, `sendMail`. The Phase 61 swap
  comment assumes `sendEmailV2`; adjust if the actual method is
  named differently.

### Step 3 — Replace the LIVE stub (in-repo, one file)

Open `src/deals/emailDelivery/outlookEmailAdapters.ts` and replace
the `liveAdapter.send` body. The current stub is:

```ts
// after the isLikelyValidEmail check:
return {
  kind: 'permanent-failure',
  reason: LIVE_CONNECTOR_NOT_REGISTERED,
};
```

Replace with the typed call (the exact shape is inline in the
adapter as a comment block):

```ts
import { Office365EmailService } from '../../generated/services/Office365EmailService';
// ...
const result = await Office365EmailService.sendEmailV2({
  to: input.recipient,
  subject: input.subject,
  body: input.body,
  importance: 'Normal',
});
return result.success
  ? { kind: 'accepted', providerMessageId: result.data?.id }
  : classifyTransportError(result.error);
```

`classifyTransportError(err)` is a small helper to add at swap
time. Conservative default behavior:

- HTTP 429 / 503 / network-timeout errors → `{ kind: 'transient-failure', reason }`
- Everything else → `{ kind: 'permanent-failure', reason }`

The action's existing `send-failed` outcome already carries a
`transient: boolean` field that the caller / banker can use to
decide whether to retry. Conservative mapping reduces the risk of
silent retries that compound a real failure.

### Step 4 — Update tests
- Remove the regression pin added in this phase (see §3) — once
  the LIVE adapter is real, it should not always return
  permanent-failure.
- Add LIVE-path tests that mock the new service:
  - Service success → adapter returns `accepted` with the
    provider message id
  - Service rejects with a 429 → adapter returns
    `transient-failure`
  - Service rejects with a 5xx → adapter returns
    `transient-failure`
  - Service rejects with a 4xx → adapter returns
    `permanent-failure`
  - Recipient is malformed → adapter returns `invalid-recipient`
    (existing behavior — no service call)

The DRY_RUN tests need no change.

### Step 5 — Promotion checklist update
- Set `VITE_EMAIL_MODE=LIVE` in the production build target.
- The mode badge in `RequestDocumentModal` will read **Mode:
  LIVE** so bankers see they're sending real email.
- Remove the `outlook-connector-live-send` entry from
  `NOT_WIRED` in `platformInventory.ts` — the connector is now
  registered AND used.
- Update [STABILIZATION_CHECKLIST.md](STABILIZATION_CHECKLIST.md)
  test count and schema-gap table.

That is the complete change set. No other files are affected.
The `sendDocumentRequestEmail` action, the modal, the audit /
timeline payloads, the outcome union, the discipline sweeps — all
stable.

---

## 3. What this phase shipped (in-repo only)

### Regression pin
- [src/shared/governance/outlookLiveStubPin.test.ts](../src/shared/governance/outlookLiveStubPin.test.ts) —
  10 small static-source + behavioral assertions that pin the
  current honest-stub state:
  1. `liveAdapter.send` with a valid recipient returns
     `kind: 'permanent-failure'`
  2. The returned reason matches `LIVE_CONNECTOR_NOT_REGISTERED`
     verbatim (so anyone changing the text gets a loud signal)
  3. `liveAdapter.send` with a malformed recipient returns
     `kind: 'invalid-recipient'` (pre-flight check still works)
  4. `liveAdapter.mode === 'LIVE'`
  5. `dryRunAdapter.mode === 'DRY_RUN'` and still returns
     `accepted` on valid input
  6. `outlookEmailAdapters.ts` static source still contains the
     swap-code-comment block (so a partial implementation cannot
     silently land — the comment is the "this is what to replace
     with" anchor)
  7. `src/generated/services/` does NOT contain any
     `Office365*` / `*Email*Service` file (the upstream blocker
     is still in place; if this fails, the connector WAS
     registered and someone should run the Step 3–5 swap)
  8. `NOT_WIRED.outlook-connector-live-send` is still present in
     `platformInventory.ts`
  9. `GOVERNED_WRITES.deal-document-request-email` is still
     present (the write itself shipped in Phase 61 — Phase 62
     does not regress that)
  10. The `LIVE_CONNECTOR_NOT_REGISTERED` reason string references
      Phase 61's unblock doc by path

When the Outlook connector lands upstream, this entire test file
gets deleted in the same commit that swaps the stub. Until then it
is the trip-wire: any half-implementation, accidental rewrite, or
silent state change fails CI.

### No production code changes
- `sendDocumentRequestEmail.ts` — unchanged
- `outlookEmailAdapters.ts` — unchanged
- `outlookEmailPort.ts` — unchanged
- `recipientMasking.ts` — unchanged
- `RequestDocumentModal.tsx` — unchanged
- `DealDocuments.tsx` — unchanged
- `DealDataProvider.tsx` — unchanged
- `platformInventory.ts` — unchanged

The Phase 62 commit contains: this doc, the regression pin, and
nothing else.

---

## 4. Promotion guardrail

**Do not flip `VITE_EMAIL_MODE=LIVE` in production until Step 3 of
the unblock plan is complete.** Today, flipping LIVE would cause
every document-request email to return `send-failed` (with a
banker-readable reason in the audit notes, so it's recoverable —
but it would be every send, not just a subset). The audit row
captures the failure precisely; the banker workflow can continue
because the `deal-document-request` write (the request-date stamp)
runs first and is independent of the email-send write.

DRY_RUN is the safe default. Set `VITE_EMAIL_MODE=LIVE` only after
the connector is registered AND the adapter swap lands AND the
new LIVE-path tests are green.

---

## 5. Recommended next operational phase

The handoff brief
([PHASE_60_OPERATIONAL_HANDOFF.md](PHASE_60_OPERATIONAL_HANDOFF.md))
lists three prioritized schema asks. Phase 62 makes one of them —
"Register the Office 365 Outlook connector" — explicit and
mechanically obvious:

1. **(Now P1)** Register the Office 365 Outlook connector +
   regenerate the SDK + execute the 4-step unblock above. The
   highest-leverage upstream change because the full app-side
   wiring is already in place; this is a one-file swap once the
   schema team is ready.
2. (Was P1) File column on `cr664_DocumentChecklist` — unlocks
   binary document upload.
3. (Was P2) Stage progression schema — unlocks Advance Stage
   write.

All three remain blocked at the schema/environment layer outside
this repo.

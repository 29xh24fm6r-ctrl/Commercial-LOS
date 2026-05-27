# Phase 108 — Borrower Communication Refresh After Borrower-Update Send

**Status:** **Shipped.** Closes the documented Phase 107 UX gap. When
a banker sends a borrower-update email from
`DraftBorrowerUpdateModal`, the activity ledger now reloads so the
new `BorrowerUpdateSent` timeline row becomes visible on the
existing `<BorrowerCommunication />` card without a manual page
refresh. Mirrors the Phase 104 document-request wiring exactly.

Phase 108 is a narrow behavior change — no new send path, no new
governed write, no new Outlook connector import, no email payload
expansion. Three files touched in production source; one new test
file added.

Related canonical sources:
- [PHASE_104_OUTLOOK_LIVE_SEND.md](PHASE_104_OUTLOOK_LIVE_SEND.md)
- [PHASE_105_BORROWER_UPDATE_LIVE_SEND.md](PHASE_105_BORROWER_UPDATE_LIVE_SEND.md)
- [PHASE_106_EMAIL_MODE_RELEASE_READINESS.md](PHASE_106_EMAIL_MODE_RELEASE_READINESS.md)
- [PHASE_107_COMMUNICATION_ACTIVITY_LEDGER.md](PHASE_107_COMMUNICATION_ACTIVITY_LEDGER.md) — documents the gap that Phase 108 closes.
- [src/deals/DealDataProvider.tsx](../src/deals/DealDataProvider.tsx) — new `'after-borrower-update-email'` `DealDataKey` + switch case.
- [src/deals/BorrowerCommunication.tsx](../src/deals/BorrowerCommunication.tsx) — new `handleSendBorrowerUpdate` wrapper.
- [src/deals/borrowerUpdateRefresh.test.tsx](../src/deals/borrowerUpdateRefresh.test.tsx) — 13 runtime + static-source assertions.

---

## 1. What changed

### `src/deals/DealDataProvider.tsx`

Added one entry to the `DealDataKey` union and one case to the
`refresh()` switch:

```ts
case 'after-borrower-update-email':
  // Phase 108: targeted reload after the Phase-105 borrower-
  // update Outlook send. Same shape as the Phase-104 document-
  // request reload — no document checklist or task row changed;
  // only the activity timeline picks up the new BorrowerUpdateSent
  // (788190014) event. The deal record itself is unchanged.
  reloadActivity();
  break;
```

The new case reloads only the activity ledger — the same surgical
shape the Phase 104 document-request refresh uses. The deal record,
documents, tasks, and credit memo are unchanged by a borrower-
update email send, so reloading them would be wasted work and a
needless render churn.

### `src/deals/BorrowerCommunication.tsx`

The card already mounts `DraftBorrowerUpdateModal` and was passing
`sendBorrowerUpdateEmail` directly as the `onSendEmail` prop. Phase
108 replaces that with a wrapper that calls `refresh()` after the
action returns:

```ts
const { deal, activity, documents, tasks, refresh } = useDealData();

const handleSendBorrowerUpdate = useCallback(
  async (input: SendBorrowerUpdateEmailInput) => {
    if (!banker?.systemUserId) {
      return {
        kind: 'unknown' as const,
        message:
          'Cannot send: missing system user id. The modal Send button should already be disabled in this state.',
      };
    }
    const outcome = await sendBorrowerUpdateEmail(input);
    refresh('after-borrower-update-email');
    return outcome;
  },
  [banker?.systemUserId, refresh],
);
```

Behaviorally identical to the Phase 104 `handleSendEmail` in
[`DealDocuments.tsx`](../src/deals/DealDocuments.tsx):
- Pre-flight gate runs FIRST. If `systemUserId` is missing
  (banker write-disabled state) the wrapper returns an `unknown`
  outcome WITHOUT calling the action and WITHOUT calling refresh.
  Defense-in-depth — the modal's Send button is already disabled
  in this state, so this branch is unreachable through normal UI
  paths.
- If the gate passes, the action runs, the wrapper awaits, and
  `refresh('after-borrower-update-email')` fires once. This
  happens REGARDLESS of the action's outcome kind, mirroring
  Phase 104: `success`, `send-failed`, `governance-partial`, and
  action-internal `unknown` all trigger refresh because the
  action ran to completion and the audit ledger may have shifted.

The wrapper is wrapped in `useCallback` keyed on
`banker?.systemUserId` and `refresh` so the modal doesn't see a
new function identity per render.

### `src/deals/DealDocuments.tsx`

**Unchanged.** Phase 104 wiring (`refresh('after-document-request-email')`
and `refresh('after-document-request-handoff')`) is unchanged.

### `src/deals/sendBorrowerUpdateEmail.ts`

**Unchanged.** The action is identical to what Phase 105 shipped —
same outcome union, same audit/timeline emissions, same
correlation-id discipline, same masked recipient.

### `src/deals/DraftBorrowerUpdateModal.tsx`

**Unchanged.** The modal still calls `onSendEmail` exactly as
Phase 105 wired it. It does not know about `refresh()`; the parent
component owns ledger invalidation.

---

## 2. What is preserved (Phase 104–107 invariants)

Phase 108 is refresh wiring only. None of the prior invariants
change:

- No new governed write. `GOVERNED_WRITES` is unchanged (still 12
  entries).
- No new SendEmailV2 call. The connector boundary is identical.
- No new Outlook connector import. `BorrowerCommunication.tsx`
  does not import `Office365OutlookService`; Phase 108 static-
  source pin enforces this.
- No payload expansion. The wrapper passes through the same
  `SendBorrowerUpdateEmailInput` the modal builds —
  `{ dealId, systemUserId, recipient, subject, body, bankerNote,
  template }` — unchanged.
- No `Attachments` / `Cc` / `Bcc` / `From` / `ReplyTo` /
  `Sensitivity` fields added anywhere; Phase 108 static-source pin
  enforces this on `BorrowerCommunication.tsx`.
- No automation, inbound mail, portal messaging, delivery
  tracking, calendar, subscriptions, shared mailbox, or Graph
  generic surface added.
- No Phase 101 summary handoff changes. The four copy-to-
  clipboard surfaces remain unchanged.
- Phase 106 regression-pin file
  (`emailLiveReleaseReadiness.test.ts`) and Phase 107 governance
  evidence file (`communicationActivityLedger.test.ts`) both
  remain green — Phase 108 only adds plumbing, it doesn't shift
  any of the boundaries those pins watch.

---

## 3. Test coverage

`src/deals/borrowerUpdateRefresh.test.tsx` ships **13 assertions**
across four describe blocks:

### Send completion refreshes the activity ledger (4 tests)
- LIVE success → refresh fires once with the new key.
- DRY_RUN success → refresh fires (the timeline row IS written
  even in DRY_RUN; the operator should see it).
- `send-failed` → refresh fires (mirrors document-request
  pattern; the failed audit row was written).
- `governance-partial` → refresh fires (whatever did land
  should be visible).

### Refresh does NOT fire when the action is not invoked (3 tests)
- Missing recipient: Send button stays disabled, action is not
  called, refresh is not called with the new key.
- Missing `systemUserId`: Send button stays disabled, action is
  not called, refresh is not called with the new key.
- Copy path: clicking Copy invokes the existing Phase 23 local-
  only path; the action is NOT called and refresh is NOT called
  with the new key. (The clipboard side-effect itself is tested
  at the modal level in Phase 105; Phase 108 only pins isolation.)

### Order of operations (1 test)
- Refresh fires AFTER `sendBorrowerUpdateEmail` resolves. While
  the action is in-flight, refresh has not been called. After the
  action resolves, refresh is called on the next microtask.

### Static-source regression pins (5 tests)
- `DealDataProvider.tsx` exposes `'after-borrower-update-email'`
  on the `DealDataKey` union AND has a switch case for it.
- The case body reloads activity ONLY (no documents / tasks /
  creditMemo).
- `BorrowerCommunication.tsx` wires
  `refresh('after-borrower-update-email')` after
  `await sendBorrowerUpdateEmail(...)`.
- Phase 104 document-request refresh wiring remains in
  `DealDocuments.tsx` (`'after-document-request-email'` AND
  `'after-document-request-handoff'`).
- `BorrowerCommunication.tsx` does NOT import
  `Office365OutlookService`, does NOT reference `SendEmailV2`,
  and does NOT set any forbidden payload field
  (`Attachments` / `Cc` / `Bcc` / `From` / `ReplyTo` /
  `Sensitivity`).

---

## 4. Operator-visible behavior change

Before Phase 108: a banker sends a borrower-update email →
sees the success outcome panel in the modal → closes the modal
→ the `<BorrowerCommunication />` card still shows the activity
list from page load time. The new `BorrowerUpdateSent` row is
correctly written to Dataverse, but it doesn't appear until the
operator refreshes the page (or some other refresh fires).

After Phase 108: same flow → closes the modal → the
`<BorrowerCommunication />` card immediately re-loads activity →
the new `BorrowerUpdateSent` row appears at the top. No manual
page refresh required.

This is the same UX behavior the document-request email path
already had (Phase 104) — Phase 108 just brings the borrower-
update path to parity.

---

## 5. Out of scope (deliberate)

Phase 108 deliberately does NOT:
- Add a parallel refresh hook for the Phase 23 Copy fallback path.
  Copy never writes to Dataverse; refreshing the ledger after a
  Copy click would be pointless work.
- Add a refresh hook for the Phase 101 summary copy-to-clipboard
  handoffs. Same reason: those surfaces don't write.
- Add a refresh hook for Phase 23 borrower-update DRAFT generation.
  Generating a draft doesn't change the ledger.
- Touch the modal's outcome rendering — the modal already shows
  success/failed/partial outcomes inline. The card-level refresh
  is independent from the modal's UI feedback.
- Add any new refresh key beyond the one this phase needs.
- Modify Phase 104 document-request refresh in any way.

---

## 6. Verification

- 13 / 13 assertions pass in
  `src/deals/borrowerUpdateRefresh.test.tsx`.
- Full suite still green; Phase 106 + 107 regression pins remain
  green (Phase 108 doesn't touch the boundaries they watch).
- `npm run build`: clean.

Together with Phase 104–107, the borrower-update email lane is
now feature-complete for the banker-initiated send path:

```
Phase 104: document-request email LIVE send path exists.
Phase 105: borrower-update email LIVE send path exists.
Phase 106: operator switch / release-readiness boundary pinned.
Phase 107: both writes produce consistent, operator-readable activity evidence.
Phase 108: borrower-update send refreshes the ledger so the new row appears immediately.
```

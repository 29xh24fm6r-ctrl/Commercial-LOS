# Phase 61 — Outlook Email Delivery MVP

**Status:** shipped. DRY_RUN operational; LIVE wired end-to-end with the connector registration as the single remaining unblock step.

This phase introduces real governed outbound email delivery for the banker document-request workflow using Microsoft-native infrastructure (the Office 365 Outlook connector). It is the first governed write in the app that crosses the client-to-external-system boundary.

---

## Scope (verbatim from the phase brief)

- document-request delivery only
- banker-initiated outbound email
- timeline/audit integrated
- no borrower portal yet
- no AI/copilot yet
- no campaign automation
- no inbound email ingestion

## Core workflow

`request document → send governed email → timeline/audit visible`

Implemented as TWO governed writes coordinated by one modal:

1. **`deal-document-request`** (Phase 22, unchanged) — stamps `cr664_requestdate` on the checklist row, emits its own audit + timeline events.
2. **`deal-document-request-email`** (Phase 61, new) — invokes the Outlook adapter, emits its own audit + timeline events. Only runs when (1) succeeded; a failed request never produces an orphan send.

## Files (new / modified)

| File | Role |
| --- | --- |
| `src/deals/emailDelivery/emailMode.ts` | Reads `import.meta.env.VITE_EMAIL_MODE` once at module load. Defaults to DRY_RUN. Any value other than literal `LIVE` resolves to DRY_RUN. |
| `src/deals/emailDelivery/outlookEmailPort.ts` | Port interface (`OutlookEmailPort`) + result union (`OutlookSendResult`). |
| `src/deals/emailDelivery/outlookEmailAdapters.ts` | `dryRunAdapter`, `liveAdapter`, `isLikelyValidEmail`, `getEmailAdapter()`. |
| `src/deals/emailDelivery/recipientMasking.ts` | `maskRecipient()` — preserves the TLD, masks the rest. |
| `src/deals/sendDocumentRequestEmail.ts` | The new governed action. Same coordination shape as every Phase 22+ deal-domain write. |
| `src/deals/RequestDocumentModal.tsx` | Grows an optional email section + Mode badge when `onSendEmail` is passed. Backwards-compatible: existing call sites that don't pass `onSendEmail` see the original Phase 22 flow. |
| `src/deals/DealDocuments.tsx` | Wires `onSendEmail` to the new action and the `after-document-request-email` refresh key. |
| `src/deals/DealDataProvider.tsx` | Adds `'after-document-request-email'` to the `DealDataKey` union and a corresponding case in `refresh()` (reloads activity only — the checklist row was already updated by the prior request). |
| `src/shared/governance/platformInventory.ts` | Adds `deal-document-request-email` to `GOVERNED_WRITES`; updates `email-delivery` NOT_WIRED entry to scope it to borrower-update; adds `outlook-connector-live-send` NOT_WIRED entry. |
| `src/shared/governance/*.test.ts` (×4) | Discipline-test maps extended in lockstep. |

## Governance coordination (the standard Phase 22+ shape)

`sendDocumentRequestEmail` follows the same coordination pattern as every other deal-domain write:

1. Generate one `correlationId` via `newCorrelationId('oe')`.
2. Call the injected `OutlookEmailPort.send()`.
3. If the send was **not accepted**, emit a best-effort `Failed` audit row and return `{ kind: 'send-failed', transient, sendError, mode }`. No timeline row — the activity ledger should not show a banker-visible event for a send that never happened.
4. If the send **was accepted**, emit audit + timeline in parallel.
5. If either governance write failed, return `{ kind: 'governance-partial', auditError, timelineError, ... }` — the send already went out, so do NOT retry.

Outcome union:

```ts
type SendDocumentRequestEmailOutcome =
  | { kind: 'success'; mode; providerMessageId; maskedRecipient }
  | { kind: 'send-failed'; sendError; transient; mode }
  | { kind: 'governance-partial'; mode; providerMessageId; maskedRecipient; auditError; timelineError }
  | { kind: 'unknown'; message };
```

This matches Phase 47's outcome-union discipline.

## Recipient handling and masking

- The banker types the recipient into the modal.
- The **full** recipient address is recorded only on the `cr664_AuditEvent` row (`cr664_notes`). The audit ledger is the privileged surface.
- The `cr664_DealTimelineEvent` row (visible to banker + manager) carries the **masked** form via `maskRecipient()`: `borrower@example.com` → `b***@e***.com`. The TLD is preserved for human-readable debugging; nothing else is.
- The masked form is intentionally non-reversible. The masker does not encode the original length.

## DRY_RUN vs LIVE

Mode is read once at module load from `import.meta.env.VITE_EMAIL_MODE`. Two values are accepted:

| Mode | Behavior |
| --- | --- |
| `DRY_RUN` (default) | The adapter validates inputs locally and synthesizes `{ kind: 'accepted', providerMessageId: undefined }`. Audit + timeline events emit honestly; the timeline summary says `"Mode: DRY_RUN; nothing left the client."` |
| `LIVE` | The adapter today returns `{ kind: 'permanent-failure', reason: "Office 365 Outlook connector is not yet registered for this Code App..." }`. The audit row captures the LIVE attempt + the failure reason. |

Any value other than the literal string `LIVE` resolves to DRY_RUN — a missing or misspelled env var must never silently enable LIVE.

## LIVE unblock checklist

The Phase 61 LIVE adapter (`liveAdapter` in `outlookEmailAdapters.ts`) is wired end-to-end but **stubbed at the transport layer**. To turn LIVE on:

1. Register the Office 365 Outlook connector for this Code App in the Power Platform environment.
2. Regenerate the typed SDK so `src/generated/services/Office365EmailService.ts` (or the connector's equivalent) appears.
3. Replace the body of `liveAdapter.send` in `src/deals/emailDelivery/outlookEmailAdapters.ts` with the typed connector call. The expected shape is documented inline in that file — typically a `sendEmailV2({ to, subject, body, importance: 'Normal' })` call mapped through `classifyTransportError` for the non-2xx branches.
4. Set `VITE_EMAIL_MODE=LIVE` in the production build environment.

Nothing else changes. The port contract, the outcome union, the modal flow, the audit/timeline payloads, and every discipline test are stable across the swap.

## What this phase did NOT do

This list is intentional. Each item is either out of scope per the brief or blocked by a separate concern.

- **Borrower portal.** No external client surface exists; not in scope for this phase.
- **Inbox sync.** No inbound email ingestion. `cr664_DealTimelineEvent.cr664_eventtype = EmailLogged` (788190001) is emitted ONLY by the outbound send wired in this phase.
- **AI / copilot drafting.** The body is the banker's request note. Phase 24's "No AI was used" invariant remains intact across the entire app.
- **Borrower-side automation.** No "remind the borrower in 3 days" job. The next governed action is the banker's choice and reach.
- **Borrower email entity / contact lookup.** `cr664_borrower` has no email field. Phase 61 sidesteps that gap entirely by having the banker type the recipient. A future phase that adds a structured borrower-email field would build on top of the Phase 61 port — the adapter doesn't change.
- **Borrower-update email delivery.** Phase 23 borrower-update remains local-only Copy-to-clipboard. `email-delivery` is still in `NOT_WIRED` for that specific flow.

## Tests

- `src/deals/emailDelivery/emailMode.test.ts` — default + enum-narrowness.
- `src/deals/emailDelivery/recipientMasking.test.ts` — local/domain/TLD masking, edge cases, length-non-leak.
- `src/deals/emailDelivery/outlookEmailAdapters.test.ts` — `isLikelyValidEmail`, DRY_RUN paths, LIVE stub honesty.
- `src/deals/sendDocumentRequestEmail.test.ts` — happy path, send-failed (transient/permanent/invalid), governance-partial paths, unknown paths, correlation-id propagation, mask-on-timeline / full-on-audit.
- `src/deals/RequestDocumentModal.test.tsx` — Phase 22 tests retained verbatim; Phase 61 tests added for the email-section UX, send-after-request sequencing, both-outcomes rendering, toggle-off revert.
- The four Phase 46/47/49/50 discipline sweeps automatically scan the new action — extending their inventory maps is the only required test change.

## Operational notes

- **Audit row is the truth.** Anything you need to know about the actual recipient lives on the audit row's `cr664_notes`. The timeline + modal show the masked form on purpose.
- **Mode badge is honest.** The modal renders `Mode: DRY_RUN` or `Mode: LIVE` from the same constant the adapter selects on. They cannot drift.
- **`send-failed` keeps the request recorded.** If Outlook rejects the message, the banker still has a recorded document request — only the send did not happen. The modal renders both outcomes side-by-side so the banker knows exactly what to do next.
- **`governance-partial` after acceptance is critical.** Outlook accepted the message but the audit/timeline write failed. Do NOT retry — the message already went out. Capture the error and notify the audit owner.

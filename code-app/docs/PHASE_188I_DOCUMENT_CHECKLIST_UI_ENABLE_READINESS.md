# Phase 188I — Document Checklist Controlled UI-Enable Readiness Plan

**Status:** PLAN ONLY. This phase enables nothing. No live writes, no UI
enablement, no borrower contact, no deploy, no route changes.

This document defines the exact safety contract a *future* controlled banker-UI
"Generate checklist" action (planned for **188J**) must satisfy before it may
become enabled. 188I ships docs, tests, a pure readiness view-model
(`buildDocumentChecklistUiEnableReadiness`), and a single **disabled**
future-state flag. The clickable action is **not** created here.

---

## 1. Current certified state (188A–188H)

- `DOCUMENT_CHECKLIST_GENERATION_ENABLED = false` — runtime generation gate.
- `DOCUMENT_CHECKLIST_PILOT_UI_ENABLED = false` — pilot UI preview flag.
- `DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED = false` — **new in 188I**, the
  future UI-action gate (disabled constant only).
- `DocumentChecklistPilotPanel` renders read-only; the generate button is
  permanently disabled (`generateDisabled = true`).
- The pilot view-model's `canGenerate` is always `false`.
- The audited generator (`generateAuditedDocumentChecklist`) is fail-closed and
  disabled by default; it is **not** imported by any UI surface.
- Checklist row payload is exactly two fields: `cr664_documentname` and
  `cr664_Deal@odata.bind`. The correlation id is **audit-only** (the 188E live
  proof confirmed `cr664_correlationid` is not a column on
  `cr664_documentchecklists`).
- The 188F certification recorded the controlled live proof
  (`PILOT_LIVE_CONTROLLED`, deal `1a10a165-756a-f111-ab0c-70a8a59be491`).
- **No live writes occur in 188I.** This phase is docs/tests/view-model only.

---

## 2. Future 188J UI proof preconditions

The future banker-UI generate button may become enabled **only** when **all** of
the following hold (any failing precondition fails closed):

1. `DOCUMENT_CHECKLIST_GENERATION_ENABLED` flipped `true` by operator
   certification (runtime gate).
2. `DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED` flipped `true` by operator
   certification (UI action gate).
3. An authenticated banker actor resolvable to a `/cr664_users(<CoreUser>)` bind
   (never `/systemusers`).
4. The exact deal id from the open deal context.
5. Approved checklist names sourced from static operator config (never
   borrower-supplied, never invented at runtime).
6. A 188B readiness graph inspection reporting **safe** (no unsafe
   lookups/targets).
7. At least one approved name not already present (else `already_generated` —
   informational, no action).

Both gates being `true` is necessary but not sufficient: the per-invocation
preconditions (3–7) are re-checked at click time. **Either gate `false` ⇒ the
button reverts to the permanently-disabled 188D posture.**

### Q1 — exact condition that enables the button in 188J

Preconditions 1–7 above, evaluated together. The readiness model returns
`ready_for_future_enablement` when 3–7 hold; 188J additionally requires gates 1
and 2 flipped. 188I keeps both gates `false`, so `canGenerate` stays `false`.

---

## 3. Required actor identity (Q2)

An authenticated banker whose email resolves **fail-closed** to a
`/cr664_users(<CoreUser>)` bind for `cr664_ChangedBy`. Never `/systemusers`,
never an unresolved actor. If the actor cannot resolve, no row is created and no
audit is written.

## 4. Required deal identity (Q3)

The **exact** open-deal id (`cr664_loandeals` GUID). A future live action accepts
an exact id only — **no `--deal-name` lookup, no fuzzy match**.

## 5. Approved checklist name source (Q4)

`DOCUMENT_CHECKLIST_PILOT_APPROVED_NAMES` — operator-curated static config.
**Never borrower-supplied, never invented at runtime.**

## 6. Preflight / readiness checks before UI invocation (Q5)

Before a future click invokes the adapter, the UI must confirm: both gates true;
actor resolvable to a cr664_user; exact deal id present; approved names from
static config; a 188B graph inspection reporting safe; and at least one
would-create name. The readiness model encodes these as the
`futureEnablementPreconditions` list.

---

## 7. Readiness statuses

The `buildDocumentChecklistUiEnableReadiness` view-model reports one of:

| Status | Meaning |
| --- | --- |
| `disabled_by_default` | Resting posture (default call). The UI generate action is disabled. |
| `missing_actor_identity` | No actor resolvable to a `/cr664_users(<CoreUser>)` bind. |
| `missing_deal_id` | No exact deal id from the open deal context. |
| `missing_approved_names` | No operator-approved checklist names configured. |
| `unsafe_graph` | 188B readiness graph inspection has not reported safe. |
| `already_generated` | All approved names already present — informational, no action. |
| `ready_for_future_enablement` | Preconditions 3–7 hold — advisory only; gates still `false`, `canGenerate` still `false`. |

`already_generated` is **informational only** (no blocker). `ready_for_future_
enablement` is an advisory verdict — it does **not** and may **not** make
`canGenerate` true in 188I.

## 8. UI state mapping (Q6)

Future adapter result status → banker UI state:

| Adapter status | UI state |
| --- | --- |
| `disabled` | `action_hidden_or_disabled` |
| `dependency_not_ready` | `blocked_dependency_not_ready` |
| `unauthorized` | `blocked_unauthorized` |
| `skipped_no_template` | `blocked_no_approved_names` |
| `skipped_duplicate_detected` | `informational_already_generated` |
| `failed` | `error_no_rows_created` |
| `partial_success` | `error_partial_review_required` |
| `audit_failed_partial` | `error_audit_failed_review_required` |
| `success` | `success_refresh_checklist` |

## 9. Post-generation refresh (Q7)

After a future successful generation the UI re-reads existing checklist rows via
the deal/document data path (read-only) and re-derives already-present vs
would-create. It never assumes success without a refresh and never caches a
fabricated row.

## 10. Audit requirements (Q8)

A future generation must display/log:

- `cr664_ChangedBy` bound to `/cr664_users(<CoreUser>)` (never `/systemusers`).
- Correlation id (audit-only; never written to a checklist row).
- Created document names.
- Skipped (already-present) document names.
- The deal id the rows bind to.
- Event name `Document Checklist Generated` with the `SUCCEEDED` outcome.

---

## 11. What remains forbidden after UI enablement (Q9)

Even after a future 188J enablement, the following stay forbidden:

- **No borrower communication** — no email / SMS / Outlook / handoff.
- **No document request send flow.**
- **No New Deal auto-run.**
- No `cr664_documenttype` usage.
- No checklist row field beyond `cr664_documentname` + `cr664_Deal@odata.bind`.
- No correlation id written to a checklist row (audit-only).
- No stage/status/portfolio/CRM mutation.

## 12. Rollback / disable switch (Q10)

Set `DOCUMENT_CHECKLIST_GENERATION_ENABLED=false` (runtime gate) **and**
`DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED=false` (UI action gate). Both fail
closed independently — either `false` disables generation, `canGenerate` returns
`false` immediately, and the button reverts to the permanently-disabled 188D
posture.

---

## 13. 188I scope guarantees (explicit)

- **No live writes in 188I.** Docs/tests/view-model + one disabled flag only.
- **No UI enablement.** Both gates stay `false`; the button stays disabled.
- **No borrower contact.** No comms module is imported anywhere on the UI path.
- **No adapter invocation from the UI.** The readiness model and panel never
  import `generateAuditedDocumentChecklist` or `newDealChecklistGenerationLiveDeps`.
- **No route changes** and **no New Deal auto-run** are introduced.

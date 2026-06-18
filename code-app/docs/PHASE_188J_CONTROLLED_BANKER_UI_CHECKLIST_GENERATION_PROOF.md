# Phase 188J — Controlled Banker-UI Checklist Generation Proof

**Status:** CONTROLLED PROOF SEAM ONLY. This phase enables nothing in
production. No live writes, no UI enablement by default, no borrower contact, no
deploy, no route changes, no New Deal auto-run.

---

## 1. Purpose

188I shipped a pure, advisory readiness view-model
(`buildDocumentChecklistUiEnableReadiness`) describing the exact safety contract a
*future* banker-UI "Generate checklist" action must satisfy. 188J takes the next
controlled step: it introduces the **first UI-to-adapter bridge** for that action
as a **dependency-injected seam**, so the bridge can be *proven in tests* without
any live Dataverse write — while keeping production behavior **fail-closed by
default**.

This phase does **not** turn on the banker button in runtime. It proves, with
unit + component tests, that:

- the default UI stays disabled,
- the bridge refuses every unsafe precondition (fail-closed), and
- a single, controlled, **test-only enabled** configuration drives exactly one
  injected adapter call.

---

## 2. What was added

- `src/deals/documentChecklistUiGenerationAction.ts` — the pure, dependency-
  injected action wrapper `runDocumentChecklistUiGenerationAction`. It performs
  no IO, imports no live Dataverse dep, no generator adapter, and no
  borrower-comms module. The generation adapter and the read-only refresh are
  injected.
- `src/deals/documentChecklistUiGenerationAction.test.ts` — unit tests proving
  the bridge (preflight refusals + the one controlled enabled call).
- `src/deals/DocumentChecklistPilotPanel.tsx` — an optional **test-only**
  `onGenerate` callback + `generateActionEnabled` flag. Both default to the
  disabled posture; the button stays disabled in runtime.
- `src/deals/DocumentChecklistPilotPanel.test.tsx` — component tests proving the
  button is disabled by default and that one click reaches the injected callback
  only when fully enabled in a test-only configuration.
- `src/shared/governance/phase188JControlledUiChecklistGenerationContract.test.ts`
  — static governance pins.
- `docs/PHASE_188J_CONTROLLED_BANKER_UI_CHECKLIST_GENERATION_PROOF.md` — this doc.

---

## 3. Default disabled posture

Both UI/action gates stay **disabled by default**, and the runtime generation
gate is untouched:

- `DOCUMENT_CHECKLIST_PILOT_UI_ENABLED = false` (panel/preview gate).
- `DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED = false` (clickable action gate).
- `DOCUMENT_CHECKLIST_GENERATION_ENABLED = false` (runtime generation gate —
  unchanged; still false by default).

The panel's `generateDisabled = true` invariant is preserved. In normal runtime
no `onGenerate` callback is wired and `generateActionEnabled` defaults to the
false flag, so the button stays disabled. The bridge
(`runDocumentChecklistUiGenerationAction`) refuses unless **both** UI/action
gates are `true`; either being `false` fails closed.

---

## 4. Exact controlled test-only proof path

The bridge is proven without a live write by injecting fakes:

1. A test builds a `ready_for_future_enablement` readiness verdict via
   `buildDocumentChecklistUiEnableReadiness`.
2. The test calls `runDocumentChecklistUiGenerationAction` with:
   - `gates: { pilotUiEnabled: true, uiGenerateActionEnabled: true }` (test-only),
   - a banker actor whose `changedByBind` is a `/cr664_users(<CoreUser>)` value,
   - the exact deal id,
   - the approved names,
   - an **injected** `generateChecklist` adapter (a spy returning a chosen
     `DocumentChecklistOutcome`),
   - an **injected** read-only `refreshChecklist`,
   - an audit-only correlation id.
3. The bridge runs preflight, invokes the injected adapter **exactly once**, maps
   the adapter status to a UI state, and runs the read-only refresh on success.

The component test mirrors this at the panel level: with `generateActionEnabled`
+ an injected `onGenerate`, one click invokes the callback exactly once; without
both, the button is disabled and the callback is never reached.

**No live Dataverse adapter is ever invoked from the UI without injection.**

---

## 5. Preconditions (fail-closed preflight)

The bridge returns a refusal (and never invokes the adapter) unless **all** hold:

| Order | Check | Refusal token |
| --- | --- | --- |
| 1 | Both UI/action gates true | `refused_gate_disabled` |
| 2 | Readiness verdict is `ready_for_future_enablement` or `already_generated` | `refused_not_ready` |
| 3 | Actor present (email or bind) | `refused_missing_actor` |
| 4 | Actor bind targets `/cr664_users(<CoreUser>)` (never `/systemusers`) | `refused_unsafe_actor_bind` |
| 5 | Exact deal id present | `refused_missing_deal_id` |
| 6 | Non-empty approved names | `refused_missing_approved_names` |

---

## 6. Actor identity rule

The actor bind must target `/cr664_users(<CoreUser>)` — **never `/systemusers`**.
The bridge enforces this with the shared `isCoreUserBind` guard from
`auditActorBind`. A `/systemusers` (or any non-`cr664_users`) bind is refused with
`refused_unsafe_actor_bind`; the adapter is never invoked. The actor email is
used only to resolve the audit `cr664_ChangedBy` bind.

## 7. Deal identity rule

The bridge accepts the **exact deal id** only (`cr664_loandeals` GUID). No fuzzy
match, no `--deal-name` lookup. A blank/whitespace deal id is refused with
`refused_missing_deal_id`.

## 8. Approved document names source

Approved names come from `DOCUMENT_CHECKLIST_PILOT_APPROVED_NAMES` — operator-
curated **static config**. Never borrower-supplied, never invented at runtime.
The bridge de-duplicates and trims them, and passes the exact deal id + approved
names (only) to the injected adapter. The adapter owns the allow-listed row
payload (`cr664_documentname` + `cr664_Deal@odata.bind`); the bridge never names a
row field.

## 9. Adapter status mapping

The bridge maps the injected adapter's `DocumentChecklistOutcome.kind` to a UI
state using the 188I readiness mapping (`uiStateByAdapterStatus`):

| Adapter status | UI state | Category |
| --- | --- | --- |
| `disabled` | `action_hidden_or_disabled` | blocked |
| `dependency_not_ready` | `blocked_dependency_not_ready` | blocked |
| `unauthorized` | `blocked_unauthorized` | blocked |
| `skipped_no_template` | `blocked_no_approved_names` | blocked |
| `skipped_duplicate_detected` | `informational_already_generated` | informational |
| `failed` | `error_no_rows_created` | error |
| `partial_success` | `error_partial_review_required` | error |
| `audit_failed_partial` | `error_audit_failed_review_required` | error |
| `success` | `success_refresh_checklist` | success |

An **already-generated** outcome maps to a **non-error** (informational) UI
result. A **partial failure** maps to a controlled **error** UI result.

## 10. Refresh behavior

The injected refresh is **read-only** (it re-reads existing checklist rows; it
never writes). It runs **only after** a clean `success` or an already-generated
skip (`skipped_duplicate_detected`, or an `already_generated` readiness short-
circuit). It never runs after a refusal or a controlled error. The bridge never
assumes success without a refresh and never caches a fabricated row.

## 11. Audit behavior

The correlation id is **audit-only**: it rides the adapter request and the
result as audit metadata. It is **never** written to a checklist row (the live
proof in 188E confirmed `cr664_correlationid` is not a column on
`cr664_documentchecklists`). The audit `cr664_ChangedBy` binds
`/cr664_users(<CoreUser>)` — never `/systemusers` — and the audit is the
adapter's responsibility, emitted only after every intended row is created.

## 12. Explicit forbidden behavior

Even in the controlled proof, the following stay forbidden:

- **No borrower communication** — no email / SMS / Outlook / handoff.
- **No document request send flow.**
- **No New Deal auto-run.**
- No live Dataverse adapter invocation from the UI without injection.
- No direct live-dependency import into `DocumentChecklistPilotPanel`.
- No `cr664_documenttype` usage.
- No checklist row field beyond `cr664_documentname` + `cr664_Deal@odata.bind`.
- No correlation id written to a checklist row (audit-only).
- No stage / status / portfolio / CRM mutation.
- No schema / migration.
- No bulk generation; no Dataverse write from a normal UI render.
- No route count change.

## 13. Rollback switch

Set `DOCUMENT_CHECKLIST_GENERATION_ENABLED=false` (runtime gate) **and**
`DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED=false` (UI action gate) **and**
`DOCUMENT_CHECKLIST_PILOT_UI_ENABLED=false` (pilot UI gate). Each fails closed
independently — any one `false` refuses the action, the bridge returns
`refused_gate_disabled`, and the panel button reverts to the permanently-disabled
188D posture. In runtime no `onGenerate` callback is wired regardless.

## 14. How 188K would certify enablement

A future **188K** certification (not this phase) would:

1. Re-confirm the bridge contract tests and the fail-closed preflight pass.
2. Run a controlled live proof against a single known deal id with an
   operator-resolved `/cr664_users(<CoreUser>)` actor bind, capturing the audit
   event and the created vs already-present row names.
3. Flip the gates **together** under operator certification:
   `DOCUMENT_CHECKLIST_GENERATION_ENABLED`,
   `DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED`, and
   `DOCUMENT_CHECKLIST_PILOT_UI_ENABLED`.
4. Wire the real injected deps (live generation adapter + read-only refresh) into
   the panel **at the call site only** (never as a static panel import), keeping
   the bridge the single audited entry point.
5. Record the certification (deal id, correlation id, created/skipped names) and
   keep the rollback switch documented.

Until 188K certifies, every gate stays `false` and the seam is exercised only by
tests.

---

## 15. 188J scope guarantees (explicit)

- **No live writes in 188J.** The bridge is pure given its injected deps.
- **No UI enablement.** Both UI/action gates stay `false`; the button stays
  disabled by default.
- **No borrower contact.** No comms module is imported on the UI path or in the
  bridge.
- **No adapter invocation from the UI without injection.** The panel never
  imports `generateAuditedDocumentChecklist` or `newDealChecklistGenerationLiveDeps`.
- **No route changes** and **no New Deal auto-run** are introduced.
- **Row allow-list unchanged** (`cr664_documentname` + `cr664_Deal@odata.bind`).
- **Correlation id audit-only.**

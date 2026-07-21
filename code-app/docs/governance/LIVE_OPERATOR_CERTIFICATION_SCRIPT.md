# Live Operator Certification Script — Platform-Enforced Credit Workflow Governance

**Purpose:** the executable proof this initiative actually works, run by an operator against the
real Dataverse environment after `DEPLOYMENT_AND_ROLLBACK_PLAN.md`'s Phase 1 (and, later, Phase 2)
registration steps. Nothing in this document can be executed from the authoring sandbox — no live
Dataverse connection exists there. Every step below produces a pass/fail an operator records.

**Companion:** `scripts/dataverse/attempt-governance-bypass-smoke.ps1` automates the direct-write
bypass attempts in Part A as a repeatable smoke test; this document is the full narrative script,
including the parts a script cannot automate (concurrent-tab races, UI verification).

**Test deal setup:** create ONE disposable test deal (name prefixed `TEST -` per this repo's own
test-deal convention — see `src/shared/deals/testDealClassification.ts` — so it is automatically
excluded from operational counts) and use it for every scenario below, resetting its stage/status
between scenarios via the app's normal governed Advance path, not a raw Dataverse edit (that would
defeat the purpose of proving the plugin catches raw edits).

---

## Part A — Core enforcement (Phase 1)

Perform every write in this section via a direct Dataverse Web API call (Postman, `curl` with a
bearer token, or the `Test-DataverseAttempt` helper in `attempt-governance-bypass-smoke.ps1`) —
**never through the app UI** — to prove the *server*, not the client, is the one rejecting these.

### A1 — Stage-skip is rejected
1. Set the test deal to `INTAKE` via the normal app flow.
2. Issue a direct `PATCH` setting `cr664_StageReference` to `CREDIT_APPROVAL` (skipping
   UNDERWRITING).
3. **Expect:** HTTP 4xx with a message naming the illegal jump (not a generic error). The deal's
   stage is unchanged on re-read.
4. **Expect:** a `cr664_auditevents` row exists for the deal with `cr664_outcomestatus = Blocked`,
   correct `cr664_beforestate`/`cr664_afterstate`, a real `cr664_ChangedBy`, and a
   `cr664_correlationid`.

### A2 — Terminal-status lock is rejected
1. Set the test deal to any non-terminal stage/status.
2. Direct `PATCH` `cr664_StatusReference` to `DECLINED`. Confirm it succeeds (this is a legal
   DECLINE from a non-terminal state).
3. Direct `PATCH` attempting to change `cr664_StageReference` on the now-DECLINED deal.
4. **Expect:** rejected, citing the terminal status. A `cr664_auditevents` Blocked row exists.

### A3 — Credit-approval authority is enforced
1. Set the test deal to `CREDIT_APPROVAL` with a recorded amount.
2. As a systemuser mapped to a `cr664_banker` who is **not** a credit-committee member and has
   **no** override authority, direct `PATCH` `cr664_StageReference` to `COMMITMENT`.
3. **Expect:** rejected, citing insufficient approval authority.
4. Repeat as a systemuser mapped to a committee-member banker within their approval limit.
5. **Expect:** succeeds.

### A4 — Unrelated field writes are unaffected
1. Direct `PATCH` only `cr664_amount` on the test deal (no stage/status attribute in the payload).
2. **Expect:** succeeds immediately, no plugin-added latency worth noting, no audit row from this
   plugin (the app's own normal audit path for amount changes, if any, is untouched — this plugin
   specifically does not fire).

### A5 — Concurrency: a stale client's transition is rejected against the deal's new true state
1. Read the test deal's stage in two separate sessions/tabs (A and B), both seeing `CREDIT_APPROVAL`.
2. From session A (via the app, or a direct write), advance to `COMMITMENT`. Confirm it succeeds.
3. From session B, WITHOUT re-reading, attempt the same advance
   (`CREDIT_APPROVAL` -> `COMMITMENT`) via a direct write using session B's stale belief.
4. **Expect:** session B's write is rejected — the plugin's fresh pre-image at stage 20 shows the
   deal already at `COMMITMENT`, so `COMMITMENT -> COMMITMENT` is not a legal edge. The rejection
   message should make it clear the deal's stage has already moved (not a generic "invalid
   transition").

---

## Part B — Live UI verification (RETURN/DECLINE/WITHDRAW, Phase 0 + Phase 1 together)

Perform these through the actual banker UI (`Banker Workspace -> [deal] -> Stage workflow`,
alongside the existing Stage Map card).

### B1 — Return, live
1. On a deal in `CREDIT_APPROVAL`, click **Return to earlier stage**, select `UNDERWRITING`, enter
   a reason, confirm.
2. **Expect:** a visible success message naming the destination stage; the deal's displayed stage
   updates without a page reload; the deal's activity timeline shows the return event.

### B2 — Decline, live
1. On a deal in any non-terminal, non-BOARDED stage, click **Decline**, select a structured reason
   code, optionally add detail, confirm.
2. **Expect:** a visible confirmation; the deal now shows status DECLINED; no borrower
   communication was sent (confirm nothing appears in any borrower-facing outbox/log).

### B3 — Withdraw, live
1. Same as B2 but Withdraw with a free-text reason.
2. **Expect:** status WITHDRAWN, same non-communication guarantee.

### B4 — A server rejection is shown honestly, never as a fake success
1. Trigger a rejection the UI's own client-side checks would NOT have caught (the easiest live
   repro: have another session concurrently advance the same deal past the stage this session is
   about to Return from, then submit the stale Return — mirrors A5 but through the UI).
2. **Expect:** the UI shows the literal rejection reason (styled as an error, `role="alert"`), and
   the deal's displayed stage does **not** change. Confirm by refreshing that the deal's real stage
   matches what the server actually holds, not what the UI showed before the rejection.

---

## Part C — Reason enforcement (Phase 2, only after the schema + flags are live)

### C1 — Return/Decline/Withdraw without a reason is rejected server-side
1. Craft a direct Dataverse write that sets `cr664_StatusReference` to `WITHDRAWN` with
   `cr664_governedactionreason` omitted or blank (bypassing the client's own required-field check).
2. **Expect:** rejected, citing the missing reason. (Before Phase 2 is live, this same write is
   expected to SUCCEED — that is the honest baseline this scenario exists to change.)

### C2 — A reason IS recorded on the deal record itself, not only in the audit note
1. Perform a live Return through the UI with a reason.
2. **Expect:** `cr664_governedactionreason` on the deal record itself holds that reason text
   (queryable directly, not only inferable from `cr664_auditevents.cr664_notes`).

---

## Recording results

For each scenario: date, operator, environment, pass/fail, and (for any fail) the exact response
body/error and whether the deal's data was left consistent. File failures as defects using the same
stage/repro/expected/actual/severity/impact/root-cause/fix format the E2E certification used, and
do not proceed to arm the next phase until every scenario in the current phase passes.

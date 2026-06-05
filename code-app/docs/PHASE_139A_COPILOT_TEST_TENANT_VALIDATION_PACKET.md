# Phase 139A — Copilot test-tenant validation packet

> **Validation packet — not executed.** This is the operator packet for a
> future, governed, **test-tenant-only** Copilot validation run. It is **not
> executed** in this phase. The runtime stays **`not_configured`**;
> **production is blocked**.

## Prerequisite checklist (ALL required)

- [ ] Audit table `cr664_copilotauditevent` created and verified.
- [ ] Custom API `cr664_RunLosCopilotAssist` created and verified.
- [ ] Server handler deployed (governance-approved server project).
- [ ] DLP + Azure OpenAI model policy approved.
- [ ] Azure OpenAI deployment approved.
- [ ] Managed identity / server-side secret store configured.
- [ ] Disable switch configured and tested.
- [ ] **Test tenant only** — never production.

## Test data requirements

- Synthetic / non-sensitive deal + workspace data only.
- **No real borrower PII**; **no real documents** — minimized / redacted
  view-model context only.
- A correlation id generator for end-to-end tracing.

## Operator role requirements

- An operator with the existing LOS security role that already grants the
  relevant workspace/deal read access (no new scope).
- Governance / compliance observer present for the live steps.
- Authority to flip the disable switch immediately.

## Test sequence

1. **Default `not_configured`** — confirm `getCopilotConnector().status().mode`
   is `not_configured` and the UI shows "Not configured".
2. **Audit table inspect** — `--inspect-copilot-audit-table` (read-only).
3. **Audit table dry-run / commit if approved** —
   `--seed-copilot-audit-table-metadata` (offline); commit only if the
   guarded write path is implemented **and** governance-approved.
4. **Custom API inspect** — `--inspect-copilot-custom-api` (read-only).
5. **Custom API dry-run / commit if approved** —
   `--seed-copilot-custom-api-metadata` (offline); commit only if approved.
6. **Server handler deploy if approved** — deploy the governance-approved
   handler (separate server project).
7. **Handler health check WITHOUT a model call** — confirm the handler
   validates a request and responds without invoking Azure OpenAI.
8. **Fail closed on `audit_unavailable`** — simulate an audit-write failure;
   confirm `audit_unavailable` and **no model call**.
9. **Enable `live_read_only` only in the test tenant** — explicit config;
   confirm it activates only with a complete, valid config.
10. **Run `explain_only` / `summarize` only** — read-only summaries; confirm
    no writes and no proposals beyond `explain_only`.
11. **Verify `audit_start` / `audit_completion`** — both written, correlated
    by `correlationId`, redacted summaries / hashes only.
12. **Disable** — flip the disable switch; confirm return to
    `not_configured` / `disabled`.
13. **Export logs** — the audit ledger + server logs for review.
14. **Governance signoff** — formal review before any further step.

## Explicit prohibition

- **No production.** Test tenant only.
- **No `proposal_only`** (or any write-capable proposal) **until
  `live_read_only` is fully validated and separately approved.**
- **No autonomous writes ever.** The model never writes; a human confirms,
  and the existing governed write path performs the write.

## Stop conditions

Abort and **disable** immediately if: an audit event cannot be written;
redaction fails (raw document / secret detected); the model returns
unsafe / unparseable output; DLP blocks the egress; or any unexpected write
is attempted.

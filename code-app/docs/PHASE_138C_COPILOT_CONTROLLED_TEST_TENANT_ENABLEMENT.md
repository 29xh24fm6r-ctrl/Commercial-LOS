# Phase 138C — Copilot controlled test-tenant enablement runbook

> **Runbook only — nothing enabled.** This is the operator runbook for a
> future, governed, **test-tenant-only** Copilot live enablement. It is
> **not executed** in this phase. The runtime Copilot connector stays
> **`not_configured`**, and production remains blocked.

## Prerequisites (ALL required before any live step)

Do not begin until **every** item is true, in a **test tenant only**:

- **Audit table exists and verified** (`cr664_copilotauditevent`).
- **Custom API exists and verified** (`cr664_RunLosCopilotAssist`).
- **Server handler deployed** (separate server project).
- **`audit_start` verified before any model call.**
- **DLP / model policy approved.**
- **Azure OpenAI deployment approved.**
- **Managed identity / server-side secret store configured.**
- **Disable switch configured.**
- **Test tenant only** — never production.

## Step-by-step test plan

1. **Verify default `not_configured`** — confirm
   `getCopilotConnector().status().mode === 'not_configured'` and the UI
   shows "Not configured" before any change.
2. **Verify audit table metadata** — inspect `cr664_copilotauditevent`
   (read-only); confirm the expected fields exist.
3. **Verify Custom API metadata** — inspect `cr664_RunLosCopilotAssist`
   (read-only); confirm request/response parameters match the contract.
4. **Verify handler health WITHOUT a model call** — the handler responds to
   a health/validation probe without invoking Azure OpenAI.
5. **Verify fail-closed on `audit_unavailable`** — simulate an audit-write
   failure; confirm the handler returns `audit_unavailable` and makes **no
   model call**.
6. **Enable `live_read_only` in the test tenant only** — set the explicit
   config; confirm it activates only with a complete, valid config.
7. **Test `summarize` / `explain_only` only** — exercise read-only
   summaries; confirm no writes, no proposals beyond `explain_only`.
8. **Validate `audit_start` and `audit_completion`** — confirm both events
   are written, correlated by `correlationId`, with redacted summaries /
   hashes only (no raw documents, no secrets).
9. **Disable immediately** — flip the disable switch; confirm the runtime
   returns to `not_configured` / `disabled`.
10. **Review logs** — review the audit ledger + server logs for
    completeness, redaction, and any fail-closed events.

## Explicit prohibition

**Do NOT enable `proposal_only` or any write-capable proposal** until
`live_read_only` has been fully validated and separately approved. Until
then, only `explain_only` / read-only summaries are permitted. No proposal
ever executes a write — a human confirms, and the existing governed write
path performs (and audits) the write.

## Stop conditions

Abort immediately and **disable** if any of: an audit event cannot be
written; redaction fails (raw document / secret detected); the model
returns unsafe / unparseable output; DLP blocks the egress; or any
unexpected write is attempted.

## After the test

- Disable the live mode (default `not_configured`).
- Capture results for the governance review.
- Production enablement remains a **separate** governance decision after a
  successful, reviewed test-tenant run.

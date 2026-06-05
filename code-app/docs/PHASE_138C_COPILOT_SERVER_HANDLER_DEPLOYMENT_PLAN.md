# Phase 138C — Copilot server handler deployment plan (skeleton only)

> **Deployment plan / skeleton only — NOT deployed.** This documents the
> deployment-ready contract for the future server-side handler behind the
> Dataverse Custom API (`cr664_RunLosCopilotAssist`). **No plugin / Azure
> Function project is created**, nothing is deployed, no Azure OpenAI is
> called, and the runtime Copilot connector stays **`not_configured`**. The
> app-side companion is the pure, inert readiness checklist in
> [src/copilot/copilotServerDeploymentReadiness.ts](../src/copilot/copilotServerDeploymentReadiness.ts).

## Purpose

Pin exactly what a future server handler must do and what must be true
before it can be deployed/enabled — without creating a deployable server
project (this repo has no sanctioned server-project pattern).

## Handler entrypoint contract (`cr664_RunLosCopilotAssist`)

The handler (Dataverse plugin or Azure Function, per Phase 137H) runs this
ordered pipeline — modelled inertly in
`COPILOT_SERVER_HANDLER_CONTRACT`:

1. **Validate the request shape** (Phase 137B contract); **fail closed
   before the model boundary** on any violation.
2. **Read the Dataverse execution context** (caller identity from the
   platform, not client-asserted).
3. **Enforce** workspace / surface / mode / action-allowlist +
   `requireConfirmation=true`.
4. **Minimize / redact** the prompt + context.
5. **Check the DLP / model policy gate** + the disable switch.
6. **Write `audit_start`** — if it cannot be written, **fail closed
   `audit_unavailable` BEFORE any model call**.
7. **Call Azure OpenAI server-side only** (managed identity); never from the
   browser.
8. **Validate the structured model output** against the response contract;
   unsafe / unparseable **fails closed**.
9. **Convert actions to proposal-only objects** (allowlisted,
   `requireConfirmation=true`, `governedWritePath`).
10. **Write `audit_completion`** (or `audit_fail_closed`).
11. **Return the response JSON** — the handler **never executes a write
    directly from model output**.

## Request validation

Reject (fail closed) unless: `workspace`, `surface`, and `mode` are valid;
`prompt.kind` is allowlisted; `policy.requireConfirmation === true`;
`policy.allowedActionTypes` ⊆ server allowlist; `correlationId` present;
context already-authorized + minimized; no raw borrower documents; payload
within size bound (else `context_too_large`).

## Audit-before-model + fail-closed

- **`audit_start` is written before any Azure OpenAI / model call.**
- If `audit_start` cannot be written → **`audit_unavailable`**, no model
  call.
- `audit_completion` / `audit_fail_closed` are always written.
- Every error resolves to a fail-closed response (`disabled` /
  `not_configured`); never fake output; never crash the caller.

## DLP / model policy gate

The Dataverse → Azure OpenAI egress must be DLP-approved, and the model /
deployment / version policy confirmed, before enablement.

## Server-side Azure OpenAI only

Azure OpenAI is called **server-side only**, via **managed identity** or a
server-side secret store — **no client / browser API keys**, no
browser-direct endpoint.

## Structured output validation

Model output **must be structured JSON** and validated against the response
contract; unsafe or unparseable output → **`unsafe_output`** (withheld).

## Proposal-only response / no writes from model

The model **never executes writes**. Proposals require
`requireConfirmation=true`; write-capable proposals require a
`governedWritePath`; final writes occur only through existing governed app
paths after human confirmation. `explain_only` is the read-only floor.

## Deployment prerequisites

`copilotServerDeploymentReadiness.ts` enumerates these (all `false` by
default, so `ready` is always `false`):

1. DLP + Azure OpenAI model policy approved.
2. Azure OpenAI deployment approved.
3. Managed identity / server-side secret store configured.
4. `cr664_copilotauditevent` audit table created and verified.
5. `cr664_RunLosCopilotAssist` Custom API created and verified.
6. Server handler deployed (separate server project).
7. `audit_start` verified before any model call.
8. Fail-closed (`audit_unavailable` / disabled) verified.
9. Disable switch configured for live mode.

## Rollback / disable switch

A single **disable switch** returns the runtime to `not_configured` /
`disabled` immediately. Server-side handler deployment must be reversible
(undeploy / disable the registration) — **manual** in the test tenant; there
is no automated rollback in this repo.

## Guardrails preserved

No deployed server code · no plugin / Azure Function project created · no
Azure OpenAI call · no browser-direct Azure/OpenAI · no client-side secrets ·
no Dataverse write · no runtime enablement · default `not_configured` ·
`feat/copilot-live-connector-safe-actions` not merged.

## See also

- [PHASE_137H_COPILOT_SERVER_SIDE_SKELETON_SPEC.md](./PHASE_137H_COPILOT_SERVER_SIDE_SKELETON_SPEC.md)
- [PHASE_138C_COPILOT_CONTROLLED_TEST_TENANT_ENABLEMENT.md](./PHASE_138C_COPILOT_CONTROLLED_TEST_TENANT_ENABLEMENT.md)
- [PHASE_138C_COPILOT_LIVE_READINESS_CERTIFICATION.md](./PHASE_138C_COPILOT_LIVE_READINESS_CERTIFICATION.md)

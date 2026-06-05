# Phase 139A — Copilot server handler package plan (final handoff)

> **Final handoff plan — NOT deployed.** This is the deployment-ready plan
> for the future server-side handler behind `cr664_RunLosCopilotAssist`. **No
> plugin / Azure Function project is created**, nothing is deployed, no
> Azure OpenAI is called, and the runtime stays **`not_configured`**. The
> inert app-side companion is
> [src/copilot/copilotServerDeploymentReadiness.ts](../src/copilot/copilotServerDeploymentReadiness.ts).

## Recommended handler type

**Dataverse plugin first** (registered on the `cr664_RunLosCopilotAssist`
Custom API message). Use an **Azure Function only if governance chooses
that external service boundary** (e.g. an existing function app with a
vetted managed identity + private networking). Either way: the browser
calls only the Custom API; the handler calls Azure OpenAI server-side;
secrets stay server-side.

## Handler entrypoint contract

- **Input:** the Phase 137B **request contract** (`RequestPayload` JSON +
  `CorrelationId`) — workspace / surface / mode / user / minimized context /
  prompt / policy / correlationId.
- **Output:** the Phase 137B **response contract** (`ResponsePayload` JSON) —
  mode / isLive / optional answer / citations / proposals[] / warnings[] /
  audit receipt / failClosedCode.

## Required dependencies

- **Audit logger** — writes `cr664_copilotauditevent` (Phase 137K/137I).
- **DLP / model-policy checker** — confirms the egress + model policy are
  approved before any model call.
- **Azure OpenAI server-side client** — managed identity preferred; never a
  client/browser key.
- **Response validator** — validates structured model output against the
  response contract.
- **Disable switch** — a single config flag that returns the runtime to
  `not_configured` / `disabled`.

## Pipeline

1. **Parse** the request JSON.
2. **Validate** the request shape (fail closed before the model boundary).
3. **`audit_start`** — write it; if it cannot be written, fail closed
   `audit_unavailable` **before any model call**.
4. **Policy gates** — workspace/surface/mode/action-allowlist +
   `requireConfirmation=true`; DLP / model policy; disable switch.
5. **Model call** — Azure OpenAI **server-side only**.
6. **Output validation** — structured JSON validated; unsafe/unparseable →
   `unsafe_output` (withheld).
7. **Proposal shaping** — proposal-only objects (allowlisted,
   `requireConfirmation=true`, `governedWritePath`).
8. **`audit_completion`** (or **`audit_fail_closed`**).
9. **Response** — return the JSON. **No write is executed directly from
   model output.**

## Fail-closed matrix

| code | meaning | response |
| --- | --- | --- |
| `missing_config` | not configured | `not_configured`, no proposals |
| `policy_blocked` | prompt / scope policy violation | `disabled`, warning |
| `dlp_blocked` | DLP blocks egress | `disabled`, warning |
| `model_unavailable` | Azure OpenAI unreachable / over quota | `disabled`, warning |
| `context_too_large` | over size / minimization bound | `live_read_only` (reduced) with warning, or `disabled` |
| `unsafe_output` | output failed safety / parse | `disabled`, warning; withheld |
| `audit_unavailable` | audit write failed | `disabled`, warning; no output without an audit record |
| `connector_exception` | unexpected server error | `disabled`, honest reason; never crash the caller |

## Deployment checklist

1. DLP + Azure OpenAI model policy approved.
2. Azure OpenAI deployment approved.
3. Managed identity / server secret store configured.
4. `cr664_copilotauditevent` table created and verified.
5. `cr664_RunLosCopilotAssist` Custom API created and verified.
6. Server handler deployed (separate, governance-approved server project).
7. `audit_start` verified before any model call.
8. Fail-closed (`audit_unavailable` / disabled) verified.
9. Disable switch configured.
10. Test tenant only.

## Rollback / disable checklist

- Flip the **disable switch** → runtime returns to `not_configured` /
  `disabled` immediately.
- **Undeploy / unregister** the handler step (manual, test tenant).
- Confirm `getCopilotConnector().status().mode === 'not_configured'`.
- No automated rollback exists in this repo — undo is manual and
  test-tenant-first.

## No writes directly from model output

The model **never executes writes**. Proposals require
`requireConfirmation=true` and a `governedWritePath`; the actual write
happens only through an existing governed app path after **human
confirmation**, audited separately via `cr664_AuditEvent` and cross-linked
by `correlationId`. `explain_only` is the read-only floor.

## Governance note

**Do not create a real plugin / Azure Function project** without explicit
governance approval. This phase delivers the plan + an inert app-side
readiness helper only.

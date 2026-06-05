# Phase 137F — Copilot Dataverse Custom API registration runbook + server contract

> **Registration / runbook / spec only.** This phase defines the
> Dataverse-side registration target and the server implementation
> contract for `cr664_RunLosCopilotAssist`. It **creates nothing**: no
> Custom API, no plugin, no Azure Function, no Azure resource, no schema,
> no token, no secret, and no live traffic. The runtime default stays
> **`not_configured`** and no client behavior changes.

## A. Purpose and status

- **This phase is registration / runbook / spec only.**
- **No Custom API is created in this phase.**
- **No plugin / Azure Function is deployed.**
- No schema / migration / token / secret / live traffic.
- **Runtime remains `not_configured`.** The client still resolves
  `not_configured` by default (Phase 137D resolver), the transport is still
  the fail-closed stub (Phase 137E), and no concrete transport is wired.

This runbook makes the future build *safe to attempt* by pinning exactly
what the Dataverse Custom API must be, who may call it, and how the server
must behave — before any of it exists.

## B. Custom API registration target

| Field | Value |
| --- | --- |
| **API name** | `cr664_RunLosCopilotAssist` |
| **Publisher prefix** | `cr664` |
| **Bound / unbound** | **Unbound** action (recommended) — it operates on app-supplied context, not a single bound Dataverse row, unless a repo-specific Dataverse convention later requires a bound variant. |
| **Allowed caller** | The app / client via the **existing authenticated Dataverse context** (no new auth, no token work). |
| **Execution** | **Server-side** plugin **or** Azure Function-backed operation — never client-side. |
| **Return** | A JSON string / object matching the **Phase 137B response contract**. |

The name is the same symbol the client already pins
(`COPILOT_CUSTOM_API_NAME = 'cr664_RunLosCopilotAssist'`) — the contract
between Code App and Dataverse stays exact.

## C. Request / response binding

Map the Phase 137B request/response onto the Custom API's
input/output parameters (illustrative — not created here):

| 137B field | Dataverse Custom API parameter | Direction |
| --- | --- | --- |
| whole request payload | `RequestPayload` (String / JSON) | In |
| `correlationId` | `CorrelationId` (String) | In |
| `workspace` | `Workspace` (String enum) | In |
| `surface` | `Surface` (String enum) | In |
| `mode` | `Mode` (String enum: `live_read_only` \| `proposal_only`) | In |
| `prompt.kind` | `PromptKind` (String enum) | In |
| `context` (already-authorized, **redacted / minimized**) | inside `RequestPayload` | In |
| whole response payload | `ResponsePayload` (String / JSON) | Out |
| `failClosedCode` / `warnings` / `audit` | inside `ResponsePayload` | Out |

The response payload always carries the resolved `mode`, `isLive`, optional
`answer`, `proposals[]`, `warnings[]`, and an `audit` receipt
(`correlationId`, `eventId`, `policyVersion`).

## D. Security role / permission model

- **Only authorized LOS users may call** the Custom API — gated by an
  existing security role that already grants the relevant workspace/deal
  read access.
- **No new workspace scope** is granted by the call; invocation reads
  nothing the caller could not already read.
- The server **trusts only the already-authorized context** supplied by the
  app **plus** the authenticated caller identity — never a client-asserted
  elevation.
- The server **re-checks policy** where needed (entitlement to the
  referenced surface, prompt/scope policy).
- **No cross-workspace / cross-deal lookup** — the context is scoped to the
  one deal/workspace the user is on.
- **No borrower raw document content** leaves the approved boundary unless a
  future explicit governance approval allows it (default: document metadata
  only).

## E. Server implementation responsibilities

The server-side plugin / Azure Function MUST:

1. **Validate the request shape** against the Phase 137B contract.
2. **Enforce allowed `workspace` / `surface` / `mode` / action types** —
   reject anything off the allowlist.
3. **Enforce `requireConfirmation: true`** on every proposal.
4. **Minimize / redact** the prompt + context before any model call.
5. **Call Azure OpenAI server-side only**, and only **after DLP / model-policy
   approval** (managed identity preferred; the client never holds a secret).
6. **Validate model output** against the response contract; reject unsafe
   or malformed output.
7. **Emit a fail-closed response** (`disabled` / `not_configured`) on any
   violation — never a fabricated answer.
8. **Never execute writes directly** — Copilot proposes; a human confirms
   and acts through an existing governed write path. **No autonomous
   writes.**

## F. Audit / event ledger requirements

A per-call **audit / event ledger record must be written before live
enablement**. Required fields:

- `correlationId`
- caller **UPN / profileId / workspaceName**
- **surface / deal id** (when applicable)
- **prompt kind**
- **prompt / context hash or summary** (redacted — never raw sensitive data)
- **mode**
- **model / deployment / version**
- **proposals emitted** (ids + action types)
- **warnings**
- **fail-closed reason** (when applicable)
- **timestamps** (request received, model called, response returned)
- **governed write id** (only if a confirmed proposal later routes a write)

If the audit record cannot be written, the call **fails closed**
(`audit_unavailable`) — no output is returned without an audit record.

## G. Failure matrix

Every error resolves to a fail-closed response (`disabled` /
`not_configured`, or `live_read_only` *with a warning* where partial
read-only output is still safe). It never returns fake output and never
crashes the UI.

| code | meaning | response |
| --- | --- | --- |
| `missing_config` | mode/provider/endpoint not configured | `not_configured`, no proposals |
| `policy_blocked` | request violates prompt / scope policy | `disabled`, warning, no proposals |
| `dlp_blocked` | DLP blocks the egress | `disabled`, warning, no proposals |
| `model_unavailable` | Azure OpenAI unreachable / over quota | `disabled`, warning, no proposals |
| `context_too_large` | context exceeds size / minimization bounds | `live_read_only` (reduced) with warning, or `disabled`; no fabricated answer |
| `unsafe_output` | model output failed safety / grounding checks | `disabled`, warning; output withheld |
| `audit_unavailable` | audit / event log write failed | `disabled`, warning; no output without an audit record |
| `connector_exception` | unexpected server error | `disabled`, honest reason; never crash the UI |

## H. Operator runbook (dry-run checklist only)

> **Checklist only — no write is performed in this phase.** Any `pac` /
> deployment command below is **future / manual** and must NOT be executed
> as part of Phase 137F. Run only against a **test tenant** when the time
> comes.

1. Confirm the **solution publisher / prefix** (`cr664`).
2. Confirm the **Custom API name availability** (`cr664_RunLosCopilotAssist`).
3. Confirm the **security role** that may call it (existing LOS role; no new
   scope).
4. Confirm the **audit / event table** exists (canonical ledger/event table).
5. Confirm the **Azure OpenAI deployment / model policy** (region, model,
   content filter, rate).
6. Confirm **DLP approval** for the Dataverse → Azure OpenAI egress.
7. Confirm **server-side secret / managed identity** (no client secret).
8. Confirm the **disable switch** (returns runtime to `not_configured` /
   `disabled` immediately).
9. Confirm **test tenant only** for first enablement.

_(Future / manual, not executed here — labelled for the eventual operator:
solution export/import, Custom API metadata registration, plugin step
registration. None are run in Phase 137F.)_

## I. Future implementation phases

- **137G** — Dataverse Custom API metadata creation script / spec, **guarded
  dry-run first**.
- **137H** — server-side plugin / Azure Function skeleton.
- **137I** — audit logger.
- **137J** — live transport behind disabled config.
- **137K** — controlled test enablement (test tenant only).

## J. Out of scope

- **No Custom API creation.**
- **No plugin / Azure Function.**
- **No Azure resource.**
- **No secrets.**
- **No live traffic.**
- **No client runtime behavior change.**

## References

- [PHASE_137A_COPILOT_LIVE_CONNECTOR_DECISION.md](./PHASE_137A_COPILOT_LIVE_CONNECTOR_DECISION.md)
- [PHASE_137B_COPILOT_CUSTOM_API_CONTRACT.md](./PHASE_137B_COPILOT_CUSTOM_API_CONTRACT.md)
- [PHASE_137C_COPILOT_CONNECTOR_SKELETON.md](./PHASE_137C_COPILOT_CONNECTOR_SKELETON.md)
- [PHASE_137D_COPILOT_TRANSPORT_SEAM.md](./PHASE_137D_COPILOT_TRANSPORT_SEAM.md)
- [PHASE_137E_COPILOT_CUSTOM_API_TRANSPORT_STUB.md](./PHASE_137E_COPILOT_CUSTOM_API_TRANSPORT_STUB.md)
- `feat/copilot-live-connector-safe-actions @ fea3520` — prior prep. **Not
  merged or implemented in Phase 137F.**

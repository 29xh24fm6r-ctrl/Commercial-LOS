# Phase 137B — Copilot Custom API contract spec

> **Contract / spec only.** This phase defines the *future* server-side
> Dataverse Custom API contract for the Copilot live connector. It does
> **not** implement it. No connector code, no Custom API, no plugin, no
> Azure Function, no secrets, no schema, and no live mode are created
> here. The runtime default stays **`not_configured`** exactly as shipped
> through Phases 129A / 130A / 130B / 137A.

## A. Purpose and status

- **This is contract/spec only.** It pins the request/response shapes,
  allowlisted action types, audit requirements, security gates, and
  fail-closed errors a future Phase 137C+ must implement.
- **Runtime remains `not_configured`.** The existing governed connector
  ([src/copilot/copilotConnector.ts](../src/copilot/copilotConnector.ts))
  continues to resolve to `not_configured` with no env set, and live
  providers without a server-side transport continue to fail closed to
  `disabled`. Nothing in `src/copilot` changes in this phase.
- **No connector code, Custom API, plugin, Azure Function, secrets,
  schema, or live mode is created here.**
- Architecture chosen in
  [PHASE_137A_COPILOT_LIVE_CONNECTOR_DECISION.md](./PHASE_137A_COPILOT_LIVE_CONNECTOR_DECISION.md):
  Dataverse Custom API → server-side plugin/Azure Function → Azure OpenAI
  server-side.

## B. Future Custom API name and boundary

**Recommended Custom API name:** **`cr664_RunLosCopilotAssist`** (alias
acceptable: `cr664_RunCopilotAssist`). It is a single unbound action that
takes the request contract (§C) and returns the response contract (§D).

Boundary invariants (hard):

- **The browser calls the Dataverse Custom API only** — a first-party
  Dataverse action inside the existing security/solution boundary.
- **The Custom API / server-side code calls Azure OpenAI server-side.**
- **The browser never calls Azure OpenAI directly.** No browser-direct
  Azure OpenAI call. No `api.openai.com` / `openai.azure.com` from the
  client.
- **Secrets stay server-side only** — the Azure OpenAI endpoint /
  deployment / key are never exposed to the client bundle (prefer managed
  identity).

```
Browser (Code App, already-authorized context)
   │  Dataverse Web API call → cr664_RunLosCopilotAssist
   ▼
Dataverse Custom API  ──►  plugin / Azure Function (server-side)
                              │  server-side secret (managed identity)
                              ▼
                          Azure OpenAI (server-side only)
```

## C. Request contract

The browser sends only **already-authorized UI / view-model context** —
the same context the cockpit already rendered. No new Dataverse query, no
cross-workspace or cross-deal lookup.

```json
{
  "workspace": "banker|manager|portfolio|team|executive",
  "surface": "deal|workspace",
  "mode": "live_read_only|proposal_only",
  "user": {
    "upn": "...",
    "profileId": "...",
    "workspaceName": "..."
  },
  "context": {
    "dealId": "...",
    "dealName": "...",
    "clientName": "...",
    "stage": "...",
    "status": "...",
    "metrics": {},
    "flags": [],
    "documents": [],
    "tasks": []
  },
  "prompt": {
    "kind": "summarize|next_best_action|draft_questions|explain_risk|prepare_review",
    "text": "..."
  },
  "policy": {
    "allowProposals": true,
    "allowedActionTypes": [],
    "requireConfirmation": true
  },
  "correlationId": "..."
}
```

Request rules (enforced server-side before any model call):

- **`context` is already-authorized UI / view-model context only.** It is
  the data the surface already loaded and the signed-in user is already
  entitled to see. The server re-checks authorization; the request never
  widens scope.
- **The request must be minimized / redacted.** Only fields needed for the
  prompt kind are sent; identifiers are minimized; free text is bounded.
- **No raw borrower documents** are sent unless a future policy explicitly
  allows it (default: document *metadata* only — id, type, status — never
  raw content).
- **No cross-workspace or cross-deal lookup from Copilot.** The context is
  scoped to the one deal/workspace the user is on; the server rejects a
  request whose `context` references records outside the user's authorized
  surface.
- `requireConfirmation` is always `true`; a request that sets it false is
  rejected.

## D. Response contract

```json
{
  "mode": "live_read_only|proposal_only|disabled|not_configured",
  "isLive": true,
  "answer": "...",
  "citations": [],
  "proposals": [
    {
      "id": "...",
      "actionType": "request_document|draft_borrower_message|create_task|flag_for_review|prepare_credit_memo",
      "title": "...",
      "summary": "...",
      "payload": {},
      "requireConfirmation": true,
      "governedWritePath": "...",
      "riskLevel": "low|medium|high",
      "auditReason": "..."
    }
  ],
  "warnings": [],
  "audit": {
    "correlationId": "...",
    "eventId": "...",
    "policyVersion": "..."
  }
}
```

Response rules:

- **Proposals only — no autonomous execution.** The response can describe
  a proposed action; it never performs a write, send, or approval itself.
- **All proposals require confirmation** (`requireConfirmation: true` on
  every proposal; a proposal without it is invalid).
- **Action types must be allowlisted** (§E). Any other `actionType` is
  rejected by the client adapter and not rendered.
- **The response must disclose live / not-live mode** via `mode` +
  `isLive`, so the UI can label AI output honestly.
- **Fail-closed responses use `disabled` / `not_configured`** with an
  honest explanation in `warnings`, never fabricated `answer` text and
  never `proposals`.
- Each write-capable proposal MUST carry a non-empty `governedWritePath`
  (the existing governed write the human confirmation would route through)
  and an `auditReason`.

## E. Allowlisted action types

The initial server-side proposal action allowlist. A proposal is rendered
only if its `actionType` is in this set; everything else is dropped.

| actionType | description | write-capable after confirmation | governed write path required | unavailable / fail-closed behavior |
| --- | --- | --- | --- | --- |
| `request_document` | Propose requesting a specific outstanding document from the borrower. | Yes (only after explicit user confirmation) | Yes — existing document-request / borrower-update governed path | Omit the proposal; surface a warning. Never auto-requests. |
| `draft_borrower_message` | Stage a draft borrower message for the banker to review/edit/send. | Yes (confirmation + existing email lane, which itself defaults to DRY_RUN) | Yes — existing email/communication governed path | Omit the proposal; never sends. The email lane stays governed/DRY_RUN. |
| `create_task` | Propose creating a follow-up task on the deal. | Yes (only after confirmation) | Yes — existing task-create governed path | Omit the proposal; surface a warning. Never auto-creates. |
| `flag_for_review` | Propose flagging the deal/item for human review. | Yes (only after confirmation) | Yes — existing review-flag governed path | Omit the proposal; surface a warning. Never auto-flags. |
| `prepare_credit_memo` | Propose preparing / regenerating the credit memo inputs for human review. | Yes (only after confirmation) | Yes — existing memo-generation governed path | Omit the proposal; surface a warning. Never auto-generates a final memo. |
| `explain_only` | Read-only explanation / summary. Never write-capable. | **No** | **None** (read-only) | Always safe; degrades to `answer` text only. |

Rules across all action types:

- **No write executes from a Copilot response** without (a) the named
  existing **`governedWritePath`** and (b) explicit user confirmation.
- The allowlist is closed: introducing a new action type is a future spec
  change, not a runtime configuration.
- `explain_only` is the safe floor — when proposals are disallowed or the
  connector fails closed, only `explain_only` / `answer` text remains.

## F. Audit / event logging requirements

There is **no dedicated Copilot audit table in this repo today.** Before
implementation, logging MUST use a **canonical ledger / event table**
(either a dedicated Copilot event table created under the chosen solution
publisher, or an existing canonical ledger/event table named at
implementation time). Every Custom API invocation logs one event.

Required audit fields:

- `correlationId`
- user **UPN / profileId / workspaceName**
- **workspace / surface / deal id** (when applicable)
- **prompt kind** + a **redacted prompt hash or summary** (never the raw
  prompt with sensitive data)
- **context hash / summary** (not the raw context)
- **model / deployment / version**
- **mode** (`live_read_only` / `proposal_only` / `disabled` /
  `not_configured`)
- **proposals emitted** (ids + action types)
- **confirmation status** (proposed / confirmed / declined)
- **final governed write id** (if a confirmed proposal routed through a
  governed write)
- **errors / fail-closed reason**
- **timestamps** (request received, model called, response returned)

If audit logging is unavailable, the call **fails closed** (`audit_unavailable`,
see §H) — no model output is returned without an audit record.

## G. Security and policy gates

- **Custom API security role requirements** — the action is callable only
  by roles that already hold the relevant workspace/deal read access;
  invocation does not grant new data access.
- **Workspace context already authorized by the app** — the server trusts
  no client-asserted scope; it re-verifies the signed-in user's
  entitlement to the referenced surface.
- **No new Dataverse scope** — the connector reads nothing the user could
  not already read; it adds no table/column permission.
- **Prompt minimization / redaction** — required before any model call
  (§C).
- **DLP approval required** — the Dataverse → Azure OpenAI egress path
  must be approved under the tenant DLP policy before enablement.
- **Azure OpenAI model policy required** — region, model, content
  filtering, and rate policy confirmed before enablement.
- **No secrets in client** — endpoint/deployment/key are server-only;
  no client-side secrets.
- **Disable switch required** — a single config switch returns the runtime
  to `not_configured` / `disabled` immediately.

## H. Error / fail-closed contract

Every error resolves to a `disabled` / `not_configured` response (or
`live_read_only` *with a warning* where partial read-only output is still
safe). It **never returns fake output** and **never throws the UI into a
crash**.

| error | meaning | response |
| --- | --- | --- |
| `missing_config` | mode/provider/endpoint not configured | `not_configured`, honest reason, no proposals |
| `policy_blocked` | request violates prompt/scope policy | `disabled`, warning, no proposals |
| `dlp_blocked` | DLP policy blocks the egress | `disabled`, warning, no proposals |
| `model_unavailable` | Azure OpenAI unreachable / over quota | `disabled`, warning, no proposals |
| `context_too_large` | context exceeds size/minimization bounds | `live_read_only` with warning (reduced) or `disabled`; no fabricated answer |
| `unsafe_output` | model output failed safety/grounding checks | `disabled`, warning; output withheld, never shown |
| `audit_unavailable` | audit/event log write failed | `disabled`, warning; no output without an audit record |
| `connector_exception` | unexpected server error | `disabled`, honest reason; never crash the UI |

In all cases: **never fake output, never throw the UI into a crash**, and
always disclose the resolved mode.

## I. Out of scope

Explicitly NOT part of Phase 137B:

- **No implementation.**
- **No endpoint creation.**
- **No plugin / Azure Function.**
- **No schema / migration.**
- **No secrets / config.**
- **No live traffic.**

## J. Implementation checklist for Phase 137C+

1. Create the server endpoint / Custom API (`cr664_RunLosCopilotAssist`).
2. Add server-side secret management (managed identity preferred).
3. Add the audit logger (canonical ledger / event table).
4. Add the connector adapter behind the existing mode resolver
   (`resolveCopilotConnectorStatus` / `CopilotLiveTransport`), so the
   client still calls only the Custom API.
5. Add tests (contract conformance, fail-closed, proposal allowlist,
   audit-required).
6. Keep the default **`not_configured`**.
7. Obtain security / DLP approval before enabling live mode.

## References

- [PHASE_137A_COPILOT_LIVE_CONNECTOR_DECISION.md](./PHASE_137A_COPILOT_LIVE_CONNECTOR_DECISION.md)
  — the architecture decision this contract implements.
- [SPEC_COPILOT_LIVE_CONNECTOR_AND_SAFE_ACTION_ADAPTERS.md](./SPEC_COPILOT_LIVE_CONNECTOR_AND_SAFE_ACTION_ADAPTERS.md)
  — the governed connector modes + safe proposal engine.
- `feat/copilot-live-connector-safe-actions @ fea3520` — prior prep.
  **Not merged or implemented in Phase 137B.**

# Phase 137H — Copilot server-side plugin / Azure Function skeleton spec

> **Server-side skeleton / spec only.** This phase defines the server-side
> implementation contract behind `cr664_RunLosCopilotAssist`. It creates
> **no** plugin project, **no** Azure Function, **no** Dataverse Custom API
> invocation, **no** Azure OpenAI call, **no** token, **no** secret, **no**
> schema, and **no** live traffic. The runtime Copilot connector stays
> **`not_configured`** and no client/cockpit behavior changes.

## A. Purpose and status

- **This is server-side skeleton / spec only.** It pins the handler
  pipeline, validation, policy, Azure OpenAI boundary, audit, and
  fail-closed contract a future implementation phase must satisfy.
- **Nothing is created here:** no plugin project, no Azure Function, no
  Dataverse Custom API invocation, no Azure OpenAI call, no token, no
  secret, no schema, no live traffic.
- **Runtime remains `not_configured`.** The Phase 137D resolver still
  resolves `not_configured` by default and the Phase 137E transport stub
  still fails closed; no concrete transport is wired.

This makes the future server build *safe to attempt* by fixing the
server-side contract before any code exists.

## B. Recommended implementation option

**Recommended primary implementation:** the Dataverse Custom API
`cr664_RunLosCopilotAssist` backed by a **server-side handler** that runs
inside the approved Dataverse/Power Platform boundary.

Acceptable handler forms:

1. **Dataverse plugin** registered on the Custom API message
   (**recommended**).
2. **Azure Function** called from the plugin / Custom API bridge — only if
   governance prefers an external service boundary.

Selection rule:

- **Prefer the Dataverse plugin** when the request/response handling,
  audit logging, and the Azure OpenAI call can all be kept within the
  approved server boundary (no extra egress surface to govern).
- **Prefer the Azure Function** only if managed identity, networking, DLP,
  and observability requirements are clearer there (e.g. an existing
  function app with a vetted managed identity + private networking).

Either way: the **browser calls only the Custom API**; the handler calls
Azure OpenAI **server-side**; secrets stay server-side.

## C. Server-side handler pipeline

Ordered stages. Any stage may short-circuit to `failClosed(code, reason)`
(see §H). No stage performs a Dataverse write or an autonomous action.

1. **Parse request JSON** (from the Custom API `RequestPayload`).
2. **Authenticate caller / read the Dataverse execution context**
   (initiating user identity from the platform — not client-asserted).
3. **Validate the request schema** against the Phase 137B contract (§D).
4. **Enforce workspace / surface / mode policy** (§E).
5. **Enforce allowlisted action types and `requireConfirmation: true`**.
6. **Minimize / redact** the context and prompt.
7. **Check DLP / model policy and the disable switch** (fail closed if
   disabled / not approved).
8. **Write the audit START event** — or `failClosed('audit_unavailable')`
   if the audit ledger is unavailable.
9. **Call Azure OpenAI server-side** only if approved and configured.
10. **Validate the model response** against the response contract.
11. **Convert actions into proposal-only objects** (allowlisted,
    confirmation-required, with `governedWritePath`).
12. **Write the audit COMPLETION event**.
13. **Return the response JSON** (mode, isLive, answer?, proposals[],
    warnings[], audit).
14. **Fail closed on any exception** (`connector_exception`), never throw
    raw into the caller.

## D. Request validation contract

The handler MUST reject (fail closed) unless ALL hold:

- `workspace` ∈ `banker | manager | portfolio | team | executive`.
- `surface` ∈ `deal | workspace`.
- `mode` ∈ `live_read_only | proposal_only` **only** (not_configured /
  disabled are responses, never requests).
- `prompt.kind` ∈ the prompt-kind allowlist (`summarize`,
  `next_best_action`, `draft_questions`, `explain_risk`,
  `prepare_review`).
- `policy.requireConfirmation === true`.
- `policy.allowedActionTypes` ⊆ the server action allowlist.
- `correlationId` is present.
- `context` is already-authorized and minimized (the data the surface
  already rendered).
- **No raw borrower documents** in `context` (metadata only) unless a
  future approved policy allows it.
- Payload within the **max size** bound, else `context_too_large`.

## E. Policy enforcement contract

- **No cross-workspace / cross-deal lookup** — context is scoped to the
  one deal/workspace the caller is on.
- The server **must not expand scope** beyond the caller / app context;
  invocation grants no new data access.
- **No raw borrower document content** leaves the approved boundary unless
  a future approved policy says so.
- **No write execution** — the handler never creates/updates/deletes a
  Dataverse record or sends anything.
- **Actions are proposals only.**
- Any **write-capable proposal** MUST include a non-empty
  `governedWritePath` **and** `requireConfirmation: true`.
- **`explain_only`** is the safe read-only floor (no governedWritePath
  required; never write-capable).

## F. Azure OpenAI boundary

- **Server-side only.** The browser never calls Azure OpenAI.
- **No client / browser API keys** — no secret in the bundle.
- **Managed identity** or a **server-side secret store** only (managed
  identity preferred).
- **Explicit deployment / model / version** (pinned, not implicit).
- **Prompt template / version pinned** (auditable).
- Model output **must be structured JSON** and **validated** against the
  response contract.
- **Unsafe or unparseable output fails closed** (`unsafe_output`); it is
  never shown.
- **No training / data-retention assumptions** unless an approved policy
  states so (default: no retention beyond the audited request).

## G. Audit / event ledger contract

- **Audit START before the model call** (stage 8).
- **Audit COMPLETION after the response** (stage 12).
- If the audit ledger is **unavailable, fail closed** with
  `audit_unavailable` — no model output is returned without an audit
  record.

Required audit fields:

- `correlationId`, `eventId`
- caller **UPN / profileId / workspaceName**
- **workspace / surface / deal id** (when applicable)
- **prompt kind**
- **redacted prompt / context hash or summary** (never raw sensitive data)
- **mode**
- **action allowlist** applied
- **model / deployment / version**
- **policy version**
- **proposals emitted** (ids + action types)
- **warnings**
- **fail-closed reason** (when applicable)
- **timestamps** (request received, model called, response returned)
- **eventual governed write id** (only if a confirmed proposal later
  routes a write)

## H. Fail-closed matrix

Every error resolves to a fail-closed response (`disabled` /
`not_configured`, or `live_read_only` *with a warning* where partial
read-only output is still safe). Never fake output; never crash the
caller.

| code | meaning | response |
| --- | --- | --- |
| `missing_config` | mode/provider/endpoint not configured | `not_configured`, no proposals |
| `policy_blocked` | request violates prompt / scope policy | `disabled`, warning, no proposals |
| `dlp_blocked` | DLP blocks the egress | `disabled`, warning, no proposals |
| `model_unavailable` | Azure OpenAI unreachable / over quota | `disabled`, warning, no proposals |
| `context_too_large` | context exceeds size / minimization bounds | `live_read_only` (reduced) with warning, or `disabled`; no fabricated answer |
| `unsafe_output` | model output failed safety / grounding / parse checks | `disabled`, warning; output withheld |
| `audit_unavailable` | audit / event log write failed | `disabled`, warning; no output without an audit record |
| `connector_exception` | unexpected server error | `disabled`, honest reason; never crash the caller |

## I. Pseudocode

Language-neutral pseudocode only — **not runnable code**, no plugin /
function project, no SDK calls.

```
function handleRunLosCopilotAssist(rawRequest, executionContext):
    try:
        request = parseJson(rawRequest.RequestPayload)          # 1
        caller  = readDataverseContext(executionContext)        # 2

        if not validateRequestSchema(request):                  # 3
            return failClosed('policy_blocked', 'invalid request schema')
        if not workspaceSurfaceModeAllowed(request):            # 4
            return failClosed('policy_blocked', 'workspace/surface/mode not allowed')
        if not actionsAllowlisted(request.policy) or request.policy.requireConfirmation != true:   # 5
            return failClosed('policy_blocked', 'action allowlist / confirmation violation')

        request.context = minimizeAndRedact(request.context)    # 6
        request.prompt  = minimizeAndRedact(request.prompt)

        if oversized(request):                                  # 6/D
            return failClosed('context_too_large', 'payload exceeds bound')
        if not dlpAndModelPolicyApproved() or disableSwitchOn():# 7
            return failClosed('dlp_blocked' | 'missing_config', 'policy/disable gate')

        auditId = auditStart(request, caller)                   # 8
        if auditId == null:
            return failClosed('audit_unavailable', 'cannot write audit start')

        modelOut = callAzureOpenAiServerSide(request)           # 9   (managed identity; server-only)
        if modelOut == null:
            auditComplete(auditId, 'model_unavailable')
            return failClosed('model_unavailable', 'no model response')

        if not validateResponseContract(modelOut):              # 10
            auditComplete(auditId, 'unsafe_output')
            return failClosed('unsafe_output', 'model output failed validation')

        proposals = toProposalsOnly(modelOut)                   # 11  (allowlisted; requireConfirmation=true;
                                                                #      governedWritePath unless explain_only)
        response = buildResponse(request.mode, modelOut, proposals)

        auditComplete(auditId, 'ok', proposals)                 # 12
        return response                                         # 13

    catch error:                                                # 14
        return failClosed('connector_exception', safeMessage(error))

function failClosed(code, reason):
    # honest disabled/not_configured; no answer, no proposals, no throw
    return { mode: failClosedMode(code), isLive: false, answer: null,
             proposals: [], warnings: [reason], failClosedCode: code,
             audit: { correlationId: currentCorrelationId() } }
```

## J. Deployment prerequisites

Before any implementation phase begins, confirm:

1. **Custom API metadata exists / verified** (`cr664_RunLosCopilotAssist`).
2. **Handler registration chosen** (plugin step vs Azure Function bridge).
3. **Security role confirmed** (existing LOS role; no new scope).
4. **Audit / event ledger exists** (canonical table).
5. **DLP / model policy approved** for the Dataverse → Azure OpenAI egress.
6. **Managed identity or server-side secret store configured** (no client
   secret).
7. **Disable switch configured** (returns runtime to
   `not_configured` / `disabled`).
8. **Test tenant ready** (first enablement is test-tenant only).
9. **Rollback / disable procedure documented**.

## K. Out of scope

- **No plugin code.**
- **No Azure Function code.**
- **No Custom API write.**
- **No Azure OpenAI call.**
- **No secrets.**
- **No live traffic.**
- **No client runtime change.**

## L. Next phases

- **137I** — audit / event ledger design or mapping (table/fields).
- **137J** — server handler pseudocode → tests, or a plugin skeleton in a
  **separate server project** only after approval.
- **137K** — disabled live-transport integration test (default
  `not_configured`).
- **137L** — controlled test-tenant enablement.

## References

- [PHASE_137A_COPILOT_LIVE_CONNECTOR_DECISION.md](./PHASE_137A_COPILOT_LIVE_CONNECTOR_DECISION.md)
- [PHASE_137B_COPILOT_CUSTOM_API_CONTRACT.md](./PHASE_137B_COPILOT_CUSTOM_API_CONTRACT.md)
- [PHASE_137F_COPILOT_CUSTOM_API_REGISTRATION_RUNBOOK.md](./PHASE_137F_COPILOT_CUSTOM_API_REGISTRATION_RUNBOOK.md)
- [PHASE_137G_COPILOT_CUSTOM_API_METADATA_SCRIPT.md](./PHASE_137G_COPILOT_CUSTOM_API_METADATA_SCRIPT.md)
- `feat/copilot-live-connector-safe-actions @ fea3520` — prior prep. **Not
  merged or implemented in Phase 137H.**

# Phase 137E — Copilot Custom API transport stub + implementation plan

> **Implementation-prep, still inert.** This phase adds a clearly-isolated
> **server-bound transport stub/factory** and a **pure readiness planner**
> for the future Dataverse Custom API (`cr664_RunLosCopilotAssist`). It
> makes **no network call**, reads **no secret**, enables **no live mode**,
> and changes **no cockpit behavior**. The runtime default stays
> **`not_configured`**.

## Purpose

Give the future live transport a single, isolated home and a concrete
implementation checklist — without enabling anything. The stub fails closed
so the seam can be exercised end-to-end (config → adapter → transport)
while the real server-side call does not yet exist.

## What was added

- **[src/copilot/copilotDataverseCustomApiTransport.ts](../src/copilot/copilotDataverseCustomApiTransport.ts)**
  — `createCopilotDataverseCustomApiTransport(options)` returns a
  `CopilotCustomApiTransport` whose `invoke(...)` resolves to a
  `disabled` / `missing_config` response (marker:
  `transport_not_implemented`). Symbolic config only; no URL, no secret, no
  client, no `fetch`, no `import.meta.env`. Re-exports the pinned
  `COPILOT_CUSTOM_API_NAME`.
- **[src/copilot/copilotTransportReadiness.ts](../src/copilot/copilotTransportReadiness.ts)**
  — `getCopilotTransportReadiness(config)`: a pure checklist projector that
  returns `{ ready, blockers, nextSteps }`. `ready` is always `false` in
  Phase 137E.
- Tests: `copilotDataverseCustomApiTransport.test.ts`,
  `copilotTransportReadiness.test.ts`, and governance
  `copilotTransportStubGovernance.test.ts`.

## Why the transport still fails closed

The browser must never call Azure OpenAI directly and must never hold a
secret (Phase 137A). Until the server-side Custom API + a server-only
transport exist and pass security/DLP review, the only safe behavior is to
fail closed. So the stub's `invoke` returns a `disabled` / `missing_config`
response — it never throws (the UI never crashes), never sets `isLive`,
never returns a proposal, and never fabricates an answer.

## Stub / factory boundary

```
createCopilotDataverseCustomApiTransport({ endpointAlias, customApiName?, policyVersion? })
   → CopilotCustomApiTransport
       invoke(request) → Promise<disabled / missing_config response>   (no network)

// The real, future implementation lives SERVER-SIDE behind the Dataverse
// Custom API (cr664_RunLosCopilotAssist). It is injected explicitly into
// runCopilotCustomApi(request, { config, transport }); there is no default.
```

The stub accepts a **symbolic** endpoint alias only — a URL-looking alias
still fails closed (with a "symbolic alias only" reason). It is reachable
only when a resolved live config and an explicitly-injected transport are
present (Phase 137D seam); nothing wires it by default.

## Readiness blockers

`getCopilotTransportReadiness(config)` reports these blockers (all present
in Phase 137E, so `ready === false`):

1. **Live Dataverse Custom API transport is not implemented** (this phase
   ships a fail-closed stub only).
2. **Dataverse Custom API registration (`cr664_RunLosCopilotAssist`) not
   verified.**
3. **Audit / event ledger logger not wired.**
4. **DLP and Azure OpenAI model policy not approved.**
5. **Server-side secret store / managed identity not configured.**
6. (config-derived) **Connector config is not in a live mode** — when the
   137D resolver has not resolved a `live_read_only` / `proposal_only`
   config.

## Future implementation checklist

1. Implement the server-bound transport behind the Dataverse Custom API and
   inject it explicitly (replace the stub's `invoke` body).
2. Register / verify the `cr664_RunLosCopilotAssist` Custom API + plugin /
   Azure Function under the chosen solution publisher.
3. Wire per-call audit logging to a canonical ledger / event table.
4. Obtain DLP approval for the Dataverse → Azure OpenAI egress and confirm
   the model / deployment policy.
5. Configure server-only secret management (prefer managed identity).
6. Keep the default **`not_configured`**; enable live only behind explicit
   config + security/DLP approval.

## Server-side Dataverse Custom API responsibilities

- Expose `cr664_RunLosCopilotAssist` as an unbound action taking the
  Phase 137B request and returning the Phase 137B response.
- Re-verify the caller's authorization to the referenced workspace/deal
  surface (no new Dataverse scope; no entitlement widening).
- Enforce prompt/context minimization + redaction before the model call.
- Return proposals only (allowlisted action types, `requireConfirmation`),
  never execute a write itself.

## Azure OpenAI responsibilities

- Called **server-side only** (managed identity preferred); the endpoint /
  deployment / key never reach the client.
- Operate within the approved region / model / content-filter / rate
  policy.
- Output is grounded + safety-checked server-side; unsafe output fails
  closed (`unsafe_output`), never shown.

## Audit / event ledger responsibilities

- One canonical ledger / event record per invocation: correlationId, user
  UPN/profile/workspace, surface/deal id, prompt kind + redacted prompt /
  context hash, model/deployment/version, mode, proposals emitted,
  confirmation status, final governed write id (if any), errors, and
  timestamps. If the audit write fails, the call fails closed
  (`audit_unavailable`).

## DLP / model governance prerequisites

- Tenant DLP approval for the Dataverse → Azure OpenAI egress path.
- Confirmed Azure OpenAI model / deployment policy.
- A disable switch returning the runtime to `not_configured` / `disabled`
  immediately.

## Guardrails preserved

No real `fetch`/`XMLHttpRequest`/network call · no Dataverse Custom API
invocation · no Azure OpenAI call · no browser-direct Azure/OpenAI endpoint
· no client-side secrets · no token work · no schema/migration · no
Dataverse writes · no Graph/Office/Teams/Outlook send · no autonomous
writes · no fake Copilot responses · no live connector enabled by default ·
no cockpit behavior change · default remains `not_configured` ·
`feat/copilot-live-connector-safe-actions` not merged · workspace
access/entitlements/routes unchanged.

## Tests

```
npm test -- copilotDataverseCustomApiTransport copilotTransportReadiness copilotConnectorConfig copilotCustomApi copilotConnectorSkeleton copilotLiveConnectorDecision copilotCustomApiContract releaseCandidateSnapshot
npm test -- copilot Copilot releaseCandidateSnapshot
npm run build
```

- `copilotDataverseCustomApiTransport.test.ts` — name pinned; factory
  returns a transport; stub invoke → disabled/missing_config; never
  `isLive`, never proposals, never throws; URL alias fails closed; stub +
  adapter seam stays fail-closed; default connector still not_configured.
- `copilotTransportReadiness.test.ts` — never ready; all blockers + next
  steps present; config blocker appears/omits correctly.
- `copilotTransportStubGovernance.test.ts` — stub-only, no concrete
  transport wired, no network/secret/write drift, prior docs honored.

## Next phase recommendation

**Phase 137F** — implement the real server-bound transport (replace the
stub's `invoke`), add the audit logger, and wire the resolved config +
transport into `getCopilotConnector()` — behind explicit config and
security/DLP approval, with default behavior unchanged.

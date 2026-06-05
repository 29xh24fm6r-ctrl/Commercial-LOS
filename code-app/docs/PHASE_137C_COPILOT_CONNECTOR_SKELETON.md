# Phase 137C — Copilot connector adapter skeleton (disabled by default)

> **Implementation-prep, but inert.** This phase adds the local
> request/response **types** and a **disabled-by-default adapter boundary**
> for the future Dataverse Custom API (`cr664_RunLosCopilotAssist`,
> specified in Phase 137B). It makes **no network call**, reads **no
> secret**, enables **no live mode**, and changes **no cockpit behavior**.
> The runtime default stays **`not_configured`**.

## Purpose

Prepare the codebase for the future live Copilot connector by landing the
contract types and the adapter seam — so a later Phase 137D+ can inject a
server-only transport without re-plumbing the client — while keeping the
runtime exactly as inert as Phases 129A / 130A / 130B / 137A / 137B.

## What was added

- **[src/copilot/copilotCustomApiContract.ts](../src/copilot/copilotCustomApiContract.ts)**
  — TypeScript-only realization of the Phase 137B request/response
  contract: the mode / workspace / surface / prompt-kind / action-type /
  risk-level / fail-closed enums, the request + response + proposal +
  audit interfaces, and pure validators/helpers.
- **[src/copilot/copilotCustomApiAdapter.ts](../src/copilot/copilotCustomApiAdapter.ts)**
  — a pure request builder, an optional **server-only transport
  interface**, and a runner that fails closed to `not_configured` when no
  transport is injected.
- Unit tests
  ([copilotCustomApiContract.test.ts](../src/copilot/copilotCustomApiContract.test.ts),
  [copilotCustomApiAdapter.test.ts](../src/copilot/copilotCustomApiAdapter.test.ts))
  and governance pins
  ([copilotConnectorSkeleton.test.ts](../src/shared/governance/copilotConnectorSkeleton.test.ts)).

## What remains disabled

- **No transport is wired.** `runCopilotCustomApi(request)` with no
  injected transport returns a fail-closed **`not_configured`** response
  (`failClosedCode: 'missing_config'`) — it never reaches a network call.
- **No live mode.** The existing connector
  ([copilotConnector.ts](../src/copilot/copilotConnector.ts)) is unchanged
  and still defaults to `not_configured`.
- **No cockpit wiring.** The existing Copilot surfaces continue to consume
  the existing not-configured connector; this skeleton is exported for a
  future phase and is not yet on any render path (zero UI churn).

## Types / adapter boundary

```
buildCopilotCustomApiRequest(input)  →  CopilotCustomApiRequest   (pure mapper, no IO)

runCopilotCustomApi(request, { transport? })  →  Promise<CopilotCustomApiResponse>
   • no transport  → createNotConfiguredCopilotResponse(...)   (fail closed, no network)
   • transport     → validate(transport.invoke(...)); invalid/throw → disabled/connector_exception

interface CopilotCustomApiTransport {            // server-only; NOT implemented here
  invoke(request): Promise<CopilotCustomApiResponse>
}
```

The transport is the only seam that could ever touch the network, and it
does not exist in this phase. The browser still has no path to Azure
OpenAI.

## Validation rules (`validateCopilotResponse`)

- `mode` must be one of the known modes (`not_configured` | `disabled` |
  `live_read_only` | `proposal_only`).
- Every response carries an audit `correlationId` (honest audit).
- **Fail-closed modes are honest:** `not_configured` / `disabled` must not
  be `isLive`, must not carry an `answer`, and must not carry proposals —
  no fake live output.
- Every proposal must set **`requireConfirmation: true`**.
- Every proposal `actionType` must be **allowlisted** (`request_document`,
  `draft_borrower_message`, `create_task`, `flag_for_review`,
  `prepare_credit_memo`, `explain_only`).
- Every **write-capable** proposal requires a non-empty `governedWritePath`;
  only the read-only `explain_only` floor may omit it.

## How this prepares for the future Custom API transport

A later Phase 137D+ implements a **server-only** `CopilotCustomApiTransport`
that calls the Dataverse Custom API (`cr664_RunLosCopilotAssist`), which in
turn calls Azure OpenAI server-side. That transport is **injected** into
`runCopilotCustomApi`; the client code, request shape, validation, and
fail-closed behavior defined here do not change. Enabling live mode then
becomes a configuration + injection step gated by security/DLP approval —
not a client rewrite.

## Why no network call exists yet

The browser must never call Azure OpenAI directly and must never hold a
secret (Phase 137A decision). Until the server-side Custom API + transport
exist and pass security/DLP review, the only safe behavior is to fail
closed. So this phase ships the seam **without** an implementation: with no
transport, the runner returns `not_configured` and performs no IO.

## Guardrails preserved

- No actual Dataverse Custom API call · no `fetch` / `XMLHttpRequest` /
  network call · no Azure OpenAI call · no browser-direct Azure OpenAI ·
  no client-side secrets · no token work · no schema changes/migrations ·
  no Dataverse writes · no Graph/Office/Teams/Outlook send · no autonomous
  writes · no fake Copilot responses · no live connector enabled · default
  remains `not_configured` · no cockpit behavior change · workspace
  access/entitlements/routes unchanged · `feat/copilot-live-connector-safe-actions`
  not merged.

## Acceptance tests

```
npm test -- copilotCustomApi copilotConnector copilotLiveConnectorDecision copilotCustomApiContract releaseCandidateSnapshot
npm test -- copilot Copilot releaseCandidateSnapshot
npm run build
```

- New unit suites (`copilotCustomApiContract`, `copilotCustomApiAdapter`)
  and the `copilotConnectorSkeleton` governance suite pass.
- Static `readdirSync` scans over `src/copilot` (in
  `copilotLiveConnectorDecision` + governance `copilotCustomApiContract`)
  automatically cover the new files: no fetch / Azure OpenAI / secret /
  send / write drift, default stays `not_configured`.

## Next phase suggestion

**Phase 137D** — add the pure config resolver + strengthen the config-gated
transport seam (still disabled by default). See
[PHASE_137D_COPILOT_TRANSPORT_SEAM.md](./PHASE_137D_COPILOT_TRANSPORT_SEAM.md).
A later phase then implements the server-only `CopilotCustomApiTransport`
against the Dataverse Custom API, adds the audit logger, and wires
`getCopilotConnector()` — behind explicit config and security/DLP approval,
with default behavior unchanged.

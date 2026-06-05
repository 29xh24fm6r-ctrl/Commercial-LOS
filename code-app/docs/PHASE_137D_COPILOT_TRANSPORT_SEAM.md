# Phase 137D — Copilot transport seam + config resolver (disabled by default)

> **Implementation-prep, still inert.** This phase adds a pure client-side
> **config resolver** and strengthens the adapter's **config + transport
> seam** so a future Phase 137E+ can inject a Dataverse Custom API
> transport. It makes **no network call**, reads **no secret**, enables
> **no live mode**, and changes **no cockpit behavior**. The runtime
> default stays **`not_configured`**.

## Purpose

Give the future live connector a single, governed gate: a pure resolver
that turns non-secret config flags into a `CopilotConnectorConfig`, and an
adapter that invokes the (still non-existent) transport **only** when that
config resolves to a live mode. Resolving config is decoupled from making a
call, so the seam can be reviewed and tested while remaining disabled.

## What changed

- **[src/copilot/copilotConnectorConfig.ts](../src/copilot/copilotConnectorConfig.ts)** *(new)*
  — `resolveCopilotConnectorConfig(envLike?)`, the `CopilotConnectorConfig`
  type, the `CopilotConnectorRuntimeMode` union, the exact Custom API name
  constant (`cr664_RunLosCopilotAssist`), and the symbolic endpoint-alias
  allowlist. Pure; no IO; no `import.meta.env`; no secret.
- **[src/copilot/copilotCustomApiAdapter.ts](../src/copilot/copilotCustomApiAdapter.ts)** *(updated)*
  — `RunCopilotCustomApiOptions` now takes `config?` and `transport?`. The
  runner gates on config: a transport is reachable **only** in a resolved
  live mode.
- Tests: `copilotConnectorConfig.test.ts` (new), `copilotCustomApiAdapter.test.ts`
  (updated for the config gate), `copilotConnectorSkeleton.test.ts`
  (extended).

## Config resolver behavior

`resolveCopilotConnectorConfig(envLike)` is pure and never throws:

| Input | Result |
| --- | --- |
| missing / empty / `VITE_COPILOT_MODE` unset | `not_configured` |
| `VITE_COPILOT_MODE=not_configured` | `not_configured` |
| `VITE_COPILOT_MODE=disabled` | `disabled` |
| unknown mode value | `disabled` (reason: unrecognized) |
| any **secret-looking key** (`SECRET`/`TOKEN`/`KEY`/`PASSWORD`/Azure/OpenAI) | `disabled` (fail closed) |
| any **secret-looking value** (URL, `bearer …`, `sk-…`, 40+‑char opaque) | `disabled` (fail closed) |
| live mode, but missing/wrong Custom API name | `disabled` |
| live mode, but endpoint alias is a URL/host | `disabled` |
| live mode, but endpoint alias not in the allowlist | `disabled` |
| live mode, but no `policyVersion` | `disabled` |
| live mode + exact Custom API name + symbolic alias + policyVersion | `live_read_only` / `proposal_only` |

Live mode resolves **only** with:

- `customApiName === 'cr664_RunLosCopilotAssist'` (exact);
- a **symbolic** `endpointAlias` from the allowlist (`dataverse-custom-api`)
  — never a URL/host;
- a present `policyVersion`.

A server-only Azure OpenAI key/endpoint, or any URL/token/long secret, in
the client-visible config **fails closed to `disabled`** — a secret must
never let the client resolve a live mode.

## Transport seam behavior

`runCopilotCustomApi(request, { config?, transport? })` resolves in this
fail-closed order:

1. no config or `not_configured` → **not_configured** response.
2. `disabled` → **disabled** response.
3. live mode (`live_read_only`/`proposal_only`) but **no transport** →
   **disabled** (`missing_config`).
4. live mode **+ transport** → invoke, then **validate**; an invalid /
   unsafe response or a thrown error → **disabled** (`connector_exception`).

The injected `CopilotCustomApiTransport` is the only seam that could ever
touch the network, it is reachable **only** in step 4, and **it does not
exist in this phase**.

## Fail-closed matrix

| config.mode | transport | result mode | failClosedCode |
| --- | --- | --- | --- |
| (none) | — | `not_configured` | `missing_config` |
| `not_configured` | any | `not_configured` | `missing_config` |
| `disabled` | any | `disabled` | `missing_config` |
| `live_read_only` / `proposal_only` | absent | `disabled` | `missing_config` |
| live | present, returns invalid | `disabled` | `connector_exception` |
| live | present, throws | `disabled` | `connector_exception` |
| live | present, returns valid | (transport's mode) | — |

No path returns a fabricated answer or a proposal in a fail-closed mode.

## Why no concrete transport exists yet

The browser must never call Azure OpenAI directly and must never hold a
secret (Phase 137A). Until the server-side Custom API
(`cr664_RunLosCopilotAssist`) + a server-only transport exist and pass
security/DLP review, the only safe behavior is to fail closed. So this
phase ships the **gate** (config resolver) and the **seam** (config-gated
runner) without an implementation: with no transport, the runner never
reaches a network call, and with secrets present it refuses to resolve a
live mode at all.

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
npm test -- copilotConnectorConfig copilotCustomApi copilotConnectorSkeleton copilotLiveConnectorDecision copilotCustomApiContract releaseCandidateSnapshot
npm test -- copilot Copilot releaseCandidateSnapshot
npm run build
```

- `copilotConnectorConfig.test.ts` — default/disabled/unknown modes; live
  contract (exact Custom API name, symbolic alias not a URL, policyVersion);
  secret-looking keys/values fail closed.
- `copilotCustomApiAdapter.test.ts` — config gates the transport (no
  config → not_configured; disabled → disabled; live without transport →
  disabled/missing_config; transport invoked only in a live mode; invalid/
  throw → disabled/connector_exception); `fetch` spy never called.
- `copilotConnectorSkeleton.test.ts` — resolver default not_configured, no
  secret env read, no client/transport construction, no `src/copilot`
  network/secret/write drift, default connector still not_configured.

## Next phase recommendation

**Phase 137E** — add the isolated server-bound transport stub/factory +
implementation plan (still fail-closed, default `not_configured`). See
[PHASE_137E_COPILOT_CUSTOM_API_TRANSPORT_STUB.md](./PHASE_137E_COPILOT_CUSTOM_API_TRANSPORT_STUB.md).
A later phase then implements the real server-only `CopilotCustomApiTransport`
against the Dataverse Custom API, adds the audit logger, and wires the
resolved config + transport into `getCopilotConnector()` — behind explicit
config and security/DLP approval, with default behavior unchanged.

# Phase 137L — Copilot server handler + controlled-enablement readiness bundle

> **Disabled readiness bundle only.** This phase consolidates the next
> readiness steps into one bundle: a disabled server-handler skeleton, the
> audit-logger integration contract, a disabled live-transport harness, and
> a controlled test-tenant enablement checklist. It is **inert and
> fail-closed by default** — **no live enablement**, no network, no
> Dataverse write, no Azure OpenAI call. The runtime Copilot connector
> stays **`not_configured`**.

## Purpose

Give the Copilot live runway one composable, tested place to wire its inert
pieces — and prove, in tests, that the disabled handler fails closed before
the model boundary and the live harness is never ready — without enabling
anything.

## What was combined

1. **Disabled server handler skeleton** —
   [src/copilot/copilotServerHandler.ts](../src/copilot/copilotServerHandler.ts).
2. **Audit-logger integration contract** — the handler attempts `audit_start`
   through the Phase 137K `CopilotAuditLogger` before any model boundary.
3. **Disabled live-transport harness / test seam** —
   [src/copilot/copilotLiveTransportHarness.ts](../src/copilot/copilotLiveTransportHarness.ts).
4. **Controlled test-tenant enablement checklist** — below.

## Disabled server handler behavior

`runCopilotServerHandler(request, deps)` / `createDisabledCopilotServerHandler(deps)`:

- **Validate request shape first** — an invalid request (bad workspace /
  surface / mode, missing correlationId, `requireConfirmation !== true`,
  …) **fails closed (`policy_blocked`) before any audit or model work**.
- **Attempt `audit_start`** via the injected `CopilotAuditLogger`. With no
  logger, it uses the disabled logger (Phase 137K), which fails closed.
- If `audit_start` returns `ok: false` → fail closed with
  **`audit_unavailable`**, `isLive: false`, `proposals: []`, **no answer**,
  and the **model boundary is never reached**.
- Even if a (test) logger reports audit success, the handler **still does
  not invoke the model boundary** — live mode is not enabled in 137L, so it
  returns **`not_configured`**.
- The **model boundary is an interface only** (`CopilotModelBoundary`) —
  never constructed, never invoked. `result.modelInvoked` is always
  `false`.

The handler performs **no IO**; the only injected side effect is
`auditLogger.writeEvent`, whose only implementation today is the disabled
no-op logger.

## Audit-before-model enforcement

This bundle encodes the core rule (Phase 137H/137I/137K): the handler must
write **`audit_start` before any Azure OpenAI / model call**; if it cannot,
it **fails closed with `audit_unavailable`** and makes **no model call**.
Tests prove the model boundary is never invoked on the fail-closed path —
and also never invoked on the audit-success path while live mode is off.

## Disabled live transport harness

`createDisabledCopilotLiveHarness()` composes the inert pieces — the Phase
137D config resolver (resolves `not_configured`), the Phase 137E
fail-closed transport stub, the Phase 137K disabled audit logger, and the
137L disabled handler — plus `evaluateCopilotLiveReadiness()`. It defaults
**disabled**: `config.mode === 'not_configured'` and `readiness.ready ===
false`. No network, no Dataverse invocation, no Azure OpenAI.

## Controlled test-tenant enablement checklist

Future, manual, **test-tenant only** — none executed in 137L:

1. Create the `cr664_copilotauditevent` audit table (guarded, dry-run
   first → explicit commit) — Phase 137J script.
2. Register / verify the `cr664_RunLosCopilotAssist` Custom API + handler.
3. Deploy the server handler (separate server project) with a real audit
   logger writing to `cr664_copilotauditevent`.
4. Obtain DLP + Azure OpenAI model/deployment policy approval.
5. Configure server-side managed identity / secret store (no client
   secret).
6. Configure the disable switch (returns runtime to `not_configured`).
7. Enable a single pilot in a **test tenant** behind explicit config; verify
   audit-before-model + fail-closed behavior end to end.
8. Governance sign-off before any production enablement.

## Remaining blockers

`evaluateCopilotLiveReadiness()` reports (all present — `ready: false`):

1. Audit table (`cr664_copilotauditevent`) not created.
2. Custom API (`cr664_RunLosCopilotAssist`) not verified.
3. Server handler not deployed.
4. Azure OpenAI model / DLP policy not approved.
5. Live mode not enabled (config resolves `not_configured`).

## Guardrails preserved

No live connector enablement · no real Dataverse Custom API invocation from
browser runtime · no Azure OpenAI call · no browser-direct Azure/OpenAI ·
no client-side secrets · no token work · no schema/table/migration
creation · no Dataverse writes · no plugin/Azure Function project · no
Graph/Office/Teams/Outlook send · no autonomous writes · no fake responses ·
no cockpit behavior change · default `not_configured` ·
`feat/copilot-live-connector-safe-actions` not merged · workspace
access/entitlements/routes unchanged.

## No live enablement in 137L

**No live enablement in Phase 137L.** Everything added is inert,
fail-closed, and disabled by default. The disabled handler never reaches
the model boundary, the harness is never ready, and the runtime stays
`not_configured`.

## Acceptance tests

```
npm test -- copilotServerHandler copilotLiveTransportHarness copilotServerHandlerReadinessBundle copilotAuditLogger releaseCandidateSnapshot
npm test -- copilot Copilot releaseCandidateSnapshot
npm run build
```

## Next phase

Either of (governance's choice):

- **Create the actual Dataverse `cr664_copilotauditevent` audit table** via
  the Phase 137J script with an **explicit commit flag** (guarded, dry-run
  first, test tenant only); **or**
- **Stop and perform a governance review** of the full 137A–137L runway
  before any table creation or live enablement.

No code in this repo enables live Copilot; that remains a deliberate,
governed, test-tenant-first decision. The full 137A–137L runway and its
decision gates are summarized in the board/operator checkpoint packet:
[PHASE_137M_COPILOT_GOVERNANCE_CHECKPOINT.md](./PHASE_137M_COPILOT_GOVERNANCE_CHECKPOINT.md).

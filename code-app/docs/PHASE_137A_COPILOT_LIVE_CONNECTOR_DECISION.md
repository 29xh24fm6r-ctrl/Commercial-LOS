# Phase 137A — Copilot live connector implementation decision

> **This is a decision / spec / governance phase, not an implementation
> phase.** No live connector is built, enabled, or wired here. The runtime
> default remains **`not_configured`** exactly as shipped through Phases
> 129A / 130A / 130B / SPEC-COPILOT-LIVE-CONNECTOR. This document records
> the architecture decision and the contract a future Phase 137B+ must
> honor before any live mode is implemented.

## A. Decision summary

**Primary recommended path:** a **Dataverse Custom API** backed by a
**server-side plugin or Azure Function**, which calls **Azure OpenAI
server-side**. The browser calls only the app-owned Dataverse Custom API
endpoint; it never calls Azure OpenAI directly and never holds a secret.

**Status after Phase 137A:** **Decision documented only. Runtime remains
not-configured.** No connector code, no Dataverse Custom API, no Azure
resource, no Copilot Studio build, and no enablement of live mode are part
of this phase. The existing governed connector
([src/copilot/copilotConnector.ts](../src/copilot/copilotConnector.ts))
continues to resolve to `not_configured` with no env set, and live
providers without a server-side transport continue to fail closed to
`disabled`.

## B. Alternatives considered

### 1. Dataverse Custom API + plugin/Azure Function + Azure OpenAI — **RECOMMENDED**
- **Selected as the primary implementation path.**
- **Server-side secrets only** — the Azure OpenAI endpoint / deployment /
  key live server-side (prefer managed identity); the client bundle never
  reads them.
- Fits **Dataverse governance and DLP** better — the call travels through
  a first-party Dataverse surface inside the existing security/solution
  boundary rather than a browser-to-cloud egress.
- Supports **audit logging** and a **proposal-only action model** —
  requests/responses can be logged to a canonical ledger/event table, and
  any actions are returned as confirmation-required proposals.

### 2. Copilot Studio custom connector — **ACCEPTABLE SECONDARY PATH**
- Acceptable secondary path; **not selected as the first implementation
  path** unless governance prefers it.
- Useful for **orchestration / enterprise governance** if licensing and
  DLP allow it.

### 3. Browser / client-direct Azure OpenAI — **REJECTED**
- **Rejected.** Exposes secrets, creates DLP risk, and gives a weak audit
  boundary. A browser-direct Azure OpenAI call is explicitly disallowed.

### 4. Fake local Copilot responses — **REJECTED**
- **Rejected.** Fabricated AI output violates the honesty contract. The
  not-configured posture must stay honest (local summaries clearly labelled
  non-AI); no fake live responses are ever presented as real.

### 5. Autonomous write agent — **REJECTED**
- **Rejected.** Copilot must remain **proposal-only with human
  confirmation**. It can summarize and propose; it can never write, send,
  approve, or execute autonomously.

## C. Required prerequisites before implementation

Before any Phase 137B+ implementation begins, the following must be
confirmed and recorded:

1. Confirm the **Azure OpenAI resource / deployment / model policy**
   (region, model, content-filtering and rate policy).
2. Confirm the **DLP policy** allows the chosen path (Dataverse Custom API
   → Azure OpenAI server-side).
3. Confirm the **Dataverse Custom API design and solution publisher**
   (request/response contract, security roles, solution ownership).
4. Confirm the **audit logging table** — a dedicated table or an existing
   canonical ledger / event table — for every request/response.
5. Confirm the **prompt / data minimization policy** (what context may be
   sent; redaction of identifiers).
6. Confirm the **safe action proposal schema** (allowlisted action types,
   `require_confirmation=true`, payload shape).
7. Confirm **who can invoke Copilot and on which workspace surfaces**
   (already-authorized context only; no entitlement widening).
8. Confirm **no borrower / customer-sensitive output leaves the approved
   boundary**.
9. Confirm a **rollback / disable flag** (a single config switch that
   returns the runtime to not-configured / disabled).

## D. Implementation contract for future Phase 137B+

A future live-connector implementation MUST satisfy every clause below:

- **Runtime default remains disabled / `not_configured`** unless env/config
  explicitly enables a live mode.
- **The client calls only an app-owned server / Dataverse Custom API
  endpoint — never Azure OpenAI directly.**
- **No secrets in the browser bundle** (no client-side secrets; server-only
  endpoint/deployment/key, managed identity preferred).
- **Responses must disclose live / not-live mode** to the user.
- **Any actions must be proposals with `require_confirmation=true`.**
- **Allowed action types must be allowlisted** (the proposal-engine enum;
  no free-form action types).
- **No write executes from a Copilot response** without an existing
  governed write path **and** explicit user confirmation.
- **All requests and responses need audit / event logging.**
- **Fail closed** on missing config, missing policy, or connector errors
  (resolve to not-configured / disabled; never throw into the UI; never
  fabricate output).
- **Workspace scope must use already-authorized context only** — no new
  Dataverse scope, no new permissions, no entitlement widening.

## E. Out of scope

Explicitly NOT part of Phase 137A:

- **No connector code.**
- **No Dataverse Custom API creation.**
- **No Azure resource creation.**
- **No Copilot Studio build.**
- **No enabling live mode.**
- **No production traffic.**
- **No secrets.**

## References

- [PHASE_137B_COPILOT_CUSTOM_API_CONTRACT.md](./PHASE_137B_COPILOT_CUSTOM_API_CONTRACT.md)
  — the future server-side Custom API request/response contract that
  implements this decision (contract/spec only; runtime stays
  not-configured).
- [SPEC_COPILOT_LIVE_CONNECTOR_AND_SAFE_ACTION_ADAPTERS.md](./SPEC_COPILOT_LIVE_CONNECTOR_AND_SAFE_ACTION_ADAPTERS.md)
  — the governed connector modes + safe proposal engine this decision
  builds on.
- [PHASE_130B_COPILOT_CONNECTOR_READINESS.md](./PHASE_130B_COPILOT_CONNECTOR_READINESS.md)
  — connector readiness and the server-side transport boundary.
- `feat/copilot-live-connector-safe-actions @ fea3520` — prior live-connector
  / safe-action prep. **Not merged or implemented in Phase 137A**; any use
  is deferred to an explicitly-instructed future phase.

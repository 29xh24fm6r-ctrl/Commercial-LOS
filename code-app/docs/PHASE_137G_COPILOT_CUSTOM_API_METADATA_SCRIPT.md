# Phase 137G — Copilot Dataverse Custom API metadata script (guarded dry-run first)

> **Script/spec, dry-run first — nothing is created.** This phase adds a
> guarded operator-script mode that can **inspect** (read-only GET) or
> **plan** (offline dry-run) the Dataverse Custom API metadata for
> `cr664_RunLosCopilotAssist`. It performs **no write**, **no Azure OpenAI
> call**, and **no live enablement**. Commit / live metadata creation is
> intentionally **not implemented** in this phase. The runtime Copilot
> connector stays **`not_configured`** and no browser behavior changes.

## Purpose

Give the operator a safe way to (a) see whether the future Custom API
already exists and (b) review the exact planned metadata payloads — before
any real creation phase. The plan mode is fully offline; the inspect mode
is read-only. Neither can write.

## What the script mode does

New modes on `scripts/phase122-lookup-repair.mjs` (mutually exclusive with
every existing mode; dry-run remains the default):

- **`--inspect-copilot-custom-api`** — read-only. Pure `GET`s against the
  `customapis` metadata endpoint; reports whether `cr664_RunLosCopilotAssist`
  exists and, if so, its request/response parameter metadata, plus the
  expected Phase 137B contract. Never writes.
- **`--seed-copilot-custom-api-metadata`** — **offline dry-run only**. No
  pac auth, no Web API call, no write. Prints the exact planned Dataverse
  metadata payloads (CustomAPI + request parameters + response property)
  and returns before any auth/network.
- **`--commit-seed-copilot-custom-api-metadata`** — accepted only alongside
  the seed mode, but **commit is NOT implemented in Phase 137G**: passing
  it prints a notice and still performs **no write**.

## Exact commands

```sh
# Read-only inspection (requires an authenticated pac session at runtime)
node scripts/phase122-lookup-repair.mjs --inspect-copilot-custom-api

# Offline dry-run plan (no auth, no network, no write)
node scripts/phase122-lookup-repair.mjs --seed-copilot-custom-api-metadata

# Commit — NOT IMPLEMENTED in 137G (prints a notice, writes nothing)
node scripts/phase122-lookup-repair.mjs \
  --seed-copilot-custom-api-metadata \
  --commit-seed-copilot-custom-api-metadata
```

> The commit command does **not** create the Custom API. Metadata creation
> is deferred to a future phase (Phase 137F runbook §I: 137G guarded
> dry-run first → later phases create it).

## Expected planned metadata

| Component | Value |
| --- | --- |
| **CustomAPI uniquename / name** | `cr664_RunLosCopilotAssist` |
| **Display name** | `Run LOS Copilot Assist` |
| **IsFunction** | `false` (Action, not Function) |
| **IsPrivate** | `false` (callable by authorized LOS users) |
| **BindingType** | `0` (Global / **unbound** — recommended) |
| **AllowedCustomProcessingStepType** | `0` (None) |
| **ExecutePrivilegeName** | `null` (gated by an existing LOS security role) |
| **Request parameter** | `RequestPayload` (String) — Phase 137B request JSON |
| **Request parameter** | `CorrelationId` (String) — audit/event correlation |
| **Response property** | `ResponsePayload` (String) — Phase 137B response JSON |

All values are printed verbatim by the dry-run so the operator can review
them before any future creation phase.

## Guardrails

- **Dry-run by default**; the seed mode is offline and writes nothing.
- **No live write** in this phase — commit is not implemented.
- No real `fetch` to Azure/OpenAI; no `api.openai.com` / `openai.azure.com`.
- The inspect mode is **read-only GET** only (no POST/PATCH/DELETE).
- No client-side secrets; no token work beyond the existing read-only auth
  the inspect mode reuses.
- No `Bypass*` / `Suppress*` / `Force` headers.
- No schema/migration is applied; only a metadata **plan** is printed.
- No Dataverse writes, no Graph/Office/Teams/Outlook send, no autonomous
  writes, no fake Copilot responses.
- No cockpit behavior change; no workspace access/entitlement/route change.
- `feat/copilot-live-connector-safe-actions` is not merged.

## Why plugin / Azure Function is out of scope

The Custom API is only the Dataverse-side surface. Its server-side
**plugin / Azure Function** (which actually calls Azure OpenAI) is a
separate, later phase (Phase 137H per the 137F runbook). This phase plans
**only** the Custom API metadata — it does not register a plugin step,
create an Azure resource, or wire any server-side execution.

## Why runtime remains not_configured

No transport is implemented and no Custom API is created, so the Phase
137D config resolver still resolves `not_configured` by default and the
Phase 137E transport stub still fails closed. Inspecting or planning
metadata changes nothing at runtime — the browser still has no path to
Azure OpenAI and `getCopilotConnector().status().mode` stays
`not_configured`.

## Acceptance tests

```
node --check scripts/phase122-lookup-repair.mjs
npm test -- phase122BScriptContract releaseCandidateSnapshot copilotCustomApiRegistrationRunbook copilotTransportStubGovernance
npm test -- copilot Copilot releaseCandidateSnapshot
npm run build
```

- `phase122BScriptContract.test.ts` §137G — new args + constants parsed;
  MODE banner strings; mutex + exclusive-modes include the new modes;
  commit gated/not-implemented; offline seed plan prints payloads and
  issues no write/fetch; inspect mode is GET-only; no Azure/OpenAI/secret/
  bypass drift; script imports nothing from `src/`.

## Next phase recommendation

**Phase 137H** — author the server-side plugin / Azure Function skeleton
behind the Custom API (still no live enablement, default `not_configured`),
followed by the audit logger (137I), the live transport (137J), and a
controlled test-tenant enablement (137K) — per the Phase 137F runbook.

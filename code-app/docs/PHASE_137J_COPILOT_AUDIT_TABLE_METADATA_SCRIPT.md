# Phase 137J — Copilot audit-event table metadata script (guarded dry-run first)

> **Dry-run metadata script / spec only — nothing is created.** This phase
> adds a guarded operator-script mode that can **inspect** (read-only GET)
> or **plan** (offline dry-run) the Dataverse metadata for the future
> `cr664_copilotauditevent` audit table (Phase 137I design). It performs
> **no write**, **no table/attribute/index creation**, **no publish**, **no
> Azure OpenAI call**, and **no live enablement**. Commit / live table
> creation is intentionally **not implemented** in this phase. The runtime
> Copilot connector stays **`not_configured`**.

## Purpose

Give the operator a safe way to (a) see whether the future audit table
already exists (and which expected fields are present) and (b) review the
exact planned table / field / index metadata — before any real creation
phase. The plan mode is fully offline; the inspect mode is read-only.
Neither can write.

## Status

- **Dry-run metadata script / spec only.**
- **No table creation in Phase 137J** — no table, no attributes, no
  indexes, no publish.
- Runtime Copilot connector remains **`not_configured`**.

## Commands

```sh
# Read-only inspection (requires an authenticated pac session at runtime)
node scripts/phase122-lookup-repair.mjs --inspect-copilot-audit-table

# Offline dry-run plan (no auth, no network, no write)
node scripts/phase122-lookup-repair.mjs --seed-copilot-audit-table-metadata
```

### Commit command — NOT IMPLEMENTED in Phase 137J

```sh
# Prints a clear not-implemented notice and writes nothing.
node scripts/phase122-lookup-repair.mjs \
  --seed-copilot-audit-table-metadata \
  --commit-seed-copilot-audit-table-metadata
```

> `--commit-seed-copilot-audit-table-metadata is not implemented in Phase
> 137J; run dry-run only.` Live table creation is deferred to a future
> phase.

## Planned table metadata

| Property | Value |
| --- | --- |
| **Logical / schema name** | `cr664_copilotauditevent` |
| **Display name** | `Copilot Audit Event` |
| **Plural display name** | `Copilot Audit Events` |
| **Primary name attribute** | `cr664_name` |
| **Recommended ownership** | User/team-owned (unless an existing project convention requires organization-owned) |

## Planned field contract

The 32 audit fields from the Phase 137I design (one future attribute each):

`cr664_correlationid`, `cr664_eventtype`, `cr664_eventtimestamp`,
`cr664_userupn`, `cr664_userprofileid`, `cr664_workspacename`,
`cr664_workspace`, `cr664_surface`, `cr664_dealid`, `cr664_dealname`,
`cr664_promptkind`, `cr664_redactedpromptsummary`, `cr664_prompthash`,
`cr664_contextsummary`, `cr664_contexthash`, `cr664_mode`,
`cr664_policyversion`, `cr664_modeldeployment`, `cr664_modelversion`,
`cr664_responsemode`, `cr664_islive`, `cr664_failclosedcode`,
`cr664_warningsjson`, `cr664_proposalsjson`, `cr664_proposalcount`,
`cr664_confirmationstatus`, `cr664_confirmedproposalid`,
`cr664_governedwritepath`, `cr664_governedwriteid`, `cr664_errorclass`,
`cr664_errorsummary`, `cr664_payloadversion`.

> Privacy (Phase 137I §G): summary / hash fields carry **no raw borrower
> documents and no secrets / tokens / API keys**.

## Planned event type values

`cr664_eventtype` option values (Phase 137I lifecycle):

- `audit_start`
- `audit_completion`
- `audit_fail_closed`
- `proposal_confirmed`
- `governed_write_completed`

## Planned indexes

- `cr664_correlationid`
- `cr664_eventtimestamp`
- `cr664_userprofileid`
- `cr664_workspace`
- `cr664_dealid`

> **No uniqueness on `cr664_correlationid`** — multiple lifecycle events
> share one correlation id.

## Audit-before-model rule

The whole reason this table exists: the server handler must write an
**`audit_start`** event **before any Azure OpenAI / model call**. If
`audit_start` cannot be written, the handler **fails closed** with
**`audit_unavailable`** and makes **no model call** (Phase 137H/137I).
Planning or inspecting this table changes nothing at runtime.

## Guardrails

- **Dry-run by default**; the seed mode is offline and writes nothing.
- **No live Dataverse table creation** in this phase — commit is not
  implemented.
- No table / attribute / index creation; **no `PublishXml`**.
- The inspect mode is **read-only GET** only (no POST/PATCH/DELETE).
- No real `fetch` to Azure/OpenAI; no `api.openai.com` / `openai.azure.com`.
- No client-side secrets; no token work beyond the read-only auth the
  inspect mode reuses.
- No `Bypass*` / `Suppress*` / `Force` headers.
- No migration/schema applied; no server handler; no plugin / Azure
  Function; no Custom API invocation; no Azure OpenAI call.
- No browser/cockpit/workspace/entitlement/route change; default remains
  `not_configured`.
- `feat/copilot-live-connector-safe-actions` is not merged.

## Acceptance tests

```
node --check scripts/phase122-lookup-repair.mjs
npm test -- phase122BScriptContract copilotAuditEventLedgerDesign releaseCandidateSnapshot
npm test -- copilot Copilot releaseCandidateSnapshot
npm run build
```

- `phase122BScriptContract.test.ts` §137J — new args + constants parsed;
  MODE banner strings; mutex + exclusive-modes include the new modes;
  commit gated/not-implemented; offline seed plan prints metadata and
  issues no write/fetch/publish; inspect mode is GET-only; no Azure/OpenAI/
  secret/bypass drift.

## Next phase recommendation

**Phase 137K** — server audit-logger **interface / skeleton (disabled)**
that targets `cr664_copilotauditevent`, still default `not_configured` —
followed by the server handler skeleton (137L), a disabled live-transport
test harness (137M), and controlled test-tenant enablement (137N), per the
Phase 137I design.

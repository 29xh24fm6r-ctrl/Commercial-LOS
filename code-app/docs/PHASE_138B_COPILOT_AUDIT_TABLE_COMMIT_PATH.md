# Phase 138B — Copilot audit-table guarded commit path

> **Dry-run metadata plan + future-only commit.** This phase upgrades the
> Phase 137J audit-table metadata mode to print a **complete** planned
> EntityDefinitions + typed AttributeDefinitions payload, and defines the
> **guarded commit contract**. The commit flag is **explicitly NOT
> implemented in 138B** (future-only) because this repo has no proven
> Dataverse table/attribute creation pattern and live creation is a gated,
> approval-first decision. **No table is created**, **no write is
> performed**, and the runtime Copilot connector stays **`not_configured`**.

## Purpose

Make the audit-table metadata mode **commit-ready in design** — a complete,
reviewable payload plan and an explicit, guarded commit contract — without
shipping an unproven, untestable, hard-to-rollback live table-creation write
path.

## Status

- **Dry-run remains the default.** The seed mode is offline and prints the
  full plan only.
- **Commit is future-only / NOT IMPLEMENTED in 138B.** Passing
  `--commit-seed-copilot-audit-table-metadata` prints a clear notice and
  performs no write.
- **Decision rationale:** the repo has **no proven `EntityDefinitions`
  (table) or `AttributeDefinitions` (attribute) creation pattern** (only
  lookup-relationship + record-row writes exist), and live audit-table
  creation requires **Gate 1 (DLP / model policy) + Gate 2 approval in a
  TEST TENANT first** (see [PHASE_137M](./PHASE_137M_COPILOT_GOVERNANCE_CHECKPOINT.md)
  / [PHASE_138A](./PHASE_138A_COPILOT_COMPLETION_CERTIFICATION.md)). Shipping
  an untested table-creation write path would violate the runway's safety
  posture.

## Exact dry-run command

```sh
# Offline — no auth, no network, no write. Prints the complete payload plan.
node scripts/phase122-lookup-repair.mjs --seed-copilot-audit-table-metadata
```

## Exact commit command (future-only)

```sh
# Prints a clear "NOT IMPLEMENTED in Phase 138B; run dry-run only" notice
# and performs NO write.
node scripts/phase122-lookup-repair.mjs \
  --seed-copilot-audit-table-metadata \
  --commit-seed-copilot-audit-table-metadata
```

There is also a read-only inspect mode:

```sh
node scripts/phase122-lookup-repair.mjs --inspect-copilot-audit-table
```

## What the (future) commit mode creates

When implemented (test tenant, after approval), commit mode would create
**only**:

- **The table** `cr664_copilotauditevent` (`EntityDefinitions` POST):
  - Schema/logical name `cr664_copilotauditevent`;
  - Display name **Copilot Audit Event**, plural **Copilot Audit Events**;
  - Primary name attribute **`cr664_name`** (required String,
    `IsPrimaryName: true`);
  - **User/team-owned** ownership.
- **The audit fields** — one typed `AttributeDefinitions` per field
  (Phase 137I/137J contract): single-line **String** for ids / enums /
  hashes; **Memo** for `cr664_redactedpromptsummary`,
  `cr664_contextsummary`, `cr664_warningsjson`, `cr664_proposalsjson`,
  `cr664_errorsummary`; **DateTime** for `cr664_eventtimestamp`;
  **Boolean** for `cr664_islive`; **Integer** for `cr664_proposalcount`.
  `cr664_eventtype` is **text-first** (a Picklist is future hardening).

The dry-run prints the exact illustrative payloads for all of the above.

## What the commit mode never creates

- No **Custom API** (`cr664_RunLosCopilotAssist`) — that is a separate,
  later phase.
- No **plugin / Azure Function** project.
- No **Azure / OpenAI** resource and no model call.
- No **indexes** are auto-created in 138B (indexes are recommended in the
  plan; index creation is future hardening).
- No **Copilot runtime enablement** — default stays `not_configured`.
- No **routes / entitlements / cockpit** change.

## Idempotency behavior (future commit contract)

- **Inspect first** — read `cr664_copilotauditevent` metadata before any
  create.
- **Idempotent** — if the table already exists, **verify the expected
  fields and skip the create** (no recreate, no mutation).
- **Bail on ambiguous / duplicate** existing metadata — never guess.
- **Verify** by re-reading the table metadata + expected fields after any
  create.

## Rollback / manual cleanup warning

Table + attribute creation is a **heavyweight Dataverse metadata
operation**. If a future commit is ever run and must be undone, **rollback
is manual** (delete the table via the Maker Portal / metadata API in the
test tenant). There is **no automated rollback** in this script — which is
one more reason commit is gated and test-tenant-first.

## Expected verification output

- **Inspect** prints whether `cr664_copilotauditevent` exists and a
  per-field present/absent (`✓`/`✗`) checklist.
- **Dry-run seed** prints the full table payload, the primary-name
  attribute, a typed payload per field, the `cr664_eventtype` option
  values, the recommended indexes, and closes with: *"No table is created.
  No attributes are created. No indexes are created. No publish is run.
  This is a metadata plan only."*

## Guardrails preserved

- Dry-run by default; commit is future-only and writes nothing.
- No live Dataverse table creation; no Dataverse writes; no schema applied.
- No `PublishXml`; no `Bypass*` / `Suppress*` / `Force` headers.
- No Custom API invocation; no plugin / Azure Function; no Azure OpenAI
  call; no `api.openai.com` / `openai.azure.com`.
- No client-side secrets; no token work beyond the existing operator-auth
  mechanism (read-only inspect only).
- Publisher prefix `cr664`; forbidden prefix `new_` is rejected.
- No browser/cockpit/workspace/access/entitlement/route change.
- `feat/copilot-live-connector-safe-actions` not merged.

## Why Copilot still remains not_configured

Planning or inspecting table metadata changes nothing at runtime. No
table exists, no Custom API exists, no transport is wired, and the Phase
137D config resolver still resolves `not_configured` by default with the
137E stub failing closed. `getCopilotConnector().status().mode` stays
`not_configured`.

## Acceptance tests

```
node --check scripts/phase122-lookup-repair.mjs
npm test -- phase122BScriptContract copilotAuditEventLedgerDesign copilotAuditLogger releaseCandidateSnapshot
npm test -- copilot Copilot releaseCandidateSnapshot
npm run build
```

## Next phase

**Custom API commit path** — extend the guarded path to the
`cr664_RunLosCopilotAssist` Custom API metadata (still dry-run-first /
future-only until the audit table exists and Gate 1/Gate 2 are approved in
a test tenant), per the Phase 137F runbook.

> **Done in Phase 138C:** the Custom API guarded commit contract,
> server-handler deployment plan, controlled test-tenant runbook, and final
> live-readiness certification. See
> [PHASE_138C_COPILOT_LIVE_READINESS_CERTIFICATION.md](./PHASE_138C_COPILOT_LIVE_READINESS_CERTIFICATION.md).

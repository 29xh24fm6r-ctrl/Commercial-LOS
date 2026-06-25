# Phase 246 — Hydrate Runtime Verified State from Live Dataverse Evidence

## Outcome

**No live gate changed. `enabledCount = 1 / 6`. `fullLaunchAchieved = false`.
`pac code push` NOT performed.**

This phase closes the gap discovered in Phase 245 by defining a governed, read-only
bridge that converts **actual** schema-verification evidence into the runtime
`VerifiedCrmSchemaState` / `VerifiedBoardingSchemaState` consumed by the fail-closed
runtime gates — and proves the **current** evidence does not hydrate.

- **CRM verified-state hydration result:** NOT hydrated (current evidence `live=0/0`).
- **Portfolio verified-state hydration result:** NOT hydrated (current evidence `live=0/0`).

## Why Phase 245 did not flip gates

Phase 244/245 proved the CRM and portfolio **generated services and data sources** are
registered (`services 5/5`, `datasources 5/5`; `13/13`), and `STATUS=PASS`. But
`verify-full-schema.ps1` reported **`live = 0/0`** — the live Dataverse `EntityDefinitions`
check did not run (no org token at verification time). The runtime gates
([crmRuntimeSchemaGate.ts](../src/crm/crmRuntimeSchemaGate.ts),
[portfolioBoardingRuntimeSchemaGate.ts](../src/portfolioBoarding/portfolioBoardingRuntimeSchemaGate.ts))
require an **injected** `VerifiedCrmSchemaState` / `VerifiedBoardingSchemaState` that
meets the plan's table/column/relationship counts with zero conflicts. With `live=0/0`
there is nothing to hydrate that state from, so the runtime cutover path fails closed —
which is why no gate was flipped and the dashboard correctly stayed at `1/6`.

## How terminal PASS evidence becomes runtime verified state

[src/admin/runtimeVerifiedSchemaBridge.ts](../src/admin/runtimeVerifiedSchemaBridge.ts)
is a **pure, read-only** function (no IO, no Dataverse mutation, no flag flip). It maps a
typed `SchemaVerificationEvidence` object into a runtime verified state, returning the
state **only** when every guard passes, and otherwise failing closed (`null` + stated
blockers):

| Guard | CRM | Portfolio |
| --- | --- | --- |
| `STATUS` | `PASS` | `PASS` |
| generated services | `found === expected === 5` | `=== 13` |
| data sources | `found === expected === 5` | `=== 13` |
| live tables | `checked > 0` **and** `found === checked === 5` | `=== 13` |
| measured schema | meets plan tables + columns, `conflicts === 0` | meets plan tables + columns + required relationships, `conflicts === 0` |
| freshness | parseable timestamp; not stale (when a clock is supplied) | same |

A `BLOCKED`/`UNKNOWN` status, a `live=0/0` (zero-total) count, a partial live count, a
services/datasources mismatch, an absent measured schema, a schema conflict, or stale /
missing-timestamp evidence each **fails closed**. Nothing is hardcoded to PASS: the
committed `CURRENT_CRM_VERIFICATION_EVIDENCE` / `CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE`
carry `liveTables { found: 0, checked: 0 }` and therefore do not hydrate.

The cutover ledger ([controlledLiveCutoverReadiness.ts](../src/admin/controlledLiveCutoverReadiness.ts))
now **derives** `liveSchemaVerified` from this bridge applied to the real evidence,
instead of a hardcoded constant — so the value comes from evaluating evidence and is
currently `false` for both domains.

## What still must happen before CRM/portfolio live gate cutover

1. **Run the live schema verification with an org token** so `verify-full-schema.ps1`
   produces `live=5/5` (CRM) and `live=13/13` (portfolio) — not `live=0/0` — and a
   measured column/relationship comparison against the schema plan.
2. **Feed that real evidence to the bridge**; it then hydrates a `VerifiedCrmSchemaState`
   / `VerifiedBoardingSchemaState`.
3. **Record a controlled production smoke** (single-record writeback / boarding) with
   rollback evidence.
4. **Then** flip the governed gate (`CRM_LIVE_PERSISTENCE_ENABLED` /
   `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` + route) under the separate governed
   cutover. The runtime gate still requires the flag **and** the hydrated verified state
   **and** an authorized operator **and** an injected transport — all four, fail-closed.

Document checklist and borrower/Outlook gates are untouched (still UNKNOWN, still false).

## Safety

No live gate flipped, no `pac code push`, no schema verification faked, no hardcoded PASS,
no weakening of runtime fail-closed behavior. The bridge is additive and read-only; this
commit changes no feature flag.

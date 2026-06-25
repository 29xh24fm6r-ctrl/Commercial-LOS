# Phase 252 — Real Token-Backed Runtime Schema Measurement (and the schema-completeness gap)

## Outcome

**A real token-backed Dataverse measurement succeeded; the committed artifacts are genuine
PASS evidence. But runtime verified state does NOT hydrate — the live schema is the minimal
deployment spine, incomplete vs the runtime bridge plan. No live gate changed.
`enabledCount = 1 / 6`. `fullLaunchAchieved = false`. `pac code push` NOT performed.**

- **CRM runtime hydration status:** **NOT hydrated** (live 5/5 tables, but 5/10 plan tables, 40/147 plan columns).
- **Portfolio runtime hydration status:** **NOT hydrated** (live 13/13 tables, but 15/219 plan columns, 0/12 required relationships).

## The real measurement (Matthew Paller's Environment)

A Dataverse Web API token was generated and validated by the operator:

```powershell
Connect-AzAccount -Tenant e5d2be43-2e2c-4968-b5f3-c73dd825ee80
Get-AzAccessToken -ResourceUrl https://org3a57b8d4.crm.dynamics.com
# WhoAmI 200 against https://org3a57b8d4.crm.dynamics.com/api/data/v9.2/WhoAmI()
powershell -File scripts/dataverse/export-runtime-schema-evidence.ps1
```

Recorded artifacts (`scripts/dataverse/evidence/runtime-schema-evidence.*.json`,
`tokenValidated: true`, `verifiedAtIso 2026-06-25T12:24:31`):

```text
CRM       : STATUS=PASS services=5/5  datasources=5/5  live=5/5  measured={tables:5, columns:40, rels:0}
Portfolio : STATUS=PASS services=13/13 datasources=13/13 live=13/13 measured={tables:13, columns:15, reqRels:0}
```

This is a genuine token-backed measurement — not a fabricated PASS. (In this assistant's
session the Az token still 401s; the operator authenticated the proper context in theirs.)

## The schema-completeness gap (investigation finding)

The measurement is real, but it does NOT hydrate, and the reason is a genuine gap between
the **deployed spine** and the **runtime bridge plan** — two different schema definitions:

| | Deployed live (measured) | Runtime bridge plan (EXPECTED) |
| --- | --- | --- |
| Source | `scripts/dataverse/schema/*.json` (create-spine scripts) | `src/crm/crmDataverseSchemaPlan.ts`, `src/portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan.ts` |
| CRM tables | **5** (`cr664_crm{organization,person,relationship,roleassignment,timelineevent}`) | **10** |
| CRM columns | **40** (8 per table) | **147** |
| CRM relationships | 0 | 28 |
| Portfolio tables | **13** ✓ | **13** ✓ |
| Portfolio columns | **~15** (4 + 1 per child) | **219** |
| Portfolio required relationships | **0** | **12** |

So the operator deployed a **minimal spine** (table existence + a few required columns),
not the full runtime schema the live CRM/portfolio persistence adapters require. The
`runtimeVerifiedSchemaBridge` correctly fails closed on this gap — it is NOT weakened. This
is **not** an export-script bug (it accurately measured the spine) and **not** a bridge bug
(it correctly requires the full plan). The live schema is genuinely incomplete.

## What changed

- Committed the real artifacts (`runtime-schema-evidence.*.json`; `pac-table-access.*.json`
  timestamps refreshed, still 5/5 & 13/13 reachable).
- Transcribed the real measurement into the bridge's `CURRENT_*_VERIFICATION_EVIDENCE`
  (status PASS, live 5/5 & 13/13, measured spine counts) — it still does NOT hydrate.
- Updated the artifact + bridge governance tests honestly: artifacts are real PASS
  measurements, hydration remains **false** with schema-gap blockers. Preserved the
  regression test (`live=0/0` fails closed) and the synthetic "authorized FULL measurement
  hydrates" test (proves the bridge hydrates only when the schema is complete).
- The bridge, feature flags, and gates were NOT changed; no hydration was forced.

## Gates / deployment

```text
CRM_LIVE_PERSISTENCE_ENABLED / PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED = false (unchanged)
PRODUCTION_ENVIRONMENT_CERTIFICATION = only newDealCreate true (unchanged)
```

`pac code push` was **not performed**.

## Remaining blockers

To hydrate CRM/portfolio runtime verified state, ONE of:
1. **Build the full schema** in Dataverse to match the runtime plan — create the remaining
   CRM tables/columns/relationships (10 tables / 147 columns / 28 relationships) and the
   full portfolio columns + 12 required child→root relationships (219 columns / 12 req
   relationships) — then re-run `export-runtime-schema-evidence.ps1` with a token. The
   bridge will then hydrate. OR
2. **Reconcile the plans** (design decision, not done here): if the live persistence
   adapters only actually use the deployed spine, align `crmDataverseSchemaPlan` /
   `portfolioLoanBoardingDataverseSchemaPlan` (and thus `EXPECTED_*_SCHEMA`) to the spine.
   This changes the runtime contract and must be an explicit, reviewed decision — it is NOT
   done here, to avoid weakening the bridge.

Until then, CRM/portfolio runtime verified state stays fail-closed (not hydrated), and the
live persistence gates remain off.

# Phase 253P — Full Portfolio Runtime Schema Buildout

## Outcome

**Phase 252 proved a real token-backed Dataverse measurement works, but portfolio runtime
hydration stayed blocked because the live portfolio is only the minimal boarding spine
(13 tables, ~15 columns, 0 required relationships). Phase 253P delivers an idempotent,
resume-safe, additive Dataverse buildout that raises the live environment to the FULL
portfolio runtime contract — 13 tables / 219 columns / 12 required child→root relationships
(+ 6 optional lookups) — exactly as required by
`src/portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan.ts`, `EXPECTED_BOARDING_SCHEMA`,
and the portfolio branch of `runtimeVerifiedSchemaBridge`.**

No gate was flipped. No `pac code push` was performed. The runtime bridge was NOT weakened
and the portfolio contract was NOT reconciled downward to the spine. Portfolio is NOT
claimed hydrated — hydration happens only after the operator applies the schema and exports
fresh runtime evidence. `enabledCount = 1 / 6`. `fullLaunchAchieved = false`.

## The live gap found by Phase 252

| | Deployed live (measured) | Runtime plan (EXPECTED) |
| --- | --- | --- |
| Portfolio tables | **13** ✓ | **13** ✓ |
| Portfolio columns | **~15** (4 + 1 per child) | **219** |
| Portfolio required relationships | **0** | **12** |
| Portfolio optional relationships | 0 | 6 |

The operator deployed a minimal spine (table existence + a few required columns). The full
runtime persistence adapter needs the complete 219-column / 12-relationship schema. The
bridge correctly fails closed on this gap. Phase 253P closes the gap by **building the full
schema** (Phase 252 "remaining blocker" option 1), never by reconciling the plan down.

## Portfolio schema delta generated

- **Tables:** 13 / 13 already present (preserved; never recreated). Additive run touches no
  existing table metadata.
- **Columns added:** up to **219 − (already-present)**. Per-table totals (full plan):
  loan 48, borrower 10, collateral 26, guarantor 16, covenant 16, tickler 13, insurance 14,
  document 21, exception 13, review 10, evidence 11, audit entry 11, examiner note 10 = **219**.
  Of these, 18 are lookup columns (materialized via relationship creation), 13 are primary
  `cr664_name` columns (created with the table); the remaining ~188 are scalar columns
  (String / Memo / Integer / Decimal / Money / Boolean / DateTime).
- **Relationships added:** **12 required** child→root lookups
  (`cr664_portfolioboardedloan_{borrower,collateral,guarantor,covenant,tickler,insurance,document,exception,review,evidence,auditentry,examinernote}`,
  cascade = Parental, lookup `cr664_PortfolioBoardedLoan`, ApplicationRequired) plus
  **6 optional** lookups (`_originatedloandeal → cr664_loandeal`, `_client → cr664_clientrelationship`,
  `_portfoliomanager → systemuser`, `_assignedservicingowner → systemuser`, `_team → cr664_team`,
  `cr664_portfolioboardedloandocument_evidence`).
- **Option-set / choice fields:** the plan's `Picklist` columns (loan status, boarding status,
  document type, collateral type, etc.) are materialized as **text columns** that store the
  option token — exactly as the deployed spine already models `cr664_loanstatus` /
  `cr664_boardingstatus` and as `portfolioLoanBoardingDataverseMapper.ts` writes them. No
  global option sets are created. A future migration to native Dataverse choice columns is a
  separate, governed decision.

The full contract is the GENERATED artifact
`scripts/dataverse/schema/portfolio-boarding.full.schema.json`, emitted from the TS plan via
`src/portfolioBoarding/portfolioFullSchemaArtifact.ts` (a drift test pins the JSON to the
plan, so it can never silently diverge). Regenerate with:

```bash
WRITE_FULL_SCHEMA=1 npx vitest run src/portfolioBoarding/portfolioFullSchemaArtifact.test.ts
```

## Operator commands — apply the full portfolio schema

Run from `code-app/` with a Dataverse-authorized context (the same identity Phase 252 used).

```powershell
# 0) Confirm the intended environment.
pac org who

# 1) Provide a Dataverse Web API token (operator's authorized context).
Connect-AzAccount -Tenant e5d2be43-2e2c-4968-b5f3-c73dd825ee80
$tok = (Get-AzAccessToken -ResourceUrl https://org3a57b8d4.crm.dynamics.com).Token
$env:DATAVERSE_ACCESS_TOKEN = $tok

# 2) DRY-RUN first (read-only; prints every WOULD CREATE). No mutation.
powershell -File scripts/dataverse/create-full-portfolio-runtime-schema.ps1

# 3) APPLY (gated; type APPLY to confirm). Additive, create-missing-only, resume-safe.
powershell -File scripts/dataverse/create-full-portfolio-runtime-schema.ps1 -Apply
#   …rerun the SAME command after any partial success — it only creates what is still missing.

# 4) Publish customizations so the new metadata is live.
powershell -File scripts/dataverse/publish-customizations.ps1 -Apply
```

The buildout script is **idempotent and resume-safe**: every table, column and relationship
is existence-checked before any POST; present items are skipped and never overwritten,
renamed, or deleted; there is no delete path. Safe to rerun any number of times.

## Operator commands — regenerate SDK / data sources (only if needed)

The 13 tables + their data sources are already registered (services 13/13, datasources
13/13). New columns/relationships on existing tables do **not** require new generated
services. Regenerate only if a downstream typed-SDK refresh is desired:

```powershell
powershell -File scripts/dataverse/regenerate-powerapps-sdk.ps1
# (No `pac code push` is performed by this phase.)
```

## Operator commands — export fresh runtime evidence (verification)

```powershell
# Token-backed, READ-ONLY. Measures 219/219 columns + 12/12 required relationships and
# writes scripts/dataverse/evidence/runtime-schema-evidence.portfolio.json in the bridge shape.
# Exits 0 ONLY when the full contract is satisfied; non-zero (fail-closed) otherwise.
powershell -File scripts/dataverse/verify-full-portfolio-runtime-schema.ps1

# PAC table-access verification stays intact and unchanged:
powershell -File scripts/dataverse/verify-pac-table-access.ps1
```

## Expected post-apply portfolio hydration result

After apply + publish + a fresh `verify-full-portfolio-runtime-schema.ps1` export, the
portfolio artifact reads:

```text
Portfolio : STATUS=PASS services=13/13 datasources=13/13 live=13/13 \
            measured={tables:13, columns:219, requiredRels:12, optionalRels:6, conflicts:0}
```

Transcribing that real measurement into the bridge's `CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE`
(an explicit, reviewed step — not done here) makes `hydrateVerifiedBoardingSchemaState`
return `hydrated: true`. The live persistence gate
(`PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED`) and route stay **off** until a separate
governed cutover — schema hydration is a prerequisite, not an activation.

## Gates / deployment

```text
PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED = false (unchanged)
PORTFOLIO_BOARDING_ROUTE_ENABLED            = false (unchanged)
PRODUCTION_ENVIRONMENT_CERTIFICATION        = only newDealCreate true (unchanged)
enabledCount = 1 / 6   fullLaunchAchieved = false
```

`pac code push` was **not performed**. No governed gate flag was flipped.

## What changed in the repo

- `scripts/dataverse/create-full-portfolio-runtime-schema.ps1` — additive, idempotent,
  resume-safe full-schema buildout (dry-run by default).
- `scripts/dataverse/verify-full-portfolio-runtime-schema.ps1` — read-only, token-backed
  full-contract verifier that fails closed and emits bridge-shaped evidence.
- `scripts/dataverse/schema/portfolio-boarding.full.schema.json` — generated full contract.
- `src/portfolioBoarding/portfolioFullSchemaArtifact.ts` (+ drift test) — single-source-of-
  truth builder pinning the JSON to the plan.
- `src/portfolioBoarding/portfolioFullRuntimeSchemaBuildout.test.ts` — contract + fail-closed
  proofs (spine does not hydrate; full build does; missing column/relationship fail closed;
  enabledCount 1/6; fullLaunchAchieved false; no gate flipped).

## Remaining blockers after portfolio buildout

1. **Operator apply** — run the buildout + publish + verify commands above in the authorized
   environment (the assistant session's Az token still 401s; the operator holds the proper
   context).
2. **Transcribe fresh evidence** into `CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE` (reviewed step).
3. **Governed cutover** (separate phase) — inject the hydrated `VerifiedBoardingSchemaState`,
   enable the route for an authorized operator/workspace, record a controlled single-record
   boarding + failure smoke, then flip `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED`.
4. **CRM spine** is still incomplete (5/10 tables, 40/147 columns) — out of scope here; owned
   by the Phase 253 CRM track.

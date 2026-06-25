# Phase 255A — Consume CRM + Portfolio PASS Evidence (and the portfolio-artifact clobber fix)

## Outcome

**CRM runtime verified state is consumed and HYDRATES (real, token-backed 10 tables /
147 columns). Portfolio could NOT be consumed as hydrated this phase: the committed
portfolio evidence on current master is the minimal SPINE measurement (15 columns / 0
required relationships), not the operator's full 219/12/6 measurement — because a second
script was overwriting it. This phase fixes that clobber so the operator's full measurement
sticks, then hands back a one-command re-run to produce the real 219 artifact. No live gate
changed. `enabledCount = 1 / 6`. `fullLaunchAchieved = false`. `pac code push` NOT performed.**

- **CRM runtime hydration status:** **Hydrated** (10 tables / 147 columns, token-backed PASS).
- **Portfolio runtime hydration status:** **NOT hydrated yet** — the committed artifact is the
  spine (15/0/0). It hydrates as soon as the real 219/12/6 artifact is regenerated (one command, below).

## Root cause — two writers, one file (the clobber)

Two scripts write the SAME artifact, `scripts/dataverse/evidence/runtime-schema-evidence.portfolio.json`:

| Script | Schema it measured | Result it writes |
| --- | --- | --- |
| `verify-full-portfolio-runtime-schema.ps1` (Phase 253P/254A) | `portfolio-boarding.full.schema.json` (FULL: 219 columns, 12 req + 6 opt rels, lookup-aware, mismatch-detecting) | `columns 219/219, requiredRels 12/12, optionalRels 6/6` |
| `export-runtime-schema-evidence.ps1` (generic) | `portfolio-boarding.schema.json` (SPINE: ~15 columns, 0 rels) | `columns 15, requiredRels 0` |

The operator's run order was: `verify-full` (wrote the real 219/12/6) → `export` (re-wrote the
SAME file with the spine 15/0/0). The export ran **last**, so the artifact on current master is
the spine. Proof: the committed artifact has keys `domain,status,services,dataSources,liveTables,
measured,verifiedAtIso,tokenValidated,notes` and **lacks** the `expectedCounts` /
`relationshipCoverage` fields that ONLY `verify-full` emits — i.e. it is the export (spine) output.

The full 219 measurement was real and token-backed, but it was never committed: it was
overwritten before commit.

## The fix (this phase)

`export-runtime-schema-evidence.ps1` is now **CRM-only**. It no longer writes
`runtime-schema-evidence.portfolio.json`. `verify-full-portfolio-runtime-schema.ps1` is the
**single writer** of the portfolio artifact — and it is the stronger one (full contract,
lookup-attribute-aware relationship coverage, mismatch fail-closed). This removes the
two-writers-one-file clobber permanently. CRM continues to be measured by `export` against the
full `crm-full.schema.json` (10/147), unchanged.

No bridge logic, feature flag, or gate was changed. The fail-closed regressions are preserved
(stale, token-failed, services/datasource/live gaps, missing columns, missing required
relationships, relationship mismatch all still block).

## What was committed

- `scripts/dataverse/export-runtime-schema-evidence.ps1` — CRM-only (clobber fix).
- `scripts/dataverse/evidence/runtime-schema-evidence.crm.json` — fresh token-backed CRM
  re-measurement (STATUS=PASS, services 10/10, datasources 10/10, live 10/10, measured
  10 tables / 147 columns, tokenOk). Unchanged values, current timestamp.
- This document.

`CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE` was **deliberately NOT changed** to 219/12/6: doing so
while the committed artifact still measures 15 would be transcribing attestation as a PASS the
artifact contradicts — a fabricated hydration. It is updated only after the real 219 artifact exists.

## Operator unblock — one read-only command (your authenticated session)

In your session where `WhoAmI` succeeds (the Web API token 401s in the assistant's session — the
assistant's token identity is not a provisioned application user), run the dedicated full verifier
**last**:

```powershell
Connect-AzAccount -Tenant e5d2be43-2e2c-4968-b5f3-c73dd825ee80   # if not already
powershell -File scripts/dataverse/verify-full-portfolio-runtime-schema.ps1
# Expect: STATUS=PASS ... columns=219/219 requiredRels=12/12 mismatch=0 unknown=0 tokenOk=True
```

Because `export` no longer writes the portfolio file, this measurement will NOT be clobbered.
Commit the regenerated `runtime-schema-evidence.portfolio.json` (or just leave it in the working
tree) and the assistant will then: update `CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE` to 219/12/6,
prove `hydrateVerifiedBoardingSchemaState(...).hydrated === true`, and update the launch/readiness
tests to mark the portfolio backend hydrated — with gates still OFF (no smoke artifacts yet).

## Gates / deployment

```text
CRM_LIVE_PERSISTENCE_ENABLED / PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED = false (unchanged)
DOCUMENT_CHECKLIST_GENERATION_ENABLED / BORROWER_MESSAGING_ENABLED / AUTO_STAGE_ADVANCE_ENABLED = false (unchanged)
PRODUCTION_ENVIRONMENT_CERTIFICATION = only newDealCreate true (unchanged)
enabledCount = 1 / 6 ; fullLaunchAchieved = false
```

`pac code push` was **not performed** (correctly — backend hydration is a prerequisite, not a
launch; and live gates require recorded smoke evidence that does not yet exist).

## Remaining launch gates

Backend verification (CRM hydrated; portfolio hydrates after the one command above) is a
prerequisite. Each live gate still additionally requires a recorded controlled smoke
(authorized operator + injected transport + create/readback/update + rollback/cleanup), which
does not yet exist for any of: CRM live persistence, portfolio boarding, document checklist,
borrower send, stage advancement. No gate is flipped without that smoke evidence.

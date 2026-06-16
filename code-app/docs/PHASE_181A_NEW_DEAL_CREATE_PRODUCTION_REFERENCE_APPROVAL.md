# Phase 181A — New Deal create production Stage/Status reference approval

## Goal

Identify and approve production-safe Stage and Status reference rows for a newly
created deal, or prepare a guarded seed path if they do not exist.

## Required production meaning

- Stage = a newly opened / intake / new deal (active, production-safe).
- Status = an active / open / in-progress deal (active, production-safe).
- Both must be production-safe — NOT TEST / PHASE121 / demo / sample / temporary.
- Both must have stable code/name values the resolver can use; GUIDs may be read
  for verification but are NOT committed as hardcoded source constants.

## Inspection result

The current environment has only the TEST rows active (confirmed in prior
read-only inspections, Phase 170D):

- Stage: code `PHASE121_STAGE`, name `TEST - Stage Phase 121` — **REJECTED**
  (TEST/PHASE label; not production-safe).
- Status: code `PHASE121_STATUS`, name `TEST — Status Phase 121` — **REJECTED**.

**No production-safe Stage/Status reference rows exist or are approved.**
(Live re-inspection could not be run from this code change — it requires an
authenticated operator session; the read-only classification mode below is the
exact tool to run.)

## Read-only inspection tool (added this phase)

`scripts/phase122-lookup-repair.mjs --inspect-new-deal-create-references`

Reads `cr664_dealstagereferences` / `cr664_dealstatusreferences` and classifies
each row **PRODUCTION-SAFE** vs **REJECTED (TEST/PHASE/demo)** using the same
guard as the in-app resolver
([isProductionUnsafeReferenceLabel](../src/deals/newDealReferenceTargets.ts)).
Pure GET; never writes; enables no gate.

## Selected approved production references (pending seed)

Until the environment has production rows, the approved production **selection**
the in-app resolver targets is (code/name only, no GUID):

- Stage: code `INTAKE`, name `Intake`.
- Status: code `OPEN`, name `Open`.

Adjust to the environment's actual production naming if it already has
equivalents — but never point at a TEST/PHASE row.

## Seed runbook (operator action required, with Matt approval)

A guarded seed is intentionally **not auto-run** here (it mutates production
reference data). The exact operator procedure to unblock:

1. Run the read-only classification: `--inspect-new-deal-create-references`.
2. If no production-safe active Stage/Status pair exists, create exactly one
   active row in each reference table (with Matt's approval), e.g. via the maker
   portal or an authorized Web API POST:
   - `cr664_dealstagereferences`: `{ cr664_name: "Intake", cr664_code: "INTAKE", cr664_activeflag: true }`
   - `cr664_dealstatusreferences`: `{ cr664_name: "Open", cr664_code: "OPEN", cr664_activeflag: true }`
   - Allow-listed fields only (`cr664_name`, `cr664_code`, `cr664_activeflag`);
     do not mutate existing TEST/PHASE rows; do not patch any Loan Deal.
3. Re-run `--inspect-new-deal-create-references` to confirm exactly one
   production-safe active Stage and Status.
4. Confirm the codes/names match the in-app production selection (INTAKE / OPEN).

## Why TEST/PHASE121 rows are rejected

They are TEST-environment fixtures (note the "Phase 121" labels), not
production-approved labels. The resolver guard
`isProductionUnsafeReferenceLabel` filters any TEST/PHASE/demo/sample/temp row so
it can never back a production create, even if it matched a production code.

## Confirmations

- **No hardcoded Stage/Status GUIDs** were added (pinned by tests).
- **Create gates remain DISABLED** after this phase
  (`BANKER_NEW_DEAL_CREATE_ENABLED` / `NEW_DEAL_CREATE_ADAPTER_ENABLED` /
  `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED` all `false`).
- No Loan Deal create/patch and no reference seed was run in this phase.

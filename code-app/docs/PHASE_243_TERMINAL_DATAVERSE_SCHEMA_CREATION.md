# Phase 243 — Terminal Dataverse Schema Creation for Full CRM + Loan Workflow + Portfolio Activation

## Purpose

Provide a safe, idempotent, auditable terminal path to create/verify/register the
missing **internal OGB CRM** spine and **portfolio boarding** Dataverse tables so
the Phase 242B verifiers can move from BLOCKED to PASS. Schema definitions are
derived strictly from the in-repo plans (`crmDataverseSchemaPlan.ts`,
`portfolioLoanBoardingDataverseSchemaPlan.ts`) — nothing is invented.

**Loan workflow:** stage-advancement sinks already PASS and no workflow
persistence/schema modules exist in the repo, so **no loan-workflow tables are
created** this phase (the "only if needed" rule). If a future phase proves they
are required, use internal names only (`cr664_loanworkflowinstances`, etc.) — never
vendor branding.

## No-vendor-table naming rule

All tables use the internal `cr664_` publisher prefix. **No nCino or Salesforce
branded tables are created.** "nCino" here means our internal loan workflow layer;
the CRM is the internal OGB CRM. The governance test
(`phase243TerminalDataverseSchemaContract.test.ts`) fails the build if any schema
table name contains `ncino`/`salesforce`.

## Files

- `scripts/dataverse/schema/crm-spine.schema.json` — 5 CRM spine tables.
- `scripts/dataverse/schema/portfolio-boarding.schema.json` — boarded-loan root + 12 child tables.
- `scripts/dataverse/_common.ps1` — shared safe helpers (create-missing-only).
- `scripts/dataverse/create-crm-spine.ps1`, `create-portfolio-boarding.ps1`
- `scripts/dataverse/publish-customizations.ps1`
- `scripts/dataverse/regenerate-powerapps-sdk.ps1`
- `scripts/dataverse/verify-full-schema.ps1`
- `scripts/dataverse/run-full-activation-verification.ps1`

## Exact commands (from `code-app/`)

Every script is **dry-run by default**. Mutation requires `-Apply`; `-Force`
skips the interactive `APPLY` confirmation. Each create/publish script first runs
`pac org who` and prints the org URL + identity before any mutation.

**Dry-run (read-only — review the plan):**
```powershell
powershell -File scripts/dataverse/create-crm-spine.ps1
powershell -File scripts/dataverse/create-portfolio-boarding.ps1
powershell -File scripts/dataverse/regenerate-powerapps-sdk.ps1
powershell -File scripts/dataverse/verify-full-schema.ps1
powershell -File scripts/dataverse/run-full-activation-verification.ps1
```

**Apply (live, gated — operator only, against the confirmed environment):**
```powershell
pac auth create        # authenticate to the INTENDED environment
pac org select          # confirm the target org
powershell -File scripts/dataverse/create-crm-spine.ps1 -Apply
powershell -File scripts/dataverse/create-portfolio-boarding.ps1 -Apply
powershell -File scripts/dataverse/publish-customizations.ps1 -Apply
```

**SDK regeneration command (after publish):**
```powershell
powershell -File scripts/dataverse/regenerate-powerapps-sdk.ps1 -Apply
npm run build
```

**Verification command (after regen — must reach PASS before any gate flip):**
```powershell
powershell -File scripts/dataverse/run-full-activation-verification.ps1
```

## Behavior + safety

- Create-missing-only: each table/column/relationship is checked for existence
  first and skipped if present. **Nothing is overwritten, renamed, or deleted —
  there is no delete path.**
- Confirms environment via `pac org who`; requires `-Apply` to mutate and an
  interactive `APPLY` confirmation unless `-Force`.
- No feature-flag flip, no email send, no `pac code push` (no solution deploy),
  no route/permission change.
- `-Apply` requires a connected `pac` org + a Dataverse token (env
  `DATAVERSE_ACCESS_TOKEN` or `az account get-access-token`); without it the
  scripts abort with `BLOCKED` and perform no mutation.

## Evidence format

Each script prints an `EVIDENCE: [243][<domain>] ...` line; the verifier prints
`EVIDENCE: [243][verify-<domain>] STATUS=<PASS|BLOCKED|UNKNOWN> ...`.
`run-full-activation-verification.ps1` aggregates these with the repo commit and
the Phase 242B verifier evidence into one copy/paste block, plus `ALL-PASS:` and
`fullLaunchAchieved: false`.

## Rollback plan

The scripts are non-destructive (create-missing-only); there is nothing automatic
to roll back. To reverse created schema, an operator manually deletes the
newly-created `cr664_crm*` / `cr664_portfolioboardedloan*` tables in the maker
portal (a destructive, manually-confirmed action **outside** this pack) or removes
them from the solution. Records created after table creation are handled
separately. No script in this pack deletes Dataverse metadata.

## Warning — full launch remains gated

`fullLaunchAchieved` stays **false** until `run-full-activation-verification.ps1`
reports `ALL-PASS: True` AND the operator performs the separate, governed gate
cutover (owned by the Phase 241 production-cutover runbook). **This phase creates
no live mutation by itself and flips no live gate.** Building/merging this PR adds
the scripts; it does not activate anything.

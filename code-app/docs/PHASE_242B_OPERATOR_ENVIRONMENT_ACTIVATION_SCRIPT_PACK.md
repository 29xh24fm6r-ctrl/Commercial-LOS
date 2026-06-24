# Phase 242B — Operator Environment Activation Script Pack

**Status:** Complete. A read-only operator script/runbook pack that verifies the
environment prerequisites for the remaining blocked live domains and collects
copy/paste evidence for a later, separately-governed gate-flip.

**Branch:** `phase242b-operator-env-activation-pack` (sidecar clone only).

## Purpose

Phases that activate live capabilities (CRM persistence, checklist generation,
borrower communications, stage advancement, portfolio boarding) are gated on real
environment work — Dataverse schema, data-source registration, SDK regeneration,
connector authorization — that this assistant cannot perform. This pack gives the
operator deterministic, read-only checks that report PASS / BLOCKED / UNKNOWN per
domain, the exact next portal/PAC action, and an evidence block to justify the
gate-flip. **This phase does not flip any live gate.**

## Exact scripts (`scripts/activation/`)

| Script | Verifies |
|---|---|
| `verify-crm-schema.ps1` | `cr664_crm*` spine generated services + data-source registration |
| `verify-checklist-rules.ps1` | checklist generator modules + `cr664_documentchecklists` data source (signoff is manual) |
| `verify-outlook-connector.ps1` | `Office365OutlookService` + connector registration (no send) |
| `verify-stage-advancement-sinks.ps1` | stage-reference + audit + timeline sink services/data sources |
| `verify-portfolio-boarding-schema.ps1` | portfolio boarded-loan service + data source |
| `collect-activation-evidence.ps1` | runs all five, prints one copy/paste evidence block + repo commit |
| `README.md` | step-by-step operator guide for all domains |

## How to run

From `code-app/`:
`powershell -File scripts/activation/collect-activation-evidence.ps1`
(or run individual `verify-*.ps1`). See `scripts/activation/README.md`.

## Evidence each script collects

Each verifier prints an `EVIDENCE: [242B][<domain>] STATUS=<PASS|BLOCKED|UNKNOWN> …`
line with the present/missing artifact counts and a timestamp.
`collect-activation-evidence.ps1` aggregates those with the current repo commit
and branch into one block for the final gate-flip change.

## What remains manual (operator/environment only)

- Creating Dataverse tables/columns/relationships in the portal.
- `pac code add-data-source` registration and SDK regeneration.
- Authorizing the Office 365 Outlook connector.
- The checklist rule-set **signoff** approval.
- Portfolio child-group schema portal review.
- The single-record live smokes and the final, separately-governed gate-flip +
  deploy (`pac code push`) — owned by `docs/PHASE_241_*`.

## Rollback / no-write posture

There is nothing to roll back: every script is read-only and writes no repository
file, no Dataverse record, and no flag. Re-running them is always safe and
idempotent. Deleting `scripts/activation/` removes the pack with zero side
effects.

## Relationship to Phase 242A

Phase 242A runs separately in the original working tree and may modify New Deal
create gates. This phase is confined to `scripts/activation/`, this doc, and a
read-only governance test under `src/shared/governance/`. It edits **no** New
Deal create flag/test and **no** protected 242A file
(`productionEnvironmentVerification.ts`, `fullActivationLaunchCertificationModel.ts`,
`FullSystemActivationLaunchPanel.tsx`, `newDealCreateActivation.ts`,
`newDealCreateFeatureFlags.ts`, `dealOriginationFeatureFlags.ts`).

## Explicit statement

**This phase does not flip live gates.** It is read-only verification and
evidence collection only. The gate-flip is a separate, governed operator action
performed elsewhere after the evidence justifies it.

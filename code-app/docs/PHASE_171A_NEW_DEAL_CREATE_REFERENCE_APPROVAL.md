# Phase 171A — New Deal create Stage/Status reference approval

## Goal

Identify and approve the production-safe Stage and Status reference rows that
represent a newly created deal, so the governed create resolver can resolve
them by stable code/name (never GUID) and fail closed otherwise.

## Inspected state

The only ACTIVE Stage/Status reference rows confirmed in the current
environment are TEST-environment labels (from the read-only
`--inspect-stage-status-values` inspection, Phase 170D):

- Stage: code `PHASE121_STAGE`, name `TEST - Stage Phase 121` (active).
- Status: code `PHASE121_STATUS`, name `TEST — Status Phase 121` (active).

These are **TEST** rows (note the "Phase 121" labels). They are explicitly
**rejected for production create**.

## Decision

- **No production Stage/Status reference rows are approved in this phase.** A
  production "New / Intake / Open" stage and a production "Active / Open" status
  must be seeded/approved by an authorized operator in the target environment
  before any banker LIVE create. That requires a live operator action plus
  Matt's explicit sign-off and is out of scope for a code change (no schema /
  record creation is performed here).
- Until production references exist and are approved, the fail-closed resolver
  continues to resolve only by approved code/name and **fails closed** on
  zero / duplicate / inactive rows, and the production enablement reader rejects
  TEST references for production (`referencesProductionApproved = false`).
- **No GUIDs** for these rows are hardcoded anywhere in the New Deal create
  source (pinned by governance tests).

## Resolver behavior (unchanged, fail-closed)

`resolveNewDealReferences` selects exactly one ACTIVE row by stable code/name
and returns `missingStage` / `missingStatus` / `duplicateStage` /
`duplicateStatus` / `inactiveStage` / `inactiveStatus` / `serviceError` /
`notConfigured` otherwise. The production enablement path additionally refuses
TEST-only references for a production environment.

## Consequence for banker create

Banker LIVE create cannot be certified production-ready in this arc because
production-approved references do not yet exist. The controlled create path is
built and fail-closed; it stays DISABLED pending production reference approval
+ explicit go-live approval (see the Phase 180A certification).

## No Dataverse writes

This phase made no Dataverse create / patch / delete and no schema change.

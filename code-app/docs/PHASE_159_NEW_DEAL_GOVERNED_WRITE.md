# Phase 159 -- New Deal Governed Write Audit and Stabilization

## Finding

The + New Deal button CANNOT be enabled in Phase 159. The cr664_loandeal schema requires cr664_StageReference and cr664_StatusReference lookup values on create, but no generated stage/status reference data source or canonical default resolver exists in the app. This is the same Phase 28 schema gap documented in DELIBERATELY_BLOCKED and now explicitly tracked in NOT_WIRED.

## What Was Done

1. Confirmed + New Deal is honestly blocked with specific tooltip explaining the schema gap.
2. new-deal-create added to NOT_WIRED in platformInventory with blockerKind schema.
3. Fixed LogActivityModal palette error (warningFg replaced with atRiskFg).
4. deal-log-activity added to timeline payload discipline governance map.
5. GOVERNED_WRITES count is 13 (12 original + deal-log-activity from Phase 160).
6. NOT_WIRED count is 9 (8 original + new-deal-create).
7. Updated governance count pins across all test files.

## New Deal Unblock Path

To enable + New Deal, the following must happen:
1. Register cr664_stagereferences as a Power Apps data source.
2. Add a generated Cr664_stagereferencesService to src/generated/services/.
3. Resolve a canonical default stage and status for new deals.
4. Wire the create with the resolved references.

## Phase 163 Update (2026-06-12)

Phase 163 re-investigated this blocker and confirmed Case C: no typed
stage/status reference service, no schema file, no data-source
registration, and no governed generic read path exist, and the lookup
target table name is not even verifiable from the repo. + New Deal stays
disabled. The exact data-source registration task is documented in
docs/PHASE_163_STAGE_STATUS_REFERENCE_UNBLOCK.md. No behavior changed.

## Log Activity (Phase 160)

Log Activity was wired as Phase 160 with:
- logActivityActions.ts -- governed write with audit + timeline
- LogActivityModal.tsx -- deal picker + note input
- GOVERNED_WRITES entry: deal-log-activity (phase 160)
- Log Activity button is enabled for governed-write-entitled bankers.

## Safety Posture

- No external HTTP calls.
- No CRM/Copilot/Graph calls.
- No fake data.
- No schema migration.
- No permission widening.
- Route delta: 0.

## Acceptance

```
npm test -- NewDeal LogActivity BankerWorkspace Activity CrmBankerWorkingSurface
npm test -- timelinePayloadDiscipline logActivityActions BankerShell phase125F platformInventory outcomeUnionDiscipline auditPayloadDiscipline correlationIdDiscipline releaseCandidateSnapshot phase129A ReleaseReadinessGate communicationLaneReleaseLock
npm test
npm run build
npx eslint src/deals/logActivityActions.ts src/deals/logActivityActions.test.ts src/deals/LogActivityModal.tsx src/banker/GreetingHeader.tsx src/shared/governance/platformInventory.ts
```

Results: all listed commands passed. Repo-wide `npm run lint` remains red due
pre-existing lint debt outside this phase delta. No commit was created because
the New Deal P1 blocker remains unresolved.

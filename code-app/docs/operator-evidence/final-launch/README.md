# Final-launch smoke evidence

This directory holds the controlled-smoke evidence artifacts that gate the final live
activation. **One JSON file per capability**, produced by the operator-run harness
`scripts/dataverse/run-final-launch-smokes.ps1`. It is empty until the operator runs the
smokes — **the agent never fabricates these files**.

A gate is flipped (in a later, separate governed phase) **only** when its artifact here
validates against `src/access/finalLaunchSmokeEvidence.ts` with `outcome: "passed"` and the
required verifications. No artifact, a `failed` artifact, or missing readback/closure
verification = that capability stays **blocked**.

## Capabilities (file name = `<capability>.json`)

| capability | how produced | closure verification |
| --- | --- | --- |
| `crmLivePersistence` | `run-final-launch-smokes.ps1 -Apply -Capability crmLivePersistence` (automated CRUD on a launch-test record) | `rollbackVerified` (cleanup) |
| `portfolioBoarding` | `run-final-launch-smokes.ps1 -Apply -Capability portfolioBoarding` (automated CRUD on a launch-test record) | `rollbackVerified` (cleanup) |
| `documentChecklist` | controlled in-app smoke via the checklist write dependency, then `-RecordManualEvidence` | `rollbackVerified` (cleanup) |
| `borrowerSend` | `VITE_EMAIL_MODE=LIVE`, audited send to an **approved test recipient only**, then `-RecordManualEvidence` | `deliveryVerified` / `auditVerified` (no rollback for email) |
| `stageAdvancement` | controlled in-app transition on a launch-test record (audit + timeline sinks), then `-RecordManualEvidence` | `rollbackVerified` + `auditVerified` |

## Required fields (see the TS parser for the authoritative schema)

`capability`, `outcome` (`passed`|`failed`), `operatorUpn`, `environmentUrl`,
`environmentId`, `correlationId`, `startedAtIso`, `completedAtIso`,
`liveOperationPerformed` (true), `readbackVerified` (true), `rollbackVerified`
(true except `borrowerSend`), `deliveryVerified`/`auditVerified` (borrowerSend),
`evidenceNote`, and optionally `affectedRecordIds` / `cleanupRecordIds`.

The parser fails closed on any missing/invalid field.

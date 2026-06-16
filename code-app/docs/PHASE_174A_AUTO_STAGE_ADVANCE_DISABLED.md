# Phase 174A — Auto-stage advancement adapter (DISABLED by default)

- **Status: DISABLED.** `AUTO_STAGE_ADVANCE_ENABLED = false`.
- File: [src/deals/autoStageAdvanceAdapter.ts](../src/deals/autoStageAdvanceAdapter.ts).
- Controlled advance from the approved create stage to an approved next stage,
  only when enabled and every readiness/policy/stage-match check passes. Does
  NOT reuse the separate Advance Stage progression feature.
- Outcomes: `disabled`, `skipped_not_ready`, `skipped_policy_blocked`,
  `skipped_stage_mismatch`, `unauthorized`, `resolver_not_ready`, `success`,
  `failed`, `audit_failed_partial`.
- Source/target stages resolve by approved code/name; no hardcoded Stage GUIDs.
  Refuses if the current stage is not the approved source (skipped_stage_mismatch),
  if readiness is unmet, or if the actor is unauthorized. No bypass headers.

# Phase 175A — New deal task generation adapter (DISABLED by default)

- **Status: DISABLED.** `TASK_GENERATION_ENABLED = false`.
- File: [src/deals/newDealTaskGenerationAdapter.ts](../src/deals/newDealTaskGenerationAdapter.ts).
- Generates approved default tasks for a new deal only when enabled; no task
  service is imported (IO injected). Deterministic approved template only;
  idempotent (no duplicate tasks); tasks bind to the created deal; assigned to
  the actor. No hardcoded user GUIDs.
- Outcomes: `disabled`, `skipped_no_template`, `skipped_duplicate_detected`,
  `unauthorized`, `dependency_not_ready`, `success`, `failed`,
  `partial_success`, `audit_failed_partial`.
- Payload restricted to `TASK_GENERATION_ALLOWED_FIELDS`. Partial task creation
  is surfaced honestly. No tasks before deal create success.

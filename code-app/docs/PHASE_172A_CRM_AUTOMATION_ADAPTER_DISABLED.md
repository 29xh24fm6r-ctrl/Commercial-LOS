# Phase 172A — CRM automation adapter (DISABLED by default)

- **Status: DISABLED.** `CRM_AUTOMATION_ENABLED = false`.
- File: [src/deals/dealCrmAutomationAdapter.ts](../src/deals/dealCrmAutomationAdapter.ts).
- After a deal is created, this can link CRM-side artifacts via an APPROVED
  relationship/lookup only. No CRM service is imported (IO injected) and nothing
  runs while disabled. No schema change, no fake CRM activity, no external HTTP.
- Outcomes: `disabled`, `skipped_not_applicable`, `unauthorized`,
  `dependency_not_ready`, `validation_error`, `success`, `failed`,
  `audit_failed_partial`.
- Payload restricted to `CRM_AUTOMATION_ALLOWED_FIELDS` (an approved
  `cr664_Deal@odata.bind` + correlation id only). No CRM write before deal
  create success; none while disabled. Correlation id required.

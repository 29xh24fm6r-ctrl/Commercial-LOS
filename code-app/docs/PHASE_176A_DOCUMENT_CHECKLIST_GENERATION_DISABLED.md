# Phase 176A — Document checklist generation adapter (DISABLED by default)

- **Status: DISABLED.** `DOCUMENT_CHECKLIST_GENERATION_ENABLED = false`.
- File: [src/deals/newDealChecklistGenerationAdapter.ts](../src/deals/newDealChecklistGenerationAdapter.ts).
- Generates expected document-checklist rows from an APPROVED template only when
  enabled; no document service imported (IO injected). Idempotent (no duplicate
  rows); rows bind to the created deal. **No borrower document request is sent**
  here — checklist generation is distinct from borrower request.
- Outcomes: `disabled`, `skipped_no_template`, `skipped_duplicate_detected`,
  `unauthorized`, `dependency_not_ready`, `success`, `partial_success`,
  `failed`, `audit_failed_partial`.
- Payload restricted to `DOCUMENT_CHECKLIST_ALLOWED_FIELDS`. No checklist before
  deal create success; partial generation surfaced.

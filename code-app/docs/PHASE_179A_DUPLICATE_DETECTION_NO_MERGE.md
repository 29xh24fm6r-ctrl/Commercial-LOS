# Phase 179A — Duplicate detection foundation (DETECT_AND_PREPARE_ONLY)

- **Status: DETECT_AND_PREPARE_ONLY.** `DUPLICATE_DETECTION_ENABLED = false`
  (default warn-only when enabled); `DUPLICATE_MERGE_APPLY_ENABLED = false`.
- File: [src/deals/newDealDuplicateDetection.ts](../src/deals/newDealDuplicateDetection.ts).
- Detection is allowed (warn). Merge execution is NOT: merge is disabled by
  default and, even when "prepared", produces a non-destructive REVIEW object
  only — never a delete, patch, overwrite, or "merged" status. Pure module, no
  IO.
- Detection signals: exact Deal Name match, normalized borrower/client name
  match, same banker + same amount + close created-date window, same borrower
  contact, same external CRM id.
- Outcomes: `not_checked`, `no_duplicate_found`, `possible_duplicate_found`,
  `exact_duplicate_found`, `merge_prepared_not_applied`, `merge_blocked_by_policy`,
  `merge_disabled`, `failed`.
- Detection may run before create as a warning; it never blocks create unless
  policy explicitly says an exact duplicate blocks. Default is warn-only. No
  destructive write, no delete, no overwrite, no fake "merged" status.

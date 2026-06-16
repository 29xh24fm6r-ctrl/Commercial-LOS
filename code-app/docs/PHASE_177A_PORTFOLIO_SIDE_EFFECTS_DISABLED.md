# Phase 177A — Portfolio side-effects adapter (DISABLED / SKIPPED_NOT_NEEDED)

- **Status: DISABLED (default) / SKIPPED_NOT_NEEDED.**
  `PORTFOLIO_SIDE_EFFECTS_ENABLED = false`.
- File: [src/deals/newDealPortfolioSideEffectsAdapter.ts](../src/deals/newDealPortfolioSideEffectsAdapter.ts).
- Portfolio dashboards derive from the Loan Deal via existing loaders, so the
  recommended outcome is `skipped_not_needed` (no write). An explicit portfolio
  write happens only with an approved mapping AND the gate enabled. No portfolio
  service imported (IO injected); no fabricated portfolio metrics.
- Outcomes: `disabled`, `skipped_not_needed`, `skipped_no_portfolio_mapping`,
  `unauthorized`, `dependency_not_ready`, `success`, `failed`,
  `audit_failed_partial`.
- Payload restricted to `PORTFOLIO_SIDE_EFFECTS_ALLOWED_FIELDS`. No write before
  deal create success.

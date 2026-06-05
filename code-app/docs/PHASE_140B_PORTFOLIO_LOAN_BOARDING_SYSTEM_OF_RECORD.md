# Phase 140B — Portfolio Loan Boarding System of Record

> **What this is.** A pure, shared **system of record** for manually boarding
> a fully closed / existing portfolio loan into the LOS so the platform can
> support FDIC exams, board review, portfolio management, manager oversight,
> and long-term credit administration. **Foundation-first:** domain model +
> catalogs + pure derivers + tests only. No React UI, no Dataverse writes, no
> new route, no fake data.

## Purpose

A closed loan that already booked is not an origination deal. To support an
FDIC exam, a board package, or ongoing portfolio administration, the platform
needs a canonical structure for the loan's identity, economics, approval,
collateral, guarantors, covenants, documents, servicing, exceptions, and audit
trail — plus a fail-closed way to measure whether that record is complete
enough for each use case.

Phase 140B defines that structure before any UI or persistence is built, so
the write surface and the Dataverse schema in a later phase have an exact,
test-pinned target to implement against.

## Why this is needed before bankers auto-fill portfolio from closed deals

Auto-promoting a closed origination deal into the portfolio is attractive, but
without a canonical closed-loan system of record it would copy whatever the
deal happened to carry — and silently inherit its gaps. Defining the boarding
package, the required-field catalog, and the required-document catalog first
means:

- the auto-fill path has a precise schema to map into;
- completeness and readiness are measured the same way no matter how a loan
  was boarded (manually or promoted);
- FDIC / board / monitoring readiness is computed by one fail-closed deriver,
  not re-implemented per surface.

So the manual boarding path is built first, deliberately.

## Manual boarding path

An operator (portfolio manager / credit admin) manually enters a
`PortfolioLoanBoardingPackage`:

1. Start from `createEmptyPortfolioLoanBoardingPackage()` — a structurally
   complete but **data-empty** shell (no fabricated values).
2. Populate identity, borrower, economics, closing, credit approval,
   collateral, guarantors, covenants, ticklers, insurance, documents,
   servicing, risk ratings, exceptions, review history, and audit fields.
3. Run `derivePortfolioLoanBoardingCompleteness(...)` to see what is missing,
   stale, or blocking readiness.
4. Run `derivePortfolioLoanBoardingSnapshot(...)` for a compact summary.

There is no write surface yet — Phase 140B produces the model the next phase
will wire to a UI and Dataverse.

## FDIC / board / manager / portfolio manager use cases

- **FDIC exam:** every FDIC-required field and document is represented in the
  catalogs; `fdicReady` is true only when all are present and non-stale.
- **Board review:** board-facing fields plus the approval memo / credit memo /
  board-approval documents drive `boardReady`.
- **Portfolio manager / manager oversight:** servicing, risk-rating, review,
  covenant, and exception fields plus the annual review drive
  `portfolioMonitoringReady`.

## Field architecture

`portfolioLoanBoardingCatalog.ts` defines a flat catalog of scalar fields.
Each field has a dotted `key` path into the package, a `section`, a
`dataType`, a `description`, and four required flags
(`requiredForBoarding`, `requiredForFDICReview`, `requiredForBoardReporting`,
`requiredForPortfolioMonitoring`). The completeness deriver reads presence by
path, so adding a field is data-only.

## Document architecture

`portfolioLoanDocumentCatalog.ts` defines the canonical document requirements.
Each document declares a `requiredWhen` condition (`always`, `when_guarantors`,
`when_real_estate_collateral`, `when_collateral_requires_insurance`,
`when_borrowing_base`, `when_sba`, `when_active_monitored`,
`when_board_approval_required`, `optional`) that the deriver evaluates against
the package context, plus per-review-process flags and an optional
`staleAfterDays`. Examples:

- `note` required for all loans;
- `guaranty` required when guarantors exist;
- `appraisal`, `title_policy`, `flood_determination`,
  `mortgage_deed_of_trust` required when real estate collateral exists;
- `insurance_evidence` required when collateral requires insurance (stale
  after 365 days);
- `borrowing_base_certificate` required for borrowing-base loans;
- `sba_authorization` / `sba_guarantee` required for SBA loans;
- `annual_review` required for actively monitored loans.

## Readiness architecture

`derivePortfolioLoanBoardingCompleteness(...)` is a **pure, fail-closed**
function. It returns field counts, document counts, stale documents, exception
counts, the three readiness booleans, and human-readable blockers.

Rules:

- **No fake fallbacks** — missing means missing, stale means stale.
- **Fail-closed** — any missing required field, missing required document, or
  stale required document makes the relevant readiness false.
- `fdicReady` requires FDIC fields + FDIC documents.
- `boardReady` requires board fields + board documents (+ board approval date
  when board approval is required).
- `portfolioMonitoringReady` (portfolio monitoring readiness) requires
  servicing / risk / review / covenant / exception fields (+ a current annual
  review when the loan is active).

`portfolioLoanBoardingSnapshot.ts` layers a compact summary view model on top
of the same deriver and **never invents values** — missing scalars stay
`undefined` and percentages are honest ratios.

## What is intentionally not built yet

- **No live Dataverse writes** and no schema.
- **No React UI** and **no new app route**.
- **No fake portfolio data** and **no borrower sample data** in the shared
  module (synthetic placeholders live only in test fixtures).
- **No permission widening** — this is a shared model with no entitlement
  surface; the future UI must mount inside the existing
  permission-before-render chain.
- **No Copilot live connector changes**, no autonomous actions, no external
  API calls.

## Next recommended phase

**Phase 140C — Portfolio Loan Boarding intake UI + governed persistence
design.** Add a read-then-write boarding surface (mounted inside the existing
portfolio/credit-admin permission chain) backed by the 140B model, plus the
Dataverse entity design for the boarding package — boarding the first real
closed loan only after the persistence path is governed and audited.

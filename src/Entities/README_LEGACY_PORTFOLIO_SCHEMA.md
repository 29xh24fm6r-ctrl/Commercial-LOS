# Legacy portfolio/covenant/stress-test schema — superseded, not live

This note exists to resolve a specific source of audit confusion: this
solution export contains **two, non-overlapping** table families that both
look like "the portfolio schema." Only one of them is real.

## The tables below are dead

The following entities in this `Entities/` folder are an earlier data-model
iteration for portfolio management. They were never adopted by the Code App
(`code-app/src/`) — zero references outside this solution export — and are
superseded by the `cr664_portfolioboardedloan*` table family (13 tables,
schema-planned in
`code-app/src/portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan.ts`,
consumed via `code-app/src/generated/services/Cr664_portfolioboardedloan*Service.ts`).

- `cr664_Portfolio`
- `cr664_PortfolioLoan`
- `cr664_PortfolioException`
- `cr664_PortfolioReview`
- `cr664_PortfolioLoanContactLink`
- `cr664_LoanCovenant`
- `cr664_CovenantTracking`
- `cr664_CovenantTracking1`
- `cr664_CovenantBreachIncident`
- `cr664_StressTestScenario`
- `cr664_StressTestResult`
- `cr664_LoanPerformanceReview`

**Do not build against these.** If a phase needs covenant tracking, risk
rating, or stress testing, the live schema is
`cr664_portfolioboardedloan*` and its child tables (`...covenant`,
`...review`, `...exception`, `...tickler`, etc.) — see
`code-app/src/portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan.ts`
for the authoritative column-level plan.

## `cr664_LoanProfitability` is NOT on this list

It is referenced by name (comments only, no live import) in
`code-app/src/portfolio/profitability/loanProfitability.ts` and
`profitabilityLinkSchemaPlan.ts` as the *planned* future link target for the
live profitability engine. It is not yet wired, but it has an active forward
plan naming it — treat it as pending, not dead.

## Why these tables were not deleted from the solution export

Removing a component from a **managed** solution's next version and applying
that upgrade can delete the corresponding table (and any data in it) from the
target Dataverse environment. Since no one exporting/importing this solution
today has confirmed whether these dead tables are truly empty and unused in
every environment this solution has ever been deployed to, deleting them here
is a live-environment risk decision for an authorized operator to make
deliberately (via `pac solution` tooling, after confirming no data exists) —
not something to do silently as part of an app-code cleanup pass. This note
is the safe alternative: it removes the audit confusion without touching
anything that could delete live data.

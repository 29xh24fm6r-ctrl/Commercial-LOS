# Phase 141A — Annual Portfolio Review & Borrower Financial Collection

> **What this is.** The annual portfolio review operating system: it knows which
> loans need review, which financials borrowers owe, when they are due, who owns
> them, whether the borrower responded, and whether the borrower still appears
> financially sound. **Pure domain + derivers + a read-only command center.** No
> borrower outreach, no live writes, no fake data; readiness fails closed.

## Purpose

This is the time of year the bank must collect annual financials from portfolio
borrowers and confirm each remains financially sound. Annual review is not a
calendar reminder — it is a governed portfolio risk-control workflow. Phase 141A
builds the engine that prevents any review item from being missed.

## Why annual review automation is critical

Manual annual review misses items: a missing statement, a stale insurance
certificate, a covenant breach, a past-due package, or a deteriorating borrower
can slip through. This system tracks every required document, due date, owner,
and borrower response, and surfaces missing / past-due / stale / escalated items
across the full portfolio.

## Required financial collection workflow

- The **requirement catalog** (`annualReviewRequirementCatalog`) defines what an
  annual review requires and when (active loans, watchlist/criticized loans,
  real estate collateral, guarantors, borrowing-base, covenants, SBA, insurance).
- The **collection engine** (`deriveAnnualReviewCollectionPlan`) builds each
  loan's document requirements with real due dates and staleness, and buckets
  them into upcoming / due-now / past-due / missing / received-not-reviewed /
  accepted / rejected / stale, plus escalations and blockers.
- Missing required financials are **blockers**; past-due required financials are
  **escalations**; stale accepted documents are **stale blockers**.

## Borrower soundness review

Readiness and soundness are **fail-closed**: missing means missing, stale means
stale, and a borrower is never concluded sound without financials.
`deriveBorrowerSoundnessAssessment` concludes soundness **only from evidence**.
With no financial inputs the status is `insufficient_information` — the engine
never infers a borrower is sound without financials. Covenant breach, past-due
payment, insurance lapse, and risk-rating deterioration each drive escalation.

## Due-date tracking

Due dates derive from the loan's annual-review due date or the cycle policy —
never fabricated static dates. Items are classified relative to the cycle
`asOfDate`.

## Exception / escalation model

Escalations carry a level (owner / manager / portfolio manager / executive /
board / fdic) and severity, sourced from past-due financials, covenant breach,
insurance lapse, payment delinquency, and risk deterioration.

## Command center

`AnnualPortfolioReviewCommandCenter` renders the KPI ribbon, the filterable
collection queue, and the escalation tape from authorized loans. It is
read-only: no create/edit/delete affordance, no data loading, no fake rows,
honest empty states. Filterable by owner, risk rating, status, watchlist, and
escalation.

## Borrower request package preview

`deriveBorrowerFinancialRequestPackage` + `BorrowerFinancialRequestPreview`
build a **draft** request listing required + missing documents and due dates.
It sends nothing, fabricates no contact, and surfaces a missing-contact blocker.

## What is intentionally not built

- **No automatic borrower email / SMS** — request packages are preview-only.
- **No upload-link generation** yet.
- **No OCR** yet.
- **No live annual-review persistence** — the persistence adapter is disabled by
  default and every operation fails closed (`not_configured`); no schema is
  added in 141A.
- **No fake data** of any kind.
- **No automatic risk-rating change** — risk recommendations are advisory only.

## Next recommended phases

- **141B** — Annual review Dataverse schema / persistence.
- **141C** — Borrower upload-link / email / SMS request workflow (adapter-gated).
- **141D** — Financial spreading + covenant testing integration.
- **141E** — Annual review memo and board / FDIC package automation.

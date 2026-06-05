# Phase 140B-H — Portfolio Loan Boarding, System of Record, Document Evidence, Dataverse Persistence, Command Center Wiring, and FDIC Examiner Package

## 1. Purpose

The LOS must support two portfolio population paths:

1. **Forward-flow path:** Banker-originated deal closes and automatically becomes a portfolio loan.
2. **Manual boarding path:** Existing closed / legacy loan is manually boarded into the LOS and becomes a complete portfolio system-of-record loan.

This phase builds the complete foundation for path #2.

## 2. Business Problem

Banker-originated loans will eventually auto-populate the portfolio, but the bank also needs a way to load every existing closed loan — with every material detail — into a governed, queryable, evidence-backed system of record.

## 3. System Principle

A closed loan is a living, governed, queryable, evidence-backed portfolio record — not a dead PDF folder.

## 4. Manual Boarding Path

Existing loan -> manual boarding -> document/evidence inventory -> readiness engine -> portfolio system of record -> command centers -> FDIC examiner package.

## 5. User Personas

- **Banker** — originates loans, may assist with boarding legacy relationships
- **Portfolio manager** — monitors boarded loans, tracks covenants, insurance, risk ratings
- **Manager** — oversees team portfolio, reviews exceptions and readiness
- **Executive** — views portfolio-level risk and concentration summaries
- **Board member** — reviews board-reportable loans
- **FDIC examiner** — reviews evidence binder, requests artifacts, evaluates readiness
- **Servicing / loan operations** — manages ticklers, documents, exception remediation
- **Credit administration** — manages risk ratings, annual reviews, covenant compliance

## 6. Field Architecture

### Sections

| Section | Description |
|---------|-------------|
| Loan Identity | Loan number, borrower, status, dates, portfolio manager, legacy IDs |
| Borrower Profile | Legal entity type, NAICS, address, ownership, management, related entities |
| Loan Terms | Commitment, outstanding, rate, payment, fees, SBA/participation flags |
| Closing Information | Closing/funding dates, agent, attorney, post-closing items |
| Credit Approval | Authority, date, structure, purpose, sources/uses, conditions, policy exceptions |
| Collateral | Per-item: type, lien, perfection, UCC, mortgage/deed, appraisal, valuation, insurance |
| Guarantors | Per-guarantor: name, type, scope, amount, PFS, liquidity, net worth |
| Covenants | Per-covenant: name, type, frequency, threshold, status, breach/waiver history |
| Ticklers | Per-tickler: name, type, due date, frequency, owner, severity |
| Insurance | Per-policy: type, carrier, coverage, effective/expiration, evidence, staleness |
| Documents | Per-document: type, name, category, dates, reviewer, status, flags |
| Servicing | Risk rating, next review, annual review status, accrual, past due, covenant status |
| Risk Rating | Rating, rationale, strengths, weaknesses, repayment sources, risk drivers |
| Exceptions | Per-exception: type, severity, status, owner, remediation, evidence |
| Review History | Per-review: type, date, reviewer, outcome, next review |
| Audit Trail | Per-entry: actor, action, timestamp, field changes, reason |
| Evidence Links | Per-link: source, document, fact key, description |
| Examiner Notes | Per-note: request, response status, owner, related evidence |

## 7. Document Architecture

Canonical document inventory with 40+ document types. Conditional requirements:

- **NOTE** required for all loans
- **APPROVAL_MEMO** required for board readiness
- **CREDIT_MEMO** required for FDIC/board review
- **GUARANTY** required when guarantors exist
- **APPRAISAL, TITLE_POLICY, FLOOD_DETERMINATION** required for real estate collateral
- **MORTGAGE/DEED_OF_TRUST** required for real estate collateral
- **UCC** required for personal property collateral
- **INSURANCE_EVIDENCE** required when collateral requires insurance (stale-tracked)
- **BORROWING_BASE_CERTIFICATE** required for borrowing base loans
- **SBA_AUTHORIZATION/GUARANTEE** required for SBA loans
- **ANNUAL_REVIEW, RISK_RATING_REVIEW** required for active monitored loans

## 8. Readiness Architecture

Three readiness lenses evaluated by `derivePortfolioLoanBoardingCompleteness()`:

- **FDIC readiness** — all FDIC-required fields and documents present, no open high-severity exceptions, NOTE present
- **Board readiness** — all board-required fields and documents present, APPROVAL_MEMO present
- **Portfolio monitoring readiness** — all monitoring-required fields present, ANNUAL_REVIEW and RISK_RATING_REVIEW present for active loans

**Fail-closed rules:** Missing required field/document blocks readiness. Stale required document blocks readiness. Open high-severity exception blocks FDIC readiness.

## 9. Evidence Binder Architecture

`deriveEvidenceBinder()` groups documents into 14 examiner-ready sections: loan approval, loan terms, borrower/obligor, collateral, guarantors, covenants, financial reporting, servicing, risk rating, exceptions, insurance, annual reviews, correspondence, examiner requested artifacts.

`deriveFdicExaminerPackage()` produces the full FDIC examiner package with:
- Section status (complete / incomplete / N/A)
- Missing / stale / exception disclosure
- Blocker list
- Examiner request checklist

## 10. Dataverse Persistence Architecture

Disabled-by-default adapter pattern:
- `PortfolioLoanBoardingDataverseAdapter` — full CRUD interface, default disabled
- `portfolioLoanBoardingDataverseMapper` — bidirectional mapper (package <-> persistence payload)
- `PORTFOLIO_BOARDING_ENTITIES` — logical target entity names
- All write operations return structured `PersistenceWriteResult`

Future live path: inject a configured adapter with actual Dataverse API calls.

## 11. Command Center Integration

`portfolioBoardingCommandCenterAdapter.ts` provides pure functions:
- `derivePortfolioBoardedLoanCommandRows()` — transforms packages to command center rows
- `mergeBoardedLoansIntoPortfolioSnapshotInput()` — adds boarded rows to existing Portfolio view
- `mergeBoardedLoansIntoManagerSnapshotInput()` — adds to Manager view
- `mergeBoardedLoansIntoExecutiveSnapshotInput()` — adds to Executive view

Rules: no data loading, no query scope widening, no fake rows. Source markers preserved (`manual_boarding` vs `originated_closed_deal`).

## 12. What Is Built In This Phase

### Shared domain (`src/shared/portfolioBoarding/`)
- `portfolioLoanBoardingTypes.ts` — expanded with Phase 140B-H types (evidence links, examiner notes, source markers, expanded sub-interfaces)
- `portfolioLoanBoardingCatalog.ts` — field catalog
- `portfolioLoanDocumentCatalog.ts` — document catalog
- `derivePortfolioLoanBoardingCompleteness.ts` — completeness/readiness engine
- `portfolioLoanBoardingSnapshot.ts` — summary snapshot deriver
- `portfolioLoanDocumentClassifier.ts` — document type classifier
- `portfolioLoanEvidenceBinder.ts` — evidence binder section grouper
- `portfolioLoanDocumentReadiness.ts` — document readiness evaluator
- `fdicExaminerPackage.ts` — FDIC/board/portfolio review packages

### UI (`src/portfolioBoarding/`)
- `PortfolioLoanBoardingPreview.tsx` — read-only preview
- `PortfolioLoanBoardingReadOnlySections.tsx` — section-by-section fields
- `PortfolioLoanBoardingDocumentInventory.tsx` — document inventory
- `PortfolioLoanBoardingReadinessPanel.tsx` — readiness indicators
- `PortfolioLoanBoardingEvidencePanel.tsx` — evidence binder index
- `PortfolioLoanBoardingEditor.tsx` — governed manual entry editor
- `PortfolioLoanBoardingDocumentUploadPanel.tsx` — document upload (adapter-gated)
- `FdicExaminerPackagePreview.tsx` — FDIC examiner package preview

### Adapters (`src/portfolioBoarding/`)
- `portfolioLoanBoardingWriteAdapter.ts` — disabled by default
- `portfolioLoanDocumentUploadAdapter.ts` — disabled by default
- `portfolioLoanBoardingPersistenceTypes.ts` — entity metadata
- `portfolioLoanBoardingDataverseMapper.ts` — bidirectional mapper
- `portfolioLoanBoardingDataverseAdapter.ts` — disabled CRUD adapter
- `portfolioBoardingCommandCenterAdapter.ts` — pure command center adapter
- `portfolioLoanBoardingFormModel.ts` — form section definitions
- `derivePortfolioLoanBoardingFormState.ts` — form state deriver

### Governance
- `portfolioLoanBoardingGovernance.test.ts` — expanded purity/no-fake-data checks
- Updated `releaseCandidateSnapshot.test.ts` — Phase 140B-H file existence pins

## 13. What Is Intentionally Not Built

- No production live Dataverse schema creation (separately scoped)
- No automatic document OCR
- No real upload connector (adapter disabled by default)
- No PDF export
- No fake data, no sample borrower names, no sample dollar amounts
- No permission widening
- No Copilot live connector changes
- No autonomous actions

## 14. Next Recommended Phase

Phase 140I — Live Dataverse schema inspection and guarded table/column seed plan for Portfolio Boarded Loan persistence.

## Acceptance

```bash
npm test -- portfolioBoarding fdicExaminerPackage releaseCandidateSnapshot
npm run build
```

- Tests pass
- Build passes
- No production fake data
- No permission widening
- No live write path enabled by default
- No command center regression
- No Copilot live connector change

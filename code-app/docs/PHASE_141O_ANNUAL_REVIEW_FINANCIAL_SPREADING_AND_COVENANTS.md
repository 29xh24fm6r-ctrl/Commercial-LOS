# Phase 141O — Annual Review Financial Spreading and Covenant Testing Integration

> **What this is.** Annual reviews now produce governed, **evidence-backed**
> financial analysis and covenant test outputs from gathered documents and
> extracted facts. It makes **no final credit decision**, fabricates no
> financials, applies no automatic covenant waiver, sends no borrower request,
> and writes nothing live.

## 1. Purpose

Annual reviews must evaluate borrower financial performance, guarantor support,
covenant compliance, and collateral/insurance posture using gathered documents
and extracted facts. This phase derives financial spreading readiness, available
periods, evidence-backed spread metrics + trends, covenant tests
(pass/fail/unknown/review_required), a combined financial analysis snapshot, and
draft memo/package sections.

## 2. Prerequisites

- **Phase 141A** — annual portfolio review collection command center.
- **Phase 141B-H** — CRM Relationship Master.
- **Phase 141J-K** — CRM schema (created + verified).
- **Phase 141L** — CRM live persistence adapter (disabled by default).
- **Phase 141M** — borrower request workflow (human-approval preview).
- **Phase 141N** — delivery adapter seams (disabled, approval-gated).

## 3. What this phase adds

| File | Role |
|---|---|
| `deriveAnnualReviewFinancialReadiness.ts` | Spreading readiness (wraps document/fact readiness) |
| `deriveAnnualReviewFinancialSpreadSnapshot.ts` | Evidence-backed spread metrics + trends |
| `resolveAnnualReviewCovenantDefinitions.ts` | Covenant definition resolver |
| `testAnnualReviewCovenants.ts` | Covenant testing engine |
| `deriveAnnualReviewFinancialAnalysisSnapshot.ts` | Combined financial analysis snapshot |
| `AnnualReviewFinancialCovenantPanel.tsx` | Read-only financial/covenant panel |
| `buildAnnualReviewFinancialMemoSections.ts` | Draft memo / package section builder |

## 4. Evidence-backed principle

Only evidence-backed facts can drive outputs. Missing data stays missing,
ambiguous periods go to review, and a metric/covenant is unknown when its source
facts are missing or untrusted. Every metric and covenant result carries its
source fact / document ids; values are never inferred from borrower name or memo
text.

## 5. Fact exclusion rules

A fact may drive outputs only when it is **not** any of:
- **superseded**
- **system_invalidated**
- **rejected**
- a **generic / unclassified key** (these never satisfy readiness or spreading)

Facts in an **ambiguous period** send that period — and any covenant depending on
it — to review.

## 6. Covenant testing policy

- Statuses: `pass`, `fail`, `unknown_missing_data`, `unknown_ambiguous_period`,
  `unknown_no_definition`, `not_applicable`, `review_required`.
- Ratio covenants (DSCR, current ratio, debt/TNW, leverage) require their source
  metrics; missing inputs → `unknown_missing_data`.
- Document covenants (reporting, financial-statement delivery, insurance, tax
  return, borrowing base) test document receipt/acceptance, not a ratio.
- Incomplete definitions (missing threshold/operator) → `unknown_no_definition`.
- **No automatic waiver** and **no credit decision** — a failure is a *finding
  requiring review*, never an approval or decline.

## 7. What remains disabled

- **Borrower outreach** — none (no email / SMS / Twilio / mailto).
- **Upload links** — no generation.
- **Email / SMS** — no sending.
- **Live writes** — no CRM or Dataverse writes from the financial/covenant layer.
- **Credit approval** — no final credit recommendation in this phase.
- **Covenant waiver / override** — never applied automatically.

The financial/covenant panel is read-only: no approve-credit, waive-covenant,
override-covenant, send, or upload-link affordance, and no route is registered.

## 8. Next recommended phase

**Phase 141P — Annual review memo, board package, and FDIC package automation.**

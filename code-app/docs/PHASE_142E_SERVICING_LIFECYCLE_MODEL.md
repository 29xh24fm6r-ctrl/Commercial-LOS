# Phase 142E — Servicing / Lifecycle Model Inspired by Frappe Lending

> **What this is.** A governed, **read-only, metadata/deriver-driven**
> post-origination servicing/lifecycle model. It derives the lifecycle stage
> (boarding → booking → active monitoring → annual review → renewal/maturity →
> payoff/exit), the servicing obligations (collateral, insurance, ticklers,
> covenant/reporting, annual review), and an aggregate lifecycle health snapshot.
> It is **operational decision support only**: it never posts payments, disburses
> funds, posts accounting entries, books/closes/transfers loans, mutates repayment
> schedules, creates tasks, updates ticklers, waives covenants, approves credit,
> sends borrower outreach, or writes to any system of record.

## 1. Purpose

Frappe Lending (and core-banking servicing modules generally) models the
post-origination life of a loan: a loan is **boarded** and **booked**, funds are
**disbursed**, repayments and covenants are **monitored**, collateral and
insurance are **tracked**, periodic obligations (annual review, reporting,
ticklers) fall **due**, and the loan eventually reaches **renewal**, **maturity**,
or **payoff/exit**. OGB LOS now has a governed deriver layer that **describes**
where a loan sits in that lifecycle and what servicing obligations and exceptions
exist — from injected metadata only.

Core principle: **servicing lifecycle output is operational decision support
only.** It never posts transactions, changes balances, books loans, waives
covenants, moves money, or mutates live records. Missing data stays missing; no
servicing owner, balance, payment, or collateral value is invented.

## 2. Prerequisites

- **Phases 140A–140Q** — governed metadata, deriver, and evidence foundations.
- **Phases 141A–141P** — relationship, readiness, and governance scaffolding.
- **Phase 142A** — competitive convergence layer (route + product/process).
- **Phase 142B** — governed platform object/view metadata surfaces.
- **Phase 142C** — configurable workflow routing + credit committee deriver.
- **Phase 142D** — product/process template registry (servicing expectations).

## 3. Frappe Lending inspiration

- **Loan boarding / booking** — a loan is boarded, verified, and booked active.
- **Disbursement milestones** — funding/disbursement is a tracked milestone (no
  funds are moved here).
- **Repayment / monitoring expectations** — derived as obligations, not schedules.
- **Collateral / security** — perfection and evidence are tracked; no valuation
  or LTV is computed without value facts.
- **Insurance / ticklers** — expiry and due dates surface attention; no tickler
  is created or updated.
- **Covenant / reporting** — failures are findings; reporting gaps are evidence
  blockers; no waiver is granted.
- **Annual review / renewal / maturity / payoff** — periodic and exit obligations
  route to the correct lifecycle stage.

## 4. What this phase adds

| File | Role |
|---|---|
| `servicingLifecycleTypes.ts` | Stage / status / obligation / snapshot types |
| `deriveServicingLifecycleStage.ts` | Lifecycle stage from injected context |
| `deriveServicingObligations.ts` | Servicing obligations (live outranks template) |
| `deriveServicingCollateralSecurityStatus.ts` | Collateral / security status |
| `deriveServicingInsuranceTicklerStatus.ts` | Insurance + tickler status |
| `deriveServicingCovenantReportingStatus.ts` | Covenant / reporting status |
| `deriveServicingMaturityRenewalStatus.ts` | Maturity / renewal / payoff status |
| `deriveServicingLifecycleSnapshot.ts` | Aggregate lifecycle health snapshot |
| `ServicingLifecyclePanel.tsx` | Read-only servicing lifecycle panel |

The stage deriver applies a fixed priority (closed/inactive → payoff/exit →
servicing exception → covenant exception → maturity window → annual review due →
booked → boarded-pending → boarding → unknown-review). The snapshot deriver takes
the highest-severity component status as the lifecycle health, dedupes next best
actions, and emits a read-only audit summary
(`readOnly: true`, `containsFakeBalance: false`, `containsPaymentPosting: false`).
The optional servicing summary is surfaced into the 142B platform dashboard, the
142C workflow routing panel, and the 142D template selection panel.

## 5. What remains disabled

- **Money movement** — no payment posting, no disbursement; funding is a
  milestone only.
- **Accounting** — no journal / accounting entries.
- **Repayment schedules** — no schedule generation or mutation.
- **Loan lifecycle writes** — no booking, closing, transferring, or stage change.
- **Tasks / ticklers** — no task creation, no tickler update.
- **Covenant waiver / credit approval** — none; exceptions are findings.
- **Borrower outreach** — no email / SMS / mailto / Twilio / upload-link / send.
- **Writes / fetch** — no CRM or Dataverse writes; no direct fetch in components;
  no route registered for the panel.
- **Fabrication** — no balances, payments, collateral values, LTV, or servicing
  owner is invented; missing data stays missing.

## 6. Next recommended phase

**Phase 142F — Integration adapter registry for AML, credit bureau, scoring, and
core banking** (a governed, read-only adapter/capability registry that describes
external integrations without invoking them).

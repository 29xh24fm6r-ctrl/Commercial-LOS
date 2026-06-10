# Phase 142S — Executive Product Profitability / ROE Availability Model

> **What this is.** A READ-ONLY availability / readiness model that reports only
> whether the required SOURCE DATA appears available for FUTURE product
> profitability, ROE, yield, margin, fee-income, and risk-adjusted-return modeling.
> It calculates NO profitability, invents NO ROE, infers NO margin, makes NO
> pricing / credit / portfolio decision, mutates NO deal/product data, and calls NO
> GL / core / servicing system. Every outcome keeps `readOnly` true and
> `profitabilityCalculated`, `roeCalculated`, `yieldCalculated`, `marginCalculated`,
> `feeIncomeCalculated`, and `externalSystemChanged` false. **This is an
> availability / readiness model only.**

## 1. What was added

| File | Role |
|---|---|
| `src/executive/productProfitabilityAvailabilityModel.ts` | Input/summary types + pure `deriveProductProfitabilityAvailability` |
| `src/executive/ProductProfitabilityAvailabilityPanel.tsx` | Read-only profitability/ROE availability panel |

Earlier executive surfaces carried honest "performance & profitability not yet
wired" copy; this phase formalizes that into a pure model that executive / product
strategy surfaces can consume consistently. The panel is exported and tested but
**not mounted to any new route** — no loader, query, or permission is added.

## 2. Why it is availability-only

Profitability, ROE, yield, margin, and fee income require finance-approved
calculation definitions, a general ledger contract, cost-of-funds and charge-off
sources, and a capital-allocation methodology. The bank-safe posture forbids any
fabricated figure. This phase proves only the **source-data readiness boundary**
so a future, finance-approved modeling phase can be designed against a known
shape — with zero fabricated metrics today.

## 3. Input / result shape

**Input** (`ProductProfitabilityAvailabilityInput`): deal / product / loan /
pricing identity plus boolean source-availability flags — `interestRateAvailable`,
`feeIncomeAvailable`, `costOfFundsAvailable`, `chargeOffDataAvailable`,
`servicingPerformanceAvailable`, `generalLedgerDataAvailable`, and
`capitalAllocationDataAvailable`. **No live loader is added.**

**Result** (`ProductProfitabilityAvailabilitySummary`): `availabilityStatus`
(`not_available` | `partially_available` | `source_data_required` |
`ready_for_future_modeling` | `unknown`), `availabilityLabel`,
`availableSourceCount`, `missingSourceCount`, `missingSourceLabels`,
`blockedMetricLabels`, a `futureMetricReadiness` map (each of profitability / ROE /
yield / spread / fee income / risk-adjusted return is `unavailable` | `blocked` |
`ready_for_future_modeling` — never a number), `warnings`, `nextReadOnlyReviewStep`,
`readOnly: true`, and the pinned-false flags `profitabilityCalculated`,
`roeCalculated`, `yieldCalculated`, `marginCalculated`, `feeIncomeCalculated`, and
`externalSystemChanged`.

## 4. Derivation rules

- Missing deal identity → `unknown` with a warning.
- Missing core product / loan / pricing dimensions → `source_data_required`.
- No source categories available → `not_available`.
- Some but not all source categories available → `partially_available`.
- All required source categories available → `ready_for_future_modeling` — but
  still **no metric is calculated**.
- Availability is never inferred from product type alone, and profitability is
  never inferred from amount, stage, or status.

## 5. What metrics are intentionally NOT calculated

Profitability, ROE, ROA, NIM, yield, spread, margin, fee income, cost of funds,
capital allocation, RAROC, and any risk-adjusted return. No numeric output and no
"profitable" / "unprofitable" / "high ROE" / "low ROE" / "margin available" fact
is ever produced.

## 6. What source systems would be needed later

A general ledger data contract, a cost-of-funds source, a servicing performance
source, a fee income source, a charge-off / loss history source, and a
capital-allocation methodology — each finance-owned and audited.

## 7. What is explicitly not implemented

No profitability / ROE / yield / NIM / fee income / cost of funds / capital
allocation / risk-adjusted return calculation; no fake revenue / profit / ROE /
ROA / NIM / RAROC / yield / spread / margin / fee figures; no pricing
recommendation; no credit / portfolio-allocation decisioning; no Dataverse/CRM
write; no create/update/upsert/delete; no PATCH/POST/PUT/DELETE; no fetch /
XMLHttpRequest / axios; no Graph / Outlook / Power Automate; no core banking / GL /
servicing call; no schema migration; no custom API; no lifecycle/status/stage
mutation; no fake "available" copy when source fields are missing; no sample/mock
data; no permission widening; no executable payload path; no eval / Function.

## 8. Safety posture

The model is pure and synchronous; the panel is read-only (no buttons, forms, or
inputs). Future metric readiness is reported as `unavailable` / `blocked` /
`ready_for_future_modeling` only — never a value. Governance pins prove the
absence of every forbidden token and that `readOnly` stays true while every
calculation flag stays false in all outcomes.

## 9. Future prerequisites for live profitability / ROE modeling

1. A GL / general ledger data contract.
2. A cost-of-funds source.
3. A servicing performance source.
4. A fee income source.
5. A charge-off / loss history source.
6. A capital allocation methodology.
7. Finance-approved calculation definitions.
8. An audit / versioning model.
9. Executive / finance role permissions.
10. DLP / security review.
11. A rollback / disable switch.

## 10. Acceptance commands

```
npm test -- profitability Profitability ROE executive product governance releaseCandidateSnapshot
npm run build
npm test
```

## 11. Next recommended phase

**Phase 142T — Release readiness certification for the platform convergence stack.**

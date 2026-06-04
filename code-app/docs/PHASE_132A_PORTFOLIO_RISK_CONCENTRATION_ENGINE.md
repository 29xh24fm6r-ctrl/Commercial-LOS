# Phase 132A — Portfolio Management risk & concentration engine

Upgrades the Portfolio Command Center
(`/workspaces/manager?surface=portfolio`) into a stronger portfolio-risk
and concentration cockpit for controlled pilot use. Read-only,
pure-deriver + UI + tests. **No Dataverse schema change, no new route,
no permission widening, no write actions, no live Copilot activation.**

---

## 1. What was added

### Pure deriver — [src/portfolio/portfolioRiskEngine.ts](../src/portfolio/portfolioRiskEngine.ts)

`derivePortfolioRiskSnapshot(command: PortfolioCommandSnapshot, opts?)`
layers risk statistics on the **existing** command snapshot (single
source of truth — its `vmRows`, ribbon, and concentration rows). It
derives:

- **Exposure:** total, average (mean over deals with a populated
  amount), median, largest (with deal id/name), count of deals with a
  populated amount, count at/above the internal large-exposure
  threshold ($5,000,000).
- **Concentration:** single-name (top borrower) %, top-5 %, top product
  %, top banker %, and an exposure-by-client list — each with an
  internal policy **band**.
- **Closing / maturity ladder:** deal count + exposure by days-to-target
  -close bucket (Overdue / 0–30 / 31–60 / 61–90 / 91–180 / 180d+), plus
  an honest "No close date" bucket.
- **Operational:** stale / missing-data / blocked / at-risk counts,
  document-bottleneck and task-bottleneck deal counts, plus operational
  / data-quality / closing-pressure **bands**.
- **Ranked findings** (see §5).
- `portfolioRiskCopilotSummaries(risk)` — GUID-free summary lines for
  the Copilot context.

Exposure-by-product / loan-structure / pricing / banker / stage already
existed on the command snapshot and are reused unchanged.

### Concentration policy bands

`PortfolioBand = 'low' | 'watch' | 'elevated' | 'high'` — **internal
operational indicators only.** Thresholds are explicit and tested:
single-name `[10,20,35]`, group/top-5 `[40,60,80]`, segment
(product/banker) `[25,40,60]`, ratio (operational/data-quality)
`[10,25,40]` percent; closing-pressure by count. Honest dimension
labels: *Exposure concentration*, *Portfolio concentration watch*,
*Operational risk*, *Data quality risk*, *Closing pipeline pressure*.

### UI — [src/portfolio/RiskConcentrationRadar.tsx](../src/portfolio/RiskConcentrationRadar.tsx)

A new **Risk & Concentration Radar** section mounted near the top of the
Portfolio cockpit (above the KPI ribbon). Read-only; drill-downs are
`<Link>` anchors, never buttons. Contains:

- **8 cards:** Largest exposure, Single-name concentration, Top-5
  concentration, Product concentration, Banker concentration,
  Operational bottlenecks, Data quality, Closing pressure — each with a
  band chip + honest dimension label.
- **2 new compact charts** (reusing `ManagerChartPrimitives`): Top
  borrower exposures (horizontal bar) and Closing/maturity ladder
  (vertical bar). Concentration-by-product, concentration-by-banker,
  data-quality, risk-distribution, and closings-forecast charts already
  exist in the cockpit's analytics grid and are reused.
- **Ranked risk findings** list (see §5).
- The honest-omission footnotes (see §7).

### Copilot context

The Portfolio Copilot workspace context now appends
`portfolioRiskCopilotSummaries(risk)` to its KPI summaries and routes
the top risk findings into the connector's proposal `topBlockers` — all
already-derived, labels/counts/percentages only (no GUIDs). **No new
adapter methods; the default connector remains `not_configured`**, so no
proposals render and no external call is made by default.

---

## 2. Data sources used

Everything derives from the **already-authorized, already-loaded**
manager-scoped data the Portfolio cockpit already consumes via
`ManagerDataProvider` → `derivePortfolioCommandSnapshot` →
`deriveManagerPipelineSnapshot` (`vmRows`): TeamDeal fields (amount,
clientName, productType, loanStructure, pricingType, assignedBankerName,
stage, status, targetCloseDate, modifiedOn) and per-deal task/document
counts. **No new Dataverse query, table, column, or loader.**

---

## 3. What is intentionally NOT regulatory

The policy bands are **operational indicators, not regulatory
classifications.** This phase deliberately makes **no** claim of: legal
lending limit, covenant compliance, yield, CECL / ALLL, criticized or
classified asset grades, or participation analysis. Those require source
fields the schema does not carry. The radar renders both disclaimers
verbatim, and a governance test pins that the engine's runtime code
makes no such claim.

---

## 4. Pilot demo walkthrough

1. Sign in as a Portfolio-entitled user → land on
   `/workspaces/manager?surface=portfolio` (route unchanged).
2. The **Risk & Concentration Radar** is the first content block: scan
   the 8 cards for largest exposure, single-name and top-5
   concentration bands, product/banker concentration, operational
   bottlenecks, data-quality, and closing pressure.
3. Read the **Top borrower exposures** and **Closing / maturity ladder**
   charts.
4. Review **Risk findings** — ranked high → elevated → watch, each with
   a source metric, a safe next action, and (where deal-anchored) a link
   into the deal cockpit.
5. Confirm the footnotes: bands are operational, not regulatory.
6. Copilot Assist remains **Not configured** (no proposals render); its
   context now silently includes the risk summary for when a live
   connector is later enabled under its own spec.

---

## 5. Portfolio exceptions / findings

`deriveFindings` produces ranked `PortfolioRiskFinding`s — each with
`label`, `severity` (high/elevated/watch/info), `supportingNames`,
`sourceMetric`, `nextAction`, and an optional `dealId` route target:

- top-borrower-concentration, concentrated-product-exposure,
  concentrated-banker-exposure (portfolio-level, severity from band);
- stale-high-dollar-deal (high), high-exposure-outstanding-docs
  (elevated), high-exposure-open-tasks (watch),
  high-exposure-missing-labels (elevated), closing-soon-unresolved
  (elevated) — per large deal.

Ranked by severity, then exposure desc, then label. The existing
per-deal blocker Exceptions section is unchanged and remains below.

---

## 6. Tests

- [portfolioRiskEngine.test.ts](../src/portfolio/portfolioRiskEngine.test.ts) — exposure stats, concentration %, top-5, average/median, threshold count, maturity ladder, bands (low→high), empty portfolio, honest unknown client, ranked findings (severity + exposure), Copilot summary (no GUID), no regulatory claim in runtime code.
- [RiskConcentrationRadar.test.tsx](../src/portfolio/RiskConcentrationRadar.test.tsx) — renders the 8 cards + disclaimers, deal-anchored finding renders as a link, and a static-source pin: no `<button>`/`<form>`/`onClick`/`onSubmit`, no generated-service/email import.
- [PortfolioCommandCenter.test.tsx](../src/portfolio/PortfolioCommandCenter.test.tsx) — radar mounts near the top; the existing no-write-affordance + route pins still hold.
- Route stays `/workspaces/manager?surface=portfolio` (pinned by `workspaceEntitlements` / `WorkspaceGate` suites). Full suite: **3815 passing**; `npm run build` clean.

---

## 7. Honest omissions (rendered copy)

- "Policy bands are operational indicators, not regulatory
  classifications."
- "Legal lending limit, covenant, yield, CECL/ALLL, criticized/classified
  asset, and participation analysis require additional source fields."

---

## 8. Follow-up backlog

- Persisted / configurable thresholds + bands (needs a settings entity).
- True legal-lending-limit and covenant analysis (needs source fields).
- Time-series concentration trend (needs a snapshot store).
- Industry / geography / collateral concentration (needs those fields
  hydrated on the pipeline query).
- Participation / hold-vs-sold exposure split.
- Wire the risk summary into a live Copilot connector once that is
  enabled under its own spec (default stays not_configured here).

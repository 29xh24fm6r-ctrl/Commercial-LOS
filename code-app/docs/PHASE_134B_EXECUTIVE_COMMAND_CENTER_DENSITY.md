# Phase 134B — Executive Command Center density pass

## Goal

Upgrade the Executive Command Center from a verified shell into a denser
executive cockpit — using **only already-authorized data and existing
Executive slots**. No Dataverse writes, no token work, no schema
changes, no entitlement widening, no new route/access model, no
manager/team proxy, no fake fallback data. Phase 134A honesty is
preserved.

## What changed

### New pure adapter — [src/executive/executiveDashboardCharts.ts](../src/executive/executiveDashboardCharts.ts)

Converts the already-derived `ExecutiveCommandSnapshot` into chart-
primitive datum shapes + two honest count-based derivations. Pure: no
IO, no fetch, no mutation, no new Dataverse scope. Exports:

- `stageCountBars` — deal **count** per stage (a distinct view from the
  $ exposure bars).
- `stageExposureBars` — **$** per stage with a `count · share` label.
- `readinessDonutSegments` — the readiness-band donut segments.
- `closingForecastPoints` — upcoming (non-past) forecast buckets.
- `executiveExceptionTape` — honest bucket counts (blocked readiness /
  low readiness / deals missing docs / stale deals / no readiness band);
  a zero bucket is surfaced honestly (clear tone), never hidden or
  faked.

### Densified cockpit — [src/executive/ExecutiveCommandCenter.tsx](../src/executive/ExecutiveCommandCenter.tsx)

New / restructured read-only sections (in render order):

1. **KPI ribbon** (unchanged honest totals).
2. **Executive exception tape** — compact bucket counts, real values only.
3. **Strategic risk posture** — readiness donut (via adapter) + stats.
4. **Portfolio exposure** ($ by stage) **+ Stage distribution** (count by
   stage) side by side.
5. **Closing forecast** — promoted to its own card (honest empty message
   when there are no upcoming windows).
6. **Operations health + Data quality & readiness** side by side.
7. **Top deals to watch + Top bottlenecks** (readiness-ranked deal links).
8. **Performance & profitability** availability panel — shows only the
   availability **counts** for the two non-core slots and an explicit
   "Not yet wired" note; no revenue / ROE / yield / margin figures are
   derived.
9. **Honest omissions** (unchanged).

No write affordances were added — every new section is display-only
(charts, stat cards, tape chips, deal `<Link>`s). No forms, buttons,
modals, or email/send imports.

## Data sources used

All from the existing `ExecutiveDataProvider` slots — nothing new is
fetched:

- **Core (fail-closed) slots:** readiness snapshots
  (`snapshotReadiness`), pipeline-by-stage (`fallbackPipelineByStage`),
  closing forecast (`fallbackClosingForecast`). These remain the **only**
  gating inputs — a failure in any of them fails the cockpit closed.
- **Non-core slots:** performance metrics (`snapshotPerformance`) and
  profitability snapshots (`snapshotProfitability`) are read **only** for
  availability counts. A failed load of either does **not** fail the
  cockpit closed and never invents a KPI.

## Metrics intentionally omitted (no fabrication)

The executive snapshot does not carry the inputs for these, so they are
**not** rendered — the availability panel + honest omissions say so:

- Profitability, revenue, ROE, yield, margin, ROA (the profitability slot
  exists but is **not** broken down — "Not yet wired", pending governance).
- Per-banker production breakdown (performance slot count only).
- Weighted pipeline, win rate, pull-through, approval probability,
  predictive rankings — none are synthesized.
- Per-deal dollar exposure, exposure by product/banker, task/overdue
  counts, average days-in-stage — not in the snapshot.

Exposure is derived **only** from stage aggregates; readiness counts
**only** from readiness rows. Readiness rows carry no dollar amount, so
a readiness-only state shows `$0` exposure (never inferred).

## Live demo checklist

1. Provision a pilot user's primary workspace to "Executive Dashboard"
   (Phase 133C seed) and sign in → land on `/workspaces/executive`.
2. **Populated:** confirm the KPI ribbon, exception tape, readiness
   donut, exposure-by-stage + stage-distribution, closing-forecast card,
   operations health, data quality, and top-deals/bottlenecks all render
   with real values and deal-drill links.
3. **Exception tape:** confirm each bucket count matches the readiness
   data (blocked / low / missing-docs / stale / no-band); zero buckets
   render with a clear tone, not hidden.
4. **Partial:** with readiness but no stage aggregates, confirm exposure
   reads `$0` and the risk/exception sections still reflect readiness.
5. **Empty:** with no executive snapshot data, confirm the honest empty
   state — no KPI ribbon, no fabricated sections.
6. **Performance/profitability:** confirm the panel shows availability
   counts + "Not yet wired"; no revenue/ROE/yield/margin figures appear.
   Confirm a failed profitability/performance load does not break the
   cockpit.
7. **Read-only:** confirm there are no write controls anywhere; the
   Copilot panel shows **Not configured**.

## Guardrails (honored)

- No Dataverse writes, no token work, no schema changes.
- No entitlement widening, no new route/access model, no manager/team
  proxy (Executive remains primary-workspace-name gated).
- No invented weighted pipeline / win rate / pull-through / profitability
  / yield / margin / ROA / revenue.
- Phase 134A honesty preserved: fully-empty → honest empty state;
  partial data → never fabricated; failed non-core slot → not fail-closed;
  the three core slots remain the only fail-closed gating inputs.
- Executive surface stays read-only (no forms / write buttons / modal
  write flows / email-send imports), pinned by static-source tests.

## Tests

- [executiveDashboardCharts.test.ts](../src/executive/executiveDashboardCharts.test.ts) — adapter derivations (stage count/$ bars, donut, forecast filtering, exception-tape counts incl. honest zero buckets) + a purity scan (no fetch/await/async/generated/write).
- [ExecutiveCommandCenter.test.tsx](../src/executive/ExecutiveCommandCenter.test.tsx) §134B — density sections render from real data; exception tape shows the real blocked count (no fabrication); closing-forecast honest empty message; performance/profitability shows availability + "Not yet wired" with no revenue/ROE/yield/margin figures; a failed profitability slot does not fail closed; plus a static no-fetch/Graph/Office/write pin. Phase 134A empty/partial honesty tests remain green.

## Acceptance

```
npm test -- Executive ExecutiveWorkspace WorkspaceGate workspaceEntitlements
npm run build
```

Target suites pass (93 tests across six files). Full suite 3893. Build
clean.

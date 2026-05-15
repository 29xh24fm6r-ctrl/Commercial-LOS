# Phase 71 — Per-Banker / Per-Team Derived Analytics

**Phase posture.** `read-only surface`. Adds deterministic
derivations on top of existing role-loaded data. No new writes.
No schema work. No AI. No Teams integration. No new queries — the
new cards consume the same `TeamDeal` / `TeamDealRow` data the
existing manager + team cards already load.

**Vibe capabilities advanced.** Closes the in-repo slice of:
- §1.19 Performance scoring (deterministic derivation only; no AI,
  no score, no ranking).
- §1.22 Manager workspace (manager analytics extension).
- §1.27 Reporting / portfolio analytics (per-banker breakdown on
  the team workspace).

Lane A roadmap item #2 from the Phase 69 Vibe Capability Coverage
Map ships in this phase.

Related canonical sources:
- [src/shared/analytics/derivedAnalytics.ts](../src/shared/analytics/derivedAnalytics.ts) — pure derivation primitives.
- [src/manager/ActivitySummary.tsx](../src/manager/ActivitySummary.tsx) — new manager card.
- [src/team/TeamBankerActivityBreakdown.tsx](../src/team/TeamBankerActivityBreakdown.tsx) — new team card.
- [src/workspaces/ManagerWorkspace.tsx](../src/workspaces/ManagerWorkspace.tsx) + [src/workspaces/TeamWorkspace.tsx](../src/workspaces/TeamWorkspace.tsx) — card mount points.
- [docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md](MICROSOFT_VIBE_CAPABILITY_COVERAGE.md) — §1.19 and §1.22 marked as advanced.

---

## 1. Exact metrics included

### Shared module (`src/shared/analytics/derivedAnalytics.ts`)

Three exported primitives:

1. **`summarizeStageAging(deals, now)`** → returns:
   - `countedDeals` — number of deals with a parseable `stageEntryDate`.
   - `averageDaysInStage` — rounded mean (0 when none counted).
   - `medianDaysInStage` — rounded median (0 when none counted).
   - `maxDaysInStage` — longest in stage.
   - `atRiskCount` — count at or past `STAGE_AGING_AT_RISK_DAYS` (30).
   - `missingStageEntryDateCount` — surfaced honestly so the consumer can render the coverage gap.

2. **`summarizePipelineMix(deals)`** → returns:
   - `distinctStages` — count of unique stage names.
   - `distinctBankers` — count of unique banker ids.
   - `unassignedDealCount` — deals with no `assignedBankerId`.
   - `missingStageCount` — deals with no `stage` value.
   - `topBankerPipelineSharePct` — top banker's share of total pipeline volume (0 when no amount data).
   - `topBankerDealCountSharePct` — top banker's share of assigned deal count.

3. **`derivePerBankerActivity(deals, now)`** → returns rows with:
   - `bankerId`, `bankerName`.
   - `totalDeals` — count of active deals.
   - `totalAmount` — sum of `amount` (skipping deals with no amount).
   - `dealsMissingAmount` — surfaced honestly.
   - `averageDaysInStage` — rounded mean for this banker's deals.
   - `stageAtRiskCount` — count of this banker's deals at or past 30 days.
   - `closingSoonCount` — count of this banker's deals within `CLOSING_SOON_DAYS` (14) of target close.

Rows are sorted by `totalDeals` desc, then `bankerName` asc — deterministic and useful at-a-glance. Sorting is NOT a ranking judgment.

### Manager Activity Summary card

Mounts in `ManagerWorkspace`. Renders two subsections from the primitives above:

- **Stage aging** — `averageDaysInStage`, `medianDaysInStage`, `maxDaysInStage`, `atRiskCount` (at or past 30 days). Surfaces `missingStageEntryDateCount` as a gap hint when non-zero.
- **Pipeline mix** — `distinctStages`, `distinctBankers`, `topBankerPipelineSharePct`, `topBankerDealCountSharePct`. Surfaces `unassignedDealCount` / `missingStageCount` as gap hints when non-zero.

Footer disclaimer: "Derived from current records. This is an activity summary, not a performance evaluation. No ranking, no predictive claim, no automated decisioning."

### Team Banker Activity Breakdown card

Mounts in `TeamWorkspace`. Renders a per-banker table with columns:
- Banker
- Deals
- Pipeline $ (with `(N missing $)` inline marker when a banker has deals lacking amount data)
- Avg days in stage
- May require review (count; shown as an at-risk badge when > 0)
- Closing soon

Footer disclaimer: "Derived from current records. This is a workload summary, not a performance evaluation. No ranking, no predictive claim, no compensation impact."

## 2. Source fields used

All three primitives read ONLY these fields from `AnalyticsDeal`:
- `id`, `name`, `stage`, `status`, `amount`, `targetCloseDate`, `stageEntryDate`, `assignedBankerId`, `assignedBankerName`.

Both `TeamDeal` (manager) and `TeamDealRow` (team) carry every one of these fields. The analytics module does NOT depend on either role's query module — its only dependency is the structural `AnalyticsDeal` interface declared inline.

## 3. Metrics intentionally excluded

| Metric | Why excluded |
|---|---|
| Document counts (outstanding / received / pending review) | The manager + team data providers do not load per-deal document data. Adding queries for cross-deal document aggregates would be additive query work the brief did not authorize. The existing `TeamDocumentNeeds` card already surfaces team-wide document signals using a different query path. |
| Open / overdue task counts | Same constraint — per-deal task data is loaded only inside `DealDataProvider`. The existing `TeamTaskLoad` card surfaces team-wide task signals via a separate query. |
| Win rate / loss rate / conversion | The schema does not currently expose terminal-state historic transitions in a queryable shape. Adding this would require historic stage-transition data the deal record does not carry. |
| Velocity (deals per banker per quarter) | Same constraint — no time-series storage. |
| Performance score / banker ranking / compensation impact | Explicitly forbidden by the brief. The cards' disclaimers state this verbatim. |
| Predictive risk / AI-derived signals | `NOT_WIRED.ai-generation` standing. No model integration. |
| Stage-progression projections | `DELIBERATELY_BLOCKED.stage-progression-advance`. No stage ordering data. |

## 4. Limitations

- **No cross-card analytics module reuse yet.** Existing manager cards (`TeamPipelineSummary`, `BankerWorkloadSummary`, `AtRiskBlockedDeals`) and team cards (`TeamPipelineSummary`, `BottlenecksAgingByStage`) still derive locally. The Phase 71 shared module is the canonical source for the NEW metrics it ships; refactoring existing cards to consume it is a separate phase candidate.
- **All three primitives operate on a single snapshot of deal data.** They do not look at history.
- **Sorting is deterministic, not ranked.** "Top banker pipeline share" surfaces concentration, not performance. The same banker who appears first in `derivePerBankerActivity` may legitimately be the most productive OR the most overloaded — the metric is silent on causation.
- **Missing-field counts are reported but not inferred.** If 80% of deals have no `stageEntryDate`, the average is computed on the remaining 20% AND the 80% is surfaced as a gap hint. This is honest but means the user must interpret the numbers in context.
- **`now` is caller-supplied.** The two cards each pass `new Date()` once per mount. No tick / refresh — values change only on page reload or a sibling refresh.

## 5. Role visibility

| Role | Sees Manager Activity Summary | Sees Team Banker Activity Breakdown |
|---|---|---|
| Banker | No (banker workspace doesn't mount manager / team cards). | No. |
| Manager | Yes (mounted under `ManagerDataProvider`). | No (team workspace not visible to managers). |
| Team member | No (team workspace doesn't mount manager cards). | Yes (mounted under `TeamDataProvider`). |
| Executive | No (snapshot-only workspace; explicitly out of scope). | No. |
| Admin | No (admin workspace is diagnostics; not deal analytics). | No. |

Executive deal drillthrough remains `NOT_WIRED.executive-deal-drillthrough`. Phase 71 deliberately did NOT add any live operational analytics to the executive workspace.

## 6. Why this is NOT AI scoring or official performance scoring

- **Deterministic.** Same input → same output. No model call, no randomness, no learned weights.
- **Source-field-backed.** Every metric ties back to a Dataverse column on `cr664_loandeals`. If a column is missing, the gap is surfaced; the metric is NOT silently imputed.
- **No score / no rating.** The cards never display a single composite "performance" number. They show factual counts and averages.
- **No automated decisioning.** Nothing in this phase routes work, escalates alerts, or affects permissions. The cards are read-only displays.
- **No predictive claims.** Future trajectory, win likelihood, retention probability — none of these are computed, displayed, or even loaded.
- **No compensation impact.** The cards do not feed any compensation / performance-review system; the Code App does not integrate with one.
- **The disclaimer is shipped, tested, and pinned.** Each card renders the disclaimer verbatim and the tests assert its presence + the absence of forbidden language.

## 7. Tests

| File | What it pins |
|---|---|
| [src/shared/analytics/derivedAnalytics.test.ts](../src/shared/analytics/derivedAnalytics.test.ts) | 21 assertions. Empty-set fallback for all three primitives; missing-field handling (no stage-entry-date, no amount, no assigned banker, unparseable date, future date); mathematical correctness (averages, medians, percentages); deterministic sort order; thresholds match documented constants (30 and 14); module hygiene (no SDK / role-module / power-apps import; closed public export surface). |
| [src/manager/ActivitySummary.test.tsx](../src/manager/ActivitySummary.test.tsx) | 8 UI assertions. Renders card header + subtitle + disclaimer; renders empty / loading / failed states; renders both subsections + every stat label; surfaces missing-stage-entry-date gap hint; surfaces unassigned + missing-stage gap hints; explicit no-score / no-AI-generated / no-underperforming claim sweep; explicit positive presence of the "No ranking, no predictive claim" disclaimer. |
| [src/team/TeamBankerActivityBreakdown.test.tsx](../src/team/TeamBankerActivityBreakdown.test.tsx) | 7 UI assertions. Renders header + disclaimer; renders empty / loading / failed states; per-banker rows sorted deterministically by deal count; missing-amount inline hint surfaces; no-score / no-AI / no-underperforming sweep + positive disclaimer presence. |

## 8. Phase 71 AAR

**Files created**
- [src/shared/analytics/derivedAnalytics.ts](../src/shared/analytics/derivedAnalytics.ts) — pure primitives.
- [src/shared/analytics/derivedAnalytics.test.ts](../src/shared/analytics/derivedAnalytics.test.ts) — 21 assertions.
- [src/manager/ActivitySummary.tsx](../src/manager/ActivitySummary.tsx) — new manager card.
- [src/manager/ActivitySummary.test.tsx](../src/manager/ActivitySummary.test.tsx) — 8 UI assertions.
- [src/team/TeamBankerActivityBreakdown.tsx](../src/team/TeamBankerActivityBreakdown.tsx) — new team card.
- [src/team/TeamBankerActivityBreakdown.test.tsx](../src/team/TeamBankerActivityBreakdown.test.tsx) — 7 UI assertions.
- [docs/PHASE_71_DERIVED_ANALYTICS.md](PHASE_71_DERIVED_ANALYTICS.md) — this document.

**Files modified**
- [src/workspaces/ManagerWorkspace.tsx](../src/workspaces/ManagerWorkspace.tsx) — mounted `ManagerActivitySummary`.
- [src/workspaces/TeamWorkspace.tsx](../src/workspaces/TeamWorkspace.tsx) — mounted `TeamBankerActivityBreakdown`.
- [docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md](MICROSOFT_VIBE_CAPABILITY_COVERAGE.md) — §1.19 + §1.22 updated to reflect Phase 71 advancement.

**Vibe capabilities advanced**
- §1.19 Performance scoring — deterministic in-repo derivation now shipped.
- §1.22 Manager workspace — analytics extension shipped.
- §1.27 Reporting / portfolio analytics — per-banker breakdown shipped on team workspace.

**Metrics implemented**
- Stage aging (avg / median / max / at-risk count).
- Pipeline mix (distinct stages, distinct bankers, top-banker pipeline / count share).
- Per-banker activity (deals, pipeline $, avg days in stage, at-risk count, closing soon count).

**Source fields used**
- `cr664_loandeals` columns surfaced on `TeamDeal` / `TeamDealRow`: `cr664_dealname`, `cr664_stagereferencename`, `cr664_statusreferencename`, `cr664_amount`, `cr664_targetclosedate`, `cr664_stageentrydate`, `_cr664_assignedbanker_value`, `cr664_assignedbankername`.

**Metrics intentionally excluded**
- See §3 table above. Notably: document/task aggregates (would need additional queries), win rate / velocity (no historic data), performance scoring / banker ranking / compensation impact (forbidden by brief).

**Role surfaces updated**
- Manager workspace — added `ManagerActivitySummary` card after `BankerWorkloadSummary`.
- Team workspace — added `TeamBankerActivityBreakdown` card after `SharedActiveDeals`.
- Executive — unchanged (snapshot-only boundary preserved).
- Admin — unchanged.
- Banker — unchanged (optional banker personal summary was deferred to a future phase to keep this commit tight).

**Tests added/updated**
- 21 analytics primitive tests.
- 8 manager card tests.
- 7 team card tests.
- Net: +36 new tests.

**Confirmations**
- No new writes. `GOVERNED_WRITES.length === 11` unchanged.
- No new queries — the new cards consume the existing role-data providers' loaded data.
- No AI. No scoring. No decisioning. The cards' disclaimers + tests pin this.
- Executive live-data boundary unchanged. Phase 15 snapshot-safe posture preserved.
- Manager + team workspaces remain read-only for deal data. Phase 71 added read-only cards only.
- Schema unchanged. No new column reads, no new SDK methods.
- Vibe coverage map updated honestly — §1.19 + §1.22 moved from "Partially operational" to "Partially operational (advanced by Phase 71)" with a specific note about what's now in-repo.

**Test / build counts**
- 1086 → 1122 tests passing (+36 net Phase 71 assertions).
- Build clean.

**Recommended next phase**
- **Phase 72 — Activity-since-last-visit (rule-based)** (Lane A item #3 from the Phase 69 coverage map). Closes capability §1.18 (Activity intelligence) without AI; uses local-storage last-seen timestamp + a derived timeline diff. Next-largest Vibe coverage delta available in-repo without upstream dependency.
- Alternatives: **Phase 72 — Structured-data credit-memo consistency check** (capability §1.14) or **Phase 72 — Accessibility audit + targeted fixes** (capability §1.28). All three are Lane A; pick by leadership priority.

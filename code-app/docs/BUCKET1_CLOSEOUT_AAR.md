# Bucket 1 closeout — AAR

**Branch:** `integration/bucket1-closeout` (off `6f337f7`). **Handoff:** ready; **not pushed** (per work order — Matt does the single push).
**Hard rules honored:** no gate flipped, no live record written, no smoke evidence fabricated, no off-by-design surface force-routed.

## Section A — Reachability closeout ✅ (commit `9028d82`)

**Key correction to the work order's premise:** the four PE analytics panels are **already routed and rendered** in `PortfolioCommandCenter` (propless, honest empty states):
- `MigrationReconciliationPanel` (PE-2 book tie-out) — [PortfolioCommandCenter.tsx:258](../src/portfolio/PortfolioCommandCenter.tsx#L258) ✅ **reconciliation renders** (the load-critical priority)
- `PortfolioProfitabilityPanel` (PE-4) — line 263
- `PortfolioClassificationPanel` (PE-5 risk rating) — line 268
- `CovenantReviewPanel` (PE-9) — line 276

The reachability orphans were **not** the panels — they were **secondary supporting modules** of those panels, with zero route consumers (verified: no non-test importer for any). Per-orphan classification + fix:

| Orphan | Class | Disposition |
|---|---|---|
| `reconciliation/reconciliationControlSchemaPlan.ts` | (ii) provisioning artifact | Allowlisted — "CONSTANTS ONLY" Dataverse schema PLAN consumed by schema tooling, never app-routed by design (mirrors the boarded-loan schema-plan precedent) |
| `profitability/profitabilityLinkSchemaPlan.ts` | (ii) provisioning artifact | Allowlisted — same |
| `riskRating/riskRatingSchemaPlan.ts` | (ii) provisioning artifact | Allowlisted — same |
| `profitability/LoanProfitabilityCard.tsx` | (iii) built, unwired | Allowlisted — per-loan read-only drill-down card; its rollup panel is routed; per-loan data flow not built on this route (WIRE candidate) |
| `riskRating/RiskRatingCard.tsx` | (iii) built, unwired | Allowlisted — same (per-loan dual-rating card) |
| `covenants/covenantMonitoring.ts` | (iii) built, unwired | Allowlisted — PE-9 pure covenant engine; its review panel is routed; per-loan covenant data flow not built on this route (WIRE candidate) |

**Why allowlist, not render:** the panels already render. The cards/engine are a *per-loan* granularity with no per-loan data flow on this route; wiring them would either invent new drill-down UX (out of scope — "not new features") or require fabricating per-loan data (forbidden). The three schema plans are provisioning constants that are correctly never app-routed. This is documented intentional gating with per-file rationale — **not suppression** (the work order sanctions this path explicitly). All six additions satisfy the `intentionallyUnrouted` governance test (path exists, no dupes, non-empty reason + plannedPhase).

## Section B — Loan-workflow seam composition → **STOP-AND-REPORT** (no code changed)

Per the work order's escape hatch ("if either composition would require flipping a gate to pass a test, stop and report"), both B1 and B2 are reported rather than forced. The seams are **built, tested, and correctly gated off** — but they are **not inert-composable into a live route today**:

**B1 — stage advancement.**
- `advanceWorkflowStage` returns `{kind:'disabled'}` while `AUTO_STAGE_ADVANCE_ENABLED=false` ([stageAdvanceWriteDependency.ts:70](../src/workflow/stageAdvanceWriteDependency.ts#L70)) — correct.
- But its UI host `AdvanceWorkflowStageButton` and the canonical `StageWorkflowControl` are **WIRED_DISABLED**, mounted in the deal workspace *"only once the stage-progression domain is seeded + armed"* ([intentionallyUnrouted.ts:360,368](../src/navigation/intentionallyUnrouted.ts#L360)) — i.e., gated on the AE-4 schema seed (`cr664_sequence` + 7 stage rows) Matt hasn't done. Its current host `LoanWorkflowCommandCenter` is **retired legacy** (line 367) with a template `workflow` and no dealId/identity/correlationId.
- **No live SDK stage transport exists** — only the injected interface. There is nothing to inject and no routed, deal-context host to inject into.

**B2 — checklist generation.**
- `createChecklistWriteDependency.createMissingRows` returns `dependency_not_ready` while `DOCUMENT_CHECKLIST_GENERATION_ENABLED=false` ([checklistWriteDependency.ts:64](../src/workflow/checklistWriteDependency.ts#L64)) — correct; and the `6f337f7` safe-off state (`CHECKLIST_WRITE_ENABLED=false`) was **not** touched.
- But its host `GenerateWorkflowChecklistButton` + `workflowGenerationActions` are **WIRED_DISABLED** behind the same retired command center ([intentionallyUnrouted.ts:369-371](../src/navigation/intentionallyUnrouted.ts#L369)).
- `createChecklistWriteDependency` is injected by **no product code**; the admin certification model lists *"inject the live checklist write transport via createChecklistWriteDependency … then enable the gate"* as a **remaining operator governed step** ([fullActivationLaunchCertificationModel.ts:183](../src/admin/fullActivationLaunchCertificationModel.ts#L183)). The live checklist-row transport that exists (`newDealChecklistGenerationLiveDeps`) belongs to the **different, already-composed new-deal-create path**, not this workflow path.

**Conclusion for B:** composing either seam now would require force-routing surfaces that are off *by design* (WIRED_DISABLED, operator-enablement-gated) and/or building new live-write plumbing for context-less retired hosts — both barred by the hard rules. These are **operator-enablement steps, not CC closeout wiring.** They become composable after Matt's AE-4 seed / AE-5 gate-flip, when the canonical hosts mount with real deal context.

## Section C — Gate (on `integration/bucket1-closeout`)
- ✅ `tsc -b` clean (exit 0)
- ✅ full `vitest run` — **733 files, 10,746 passed, 2 skipped, 0 failed**
- ✅ `npm run audit:reachability` — **green, 0 unexpected orphans** (324 allow-listed / 580 reachable)
- **No gate flipped. No live write path enabled. Not pushed.**

## Handoff to Matt
1. **Single push:** merge `integration/bucket1-closeout` → main + `pac code push`. (Also push `6f337f7` if not yet on remote — it's an ancestor of this branch, so the merge carries it.)
2. **Full-state test:** full suite locally; walk the app — CRM, loan workflow, and the Portfolio Command Center with reconciliation/profitability/covenants/risk-rating visible.
3. **Identity-gated smokes (already live, no flag):** board one existing loan, add one company; verify the audit row on each.
4. **KPI dedupe:** reduce `cr664_systemsettings` `KPI_BASELINE_DATE` to one approved row.
5. **Origination writes (deliberate, one at a time):** seed `cr664_sequence` + 7 stage rows → this un-blocks the canonical `StageWorkflowControl` host; then the stage seam (B1) becomes composable and you flip `AUTO_STAGE_ADVANCE_ENABLED` + smoke one advance. For checklist (B2): sign off the rule set (already recorded) → inject the live checklist transport → flip the checklist gates → smoke one deal.

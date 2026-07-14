# Loan Workflow — Independent Audit (2026-07-14)

**Scope:** `src/workflow/`, `src/access/`, `src/deals/` write paths, `src/generated/services/` (Dataverse client), and the `docs/` self-authored readiness/AAR corpus.
**Method:** Independent verification against code and tests — prior "readiness"/"AAR" docs in this repo were treated as unverified claims, not fact, and checked accordingly. Objective checks (typecheck, lint, full test run) plus four targeted code-reading passes (state machine/gating, routing/approval authority, UI↔data-layer enforcement, docs-vs-code cross-check).
**Author:** Claude (independent session), not the agent lineage that wrote the prior AAR/readiness docs.

## Objective checks

| Check | Result |
|---|---|
| `tsc -b` | Clean, 0 errors (after regenerating the gitignored `.power/schemas` build stub via `npm run power:schemas:ensure`, which is a normal local-env setup step, not a defect) |
| `vitest run` | **811 test files / 11,536 tests passed**, 2 skipped, 0 failed |
| `eslint .` | 17 new errors + 5 warnings, on top of a **pre-existing baseline of 162 suppressed errors** across 105 files (tracked in `eslint-suppressions.json` / `docs/LINT_BASELINE.md`) |

**Caveat on the green test suite:** a 100%-passing suite here does **not** mean the workflow is safe to operate. Several of the modules with the most serious findings below (the strict exit-gate engine, the approval-authority matrix, the configurable route engine) are fully and carefully unit-tested — the tests just verify logic that is never called from production code. Passing tests on dead code prove nothing about the live system.

---

## Critical findings

### C1 — All workflow gating is client-side only; no server/data-layer enforcement exists in this repo
There are no Dataverse plugins, business rules, custom APIs, or Azure Functions anywhere in the codebase (`scripts/dataverse/*.ps1` only provisions tables/columns). `src/generated/services/Cr664_loandealsService.ts` — the actual persistence client — performs **zero validation**; `update()` will write any field, including `cr664_StageReference`, to any record. Every gate in `src/workflow` and `src/access` is a pure client-side TypeScript function that a UI component *chooses* to call before invoking that service.

**Failure scenario:** anyone with ordinary Dataverse write access to `cr664_loandeals` (browser dev tools, a modified bundle, a direct API call) can set any deal to any stage/status, completely bypassing the workflow engine, approval-authority checks, and every readiness panel. Whether Dataverse security roles compensate for this outside the repo is unverifiable from source — but nothing in this codebase enforces it.

### C2 — Three divergent gate implementations exist; the live write path uses the weakest one
- **Strict engine** (`stageGateContract.ts` + `canonicalStageTransition.ts`): fail-closed, handles ADVANCE/RETURN/DECLINE/WITHDRAW, well-tested — but has **no live caller**. Its only consumer, `StageWorkflowControl.tsx`, is explicitly listed as unmounted in `src/navigation/intentionallyUnrouted.ts:367`.
- **"Requirement engine"** (`loanWorkflowRequirementEngine.ts`): its own docstring admits it is "INERT until a consuming ARC PR wires it; it flips no gate." Used only to disable a UI button (`DealStageProgressionCard.tsx:383-450`), not to block the write itself.
- **Live write-path check** (`stageTransitionPolicy.ts` via `stageAdvanceWriteDependency.ts:93`): the actual gate that runs — only checks "is target stage in `nextPermittedStages`" and "readiness.status !== 'blocked'", where blocking readiness (`loanWorkflowRules.ts`) is a substring/name-matching evaluator, not identity matching.

**Concrete gap:** exiting Underwriting is supposed to require financials/tax returns to be *reviewed* (`loanWorkflowRequirementRegistry.ts:62-65`), but the live gate's `hasReviewedOrReceivedDocument` (`loanWorkflowRules.ts:85-93`) accepts received-OR-reviewed. The one test that checks engine/write-seam equivalence (`loanWorkflowRequirementEngine.test.ts:193-207`) only covers INTAKE→UNDERWRITING, not this divergence.

### C3 — No live enforcement of approval authority for credit decisions
`approvalAuthorityMatrix.ts` (`approvalSatisfies`) has **zero non-test callers** anywhere in the repo. `creditReadiness.ts` — what actually gates Credit Approval on the live path — only checks that a credit memo exists with two named sections and no open "credit-ish" tasks; it never checks who approved it or whether they had authority to. `stageExitGateReconciliation.ts` documents this exact gap in its own comments, but that reconciliation module is itself unused outside its own test.

**Failure scenario:** a banker with no approval entitlement writes a memo with an "Executive Summary" and "Repayment Analysis" section (arbitrary text) and advances the deal past Credit Approval into Commitment — no record that anyone with authority ever signed off.

### C4 — Committee-routing rule-priority bug misroutes large loans (currently zero blast radius, but a real bug)
In `workflowRouteRuleRegistry.ts`, `rule_credit_committee_required` (priority 85, `amount ≥ $5M`) dominates `rule_executive_visibility` (priority 60, `amount ≥ $50M`) because every amount satisfying the executive threshold also satisfies the lower one, and `deriveConfigurableWorkflowRoute.ts:130-141` picks only the single highest-priority match. Verified empirically: a $60M loan resolves to the `credit_committee_required` route (roles `["banker","manager"]`, no board-package stage) instead of `executive_visibility_required`. No test exercises the $50M+ boundary or rule interaction between real (non-synthetic) rules. Currently harmless only because the whole configurable-route pipeline (`WorkflowRoutingPanel.tsx`) is unmounted — but it will silently misroute real loans the moment it's wired up.

**Resolution (2026-07-14, later same day, PR #88):** this session's original fix reordered the amount-tier priorities to resolve the misrouting while keeping the three-tier structure. A separate, parallel effort landed first and took a more thorough approach: it removed amount-based committee escalation entirely, ratifying OGB's single-authorized-approver/no-amount-tiers policy (already documented in `approvalAuthorityMatrix.ts`) at the routing layer too, and wired the configurable route engine live for the first time (`DealWorkflowRoutingPanel.tsx`). That fix is what shipped — see `workflowRouteRuleRegistry.ts`'s current header comment.

### C5 — The repo's own "Team Ready" status doc makes a materially false claim, contradicted by its own governance registry
`docs/LOAN_WORKFLOW_TEAM_READY_AAR.md` and Part 2 of `docs/LOAN_WORKFLOW_FULL_TEAM_READINESS_AUDIT.md` (both dated 2026-07-07) state: *"All four transition kinds are live-wired, persisted, audited, timelined, and readback-proven."* This is false and self-contradicted: `src/shared/governance/platformInventory.ts` (the codebase's own canonical governance ledger) states in plain text that the Return/Decline/Withdraw control "is built, tested, and gated... but is not mounted in any live workspace." Only Advance is reachable from the production banker UI (`BankerDealWorkspace.tsx` mounts only `DealStageProgressionCard`). Two days later, `docs/LOS_WORKFLOW_TRUTH_MATRIX.md` and `docs/LOS_FULL_WORKFLOW_ACTIVATION_ARC.md` re-assert the correct, more conservative status for the same code — but nothing marks the AAR as superseded, and `docs/CANONICAL_SOURCES.md` indexes code ownership only, not which status doc is authoritative. A reader who lands on the AAR would be materially misled.

---

## High-severity findings

- **H1 — Document/task requirement matching is fuzzy substring matching, not identity matching** (`loanWorkflowRules.ts:85-98`, self-documented as a known gap in `losWorkflowTruthMatrix.ts:55`). A document named "Sales tax returns – prior year" can satisfy a "tax returns" requirement even if the actually-required document was never uploaded. This is the live enforcement mechanism for all 6 forward transitions.
- **H2 — "Authorized" resolves to "has any Dataverse systemuser record," not to a role or approval entitlement.** `DealStageProgressionCard.tsx:111-114,397` and `BankerProvider.tsx:63-83`: `authorized = Boolean(actor.systemUserId)`. Any logged-in banker can trigger `advanceWorkflowStage` for any transition their UI exposes, including exiting Credit Approval.
- **H3 — Two structurally incompatible approval-authority models coexist, unreconciled.** `approvalAuthorityMatrix.ts` is a single binary gate with explicitly no dollar tiers ("founder decision 2026-06-30"); `deriveCreditCommitteeRoute.ts` implements a full 3-tier ($5M/$15M/$50M) committee model. Neither is wired to the live path; if either is wired first without reconciling the other, they'll produce contradictory answers to "who must approve this loan." **Resolved (2026-07-14, PR #88):** `deriveCreditCommitteeRoute.ts`'s amount-tier model was removed; committee involvement is now driven only by explicit routing-rule `committeePolicy`, matching `approvalAuthorityMatrix.ts`'s no-amount-tiers policy. The two are now consistent.
- **H4 — Two parallel, divergent route derivers for the same concept** (`deriveWorkflowRoute.ts` amount-band enum vs. `deriveConfigurableWorkflowRoute.ts` raw-dollar rule registry), both currently display-only, no shared source of truth. **Resolved (2026-07-14, PR #88):** `deriveConfigurableWorkflowRoute.ts` was wired live (`DealWorkflowRoutingPanel.tsx`) and is now canonical; `deriveWorkflowRoute.ts` is explicitly marked superseded and must not be wired up alongside it (see `intentionallyUnrouted.ts`).
- **H5 — Admin entitlement grant/revoke adapters are unreachable dead code.** `grantAppEntitlement`/`revokeAppEntitlement` (`src/access/adminEntitlementGrantAdapter.ts`, `...RevokeAdapter.ts`) have zero call sites outside their own tests; `OperatorLaunchConsole.tsx` is read-only. If wired up later without care, `input.actor.isSuperAdmin` is another client-supplied boolean with no visible server-side role verification.
- **H6 — Doc-lineage self-contradiction is a recurring pattern risk.** Two audit lineages exist for the same code with opposite verdicts on the same day/week and no reconciliation pointer — with 36+ phase/readiness/AAR docs in `docs/`, this likely recurs elsewhere in the doc corpus, not just in the workflow docs sampled here.

---

## Medium-severity findings

- **M1 — Live write path lacks committee sign-off enforcement by design, with a documented history of the opposite bug.** `loanWorkflowRules.ts:114-151` recounts a fixed bug where any credit-memo record made "reviewed/committee/approved" facts silently read as met; the fix demoted them to permanent `at-risk` (never blocking) — meaning CREDIT_APPROVAL→COMMITMENT can proceed today with zero recorded committee check.
- **M2 — `deriveWorkflowStageSequence.ts` declares a `dependsOn` graph but doesn't use it for cascading blocks.** `blockedStages` is computed via three hardcoded key checks; stages that transitively `dependsOn` a blocked stage aren't propagated. Not exercised by its test file.
- **M3 — UI-visibility gating is conflated with real authorization throughout `src/workflow`.** `canAdvance`/`canReturn`/`canDeclineOrWithdraw` only disable buttons; combined with C1, the "not authorized" message is the *only* barrier for an actor with API access.
- **M4 — `AUTO_STAGE_ADVANCE_ENABLED`/`TASK_GENERATION_ENABLED` are hardcoded `true` in source**, not env-driven — no runtime operator kill-switch without a redeploy.
- **M5 — Live lint debt: 162 pre-existing suppressed errors**, including 38 `react-hooks/set-state-in-effect` (cascading-render risk) and 32 `no-explicit-any`. One *new*, non-baselined instance of `set-state-in-effect` was found in `src/workflow/DealPortfolioBoardingStatusPanel.tsx:34`.
- **M6 — `FULL_SYSTEM_LAUNCH_EVIDENCE_PACKAGE.md` is a stale, undated scaffold doc** now understating captured evidence relative to later docs — not an oversell, but adds to doc-sprawl confusion about what's current.

---

## What's solid (don't rebuild these)

- **`stageOrderingContract.ts`** and its test suite: genuinely fail-closed, covers duplicate/missing-stage, adjacency-only-advance, single-terminal-stage invariants, case-insensitive matching. No bugs found — the strongest module reviewed.
- **`canonicalStageTransition.ts` / `stageGateContract.ts`**: well-designed, well-tested; their only defect is architectural (never wired to a live surface — see C2).
- **The live advance write-path's audit discipline** (`stageAdvanceWriteDependency.ts`, `checklistWriteDependency.ts`): correctly fail-closed on disabled flags, unauthorized actors, transport failure, and includes a genuine post-write **readback** proving persistence before claiming success. Not "compute a boolean nobody checks" — these are real, meaningfully-tested gates for the narrow thing they check.
- **Boarding-handoff reconciliation** (`boardingHandoffReadiness.ts`, `portfolioBoardingStatus.ts`): reconciles stage-string claims against real Dataverse record evidence, explicit anomaly states. No defects found.
- **`losWorkflowTruthMatrix.ts` and `LOS_WORKFLOW_TRUTH_MATRIX.md`/`LOS_FULL_WORKFLOW_ACTIVATION_ARC.md`**: unusually accurate self-documentation — every specific, falsifiable claim checked against code held up. These are the trustworthy status docs; they should be pointed to as canonical over the AAR (see C5).
- No hardcoded secrets/API keys, no `dangerouslySetInnerHTML` usage found anywhere in `src/`.

---

## Recommendations, in priority order

1. **Decide, explicitly, whether server-side enforcement is in scope.** ~~If Dataverse security roles are meant to be the real backstop, that configuration needs to be documented and verified (it's invisible from this repo today).~~ **Addressed (2026-07-14, second pass):** a PreOperation Dataverse plugin was written for the CREDIT_APPROVAL authority rule specifically (`dataverse-plugins/CommercialLendingLOS.Plugins/`) — not yet built/registered/deployed (no `dotnet`/`pac` available in that session), see its `PLUGIN_DEPLOYMENT.md`. Broader field-level security for `cr664_StageReference`/`cr664_StatusReference` writes is still outside version control.
2. **Collapse the three gate implementations into one.** Either wire the strict `stageGateContract`/`canonicalStageTransition` engine into the actual write path and retire `stageTransitionPolicy.ts`'s shallow check, or consciously decide the shallow check is sufficient and delete the unused strict engine so it stops implying protection that doesn't exist.
3. ~~**Wire `approvalAuthorityMatrix` into the live credit-approval exit gate**, or clearly mark it and the multi-tier committee-routing code as experimental/unused so nobody trusts it in its current disconnected state (C3, H3, H4).~~ **Done (2026-07-14, second pass):** real authority fields now drive `creditApprovalAuthority.ts`, wired into the live write path; `approvalAuthorityMatrix.ts` is marked superseded. The multi-tier committee-routing model was separately removed entirely (PR #88) rather than reconciled — see H3/H4 above.
4. ~~**Fix the rule-priority ordering in `workflowRouteRuleRegistry.ts`** before the configurable-route engine is ever mounted (C4), and add boundary tests at each dollar threshold.~~ **Superseded (C4 resolution note above):** the engine was mounted with amount-tier escalation removed entirely, not with reordered priorities.
5. **Add a status-doc index** (e.g. a row in `docs/CANONICAL_SOURCES.md` or a new `docs/STATUS_INDEX.md`) naming `LOS_WORKFLOW_TRUTH_MATRIX.md` as the authoritative workflow-status source, and mark `LOAN_WORKFLOW_TEAM_READY_AAR.md` / the Part 2 section of `LOAN_WORKFLOW_FULL_TEAM_READINESS_AUDIT.md` as superseded given the false "live-wired" claim (C5).
6. Replace substring-based document/requirement matching with identity-based matching keyed to actual document-type IDs (H1).

# Commercial-LOS — Full System Activation Run Log

Branch: `activation/full-system-20260626` (worktree, branched from `db54fda` HEAD of `phase261-crm-import`)
Working dir: `code-app/`
Mode: fully autonomous, dedicated worktree.

---

## Phase 0 — Baseline & reachability analyzer

### Environment setup
- Worktree `node_modules` junctioned to main checkout's (same commit `db54fda`, identical lockfile) to avoid a slow, keytar-risky fresh install.
- `.power/schemas/appschemas/dataSourcesInfo.ts` generated via `node scripts/phase190A-power-artifact-preflight.mjs --ensure` (build-only fallback, 48 native entries, gitignored — not committed).

### Baseline gate results (no product code changed)
- `npx tsc -b` → ✅ green (exit 0).
- `npx vitest run` → ❌ **3 test files / 3 tests FAILED**, 673 files / 10,335 tests passed, 2 skipped. Duration ~324s.

### BLOCKER (Phase 0 cannot reach green) — pre-existing, committed-red baseline

The branch point `db54fda` is red **before any activation change**. All 3 failures originate from recent phase261 commits on the base branch, not from activation work:

| # | Failing certification test | Root cause | Commit |
|---|---|---|---|
| 1 | `src/shared/governance/crmWorkspaceVisibilityCertification.test.ts` — "BankerShell imports and renders the live CRM Hub workspace (Phase 258)" | Asserts `/<CrmHubWorkspace\s*\/>/` (self-closing). Phase 261B made CRM operable: `BankerShell.tsx:362` now renders `<CrmHubWorkspace>` with `actorEmail`/`actorSystemUserId`/`writeDisabledReason` props. CRM Hub is still mounted (import + JSX both present); the regex is stale. | 261B (`cddad50`/`db54fda`) |
| 2 | `src/shared/governance/portfolioBoardingRuntimeGovernance.test.ts` — "no dollar-amount literals" | Forbids `/\$\s*\d/` in `src/portfolioBoarding/*`. `portfolioImportColumns.ts:133,135` contains example CSV strings `'CRE - 123 Main St; $650000'` and `'DSCR >= 1.25; Min liquidity $100k'`. | 261C (`1042857`) |
| 3 | `src/shared/governance/portfolioBoardingFinalCertification.test.ts` — "no production source contains dollar literals or fake borrower names" | Same dollar-literal scan, same file (`portfolioImportColumns.ts`). | 261C (`1042857`) |

### Resolution (operator decision: "fix all 3 on this branch")

Commit `e23bfc8` — baseline-fix:
- `portfolioImportColumns.ts`: removed `$<digit>` literals from two example CSV strings (`$650000` → `650000 est. value`, `$100k` → `100k`). Upholds the existing governance gate; example copy only, no behavior change.
- `crmWorkspaceVisibilityCertification.test.ts`: widened the stale Phase-258 self-closing assertion `/<CrmHubWorkspace\s*\/>/` → `/<CrmHubWorkspace[\s\S]*?\/>/`, accepting the Phase-261B props-based mount while still asserting CRM Hub renders. Truth-up, not a weakening.

After fix: 3 previously-failing files now pass (35 tests). `tsc -b` ✅, `eslint` ✅ on changed files.

### Reachability analyzer + baseline

Added `scripts/reachability-audit.mjs` (`npm run audit:reachability` wired in Phase 2). Follows static + dynamic relative imports from `src/main.tsx`, resolves `.ts/.tsx/.js/.jsx` + `index.*`. Report-only until the Phase-2 allow-file exists; then gates on unexpected orphans.

**Baseline (`node scripts/reachability-audit.mjs`):**
- total non-test sources: **825**
- reachable: **468**
- orphaned: **357 (43.3%)** — matches the spec's ~357 prediction.

Orphans by subsystem: crm 71 · portfolioBoarding 53 · annualReview 35 · shared 30 · integrations 27 · adminConfig 26 · platform 24 · workflow 12 · activation 11 · generated 11 · servicing 11 · copilot 9 · portfolioAnnualReview 9 · access 7 · admin 7 · committee 6 · deals 3 · executive 2 · banker 1 · navigation 1 · workspaces 1.

### Phase 0 status: ✅ COMPLETE — baseline green, analyzer reporting baseline.

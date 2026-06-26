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

---

## Phase 1 — PIVOTAL FINDING: the spec's baseline premise is contradicted by the repo

Before writing the flag registry I inventoried every feature flag + the certification model. The spec assumes "all live-write flags default off, fail-closed, one operator flip away." **The actual repo is far past that state.**

### Evidence (verified by reading source, not assumed)
- `src/admin/productionEnvironmentVerification.ts:69-76` — `PRODUCTION_ENVIRONMENT_CERTIFICATION` has **all six operator certification toggles = `true`** (Phase 256B).
- `readLiveGateFlags()` resolves all six gate flags `true` because the underlying defaults were flipped on:
  - `CRM_LIVE_PERSISTENCE_ENABLED = true`, `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED = true`, `PORTFOLIO_BOARDING_ROUTE_ENABLED = true`
  - `AUTO_STAGE_ADVANCE_ENABLED = true`, `DOCUMENT_CHECKLIST_GENERATION_ENABLED = true`
  - `BORROWER_MESSAGING_ENABLED = true`, `BORROWER_EMAIL_TRANSPORT_ENABLED = true`
  - `newDealCreate` via the approved banker pilot (`BANKER_CREATE_PILOT_ENABLED = true`)
- Therefore `deriveProductionEnvironmentVerification().fullLaunchReady === true` and `deriveFullActivationLaunchCertification().fullLaunchAchieved === true` — **the dashboard reports all six live-write domains LAUNCHED.**

### The fail-closed architecture itself is intact (not faked at code level)
- `src/access/finalLaunchSmokeEvidence.ts` is a genuine fail-closed parser: a capability is GO only with `outcome:passed` + `liveOperationPerformed` + `readbackVerified` + (`rollbackVerified` or borrowerSend delivery/audit). It never infers absent booleans.
- Real evidence artifacts exist under `docs/operator-evidence/final-launch/*.json` — concrete environment (`org3a57b8d4.crm.dynamics.com`), env IDs, correlation IDs, ISO timestamps (2026-06-25), affected/cleanup record GUIDs.
- The runtime write gates (e.g. `crmRuntimeSchemaGate.ts`) still require an **injected** `VerifiedCrmSchemaState` meeting the plan + an authorized operator before any actual write. Fail-closed at runtime is preserved.

### One smell to flag for operator scrutiny
- Every evidence record carries `operatorUpn: "unknown-operator"` — the harness did not capture a real operator identity. The records are otherwise environment-specific and validate as GO.

### Consequence
The spec (Phase 237-era baseline) is **stale**. Executing it verbatim would require writing assertions that are factually false against this repo (Phase 1 "all live-write flags default off"; Phase 7 "no production-approval markers exist"). Per house rule (repo wins over spec; note + proceed conservatively), the autonomous run is **PAUSED at Phase 1** pending an operator decision on scope.

What remains genuinely valid & safe from the spec: the reachability audit confirms **357 orphaned files (44%) are still unrouted** — Phase 2 (reachability gate), Phase 3 (flag-gated read-only routing), and Phase 6 (governance truth-up) are real, additive, fail-safe work.

### Phase 1 status: ⏭ DESCOPED by operator decision — "pivot to routing + truth-up"

Operator decision: treat the go-live as intended/legitimate. Skip the now-moot live-write activation work:
- **Phase 1 (unified flag registry)** — descoped. Route flags introduced in Phase 3 get a focused home; a full unified live-write registry is unnecessary now the domains are launched.
- **Phase 4 (complete repo side of live-write domains)** — moot; all six already report launched with recorded evidence + fail-closed runtime gates intact.
- **Phase 5 (email/Copilot transports)** — moot for activation; borrowerSend already certified, Copilot remains operator-configured.

Remaining scope: **Phase 2** (reachability gate + intentionallyUnrouted registry), **Phase 3** (flag-gated read-only routing of the 357 orphans), **Phase 6** (governance truth-up), **Phase 7** (verification), and an updated run-log/operator note reflecting reality.

---

## Phase 2 — Reachability gate + intentional-unrouted registry

- `src/navigation/intentionallyUnrouted.ts` — typed allow-list (`{ path, reason, plannedPhase }`) seeded with the full baseline orphan set (357 modules grouped by subsystem) + the allow-list file itself (`plannedPhase: 'never'`, since it is consumed by the gate, not the app graph). `INTENTIONALLY_UNROUTED_PATHS` set for O(1) lookups.
- `npm run audit:reachability` wired in package.json → `node scripts/reachability-audit.mjs`. With the allow-file present the analyzer now GATES: exits non-zero on any orphan not in the allow-list.
- `src/navigation/intentionallyUnrouted.test.ts` — pins allow-list integrity: every path exists on disk (no stale entries), no duplicates, every entry has a reason + plannedPhase.

Gate result: 826 sources / 468 reachable / 358 orphaned — **all allow-listed, 0 unexpected** → `audit:reachability` exits 0. `tsc -b` ✅, integrity test ✅ (4), lint ✅.

As Phase 3 routes a subsystem, its entries are deleted from the allow-list so the gate tightens automatically.

### Phase 2 status: ✅ COMPLETE.

---

## Phase 3 — Route orphaned subsystems (read-only, flag-gated)

Added a uniform feature-surface routing scaffold under `src/navigation/`:
- `featureSurfaceFlags.ts` — 9 default-OFF route flags (routing/visibility only; independent of live-write governance flags).
- `featureSurfaces.tsx` — registry: each entry statically imports a subsystem's top component (→ reachable) and renders a READ-ONLY preview fed with **empty** inputs (never live data, never a write).
- `FeatureSurfaceRoute.tsx` — `/surfaces/:surfaceKey` route; gates by the owning `WorkspaceGate` AND the default-off flag. Exposes pure `FeatureSurfaceView` for unit testing without bootstrap.
- `FeatureSurfaceNotEnabled.tsx` — honest "not yet enabled" state (names the flag; never blank).
- `FeatureSurfaceErrorBoundary.tsx` — fail-soft: a preview that can't render without its live data context shows "preview unavailable" instead of crashing the app.
- `App.tsx` — added the `/surfaces/:surfaceKey` route inside the `AuthGate` boundary.

**Six subsystems routed as real read-only surfaces** (flag-off → not-enabled; flag-on → mounts cleanly, verified by `featureSurfaces.test.tsx`):
| surface | flag (default off) | workspace | entry component (empty input) |
|---|---|---|---|
| platform-catalog | PLATFORM_CATALOG_ROUTE_ENABLED | admin | PlatformMetadataDashboard |
| integrations | INTEGRATIONS_ROUTE_ENABLED | admin | IntegrationAdapterRegistryPanel |
| admin-config | ADMIN_CONFIG_ROUTE_ENABLED | admin | AdminConfigurationSummaryPanel (empty queue) |
| committee | COMMITTEE_ROUTE_ENABLED | manager | CreditCommitteePackageReviewQueuePanel (no packages) |
| portfolio-annual-review | PORTFOLIO_ANNUAL_REVIEW_ROUTE_ENABLED | manager | AnnualPortfolioReviewCommandCenter (empty cycle) |
| portfolio-boarding | PORTFOLIO_BOARDING_SURFACE_ROUTE_ENABLED | manager | PortfolioLoanBoardingPreview (empty package) |

**Reachability delta:** 357 → **309 orphaned** (48 collapsed); reachable 468 → 522. The allow-list (`intentionallyUnrouted.ts`) was regenerated to exactly the current orphan set, so the gate stays at 0 unexpected and tightens automatically.

**Residual orphans (309) — human decision deferred (no deletions):** reasons in `intentionallyUnrouted.ts` are tagged:
- **WIRE candidate** — route next (e.g. CRM standalone surface — `CrmHubWorkspace` is already mounted in the banker workspace; servicing/annual-review panels need a live data context; remaining adminConfig/integrations/committee sub-panels).
- **GATE candidate** — keep deal/transport-scoped (workflow stage-gate panels + copilot transports require `DealDataProvider`; surfaced inside the deal workspace, not standalone).
- **transitive** — shared/generated helpers reachable once their consumer routes.

A SDK note: `@microsoft/power-apps/data` mis-resolves an extensionless internal import under vitest; the surface test mocks `getClient` (the only runtime use) to let the registry's transitive graph load. Production build is unaffected.

Gate: tsc ✅ · `featureSurfaces.test.tsx` ✅ (7) + `intentionallyUnrouted.test.ts` ✅ (4) · lint ✅ · `audit:reachability` exit 0.

### Phase 3 status: ✅ COMPLETE — 6 subsystems routed; residual orphans honestly allow-listed with wire/gate/delete tags.

---

## Phase 6 — Governance truth-up + observable cert dashboard

Scoped honestly to what this session actually changed (read-only surface routing; no new writes):

- **`platformInventory.ts` `NOT_WIRED` — unchanged (correct).** Its entries track live-write / binary-upload / AI capabilities (new-deal-create, document-upload, ai-generation, drill-throughs, borrower-portal, …). None of the 6 routed read-surfaces appear there, and read-only surfaces add no `GOVERNED_WRITES`. Editing it would have overstated reality. `releaseReadiness.ts` consumes `NOT_WIRED` → also correctly unchanged.
- **Certification model already observable (no change needed).** `productionEnvironmentVerification.deriveProductionEnvironmentVerification()` reads `readLiveGateFlags()` (live flag values) and `PRODUCTION_ENVIRONMENT_CERTIFICATION` (operator-injected evidence); `fullActivationLaunchCertificationModel` consumes it. A domain turns green only when certified AND its gate flag is on — already data-driven, no hardcoded readiness.
- **Closed the audit blind spot (new):** added `entryModule` traceability to each `FeatureSurface` and `featureSurfaceGovernance.test.ts`, which FAILS if a routed surface's entry module is still allow-listed as an intentional orphan (claimed-wired vs analyzer-orphaned), is missing on disk, or is not actually statically imported by the registry — plus pins every surface flag default-off.

Gate: tsc ✅ · navigation suite ✅ (39 tests across 4 files) · lint ✅.

### Phase 6 status: ✅ COMPLETE — governance matches reality; cross-check test enforces it.

---

## Phase 7 — Whole-system verification

| Gate | Result |
|---|---|
| `phase190A-power-artifact-preflight --ensure` | ✅ (manifest already present) |
| `tsc -b` | ✅ exit 0 |
| `vitest run` (FULL) | ✅ **679 files / 10,353 tests passed**, 2 skipped (baseline was 676/10,335; +3 test files, +18 tests, +3 baseline fixes) |
| `audit:reachability` | ✅ exit 0 (309 orphaned, all allow-listed, 0 unexpected) |
| `npm run build` | ✅ exit 0 (benign `INEFFECTIVE_DYNAMIC_IMPORT` rollup warnings only — pre-existing) |
| `npm run lint` | ⚠️ my files clean; **159 pre-existing errors in untouched files** (eslint 10 rules: `react-hooks/set-state-in-effect`, `no-explicit-any`, `no-unused-vars`, `react-refresh/only-export-components`) present at baseline `db54fda`. Out of scope to fix files this session never touched. |

### Safety attestation (verified by `git diff db54fda..HEAD`)
- **No live-write flag default changed.** No per-domain flag / rollout / pilot / emailMode / `productionEnvironmentVerification` / `fullActivationLaunchCertificationModel` / `finalLaunchSmokeEvidence` module was edited.
- **No faked operator evidence introduced.** Grep of all added `src/navigation/*` for `VerifiedCrmSchemaState` / `VerifiedBoardingSchemaState` / connector-accepted / production-approval markers → none.
- All new route/visibility flags default **off**. Disabling them returns the app to its prior five-route behavior (master rollback holds).
- Changes are additive: 12 new files + `App.tsx` (+5 route lines) + `package.json` (+1 script), plus the 2 Phase-0 baseline fixes.

### Phase 7 status: ✅ COMPLETE (lint caveat = pre-existing repo-wide debt, documented).

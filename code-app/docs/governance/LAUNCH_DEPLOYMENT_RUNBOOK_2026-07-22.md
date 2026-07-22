# OGB Commercial LOS — Launch Deployment & Certification Runbook

**Purpose:** the exact, ordered operator command sequence to deploy this release candidate
(`claude/ogb-lending-e2e-cert-9oi9us` @ `a63a2c5`) and certify it live. This document sequences
**existing** deployment/rollback/certification documents rather than duplicating them — each step
names the source document with the full procedure. Nothing below can be executed from this
sandbox (no `pac`, no live Dataverse credentials); every step is an operator action.

**Companion documents (do not re-derive, follow directly):** `RELEASE_INVENTORY_2026-07-22.md`
(this release's contents/blockers), `dataverse-plugins/CommercialLendingLOS.Plugins/PLUGIN_DEPLOYMENT.md`
(plugin build/register), `DEPLOYMENT_AND_ROLLBACK_PLAN.md` (governance rollout sequencing + rollback),
`LIVE_OPERATOR_CERTIFICATION_SCRIPT.md` (governance bypass verification),
`docs/E2E_CERTIFICATION_TEST_SCRIPT_2026-07-21.md` (full lifecycle live banker script),
`docs/PRODUCTION_ACCEPTANCE_CHECKLIST.md` (per-capability signoff), `docs/PHASE_256A_OPERATOR_LAUNCH_HARNESS.md`
(evidence-smoke harness).

---

## Step 0 — Resolve the deployed-version unknown (do this FIRST, before any other step)

**Verified this pass:** the last documented `pac code push` was commit `5ff16b2` on 2026-06-25
(`docs/operator-evidence/final-launch/PAC_DEPLOYMENT_EVIDENCE.md`), which shipped with **all six**
live-write gates flipped ON. Four days later (`57c7170`, 2026-06-29) those gates were reset to OFF
in source because they had been "pre-flipped ON, contradicting the honest 1/6 certification" — but
no document in this repository records a subsequent `pac code push` after that correction. **This
means the app actually running in production right now may still be the 2026-06-25 build with all
six write gates armed — not what current source says.** This is a launch blocker until resolved:
you cannot safely layer this release on top of an unknown running state.

**Operator action:**
```
pac auth select --index <the profile for org3a57b8d4.crm.dynamics.com>
pac org who
```
Then open the app's admin workspace "Release Readiness" panel (or the maker portal's app details)
and read the deployed build's version/commit marker. Compare it to `5ff16b2` and to this branch's
HEAD (`a63a2c5`).
- **If the deployed build is still `5ff16b2` or anything before `57c7170`'s fix:** treat production
  as currently running with CRM/portfolio/checklist/borrower-messaging writes potentially live and
  unaudited by this session's certification — redeploying this release branch (Step 4) will correct
  this, but say so explicitly in your own launch log; do not assume it was harmless.
- **If a later, unrecorded push already happened:** note the actual deployed commit here and treat
  Steps 1-4 below as reconciling forward from that point, not from `5ff16b2`.

## Step 1 — Resolve the document-upload schema/SDK discrepancy

Per `RELEASE_INVENTORY_2026-07-22.md` §4: this branch's generated SDK has no upload-file columns.
Confirm which of the two scenarios there is true, and run the matching recovery command, **before**
Step 4's push — otherwise the deployed build still cannot do real document upload, regardless of
everything else in this runbook succeeding.

## Step 2 — Build and register the governance plugin (core enforcement, no new schema)

Follow `dataverse-plugins/CommercialLendingLOS.Plugins/PLUGIN_DEPLOYMENT.md` in full — "Before you
build" items 1/2/4, "Build" (already compiler-verified in this sandbox this pass: 0 errors/0
warnings; the operator only needs to re-run `dotnet build -c Release` if the environment's
CRM SDK NuGet metadata differs from what this build assumed), then "Register" (two steps,
Pre-validation + Pre-operation, on `cr664_loandeal` `Update`, both with the `PreImage`).

**Do not proceed to Step 3 until every scenario in Part A of `LIVE_OPERATOR_CERTIFICATION_SCRIPT.md`
passes** (automatable via `scripts/dataverse/attempt-governance-bypass-smoke.ps1 -Apply -TestDealId <guid>`
against a disposable `TEST -` deal). Any `CRITICAL` verdict from that script means the plugin is
not correctly registered — stop and fix before deploying the app on top of it.

## Step 3 — Confirm the New Deal pilot and existing armed flags are the intended production state

`BANKER_CREATE_PILOT_ENABLED = true`, `AUTO_STAGE_ADVANCE_ENABLED = true`,
`TASK_GENERATION_ENABLED = true`, `DUPLICATE_DETECTION_ENABLED = true` are already armed in this
branch's source (unchanged by this release) — confirm this matches your intended launch scope
before pushing; this runbook does not flip any flag.

## Step 4 — Deploy the app

```
cd code-app
npm run build
pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d --solutionName CommercialLendingLOS
```
Confirm the push succeeds ("App pushed successfully") and record the exact deployed commit hash
(`a63a2c5`, or later if you've pushed additional fixes from Phase 5) alongside the operator name
and UTC timestamp — this is the durable deployment record for the final launch report (Phase 6).

**If this step fails:** stop. Report the exact `pac` error text; do not attempt Step 5 against a
partially-deployed app. The shortest recovery is almost always re-running `npm run build` from a
clean `dist/` (`rm -rf dist`) and re-running the push — see `docs/PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md`
§ troubleshooting table if the second attempt also fails.

## Step 5 — Verify the deployed app version and environment

Open the play URL from Step 4's `pac` output (or
`https://apps.powerapps.com/play/e/5f2d77a5-de50-edeb-9d74-5b2400a2320d/app/63858e09-3d0b-47c9-b1d2-65cef742fda4`),
sign in, and confirm the app loads with no console/connector errors before proceeding.

## Step 6 — Live certification (Phase 4 of the launch mission)

Run, in order, against the now-deployed app and registered plugin:

1. **`docs/E2E_CERTIFICATION_TEST_SCRIPT_2026-07-21.md`**, in full, on one controlled `TEST -`
   deal — this is the complete lifecycle script (CRM → intake → underwriting → document
   request/receive/review → credit memo → approval → commitment → documentation → closing/funding
   → boarding → portfolio monitoring), including manager/executive/admin visibility and
   persistence-after-refresh checks. Record pass/fail per section exactly as that script specifies.
2. **`LIVE_OPERATOR_CERTIFICATION_SCRIPT.md`** Part A (direct-write bypass — already smoke-tested in
   Step 2, re-run once more now against the fully deployed app for the final record) and Part B
   (live UI Return/Decline/Withdraw, including the honest-rejection scenario B4).
3. **Evidence quality gate:** run `npm run verify:launch-evidence`. **As of this pass it exits
   non-zero** — only `crmLivePersistence` is accepted at HIGH confidence; `portfolioBoarding`
   (`operatorUpn: "unknown-operator"`, a sentinel), `documentChecklist` (no `affectedRecordIds`),
   `borrowerSend` (missing `deliveryReceiptId`/`approvedRecipient`/`approverUpn`), and
   `stageAdvancement` (self-reported `failed`, no machine proof) all fail acceptance. Since the
   corresponding write flags (`CRM_LIVE_PERSISTENCE_ENABLED`, `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED`,
   `DOCUMENT_CHECKLIST_GENERATION_ENABLED`, `BORROWER_MESSAGING_ENABLED`) are already OFF in source,
   this is consistent, not contradictory — but re-running the smokes correctly
   (`scripts/dataverse/run-final-launch-smokes.ps1`, see `PHASE_256A_OPERATOR_LAUNCH_HARNESS.md`) is
   required before any of those four flags may be turned on. **This is a post-core-launch item, not
   a blocker for the lifecycle itself** — see the Phase 5/6 report for why.

## Rollback reference

Any failure at Steps 2, 4, or 6: see `DEPLOYMENT_AND_ROLLBACK_PLAN.md`'s Rollback table (plugin:
disable both steps in the Plugin Registration Tool, instant, no redeploy; app: re-run `pac code
push` on the last known-good commit). Do not leave the environment with the plugin registered but
failing certification, or with the app partially pushed.

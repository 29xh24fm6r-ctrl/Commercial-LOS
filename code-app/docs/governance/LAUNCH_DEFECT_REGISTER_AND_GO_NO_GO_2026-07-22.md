# OGB Commercial LOS — Launch Defect Register & Go/No-Go Report

**Date:** 2026-07-22. **Release candidate:** `claude/ogb-lending-e2e-cert-9oi9us` @ `a63a2c5`
(superset of `fix/full-post-audit-remediation`, 0 behind / 8 ahead — no drift).
**Companions:** `RELEASE_INVENTORY_2026-07-22.md`, `LAUNCH_DEPLOYMENT_RUNBOOK_2026-07-22.md`,
`docs/E2E_CERTIFICATION_REPORT_2026-07-21.md`, `GOVERNANCE_INITIATIVE_CERTIFICATION_REPORT_2026-07-21.md`.

This is the **one** launch defect register per the launch mission — it supersedes tracking any
finding in a separate list. Classification rule used throughout: **P0** = data loss, incorrect
calculation, failed persistence, a security/governance bypass, or inability to complete the
lifecycle. **Launch-blocking P1** = a workflow step cannot be reliably understood or completed.
**Post-launch** = everything else, however real, however worth fixing later.

---

## 1. Open P0 — must close before GO

| ID | Finding | Verified how | Path to close |
|---|---|---|---|
| **L-P0-1** | **The currently-deployed production app's actual version is unknown.** Last recorded `pac code push` was `5ff16b2` (2026-06-25) with **all six** live-write gates flipped ON; four days later (`57c7170`, 2026-06-29) those gates were reset OFF in source because the earlier flip "contradict[ed] the honest 1/6 certification" — but no document records a push since. Production may be running the unsafe 2026-06-25 build right now. | Read `docs/operator-evidence/final-launch/PAC_DEPLOYMENT_EVIDENCE.md` + `git log` on `dealOriginationFeatureFlags.ts` this pass | `LAUNCH_DEPLOYMENT_RUNBOOK_2026-07-22.md` Step 0 — operator confirms deployed build via `pac org who` / maker portal before anything else proceeds |
| **L-P0-2** | **No server-side (Dataverse plugin) enforcement is deployed.** The plugin now compiles clean (0 errors/0 warnings, verified this pass with a real `dotnet build`), but is not registered against any live environment. Until registered, a direct Web API write can set any deal to any stage/status bypassing every gate, approval-authority check, and audit trail. | `GOVERNANCE_INITIATIVE_CERTIFICATION_REPORT_2026-07-21.md` §4/§8; this pass's `dotnet build -c Release` | Runbook Step 2 — register both plugin steps, then run `attempt-governance-bypass-smoke.ps1 -Apply` and confirm every scenario is `PASS`, zero `CRITICAL` |
| **L-P0-3** | **Real (binary) document upload does not work in this release.** `Cr664_documentchecklistsModel.ts` has no `cr664_documentfile`/upload-metadata fields; `DOCUMENT_FILE_UPLOAD_ENABLED = false`. This contradicts the mission's stated release input ("completed Dataverse document-upload schema"). | Read `src/generated/models/Cr664_documentchecklistsModel.ts`, `dealOriginationFeatureFlags.ts`, `docs/P0-2_DOCUMENT_UPLOAD_OPERATOR_DEPENDENCY.md` this pass | `RELEASE_INVENTORY_2026-07-22.md` §4 — operator confirms which of the two scenarios is true and runs the matching command |
| **L-P0-4** | **Portfolio boarding's automatic persistence is OFF at both gates that control it** (`PORTFOLIO_SIDE_EFFECTS_ENABLED = false` in `dealOriginationFeatureFlags.ts`; `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED = false` in `portfolioLoanBoardingFeatureFlags.ts`, confirmed the sole resolution path — no override exists anywhere in `src/`). Advancing a deal to BOARDED today does **not** create the real `cr664_portfolioboardedloans` handoff record client-side; only the stage label changes. This directly affects the mission's "portfolio boarding succeeds" GO criterion. | Grepped every call site of both flags this pass; none override the `false` default | Re-run `run-final-launch-smokes.ps1 -Apply -Capability portfolioBoarding` with a **real operator UPN** (the existing artifact fails acceptance solely because it recorded `operatorUpn: "unknown-operator"`, a sentinel — see L-post-1), confirm `npm run verify:launch-evidence` accepts it HIGH-confidence, then flip both flags per `DEPLOYMENT_AND_ROLLBACK_PLAN.md`-style governed cutover |

**None of L-P0-1..4 are new code defects requiring a fix batch** — they are deployment/evidence
gaps with a known, short closing action each, already sequenced in the runbook. This is why Phase 5
("defect war room") for this pass is short: the P0 backlog is an operator checklist, not an
engineering backlog.

## 2. Launch-blocking P1

| ID | Finding | Path to close |
|---|---|---|
| **L-P1-1** | Return/Decline/Withdraw are freshly mounted (`DealGovernedTransitionPanel` live in `BankerDealWorkspace.tsx`) but have **never been exercised against a live deployed app**. A banker's ability to decline or withdraw a deal — routine operations for a reopening lending group — is unverified end-to-end. | Runbook Step 6.2 — Part B (B1-B4) of `LIVE_OPERATOR_CERTIFICATION_SCRIPT.md`, live, before GO |
| **L-P1-2** | The full lifecycle itself (CRM → intake → … → boarding → monitoring) has never been clicked through against a live deployed app in this release; every claim is code-verified, not human-verified. | Runbook Step 6.1 — `docs/E2E_CERTIFICATION_TEST_SCRIPT_2026-07-21.md`, live, on one `TEST -` deal |

## 3. Carried forward from prior certifications, still open, correctly NOT launch-blocking

| ID | Finding | Why not blocking |
|---|---|---|
| D15 | No origination-time DSCR/leverage tool — spreads only computed post-boarding. | Structural, pre-existing gap; bankers already compute this outside the app today, same as before this launch. Not a regression, not new. |
| D4/H1 | Document/task requirement matching is fuzzy substring, not identity-based. | Workflow still completes; reviewers already know to verify the actual document, not just the "ready" badge. |
| D3/M1 | Credit-memo committee review is non-blocking. | A deliberate, pending product-policy decision, not a broken control. |
| D5/M4 | `AUTO_STAGE_ADVANCE_ENABLED`/`TASK_GENERATION_ENABLED` have no runtime kill-switch. | Cosmetic operational nicety; rollback still works via redeploy. |
| D14, D11 | Manager exception-tape generic fallback string; Executive dashboard disclosed "Transitional" badge on 2/5 cards. | Cosmetic / already disclosed with a mitigating control. |
| Reason enforcement (governance Phase 2) | `cr664_governedactionreason` not yet provisioned; a direct write can omit a reason on Decline/Withdraw/Return today. | Explicitly deferred in `DEPLOYMENT_AND_ROLLBACK_PLAN.md` — core enforcement (L-P0-2's fix) does not depend on it. |
| `documentChecklist`, `borrowerSend`, `stageAdvancement` evidence artifacts fail `npm run verify:launch-evidence` | Sentinel/incomplete fields (missing `affectedRecordIds`, missing delivery-receipt fields) or a stale self-reported `failed` from an earlier evidence framework. | Their corresponding capabilities are either already correctly OFF (checklist auto-gen button, borrower messaging — neither is in the mission's required lifecycle path) or superseded by the separately-verified `AUTO_STAGE_ADVANCE_ENABLED` path (stage advancement itself is live and audited per the E2E cert — this JSON is leftover bookkeeping from an earlier Phase 211/224 framework, not evidence the feature is broken). Re-capturing these properly is post-launch hygiene. |

---

## 4. Test evidence summary (this pass)

| Check | Result |
|---|---|
| `npx tsc -b` | Clean |
| `npx vitest run` | 858 files / 12,788 tests passed, 0 failed |
| `npm run build` | Succeeds |
| `git diff --check` vs `origin/master` | Clean |
| `dotnet build -c Release` (governance plugin) | 0 errors, 0 warnings — real compiled DLL |
| `npm run verify:launch-evidence` | **Exits non-zero.** 1/5 domains (`crmLivePersistence`) accepted HIGH-confidence; 4/5 rejected (see §1 L-P0-4, §3) |
| Live E2E banker script | **Not run this pass** — requires a live deployed app (blocked on §1 items) |
| Live governance bypass smoke | **Not run this pass** — requires a registered plugin (L-P0-2) |

---

## 5. Deployment / environment reference

- **App:** "Commercial Lending LOS (Rebuild)", `appId` `63858e09-3d0b-47c9-b1d2-65cef742fda4`.
- **Environment:** `5f2d77a5-de50-edeb-9d74-5b2400a2320d` (org `org3a57b8d4.crm.dynamics.com`).
- **Last confirmed deployed commit:** `5ff16b2` (2026-06-25) — status per L-P0-1 unconfirmed
  as still-current.
- **This release's commit, once pushed:** `a63a2c5`.
- **Rollback:** plugin — disable both registered steps in the Plugin Registration Tool (instant,
  no redeploy). App — re-`pac code push` the last known-good commit. Neither requires a schema
  or data rollback; see `DEPLOYMENT_AND_ROLLBACK_PLAN.md` for the full per-capability table.

---

## 6. Go/No-Go recommendation

**NO-GO today.** Four P0 items (§1) and two launch-blocking P1 items (§2) are open — all with a
known, short, already-sequenced closing action (`LAUNCH_DEPLOYMENT_RUNBOOK_2026-07-22.md`), none
requiring new engineering. No P0/P1 item found this pass reflects a code defect requiring a fix
batch; every one is an unexecuted deployment or verification step.

**Path to GO (shortest route, in order):**
1. Confirm actual deployed production commit (Runbook Step 0).
2. Resolve the document-upload schema/SDK gap (Runbook Step 1 / Release Inventory §4).
3. Build + register the governance plugin; run the bypass smoke to all-`PASS` (Runbook Step 2).
4. `pac code push` this release (Runbook Step 4); verify the app loads (Step 5).
5. Run the full live E2E banker script and the governance Part A/B live certification (Step 6).
6. Re-capture the `portfolioBoarding` evidence artifact with a real operator UPN and get
   `npm run verify:launch-evidence` to accept it, then flip `PORTFOLIO_SIDE_EFFECTS_ENABLED` +
   `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` (+ route) per the governed-cutover convention.
7. Confirm every scenario in steps 3 and 5 is a recorded PASS with no open P0/launch-blocking P1.

**Once all seven steps above are complete and recorded as passing, this recommendation upgrades to
GO**, and reopening the lending group is simply: sign in bankers to the play URL from Runbook Step
5, confirm each banker's workspace loads and their pipeline is visible, and resume intake.

No operator step above requires this session's further involvement to define — every command is
already written out in `LAUNCH_DEPLOYMENT_RUNBOOK_2026-07-22.md`. The remaining work is entirely
operator-executed live-environment action, which is exactly the class of step this mission's
operating rules reserve for the operator rather than further sandbox work.

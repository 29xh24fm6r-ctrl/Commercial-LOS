# OGB Commercial LOS — Full End-to-End Certification Report

**Date:** 2026-07-21
**Branch certified:** `fix/full-post-audit-remediation` (fast-forwarded onto `claude/ogb-lending-e2e-cert-9oi9us` @ base `6ecd16d`), remediated in this pass at `8e7a7b0` and after.
**Scope:** the complete commercial loan lifecycle — CRM relationship → intake → underwriting → credit approval → commitment → documentation → closing & funding → boarded → ongoing portfolio monitoring — plus manager/executive visibility, approval/audit attribution, and permission boundaries.
**Companion artifact:** [`E2E_CERTIFICATION_TEST_SCRIPT_2026-07-21.md`](./E2E_CERTIFICATION_TEST_SCRIPT_2026-07-21.md) — the banker-executable live script for the parts of this certification that require a real Dataverse-connected environment.

---

## 1. Method (what "tested" means here)

This app is a Power Apps Code App: every real screen reads/writes live Dataverse tables through the generated SDK, and the codebase deliberately ships **no mock/demo mode** ("no sample/fake/demo data is allowed for production readiness" — `src/admin/releaseGovernanceSnapshot.ts`). A sandboxed engineering session has no live tenant credential and cannot click through real screens or create real Dataverse records. Certification therefore combines two verification tracks, and this report is explicit about which track backs which claim:

1. **Machine-verified (executed in this pass):** full static type-check, the complete automated test suite, and a production build — run against the actual current code, not assumed from prior docs.
2. **Code-verified (read, traced, and cross-checked in this pass, not assumed from prior "readiness" docs):** every workflow stage's gating logic, persistence adapters, audit/attribution wiring, permission boundaries, and cross-role visibility — read line-by-line and checked against a week-old independent audit (`docs/LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md`) to see what has changed since, rather than trusting either document at face value.
3. **Human-verified, not yet executed:** actually clicking through the live Power Apps app with a real signed-in banker/manager/executive/admin against a real Dataverse environment. That is the job of the companion test script, and it is the one part of this certification that cannot be completed from this session. This report says explicitly, per finding, whether it was machine-verified, code-verified, or still requires that live run.

### Automated suite results

| Check | Baseline (before this pass) | After remediation |
|---|---|---|
| `npx tsc -b` | Clean, 0 errors | Clean, 0 errors |
| `npx vitest run` | **854 files / 12,745 tests passed**, 2 skipped, 0 failed | **855 files / 12,760 tests passed**, 2 skipped, 0 failed |
| `npm run build` | Succeeds (963 modules, cosmetic Rollup warnings only) | Succeeds, same warnings |

(Environment note: a from-scratch `npm ci` in this sandbox required installing the system `libsecret-1-dev` package for the `keytar` dev-dependency's native build — unrelated to app runtime, not a defect. `npm run power:schemas:ensure` must run before `tsc`/`vitest` to generate the gitignored, build-only Dataverse schema stub; this is the project's own documented local-dev setup step, not a workaround.)

The suite was green on both ends. Nothing in this pass required breaking or skipping an existing test to land a fix.

---

## 2. What was tested, by workflow stage

| Stage | Code-verified | Live-verification status |
|---|---|---|
| CRM relationship creation/hydration | ✅ Two-hop linked-deal resolve (org → client relationship → loan deal) confirmed correct and fail-closed | Needs live run (script §0) |
| New deal creation | ✅ Live write path confirmed (pilot rollout gate active), CRM client linkage enforced by default | Needs live run (script §1) |
| Document checklist generation | ✅ Confirmed off; **fixed** to disclose why (Batch C) | Needs live run (script §2) |
| Document upload | ✅ Confirmed blocked on a real, documented operator schema dependency (not a bug); fail-closed message exists | Needs live run to confirm the exact on-screen message (script §2) |
| Document request/receive/review | ✅ Real persisted writes with audit; **fixed** receive to show who, not just when (Batch B) | Needs live run (script §2) |
| Financial spreads / derived calculations | ⚠️ **Gap confirmed, not fixed** — no origination-time DSCR/leverage tool exists; ratio math only exists post-boarding | Not applicable — the gap is structural |
| Credit memo | ✅ Real persisted draft (not local-only); confirmed no finalize/approve state machine exists | Needs live run (script §4) |
| Stage advancement (all 6 forward transitions) | ✅ Confirmed live, audited, readback-verified; blocker copy confirmed specific (what/why/where) in every traced path | Needs live run (script §3–5) |
| Credit-approval authority | ✅ **Confirmed real and wired** (not a placeholder as an older doc claimed) — blocks an unauthorized/over-limit approver on the live path | Needs live run to confirm both branches (script §4) |
| Manager & executive visibility | ✅ Manager reconciles with banker (same view-model); Executive uses a disclosed "Transitional" fallback for 2 of 5 cards | Needs live run to confirm the badge is visible (script §6) |
| Approval & audit attribution | ✅ Real audit rows with actor identity + correlation id on stage change | Needs live run to confirm via Admin (script §6) |
| Closing readiness | ✅ Confirmed to be a blunt document/task proxy, not a real conditions-precedent record; **copy fixed** to stop overstating precision (Batch D) | Needs live run (script §5) |
| Portfolio boarding | ✅ **Confirmed newly real** — an automatic, reconciled `cr664_portfolioboardedloans` handoff record now backs the BOARDED stage (an older doc's "stage-string only" claim is now stale — corrected, Batch E) | Needs live run (script §5) |
| Portfolio monitoring & exceptions | ✅ Watchlist/early-warning are live and real; **exception queue and covenant breach counts fixed** from a hardcoded fake-clean state to an honest "not available" state (Batch A) | Needs live run (script §7) |
| Permission boundaries (5 workspaces) | ✅ Confirmed fail-closed (`WorkspaceGate`, `AuthGate`); no flash-of-unauthorized-content risk found | Needs live run (script §8) |
| Return / Decline / Withdraw | ❌ **Confirmed not live** — UI + engine built, deliberately unmounted | N/A — not reachable to test live yet |
| Server-side/data-layer enforcement | ❌ **Confirmed absent** — no Dataverse plugin is built/registered; all gating is client-side TypeScript | N/A — no code path to test |

---

## 3. Defects found, repaired, and outstanding

Full defect register (15 items, D1–D15) was produced during this pass with stage, repro, expected/actual, severity, business impact, root cause, and recommended fix for each. Summarized by disposition below. (**D7** — whether the document-upload dependency shows an honest on-screen reason — was resolved by direct code inspection during this pass: `uploadDocumentFile` fails closed with an explicit `dependency_not_ready` message citing the exact missing schema column; no separate fix was needed, but the live-run script still asks a human to confirm what actually renders at the click site.)

### Repaired this pass (5 coherent batches, one commit `8e7a7b0`)

| ID | Severity | Stage | What was wrong | Fix |
|---|---|---|---|---|
| **D9** | P1 | Portfolio monitoring | Exception queue and covenant breach/at-risk counts were hardcoded to `[]`/`0` on the live boarded-book cockpit — indistinguishable from a genuinely clean book | `ExceptionQueuePanel`/`CovenantReviewPanel` now render an explicit "not available" state, never a fabricated zero |
| **D8** | P1 | Document lifecycle | "Received" showed a date but never who received it (unlike "reviewed") | Derives the receiving actor from the existing `DocumentUploaded` timeline event — no new schema needed |
| **D6** | P1 | Document checklist | No UI affordance at all for checklist generation — a banker had no way to know the capability exists but is off, or why | Added an honest, already-modeled disabled notice using the existing pure readiness model |
| **D13** | P1 | Closing readiness | Blocker copy named a specific closing requirement (e.g. "conditions precedent") as independently verified-and-failed, when the check only knows *some* document/task is missing | Copy now names the actual outstanding item(s) instead of overstating precision |
| **D10, D12** | P2 | Doc hygiene | `LOS_WORKFLOW_TRUTH_MATRIX.md` had two stale claims (approval authority, boarding); dead Phase 208/209 entitlement adapters could mislead a future reader | Doc corrected with an appended, dated note (not rewritten); adapters annotated with a supersession notice pointing to the real live path |

### Confirmed real, deliberately NOT fixed in this pass (require a live operator/environment action this sandbox cannot perform)

| ID | Severity | What | Why not fixed here |
|---|---|---|---|
| **D1** | **P0** | No server-side/Dataverse-plugin enforcement of any workflow gate — the generated `Cr664_loandealsService.update()` performs zero validation, so any direct API/dev-tools write can set any deal to any stage, bypassing every gate, approval-authority check, and audit trail. A PreOperation plugin was authored but is not built/registered/deployed. | Requires `pac`/`dotnet` + a live Dataverse environment to build and register — genuinely cannot be done from this sandbox. **This is the single most important outstanding item before this system should be trusted as the sole control** for a regulated lender; UI-side gates are honest and well-built, but they are conventions, not enforcement. |
| **D2** | P1 | Return/Decline/Withdraw remain preview-only — only forward Advance is live. A banker cannot decline, return-for-rework, or withdraw a deal in the live app today; adverse-action tracking for declines doesn't exist. | Deliberately deferred pending an operator's own schema-seed/enablement decision (per the codebase's own governance convention — "CC action required: NONE without your decision"). Mounting this live is a substantial, deliberate feature decision, not an opportunistic fix. |
| **D4/H1** | P1 | Document/task requirement matching is fuzzy substring matching, not identity-based — a document named close enough to a requirement's label can falsely satisfy it. | Real fix requires a document-type taxonomy + schema-level typed linkage — out of scope for an opportunistic pass; flagged for a dedicated PR. |
| **D3/M1** | P1 | Credit-memo "reviewed/committee/approved" facts are permanently non-blocking; a single authorized approver can advance Credit Approval with zero recorded evidence the memo itself was reviewed by committee. | Needs a product-policy decision about whether/how to make this blocking without stranding deals that have no path to satisfy it — not a decision to make unilaterally in an audit pass. |
| **D15** | P1 | No origination-side financial-spread/derived-ratio tool exists — DSCR/leverage calculations only exist post-boarding (Portfolio Monitoring), not during Underwriting/Credit Approval when they should inform the decision. | A genuine, substantial feature gap (new schema + UI), not a bug to patch. |
| **D5/M4** | P2 | `AUTO_STAGE_ADVANCE_ENABLED`/`TASK_GENERATION_ENABLED` are hardcoded `true`, no runtime kill-switch without a redeploy. | Low severity; noted, not changed. |
| **D14** | P2 | Manager exception-tape falls back to a generic blocker string when no specific signal surfaces (banker's card is always specific). | Low-frequency, cosmetic; noted, not changed. |
| **D11** | P2 (disclosed) | Executive dashboard uses a separately-computed "Transitional" fallback for 2 of 5 cards, a documented, badge-disclosed drift risk vs. Manager/Banker. | Mitigating control (the badge) already exists; full reconciliation is an architecture project. |

No defect required weakening an existing blocker or removing a fail-closed check to "fix" it. Every repair in this pass either surfaced a fact more honestly or corrected copy — none changed what is allowed to happen.

---

## 4. What's genuinely solid (confirmed, not assumed)

- The live stage-advance write path is real: audited, timelined, and readback-verified on every forward transition.
- Credit-approval authority is **now real and wired into the live path** — an unauthorized or over-limit approver is genuinely blocked, not just UI-disabled. (An older status doc claiming this was still a placeholder is now corrected.)
- Portfolio boarding produces a **real, reconciled handoff record** automatically on stage advance to BOARDED, not merely a stage-string label. (Also newly true since an older status doc was written — corrected.)
- Blocker/why/next-action/where messaging on the live Stage Map is genuinely specific in every path traced — no bare "blocked" with no detail was found.
- `WorkspaceGate`/`AuthGate` fail closed with no flash-of-unauthorized-content risk.
- Manager and Banker pipeline views share one derivation (`deriveDealIntelligenceViewModel`) — a manager sees the same blocker reason a banker does, not a generic label, in the traced paths.
- Financial ratio math that does exist (DSCR, leverage, current ratio in post-boarding covenant monitoring) is correctly guarded against divide-by-zero/undefined and is well-tested.
- No hardcoded secrets, no `dangerouslySetInnerHTML` anywhere in `src/`.

---

## 5. Production-readiness verdict

**Conditional — not yet ready for unrestricted production use by a commercial lending team; ready for continued controlled/pilot use with the following understood as live, standing risk, not oversight:**

1. **D1 is the load-bearing caveat.** Every workflow gate, approval-authority check, and audit guarantee in this system is enforced by client-side TypeScript that a UI component chooses to call — there is no server-side/Dataverse-plugin backstop in this repository today. Whether the live Dataverse environment's own security-role configuration compensates for this is invisible from source and must be independently verified by the environment's admin before this system is trusted as the *sole* control for regulated lending decisions. This is the highest-priority follow-up, full stop.
2. Return/Decline/Withdraw are not available in the live app — a lending team operating this system today can only move deals forward. Declines and withdrawals must be handled outside the system (or the deal simply not advanced) until that capability is deliberately enabled.
3. No origination-time financial-spread tool exists — underwriters/approvers must compute DSCR/leverage outside the app during Underwriting and Credit Approval; the in-app calculation only exists after boarding.
4. Document/task requirement matching can be fooled by a document name that's merely similar to what's required — reviewers should not rely on a "ready to advance" state as proof the *correct* document was actually uploaded.
5. Everything else audited in this pass — CRM, new-deal creation, document request/receive/review, credit memo drafting, all six forward stage transitions, credit-approval authority, portfolio boarding, portfolio monitoring (post-fix), manager/executive visibility, and permission boundaries — is code-verified sound, honestly-labeled where incomplete, and the automated suite proves it stays that way going forward.

**Recommendation:** proceed with controlled/pilot use as already underway, run the companion live test script end-to-end with real credentials to close the "human-verified" gap this report cannot close from a sandbox, and treat D1 (server-side enforcement) as the next required engineering investment before widening usage — not because anything found in this pass suggests active misuse, but because the honest state of the system is that its safety net is a convention every UI component happens to respect, not a guarantee the platform enforces.

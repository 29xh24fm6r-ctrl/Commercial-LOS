# Platform-Enforced Credit Workflow Governance — Certification Report

**Date:** 2026-07-21. **Companion documents:** `CANONICAL_TRANSITION_POLICY_CONTRACT.md`,
`ADR_001_PLATFORM_ENFORCED_CREDIT_WORKFLOW_GOVERNANCE.md`, `THREAT_BYPASS_MODEL.md`,
`CONCURRENCY_PROTECTION.md`, `DEPLOYMENT_AND_ROLLBACK_PLAN.md`, `LIVE_OPERATOR_CERTIFICATION_SCRIPT.md`.

## 1. Enforcement architecture chosen

A Dataverse plugin (`LoanDealGovernedTransitionPlugin.cs`) registered **twice** on the `Update`
message of `cr664_loandeal`:

- **Stage 10 (Pre-validation)** — evaluates the full policy against the pre-image, *before* the
  platform's database transaction begins. On rejection, writes a durable `cr664_auditevents` row
  (this write survives the throw precisely because it isn't part of the transaction the throw
  aborts) and then throws.
- **Stage 20 (Pre-operation)** — re-evaluates the same policy inside the write's own transaction,
  against the freshest pre-image. This is the authoritative gate that actually prevents the
  invalid write from persisting; it does not attempt its own audit write on rejection (that write
  would roll back).

Chosen over Business Rules (can't do cross-entity authority lookups), async plugins/Power Automate
(run after the write commits, too late to prevent it), a client-only Custom API (only protects
callers who choose to use it — a direct `PATCH` bypasses it entirely, exactly the vector this
closes), and Application Insights as the *sole* audit record (fragments "what happened" across two
systems instead of one). Full reasoning in the ADR.

## 2. Tables and messages protected

| Table | Message | Fields filtered on |
|---|---|---|
| `cr664_loandeal` | `Update` | `cr664_stagereference`, `cr664_statusreference` |

Every other write to a loan deal (amount, dates, any other field) is completely unaffected — the
plugin does not fire for those. Because every Dataverse write path (Web API, Power Automate, bulk
edit, Excel Online, data import) funnels through this same `Update` message, one registration
covers all of them uniformly — see `THREAT_BYPASS_MODEL.md` for the full vector-by-vector mapping.

## 3. Rules enforced

Per `CANONICAL_TRANSITION_POLICY_CONTRACT.md`:

- **Stage adjacency** — an ADVANCE may only move to the single next stage by seeded
  `cr664_sequence`; any skip is rejected.
- **Terminal-status lock** — a deal already `DECLINED`/`WITHDRAWN`/`BOARDED` accepts no further
  governed transition of any kind.
- **CREDIT_APPROVAL → COMMITMENT authority** — the acting banker must have override authority, or
  committee membership with the deal amount within their approval limit (including the
  loan-request-profile amount cross-check) — hand-ported unchanged from the credit-authority logic
  this plugin's predecessor already implemented.
- **DECLINE/WITHDRAW cannot also change stage** in the same write, and neither is legal once the
  deal is already `BOARDED`.
- **Reason presence for RETURN/DECLINE/WITHDRAW** — implemented but **inert by design** until a
  new schema column (`cr664_governedactionreason`) is provisioned and two flags are flipped (see
  §7). Today, a direct write can still set DECLINED/WITHDRAWN/a RETURN target with no reason and
  the plugin will not catch it — this is an honest, documented gap, not an oversight.
- **What is intentionally NOT enforced here**: the deep facts other stage exits depend on (risk
  rating, underwriting recommendation, conditions precedent, funds disbursed, etc.) have no
  backing Dataverse record in this schema at all yet — the plugin does not invent enforcement for
  facts the application itself cannot yet verify. Same for facts on other tables the requirement
  registry reads (documents, tasks, credit memo) — a direct edit to those tables is not covered by
  this plugin; extending server-side enforcement to them is named as explicit future scope.

## 4. Direct bypass attempts tested

**Not executed against a live environment from this session** — no `dotnet` SDK and no Dataverse
credentials exist in this sandbox, matching this repo's own established precedent for its prior
Dataverse plugin work. What was produced instead:

- `scripts/dataverse/attempt-governance-bypass-smoke.ps1` — an automated, repeatable smoke script
  an operator runs against the real environment, attempting exactly the bypasses (stage-skip,
  terminal-status violation, unrelated-field no-op) and reporting a **CRITICAL** finding if any
  bypass unexpectedly succeeds, rather than treating that as a script bug.
- `docs/governance/LIVE_OPERATOR_CERTIFICATION_SCRIPT.md` — the full narrative script covering
  every scenario the automated smoke can't (concurrent-tab races, UI-level verification, the
  reason-enforcement phase).
- Client-side, fully automated and passing today: `StageWorkflowControl.test.tsx` and
  `DealGovernedTransitionPanel.test.tsx` prove the UI never displays a rejected write as a success
  — a mocked server rejection (`update_failed`, a thrown transport error) is always rendered
  honestly with the literal reason, `role="alert"` where appropriate.
- `governancePluginParityFixture.test.ts` — proves the plugin's hardcoded constants have not
  drifted from the canonical TypeScript sources (not a bypass test, but the tripwire against the
  client and server silently disagreeing about the law).

**This plugin's actual server-side rejection behavior is unverified until an operator runs the
live certification script against a real registration.** This report does not claim otherwise.

## 5. Concurrency behavior

No client-side ETag/If-Match support exists in the generated SDK (verified directly against the
installed package, not assumed) — so concurrency protection is achieved entirely server-side: the
stage-20 pre-operation check evaluates the transition against the *freshest* pre-image, which
Dataverse's own row-locking guarantees reflects any concurrent write that already committed. A
stale client's transition request is therefore rejected as an illegal edge from the deal's *current
true state* — no version token needed for this specific field pair. Full analysis, including the
one class of conflict this does not cover (non-stage-field races, out of this plugin's scope by
construction), in `CONCURRENCY_PROTECTION.md`.

## 6. Audit evidence behavior

- **Successful governed transitions**: unchanged — the existing client-side audit sink
  (`buildLiveCanonicalTransitionDeps.ts`) writes a `cr664_auditevents` row as part of the same
  successful write flow, as it already did before this initiative.
- **Rejected attempts**: NEW — the plugin's stage-10 step writes a `cr664_auditevents` row
  (`cr664_outcomestatus = Blocked`) with actor, before/after state, the specific blocking reason,
  and a correlation id, for every direct-write rejection — the first time a bypass *attempt* (not
  just a successful write) leaves a queryable record in this application. One accepted, documented
  residual gap: a rejection detected *only* at stage 20 (i.e., the deal's state changed in the
  narrow window between stage 10 and stage 20 of the *same* request) will not have a stage-10 audit
  row and relies on the platform's own plugin trace log instead — see the ADR's accepted-cost note.

## 7. Remaining gaps

1. **Not built, registered, or deployed.** Authored and reviewed by inspection; requires an
   operator with `dotnet`, the Plugin Registration Tool, and live credentials to actually arm this.
   Until then, this repository's enforcement is exactly what it was before this initiative:
   client-side only.
2. **Reason enforcement is schema-blocked.** `cr664_governedactionreason` does not exist yet;
   `GOVERNANCE_REASON_FIELD_ENABLED` and `RequireReasonFieldToEnforce` both default off. A direct
   write can decline/withdraw/return a deal with no reason today, bypassing what the UI requires.
3. **Server-side enforcement covers only the deal's own stage/status fields.** A direct edit to
   `cr664_documentchecklists`/`cr664_dealtask1s`/credit-memo records to fabricate a satisfied
   requirement is not covered by this plugin — extending the same pattern to those tables is future
   work, named explicitly rather than silently assumed solved.
4. **A Dataverse System Administrator can always disable this control.** No application-level
   mechanism can prevent that — it is an organizational/security-role governance question, not a
   code gap, documented as such in `THREAT_BYPASS_MODEL.md`.
5. **RETURN/DECLINE/WITHDRAW reaching the live banker UI is itself a behavior change** (these
   actions were previously unreachable) — flagged in the deployment plan as something to
   deliberately review before this branch reaches production traffic, independent of server
   enforcement.

## 8. Is unrestricted production use now supportable?

**No — same conditional verdict as the E2E certification, for the same reason, now with a
concrete, reviewed remediation in hand rather than an open finding.** The architecture and code for
closing D1 (no server-side enforcement) exist and are fully unit/contract-tested on the TypeScript
side; the automated suite (858 files / 12,788 tests, `tsc -b`, `npm run build`) is green. But the
plugin itself has never been compiled, registered, or exercised against a live Dataverse write —
"authored and reviewed" is not "proven." Production readiness for the server-enforcement dimension
specifically requires, in order: (1) an operator completes `DEPLOYMENT_AND_ROLLBACK_PLAN.md` Phase
1, (2) every scenario in `LIVE_OPERATOR_CERTIFICATION_SCRIPT.md` Part A/B passes against the real
environment, (3) a decision on whether Phase 2 (reason enforcement) is required before wider
rollout. Until that live certification passes, treat this exactly as the ADR frames it: the design
is sound and reviewed, the client-side half is live and tested, and the server-side half is a
built, un-verified artifact — not yet a proven control.

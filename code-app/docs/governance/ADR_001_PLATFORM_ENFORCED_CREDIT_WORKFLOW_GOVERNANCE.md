# ADR-001: Platform-Enforced Credit Workflow Governance

**Status:** Accepted (design + client-side implementation this pass). Server-side plugin **written,
not built/registered/deployed** — see `docs/governance/DEPLOYMENT_AND_ROLLBACK_PLAN.md`.
**Date:** 2026-07-21.
**Context document:** `docs/governance/CANONICAL_TRANSITION_POLICY_CONTRACT.md` (the policy this ADR
enforces). `docs/governance/THREAT_BYPASS_MODEL.md` (what this ADR defends against).

## 1. Problem

`docs/E2E_CERTIFICATION_REPORT_2026-07-21.md` (D1) and
`docs/LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md` (C1) both establish: every workflow gate,
approval-authority check, and terminal-state rule in this codebase is client-side TypeScript. The
generated Dataverse service layer (`Cr664_loandealsService.update()`) performs zero validation. Any
caller with ordinary Dataverse write access to `cr664_loandeals` — a direct Web API call, a Power
Automate flow, a bulk edit, a data import, a second application registered against the same
environment — can set any deal to any stage or status, bypassing every rule in
`src/workflow/`. This is an architectural gap, not a UI bug, and no client-side fix closes it.

## 2. Decision

Enforce the canonical transition policy **inside Dataverse itself**, via a synchronous plugin
registered on the `Update` message of `cr664_loandeals`, so that **every** write path — regardless of
which application, tool, or automation originates it — is validated identically before persistence.

### 2.1 Two-stage registration of one plugin class

The plugin (`LoanDealGovernedTransitionPlugin`, `dataverse-plugins/CommercialLendingLOS.Plugins/`)
registers **twice**, at two different Dataverse pipeline stages, sharing one evaluation method:

- **Stage 10 — Pre-validation.** Runs *before* the platform begins the database transaction for this
  request (this is a documented, load-bearing property of stage 10, not an implementation detail we
  are relying on informally). The plugin evaluates the full canonical policy against the supplied
  pre-image. **If the transition is invalid, it writes a `cr664_auditevents` row recording the
  rejection (actor, prior state, requested state, reason, blocking rule, correlation id, outcome =
  Blocked/Denied) and then throws `InvalidPluginExecutionException`.** Because this write happens
  before the transaction starts, it is **not rolled back** when the exception aborts the request —
  this is the mechanism that satisfies requirement 6 ("immutable audit evidence for... rejected
  governed actions") without any exotic out-of-band infrastructure.
- **Stage 20 — Pre-operation.** Runs inside the same transaction as the actual write, immediately
  before it commits. Re-evaluates the *same* policy against the **freshest** pre-image (which, thanks
  to Dataverse's normal row-locking during the transaction, reflects any concurrent write that
  committed first — see §2.3). This is the authoritative, race-safe gate: if it rejects, the write
  genuinely never happens. It does **not** attempt its own audit write (a write here would roll back
  along with everything else) — it relies on stage 10 having already logged the rejection for the
  overwhelming majority of cases, and accepts a narrower, documented residual gap for the rare
  case where stage 10 and stage 20 disagree only because state changed in between (§7).

Both stages call the identical policy-evaluation code path — there is exactly one evaluation
function, registered twice, not two independently-maintained rule sets.

### 2.2 Filtering and scope

Registered on `Update` of `cr664_loandeal`, filtered to fire only when `cr664_stagereference` or
`cr664_statusreference` is part of the update (mirroring the existing, narrower
`LoanDealStageAuthorityPlugin` this supersedes) — every other field update on a loan deal is
unaffected and pays no evaluation cost. A missing pre-image is treated as fail-closed (block, do not
guess) — this precedent already existed in the plugin this ADR extends and is preserved.

### 2.3 Concurrency: no client SDK change required

`@microsoft/power-apps/data`'s `updateRecordAsync` (the only write primitive the generated SDK
exposes) takes no ETag/`If-Match`/row-version parameter — this was verified directly against the
installed package's type definitions (`node_modules/@microsoft/power-apps/dist/internal/data/core/
types/index.d.ts`) during this design, not assumed. Client-side optimistic concurrency via HTTP
headers is therefore **not achievable through this SDK today**, and building a bespoke wrapper around
the generated (do-not-hand-edit) service layer to inject one was judged out of proportion to the
benefit, given the alternative below is already sufficient for the concurrency guarantee this
initiative actually requires.

Instead: **the transition-graph check itself, evaluated against the freshest pre-image at stage 20,
is the concurrency guard.** If two concurrent requests race to transition the same deal, Dataverse's
own row-level locking during the Update pipeline serializes them — the second request to reach stage
20 sees the pre-image *as already changed by the first*, and re-validating "is this still a legal
transition from the deal's current true stage/status" against that fresh image will correctly reject
a request that is no longer valid (whether because the deal already moved past it, already moved to a
different destination, or is now terminal) — without either side needing to supply or compare an
explicit version token. See `docs/governance/CONCURRENCY_PROTECTION.md` for the full analysis,
including the one class of conflict this does *not* cover (non-stage-field races) and why that's
acceptable (out of this plugin's scope by design — it only fires on stage/status attribute changes).

### 2.4 What is NOT chosen, and why

| Alternative | Rejected because |
|---|---|
| Dataverse Business Rules | Cannot query related entities (banker approval-limit lookups, cross-referenced request-profile amounts) or express the transition graph/reason requirements; declarative and too limited for this policy's cross-entity reads. |
| Asynchronous plugin / Power Automate flow | Runs *after* the write commits — by definition cannot prevent an invalid write, only react to one already persisted. Directly contradicts requirement 3 ("reject invalid writes before persistence"). |
| Azure Function via Custom API, called synchronously from the client only | Protects only callers who choose to invoke the Custom API — a direct `PATCH` to `cr664_loandeals` bypasses it entirely, which is exactly the bypass vector this initiative exists to close. A plugin on the `Update` message is the only mechanism that fires for *every* write path uniformly, because every Dataverse write — API, Power Automate, bulk edit, Excel Online, data import — funnels through the same message pipeline. |
| Application Insights integration as the sole audit-durability mechanism | A real, supported, complementary capability (see `docs/governance/DEPLOYMENT_AND_ROLLBACK_PLAN.md`), but as the *sole* record it puts the tamper-evident audit trail in a separate system from every other governed audit event this app already writes (`cr664_auditevents`), fragmenting "what happened to this deal" across two places. The stage-10 durable-write pattern keeps one single audit table as the source of truth for both allowed and rejected governed actions. |
| A brand-new independent Dataverse connection inside the plugin (separate transaction via its own stored credentials) | Works, but requires embedding a service-principal credential inside plugin code/config — a real security liability (credential rotation, scope creep, an extra secret to protect) for a problem stage-10 pre-validation solves natively, with zero extra credentials. |

### 2.5 Client responsibilities under this ADR

The client is not weakened or made redundant by this decision — the UI-side gates remain the *first*
line (fast, no round-trip, good UX for the 99% honest-caller case); the plugin is the backstop for
everyone else. Concretely, this pass:
- Mounts `StageWorkflowControl` live (RETURN/DECLINE/WITHDRAW), previously built but unmounted, so the
  application itself finally exercises all four transition kinds, not just ADVANCE.
- Replaces the two ad-hoc, duplicated reason/target checks inside
  `canonicalStageTransition.ts` with calls into the same canonical requirement registry ADVANCE
  already uses, closing the "three divergent engines" gap the 2026-07-14 audit (C2) identified.
- Ensures a server-side rejection (the plugin throwing) surfaces to the banker as the literal
  rejection reason, never as a generic error and never as a false success — this was already correct
  behavior on the ADVANCE path (`update_failed: Stage update failed: ${detail}` in
  `DealStageProgressionCard.tsx`, verified during this design, not assumed) and is extended to the
  newly-mounted RETURN/DECLINE/WITHDRAW path.

## 3. Consequences

- **Positive:** every write path is uniformly governed the moment the plugin is built, registered, and
  armed — no client update is required to close the bypass for existing callers, including ones this
  team doesn't control (a Power Automate flow someone else built, a consultant's data-import script).
- **Positive:** the audit trail for rejected attempts lives in the same `cr664_auditevents` table as
  every other governed audit event, queryable the same way.
- **Negative / accepted cost:** the plugin must be hand-kept in sync with the TypeScript policy — no
  shared runtime exists across the language boundary. Mitigated by the parity-fixture test (§10 of the
  policy contract), not eliminated.
- **Negative / accepted cost:** this repository cannot compile, register, or deploy the plugin from
  this sandbox (no `dotnet` SDK, no live Dataverse credentials). It has been authored to compile
  cleanly by inspection, consistent with this repo's own established precedent for
  `LoanDealStageAuthorityPlugin.cs`, but is **not a certified artifact** until an operator completes
  `docs/governance/DEPLOYMENT_AND_ROLLBACK_PLAN.md` and the live bypass tests in
  `docs/governance/LIVE_OPERATOR_CERTIFICATION_SCRIPT.md` pass.
- **Negative / accepted cost:** the residual race-window gap in §7 (stage-20-only rejections may not
  always produce a queryable `cr664_auditevents` row, only a platform plugin-trace-log entry) is
  accepted rather than solved with heavier infrastructure, given how narrow the window is (only
  triggered when state changes *between* stage 10 and stage 20 of the *same* request, which are
  microseconds apart).

## 4. Rollback

Documented in full in `docs/governance/DEPLOYMENT_AND_ROLLBACK_PLAN.md`. Summary: disabling either
plugin step (or deleting the assembly) via the Plugin Registration Tool returns the system to today's
client-only enforcement instantly — no schema change, no client redeploy, no data migration is
required to roll back. This asymmetry (hard to bypass once armed, trivial to disable) is deliberate:
an operator who discovers a policy bug in production must be able to un-arm enforcement in one step
while the bug is fixed, without being blocked from doing so by anything this ADR introduces.

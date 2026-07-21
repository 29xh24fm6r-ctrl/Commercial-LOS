# Canonical Transition Policy Contract — v1

**Status:** RATIFIED (this document). Governs every implementation of loan-deal stage/status
transitions — client TypeScript, the Dataverse server-side plugin, and any future integration.
**Owner artifact for:** Platform-Enforced Credit Workflow Governance (this initiative).
**Supersedes, by reference (not by rewrite):** this contract does not duplicate the requirement
catalog — it *ratifies* the existing single source of truth and closes its remaining gaps. Where
this document says "see X," X is the literal source of truth; nothing here should ever drift from
it without updating X first.

## 0. Why this document exists

The 2026-07-21 E2E certification (`docs/E2E_CERTIFICATION_REPORT_2026-07-21.md`, finding D1) and the
2026-07-14 independent audit (`docs/LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md`, findings C1/C2)
both concluded the same thing from different directions: every stage-gate, approval-authority check,
and terminal-state rule in this application is enforced by client-side TypeScript only. Nothing
prevents a direct Dataverse write — from the Web API, a Power Automate flow, a bulk edit, a data
import, or a second/rogue application — from setting a loan deal to any stage or status, bypassing
every rule below.

This contract is the **one specification** both enforcement layers (client UI and the server plugin)
must satisfy identically. It exists so that when the client and the server plugin are compared, there
is a single, unambiguous, versioned answer to "which one is right" — the answer is always: whichever
one deviates from this document is the bug.

## 1. The canonical lifecycle

```
INTAKE -> UNDERWRITING -> CREDIT_APPROVAL -> COMMITMENT -> DOCUMENTATION -> CLOSING_FUNDING -> BOARDED
```

**Source of truth:** `src/workflow/stageOrderingContract.ts` — `CANONICAL_STAGE_CODES` (the 7 codes,
in this exact order) and `resolveStageOrdering()` (which builds the live adjacency graph from the
seeded `cr664_dealstagereferences` rows, ordered by `cr664_sequence`, not by code order — the code
order above is descriptive of the ratified design, but the *live* graph is always the seeded-sequence
order; if they ever disagree, the seeded data is authoritative and the discrepancy is an operator data
error, not a policy question).

- **Adjacency:** a forward ADVANCE is legal only from stage *N* to the single stage whose
  `cr664_sequence` is the next-highest active value — never a skip, never sideways. No branching:
  the graph is strictly linear.
- **The stage graph has exactly one terminal *stage*:** BOARDED (highest `cr664_sequence`).
- **Fail-closed on unseeded/malformed reference data:** if the stage-reference table has a missing
  canonical code, a duplicate active row for one code, a non-canonical active code, or a missing/
  duplicate `cr664_sequence`, ordering resolution reports `status: 'unavailable'` and **no transition
  of any kind may proceed** — this is not a degraded mode, it is a hard stop, on both client and
  server.

## 2. Status, independent of stage

A deal also carries a **status**, orthogonal to stage: `OPEN | ON_HOLD | DECLINED | WITHDRAWN |
BOARDED`. **Source of truth:** `src/workflow/canonicalStageTransition.ts` (`DealStatusCode`,
`TERMINAL_STATUSES`), backed by `cr664_dealstatusreferences` (a plain code table — `cr664_code`,
`cr664_name`, `cr664_activeflag`; no sequence concept, since status has no ordering, only a
terminal/non-terminal partition).

- **Terminal statuses:** `DECLINED`, `WITHDRAWN`, `BOARDED`. A deal in any of these three statuses
  accepts **no further governed transition of any kind** — not ADVANCE, not RETURN, not another
  DECLINE, not another WITHDRAW — until it is explicitly **reopened** (§7).
- A deal in `OPEN` or `ON_HOLD` may attempt any transition kind whose other preconditions are met.
  This contract does not currently define a distinct governed meaning for `ON_HOLD` beyond "not
  terminal, not necessarily actively progressing" — it is not itself a blocker to any transition kind.

## 3. Transition kinds

Four kinds, defined in `src/workflow/canonicalStageTransition.ts` (`StageTransitionKind`):
`ADVANCE`, `RETURN`, `DECLINE`, `WITHDRAW`.

### 3.1 ADVANCE — forward, one stage at a time

- **Allowed source → destination:** exactly the single adjacent next stage per §1's graph. No other
  destination is ever legal for ADVANCE.
- **Prerequisites:** every **blocking**, **tracked** requirement in
  `src/workflow/loanWorkflowRequirementRegistry.ts` for the source stage's scope must be met. The
  registry is the exhaustive per-stage catalog (fields, documents, tasks, credit artifacts, closing
  conditions, and the "deep" facts — risk rating, underwriting recommendation, approval decision/
  authority/conditions, commitment issuance/acceptance, conditions precedent, funding, boarding —
  each explicitly marked `tracked: true`/`false`). An **untracked** requirement blocks by design
  (fail-closed) — it is never silently treated as satisfied. See `docs/LOS_WORKFLOW_TRUTH_MATRIX.md`
  for the current tracked/untracked status of every deep fact.
- **Approval requirement (CREDIT_APPROVAL exit specifically):** the acting banker must satisfy
  `src/workflow/creditApprovalAuthority.ts`'s `evaluateCreditApprovalAuthority` — override authority,
  OR (credit-committee membership AND the deal amount within the banker's approval limit), with the
  deal-amount cross-check against any linked `cr664_loanrequestprofile.cr664_requestedamount`
  resolved via `governedRequestedAmount.ts` (a mismatch is a hard block, never silently resolved).
  This is the one stage exit with a genuine, wired, fail-closed authority gate today; no other stage
  exit has an authority requirement beyond "an authorized actor" (§5).
- **Authorized roles:** any actor the client/server can resolve to a real identity (a `cr664_banker`
  record via email, mirrored server-side) — see §5. CREDIT_APPROVAL exit additionally requires the
  authority computation above.
- **Reason:** not required for ADVANCE.
- **Terminal-state behavior:** ADVANCE from BOARDED is illegal (no next stage exists). ADVANCE while
  status is terminal (`DECLINED`/`WITHDRAWN`) is illegal regardless of stage.

### 3.2 RETURN — to any strictly earlier stage

- **Allowed destination:** any stage strictly before the current stage in the seeded sequence
  (`ordering.priorStages(currentStage)`) — not necessarily the immediately prior stage; a return can
  skip back multiple stages (e.g. DOCUMENTATION back to UNDERWRITING) when the reason warrants it.
  It may never target the current stage or any later stage.
- **Prerequisites:** none of the destination stage's forward-entry requirements are re-checked by a
  RETURN itself — returning is how a deal *gets back into* a state to redo work, so it must not be
  gated on the very things a return is meant to let someone fix. (Advancing forward again afterward
  re-applies the destination stage's own ADVANCE requirements normally.)
- **Reason:** **required, non-empty.** See `loanWorkflowRequirementRegistry.ts`'s `RETURN:reason`.
- **Authorized roles:** any actor the client/server can resolve to a real identity — see §5.
  (`RETURN:authorization` in the registry is presently authored as an untracked placeholder; this
  contract ratifies that the fail-closed default — "resolved identity is sufficient, no distinct
  return-authority tier exists yet" — is the current, honest policy, not a gap to silently paper over.
  A future revision of this contract may introduce a distinct return-authority role; until it does,
  identity resolution is the whole requirement.)
- **Terminal-state behavior:** illegal from BOARDED (no prior stage is a legal target in practice once
  boarded — boarding reopening is a distinct governed action, §7) and illegal while status is terminal.

### 3.3 DECLINE — adverse outcome, no stage change

- **Effect:** does not change stage. Sets status to `DECLINED` (terminal).
- **Prerequisites:** none of the current stage's requirements apply — a decline is precisely the
  action available when requirements *cannot* be met.
- **Reason:** **required, a structured code** (`StructuredDeclineReason.code`, non-empty) plus
  optional free-text detail. A free-text-only decline (no code) is not a valid DECLINE per this
  contract — see §8 for the current client gap and its remediation.
- **Adverse action:** every DECLINE is `adverseActionPending: true` by construction
  (`canonicalStageTransition.ts`) — this contract does not yet define the downstream adverse-action
  notification/documentation workflow (`DECLINE:adverse_action` in the registry remains an honest,
  untracked placeholder); it defines only that every decline is flagged for it, never silently closed
  out as if adverse-action handling were unnecessary.
- **Authorized roles:** any actor the client/server can resolve to a real identity — see §5.
- **Terminal-state behavior:** illegal once the deal's stage is already BOARDED (a boarded loan is
  declined via portfolio-level workout/charge-off processes, not this transition) and illegal while
  status is already terminal (a second decline of an already-declined deal is not a real action).

### 3.4 WITHDRAW — borrower-initiated exit, no stage change

- **Effect:** does not change stage. Sets status to `WITHDRAWN` (terminal).
- **Prerequisites:** none.
- **Reason:** **required, non-empty free text** (`request.reason`).
- **Authorized roles:** any actor the client/server can resolve to a real identity — see §5.
- **Terminal-state behavior:** illegal once BOARDED, and illegal while status is already terminal —
  same as DECLINE.

## 4. Concurrency

**No two governed writes may commit against contradictory beliefs about the deal's current stage or
status.** See `docs/governance/CONCURRENCY_PROTECTION.md` for the full design; the contract-level
rule is:

> Every enforcement layer validates the transition against the **freshest persisted stage/status at
> the moment of the write**, not the value the caller believed was current when it started. A
> transition that was legal when read but is no longer legal against the freshest state is rejected,
> exactly as if it had been illegal from the start — never partially applied, never silently
> "upgraded" to whatever the new state is.

## 5. Authorization (identity resolution)

Every transition kind requires the acting party to resolve to a real, identifiable `cr664_banker`
record (client: via `BankerProvider.tsx`'s email-based lookup; server: mirrored identically in the
plugin via the initiating user's `systemuser.internalemailaddress`). An actor who cannot be resolved
is denied every transition kind, including ADVANCE stages with no other authority requirement. This
is deliberately the *only* universal authorization bar today — CREDIT_APPROVAL exit additionally
layers the authority computation in §3.1. This contract does not invent new role-based authorization
tiers for RETURN/DECLINE/WITHDRAW beyond identity resolution (see the honesty note in §3.2); doing so
is explicitly out of scope for this initiative and left for a future, separately-ratified revision.

## 6. Reason requirements — summary table

| Transition | Reason required? | Shape |
|---|---|---|
| ADVANCE | No | — |
| RETURN | **Yes** | Non-empty free text |
| DECLINE | **Yes** | Structured `{code, detail?}` — `code` non-empty |
| WITHDRAW | **Yes** | Non-empty free text |

## 7. Terminal-state behavior and reopening

- **Stage-terminal (BOARDED):** the loan has left origination governance and entered portfolio
  servicing (`src/portfolio/`, `src/portfolioBoarding/`). No further stage/status transition under
  this contract applies to a BOARDED deal; portfolio-side actions (workout, charge-off, payoff) are a
  distinct system and out of this contract's scope.
- **Status-terminal (DECLINED, WITHDRAWN):** the deal is closed to further governed action under this
  contract. **Reopening a DECLINED or WITHDRAWN deal is not a transition this contract defines** — no
  ADVANCE/RETURN/DECLINE/WITHDRAW request may target a status-terminal deal, full stop. If a
  business need exists to resurrect a declined/withdrawn deal (e.g., a borrower reapplies), the
  governed path is a **new deal record** referencing the old one for history, not a mutation of the
  terminal record. This is a deliberate, conservative default: it guarantees a DECLINED/WITHDRAWN
  record's terminal facts (the reason, the date, the adverse-action flag) can never be altered or
  reversed by a later write. A future revision of this contract may define a genuine, separately
  audited "reopen" transition kind if the business need is confirmed; until then, none exists, and
  both the client and the plugin must reject any attempt to write a status-terminal deal's stage or
  status fields, with no exception.

## 8. Boarding conditions

Reaching BOARDED (an ADVANCE from CLOSING_FUNDING) requires the CLOSING_FUNDING stage's own
requirements (§3.1) plus, per `src/workflow/boardingHandoffReadiness.ts` and
`src/deals/loadBoardingHandoffForDeal.ts`, a **real, reconciled `cr664_portfolioboardedloans` handoff
record** — `boardingCompleted` is true only when the deal's stage claims BOARDED *and* an active
boarded-loan row exists linked to it (`_cr664_originatedloandeal_value`). A stage-string claim of
BOARDED with no such row is `missing-handoff` (surfaced honestly, not treated as boarded); an active
boarded-loan row with the deal NOT at BOARDED is `premature-handoff` (also surfaced as a failure
state, never silently accepted). The governed stage-advance write path already auto-creates this
handoff record on a successful ADVANCE to BOARDED (`buildLiveStageAdvanceDeps.ts`'s `onDealBoarded`) —
this contract ratifies that behavior as required, not incidental: **an ADVANCE to BOARDED that cannot
also produce (or already have) a reconciled handoff record has not really completed boarding**, even
if the stage field itself was written.

## 9. Known, explicitly-scoped-out gaps (honesty, not oversight)

This contract intentionally does **not** yet define:
- A distinct authorization tier for RETURN/DECLINE/WITHDRAW beyond identity resolution (§3.2, §5).
- The downstream adverse-action notification/documentation workflow for DECLINE (§3.3).
- A governed "reopen" transition for status-terminal deals (§7).
- Committee-tier / dollar-amount-based approval escalation — deliberately removed platform-wide in
  favor of the single approval-limit/committee-membership/override model in
  `creditApprovalAuthority.ts` (see `docs/LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md` findings
  C4/H3/H4 for the history of why the multi-tier model was retired, not merely never built).

Each of these is a genuine scope boundary, stated here so that a future implementer or auditor can
distinguish "not designed yet, on purpose" from "silently missing."

## 10. Parity discipline

There is no shared runtime between the TypeScript client and the C# Dataverse plugin — the plugin is
hand-ported. Drift between the two is the single biggest risk this contract exists to prevent. The
discipline: **`src/workflow/governancePluginParityFixture.test.ts` pins the exact literal values (stage
codes, terminal statuses, authority field names, reason-requirement facts) the plugin hardcodes,
asserted against this contract's canonical TypeScript sources
(`stageOrderingContract.ts`/`canonicalStageTransition.ts`/`creditApprovalAuthority.ts`).** Whoever
changes the policy on either side must update the fixture (and, for a plugin change, actually
recompile/redeploy it — this repo cannot verify that from source alone). A failing parity test means
the two sides disagree about the law; treat it as a release blocker, not a test to loosen.

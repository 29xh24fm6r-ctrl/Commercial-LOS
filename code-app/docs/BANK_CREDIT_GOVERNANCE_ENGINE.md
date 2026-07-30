# Bank Credit Governance and Delegated Authority Engine

## Status

The pure, version-aware policy evaluation kernel is implemented in
`src/governance/bankCreditGovernanceEngine.ts`. It is not yet the production
enforcement path. The existing client and Dataverse plug-in still enforce the
legacy institution-specific approval-limit/committee rules. Production must
remain on that fail-closed path until the persistence and server-enforcement
work below is complete.

## Policy semantics

- A caller must supply one immutable policy version and evaluation timestamp.
- Only an `ACTIVE` policy inside its effective interval can be evaluated.
- Invalid configuration, absent policy, absent actor, or no matching rule blocks.
- Every matching rule applies. Rules compose restrictively; ordering cannot make
  a more-specific control erase a base or regulatory control.
- Role combination is permitted when no matching rule requires independence.
- `independentFrom` requires attributable prior-action evidence and another actor.
- Delegated authority grants are scoped by action, effective dates, product,
  amount, and total relationship exposure.
- Approval groups support role eligibility, distinct-person counts, committees,
  and unanimity.
- A mandatory escalation produces `ESCALATE` only when no blocking requirement is
  also unsatisfied.
- The evaluator never grants an implicit override. It identifies
  `nonOverrideable` findings so an explicit, separately governed override process
  can reject them.
- Results include the exact policy ID/version, matched rule IDs, fact snapshot,
  reason codes, and supporting evidence IDs.

## Required durable model

Dataverse should store these as immutable/versioned records rather than mutable
flags on banker rows:

1. Bank policy and policy version, including status and effective interval.
2. Policy rules and their validated condition/requirement document.
3. Delegated authority grants with officer, action, scope, limits, and effective
   interval.
4. Governed action evidence for originate, underwrite, approve, close, fund, and
   board.
5. Approval groups, votes, committee membership, and vote eligibility as of the
   vote time.
6. Append-only evaluation records containing the request snapshot and complete
   result.

An activation transaction must ensure that at most one version is active for a
bank at an instant and must reject invalid or uncovered policy configurations.
Published versions must never be edited in place; corrections create a new
version.

## Minimum coherent delivery arc

### 1. Evaluation contract

The pure engine, runtime validation, deterministic explanations, and operating
model tests land together. This is the current implementation boundary.

### 2. Durable configuration and authoritative enforcement

Add the Dataverse schema, policy authoring/validation/activation service,
evaluation evidence store, and a server-side plug-in/custom API that evaluates
the same contract for every governed action. Replace
`EvaluateCreditApprovalAuthority` in `LoanDealGovernedTransitionPlugin.cs` only
when the server can resolve an active policy and persist its evaluation. A client
pre-check may improve UX but can never be the authority.

### 3. Workflow adoption and production proof

Route origination, underwriting, approval, closing, funding, and boarding writes
through the authoritative service; expose policy explanations and audit history;
migrate the current banker limits into an explicit initial policy version; and
activate only after cross-runtime contract tests, negative-path tests, security
tests, and live two-user evidence pass.

These are system boundaries, not cosmetic workstreams. In particular, policy
administration without server enforcement, or client enforcement without
durable evaluation evidence, must not be independently activated.

# PR 1 Governance Inventories and Migration Matrix

This inventory describes the repository at PR 1. It is evidence for migration,
not an Old Glory Bank policy definition. No item in this document is copied into
the configurable engine as a default.

## Current-rule inventory

| Existing control | Current implementation | Current behavior | PR 1 disposition |
|---|---|---|---|
| Credit approval authority | `src/workflow/creditApprovalAuthority.ts` | Requires resolved actor and banker; requires all three banker authority fields; blocks conflicting/missing amount; normally requires committee membership and amount within individual limit; override bypasses committee and amount; client check blocks assigned banker self-approval when both IDs exist. | Preserve unchanged until configured server enforcement is parity-certified. Expressible through actor roles, scoped grants, independence, and composed policy rules. |
| Credit approval durable record | `src/creditApproval/submitCreditApprovalDecision.ts` and `DurableRecordGovernancePlugin.cs` | Decision status and rationale required; authority rechecked; authority tier inferred; durable server plug-in requires authority fields and authority tier. | Route through authoritative evaluation only in PR 5 after PR 3 parity. |
| Stage exit approval gate | `LoanDealGovernedTransitionPlugin.cs` | `CREDIT_APPROVAL -> COMMITMENT` invokes the hardcoded banker-field authority algorithm. | PR 3 server adapter replacement target; legacy path stays active until migration. |
| Funding maker/checker | `DurableRecordGovernancePlugin.cs` | Requester cannot decide own request; two approvals are distinct; disbursement confirmer differs from approvers; destination, conditions, exceptions, documents, amount, and dates gate confirmation. | Model separation and approval-count controls; lifecycle/data-completeness controls remain server invariants unless deliberately made policy-configurable. |
| Closing evidence | `src/closing/*` and `DurableRecordGovernancePlugin.cs` | Append-only attestations and required closing evidence are enforced as durable-record invariants. | Preserve as lifecycle invariants; add policy role/separation overlays without weakening evidence requirements. |
| Underwriting evidence | `src/workflow/underwritingDeepFacts.ts` | Recorded underwriter and rationale are required for readiness; no general configured separation rule exists. | Actor evidence becomes `UNDERWRITE` action history; policy decides combination/separation. |
| Boarding access | `src/portfolioBoarding/portfolioBoardingAccess.ts` and runtime adapter gates | Uses existing application authorization and adapter availability; repository comments acknowledge no boarding-specific role. | Add configured `BOARD` role/authority evaluation while retaining adapter/schema/readiness gates. |
| Workflow route recommendations | `workflowRouteRegistry.ts` and `workflowRouteRuleRegistry.ts` | Product/scenario registries derive read-only stage, manager, committee, and board-visibility recommendations. | Inventory as candidate migration inputs only; they are not authoritative approval policy. |
| Canonical stage/status edges | `LoanDealGovernedTransitionPlugin.cs` and stage catalogs | Fixed legal stage/status transitions and deep-fact gates fail closed. | Remain lifecycle invariants. Governance policy adds actor/authority controls; it does not legalize invalid lifecycle edges. |

## Hardcoded-assumption inventory

| Assumption | Evidence location | Risk |
|---|---|---|
| Every normal credit approver is a credit committee member. | `creditApprovalAuthority.ts`; `LoanDealGovernedTransitionPlugin.cs`; `DurableRecordGovernancePlugin.cs` | Cannot represent individual delegated approval or independent non-committee approvers. |
| One money field represents an officer's authority. | Banker `cr664_approvallimit` readers | Cannot scope by action, exposure, product, risk, collateral, industry, geography, program, or effective period. |
| One override boolean bypasses committee and amount checks. | TypeScript and C# approval evaluators | Conflates distinct override powers and lacks policy-version evidence. |
| Assigned banker is the originator for self-approval purposes. | `advancingActorBankerId` versus `originatingBankerId` | Assignment is not durable proof of who originated or underwrote. |
| Missing one of the two banker IDs means separation has no opinion. | `creditApprovalAuthority.ts` | Necessary for current compatibility but insufficient for certified separation. |
| Authority tier can be inferred as override, committee, or individual from banker flags. | `authorityTierFor` in `submitCreditApprovalDecision.ts` | Records a label, not the exact policy rule/grant/vote basis. |
| Funding always uses the current fixed two-approval model. | `DurableRecordGovernancePlugin.cs` | Cannot vary approval count by case facts or policy profile. |
| Committee membership is a banker boolean. | `cr664_creditcommitteemember` | Cannot represent committee identity, term, voting eligibility, quorum, or vote history. |
| Workflow registries encode product/scenario routes in source. | `workflowRouteRegistry.ts`; `workflowRouteRuleRegistry.ts` | Recommendations can drift from active institutional policy. |
| Boarding has no dedicated authority role. | `buildLivePortfolioBoardingRuntimeDeps.ts` | Existing broad authorization cannot prove delegated boarding authority. |

## Authority-inference inventory

| Inferred fact today | Source | Required durable replacement |
|---|---|---|
| Acting banker | Initiating system user email matched to first banker row | Bank-scoped, unique officer identity binding with validity interval. |
| Originator | Deal assigned-banker lookup | Append-only `ORIGINATE` action evidence identifying the actual actor. |
| Underwriter | Name/email-like value in underwriting recommendation JSON | Bound system-user/officer reference in append-only `UNDERWRITE` evidence. |
| Approver authority | Three mutable banker fields | Versioned delegated-authority grant plus exact matched policy snapshot. |
| Committee eligibility | Banker committee boolean | Effective-dated committee membership and voting-role record. |
| Authority tier | Precedence: override, committee, individual | Persisted evaluation ID, matched rules, grant IDs, and vote evidence IDs. |
| Funding requester/approvers | Email strings on funding authorization | Immutable actor references and governed action evidence. |
| Boarding operator | Current application access/adapter availability | `BOARD` evaluation tied to officer, policy, grant, and evaluation record. |
| Relationship exposure | Not part of current approval evaluator | Atomic exposure snapshot with source version token at evaluation time. |

## Migration matrix

| Legacy behavior | Configurable representation | Parity requirement before cutover | Cutover owner PR |
|---|---|---|---|
| Resolved actor and banker required | Evidence repository must resolve bank-scoped actor | Missing/ambiguous identity denies in TypeScript and server contract tests | PR 3 |
| All three banker fields populated | Migrated grant plus required policy rule | Every currently authorized officer maps explicitly; omissions deny | PR 6 |
| Committee required for normal approval | Approval role/group rule in the OGB migration profile | Shadow result matches legacy for certified case corpus | PR 6 |
| Amount within personal limit | Grant maximum amount | Boundary, missing amount, and conflict cases match legacy | PR 3/6 |
| Override bypasses committee and amount | Explicit migrated exception rule and scoped override authority | Institution must approve semantics; no inferred production assignment | PR 6 pause point |
| Assigned-banker self-approval block | `independentFrom: ORIGINATE` using durable action evidence | Assigned-banker proxy retained until originator evidence is complete; configured rule cannot weaken it | PR 5/6 |
| Two distinct funding approvals | Approval group with count 2 and distinct actors | All existing maker/checker and disbursement separation negatives pass | PR 3/6 |
| Committee flag | Committee membership plus approval group | Membership dates, committee identity, and vote evidence certified | PR 2/6 |
| Fixed routing recommendations | Policy conditions over product and other facts | Read-only registry output compared in shadow mode; registry never becomes authority | PR 6 |
| Broad boarding authorization | `BOARD` role and scoped authority grant | Existing access, adapter, and schema gates remain conjunctive | PR 5/6 |

## Safety invariants for PR 1

- No existing evaluator or runtime call site imports the new engine.
- No Dataverse schema, generated service, environment flag, or plug-in is changed.
- Absence, ambiguity, malformed policy, missing evidence, and persistence failure
  are represented as denial.
- Server consumers may proceed only after a persisted evaluation returns
  `PERMIT`.
- Current controls remain authoritative until PR 5 migration wiring and PR 6
  parity certification.

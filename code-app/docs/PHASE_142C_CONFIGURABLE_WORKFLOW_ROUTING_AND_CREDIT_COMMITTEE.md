# Phase 142C — Configurable Workflow Routing and Credit Committee Route Deriver

> **What this is.** A governed, **read-only** configurable workflow-routing engine
> over the Phase 142A route registry — for commercial lending, annual reviews,
> portfolio boarding, exceptions, and credit committee routing. It derives the
> correct path from deal/product/amount/customer/channel/risk/readiness/covenant
> context. It **approves no credit, creates no tasks, changes no stages, writes
> nothing, sends nothing, and enables no committee approval/voting.**

## 1. Purpose

Commercial lending needs governed workflow routing: product/amount/customer/
channel paths, annual-review paths, covenant-exception paths, credit-committee
paths, portfolio-boarding paths, FDIC/examiner paths, and exception-remediation
paths. The system can now say what route a deal/review belongs on, which stages
apply, who must review, whether a credit committee is required, which package/
readiness outputs are blocking, and what the next best action is.

Core principle: **route derivation is decision support only.** It never mutates
live workflow state and never approves credit.

## 2. Prerequisites

- **Phase 142A** — competitive convergence layer (route + product/process
  registries).
- **Phase 142B** — governed platform object/view metadata surfaces.
- **Annual review phases 141M-P** — financial/covenant/package outputs.

## 3. OpenCBS / nCino inspiration

- **Product / amount / client / channel routing** (OpenCBS).
- **Credit committee paths** as first-class routing findings (OpenCBS/nCino).
- **Evidence / package readiness checkpoints** gating committee-readiness (nCino).

## 4. What this phase adds

| File | Role |
|---|---|
| `workflowRoutingConfigTypes.ts` | Routing config + result types |
| `workflowRouteRuleRegistry.ts` | 14 static, declarative route rules |
| `deriveConfigurableWorkflowRoute.ts` | Priority-ranked route derivation engine |
| `deriveCreditCommitteeRoute.ts` | Credit committee route deriver (no vote/approval) |
| `deriveWorkflowStageSequence.ts` | Stage sequence + blocked/candidate-completed |
| `deriveWorkflowRoutingReadiness.ts` | Operational routing readiness summary |
| `WorkflowRoutingPanel.tsx` | Read-only routing panel |

Rules are **declarative** (`field` / `operator` / `value`) — there is no eval,
no function body, and no SQL/OData. The engine evaluates rules by priority,
selects the highest-priority match, and returns `route_review_required` on
missing core data or conflicting top-priority rules. Committee type escalates by
amount thresholds (credit → senior → executive) combined with the rule's
committee policy.

## 5. What remains disabled

- **Stage mutation** — stages are derived, never updated; the live current stage
  is never changed and no live stage is marked complete (only "candidate
  completed" based on evidence; never an approval stage).
- **Task creation** — none.
- **Committee submission / voting / approval** — `votingEnabled` and
  `approvalEnabled` are structurally false; no vote is recorded and no package is
  submitted.
- **Credit approval / decline** — `canApproveCredit` is structurally false.
- **Covenant waiver** — none.
- **Borrower outreach / upload links / email / SMS** — none.
- **Writes** — no CRM or Dataverse writes; no route is registered for the panel.

## 6. Next recommended phase

**Phase 142D — Product/process template registry for commercial loan workflows.**

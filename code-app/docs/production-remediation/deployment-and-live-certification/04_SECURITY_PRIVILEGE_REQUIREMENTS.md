# Security Privilege Requirements — Deployment and Live Certification

## Roles required to execute this runbook

| Actor | Required Dataverse role | Why |
|-------|--------------------------|-----|
| Operator applying schema migrations (`01_MIGRATION_RUNBOOK.md`) | **System Customizer** or **System Administrator** | Every migration script's own header states this requirement explicitly (e.g. `create-columns.mjs`'s "Requires an OAuth access token for an account with System Customizer or System Administrator security role"). |
| Operator running `pac code add-data-source` (SDK regeneration) | Same as above, plus **local `pac` CLI authenticated against the target environment** | `pac org who` must resolve to the expected org host before any script proceeds — every migration script checks this and blocks on mismatch. |
| Operator publishing customizations in the Maker Portal | **System Customizer** or **System Administrator** | Standard Dataverse requirement for `PublishAllXml`. |

## Roles required for the application's own governed actions (already enforced in code — this table documents what's already true, it does not request new privileges)

These are **not** new privileges to grant for this deployment — they are the actor-eligibility
rules the application code already enforces client-side + (for the credit-approval/document-review
paths) via the Dataverse governance plugin. Listed here so an operator provisioning test users for
live certification (`03_TWO_USER_TEST_REQUIREMENTS.md`) knows what each test persona needs to
represent:

| Governed action | Eligibility rule enforced in code | Source |
|---|---|---|
| Advance a deal out of CREDIT_APPROVAL | Actor must be a credit-committee member within their approval limit, AND must NOT be the deal's own assigned banker (segregation of duties) | `src/workflow/creditApprovalAuthority.ts` |
| Receive a document (mark received) | No restriction beyond general banker authorization | `src/deals/documentRequirementActions.ts` |
| Review a document already received | Actor must NOT be the same actor who received it (segregation of duties) — enforced client-side; **not yet enforced by the Dataverse governance plugin** (see gap note below) | `src/deals/documentReviewSegregationOfDuties.ts` |
| Request funding | Any authorized banker on the deal | `src/funding/fundingRequestAdapter.ts` |
| Approve funding (first approval) | Any authorized approver | `src/funding/fundingApprovalAdapter.ts` |
| Approve funding (second/final approval, over the $250k default threshold) | Must be a DIFFERENT approver than the first approval, AND must NOT be the original requester (dual control) | `src/funding/fundingAuthorizationPolicy.ts` |
| Advance/Return/Decline/Withdraw a deal stage | Actor must be authorized per the canonical transition policy contract; the Dataverse PreOperation governance plugin independently re-validates the same policy server-side (defense in depth) | `src/workflow/canonicalStageTransition.ts`, the C# governance plugin |

**Known gap, not fixed by this initiative**: the document-review segregation-of-duties check
(receiver ≠ reviewer) is enforced only client-side today, not by the Dataverse governance plugin.
A determined actor calling the Dataverse Web API directly (bypassing the client) could receive and
then review the same document. This is a real, documented gap — flagged here for the GO/NO-GO
decision (`06_GO_NO_GO_DECISION.md`), not fixed as part of this deployment.

## Security review checklist before granting live access

- [ ] Confirm the operator's `pac` identity has System Customizer or System Administrator in the
      **correct target environment** (`org3a57b8d4.crm.dynamics.com` per PR132's documented target
      — reconfirm this is still correct before running anything).
- [ ] Confirm no broader privilege (e.g. System Administrator when System Customizer would suffice)
      is granted without a documented reason.
- [ ] Confirm the `DATAVERSE_ACCESS_TOKEN` used for the `.mjs` migration scripts is scoped to the
      target environment only, and is not a long-lived credential left in shell history or a CI
      log after use.
- [ ] For live two-user certification (`03_TWO_USER_TEST_REQUIREMENTS.md`): confirm the two test
      personas are genuinely distinct Dataverse users (not the same login used twice), since
      several of the rules above depend on actor-identity comparison, not just role membership.

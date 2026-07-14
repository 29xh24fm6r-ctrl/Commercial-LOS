# Dataverse security-role runbook — loan workflow stage/status writes

**Why this exists:** [LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md](LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md)
finding C1 established that every stage-gating, requirement, and approval-authority check in this
repository (`src/workflow/`, `src/access/`) is **client-side TypeScript only**. There are no
Dataverse plugins, business rules, or custom APIs anywhere in this codebase — `scripts/dataverse/`
only provisions tables/columns/data, never security. The generated service layer
(`src/generated/services/Cr664_loandealsService.ts`) performs **zero validation**: `update()` will
write any field to any record for any caller with ordinary Dataverse write access.

This is not fixable with a code change in this repository — this app has no backend. It can only be
closed by configuring Dataverse security roles / field-level security in the live Power Platform
environment, which is outside version control. This runbook is the actionable checklist for
whoever owns that environment. Until it is implemented, treat every client-side gate in
`src/workflow` as **advisory UX guidance, not a security boundary**.

## What must be restricted

| Table / field | Today | Required |
|---|---|---|
| `cr664_loandeals.cr664_StageReference` (stage) | Any user with table write access can set this to any value via the Dataverse Web API directly, bypassing every gate in `src/workflow`. | Field-level security profile restricting write access to this column to a role that represents "governed stage-write app identity" (or equivalent), with individual-user write blocked outside the governed app flow. |
| `cr664_loandeals.cr664_StatusReference` (status — e.g. DECLINED/WITHDRAWN) | Same as above. | Same as above. |
| Advancing a deal OUT of `CREDIT_APPROVAL` specifically | No Dataverse-side authority check exists at all; the client-side interim role proxy (`approvalAuthorityMatrix.ts`, `isInterimAuthorizedApproverRole`) is the only check, and it is trivially bypassed by calling the Dataverse API directly. | A genuine credit-approval-authority signal (see "Missing data model" below) enforced server-side — e.g. a Dataverse business rule / Power Automate flow / plugin that validates the acting user against an approval-authority table before allowing the stage write, OR a workflow approval process native to Dataverse (e.g. a Power Automate approval gate in front of the write). |
| `cr664_dealstagereferences`, `cr664_dealstatusreferences` (reference tables) | Read/write scope not audited as part of this pass. | Confirm these are read-only to end users (governed reference data, not something a banker can edit directly). |

## Missing data model (blocks a real fix, not just a config change)

Confirmed by code research: there is **no structured approval-authority, credit-limit, or
committee-membership field** anywhere in the current Dataverse schema (checked
`Cr664_bankersModel`, `Cr664_platformusersModel`, `Cr664_usersModel`,
`Cr664_losuserprofilesModel`, `Cr664_teamsModel`, `Cr664_workspaceentitlementsesModel`). The
closest fields are:
- `cr664_Banker.cr664_roletype` — a job-function enum (CommercialBanker/RelationshipManager/
  PortfolioManager/Support), now used client-side as an **interim, coarse proxy** (see
  `approvalAuthorityMatrix.ts`) — not a true approval limit or committee designation.
- A `"cr664_Role@odata.bind"` lookup exists on `cr664_platformusers`/`cr664_users`, but no
  generated model/service exists for whatever entity it points to — it is currently unreadable
  from the client even in principle.

**Before a server-side authority check can be built, someone needs to decide and add a real field**
(e.g. a `cr664_approvallimit` money field, or a `cr664_creditcommitteemember` boolean, or a lookup
to a dedicated approver/committee-membership table) and populate it for real bankers. Until then,
any server-side check can only be as good as the client-side interim proxy it's meant to replace.

## Also missing (out of scope for a security role, but related)

- **Document/task identity**: `cr664_documentchecklists` and `cr664_dealtask1s` have no structured
  document-type or task-type field — required-document/task matching is done by free-text
  substring match client-side (`loanWorkflowRules.ts`). A `cr664_documenttypecode` /
  `cr664_tasktypecode` lookup to a canonical checklist/task template table would let a future
  fix do identity matching instead of substring matching (audit finding H1).

## What to do with this runbook

This is a checklist for a Power Platform admin, not a code deliverable — nothing in this repo can
verify Dataverse security-role configuration. If/when roles are configured, note the change and
date here so future audits know this gap has been closed at the platform layer.

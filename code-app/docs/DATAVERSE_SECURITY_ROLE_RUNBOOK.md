# Dataverse security-role runbook — loan workflow stage/status writes

**Why this exists:** [LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md](LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md)
finding C1 established that every stage-gating, requirement, and approval-authority check in this
repository (`src/workflow/`, `src/access/`) is **client-side TypeScript only**. There are no
Dataverse plugins, business rules, or custom APIs anywhere in this codebase — `scripts/dataverse/`
only provisions tables/columns/data, never security. The generated service layer
(`src/generated/services/Cr664_loandealsService.ts`) performs **zero validation**: `update()` will
write any field to any record for any caller with ordinary Dataverse write access.

This is not fixable with a code change alone — this app has no backend of its own. **Update
(2026-07-14, second pass):** a synchronous Dataverse PreOperation plugin
(`dataverse-plugins/CommercialLendingLOS.Plugins/LoanDealStageAuthorityPlugin.cs`) has been
authored to close the CREDIT_APPROVAL authority gap specifically — see its own
`PLUGIN_DEPLOYMENT.md` for build/registration steps. **It has not been built, registered, or
deployed** (no `dotnet`/`pac`/Dataverse access in the session that wrote it) — until someone runs
those steps, this remains true: treat every client-side gate in `src/workflow` as **advisory UX
guidance, not a security boundary**. The broader field-level-security work below (restricting who
can write `cr664_StageReference`/`cr664_StatusReference` at all, independent of the specific
CREDIT_APPROVAL rule) is still a Power Platform admin task outside version control.

## What must be restricted

| Table / field | Today | Required |
|---|---|---|
| `cr664_loandeals.cr664_StageReference` (stage) | Any user with table write access can set this to any value via the Dataverse Web API directly, bypassing every gate in `src/workflow`. | Field-level security profile restricting write access to this column to a role that represents "governed stage-write app identity" (or equivalent), with individual-user write blocked outside the governed app flow. |
| `cr664_loandeals.cr664_StatusReference` (status — e.g. DECLINED/WITHDRAWN) | Same as above. | Same as above. |
| Advancing a deal OUT of `CREDIT_APPROVAL` specifically | Real authority fields now exist (see below) and the client (`src/workflow/creditApprovalAuthority.ts`) enforces them, plus a plugin has been **written** to enforce the same rule server-side — but that plugin is **not yet built/registered/deployed**, so today this is still bypassable via a direct Dataverse API call. | Build + register `LoanDealStageAuthorityPlugin` per its `PLUGIN_DEPLOYMENT.md`. |
| `cr664_dealstagereferences`, `cr664_dealstatusreferences` (reference tables) | Read/write scope not audited as part of this pass. | Confirm these are read-only to end users (governed reference data, not something a banker can edit directly). |

## Data model — PROVISIONED (2026-07-14, second pass)

The real approval-authority fields now exist on `cr664_banker` in the live org
(`org3a57b8d4.crm.dynamics.com`, solution `CommercialLendingLOS`):

| Column | Type | Meaning |
|---|---|---|
| `cr664_approvallimit` | Money | The banker's individual approval dollar limit. |
| `cr664_creditcommitteemember` | Boolean | Whether the banker sits on the credit committee. |
| `cr664_approvaloverrideauthority` | Boolean | Whether the banker can single-handedly clear the standard approval requirement (bypasses both the committee and limit checks). |

Provisioning is idempotent and re-runnable: `scripts/dataverse/create-banker-credit-authority-fields.ps1`
(dry-run by default; `-Apply` creates any still-missing column + publishes — this script only ever
touches schema, never a banker record). Assigning authority values to a specific banker is a
**separate, opt-in** script, `scripts/dataverse/seed-banker-credit-authority.ps1` (dry-run by
default; requires `-Apply -SeedFile <path>`; resolves bankers by email, never a hardcoded GUID).
Read-only verification: `scripts/dataverse/verify-banker-credit-authority.ps1`.

The client (`src/banker/BankerProvider.tsx`, `src/workflow/creditApprovalAuthority.ts`) reads these
fields via a documented stopgap type augmentation
(`src/banker/bankerCreditAuthorityFields.ts`) rather than the generated SDK model, because
`pac code add-data-source -a dataverse -t cr664_banker` (the real regen step) could not be run from
the session that wired this up — see that file's own comment for what to delete once a real
regeneration lands. `approvalAuthorityMatrix.ts`'s job-function role proxy is superseded and no
longer wired to anything live.

## Also missing (out of scope for a security role, but related)

- **Document/task identity**: `cr664_documentchecklists` and `cr664_dealtask1s` have no structured
  document-type or task-type field — required-document/task matching is done by free-text
  substring match client-side (`loanWorkflowRules.ts`). A `cr664_documenttypecode` /
  `cr664_tasktypecode` lookup to a canonical checklist/task template table would let a future
  fix do identity matching instead of substring matching (audit finding H1).
- **No generated SDK service/model for `cr664_loanrequestprofile`** exists in this app — nothing
  in the client reads it today, so the amount-precedence conflict check
  (`src/workflow/governedRequestedAmount.ts`) always runs with only one input (the deal amount) on
  the client side. Needs `pac code add-data-source -t cr664_loanrequestprofile` + a real query
  adapter before the client can cross-check it. The server-side plugin is not subject to this
  limitation (it queries Dataverse directly) — but its own lookup-relationship schema name is
  itself an unverified `TODO CONFIRM` (see `LoanDealStageAuthorityPlugin.cs`).

## What to do with this runbook

This is a checklist for a Power Platform admin, not a code deliverable — nothing in this repo can
verify Dataverse security-role configuration. If/when roles are configured, note the change and
date here so future audits know this gap has been closed at the platform layer.

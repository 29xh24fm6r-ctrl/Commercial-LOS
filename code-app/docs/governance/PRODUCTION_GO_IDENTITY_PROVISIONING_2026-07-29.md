# Production GO identity provisioning package — 2026-07-29

Status: **PREPARED; TENANT PROVISIONING AND DISTINCT-HUMAN CERTIFICATION NOT COMPLETE**

This package defines the exact identity chain required for the independent
credit, funding, and boarding controls. It does not assign placeholder people,
reuse Matthew's identity, or treat role switching as independent-user proof.
The machine-readable companion is
`production-go-identity-provisioning-manifest.json`; the read-only verifier is
`scripts/dataverse/verify-production-go-identity-readiness.ps1`.

## Live facts captured read-only

- Environment: `5f2d77a5-de50-edeb-9d74-5b2400a2320d`
- Organization: `https://org3a57b8d4.crm.dynamics.com`
- App: `63858e09-3d0b-47c9-b1d2-65cef742fda4`
- The only enabled Old Glory Bank Dataverse `systemuser` observed was
  `mpaller@oldglorybank.com`.
- Matthew's core-user row is
  `940a202e-756a-f111-ab0c-70a8a59be491`, but its
  `cr664_activeaccessflag` was `false`. That must be reconciled before the new
  server-side identity gate can admit Matthew as a governed actor.
- The initial live custom-role catalogs did not contain Credit Approver,
  Funding Approver, or Boarding Servicing Operator roles. The exact eight
  missing custom catalog rows were subsequently created idempotently; their
  live IDs are in the machine-readable manifest.
- The initial live `cr664_workspacetype` catalog contained only Banker
  Workspace. Team Workspace and Portfolio Management were added with
  `OPERATIONAL_CONTEXT` (`788190001`).
- The six live Platform Workspace rows are recorded by exact ID in the
  machine-readable manifest. Existing Team Workspace and Portfolio Management
  are reused; no fictional app route is introduced.
- The apparent `ckingma@oldglorybank.com` LOS profile is not an independent
  identity candidate until an enabled Dataverse system user, linked core user,
  linked platform user, active banker authority where required, and the human's
  own MFA are all proven.

## Required identity chain for every person

Every certification identity must resolve one-to-one through this chain:

1. A distinct enabled Microsoft Entra member account with the person's real
   UPN, Power Apps/Dataverse license, required Conditional Access posture, and
   the person's own MFA.
2. One enabled Dataverse `systemuser`, with `internalemailaddress` equal to the
   UPN.
3. `Basic User` plus exactly one least-privilege OGL LOS Dataverse security
   role listed below. System Administrator is prohibited for certification.
4. One active `cr664_user`, with matching `cr664_email`,
   `cr664_activeaccessflag=true`, required `cr664_role`, required
   `cr664_primaryworkspace`, and the correct team where team scope applies.
5. One active `cr664_platformuser`, with matching
   `cr664_normalizedemail`, `cr664_activestatus=true`,
   `_cr664_coreuser_value` equal to the core user, required `cr664_role`, and
   `_cr664_primaryworkspace_value` equal to the exact live Platform Workspace.
6. One active `cr664_losuserprofile`, with matching `cr664_username`,
   `_cr664_user_value` equal to the same core user, the required platform-role
   label, and the required primary-workspace label.
7. One active `cr664_workspaceentitlements` row for every required workspace,
   linked to the LOS profile and the correct `cr664_workspacetype`. Duplicate
   active profile/workspace pairs are a blocker.
8. Where banker authority is required, exactly one active `cr664_banker` with
   matching `cr664_email`, `_cr664_userloginmapping_value` equal to the same
   core user, and the role-specific authority fields below.

The server plug-in independently resolves items 2, 4, 5, and 8 from the
initiating Dataverse user. A client-supplied actor email cannot replace these
links.

## Catalog records provisioned

The following configuration records, which are not human identities, were
created on 2026-07-29:

| Catalog | Required new records |
|---|---|
| `cr664_platformrole` | `Credit Approver`; `Funding Approver`; `Boarding Servicing Operator` |
| `cr664_userrole` | `Credit Approver`; `Funding Approver`; `Boarding Servicing Operator` |
| `cr664_workspacetype` | `Team Workspace`; `Portfolio Management` |

Their generated IDs are recorded in the JSON manifest. The provisioning script
is idempotent by exact name, stops on duplicates, never updates an existing
row, and has no delete path. Existing Super Admin/System Super Admin records
were not used.

## Exact person-to-role mapping

| Identity | App/custom role and workspace | Authority and separation |
|---|---|---|
| Independent credit approver | Credit Approver; existing Team Workspace `3acb2366-10b2-459a-86bd-a66d86b19c9f`; Team Workspace entitlement | Active banker linked to the same core user; credit committee member; approval limit at least the controlled deal amount; no override unless separately approved; distinct from requester and originating banker |
| Funding approver 1 | Funding Approver; existing Team Workspace; Team Workspace entitlement | Distinct from requester, second approver, and funding confirmer |
| Funding approver 2 | Funding Approver; existing Team Workspace; Team Workspace entitlement | Distinct from requester, first approver, and funding confirmer; required at or above the server threshold of `$250,000` |
| Boarding/servicing operator | Boarding Servicing Operator; existing Portfolio Management `cc79727e-9ec6-429a-85d2-af6f44f98a4b`; Portfolio Management entitlement | Active banker linked to the same core user for booking-QC identity; no credit committee or override authority; distinct from requester, originator, credit approver, and both funding approvers when confirming funding/boarding |

## Dataverse security roles

Create these roles in the production solution and assign organization-scope
read only where the plug-in must resolve shared reference data. Use user/team
scope for operational rows wherever the current ownership model supports it.
No role receives Delete on the seven durable tables.

### Shared read floor for all three roles

- `systemuser`: own record read
- `cr664_user`, `cr664_platformuser`, `cr664_losuserprofile`,
  `cr664_workspaceentitlements`: organization read
- `cr664_loandeal`, `cr664_banker`, `cr664_dealstatusreferences`,
  `cr664_documentchecklist`: organization read
- seven durable record tables: organization read
- audit/timeline tables required by the existing write adapters: create and
  read; no delete
- app metadata/reference tables used by the assigned workspace: read

This read floor is required because the synchronous plug-in executes in the
initiating user's context and fails closed if the actor, deal, authority,
document, or prior-history row cannot be resolved.

### `OGL LOS Credit Approver`

- `cr664_creditapprovaldecision`: Create and Read; no Update/Delete
- deal/risk/memo/document evidence required for decision review: Read
- no funding authorization Update
- no boarded-loan Create/Update

### `OGL LOS Funding Approver`

- `cr664_fundingauthorization`: Read and Update
- document, condition, credit-decision, commitment, and deal evidence: Read
- no credit-decision Create
- no boarded-loan Create/Update

The plug-in restricts Update to the permitted approval/rejection/revocation
state machine and prevents requester self-approval and same-person dual
approval.

### `OGL LOS Boarding Servicing Operator`

- condition verification, executed-document attestation, booking-QC rows:
  Create and Read; no Update/Delete
- `cr664_fundingauthorization`: Read and Update only so a person distinct from
  both approvers can record the controlled funding-confirmation transition;
  actual funds movement is outside this application and is not authorized by
  this package
- portfolio boarded-loan and approved child tables: Create/Read/Update at the
  required team scope; no Delete
- servicing-owner assignment: Append/update only through the governed command
- credit-decision Create and approval authority: none

## Tenant and app assignment

For each named person, the tenant administrator must record:

- Entra object ID, UPN, account type Member, enabled state, license SKU, and
  production-environment security-group membership;
- Conditional Access policy result from managed Edge and successful MFA by
  that human;
- environment access and app share/assignment;
- Dataverse `systemuserid`, business unit, team membership, and the exact
  security-role IDs;
- all custom record IDs in the identity chain above.

The production app must be launched once by each person after propagation.
Navigation is not access proof: a direct Dataverse write outside the UI must
also be rejected for an unauthorized identity.

## Provisioning order

1. Tenant admin supplies the four real people/UPNs and confirms licensing,
   environment security group, Conditional Access, and MFA eligibility.
2. The three custom catalog-role pairs and two missing workspace-type records
   are complete. Tenant admin must create/approve the three Dataverse security
   roles from the privilege matrix above.
3. Add each human to the environment and wait for a unique enabled
   `systemuser`.
4. Create/link the core user, platform user, LOS profile, entitlement, and
   banker authority (only where required), using the same normalized UPN.
5. Run the read-only verifier with all four UPNs and preserve its JSON output:

   ```powershell
   powershell -File scripts/dataverse/verify-production-go-identity-readiness.ps1 `
     -CreditApproverUpn '<real-upn>' `
     -FundingApprover1Upn '<real-upn>' `
     -FundingApprover2Upn '<real-upn>' `
     -BoardingServicingOperatorUpn '<real-upn>' `
     -EvidencePath 'docs/governance/evidence/production-go/identity-readiness.json'
   ```

6. Require `READY_FOR_DISTINCT_HUMAN_LOGIN`; then each human completes their
   own managed-Edge MFA.
7. Execute the positive and negative multi-user certification. Capture
   `systemuserid`, durable actor fields, correlation IDs, timestamps, audit
   rows, timeline rows, and rejected-attempt evidence.

## Human gates still open

- Four distinct real UPN assignments and each person's login/MFA.
- Tenant administrator consent for environment/app/security-role assignment.
- Approval/creation of the three tenant Dataverse security roles and new human
  identities.
- Independent live certification. Until it passes, the Production GO verdict
  remains **NO-GO**.

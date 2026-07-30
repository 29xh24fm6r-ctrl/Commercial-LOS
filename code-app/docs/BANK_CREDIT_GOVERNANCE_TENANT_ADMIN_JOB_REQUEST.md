# Tenant-admin request: Dataverse governance alternate-key jobs

Environment: `5f2d77a5-de50-edeb-9d74-5b2400a2320d`

Organization: `d8c72df0-fd13-f111-afbe-000d3a34432b`
URL: `https://org3a57b8d4.crm.dynamics.com/`

Please inspect whether Administration mode has Background operations disabled.
If so, safely enable Background operations using the Power Platform admin
center. Do not cancel, delete, manually complete, or recreate these jobs:

| Alternate key | System job ID |
|---|---|
| `cr664_key_governanceprofile_bank` | `e2d4ea33-48f3-479e-95a3-207540ef3d64` |
| `cr664_key_policyversion_id` | `2bf4d6a0-3bf6-4391-b0e6-3b4b0b48984a` |
| `cr664_key_policyrule_id` | `7b9e2492-b4fd-465c-b02c-d851a0312fed` |
| `cr664_key_roleassignment_id` | `d0de4a23-4c45-47df-811b-5aa72af7108b` |
| `cr664_key_authoritygrant_id` | `1481b1fd-d75d-4c96-ac47-744aab847066` |
| `cr664_key_committee_id` | `f052873c-235b-4072-b6e9-5041f22fd0ad` |
| `cr664_key_membership_id` | `d3e4cf65-7ccf-4cd4-8973-f6ae5571ef24` |
| `cr664_key_actionevidence_id` | `3ad5fba3-cfd2-462c-8e20-52e6e1cd69f8` |
| `cr664_key_approvalvote_id` | `7c447c69-e1a5-49fe-b0f6-08cb16fbfb2d` |
| `cr664_key_evaluation_id` | `650b6295-df9c-4b37-8337-027a067ff3ea` |

Read-only diagnostics on 2026-07-30 found every index `Pending`, every job
`StateCode=1` / `StatusCode=10`, no `Started` or `Completed` timestamp, and a
past `PostponeUntil` time. After background processing is enabled, verify:

1. Each listed job reaches Completed/Succeeded without an error message.
2. Each corresponding `EntityKeyIndexStatus` reaches `Active`.
3. No duplicate or failed key exists.
4. Background operations remain in the institution-approved runtime state.

Policy, authority, committee, vote, evaluation, and approval records must
remain blocked until all ten key statuses are `Active`.

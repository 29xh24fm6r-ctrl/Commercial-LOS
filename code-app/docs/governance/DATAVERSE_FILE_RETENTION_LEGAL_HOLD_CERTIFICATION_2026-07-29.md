# Dataverse File retention and legal-hold certification — 2026-07-29

Status: **TENANT-ADMIN CONFIRMATION REQUIRED; NOT CERTIFIED**

Scope:

- environment `5f2d77a5-de50-edeb-9d74-5b2400a2320d`
- table `cr664_documentchecklist`
- file column `cr664_documentfile`
- related document audit and deal-timeline records

This checklist separates four controls that are often incorrectly collapsed:
live file durability, operational audit retention, recoverability, and
regulatory/legal retention. Passing a byte upload/download test proves only
durability; it does not prove retention or legal hold.

## Read-only live findings

Captured from the production Web API on 2026-07-29:

- Organization `org3a57b8d4`
  (`d8c72df0-fd13-f111-afbe-000d3a34432b`) reports
  `isauditenabled=false`, `isuseraccessauditenabled=false`, and
  `isreadauditenabled=false`.
- The legacy audit-retention field reports 30 days, but auditing is disabled
  and `auditretentionperiodv2` was null. This is not accepted as a working
  retention control.
- `IsAuditEnabled=false` for the checklist, application audit, deal timeline,
  all seven newer durable-record tables, and portfolio boarded-loan table.
- The `cr664_documentfile` File attribute exists, has
  `MaxSizeInKB=25600`, and reports column auditing enabled, but table and
  environment auditing are disabled, so this does not produce the required
  audit history.

These are tenant/configuration blockers. This work did not silently enable
auditing or choose a records-retention period on behalf of the bank.

## Microsoft platform constraints

- Dataverse long-term retention (LTR) can retain custom tables and associated
  attachments/images, keeps retained data in Dataverse as read-only data, and
  requires a Managed Environment for enabled policies. Retained rows cannot be
  returned to live/active state. See
  [Dataverse long-term retention overview](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/data-retention-overview).
- Dataverse audit tables are not supported by Dataverse LTR. Audit retention
  therefore requires its own setting and evidence; it cannot inherit the
  document-row policy. The environment audit retention setting can be
  `Forever` or a custom period, with new audit rows stamped under the active
  period. See
  [Manage Dataverse auditing](https://learn.microsoft.com/en-us/power-platform/admin/manage-dataverse-auditing).
- Production Managed Environments support backup retention of 7, 14, 21, or
  28 days. A backup is disaster recovery, not a records-retention or legal-hold
  policy. See
  [Back up and restore environments](https://learn.microsoft.com/en-us/power-platform/admin/backup-restore-environments).
- Deleted-record recovery must be explicitly enabled and applies only to
  deletions after enablement; the configurable period is 1–30 days. See
  [Restore deleted Dataverse table records](https://learn.microsoft.com/en-us/power-platform/admin/restore-deleted-table-records).
- Dataverse exposes explicit file-delete operations. Authorization and the
  application/server boundary must therefore deny Delete; storage existence
  alone is not a retention control. See
  [Use File column data](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/file-column-data).
- Microsoft Purview Preservation Lock makes a supported Purview retention
  policy unable to be disabled, deleted, or made less restrictive, but that
  must not be represented as covering Dataverse rows/files unless the tenant
  administrator and Microsoft-supported workload scope prove it. See
  [Preservation Lock](https://learn.microsoft.com/en-us/purview/retention-preservation-lock).

## Tenant administrator evidence form

The tenant administrator must populate every value and attach screenshots or
exported configuration. Blank, inferred, or merely recommended values are a
FAIL.

### A. Environment and recoverability

| Setting | Exact admin location | Required evidence |
|---|---|---|
| Environment type | Power Platform admin center > Manage > Environments > target environment | `Production` |
| Managed Environment | Environment details | Enabled, or LTR policy execution is blocked |
| Environment security group | Environment details/access | Group object ID and membership owner |
| Backup retention | Environment > Edit > Backup retention | Configured days (7/14/21/28), effective timestamp, admin |
| Restore capacity | Capacity report | At least 1 GB free and most recent restorable system-backup timestamp |
| Keep deleted Dataverse records | Settings > Product > Features > Deleted records | Enabled/disabled, retention days (1–30), enablement timestamp, background-job success |

### B. File and table configuration

| Setting | Required confirmation |
|---|---|
| `cr664_documentchecklist` table auditing | `IsAuditEnabled=true` |
| `cr664_documentfile` metadata | File attribute exists; exact `MaxSizeInKB`; allowed upload policy recorded |
| File privileges | Banker/uploader can create/update/read allowed rows; reviewer can read/download; unauthorized identity fails read/write/download/delete |
| Delete privileges | No operating/certification role has Delete on the checklist table; no app command exposes File `DELETE`/`DeleteFile` |
| Parent/child retention scope | Exact LTR root table, relationship scope, and proof that the checklist file attachment is included |
| Retain/delete plug-in behavior | Evidence that LTR `Retain` and cascade/delete logic cannot bypass the durable-history controls |

### C. Dataverse auditing

At Power Platform admin center > Manage > Environments > target > Settings >
Audit and logs > Audit settings, capture:

- Start Auditing: enabled.
- Log access: enabled or a signed risk acceptance explaining why it is not.
- Read logs: enabled where licensing permits, with proof of arrival in Purview.
- Audit retention: the exact value. For Production GO, use `Forever` until the
  records owner and counsel approve a finite period.
- Table auditing enabled for:
  - `cr664_documentchecklist`
  - `cr664_auditevent`
  - `cr664_dealtimelineevent`
  - `cr664_creditapprovaldecision`
  - `cr664_commitmentrecord`
  - `cr664_conditionverification`
  - `cr664_executeddocattestation`
  - `cr664_bookingqccheck`
  - `cr664_adverseactionrecord`
  - `cr664_fundingauthorization`
  - `cr664_portfolioboardedloan`
- Column auditing enabled for file metadata/status, requirement state,
  waiver/reviewer fields, actor fields, correlation IDs, supersession fields,
  lifecycle status, funding approvers/date, boarding status, servicing owner,
  and risk rating.
- A change made after enablement appears in record audit history and through
  the audit API with the initiating `systemuserid`, old/new value, timestamp,
  operation, and object ID.

Do not run an audit-log delete job during certification. Deleted audit logs are
not recoverable.

### D. Long-term retention policy

The bank records owner and tenant administrator must approve and record:

- policy display name and immutable policy/configuration ID;
- solution containing the Data Life Cycle Config;
- root table and exact view/filter criteria;
- retention schedule citation and number of years;
- first eligible date and run cadence;
- retain-only versus retain-then-delete disposition;
- policy state and most recent run ID/status/reconciliation count;
- proof the controlled sample's row and file attachment are readable from the
  retained data source after a test run in an approved nonproduction
  environment;
- the approved production activation/change ticket.

Only inactive/closed records that no longer participate in transactional
workflows may enter LTR. A production policy run is an irreversible transition
of matched data out of live state and requires separate approval.

### E. Legal hold

The bank's records/legal owner must answer, in writing:

1. Is Dataverse LTR the approved system of record for held commercial-loan
   documents, or must a supported immutable archive/eDiscovery connector
   receive a copy?
2. What event starts retention: creation, closing, payoff, relationship
   termination, litigation notice, or another event?
3. What is the required period and jurisdictional schedule?
4. Who can place/release a hold, and what two-person approval is required?
5. Does the hold cover file bytes, checklist metadata, every superseded
   version, audit history, timeline events, approvals, and boarding/servicing
   records?
6. What prevents File `DELETE`, row delete, LTR expiry, audit-log deletion,
   backup expiry, and key revocation while a hold is active?
7. How are hold searches, exports, chain of custody, and release documented?

If Purview Preservation Lock is selected, capture the supported workload scope,
policy ID, locked state, locations, retention duration/disposition, and
licensing. Do not apply Preservation Lock casually: after locking, even a
global administrator cannot disable/delete the policy or make it less
restrictive.

## Live file certification procedure

Use a non-sensitive approved fixture and a controlled deal/checklist row:

1. Record local filename, MIME type, byte count, and SHA-256.
2. Upload to `cr664_documentfile`.
3. Download `.../cr664_documentfile/$value` with the uploader identity.
4. Compare byte count and SHA-256 exactly; metadata-only equality is
   insufficient.
5. Repeat authorized download with the reviewer identity.
6. Prove an unauthorized distinct identity receives access denied for row,
   file download, upload, and delete.
7. Prove upload success changed requirement state only after byte readback.
8. Reopen the app/session and download again to prove durable readback.
9. Reconcile the checklist row, FileAttachment metadata, audit row, timeline
   row, actor, and correlation ID.
10. Confirm no cleanup deletes the certification artifact until the records
    owner approves its disposition under the policy.

## Certification gates

| Gate | Pass condition |
|---|---|
| RET-1 | Managed Environment and backup/deleted-record settings captured |
| RET-2 | Environment, table, and column auditing proven; retention value approved |
| RET-3 | LTR policy scope includes the checklist row and associated file bytes without affecting active records |
| RET-4 | Legal owner confirms hold architecture, period, trigger, disposition, and release controls |
| RET-5 | Upload/download byte hashes match across sessions and authorized identities |
| RET-6 | Unauthorized read/write/download/delete attempts fail |
| RET-7 | Audit/timeline/requirement-state evidence reconciles to one correlation ID |
| RET-8 | Recovery and held-record retrieval are demonstrated in an approved test environment |

Production GO remains **NO-GO** until all eight gates pass. Tenant administrator
confirmation is intentionally still open.

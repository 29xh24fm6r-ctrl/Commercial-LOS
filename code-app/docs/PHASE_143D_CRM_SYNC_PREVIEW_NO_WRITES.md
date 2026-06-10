# Phase 143D — CRM Account/Contact/Opportunity Sync Preview (No Writes)

> **Preview only, no writes.** Produces a preview-only plan of what a future sync
> WOULD do for Salesforce/nCino account/contact/opportunity/task/activity/nCino
> loan-workflow objects. Operations use `would_*` verbs only; conflicts block write
> items.

## What was added
- `src/crm/syncPreview/crmSyncPreviewPlan.ts` — `deriveCrmSyncPreviewPlan`.

## Plan entities / operations
Entities: account, contact, opportunity, task, activity, ncino_relationship,
ncino_loan, ncino_document_checklist. Operations: `no_op`, `would_create`,
`would_update`, `would_link`, `would_skip`, `blocked`.

## Result / rules
`previewOnly: true`, `liveWritePerformed: false`, `crmRecordCreated: false`,
`crmRecordUpdated: false`, `crmRecordLinked: false`, `externalSystemChanged: false`.
Uses "would create/update/link", never "created/updated/linked". No live calls, no
PATCH/POST/PUT/DELETE, no fake success. Conflicts block write-preview items.

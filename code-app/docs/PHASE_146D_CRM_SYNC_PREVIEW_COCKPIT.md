# Phase 146D — CRM Sync Preview Cockpit

> **Preview-only cockpit / docs / model only.** Makes sync preview plans
> visible. No CRM records created, updated, or linked. `previewOnly: true`.

## What was added

- Sync preview cockpit rendering Phase 143D sync preview plans in a
  structured, bucketed view.
- Bucket display: `would_create`, `would_update`, `would_link`,
  `would_skip`, `blocked`, `no_op`.

## Sync preview buckets

| Bucket | Description |
|---|---|
| `would_create` | Entities that would be created if sync were live |
| `would_update` | Entities that would be updated if sync were live |
| `would_link` | Entities that would be linked if sync were live |
| `would_skip` | Entities that would be skipped due to policy rules |
| `blocked` | Entities blocked by writeback policy gate |
| `no_op` | Entities already in sync; no action needed |

All buckets show projected actions only. No action is executed.

## Drill-through

Each bucket row supports drill-through to the underlying entity detail
using Phase 144 deep-link primitives.

## Safety posture

- `readOnly: true`
- `previewOnly: true`
- `dryRunOnly: true`
- `liveWritePerformed: false`
- `salesforceWritePerformed: false`
- `ncinoWritePerformed: false`
- `externalSystemChanged: false`
- `allowedForLiveWriteNow: false`
- `crmRecordCreated: false`
- `crmRecordUpdated: false`
- `crmRecordLinked: false`

No CRM records created, updated, or linked. No external calls.
No permission widening.

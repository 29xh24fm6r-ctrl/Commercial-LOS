# Phase 146B — CRM Source-of-Truth Cockpit

> **Read-only cockpit / docs / model only.** Makes source-of-truth ownership
> operational and visible. Shows LOS/Salesforce/nCino owners per domain.
> No edits. No owner mutation. No source-of-truth switch.

## What was added

- Source-of-truth cockpit rendering Phase 143A domain ownership in a
  structured, per-domain view.
- LOS/Dataverse owner, Salesforce owner, and nCino owner displayed for
  each domain.
- Drill-through per domain using Phase 144 drill-through primitives.

## Domain ownership display

Each domain row shows: domain name, LOS/Dataverse owner, Salesforce owner,
nCino owner, proposed read source, conflict rule, and activation status.
All values are sourced from the Phase 143A source-of-truth map. No value
is editable.

## Drill-through

Each domain row supports drill-through to the underlying source-of-truth
detail. Drill-through targets use Phase 144 deep-link primitives.

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

No edits. No owner mutation. No source-of-truth switch. No CRM calls.
No permission widening.

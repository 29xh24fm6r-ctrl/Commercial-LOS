# Phase 146G — Manager CRM Pipeline Intelligence

> **Read-only intelligence / docs / model only.** Manager-level CRM pipeline
> KPIs. Read-only. No assignment mutation. No CRM write.

## What was added

- Manager CRM pipeline intelligence cockpit rendering aggregate KPIs
  across banker teams and CRM domains.
- Drill-through per KPI using Phase 144 deep-link primitives.

## Manager pipeline KPIs

| KPI | Description |
|---|---|
| Match conflicts | Count of unresolved entity match conflicts across team |
| SF readiness gaps | Salesforce connector readiness gaps by domain |
| nCino readiness gaps | nCino connector readiness gaps by domain |
| Sync blocked count | Count of entities blocked from sync by writeback policy |
| Banker workload | Review task distribution across bankers |
| Activity gaps | Count of relationships with stale activity signals |

All KPIs are derived from Phase 143 read-only models. No value is
fabricated or estimated.

## Drill-through

Each KPI supports drill-through to the underlying detail using Phase 144
deep-link primitives. Drill-through targets include per-banker breakdowns,
per-domain breakdowns, and entity-level detail.

## What is explicitly excluded

- No assignment mutation (cannot reassign bankers or deals).
- No CRM write of any kind.
- No Dataverse write.
- No team roster modification.

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

No assignment mutation. No CRM write. No permission widening.

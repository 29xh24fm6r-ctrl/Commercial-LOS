# Phase 143B — Salesforce/nCino Connector Readiness Audit (No Live Writes)

> **No live writes.** Audits whether a Salesforce or nCino connector's
> documentation/configuration prerequisites appear in place, WITHOUT calling any
> provider, testing credentials, or storing secrets. `configured: true` can only
> reach `ready_for_dry_run` — never live.

## What was added
- `src/crm/connectors/crmConnectorReadiness.ts` — `auditCrmConnectorReadiness`.

## Input / result
Input: provider (`salesforce`|`ncino`), configured/authConfigured/endpointConfigured/
objectMapDocumented/fieldMapDocumented/writePolicyDocumented/rollbackDocumented
booleans, mode `disabled_by_default`. Result: status (`not_configured`|`blocked`|
`ready_for_dry_run`|`rejected`), `liveConnectionAttempted: false`,
`liveWritePerformed: false`, `credentialsStored: false`,
`externalSystemChanged: false`, blockers/warnings, deterministic `readinessProofId`.

## Rules / safety posture
Never call providers; never test credentials live; never include endpoint URLs,
secrets, or env vars. `configured: true` produces at most `ready_for_dry_run`.
Every outcome keeps all live-effect flags false.

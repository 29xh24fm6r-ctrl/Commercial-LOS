# Phase 247 — Token-Backed Live Schema Measurement and Runtime Evidence Refresh

## Outcome

**Token-backed live measurement was ATTEMPTED but could not complete (Dataverse returned
`401`). No live gate changed. `enabledCount = 1 / 6`. `fullLaunchAchieved = false`.
`pac code push` NOT performed.**

- **CRM live measurement result:** NOT measured — `live = 0/0` (token rejected).
- **Portfolio live measurement result:** NOT measured — `live = 0/0` (token rejected).
- **CRM verified-state hydration result:** NOT hydrated.
- **Portfolio verified-state hydration result:** NOT hydrated.

The committed evidence was refreshed only from the **real** verifier output (which is
`UNKNOWN` / `live=0/0`), not fabricated. `live=5/5` and `live=13/13` were NOT hardcoded.

## pac org target

```text
Connected as : mpaller@oldglorybank.com
Environment  : Matthew Paller's Environment
Org URL      : https://org3a57b8d4.crm.dynamics.com/
Org ID       : d8c72df0-fd13-f111-afbe-000d3a34432b
Environment  : 5f2d77a5-de50-edeb-9d74-5b2400a2320d
```

## Token-backed verifier command

A new read-only export script performs token-backed measurement and emits a typed
evidence artifact consumed by `runtimeVerifiedSchemaBridge`:

```powershell
powershell -File scripts/dataverse/export-runtime-schema-evidence.ps1
```

The token path (`scripts/dataverse/_common.ps1 :: Get-DataverseToken`) was enhanced to
also use the Az PowerShell module (`Get-AzAccessToken`) in addition to
`$env:DATAVERSE_ACCESS_TOKEN` and the `az` CLI. A new `Test-DataverseToken` validates the
token against the org via `WhoAmI` before any measurement.

**What happened:** a token was issued for `mpaller@oldglorybank.com`, but every Dataverse
Web API call (`WhoAmI`, `EntityDefinitions`) returned **`401 Unauthorized`**. The token's
calling application is not a provisioned application user with Web API access in this org
(a common Dataverse restriction on Az-issued tokens). `pac` is connected and the user has
access, but `pac` does not expose a raw Web API bearer token, and no
`$env:DATAVERSE_ACCESS_TOKEN` was set. So the live measurement could not run, and the
script correctly emitted fail-closed evidence (`live=0/0`) rather than a fabricated PASS.

## CRM measured result

```text
[247][runtime-evidence-crm] STATUS=UNKNOWN services=5/5 datasources=5/5 live=0/0 tokenOk=False
```
Artifact: `scripts/dataverse/evidence/runtime-schema-evidence.crm.json`
(`measured: null`, `tokenValidated: false`).

## Portfolio measured result

```text
[247][runtime-evidence-portfolio] STATUS=UNKNOWN services=13/13 datasources=13/13 live=0/0 tokenOk=False
```
Artifact: `scripts/dataverse/evidence/runtime-schema-evidence.portfolio.json`
(`measured: null`, `tokenValidated: false`).

## Bridge hydration result

`runtimeVerifiedSchemaBridge` fails closed on this evidence: `live=0/0` (zero-total) and
no measured schema → `hydrated: false` for both CRM and portfolio. The runtime gates stay
disabled (they require the hydrated verified state AND the live flag AND an authorized
operator AND an injected transport — none of which are present).

A test (`runtimeSchemaEvidenceArtifact.test.ts`) also proves that an **authorized**
measurement (`live=5/5` / `13/13` with a measured schema meeting the plan) DOES hydrate —
so the export format is bridge-compatible and only the live token access is missing.

## Gates still disabled

```text
CRM_LIVE_PERSISTENCE_ENABLED                = false  (unchanged)
PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED = false  (unchanged)
PORTFOLIO_BOARDING_ROUTE_ENABLED            = false  (unchanged)
PRODUCTION_ENVIRONMENT_CERTIFICATION        = only newDealCreate true  (unchanged)
Document checklist / borrower / Outlook     = false / UNKNOWN (untouched)
```

`pac code push` was **not performed**.

## Remaining blockers

1. Provide a Dataverse-**authorized** token so the Web API accepts it (not a plain
   Az-issued token that 401s). Options:
   - Set `$env:DATAVERSE_ACCESS_TOKEN` to a token whose app is an allowed/registered
     application user in this org, **or**
   - register the calling app as an application user with the required Web API role, **or**
   - run from an identity/app that Dataverse already trusts (e.g. the `pac`-trusted client).
2. Re-run `scripts/dataverse/export-runtime-schema-evidence.ps1`. With a valid token it
   measures `live=5/5` (CRM) / `live=13/13` (portfolio) plus columns + required
   relationships, and emits `measured` blocks.
3. Transcribe that real output into `CURRENT_CRM_VERIFICATION_EVIDENCE` /
   `CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE`; the bridge then hydrates the verified state.
4. Record a controlled production smoke, then flip the governed gate under the separate
   cutover. Checklist (lending-owner signoff) and borrower (Outlook connector) remain
   independent blockers.

## Safety

No live gate flipped, no `pac code push`, no faked PASS, no hardcoded `live=5/5` /
`live=13/13`, no weakening of the bridge's fail-closed behavior, and no checklist or
borrower/Outlook state touched. The export script is read-only (GET only).

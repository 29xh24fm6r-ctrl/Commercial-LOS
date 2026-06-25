# Phase 248 — PAC-Backed Live Table Access Evidence

## Outcome

**Live table reachability is PROVEN via PAC (CRM 5/5, portfolio 13/13). Web API metadata
remains blocked/UNKNOWN. Runtime verified state did NOT hydrate. No live gate changed.
`enabledCount = 1 / 6`. `fullLaunchAchieved = false`. `pac code push` NOT performed.**

This phase adds a genuinely new evidence dimension: `pac org fetch` confirms every
expected table exists and is queryable, even though the Web API EntityDefinitions channel
still 401s. The bridge was NOT modified — PAC reachability does not measure column or
relationship metadata, so per the unchanged bridge policy the runtime verified state stays
fail-closed.

## PAC target

```text
Connected as : mpaller@oldglorybank.com
Environment  : Matthew Paller's Environment
Org URL      : https://org3a57b8d4.crm.dynamics.com/
```

## Method

New read-only verifier `scripts/dataverse/verify-pac-table-access.ps1` runs, per expected
logical table, a `pac org fetch` with `FetchXML` `count=1`. Classification (fail-closed):

| Result | Outcome |
| --- | --- |
| exit 0, no `Error:` line (incl. "No results returned") | **reachable (PASS)** |
| `...was not found in the MetadataCache` | missing_entity (FAIL) |
| `401` / unauthorized / not connected | auth_error (FAIL) |
| any other non-zero exit / `Error:` / parse issue | failed (FAIL) |

A zero-row "No results returned" is treated as reachability PASS (the table exists and is
queryable).

## Evidence dimensions (distinct)

| Dimension | Result |
| --- | --- |
| Table reachability via PAC fetch | **PASS** — CRM 5/5, portfolio 13/13 |
| SDK / data-source / service presence | **PASS** — generated 5/5 + 13/13, data sources registered |
| Web API metadata measurement (columns/relationships) | **blocked / UNKNOWN** — token 401 |
| Runtime full hydration | **NO** — bridge requires measured metadata, which is absent |

## CRM PAC table access result

```text
[248][pac-table-access-crm] STATUS=PASS reachable=5/5 webApiMetadata=UNKNOWN
```
All five `cr664_crm*` tables: `reachable`. Artifact:
`scripts/dataverse/evidence/pac-table-access.crm.json`.

## Portfolio PAC table access result

```text
[248][pac-table-access-portfolio] STATUS=PASS reachable=13/13 webApiMetadata=UNKNOWN
```
All thirteen `cr664_portfolioboardedloan*` tables: `reachable`. Artifact:
`scripts/dataverse/evidence/pac-table-access.portfolio.json`.

## Web API metadata

**Not measured.** The raw Dataverse Web API token remains rejected (`401` on `WhoAmI` /
`EntityDefinitions`), so live column and relationship metadata was NOT newly measured. We
do not claim Web API metadata measurement succeeded.

## Runtime hydration

**Did not hydrate.** `runtimeVerifiedSchemaBridge` is unchanged and still requires a
measured schema (columns/required relationships, zero conflicts). PAC reachability +
generated-schema presence do not satisfy that requirement, so
`hydrateVerifiedCrmSchemaState` / `hydrateVerifiedBoardingSchemaState` on the current
evidence return `hydrated: false`. The bridge fail-closed behavior was preserved, not
weakened.

## Gates / deployment

```text
CRM_LIVE_PERSISTENCE_ENABLED                = false  (unchanged)
PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED = false  (unchanged)
PORTFOLIO_BOARDING_ROUTE_ENABLED            = false  (unchanged)
PRODUCTION_ENVIRONMENT_CERTIFICATION        = only newDealCreate true  (unchanged)
Document checklist / borrower / Outlook     = false / UNKNOWN (untouched)
```

`pac code push` was **not performed**.

## Remaining blockers

1. **Measure Web API metadata** — provide a Dataverse-authorized token (the Az-issued
   token 401s) so `export-runtime-schema-evidence.ps1` can measure live columns +
   required relationships and emit a `measured` block.
2. **Hydrate** — transcribe that real measured output into the bridge's
   `CURRENT_*_VERIFICATION_EVIDENCE`; the bridge then hydrates the verified state.
3. **Smoke + gate flip** — record a controlled production smoke, then flip the governed
   gate under the separate cutover (still requires flag + hydrated state + authorized
   operator + injected transport, all fail-closed).
4. Document checklist (lending-owner signoff) and borrower (Outlook connector) remain
   independent UNKNOWN blockers, untouched here.

## Safety

No live gate flipped, no `pac code push`, no faked metadata measurement, no weakening of
`runtimeVerifiedSchemaBridge`, and no checklist or borrower/Outlook state touched. The PAC
verifier is read-only (FetchXML queries only).

# Live Index Rates — Decision Record (RATE-0)

**Status:** Decision record / plan. **No app code is implemented for this feature yet.**
This is Piece 2 of the "Portfolio Manager Assignment + Governed Live Index Rates" spec.

App code (adapter, UI wiring) must NOT be built until:
1. `cr664_indexrate` exists in the solution, and
2. the SDK is regenerated, and
3. the source decision below is approved by the bank / compliance.

---

## Context — current state (intentionally manual)

Authoritative file: `src/portfolio/variableRate/rateIndexModel.ts`.

There is currently **no live external rate feed and no Dataverse rate-index table**. Index values are
**not fabricated**: an operator enters the current value, its effective date, and a source.

```ts
RateIndexType  = 'Prime' | 'SOFR' | '5-Year Treasury' | 'Other'
RateIndexValue = { indexType: RateIndexType; value: number /* percent */; effectiveDate: string; source: string }
buildRateIndexBook()   // existing book builder — to be FED by live rows, not replaced
```

## Product requirement

The **Current index values** section should auto-populate with authoritative live/scheduled index
rates while still allowing operator override. The live feed becomes another **source** of
`RateIndexValue` rows that feed the existing model — it does not replace it.

---

## Decisions

### D1 — Ingestion runtime: **Power Automate scheduled cloud flow**
No browser-side external API calls from the React component. Reasons: CORS risk, API-key exposure to
users, no server-side audit trail, no governed retry/failure record, and reference data must be
bank-controlled. Power Automate fits the existing Microsoft/Dataverse environment, keeps keys and
retrieval server-side, writes rows directly to Dataverse, and can be governed and audited.

> Revisit an **Azure Function** later only if Power Automate cannot meet auth/retry/transform/monitoring
> requirements, or if the bank centralizes all reference-data ingestion in Azure.

### D2 — Data source (Phase 1): **Option A — FRED aggregator** *(pending compliance approval)*
Use FRED for all three indexes with one ingestion pattern, storing the original publisher in the
source label for traceability:

| RateIndexType     | FRED series | Original publisher                | Stored source label                                  |
|-------------------|-------------|-----------------------------------|------------------------------------------------------|
| SOFR              | `SOFR`      | New York Fed                      | `FRED: SOFR, sourced from New York Fed`              |
| 5-Year Treasury   | `DGS5`      | U.S. Treasury (Daily Treasury CMT)| `FRED: DGS5, sourced from U.S. Treasury`            |
| Prime             | `DPRIME`    | Federal Reserve H.15              | `FRED: DPRIME, sourced from Federal Reserve H.15`   |

**Option B (primary publishers)** — SOFR from NY Fed, 5-Year CMT from Treasury, Prime from Fed H.15 —
is the cleaner examiner story but multiplies source formats and parsing/testing brittleness. Chosen
only if compliance rejects FRED as source of record. **This choice requires bank/compliance sign-off
before RATE-1.**

Reference series:
- FRED API: https://fred.stlouisfed.org/docs/api/fred/
- DGS5 (5-Year Treasury CMT): https://fred.stlouisfed.org/series/DGS5
- SOFR (NY Fed): https://www.newyorkfed.org/markets/reference-rates/sofr

### D3 — Refresh cadence: **daily, business days, 9:30 AM Central** (after expected publication)

### D4 — Staleness threshold: **3 business days**
- ≤ 3 business days old → **Current**.
- > 3 business days old → **Stale** (show warning; do not silently price on it).
- No row → **manual-entry required**.

### D5 — Manual override is **persisted**, not session-only
An override writes a manual `RateIndexValue` row into `cr664_indexrate` with
`cr664_ismanualoverride = true`, `cr664_enteredby = current user`, an operator effective date, an
operator source label, and required notes. Rationale: examiner/audit traceability, reproducible
pricing, operator accountability, consistency with the effective-dated model.

**Precedence:** newest effective-dated row per index type wins; on a tie, the manual override wins;
the UI must show that it is a manual override.

### D6 — History is **append-only**
Never overwrite historical rates. Corrections are new rows with source + retrieved-at metadata.

---

## Data model — `cr664_indexrate` (RATE-1 provisions this; do not code against it until it exists)

| Logical name                    | Type                        | Notes                                     |
|---------------------------------|-----------------------------|-------------------------------------------|
| `cr664_name`                    | Text                        | Display key                               |
| `cr664_indextype`              | Choice/Text                 | Matches `RateIndexType`                    |
| `cr664_ratevalue`              | Decimal                     | Percent value                             |
| `cr664_effectivedate`          | Date only                   |                                           |
| `cr664_sourcelabel`            | Text                        | e.g. `FRED: SOFR, sourced from New York Fed` |
| `cr664_sourceurl`              | Text (optional)             |                                           |
| `cr664_sourceseriesid`         | Text (optional)             | e.g. `SOFR`, `DGS5`, `DPRIME`             |
| `cr664_retrievedat`            | DateTime                    |                                           |
| `cr664_ingestionrunid`         | Text                        | Power Automate run id                     |
| `cr664_ingestionstatus`        | Choice/Text                 | `success` \| `warning` \| `failed`        |
| `cr664_ismanualoverride`       | Boolean                     |                                           |
| `cr664_enteredby`              | Lookup/User (optional)      | For manual rows                           |
| `cr664_notes`                  | Multiline text (optional)   | Required for manual override              |

**Idempotency key:** `cr664_indextype + cr664_effectivedate + cr664_sourcelabel + cr664_ismanualoverride`.

---

## Planned app integration (RATE-3/4 — after table + SDK exist)

- New adapter `src/portfolio/variableRate/liveRateIndexAdapter.ts` maps `cr664_indexrate` rows →
  `RateIndexValue[]`, preserving source + effective date, marking stale/manual separately, failing
  closed on missing/invalid values.
- Feed those rows into the existing `buildRateIndexBook()` (do not replace it). If staleness metadata
  is needed, wrap the result:

  ```ts
  type LiveRateIndexStatus = {
    values: RateIndexValue[];
    staleIndexes: RateIndexType[];
    missingIndexes: RateIndexType[];
    source: 'dataverse-indexrate';
  }
  ```
- Variable Rate Control Center shows: index type, rate value, effective date, source, retrieved at,
  and fresh/stale/manual-override status; manual override remains available; blank boxes become
  `No sourced index rate on file. Enter a manual rate or run the index-rate ingestion flow.`

## Prerequisite / sequencing

Live index rates are only observable after the portfolio extended attributes are live:
provision `cr664_extendedloanattributes`, flip the write flag, deploy, board a variable-rate loan with
real rate terms, and confirm the Variable Rate Control Center sees the variable loan. **Then**:
provision `cr664_indexrate` → configure ingestion flow → run ingestion → regenerate SDK → wire adapter
→ wire UI → deploy.

## Security / governance (non-negotiable)
- **Do not:** put API keys in browser code; fetch rate APIs client-side; fabricate missing rates;
  silently reuse stale rates; overwrite historical rows; hide source/effective date.
- **Do:** keep ingestion server-side; store source + effective date; append-only history; flag
  stale/missing rates visibly; keep the manual fallback; require notes/source for manual override.

## Open items requiring sign-off
1. **Source of record:** FRED aggregator (Option A) vs primary publishers (Option B) — **compliance**.
2. FRED API key storage location (server-side secret in the flow / environment variable).
3. Confirmation of the 9:30 AM CT cadence vs each source's actual publication time.

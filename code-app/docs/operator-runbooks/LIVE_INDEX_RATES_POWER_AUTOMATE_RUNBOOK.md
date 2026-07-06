# Operator Runbook — Live Index Rate Daily Ingestion (Power Automate) [RATE-2]

**Status:** Runbook / plan. Build this flow only after `cr664_indexrate` is provisioned (RATE-1) and
the source decision is approved (see `docs/LIVE_INDEX_RATES_DECISION_RECORD.md`).

**Flow name:** `OGB LOS Index Rate Daily Ingestion`
**Owner:** Portfolio operations
**Runtime:** Power Automate scheduled cloud flow (server-side; no browser calls)
**Writes to:** Dataverse table `cr664_indexrate` (append-only)

---

## 1. Prerequisites
- `cr664_indexrate` exists in the solution with Read/Create granted to the flow's connection identity
  and Read granted to the app-user security role (same failure mode as any unprovisioned table).
- Source approved (Phase 1 default: **FRED aggregator**). FRED API key stored as an **environment
  variable / secure input** in the flow — never in app code, never in the table.
- Series ids configured: `SOFR`, `DGS5`, `DPRIME` (see decision record for the source-label mapping).

## 2. Schedule
- **Recurrence:** daily.
- **Time:** 09:30 Central Time.
- **Business days only:** in the flow, short-circuit on Saturday/Sunday (check `dayOfWeek`); bank
  holidays produce no new observation and are handled by the staleness guard, not a schedule change.

## 3. Flow steps (per configured index: SOFR, DGS5, DPRIME)

1. **Fetch** the latest observation from the approved source (FRED series endpoint) using the secured
   API key. Request the most recent observation for the series.
2. **Validate** (all must pass, else treat as a failed fetch for that index — do NOT write a row):
   - value is numeric,
   - value is non-negative,
   - effective date exists,
   - source series id exists,
   - observation is not older than the allowed staleness threshold (3 business days) — if older, still
     record it but set `cr664_ingestionstatus = warning` so the UI can flag stale.
3. **Idempotent upsert** into `cr664_indexrate` keyed on
   `cr664_indextype + cr664_effectivedate + cr664_sourcelabel + cr664_ismanualoverride(false)`:
   - `cr664_indextype`         → mapped RateIndexType (`SOFR` → SOFR, `DGS5` → 5-Year Treasury, `DPRIME` → Prime)
   - `cr664_ratevalue`         → observation value (percent)
   - `cr664_effectivedate`     → observation date
   - `cr664_sourcelabel`       → e.g. `FRED: SOFR, sourced from New York Fed`
   - `cr664_sourceurl`         → source/series URL
   - `cr664_sourceseriesid`    → `SOFR` | `DGS5` | `DPRIME`
   - `cr664_retrievedat`       → flow run timestamp (UTC)
   - `cr664_ingestionrunid`    → Power Automate run id
   - `cr664_ingestionstatus`   → `success` | `warning`
   - `cr664_ismanualoverride`  → `false`
   - Existing row for the same key → do nothing (never duplicate, never overwrite history).
4. **On fetch/validation failure for an index:**
   - Do **not** fabricate a rate.
   - Write an ingestion-failure event if a failure-logging table exists; otherwise send an operator
     alert (email / Teams) naming the index, the run id, and the error.
   - Continue processing the other indexes (one bad source must not block the others).

## 4. Manual override (operator-initiated, not part of the schedule)
When the bank prices off an approved rate sheet instead of the feed, write a manual row:
- `cr664_ismanualoverride = true`
- `cr664_enteredby = current user`
- `cr664_effectivedate = operator-entered date`
- `cr664_sourcelabel = "Manual override: bank-approved rate sheet"` (or the actual source)
- `cr664_notes = required justification`

**Precedence (consumed by the app adapter, RATE-3):** newest effective-dated row per index wins; on a
tie between a manual override and a feed row, the manual override wins; the UI shows the override badge.

## 5. Staleness behavior (UI, RATE-4)
- Latest row ≤ 3 business days old → **Current**.
- Latest row > 3 business days old → **Stale — confirm manually before pricing variable-rate loans.**
- No row → **No sourced index rate on file. Enter a manual rate or run the index-rate ingestion flow.**

## 6. Operator evidence to capture per run (for audit / examiner)
- Power Automate **run id** and status.
- Fetched **source URL / series id** per index.
- Dataverse **row(s) created** (id, index type, rate value, effective date).
- **Retrieved at** timestamp.
- Screenshot of the **Variable Rate Control Center** showing source + effective date + status.

## 7. Failure playbook
| Symptom                                   | Action                                                                 |
|-------------------------------------------|------------------------------------------------------------------------|
| One index fetch fails                     | Alert fired; other indexes still ingested. Re-run flow or enter manual. |
| All fetches fail (API key / outage)       | Verify API key env var; check source status; enter manual overrides.    |
| Rows not appearing in app                 | Confirm table Read on app-user role; confirm SDK regenerated (RATE-3).   |
| Stale warning persists                    | Source not publishing (holiday/outage) — confirm manually before pricing. |
| Duplicate rows                            | Check idempotency key; the upsert must match on the full 4-part key.    |

## 8. Change control
- Never overwrite historical rows. Corrections are new rows with source + retrieved-at metadata.
- Any change to source, cadence, or threshold updates
  `docs/LIVE_INDEX_RATES_DECISION_RECORD.md` first, then this runbook.

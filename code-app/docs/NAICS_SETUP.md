# NAICS reference data — maker setup

The CRM's Industry field resolves plain-language searches against a seeded NAICS
lookup. NAICS (North American Industry Classification System) is the U.S. federal
industry standard the FDIC/SBA use — **public domain, free to seed and use**.

We store full **6-digit** precision and roll concentration up at the **2-digit sector**
level (the sector is derived in code via `src/crm/naics/naicsSectorMap.ts` — never stored
redundantly).

This doc is the **maker (Matt)** runbook. Claude Code owns the seed script + sector map;
the maker owns the Dataverse table, columns, and SDK regen (dev environment, no admin
rights needed).

---

## 1. Create the reference table `cr664_naicscodes`

In make.powerapps.com → your dev environment → Tables → New table:

| Column (logical) | Type | Notes |
|---|---|---|
| `cr664_code` | Single line text (max 6) | **Primary column**, the 6-digit code, e.g. `722511`. Add an **Alternate Key** on this column (enables idempotent upsert). |
| `cr664_title` | Single line text | Industry title, e.g. `Full-Service Restaurants`. |
| `cr664_sectorcode` | Single line text (max 5) | 2-digit sector, e.g. `72` (ranged: `31-33`, `44-45`, `48-49`). |
| `cr664_sectortitle` | Single line text | Sector title, e.g. `Accommodation and Food Services`. |
| `cr664_naicsversion` | Single line text (max 8) | Version tag, e.g. `2022`. |

Register `cr664_naicscodes` as a **data source** in the Code App, then **regenerate the
SDK** (`pac code`) so `src/generated/services/Cr664_naicscodesService.ts` appears.

## 2. Download the official 2022 NAICS 6-digit list

From the U.S. Census Bureau, 2022 NAICS:
- Page: https://www.census.gov/naics/  → "2022 NAICS" → "6-digit 2022 Code File".
- Direct file (Excel): `2-6 digit_2022_Codes.xlsx`.

Export/convert it to a 2-column CSV `code,title` (one row per code; the 6-digit detail
rows are what we keep — the script ignores 2/3/4/5-digit aggregate rows) and save it to:

```
code-app/scripts/data/naics-2022.csv
```

(The repo ships only a tiny `naics-sample.csv` fixture for tests — never the full list,
which must come from the official source. No codes are fabricated.)

## 3. Validate, then load

**Always verify first** (validates the CSV + derives sectors, writes nothing):

```bash
cd code-app
node scripts/seed-naics.mjs --verify
```

`--verify` fails closed: any 6-digit code whose prefix maps to no NAICS sector is an error
(nothing is written). Expect ~1,012 six-digit records across all 20 sectors for 2022.

**Then load with `--commit`.** It always writes `scripts/data/naics-2022.seed.json`, and it
**loads the rows into Dataverse directly when a token is present** — and prints an unmistakable
final `STATUS:` line so you always know whether the table actually changed.

```powershell
# Easy path — one command loads the table (env URL auto-resolved from `pac org who`):
$env:DATAVERSE_TOKEN = "<a Web API bearer token for your environment>"
node scripts/seed-naics.mjs --commit
#   → idempotent upsert by cr664_code (safe to re-run); STATUS: Dataverse LOADED.
```

Getting a token: any method that yields a bearer token for `https://<your-org>.crm.dynamics.com`
works — e.g. `az account get-access-token --resource https://<your-org>.crm.dynamics.com`
(Azure CLI), or copy one from a browser dev-tools call in the maker portal. The script never
stores it.

**No token?** `--commit` still writes the seed JSON and prints
`STATUS: seed JSON built · Dataverse NOT loaded` with the finish steps — import that JSON into
`cr664_naicscodes` via a **dataflow / Power Query** (key on `cr664_code`, so re-running is a no-op).

> Claude Code never runs the load — it has no Dataverse credentials. The push is maker-only.

After the rows land, **regenerate the SDK** (§1) if you haven't — the Industry field reads the
table through the generated `Cr664_naicscodesService`, so without the regen it stays
"not provisioned yet" even with rows in the table.

## 4. Company (org) columns for Type / NAICS

Good news — these already exist on `cr664_crmorganizations` as free-text columns and need
**no schema change** to start capturing structured values:
- `cr664_organizationtype` — the **Type** field (Phase 2 validates it against the code-defined
  party-type enum on write).
- `cr664_naicscode` — the **NAICS code** (Phase 3 writes the chosen 6-digit code here).

**Optional add (snapshot):** `cr664_naicstitle` (Single line text) on `cr664_crmorganizations`
to store the industry title alongside the code. Until it exists, the title is shown by
deriving from `cr664_naicscodes` at read time (no redundant storage); add the column only if
you want a denormalized snapshot. After adding it, regen the SDK.

## 5. Advisor relationships — no new schema needed now

Advisor links reuse the existing `cr664_crmrelationships` table (free-text `cr664_role`, party
`@odata.bind` lookups, and an existing **deal lookup** `cr664_OriginatedLoanDeal` for
deal-level attribution). Client-level and deal-level advisor links both work on today's schema.

## 6. Arm live persistence (later, evidenced)

CRM live persistence (including these fields/relationships) stays **default-off / fail-closed**.
It flips on only via the certified, evidenced operator step — same discipline as every other
live-write domain. This spec wires the fields + flows; it does not arm live writes.

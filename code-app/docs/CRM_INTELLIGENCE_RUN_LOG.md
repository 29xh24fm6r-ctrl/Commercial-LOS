# Commercial-LOS — CRM Intelligence run log

Branch: `feature/crm-intelligence` (worktree, from `integration/all-work-20260630`)
Working dir: `code-app/`
Mode: fully autonomous, dedicated worktree (node_modules junctioned to the intaglio worktree; same deps).

Schema map (from a read-only survey of the existing CRM): `cr664_organizationtype` (Type),
`cr664_industry`, **and `cr664_naicscode` already exist** as free-text columns on
`cr664_crmorganizations` (NAICS code is written nowhere today). The governed write path is
`src/crm/write/crmWriteAdapter.ts` (`governedCreate`: auth → validate → correlationId → create →
readback → child writes → `cr664_crmauditentries` audit), surfaced via `CrmWriteFns` (create-only;
the generated `Cr664_crmorganizationsService.update` exists to back a Phase-6 update). `addRelationship`
already supports a **deal lookup** (`cr664_OriginatedLoanDeal`) + free-text `cr664_role` — so advisor
links (client- and deal-level) work on today's schema. There is **no `Select` design primitive** yet.

---

## Phase 1 — NAICS reference data

- **`src/crm/naics/naicsSectorMap.ts`** — the fixed public 20-sector NAICS map with correct handling
  of the three **ranged** sectors (31-33 Manufacturing, 44-45 Retail, 48-49 Transportation).
  `sectorForCode(code6)` is the single source of truth for rollups; honest `null` for non-6-digit or
  unassigned-prefix input (never a fabricated sector).
- **`scripts/seed-naics.mjs`** (+ `.d.mts` types) — maker-run, idempotent `--verify` / `--commit`.
  Reads the **official** 2022 NAICS CSV (maker downloads it — never fabricated), validates each row
  (fail-closed on unknown prefix / missing title), derives sector, dedupes, and emits a deterministic
  sorted seed JSON keyed on `cr664_code`. Optional Web API upsert when operator creds are present.
- **`docs/NAICS_SETUP.md`** — maker runbook: create `cr664_naicscodes` (+ alternate key), download
  the Census file, `--verify`/`--commit`, import; notes the existing org columns + optional
  `cr664_naicstitle` snapshot column.
- **`scripts/data/naics-sample.csv`** — tiny real-code fixture for tests (full list is maker-provided,
  gitignored).

### Gate
- `naicsSectorMap.test.ts` ✅ (9 — incl. all three ranged cases + honest unknowns).
- `seedNaics.test.ts` ✅ (6 — script sector map mirrors the TS map; 6-digit filtering; ranged
  derivation; deterministic/idempotent; fail-closed on bad prefix / missing title).
- `seed-naics.mjs --verify` against the sample: 13 records, sectors derived, no errors.
- `tsc -b` ✅ · `eslint` ✅.

### Phase 1 status: ✅ COMPLETE (maker runs the actual seed against the official file).

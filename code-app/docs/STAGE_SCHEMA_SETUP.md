# Stage Advancement — Dataverse schema setup (maker action)

**Owner:** Matt (maker, make.powerapps.com) · **Environment:** current Commercial-LOS dev env.
**Why:** the stage-progression engine refuses to guess "what stage comes next." It needs a
deterministic order on the stage-reference rows. This is the **one** step that must happen in
Dataverse; everything else is in code and already built. No admin rights are required — these are
table/column edits a maker can perform.

> The seven stages, their order, and the status set below are the **founder-ratified canonical OGB
> stage set** — the single source of truth (codes mirror `CANONICAL_STAGES` in
> `src/workflow/stageOrderingContract.ts`; the seed must produce exactly this set). The detailed
> gate POLICY at each stage may still be refined with OGB credit/compliance, but the stage
> vocabulary itself is canonical. Changing the set later is a data edit (re-run the seed) — no code
> change.

---

## Step 1 — Add the ordering column to `cr664_dealstagereferences`

Two equivalent options.

### Option A — run the provisioning script (recommended, idempotent, scripted)

```powershell
# from code-app/
powershell -File scripts/dataverse/verify-document-checklist-and-stage-schema.ps1               # inspect live state first
powershell -File scripts/dataverse/create-dealstagereference-sequence-column.ps1                # DRY-RUN — prints the plan, writes nothing
powershell -File scripts/dataverse/create-dealstagereference-sequence-column.ps1 -Apply          # creates the missing column(s) + publishes
```

Dry-run by default, create-missing-only (never overwrites/renames/deletes), environment-host +
solution-existence checks before any mutation, same safety model as every other script in
`scripts/dataverse/`. Does not create a separate `cr664_stagereferences` table (that plan is
explicitly superseded — see `STAGE_PROGRESSION_ENABLEMENT_MAP.md`) and does not create a Dataverse
alternate key/unique index on `cr664_sequence` (see the script's own header for why that wouldn't
safely express "unique among active rows only").

### Option B — enter the columns by hand

In make.powerapps.com → **Tables** → **Deal Stage Reference** (`cr664_dealstagereferences`) →
**Columns** → **+ New column**:

| Display name | Logical name (auto) | Data type | Required |
|---|---|---|---|
| Sequence | `cr664_sequence` | **Whole Number** | Business required |
| Stage type | `cr664_stagetype` | **Choice** or **Text** (`PIPELINE` \| `TERMINAL`) | Optional |

`cr664_sequence` is the only **required** addition — it is the ordinal the engine sorts by.
`cr664_stagetype` is optional metadata (BOARDED is the one terminal-success stage).

**Save & Publish** the table.

## Step 2 — Seed the seven ordered stage rows + five status rows

Two equivalent options.

### Option A — run the seed script (recommended, idempotent)

```powershell
# from code-app/
$env:DATAVERSE_BEARER_TOKEN = "<a Dataverse bearer token for this env>"
# (DATAVERSE_TOKEN — the name the NAICS seed uses — is also accepted, so one token works for both.)
# optional: $env:DATAVERSE_ENV_URL = "https://<org>.crm.dynamics.com"  (else resolved via `pac org who`)

node scripts/seed-stage-references.mjs              # DRY-RUN — prints the full plan, writes nothing
node scripts/seed-stage-references.mjs --commit     # writes the rows (skip-if-exists, by code)
node scripts/seed-stage-references.mjs --verify     # read-only smoke: confirms deterministic ordering
```

The script is **dry-run by default**, matches existing rows by `cr664_code` (reuses an active match,
fails closed on duplicates or inactive matches), never touches TEST/PHASE rows, and never touches a
Loan Deal or any feature gate. If `--commit` errors mentioning `cr664_sequence`, Step 1 was not
completed — add the column first.

### Option B — enter the rows by hand

**`cr664_dealstagereferences`** (set `cr664_code`, `cr664_name`, `cr664_sequence`,
`cr664_activeflag = true`):

| `cr664_code` | `cr664_name` | `cr664_sequence` |
|---|---|---|
| `INTAKE` | Intake | 10 |
| `UNDERWRITING` | Underwriting | 20 |
| `CREDIT_APPROVAL` | Credit Approval | 30 |
| `COMMITMENT` | Commitment | 40 |
| `DOCUMENTATION` | Documentation | 50 |
| `CLOSING_FUNDING` | Closing & Funding | 60 |
| `BOARDED` | Boarded / Servicing | 70 |

**`cr664_dealstatusreferences`** (`cr664_code`, `cr664_name`, `cr664_activeflag = true`):

| `cr664_code` | `cr664_name` |
|---|---|
| `OPEN` | Open |
| `ON_HOLD` | On Hold |
| `DECLINED` | Declined |
| `WITHDRAWN` | Withdrawn |
| `BOARDED` | Boarded |

## Step 3 — Regenerate the typed SDK so `cr664_sequence` appears on the model

So the repo's `Cr664_dealstagereferencesService`/model expose the new field:

```powershell
# from code-app/ — the documented regen path
pac code add-data-source ...     # or: scripts/dataverse/regenerate-powerapps-sdk.ps1
```

Confirm `src/generated/models/Cr664_dealstagereferencesModel.ts` now includes
`cr664_sequence?: number`.

## Step 4 — Verify

```powershell
node scripts/seed-stage-references.mjs --verify
```

A green verify (seven stages, unique sequences) is what flips the code's
`stageProgressionAvailability()` to **available** and the Stage Governance Diagnostics card from
**Missing** to **ready**. Until then the system stays honestly fail-closed: the banker workspace
shows the read-only "Advance Stage not yet available" banner and no transition writes anything.

---

## What this does NOT do

- Does **not** enable `AUTO_STAGE_ADVANCE_ENABLED` or any live-write gate. Arming the live path is a
  separate, deliberate, evidence-backed operator act (see the spec's runbook).
- Does **not** enable live stage advancement. The 2026-06-30 OGB policy corrections are recorded in
  code and docs (memo/package at Intake, no authority tiers, risk-rating pending); any future policy
  change still requires a separate OGB decision.
- Does **not** change any Loan Deal row.

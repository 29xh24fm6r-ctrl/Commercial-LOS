# Stage Advancement — Dataverse schema setup (maker action)

**Owner:** Matt (maker, make.powerapps.com) · **Environment:** current Commercial-LOS dev env.
**Why:** the stage-progression engine refuses to guess "what stage comes next." It needs a
deterministic order on the stage-reference rows. This is the **one** step that must happen in
Dataverse; everything else is in code and already built. No admin rights are required — these are
table/column edits a maker can perform.

> Ratify first. The seven stages, their order, and the status set below are a **defensible
> industry-standard template, not OGB-ratified credit policy.** Confirm the real stages with OGB
> credit/compliance before treating them as binding (see the runbook in the spec). Editing the
> template later is a data edit (re-run the seed) — no code change.

---

## Step 1 — Add the ordering column to `cr664_dealstagereferences`

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

# Deal Reference values — maker setup (Phase 4A)

The deal's **Product Type**, **Loan Structure**, and **Pricing Type** are three
separate lookups on `cr664_loandeal` that **all target the same reference table**
`cr664_producttypereference`. Until Phase 4A there was no way to tell which rows
belonged to which dropdown, so the three lists were indistinguishable.

Phase 4A adds one **CHOICE discriminator column** — `cr664_category` — to that
table. The loader then filters each dropdown to its own category, and admins
manage the values from **Admin → Deal Reference Values**.

> Claude Code owns the schema script + seed script + app code. The **maker
> (Matt)** owns applying the column, the SDK regen, and running the seed — same
> split as `NAICS_SETUP.md`. Claude never has Dataverse credentials.

The three categories and their `cr664_category` option values are the canonical
contract in `src/shared/governance/dealReferenceCategories.ts`. Keep the schema
JSON + seed script in sync with it.

| Category | `cr664_category` value |
|---|---|
| Product Type | `788190000` |
| Loan Structure | `788190001` |
| Pricing Type | `788190002` |

---

## 1. Add the `cr664_category` CHOICE column (create-missing-only)

Dry-run first (writes nothing; prints the plan):

```powershell
powershell -File scripts/dataverse/create-deal-reference-category.ps1
```

Then apply (gated; prompts unless `-Force`, and only ADDS the column — the table
is never created, renamed, or altered otherwise):

```powershell
powershell -File scripts/dataverse/create-deal-reference-category.ps1 -Apply
```

This creates a local Picklist `cr664_category` on `cr664_producttypereference`
with exactly the three options above. It is idempotent — re-running skips the
column if it already exists.

> Prefer the maker portal? Add a **Choice** column named `cr664_category` to the
> table with the three options and the exact values above, then continue.

## 2. Publish + regenerate the SDK

```powershell
powershell -File scripts/dataverse/publish-customizations.ps1
powershell -File scripts/dataverse/regenerate-powerapps-sdk.ps1
```

The regen lands `cr664_category` on the generated
`Cr664_producttypereferencesModel`. Until then the app reads the column through a
local interface, so nothing breaks pre-regen — the dropdowns just stay honest
(they show only real, categorized, active rows).

## 3. Seed the starter values

**Always verify/plan first** (dry-run writes nothing):

```bash
node scripts/seed-deal-reference-values.mjs            # dry-run plan
```

Then load them (idempotent upsert, matched by category + code):

```powershell
$env:DATAVERSE_BEARER_TOKEN = "<a Web API bearer token for your environment>"
# (DATAVERSE_TOKEN is also accepted — one token works for the NAICS + stage seeds too.)
node scripts/seed-deal-reference-values.mjs --commit
node scripts/seed-deal-reference-values.mjs --verify   # read-only smoke
```

Getting a token: any bearer token for `https://<your-org>.crm.dynamics.com` works
(e.g. `az account get-access-token --resource https://<your-org>.crm.dynamics.com`,
or copy one from a maker-portal dev-tools call). The script never stores it.

The seed loads the Phase 4 starter list (9 product types, 10 loan structures,
7 pricing types). It **never** deactivates, deletes, or fabricates beyond that
list — admins add the rest from the UI.

## 4. Manage values going forward — Admin → Deal Reference Values

Once the column exists and the SDK is regenerated, admins manage values in-app:
list by category, add, edit name/code/sort order, and deactivate/reactivate
(deactivate is preferred over delete). Every write is fail-closed to admins,
readback-verified, and audited (`cr664_auditevents`, category = Configuration).
The deal modal loads only **active** rows for new selections; a deal already
carrying a now-inactive value shows it honestly with an "inactive" warning.

## 5. What stays honest (no fabrication)

- The deal dropdowns read only real, registered, **active** rows for their
  category. No hard-coded example lists ship in the app.
- Un-categorized legacy rows (no `cr664_category`) do **not** appear in any
  dropdown until an admin assigns them a category.
- Codes are unique **within** a category; the same code may exist under two
  categories (e.g. `TERM_LOAN` under both Product Type and Loan Structure).

# Phase 122E — Final Loan Deal reference lookups

**Status:** **Pt 1 audit + Pt 2 seed mode delivered.** This phase targets
the three remaining cockpit-missing fields on TEST — Deal Phase 121:

- Product type (`cr664_producttypereference`)
- Loan structure (`cr664_loanstructuretypereference`)
- Pricing type (`cr664_pricingtypereference`)

All three are OPTIONAL reference lookups on `cr664_loandeal`. They stay
blank because their reference tables haven't been seeded — but the
`--inspect-table` audit Pt 1 of Phase 122D added only details
**required-for-create** columns, so the lookup targets for these three
are not surfaced. Phase 122E Pt 1 ships a targeted attribute inspection
mode (`--inspect-attributes`) that walks one level deep into each
attribute's target table.

**No live writes performed in this commit.** The seed step (Pt 2) runs
in a follow-up commit driven by the inspect output.

Related canonical sources:
- [PHASE_122_RETARGET_DEAL_LOOKUPS.md](PHASE_122_RETARGET_DEAL_LOOKUPS.md) — Phase 122 parent.
- [PHASE_122B_AUTOMATED_LOOKUP_REPAIR.md](PHASE_122B_AUTOMATED_LOOKUP_REPAIR.md) — script runbook + safety discipline.
- [PHASE_122D_CLIENT_RELATIONSHIP_SEED.md](PHASE_122D_CLIENT_RELATIONSHIP_SEED.md) — sibling phase that ships `--inspect-table` (audit) + `--seed-client-relationship` (guarded write).

---

## 1. Why a separate audit mode

`--inspect-table cr664_loandeal` (Phase 122D Pt 1) groups columns by
RequiredLevel: **REQUIRED FOR CREATE** vs **RECOMMENDED** vs
**OPTIONAL**. For each REQUIRED Lookup column the mode also fetches
the resolved `Targets[]`; for each REQUIRED Picklist column it
fetches the OptionSet.

The three final cockpit-missing fields are all **OPTIONAL**, so
`--inspect-table` doesn't print their Targets or recurse into the
target tables. To design a seed for any of them the operator needs:

- the target entity each lookup points at,
- that target table's primary-name + entity-set + required-for-create
  columns,
- any nested Lookup Targets or Picklist OptionSets for those required
  columns.

Phase 122E Pt 1 adds a focused `--inspect-attributes` mode that takes
a comma-separated list of `<table>.<attribute>` and walks one level
deep per attribute. Pure GETs; no write of any kind.

## 2. The audit tool

```powershell
node scripts/phase122-lookup-repair.mjs `
  --inspect-attributes cr664_loandeal.cr664_producttypereference,cr664_loandeal.cr664_loanstructuretypereference,cr664_loandeal.cr664_pricingtypereference
```

**What it does, per item:**

1. Acquires a Dataverse bearer token via the same 3-source priority
   chain as every other Phase 122 mode (env var → cached → device-code).
2. GETs the parent table's `EntityDefinitions` metadata with
   `$expand=Attributes(…)` once.
3. Finds the attribute by `LogicalName`.
4. Prints the attribute headline: `LogicalName`, `SchemaName`,
   `AttributeType`, `DisplayName`, `RequiredLevel`, `IsCustomAttribute`.
5. **If `AttributeType === 'Lookup'`** (or `Customer`):
   - GETs the resolved `Targets[]` via the
     `Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets`
     cast.
   - For each target table:
     - GETs its full `EntityDefinitions` metadata.
     - Prints `LogicalName`, `EntitySetName`,
       `PrimaryNameAttribute`, `PrimaryIdAttribute`,
       `IsCustomEntity`, `DisplayName`.
     - Prints every `REQUIRED FOR CREATE` column on that target
       table — same partitioning logic as `--inspect-table`:
       attributes with `RequiredLevel.Value` of `SystemRequired` or
       `ApplicationRequired` that are valid for create.
     - For each required nested **Lookup** column: GETs and prints
       its own `Targets[]`.
     - For each required nested **Picklist** column: GETs and prints
       its `OptionSet` values.
6. **If `AttributeType === 'Picklist'`**: GETs the OptionSet and
   prints `Value → Label` for each option.
7. Otherwise: prints a "no per-type detail to print" note.

**Read-only contract** (pinned by static-source tests):

- `runInspectAttributes` body contains no `method: 'PATCH'`, `'POST'`,
  or `'DELETE'`; no `PublishXml`; no `spawnSync`.
- No bypass headers (`BypassBusinessLogicExecution`,
  `BypassCustomPluginExecution`, `SuppressDuplicateDetection`,
  `?Force=true`).
- 9-way mutex with every other mode; mode never combines with any
  write/cleanup/seed mode.
- No React app code touched.

## 3. Expected output shape

Real values come from the operator's env. Truncated example:

```text
Phase A — Targeted attribute inspection (Web API metadata, read-only)
   Items: 3

========================================================================
-- cr664_loandeal.cr664_producttypereference
========================================================================
   Table LogicalName:     cr664_loandeal
   Attribute LogicalName: cr664_producttypereference
   SchemaName:            cr664_ProductTypeReference
   AttributeType:         Lookup
   DisplayName:           Product Type
   RequiredLevel:         None
   IsCustomAttribute:     true

   Lookup Targets[]:      ["<actual-target-entity>"]

   --- target table: <actual-target-entity> ---
       LogicalName:           <actual-target-entity>
       EntitySetName:         <plural form>
       PrimaryNameAttribute:  <e.g. cr664_xxxname>
       PrimaryIdAttribute:    <e.g. cr664_xxxid>
       IsCustomEntity:        true
       DisplayName:           …

       REQUIRED FOR CREATE on <actual-target-entity> (N):
         - <required-col-1>   type=String     RequiredLevel=ApplicationRequired   …
         - <required-col-2>   type=Picklist   RequiredLevel=ApplicationRequired   …
             OptionSet (M):
               788190000 → …
               788190001 → …
         - <required-col-3>   type=Lookup     RequiredLevel=ApplicationRequired   …
             Lookup Targets: ["<sub-target-entity>"]

========================================================================
-- cr664_loandeal.cr664_loanstructuretypereference
========================================================================
   …

========================================================================
-- cr664_loandeal.cr664_pricingtypereference
========================================================================
   …

Read-only attribute inspection complete. No write of any kind issued.
```

## 4. Operator workflow

```powershell
# Step 1 — Audit all three reference lookups in one command.
node scripts/phase122-lookup-repair.mjs `
  --inspect-attributes cr664_loandeal.cr664_producttypereference,cr664_loandeal.cr664_loanstructuretypereference,cr664_loandeal.cr664_pricingtypereference

# Step 2 — Capture the output. Each section names a target entity
# + that target's required-for-create column set + any nested
# requirements (Lookup Targets / Picklist OptionSets).

# Step 3 — Paste the output back so Phase 122E Pt 2 can design a
# safe seed mode (analogous to --seed-client-relationship) for each
# of the three target tables. Pt 2 will be a follow-up commit; this
# commit only ships the audit tool.
```

## 5. Acceptance criteria mapping

| Acceptance criterion | How it's satisfied |
| --- | --- |
| `npm test -- src/shared/governance/phase122BScriptContract.test.ts` passes | 13 new pins (5 static-source + 6 behavioral + 2 mutex re-asserts). 244 / 244 total contract pins pass. |
| `npm run build` passes | Verified clean. |
| No React code changes | The new mode is script-only. No `src/` files outside the test pin file are modified. |
| No live writes | Pure HTTP GETs. Negative pins forbid PATCH / POST / DELETE / PublishXml / spawnSync in the orchestrator body, and no `Bypass*` / `?Force=true` headers anywhere in the source. |
| Operator can run the command and paste back target table + required-field output for Pt 2 | Step 2 + 3 of §4. The output is structured per-item with target-table metadata + required-for-create rows. |

## 6. Hard non-goals

| Non-goal | Where enforced |
| --- | --- |
| Do not change React code | `--inspect-attributes` is script-only. |
| Do not write to Dataverse | Pure GETs; pinned by static-source tests against every write verb + PublishXml + spawnSync inside `runInspectAttributes`. |
| Do not deeply recurse | The mode walks exactly **one** level deep (parent attribute → target table's required columns). Nested Lookups print their Targets[] but the script does NOT then fetch the metadata of those sub-targets. The operator re-runs `--inspect-attributes` against any sub-target they need to explore. |
| Do not use pac env fetch | All metadata queries hit Dataverse Web API endpoints exclusively. |
| Do not seed anything | Pt 2 is a future commit. |

## 8. Pt 2 — `--seed-product-references` execution mode

Pt 1's `--inspect-attributes` audit confirmed:

- All three Loan Deal lookups point at the SAME target table —
  `cr664_producttypereference` (EntitySet `cr664_producttypereferences`).
- Three ApplicationRequired columns on that target:
  - `cr664_name` (String — primary name)
  - `cr664_code` (String)
  - `cr664_activeflag` (Boolean)

Pt 2 adds a guarded write mode that resolves-or-creates one row per
seed and PATCHes the deal with up to three `@odata.bind` values.

### 8.1 Seed rows

| Seed | `cr664_name` | `cr664_code` | `cr664_activeflag` | Loan Deal bind |
| --- | --- | --- | --- | --- |
| Product Type | `SBA 7(a)` | `SBA_7A` | `true` | `cr664_ProductTypeReference@odata.bind` |
| Loan Structure | `Term Loan` | `TERM_LOAN` | `true` | `cr664_LoanStructureTypeReference@odata.bind` |
| Pricing Type | `Variable` | `VARIABLE` | `true` | `cr664_PricingTypeReference@odata.bind` |

The seed values are pinned in `PRODUCT_REFERENCE_SEEDS` at the top of
the script. Both the script and the static-source pins use these
exact strings — a future drift trips a clear failure.

### 8.2 Commands

```powershell
# Dry-run preview — no write of any kind.
node scripts/phase122-lookup-repair.mjs `
  --seed-product-references `
  --deal-name "TEST — Deal Phase 121"

# Execute. Creates the three reference rows (or reuses any that
# already exist) and PATCHes the deal.
node scripts/phase122-lookup-repair.mjs `
  --seed-product-references `
  --deal-name "TEST — Deal Phase 121" `
  --commit-seed-product-references
```

### 8.3 What the mode does

1. **Resolves the deal** by `cr664_dealname`. Refuses zero matches
   (no auto-create) AND >1 matches (ambiguous).
2. **Reads the deal's current product-reference state** in one GET
   (`_cr664_producttypereference_value`,
   `_cr664_loanstructuretypereference_value`,
   `_cr664_pricingtypereference_value`). Used by the idempotency
   check below.
3. **Resolves each seed row** in order:
   - GET by `cr664_code`. If exactly one match → reuse. If >1 match →
     bail ("Refusing as ambiguous").
   - Otherwise GET by `cr664_name`. Same single-match-or-bail rule.
   - Otherwise mark for creation.
4. **Idempotency diff**: compares each Loan Deal current FK value
   against the resolved seed id. Builds a `linkPlan` of which links
   need to change.
5. **Short-circuit**: if no row needs creation AND no link needs to
   change, prints "No-op success" and exits. Re-running the commit is
   therefore a no-op.
6. **Dry-run** prints the planned actions verbatim — exact POST
   bodies, exact PATCH body keys — and exits unless
   `--commit-seed-product-references` is also passed.
7. **Commit** path:
   - POSTs to `/api/data/v9.2/cr664_producttypereferences` for each
     row that doesn't yet exist. The POST body contains ONLY
     `cr664_name` + `cr664_code` + `cr664_activeflag: true`. No other
     column.
   - PATCHes `/api/data/v9.2/cr664_loandeals(<id>)` with a body
     containing ONLY the differing product-reference `@odata.bind`
     keys. No other Loan Deal column is touched.
8. **Verify**: re-reads the deal with `Prefer:
   odata.include-annotations="OData.Community.Display.V1.FormattedValue"`,
   prints each FK + formatted display, and confirms each verified id
   matches the resolved id.

### 8.4 Idempotency contract

| State | Behavior |
| --- | --- |
| All three rows missing + deal lookups unset | 3 POSTs + 1 PATCH (3 binds) |
| All three rows already present + deal links correct | No-op success |
| All three rows present + deal links empty | 0 POSTs + 1 PATCH (3 binds) |
| Some rows missing, some present, some links differing | POST only missing rows; PATCH only differing binds |
| A row exists with `cr664_activeflag=false` | Reuse AS-IS + warn (no mutation) |
| A row exists with name/code differing from spec | Reuse AS-IS + warn (no mutation) |
| Multiple rows by `cr664_code` OR `cr664_name` | Bail ("Refusing as ambiguous") |
| Zero deal matches | Bail (no auto-create) |
| >1 deal matches | Bail (ambiguous) |

### 8.5 What this mode does NOT do

- Does **not** mutate any existing `cr664_producttypereference` row.
  Even when `cr664_activeflag`, `cr664_name`, or `cr664_code` of an
  existing row differs from the seed spec, the row is reused AS-IS
  with a warning. Explicit follow-up PATCHes belong to a different
  mode.
- Does **not** touch any Loan Deal column other than the three
  product-reference `@odata.bind` keys. Client / Stage / Status /
  Banker / Customer Type / Industry / Guarantor Structure /
  Collateral Summary all stay exactly as Phase 122C/Phase 122D Pt 2
  left them — pinned by negative static-source tests.
- Does **not** invent a display value. The cockpit reads each lookup
  through Phase 122C's loader fix; the formatted display is whatever
  Dataverse returns for the resolved row's primary name.
- Does **not** use any bypass header
  (`BypassBusinessLogicExecution`, `BypassCustomPluginExecution`,
  `SuppressDuplicateDetection`, `?Force=true`) — re-asserted by
  negative pins.
- Does **not** use `pac env fetch`.
- Does **not** touch React app code.

### 8.6 Acceptance criteria mapping

| Acceptance criterion | How it's satisfied |
| --- | --- |
| `npm test -- src/shared/governance/phase122BScriptContract.test.ts` passes | 26 new pins for Pt 2 (parse, mutex, seed values, resolve order, dry-run gate, POST body shape, PATCH body shape, no-other-column negatives, no-mutate-existing, duplicate refusal, verify with annotations, no bypass headers). 270 / 270 total pins pass. |
| `npm run build` passes | Verified clean. |
| Dry-run prints planned create/reuse + PATCH | The orchestrator prints every step with its exact POST/PATCH body before any write. |
| Commit creates/reuses all three reference rows and links the TEST deal | POST for each missing row + PATCH with the differing binds. |
| Re-run commit is a no-op success | The idempotency short-circuit detects when everything matches and prints "No-op success" before any write. |
| Code App cockpit shows 0 missing fields | Phase 122C's loader reads each lookup display from `_<lookup>_value@…FormattedValue`. Once the PATCH lands, the three product-reference lookups hydrate and the cockpit shows 0/13 missing fields. |

---

## 7. Cross-references

- [scripts/phase122-lookup-repair.mjs](../scripts/phase122-lookup-repair.mjs) — `--inspect-attributes` mode lives here.
- [src/shared/governance/phase122BScriptContract.test.ts](../src/shared/governance/phase122BScriptContract.test.ts) — 13 new pins on the new mode (244 total).
- [PHASE_122D_CLIENT_RELATIONSHIP_SEED.md](PHASE_122D_CLIENT_RELATIONSHIP_SEED.md) — sibling audit-then-seed pattern (`--inspect-table` → `--seed-client-relationship`). Phase 122E Pt 2 will follow the same shape: audit output → guarded seed mode → idempotent dry-run + explicit commit gate.
- [src/deals/dealQueries.ts](../src/deals/dealQueries.ts) — Phase 122C loader already hydrates these three fields from `_<lookup>_value@…FormattedValue`. Once Pt 2 lands and the operator points each reference at a real row, the cockpit shows them without any further loader change.

# Phase 122E — Final Loan Deal reference lookups

**Status:** **Pt 1 audit tool delivered. Live schema inspection pending
operator run.** This phase targets the three remaining cockpit-missing
fields on TEST — Deal Phase 121:

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

## 7. Cross-references

- [scripts/phase122-lookup-repair.mjs](../scripts/phase122-lookup-repair.mjs) — `--inspect-attributes` mode lives here.
- [src/shared/governance/phase122BScriptContract.test.ts](../src/shared/governance/phase122BScriptContract.test.ts) — 13 new pins on the new mode (244 total).
- [PHASE_122D_CLIENT_RELATIONSHIP_SEED.md](PHASE_122D_CLIENT_RELATIONSHIP_SEED.md) — sibling audit-then-seed pattern (`--inspect-table` → `--seed-client-relationship`). Phase 122E Pt 2 will follow the same shape: audit output → guarded seed mode → idempotent dry-run + explicit commit gate.
- [src/deals/dealQueries.ts](../src/deals/dealQueries.ts) — Phase 122C loader already hydrates these three fields from `_<lookup>_value@…FormattedValue`. Once Pt 2 lands and the operator points each reference at a real row, the cockpit shows them without any further loader change.

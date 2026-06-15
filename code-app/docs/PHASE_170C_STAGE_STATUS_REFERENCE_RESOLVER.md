# Phase 170C -- Stage/Status Reference Resolver Foundation

Date: 2026-06-15

## Case Outcome: CASE B

The Stage/Status lookup target discovery path exists through Dataverse metadata
inspection, but the target reference table(s) are still not registered in the
generated app configuration. No runtime resolver can be safely added yet.

Resolver added: No.

Inspect-only operator mode added: Yes:

```powershell
node scripts/phase122-lookup-repair.mjs --inspect-new-deal-references
```

The mode is a fixed, read-only alias for:

```powershell
node scripts/phase122-lookup-repair.mjs --inspect-attributes cr664_loandeal.cr664_stagereference,cr664_loandeal.cr664_statusreference
```

It prints the lookup target table logical names, entity-set names, primary id/name
attributes, required target-table fields, and nested lookup/choice metadata.
It performs Web API GET inspection only.

## Exact Fields Required On cr664_loandeal

`src/generated/models/Cr664_loandealsModel.ts` still declares these fields as
non-optional on `Cr664_loandealsBase`:

```ts
cr664_stageentrydate: string;
"cr664_StageReference@odata.bind": string;
"cr664_StatusReference@odata.bind": string;
```

`.power/schemas/dataverse/loandeals.Schema.json` still declares:

- `cr664_stagereference` with `x-ms-schema-name` `cr664_StageReference`, required.
- `cr664_statusreference` with `x-ms-schema-name` `cr664_StatusReference`, required.
- `cr664_stagereferencename` and `cr664_statusreferencename` as read-only display fields.

## Source Files Inspected

- `docs/PHASE_163_STAGE_STATUS_REFERENCE_UNBLOCK.md`
- `docs/PHASE_169C_ADMIN_NEW_DEAL_INTAKE_BLOCKER.md`
- `src/generated/models/Cr664_loandealsModel.ts`
- `src/generated/services/`
- `.power/schemas/dataverse/`
- `.power/schemas/dataverse/loandeals.Schema.json`
- `.power/schemas/appschemas/dataSourcesInfo.ts`
- `power.config.json`
- `src/manager/managerQueries.ts`
- `src/team/teamQueries.ts`
- `src/deals/dealQueries.ts`
- `src/banker/dealQueries.ts`
- `scripts/phase122-lookup-repair.mjs`
- `src/admin/adminNewDealIntakeModel.ts`
- `src/admin/NewDealIntakePanel.tsx`
- `src/shared/governance/platformInventory.ts`

## Registration Result

Target tables/services are not registered.

- No generated `Cr664_stagereferencesService`, `Cr664_statusreferencesService`,
  `Cr664_dealstagereferencesService`, or `Cr664_dealstatusreferencesService`
  exists in `src/generated/services/`.
- No generated Stage/Status reference model exists in `src/generated/models/`.
- No Stage/Status reference schema file exists in `.power/schemas/dataverse/`.
- `power.config.json` database references do not include a Stage/Status
  reference data source.
- The Stage/Status reference tables are not registered in `power.config.json`.
- `.power/schemas/appschemas/dataSourcesInfo.ts` does not include a
  Stage/Status reference data source.

Earlier operator seed docs name likely live tables
`cr664_dealstagereference` and `cr664_dealstatusreference`, but those names are
not registered/generated here and cannot be consumed by app runtime code until
metadata inspection plus data-source registration and SDK regeneration are done.

## Loader Hydration Finding

Existing live-style loaders do not resolve reference records. They only hydrate
display text from existing `cr664_loandeal` rows:

- Manager/team/deal-detail loaders prefer
  `_cr664_stagereference_value@OData.Community.Display.V1.FormattedValue`, then
  `cr664_stagereferencename`.
- Status similarly prefers
  `_cr664_statusreference_value@OData.Community.Display.V1.FormattedValue`, then
  `cr664_statusreferencename`, then standard `statuscode` display fallback.
- Banker pipeline still reads the generated display shadow fields.

This proves Stage/Status are custom lookup fields on existing deals, not choice
fields suitable for create defaults. Display labels cannot produce
`@odata.bind` values for a new record.

## Why No Runtime Resolver Was Added

A resolver would need to query registered reference services and produce exactly
one Stage bind path and exactly one Status bind path. That is impossible here
because the target entity sets and primary ids are not available through
generated app services.

The new script mode is therefore operator inspection only. It does not make the
reference tables available to the runtime app and does not authorize a create.

## Why New Deal Create Remains Disabled

New Deal create remains disabled because `cr664_loandeal` create requires
`cr664_StageReference@odata.bind` and `cr664_StatusReference@odata.bind`.
Supplying either bind today would require guessing an entity set or hardcoding a
record GUID. Both are prohibited.

`new-deal-create` remains in `NOT_WIRED`.

## Exact Next Steps To Controlled Create

1. Run:
   `node scripts/phase122-lookup-repair.mjs --inspect-new-deal-references`.
2. Confirm the live target table logical names, entity-set names, primary id
   attributes, primary name attributes, required fields, and safe selector
   fields.
3. Register the Stage Reference and Status Reference data sources in
   `power.config.json`.
4. Regenerate `.power/schemas/appschemas/dataSourcesInfo.ts`,
   `.power/schemas/dataverse/*.Schema.json`, generated models, and generated
   services.
5. Add a fail-closed resolver that uses only registered services, returns a
   typed blocked/not-configured/ambiguous/missing/ready union, and bails on zero
   or multiple matches.
6. Add a separate audited New Deal create adapter with governed write inventory,
   audit payload, typed outcomes, and payload-discipline tests.
7. Run a single-record operator smoke in the live environment.
8. Only after that, enable `+ New Deal`.

## Guarantees

- No hardcoded GUIDs.
- No fabricated Stage or Status defaults.
- No deal create.
- No loan deal patch.
- No Stage/Status record create.
- No permission widening.
- No external HTTP/fetch/Graph connector introduced in app runtime.
- No CRM, portfolio, or admin write enablement changed.
- No deploy.
- No tag moved.
- No schema change.
- No record write.

## Validation Results

- `node --check scripts\phase122-lookup-repair.mjs`: Passed.
- `npm test -- NewDeal Admin admin phase122 releaseCandidateSnapshot`: Passed.
- `npm test -- phase122BScriptContract`: Passed.
- `npm test -- --reporter=dot`: Passed; 459 test files and 7,790 tests.
- `npm run build`: Passed.

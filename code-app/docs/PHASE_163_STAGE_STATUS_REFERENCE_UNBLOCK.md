# Phase 163 -- Stage and Status Reference Source Registration for New Deal Create

Date: 2026-06-12
HEAD at investigation: e7865a6 (master / origin/master)

## Outcome

+ New Deal remains BLOCKED and honestly disabled. No behavior changed.

This phase resolves to Case C in the Phase 163 brief: neither a typed
generated service nor a safe generic Dataverse read path exists for the
Stage Reference / Status Reference lookup target table. A hard stop
condition is tripped because the lookup target table name cannot be
verified from anything in the repository. Per the brief, the correct
action is to stop, document the exact data-source registration task, keep
+ New Deal disabled, and attempt no create.

This phase is documentation only. No source file that affects runtime
behavior was changed. No schema, no migration, no GUIDs, no fake
references, no permission changes, no connector changes. Route delta 0.

## What cr664_loandeal Create Requires

From `src/generated/models/Cr664_loandealsModel.ts` (interface
`Cr664_loandealsBase`), both binds are required (non-optional) on create:

```
cr664_stageentrydate: string;                  // required
"cr664_StageReference@odata.bind": string;     // required lookup bind
"cr664_StatusReference@odata.bind": string;    // required lookup bind
```

From `.power/schemas/dataverse/loandeals.Schema.json`:

```
cr664_stagereference  : LookupType, required: true,  x-ms-schema-name cr664_StageReference
cr664_statusreference : LookupType, required: true,  x-ms-schema-name cr664_StatusReference
cr664_stagereferencename  : StringType, read-only (formatted display only)
cr664_statusreferencename : StringType, read-only (formatted display only)
```

A create payload must therefore supply two valid `@odata.bind` values of
the form `/<targetEntitySet>(<recordGuid>)`. Both the target entity set
and the record GUIDs are unknown to the app.

## Investigation Findings (exact)

1. Generated SDK models (`src/generated/models/`): there is NO
   `Cr664_stagereferences*Model` or `Cr664_statusreferences*Model`. The
   only place these names appear is as columns on the loandeal model
   itself (the bind keys and the read-only `*name` display fields).

2. Generated SDK services (`src/generated/services/`): there is NO
   `Cr664_stagereferencesService` or `Cr664_statusreferencesService`.
   The 28 generated services do not include any stage/status reference
   table.

3. Dataverse schema files (`.power/schemas/dataverse/`): there is NO
   `stagereference*.Schema.json` or `statusreference*.Schema.json`. The
   loandeal schema declares the two lookups as `LookupType` but does NOT
   declare the lookup target entity set (no target/referenced-entity
   metadata is present). The target table name is therefore unverifiable.

4. App data-source registration (`power.config.json` database
   references): the registered tables do NOT include any stage/status
   reference table. Registered tables are loandeals, borrowers, bankers,
   teams, dealtasks, documentchecklists, creditmemos, dealtimelineevents,
   auditevents, alertqueues, systemsettings, and the platform/profile/
   profitability set -- none of them a stage/status reference table.

5. Generated data-source manifest
   (`.power/schemas/appschemas/dataSourcesInfo.ts`): same conclusion --
   no stage/status reference name is registered. Generated services read
   strictly through `getClient(dataSourcesInfo)` against a registered
   `dataSourceName`, so an unregistered table cannot be queried through
   the SDK.

6. Generic Dataverse read path: the only generic Dataverse transports in
   the codebase are the CRM live connector
   (`src/crm/crmLiveDataverseTransport.ts`) and the Copilot custom API
   transport (`src/copilot/copilotDataverseCustomApiTransport.ts`). Both
   are explicitly out of bounds for this phase, and neither is a governed
   reference-table read helper. There is no in-app least-privilege
   generic entity reader to extend.

7. Local stage catalog (`src/shared/stages/stageCatalog.ts`): a frozen,
   read-only local catalog of stage identity, ordinal, and lifecycle
   group. It explicitly documents that "the live Dataverse data does not
   yet expose stable stage ids" and invents no Dataverse record GUIDs. It
   cannot supply an `@odata.bind` value and must not be used to fabricate
   one.

8. Current New Deal control (`src/banker/GreetingHeader.tsx`): + New Deal
   is rendered via the disabled `ActionButton` with an honest schema
   blocker tooltip. It has no onClick and attempts no create. Governance
   inventory records this as `new-deal-create` in `NOT_WIRED`
   (`src/shared/governance/platformInventory.ts`) with `blockerKind:
   'schema'`.

Classification: the references are NOT available as typed SDK services,
NOT available through an existing governed generic Dataverse client, and
the target table is MISSING from the generated model/schema/registration.
Only the formatted read-only `*name` values exist, and only as columns
returned when reading an already-created deal.

## Why Case A and Case B Are Not Possible

- Case A (typed services exist): impossible. No typed stage/status
  reference service exists to query for a default.
- Case B (generic read helper exists): impossible safely. The only
  generic Dataverse transports are the off-limits CRM and Copilot
  connectors; extending either would touch a forbidden connector and
  still could not target a table whose entity-set name is unverifiable.
- Case C (neither safe read path exists): this is the actual state.

## Hard Stop Conditions Tripped

- Stage/Status lookup target table name cannot be verified (no target
  metadata in schema, no registration, no model, no service).
- Default records cannot be deterministically resolved (no read path).
- A create payload would require hardcoded GUIDs to satisfy the two
  required binds, which is explicitly prohibited.

Any one of these mandates stopping without enabling + New Deal. All three
hold.

## Exact Unblock Task (data-source registration, deferred)

To make + New Deal safely enableable in a future phase, in order:

1. In the Dataverse environment, identify the lookup target table behind
   `cr664_StageReference` and `cr664_StatusReference` (the publisher
   `cr664` reference table that these loandeal lookups point to) and its
   exact entity-set and logical names. This must come from the live
   environment metadata, not be guessed in code.
2. Register that reference table (or tables) as a Power Apps data source:
   add it to `power.config.json` database references and to the generated
   `.power/schemas/appschemas/dataSourcesInfo.ts`, with its
   `.power/schemas/dataverse/<table>.Schema.json`.
3. Regenerate the SDK so a typed `Cr664_<reference>Service` and model
   exist under `src/generated/`.
4. Confirm the reference table exposes a stable, deterministic default
   selector (for example an active-flag plus a stable code/name/ordinal).
   If zero or more than one default can be resolved, the resolver must
   fail closed.
5. Add a read-only resolver that returns exactly one default Stage and
   exactly one default Status reference, failing closed on zero or
   multiple matches, returning typed local DTOs, selecting least-privilege
   fields only.
6. Only then wire + New Deal create to include the two resolved binds,
   gated on governed write entitlement plus a successful single-default
   resolution for both references. If resolution fails, keep the button
   disabled with the tooltip: "New Deal blocked: default Stage/Status
   references are not configured."

Steps 1-3 are environment/schema work outside this app's allowed delta
for V1.0 (no schema, no migrations, no SDK regeneration was performed in
this phase).

## Safety Posture

- No external HTTP / fetch / Graph / CRM / Copilot calls introduced.
- No schema, no migration, no SDK regeneration.
- No hardcoded Dataverse GUIDs.
- No fake or mock/default fallback references.
- No stage/status reference records created or mutated.
- No permission widening; no workspace access widening.
- CRM live connector untouched. Copilot live connector untouched.
- Route delta: 0.
- All output ASCII-safe.

## Validation

- `git status --short`: only the Phase 163 docs changed.
- `npm test -- NewDeal Stage Status BankerWorkspace`: passed (disabled
  New Deal state and stage/status governance assertions hold).
- Full `npm test` and `npm run build`: unchanged from the Phase 162
  certified baseline (448 files / 7625 tests green; build green with the
  existing chunk-size warning), because no runtime source file changed in
  this phase.

## V1.0 Go / No-Go

No change to the Phase 162 posture. + New Deal stays disabled and is a
known, documented, honestly-gated limitation. V1.0 is go ONLY if the
release decision formally accepts + New Deal as disabled-for-V1.0; it is
no-go if + New Deal create is a required V1.0 capability. This phase does
not unblock it and does not attempt to.

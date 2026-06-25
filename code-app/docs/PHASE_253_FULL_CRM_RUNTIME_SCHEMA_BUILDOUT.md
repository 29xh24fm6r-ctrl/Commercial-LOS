# Phase 253 — Full CRM Runtime Schema Buildout

## Outcome

**An idempotent, resume-safe, additive CRM schema buildout is ready. No schema was applied
by this assistant (no live token here), and no gate was flipped.**
`pac code push` was **not performed**.
`enabledCount = 1 / 6`. `fullLaunchAchieved = false`. CRM runtime hydration stays correctly
false until the operator applies the schema and exports fresh evidence.

## The gap (from Phase 252)

A real token-backed measurement showed the live CRM schema is only the minimal spine:

| | Live (Phase 252) | Full runtime contract |
| --- | --- | --- |
| Tables | **5** | **10** |
| Columns | **40** | **147** |
| Relationships | **0** | **28** |

Decision (per spec): build the live schema **up** to the full contract — do NOT reconcile
the bridge down to the spine.

## CRM schema delta

The full contract is generated from `src/crm/crmDataverseSchemaPlan.ts` into
`scripts/dataverse/schema/crm-full.schema.json` (**10 tables / 147 columns / 28
relationships / 10 option sets**). Against the Phase 252 live spine, the buildout adds:

- **Tables added (5):** `cr664_crmcontactpoint`, `cr664_crmcommunicationpreference`,
  `cr664_crmcontactauthorization`, `cr664_crmvendorprofile`, `cr664_crmauditentry`
  (the existing 5: organization, person, relationship, roleassignment, timelineevent).
- **Columns added (107):** 147 plan columns minus the 40 spine columns already live.
  Types: String, Memo, Boolean, DateTime, Integer, and **11 choice (Picklist) columns**
  (created as local option sets with a placeholder option — enrich values later).
- **Relationships added (28):** all CRM lookups in the plan. 18 target CRM tables
  (always created); 10 target external tables (`cr664_portfolioboardedloan`,
  `cr664_loandeal`, `cr664_team`, `cr664_platformuser`) — created when the target exists
  live, otherwise **skipped non-blocking** (mirrors `CRM_OPTIONAL_EXTERNAL_TARGETS`).

## The buildout script (idempotent, resume-safe, additive)

`scripts/dataverse/create-full-crm-runtime-schema.ps1`:

- **DRY-RUN by default**; `-Apply` mutates (gated by an `APPLY` confirmation, `-Force` to
  skip the prompt). `-Apply` requires a Dataverse-authorized token (WhoAmI 200) or it
  aborts with no mutation.
- **CREATE-MISSING-ONLY:** every table / column / relationship is checked for existence
  first and skipped if present. **No delete / rename / data-mutation path. Additive only.**
- **Idempotent + resume-safe:** safe to rerun after partial success.
- Reuses the repo's `_common.ps1` helpers; handles all CRM column types + lookups; skips
  optional external relationships whose target table is absent.

## Operator commands to apply the full CRM schema

From `code-app/` with a Dataverse-authorized session:

```powershell
# 1. Authenticate (token path the verifier/export already use)
Connect-AzAccount -Tenant e5d2be43-2e2c-4968-b5f3-c73dd825ee80
#   (or set $env:DATAVERSE_ACCESS_TOKEN to an app-user-authorized token)

# 2. Preview the plan (read-only)
powershell -File scripts/dataverse/create-full-crm-runtime-schema.ps1

# 3. Apply (create-missing-only; confirmed)
powershell -File scripts/dataverse/create-full-crm-runtime-schema.ps1 -Apply

# 4. Publish customizations (so relationships/metadata settle)
powershell -File scripts/dataverse/publish-customizations.ps1 -Apply
```

## Operator commands to regenerate SDK / data sources

```powershell
# Register the new tables as data sources + regenerate the typed SDK (10 Cr664_crm*Service.ts)
powershell -File scripts/dataverse/regenerate-powerapps-sdk.ps1 -Apply
npm run build
```

## Verification commands

```powershell
# Full CRM contract verifier: PASS only at 10/10 tables, 147/147 columns, 28/28 relationships
powershell -File scripts/dataverse/verify-full-crm-schema.ps1

# Token-backed runtime evidence export (CRM now measures the full schema)
powershell -File scripts/dataverse/export-runtime-schema-evidence.ps1

# PAC table reachability (unchanged) + full schema verifier (unchanged otherwise)
powershell -File scripts/dataverse/verify-pac-table-access.ps1
```

Then transcribe the fresh real measured output (`scripts/dataverse/evidence/runtime-schema-evidence.crm.json`)
into `CURRENT_CRM_VERIFICATION_EVIDENCE` in `src/admin/runtimeVerifiedSchemaBridge.ts`.

## Expected post-apply CRM hydration result

After the operator applies the schema, regenerates the SDK, and exports fresh evidence
showing CRM `services=10/10 datasources=10/10 live=10/10 measured={tables:10, columns:147,
relationships:28}`, `hydrateVerifiedCrmSchemaState` returns **hydrated: true** (proven by
the synthetic full-measurement test). The runtime gate still additionally requires the
live flag + authorized operator + injected transport (all fail-closed) — this phase flips
none of them.

## Safety

No feature flag flipped, no CRM/portfolio/borrower/checklist gate enabled, no `pac code
push`, no weakening of `runtimeVerifiedSchemaBridge`, and the CRM contract was NOT
reconciled down to the spine. Portfolio full buildout is a later phase (only CRM
relationships to already-existing portfolio tables are referenced here).

## Remaining blockers (after CRM buildout)

1. Operator applies the CRM schema + regenerates SDK + exports fresh evidence → CRM
   hydrates. Until then CRM runtime verified state stays fail-closed.
2. Even hydrated, the CRM live-persistence gate (`CRM_LIVE_PERSISTENCE_ENABLED`) stays off
   until a separate governed cutover + smoke.
3. Portfolio full schema buildout (219 columns / 12 required relationships) — later phase.
4. Stage advancement controlled smoke; borrower-send LIVE deploy + certification.

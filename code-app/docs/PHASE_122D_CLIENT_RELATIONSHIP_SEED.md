# Phase 122D — Reference data dependency audit for Client / Relationship

**Status:** **Audit tool delivered. Live schema inspection pending operator
run.** This phase ships a read-only Dataverse Web API metadata inspector
(`--inspect-table`) so the operator can stop guessing at Maker Portal
required fields and surface the exact column requirements for the
`cr664_clientrelationship` table (and any nested-reference tables it
depends on, e.g. `cr664_borrower`).

**No live writes performed in this commit.** The seed step runs in a
follow-up commit driven by the inspect output.

Related canonical sources:
- [PHASE_122_RETARGET_DEAL_LOOKUPS.md](PHASE_122_RETARGET_DEAL_LOOKUPS.md) — Phase 122 parent.
- [PHASE_122B_AUTOMATED_LOOKUP_REPAIR.md](PHASE_122B_AUTOMATED_LOOKUP_REPAIR.md) — lookup repair runbook + script.
- `scripts/phase122-lookup-repair.mjs` — the script that now ships `--inspect-table`.

---

## 1. Why this audit exists

Phase 122C deployed a loader-side fix that hydrates Client / Stage / Status /
Banker / Customer Type / Industry / Guarantor Structure from the actual
Dataverse `@OData.Community.Display.V1.FormattedValue` annotations. The
cockpit's missing-field count dropped from 10 to 4 after `pac code push`.

Three of those four remaining-missing fields are legitimately blank
reference lookups that stay missing until the operator populates them:
**Product type**, **Loan structure**, **Pricing type**.

The fourth is **Client** — and it stayed missing for a different reason:

> Maker Portal confirms Loan Deal.Client exists and points to Client /
> Relationship (`cr664_clientrelationship`). However, Client / Relationship
> is not a simple lookup seed table. It has required dependencies including
> a **Borrower** lookup and a **Client / Relationship relationship-type**
> field. Manual row creation is blocked by required nested reference data.

The operator's first instinct — open the form designer, fill in the
"create new" dialog — fails because Dataverse refuses save until every
ApplicationRequired column is set, and several of those columns are
themselves lookups to other tables.

The generated `@microsoft/power-apps` SDK in this repo does **not**
include a model for `cr664_clientrelationship` (it was added to Dataverse
after the last `pac modelbuilder` run; see
[`src/generated/models/`](../src/generated/models/) — there is a
`Cr664_borrowersModel.ts` but no `Cr664_clientrelationshipsModel.ts`).
The live schema is therefore the only source of truth, and the operator
needs a tool-driven audit before any seed attempt.

## 2. The audit tool

```powershell
node scripts/phase122-lookup-repair.mjs --inspect-table cr664_clientrelationship
```

**What it does:**

1. Acquires a Dataverse bearer token via the same 3-source priority
   chain as `--commit` (env var → cached → device-code).
2. GETs `/api/data/v9.2/EntityDefinitions(LogicalName='<table>')`
   with `$expand=Attributes($select=LogicalName,SchemaName,AttributeType,RequiredLevel,IsValidForCreate,IsValidForUpdate,DisplayName,IsCustomAttribute)`.
3. Partitions the columns into three buckets based on `RequiredLevel.Value`:
   - **REQUIRED FOR CREATE** — `SystemRequired` and `ApplicationRequired`
     attributes. These MUST be set on a successful create.
   - **RECOMMENDED** — `Recommended`. Best-effort to set.
   - **OPTIONAL** — `None`. Not required.
4. For every column in the REQUIRED bucket, fetches additional context
   in a follow-up GET:
   - If `AttributeType === 'Lookup'` or `Customer`: GETs the
     `Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets`
     cast and prints the resolved Targets[] array.
   - If `AttributeType === 'Picklist'`: GETs the
     `Microsoft.Dynamics.CRM.PicklistAttributeMetadata` with
     `$expand=OptionSet($select=Options)` and prints every option's
     `value → label`.
5. Prints headline table metadata too — `PrimaryNameAttribute`,
   `PrimaryIdAttribute`, `EntitySetName`, `LogicalCollectionName`,
   `DisplayName`, `IsCustomEntity`.

**Read-only contract:**

- Pure HTTP GETs, no PATCH / POST / DELETE.
- No `pac env fetch` shellout.
- No bypass headers (`BypassBusinessLogicExecution`,
  `BypassCustomPluginExecution`, `SuppressDuplicateDetection`,
  `?Force=true`) — re-asserted by negative static-source tests.
- No React app code change.

## 3. Operator workflow

### Step 1 — Inspect the table

```powershell
node scripts/phase122-lookup-repair.mjs --inspect-table cr664_clientrelationship
```

Expected output shape (truncated example — real values come from your env):

```text
Phase T — Dataverse table inspection (Web API metadata, read-only)
   Target table: cr664_clientrelationship

   LogicalName:              cr664_clientrelationship
   SchemaName:               cr664_ClientRelationship
   EntitySetName:            cr664_clientrelationships
   LogicalCollectionName:    cr664_clientrelationships
   DisplayName:              Client / Relationship
   PrimaryNameAttribute:     cr664_clientname
   PrimaryIdAttribute:       cr664_clientrelationshipid
   IsCustomEntity:           true

   REQUIRED FOR CREATE (N):
     - cr664_clientname           type=String     RequiredLevel=SystemRequired   IsCustom=true   DisplayName="Client Name"
     - cr664_borrower             type=Lookup     RequiredLevel=ApplicationRequired   IsCustom=true   DisplayName="Borrower"
         Lookup Targets: ["cr664_borrower"]                ← actual referenced entity (or whatever the live env shows)
     - cr664_relationshiptype     type=Picklist   RequiredLevel=ApplicationRequired   IsCustom=true   DisplayName="Client / Relationship"
         OptionSet (M options):
           788190000 → Borrower
           788190001 → Guarantor
           788190002 → …
     - … etc

   RECOMMENDED (K):
     - …

   OPTIONAL (J):  …not printed individually.

   Summary:
     total attributes:       N+K+J
     required for create:    N
     recommended:            K
     optional:               J
```

### Step 2 — Inspect any required-Lookup target table

The `Targets[]` array for each Lookup column tells you what nested
references the seed graph needs. For each unique target table, run a
second `--inspect-table` so you have its required-column list too:

```powershell
node scripts/phase122-lookup-repair.mjs --inspect-table cr664_borrower
```

Repeat for any other Lookup targets surfaced in step 1.

### Step 3 — Draft a seed plan from the audit output

The audit gives you the exact column requirements. Stitch them into a
seed-plan markdown checklist using the template in §4. The plan should
specify, for every record being created:

- The table's `EntitySetName` (for the `POST /api/data/v9.2/<entity-set>`
  URL).
- Every REQUIRED-FOR-CREATE column's value.
- For Lookups: the `@odata.bind` path (`/<target-entity-set>(<guid>)`).
- For Picklists: the integer choice value (NOT the label).

### Step 4 — Execute the seed (follow-up commit)

The seed mode itself is **not** part of this Phase 122D commit. Once the
inspect output is captured and the seed plan is concrete, a follow-up
commit will add a `--seed-from-spec <spec-path>` mode that:

- Reads a JSON spec describing the records to create + the deal-link
  PATCH.
- Validates every column in the spec against the live schema (re-fetch
  per `--inspect-table` shape).
- Dry-runs by default.
- Writes only with an explicit `--commit-seed` flag.

The same Phase 122B safety discipline (dry-run default + explicit
commit gate + no bypass headers + no React change) applies.

## 4. Seed-plan template

Fill in every `<…>` placeholder from the `--inspect-table` output. Do
not invent values; if you can't get a real value from Maker Portal /
the audit, escalate before seeding.

```text
Phase 122D seed plan — TEST — Deal Phase 121

Record 1 — cr664_borrower
  EntitySetName:   <from audit, e.g. cr664_borrowers>
  Columns:
    cr664_borrowername:   "TEST Borrower Phase 121"
    <other required>:     <value from audit>

  Capture the returned cr664_borrowerid as: $BORROWER_ID

Record 2 — cr664_clientrelationship
  EntitySetName:   <from audit, e.g. cr664_clientrelationships>
  Columns:
    cr664_clientname:                              "TEST Client Phase 121"
    <borrower-lookup-logical>@odata.bind:          "/<borrower-entity-set>($BORROWER_ID)"
    <relationship-type-picklist>:                  <integer-value-from-audit>
    <any other required>:                          <value from audit>

  Capture the returned cr664_clientrelationshipid as: $CLIENT_ID

Record 3 — PATCH cr664_loandeals(<TEST-deal-id>)
  Columns:
    cr664_Client@odata.bind: "/cr664_clientrelationships($CLIENT_ID)"
```

## 5. Acceptance criteria mapping

| Acceptance criterion | How it will be satisfied |
| --- | --- |
| TEST — Deal Phase 121 has a real cr664_Client lookup value | Record 3 in the seed plan above (PATCH the deal with `cr664_Client@odata.bind` pointing at the new `cr664_clientrelationship` row). |
| The linked Client / Relationship row is valid and satisfies all required fields | Record 2 in the seed plan; the `--inspect-table` output lists every REQUIRED-FOR-CREATE column so nothing is missed. |
| Code App shows Client as the real Dataverse display value | Phase 122C's loader change already reads the `@OData.Community.Display.V1.FormattedValue` annotation on `_cr664_client_value`. Once Record 3 lands, Dataverse returns the relationship row's `cr664_clientname` as the formatted value, and `mapDealDetail` surfaces it as `deal.clientName`. |
| Cockpit missing fields drops from 4 of 13 to 3 of 13 | After Records 1-3 are committed, Client is hydrated. The three remaining-missing fields stay missing per the no-fake-value contract: Product type, Loan structure, Pricing type. |

## 6. Hard non-goals

| Non-goal | Where enforced |
| --- | --- |
| Do not change React code | `--inspect-table` is a script-only mode. No `src/` files outside test infrastructure change. |
| Do not fake Client from Deal Name | The seed plan is operator-driven; no fallback fabricates a Client value. Phase 122C's loader still treats Client as undefined when the lookup is unset — the cockpit's "missing" chip is the correct nudge. |
| Do not alter Product Type / Loan Structure / Pricing Type | These remain unset references on the deal; Phase 122C explicitly keeps them missing when blank. |
| No force-delete / bypass | Phase 122B's hard-non-goal pins still apply. `--inspect-table` is read-only. |
| No pac shellout | `--inspect-table` uses the Dataverse Web API metadata endpoints exclusively. |

## 7. Cross-references

- [scripts/phase122-lookup-repair.mjs](../scripts/phase122-lookup-repair.mjs) — `--inspect-table` mode lives here.
- [src/shared/governance/phase122BScriptContract.test.ts](../src/shared/governance/phase122BScriptContract.test.ts) — 8 new static-source pins on the new mode.
- [src/deals/dealQueries.ts](../src/deals/dealQueries.ts) — Phase 122C loader fix that wires `_cr664_client_value@…FormattedValue` into `deal.clientName`. Once the seed lands, no further loader change is needed.
- [PHASE_122B_AUTOMATED_LOOKUP_REPAIR.md](PHASE_122B_AUTOMATED_LOOKUP_REPAIR.md) — the parent script's safety discipline (dry-run default, no bypass, no React change) is inherited verbatim.

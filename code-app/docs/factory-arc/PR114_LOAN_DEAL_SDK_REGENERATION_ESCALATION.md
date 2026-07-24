# PR114 — Loan Deal SDK Regeneration: Investigation + Operator Escalation

Phase 2 of the Post-PR111 Live Activation and Audit Remediation Factory Arc: "Safe Loan Deal SDK
Regeneration."

## Sandbox constraint (read first)

This session has no `pac` CLI (`which pac` / `pac --version` → command not found) and no
`DATAVERSE_URL` / `DATAVERSE_ACCESS_TOKEN` environment variables. **No live Dataverse metadata was
inspected, no SDK was regenerated, and no `pac code` command was run in this phase.** Everything
below that could be verified by static code inspection was verified and is reported with real
results. Per this phase's own explicit instruction — "if supported regeneration cannot safely be
performed here, stop this phase and produce a precise operator escalation; do not commit a
corrupted generated SDK" — **no generated file under `src/generated/` was hand-edited or
fabricated in this phase.**

## 1. Multi-select field risk — already mitigated, no action needed

The stated concern was that a `pac` regeneration could misclassify
`cr664_loandeals.cr664_relationshipexpansionopportunitytags` (a genuine Dataverse multi-select
option set) as a scalar. Inspection of the current generated SDK shows this field is correctly
shaped today:

- `src/generated/models/Cr664_loandealsModel.ts:105` — declared as
  `cr664_relationshipexpansionopportunitytags?: Cr664_loandealscr664_relationshipexpansionopportunitytags[]`
  (array-typed).
- `src/generated/services/Cr664_loandealsService.ts:19` — listed in
  `multiSelectPicklistFields`, with `serializeMultiSelectPicklistFields` /
  `deserializeMultiSelectPicklistFields` wired on create/update/retrieve/list.

A regression guard for exactly this risk already exists on `master` —
`src/shared/governance/multiSelectPicklistFieldShapeContract.test.ts` — added in an earlier phase
(`docs/DATAVERSE_SCHEMA_REMEDIATION_AAR.md` §5) after the same "pac has flattened multi-select
fields before" concern was raised for `cr664_documentchecklists` / `cr664_dealstagereferences`. It
pins both `cr664_loandeals.cr664_relationshipexpansionopportunitytags` and two
`cr664_alertqueues` fields as array-typed with intact serialize/deserialize wiring, and is
documented as verified to fail when a field is temporarily flattened to scalar. It currently
passes (7/7) against today's generated SDK. **No new test was needed for this risk; the existing
one already covers the exact table and field this phase is concerned with.**

## 2. Six new loan-deal fields — confirmed absent from the generated SDK

None of the six fields the mission states are "already applied+verified" on the live
`cr664_loandeal` table appear anywhere in `src/generated/models/Cr664_loandealsModel.ts` today:

- `cr664_loanpurpose`, `cr664_loantermmonths`, `cr664_ownershipstructure`,
  `cr664_financialspreadinputs` (all absent)
- `cr664_riskratinginputs`, `cr664_underwritingrecommendationinputs` (both absent)

This is expected and consistent with the working model: applying a Dataverse column does not by
itself update this repo's generated SDK — that requires a separate `pac code` regeneration step,
which requires tooling this sandbox does not have.

**Corroborating evidence for the "already applied" claim** (not proof — this sandbox cannot query
live Dataverse — but a structural cross-check): all six exact logical names, types, and max
lengths match pre-existing, previously-authored migration proposals byte-for-byte:

| Field | Type | Source |
|---|---|---|
| `cr664_loanpurpose` | String, maxLength 200 | `scripts/schema-migrations/pr105-loan-structure/columns.mjs` |
| `cr664_loantermmonths` | Integer | same |
| `cr664_ownershipstructure` | String, maxLength 100 | same |
| `cr664_financialspreadinputs` | Memo (JSON), maxLength 1048576 | same |
| `cr664_riskratinginputs` | Memo (JSON), maxLength 1048576 | `scripts/schema-migrations/pr106-risk-rating/columns.mjs` |
| `cr664_underwritingrecommendationinputs` | Memo (JSON), maxLength 1048576 | same |

Both migration bundles already have `verify-columns.mjs` scripts that call
`EntityDefinitions(LogicalName='cr664_loandeal')/Attributes` and diff live metadata against this
exact table — that is the correct tool to actually confirm application, not this document.

### Do not confuse with the superseded Workstream 5A proposal

`src/deals/dealPurposeTermOwnershipSchema.ts` and
`scripts/dataverse/create-deal-purpose-term-ownership-fields.ps1` are an **earlier, different, and
not-applied** proposal for loan purpose/term/ownership: option-set-typed fields named
`cr664_loanpurpose` (option set, not string), `cr664_loanterm` (not `cr664_loantermmonths`), and
`cr664_ownershipstatus` (not `cr664_ownershipstructure`). That file's own header already discloses
it is "PURE preparation... NONE of this is wired to any live read or write path." The PR105/PR106
`columns.mjs` bundles above — plain String/Integer/Memo columns — are the ones matching the six
field names this mission's environment facts state are live. Whoever wires Phase 3 capture UI to
these fields must use the PR105/PR106 shapes, not import `dealPurposeTermOwnershipSchema.ts`.

## 3. Escalation — regeneration itself requires operator action

Genuine SDK regeneration needs the `pac` CLI authenticated against
`https://org3a57b8d4.crm.dynamics.com`, which this sandbox does not have. Per the working model's
stop conditions and this phase's own fallback instruction, here is the exact operator procedure:

```powershell
# 1. Confirm the six columns actually exist on the live table before regenerating
#    (independent of this document's corroborating-evidence table above):
node scripts/schema-migrations/pr105-loan-structure/verify-columns.mjs
node scripts/schema-migrations/pr106-risk-rating/verify-columns.mjs

# 2. Regenerate the SDK for cr664_loandeals only (power.config.json already
#    registers this data source; this refreshes it in place):
pac code add-data-source -a dataverse -t cr664_loandeals

# 3. Before accepting the regen output, confirm the multi-select guard still passes:
npx vitest run src/shared/governance/multiSelectPicklistFieldShapeContract.test.ts

# 4. Diff the regenerated Cr664_loandealsModel.ts / Cr664_loandealsService.ts against
#    this document's §2 table. The six new fields should appear as plain scalar
#    properties (string / number) on the model — none of them are multi-select, so
#    none should be added to Cr664_loandealsService.ts's multiSelectPicklistFields.
#    cr664_relationshipexpansionopportunitytags must still be array-typed and still
#    listed there.

# 5. Run the full gate before committing the regenerated files:
npm run verify

# 6. Commit ONLY the regenerated SDK files (src/generated/models/Cr664_loandealsModel.ts,
#    src/generated/services/Cr664_loandealsService.ts, and any .power/ schema cache the
#    tooling updates) on a dedicated branch/PR — do not mix with Phase 3 application
#    wiring, per the working model's one-branch-per-phase rule.
```

## 4. What changed in this phase

Nothing under `src/` was modified. This document is the only new file. No generated SDK file was
hand-edited; no new field, model, or service method was fabricated; the existing multi-select
regression guard (`multiSelectPicklistFieldShapeContract.test.ts`) was inspected and confirmed
passing, not altered.

## 5. Status

**Phase 2 is blocked pending operator execution of §3.** Full validation run in this sandbox
before closing out this phase:

- `npx tsc -b` — 0 errors
- `npx vitest run` — all tests passing (no test added or changed this phase)
- `npm run audit:reachability` — unchanged (1062 non-test sources / 775 reachable / 287
  allow-listed / 0 unexpected)
- `npm run build` — succeeds

Phase 3 (loan structure capture/persistence UI) depends on the six fields above existing in the
generated SDK, so it is transitively blocked on the same operator action until §3 is completed and
merged.

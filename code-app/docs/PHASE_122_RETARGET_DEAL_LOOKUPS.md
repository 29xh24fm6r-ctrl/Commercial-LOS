# Phase 122 — Retarget Modern Operational Child-Table Deal Lookups

**Status:** **Scoped, not yet executed.** This is a Dataverse-
configuration / schema-alignment phase — **explicitly NOT a React
phase**. No `src/` files are edited under Phase 122 except the
auto-generated TypeScript model files at the very end of the
phase, and only if the regenerator emits diffs.

**Background:** Phase 121 (operator seed) surfaced a legacy-vs-
modern deal-table mismatch in the live Dataverse schema. The
modern operational child tables (document checklist, deal task,
credit memo, etc.) have `cr664_Deal` lookups whose targets do
not match what the production React code expects. The mismatch
is in **Dataverse**, not in the app. The React app already binds
correctly to `/cr664_loandeals(...)`. Phase 122 makes the schema
match what the app already assumes.

Related canonical sources:
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) §8 — the original Phase 122 scope sketch produced as Phase 121 hit the document-checklist blocker.
- [PHASE_121_LIVE_BANKER_DATA_SEED.md](PHASE_121_LIVE_BANKER_DATA_SEED.md) — the seed runbook whose Steps 6 + 7 were skipped pending this phase.
- [PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md](PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md) — the restored Due Diligence + Activity surfaces that today render honest-empty for documents.
- [PHASE_115_FIRST_LAUNCH_IDENTITY_PROVISIONING.md](PHASE_115_FIRST_LAUNCH_IDENTITY_PROVISIONING.md) — the legacy → modern bootstrap re-pointing that established the same pattern at the identity layer (`cr664_user` → `cr664_platformuser`). Phase 122 is the operational-data analogue.
- `src/deals/documentActions.ts`, `src/deals/dealTaskActions.ts`, `src/deals/creditMemoActions.ts` — production code already binding to `/cr664_loandeals(...)`.

---

## 1. What this phase is (and is NOT)

### 1.1 IS a Dataverse / maker-portal / solution phase

The fix is in `make.powerapps.com` Solution Designer →
CommercialLendingLOS → modify the lookup column definitions on
the affected tables → republish the solution. Optionally
followed by a TypeScript model regeneration (`pac modelbuilder`
or its successor) to capture the corrected metadata.

### 1.2 Is NOT a React phase

The React app binding format `'cr664_Deal@odata.bind': '/cr664_loandeals(${dealId})'`
is correct and stays unchanged. Examples that already correctly
target the modern table:

| File | Line | Binding |
| --- | --- | --- |
| [src/deals/documentActions.ts](../src/deals/documentActions.ts) | 131, 337, 551 | `'/cr664_loandeals(...)'` |
| [src/deals/dealTaskActions.ts](../src/deals/dealTaskActions.ts) | 133, 354 | `'/cr664_loandeals(...)'` |
| [src/deals/creditMemoActions.ts](../src/deals/creditMemoActions.ts) | 168, 202, 257 | `'/cr664_loandeals(...)'` |

The loader contracts ([src/banker/workQueueQueries.ts:140-145](../src/banker/workQueueQueries.ts#L140-L145)
+ [src/banker/dealQueries.ts:53-66](../src/banker/dealQueries.ts#L53-L66))
also assume the modern target. None of these should change in
Phase 122.

### 1.3 Is NOT a schema redesign

Phase 122 does NOT:
- Modify the `cr664_loandeal` table itself.
- Modify `cr664_banker`, `cr664_borrower`, `cr664_platformuser`,
  `cr664_platformworkspace`, or any bootstrap table.
- Touch the email lane (Phase 104–110 lock remains intact).
- Address the **separate** `cr664_dealtask1.cr664_AssignedTo`
  form/quick-find view bug that prevented Phase 121 Step 5 —
  that is a per-form-config issue, not a lookup-target issue,
  and ships in a different phase if/when it ships.

---

## 2. Scope

### 2.1 Confirmed broken (operator-verified during Phase 121)

| Table | Lookup column | Current target | Required target |
| --- | --- | --- | --- |
| `cr664_documentchecklist` | `cr664_Deal` | legacy `cr664_deal` | `cr664_loandeal` |

Evidence (from `pac env fetch` + maker-portal observation during
Phase 121):
- The maker-portal Deal lookup on `cr664_documentchecklist` offers only `Woody Woodson` (the single existing legacy `cr664_deal` row, whose primary name field `cr664_borrowername` happens to be that string).
- It does NOT offer `TEST — Deal Phase 121` (`d3d46688-3259-f111-bec7-70a8a59be491` in `cr664_loandeal`).
- The two pre-existing `cr664_documentchecklist` rows (`Paller Holdings Expansion`, `paller holdings part 2`) have null Deal FK — `<all-attributes/>` dump returned no `_cr664_deal_value`.

### 2.2 Candidates worth inspecting (likely same pattern, not visually confirmed)

Production code binds these to `/cr664_loandeals(...)`. None of
these tables have rows with the Deal FK populated in the live
env (verified via `pac env fetch`), so the lookup target
couldn't be visually confirmed during Phase 121. **The Phase
122 implementer must inspect each in the maker-portal table
designer before retargeting.**

| Table | Lookup column | Likely current target | Required target |
| --- | --- | --- | --- |
| `cr664_dealtask1` | `cr664_Deal` | legacy `cr664_deal` (likely) | `cr664_loandeal` |
| `cr664_creditmemo1` | `cr664_Deal` | legacy `cr664_deal` (likely) | `cr664_loandeal` |
| `cr664_creditmemodraftsection` | `cr664_Deal` | legacy `cr664_deal` (likely) | `cr664_loandeal` |
| `cr664_dealtimelineevent` | `cr664_Deal` | legacy `cr664_deal` (likely) | `cr664_loandeal` |

For each table the implementer should:
1. Open the table → Columns → click the `Deal` (or `cr664_Deal`) column.
2. Inspect the lookup's **Related Table** value in the column properties.
3. If it shows `cr664_deal` → retarget per §3.
4. If it already shows `cr664_loandeal` → no change required, record as already-aligned.

### 2.3 Out of scope (do NOT touch in this phase)

- The legacy `cr664_deal` table itself. Phase 122 retargets
  references AWAY from it, but does not delete it. A follow-on
  phase can evaluate deletion if no other consumer remains.
- The `cr664_dealtask1.cr664_AssignedTo` lookup. Different bug
  (form / view config, not target mismatch). Ships separately.
- The legacy `cr664_user` table. Phase 115 already established
  that `cr664_platformuser` is the modern identity table; no
  retargeting is needed because no banker-facing surface
  queries `cr664_user` today.
- Any audit / governance / workspace / banker table that
  Phase 104–110 communication lock protects.

---

## 3. Recommended execution sequence

Each step is a maker-portal / `pac` operation. None edits
`src/`.

### 3.1 Pre-flight read-only audit

For each candidate table in §2.2, run a one-shot probe via
`pac env fetch` to look for any existing rows whose Deal FK is
populated and join cleanly to `cr664_loandeal` vs legacy
`cr664_deal`. Inner-join evidence is the cleanest signal of the
actual current target.

```powershell
# Example: probe cr664_dealtask1.cr664_Deal
pac env fetch --xml "<fetch><entity name='cr664_dealtask1'><attribute name='cr664_dealtask1id'/><link-entity name='cr664_loandeal' from='cr664_loandealid' to='cr664_deal' link-type='inner' alias='ld'><attribute name='cr664_dealname'/></link-entity></entity></fetch>"

pac env fetch --xml "<fetch><entity name='cr664_dealtask1'><attribute name='cr664_dealtask1id'/><link-entity name='cr664_deal' from='cr664_dealid' to='cr664_deal' link-type='inner' alias='d'><attribute name='cr664_borrowername'/></link-entity></entity></fetch>"
```

A row that returns from the legacy join (second query) but not
the modern join (first) is concrete confirmation. **Note:** the
candidate tables are mostly empty in the live env, so this
audit may return inconclusive (zero rows on both joins) — in
that case the table-designer inspection in §2.2 step 2 is the
authoritative source.

### 3.2 Solution-export checkpoint

Before any modification:

```powershell
pac solution export --path .\backups\CommercialLendingLOS-pre-phase-122-2026-05-27.zip --name CommercialLendingLOS --managed false
```

Captures the current state so the retarget is reversible if it
introduces unforeseen schema effects.

### 3.3 Retarget each confirmed-broken lookup

For each table from §2.1 + §2.2 that the audit confirms targets
legacy `cr664_deal`:

1. **make.powerapps.com → Solutions → CommercialLendingLOS → open the table.**
2. **Columns → click the `Deal` / `cr664_Deal` lookup column.**
3. **Note the relationship name.** Dataverse generates one like `cr664_cr664_deal_cr664_documentchecklist_cr664_Deal` — copy it before deletion. The production TypeScript model expects the bind alias `cr664_Deal@odata.bind`, which derives from this relationship.
4. **Delete the column.** Dataverse will warn about FK data loss. Since the table is mostly empty (§2.2 confirms), the loss is limited; any populated FK values that point at legacy rows would be orphaned anyway (per Phase 121 analysis).
5. **Create a new lookup column with the same display name + schema name (`cr664_Deal`), target = `cr664_loandeal`.**
6. **Set the relationship behavior** to match the prior config (typically "Parental" or "Referential" — record what was there before).
7. **Save & publish the table.**

Repeat for each of the 5 candidate tables that audit confirms
need it.

### 3.4 Republish the solution

```powershell
pac solution publish
```

This makes the schema changes visible to the deployed Power
Apps Code App at next user-session reload.

### 3.5 Regenerate TypeScript models (optional but recommended)

```powershell
# Use whatever model-generator the project standardized on
# (`pac modelbuilder` is deprecated; the current generator may
#  be a Power Apps SDK CLI or a Codegen Designer artifact).
```

Compare the regenerated `Cr664_*Model.ts` files to the current
ones. Most likely the diffs are zero (TypeScript model carries
only the bind-string type, not the target entity), but verify
any change before committing.

### 3.6 Re-run Phase 121 Steps 6 + 7

With the retargeted lookup in place, the operator should now be
able to:

1. Open Tables → **Document Checklist** → **+ New**.
2. Fill the form per Phase 121 §3 Step 6 (the original instructions, not the SKIPPED version).
3. The `Deal` lookup should now offer `TEST — Deal Phase 121`.
4. Save the row.
5. Repeat for the optional Step 7 pending-review document.

Then re-walk the Phase 121 §4 validation. The §4.4 / §4.5 /
§4.7 honest-empty annotations should now light up with the
seeded document rows.

### 3.7 Verification gates

```powershell
npm test -- --run
npm run build
```

Tests should pass unchanged (the React code already targeted
the modern table; nothing about Phase 122 affects test
behavior). Build should be clean. If the model regen in §3.5
produces diffs, commit those changes along with the seed
validation evidence.

---

## 4. Risk register

| Risk | Mitigation |
| --- | --- |
| Retarget breaks an unknown consumer of legacy `cr664_deal` | Solution export (§3.2) is the rollback path; legacy table itself is not deleted |
| Pre-existing `cr664_documentchecklist` rows with NULL Deal FK | Pre-existing rows are NOT in scope; retarget only affects new rows + future reads. Existing null rows stay null. |
| Pre-existing `cr664_creditmemo1` rows (5 rows: `Memo for Deal #*`) lose their Deal FK | Confirmed via `pac env fetch` that all 5 have null Deal FK already — nothing to lose. |
| The Phase 121 AssignedTo bug masks a Task FK retarget validation | Phase 122 deliberately scopes Task FK retarget separately; if §3.3 confirms `cr664_dealtask1.cr664_Deal` was already targeted at the modern table, no change is needed regardless of the AssignedTo bug |
| Solution Designer doesn't allow same-name re-creation of a lookup column | If Dataverse blocks "cr664_Deal" as a duplicate-name after delete, use a temporary name (`cr664_Deal_v2`) + then rename. Document the relationship-name change so the TS model regen captures the new alias. The React app's bind string `cr664_Deal@odata.bind` would need to change in that case — IF AND ONLY IF, this becomes a follow-on micro-React-phase, not part of Phase 122. |
| Model regen introduces diffs that conflict with phase 119/120 derivations | The Phase 75 / 117 / 119 / 120 tests mock the loader function boundaries, not the generated SDK service shape. Tests should not be affected by metadata-only diffs. If a regen does produce a behavior diff, investigate before committing. |

---

## 5. Hard constraints

These are non-negotiable for Phase 122 and shipped tests will
break if violated:

1. **Do NOT modify `src/deals/documentActions.ts`, `src/deals/dealTaskActions.ts`, or `src/deals/creditMemoActions.ts`** to change the `/cr664_loandeals(...)` binding. The binding is already correct.
2. **Do NOT modify `src/banker/workQueueQueries.ts`** — the loader filter `_cr664_deal_value eq <cr664_loandealid>` assumes the modern target.
3. **Do NOT modify `src/banker/dealQueries.ts`** — `loadBankerPipeline` is the source of truth for what counts as a "deal" Matt is assigned to.
4. **Do NOT change the email lane** — Phase 110 communication lock remains intact (no `Office365OutlookService` import additions, no `SendEmailV2` callsite changes, no `sendXEmail` action changes).
5. **Do NOT delete the legacy `cr664_deal` table** in this phase. A future phase can evaluate that.
6. **Do NOT seed fabricated React data** to mask the honest empty states surfaced during Phase 121. Phase 122 enables real data; it doesn't fabricate.

---

## 6. Acceptance criteria

Phase 122 is complete when **all of**:

- [ ] §3.1 pre-flight audit complete for all 5 candidate tables; per-table target confirmed (legacy or modern).
- [ ] §3.2 solution export captured to `backups/CommercialLendingLOS-pre-phase-122-<date>.zip`.
- [ ] Every confirmed-broken lookup retargeted to `cr664_loandeal`.
- [ ] §3.4 solution published.
- [ ] §3.5 TS model regen complete; any diffs reviewed.
- [ ] §3.6 Phase 121 Step 6 successful — `TEST — Outstanding Document Phase 121` saved against `TEST — Deal Phase 121` via the Document Checklist Deal lookup.
- [ ] §3.6 (optional) Step 7 successful.
- [ ] §4.4 Phase 121 Action Queue tab now surfaces the seeded document.
- [ ] §4.5 Phase 121 Due Diligence tab now surfaces the seeded document in the Outstanding section.
- [ ] §3.7 `npm test -- --run` passes (unchanged test count + behavior).
- [ ] §3.7 `npm run build` clean.
- [ ] [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) §10 stamp flipped to "validated" with the post-retarget walk date.

Once acceptance criteria are met, the deferred Phase 121 row
creation (`TEST — Outstanding Document Phase 121` + optional
`TEST — Pending Review Document Phase 121`) becomes the
canonical populated-state evidence for the document-related
surfaces.

---

## 7. What this phase explicitly does NOT unlock

- **The `cr664_dealtask1.cr664_AssignedTo` form/view fix.** That
  is a separate maker-portal form-designer issue (the
  AssignedTo lookup quick-find view is misconfigured; Matt's
  systemuser doesn't appear even though he is enabled). Phase
  122's lookup-target retarget on `cr664_dealtask1.cr664_Deal`
  does not address the AssignedTo lookup at all. Open tasks
  KPI tile + My Tasks rail panel remain honestly empty after
  Phase 122 if and only if that separate fix has not shipped.
- **A bulk seed utility.** Per the Phase 121 audit, no Node /
  PowerShell seed utility was built. Phase 122 doesn't change
  that calculus.
- **Legacy table cleanup.** The legacy `cr664_deal` row
  (`Woody Woodson`) stays in place after Phase 122.

---

## 8. Cross-references

- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) §8 + §10 — the scoping origin + the seed completion record this phase unblocks the document portion of.
- [PHASE_121_LIVE_BANKER_DATA_SEED.md](PHASE_121_LIVE_BANKER_DATA_SEED.md) — the full seed runbook.
- [PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md](PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md) — the Due Diligence + Activity surfaces this phase enables populated-state validation for.
- [PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md](PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md) — the KPI tiles whose document/task counts go from honest-empty to populated.
- [PHASE_117_BANKER_WORKSPACE_UX_PARITY.md](PHASE_117_BANKER_WORKSPACE_UX_PARITY.md) — the shell whose honest-empty behavior Phase 122 transitions to honest-populated.
- [PHASE_115_FIRST_LAUNCH_IDENTITY_PROVISIONING.md](PHASE_115_FIRST_LAUNCH_IDENTITY_PROVISIONING.md) — the parallel legacy-to-modern repointing precedent at the identity layer.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane lock this phase honors.
- `src/deals/documentActions.ts`, `dealTaskActions.ts`, `creditMemoActions.ts` — the production bindings this phase makes match.
- `src/banker/workQueueQueries.ts`, `dealQueries.ts` — the loader contracts that already assume the modern target.

---

## 9. Execution audit (2026-05-27) — actual live state probed via `pac env fetch`

This section is the **execution audit** that confirmed Phase
122's premise and sharpened the operator runbook. Everything
below is what the read-only probe found, with the explicit
revision to §2 in light of it.

### 9.1 What `pac env fetch` returned

Audited against `mpaller@oldglorybank.com` /
`org3a57b8d4.crm.dynamics.com` on 2026-05-27. For each of the
five candidate child tables, the probe attempted
`<attribute name='_cr664_deal_value'/>` in a FetchXML query.
Result:

| Table | `_cr664_deal_value` exists in live schema? |
| --- | --- |
| `cr664_documentchecklist` | **NO** — FetchXML error `"…doesn't contain attribute with Name = '_cr664_deal_value'…"` |
| `cr664_dealtask1` | **NO** — same error |
| `cr664_creditmemo1` | **NO** — same error |
| `cr664_creditmemodraftsection` | **NO** — same error |
| `cr664_dealtimelineevent` | **NO** — same error |

Live row counts at audit time:

- `cr664_loandeal`: 1 row (`TEST — Deal Phase 121`, banker = Matthew Paller).
- `cr664_deal` (legacy): ≥ 1 row (`Woodsons Wood Shop` / `Woody Woodson`).
- `cr664_documentchecklist`: 2 rows (`Paller Holdings Expansion`, `paller holdings part 2`) — **no Deal FK populated on either**.
- `cr664_dealtask1`: 0 rows.
- `cr664_creditmemo1`: ≥ 4 seed rows (`Memo for Deal #1`…`#5`) with `workspace_xxx` text fields, **no Deal FK**.
- `cr664_creditmemodraftsection`: 0 rows.
- `cr664_dealtimelineevent`: 0 rows.

`systemuser` row for Matthew Paller is present and enabled
(`e056f0e7-4a13-f111-8406-6045bd07ee56`). The AssignedTo
sub-blocker is **not** a missing-user issue.

Similarly, `cr664_dealtask1._cr664_assignedto_value` returns
the same "attribute doesn't exist" error.

### 9.2 Revised hypothesis (sharpening §2)

Phase 121's manual-seed observation was that the Document
Checklist Deal lookup in Maker Portal "only offered Woody
Woodson rows", interpreted as *"the lookup currently targets
legacy `cr664_deal`."*

The audit shows the truth is sharper:

> **The Deal lookup column does not exist on any of the 5
> operational child tables in the live Dataverse**, despite
> being declared in the generated TypeScript models. The
> Maker Portal picker the user saw was likely a form-side
> reference to a *legacy* `cr664_deal` form field, not the
> live `cr664_documentchecklist.cr664_Deal` column. The same
> is true for `cr664_dealtask1.cr664_AssignedTo`.

The fix is therefore **add the missing lookup columns** to
the live tables — not retarget an existing lookup. The §3
runbook below is updated accordingly. (Original §3 retarget
language is preserved in case some tables turn out to have
an orphaned column that needs delete-then-recreate; the
operator should report and stop if so.)

### 9.3 Static-source contract tests (this commit)

[src/shared/governance/phase122LoanDealLookupContract.test.ts](../src/shared/governance/phase122LoanDealLookupContract.test.ts)
— 22 cases pinning the modern bind URL contract:

| Block | Pins |
| --- | --- |
| Operational writes (3 files × 2 cases) | every `cr664_(Deal\|LoanDeal)@odata.bind` URL is `/cr664_loandeals(...)`; no `/cr664_deals(` anywhere. |
| Operational loaders (5 files × 2 cases) | every loader filters by `_cr664_deal_value`; no `Cr664_dealsService` imports. |
| Generated models (5 cases) | each of the 5 operational child models exposes the `"cr664_Deal@odata.bind"` + `_cr664_deal_value` bind/FK pair. |
| Cross-cutting recursive (1 case) | full `src/deals/` + `src/banker/` scan finds zero `/cr664_deals(` substrings. |

Status: ✅ All 22 cases pass on master. The React-side contract
is locked; any future regression to a legacy bind URL will
fail CI.

### 9.4 Operator runbook (revised)

The operator runbook moves from "retarget an existing lookup"
to **"add the missing lookup columns"**. Detail:

**§9.4.1 Rollback checkpoint** — Maker Portal → Solutions →
CommercialLendingLOS → Export → Unmanaged → save
`CommercialLendingLOS_PRE_PHASE_122.zip` BEFORE any change.

**§9.4.2 Add the Deal lookup column to each of the 5 operational
child tables.** For each of `cr664_documentchecklist`,
`cr664_dealtask1`, `cr664_creditmemo1`,
`cr664_creditmemodraftsection`, `cr664_dealtimelineevent`:

1. Open the table in the CommercialLendingLOS solution.
2. Columns → + New column.
3. Display name: `Deal`. Schema name: `cr664_Deal` (must match
   the generated model verbatim). Data type: Lookup. Related
   table: `Loan Deal` (`cr664_loandeal`). Required: Optional.
   Searchable: ✅.
4. Save.
5. If `cr664_Deal` schema name is rejected because an
   orphaned column with the same name already exists, **STOP
   and report**. The operator and reviewer can then decide
   whether to delete-then-recreate (and whether to take a row
   backup first).

After all 5 columns, **Publish all customizations**.

**§9.4.3 Add the AssignedTo lookup column to `cr664_dealtask1`.**
Same flow:

- Display name: `Assigned to`. Schema name: `cr664_AssignedTo`.
- Data type: Lookup. Related table: `User` (`systemuser`).
- Required: Optional. Searchable: ✅.
- Save + publish.

**§9.4.4 Verify via `pac env fetch`.**

```bash
pac env fetch -x "<fetch count='1'><entity name='cr664_documentchecklist'><attribute name='cr664_documentchecklistid'/><attribute name='_cr664_deal_value'/></entity></fetch>"
```

Expected: column appears in the column list (empty values on
existing rows are fine). Repeat for the other 4 tables. For
AssignedTo on `cr664_dealtask1`:

```bash
pac env fetch -x "<fetch count='1'><entity name='cr664_dealtask1'><attribute name='cr664_dealtask1id'/><attribute name='_cr664_assignedto_value'/></entity></fetch>"
```

**§9.4.5 Model regeneration — only if schema names deviated.**
If §9.4.2 + §9.4.3 used the canonical schema names
(`cr664_Deal` / `cr664_AssignedTo`), the existing TypeScript
models already match — **no regeneration needed**. If the
operator was forced to use a different schema name, STOP
before regenerating; that becomes a scoped Phase 122B
("model + bind-URL field-name sync").

**§9.4.6 Re-run Phase 121 seed steps 5 + 6.** Per
`docs/PHASE_121_OPERATOR_SEED_CHECKLIST.md`:

- **TEST — Outstanding Document Phase 122**, linked to
  `TEST — Deal Phase 121`, `cr664_uploadstatus = false`,
  no `cr664_receiveddate`, no `cr664_reviewer`.
- **TEST — Pending Review Document Phase 122**, linked to
  `TEST — Deal Phase 121`, `cr664_uploadstatus = true`,
  `cr664_receiveddate = <today>`, no `cr664_reviewer`.
- **TEST — Task Phase 122**, linked to `TEST — Deal Phase 121`,
  `cr664_AssignedTo = Matthew Paller`, `cr664_completed = false`,
  `cr664_duedate = <today + 7d>`. **Skip honestly** if the
  AssignedTo column is still missing — do not substitute another
  user.

**§9.4.7 Validate in the deployed cockpit.** After seed +
browser refresh:

- Banker dashboard: Outstanding Docs tile = 1 · Pending
  Reviews tile = 1 · Tasks Open tile = 1 (or 0 if task seed
  was deferred).
- Deal cockpit (TEST — Deal Phase 121): Attention Console
  shows blocker-state items; Documents widget reads
  `1 outstanding`; Workstream Documents bar shows `0 / 1`
  with `1 outstanding` detail.

If any value stays at 0 after refresh, capture the network
panel's OData request URL and report — the issue is then on
the loader query path, not the schema.

### 9.5 Acceptance criteria (this commit)

- [x] All audit probes recorded in §9.1.
- [x] 22 static-source contract tests added and passing.
- [x] Operator runbook clarified to "add missing columns" rather
      than "retarget existing lookup" (with fallback if an
      orphan column blocks the canonical schema name).
- [x] Rollback checkpoint procedure documented (§9.4.1).
- [x] AssignedTo sub-blocker root cause identified — missing
      column, not missing user.
- [x] No React code change.
- [x] No bind URL change to legacy `/cr664_deals(...)`.
- [x] No fake data; no governed-write or email-lane changes.

### 9.6 What this commit does NOT do

- It does **not** execute §9.4.2 / §9.4.3 / §9.4.6 / §9.4.7 —
  those are operator-side Maker Portal + seed + visual-validation
  steps that require a human in `make.powerapps.com`.
- It does **not** deploy to the environment (no `pac code
  push`). The shell + cockpit work from Phase 125B–G is still
  held for combined deploy per the user's directive; Phase 122
  operator work happens BEFORE that push if possible so the
  populated state can be validated against the new shell on
  the same deployment.

---

## 10. Publisher-prefix finding (2026-05-29) — operator attempt blocked, corrected runbook

### 10.1 What happened

Operator opened Maker Portal → CommercialLendingLOS → Document
Checklist → Columns → + New column with Display name `Deal` /
Data type `Lookup` / Related table `Loan Deal`. Maker Portal
proposed the schema name **`new_Deal`**, not `cr664_Deal`. The
operator did NOT save and stopped to investigate. The operator
also reported that the Document Checklist column grid behind
the side panel **already visibly carries a `Deal *` column**.

### 10.2 Audit (read-only) of the publisher state

Probed via `pac env fetch -x "<fetch><entity name='publisher'>…"`:

| Publisher (`uniquename`) | Friendly name | Prefix | Notes |
| --- | --- | --- | --- |
| `Crc0077` | CDS Default Publisher | **`cr664`** | Owns the entire `cr664_*` namespace |
| `DefaultPublisherorg3a57b8d4` | Default Publisher for org3a57b8d4 | **`new`** | Dataverse fallback publisher |
| `OGB` | Old_Glory_Bank_BLG | `ogb` | OGB-prefix tables |
| `microsoftfirstparty` / `microsoftdynamics` / etc. | (Microsoft built-ins) | various | Not relevant |

And solution → publisher join:

| Solution (`uniquename`) | Publisher | Prefix |
| --- | --- | --- |
| **`CommercialLendingLOS`** | **Default Publisher for org3a57b8d4** | **`new`** |
| `Crc9cb1` (Common Data Services Default Solution) | CDS Default Publisher | `cr664` |
| `LoanOpsExport` | CDS Default Publisher | `cr664` |
| `OGBBusinessLendingCore` | Old_Glory_Bank_BLG | `ogb` |

**Root cause:** `CommercialLendingLOS` is owned by the Default
Publisher (`new` prefix). Any new column added inside that
solution will be named in the `new_` namespace. The `cr664_`
namespace is owned by a **different** publisher (`Crc0077`),
which owns `Crc9cb1` and `LoanOpsExport`.

### 10.3 Audit (read-only) of the existing "Deal *" column

Probed each of the 5 operational child tables via FetchXML
attribute existence. Every table reports the same shape:

| Table | `cr664_deal` exists? | `cr664_dealname` exists? | `_cr664_deal_value` exists? | Filter behavior |
| --- | --- | --- | --- | --- |
| `cr664_documentchecklist` | ✅ | ✅ | ❌ | `cr664_deal eq <guid>` accepts GUID values; rejects non-GUID string with `System.FormatException` |
| `cr664_dealtask1` | ✅ | ✅ | ❌ | same |
| `cr664_creditmemo1` | ✅ | ✅ | ❌ | same |
| `cr664_creditmemodraftsection` | ✅ | ✅ | ❌ | same |
| `cr664_dealtimelineevent` | ✅ | ✅ | ❌ | same |

Plus on `cr664_dealtask1`:

| Attribute | Exists? |
| --- | --- |
| `cr664_assignedto` | ✅ |
| `cr664_assignedtoname` | ✅ |
| `_cr664_assignedto_value` | ❌ |

**Interpretation:** the existing `cr664_deal` (and
`cr664_assignedto`) columns are **NOT standard relational
Lookup columns**. A standard Dataverse Lookup column exposes
itself in OData as `_<schemaname>_value` (the FK GUID
attribute) + `<schemaname>name` (the formatted-name display
attribute). The `_value` attribute is missing here, which
means:

- The columns were created as some non-standard variant —
  most likely a **UniqueIdentifier**-typed scalar column,
  or a legacy XRM-API-created lookup that bypasses the
  normal OData FK-naming convention.
- The Maker Portal Form Designer for these tables is
  separately wired to render `cr664_deal` as a lookup-style
  picker pointing at the legacy `cr664_deal` table — but
  that's a form-control configuration, not the column's
  underlying type.
- The "`Deal *`" the operator sees in the column grid is
  THIS pseudo-lookup column. The asterisk likely means
  "required" — but both existing rows on
  `cr664_documentchecklist` carry NULL in this column,
  suggesting either (a) the required flag was added after
  the rows were created, or (b) the asterisk has a
  different meaning in the column grid view.

**This explains why the cockpit appears "honestly empty":**
the app's loaders filter by `_cr664_deal_value eq <loanDealId>`,
but `_cr664_deal_value` does not exist on the live tables.
Every loader query throws "attribute doesn't exist" against
the live env. The honest-empty UI is masking a hard query
failure.

### 10.4 Answers to the operator's questions

**Q1: Is the existing visible "Deal *" column on Document
Checklist the legacy wrong lookup?**

Not exactly. It's a **non-standard** column named `cr664_deal`
on the table itself. It accepts GUID values but doesn't have
the OData FK representation a normal Lookup has. The picker
the operator saw offering Woody Woodson rows in Phase 121 was
a form-side configuration of a lookup control wired to legacy
`cr664_deal`, not a property of the underlying column type.

**Q2: What is its actual schema name and target table?**

- Schema name: **`cr664_deal`** (no `_value` suffix, not the
  standard Lookup column naming pattern).
- "Target table" is **not constrained at the column level**.
  The column accepts any GUID. The form-level lookup picker
  was probably pointed at legacy `cr664_deal`.

**Q3: Why does Maker Portal create new columns with prefix
`new_` in this solution?**

Because the **`CommercialLendingLOS` solution's publisher is
"Default Publisher for org3a57b8d4"** (customization prefix
`new`). New columns added inside a solution use that solution's
publisher's prefix. The `cr664_` prefix belongs to a different
publisher (`CDS Default Publisher` / `Crc0077`).

**Q4: Can we create `cr664_Deal` through the correct publisher
/ solution path?**

Yes — three options, ranked by safety:

- **Path B (RECOMMENDED): Add the column from a solution that
  IS owned by the `cr664` publisher.** Either `Crc9cb1`
  (Common Data Services Default Solution) or `LoanOpsExport`.
  In Maker Portal:
  1. Solutions → `Common Data Services Default Solution`
     (or `LoanOpsExport`) → Tables → click "+ Add existing
     table" → pick `Document Checklist` (the `cr664_documentchecklist`
     table already exists; you're just registering it inside
     this solution).
  2. Once the table is in the solution, click into it → Columns →
     "+ New column". Maker Portal will now propose the `cr664_`
     prefix because the solution's publisher is `Crc0077`.
  3. Display name `Deal`, Schema name `cr664_Deal` (verbatim),
     Data type Lookup, Related table `Loan Deal`, Required:
     Optional, Searchable: ✅. Save. Publish.
  4. Repeat for the other 4 child tables.
  Trade-off: the new columns will be "owned" by the
  `Crc9cb1` (or `LoanOpsExport`) solution; if you want them
  to also export with CommercialLendingLOS, add them as
  existing components to CommercialLendingLOS too (this is
  a no-op cross-listing, not a duplication).

- **Path A: Reassign CommercialLendingLOS's publisher to the
  `cr664` publisher.** Maker Portal → Solutions →
  CommercialLendingLOS → Edit → Publisher → switch to `CDS
  Default Publisher`. Trade-off: changing a solution's publisher
  may be blocked depending on the solution layer's state and
  the operator's admin permissions; if the solution is managed,
  the change cannot be made without recreating the solution.
  This path is **NOT recommended** unless Path B is blocked.

- **Path C (Phase 122B contract migration): Update the React
  contract to `new_Deal`.** This would require regenerating
  the 5 TypeScript models, rewriting every `'cr664_Deal@odata.bind'`
  bind URL field to `'new_Deal@odata.bind'`, rewriting every
  `_cr664_deal_value` filter string to `_new_deal_value`,
  and re-running every test that asserts on the contract.
  Trade-off: it bakes a default-publisher dependency into the
  codebase that's brittle to environment changes (the `new_`
  prefix is the Dataverse fallback, not a meaningful owner).
  **STRONGLY DISCOURAGED.** Use only if Path A AND Path B
  are both blocked.

**Q5: Should Phase 122B update the contract, or should the
publisher / solution be corrected first?**

**Fix the publisher first (Path B).** The cost-comparison
favors it strongly:

| Cost dimension | Path B (fix publisher) | Path C (migrate contract) |
| --- | --- | --- |
| React code changes | 0 | ~5 model files + ~3 action files + ~5 loader files + tests |
| Generated-model regenerations | 0 (the existing `cr664_Deal@odata.bind` model is correct) | 5 model files re-emitted |
| Bind URL string rewrites | 0 | ~10 occurrences across 3 files |
| Filter-string rewrites | 0 | ~6 occurrences across 5 files |
| Test-file changes | 0 | The Phase 122 contract pin (22 cases) would invert direction |
| Reversibility | High — column deletion is straightforward | Low — re-pinning a new contract is a full git revert |
| Environment-portability risk | None | Locks the app to the default-publisher prefix; brittle across environments |

**Q6:** Honored — no live writes performed in this audit.

### 10.5 Corrected operator runbook (replaces §9.4 where they conflict)

> **Stop:** read §10.6 (the existing-`cr664_deal`-column
> conflict) BEFORE adding any new column. The existing
> `cr664_deal` pseudo-column will collide with the new
> `cr664_Deal` standard Lookup unless it's handled first.

**§10.5.1 — Solution-export rollback checkpoint** (unchanged
from §9.4.1). Export the full `CommercialLendingLOS` solution
AND the `Crc9cb1` Common Data Services Default Solution. Save
both as `*_PRE_PHASE_122.zip`.

**§10.5.2 — Decide which `cr664_` solution will hold the new
columns.** Recommended: `LoanOpsExport` (smaller surface, less
risk of collision). Confirm via Maker Portal that you can
edit `LoanOpsExport` and it's owned by `CDS Default Publisher`.

**§10.5.3 — Handle the existing `cr664_deal` pseudo-column.**
The current `cr664_deal` column on each of the 5 child tables
is a non-standard column that will block creation of a
standard `cr664_Deal` Lookup with the same schema name. For
each of `cr664_documentchecklist`, `cr664_dealtask1`,
`cr664_creditmemo1`, `cr664_creditmemodraftsection`,
`cr664_dealtimelineevent`:

1. Add the table as existing component to your `cr664_`-prefix
   solution (`LoanOpsExport`).
2. Click into the table → Columns → find the existing
   `cr664_deal` column. Inspect its **Data type** in the
   right-side details panel:
   - If it's **Lookup** with target `cr664_deal` (legacy):
     the original Phase 122 retarget hypothesis was right and
     this column needs to be deleted-then-recreated as a
     `cr664_loandeal` target.
   - If it's **Unique Identifier** or some other scalar type:
     the column is a legacy artifact and needs to be deleted
     to make room for a real Lookup.
   - If it's **Lookup** with target `cr664_loandeal` already:
     **STOP** — the `_cr664_deal_value` OData attribute
     should then exist; the audit said it didn't, which would
     be inconsistent. Report and re-audit before proceeding.
3. **Before deleting**: confirm no live rows have a populated
   value (the audit showed both Document Checklist rows have
   `cr664_deal` IS NULL; re-confirm with `pac env fetch -x
   "<fetch count='5'><entity name='cr664_documentchecklist'>
   <attribute name='cr664_deal'/><filter><condition
   attribute='cr664_deal' operator='not-null'/></filter>
   </entity></fetch>"`). If any rows ARE populated, capture
   the GUID values into a CSV before deletion so the data
   can be re-attached after the new column lands.
4. Delete the existing `cr664_deal` column. Publish customizations.

Repeat for all 5 tables. Also do the equivalent for
`cr664_dealtask1.cr664_assignedto` before adding the new
`cr664_AssignedTo` Lookup.

**§10.5.4 — Add the standard `cr664_Deal` Lookup column.**
Inside your `cr664_`-prefix solution (`LoanOpsExport`), for
each of the 5 tables:

1. Columns → + New column.
2. Display name: `Deal`. Schema name: **`cr664_Deal`** (verbatim
   capitalization). Data type: **Lookup**. Related table:
   `Loan Deal` (`cr664_loandeal`). Required: Optional.
   Searchable: ✅.
3. Save the column.

Maker Portal should now propose the **`cr664_`** prefix
because the solution's publisher is `Crc0077`. If it still
proposes `new_`, **STOP** — Path B is blocked. Re-audit which
solution you're in (the publisher join in §10.2 is
authoritative).

Repeat for all 5 tables. Publish all customizations.

**§10.5.5 — Add `cr664_AssignedTo` Lookup to `cr664_dealtask1`.**
Same flow as §10.5.4 but with:

- Display name: `Assigned to`. Schema name: **`cr664_AssignedTo`**.
- Data type: **Lookup**. Related table: `User` (`systemuser`).

**§10.5.6 — Verify via `pac env fetch`.** Each table should
now report `_cr664_deal_value` as a known attribute:

```bash
pac env fetch -x "<fetch count='1'><entity name='cr664_documentchecklist'><attribute name='cr664_documentchecklistid'/><attribute name='_cr664_deal_value'/></entity></fetch>"
```

Expected: no "doesn't contain attribute" error. Repeat for the
other 4 tables and for `_cr664_assignedto_value` on `cr664_dealtask1`.

**§10.5.7 — Cross-list new columns into CommercialLendingLOS
(optional).** If you want the new columns to also be present
in the CommercialLendingLOS solution export, open
CommercialLendingLOS → Tables → for each table click "+ Add
existing" → pick the table → Add columns → select the new
`cr664_Deal` (and `cr664_AssignedTo` on `cr664_dealtask1`) →
Save. **Do not** re-create them inside CommercialLendingLOS;
you would get a duplicate `new_` column.

**§10.5.8 — Re-run Phase 121 seed steps 5 + 6** (unchanged
from §9.4.6).

**§10.5.9 — Validate in the deployed cockpit** (unchanged
from §9.4.7).

### 10.6 Why §10.5.3 cannot be skipped

If the operator tries to add `cr664_Deal` (capital D) as a
new Lookup while the existing `cr664_deal` (lower d) column
is still present, Dataverse will either:

- Reject the new column because the schema-name collision is
  case-insensitive in the column-name validator, OR
- Allow it and create both, leaving the table with two
  similarly-named columns. OData will then return errors or
  surprising behaviors on `_cr664_deal_value` queries because
  the existing column may shadow the new one.

§10.5.3 forces the operator to confront the existing column
explicitly. If it turns out to be a legitimate Lookup that
just targets the wrong table, then the original Phase 122
"retarget" framing applies (§3 of this doc) — delete-then-
recreate-with-correct-target. If it's a non-standard
UniqueIdentifier scalar column, it's an artifact that has
never carried real data and can be deleted with confidence.

### 10.7 No live writes performed in this audit

All probes in §10.1–§10.4 were read-only `pac env fetch`
calls. No publisher was created or modified. No solution was
edited. No column was added or deleted. The corrected runbook
in §10.5 is a recommendation; the operator chooses when to
execute it.

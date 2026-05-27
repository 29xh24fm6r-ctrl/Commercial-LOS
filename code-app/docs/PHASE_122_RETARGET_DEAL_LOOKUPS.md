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
